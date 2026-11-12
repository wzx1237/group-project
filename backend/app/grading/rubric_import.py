"""Rubric copying, merging, and Markdown import/export helpers."""

from decimal import Decimal, InvalidOperation
import re

from fastapi import HTTPException

from app import workflow
from app.database import grading as grading_db
from app.database import regrade as regrade_db
from app.database import rubric as rubric_db
from app.grading.service import amount

GRADING_METHODS = {'manual', 'auto_numeric', 'auto_match'}
SCORING_MODES = {'add', 'deduct'}

_HEADING_RE = re.compile(r'^(#{2,3})\s+(\S+?)(?:\s*[·:\-]\s*(.*?))?\s*\(([^()]+)\)\s*$')
_CRITERION_RE = re.compile(r'^\s*[-*]\s+\[([^\]]+)\]\s+(.+?)\s*$')
_DESC_RE = re.compile(r'^\s*>\s?(.*)$')


def natural_qid_key(qid: str) -> list[tuple[int, int | str]]:
    """Sort key that orders Q1, Q1.1, Q2, Q10 naturally."""
    return [(0, int(part)) if part.isdigit() else (1, part.lower()) for part in re.split(r'(\d+)', qid) if part]


def parent_qid(qid: str) -> str | None:
    """Return the parent QID for a subquestion, or None for top-level questions."""
    return qid.split('.', 1)[0] if '.' in qid else None


def _top_number(qid: str) -> int:
    head = parent_qid(qid) or qid
    match = re.search(r'(\d+)$', head)
    return int(match.group(1)) if match else 0


def _order_questions(questions: list[dict]) -> list[dict]:
    """Keep top-level questions before subquestions, ordered naturally within each level."""
    return sorted(questions, key=lambda q: (1 if parent_qid(q['qid']) else 0, natural_qid_key(q['qid'])))


def _fmt_decimal(value: Decimal | float | int) -> str:
    d = Decimal(str(value)).normalize()
    text = format(d, 'f')
    if '.' in text:
        text = text.rstrip('0').rstrip('.')
    return text or '0'


def _fmt_signed(value: Decimal | float | int) -> str:
    d = Decimal(str(value))
    text = _fmt_decimal(abs(d))
    if d > 0:
        return f'+{text}'
    if d < 0:
        return f'-{text}'
    return '0'


def read_rubric_questions(conn, exam_id: int) -> list[dict]:
    """Read an exam's questions and active criteria in natural QID order."""
    rows = rubric_db.exam_rubric_rows(conn, exam_id)
    labels_by_qid: dict[str, list[dict]] = {}
    for label in rubric_db.exam_active_labels(conn, exam_id):
        labels_by_qid.setdefault(label['qid'], []).append(
            {
                'title': label['title'],
                'description': label['description'] or '',
                'deduction': label['deduction'],
            }
        )
    questions = [
        {
            'qid': row['qid'],
            'title': row['title'] or '',
            'grading_method': row['grading_method'],
            'scoring': row['scoring'],
            'total_score': row['total_scores'],
            'region': row['region'],
            'criteria': labels_by_qid.get(row['qid'], []),
        }
        for row in rows
    ]
    return sorted(questions, key=lambda q: natural_qid_key(q['qid']))


def select_question_subtree(source_questions: list[dict], source_qids: list[str] | None) -> list[dict]:
    """Filter source questions by selected QIDs while keeping parent/child hierarchies valid."""
    if source_qids is None:
        selected = list(source_questions)
    else:
        by_qid = {q['qid']: q for q in source_questions}
        unknown = [qid for qid in source_qids if qid not in by_qid]
        if unknown:
            raise HTTPException(422, f'Unknown source question(s): {", ".join(unknown)}')
        wanted = set(source_qids)
        children_by_parent: dict[str, list[str]] = {}
        for q in source_questions:
            parent = parent_qid(q['qid'])
            if parent:
                children_by_parent.setdefault(parent, []).append(q['qid'])
        # Selecting a parent includes all of its subquestions unless specific subquestions were picked.
        for qid in list(wanted):
            children = children_by_parent.get(qid, [])
            if children and not any(child in wanted for child in children):
                wanted.update(children)
        # Ensure any selected subquestion brings its parent container along.
        for qid in list(wanted):
            parent = parent_qid(qid)
            if parent and parent in by_qid:
                wanted.add(parent)
        selected = []
        for q in source_questions:
            if q['qid'] not in wanted:
                continue
            has_selected_children = any(child in wanted for child in children_by_parent.get(q['qid'], []))
            selected.append({**q, 'criteria': [] if has_selected_children else list(q['criteria'])})
    if not selected:
        raise HTTPException(422, 'Select at least one question to import')
    return _order_questions(selected)


