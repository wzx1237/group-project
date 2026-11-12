'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import styles from './regionCrop.module.css'

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

// Room shown around the answer, and the narrowest slice of the page shown, as fractions of the page.
const MARGIN = 0.03
const MIN_WIDTH = 1 / 3

// The part of a scanned page that holds one answer, scaled to the width it is shown at.
export function RegionCrop({ url, region, tag }) {
  const frame = useRef(null)
  const [width, setWidth] = useState(0)
  const [ratio, setRatio] = useState(null) // page height / page width

  useLayoutEffect(() => {
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(frame.current)
    return () => observer.disconnect()
  }, [])

  // A very narrow region is widened around its middle, so the page is never drawn huge.
  const middle = region.x + region.width / 2
  const half = Math.max(region.width / 2 + MARGIN, MIN_WIDTH / 2)
  const left = Math.max(0, Math.min(middle - half, 1 - 2 * half))
  const right = Math.min(1, left + 2 * half)
  const top = Math.max(0, region.y - MARGIN)
  const bottom = Math.min(1, region.y + region.height + MARGIN)

  const pageWidth = width / (right - left)
  const pageHeight = ratio ? pageWidth * ratio : 0
  const percent = (value) => `${value * 100}%`

  return (
    <div ref={frame} className={styles.crop} style={{ height: ratio ? (bottom - top) * pageHeight : 240 }}>
      {width > 0 && (
        <Document
          file={url}
          loading={<p className={styles.message}>Loading answer…</p>}
          error={<p className={styles.message}>This exam&apos;s PDF couldn&apos;t be loaded.</p>}
        >
          <div className={styles.page} style={{ left: -left * pageWidth, top: -top * pageHeight }}>
            <Page
              pageNumber={region.page}
              width={pageWidth}
              renderTextLayer={false}
              renderAnnotationLayer={false}
              onLoadSuccess={(page) => setRatio(page.originalHeight / page.originalWidth)}
            />
          </div>
          {ratio && (
            <div
              className={styles.region}
              style={{
                left: percent((region.x - left) / (right - left)),
                top: percent((region.y - top) / (bottom - top)),
                width: percent(region.width / (right - left)),
                height: percent(region.height / (bottom - top)),
              }}
            >
              <span className={styles.tag}>{tag}</span>
            </div>
          )}
        </Document>
      )}
    </div>
  )
}
