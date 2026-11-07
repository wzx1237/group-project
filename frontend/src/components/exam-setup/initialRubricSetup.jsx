'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { RubricPanel } from '@/components/grading/rubricPanel'
import { nextQid, parentQid, partsOf } from '@/lib/rubric'
import styles from './initialRubricSetup.module.css'

// Criteria made here have no database ID yet; saving treats any non-numeric ID as new. Random rather than a counter,
// which a hot reload resets while the wizard keeps its criteria (crypto.randomUUID needs https).
const localId = () => `new-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

// Every question starts with a full-credit and a no-credit criterion, so a typical answer is one click to grade.
function defaultCriteria(points, scoring) {
  const full = scoring === 'deduct' ? 0 : points
  const none = scoring === 'deduct' ? -points : 0
  return [
    { label_id: localId(), title: 'Correct', description: '', deduction: full },
    { label_id: localId(), title: 'Blank or Incorrect', description: '', deduction: none },
  ]
}

// Step 2's questions (titles, points, regions) with what an earlier visit to this step added: criteria, scoring
// and subquestions. Subquestions of questions removed in step 2 are dropped.
function startingRubric(questions, rubric = []) {
  const saved = new Map(rubric.map((q) => [q.qid, q]))
  const top = questions.map((q) => {
    const earlier = saved.get(q.qid)
    const scoring = earlier?.scoring ?? q.scoring ?? 'add'
    const criteria = earlier?.criteria ?? q.criteria ?? defaultCriteria(Number(q.total_score) || 0, scoring)
    return { ...earlier, ...q, scoring, criteria }
  })
  const kept = new Set(top.map((q) => q.qid))
  return [...top, ...rubric.filter((q) => kept.has(parentQid(q.qid)))]
}

// Step 3 of exam setup: the same rubric editor as the grading page, kept in memory until the exam is saved
export function InitialRubricSetup({
  questions = [],
  rubric,
  onBack,
  onNext,
  onChange,
  submitLabel = 'Create exam',
  submittingLabel = 'Creating exam…',
}) {
  const [items, setItems] = useState(() => startingRubric(questions, rubric))
  const [creating, setCreating] = useState(false)

  // the wizard keeps the rubric, so going back to an earlier step doesn't lose it
  useEffect(() => {
    onChange?.(items)
  }, [items, onChange])

  async function create() {
    setCreating(true)
    await onNext(items)
    setCreating(false)
  }

  const update = (qid, change) => setItems((prev) => prev.map((q) => (q.qid === qid ? change(q) : q)))

  // Same signatures as useRubric's actions, so RubricPanel works unchanged. Each resolves to whether it worked.
  const actions = {
    async addQuestion({ parent_qid: parent = null, ...body }) {
      setItems((prev) => {
        const parentQuestion = parent && prev.find((q) => q.qid === parent)
        // A question's first subquestion takes over the criteria it already had, and every part is answered inside
        // its question's region.
        const inherited = parentQuestion && !partsOf(prev, parent).length ? parentQuestion.criteria : []
        const question = {
          ...body,
          qid: nextQid(prev, parent),
          region: parentQuestion?.region ?? null,
          criteria: inherited.length ? inherited : defaultCriteria(body.total_score, body.scoring),
        }
        return [...prev.map((q) => (q.qid === parent ? { ...q, criteria: [] } : q)), question]
      })
      return true
    },
    async updateQuestion(qid, body) {
      update(qid, (q) => ({ ...q, ...body }))
      return true
    },
    async removeQuestion(qid) {
      setItems((prev) => prev.filter((q) => q.qid !== qid && parentQid(q.qid) !== qid))
      return true
    },
    async addCriterion(qid, body) {
      update(qid, (q) => ({ ...q, criteria: [...q.criteria, { ...body, label_id: localId() }] }))
      return true
    },
    async updateCriterion(qid, labelId, body) {
      update(qid, (q) => ({ ...q, criteria: q.criteria.map((c) => (c.label_id === labelId ? { ...c, ...body } : c)) }))
      return true
    },
    async removeCriterion(qid, labelId) {
      update(qid, (q) => ({ ...q, criteria: q.criteria.filter((c) => c.label_id !== labelId) }))
      return true
    },
  }

  return (
    <div className={styles.step}>
      <div>
        <h2 className={styles.title}>3. Set up the rubric</h2>
        <p className={styles.subtitle}>
          Add criteria and subquestions the same way as during grading. Nothing is saved until you {submitLabel.toLowerCase()}.
        </p>
      </div>

      <RubricPanel className={styles.panel} questions={items} actions={actions} />

      <div className={styles.actions}>
        <Button variant="secondary" onClick={onBack}>
          Back
        </Button>
        <Button variant="primary" onClick={create} disabled={creating}>
          {creating ? submittingLabel : submitLabel}
        </Button>
      </div>
    </div>
  )
}
