-- Criterion titles were capped at 50 characters, too short for real rubrics.
ALTER TABLE label ALTER COLUMN title TYPE VARCHAR(500);
