/**
 * Automatically tracks active time spent grading each question while open in the workspace to support the Grading Time KPI (Sec 3.3 & 7.7).
 * @param {string} examId
 * @param {string} qid
 * @param {string} studentUid
 * @returns {{ elapsedSeconds: number, pauseTimer: () => void, flushDurationToBackend: () => Promise<void> }}
 */
export function useGradingTimer(examId, qid, studentUid) {}
