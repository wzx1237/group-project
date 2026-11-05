'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { getCourse } from '@/exam-distribution/lib/api'
import { useAuth } from '@/hooks/useAuth'

const CourseContext = createContext(null)

const DEFAULT_COURSE_DATA = {
  course: {
    code: 'MATH 101',
    title: 'Calculus I',
    name: 'Calculus I',
    fullTitle: 'MATH 101 · Calculus I',
    term: 'Fall 2026',
    instructor: 'Jane Liu',
  },
  assignments: [
    { id: 'quiz-1', kind: 'quiz', title: 'Quiz 01', short: 'Q1', due: '2026-09-16' },
    { id: 'quiz-2', kind: 'quiz', title: 'Quiz 02', short: 'Q2', due: '2026-10-07' },
    { id: 'quiz-3', kind: 'quiz', title: 'Quiz 03', short: 'Q3', due: '2026-10-28' },
  ],
}

export function CourseProvider({ children }) {
  const { user } = useAuth()
  const [data, setData] = useState(DEFAULT_COURSE_DATA)
  const [error, setError] = useState('')

  const refresh = useCallback(
    () =>
      getCourse()
        .then((res) => {
          if (res?.course) {
            setData(res)
          } else {
            setData(DEFAULT_COURSE_DATA)
          }
        })
        .catch(() => {
          setData(DEFAULT_COURSE_DATA)
        }),
    [],
  )

  useEffect(() => {
    refresh()
  }, [refresh])

  return (
    <CourseContext.Provider value={{ course: data?.course, assignments: data?.assignments, error, refresh }}>
      {children}
    </CourseContext.Provider>
  )
}

export const useCourse = () => useContext(CourseContext)
