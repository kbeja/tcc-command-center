-- Phase 8b — Etsy Marketplace Insights capture + research evidence storage
-- Run this in the Supabase SQL Editor (not auto-applied).
--
-- Four columns on keyword_history, one new table, one storage bucket.
-- Nothing existing is modified and nothing is backfilled.
--
-- ---------------------------------------------------------------------------
-- WHY THESE FIELDS AND NOT AN "ETSY" TABLE
-- ---------------------------------------------------------------------------
-- keyword_history is already the per-source evidence ledger (Phase 19): one
-- row per source reading, append-only, and `source` is free text precisely so
-- a new source is a new string rather than a schema change. Etsy Marketplace
-- Insights is already a valid source value in the Research form.
--
-- What it reports that no existing column holds:
--   * Etsy's own conversion classification for the term ("Typical", etc.)
--   * trend % versus the prior period
--   * the similar search terms Etsy lists alongside it
--   * the listing price range / median purchase price where shown
--
-- These go on keyword_history rather than keywords because they are readings —
-- what Etsy said on a given day — not properties of the term. Same reason
-- volume and competition live there. A second reading next month appends; it
-- does not overwrite, and §3's "do not combine sources into a mystery score"
-- stays structurally guaranteed because no column here is shared across
-- sources.
--
-- Every column is nullable and no other source populates them. eRank and
-- EverBee readings simply leave them null, which is what keeps the ledger
-- honest about which source knew what.
ALTER TABLE keyword_history ADD COLUMN IF NOT EXISTS conversion_class text;
ALTER TABLE keyword_history ADD COLUMN IF NOT EXISTS trend_pct        numeric;
ALTER TABLE keyword_history ADD COLUMN IF NOT EXISTS similar_terms    text[];
ALTER TABLE keyword_history ADD COLUMN IF NOT EXISTS price_range      text;

-- The sampling caveat, §14: "Etsy states the data is based on a sample of
-- aggregated Etsy marketplace activity. Preserve that as source context. Do
-- not treat the data as a perfect census." Stored per reading rather than
-- assumed in the UI, so a future source with a different caveat can carry its
-- own instead of inheriting Etsy's.
ALTER TABLE keyword_history ADD COLUMN IF NOT EXISTS source_caveat text;

-- ---------------------------------------------------------------------------
-- research_evidence — the screenshot trail (§16)
-- ---------------------------------------------------------------------------
-- §16 is explicit that there is no CSV export in this workflow, that no fake
-- automatic Etsy importer should be built, and that the original evidence
-- should be stored where practical. The intended path is:
--
--     Screenshot -> extraction suggestion -> HUMAN REVIEW -> structured data
--
-- This table is the first and last step of that: it holds the captured image
-- and, once a human has reviewed it, links to the research session the
-- approved numbers landed in. extracted_text is nullable and exists for a
-- future extraction step; nothing populates it yet, and nothing should
-- populate the keyword rows from it without review (§29 rules out automatic
-- screenshot OCR without review).
--
-- reviewed_at being NULL is the meaningful state: evidence captured but not
-- yet turned into data. That is a queue, not a defect.
CREATE TABLE IF NOT EXISTS research_evidence (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  research_session_id uuid REFERENCES research_sessions(id) ON DELETE SET NULL,
  niche_id            uuid REFERENCES niches(id)            ON DELETE SET NULL,

  source              text,        -- 'Etsy Marketplace Insights', 'eRank', …
  storage_path        text NOT NULL,   -- path inside the research-evidence bucket
  mime_type           text,
  size_bytes          bigint,

  captured_at         date,        -- the date the SCREEN showed, not the upload date
  label               text,
  extracted_text      text,        -- reserved for a future extraction step
  reviewed_at         timestamptz, -- NULL = captured, not yet turned into data
  notes               text,

  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS research_evidence_session_idx ON research_evidence(research_session_id);
CREATE INDEX IF NOT EXISTS research_evidence_niche_idx   ON research_evidence(niche_id);
-- Partial index: the "what still needs reviewing" queue is the read this
-- serves constantly, and it only ever looks at unreviewed rows.
CREATE INDEX IF NOT EXISTS research_evidence_unreviewed_idx
  ON research_evidence(created_at DESC) WHERE reviewed_at IS NULL;

ALTER TABLE research_evidence ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_research_evidence" ON research_evidence FOR ALL USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- Storage bucket
-- ---------------------------------------------------------------------------
-- Same shape as design-vault and competitor-visual-snapshots. Note the known
-- failure mode recorded in 20260814_competitor_visual_snapshots_bucket.sql:
-- this INSERT has silently not taken effect before, even while every other
-- statement in the same script ran. The SELECT at the end makes success
-- visible in the SQL Editor's result pane instead of assumed.
--
-- If the bucket does not appear: Supabase Dashboard -> Storage -> New bucket,
-- name exactly `research-evidence`, Public OFF. The policies below are already
-- scoped to that name and apply immediately either way.
INSERT INTO storage.buckets (id, name, public)
VALUES ('research-evidence', 'research-evidence', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "research_evidence_select" ON storage.objects;
DROP POLICY IF EXISTS "research_evidence_insert" ON storage.objects;
DROP POLICY IF EXISTS "research_evidence_update" ON storage.objects;
DROP POLICY IF EXISTS "research_evidence_delete" ON storage.objects;

CREATE POLICY "research_evidence_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'research-evidence');
CREATE POLICY "research_evidence_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'research-evidence');
CREATE POLICY "research_evidence_update" ON storage.objects
  FOR UPDATE USING (bucket_id = 'research-evidence');
CREATE POLICY "research_evidence_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'research-evidence');

-- Success is visible rather than assumed — expect one row.
SELECT id, name, public FROM storage.buckets WHERE id = 'research-evidence';

-- ---------------------------------------------------------------------------
-- Verify (optional)
-- ---------------------------------------------------------------------------
-- SELECT count(*) AS readings,
--        count(conversion_class) AS with_etsy_conversion
-- FROM keyword_history;
-- SELECT count(*) FROM research_evidence;
