import Image from 'next/image'
import Link from 'next/link'
import { Badge } from '@/components/ui/Badge'
import { ProgressBar } from '@/components/ui/ProgressBar'
import styles from './examRow.module.css'

export function ExamRow({ href, title, date, status, progress, note }) {
  return (
    <li>
      <Link href={href} className={styles.row}>
        <span className={styles.title}>{title}</span>
        <span className={styles.date}>{date}</span>
        <span>{status && <Badge tone={status.tone}>{status.label}</Badge>}</span>
        <span className={styles.progress}>
          {progress && <ProgressBar value={progress.done} total={progress.total} />}
          <span className={styles.note}>{note}</span>
        </span>
        <span className={styles.chevron}>
          <Image src="/icons/chevron-right.svg" width={5.6} height={9.6} alt="" />
        </span>
      </Link>
    </li>
  )
}
