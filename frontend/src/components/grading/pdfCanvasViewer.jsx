'use client'

import { useEffect, useRef, useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import { parentQid, partsOf } from '@/lib/rubric'
import { PageThumbnail } from './PageThumbnail'
import { PdfToolbar } from './pdfToolbar'
import styles from './pdfCanvasViewer.module.css'

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

// Figma shows the page 650px wide at 100%.
const PAGE_WIDTH = 650
const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2]

const sameRegion = (a, b) => JSON.stringify(a) === JSON.stringify(b)

// Subquestions start with their question's region, so a shared region is outlined once, as the question; a part is
// outlined on its own only once its region differs, and then the question isn't.
function outlined(questions, question) {
  const parent = parentQid(question.qid)
  if (parent) return !sameRegion(question.region, questions.find((q) => q.qid === parent)?.region)
  return !partsOf(questions, question.qid).some((part) => part.region && !sameRegion(part.region, question.region))
}

// The questions that count as `focusQid`: the question, its subquestions and, for a subquestion, its question.
function focusSet(questions, focusQid) {
  if (!focusQid) return new Set()
  return new Set([focusQid, parentQid(focusQid), ...partsOf(questions, focusQid).map((q) => q.qid)].filter(Boolean))
}

// Where the focused question's answer is: its own region, or else its first subquestion's.
function focusRegion(questions, focusQid) {
  const question = questions.find((q) => q.qid === focusQid)
  return question?.region ?? partsOf(questions, focusQid).find((q) => q.region)?.region ?? null
}

// `questions` with a region ({ page, x, y, width, height } as fractions of the page) are outlined on that page when
// `showRegions` is enabled. `focusQid` (the grading filter's question) is outlined more strongly, and each exam opens
// scrolled to it.
export function PdfCanvasViewer({
  url,
  filename,
  questions = [],
  focusQid = null,
  showRegions: controlledShowRegions,
  onToggleRegions,
}) {
  const viewerRef = useRef(null)
  const stageRef = useRef(null)
  const pageRefs = useRef([])
  const [loaded, setLoaded] = useState({ url: null, pageCount: 0 })
  const [page, setPage] = useState(1)
  const [zoomIndex, setZoomIndex] = useState(ZOOMS.indexOf(1))
  const [uncontrolledShowRegions, setUncontrolledShowRegions] = useState(true)

  const pageCount = loaded.url === url ? loaded.pageCount : 0
  const pages = Array.from({ length: pageCount }, (_, i) => i + 1)
  const focused = focusSet(questions, focusQid)
  const target = focusRegion(questions, focusQid)
  const showRegions = controlledShowRegions ?? uncontrolledShowRegions
  const handleToggleRegions = onToggleRegions ?? (() => setUncontrolledShowRegions((shown) => !shown))
  const hasRegions = questions.some((q) => Boolean(q.region?.page) && outlined(questions, q))

  // Pages take their height only once drawn, so the scroll waits until every page up to the target is drawn.
  const rendered = useRef(new Set())
  const scrolledTo = useRef(null)

  function scrollToFocus() {
    if (!target || pageCount < target.page) return
    for (let n = 1; n <= target.page; n++) if (!rendered.current.has(n)) return
    const key = `${url}|${focusQid}`
    if (scrolledTo.current === key) return
    scrolledTo.current = key
    const el = pageRefs.current[target.page - 1]
    // A little above the region, so its tag shows.
    stageRef.current.scrollTop = Math.max(0, el.offsetTop + target.y * el.offsetHeight - 40)
  }

  // A new question on the same exam scrolls straight away; a new exam scrolls once its pages are drawn.
  useEffect(scrollToFocus)

  function handleLoad({ numPages }) {
    rendered.current = new Set()
    setLoaded({ url, pageCount: numPages })
    setPage(1)
  }

  function handleRendered(n) {
    rendered.current.add(n)
    scrollToFocus()
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
        hasRegions={hasRegions}
        showRegions={showRegions}
        onToggleRegions={handleToggleRegions}
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
                onRenderSuccess={() => handleRendered(n)}
              />
              {showRegions &&
                questions
                  .filter((q) => q.region?.page === n && outlined(questions, q))
                  .map(({ qid, title, region }) => (
                    <div
                      key={qid}
                      className={[styles.region, focused.has(qid) && styles.focusedRegion].filter(Boolean).join(' ')}
                      style={{
                        left: `${region.x * 100}%`,
                        top: `${region.y * 100}%`,
                        width: `${region.width * 100}%`,
                        height: `${region.height * 100}%`,
                      }}
                    >
                      <span className={styles.regionTag}>{title ? `${qid} · ${title}` : qid}</span>
                    </div>
                  ))}
            </div>
          ))}
        </div>
      </Document>
      <div className={styles.status}>{pageCount > 0 && `Page ${page} / ${pageCount}`}</div>
    </div>
  )
}
