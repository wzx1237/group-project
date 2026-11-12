'use client'

/**
 * selector component allowing instructors to scope pdf zip downloads to all graded submissions, specific course sections, or individual students (sec 3.5 & 7.2).
 * @param {Object} props
 * @param {'all' | 'sections' | 'students'} props.selectedScope
 * @param {Array<string>} props.availableSections - course discussion sections (e.g., ["0101", "0102"])
 * @param {Array<{ uid: string, name: string }>} props.students - enrolled students
 * @param {(scope: 'all' | 'sections' | 'students', selectedIds: string[]) => void} props.onChangeScope
 */
export function ExportScopeSelector({
  selectedScope = 'all',
  availableSections = [],
  students = [],
  onChangeScope,
}) {
  // handle scope type changes
  function handleScopeChange(e) {
    const scope = e.target.value
    onChangeScope?.(scope, [])
  }

  // handle selecting specific course sections
  function handleSectionChange(e) {
    const values = Array.from(e.target.selectedOptions, (opt) => opt.value)
    onChangeScope?.('sections', values)
  }

  // handle selecting specific students
  function handleStudentChange(e) {
    const values = Array.from(e.target.selectedOptions, (opt) => opt.value)
    onChangeScope?.('students', values)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <label style={{ fontSize: '13px', fontWeight: 500 }}>
        Scope:
        <select value={selectedScope} onChange={handleScopeChange} style={{ marginLeft: '8px' }}>
          <option value="all">All students</option>
          <option value="sections">By section</option>
          <option value="students">By student</option>
        </select>
      </label>

      {selectedScope === 'sections' && (
        <label style={{ fontSize: '13px' }}>
          Select sections:
          <select
            multiple
            onChange={handleSectionChange}
            style={{ display: 'block', marginTop: '4px' }}
          >
            {availableSections.map((sec) => (
              <option key={sec} value={sec}>
                Section {sec}
              </option>
            ))}
          </select>
        </label>
      )}

      {selectedScope === 'students' && (
        <label style={{ fontSize: '13px' }}>
          Select students:
          <select
            multiple
            onChange={handleStudentChange}
            style={{ display: 'block', marginTop: '4px' }}
          >
            {students.map((s) => (
              <option key={s.uid} value={s.uid}>
                {s.name} ({s.uid})
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  )
}
