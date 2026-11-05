-- The exam's ID in the upload store (data/db.json), such as quiz-1, so pages can keep using it.
ALTER TABLE Exam ADD COLUMN slug TEXT;
ALTER TABLE Exam ADD CONSTRAINT exam_course_slug UNIQUE (course_id, slug);
