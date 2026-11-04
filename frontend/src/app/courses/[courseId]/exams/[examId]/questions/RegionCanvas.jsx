'use client'

import { useEffect, useRef, useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import { Button } from '@/components/ui/Button'
import styles from './questions.module.css'

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

export function RegionCanvas({ questions, activeQid, onSaveRegion, currentPage, onChangePage }) {
  const containerRef = useRef(null)
  const [drag, setDrag] = useState(null)
  const [file, setFile] = useState(null)
  const [fileUrl, setFileUrl] = useState(null)
  const [numPages, setNumPages] = useState(0)

  useEffect(() => {
    if (!file) return
    const url = URL.createObjectURL(file)
    setFileUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  function handlePickFile(e) {
    const picked = e.target.files?.[0]
    if (picked) {
      setFile(picked)
      setNumPages(0)
      onChangePage(1)
    }
  }

  const pageRegions = questions
    .map((q, i) => ({ ...q, n: i + 1 }))
    .filter((q) => q.region && q.region.page === currentPage)

  function handleDown(e) {
    if (!activeQid) return
    const rect = containerRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    setDrag({ startX: x, startY: y, curX: x, curY: y })
  }

  function handleMove(e) {
    if (!drag) return
    const rect = containerRef.current.getBoundingClientRect()
    setDrag((d) => ({ ...d, curX: e.clientX - rect.left, curY: e.clientY - rect.top }))
  }

  function handleUp() {
    if (!drag) return
    const rect = containerRef.current.getBoundingClientRect()
    const left = Math.min(drag.startX, drag.curX)
    const top = Math.min(drag.startY, drag.curY)
    const width = Math.abs(drag.curX - drag.startX)
    const height = Math.abs(drag.curY - drag.startY)
    setDrag(null)
    if (width < 10 || height < 10) return
    onSaveRegion(activeQid, {
      page: currentPage,
      x: (left / rect.width) * 100,
      y: (top / rect.height) * 100,
      width: (width / rect.width) * 100,
      height: (height / rect.height) * 100,
    })
  }

  return (
    <section className={styles.editor}>
      <div className="row-meta">
        <span>{file ? `${file.name} · ${numPages || '…'} pages` : 'No PDF selected'}</span>
        <input id="blank-exam-pdf" type="file" accept="application/pdf" onChange={handlePickFile} hidden />
        <Button variant="secondary" size="sm" onClick={() => document.getElementById('blank-exam-pdf').click()}>
          Upload blank exam
        </Button>
      </div>

      {!file ? (
        <p className="empty">Upload the blank exam PDF to start drawing question regions.</p>
      ) : (
        <div className={styles.canvasRow}>
          <div className={styles.thumbs}>
            {Array.from({ length: numPages }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                type="button"
                className={`${styles.thumb} ${p === currentPage ? styles.thumbActive : ''}`}
                onClick={() => onChangePage(p)}
              >
                {p}
              </button>
            ))}
          </div>

          <div className={styles.pageWrap}>
            <div
              ref={containerRef}
              className={`${styles.pageInner} ${activeQid ? styles.drawing : ''}`}
              onMouseDown={handleDown}
              onMouseMove={handleMove}
              onMouseUp={handleUp}
            >
              <Document file={fileUrl} onLoadSuccess={({ numPages: n }) => setNumPages(n)} loading={<p className="empty">Rendering…</p>}>
                <Page pageNumber={currentPage} width={560} renderTextLayer={false} renderAnnotationLayer={false} />
              </Document>

              {pageRegions.map((r) => (
                <div
                  key={r.qid}
                  className={styles.region}
                  style={{ left: `${r.region.x}%`, top: `${r.region.y}%`, width: `${r.region.width}%`, height: `${r.region.height}%` }}
                >
                  <span className={styles.regionTag}>
                    Q{r.n}
                    {r.title ? ` · ${r.title}` : ''}
                  </span>
                </div>
              ))}

              {drag && (
                <div
                  className={styles.dragBox}
                  style={{
                    left: Math.min(drag.startX, drag.curX),
                    top: Math.min(drag.startY, drag.curY),
                    width: Math.abs(drag.curX - drag.startX),
                    height: Math.abs(drag.curY - drag.startY),
                  }}
                />
              )}
            </div>
          </div>
        </div>
      )}

    </section>
  )
}
