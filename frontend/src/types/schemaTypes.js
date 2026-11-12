// data contract definitions for gradeflow frontend based on proposal section 7.4

/**
 * represents an enrolled student in a course
 * @typedef {object} student
 * @property {string} uid - university student identification number
 * @property {string} name - full name of the student
 * @property {string} email - university email address ending in .edu
 * @property {string} [scannedpdfpath] - path or identifier of the student scanned exam
 * @property {string} [comments] - optional overall feedback or remarks for the student
 * @property {'active' | 'dropped'} status - enrollment status of the student
 * @property {string} [section] - discussion section identifier
 */

/**
 * represents an authorized course staff member
 * @typedef {object} grader
 * @property {string} grader_id - unique identifier for the grader or directory id
 * @property {string} name - full name of the course staff member
 * @property {string} email - university email address of the grader
 * @property {'instructor' | 'ta' | 'head_ta'} role - role and permissions assigned to grader
 * @property {string[]} [assignedqids] - list of question identifiers assigned for grading
 */

/**
 * represents a reusable rubric criterion or deduction label
 * @typedef {object} label
 * @property {string} label_id - unique identifier for the rubric criterion
 * @property {string} title - short student-visible title for the criterion
 * @property {string} [description] - internal grader-facing description of the criterion
 * @property {number} deduction - point value or deduction associated with the criterion
 */

/**
 * represents visual bounding box coordinates on a pdf page
 * @typedef {object} region
 * @property {number} page - 1-indexed page number of the exam scan
 * @property {number} x - normalized x coordinate from 0.0 to 1.0
 * @property {number} y - normalized y coordinate from 0.0 to 1.0
 * @property {number} width - normalized width from 0.0 to 1.0
 * @property {number} height - normalized height from 0.0 to 1.0
 */

/**
 * represents an exam question rubric item
 * @typedef {object} rubricquestion
 * @property {string} qid - unique question identifier such as q1 or q1.1
 * @property {string} title - title or topic of the question
 * @property {'manual' | 'auto_numeric' | 'auto_match'} gradingmethod - method used to grade question
 * @property {number} totalscore - maximum point value for the question
 * @property {region} [region] - answer region rectangle on the exam template
 * @property {label[]} criteria - list of criteria associated with the question
 */

/**
 * represents a recorded grading decision for one question on a student submission
 * @typedef {object} decision
 * @property {string} record_id - unique identifier for the grading record
 * @property {string} uid - university id of the student whose answer was graded
 * @property {string} qid - question identifier that was evaluated
 * @property {number} scores - calculated earned points for the question
 * @property {string[]} appliedlabelids - list of rubric label ids applied to the answer
 * @property {string} [studentcomment] - student-visible feedback note
 * @property {string} [internalnote] - confidential staff-only note excluded from student reports
 * @property {number} version - rubric version used when the score was evaluated
 */

/**
 * represents the assignment mapping of a question to a grader
 * @typedef {object} mapping
 * @property {string} uid - student university id
 * @property {string} qid - question identifier
 * @property {string|null} grader_id - assigned staff member identifier or null if unassigned
 * @property {'pending' | 'in_progress' | 'needs_regrade' | 'done'} status - grading status
 */

/**
 * represents a dedicated regrade queue generated after criterion splits or flags
 * @typedef {object} regradequeue
 * @property {string} queue_id - unique identifier for the regrade queue
 * @property {string} qid - question identifier undergoing regrading
 * @property {string} reason - explanation or label split trigger for the queue
 * @property {string[]} pendinguids - list of student uids remaining to be re-evaluated
 */

/**
 * represents grading progress on one question across an exam
 * @typedef {object} questionprogress
 * @property {string} qid - question identifier
 * @property {number} total - enrolled students with a paper for the exam
 * @property {number} finished - answers fully graded
 * @property {number} regrade - answers waiting on a regrade
 */

/**
 * represents grading progress on one student's exam
 * @typedef {object} studentprogress
 * @property {string} uid - student university id
 * @property {string} name - student name
 * @property {number} questions - questions graded on their own
 * @property {number} finished - answers fully graded
 * @property {number} regrade - answers waiting on a regrade
 * @property {'not_started' | 'in_progress' | 'regrade' | 'graded'} status - overall state of this student's exam
 * @property {Object<string, string>} answers - each question's status, by qid
 */

// export empty object so this file can be used for type checking
export default {}
