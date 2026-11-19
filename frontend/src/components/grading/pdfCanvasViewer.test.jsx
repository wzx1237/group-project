// @vitest-environment jsdom
import { useEffect, useRef } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PdfCanvasViewer } from './pdfCanvasViewer'

const documentFiles = []

vi.mock('react-pdf', () => ({
  pdfjs: { version: '4.4.168', GlobalWorkerOptions: { workerSrc: '' } },
  Document: ({ file, onLoadSuccess, children }) => {
    documentFiles.push(file)
    const loadRef = useRef(onLoadSuccess)
    loadRef.current = onLoadSuccess
    useEffect(() => {
      loadRef.current?.({ numPages: 2 })
    }, [file])
    return <div data-testid="pdf-document">{children}</div>
  },
  Page: ({ pageNumber, onRenderSuccess }) => {
    const renderRef = useRef(onRenderSuccess)
    renderRef.current = onRenderSuccess
    useEffect(() => {
      renderRef.current?.()
    }, [pageNumber])
    return <div data-testid={`pdf-page-${pageNumber}`} />
  },
}))

beforeEach(() => {
  documentFiles.length = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        blob: () => Promise.resolve(new Blob(['%PDF-1.4'], { type: 'application/pdf' })),
      }),
    ),
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const QUESTIONS = [
  { qid: 'Q1', title: 'Truth Table', region: { page: 1, x: 0.1, y: 0.2, width: 0.8, height: 0.25 } },
  { qid: 'Q2', title: 'MCQ 1', region: { page: 1, x: 0.1, y: 0.5, width: 0.8, height: 0.15 } },
  { qid: 'Q3', title: 'Proof', region: { page: 2, x: 0.1, y: 0.1, width: 0.8, height: 0.4 } },
]

describe('PdfCanvasViewer region toggle', () => {
  it('shows question regions by default and toggles them off and on', async () => {
    render(<PdfCanvasViewer url="/api/exam-1.pdf" filename="exam-1.pdf" questions={QUESTIONS} />)

    expect(await screen.findByText('Q1 · Truth Table')).toBeTruthy()
    const toggle = screen.getByRole('button', { name: 'Regions' })
    expect(toggle.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('Q2 · MCQ 1')).toBeTruthy()
    expect(screen.getByText('Q3 · Proof')).toBeTruthy()

    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
    expect(screen.queryByText('Q1 · Truth Table')).toBeNull()
    expect(screen.queryByText('Q2 · MCQ 1')).toBeNull()
    expect(screen.queryByText('Q3 · Proof')).toBeNull()

    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('Q1 · Truth Table')).toBeTruthy()
    expect(screen.getByText('Q3 · Proof')).toBeTruthy()
  })

  it('hides the regions toggle when no questions have regions', async () => {
    const noRegions = [{ qid: 'Q1', title: 'Truth Table', region: null }]
    render(<PdfCanvasViewer url="/api/exam-1.pdf" filename="exam-1.pdf" questions={noRegions} />)

    await screen.findByTestId('pdf-document')
    expect(screen.queryByRole('button', { name: 'Regions' })).toBeNull()
  })

  it('supports controlled showRegions state across student submissions', async () => {
    const onToggleRegions = vi.fn()
    const { rerender } = render(
      <PdfCanvasViewer
        url="/api/student-1.pdf"
        filename="student-1.pdf"
        questions={QUESTIONS}
        showRegions={false}
        onToggleRegions={onToggleRegions}
      />,
    )

    await screen.findByTestId('pdf-document')
    const toggle = screen.getByRole('button', { name: 'Regions' })
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
    expect(screen.queryByText('Q1 · Truth Table')).toBeNull()

    fireEvent.click(toggle)
    expect(onToggleRegions).toHaveBeenCalledTimes(1)

    rerender(
      <PdfCanvasViewer
        url="/api/student-2.pdf"
        filename="student-2.pdf"
        questions={QUESTIONS}
        showRegions={false}
        onToggleRegions={onToggleRegions}
      />,
    )
    await screen.findByTestId('pdf-document')
    expect(screen.queryByText('Q1 · Truth Table')).toBeNull()
  })

  it('toggles subquestion regions along with parent regions', async () => {
    const withSubquestions = [
      { qid: 'Q1', title: 'Parent', region: { page: 1, x: 0.1, y: 0.1, width: 0.8, height: 0.4 } },
      { qid: 'Q1.1', title: 'Part A', region: { page: 1, x: 0.1, y: 0.1, width: 0.8, height: 0.2 } },
      { qid: 'Q1.2', title: 'Part B', region: { page: 1, x: 0.1, y: 0.3, width: 0.8, height: 0.2 } },
    ]
    render(<PdfCanvasViewer url="/api/exam-1.pdf" filename="exam-1.pdf" questions={withSubquestions} />)

    expect(await screen.findByText('Q1.1 · Part A')).toBeTruthy()
    expect(screen.queryByText('Q1 · Parent')).toBeNull()
    expect(screen.getByText('Q1.2 · Part B')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Regions' }))
    expect(screen.queryByText('Q1.1 · Part A')).toBeNull()
    expect(screen.queryByText('Q1.2 · Part B')).toBeNull()
  })

  it('still scrolls to the focused question region when regions are hidden', async () => {
    const { rerender } = render(
      <PdfCanvasViewer url="/api/exam-1.pdf" filename="exam-1.pdf" questions={QUESTIONS} focusQid={null} showRegions={false} />,
    )

    const page2Matches = await screen.findAllByTestId('pdf-page-2')
    const page2 = page2Matches[page2Matches.length - 1].parentElement
    const stage = page2.parentElement
    Object.defineProperty(page2, 'offsetTop', { value: 1000, configurable: true })
    Object.defineProperty(page2, 'offsetHeight', { value: 800, configurable: true })

    rerender(
      <PdfCanvasViewer url="/api/exam-1.pdf" filename="exam-1.pdf" questions={QUESTIONS} focusQid="Q3" showRegions={false} />,
    )

    expect(screen.queryByText('Q3 · Proof')).toBeNull()
    await waitFor(() => {
      expect(stage.scrollTop).toBe(1040)
    })
  })
})

