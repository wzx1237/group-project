// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RubricPanel } from './rubricPanel'

vi.mock('next/link', () => ({ default: ({ href, children, ...props }) => <a href={href} {...props}>{children}</a> }))
vi.mock('@/services/rubricService', () => ({ fetchRubricSources: vi.fn().mockResolvedValue([]) }))

const question = (qid, title) => ({ qid, title, total_score: 10, scoring: 'deduct', graded: 2, criteria: [{ label_id: `${qid}-correct`, title: `Correct ${qid}`, deduction: 0, description: '', applied: 2 }] })
const questions = [question('Q1', 'Logic'), question('Q2', 'Functions'), question('Q3', 'Proof')]
const actions = () => Object.fromEntries(['addQuestion', 'updateQuestion', 'removeQuestion', 'addCriterion', 'updateCriterion', 'removeCriterion', 'importRubric'].map((key) => [key, vi.fn().mockResolvedValue(true)]))
const regrade = () => ({ queues: [], href: vi.fn(), flag: vi.fn().mockResolvedValue({}), open: vi.fn() })

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
  vi.stubGlobal('CSS', { escape: (value) => value })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

function panel(extra = {}) {
  const props = { questions, actions: actions(), regrade: regrade(), focusQid: 'Q2', scopeQid: 'Q2', canModifyQuestions: false, ...extra }
  render(<RubricPanel {...props} />)
  return props
}

describe('scoped rubric preserves the original grading tools', () => {
  it('shows only the selected question with its original question number and actions', () => {
    panel()
    expect(screen.getByRole('heading', { name: 'Q2 · Functions' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: /Q1 ·/ })).toBeNull()
    expect(screen.queryByRole('heading', { name: /Q3 ·/ })).toBeNull()
    for (const name of ['Criterion', 'Edit', 'Remove', 'Regrade', 'Import rubric']) expect(screen.getByRole('button', { name, exact: true })).toBeTruthy()
  })

  it('adds a criterion to the selected question through the existing action', async () => {
    const props = panel()
    fireEvent.click(screen.getByRole('button', { name: 'Criterion', exact: true }))
    fireEvent.change(screen.getByLabelText('Points'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Title · shown to students'), { target: { value: 'Missing justification' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save criterion' }))
    await waitFor(() => expect(props.actions.addCriterion).toHaveBeenCalledWith('Q2', { deduction: -2, title: 'Missing justification', description: '' }))
  })

  it('edits an existing criterion without changing unrelated questions', async () => {
    const props = panel()
    fireEvent.click(screen.getByRole('button', { name: 'Edit', exact: true }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit Correct Q2', exact: true }))
    fireEvent.change(screen.getByLabelText('Title · shown to students'), { target: { value: 'Complete argument' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save criterion' }))
    await waitFor(() => expect(props.actions.updateCriterion).toHaveBeenCalledWith('Q2', 'Q2-correct', { title: 'Complete argument', description: '', deduction: 0 }))
  })

  it('starts the original regrade workflow for the selected question', async () => {
    const props = panel()
    fireEvent.click(screen.getByRole('button', { name: 'Regrade', exact: true }))
    fireEvent.change(screen.getByLabelText('Why · graders see this in the queue'), { target: { value: 'Review consistency' } })
    fireEvent.click(screen.getByRole('button', { name: 'Start regrade' }))
    await waitFor(() => expect(props.regrade.flag).toHaveBeenCalledWith('Q2', { reason: 'Review consistency', criterionId: null }))
  })

  it('keeps Import rubric available in the scoped grading panel', async () => {
    panel()
    fireEvent.click(screen.getByRole('button', { name: 'Import rubric', exact: true }))
    expect(await screen.findByRole('dialog')).toBeTruthy()
  })

  it('preserves subquestion labels while hiding other parts of the same parent', () => {
    const parts = [question('Q1', 'Logic'), { ...question('Q2', 'Functions'), criteria: [] }, question('Q2.1', 'First part'), question('Q2.2', 'Second part'), question('Q3', 'Proof')]
    panel({ questions: parts, focusQid: 'Q2.2', scopeQid: 'Q2.2' })
    expect(screen.getByRole('heading', { name: 'Q2(b) · Second part' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: /First part/ })).toBeNull()
    expect(screen.queryByRole('heading', { name: /Logic/ })).toBeNull()
    expect(screen.queryByRole('heading', { name: /Proof/ })).toBeNull()
  })

  it('continues to show the complete rubric on the original rubric editing page', () => {
    panel({ scopeQid: null, focusQid: null, canModifyQuestions: true })
    for (const name of ['Q1 · Logic', 'Q2 · Functions', 'Q3 · Proof']) expect(screen.getByRole('heading', { name })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Add question' })).toBeTruthy()
  })
})
