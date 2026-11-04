'use client'

import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { TopNavbar } from '@/components/layout/TopNavbar'
import { useCourse } from '@/context/CourseContext'
import { useAuth } from '@/hooks/useAuth'

function CourseGate({ children }) {
  const { course, error } = useCourse()
  if (error) return <p className="status error">Could not load course: {error}</p>
  if (!course) return <p className="status">Loading…</p>
  return children
}

export default function CoursesLayout({ children }) {
  const { user } = useAuth()
  return (
    <ProtectedRoute>
      <TopNavbar breadcrumbs={[{ label: 'Courses', href: '/courses' }]} currentUser={user && { name: user.directory_id }} />
      <CourseGate>{children}</CourseGate>
    </ProtectedRoute>
  )
}
