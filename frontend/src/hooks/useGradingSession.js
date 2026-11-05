'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { getAssignmentRoster } from '@/exam-distribution/lib/api'
import * as decisionService from '@/services/gradingDecisionService'

export function useGradingSession(examId) {
  const router = useRouter()
  const pathname = usePathname()
  const requestedUid = useSearchParams().get('student')
  const [students, setStudents] = useState(null)
  const [saved, setSaved] = useState({ uid: null, decisions: {} })
  const [error, setError] = useState('')

  useEffect(() => {
    getAssignmentRoster(examId)
      .then((roster) => setStudents(roster.students.filter((s) => s.submission)))
      .catch((err) => setError(err.message))
  }, [examId])

  const index = students?.length ? Math.max(0, students.findIndex((s) => s.uid === requestedUid)) : -1
  const student = students?.[index] ?? null
  const uid = student?.uid

  // The latest decisions, including saves still on their way; saves go out one at a time, in order.
  const latest = useRef({ uid: null, decisions: {} })
  const queue = useRef(Promise.resolve())
  const showing = useRef(null)

  const load = useCallback(
    (studentUid) =>
      decisionService
        .fetchStudentDecisions(examId, studentUid)
        .then((decisions) => {
          if (showing.current !== studentUid) return
          latest.current = { uid: studentUid, decisions }
          setSaved(latest.current)
        })
        .catch((err) => setError(err.message)),
    [examId],
  )

  useEffect(() => {
    showing.current = uid
    if (uid) load(uid)
  }, [load, uid])

  const loaded = saved.uid === uid
  const decisions = loaded ? saved.decisions : {}

  function goTo(nextIndex) {
    router.replace(`${pathname}?student=${students[nextIndex].uid}`, { scroll: false })
  }

  // Merges changes into the latest decision, so a comment and a criterion saved together don't undo each other.
  function save(qid, changes) {
    if (latest.current.uid !== uid) return
    setError('')
    const decision = { criteria: [], comment: null, internal_note: null, ...latest.current.decisions[qid], ...changes }
    latest.current = { uid, decisions: { ...latest.current.decisions, [qid]: decision } }
    setSaved(latest.current)
    queue.current = queue.current
      .then(() => decisionService.submitGradingDecision(examId, uid, qid, decision))
      .catch((err) => {
        setError(err.message)
        return load(uid)
      })
    return queue.current
  }

  function toggleCriterion(qid, labelId) {
    const applied = latest.current.decisions[qid]?.criteria ?? []
    return save(qid, { criteria: applied.includes(labelId) ? applied.filter((id) => id !== labelId) : [...applied, labelId] })
  }

  return { students, student, index, goTo, loaded, decisions, toggleCriterion, saveNotes: save, error }
}
