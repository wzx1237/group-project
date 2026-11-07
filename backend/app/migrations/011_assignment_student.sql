-- One row per enrolled student per assignment once it leaves draft. "Graded" is not stored:
-- assignment_student_progress works it out from mapping, so it can't drift from the real grades.
--   missing      no scan yet
--   needs_review a scan was read as this student but nobody has confirmed it
--   matched      has a scan
--   excused      makeup pending; becomes matched when the makeup scan is matched
--   no_show      did not take it; counts as 0
CREATE TABLE assignment_student (
  exam_id INT NOT NULL REFERENCES assignment(exam_id) ON DELETE CASCADE,
  uid TEXT NOT NULL REFERENCES student(uid) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'missing'
    CHECK (status IN ('missing', 'needs_review', 'matched', 'excused', 'no_show')),
  set_by TEXT REFERENCES staff(directory_id) ON DELETE SET NULL,  -- NULL when set by automatic matching
  set_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  note TEXT,
  PRIMARY KEY (exam_id, uid)
);
CREATE INDEX assignment_student_status ON assignment_student (exam_id, status);

CREATE TRIGGER audit_change AFTER INSERT OR UPDATE OR DELETE ON assignment_student
  FOR EACH ROW EXECUTE FUNCTION audit_capture_change('exam_id', 'uid');
CREATE TRIGGER audit_no_truncate BEFORE TRUNCATE ON assignment_student
  FOR EACH STATEMENT EXECUTE FUNCTION audit_reject_truncate();

-- Questions that are graded on their own: a question with parts (2 -> 2.a, 2.b) is graded through its parts.
CREATE VIEW gradable_question AS
SELECT r.* FROM rubric r
WHERE NOT EXISTS (SELECT 1 FROM rubric p WHERE p.exam_id = r.exam_id AND p.qid LIKE r.qid || '.%');

-- Each student's status with grading progress from mapping. A no-show counts as graded (score 0).
-- `enrolled` is false once the student is dropped; workflow checks ignore those rows.
CREATE VIEW assignment_student_progress AS
SELECT s.exam_id, s.uid, s.status, s.set_by, s.set_at, s.note,
       en.uid IS NOT NULL AS enrolled,
       q.questions, g.finished,
       CASE s.status
         WHEN 'no_show' THEN true
         WHEN 'matched' THEN q.questions > 0 AND g.finished = q.questions
         ELSE false
       END AS graded
FROM assignment_student s
JOIN assignment a USING (exam_id)
LEFT JOIN enrollment en ON en.course_id = a.course_id AND en.uid = s.uid AND COALESCE(en.status, 'active') = 'active'
CROSS JOIN LATERAL (SELECT count(*) AS questions FROM gradable_question gq WHERE gq.exam_id = s.exam_id) q
CROSS JOIN LATERAL (SELECT count(*) AS finished FROM mapping m JOIN gradable_question gq USING (exam_id, qid)
                    WHERE m.exam_id = s.exam_id AND m.uid = s.uid AND lower(m.status) = 'finished') g;

-- Existing assignments past draft: every enrolled student, matched if they already have a paper.
-- Matches still only in data/db.json are filled in by the startup sync (workflow.sync_all).
INSERT INTO assignment_student (exam_id, uid, status)
SELECT a.exam_id, en.uid,
       CASE WHEN EXISTS (SELECT 1 FROM studentpaper p WHERE p.exam_id = a.exam_id AND p.uid = en.uid)
            THEN 'matched' ELSE 'missing' END
FROM assignment a JOIN enrollment en USING (course_id)
WHERE a.status <> 'draft' AND COALESCE(en.status, 'active') = 'active';
