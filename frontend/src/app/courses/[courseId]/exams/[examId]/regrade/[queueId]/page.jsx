'use client'

import { Suspense, useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, ArrowRight, ArrowUpRight, ChevronLeft, ChevronRight, RotateCcw, Split } from 'lucide-react'
import { icon } from '@/components/grading/icon'
import { Button } from '@/components/ui/Button'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { getAssignmentRoster, submissionUrl } from '@/exam-distribution/lib/api'
import { useRubric } from '@/hooks/useRubric'
import { appliedCriteria, allCriteria, formatAdjustment, parentQid, plural, questionLabel, scoreWith } from '@/lib/rubric'
import { fetchExamDecisions } from '@/services/gradingDecisionService'
import * as regradeService from '@/services/regradeService'
import styles from './regrade.module.css'

// PDF.js needs the browser, so the answer isn't rendered on the server.
const RegionCrop = dynamic(() => import('@/components/grading/regionCrop').then((m) => m.RegionCrop), { ssr: false })

const LETTERS = 'ABCDEFGHI'

// The next answer still waiting after position `from`, wrapping around; -1 when none is left.
function nextPending(items, from) {
  for (let step = 1; step <= items.length; step++) {
    const i = (from + step) % items.length
    if (!items[i].resolved_at) return i
  }
  return -1
}

function Option({ adjustment, title, note, shortcut, checked, onChange }) {
  return (
    <li>
      <label className={checked ? `${styles.option} ${styles.picked}` : styles.option}>
        <input type="checkbox" checked={checked} onChange={onChange} />
        <span className={styles.optionText}>
          <span>
            {adjustment && <strong>{adjustment}</strong>}
            {title}
          </span>
          {note && <span className={styles.optionNote}>{note}</span>}
        </span>
        {shortcut !== undefined && <kbd className={styles.key}>{shortcut}</kbd>}
      </label>
    </li>
  )
}

