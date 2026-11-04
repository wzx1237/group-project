-- Database v2 current-state schema. For a NEW empty database only.
-- Fresh install only; migrate_v2.sql handles the previous versioned schema.
-- One exam belongs to one course offering. A course offering is identified by code+term.
BEGIN;

-- Replaces the separate course_exam join table for the one-course-per-exam case.
CREATE TABLE Exam (
  exam_ID INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  course_ID INT NOT NULL REFERENCES course(course_ID) ON DELETE CASCADE,
  exam_name VARCHAR(100) NOT NULL,
  due DATE,
  blank_pdf TEXT,             -- file path
  answer_key_pdf TEXT         -- file path
);

-- Name/email/directory identity are read from student, not duplicated per paper.
CREATE TABLE StudentPaper (
  exam_ID INT NOT NULL REFERENCES Exam(exam_ID) ON DELETE CASCADE,
  UID TEXT NOT NULL REFERENCES student(UID) ON DELETE CASCADE,
  scanned_PDF TEXT NOT NULL,
  comments TEXT,
  PRIMARY KEY (exam_ID, UID)
);

-- Preserve the grading model; relationship tables contain current rows only.
CREATE TABLE Rubric (
  exam_ID INT NOT NULL REFERENCES Exam(exam_ID) ON DELETE CASCADE,
  QID VARCHAR(50),
  grading_method VARCHAR(50) NOT NULL,
  total_scores DECIMAL(5, 2),
  title TEXT,
  region JSON,
  PRIMARY KEY (exam_ID, QID)
);

CREATE TABLE Label (
  exam_ID INT NOT NULL REFERENCES Exam(exam_ID) ON DELETE CASCADE,
  label_ID INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title VARCHAR(50) NOT NULL,
  description TEXT,
  deduction DECIMAL(5, 2),
  UNIQUE (exam_ID, label_ID)
);

CREATE TABLE Mapping (
  exam_ID INT NOT NULL,
  UID TEXT,
  QID VARCHAR(50),
  directory_ID TEXT,
  status VARCHAR(50),
  PRIMARY KEY (exam_ID, UID, QID),
  FOREIGN KEY (exam_ID, UID) REFERENCES StudentPaper(exam_ID, UID) ON DELETE CASCADE,
  FOREIGN KEY (exam_ID, QID) REFERENCES Rubric(exam_ID, QID) ON DELETE CASCADE,
  FOREIGN KEY (directory_ID) REFERENCES staff(directory_ID) ON DELETE SET NULL
);

CREATE TABLE Decision (
  exam_ID INT NOT NULL,
  record_ID INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  UID TEXT NOT NULL,
  QID VARCHAR(50) NOT NULL,
  scores DECIMAL(5, 2),
  comments_remark TEXT,             -- available to the student only
  internal_node TEXT,               -- available to the grader only
  UNIQUE (exam_ID, record_ID),
  -- One current decision per assigned student-question, as in the prototype.
  UNIQUE (exam_ID, UID, QID),
  FOREIGN KEY (exam_ID, UID, QID) REFERENCES Mapping(exam_ID, UID, QID) ON DELETE CASCADE
);

CREATE TABLE Rubric_Label (
  exam_ID INT NOT NULL,
  QID VARCHAR(50),
  label_ID INT,
  PRIMARY KEY (exam_ID, QID, label_ID),
  FOREIGN KEY (exam_ID, QID) REFERENCES Rubric(exam_ID, QID) ON DELETE CASCADE,
  FOREIGN KEY (exam_ID, label_ID) REFERENCES Label(exam_ID, label_ID) ON DELETE CASCADE
);

CREATE TABLE Decision_Label (
  exam_ID INT NOT NULL,
  record_ID INT,
  label_ID INT,
  directory_ID TEXT,
  PRIMARY KEY (exam_ID, record_ID, label_ID),
  FOREIGN KEY (exam_ID, record_ID) REFERENCES Decision(exam_ID, record_ID) ON DELETE CASCADE,
  FOREIGN KEY (exam_ID, label_ID) REFERENCES Label(exam_ID, label_ID) ON DELETE CASCADE,
  FOREIGN KEY (directory_ID) REFERENCES staff(directory_ID) ON DELETE SET NULL
);

-- Deliberately no redundant course_id in StudentPaper/Mapping/Decision_Label.
-- Backend must check the course via Exam when accepting papers and assigning/grading:
--   StudentPaper.uid must be enrolled in Exam.course_id.
--   Mapping.directory_id and Decision_Label.directory_id must be current course_staff.
-- These course-membership rules are NOT enforced by the foreign keys above.
-- Label deductions may be positive or negative; score is the direct sum of
-- deductions selected in the current Decision_Label relationship version.
-- No new version column is added to Rubric or Decision.

