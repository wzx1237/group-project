'use client'

import { useEffect, useState } from 'react'

function shouldFetchUrl(url) {
  return typeof url === 'string' && !/^(blob:|data:)/i.test(url)
}

// Fetches HTTP PDF URLs into a Blob using a guarded AbortController so cancelling mid-stream
// (when switching students or leaving the grading workspace) never triggers PDF.js's
// PDFFetchStreamRangeReader.cancel unhandled AbortError.
export function usePdfFile(url) {
  const [state, setState] = useState({ url: null, file: null, error: false })
  const needsFetch = shouldFetchUrl(url)

  useEffect(() => {
    if (!url || !needsFetch) return undefined

    const controller = new AbortController()
    let active = true

    async function load() {
      try {
        const response = await fetch(url, { credentials: 'include', signal: controller.signal })
        if (!response.ok) {
          throw new Error(`Failed to fetch PDF (${response.status})`)
        }
        const blob = await response.blob()
        if (active && !controller.signal.aborted) {
          setState({ url, file: blob, error: false })
        }
      } catch (err) {
        if (!active || controller.signal.aborted || err?.name === 'AbortError') {
          return
        }
        setState({ url, file: null, error: true })
      }
    }

    load()

    return () => {
      active = false
      controller.abort()
    }
  }, [url, needsFetch])

  if (!url) return { file: null, loading: false, error: false }
  if (!needsFetch) return { file: url, loading: false, error: false }

  const ready = state.url === url
  return {
    file: ready ? state.file : null,
    loading: !ready,
    error: ready && state.error,
  }
}
