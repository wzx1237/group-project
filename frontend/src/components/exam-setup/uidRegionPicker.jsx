'use client'

import { useEffect, useRef, useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import { previewCoverLayout } from '@/services/examsSetupService'

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

const MODES = [
  { value: 'uid_box', label: 'UID box', hint: 'Drag a rectangle around the nine UID boxes on page 1.' },
  { value: 'full_page', label: 'Cover sheet', hint: 'Page 1 is a cover sheet; the nine boxes are found anywhere on it.' },
]
const MIN_DRAG = 0.01 // smallest dragged side, as a fraction of the page

const toPercent = (rect) => ({
  left: `${rect[0] * 100}%`,
  top: `${rect[1] * 100}%`,
  width: `${(rect[2] - rect[0]) * 100}%`,
  height: `${(rect[3] - rect[1]) * 100}%`,
})

// Shows page 1 of the blank exam so the instructor can say where the UID boxes are, and checks it with the server.
// The server snaps a dragged rectangle to the actual nine-box grid; that snapped rectangle is drawn in green.
// onChange gets { mode, rect } once the server has found the grid, and null whenever the layout isn't valid (yet).
// Remount it (key) for a different file: its state belongs to one PDF.
export function UidRegionPicker({ file, initial = null, onChange }) {
  const pageRef = useRef(null)
  const latest = useRef(0) // numbers the checks, so a slow answer for an old layout is ignored
  const [mode, setMode] = useState(initial?.mode || 'uid_box')
  const [drawn, setDrawn] = useState(initial?.rect || null)
  const [drag, setDrag] = useState(null)
  const [result, setResult] = useState(initial ? { status: 'checking' } : null)

  // asks the server about a layout and reports the answer
  function run(nextMode, rect) {
    const id = ++latest.current
    const fail = (message) => {
      setResult({ status: 'error', errors: [message] })
      onChange(null)
    }
    previewCoverLayout(file, { mode: nextMode, rect: nextMode === 'uid_box' ? rect : null })
      .then((answer) => {
        if (id !== latest.current) return
        if (answer.errors.length) {
          setResult({ status: 'error', errors: answer.errors })
          onChange(null)
        } else {
          setResult({ status: 'ok', rect: answer.rect })
          onChange({ mode: nextMode, rect: nextMode === 'uid_box' ? answer.rect : null })
        }
      })
      .catch((error) => id === latest.current && fail(error.message))
  }

  // a layout changed by the instructor: not valid until the server has answered
  function check(nextMode, rect) {
    latest.current++
    onChange(null)
    if (nextMode === 'uid_box' && !rect) return setResult(null)
    setResult({ status: 'checking' })
    run(nextMode, rect)
  }

  // a layout that came with the file (back from a later step) is checked again once, when the picker first shows
  useEffect(() => {
    if (initial) run(initial.mode, initial.rect)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function chooseMode(next) {
    setMode(next)
    if (next === 'full_page') setDrawn(null)
    check(next, next === 'uid_box' ? drawn : null)
  }

  const point = (event) => {
    const box = pageRef.current.getBoundingClientRect()
    return [
      Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)),
      Math.min(1, Math.max(0, (event.clientY - box.top) / box.height)),
    ]
  }

  function handleDown(event) {
    if (mode !== 'uid_box') return
    event.currentTarget.setPointerCapture(event.pointerId)
    const [x, y] = point(event)
    setDrag({ x0: x, y0: y, x1: x, y1: y })
  }

  function handleMove(event) {
    if (!drag) return
    const [x, y] = point(event)
    setDrag((d) => ({ ...d, x1: x, y1: y }))
  }

  function handleUp() {
    if (!drag) return
    const rect = [Math.min(drag.x0, drag.x1), Math.min(drag.y0, drag.y1), Math.max(drag.x0, drag.x1), Math.max(drag.y0, drag.y1)]
    setDrag(null)
    if (rect[2] - rect[0] < MIN_DRAG || rect[3] - rect[1] < MIN_DRAG / 2) return
    setDrawn(rect)
    check('uid_box', rect)
  }

  const shown = drag ? [Math.min(drag.x0, drag.x1), Math.min(drag.y0, drag.y1), Math.max(drag.x0, drag.x1), Math.max(drag.y0, drag.y1)] : drawn
  const status = result?.status

  return (
    <fieldset style={{ border: '1px solid #dfe5e5', borderRadius: '10px', padding: '16px', margin: 0, textAlign: 'left' }}>
      <legend style={{ fontSize: '13px', fontWeight: 600, color: '#202c30', padding: '0 6px' }}>Where are the UID boxes?</legend>

      <div role="radiogroup" aria-label="UID box location" style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
        {MODES.map((m) => (
          <label key={m.value} style={{ display: 'flex', gap: '6px', alignItems: 'center', fontSize: '13px', cursor: 'pointer' }}>
            <input type="radio" name="uid-mode" value={m.value} checked={mode === m.value} onChange={() => chooseMode(m.value)} />
            {m.label}
          </label>
        ))}
      </div>
      <p style={{ fontSize: '12px', color: '#6b7280', margin: '6px 0 12px' }}>{MODES.find((m) => m.value === mode).hint}</p>

      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <div
          ref={pageRef}
          onPointerDown={handleDown}
          onPointerMove={handleMove}
          onPointerUp={handleUp}
          onPointerCancel={() => setDrag(null)}
          style={{ position: 'relative', width: 560, cursor: mode === 'uid_box' ? 'crosshair' : 'default', touchAction: 'none', userSelect: 'none', border: '1px solid #dfe5e5' }}
        >
          <Document file={file} loading={<p style={{ padding: 24, fontSize: 13 }}>Rendering…</p>} error={<p style={{ padding: 24, fontSize: 13 }}>Could not show this PDF.</p>}>
            <Page pageNumber={1} width={560} renderTextLayer={false} renderAnnotationLayer={false} />
          </Document>

          {shown && (
            <div
              data-testid="drawn-rect"
              style={{ position: 'absolute', ...toPercent(shown), border: `2px dashed ${status === 'ok' ? '#9ca3af' : '#dc2626'}`, pointerEvents: 'none' }}
            />
          )}
          {status === 'ok' && result.rect && !drag && (
            <div
              data-testid="snapped-rect"
              style={{ position: 'absolute', ...toPercent(result.rect), border: '2px solid #16a34a', background: 'rgba(22,163,74,0.12)', pointerEvents: 'none' }}
            />
          )}
        </div>
      </div>

      <p role="status" style={{ fontSize: '13px', margin: '12px 0 0', color: status === 'error' ? '#991b1b' : status === 'ok' ? '#166534' : '#6b7280' }}>
        {status === 'checking' && 'Checking…'}
        {status === 'ok' && (mode === 'uid_box' ? 'Found the nine boxes. The green outline is where they were snapped to.' : 'Found the nine boxes on the page.')}
        {status === 'error' && result.errors.join(' ')}
        {!status && mode === 'uid_box' && 'Drag a rectangle around the nine boxes to continue.'}
      </p>
    </fieldset>
  )
}
