'use client'
import Link from 'next/link'
import { Suspense, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { startAnswer, refreshAnswer, releaseAnswer, saveAnswer, addCriterion } from '@/services/postgresGradingService'
import styles from '@/components/grading/gradingFlow.module.css'

function Workspace() {
  const { courseId, examId } = useParams()
  const qid = useSearchParams().get('qid')
  const [work, setWork] = useState(null)
  const [labels, setLabels] = useState([])
  const [comments, setComments] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [stale, setStale] = useState(false)
  const [saved, setSaved] = useState(false)
  function load(next) {
    setWork(next); setLabels(next.selected_labels.map(l => l.label_id))
    setComments(next.decision?.comments_remark || ''); setStale(false); setSaved(false)
  }
  async function run(action) {
    setBusy(true); setError(''); setNotice('')
    try { await action() } catch (e) {
      if (e.status === 412) {
        setStale(true)
        setError('This answer or rubric changed. Your choices were not saved. Reload and review before submitting again.')
      } else setError(e.status === 401 ? 'Session expired. Sign in again.' : e.message)
    } finally { setBusy(false) }
  }
  const score = (work?.labels.filter(l => labels.includes(l.label_id)).reduce((sum,l) => sum + Math.round(Number(l.deduction)*100), 0) || 0) / 100
  return <main className={styles.page}>
    <Link href={`/courses/${courseId}`}>← Questions</Link><h1>Grade {qid || 'question'}</h1>
    {!qid && <p>Select a question from the course page first.</p>}
    {!work && <button disabled={busy || !qid} onClick={() => run(async () => load(await startAnswer(examId, qid)))}>Start / resume answer</button>}
    {error && <p role="alert" className={styles.error}>{error} <Link href="/login">Sign in</Link></p>}
    {notice && <p role="status" className={styles.notice}>{notice}</p>}
    {busy && <p role="status">Working…</p>}
    {work && <>
      <p>Student {work.UID} · {work.QID} · {work.assignment.status}{work.decision && ` · Previous score: ${work.decision.scores}`}</p>
      {work.assignment.status === 'Regrade' && <p className={styles.notice}>Review this answer under the current rubric. The old score remains until you submit.</p>}
      <div className={styles.actions}>
        <button disabled={busy} onClick={() => { if (window.confirm('Reload and replace unsaved choices and comments?')) run(async () => load(await refreshAnswer(work))) }}>Reload workspace</button>
        {!saved && work.assignment.status !== 'Finished' && <button disabled={busy} onClick={() => { if (window.confirm('Release this answer and discard unsaved changes?')) run(async () => { await releaseAnswer(work); setWork(null); setNotice('Answer released.') }) }}>Release answer</button>}
        {saved && <button disabled={busy} onClick={() => run(async () => { setWork(null); load(await startAnswer(examId, qid)) })}>Next answer</button>}
      </div>
      <div className={styles.workspace}>
        <section aria-label="Student scan"><a href={work.pdf_url} target="_blank" rel="noreferrer">Open PDF in a new tab</a>
          <iframe className={styles.pdf} title={`Student ${work.UID} exam PDF`} src={work.pdf_url} /></section>
        <section className={styles.card} aria-label="Rubric">
          <h2>Rubric · {work.QID}</h2><p>Maximum score: {work.rubric.total_scores}</p>
          <p>Score is the sum of selected credit and deductions; full marks are not added automatically.</p>
          <fieldset disabled={busy || stale || saved} className={styles.criteria}><legend>Select criteria</legend>
            {work.labels.length === 0 && <p>No criteria yet. Add one below.</p>}
            {work.labels.map(l => <label className={styles.criterion} key={l.label_id}>
              <input type="checkbox" checked={labels.includes(l.label_id)} onChange={e => setLabels(current => e.target.checked ? [...current,l.label_id] : current.filter(id => id !== l.label_id))} />
              <span><strong>{l.title} ({Number(l.deduction) > 0 ? '+' : ''}{l.deduction})</strong><br />{l.description}</span>
            </label>)}
          </fieldset>
          <p><strong>Selected score: {score.toFixed(2)}</strong></p>
          <label>Feedback to student<textarea disabled={busy || stale || saved} value={comments} onChange={e => setComments(e.target.value)} maxLength={10000} /></label>
          <button disabled={busy || stale || saved} onClick={() => run(async () => {
            const result = await saveAnswer(work, labels, comments)
            setSaved(true); setNotice(`Saved score ${result.score}. Continue to the next answer or reload to review.`)
          })}>{work.decision ? 'Save regrade' : 'Save grade'}</button>
          <form className={styles.form} onSubmit={event => {
            event.preventDefault()
            const form = event.currentTarget, values = new FormData(form)
            if (!window.confirm('Add this criterion and send all answers for this question back for regrading?')) return
            run(async () => {
              const result = await addCriterion(work, { title: values.get('title'), description: values.get('description'), deduction: values.get('deduction') })
              setStale(true); form.reset()
              setNotice(`Criterion added. ${result.affected_mappings} answers need regrading. Reload to review the updated rubric.`)
            })
          }}>
            <h3>Add a shared criterion</h3>
            <label>Title<input name="title" required maxLength={50} disabled={busy || stale} /></label>
            <label>Description<textarea name="description" maxLength={10000} disabled={busy || stale} /></label>
            <label>Signed points<input name="deduction" type="number" step="0.01" min="-999.99" max="999.99" required disabled={busy || stale} /></label>
            <button disabled={busy || stale}>Add criterion and requeue answers</button>
          </form>
        </section>
      </div>
    </>}
  </main>
}
export default function GradingPage() {
  return <ProtectedRoute><Suspense fallback={<p>Loading workspace…</p>}><Workspace /></Suspense></ProtectedRoute>
}
