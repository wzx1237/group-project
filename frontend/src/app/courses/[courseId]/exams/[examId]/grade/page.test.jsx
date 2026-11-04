import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import Page from './page'
import * as api from '@/services/postgresGradingService'
vi.mock('next/navigation', () => ({ useParams: () => ({ courseId: '1', examId: '1' }), useSearchParams: () => new URLSearchParams('qid=Q1') }))
vi.mock('@/components/auth/ProtectedRoute', () => ({ ProtectedRoute: ({ children }) => children }))
vi.mock('@/services/postgresGradingService', () => ({ startAnswer: vi.fn(), refreshAnswer: vi.fn(), releaseAnswer: vi.fn(), saveAnswer: vi.fn(), addCriterion: vi.fn() }))
afterEach(() => { cleanup(); vi.clearAllMocks() })
const work = { exam_ID: 1, UID: 123456789, QID: 'Q1', assignment: { status: 'Pending' }, rubric: { total_scores: 5 }, labels: [{ label_id: 1, title: 'Full credit', deduction: 5 }], selected_labels: [], decision: null, pdf_url: '/api/scan', grade_token: '"g"' }
it('claims work, shows its PDF, and saves the selected rubric and feedback', async () => {
  api.startAnswer.mockResolvedValue(work); api.saveAnswer.mockResolvedValue({ score: 5 })
  render(<Page />)
  expect(api.startAnswer).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Start / resume answer' }))
  await screen.findByText('Rubric · Q1')
  expect(screen.getByTitle('Student 123456789 exam PDF').getAttribute('src')).toBe('/api/scan')
  fireEvent.click(screen.getByRole('checkbox'))
  fireEvent.change(screen.getByRole('textbox', { name: 'Feedback to student' }), { target: { value: 'Good reasoning' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save grade' }))
  await waitFor(() => expect(api.saveAnswer).toHaveBeenCalledWith(work, [1], 'Good reasoning'))
  await screen.findByRole('button', { name: 'Next answer' })
})
it('blocks stale saves and requires a deliberate refresh', async () => {
  api.startAnswer.mockResolvedValue(work)
  api.saveAnswer.mockRejectedValue(Object.assign(new Error('Changed'), { status: 412 }))
  render(<Page />)
  fireEvent.click(screen.getByRole('button', { name: 'Start / resume answer' }))
  await screen.findByText('Rubric · Q1')
  fireEvent.click(screen.getByRole('button', { name: 'Save grade' }))
  await screen.findByRole('alert')
  expect(screen.getByRole('button', { name: 'Save grade' }).disabled).toBe(true)
  expect(api.refreshAnswer).not.toHaveBeenCalled()
})
