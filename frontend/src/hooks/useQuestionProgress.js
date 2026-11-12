'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchExamProgress } from '@/services/gradingDecisionService'

// How many answers are graded (and waiting on a regrade) for each question, as { [qid]: { total, finished, regrade } }.
// Loads on mount and whenever `refreshKey` changes (e.g. the regrade queues). `refresh` reloads after a short pause,
// so a burst of saves makes one request.
export function useQuestionProgress(examId, refreshKey) {
  const [progress, setProgress] = useState({})
  const timer = useRef(null)

  const refresh = useCallback(() => {
    clearTimeout(timer.current)
    timer.current = setTimeout(
      () =>
        fetchExamProgress(examId)
          .then(({ questions }) => setProgress(Object.fromEntries(questions.map(({ qid, ...counts }) => [qid, counts]))))
          // The bars are a nicety: keep the last numbers if a refresh fails.
          .catch(() => {}),
      300,
    )
  }, [examId])

  useEffect(() => {
    refresh()
    return () => clearTimeout(timer.current)
  }, [refresh, refreshKey])

  return { progress, refresh }
}
