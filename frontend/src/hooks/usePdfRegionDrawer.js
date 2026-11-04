/**
 * Manages mouse/pointer coordinate normalization, bounding box drawing, and zoom scaling on PDF pages.
 * @param {{ pageWidth: number, pageHeight: number, zoomLevel: number }} canvasMetrics
 * @returns {{
 *   draftRect: { x: number, y: number, width: number, height: number } | null,
 *   handlePointerDown: (e: React.PointerEvent) => void,
 *   handlePointerMove: (e: React.PointerEvent) => void,
 *   handlePointerUp: () => { x: number, y: number, width: number, height: number } | null,
 *   scaleRegionToViewport: (normalizedRegion: Object) => Object
 * }}
 */
export function usePdfRegionDrawer(canvasMetrics) {}