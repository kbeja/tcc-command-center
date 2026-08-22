-- Shared Niche Taxonomy — Phase 2a
-- Run this in the Supabase SQL Editor (not auto-applied).
--
-- Purely additive. This migration creates the canonical taxonomy tree and links
-- it to the two vocabularies TCC already has (collections, timing_niches). It
-- changes NO existing column, drops nothing, and no application read path
-- depends on it yet. Running it cannot alter what the app currently shows.
--
-- WHY THIS EXISTS
-- Before this, "what niche is this?" was answered by nine separate free-text
-- labels across six tables -- collections.chapter, collections.parent_chapter
-- (which disagree with each other), collections.name, research_sessions.niche,
-- research_sessions.parent_niche, trend_signals.parent_niche,
-- trend_signals.collection, sparks.collection_tag, concepts.collection_name and
-- products.collection -- every one of them matched by string, so renaming
-- anything silently orphaned rows everywhere else. See
-- docs/taxonomy-architecture-audit.md for the full inventory.
--
-- ---------------------------------------------------------------------------
-- ONE TABLE, NOT THREE
-- ---------------------------------------------------------------------------
-- Broad -> Sub -> Specific could be three tables with three FKs. It is one
-- self-referencing table instead, because the brief's §36 governance
-- requirements are add / rename / archive / REASSIGN / preserve-history. An
-- adjacency list does reparenting with a single UPDATE of parent_id; three
-- tables would need a DELETE+INSERT across two of them and would lose the row's
-- identity (and therefore every FK pointing at it) in the process.
--
-- `level` is stored rather than derived by walking parent_id, so a query can
-- filter "all specific niches" without a recursive CTE. It is redundant with
-- depth by construction, and JS is responsible for keeping the two consistent
-- -- consistent with this schema's total absence of CHECK constraints (zero
-- exist across all 24 prior migrations; vocabulary is validated in JS). A CHECK
-- here would also be actively wrong: the seasonal-crossover design below
-- deliberately allows a two-level branch, and a future source will bring a
-- shape nobody has anticipated.
--
-- ---------------------------------------------------------------------------
-- SEASONAL IS A BRANCH, NOT A SECOND VOCABULARY
-- ---------------------------------------------------------------------------
-- Kristen's decision (2026-08-22): Seasonal is its own broad niche, with
-- Halloween / Christmas / Valentines etc. as sub-niches beneath it, AND the
-- other nine niches can carry a seasonal crossover.
--
-- Those are two USES of one vocabulary, not two vocabularies. A generic
-- Halloween tee is primary-pathed to Seasonal -> Halloween. A Hockey Mom
-- Christmas gift is primary-pathed to Hobbies -> Hockey -> Hockey Mom and
-- ALSO carries Christmas as its seasonal overlay -- pointing at the very same
-- Seasonal -> Christmas row. Later phases add that second reference as
-- seasonal_niche_id on sparks/concepts/products.
--
-- Modelling it this way is what keeps §36's "one canonical taxonomy source"
-- true. The alternative -- a separate seasons table -- would mean two Christmas
-- records that could drift apart, which is exactly the failure this whole
-- migration exists to end.
--
-- ---------------------------------------------------------------------------
-- WHAT IS *NOT* HERE, DELIBERATELY
-- ---------------------------------------------------------------------------
-- No primary_niche_id on sparks / concepts / products, and no keyword_niches
-- junction. Those belong to Phases 3, 4, 7 and 5 respectively, one phase at a
-- time per this project's standing rule. Adding them now would create columns
-- with no UI to populate them and no approval flow behind them.
--
-- No sub-niche or specific-niche seed data. Only the 10 broad niches are
-- seeded, because only they are a fixed, externally-defined list. The ~17
-- specific nodes from the docs/taxonomy-proposal.md triage are a set of
-- human judgment calls and go in one at a time through Phase 2c with
-- approval -- §40 forbids automatic taxonomy assignment, and seeding them here
-- would be exactly that.

-- ---------------------------------------------------------------------------
-- The tree
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS niches (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  name        text NOT NULL,

  -- 'broad' | 'sub' | 'specific'. Plain text, validated in JS (see header).
  level       text NOT NULL,

  -- NULL only for the 10 broad niches. RESTRICT, not CASCADE: deleting a niche
  -- that still has children should fail loudly rather than silently destroy a
  -- whole subtree and every record classified beneath it. §36 asks for ARCHIVE
  -- (status below), and archiving is what the UI will offer -- delete stays
  -- available for genuine mistakes, but only for leaves.
  parent_id   uuid REFERENCES niches(id) ON DELETE RESTRICT,

  -- 'active' | 'archived'. Same convention as collections.status.
  status      text NOT NULL DEFAULT 'active',

  -- 'taylor_90day' | 'tcc_extension'. §38 explicitly asks that TCC-invented
  -- branches stay marked as extensions rather than being presented as part of
  -- the source framework -- the same source-vs-TCC-belief separation Phase 22
  -- already enforces for timing guidance.
  source      text,

  notes       text,

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Sibling names must be unique case-insensitively -- "Hockey Mom" and
-- "hockey mom" under the same parent must not become two rows. Same technique
-- as visual_tags (Phase 18) and timing_niches (Phase 22): a lower() unique
-- index, not the citext extension, which this codebase has never used.
--
-- The COALESCE is load-bearing and easy to miss. Postgres treats NULLs as
-- DISTINCT in a unique index by default, so a plain (parent_id, lower(name))
-- index would happily allow two broad niches both named 'Hobbies', since both
-- have parent_id NULL and NULL <> NULL. Folding NULL to a fixed sentinel uuid
-- makes the 10 root rows compete in one namespace like every other sibling set.
-- (PG15's NULLS NOT DISTINCT would also work; COALESCE is version-independent
-- and states the intent inline.)
CREATE UNIQUE INDEX IF NOT EXISTS niches_parent_name_ci_unique_idx
  ON niches (COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));

