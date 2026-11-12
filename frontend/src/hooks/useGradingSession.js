'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { getAssignmentRoster } from '@/exam-distribution/lib/api'
import { filterQuery, isFiltered, matches, readFilter } from '@/lib/gradingFilter'
import { firstUngradedIndex } from '@/lib/pickStudent'
import * as decisionService from '@/services/gradingDecisionService'

// How often to look at other graders' locks, and to renew this grader's. A lock lapses 90 s after its last renewal,
// and renewals stop after 5 minutes without a save, so an idle grader doesn't hold answers forever.
const POLL_MS = 15000
const RENEW_MS = 30000
const IDLE_MS = 5 * 60 * 1000

// `questions` is the rubric's questions, or null while it loads; the filter needs them to read criteria.
// `queues` is the open regrade queues, or null while they load, for the "waiting for regrade" filter.
// `onSaved` runs after each save has reached the server (or failed and been reloaded).
export function useGradingSession(examId, questions, onSaved, queues = []) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const requestedUid = params.get('student')
  const filterKey = new URLSearchParams(filterQuery(readFilter(params))).toString()
  const [roster, setRoster] = useState(null)
  // Every student's decisions, by student and question, so the filter can look at the whole exam.
  const [everyone, setEveryone] = useState(null)
  const [saved, setSaved] = useState({ uid: null, decisions: {}, comment: null })
  const [error, setError] = useState('')

  useEffect(() => {
    getAssignmentRoster(examId)
      .then((result) => setRoster(result.students.filter((s) => s.submission)))
      .catch((err) => setError(err.message))
    decisionService
      .fetchExamDecisions(examId)
      .then(setEveryone)
      .catch((err) => setError(err.message))
  }, [examId])

  // The filtered students are fixed when the filter changes, so grading a student doesn't drop them from the list
  // and make Next skip someone.
  const ready = Boolean(roster && everyone && questions && queues)
  const [filtered, setFiltered] = useState({ key: null, uids: null })
  const key = ready ? filterKey : null
  if (filtered.key !== key) {
    const filter = readFilter(new URLSearchParams(filterKey))
    const waiting = (uid) =>
      queues.flatMap((queue) => (queue.pending_student_uids.includes(uid) ? [{ id: queue.id, qid: queue.qid }] : []))
    const uids = ready && isFiltered(filter) ? roster.filter((s) => matches(everyone[s.uid], filter, questions, waiting(s.uid))) : null
    setFiltered({ key, uids: uids && new Set(uids.map((s) => s.uid)) })
  }
  const filtering = isFiltered(readFilter(new URLSearchParams(filterKey)))
  // Nothing shows until everything has loaded, so the page doesn't open on one student and jump to another.
  const students = ready ? (filtering ? filtered.uids && roster.filter((s) => filtered.uids.has(s.uid)) : roster) : null

  const index = useMemo(
    () => (students?.length ? firstUngradedIndex(students, requestedUid) : -1),
    [students, requestedUid],
  )
  const student = students?.[index] ?? null
  const uid = student?.uid

  // The latest decisions, including saves still on their way; saves go out one at a time, in order.
  const latest = useRef({ uid: null, decisions: {}, comment: null })
  const queue = useRef(Promise.resolve())
  const pending = useRef(0)
  const showing = useRef(null)
  // The decision versions (and overall comments) the server last sent, by student, so each save says what it was
  // based on.
  const versions = useRef({})
  const commentSeen = useRef({})
  // The answers of the student shown that this grader holds a lock on, and when they last saved one.
  const held = useRef({ uid: null, qids: new Set() })
  const lastSave = useRef(0)
  // Locks on the student shown, by question, and which ones other graders held at the last look.
  const [locks, setLocks] = useState({ uid: null, byQid: {} })
  const othersBefore = useRef(new Set())

  const load = useCallback(
    (studentUid) =>
      Promise.all([
        decisionService.fetchStudentDecisions(examId, studentUid),
        decisionService.fetchExamComment(examId, studentUid),
      ])
        .then(([decisions, comment]) => {
          if (showing.current !== studentUid) return
          versions.current[studentUid] = Object.fromEntries(Object.entries(decisions).map(([qid, d]) => [qid, d.version]))
          commentSeen.current[studentUid] = comment
          latest.current = { uid: studentUid, decisions, comment }
          setSaved(latest.current)
        })
        .catch((err) => setError(err.message)),
    [examId],
  )

  const refreshLocks = useCallback(
    (studentUid) =>
      decisionService
        .fetchAnswerLocks(examId, studentUid)
        .then((found) => {
          if (showing.current !== studentUid) return
          const others = new Set(found.filter((lock) => !lock.mine).map((lock) => lock.qid))
          // Another grader let go of an answer: show what they saved, unless this grader's own saves are on the way.
          const freed = [...othersBefore.current].some((qid) => !others.has(qid))
          othersBefore.current = others
          setLocks({ uid: studentUid, byQid: Object.fromEntries(found.map((lock) => [lock.qid, lock])) })
          if (freed && !pending.current) load(studentUid)
        })
        .catch(() => {}),
    [examId, load],
  )

  useEffect(() => {
    showing.current = uid
    if (uid) load(uid)
  }, [load, uid])

  // While a student is shown: look at others' locks, renew this grader's, and let go of them on leaving the student
  // or closing the page.
  useEffect(() => {
    if (!uid) return
    othersBefore.current = new Set()
    refreshLocks(uid)
    const poll = setInterval(() => refreshLocks(uid), POLL_MS)
    const renew = setInterval(() => {
      if (held.current.uid !== uid || Date.now() - lastSave.current > IDLE_MS) return
      for (const qid of held.current.qids) {
        decisionService.lockAnswer(examId, uid, qid).catch(() => {
          held.current.qids.delete(qid)
          refreshLocks(uid)
        })
      }
    }, RENEW_MS)
    const holding = () => held.current.uid === uid && held.current.qids.size > 0
    const leave = () => holding() && navigator.sendBeacon(decisionService.releaseLocksUrl(examId, uid))
    window.addEventListener('pagehide', leave)
    return () => {
      clearInterval(poll)
      clearInterval(renew)
      window.removeEventListener('pagehide', leave)
      // After saves still on their way, which take the lock too.
      if (holding()) queue.current = queue.current.then(() => decisionService.releaseAnswerLocks(examId, uid)).catch(() => {})
      held.current = { uid: null, qids: new Set() }
    }
  }, [examId, uid, refreshLocks])

  const loaded = saved.uid === uid
  const decisions = loaded ? saved.decisions : {}
  const examComment = loaded ? saved.comment : null

  function show(studentUid, query) {
    const search = new URLSearchParams({ ...query, ...(studentUid && { student: studentUid }) })
    router.replace(`${pathname}?${search}`, { scroll: false })
  }

  function goTo(nextIndex) {
    show(students[nextIndex].uid, Object.fromEntries(new URLSearchParams(filterKey)))
  }

  // A new filter keeps the current student if they still match, and otherwise starts at the first who does.
  function setFilter(filter) {
    show(uid, filterQuery(filter))
  }

  // Merges changes into the latest decision, so a comment and a criterion saved together don't undo each other.
  function save(qid, changes) {
    if (latest.current.uid !== uid) return
    setError('')
    const decision = { criteria: [], comment: null, internal_note: null, ...latest.current.decisions[qid], ...changes }
    latest.current = { ...latest.current, decisions: { ...latest.current.decisions, [qid]: decision } }
    setSaved(latest.current)
    const studentUid = uid
    const remember = (graded) => setEveryone((prev) => prev && { ...prev, [studentUid]: { ...prev[studentUid], [qid]: graded } })
    remember({ ...everyone?.[uid]?.[qid], ...decision })
    // The version is read when the save goes out, after any earlier save of this answer has come back.
    const send = () =>
      decisionService
        .submitGradingDecision(examId, studentUid, qid, { ...decision, version: versions.current[studentUid]?.[qid] ?? 0 })
        .then((result) => {
          if (!result) return
          versions.current[studentUid] = { ...versions.current[studentUid], [qid]: result.version }
          // Saving took the answer's lock.
          holdNow(studentUid, qid)
          // The saved decision says who graded it, which the "Graded by" filter needs.
          remember(result)
        })
    return enqueue(send)
  }

  // Takes an answer over from another grader, for one who has walked away from it.
  function takeOver(qid) {
    setError('')
    const studentUid = uid
    return decisionService
      .lockAnswer(examId, studentUid, qid, true)
      .then(() => {
        holdNow(studentUid, qid)
        return Promise.all([load(studentUid), refreshLocks(studentUid)])
      })
      .catch((err) => setError(err.message))
  }

  function saveExamComment(comment) {
    if (latest.current.uid !== uid) return
    setError('')
    latest.current = { ...latest.current, comment }
    setSaved(latest.current)
    const studentUid = uid
    return enqueue(() =>
      decisionService
        .saveExamComment(examId, studentUid, comment, commentSeen.current[studentUid] ?? null)
        .then((savedComment) => {
          commentSeen.current[studentUid] = savedComment
          // Saving took the comment's lock.
          holdNow(studentUid, decisionService.EXAM_COMMENT_LOCK)
        }),
    )
  }

  function holdNow(studentUid, qid) {
    if (showing.current !== studentUid) return
    if (held.current.uid !== studentUid) held.current = { uid: studentUid, qids: new Set() }
    held.current.qids.add(qid)
    lastSave.current = Date.now()
  }

  // On a failed save (another grader holds the answer, or changed it first), show why and reload what the server has.
  function enqueue(send) {
    pending.current += 1
    queue.current = queue.current
      .then(send)
      .catch((err) => {
        setError(err.message)
        return Promise.all([load(uid), refreshLocks(uid)])
      })
      .then(() => {
        pending.current -= 1
        onSaved?.()
      })
    return queue.current
  }

  function toggleCriterion(qid, labelId) {
    const applied = latest.current.decisions[qid]?.criteria ?? []
    return save(qid, { criteria: applied.includes(labelId) ? applied.filter((id) => id !== labelId) : [...applied, labelId] })
  }

  return {
    students,
    total: roster?.length ?? 0,
    student,
    index,
    goTo,
    filter: readFilter(new URLSearchParams(filterKey)),
    setFilter,
    loaded,
    decisions,
    examComment,
    toggleCriterion,
    saveNotes: save,
    saveExamComment,
    // qid -> { holder, holder_name, mine } for answers someone is grading right now ('' is the overall comment).
    locks: locks.uid === uid ? locks.byQid : {},
    takeOver,
    error,
  }
}
