'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ArrowRight, Check, Copy, Download, FileText, Info, Upload, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { formatAdjustment, formatPoints, gradableQuestions, parentQid, partsOf, plural, questionPoints, topLevel } from '@/lib/rubric'
import { defaultQuestionMappings, renumberQuestionsForAppend, sortQuestionsForSave } from '@/lib/rubricImport'
import { fetchExamRubric, fetchRubricSources } from '@/services/rubricService'
import { icon } from './icon'
import { exportRubricMarkdown, parseRubricMarkdown } from './rubricMarkdown'
import styles from './importRubricDialog.module.css'

const MARKDOWN_PLACEHOLDER = `## Q1 · Chain rule (5 pts, deduct)

- [-2] Missing inner derivative
- [0] Correct`

function groupSources(sources, currentCourse) {
  const groups = { sameCourse: [], sameCode: [], other: [] }
  for (const s of sources) {
    if (currentCourse && s.course_id === currentCourse.course_id) groups.sameCourse.push(s)
    else if (currentCourse && s.course_code === currentCourse.code) groups.sameCode.push(s)
    else groups.other.push(s)
  }
  return groups
}

function sourceLabel(s, includeCourse) {
  const coursePrefix = includeCourse ? `${s.course_code} (${s.course_term}) · ` : ''
  return `${coursePrefix}${s.title} — ${plural(s.question_count, 'question')}, ${formatPoints(s.total_points)}`
}

