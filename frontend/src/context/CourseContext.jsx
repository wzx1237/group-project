'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { getCourse, getCourses } from '@/exam-distribution/lib/api'
import { useAuth } from '@/hooks/useAuth'

const CourseContext = createContext(null)

// adds `id` (the API calls it course_id) and attaches each assignment's uploads and statuses
function prepare(courses, current) {
  const stored = new Map((current?.assignments || []).map((a) => [a.id, a]))
  return courses.map((course) => {
    // uploads still come from /api/course, which only describes the user's first course
    const hasUploads = current?.course?.course_id === course.course_id
    return {
      ...course,
      id: course.course_id,
      assignments: course.assignments.map((a) => ({
        ...a,
        uploads: (hasUploads && stored.get(a.id)?.uploads) || [],
        statuses: (hasUploads && stored.get(a.id)?.statuses) || {},
      })),
    }
  })
}

/**
 * Holds every course the user is on. The selected course comes from the URL (/courses/[courseId]/...)
 * and is the first course when the URL names none. `course` and `assignments` are the selected course's.
 */
export function CourseProvider({ children }) {
  const { user } = useAuth()
  const { courseId } = useParams()
  const [courses, setCourses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const refresh = useCallback(
    () =>
      Promise.all([getCourses(), getCourse()])
        .then(([list, current]) => {
          setCourses(prepare(list, current))
          setError('')
        })
        .catch((e) => setError(e?.message || 'Could not load your courses'))
        .finally(() => setLoading(false)),
    [],
  )

  useEffect(() => {
    if (user) refresh()
  }, [user, refresh])

  const course = useMemo(() => {
    if (!courseId) return courses[0] ?? null
    return courses.find((c) => String(c.id) === String(courseId)) ?? null
  }, [courses, courseId])

  const value = {
    courses,
    course,
    assignments: course?.assignments ?? [],
    loading,
    error,
    // the URL names a course the user is not on (or one that does not exist)
    courseNotFound: Boolean(courseId) && !loading && !course,
    refresh,
  }

  return <CourseContext.Provider value={value}>{children}</CourseContext.Provider>
}

export const useCourse = () => useContext(CourseContext)
