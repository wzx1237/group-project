'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { FileUp, Plus, Search, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { useCourse } from '@/context/CourseContext'
import * as courseRosterService from '@/services/courseRosterService'
import styles from './roster.module.css'

// course student roster page supporting csv uploads and roster viewing
export default function CourseRosterPage() {
  const { courseId } = useParams()
  const { course } = useCourse() || {}
  const [students, setStudents] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [addMode, setAddMode] = useState('single') // 'single' or 'bulk'
  const [newStudent, setNewStudent] = useState({ uid: '', name: '', email: '', section: '0101' })
  const [bulkInput, setBulkInput] = useState('')
  const [validationError, setValidationError] = useState('')

  // Check if current user is an instructor (instructor-only permissions)
  const isInstructor = !course?.role || course.role.toLowerCase() === 'instructor'

  // loads the enrolled student roster for the active course
  async function loadRoster() {
    setLoading(true)
    try {
      const data = await courseRosterService.fetchCourseRoster(courseId)
      setStudents(Array.isArray(data) ? data : [])
    } catch {
      setStudents([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let ignore = false
    courseRosterService
      .fetchCourseRoster(courseId)
      .then((data) => {
        if (!ignore) {
          setStudents(Array.isArray(data) ? data : [])
          setLoading(false)
        }
      })
      .catch(() => {
        if (!ignore) {
          setStudents([])
          setLoading(false)
        }
      })
    return () => {
      ignore = true
    }
  }, [courseId])

  // uploads a csv file to replace or append to the current roster
  async function handleCsvUpload(event) {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      setLoading(true)
      const res = await courseRosterService.uploadRosterCsv(courseId, file)
      await loadRoster()
      const count = res?.uploaded ?? res?.students?.length
      if (count) {
        alert(`Successfully uploaded roster: ${count} student${count === 1 ? '' : 's'} enrolled.`)
      }
    } catch (err) {
      alert(err.message || 'unable to upload roster csv')
    } finally {
      if (event.target) event.target.value = ''
      setLoading(false)
    }
  }

  // adds a single student record to the course roster
  async function handleAddSingleStudent(event) {
    event.preventDefault()
    setValidationError('')
    const uid = newStudent.uid.trim()
    const name = newStudent.name.trim()

    if (!/^\d{9}$/.test(uid)) {
      setValidationError('UID must be exactly 9 digits.')
      return
    }
    if (!name) {
      setValidationError('Student name is required.')
      return
    }

    try {
      await courseRosterService.upsertStudentRecord(courseId, {
        uid,
        name,
        email: newStudent.email.trim() || undefined,
        section: newStudent.section.trim() || undefined,
      })
      await loadRoster()
      setNewStudent({ uid: '', name: '', email: '', section: '0101' })
      setShowAddModal(false)
    } catch (err) {
      setValidationError(err.message || 'Unable to add student.')
    }
  }

  // adds multiple students at the same time
  async function handleAddBulkStudents(event) {
    event.preventDefault()
    setValidationError('')

    const lines = bulkInput
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)

    if (lines.length === 0) {
      setValidationError('Please enter at least one student.')
      return
    }

    const studentsToAdd = []
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      // Split by comma or tab
      const parts = line.includes('\t') ? line.split('\t') : line.split(',')
      const uid = parts[0]?.trim() || ''
      const name = parts[1]?.trim() || ''
      const email = parts[2]?.trim() || ''
      const section = parts[3]?.trim() || ''

      if (!/^\d{9}$/.test(uid)) {
        setValidationError(`Line ${i + 1}: UID "${uid}" must be exactly 9 digits.`)
        return
      }
      if (!name) {
        setValidationError(`Line ${i + 1}: Name is required for UID ${uid}.`)
        return
      }

      studentsToAdd.push({
        uid,
        name,
        email: email || undefined,
        section: section || undefined,
      })
    }

    try {
      await courseRosterService.upsertStudentRecord(courseId, studentsToAdd)
      await loadRoster()
      setBulkInput('')
      setShowAddModal(false)
    } catch (err) {
      setValidationError(err.message || 'Unable to add multiple students.')
    }
  }

  const filtered = students.filter((s) => {
    const q = searchQuery.toLowerCase()
    return s.name?.toLowerCase().includes(q) || s.uid?.toLowerCase().includes(q) || (s.email ?? '').toLowerCase().includes(q)
  })

  return (
    <main className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Course Student Roster</h1>
          <p className={styles.subtitle}>
            {course?.code || 'CMSC250'} · {students.filter((s) => s.status !== 'dropped').length} active students enrolled
          </p>
        </div>
        {isInstructor && (
          <div className={styles.actions}>
            <label style={{ cursor: 'pointer' }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 14px',
                  borderRadius: '6px',
                  border: '1px solid #dfe5e5',
                  fontSize: '13px',
                  fontWeight: 600,
                  background: '#ffffff',
                  color: '#202c30',
                }}
              >
                <FileUp size={15} />
                Upload Roster CSV
              </span>
              <input type="file" accept=".csv" onChange={handleCsvUpload} style={{ display: 'none' }} />
            </label>
            <Button onClick={() => { setShowAddModal(true); setValidationError(''); }}>
              <Plus size={15} />
              Add Student
            </Button>
          </div>
        )}
      </header>

      <div className={styles.toolbar}>
        <div style={{ position: 'relative' }}>
          <Search size={15} color="#9ca3af" style={{ position: 'absolute', left: '10px', top: '10px' }} />
          <input
            className={styles.search}
            style={{ paddingLeft: '32px' }}
            placeholder="Search by name, UID or email…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className={styles.tableContainer}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.th}>Student UID</th>
              <th className={styles.th}>Name</th>
              <th className={styles.th}>Email</th>
              <th className={styles.th}>Section</th>
              <th className={styles.th}>Enrollment Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className={styles.empty}>
                  {loading ? 'Loading roster…' : 'No students found.'}
                </td>
              </tr>
            ) : (
              filtered.map((s) => (
                <tr key={s.uid} className={styles.tr}>
                  <td className={styles.td} style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                    {s.uid}
                  </td>
                  <td className={styles.td} style={{ fontWeight: 600 }}>
                    {s.name}
                  </td>
                  <td className={styles.td} style={{ color: '#4b5563' }}>
                    {s.email || '—'}
                  </td>
                  <td className={styles.td}>
                    {s.section || '—'}
                  </td>
                  <td className={styles.td}>
                    <Badge tone={s.status === 'dropped' ? 'danger' : 'soft'}>
                      {s.status === 'dropped' ? 'Dropped' : 'Active'}
                    </Badge>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showAddModal && (
        <div
          role="dialog"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
            padding: '16px',
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '12px',
              padding: '24px',
              width: '100%',
              maxWidth: '520px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 600, margin: 0 }}>
                {addMode === 'single' ? 'Add Enrolled Student' : 'Add Multiple Students'}
              </h2>
              <div style={{ display: 'flex', gap: '4px', background: '#f1f5f9', padding: '2px', borderRadius: '6px' }}>
                <button
                  type="button"
                  onClick={() => { setAddMode('single'); setValidationError(''); }}
                  style={{
                    padding: '4px 10px',
                    fontSize: '12px',
                    fontWeight: 600,
                    borderRadius: '4px',
                    border: 'none',
                    background: addMode === 'single' ? '#ffffff' : 'transparent',
                    color: addMode === 'single' ? '#0f172a' : '#64748b',
                    cursor: 'pointer',
                    boxShadow: addMode === 'single' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                  }}
                >
                  Single
                </button>
                <button
                  type="button"
                  onClick={() => { setAddMode('bulk'); setValidationError(''); }}
                  style={{
                    padding: '4px 10px',
                    fontSize: '12px',
                    fontWeight: 600,
                    borderRadius: '4px',
                    border: 'none',
                    background: addMode === 'bulk' ? '#ffffff' : 'transparent',
                    color: addMode === 'bulk' ? '#0f172a' : '#64748b',
                    cursor: 'pointer',
                    boxShadow: addMode === 'bulk' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                  }}
                >
                  Multiple
                </button>
              </div>
            </div>

            {validationError && (
              <div
                style={{
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  color: '#b91c1c',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  fontSize: '13px',
                }}
              >
                {validationError}
              </div>
            )}

            {addMode === 'single' ? (
              <form onSubmit={handleAddSingleStudent} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                    UID (9 digits)
                  </label>
                  <input
                    required
                    maxLength={9}
                    placeholder="e.g. 119482910"
                    value={newStudent.uid}
                    onChange={(e) => setNewStudent({ ...newStudent, uid: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #dfe5e5' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Full Name</label>
                  <input
                    required
                    placeholder="e.g. Alex Chen"
                    value={newStudent.name}
                    onChange={(e) => setNewStudent({ ...newStudent, name: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #dfe5e5' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>University Email (optional)</label>
                  <input
                    type="email"
                    placeholder="e.g. achen@terpmail.umd.edu"
                    value={newStudent.email}
                    onChange={(e) => setNewStudent({ ...newStudent, email: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #dfe5e5' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Discussion Section (optional)</label>
                  <input
                    placeholder="e.g. 0101"
                    value={newStudent.section}
                    onChange={(e) => setNewStudent({ ...newStudent, section: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #dfe5e5' }}
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                  <Button variant="secondary" onClick={() => setShowAddModal(false)}>
                    Cancel
                  </Button>
                  <Button type="submit">
                    Save Student
                  </Button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleAddBulkStudents} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                    Enter Multiple Students (one per line)
                  </label>
                  <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 8px 0' }}>
                    Format: <code>UID, Name, Email, Section</code> (standard 9-digit UID required)
                  </p>
                  <textarea
                    required
                    rows={6}
                    placeholder={`118492041, Alex Rivera, arivera@terpmail.umd.edu, 0101\n119302847, Samantha Chen, schen24@terpmail.umd.edu, 0101`}
                    value={bulkInput}
                    onChange={(e) => setBulkInput(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      border: '1px solid #dfe5e5',
                      fontFamily: 'monospace',
                      fontSize: '12px',
                    }}
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                  <Button variant="secondary" onClick={() => setShowAddModal(false)}>
                    Cancel
                  </Button>
                  <Button type="submit">
                    Save Students
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </main>
  )
}
