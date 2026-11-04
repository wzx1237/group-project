/**
 * Connects to the FastAPI WebSocket channel for an exam to receive real-time broadcasts when any TA or instructor
 * adds, edits, or splits a rubric criterion, immediately refreshing local rubric state and triggering a notification banner.
 * @param {string} examId
 * @param {(updatedRubricPayload: Object) => void} onRubricBroadcastReceived
 * @returns {{ isConnected: boolean, latestBroadcast: Object | null, clearBroadcast: () => void }}
 */
export function useLiveRubricSocket(examId, onRubricBroadcastReceived) {}