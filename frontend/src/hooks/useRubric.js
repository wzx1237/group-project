'use client'

import { useCallback, useEffect, useState } from 'react'
import * as rubricService from '@/services/rubricService'

// A new question starts with a 0-point criterion, so a fully right (or blank) answer is graded in one click.
async function createQuestion(examId, body) {
  const question = await rubricService.createRubricQuestion(examId, body)
  if (question.criteria.length) return
  const title = body.scoring === 'add' ? 'No credit' : 'Correct'
  await rubricService.createRubricCriterion(examId, question.qid, { title, description: '', deduction: 0 })
}

export function useRubric(examId) {
  const [rubric, setRubric] = useState(null)
  const [error, setError] = useState('')

  const reload = useCallback(() => rubricService.fetchExamRubric(examId).then(setRubric), [examId])

  useEffect(() => {
    reload().catch((err) => setError(err.message))
  }, [reload])

  // Runs one rubric change, then reloads the rubric. Resolves to whether it worked.
  const change = (fn) => async (...args) => {
    setError('')
    try {
      await fn(examId, ...args)
      await reload()
      return true
    } catch (err) {
      setError(err.message)
      return false
    }
  }

  const actions = {
    addQuestion: change(createQuestion),
    updateQuestion: change(rubricService.updateRubricQuestion),
    removeQuestion: change(rubricService.removeRubricQuestion),
    addCriterion: change(rubricService.createRubricCriterion),
    updateCriterion: change(rubricService.updateRubricCriterion),
    removeCriterion: change(rubricService.removeRubricCriterion),
  }

  return { rubric, error, actions }
}
