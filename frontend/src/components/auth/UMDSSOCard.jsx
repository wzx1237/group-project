import Image from 'next/image'
import { Button } from '@/components/ui/Button'
import styles from './UMDSSOCard.module.css'

/**
 * Renders the UMD Directory ID authentication card and initiates CAS/SSO redirect.
 * @param {Object} props
 * @param {() => Promise<void>} props.onSignInClick - Handler to trigger UMD SSO login flow
 * @param {boolean} props.isLoading - Whether authentication redirect is in progress
 * @param {string|null} props.error - Authentication error message if login failed
 */
export function UmdSsoCard({ onSignInClick, isLoading, error }) {
  return (
    <div className={styles.action}>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <Button variant="primary" size="lg" className={styles.signIn} onClick={onSignInClick} disabled={isLoading}>
        <span className={styles.signInIcon}>
          <Image src="/icons/log-in.svg" width={13.6} height={13.6} alt="" />
        </span>
        {isLoading ? 'Redirecting to UMD…' : 'Sign in with UMD'}
      </Button>
      <p className={styles.note}>
        <span className={styles.shield}>
          <Image src="/icons/shield.svg" width={10.9333} height={13.2686} alt="" />
        </span>
        You&apos;ll sign in on the UMD login page with your Directory ID. GradeFlow never sees your password.
      </p>
    </div>
  )
}