def renumber_for_append(selected: list[dict], existing_qids: set[str]) -> list[dict]:
    """Assign collision-free top-level QIDs while keeping subquestion suffixes attached."""
    taken = set(existing_qids)
    next_num = max((_top_number(qid) for qid in taken), default=0) + 1
    top_map: dict[str, str] = {}
    ordered = _order_questions(selected)
    for q in ordered:
        if parent_qid(q['qid']) is None:
            candidate = f'Q{next_num}'
            while candidate in taken:
                next_num += 1
                candidate = f'Q{next_num}'
            top_map[q['qid']] = candidate
            taken.add(candidate)
            next_num += 1

    renumbered = []
    for q in ordered:
        parent = parent_qid(q['qid'])
        if parent is None:
            new_qid = top_map[q['qid']]
        else:
            suffix = q['qid'].split('.', 1)[1]
            new_parent = top_map.get(parent, parent)
            new_qid = f'{new_parent}.{suffix}'
            taken.add(new_qid)
        renumbered.append({**q, 'qid': new_qid})
    return renumbered


def _validate_criterion(criterion: dict) -> tuple[str, str, Decimal]:
    title = (criterion.get('title') or '').strip()
    if not title:
        raise HTTPException(422, 'Criterion title cannot be empty')
    if len(title) > 50:
        raise HTTPException(422, f'Criterion title “{title[:20]}…” exceeds 50 characters')
    description = (criterion.get('description') or '').strip()
    deduction = amount(criterion.get('deduction', 0))
    return title, description, deduction


def _insert_question_and_criteria(svc, conn, exam_id: int, question: dict, *, copy_regions: bool) -> int:
    total = amount(question['total_score'])
    if total < 0:
        raise HTTPException(422, f'Question {question["qid"]} points cannot be negative')
    grading_method = question.get('grading_method') or 'manual'
    scoring = question.get('scoring') or 'add'
    if grading_method not in GRADING_METHODS or scoring not in SCORING_MODES:
        raise HTTPException(422, f'Invalid grading settings on {question["qid"]}')
    region = question.get('region') if copy_regions else None
    svc.db.add_question(
        question['qid'],
        (question.get('title') or '').strip(),
        grading_method,
        total,
        region,
        scoring,
        exam_ID=exam_id,
    )
    grading_db.seed_question_mappings(conn, question['qid'], exam_id)
    added = 0
    for c in question.get('criteria', []):
        title, description, deduction = _validate_criterion(c)
        label_id = svc.db.add_label(title, description, deduction, exam_ID=exam_id)
        svc.db.add_rubric_label(question['qid'], label_id, exam_ID=exam_id)
        added += 1
    return added


def _apply_replace(svc, conn, target_exam: int, selected: list[dict], *, copy_regions: bool) -> dict:
    if rubric_db.exam_has_decisions(conn, target_exam):
        raise HTTPException(
            409,
            'Cannot replace the rubric because answers have already been graded; match criteria onto existing questions instead',
        )
    rubric_db.clear_exam_rubric(conn, target_exam)
    criteria_added = 0
    for q in selected:
        criteria_added += _insert_question_and_criteria(svc, conn, target_exam, q, copy_regions=copy_regions)
    grading_db.seed_exam_mappings(conn, target_exam)
    return {
        'questions_added': len(selected),
        'criteria_added': criteria_added,
        'criteria_skipped': 0,
        'affected_graded_qids': [],
    }


