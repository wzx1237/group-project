'use client'

import Image from 'next/image'
import { GraduationCap } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'
import { UmdSsoCard } from '@/components/auth/UMDSSOCard'
import { useAuth } from '@/hooks/useAuth'
import { loginWithUmdSso } from '@/services/authService'
import styles from './login.module.css'

const ERRORS = {
  not_authorized: "Your UMD account isn't on GradeFlow's staff list. Ask your course instructor to add you.",
  login_failed: "We couldn't finish signing you in. Please try again.",
  cas_unavailable: "UMD sign-in isn't responding right now. Please try again in a few minutes.",
}

// sanitizes and validates next redirect path
const safeNext = (path) =>
  path?.startsWith('/') && !path.startsWith('//') && !/[\\\x00-\x20\x7f]/.test(path) ? path : '/courses'

// login view managing redirect params and sign-in trigger
function Login() {
  const params = useSearchParams()
  const router = useRouter()
  const { user } = useAuth()
  const [redirecting, setRedirecting] = useState(false)
  const next = safeNext(params.get('next'))

  useEffect(() => {
    if (user) router.replace(next)
  }, [user, next, router])

  // triggers redirect to umd sso login service
  function signIn() {
    setRedirecting(true)
    loginWithUmdSso(next)
  }

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <div className={styles.brand}>
          <span className={styles.mark}>
            <GraduationCap size={16} color="white" aria-hidden="true" />
          </span>
          GradeFlow
        </div>
        <div className={styles.heading}>
          <h1 className={styles.title}>Sign in to GradeFlow</h1>
          <p className={styles.subtitle}>For instructors and TAs at the University of Maryland.</p>
        </div>
        {params.has('signed_out') && (
          <p className={styles.notice} role="status">
            You&apos;ve signed out of GradeFlow.
          </p>
        )}
        <UmdSsoCard onSignInClick={signIn} isLoading={redirecting} error={ERRORS[params.get('error')] ?? null} />
        <hr className={styles.divider} />
        <div className={styles.studentNote}>
          <span className={styles.icon}>
            <Image src="/icons/graduation-cap.svg" width={14.9435} height={10.9336} alt="" />
          </span>
          <p>Students don&apos;t sign in. Your instructor will share your graded report.</p>
        </div>
      </div>
    </main>
  )
}

// wraps login view in suspense boundary
export default function LoginPage() {
  return (
    <Suspense>
      <Login />
    </Suspense>
  )
}
