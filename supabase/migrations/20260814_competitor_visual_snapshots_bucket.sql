-- Marketplace Visual Intelligence — storage bucket fix-up (Phase 20)
-- Run this in Supabase SQL Editor (not auto-applied)
--
-- Why: the bucket-creation INSERT in 20260814_marketplace_visual_intelligence.sql
-- didn't actually create the bucket -- confirmed via the Storage API directly
-- ("Bucket not found" for competitor-visual-snapshots) even though every
-- other statement in that same script ran correctly, including the
-- storage.objects RLS policies scoped to this exact bucket name. Root cause
-- not confirmed. This re-runs both the bucket insert and the RLS policies --
-- safe even if part of it already succeeded (ON CONFLICT / DROP POLICY IF
-- EXISTS make it idempotent) -- and ends with a SELECT so success is visible
-- immediately in the SQL Editor's result pane, unlike last time.
--
-- If the INSERT still doesn't take: Supabase Dashboard -> Storage -> New
-- bucket -> name exactly `competitor-visual-snapshots`, Public off. The RLS
-- policies below are already scoped to that exact name and apply to it
-- immediately either way, so nothing else needs to change if that fallback
-- is what ends up working.

INSERT INTO storage.buckets (id, name, public)
VALUES ('competitor-visual-snapshots', 'competitor-visual-snapshots', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "competitor_visual_snapshots_select" ON storage.objects;
DROP POLICY IF EXISTS "competitor_visual_snapshots_insert" ON storage.objects;
DROP POLICY IF EXISTS "competitor_visual_snapshots_update" ON storage.objects;
DROP POLICY IF EXISTS "competitor_visual_snapshots_delete" ON storage.objects;

CREATE POLICY "competitor_visual_snapshots_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'competitor-visual-snapshots');
CREATE POLICY "competitor_visual_snapshots_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'competitor-visual-snapshots');
CREATE POLICY "competitor_visual_snapshots_update" ON storage.objects
  FOR UPDATE USING (bucket_id = 'competitor-visual-snapshots');
CREATE POLICY "competitor_visual_snapshots_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'competitor-visual-snapshots');

-- Verify it actually worked this time — should return exactly 1 row.
-- If it returns 0 rows, the INSERT still isn't taking and the Dashboard
-- fallback above is the way to go.
SELECT id, name, public FROM storage.buckets WHERE id = 'competitor-visual-snapshots';