def _apply_append(svc, conn, target_exam: int, selected: list[dict], *, copy_regions: bool) -> dict:
    existing = {row['qid'] for row in rubric_db.exam_rubric_rows(conn, target_exam)}
    renumbered = renumber_for_append(selected, existing)
    criteria_added = 0
    for q in renumbered:
        criteria_added += _insert_question_and_criteria(svc, conn, target_exam, q, copy_regions=copy_regions)
    return {
        'questions_added': len(renumbered),
        'criteria_added': criteria_added,
        'criteria_skipped': 0,
        'affected_graded_qids': [],
    }


def _resolve_merge_pairs(
    source_questions: list[dict],
    target_rows: dict[str, dict],
    gradable_targets: set[str],
    question_mappings: list[dict] | None,
) -> list[tuple[dict, str]]:
    source_by_qid = {q['qid']: q for q in source_questions}
    if question_mappings is None:
        has_children = {parent_qid(q['qid']) for q in source_questions if parent_qid(q['qid'])}
        pairs = [
            (q, q['qid'])
            for q in source_questions
            if q['qid'] not in has_children and q['qid'] in gradable_targets
        ]
    else:
        pairs = []
        for item in question_mappings:
            src_qid = item['source_qid']
            tgt_qid = item['target_qid']
            if src_qid not in source_by_qid:
                raise HTTPException(422, f'Unknown source question: {src_qid}')
            if tgt_qid not in target_rows:
                raise HTTPException(404, f'Target question not found: {tgt_qid}')
            if tgt_qid not in gradable_targets:
                raise HTTPException(422, f'Cannot import criteria onto {tgt_qid} because it has subquestions')
            pairs.append((source_by_qid[src_qid], tgt_qid))
    if not pairs:
        raise HTTPException(422, 'No matching questions selected to import criteria into')
    return pairs


def _apply_merge(
    svc,
    conn,
    target_exam: int,
    source_questions: list[dict],
    *,
    question_mappings: list[dict] | None,
    include_question_details: bool,
    replace_unused_criteria: bool,
) -> dict:
    target_rows = {row['qid']: row for row in rubric_db.exam_rubric_rows(conn, target_exam)}
    gradable_targets = rubric_db.gradable_qids(conn, target_exam)
    pairs = _resolve_merge_pairs(source_questions, target_rows, gradable_targets, question_mappings)
    graded_counts = regrade_db.graded_counts(conn, target_exam)

    criteria_added = 0
    criteria_skipped = 0
    affected_graded: list[str] = []
    seen_keys: dict[str, set[tuple[str, str, Decimal]]] = {}
    replaced_targets: set[str] = set()

    for src_q, tgt_qid in pairs:
        tgt_row = target_rows[tgt_qid]
        if include_question_details:
            total = amount(src_q['total_score'])
            if total < 0:
                raise HTTPException(422, f'Question {src_q["qid"]} points cannot be negative')
            svc.db.edit_question(
                tgt_qid,
                (src_q.get('title') or '').strip(),
                src_q.get('grading_method') or tgt_row['grading_method'],
                total,
                tgt_row['region'],  # Always preserve existing target PDF region.
                src_q.get('scoring') or tgt_row['scoring'],
                exam_ID=target_exam,
            )

        if replace_unused_criteria and tgt_qid not in replaced_targets:
            if rubric_db.question_has_used_labels(conn, target_exam, tgt_qid):
                raise HTTPException(
                    409,
                    f'Cannot replace criteria on {tgt_qid} because graded answers or regrade queues already use them',
                )
            rubric_db.clear_question_labels(conn, target_exam, tgt_qid)
            seen_keys[tgt_qid] = set()
            replaced_targets.add(tgt_qid)

        if tgt_qid not in seen_keys:
            existing_labels = svc.db.get_rubric_labels(tgt_qid, exam_ID=target_exam)
            seen_keys[tgt_qid] = {
                (lbl['title'].strip(), (lbl['description'] or '').strip(), Decimal(str(lbl['deduction'])))
                for lbl in existing_labels
                if not lbl['retired_at']
            }

        added_here = 0
        for c in src_q.get('criteria', []):
            key = _validate_criterion(c)
            if key in seen_keys[tgt_qid]:
                criteria_skipped += 1
                continue
            label_id = svc.db.add_label(key[0], key[1], key[2], exam_ID=target_exam)
            svc.db.add_rubric_label(tgt_qid, label_id, exam_ID=target_exam)
            seen_keys[tgt_qid].add(key)
            criteria_added += 1
            added_here += 1

        if added_here > 0 and graded_counts.get(tgt_qid, 0) > 0 and tgt_qid not in affected_graded:
            affected_graded.append(tgt_qid)

    return {
        'questions_added': 0,
        'criteria_added': criteria_added,
        'criteria_skipped': criteria_skipped,
        'affected_graded_qids': affected_graded,
    }


