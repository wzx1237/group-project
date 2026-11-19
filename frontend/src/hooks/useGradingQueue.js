'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { getAssignmentRoster } from '@/exam-distribution/lib/api'
import { fetchExamDecisions, fetchExamProgress, fetchGradingQueue } from '@/services/gradingDecisionService'

// Reload the server's mapping states when returning from Submission and when refocusing the page.
export function useGradingQueue(examId, submitted = '') {
  const [result, setResult] = useState({ examId: null, data: null, error: '' })
  const request = useRef(0)
  const refresh = useCallback(async () => {
    const id = ++request.current
    try {
      const mappings = await fetchGradingQueue(examId)
      const [roster, decisions, progress] = await Promise.all([
        getAssignmentRoster(examId), fetchExamDecisions(examId), fetchExamProgress(examId),
      ])
      if (request.current !== id) return
      const answers = new Map(progress.students.map((s) => [s.uid, s.answers]))
      const students = roster.students.filter((s) => s.submission).map((s) => ({ ...s, answers: answers.get(s.uid) ?? {} }))
      const assigned = Object.fromEntries(mappings.map((m) => [`${m.student_uid}:${m.qid}`, m.grader_directory_id]))
      setResult({ examId, data: { students, decisions, assigned }, error: '' })
    } catch (err) {
      if (request.current === id) setResult((prev) => ({ examId, data: prev.examId === examId ? prev.data : null, error: err.message }))
    }
  }, [examId])

  useEffect(() => {
    refresh()
    window.addEventListener('focus', refresh)
    window.addEventListener('pageshow', refresh)
    return () => {
      request.current += 1
      window.removeEventListener('focus', refresh)
      window.removeEventListener('pageshow', refresh)
    }
  }, [refresh, submitted])

  return { data: result.examId === examId ? result.data : null, error: result.error, refresh }
}
