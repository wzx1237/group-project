-- Regrade queues (proposal 3.5). Each regrade event, a split criterion or graded answers flagged for another look, gets
-- its own queue, so separate issues on one question are worked through separately. An answer waiting in an open queue
-- is 'Regrade' in mapping and keeps its score until a grader reviews it in that queue.

-- A split criterion is retired: it stays on the answers that had it until they are reviewed, but can't be applied again.
-- Its replacements record which criterion they came from.
ALTER TABLE label ADD COLUMN retired_at TIMESTAMPTZ;
ALTER TABLE label ADD COLUMN split_from INT;

CREATE TABLE regrade_queue (
  queue_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  exam_id INT NOT NULL,
  qid VARCHAR(50) NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('split', 'flag')),
  reason TEXT NOT NULL,
  label_id INT,  -- the criterion a split replaced
  created_by TEXT REFERENCES staff(directory_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  closed_by TEXT REFERENCES staff(directory_id) ON DELETE SET NULL,
  closed_at TIMESTAMPTZ,
  UNIQUE (queue_id, exam_id, qid),
  FOREIGN KEY (exam_id, qid) REFERENCES rubric(exam_id, qid) ON DELETE CASCADE,
  FOREIGN KEY (exam_id, label_id) REFERENCES label(exam_id, label_id)
);

CREATE TABLE regrade_item (
  queue_id INT NOT NULL,
  exam_id INT NOT NULL,
  uid TEXT NOT NULL,
  qid VARCHAR(50) NOT NULL,
  resolved_by TEXT REFERENCES staff(directory_id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  PRIMARY KEY (queue_id, uid),
  FOREIGN KEY (queue_id, exam_id, qid) REFERENCES regrade_queue(queue_id, exam_id, qid) ON DELETE CASCADE,
  FOREIGN KEY (exam_id, uid, qid) REFERENCES mapping(exam_id, uid, qid) ON DELETE CASCADE
);
CREATE INDEX regrade_item_waiting ON regrade_item (exam_id, uid, qid) WHERE resolved_at IS NULL;

CREATE TRIGGER audit_change AFTER INSERT OR UPDATE OR DELETE ON regrade_queue
  FOR EACH ROW EXECUTE FUNCTION audit_capture_change('queue_id');
CREATE TRIGGER audit_no_truncate BEFORE TRUNCATE ON regrade_queue
  FOR EACH STATEMENT EXECUTE FUNCTION audit_reject_truncate();
CREATE TRIGGER audit_change AFTER INSERT OR UPDATE OR DELETE ON regrade_item
  FOR EACH ROW EXECUTE FUNCTION audit_capture_change('queue_id', 'uid');
CREATE TRIGGER audit_no_truncate BEFORE TRUNCATE ON regrade_item
  FOR EACH STATEMENT EXECUTE FUNCTION audit_reject_truncate();

-- Adding a criterion used to mark every answer to its question 'Regrade', with nothing to find them by. On assignments
-- still open, graded ones go into one queue per question so they can be reviewed. Grades already released stand, and
-- answers that were never graded go back to waiting.
INSERT INTO regrade_queue (exam_id, qid, kind, reason)
SELECT DISTINCT m.exam_id, m.qid, 'flag', 'Rubric changed after these answers were graded'
FROM mapping m JOIN decision d USING (exam_id, uid, qid) JOIN assignment a USING (exam_id)
WHERE lower(m.status) = 'regrade' AND d.scores IS NOT NULL AND a.status <> 'closed';

INSERT INTO regrade_item (queue_id, exam_id, uid, qid)
SELECT q.queue_id, m.exam_id, m.uid, m.qid
FROM regrade_queue q JOIN mapping m USING (exam_id, qid) JOIN decision d USING (exam_id, uid, qid)
WHERE lower(m.status) = 'regrade' AND d.scores IS NOT NULL;

UPDATE mapping m SET status = CASE
    WHEN EXISTS (SELECT 1 FROM decision d
                 WHERE (d.exam_id, d.uid, d.qid) = (m.exam_id, m.uid, m.qid) AND d.scores IS NOT NULL) THEN 'Finished'
    WHEN EXISTS (SELECT 1 FROM decision d WHERE (d.exam_id, d.uid, d.qid) = (m.exam_id, m.uid, m.qid)) THEN 'InProgress'
    ELSE 'Pending' END
WHERE lower(m.status) = 'regrade'
  AND NOT EXISTS (SELECT 1 FROM regrade_item i WHERE (i.exam_id, i.uid, i.qid) = (m.exam_id, m.uid, m.qid));