def apply_imported_rubric(
    svc,
    conn,
    target_exam: int,
    source_questions: list[dict],
    *,
    mode: str,
    source_qids: list[str] | None = None,
    question_mappings: list[dict] | None = None,
    include_question_details: bool = False,
    replace_unused_criteria: bool = False,
    copy_regions: bool = False,
) -> dict:
    """Apply imported questions/criteria to `target_exam` under workflow and grade-safety rules."""
    if mode in ('replace', 'append_questions'):
        workflow.require(conn, target_exam, ('draft',), 'Importing questions into the rubric')
        selected = select_question_subtree(source_questions, source_qids)
        if mode == 'replace':
            return _apply_replace(svc, conn, target_exam, selected, copy_regions=copy_regions)
        return _apply_append(svc, conn, target_exam, selected, copy_regions=copy_regions)

    if mode == 'merge_criteria':
        workflow.require(conn, target_exam, workflow.OPEN, 'Changing the rubric')
        return _apply_merge(
            svc,
            conn,
            target_exam,
            source_questions,
            question_mappings=question_mappings,
            include_question_details=include_question_details,
            replace_unused_criteria=replace_unused_criteria,
        )

    raise HTTPException(422, f'Unsupported import mode: {mode}')


def export_rubric_markdown(questions: list[dict], exam_title: str | None = None) -> str:
    """Serialize rubric questions and active criteria into portable Markdown."""
    lines: list[str] = []
    if exam_title:
        lines.append(f'# {exam_title}')
        lines.append('')
    for q in sorted(questions, key=lambda item: natural_qid_key(item['qid'])):
        level = '###' if parent_qid(q['qid']) else '##'
        title = (q.get('title') or '').strip()
        heading_name = f'{q["qid"]} · {title}' if title else q['qid']
        pts = _fmt_decimal(q['total_score'])
        pts_label = 'pt' if pts == '1' else 'pts'
        meta_parts = [f'{pts} {pts_label}', q.get('scoring') or 'add']
        if q.get('grading_method') and q['grading_method'] != 'manual':
            meta_parts.append(q['grading_method'])
        lines.append(f'{level} {heading_name} ({", ".join(meta_parts)})')
        lines.append('')
        for c in q.get('criteria', []):
            lines.append(f'- [{_fmt_signed(c["deduction"])}] {c["title"]}')
            desc = (c.get('description') or '').strip()
            if desc:
                for dline in desc.splitlines():
                    lines.append(f'  > {dline}')
        if q.get('criteria'):
            lines.append('')
    return '\n'.join(lines).rstrip() + '\n'


def _parse_question_meta(meta: str, line_no: int) -> tuple[Decimal, str | None, str]:
    tokens = [part.strip() for part in meta.split(',') if part.strip()]
    if not tokens:
        raise HTTPException(422, f'Line {line_no}: Missing question points in parentheses')
    pts_raw = re.sub(r'\s*points?$|\s*pts?$', '', tokens[0], flags=re.IGNORECASE).strip()
    try:
        total_score = amount(pts_raw)
    except (InvalidOperation, ValueError, HTTPException):
        raise HTTPException(422, f'Line {line_no}: Invalid points value "{tokens[0]}"')
    if total_score < 0:
        raise HTTPException(422, f'Line {line_no}: Question points cannot be negative')

    scoring: str | None = None
    grading_method = 'manual'
    for tok in tokens[1:]:
        low = tok.lower()
        if low in SCORING_MODES:
            scoring = low
        elif low in GRADING_METHODS:
            grading_method = low
        else:
            raise HTTPException(422, f'Line {line_no}: Unrecognized question option "{tok}"')
    return total_score, scoring, grading_method


