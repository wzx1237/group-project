// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useGradingSession } from './useGradingSession'
import * as service from '@/services/gradingDecisionService'

const { navigation, params, roster } = vi.hoisted(() => ({ navigation: { replace: vi.fn() }, params: new URLSearchParams({ q: 'Q2', student: '111' }), roster: [{ uid: '111', name: 'Alice Adams', submission: {} }] }))
vi.mock('next/navigation', () => ({ useRouter: () => navigation, usePathname: () => '/grade', useSearchParams: () => params }))
vi.mock('@/exam-distribution/lib/api', () => ({ getAssignmentRoster: vi.fn().mockResolvedValue({ students: roster }) }))
vi.mock('@/services/gradingDecisionService', () => ({
  fetchExamDecisions: vi.fn(), fetchStudentDecisions: vi.fn(), fetchExamComment: vi.fn(), fetchAnswerLocks: vi.fn(),
  fetchGradingQueue: vi.fn(),
  submitGradingDecision: vi.fn(), lockAnswer: vi.fn(), releaseAnswerLocks: vi.fn(), releaseLocksUrl: vi.fn(), saveExamComment: vi.fn(),
}))

const questions = [{ qid: 'Q2', criteria: [{ label_id: '201', deduction: 0, title: 'Correct' }], total_score: 10 }]
const initial = () => ({ Q2: { criteria: ['201'], comment: null, internal_note: null, version: 4 } })

beforeEach(() => {
  vi.clearAllMocks()
  service.fetchGradingQueue.mockResolvedValue([])
  service.fetchExamDecisions.mockResolvedValue({ '111': initial() })
  service.fetchStudentDecisions.mockImplementation(async () => initial())
  service.fetchExamComment.mockResolvedValue(null)
  service.fetchAnswerLocks.mockResolvedValue([])
  service.releaseAnswerLocks.mockResolvedValue(null)
  service.submitGradingDecision.mockImplementation(async (exam, uid, qid, body) => ({ ...body, version: body.version + 1 }))
})
afterEach(cleanup)

async function session() {
  const hook = renderHook(() => useGradingSession('midterm-2', questions, null))
  await waitFor(() => expect(hook.result.current.loaded).toBe(true))
  return hook
}

describe('Submission waits for confirmed server saves', () => {
  it('persists the selected question with its version and current notes', async () => {
    const hook = await session()
    await act(async () => { await hook.result.current.saveNotes('Q2', { comment: 'Good reasoning' }) })
    let ok
    await act(async () => { ok = await hook.result.current.submit('Q2') })
    expect(ok).toBe(true)
    expect(service.submitGradingDecision).toHaveBeenLastCalledWith('midterm-2', '111', 'Q2', expect.objectContaining({ criteria: ['201'], comment: 'Good reasoning', version: 5 }))
  })

  it('waits for an autosave in flight before making its final save', async () => {
    let finish
    service.submitGradingDecision.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    const hook = await session()
    let submission
    act(() => { hook.result.current.saveNotes('Q2', { internal_note: 'Check method' }); submission = hook.result.current.submit('Q2') })
    await waitFor(() => expect(service.submitGradingDecision).toHaveBeenCalledTimes(1))
    expect(hook.result.current.submitting).toBe(true)
    await act(async () => { finish({ ...initial().Q2, internal_note: 'Check method', version: 5 }); await submission })
    expect(service.submitGradingDecision).toHaveBeenCalledTimes(2)
    expect(service.submitGradingDecision.mock.calls[1][3]).toEqual(expect.objectContaining({ version: 5, internal_note: 'Check method' }))
  })

  it('reports a failed final save instead of returning success', async () => {
    const hook = await session()
    service.submitGradingDecision.mockRejectedValueOnce(new Error('Another grader holds this answer'))
    let ok
    await act(async () => { ok = await hook.result.current.submit('Q2') })
    expect(ok).toBe(false)
    expect(hook.result.current.error).toBe('Another grader holds this answer')
    expect(hook.result.current.submitting).toBe(false)
    expect(service.fetchStudentDecisions).toHaveBeenCalledTimes(2)
  })

  it('does not submit after an autosave fails while Submission is waiting', async () => {
    let fail
    service.submitGradingDecision.mockImplementationOnce(() => new Promise((resolve, reject) => { fail = reject }))
    const hook = await session()
    let submission
    act(() => { hook.result.current.saveNotes('Q2', { comment: 'Pending save' }); submission = hook.result.current.submit('Q2') })
    await waitFor(() => expect(service.submitGradingDecision).toHaveBeenCalledTimes(1))
    let ok
    await act(async () => { fail(new Error('This answer changed since you opened it')); ok = await submission })
    expect(ok).toBe(false)
    expect(service.submitGradingDecision).toHaveBeenCalledTimes(1)
    expect(hook.result.current.error).toContain('changed since')
  })

  it('requires an applied criterion before marking an answer finished', async () => {
    service.fetchStudentDecisions.mockResolvedValue({})
    const hook = await session()
    let ok
    await act(async () => { ok = await hook.result.current.submit('Q2') })
    expect(ok).toBe(false)
    expect(service.submitGradingDecision).not.toHaveBeenCalled()
    expect(hook.result.current.error).toContain('Select at least one criterion')
  })

  it('guards duplicate clicks while a submission is in flight', async () => {
    let finish
    service.submitGradingDecision.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    const hook = await session()
    let first, second
    act(() => { first = hook.result.current.submit('Q2'); second = hook.result.current.submit('Q2') })
    await waitFor(() => expect(service.submitGradingDecision).toHaveBeenCalledTimes(1))
    await act(async () => { finish({ ...initial().Q2, version: 5 }); expect(await first).toBe(true); expect(await second).toBe(false) })
    expect(service.submitGradingDecision).toHaveBeenCalledTimes(1)
  })
})
