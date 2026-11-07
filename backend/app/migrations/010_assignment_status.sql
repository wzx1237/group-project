-- Where an assignment is in its workflow. The CHECK only limits the values; app/workflow.py decides which moves are allowed.
--   draft      instructor sets up the blank exam, regions and rubric
--   collecting TAs upload scans and match them to students
--   grading    TAs grade
--   in_review  instructor reviews and can regrade
--   closed     locked; grades are released to students (released_at is when it closed)
ALTER TABLE assignment ADD COLUMN status TEXT NOT NULL DEFAULT 'draft'
  CHECK (status IN ('draft', 'collecting', 'grading', 'in_review', 'closed'));

-- Existing assignments: released -> closed; has papers -> grading; has a blank exam and a rubric -> collecting.
UPDATE assignment a SET status = CASE
  WHEN a.released_at IS NOT NULL THEN 'closed'
  WHEN EXISTS (SELECT 1 FROM studentpaper p WHERE p.exam_id = a.exam_id) THEN 'grading'
  WHEN a.blank_pdf IS NOT NULL AND EXISTS (SELECT 1 FROM rubric r WHERE r.exam_id = a.exam_id) THEN 'collecting'
  ELSE 'draft'
END;
