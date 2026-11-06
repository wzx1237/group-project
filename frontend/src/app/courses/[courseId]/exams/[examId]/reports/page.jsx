'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Download, Eye, FileArchive, FileSpreadsheet } from 'lucide-react'
import { ExamHeader } from '@/components/exam/examHeader'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { formatNumber, plural } from '@/lib/rubric'
import { fetchStudentScores, gradesCsvUrl, reportUrl, reportsZipUrl } from '@/services/reportExportService'
import styles from './reports.module.css'

const icon = { size: 13, strokeWidth: 1.6, 'aria-hidden': true }

function grading(student) {
  if (!student.hasExam) return ['outline', 'No exam']
  if (!student.questionCount) return ['neutral', 'No rubric yet']
  if (student.graded) return ['soft', 'Graded']
  if (student.gradedCount) return ['warning', `${student.gradedCount} of ${student.questionCount} graded`]
  return ['neutral', 'Not started']
}

// Each student's report and the class's grades, ready to download.
export default function ExamReportsPage() {
  const { examId } = useParams()
  const [students, setStudents] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchStudentScores(examId)
      .then(setStudents)
      .catch((err) => setError(err.message))
  }, [examId])

  const exams = students?.filter((s) => s.hasExam) ?? []
  const graded = exams.filter((s) => s.graded).length

  return (
    <main className={styles.page}>
      <ExamHeader meta={students && `${graded} of ${plural(exams.length, 'exam')} fully graded`} />

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <section className={styles.card} aria-labelledby="reports-heading">
        <div className={styles.cardHeading}>
          <div>
            <h2 id="reports-heading" className={styles.cardTitle}>
              Student reports
            </h2>
            <p className={styles.cardMeta}>
              Each report has the student’s scores, applied criteria and comments, followed by their scanned exam. Internal notes are
              never included.
            </p>
          </div>
          <div className={styles.downloads}>
            <Button href={gradesCsvUrl(examId)}>
              <FileSpreadsheet {...icon} /> Export grades CSV
            </Button>
            <Button href={reportsZipUrl(examId)}>
              <FileArchive {...icon} /> Download all reports
            </Button>
          </div>
        </div>

        {!students && !error && <p className={styles.muted}>Loading students…</p>}
        {students && (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Student</th>
                  <th>UID</th>
                  <th>Score</th>
                  <th>Grading</th>
                  <th>
                    <span className={styles.srOnly}>Report</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => {
                  const [tone, label] = grading(s)
                  return (
                    <tr key={s.uid}>
                      <td className={styles.name}>{s.name}</td>
                      <td>{s.uid}</td>
                      <td>{s.graded ? `${formatNumber(s.earned)} / ${s.possible}` : '—'}</td>
                      <td>
                        <Badge tone={tone}>{label}</Badge>
                      </td>
                      <td>
                        {s.hasExam && (
                          <div className={styles.reportActions}>
                            <Button size="sm" href={reportUrl(examId, s.uid)} target="_blank" rel="noreferrer">
                              <Eye {...icon} /> Preview
                            </Button>
                            <Button size="sm" href={reportUrl(examId, s.uid, true)}>
                              <Download {...icon} /> Download
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  )
}
