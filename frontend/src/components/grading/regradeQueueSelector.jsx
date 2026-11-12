import Link from 'next/link'
import { RotateCcw } from 'lucide-react'
import { plural, questionLabel } from '@/lib/rubric'
import { icon } from './icon'
import styles from './regradeQueueSelector.module.css'

// The open regrade queues, each a link to review its answers (proposal 3.5: several named queues per question).
export function RegradeQueueSelector({ queues, questions, href }) {
  if (!queues.length) return null

  return (
    <nav className={styles.bar} aria-label="Regrade queues">
      <span className={styles.label}>
        <RotateCcw {...icon} />
        {plural(queues.length, 'regrade queue')}
      </span>
      <ul className={styles.queues}>
        {queues.map((queue) => (
          <li key={queue.id}>
            <Link className={styles.queue} href={href(queue.id)}>
              <span className={styles.name}>
                {questionLabel(questions, queue.qid)} · {queue.reason}
              </span>
              <span className={styles.count}>
                {queue.items.length - queue.pending_student_uids.length} / {queue.items.length} reviewed
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