-- "Give me the children of X" is the single most common read this table will
-- serve (every picker, every tree render). parent_id is not the leading column
-- of the unique index above -- that index leads with a COALESCE expression, so
-- it cannot serve a plain parent_id lookup -- hence its own index here.
CREATE INDEX IF NOT EXISTS niches_parent_id_idx ON niches(parent_id);
CREATE INDEX IF NOT EXISTS niches_level_status_idx ON niches(level, status);

-- ---------------------------------------------------------------------------
-- niche <-> collection, many-to-many
-- ---------------------------------------------------------------------------
-- Collections SURVIVE as a separate curated layer (§5 is explicit: do not
-- replace, do not remove). This junction is what lets the two coexist: the
-- "Morally Gray Society" collection can span Romance Reader and Fantasy Reader
-- without either swallowing it, and a niche can have many collections.
--
-- Real uuid FK to collections(id), not collections.name -- following the
-- convention every NEW relationship in this app has used since Phase 18
-- (collection_tags, timing_niche_collections), rather than the legacy
-- soft-label text matching that this whole migration exists to replace.
CREATE TABLE IF NOT EXISTS niche_collections (
  niche_id       uuid NOT NULL REFERENCES niches(id)      ON DELETE CASCADE,
  collection_id  uuid NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (niche_id, collection_id)
);

-- ---------------------------------------------------------------------------
-- niche <-> Phase 22 timing niche, many-to-many
-- ---------------------------------------------------------------------------
-- timing_niches holds the names a SOURCE printed (Taylor's calendar: "Hockey",
-- "Book Reading", "Birthday Themes"). niches holds what TCC believes. Phase 22
-- deliberately refused to auto-match its niches onto collections, on the
-- grounds that promoting a source's claim to TCC fact silently destroys the
-- distinction -- and Taylor's "Hockey" and TCC's "Hockey Mom" genuinely are
-- not the same object. That reasoning applies here unchanged, so this is a
-- human-populated junction too. Nothing in this migration writes a single row
-- into it.
--
-- This is also the link that makes the seasonal crossover work end to end:
-- Seasonal -> Christmas connects to the timing calendar's Christmas entry, so
-- a niche can inherit real, sourced launch-window guidance rather than a
-- guessed date.
CREATE TABLE IF NOT EXISTS niche_timing_niches (
  niche_id         uuid NOT NULL REFERENCES niches(id)        ON DELETE CASCADE,
  timing_niche_id  uuid NOT NULL REFERENCES timing_niches(id) ON DELETE CASCADE,
  created_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (niche_id, timing_niche_id)
);

-- Trailing columns of the composite PKs need their own indexes -- a composite
-- btree only serves lookups on its leading column for free. Same note as
-- Phase 18's concept_tags/collection_tags.
CREATE INDEX IF NOT EXISTS niche_collections_collection_id_idx  ON niche_collections(collection_id);
CREATE INDEX IF NOT EXISTS niche_timing_niches_timing_id_idx    ON niche_timing_niches(timing_niche_id);

-- ---------------------------------------------------------------------------
-- updated_at trigger -- reuses the existing shared function
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS niches_set_updated_at ON niches;
CREATE TRIGGER niches_set_updated_at
  BEFORE UPDATE ON niches
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
-- TCC is single-user; permissive policies mirror every other table.
-- NOT safely re-runnable -- Postgres has no CREATE POLICY IF NOT EXISTS. Same
-- caveat as every prior migration's RLS block in this repo: if you are re-running
-- this file, expect "policy already exists" here and ignore it. Everything
-- above this point is idempotent.
ALTER TABLE niches              ENABLE ROW LEVEL SECURITY;
ALTER TABLE niche_collections   ENABLE ROW LEVEL SECURITY;
ALTER TABLE niche_timing_niches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all_niches"              ON niches              FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_niche_collections"   ON niche_collections   FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_niche_timing_niches" ON niche_timing_niches FOR ALL USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- Seed: the 10 broad niches
-- ---------------------------------------------------------------------------
-- The 9 from Taylor's 90-Day Challenge, plus Seasonal as a TCC extension
-- (Kristen, 2026-08-22 -- see the seasonal-crossover note in the header).
--
-- WHERE NOT EXISTS rather than ON CONFLICT DO NOTHING: the unique index above
-- is on an EXPRESSION, so ON CONFLICT would need that whole COALESCE(...)
-- expression restated as its conflict target to infer the right index. The
-- NOT EXISTS form is what this repo already uses for idempotent seeds
-- (supabase-migrate.sql step 6) and reads far more plainly.
INSERT INTO niches (name, level, parent_id, source)
SELECT v.name, 'broad', NULL, v.source
FROM (VALUES
  ('Wedding',        'taylor_90day'),
  ('Funny',          'taylor_90day'),
  ('Birthday',       'taylor_90day'),
  ('Relationships',  'taylor_90day'),
  ('Christian',      'taylor_90day'),
  ('Hobbies',        'taylor_90day'),
  ('Professions',    'taylor_90day'),
  ('Pets',           'taylor_90day'),
  ('Social Justice', 'taylor_90day'),
  ('Seasonal',       'tcc_extension')
) AS v(name, source)
WHERE NOT EXISTS (
  SELECT 1 FROM niches n
  WHERE n.parent_id IS NULL AND lower(n.name) = lower(v.name)
);

-- ---------------------------------------------------------------------------
-- Verify (optional -- run after the above, expect 10 rows, all level='broad')
-- ---------------------------------------------------------------------------
-- SELECT name, level, source, status FROM niches WHERE parent_id IS NULL ORDER BY name;
