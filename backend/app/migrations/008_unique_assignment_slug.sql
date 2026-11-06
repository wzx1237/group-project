-- A slug names the assignment's upload folders and templates and appears in API URLs, so two courses can't share one.
-- If two already do, every copy after the first gets its exam_id added so the constraint can be added.
UPDATE assignment a SET slug = a.slug || '-' || a.exam_id
WHERE EXISTS (SELECT 1 FROM assignment b WHERE b.slug = a.slug AND b.exam_id < a.exam_id);

ALTER TABLE assignment ADD CONSTRAINT assignment_slug_key UNIQUE (slug);
