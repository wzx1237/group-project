export const formatSize = (bytes) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`

export function formatDateTime(iso) {
  const date = new Date(iso)
  const day = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  return `${day} at ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
}

export const pageRange = (exam) =>
  exam.start_page === exam.end_page ? `Page ${exam.start_page}` : `Pages ${exam.start_page}–${exam.end_page}`
