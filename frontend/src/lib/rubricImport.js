import { gradableQuestions, parentQid } from '@/lib/rubric'

export const naturalQidCompare = (a, b) => a.localeCompare(b, undefined, { numeric: true })

export function sortQuestionsForSave(questions) {
  return [...questions].sort((a, b) => {
    const aIsPart = parentQid(a.qid) ? 1 : 0
    const bIsPart = parentQid(b.qid) ? 1 : 0
    if (aIsPart !== bIsPart) return aIsPart - bIsPart
    return naturalQidCompare(a.qid, b.qid)
  })
}

const topNumber = (qid) => {
  const head = parentQid(qid) ?? qid
  const match = /(\d+)$/.exec(head)
  return match ? Number(match[1]) : 0
}

const cloneCriterion = (criterion, makeId) => ({
  label_id: makeId(),
  title: (criterion.title ?? '').trim().slice(0, 50),
  description: (criterion.description ?? '').trim(),
  deduction: Number(criterion.deduction) || 0,
})

const cloneQuestion = (question, makeId, { copyRegions = false } = {}) => ({
  qid: question.qid,
  title: (question.title ?? '').trim(),
  grading_method: question.grading_method ?? 'manual',
  scoring: question.scoring ?? 'add',
  total_score: Number(question.total_score) || 0,
  region: copyRegions ? question.region ?? null : null,
  criteria: (question.criteria ?? []).map((c) => cloneCriterion(c, makeId)),
})

export function filterSubtree(sourceQuestions, sourceQids = null) {
  const sorted = [...sourceQuestions].sort((a, b) => naturalQidCompare(a.qid, b.qid))
  if (!sourceQids) return sorted

  const wanted = new Set(sourceQids)
  const childrenByParent = new Map()
  for (const q of sorted) {
    const parent = parentQid(q.qid)
    if (!parent) continue
    if (!childrenByParent.has(parent)) childrenByParent.set(parent, [])
    childrenByParent.get(parent).push(q.qid)
  }

  for (const qid of [...wanted]) {
    const children = childrenByParent.get(qid) ?? []
    if (children.length && !children.some((child) => wanted.has(child))) {
      for (const child of children) wanted.add(child)
    }
  }

  for (const qid of [...wanted]) {
    const parent = parentQid(qid)
    if (parent && sorted.some((q) => q.qid === parent)) wanted.add(parent)
  }

  const filtered = sorted
    .filter((q) => wanted.has(q.qid))
    .map((q) => {
      const hasSelectedChildren = (childrenByParent.get(q.qid) ?? []).some((child) => wanted.has(child))
      return hasSelectedChildren ? { ...q, criteria: [] } : q
    })
  return sortQuestionsForSave(filtered)
}

export function renumberQuestionsForAppend(selected, existingQuestions) {
  const taken = new Set(existingQuestions.map((q) => q.qid))
  let nextNum = Math.max(0, ...[...taken].map(topNumber)) + 1
  const ordered = sortQuestionsForSave(selected)
  const topMap = new Map()

  for (const q of ordered) {
    if (parentQid(q.qid)) continue
    let candidate = `Q${nextNum}`
    while (taken.has(candidate)) {
      nextNum += 1
      candidate = `Q${nextNum}`
    }
    topMap.set(q.qid, candidate)
    taken.add(candidate)
    nextNum += 1
  }

  return ordered.map((q) => {
    const parent = parentQid(q.qid)
    if (!parent) return { ...q, qid: topMap.get(q.qid) }
    const suffix = q.qid.slice(parent.length + 1)
    const newParent = topMap.get(parent) ?? parent
    return { ...q, qid: `${newParent}.${suffix}` }
  })
}

export function defaultQuestionMappings(sourceQuestions, targetQuestions) {
  const gradableTargets = new Set(gradableQuestions(targetQuestions).map((q) => q.qid))
  const mappings = {}
  for (const q of gradableQuestions(sourceQuestions)) {
    mappings[q.qid] = gradableTargets.has(q.qid) ? q.qid : ''
  }
  return mappings
}

const criterionKey = (c) =>
  `${(c.title ?? '').trim().slice(0, 50)}\0${(c.description ?? '').trim()}\0${Number(c.deduction) || 0}`

export function applyRubricImport(currentQuestions, sourceQuestions, options, makeId) {
  const {
    mode = 'replace',
    sourceQids = null,
    questionMappings = [],
    includeQuestionDetails = false,
    replaceUnusedCriteria = false,
    copyRegions = false,
  } = options

  if (mode === 'replace') {
    const selected = filterSubtree(sourceQuestions, sourceQids)
    const questions = sortQuestionsForSave(selected.map((q) => cloneQuestion(q, makeId, { copyRegions })))
    const criteriaAdded = questions.reduce((sum, q) => sum + q.criteria.length, 0)
    return {
      questions,
      summary: { questions_added: questions.length, criteria_added: criteriaAdded, criteria_skipped: 0, affected_graded_qids: [] },
    }
  }

  if (mode === 'append_questions') {
    const selected = filterSubtree(sourceQuestions, sourceQids)
    const renumbered = renumberQuestionsForAppend(selected, currentQuestions).map((q) =>
      cloneQuestion(q, makeId, { copyRegions }),
    )
    const criteriaAdded = renumbered.reduce((sum, q) => sum + q.criteria.length, 0)
    return {
      questions: [...currentQuestions, ...renumbered],
      summary: { questions_added: renumbered.length, criteria_added: criteriaAdded, criteria_skipped: 0, affected_graded_qids: [] },
    }
  }

  if (mode === 'merge_criteria') {
    const sourceByQid = new Map(sourceQuestions.map((q) => [q.qid, q]))
    const next = currentQuestions.map((q) => ({ ...q, criteria: [...(q.criteria ?? [])] }))
    const indexByQid = new Map(next.map((q, idx) => [q.qid, idx]))
    const replaced = new Set()
    let criteriaAdded = 0
    let criteriaSkipped = 0

    for (const { source_qid: srcQid, target_qid: tgtQid } of questionMappings) {
      const src = sourceByQid.get(srcQid)
      const idx = indexByQid.get(tgtQid)
      if (!src || idx === undefined) continue
      const target = next[idx]

      if (includeQuestionDetails) {
        target.title = (src.title ?? '').trim()
        target.total_score = Number(src.total_score) || 0
        target.scoring = src.scoring ?? target.scoring ?? 'add'
        target.grading_method = src.grading_method ?? target.grading_method ?? 'manual'
      }

      if (replaceUnusedCriteria && !replaced.has(tgtQid)) {
        if ((target.criteria ?? []).some((c) => (c.applied ?? 0) > 0)) {
          throw new Error(`Cannot replace criteria on ${tgtQid} because graded answers already use them`)
        }
        target.criteria = []
        replaced.add(tgtQid)
      }

      const seen = new Set(target.criteria.map(criterionKey))
      for (const c of src.criteria ?? []) {
        const cloned = cloneCriterion(c, makeId)
        if (!cloned.title) continue
        const key = criterionKey(cloned)
        if (seen.has(key)) {
          criteriaSkipped += 1
          continue
        }
        seen.add(key)
        target.criteria.push(cloned)
        criteriaAdded += 1
      }
    }
    return {
      questions: next,
      summary: { questions_added: 0, criteria_added: criteriaAdded, criteria_skipped: criteriaSkipped, affected_graded_qids: [] },
    }
  }

  throw new Error(`Unsupported import mode: ${mode}`)
}

export function mergeImportedRubric(currentQuestions, sourceQuestions, options, makeId) {
  return applyRubricImport(currentQuestions, sourceQuestions, options, makeId).questions
}
