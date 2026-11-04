/**
 * Real-time notification banner displayed when another TA or instructor modifies the shared rubric mid-session (Sec 7.2).
 * @param {Object} props
 * @param {{ updatedBy: string, qid: string, summary: string, timestamp: string }|null} props.latestBroadcast
 * @param {() => void} props.onDismiss
 */
export function LiveRubricSyncBanner({ latestBroadcast, onDismiss }) {}