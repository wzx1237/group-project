// Order matters: it is the order shown in the key.
export const STATUSES = [
  { id: 'submitted', label: 'Submitted' },
  { id: 'grading', label: 'Being graded' },
  { id: 'graded', label: 'Graded' },
  { id: 'missing', label: 'Missing' },
]

export const formatDue = (iso) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
