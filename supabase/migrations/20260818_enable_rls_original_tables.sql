-- SEC-002: Enable RLS on the 12 original tables
-- Run this in Supabase SQL Editor (not auto-applied)
--
-- Why: these 12 tables predate this repo's supabase/migrations/ convention
-- and have never had Row Level Security enabled -- confirmed via grep across
-- every file in supabase/migrations/, zero ENABLE ROW LEVEL SECURITY
-- statements for any of them. Every table added since 2026-08-05 (15 tables --
-- see e.g. concepts/concept_assets/concept_outputs in
-- 20260805_design_intelligence.sql) already has RLS enabled with a
-- permissive "allow_all" policy. This migration brings these 12 up to the
-- same standard so the whole database is consistent. TCC is single-user and
-- the anon key is meant to have full access, same as it does today -- this
-- is not a new restriction, it's closing the "RLS disabled entirely" gap
-- (which Supabase's own dashboard advisor flags) while keeping effective
-- access identical to right now.
--
-- Storage bucket RLS (storage.objects -- see
-- 20260807_design_vault_storage_rls.sql) is a separate mechanism and out of
-- scope here: none of these 12 are storage buckets.
--
-- Not safely re-runnable (Postgres has no CREATE POLICY IF NOT EXISTS) --
-- same caveat as every prior migration's RLS block in this repo. Run this
-- whole file in one paste/Run in the SQL Editor, not statement-by-statement --
-- Postgres treats a multi-statement script submitted as a single query as one
-- implicit transaction, so there is no window where a table is RLS-enabled
-- with zero policies attached (which would otherwise deny all access, even
-- to the anon key, until the policy statement ran).

ALTER TABLE products            ENABLE ROW LEVEL SECURITY;
ALTER TABLE sparks              ENABLE ROW LEVEL SECURITY;
ALTER TABLE keywords            ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_sessions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE codex_entries       ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitor_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE playbooks           ENABLE ROW LEVEL SECURITY;
ALTER TABLE playbook_sections   ENABLE ROW LEVEL SECURITY;
ALTER TABLE workshop_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE experiments         ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_history      ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_updates     ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all_products"            ON products            FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_sparks"              ON sparks              FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_keywords"            ON keywords            FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_research_sessions"   ON research_sessions   FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_codex_entries"       ON codex_entries       FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_competitor_listings" ON competitor_listings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_playbooks"           ON playbooks           FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_playbook_sections"   ON playbook_sections   FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_workshop_items"      ON workshop_items      FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_experiments"         ON experiments         FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_import_history"      ON import_history      FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_pending_updates"     ON pending_updates     FOR ALL USING (true) WITH CHECK (true);
