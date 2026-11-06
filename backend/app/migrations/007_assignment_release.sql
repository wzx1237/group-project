-- When grades were released to students; NULL while they're still hidden.
-- IF NOT EXISTS: some local databases already got this column from an earlier draft of this migration.
ALTER TABLE assignment ADD COLUMN IF NOT EXISTS released_at TIMESTAMPTZ;
