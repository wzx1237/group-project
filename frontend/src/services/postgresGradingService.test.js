import { afterEach, expect, it, vi } from 'vitest'
import { saveAnswer, addCriterion } from './postgresGradingService'
afterEach(() => vi.unstubAllGlobals())
const work = { exam_ID: 1, UID: 123456789, QID: 'Q1', grade_token: '"grade"', rubric_token: '"rubric"' }
it('sends CAS cookies and exact snapshot tokens for grade, regrade and rubric additions', async () => {
  const fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ score: 4 }) })
  vi.stubGlobal('fetch', fetch)
  await saveAnswer(work, [1,2], 'Reviewed')
  expect(fetch).toHaveBeenLastCalledWith('/api/exams/1/students/123456789/questions/Q1/grade', expect.objectContaining({ method: 'POST', credentials: 'same-origin', headers: expect.objectContaining({ 'If-Match': '"grade"' }), body: JSON.stringify({ labels: [1,2], comments: 'Reviewed' }) }))
  await saveAnswer({ ...work, decision: { record_id: 1 } }, [1], null)
  expect(fetch.mock.lastCall[1].method).toBe('PUT')
  await addCriterion(work, { title: 'Deduct', deduction: '-1' })
  expect(fetch.mock.lastCall[1].headers['If-Match']).toBe('"rubric"')
})
it('surfaces stale snapshots without silently retrying', async () => {
  const fetch = vi.fn().mockResolvedValue({ ok: false, status: 412, json: async () => ({ detail: 'Workspace changed' }) })
  vi.stubGlobal('fetch', fetch)
  await expect(saveAnswer(work, [], null)).rejects.toMatchObject({ status: 412, message: 'Workspace changed' })
  expect(fetch).toHaveBeenCalledTimes(1)
})