export function ImportRubricDialog({
  examId = null,
  examTitle = '',
  course = null,
  targetQuestions = [],
  canModifyQuestions = true,
  onImport,
  onClose,
}) {
  const id = useId()
  const fileInputRef = useRef(null)
  const [tab, setTab] = useState('assignment')

  // Assignment-source state
  const [sources, setSources] = useState(null)
  const [sourcesError, setSourcesError] = useState('')
  const [selectedSourceId, setSelectedSourceId] = useState('')
  const [rubricCache, setRubricCache] = useState(() => new Map())
  const [sourceErrors, setSourceErrors] = useState(() => new Map())

  // Markdown-source state
  const [markdown, setMarkdown] = useState('')
  const [copied, setCopied] = useState(false)

  // Shared mode & options
  const hasTarget = targetQuestions.length > 0
  const gradableTarget = useMemo(() => gradableQuestions(targetQuestions), [targetQuestions])
  const hasGradedAnswers = useMemo(
    () => targetQuestions.some((q) => (q.graded ?? 0) > 0 || (q.criteria ?? []).some((c) => (c.applied ?? 0) > 0)),
    [targetQuestions],
  )
  const defaultMode = !canModifyQuestions
    ? 'merge_criteria'
    : hasTarget && gradableTarget.length > 0
      ? 'merge_criteria'
      : 'replace'

  const [mode, setMode] = useState(defaultMode)
  const [selectionOverride, setSelectionOverride] = useState({ key: null, qids: null })
  const [mappingOverride, setMappingOverride] = useState({ key: null, map: {} })
  const [includeQuestionDetails, setIncludeQuestionDetails] = useState(false)
  const [replaceUnusedCriteria, setReplaceUnusedCriteria] = useState(false)
  const [copyRegions, setCopyRegions] = useState(false)
  const [problem, setProblem] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchRubricSources(examId)
      .then((list) => {
        if (cancelled) return
        setSources(list)
        if (list.length > 0) {
          const sameCourseFirst = list.find((s) => course && s.course_id === course.course_id) ?? list[0]
          setSelectedSourceId(sameCourseFirst.assignment_id)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setSources([])
          setSourcesError(err.message)
        }
      })
    return () => {
      cancelled = true
    }
  }, [examId, course])

  useEffect(() => {
    if (tab !== 'assignment' || !selectedSourceId || rubricCache.has(selectedSourceId)) return
    let cancelled = false
    fetchExamRubric(selectedSourceId)
      .then((data) => {
        if (cancelled) return
        setRubricCache((prev) => new Map(prev).set(selectedSourceId, data.questions))
        setSourceErrors((prev) => {
          const next = new Map(prev)
          next.delete(selectedSourceId)
          return next
        })
      })
      .catch((err) => {
        if (!cancelled) {
          setSourceErrors((prev) => new Map(prev).set(selectedSourceId, err.message))
        }
      })
    return () => {
      cancelled = true
    }
  }, [tab, selectedSourceId, rubricCache])

  const sourceFetchError = tab === 'assignment' ? sourceErrors.get(selectedSourceId) ?? '' : ''
  const loadingSource =
    tab === 'assignment' && Boolean(selectedSourceId) && !rubricCache.has(selectedSourceId) && !sourceFetchError

  const parsedMarkdown = useMemo(() => {
    if (!markdown.trim()) return { questions: null, error: '' }
    try {
      return { questions: parseRubricMarkdown(markdown), error: '' }
    } catch (err) {
      return { questions: null, error: err.message }
    }
  }, [markdown])

  const sourceQuestions = useMemo(() => {
    if (tab === 'assignment') return rubricCache.get(selectedSourceId) ?? null
    return parsedMarkdown.questions
  }, [tab, selectedSourceId, rubricCache, parsedMarkdown.questions])

  const sourceTop = useMemo(() => (sourceQuestions ? topLevel(sourceQuestions) : []), [sourceQuestions])
  const gradableSource = useMemo(() => (sourceQuestions ? gradableQuestions(sourceQuestions) : []), [sourceQuestions])

  const sourceKey = tab === 'assignment' ? `assignment:${selectedSourceId}` : `markdown:${markdown}`
  const selectedTopQids = useMemo(() => {
    if (!sourceQuestions) return new Set()
    if (selectionOverride.key === sourceKey && selectionOverride.qids) return selectionOverride.qids
    return new Set(sourceTop.map((q) => q.qid))
  }, [sourceQuestions, sourceKey, selectionOverride, sourceTop])

  const mappings = useMemo(() => {
    if (!sourceQuestions) return {}
    if (mappingOverride.key === sourceKey) return mappingOverride.map
    return defaultQuestionMappings(sourceQuestions, targetQuestions)
  }, [sourceQuestions, sourceKey, mappingOverride, targetQuestions])

  const grouped = useMemo(() => groupSources(sources ?? [], course), [sources, course])
  const hasSourceRegions = useMemo(() => Boolean(sourceQuestions?.some((q) => Boolean(q.region))), [sourceQuestions])

  const appendPreviewQids = useMemo(() => {
    if (mode !== 'append_questions' || !sourceQuestions || !selectedTopQids) return new Map()
    const picked = sortQuestionsForSave(
      sourceQuestions.filter((q) => selectedTopQids.has(parentQid(q.qid) ?? q.qid)),
    )
    const renumbered = renumberQuestionsForAppend(picked, targetQuestions)
    return new Map(picked.map((q, i) => [q.qid, renumbered[i]?.qid ?? q.qid]))
  }, [mode, sourceQuestions, selectedTopQids, targetQuestions])

  const activeMappings = useMemo(
    () =>
      gradableSource
        .filter((q) => mappings[q.qid])
        .map((q) => ({ source_qid: q.qid, target_qid: mappings[q.qid] })),
    [gradableSource, mappings],
  )

  const mappedGradedQids = useMemo(() => {
    const byQid = new Map(targetQuestions.map((q) => [q.qid, q]))
    return [...new Set(activeMappings.map((m) => m.target_qid))].filter((qid) => {
      const target = byQid.get(qid)
      return (target?.graded ?? 0) > 0 || (target?.criteria ?? []).some((c) => (c.applied ?? 0) > 0)
    })
  }, [activeMappings, targetQuestions])

  const canReplaceTargetCriteria = mappedGradedQids.length === 0

  function toggleTopQid(qid) {
    const next = new Set(selectedTopQids)
    if (!next.delete(qid)) next.add(qid)
    setSelectionOverride({ key: sourceKey, qids: next })
  }

  function updateMapping(sourceQid, targetQid) {
    setMappingOverride({ key: sourceKey, map: { ...mappings, [sourceQid]: targetQid } })
  }

  async function handleExportDownload() {
    setProblem('')
    try {
      const text = exportRubricMarkdown(targetQuestions, examTitle)
      const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `${examId || 'rubric'}.md`
      anchor.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setProblem(err.message)
    }
  }

  async function handleCopyMarkdown() {
    setProblem('')
    try {
      const text = exportRubricMarkdown(targetQuestions, examTitle)
      await navigator.clipboard?.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch (err) {
      setProblem(err.message || 'Could not copy to clipboard')
    }
  }

  function handleFileUpload(event) {
    const file = event.target.files?.[0]
    if (!file) return
    file.text().then((text) => {
      setMarkdown(text)
      setProblem('')
    })
    event.target.value = ''
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (!sourceQuestions?.length) {
      return setProblem(tab === 'assignment' ? 'Select an assignment with a rubric.' : parsedMarkdown.error || 'Enter valid rubric Markdown.')
    }
    if ((mode === 'replace' || mode === 'append_questions') && (!selectedTopQids || selectedTopQids.size === 0)) {
      return setProblem('Select at least one question to import.')
    }
    if (mode === 'merge_criteria' && activeMappings.length === 0) {
      return setProblem('Match at least one source question to a target question.')
    }

    const payload = {
      mode,
      ...(tab === 'assignment' ? { from_assignment_id: selectedSourceId } : { markdown }),
      ...(mode === 'merge_criteria'
        ? {
            question_mappings: activeMappings,
            include_question_details: includeQuestionDetails,
            replace_unused_criteria: canReplaceTargetCriteria ? replaceUnusedCriteria : false,
          }
        : {
            source_qids: [...selectedTopQids],
            copy_regions: tab === 'assignment' && copyRegions,
          }),
      sourceQuestions,
    }

    setProblem('')
    setSaving(true)
    try {
      await onImport(payload)
      onClose()
    } catch (err) {
      setProblem(err.message)
      setSaving(false)
    }
  }

  return (
    <div className={styles.backdrop} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        onSubmit={handleSubmit}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        <div className={styles.heading}>
          <span className={styles.mark}>
            <Download {...icon} size={18} />
          </span>
          <div className={styles.headingText}>
            <h2 id={`${id}-title`} className={styles.title}>
              Import previous rubric
            </h2>
            <p className={styles.meta}>
              Reuse questions and criteria from an earlier assignment or portable Markdown.
            </p>
          </div>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
            <X {...icon} size={16} />
          </button>
        </div>

        <div className={styles.tabs} role="tablist" aria-label="Rubric source">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'assignment'}
            className={[styles.tab, tab === 'assignment' && styles.tabActive].filter(Boolean).join(' ')}
            onClick={() => {
              setTab('assignment')
              setProblem('')
            }}
          >
            Previous assignment
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'markdown'}
            className={[styles.tab, tab === 'markdown' && styles.tabActive].filter(Boolean).join(' ')}
            onClick={() => {
              setTab('markdown')
              setProblem('')
            }}
          >
            Markdown
          </button>
        </div>

        <div className={styles.body}>
          {tab === 'assignment' ? (
            <div className={styles.field}>
              <label className={styles.label} htmlFor={`${id}-source`}>
                Source assignment
              </label>
              {sourcesError ? (
                <p className={styles.problem} role="alert">
                  {sourcesError}
                </p>
              ) : sources === null ? (
                <p className={styles.meta}>Loading previous rubrics…</p>
              ) : sources.length === 0 ? (
                <p className={styles.emptyNote}>
                  No other assignments with a rubric were found in your courses yet. You can still import from the Markdown tab.
                </p>
              ) : (
                <select
                  id={`${id}-source`}
                  className={styles.select}
                  value={selectedSourceId}
                  onChange={(e) => {
                    setSelectedSourceId(e.target.value)
                    setProblem('')
                  }}
                >
                  {grouped.sameCourse.length > 0 && (
                    <optgroup label="This course">
                      {grouped.sameCourse.map((s) => (
                        <option key={s.assignment_id} value={s.assignment_id}>
                          {sourceLabel(s, false)}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {grouped.sameCode.length > 0 && (
                    <optgroup label={`${course?.code} · Previous terms`}>
                      {grouped.sameCode.map((s) => (
                        <option key={s.assignment_id} value={s.assignment_id}>
                          {sourceLabel(s, true)}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {grouped.other.length > 0 && (
                    <optgroup label="Other courses">
                      {grouped.other.map((s) => (
                        <option key={s.assignment_id} value={s.assignment_id}>
                          {sourceLabel(s, true)}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              )}
              {loadingSource && <span className={styles.meta}>Loading rubric preview…</span>}
              {sourceFetchError && (
                <p className={styles.problem} role="alert">
                  {sourceFetchError}
                </p>
              )}
            </div>
          ) : (
            <div className={styles.field}>
              <div className={styles.fieldHeader}>
                <label className={styles.label} htmlFor={`${id}-md`}>
                  Rubric Markdown
                </label>
                <div className={styles.toolbar}>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".md,.markdown,.txt,text/markdown,text/plain"
                    className={styles.hiddenInput}
                    onChange={handleFileUpload}
                  />
                  <Button size="sm" onClick={() => fileInputRef.current?.click()}>
                    <Upload {...icon} />
                    Load .md file
                  </Button>
                  {hasTarget && (
                    <>
                      <Button size="sm" onClick={handleCopyMarkdown}>
                        {copied ? <Check {...icon} /> : <Copy {...icon} />}
                        {copied ? 'Copied' : 'Copy current'}
                      </Button>
                      <Button size="sm" onClick={handleExportDownload}>
                        <FileText {...icon} />
                        Export .md
                      </Button>
                    </>
                  )}
                </div>
              </div>
              <textarea
                id={`${id}-md`}
                className={styles.textarea}
                placeholder={MARKDOWN_PLACEHOLDER}
                value={markdown}
                onChange={(e) => setMarkdown(e.target.value)}
              />
              {parsedMarkdown.error && (
                <p className={styles.problem} role="alert">
                  {parsedMarkdown.error}
                </p>
              )}
            </div>
          )}

          {sourceQuestions && sourceQuestions.length > 0 && (
            <>
              <div className={styles.field}>
                <span className={styles.label}>Import mode</span>
                <div className={styles.modes} role="radiogroup" aria-label="Import mode">
                  {gradableTarget.length > 0 && (
                    <label className={[styles.mode, mode === 'merge_criteria' && styles.modeActive].filter(Boolean).join(' ')}>
                      <input
                        type="radio"
                        name="import-mode"
                        checked={mode === 'merge_criteria'}
                        onChange={() => setMode('merge_criteria')}
                      />
                      Match existing questions (criteria)
                    </label>
                  )}
                  <label
                    className={[
                      styles.mode,
                      mode === 'append_questions' && styles.modeActive,
                      !canModifyQuestions && styles.modeDisabled,
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <input
                      type="radio"
                      name="import-mode"
                      disabled={!canModifyQuestions}
                      checked={mode === 'append_questions'}
                      onChange={() => setMode('append_questions')}
                    />
                    Append questions
                  </label>
                  <label
                    className={[
                      styles.mode,
                      mode === 'replace' && styles.modeActive,
                      (!canModifyQuestions || hasGradedAnswers) && styles.modeDisabled,
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <input
                      type="radio"
                      name="import-mode"
                      disabled={!canModifyQuestions || hasGradedAnswers}
                      checked={mode === 'replace'}
                      onChange={() => setMode('replace')}
                    />
                    Replace rubric
                  </label>
                </div>
                {!canModifyQuestions && (
                  <p className={styles.info}>
                    <Info {...icon} size={15} />
                    Questions and answer regions are locked once an assignment leaves draft, so only criteria can be imported onto existing questions.
                  </p>
                )}
              </div>

              {mode === 'merge_criteria' ? (
                <div className={styles.previewBox}>
                  <div className={styles.previewHeader}>
                    <span>Map source questions to this rubric (existing regions are always kept)</span>
                    <span>{plural(activeMappings.length, 'matched question')}</span>
                  </div>
                  <div className={styles.questionList}>
                    {gradableSource.map((q) => {
                      const targetQid = mappings[q.qid] ?? ''
                      return (
                        <div key={q.qid} className={styles.questionCard}>
                          <div className={styles.mapRow}>
                            <span className={styles.questionCheck}>
                              {q.qid}
                              {q.title ? ` · ${q.title}` : ''} ({formatPoints(q.total_score)})
                            </span>
                            <ArrowRight size={14} aria-hidden />
                            <select
                              className={styles.select}
                              aria-label={`Map ${q.qid} to target question`}
                              value={targetQid}
                              onChange={(e) => updateMapping(q.qid, e.target.value)}
                            >
                              <option value="">Skip</option>
                              {gradableTarget.map((tgt) => (
                                <option key={tgt.qid} value={tgt.qid}>
                                  {tgt.qid}
                                  {tgt.title ? ` · ${tgt.title}` : ''} ({formatPoints(tgt.total_score)})
                                </option>
                              ))}
                            </select>
                          </div>
                          {q.criteria.length > 0 && (
                            <div className={styles.criteriaPills}>
                              {q.criteria.map((c, idx) => (
                                <span key={`${q.qid}-${idx}`} className={styles.pill}>
                                  <span className={styles.pillPts}>{formatAdjustment(c.deduction)}</span>
                                  {c.title}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  <div className={styles.options}>
                    <label className={styles.option}>
                      <input
                        type="checkbox"
                        checked={includeQuestionDetails}
                        onChange={(e) => setIncludeQuestionDetails(e.target.checked)}
                      />
                      Also update target titles, points, and scoring mode from source
                    </label>
                    <label className={[styles.option, !canReplaceTargetCriteria && styles.modeDisabled].filter(Boolean).join(' ')}>
                      <input
                        type="checkbox"
                        disabled={!canReplaceTargetCriteria}
                        checked={canReplaceTargetCriteria && replaceUnusedCriteria}
                        onChange={(e) => setReplaceUnusedCriteria(e.target.checked)}
                      />
                      Replace existing criteria on matched questions (only available before any answer is graded)
                    </label>
                  </div>

                  {mappedGradedQids.length > 0 && (
                    <p className={styles.warning}>
                      <AlertTriangle {...icon} size={15} />
                      {mappedGradedQids.join(', ')} already {mappedGradedQids.length === 1 ? 'has' : 'have'} graded submissions. Existing scores stay unchanged, and you can flag those answers for regrade afterwards.
                    </p>
                  )}
                </div>
              ) : (
                <div className={styles.previewBox}>
                  <div className={styles.previewHeader}>
                    <span>
                      Select questions to {mode === 'append_questions' ? 'append' : 'import'} ({selectedTopQids?.size ?? 0} of {sourceTop.length})
                    </span>
                    <button
                      type="button"
                      className={styles.linkBtn}
                      onClick={() =>
                        setSelectionOverride({
                          key: sourceKey,
                          qids: selectedTopQids.size === sourceTop.length ? new Set() : new Set(sourceTop.map((q) => q.qid)),
                        })
                      }
                    >
                      {selectedTopQids?.size === sourceTop.length ? 'Clear all' : 'Select all'}
                    </button>
                  </div>
                  <div className={styles.questionList}>
                    {sourceTop.map((q) => {
                      const parts = partsOf(sourceQuestions, q.qid)
                      const pts = questionPoints(q, parts)
                      const checked = selectedTopQids?.has(q.qid) ?? false
                      const displayQid = mode === 'append_questions' && checked ? appendPreviewQids.get(q.qid) ?? q.qid : q.qid
                      const previewCriteria = parts.length ? parts.flatMap((p) => p.criteria) : q.criteria
                      return (
                        <div key={q.qid} className={styles.questionCard}>
                          <div className={styles.questionTop}>
                            <label className={styles.questionCheck}>
                              <input type="checkbox" checked={checked} onChange={() => toggleTopQid(q.qid)} />
                              <span>
                                {displayQid !== q.qid ? `${q.qid} → ${displayQid}` : q.qid}
                                {q.title ? ` · ${q.title}` : ''}
                              </span>
                            </label>
                            <span className={styles.questionMeta}>
                              {formatPoints(pts)}
                              {parts.length > 0 ? ` · ${plural(parts.length, 'part')}` : ` · ${q.scoring === 'deduct' ? 'deduct' : 'add'}`}
                            </span>
                          </div>
                          {previewCriteria.length > 0 && (
                            <div className={styles.criteriaPills}>
                              {previewCriteria.map((c, idx) => (
                                <span key={`${q.qid}-c-${idx}`} className={styles.pill}>
                                  <span className={styles.pillPts}>{formatAdjustment(c.deduction)}</span>
                                  {c.title}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                  {tab === 'assignment' && hasSourceRegions && (
                    <label className={styles.option}>
                      <input type="checkbox" checked={copyRegions} onChange={(e) => setCopyRegions(e.target.checked)} />
                      Copy answer regions too (only if this exam uses the exact same page layout)
                    </label>
                  )}
                </div>
              )}
            </>
          )}

          {problem && (
            <p className={styles.problem} role="alert">
              {problem}
            </p>
          )}
        </div>

        <div className={styles.actions}>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            type="submit"
            disabled={saving || !sourceQuestions?.length}
          >
            <Download {...icon} size={15} />
            {saving ? 'Importing…' : 'Import rubric'}
          </Button>
        </div>
      </form>
    </div>
  )
}
