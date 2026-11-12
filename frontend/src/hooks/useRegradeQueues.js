'use client'

import { useCallback, useEffect, useState } from 'react'
import * as regradeService from '@/services/regradeService'

// The assignment's open regrade queues. `loaded` turns true after the first fetch, even a failed one.
export function useRegradeQueues(examId) {
  const [queues, setQueues] = useState([])
  const [error, setError] = useState('')
  const [loaded, setLoaded] = useState(false)

  const reload = useCallback(
    () =>
      regradeService
        .fetchRegradeQueues(examId)
        .then((found) => {
          setQueues(found)
          setError('')
        })
        .catch((err) => setError(err.message))
        .finally(() => setLoaded(true)),
    [examId],
  )

  useEffect(() => {
    reload()
  }, [reload])

  return { queues, loaded, error, reload }
}
