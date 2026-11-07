'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Info } from 'lucide-react'
import { QuestionPerformanceCard } from '@/components/analytics/questionPerformanceCard'
import { ScoreDistributionChart } from '@/components/analytics/scoreDistributionChart'
import { SummaryStatCards } from '@/components/analytics/summaryStatCards'
import { ExamHeader } from '@/components/exam/examHeader'
import { formatPoints, plural } from '@/lib/rubric'
import { fetchExamAnalytics } from '@/services/analyticsService'
import styles from './analytics.module.css'

export default function ExamAnalyticsPage() {
  const { examId } = useParams()
  const [analytics, setAnalytics] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchExamAnalytics(examId)
      .then(setAnalytics)
      .catch((err) => setError(err.message))
  }, [examId])

  return (
    <main className={styles.page}>
      <ExamHeader
        meta={
          analytics &&
          `${plural(analytics.submissionCount, 'submission')} · ${plural(analytics.questionCount, 'question')} · ${formatPoints(analytics.totalPoints)}`
        }
      />

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {analytics ? (
        <>
          <SummaryStatCards stats={analytics.stats} totalPoints={analytics.totalPoints} />
          <ScoreDistributionChart
            distribution={analytics.distribution}
            fullyGraded={analytics.fullyGraded}
            totalPoints={analytics.totalPoints}
          />
          <QuestionPerformanceCard questions={analytics.questions} />
        </>
      ) : (
        !error && <p className={styles.loading}>Loading analytics…</p>
      )}
    </main>
  )
}
