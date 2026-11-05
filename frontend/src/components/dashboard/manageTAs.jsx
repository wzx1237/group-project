'use client'

import { useState } from 'react'
import { Trash2, UserPlus, X } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'

// modal dialog allowing instructors to add or remove course teaching assistants
export function ManageTAs({ isOpen, tas = [], onAddTA, onRemoveTA, onClose }) {
  const [identifier, setIdentifier] = useState('')
  const [role, setRole] = useState('TA')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  if (!isOpen) return null

  // processes the addition of a new teaching assistant by directory id or email
  async function handleAdd(event) {
    event.preventDefault()
    if (!identifier.trim()) return
    setError('')
    setSubmitting(true)
    try {
      await onAddTA?.(identifier.trim(), role)
      setIdentifier('')
    } catch (err) {
      setError(err.message || 'unable to add teaching assistant')
    } finally {
      setSubmitting(false)
    }
  }

  // confirms and removes a teaching assistant from the active course roster
  async function handleRemove(graderId, name) {
    const message = `remove ${name || 'this staff member'}? their access will be revoked, but completed grading decisions and audit history are permanently preserved.`
    if (window.confirm(message)) {
      try {
        await onRemoveTA?.(graderId)
      } catch (err) {
        setError(err.message || 'unable to remove staff member')
      }
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.45)',
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
          width: '100%',
          maxWidth: '540px',
          padding: '24px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#202c30', margin: 0 }}>
              Manage Course TAs
            </h2>
            <p style={{ fontSize: '13px', color: '#6b7280', margin: '4px 0 0' }}>
              Assign and oversee teaching assistants for this course.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}
          >
            <X size={18} color="#6b7280" />
          </button>
        </div>

        {error && (
          <div
            style={{
              padding: '10px 14px',
              background: '#fef2f2',
              color: '#991b1b',
              fontSize: '13px',
              borderRadius: '6px',
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleAdd} style={{ display: 'flex', gap: '8px' }}>
          <input
            type="text"
            placeholder="Directory ID or university email"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: '6px',
              border: '1px solid #dfe5e5',
              fontSize: '13px',
            }}
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            style={{
              padding: '8px 12px',
              borderRadius: '6px',
              border: '1px solid #dfe5e5',
              fontSize: '13px',
              background: '#ffffff',
            }}
          >
            <option value="TA">TA</option>
            <option value="Head TA">Head TA</option>
          </select>
          <Button size="sm" type="submit" disabled={submitting || !identifier.trim()}>
            <UserPlus size={14} />
            Add
          </Button>
        </form>

        <div style={{ maxHeight: '240px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {tas.length === 0 ? (
            <p style={{ fontSize: '13px', color: '#6b7280', textAlign: 'center', padding: '16px' }}>
              No teaching assistants added yet.
            </p>
          ) : (
            tas.map((ta) => (
              <div
                key={ta.id || ta.email}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 12px',
                  background: '#f9fafb',
                  borderRadius: '8px',
                  border: '1px solid #f3f4f6',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Avatar initials={ta.initials || 'TA'} />
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#202c30' }}>
                      {ta.name}
                    </div>
                    <div style={{ fontSize: '11px', color: '#6b7280' }}>
                      {ta.email} · {ta.questions ? `Assigned: ${ta.questions}` : 'No active questions'}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemove(ta.id, ta.name)}
                  aria-label={`Remove ${ta.name}`}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#dc2626',
                    cursor: 'pointer',
                    padding: '6px',
                  }}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))
          )}
        </div>

        <div
          style={{
            padding: '12px',
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '6px',
            fontSize: '12px',
            color: '#64748b',
          }}
        >
          Removing a TA revokes course access and releases unfinished work, while preserving completed grading decisions and audit records.
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button variant="secondary" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </div>
  )
}
