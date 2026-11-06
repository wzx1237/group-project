// Uploads one scanned PDF and reports progress; the other upload calls are in exam-distribution/lib/api.js.
export function uploadExamPdf(examId, file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `/api/assignments/${examId}/uploads`)
    xhr.upload.onprogress = (event) => event.lengthComputable && onProgress(Math.round((event.loaded / event.total) * 100))
    xhr.onload = () => {
      let body = null
      try {
        body = JSON.parse(xhr.responseText)
      } catch {}
      if (xhr.status >= 200 && xhr.status < 300) resolve(body)
      else reject(new Error(body?.detail || `Upload failed (${xhr.status})`))
    }
    xhr.onerror = () => reject(new Error('Upload failed. Check your connection and try again.'))
    const form = new FormData()
    form.append('file', file)
    xhr.send(form)
  })
}
