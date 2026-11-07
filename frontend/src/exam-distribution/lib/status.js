// A student's status on one assignment, stored on the server (assignment_student). Order is the key's order.
// "graded" is not stored: the server works it out from grading progress and sends it as `graded`.
export const STATUSES = [
  { id: 'needs_review', label: 'Needs review' },
  { id: 'matched', label: 'Has an exam' },
  { id: 'graded', label: 'Graded' },
  { id: 'excused', label: 'Excused (makeup pending)' },
  { id: 'no_show', label: 'No-show (0)' },
  { id: 'missing', label: 'Missing' },
]

// The key entry for a student's { status, graded } on an assignment, or '' while it is still in draft.
export const studentState = (entry) => (!entry ? '' : entry.status === 'matched' && entry.graded ? 'graded' : entry.status)

export const studentLabel = (entry) => STATUSES.find((s) => s.id === studentState(entry))?.label ?? ''

// An assignment's workflow status, with the badge it shows and the next step forward.
export const ASSIGNMENT_STATUSES = {
  draft: { label: 'Draft', tone: 'outline', next: 'collecting', action: 'Publish to TAs', who: ['instructor'] },
  collecting: { label: 'Collecting', tone: 'warning', next: 'grading', action: 'Start grading', who: ['instructor', 'ta'] },
  grading: { label: 'Grading', tone: 'soft', next: 'in_review', action: 'Finish grading', who: ['instructor', 'ta'] },
  in_review: { label: 'In review', tone: 'soft', next: 'closed', action: 'Close and release grades', who: ['instructor'] },
  closed: { label: 'Closed', tone: 'neutral', next: null },
}
export const ORDER = Object.keys(ASSIGNMENT_STATUSES)

export const formatDue = (iso) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