// Which criteria apply to one answer in the queue. For a split, its replacements come first, then "neither".
function Decision({ queue, question, label, item, name, decision, replacements, onResolve, onSkip, canSkip }) {
  const split = queue.kind === 'split'
  const options = split ? replacements : question.criteria
  const others = split ? question.criteria.filter((c) => !queue.replacement_ids.includes(c.label_id)) : []
  const [picked, setPicked] = useState(() => new Set((decision?.criteria ?? []).filter((id) => id !== queue.criterion?.label_id)))
  const [problem, setProblem] = useState('')
  const [saving, setSaving] = useState(false)
  const open = !item.resolved_at && !queue.closed_at

  function toggle(id) {
    setPicked((current) => {
      const next = new Set(current)
      if (!next.delete(id)) next.add(id)
      return next
    })
  }

  function neither() {
    setPicked((current) => new Set([...current].filter((id) => !queue.replacement_ids.includes(id))))
  }

  // 1, 2, ... toggle the options in order and 0 picks "neither", unless someone is typing.
  useEffect(() => {
    if (!open) return
    function handleKey(event) {
      const typing = event.target.closest('textarea, select, [contenteditable]') || (event.target.matches('input') && event.target.type !== 'checkbox')
      if (typing || event.metaKey || event.ctrlKey || event.altKey) return
      const n = Number(event.key)
      if (event.key === '0' && split) neither()
      else if (n >= 1 && n <= Math.min(options.length, 9)) toggle(options[n - 1].label_id)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  })

  const before = decision?.score ?? null
  const after = scoreWith(question, allCriteria(question).filter((c) => picked.has(c.label_id)).reduce((sum, c) => sum + c.deduction, 0))
  const delta = before === null ? 0 : Math.round((after - before) * 100) / 100
  const change = delta > 0 ? `gains ${plural(delta, 'point')}` : delta < 0 ? `loses ${plural(-delta, 'point')}` : 'keeps its score'
  const chosen = replacements.filter((c) => picked.has(c.label_id))
  const which = !split
    ? null
    : !chosen.length
      ? 'Neither criterion applies'
      : chosen.length === replacements.length
        ? `${replacements.length === 2 ? 'Both' : 'All'} criteria apply`
        : chosen.length === 1
          ? `Only “${chosen[0].title}” applies`
          : `${chosen.length} criteria apply`
  const sentence = which ? `${which}, so this submission ${change}.` : `This submission ${change}.`

  async function save() {
    if (!picked.size) return setProblem('Pick at least one criterion so the answer stays graded.')
    setProblem('')
    setSaving(true)
    try {
      await onResolve([...picked])
    } catch (err) {
      setProblem(err.message)
    }
    setSaving(false)
  }

  return (
    <section className={styles.decide} aria-labelledby="decide-heading">
      <div className={styles.decideHead}>
        <h2 id="decide-heading" className={styles.decideTitle}>
          {split ? 'Which new criteria apply?' : 'Which criteria apply?'}
        </h2>
        <p className={styles.decideMeta}>
          {split
            ? `Pick one, ${replacements.length === 2 ? 'both' : 'several'}, or neither for ${name}.`
            : `Pick every criterion that applies to ${name}'s answer.`}
        </p>
      </div>

      {open ? (
        <>
          <div className={styles.decideBody}>
            {split && (
              <p className={styles.was}>
                <span className={styles.wasLabel}>Was</span>
                <s>
                  {formatAdjustment(queue.criterion.deduction)} {queue.criterion.title}
                </s>
              </p>
            )}
            <ul className={styles.options}>
              {options.map((c, i) => (
                <Option
                  key={c.label_id}
                  adjustment={formatAdjustment(c.deduction)}
                  title={c.title}
                  note={split ? `Criterion ${LETTERS[i]}` : c.description}
                  shortcut={i < 9 ? i + 1 : undefined}
                  checked={picked.has(c.label_id)}
                  onChange={() => toggle(c.label_id)}
                />
              ))}
              {split && (
                <Option
                  title="Neither"
                  note={`Remove the ${queue.criterion.deduction < 0 ? 'deduction' : 'credit'} from this submission`}
                  shortcut={0}
                  checked={!chosen.length}
                  onChange={neither}
                />
              )}
            </ul>
            {others.length > 0 && (
              <>
                <p className={styles.othersTitle}>Other criteria on {label}</p>
                <ul className={styles.options}>
                  {others.map((c) => (
                    <Option
                      key={c.label_id}
                      adjustment={formatAdjustment(c.deduction)}
                      title={c.title}
                      note={c.description}
                      checked={picked.has(c.label_id)}
                      onChange={() => toggle(c.label_id)}
                    />
                  ))}
                </ul>
              </>
            )}
            <div className={styles.scoreBox}>
              <p className={styles.scoreLine}>
                <span>{label} score</span>
                <span className={styles.scoreChange}>
                  {before ?? '—'} / {question.total_score}
                  <ArrowRight {...icon} />
                  <strong>
                    {after} / {question.total_score}
                  </strong>
                </span>
              </p>
              <p className={styles.scoreNote}>{sentence}</p>
            </div>
            {problem && (
              <p className={styles.problemText} role="alert">
                {problem}
              </p>
            )}
          </div>
          <div className={styles.decideFoot}>
            <span className={styles.keys} aria-hidden="true">
              {options.slice(0, 9).map((c, i) => (
                <kbd key={c.label_id} className={styles.key}>
                  {i + 1}
                </kbd>
              ))}
              {split && <kbd className={styles.key}>0</kbd>}
              choose
            </span>
            <div className={styles.footActions}>
              <Button onClick={onSkip} disabled={!canSkip}>
                Skip
              </Button>
              <Button variant="primary" onClick={save} disabled={saving}>
                Save and next
                <ArrowRight {...icon} size={16} />
              </Button>
            </div>
          </div>
        </>
      ) : (
        <div className={styles.decideBody}>
          <div className={styles.summary}>
            <p className={styles.summaryTitle}>
              {item.resolved_at ? `Reviewed${item.resolved_by ? ` by ${item.resolved_by}` : ''}` : 'Not reviewed'}
            </p>
            <p className={styles.summaryText}>
              {item.resolved_at
                ? `${label} is now ${decision?.score ?? '—'} / ${question.total_score}. To change it again, open the full exam.`
                : `This queue was closed before this answer was reviewed, so it kept its score of ${decision?.score ?? '—'} / ${question.total_score}.`}
            </p>
          </div>
        </div>
      )}
    </section>
  )
}

function RegradeReview() {
  const { courseId, examId, queueId } = useParams()
  const router = useRouter()
  const pathname = usePathname()
  const requested = useSearchParams().get('student')
  const { rubric, error: rubricError } = useRubric(examId)
  const [queue, setQueue] = useState(null)
  const [students, setStudents] = useState(null)
  const [decisions, setDecisions] = useState(null)
  const [error, setError] = useState('')
  const [problem, setProblem] = useState('')

  useEffect(() => {
    Promise.all([regradeService.fetchRegradeQueue(examId, queueId), getAssignmentRoster(examId), fetchExamDecisions(examId)])
      .then(([found, roster, saved]) => {
        setQueue(found)
        setStudents(new Map(roster.students.map((s) => [s.uid, s])))
        setDecisions(saved)
      })
      .catch((err) => setError(err.message))
  }, [examId, queueId])

  const gradeHref = `/courses/${courseId}/exams/${examId}/grade`
  const question = queue && rubric?.questions.find((q) => q.qid === queue.qid)

  if (error || rubricError) {
    return (
      <main className={styles.message}>
        <p role="alert">{error || rubricError}</p>
        <Button href={gradeHref}>Back to grading</Button>
      </main>
    )
  }
  if (!queue || !question || !students || !decisions) return <p className={styles.loading}>Loading regrade…</p>

  const items = queue.items
  const found = items.findIndex((it) => it.student_uid === requested)
  const index = found >= 0 ? found : Math.max(0, items.findIndex((it) => !it.resolved_at))
  const item = items[index]
  const uid = item.student_uid
  const student = students.get(uid)
  const name = student?.name ?? uid
  const decision = decisions[uid]?.[queue.qid]
  const pending = queue.pending_student_uids.length
  const reviewed = items.length - pending
  const split = queue.kind === 'split'
  const label = questionLabel(rubric.questions, question.qid)
  const replacements = split ? question.criteria.filter((c) => queue.replacement_ids.includes(c.label_id)) : []
  const retired = new Set((question.retired_criteria ?? []).map((c) => c.label_id))
  const region = question.region ?? rubric.questions.find((q) => q.qid === parentQid(question.qid))?.region

  function goTo(i, list = items) {
    router.replace(`${pathname}?${new URLSearchParams({ student: list[i].student_uid })}`, { scroll: false })
  }

  async function resolve(criteria) {
    const saved = await regradeService.resolveRegrade(examId, queueId, uid, criteria)
    setDecisions((all) => ({ ...all, [uid]: { ...all[uid], [queue.qid]: saved } }))
    const fresh = await regradeService.fetchRegradeQueue(examId, queueId)
    setQueue(fresh)
    const next = nextPending(fresh.items, index)
    if (next >= 0) goTo(next, fresh.items)
  }

  async function close() {
    const kept = `${plural(pending, 'answer')} not reviewed yet will keep ${pending === 1 ? 'its' : 'their'} current score`
    if (!window.confirm(`Close this queue? ${kept}.`)) return
    setProblem('')
    try {
      setQueue(await regradeService.closeRegradeQueue(examId, queueId))
    } catch (err) {
      setProblem(err.message)
    }
  }

  function chip(it, current) {
    if (!it.resolved_at) {
      if (queue.closed_at) return { text: 'Not reviewed', tone: styles.todo }
      return current ? { text: 'Reviewing', tone: styles.reviewing } : { text: 'To review', tone: styles.todo }
    }
    if (!split) return { text: 'Reviewed', tone: styles.done }
    const applied = decisions[it.student_uid]?.[queue.qid]?.criteria ?? []
    const chosen = replacements.filter((c) => applied.includes(c.label_id))
    if (!chosen.length) return { text: 'Neither', tone: styles.done }
    if (chosen.length === replacements.length) return { text: replacements.length === 2 ? 'Both' : 'All', tone: styles.done }
    return { text: chosen.map((c) => LETTERS[replacements.indexOf(c)]).join(' + '), tone: styles.done }
  }

  return (
    <main className={styles.review}>
      <header className={styles.header}>
        <div className={styles.titleGroup}>
          <span className={styles.mark}>{split ? <Split {...icon} size={20} /> : <RotateCcw {...icon} size={20} />}</span>
          <div className={styles.titleText}>
            <h1 className={styles.title}>{split ? `Review split · ${queue.criterion.title}` : `Regrade · ${queue.reason}`}</h1>
            <p className={styles.meta}>
              {[
                label,
                question.title,
                split ? 'Choose which new criteria apply to each submission.' : 'Check each answer against the current rubric.',
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
        </div>
        <div className={styles.controls}>
          <div className={styles.progress}>
            <span className={styles.progressLabel}>
              {reviewed} of {items.length} reviewed
            </span>
            <ProgressBar value={reviewed} total={items.length} />
          </div>
          <nav className={styles.nav} aria-label="Submissions in this queue">
            <Button onClick={() => goTo(index - 1)} disabled={index === 0}>
              <ChevronLeft {...icon} size={16} />
              Previous
            </Button>
            <span className={styles.position}>
              {index + 1} / {items.length}
            </span>
            <Button onClick={() => goTo(index + 1)} disabled={index === items.length - 1}>
              Next
              <ChevronRight {...icon} size={16} />
            </Button>
          </nav>
          <Button href={gradeHref}>
            <ArrowLeft {...icon} size={16} />
            Exit review
          </Button>
        </div>
      </header>

      {queue.closed_at && (
        <p className={styles.closed} role="status">
          {pending
            ? `This queue is closed. ${plural(pending, 'answer')} not reviewed kept ${pending === 1 ? 'its' : 'their'} score.`
            : `All ${plural(items.length, 'submission')} reviewed. This queue is closed.`}
          <Link href={gradeHref}>Back to grading</Link>
        </p>
      )}
      {problem && (
        <p className={styles.problem} role="alert">
          {problem}
        </p>
      )}

      <div className={styles.body}>
        <aside className={styles.list} aria-labelledby="submissions-heading">
          <div className={styles.listHead}>
            <h2 id="submissions-heading" className={styles.listTitle}>
              Submissions
            </h2>
            <p className={styles.listMeta}>
              {split
                ? `${items.length} had “${queue.criterion.title}”`
                : `${plural(items.length, 'answer')} flagged for another look`}
            </p>
          </div>
          <ol className={styles.items}>
            {items.map((it, i) => {
              const { text, tone } = chip(it, i === index)
              return (
                <li key={it.student_uid}>
                  <button
                    type="button"
                    className={i === index ? `${styles.item} ${styles.current}` : styles.item}
                    aria-current={i === index ? 'true' : undefined}
                    onClick={() => goTo(i)}
                  >
                    <span className={styles.who}>
                      <span className={styles.name}>{students.get(it.student_uid)?.name ?? it.student_uid}</span>
                      <span className={styles.uid}>{it.student_uid}</span>
                    </span>
                    <span className={`${styles.chip} ${tone}`}>{text}</span>
                  </button>
                </li>
              )
            })}
          </ol>
          {!queue.closed_at && (
            <div className={styles.listFoot}>
              <Button size="sm" onClick={close}>
                Close queue
              </Button>
              <span>Answers not reviewed keep their scores.</span>
            </div>
          )}
        </aside>

        <section className={styles.answer} aria-label={`${name}'s answer`}>
          <div className={styles.answerHead}>
            <p className={styles.student}>
              {name} · {uid}
              <span className={styles.where}>
                {label} answer region{region ? ` · Page ${region.page}` : ''}
              </span>
            </p>
            <Link
              className={styles.fullExam}
              href={`${gradeHref}?${new URLSearchParams({ student: uid })}`}
              target="_blank"
              rel="noreferrer"
            >
              Open full exam
              <ArrowUpRight {...icon} />
            </Link>
          </div>
          {student?.submission && region ? (
            <RegionCrop
              key={uid}
              url={submissionUrl(examId, student.submission.upload_id, student.submission.submission_id)}
              region={region}
              tag={`${label} · Answer region`}
            />
          ) : (
            <p className={styles.noRegion}>
              {student?.submission
                ? `${label} has no answer region. Open the full exam to see the answer.`
                : `${name}'s scan isn't matched any more. Open the full exam to see the saved answer.`}
            </p>
          )}
          <p className={styles.appliedLabel}>Currently applied</p>
          <ul className={styles.chips}>
            {appliedCriteria(question, decision).map((c) => (
              <li key={c.label_id} className={retired.has(c.label_id) ? `${styles.applied} ${styles.struck}` : styles.applied}>
                <strong>{formatAdjustment(c.deduction)}</strong>
                {c.title}
              </li>
            ))}
          </ul>
        </section>

        <Decision
          key={uid}
          queue={queue}
          question={question}
          label={label}
          item={item}
          name={name}
          decision={decision}
          replacements={replacements}
          onResolve={resolve}
          onSkip={() => goTo(nextPending(items, index))}
          canSkip={queue.pending_student_uids.some((p) => p !== uid)}
        />
      </div>
    </main>
  )
}

export default function RegradeReviewPage() {
  return (
    <Suspense>
      <RegradeReview />
    </Suspense>
  )
}
