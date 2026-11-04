/**
 * Slide-out drawer or page view displaying the append-only audit trail for a specific student submission or the entire exam.
 * @param {Object} props
 * @param {boolean} props.isOpen
 * @param {Array<{
 *   eventId: string,
 *   timestamp: string,
 *   actorName: string,
 *   actorRole: string,
 *   actionType: 'grade_update' | 'rubric_edit' | 'comment_edit' | 'scan_upload' | 'grade_release' | 'version_restore',
 *   qid?: string,
 *   studentUid?: string,
 *   previousValue: any,
 *   newValue: any,
 *   rubricVersion: number
 * }>} props.auditEvents
 * @param {(eventId: string) => Promise<void>} props.onRestoreVersion - Restores a prior grade/comment/rubric state by appending a recovery event
 * @param {() => void} props.onClose
 */
export function ChangeLog({ isOpen, auditEvents, onRestoreVersion, onClose }) {}