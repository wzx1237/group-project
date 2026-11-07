-- The most an assignment can score, set when it is created or edited. NULL when it hasn't been set.
-- Existing assignments keep NULL; callers can fall back to the sum of the rubric's question scores.
ALTER TABLE assignment ADD COLUMN total_points NUMERIC(6, 2) CHECK (total_points >= 0);