def _parse_points_token(raw: str, line_no: int) -> Decimal:
    cleaned = re.sub(r'\s*points?$|\s*pts?$', '', raw.strip(), flags=re.IGNORECASE).strip()
    try:
        return amount(cleaned)
    except (InvalidOperation, ValueError, HTTPException):
        raise HTTPException(422, f'Line {line_no}: Invalid criterion points "[{raw}]"')


def parse_rubric_markdown(markdown_text: str) -> list[dict]:
    """Parse rubric Markdown exported by GradeFlow (or hand-authored in the same format)."""
    if not markdown_text or not markdown_text.strip():
        raise HTTPException(422, 'Paste or upload Markdown containing at least one question')

    questions: list[dict] = []
    seen_qids: set[str] = set()
    current_top_qid: str | None = None
    current_question: dict | None = None
    explicit_scoring: dict[str, bool] = {}

    for line_no, raw in enumerate(markdown_text.splitlines(), start=1):
        line = raw.rstrip()
        if not line.strip():
            continue
        if line.startswith('# ') and not line.startswith('##'):
            continue

        heading = _HEADING_RE.match(line)
        if heading:
            hashes, qid, title, meta = heading.groups()
            if len(hashes) == 2:
                current_top_qid = qid
            elif '.' not in qid and current_top_qid:
                qid = f'{current_top_qid}.{qid}'
            if len(qid) > 50:
                raise HTTPException(422, f'Line {line_no}: Question ID "{qid}" exceeds 50 characters')
            if qid in seen_qids:
                raise HTTPException(422, f'Line {line_no}: Duplicate question ID "{qid}"')
            total_score, scoring, grading_method = _parse_question_meta(meta, line_no)
            seen_qids.add(qid)
            explicit_scoring[qid] = scoring is not None
            current_question = {
                'qid': qid,
                'title': (title or '').strip(),
                'grading_method': grading_method,
                'scoring': scoring or 'add',
                'total_score': total_score,
                'region': None,
                'criteria': [],
            }
            questions.append(current_question)
            continue

        if line.lstrip().startswith('#'):
            raise HTTPException(
                422,
                f'Line {line_no}: Question headings must include points, e.g. "## Q1 · Title (5 pts, deduct)"',
            )

        crit_match = _CRITERION_RE.match(line)
        if crit_match:
            if current_question is None:
                raise HTTPException(422, f'Line {line_no}: Criterion appears before any question heading')
            pts_str, rest = crit_match.groups()
            deduction = _parse_points_token(pts_str, line_no)
            if ' | ' in rest:
                title, desc = rest.split(' | ', 1)
            else:
                title, desc = rest, ''
            title = title.strip()
            if not title:
                raise HTTPException(422, f'Line {line_no}: Criterion title cannot be empty')
            if len(title) > 50:
                raise HTTPException(422, f'Line {line_no}: Criterion title exceeds 50 characters')
            current_question['criteria'].append(
                {'title': title, 'description': desc.strip(), 'deduction': deduction}
            )
            continue

        desc_match = _DESC_RE.match(line)
        if desc_match:
            if current_question is None or not current_question['criteria']:
                raise HTTPException(422, f'Line {line_no}: Description line has no preceding criterion')
            last = current_question['criteria'][-1]
            extra = desc_match.group(1)
            last['description'] = f'{last["description"]}\n{extra}'.strip() if last['description'] else extra
            continue

        raise HTTPException(422, f'Line {line_no}: Unrecognized rubric line "{line.strip()}"')

    if not questions:
        raise HTTPException(422, 'No questions found in Markdown')

    # Ensure every subquestion has its parent question defined in the same Markdown rubric.
    for q in questions:
        parent = parent_qid(q['qid'])
        if parent and parent not in seen_qids:
            raise HTTPException(422, f'Subquestion "{q["qid"]}" requires parent question "{parent}"')

    # Infer 'deduct' when scoring was omitted and criteria use negative adjustments.
    for q in questions:
        if not explicit_scoring[q['qid']] and any(c['deduction'] < 0 for c in q['criteria']):
            q['scoring'] = 'deduct'

    return _order_questions(questions)
