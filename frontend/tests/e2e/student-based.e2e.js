import { test, expect } from '@playwright/test'
import { installGradingFixture } from './grading-fixture.mjs'

const base = '/courses/1/exams/midterm-2'
const students = `${base}/grading-queue/students`
const grade = `${base}/grade?student=111`
const headers = ['Student', 'UID', 'Status', 'Score', 'Assigned grader', 'Open response']

for (const kind of ['homework', 'lab', 'quiz', 'other']) {
  test(`${kind} uses the common exam page and student list, then a full rubric`, async ({ page }) => {
    const state = await installGradingFixture(page, { kind })
    await page.goto('/courses/1')
    // Same original CourseCard/ExamRow, with the fork happening only on assignment selection.
    await expect(page.getByRole('heading', { name: 'Courses', exact: true })).toBeVisible()
    await page.getByRole('link', { name: /Midterm 2/ }).click()
    await expect(page).toHaveURL(students)
    await expect(page.getByRole('heading', { name: 'Student responses', exact: true })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Questions to grade' })).toHaveCount(0)
    await expect(page.getByRole('columnheader')).toHaveText(headers)
    await expect(page.getByRole('combobox')).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'No Scan', exact: true })).toHaveCount(0)
    const alice = page.getByRole('row').filter({ has: page.getByRole('link', { name: 'Alice Adams', exact: true }) })
    await expect(alice).toContainText('In progress')
    await expect(alice).toContainText('10 / 30')
    await page.getByRole('button', { name: 'Pending', exact: true }).click()
    await expect(page.getByRole('link', { name: 'Alice Adams', exact: true })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Bob Brown', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'All students', exact: true }).click()
    await page.getByRole('link', { name: 'Alice Adams', exact: true }).click()
    await expect(page).toHaveURL(grade)
    const rubric = page.getByRole('complementary', { name: 'Question rubric' })
    for (const name of ['Q1 · Logic', 'Q2 · Functions', 'Q3 · Proof']) await expect(rubric.getByRole('heading', { name, exact: true })).toBeVisible()
    await expect(rubric).toHaveCSS('width', '480px')
    await expect(page.getByRole('button', { name: 'Criterion', exact: true })).toHaveCount(3)
    await expect(page.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(3)
    await expect(page.getByRole('button', { name: 'Regrade', exact: true })).toHaveCount(3)
    await expect(page.getByRole('button', { name: 'Import rubric', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Submission', exact: true })).toHaveCount(1)
    await page.getByRole('button', { name: 'Submission', exact: true }).click()
    await expect(page.locator('main').getByRole('alert')).toContainText('every question')
    expect(state.mutations.filter((m) => m.path.endsWith('/decision'))).toHaveLength(0)
    await page.getByRole('button', { name: /Correct Q2/ }).click()
    await page.getByRole('button', { name: /Correct Q3/ }).click()
    const q3 = rubric.getByRole('region', { name: 'Q3 · Proof', exact: true })
    await q3.getByRole('button', { name: 'Comment to student', exact: true }).click()
    await q3.getByLabel('Comment to student', { exact: true }).fill('Whole assignment feedback')
    await page.getByRole('button', { name: 'Submission', exact: true }).click()
    await expect(page).toHaveURL(`${students}?submitted=111`)
    await expect(alice).toContainText('Finished')
    await expect(alice).toContainText('30 / 30')
    expect(state.decisions['111'].Q3.comment).toBe('Whole assignment feedback')
    expect(state.mutations.filter((m) => m.path.endsWith('/decision')).slice(-3).map((m) => m.path.split('/questions/')[1].split('/')[0])).toEqual(['Q1', 'Q2', 'Q3'])
    await page.reload()
    await expect(alice).toContainText('Finished')
  })
}

test('Final Exam still selects a question and shows only its rubric', async ({ page }) => {
  await installGradingFixture(page, { kind: 'final exam' })
  await page.goto('/courses/1')
  await page.getByRole('link', { name: /Midterm 2/ }).click()
  await expect(page).toHaveURL(`${base}/grading-queue`)
  await page.getByLabel('Question', { exact: true }).selectOption('Q2')
  await expect(page.getByRole('link', { name: 'View students', exact: true })).toHaveCount(1)
  await page.getByRole('link', { name: 'View students', exact: true }).click()
  await expect(page.getByRole('columnheader')).toHaveText(headers)
  await page.getByRole('link', { name: 'Alice Adams', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Q2 · Functions', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Q1 · Logic', exact: true })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Q3 · Proof', exact: true })).toHaveCount(0)
})

test('legacy quiz links cannot restrict the full assignment rubric', async ({ page }) => {
  await installGradingFixture(page, { kind: 'quiz' })
  await page.goto(`${base}/grading-queue/Q2/students?student=111`)
  await expect(page).toHaveURL(`${students}?student=111`)
  await page.goto(`${base}/grade?q=Q2&status=ungraded&student=111`)
  const rubric = page.getByRole('complementary', { name: 'Question rubric' })
  await expect(rubric.getByRole('heading', { name: 'Q1 · Logic', exact: true })).toBeVisible()
  await expect(rubric.getByRole('heading', { name: 'Q3 · Proof', exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Back to students', exact: true }).click()
  await expect(page).toHaveURL(students)
})

test('partial whole-assignment save failure stays in grading and can retry', async ({ page }) => {
  const state = await installGradingFixture(page, { kind: 'homework' })
  await page.goto(grade)
  await page.getByRole('button', { name: /Correct Q2/ }).click()
  await page.getByRole('button', { name: /Correct Q3/ }).click()
  await expect.poll(() => state.decisions['111'].Q3?.version).toBe(1)
  const before = state.mutations.length
  state.failQid = 'Q2'
  await page.getByRole('button', { name: 'Submission', exact: true }).click()
  await expect(page.locator('main').getByRole('alert')).toContainText('changed since')
  await expect(page).toHaveURL(grade)
  expect(state.mutations.slice(before).filter((m) => m.path.endsWith('/decision')).map((m) => m.path.split('/questions/')[1].split('/')[0])).toEqual(['Q1', 'Q2'])
  state.failQid = null
  await page.getByRole('button', { name: 'Submission', exact: true }).click()
  await expect(page).toHaveURL(`${students}?submitted=111`)
})

test('student mode preserves different graders, regrade review, and the full-rubric return', async ({ page }) => {
  const state = await installGradingFixture(page, { kind: 'lab' })
  for (const [qid, id] of [['Q1', '101'], ['Q2', '201'], ['Q3', '301']]) state.decisions['222'][qid] = { criteria: [id], score: 10, version: 1, grader_directory_id: 'ta2' }
  await page.goto(students)
  const bob = page.getByRole('row').filter({ has: page.getByRole('link', { name: 'Bob Brown', exact: true }) })
  await expect(bob).toContainText('ta2')
  await expect(bob).toContainText('Finished')
  await expect(page.getByRole('combobox')).toHaveCount(0)
  await page.getByRole('link', { name: 'Alice Adams', exact: true }).click()
  await page.getByRole('region', { name: 'Q2 · Functions', exact: true }).getByRole('button', { name: 'Regrade', exact: true }).click()
  await page.getByLabel('Why · graders see this in the queue', { exact: true }).fill('Check lab consistency')
  await page.getByRole('button', { name: 'Start regrade', exact: true }).click()
  await expect(page).toHaveURL(`${base}/regrade/review-1`)
  await expect(page.getByRole('link', { name: 'Open full exam', exact: true })).toHaveAttribute('href', grade)
  await page.getByRole('link', { name: 'Exit review', exact: true }).click()
  await expect(page).toHaveURL(students)
  const alice = page.getByRole('row').filter({ has: page.getByRole('link', { name: 'Alice Adams', exact: true }) })
  await expect(alice).toContainText('Need regrade')
})
