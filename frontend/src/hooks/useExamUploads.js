'use client'

import { useCallback, useEffect, useState } from 'react'
import * as api from '@/exam-distribution/lib/api'
import { uploadExamPdf } from '@/services/submissionsUploadService'

const isWorking = (upload) => upload.status === 'uploaded' || upload.status === 'processing' || upload.matching === 'running'

// An exam's uploads and roster, refreshed every 1.5 s while a PDF is being split or matched.
export function useExamUploads(examId, onChange) {
  const [exam, setExam] = useState(null)
  const [students, setStudents] = useState(null)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(null) // { filename, percent } while a file is sent

  const reload = useCallback(
    () =>
      Promise.all([api.getAssignment(examId), api.getAssignmentRoster(examId)])
        .then(([assignment, roster]) => {
          setExam(assignment)
          setStudents(roster.students)
        })
        .catch((err) => setError(err.message)),
    [examId],
  )

  useEffect(() => {
    reload()
  }, [reload])

  const working = exam?.uploads.some(isWorking)
  useEffect(() => {
    if (!working) return
    const timer = setInterval(reload, 1500)
    return () => {
      clearInterval(timer)
      onChange?.()
    }
  }, [working, reload, onChange])

  // Runs one change, then reloads. Resolves to whether it worked.
  const change = (fn) => async (...args) => {
    setError('')
    try {
      await fn(...args)
      await reload()
      onChange?.()
      return true
    } catch (err) {
      setError(err.message)
      return false
    }
  }

  async function upload(files) {
    setError('')
    for (const file of files) {
      setUploading({ filename: file.name, percent: 0 })
      try {
        await uploadExamPdf(examId, file, (percent) => setUploading({ filename: file.name, percent }))
      } catch (err) {
        setError(`${file.name}: ${err.message}`)
      }
      await reload()
    }
    setUploading(null)
  }

  return {
    exam,
    students,
    error,
    uploading,
    upload,
    remove: change((uploadId) => api.deleteUpload(examId, uploadId)),
    reprocess: change((uploadId) => api.reprocessUpload(examId, uploadId)),
    match: change((uploadId) => api.matchUpload(examId, uploadId)),
    assign: change((uploadId, examNumber, uid) => api.assignSubmission(examId, uploadId, examNumber, uid)),
    unassign: change((uploadId, examNumber) => api.unassignSubmission(examId, uploadId, examNumber)),
    mark: change((uid, status) => api.markStudent(examId, uid, status)),
    reload,
  }
}
