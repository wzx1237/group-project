'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { getCourse } from '@/exam-distribution/lib/api'
import { useAuth } from '@/hooks/useAuth'

const CourseContext = createContext(null)

export function CourseProvider({ children }) {
  const { user } = useAuth()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  const refresh = useCallback(
    () =>
      getCourse()
        .then(setData)
        .catch((err) => setError(err.message)),
    [],
  )

  useEffect(() => {
    if (user) refresh()
  }, [user, refresh])

  return (
    <CourseContext.Provider value={{ course: data?.course, assignments: data?.assignments, error, refresh }}>
      {children}
    </CourseContext.Provider>
  )
}

export const useCourse = () => useContext(CourseContext)
