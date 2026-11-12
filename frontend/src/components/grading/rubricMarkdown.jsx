import { parentQid } from '@/lib/rubric'
import { naturalQidCompare, sortQuestionsForSave } from '@/lib/rubricImport'

const HEADING_RE = /^(#{2,3})\s+(\S+?)(?:\s*[·:\-]\s*(.*?))?\s*\(([^()]+)\)\s*$/
const CRITERION_RE = /^\s*[-*]\s+\[([^\]]+)\]\s+(.+?)\s*$/
const DESC_RE = /^\s*>\s?(.*)$/

const SCORING_MODES = new Set(['add', 'deduct'])
const GRADING_METHODS = new Set(['manual', 'auto_numeric', 'auto_match'])

const formatNum = (value) => {
  const n = Math.round((Number(value) || 0) * 100) / 100
  return Object.is(n, -0) ? '0' : String(n)
}

const formatSigned = (value) => {
  const n = Math.round((Number(value) || 0) * 100) / 100
  if (n > 0) return `+${formatNum(n)}`
  if (n < 0) return `-${formatNum(Math.abs(n))}`
  return '0'
}

function parseNumeric(raw, lineNo, kind) {
  const cleaned = raw.replace(/\s*(points?|pts?)$/i, '').trim()
  if (!cleaned || !/^[+-]?(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/.test(cleaned)) {
    throw new Error(`Line ${lineNo}: Invalid ${kind} "${raw}"`)
  }
  const value = Number(cleaned)
  if (!Number.isFinite(value) || Math.abs(value) > 999.99) {
    throw new Error(`Line ${lineNo}: ${kind} out of range "${raw}"`)
  }
  return Math.round(value * 100) / 100
}

function parseQuestionMeta(meta, lineNo) {
  const tokens = meta
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
  if (!tokens.length) throw new Error(`Line ${lineNo}: Missing question points in parentheses`)
  const totalScore = parseNumeric(tokens[0], lineNo, 'points value')
  if (totalScore < 0) throw new Error(`Line ${lineNo}: Question points cannot be negative`)

  let scoring = null
  let gradingMethod = 'manual'
  for (const tok of tokens.slice(1)) {
    const low = tok.toLowerCase()
    if (SCORING_MODES.has(low)) scoring = low
    else if (GRADING_METHODS.has(low)) gradingMethod = low
    else throw new Error(`Line ${lineNo}: Unrecognized question option "${tok}"`)
  }
  return { totalScore, scoring, gradingMethod }
}

/**
 * Serializes rubric questions and active criteria into portable Markdown.
 */
export function exportRubricMarkdown(questions = [], examTitle = '') {
  const lines = []
  if (examTitle) {
    lines.push(`# ${examTitle}`, '')
  }
  const ordered = [...questions].sort((a, b) => naturalQidCompare(a.qid, b.qid))
  for (const q of ordered) {
    const level = parentQid(q.qid) ? '###' : '##'
    const title = (q.title ?? '').trim()
    const headingName = title ? `${q.qid} · ${title}` : q.qid
    const pts = formatNum(q.total_score)
    const ptsLabel = pts === '1' ? 'pt' : 'pts'
    const meta = [`${pts} ${ptsLabel}`, q.scoring ?? 'add']
    if (q.grading_method && q.grading_method !== 'manual') meta.push(q.grading_method)
    lines.push(`${level} ${headingName} (${meta.join(', ')})`, '')
    for (const c of q.criteria ?? []) {
      lines.push(`- [${formatSigned(c.deduction)}] ${c.title}`)
      const desc = (c.description ?? '').trim()
      if (desc) {
        for (const dline of desc.split(/\r?\n/)) {
          lines.push(`  > ${dline}`)
        }
      }
    }
    if ((q.criteria ?? []).length) lines.push('')
  }
  return `${lines.join('\n').trimEnd()}\n`
}

/**
 * Parses GradeFlow rubric Markdown into question and criterion objects for preview or in-memory import.
 */
export function parseRubricMarkdown(markdownText) {
  if (!markdownText || !markdownText.trim()) {
    throw new Error('Paste or upload Markdown containing at least one question.')
  }

  const questions = []
  const seenQids = new Set()
  const explicitScoring = new Set()
  let currentTopQid = null
  let currentQuestion = null

  const lines = markdownText.split(/\r?\n/)
  for (let i = 0; i < lines.length; i += 1) {
    const lineNo = i + 1
    const line = lines[i].trimEnd()
    if (!line.trim()) continue
    if (line.startsWith('# ') && !line.startsWith('##')) continue

    const heading = HEADING_RE.exec(line)
    if (heading) {
      const [, hashes, rawQid, rawTitle, meta] = heading
      let qid = rawQid
      if (hashes.length === 2) {
        currentTopQid = qid
      } else if (!qid.includes('.') && currentTopQid) {
        qid = `${currentTopQid}.${qid}`
      }
      if (qid.length > 50) throw new Error(`Line ${lineNo}: Question ID "${qid}" exceeds 50 characters`)
      if (seenQids.has(qid)) throw new Error(`Line ${lineNo}: Duplicate question ID "${qid}"`)
      const { totalScore, scoring, gradingMethod } = parseQuestionMeta(meta, lineNo)
      seenQids.add(qid)
      if (scoring) explicitScoring.add(qid)
      currentQuestion = {
        qid,
        title: (rawTitle ?? '').trim(),
        grading_method: gradingMethod,
        scoring: scoring ?? 'add',
        total_score: totalScore,
        region: null,
        criteria: [],
      }
      questions.push(currentQuestion)
      continue
    }

    if (line.trimStart().startsWith('#')) {
      throw new Error(`Line ${lineNo}: Question headings must include points, e.g. "## Q1 · Title (5 pts, deduct)"`)
    }

    const crit = CRITERION_RE.exec(line)
    if (crit) {
      if (!currentQuestion) throw new Error(`Line ${lineNo}: Criterion appears before any question heading`)
      const [, ptsStr, rest] = crit
      const deduction = parseNumeric(ptsStr, lineNo, 'criterion points')
      const splitIdx = rest.indexOf(' | ')
      const title = (splitIdx >= 0 ? rest.slice(0, splitIdx) : rest).trim()
      const description = (splitIdx >= 0 ? rest.slice(splitIdx + 3) : '').trim()
      if (!title) throw new Error(`Line ${lineNo}: Criterion title cannot be empty`)
      if (title.length > 50) throw new Error(`Line ${lineNo}: Criterion title exceeds 50 characters`)
      currentQuestion.criteria.push({ title, description, deduction })
      continue
    }

    const desc = DESC_RE.exec(line)
    if (desc) {
      if (!currentQuestion || !currentQuestion.criteria.length) {
        throw new Error(`Line ${lineNo}: Description line has no preceding criterion`)
      }
      const last = currentQuestion.criteria[currentQuestion.criteria.length - 1]
      last.description = last.description ? `${last.description}\n${desc[1]}`.trim() : desc[1]
      continue
    }

    throw new Error(`Line ${lineNo}: Unrecognized rubric line "${line.trim()}"`)
  }

  if (!questions.length) throw new Error('No questions found in Markdown.')

  for (const q of questions) {
    const parent = parentQid(q.qid)
    if (parent && !seenQids.has(parent)) {
      throw new Error(`Subquestion "${q.qid}" requires parent question "${parent}"`)
    }
    if (!explicitScoring.has(q.qid) && q.criteria.some((c) => c.deduction < 0)) {
      q.scoring = 'deduct'
    }
  }

  return sortQuestionsForSave(questions)
}
