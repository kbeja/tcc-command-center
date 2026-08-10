-- Experiments Schema Fix Migration
-- Run this in Supabase SQL Editor (not auto-applied)
--
-- Why: the live `experiments` table predates the current Knowledge >
-- Experiments tab UI and is missing 9 columns that UI already tries to
-- write on every create/checkpoint/close action -- creating an experiment
-- fails today with a "column does not exist" error. Table has 0 rows, so
-- this is purely additive; nothing existing to preserve or migrate.
--
-- Also found live-testing after the column fix: the legacy `name` column
-- is NOT NULL, but current code writes `title` and never touches `name`
-- at all -- every insert was still failing (silently, since the create
-- call site doesn't surface the error) on a not-null violation. Dropping
-- the constraint is enough; `name` just stays permanently unused, same as
-- `end_date`/`source`/`notes`.

ALTER TABLE experiments ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE experiments ADD COLUMN IF NOT EXISTS metric text;
ALTER TABLE experiments ADD COLUMN IF NOT EXISTS collection text;
ALTER TABLE experiments ADD COLUMN IF NOT EXISTS timeline_days integer;
ALTER TABLE experiments ADD COLUMN IF NOT EXISTS reference_url text;
ALTER TABLE experiments ADD COLUMN IF NOT EXISTS checkpoints jsonb DEFAULT '[]'::jsonb;
ALTER TABLE experiments ADD COLUMN IF NOT EXISTS started_at timestamptz;
ALTER TABLE experiments ADD COLUMN IF NOT EXISTS result_notes text;
ALTER TABLE experiments ADD COLUMN IF NOT EXISTS closed_at timestamptz;
ALTER TABLE experiments ALTER COLUMN name DROP NOT NULL;
