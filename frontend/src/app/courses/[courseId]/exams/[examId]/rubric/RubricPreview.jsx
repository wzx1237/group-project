export function RubricPreview({ questions }) {
  const totalPts = questions.reduce((sum, q) => sum + (Number(q.total_score) || 0), 0)

  return (
    <>
      <div className="suggestion">
        <strong>
          {questions.length} question{questions.length === 1 ? '' : 's'} · {totalPts} pts
        </strong>
      </div>

      {questions.map((q, i) => (
        <div key={q.qid} className="upload-row">
          <strong>
            Q{i + 1}
            {q.title ? ` · ${q.title}` : ''} ({q.total_score} pts)
          </strong>
          <ul>
            {q.criteria.map((c) => (
              <li key={c.label_id}>
                {c.deduction >= 0 ? '+' : ''}
                {c.deduction} pts — {c.title}
              </li>
            ))}
          </ul>
        </div>
      ))}

    </>
  )
}

export function previewIssueCount(questions) {
  return questions.filter((q) => !q.title.trim() || q.criteria.length === 0).length
}
