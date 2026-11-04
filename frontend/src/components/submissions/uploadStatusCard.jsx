/**
 * Displays upload completion metrics (e.g., "35 of 36 exams uploaded · 97%") and last upload timestamp.
 * @param {Object} props
 * @param {number} props.uploadedCount - Count of matched student submissions
 * @param {number} props.totalEnrolled - Count of active (non-dropped) students on the roster
 * @param {string} props.lastUploadTimestamp - Formatted date/time of the latest scan upload
 */
export function UploadStatusCard({ uploadedCount, totalEnrolled, lastUploadTimestamp }) {}