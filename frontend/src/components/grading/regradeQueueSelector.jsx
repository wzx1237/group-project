/**
 * Dropdown/pill bar allowing TAs to switch between standard grading and multiple named regrade queues per question (Sec 3.5 & 7.4).
 * @param {Object} props
 * @param {Array<{ queueId: string, name: string, qid: string, pendingCount: number }>} props.regradeQueues
 * @param {string|null} props.activeQueueId
 * @param {(queueId: string|null) => void} props.onSelectQueue
 */
export function RegradeQueueSelector({ regradeQueues, activeQueueId, onSelectQueue }) {}
