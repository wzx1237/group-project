import { FileText, Maximize, Minus, Plus } from 'lucide-react'
import { icon } from './icon'
import styles from './pdfCanvasViewer.module.css'

export function PdfToolbar({ filename, url, pageCount, zoom, onZoomOut, onZoomIn, onFullScreen }) {
  return (
    <div className={styles.toolbar}>
      <div className={styles.file}>
        <FileText {...icon} size={16} />
        <a className={styles.filename} href={url} target="_blank" rel="noreferrer">
          {filename}
        </a>
        {pageCount > 0 && <span className={styles.pageCount}>{pageCount === 1 ? '1 page' : `${pageCount} pages`}</span>}
      </div>
      <div className={styles.controls}>
        <button type="button" className={styles.control} onClick={onZoomOut} disabled={!onZoomOut} aria-label="Zoom out">
          <Minus {...icon} size={16} />
        </button>
        <span className={styles.zoom}>{Math.round(zoom * 100)}%</span>
        <button type="button" className={styles.control} onClick={onZoomIn} disabled={!onZoomIn} aria-label="Zoom in">
          <Plus {...icon} size={16} />
        </button>
        <button type="button" className={styles.control} onClick={onFullScreen} aria-label="Full screen">
          <Maximize {...icon} size={16} />
        </button>
      </div>
    </div>
  )
}
