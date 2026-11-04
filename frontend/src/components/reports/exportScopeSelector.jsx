/**
 * Selector component allowing instructors to scope PDF ZIP downloads to all graded submissions, specific course sections, or individual students (Sec 3.5 & 7.2).
 * @param {Object} props
 * @param {'all' | 'sections' | 'students'} props.selectedScope
 * @param {Array<string>} props.availableSections - Course discussion sections (e.g., ["0101", "0102"])
 * @param {Array<{ uid: string, name: string }>} props.students - Enrolled students
 * @param {(scope: 'all' | 'sections' | 'students', selectedIds: string[]) => void} props.onChangeScope
 */
export function ExportScopeSelector({ selectedScope, availableSections, students, onChangeScope }) {}
