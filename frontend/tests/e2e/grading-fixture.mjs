import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createRequire } from 'node:module'

const reactPdfRequire = createRequire(resolve('node_modules/react-pdf/package.json'))

const criterion = (id, qid) => ({ label_id: id, title: `Correct ${qid}`, description: '', deduction: 0, applied: 1 })
const question = (qid, title, id, page) => ({ qid, title, total_score: 10, scoring: 'deduct', graded: 1, criteria: [criterion(id, qid)], region: { page, x: .1, y: .2, width: .8, height: .3 } })

// A generated blank PDF keeps the browser test independent of real student scans and network CDNs.
function pdf() {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R 5 0 R 7 0 R] /Count 3 >>']
  for (let page = 1; page <= 3; page++) {
    const text = `BT /F1 16 Tf 60 700 Td (Sample exam - page ${page}) Tj ET`
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 9 0 R >> >> /Contents ${objects.length + 2} 0 R >>`)
    objects.push(`<< /Length ${text.length} >>\nstream\n${text}\nendstream`)
  }
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
  let value = '%PDF-1.4\n', offsets = [0]
  for (let i = 0; i < objects.length; i++) { offsets.push(Buffer.byteLength(value)); value += `${i + 1} 0 obj\n${objects[i]}\nendobj\n` }
  const start = Buffer.byteLength(value)
  value += `xref\n0 ${offsets.length}\n0000000000 65535 f \n${offsets.slice(1).map((n) => String(n).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`
  return Buffer.from(value)
}

export async function installGradingFixture(page) {
  const state = {
    rubric: { questions: [question('Q1', 'Logic', '101', 1), question('Q2', 'Functions', '201', 2), question('Q3', 'Proof', '301', 3)] },
    decisions: { '111': { Q1: { criteria: ['101'], comment: null, internal_note: null, score: 10, version: 1, grader_directory_id: 'ta1' } }, '222': {} },
    comments: {}, queues: [], locks: [], mutations: [], failDecision: false,
  }
  const students = [{ uid: '111', name: 'Alice Adams', email: 'alice@example.edu' }, { uid: '222', name: 'Bob Brown', email: 'bob@example.edu' }, { uid: '333', name: 'No Scan', email: 'absent@example.edu' }]
  const exam = { id: 'midterm-2', title: 'Midterm 2', status: 'grading', kind: 'exam', due: '2026-11-18', progress: { total: 2, graded: 0 }, uploads: [{ id: 'upload-1', uploaded_at: '2026-11-19T14:00:00Z', submissions: [{ id: 'paper-111', filename: 'alice.pdf' }, { id: 'paper-222', filename: 'bob.pdf' }] }] }
  const course = { course_id: 1, code: 'CMSC250', title: 'Discrete Structures', term: 'Fall 2026', role: 'ta', assignments: [exam] }
  const staff = [{ directory_id: 'ta1', name: 'Alex TA', role: 'ta' }]
  const progress = () => ({
    questions: state.rubric.questions.map((q) => ({ qid: q.qid, total: 2, finished: ['111', '222'].filter((uid) => state.decisions[uid]?.[q.qid]?.criteria.length).length, regrade: 0 })),
    students: students.slice(0, 2).map((s) => {
      const answers = Object.fromEntries(state.rubric.questions.map((q) => [q.qid, state.queues.some((queue) => queue.qid === q.qid && queue.pending_student_uids.includes(s.uid)) ? 'regrade' : state.decisions[s.uid]?.[q.qid]?.criteria.length ? 'finished' : 'pending']))
      const finished = Object.values(answers).filter((s) => s === 'finished').length
      return { uid: s.uid, name: s.name, answers, finished, questions: 3, regrade: 0, status: finished ? 'in_progress' : 'not_started' }
    }),
  })

  // Preload the matching PDF.js handler in its supported main-thread mode. Worker module
  // requests bypass request interception in some Chromium versions; tests need no CDN access.
  const worker = readFileSync(reactPdfRequire.resolve('pdfjs-dist/build/pdf.worker.min.mjs'), 'utf8')
  const exported = /export\s*\{\s*([\w$]+)\s+as\s+WorkerMessageHandler\s*\};?\s*$/
  if (!exported.test(worker)) throw new Error('Unexpected PDF.js worker export')
  // Closing-page beacons outlive route interception; keep test cleanup away from real APIs.
  await page.addInitScript(() => { navigator.sendBeacon = () => true })
  await page.addInitScript({ content: `(() => { ${worker.replace(exported, 'globalThis.pdfjsWorker = {WorkerMessageHandler: $1};')} })();` })
  await page.route('**/api/**', async (route) => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname.replace(/^\/api/, ''), method = req.method()
    const body = method === 'GET' || !req.postData() ? null : req.postDataJSON()
    if (method !== 'GET') state.mutations.push({ path, method, body })
    const json = (value, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) })
    if (path === '/auth/me') return json({ directory_id: 'ta1', name: 'Alex TA', role: 'ta' })
    if (path === '/courses') return json([course])
    if (path === '/course') return json({ course, assignments: [exam] })
    if (path === '/courses/1/staff') return json(staff)
    if (path === '/courses/1/roster') return json(students)
    if (path === '/assignments/midterm-2/roster') return json({ students: students.map((s) => ({ ...s, submission: s.uid === '333' ? null : { upload_id: 'upload-1', submission_id: `paper-${s.uid}` } })) })
    if (path === '/assignments/midterm-2/question-progress') return json(progress())
    if (path === '/assignments/midterm-2/queue') return json(['111', '222'].flatMap((uid) => state.rubric.questions.map((q) => ({ student_uid: uid, qid: q.qid, status: state.decisions[uid]?.[q.qid]?.criteria.length ? 'done' : 'pending', grader_directory_id: state.decisions[uid]?.[q.qid]?.grader_directory_id ?? null }))))
    if (path === '/assignments/midterm-2/decisions') {
      const uid = url.searchParams.get('student_uid')
      return json(uid ? { [uid]: state.decisions[uid] ?? {} } : state.decisions)
    }
    if (path === '/assignments/midterm-2/rubric') return json(state.rubric)
    if (path === '/rubrics/sources') return json([])
    if (path.endsWith('/file')) return route.fulfill({ status: 200, contentType: 'application/pdf', body: pdf() })
    if (path.endsWith('/locks/release')) { state.locks = []; return route.fulfill({ status: 204 }) }
    if (path.endsWith('/locks')) return json(state.locks)
    if (path.endsWith('/lock')) return json({ qid: path.split('/').at(-2), mine: true, holder: 'ta1', holder_name: 'Alex TA' })
    const decision = path.match(/\/submissions\/([^/]+)\/questions\/([^/]+)\/decision$/)
    if (decision) {
      const [, uid, qid] = decision
      if (state.failDecision) return json({ detail: { message: 'This answer changed since you opened it, so it was reloaded', stale: true } }, 409)
      const current = state.decisions[uid]?.[qid]
      if (body.version !== (current?.version ?? 0)) return json({ detail: 'Stale grading version' }, 409)
      const q = state.rubric.questions.find((q) => q.qid === qid)
      const score = Math.max(0, q.total_score + q.criteria.filter((c) => body.criteria.includes(c.label_id)).reduce((n, c) => n + c.deduction, 0))
      const saved = { ...body, score, version: (current?.version ?? 0) + 1, grader_directory_id: 'ta1', student_uid: uid, qid }
      state.decisions[uid] = { ...state.decisions[uid], [qid]: saved }
      return json(saved)
    }
    const comment = path.match(/\/submissions\/([^/]+)\/comment$/)
    if (comment) { if (body) state.comments[comment[1]] = body.comment; return json({ comment: state.comments[comment[1]] ?? null }) }
    const create = path.match(/\/rubric\/questions\/([^/]+)\/criteria$/)
    if (create && method === 'POST') {
      const q = state.rubric.questions.find((q) => q.qid === create[1])
      const value = { ...body, label_id: '999', applied: 0 }; q.criteria.push(value); return json(value)
    }
    const editQuestion = path.match(/\/rubric\/questions\/([^/]+)$/)
    if (editQuestion && method === 'PATCH') { const q = state.rubric.questions.find((q) => q.qid === editQuestion[1]); Object.assign(q, body); return json(q) }
    const editCriterion = path.match(/\/rubric\/criteria\/([^/]+)$/)
    if (editCriterion && method === 'PATCH') {
      const c = state.rubric.questions.flatMap((q) => q.criteria).find((c) => c.label_id === editCriterion[1]); Object.assign(c, body); return json(c)
    }
    if (path === '/assignments/midterm-2/regrade-queues') {
      if (body) {
        const value = { id: 'review-1', qid: body.qid, kind: 'flag', reason: body.reason, items: [{ student_uid: '111', resolved_at: null }], pending_student_uids: ['111'], closed_at: null }
        state.queues.push(value); return json(value)
      }
      return json(state.queues)
    }
    if (path === '/assignments/midterm-2/regrade-queues/review-1') return json(state.queues[0])
    return json({ detail: `Unmocked ${method} ${path}` }, 404)
  })
  return state
}
