/**
 * Step 4: Assigns TAs by question, whole submission, or course section and publishes the exam setup.
 * @param {Object} props
 * @param {Array<Object>} props.questions - Exam questions
 * @param {Array<Object>} props.courseTAs - Available TAs and head TAs
 * @param {'by_question' | 'whole_submission' | 'by_section'} props.assignmentMode
 * @param {(assignments: Object) => Promise<void>} props.onPublishExamSetup
 */
export function GraderAssignmentStep({ questions, courseTAs, assignmentMode, onPublishExamSetup }) {}
