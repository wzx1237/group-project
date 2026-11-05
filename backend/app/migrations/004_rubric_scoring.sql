-- How a question is scored: 'deduct' starts at full points and labels take points off,
-- 'add' starts at 0 and labels add points. Either way the score stays between 0 and total_scores.
-- Existing questions were scored by adding labels up from 0, so they keep 'add'.
ALTER TABLE Rubric ADD COLUMN scoring VARCHAR(10) NOT NULL DEFAULT 'add' CHECK (scoring IN ('add', 'deduct'));
