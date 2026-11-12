// Which student the grading page shows: an index into `students`.
// A student named in the URL is kept (Previous, Next and links from other pages rely on that). With none named, as when
// "Open grading" is clicked, it is the first student who isn't fully graded, or the first student if everyone is.
// A uid that isn't in the list also falls back to the first student.
export function firstUngradedIndex(students, requestedUid) {
  const found = students.findIndex(requestedUid ? (s) => s.uid === requestedUid : (s) => !s.progress?.graded)
  return Math.max(0, found)
}
