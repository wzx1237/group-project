'use client'

import { useRef, useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import { PageThumbnail } from './PageThumbnail'
import { PdfToolbar } from './pdfToolbar'
import styles from './pdfCanvasViewer.module.css'

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

// Figma shows the page 650px wide at 100%.
const PAGE_WIDTH = 650
const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2]

export function PdfCanvasViewer({ url, filename }) {
  const viewerRef = useRef(null)
  const stageRef = useRef(null)
  const pageRefs = useRef([])
  const [loaded, setLoaded] = useState({ url: null, pageCount: 0 })
  const [page, setPage] = useState(1)
  const [zoomIndex, setZoomIndex] = useState(ZOOMS.indexOf(1))

  const pageCount = loaded.url === url ? loaded.pageCount : 0
  const pages = Array.from({ length: pageCount }, (_, i) => i + 1)

  function handleLoad({ numPages }) {
    setLoaded({ url, pageCount: numPages })
    setPage(1)
  }

  // The current page is the last one whose top is in the upper third of the view.
  function handleScroll() {
    const stage = stageRef.current
    const atBottom = stage.scrollTop + stage.clientHeight >= stage.scrollHeight - 1
    const line = stage.scrollTop + stage.clientHeight / 3
    const index = pageRefs.current.findLastIndex((el) => el && el.offsetTop <= line)
    setPage(atBottom ? pageCount : Math.max(1, index + 1))
  }

  function toggleFullScreen() {
    if (document.fullscreenElement) document.exitFullscreen()
    else viewerRef.current.requestFullscreen?.()
  }

  return (
    <div ref={viewerRef} className={styles.viewer}>
      <PdfToolbar
        filename={filename}
        url={url}
        pageCount={pageCount}
        zoom={ZOOMS[zoomIndex]}
        onZoomOut={zoomIndex > 0 ? () => setZoomIndex(zoomIndex - 1) : undefined}
        onZoomIn={zoomIndex < ZOOMS.length - 1 ? () => setZoomIndex(zoomIndex + 1) : undefined}
        onFullScreen={toggleFullScreen}
      />
      {/* A new Document per file: reusing one while its pages still load crashes PDF.js. */}
      <Document
        key={url}
        className={styles.canvas}
        file={url}
        onLoadSuccess={handleLoad}
        loading={<p className={styles.message}>Loading exam…</p>}
        error={<p className={styles.message}>This exam&apos;s PDF couldn&apos;t be loaded.</p>}
      >
        <ol className={styles.thumbnails} aria-label="Pages">
          {pages.map((n) => (
            <PageThumbnail key={n} pageNumber={n} active={n === page} onSelect={() => pageRefs.current[n - 1]?.scrollIntoView()} />
          ))}
        </ol>
        <div ref={stageRef} className={styles.stage} onScroll={handleScroll}>
          {pages.map((n) => (
            <div
              key={n}
              ref={(el) => {
                pageRefs.current[n - 1] = el
              }}
              className={styles.page}
            >
              <Page
                pageNumber={n}
                width={PAGE_WIDTH * ZOOMS[zoomIndex]}
                renderTextLayer={false}
                renderAnnotationLayer={false}
              />
            </div>
          ))}
        </div>
      </Document>
      <div className={styles.status}>{pageCount > 0 && `Page ${page} / ${pageCount}`}</div>
    </div>
  )
}
