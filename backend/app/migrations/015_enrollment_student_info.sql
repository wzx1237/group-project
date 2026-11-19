-- store course-scoped student name and email on enrollment so adding a uid in one course never overwrites another course
ALTER TABLE enrollment ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE enrollment ADD COLUMN IF NOT EXISTS email TEXT;

-- backfill existing enrollments from global student rows
UPDATE enrollment en
SET name = s.name,
    email = COALESCE(en.email, s.email)
FROM student s
WHERE s.uid = en.uid AND en.name IS NULL;
