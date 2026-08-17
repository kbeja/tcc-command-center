-- TRC-011: Create the missing import_history table
-- Run this in Supabase SQL Editor (not auto-applied)
--
-- Why: discovered while writing the SEC-002 RLS migration (see
-- 20260818_enable_rls_original_tables.sql) that import_history was never
-- actually created -- confirmed via a failed migration run ("relation
-- 'import_history' does not exist") and directly via the REST API
-- (GET /rest/v1/import_history -> PGRST205). Five call sites have been
-- writing to it with no error checking since each was written
-- (EverbeeCSVImport.jsx x2, EtsyCSVImport.jsx, PinterestCSVImport.jsx,
-- WeeklyReview.jsx) -- every insert has silently no-op'd. Nothing reads
-- from import_history anywhere, so this was never visibly broken.
--
-- Columns match the insert shape used by all 5 call sites exactly --
-- no columns added beyond what's already being written.

CREATE TABLE IF NOT EXISTS import_history (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_type     text NOT NULL,
  imported_at     timestamptz NOT NULL,
  records_updated integer,
  notes           text
);

-- RLS -- TCC is single-user; permissive policy mirrors every other table
-- (see concepts/concept_assets/concept_outputs in 20260805_design_intelligence.sql,
-- import_sessions in 20260811_import_sessions.sql).
-- Not safely re-runnable (Postgres has no CREATE POLICY IF NOT EXISTS) --
-- same caveat as every prior migration's RLS block in this repo.
ALTER TABLE import_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_import_history" ON import_history FOR ALL USING (true) WITH CHECK (true);
