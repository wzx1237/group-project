'use client'

import { usePathname } from 'next/navigation'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { TopNavbar } from '@/components/layout/TopNavbar'
import { isStudentBased } from '@/lib/gradingQueue'
import { examGradePath } from '@/lib/routes'
import { useCourse } from '@/context/CourseContext'
import { useAuth } from '@/hooks/useAuth'

// what each page under a course or an exam is called in the breadcrumbs
const PAGES = {
  roster: 'Students',
  staff: 'Course staff',
  new: 'New exam',
  upload: 'Upload',
  grade: 'Grading',
  'grading-queue': 'Questions',
  analytics: 'Analytics',
  progress: 'Grading progress',
  reports: 'Reports',
  questions: 'Questions and regions',
  rubric: 'Rubric',
  regrade: 'Regrade',
}

// Courses › CMSC250 › Quiz 1 › Grading, where every crumb but the current page links back
function breadcrumbsFor(pathname, course, assignments) {
  const [, courseId, area, examId, page] = pathname.split('/').filter(Boolean)
  const crumbs = [{ label: 'Courses', href: '/courses' }]
  if (PAGES[courseId]) {
    crumbs.push({ label: PAGES[courseId] })
  } else if (courseId && course) {
    const base = `/courses/${courseId}`
    crumbs.push({ label: course.code, href: base })
    if (area === 'exams' && examId && examId !== 'new') {
      const exam = assignments?.find((a) => a.id === examId)
      crumbs.push({ label: exam?.title ?? examId, href: `${base}/exams/${examId}/upload` })
      if (isStudentBased(exam?.kind) && ['grading-queue', 'grade'].includes(page)) {
        crumbs.push({ label: 'Student responses', href: examGradePath(course, examId, exam.kind) })
        if (page === 'grade') crumbs.push({ label: 'Grading' })
      } else if (page === 'grading-queue' && pathname.split('/').filter(Boolean).at(-1) === 'students') {
        crumbs.push({ label: 'Questions', href: `${base}/exams/${examId}/grading-queue` })
        crumbs.push({ label: 'Student responses' })
      } else if (page) crumbs.push({ label: PAGES[page] ?? page })
    } else if (area) {
      crumbs.push({ label: PAGES[area === 'exams' ? examId : area] ?? area })
    }
  }
  return crumbs.map((crumb, i) => (i === crumbs.length - 1 ? { label: crumb.label } : crumb))
}

export default function CoursesLayout({ children }) {
  const { user } = useAuth()
  const { course, assignments } = useCourse() || {}
  const pathname = usePathname()
  const breadcrumbs = breadcrumbsFor(pathname ?? '', course, assignments)

  const currentUser = user && { name: user.name || user.directory_id }

  return (
    <ProtectedRoute>
      <TopNavbar breadcrumbs={breadcrumbs} currentUser={currentUser} />
      {children}
    </ProtectedRoute>
  )
}
