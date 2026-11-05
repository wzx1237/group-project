import * as apiClient from './apiClient'

// uploads a batch multi-page scanned exam pdf file with optional upload progress tracking
export async function uploadScannedExamBatch(examId, pdfFile, onProgress) {
  const formData = new FormData()
  formData.append('file', pdfFile)

  if (typeof XMLHttpRequest !== 'undefined' && onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open('POST', `/api/assignments/${examId}/uploads`)
      xhr.withCredentials = true

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100)
          onProgress(percent)
        }
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText))
          } catch {
            resolve(null)
          }
        } else {
          reject(new Error(`upload failed with status ${xhr.status}`))
        }
      }

      xhr.onerror = () => reject(new Error('network error during exam batch upload'))
      xhr.send(formData)
    })
  }

  return apiClient.upload(`/assignments/${examId}/uploads`, formData)
}

// uploads an individual student scan for late submissions or makeup exams
export async function uploadLateOrMakeupExam(examId, studentUid, pdfFile) {
  const formData = new FormData()
  formData.append('file', pdfFile)
  formData.append('uid', studentUid)
  return apiClient.upload(`/assignments/${examId}/scans/single`, formData)
}

// retrieves flagged student scan matches requiring manual verification or roster lookup
export async function fetchOcrMatchingQueue(examId) {
  try {
    const data = await apiClient.get(`/assignments/${examId}/roster`)
    const students = data?.students || []
    return students.filter((s) => s.status === 'missing' || s.needs_review)
  } catch {
    return []
  }
}

// resolves an ocr match by manually associating a scan with a verified student uid
export async function resolveOcrStudentMatch(examId, scanId, studentUid) {
  return apiClient.post(`/assignments/${examId}/submissions/${scanId}/assign`, { uid: studentUid })
}
