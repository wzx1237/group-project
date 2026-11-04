/**
 * Provides instructor controls for exporting archival bundles and selectively deleting raw PDF scans (retaining rubric & analytics history) or purging all exam records (Sec 5.2).
 * @param {Object} props
 * @param {string} props.examId
 * @param {(includeScans: boolean, includeGradingRecords: boolean) => Promise<void>} props.onDownloadArchivalBundle
 * @param {() => Promise<void>} props.onDeleteRawScansOnly - Deletes PDF scans while preserving rubrics, scores, and analytics
 * @param {() => Promise<void>} props.onDeleteAllExamData - Permanently deletes both scans and grading records
 */
export function DataRetentionPanel({
  examId,
  onDownloadArchivalBundle,
  onDeleteRawScansOnly,
  onDeleteAllExamData,
}) {}
