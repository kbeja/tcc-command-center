-- Marketplace Visual Intelligence Migration (Phase 20)
-- Run this in Supabase SQL Editor (not auto-applied)
--
-- Why: competitor_listings tracks extensive text/tag/performance data per
-- listing but has never captured any image, and no vision analysis has ever
-- touched competitor data (the existing Claude vision calls in
-- claude-process.js are 100% scoped to TCC's own Concepts). This adds a
-- competitor image_url column, a per-listing "Visual Profile" observation
-- table, and a junction back to Phase 18's visual_tags vocabulary -- exactly
-- the extension point that migration's own header comment anticipated
-- ("Phase 19 [now 20] can classify competitor/marketplace visuals against
-- this exact same vocabulary later by adding one more junction table").
--
-- visual_profiles is APPEND-ONLY, one row per analysis run, never
-- overwritten -- deliberately mirrors keyword_history's evidence-ledger
-- shape (20260813_research_intelligence.sql). Kristen's own spec says not to
-- design this schema in a way that blocks a later phase that scores
-- lifecycle (Emerging -> Growing -> Common -> Saturated -> Declining) --
-- that's inherently a function of how observations change over *time*, so a
-- mutable single-row-per-listing design would destroy exactly the history
-- that later phase needs the moment a listing gets re-analyzed. Re-analysis
-- is human-gated and expected to be infrequent, so the append-only cost is
-- negligible. "Current" state reads via current_visual_profiles (below)
-- rather than a mutable latest-flag, so there's no write-time bookkeeping
-- that can drift out of sync.
--
-- competitor_listing_tags is the ONLY place typography/composition/
-- treatment/aesthetic/motif values live -- they are NOT also duplicated
-- inside design_profile/mockup_profile jsonb. Those jsonb columns hold only
-- the *non-taxonomy* attributes (palette, density, garment color, mockup
-- staging, etc.) -- values with no controlled vocabulary to check against.
-- Putting the same 5 categories in both places would create two disagreeing
-- answers the moment a tag gets manually corrected via VisualTagPicker
-- (junction changes, a frozen historical jsonb blob doesn't), and jsonb's
-- usual justification here -- "avoid a migration for every new term" --
-- doesn't actually apply, since visual_tags already solves that with a
-- plain insert (that's the whole reason Phase 18 built it that way instead
-- of a CHECK-constrained enum).
--
-- The junction's primary key is (visual_profile_id, tag_id, category), not
-- just (visual_profile_id, tag_id) -- several of this phase's own taxonomy
-- terms legitimately span categories ("western" is both a Typography style
-- and an Aesthetic; "modern patchwork" is both a Treatment and an
-- Aesthetic), so the same tag can validly apply twice on one listing under
-- two different dimensions. category is a plain text column (not a CHECK
-- constraint / enum type) for the same reason `source` stays free text
-- throughout this app -- see src/lib/visualTaxonomy.js for the
-- application-level list (TAXONOMY_CATEGORIES) this is validated against.
--
-- image_url is the ONLY thing captured automatically (by the browser
-- extension, going forward -- see extension/src/content.js). Nothing is
-- fetched, resized, or stored until a human explicitly triggers analysis on
-- a specific listing -- no bulk/automatic image library, per Kristen's
-- explicit instruction. The bucket below stores exactly what
-- netlify/functions/fetch-image.js already returns, unresized -- this
-- codebase has no server-side image-processing library (checked
-- package.json directly: no sharp/jimp/anything capable), and Claude's
-- vision endpoint already downscales past ~1568px internally regardless.
--
-- Bucket + its RLS policies are created together in THIS file, not split
-- across a manual Dashboard step and a later migration -- design-vault
-- (20260805_design_intelligence.sql) was created via a separate manual
-- Dashboard step and its RLS didn't ship until
-- 20260807_design_vault_storage_rls.sql, two days later, during which every
-- single upload silently failed. Not repeating that here.

-- ─── competitor_listings: add image capture ────────────────────────────────
ALTER TABLE competitor_listings ADD COLUMN IF NOT EXISTS image_url text;

-- ─── visual_profiles: append-only per-analysis-run observation ────────────
-- status has NO default on purpose -- the writer (analyze-visual.js) must
-- always set it explicitly to 'complete' / 'failed' / 'image_unavailable';
-- a silent default of 'complete' would let a bug quietly claim success.
CREATE TABLE IF NOT EXISTS visual_profiles (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id            uuid NOT NULL REFERENCES competitor_listings(id) ON DELETE CASCADE,
  analyzed_at           timestamptz NOT NULL DEFAULT now(),
  model                 text,
  taxonomy_version      text,
  source_image_url      text,
  snapshot_storage_path text,
  design_profile        jsonb,
  mockup_profile        jsonb,
  design_confidence     text,
  mockup_confidence     text,
  analysis_notes        text,
  status                text NOT NULL,
  failure_reason        text,
  input_tokens          integer,
  output_tokens         integer
);

CREATE INDEX IF NOT EXISTS visual_profiles_listing_id_idx ON visual_profiles(listing_id);
-- Supports the "current profile per listing" DISTINCT ON query below.
CREATE INDEX IF NOT EXISTS visual_profiles_listing_analyzed_idx ON visual_profiles(listing_id, analyzed_at DESC);

-- ─── competitor_listing_tags: junction to Phase 18's shared visual_tags ────
CREATE TABLE IF NOT EXISTS competitor_listing_tags (
  visual_profile_id  uuid NOT NULL REFERENCES visual_profiles(id) ON DELETE CASCADE,
  tag_id             uuid NOT NULL REFERENCES visual_tags(id) ON DELETE CASCADE,
  category           text NOT NULL,
  confidence         text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (visual_profile_id, tag_id, category)
);

-- tag_id is not the leading PK column, so it needs its own index for
-- "which listings carry this tag" lookups -- same reasoning as
-- concept_tags_tag_id_idx / collection_tags_tag_id_idx in Phase 18.
CREATE INDEX IF NOT EXISTS competitor_listing_tags_tag_id_idx ON competitor_listing_tags(tag_id);

-- ─── current_visual_profiles: latest-per-listing convenience view ─────────
CREATE OR REPLACE VIEW current_visual_profiles AS
SELECT DISTINCT ON (listing_id) *
FROM visual_profiles
ORDER BY listing_id, analyzed_at DESC;

-- RLS -- TCC is single-user; permissive policy mirrors every other table.
-- Not safely re-runnable (Postgres has no CREATE POLICY IF NOT EXISTS) --
-- same caveat as every prior migration's RLS block in this repo.
ALTER TABLE visual_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitor_listing_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all_visual_profiles" ON visual_profiles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_competitor_listing_tags" ON competitor_listing_tags FOR ALL USING (true) WITH CHECK (true);
-- current_visual_profiles reads through visual_profiles, whose allow-all
-- policy above already covers it -- no separate policy needed for the view.

-- ─── Storage bucket: competitor-visual-snapshots ───────────────────────────
-- Created via SQL here (not a manual Dashboard step -- see header comment).
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

-- ─── visual_tags seed: first real content in this table ───────────────────
-- Phase 18 shipped visual_tags with zero rows -- nothing has ever been
-- tagged with it (confirmed live). Seeding it with this phase's own
-- controlled vocabulary (src/lib/visualTaxonomy.js is the JS source of
-- truth this list is transcribed from -- keep both in sync by hand if
-- either changes) gives Concepts/Collections tagging a running start too,
-- not just competitor listings -- the "one shared pool" Phase 18 was built
-- for. Each name appears once even though several apply under more than one
-- category (see header) -- category is only recorded per-application, on
-- competitor_listing_tags, not as a property of the vocabulary term itself.
INSERT INTO visual_tags (name) VALUES
  ('varsity'), ('collegiate'), ('serif'), ('editorial serif'), ('retro serif'),
  ('script'), ('handwritten'), ('bubble'), ('sans serif'), ('condensed'),
  ('western'), ('blackletter'), ('mixed typography'),
  ('arch'), ('stacked'), ('sandwich'), ('grid'), ('crest'), ('badge'),
  ('circular'), ('oversized center'), ('minimal center'), ('icon row'), ('pocket + back'),
  ('clean'), ('distressed'), ('patchwork'), ('modern patchwork'), ('doodle'),
  ('hand-drawn'), ('watercolor'), ('halftone'), ('embroidered-look'), ('puff-look'), ('vintage wash'),
  ('elevated sports'), ('coquette'), ('romantic gothic'), ('dark academia'), ('preppy'),
  ('retro collegiate'), ('minimalist'), ('dopamine'), ('camp'),
  ('bow'), ('skeleton'), ('floral'), ('hockey stick'), ('football'), ('books'), ('ghost'), ('cherry'), ('raccoon')
ON CONFLICT (lower(name)) DO NOTHING;