-- Committed events wait here only until the JSONL exporter acknowledges them.
-- No foreign keys point back to business rows: deleting an exam must not delete
-- its pending audit events before those events have reached their history file.
CREATE TABLE audit_outbox (
  event_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_uuid UUID NOT NULL DEFAULT gen_random_uuid(),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  transaction_id BIGINT NOT NULL DEFAULT txid_current(),
  schema_name TEXT NOT NULL,
  table_name TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE', 'BASELINE')),
  row_key JSONB NOT NULL,
  old_data JSONB,
  new_data JSONB,
  actor_id TEXT DEFAULT NULLIF(current_setting('gradeflow.actor_id', true), ''),
  request_id TEXT DEFAULT NULLIF(current_setting('gradeflow.request_id', true), ''),
  db_user TEXT NOT NULL DEFAULT current_user
);

CREATE FUNCTION audit_capture_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  before_row JSONB;
  after_row JSONB;
  key_values JSONB;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN before_row := to_jsonb(OLD); END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN after_row := to_jsonb(NEW); END IF;
  SELECT jsonb_object_agg(k.column_name, COALESCE(after_row, before_row) -> k.column_name)
    INTO key_values FROM unnest(TG_ARGV) AS k(column_name);
  -- Use the actual business table's schema, not an assumed public search_path.
  EXECUTE format('INSERT INTO %I.audit_outbox
                  (schema_name, table_name, operation, row_key, old_data, new_data)
                  VALUES ($1, $2, $3, $4, $5, $6)', TG_TABLE_SCHEMA)
    USING TG_TABLE_SCHEMA, TG_TABLE_NAME, TG_OP, key_values, before_row, after_row;
  RETURN NULL; -- AFTER triggers do not replace the business row.
END $$;

CREATE FUNCTION audit_reject_truncate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- TRUNCATE has no per-row OLD image. Force an auditable DELETE instead.
  RAISE EXCEPTION 'TRUNCATE is disabled on audited tables; use DELETE instead'
    USING ERRCODE = '0A000';
END $$;


CREATE TRIGGER audit_change AFTER INSERT OR UPDATE OR DELETE ON exam
  FOR EACH ROW EXECUTE FUNCTION audit_capture_change('exam_id');
CREATE TRIGGER audit_no_truncate BEFORE TRUNCATE ON exam
  FOR EACH STATEMENT EXECUTE FUNCTION audit_reject_truncate();
CREATE TRIGGER audit_change AFTER INSERT OR UPDATE OR DELETE ON studentpaper
  FOR EACH ROW EXECUTE FUNCTION audit_capture_change('exam_id', 'uid');
CREATE TRIGGER audit_no_truncate BEFORE TRUNCATE ON studentpaper
  FOR EACH STATEMENT EXECUTE FUNCTION audit_reject_truncate();
CREATE TRIGGER audit_change AFTER INSERT OR UPDATE OR DELETE ON rubric
  FOR EACH ROW EXECUTE FUNCTION audit_capture_change('exam_id', 'qid');
CREATE TRIGGER audit_no_truncate BEFORE TRUNCATE ON rubric
  FOR EACH STATEMENT EXECUTE FUNCTION audit_reject_truncate();
CREATE TRIGGER audit_change AFTER INSERT OR UPDATE OR DELETE ON label
  FOR EACH ROW EXECUTE FUNCTION audit_capture_change('label_id');
CREATE TRIGGER audit_no_truncate BEFORE TRUNCATE ON label
  FOR EACH STATEMENT EXECUTE FUNCTION audit_reject_truncate();
CREATE TRIGGER audit_change AFTER INSERT OR UPDATE OR DELETE ON mapping
  FOR EACH ROW EXECUTE FUNCTION audit_capture_change('exam_id', 'uid', 'qid');
CREATE TRIGGER audit_no_truncate BEFORE TRUNCATE ON mapping
  FOR EACH STATEMENT EXECUTE FUNCTION audit_reject_truncate();
CREATE TRIGGER audit_change AFTER INSERT OR UPDATE OR DELETE ON decision
  FOR EACH ROW EXECUTE FUNCTION audit_capture_change('record_id');
CREATE TRIGGER audit_no_truncate BEFORE TRUNCATE ON decision
  FOR EACH STATEMENT EXECUTE FUNCTION audit_reject_truncate();
CREATE TRIGGER audit_change AFTER INSERT OR UPDATE OR DELETE ON rubric_label
  FOR EACH ROW EXECUTE FUNCTION audit_capture_change('exam_id', 'qid', 'label_id');
CREATE TRIGGER audit_no_truncate BEFORE TRUNCATE ON rubric_label
  FOR EACH STATEMENT EXECUTE FUNCTION audit_reject_truncate();
CREATE TRIGGER audit_change AFTER INSERT OR UPDATE OR DELETE ON decision_label
  FOR EACH ROW EXECUTE FUNCTION audit_capture_change('exam_id', 'record_id', 'label_id');
CREATE TRIGGER audit_no_truncate BEFORE TRUNCATE ON decision_label
  FOR EACH STATEMENT EXECUTE FUNCTION audit_reject_truncate();

COMMIT;
