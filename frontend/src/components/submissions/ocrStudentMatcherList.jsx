/**
 * Displays extracted cover-page scans alongside OCR-detected UIDs/names.
 * Highlights low-confidence, unmatched, or duplicate cover pages for manual TA/instructor roster assignment.
 * @param {Object} props
 * @param {Array<{ scanId: string, coverImageUrl: string, detectedUid?: string, confidence: number, matchedStudent?: Object, status: 'matched' | 'needs_review' | 'conflict' }>} props.scans
 * @param {Array<{ uid: string, directoryId: string, name: string }>} props.roster - Active course roster for search autocomplete
 * @param {(scanId: string, studentUid: string) => Promise<void>} props.onAssignScanToStudent - Confirms or corrects student match
 * @param {(scanId: string, pageSplitIndices: number[]) => Promise<void>} props.onFixPageSplit - Adjusts incorrect cover-page splits
 */
export function OcrStudentMatcherList({ scans, roster, onAssignScanToStudent, onFixPageSplit }) {}
