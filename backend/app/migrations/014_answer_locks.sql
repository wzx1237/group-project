-- Who is grading an answer right now, so two graders never edit it at once (proposal 3.6). A lock is a lease: the
-- grading page renews it while the grader is working on the answer and it lapses by itself when they stop. qid '' is
-- the student's overall comment, which no question can be called. Saved grades are audited; these short-lived rows are
-- not.
CREATE TABLE answer_lock (
  exam_id INT NOT NULL,
  uid TEXT NOT NULL,
  qid VARCHAR(50) NOT NULL,
  holder TEXT NOT NULL REFERENCES staff(directory_id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (exam_id, uid, qid),
  FOREIGN KEY (exam_id, uid) REFERENCES studentpaper(exam_id, uid) ON DELETE CASCADE
);
