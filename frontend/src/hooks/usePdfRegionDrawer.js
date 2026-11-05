import { useCallback, useRef, useState } from 'react'

// clamps a number between minimum and maximum bounds
function clamp(val, min = 0, max = 1) {
  return Math.min(Math.max(val, min), max)
}

// manages pointer coordinate normalization and bounding box drawing on pdf canvases
export function usePdfRegionDrawer(canvasMetrics = { pageWidth: 800, pageHeight: 1100, zoomLevel: 1.0 }) {
  const [draftRect, setDraftRect] = useState(null)
  const isDraggingRef = useRef(false)
  const startPointRef = useRef({ x: 0, y: 0 })

  // captures the initial click or touch coordinates when starting a bounding box drag
  const handlePointerDown = useCallback((event) => {
    const target = event.currentTarget
    const rect = target.getBoundingClientRect()
    const x = clamp((event.clientX - rect.left) / rect.width)
    const y = clamp((event.clientY - rect.top) / rect.height)

    isDraggingRef.current = true
    startPointRef.current = { x, y }
    setDraftRect({ x, y, width: 0, height: 0 })
    target.setPointerCapture?.(event.pointerId)
  }, [])

  // updates the visual draft rectangle as the user drags across the canvas
  const handlePointerMove = useCallback((event) => {
    if (!isDraggingRef.current) return
    const target = event.currentTarget
    const rect = target.getBoundingClientRect()
    const currentX = clamp((event.clientX - rect.left) / rect.width)
    const currentY = clamp((event.clientY - rect.top) / rect.height)

    const startX = startPointRef.current.x
    const startY = startPointRef.current.y

    const x = Math.min(startX, currentX)
    const y = Math.min(startY, currentY)
    const width = Math.abs(currentX - startX)
    const height = Math.abs(currentY - startY)

    setDraftRect({ x, y, width, height })
  }, [])

  // finalizes and returns the normalized bounding box when pointer release occurs
  const handlePointerUp = useCallback((event) => {
    if (!isDraggingRef.current) return null
    isDraggingRef.current = false

    if (event?.currentTarget?.releasePointerCapture && event.pointerId) {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId)
      } catch {}
    }

    const finalRect = draftRect
    setDraftRect(null)

    if (!finalRect || finalRect.width < 0.01 || finalRect.height < 0.01) {
      return null
    }

    return finalRect
  }, [draftRect])

  // converts normalized percentage coordinates to pixel coordinates for on screen rendering
  const scaleRegionToViewport = useCallback(
    (normalizedRegion, containerWidth, containerHeight) => {
      if (!normalizedRegion) return null
      const width = containerWidth || canvasMetrics.pageWidth * canvasMetrics.zoomLevel
      const height = containerHeight || canvasMetrics.pageHeight * canvasMetrics.zoomLevel

      return {
        left: normalizedRegion.x * width,
        top: normalizedRegion.y * height,
        width: normalizedRegion.width * width,
        height: normalizedRegion.height * height,
      }
    },
    [canvasMetrics.pageWidth, canvasMetrics.pageHeight, canvasMetrics.zoomLevel]
  )

  return {
    draftRect,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    scaleRegionToViewport,
  }
}
