import { Page } from 'react-pdf'
import styles from './pdfCanvasViewer.module.css'

export function PageThumbnail({ pageNumber, active, onSelect }) {
  return (
    <li>
      <button
        type="button"
        className={[styles.thumbnail, active && styles.activeThumbnail].filter(Boolean).join(' ')}
        onClick={onSelect}
        aria-label={`Page ${pageNumber}`}
        aria-current={active ? 'page' : undefined}
      >
        <Page
          className={styles.miniature}
          pageNumber={pageNumber}
          width={58}
          renderTextLayer={false}
          renderAnnotationLayer={false}
        />
        {pageNumber}
      </button>
    </li>
  )
}
