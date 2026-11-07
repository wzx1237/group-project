'use client'

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { plural } from '@/lib/rubric'
import styles from './analytics.module.css'

const tick = { fontSize: 11, fill: 'var(--muted)' }

function BucketTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const { label, count } = payload[0].payload
  return (
    <p className={styles.tooltip}>
      <strong>{label} pts</strong> · {plural(count, 'student')}
    </p>
  )
}

export function ScoreDistributionChart({ distribution, fullyGraded, totalPoints }) {
  return (
    <section className={styles.card} aria-labelledby="distribution-heading">
      <div className={styles.cardHeading}>
        <h2 id="distribution-heading" className={styles.cardTitle}>
          Score distribution
        </h2>
      </div>

      {distribution.buckets.length ? (
        <>
          <div aria-hidden="true">
            <p className={styles.axisTitle}>Students</p>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={distribution.buckets} margin={{ top: 20, right: 8, bottom: 0, left: -24 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="label" tick={tick} tickLine={false} axisLine={{ stroke: 'var(--border)' }} />
                <YAxis allowDecimals={false} tick={tick} tickLine={false} axisLine={false} />
                <Tooltip content={<BucketTooltip />} cursor={{ fill: 'var(--row-highlight)' }} isAnimationActive={false} />
                <Bar
                  dataKey="count"
                  fill="var(--accent)"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={24}
                  isAnimationActive={false}
                  label={{ position: 'top', fontSize: 11, fill: 'var(--fg-secondary)', formatter: (n) => n || '' }}
                />
              </BarChart>
            </ResponsiveContainer>
            <p className={`${styles.axisTitle} ${styles.xAxisTitle}`}>Total score / {totalPoints}</p>
          </div>
          <table className={styles.srOnly}>
            <caption>Students per total score</caption>
            <thead>
              <tr>
                <th>Total score</th>
                <th>Students</th>
              </tr>
            </thead>
            <tbody>
              {distribution.buckets.map((bucket) => (
                <tr key={bucket.label}>
                  <td>{bucket.label}</td>
                  <td>{bucket.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <p className={styles.empty}>The chart appears once a submission is fully graded.</p>
      )}
    </section>
  )
}
