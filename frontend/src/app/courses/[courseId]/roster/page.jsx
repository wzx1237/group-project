'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { FileUp, Plus, Search } from 'lucide-react'
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
  const [newStudent, setNewStudent] = useState({ uid: '', name: '', email: '', section: '0101' })

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
      await courseRosterService.uploadRosterCsv(courseId, file)
      await loadRoster()
    } catch (err) {
      alert(err.message || 'unable to upload roster csv')
    }
  }

  // adds a single student record to the course roster
  async function handleAddStudent(event) {
    event.preventDefault()
    if (!newStudent.uid || !newStudent.name) return
    try {
      await courseRosterService.upsertStudentRecord(courseId, { uid: newStudent.uid, name: newStudent.name, email: newStudent.email })
      await loadRoster()
      setNewStudent({ uid: '', name: '', email: '', section: '0101' })
      setShowAddModal(false)
    } catch (err) {
      alert(err.message || 'unable to add student')
    }
  }

  const filtered = students.filter((s) => {
    const q = searchQuery.toLowerCase()
    return s.name.toLowerCase().includes(q) || s.uid.toLowerCase().includes(q) || (s.email ?? '').toLowerCase().includes(q)
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
          <Button onClick={() => setShowAddModal(true)}>
            <Plus size={15} />
            Add Student
          </Button>
        </div>
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
                    {s.email}
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
              maxWidth: '480px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <h2 style={{ fontSize: '18px', fontWeight: 600, margin: 0 }}>Add Enrolled Student</h2>
            <form onSubmit={handleAddStudent} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>UID</label>
                <input
                  required
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
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                <Button variant="secondary" onClick={() => setShowAddModal(false)}>
                  Cancel
                </Button>
                <Button type="submit">
                  Save Student
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  )
}
