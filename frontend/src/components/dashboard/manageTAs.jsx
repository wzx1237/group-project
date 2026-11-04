/**
 * Modal for instructors to add or remove TAs from the course.
 * Removing a TA revokes access and releases ungraded assignments while preserving completed grades and audit history.
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether the modal is visible
 * @param {Array<Object>} props.tas - Current list of course TAs and their active assignment counts
 * @param {(emailOrDirectoryId: string, role?: 'ta' | 'head_ta') => Promise<void>} props.onAddTA
 * @param {(graderId: string) => Promise<void>} props.onRemoveTA
 * @param {() => void} props.onClose
 */
export function ManageTAs({ isOpen, tas, onAddTA, onRemoveTA, onClose }) {}