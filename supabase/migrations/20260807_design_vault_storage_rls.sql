-- Design Vault Storage RLS Migration
-- Run this in Supabase SQL Editor (not auto-applied)
--
-- Why: the design-vault bucket (created in 20260805_design_intelligence.sql)
-- was never given storage.objects RLS policies. Supabase enables RLS on
-- storage.objects by default, so with no policies every read/write to the
-- bucket is denied — uploads fail with "new row violates row-level security
-- policy" even though the bucket itself exists and the table-level policies
-- on concepts/concept_assets/concept_outputs are fine. This is why no image
-- has ever successfully been uploaded via the Visuals or Mood Board tabs.

DROP POLICY IF EXISTS "design_vault_select" ON storage.objects;
DROP POLICY IF EXISTS "design_vault_insert" ON storage.objects;
DROP POLICY IF EXISTS "design_vault_update" ON storage.objects;
DROP POLICY IF EXISTS "design_vault_delete" ON storage.objects;

-- TCC is single-user; permissive policies scoped to this bucket only, mirroring
-- the "allow_all" pattern already used for every table in this app.

CREATE POLICY "design_vault_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'design-vault');

CREATE POLICY "design_vault_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'design-vault');

CREATE POLICY "design_vault_update" ON storage.objects
  FOR UPDATE USING (bucket_id = 'design-vault');

CREATE POLICY "design_vault_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'design-vault');
