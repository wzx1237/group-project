-- Assignments replace exams: the table is renamed so 'kind' (exam, quiz, homework, ...) makes sense.
-- Column names such as exam_id and exam_name are unchanged, so foreign keys and queries on them keep working.
-- The audit triggers move with the table; new audit events record the table as 'assignment'.
ALTER TABLE exam RENAME TO assignment;
ALTER TABLE assignment RENAME CONSTRAINT exam_pkey TO assignment_pkey;
ALTER TABLE assignment RENAME CONSTRAINT exam_course_slug TO assignment_course_slug;

ALTER TABLE assignment ADD COLUMN kind TEXT NOT NULL DEFAULT 'exam'
  CHECK (kind IN ('exam', 'final exam', 'homework', 'lab', 'quiz', 'essay', 'other'));
-- Short display label such as 'Q1' or 'Final'. When it is NULL, callers fall back to slug.
ALTER TABLE assignment ADD COLUMN short TEXT;

-- The slug is the assignment's ID in URLs. Rows made before 005 (or without one) get a generated slug.
UPDATE assignment SET slug = 'assignment-' || exam_id WHERE slug IS NULL;
ALTER TABLE assignment ALTER COLUMN slug SET NOT NULL;
