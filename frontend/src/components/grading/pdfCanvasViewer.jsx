/**
 * Left pane digitized exam PDF viewer (Figure 8).
 * Automatically scrolls to and highlights the green answer region box linked to the currently selected question.
 * @param {Object} props
 * @param {string} props.pdfUrl - Authenticated backend stream URL for the student's scanned PDF
 * @param {number} props.currentPage - Active 1-indexed page number
 * @param {number} props.zoomLevel - Current zoom multiplier (e.g., 1.0 for 100%)
 * @param {Object|null} props.highlightedRegion - Coordinates `{ qid, label, pageIndex, x, y, width, height }` for the active question
 * @param {boolean} props.isDrawingRegion - Whether the user is redrawing/linking an answer region
 * @param {(qid: string, pageIndex: number, rect: Object) => Promise<void>} props.onRegionDrawn - Saves updated question region
 * @param {(page: number) => void} props.onPageChange
 * @param {(zoom: number) => void} props.onZoomChange
 */
export function PdfCanvasViewer({
  pdfUrl,
  currentPage,
  zoomLevel,
  highlightedRegion,
  isDrawingRegion,
  onRegionDrawn,
  onPageChange,
  onZoomChange,
}) {}
