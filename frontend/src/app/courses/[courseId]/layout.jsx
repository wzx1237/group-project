'use client'

import { PageNotice } from '@/components/layout/PageNotice'
import { useCourse } from '@/context/CourseContext'

// every page under /courses/[courseId] needs a course the user is on
export default function CourseLayout({ children }) {
  const { course, loading, error, courseNotFound, refresh } = useCourse()

  if (loading) return <PageNotice title="Loading…" back={false} />
  if (error && !course) {
    return (
      <PageNotice title="Could not load your courses" actionLabel="Try again" onAction={refresh}>
        {error}
      </PageNotice>
    )
  }
  if (courseNotFound || !course) {
    return <PageNotice title="Course not found">You are not on this course, or it does not exist.</PageNotice>
  }
  return children
}
