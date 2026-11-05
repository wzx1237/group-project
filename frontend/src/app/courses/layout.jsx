'use client'

import { usePathname } from 'next/navigation'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { TopNavbar } from '@/components/layout/TopNavbar'
import { useCourse } from '@/context/CourseContext'
import { useAuth } from '@/hooks/useAuth'

export default function CoursesLayout({ children }) {
  const { user } = useAuth()
  const { course } = useCourse() || {}
  const pathname = usePathname()

  let breadcrumbs = [{ label: 'Courses', href: '/courses' }]

  if (pathname?.includes('/staff')) {
    const courseCode = course?.code || 'MATH 101'
    const courseTitle = course?.name || course?.title || 'Calculus I'
    const courseLabel = course?.code && !course?.title && !course?.name
      ? course.code
      : `${courseCode} - ${courseTitle}`

    breadcrumbs = [
      { label: courseLabel, href: '/courses' },
      { label: 'Course staff' },
    ]
  }

  const currentUser = {
    name: user?.name || user?.directory_id || 'Jane Liu',
    initials: user?.initials || (user?.name ? user.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase() : 'JL'),
    role: user?.role || 'Professor',
  }

  return (
    <ProtectedRoute>
      <TopNavbar breadcrumbs={breadcrumbs} currentUser={currentUser} />
      {children}
    </ProtectedRoute>
  )
}