describe('PdfCanvasViewer PDF pre-fetching and abort safety', () => {
  it('passes the fetched Blob to Document instead of the raw HTTP URL', async () => {
    render(<PdfCanvasViewer url="/api/student-1.pdf" filename="student-1.pdf" questions={QUESTIONS} />)

    await screen.findByTestId('pdf-document')
    expect(fetch).toHaveBeenCalledWith('/api/student-1.pdf', expect.objectContaining({ credentials: 'include' }))
    expect(documentFiles.at(-1)).toBeInstanceOf(Blob)
  })

  it('aborts pending requests cleanly when switching students or unmounting', async () => {
    const signals = []
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (url, { signal }) =>
          new Promise((resolve, reject) => {
            signals.push(signal)
            signal.addEventListener('abort', () => {
              reject(new DOMException('signal is aborted without reason', 'AbortError'))
            })
            if (url === '/api/student-2.pdf') {
              resolve({
                ok: true,
                blob: () => Promise.resolve(new Blob(['%PDF-2'], { type: 'application/pdf' })),
              })
            }
          }),
      ),
    )

    const { rerender, unmount } = render(
      <PdfCanvasViewer url="/api/student-1.pdf" filename="student-1.pdf" questions={QUESTIONS} />,
    )
    expect(signals[0].aborted).toBe(false)

    rerender(<PdfCanvasViewer url="/api/student-2.pdf" filename="student-2.pdf" questions={QUESTIONS} />)
    expect(signals[0].aborted).toBe(true)
    expect(await screen.findByText('Q1 · Truth Table')).toBeTruthy()
    expect(screen.queryByText("This exam's PDF couldn't be loaded.")).toBeNull()

    rerender(<PdfCanvasViewer url="/api/student-3.pdf" filename="student-3.pdf" questions={QUESTIONS} />)
    expect(signals[2].aborted).toBe(false)
    unmount()
    expect(signals[2].aborted).toBe(true)
  })

  it('shows the PDF load error message on non-abort fetch failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: false, status: 500 })),
    )

    render(<PdfCanvasViewer url="/api/broken.pdf" filename="broken.pdf" questions={QUESTIONS} />)
    expect(await screen.findByText("This exam's PDF couldn't be loaded.")).toBeTruthy()
  })
})
