'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'

/**
 * Guards routes so only authenticated instructors and TAs assigned to the course can access them.
 * @param {Object} props
 * @param {Array<'instructor' | 'ta' | 'head_ta'>} [props.allowedRoles] - Roles permitted to view children
 * @param {string} [props.courseId] - Course ID to verify staff membership against
 * @param {React.ReactNode} props.children - Protected page content
 */
export function ProtectedRoute({ allowedRoles, courseId, children }) {
  const { user, loading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (!loading && !user) router.replace(`/login?${new URLSearchParams({ next: pathname })}`)
  }, [loading, user, router, pathname])

  return user ? children : null
}
