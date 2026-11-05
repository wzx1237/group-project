'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowRight, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { PdfDropZone } from '@/components/submissions/pdfDropZone'
import { UploadStatusCard } from '@/components/submissions/uploadStatusCard'
import { MissingExamsCard } from '@/components/submissions/missingExamsCard'
import { OcrStudentMatcherList } from '@/components/submissions/ocrStudentMatcherList'
import { useCourse } from '@/context/CourseContext'
import * as submissionsUploadService from '@/services/submissionsUploadService'
import styles from './upload.module.css'

// submissions upload and batch ingestion screen matching appendix a figure 17
export default function UploadSubmissionsPage() {
  const { courseId, examId } = useParams()
  const router = useRouter()
  const { course, assignments, refresh } = useCourse() || {}
  const assignment = assignments?.find((a) => a.id === examId)

  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [statusMessage, setStatusMessage] = useState('')
  const [missingList, setMissingList] = useState([
    { uid: '204838', name: 'Jordan Lee', status: 'active' },
  ])
  const [matchList, setMatchList] = useState([
    { scanId: 'scan-1', filename: 'alex_chen_quiz03.pdf', pageCount: 2, detectedUid: '204831', studentName: 'Alex Chen', confidence: 0.98, matched: true },
    { scanId: 'scan-2', filename: 'jordan_lee_quiz03.pdf', pageCount: 2, detectedUid: '204838', studentName: 'Jordan Lee', confidence: 0.52, matched: false },
  ])

  // loads active missing submissions and ocr verification queue items
  async function loadUploadState() {
    try {
      const queue = await submissionsUploadService.fetchOcrMatchingQueue(examId)
      if (Array.isArray(queue) && queue.length > 0) {
        setMissingList(queue)
      }
    } catch {}
  }

  useEffect(() => {
    loadUploadState()
  }, [examId])

  // handles multi-page batch scan uploads with real-time percentage progress
  async function handleBatchUpload(files) {
    if (!files || files.length === 0) return
    setIsUploading(true)
    setUploadProgress(0)
    setStatusMessage('')

    try {
      for (let i = 0; i < files.length; i++) {
        await submissionsUploadService.uploadScannedExamBatch(
          examId,
          files[i],
          (percent) => setUploadProgress(percent)
        )
      }
      setStatusMessage('scans uploaded successfully and split into student submissions')
      await refresh?.()
      await loadUploadState()
    } catch (err) {
      alert(err.message || 'error uploading exam batch')
    } finally {
      setIsUploading(false)
    }
  }

  // uploads an individual exam file for a late student or makeup submission
  async function handleSingleScanUpload(uid, file) {
    try {
      await submissionsUploadService.uploadLateOrMakeupExam(examId, uid, file)
      setMissingList((prev) => prev.filter((s) => s.uid !== uid))
      await refresh?.()
    } catch (err) {
      alert(err.message || 'error uploading single student exam')
    }
  }

  // associates an unmatched scan with a selected student from the course roster
  async function handleResolveMatch(scanId, uid) {
    try {
      await submissionsUploadService.resolveOcrStudentMatch(examId, scanId, uid)
      setMatchList((prev) =>
        prev.map((m) => (m.scanId === scanId ? { ...m, detectedUid: uid, matched: true, confidence: 1.0 } : m))
      )
      await refresh?.()
    } catch (err) {
      alert(err.message || 'unable to assign student match')
    }
  }

  const title = assignment?.title || 'Quiz 03: Derivatives'
  const totalStudents = 36
  const uploadedCount = totalStudents - missingList.length

  return (
    <main className={styles.container}>
      <header className={styles.topBar}>
        <div>
          <h1 className={styles.title}>Upload Submissions</h1>
          <p className={styles.subtitle}>
            {title} · {uploadedCount} of {totalStudents} exams uploaded
          </p>
        </div>
        <div>
          <Link href={`/courses/${courseId}/exams/${examId}/grade`}>
            <Button>
              Go to grading workspace <ArrowRight size={14} />
            </Button>
          </Link>
        </div>
      </header>

      {statusMessage && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '12px 16px',
            background: '#f0fdf4',
            color: '#166534',
            borderRadius: '8px',
            marginBottom: '20px',
            fontSize: '13px',
          }}
        >
          <CheckCircle2 size={16} /> {statusMessage}
        </div>
      )}

      <div className={styles.layout}>
        <div className={styles.leftColumn}>
          <PdfDropZone
            onUploadFiles={handleBatchUpload}
            isUploading={isUploading}
            uploadProgress={uploadProgress}
          />

          <OcrStudentMatcherList
            matches={matchList}
            onResolveMatch={handleResolveMatch}
          />
        </div>

        <div className={styles.rightColumn}>
          <UploadStatusCard
            uploadedCount={uploadedCount}
            totalCount={totalStudents}
            lastUploadTime="Sep 29, 2026 at 9:16 AM"
          />

          <MissingExamsCard
            missingStudents={missingList}
            totalPoints={20}
            onUploadSingleScan={handleSingleScanUpload}
          />
        </div>
      </div>
    </main>
  )
}
