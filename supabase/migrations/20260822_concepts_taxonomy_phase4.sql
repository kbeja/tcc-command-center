-- Phase 4 — Concepts: taxonomy link, seasonal overlay, and tag kinds
-- Run this in the Supabase SQL Editor (not auto-applied).
--
-- Purely additive. Three nullable columns, no backfill, no existing column
-- touched, no row deleted. Every current query keeps working unchanged.
--
-- ---------------------------------------------------------------------------
-- 1. concepts.primary_niche_id
-- ---------------------------------------------------------------------------
-- Same shape as sparks.primary_niche_id from Phase 3: a single nullable FK,
-- not a junction, because §4 gives every object ONE primary taxonomy path and
-- reserves many-to-many for keywords (§29). ON DELETE SET NULL so archiving a
-- niche never destroys the design work filed under it.
--
-- This is also what makes §11's inheritance real: a concept created from a
-- spark now has somewhere to receive the spark's classification instead of
-- asking for it again. The copy happens in application code (createConcept),
-- not a trigger -- inheritance is a default the human can override at creation,
-- and a DB trigger would make it silent and unoverridable.
ALTER TABLE concepts
  ADD COLUMN IF NOT EXISTS primary_niche_id uuid REFERENCES niches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS concepts_primary_niche_id_idx ON concepts(primary_niche_id);

-- ---------------------------------------------------------------------------
-- 2. concepts.seasonal_niche_id — the §1.1 crossover, made real
-- ---------------------------------------------------------------------------
-- Points into the SAME niches table, at the Seasonal branch. This is the
-- second half of the design settled in docs/taxonomy-proposal.md §1.1: one
-- vocabulary used two ways.
--
--   A generic Halloween tee ....... primary = Seasonal -> Halloween
--   A Hockey Mom Christmas gift ... primary = Hobbies -> Hockey -> Hockey Mom
--                                   seasonal = Seasonal -> Christmas
--
-- Both point at the same row. A separate seasons table would have meant two
-- Christmas records free to drift apart, which is the failure the whole rework
-- exists to end. It also means the seasonal overlay inherits real sourced
-- launch windows through niche_timing_niches, rather than a guessed date.
--
-- concepts.seasonal_flag is deliberately NOT dropped or migrated. It is free
-- text and is currently carrying genuine prose, not a flag -- the live
-- "Coquette Skeleton" concept has "Halloween 2026 — BUILD NOW. August
-- development falls inside…" in it. That is a note worth keeping; parsing a
-- niche out of it would be guessing. The two coexist: seasonal_flag keeps the
-- reasoning, seasonal_niche_id carries the structured link.
--
-- No CHECK constraining this to the Seasonal branch, consistent with this
-- schema having zero CHECK constraints anywhere. The UI restricts the picker to
-- Seasonal's descendants; the column itself stays permissive so an unforeseen
-- overlay (a sports season, say) is not blocked by a constraint written today.
ALTER TABLE concepts
  ADD COLUMN IF NOT EXISTS seasonal_niche_id uuid REFERENCES niches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS concepts_seasonal_niche_id_idx ON concepts(seasonal_niche_id);

-- ---------------------------------------------------------------------------
-- 3. visual_tags.kind
-- ---------------------------------------------------------------------------
-- §6 requires Design Style and Aesthetic to be separate concepts, and Kristen
-- ruled (2026-08-22) that design styles live as tags rather than as taxonomy
-- levels. visual_tags is already the right home -- one shared controlled
-- vocabulary with junctions to concepts and collections -- but it is currently
-- one undifferentiated pool, so "show me every crest design" and "show me
-- everything dark academia" are the same query.
--
-- The 54 existing tags visibly span FOUR kinds, not two:
--   aesthetic   — dark academia, coquette, preppy, dopamine, romantic gothic
--   design_style— crest, badge, varsity, arch, stacked, patchwork, puff-look
--   typography  — serif, script, blackletter, condensed, handwritten
--   motif       — books, bow, ghost, skeleton, hockey stick, raccoon
--
-- All four are offered. Typography and motif are not padding: they are already
-- present in the data in numbers, and collapsing them into design_style would
-- make "which layout works" unanswerable, which is one of the questions §27
-- wants asked.
--
-- LEFT NULL ON EVERY EXISTING ROW, DELIBERATELY. Sorting 54 tags into four
-- buckets is exactly the kind of judgment §40 reserves for a human, and several
-- are genuinely ambiguous ("collegiate" is arguably aesthetic or design_style;
-- "camp" could be aesthetic or motif). NULL renders as "Unsorted" in the UI and
-- is filterable, so the work can be done a few at a time rather than as one
-- blocking chore. A reviewed classification will be offered separately.
ALTER TABLE visual_tags
  ADD COLUMN IF NOT EXISTS kind text;

CREATE INDEX IF NOT EXISTS visual_tags_kind_idx ON visual_tags(kind);

-- ---------------------------------------------------------------------------
-- Verify (optional — run after the above)
-- ---------------------------------------------------------------------------
-- Expect 2 concepts, both with NULL niche columns, and 54 tags all NULL kind.
--
-- SELECT count(*) AS concepts,
--        count(primary_niche_id)  AS with_niche,
--        count(seasonal_niche_id) AS with_season
-- FROM concepts;
--
-- SELECT COALESCE(kind, '(unsorted)') AS kind, count(*)
-- FROM visual_tags GROUP BY 1 ORDER BY 2 DESC;
