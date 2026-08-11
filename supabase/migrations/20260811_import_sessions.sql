-- Import Session Provenance Migration (Phase 14 — session-origin metadata)
-- Run this in Supabase SQL Editor (not auto-applied)
--
-- Why: SessionSummaryParser's paste format shows a DATE:/SOURCE: header
-- (e.g. "DATE: 2026-07-09" / "SOURCE: Claude") right after
-- --- SESSION SUMMARY --- in the placeholder text, but nothing has ever
-- parsed it -- every record created from an import gets a hardcoded
-- source: 'Session Import' literal and today's save-time date instead of
-- the actual conversation's date/source. This adds one import_sessions
-- row per paste/import event (not per-item -- a single paste can produce
-- many sparks/research/workshop/concept rows, all sharing one origin)
-- plus a nullable session_id FK on every object type SessionSummaryParser
-- creates, so provenance survives without duplicating date/source columns
-- four times over.
--
-- Nullable session_id FKs, ON DELETE SET NULL -- same pattern as
-- concepts.spark_id / concepts.research_session_id / products.concept_id.
-- Deleting an import_sessions row should never take the records it
-- produced down with it.

CREATE TABLE IF NOT EXISTS import_sessions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date       date,                   -- best-effort parsed from the pasted "DATE:" line; null if missing/unparseable
  source     text,                   -- from the pasted "SOURCE:" line, or the standalone modal's manual Source input
  raw_text   text NOT NULL,          -- the FULL original pasted text (header included), never per-item
  created_at timestamptz NOT NULL DEFAULT now()  -- when it was imported into TCC -- distinct from `date`, which is when the conversation happened
);

ALTER TABLE sparks            ADD COLUMN IF NOT EXISTS session_id uuid REFERENCES import_sessions(id) ON DELETE SET NULL;
ALTER TABLE research_sessions ADD COLUMN IF NOT EXISTS session_id uuid REFERENCES import_sessions(id) ON DELETE SET NULL;
ALTER TABLE workshop_items    ADD COLUMN IF NOT EXISTS session_id uuid REFERENCES import_sessions(id) ON DELETE SET NULL;
ALTER TABLE concepts          ADD COLUMN IF NOT EXISTS session_id uuid REFERENCES import_sessions(id) ON DELETE SET NULL;

-- RLS -- TCC is single-user; permissive policy mirrors every other table
-- (see concepts/concept_assets/concept_outputs in 20260805_design_intelligence.sql).
-- Note: unlike the CREATE TABLE/ADD COLUMN lines above, this is not safely
-- re-runnable (Postgres has no CREATE POLICY IF NOT EXISTS) -- if this file
-- is ever run a second time, this one line will error harmlessly.
ALTER TABLE import_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_import_sessions" ON import_sessions FOR ALL USING (true) WITH CHECK (true);
