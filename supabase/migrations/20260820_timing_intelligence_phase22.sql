-- Phase 22: Timing Intelligence -- schema only (no seed data)
-- Run this in Supabase SQL Editor (not auto-applied)
--
-- The companion file 20260820_taylor_niche_calendar_v4_seed.sql transcribes
-- the Taylor POD Niche Calendar into these tables. Kept separate on purpose:
-- schema and a specific source's data are reviewable independently, and a
-- future source needs no schema change at all.
--
-- WHY THIS EXISTS
-- Timing was the one intelligence dimension with no evidence layer. What
-- existed: collections.season (free text, 5 of 54 rows set), a
-- collections.launch_date nobody had ever filled in, products.went_live_at
-- unset on all 21 Live products, and src/data/seasons.js's seasonalWindows --
-- 4 hardcoded one-off windows with absolute 2026/2027 dates, imported by
-- Home.jsx and referenced nowhere. classifyKeyword()'s 'Seasonal' branch
-- carries a comment saying outright that no real niche calendar exists to
-- check dates against. This is that calendar.
--
-- THE ONE ARCHITECTURAL RULE THIS SCHEMA ENFORCES
-- Expert guidance is a SOURCE'S claim, never a TCC fact. "Taylor recommends
-- beginning Hockey research in September" must never become "Hockey begins in
-- September." Three structural consequences:
--
--   1. Every assertion carries source_id. There is no unattributed timing row.
--   2. timing_niches deliberately has NO evergreen column, no competition
--      column, no classification of any kind -- those are Taylor's symbols
--      (the calendar's own key: low competition / high competition /
--      evergreen / fast mover / emotion-based), so they live on the guidance
--      row, attributed. A niche row is a name and nothing more.
--   3. guidance_state stores the source's OWN vocabulary verbatim
--      ('START'/'CONTINUE'/'DUE'). TCC's operational states
--      (RESEARCH_NOW/DESIGN_NOW/BUILD_NOW/LIST_NOW/...) are computed in
--      src/lib/timingIntelligence.js and never stored -- they are a function
--      of today's date and would be wrong the moment they were written down.
--
-- SOURCE DISAGREEMENT IS PRESERVED, NOT RECONCILED
-- Taylor saying START-in-August, marketplace activity rising in July, and TCC
-- sales beginning late July are three rows with three source_ids. Nothing
-- merges them. This is why observations do not get their own table: they are
-- the same shape of claim from a different source, and giving them a separate
-- table would be the first step toward silently treating one as more true
-- than the other.
--
-- A NEW CALENDAR EDITION IS A NEW timing_sources ROW, NEVER AN EDIT
-- That is how year-over-year integrity holds: guidance rows point at an
-- immutable source row, so "what did v4.0 say" stays answerable after v5.0
-- lands. Same "historical integrity by value, not by a mutable current-flag"
-- philosophy as Milestone C1/C2.
--
-- IMPORTED-VIA IS NOT EVIDENCE-SOURCE
-- import_session_id (which paste created this row) and source_id (who is
-- actually making the claim) are two separate columns and must never
-- collapse. ChatGPT is routinely the mechanism while Taylor is the source.
--
-- NULL MEANS UNKNOWN, EVERYWHERE
-- Every date part is nullable. The real calendar has niches that appear in a
-- START column and never in any DUE column (Bridesmaid/Maid of Honor
-- Proposal, Officiant Gifts, Best Man Proposal, Hobbies, General Retirement,
-- Summer Sports) -- their target live date is genuinely unknown, and the
-- engine must be able to say so rather than substitute a guess. Same reason
-- lead_time_profiles has every component nullable and ships with zero rows:
-- a fabricated lead time would silently produce a fabricated Latest Safe
-- Start.
--
-- No CHECK constraints anywhere -- consistent with this schema (zero
-- data-validation CHECK constraints exist in any of the 21 prior migrations;
-- vocabulary is plain text validated in JS). guidance_state in particular
-- MUST stay unconstrained: a future source will arrive with a vocabulary
-- nobody has thought of yet.

-- ---------------------------------------------------------------------------
-- Who is asserting
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS timing_sources (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL,
  -- 'expert_guidance' | 'marketplace_observation' | 'tcc_performance'
  -- | 'manual_observation' | 'chatgpt_session' | 'etsy_listing_data'
  source_type    text NOT NULL,
  version        text,
  edition_label  text,
  publisher      text,
  url            text,
  -- Source-level guidance that belongs to the whole document rather than any
  -- one niche -- e.g. Taylor's own "dates are approximate and may shift
  -- slightly depending on the calendar year" and the indexing-runway
  -- rationale behind why DUE precedes the actual event.
  source_notes   text,
  status         text NOT NULL DEFAULT 'active',   -- 'active' | 'archived'
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- The shared niche vocabulary -- names only, no attributes (see rule 2 above)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS timing_niches (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Case-insensitive uniqueness, same technique as visual_tags (Phase 18) --
-- one shared pool so a future source's "Book Reading" resolves to the
-- existing niche instead of minting a near-duplicate.
CREATE UNIQUE INDEX IF NOT EXISTS timing_niches_name_lower_idx
  ON timing_niches (lower(name));

-- ---------------------------------------------------------------------------
-- Niche <-> TCC collection, many-to-many
-- ---------------------------------------------------------------------------
-- Deliberately many-to-many and deliberately human-only. Auto-matching
-- Taylor's "Hockey" onto the Hockey collection at import would be exactly the
-- promote-guidance-to-fact error this whole schema exists to prevent, and
-- would silently lose that Taylor's "Hockey" and TCC's separate "Field Hockey
-- Niche" collection may not be the same thing. It is also what makes the
-- cross-niche case work without a second concept: a seasonal overlay
-- (Christmas) links to many evergreen niches, neither swallowing the other.
-- Same junction shape as Phase 18's collection_tags, including the real uuid
-- FK to collections.id rather than the collection_name-as-text convention
-- most of this app still uses.
CREATE TABLE IF NOT EXISTS timing_niche_collections (
  niche_id       uuid NOT NULL REFERENCES timing_niches(id) ON DELETE CASCADE,
  collection_id  uuid NOT NULL REFERENCES collections(id)   ON DELETE CASCADE,
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (niche_id, collection_id)
);

-- ---------------------------------------------------------------------------
-- The evidence ledger -- append-only, one row per source-asserted claim
-- ---------------------------------------------------------------------------
-- Phase 22's analogue of keyword_history: always append, never overwrite, so
-- what a source said last year survives what it says this year.
CREATE TABLE IF NOT EXISTS timing_guidance (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id             uuid NOT NULL REFERENCES timing_sources(id) ON DELETE CASCADE,
  niche_id              uuid NOT NULL REFERENCES timing_niches(id)  ON DELETE CASCADE,

  -- The niche name exactly as printed in THIS entry. The real calendar prints
  -- the same niche as "Birthday Themes" in Jan/Feb and "Birthday Theme" in
  -- Nov/Dec; niche_id unifies them, this preserves what the page actually said.
  source_niche_label    text,

  -- SOURCE'S OWN WORD, verbatim: 'START' | 'CONTINUE' | 'DUE' for Taylor.
  -- Never a TCC state. Never constrained.
  guidance_state        text NOT NULL,

  month                 integer,   -- 1-12, null = unknown
  day                   integer,   -- null = month-level only
  -- 'month' | 'day'. Taylor gives day precision for DUE (from the monthly
  -- grids) but only month precision for START/CONTINUE -- the distinction is
  -- explicit rather than inferred from day IS NULL, so a future source that
  -- genuinely means "the 1st" can say so.
  date_precision        text,
  recurrence            text NOT NULL DEFAULT 'annual',

  -- Source classification, AS PRINTED ON THIS ENTRY -- not rolled up to the
  -- niche. The real calendar is internally inconsistent (Girls Trip is
  -- low_competition in January, emotion_based in February and March,
  -- low_competition again in December). Storing per-entry keeps that
  -- disagreement visible instead of silently electing a winner.
  -- 'low_competition' | 'high_competition' | 'evergreen' | 'fast_mover' | 'emotion_based'
  classification        text,
  classification_symbol text,   -- the literal glyph as printed

  -- Verbatim guidance text, unsplit. The structured split lives in
  -- timing_guidance_notes; this stays the untouched original because a single
  -- printed note routinely contains two kinds of advice at once.
  guidance_text         text,

  -- 'expert_guidance' | 'observation' | 'hypothesis'
  -- A ChatGPT sentence ("Hockey may be worth starting earlier this year") is
  -- a hypothesis and must never be stored as though it were an observed fact
  -- ("demand increased July 20"). The session importer defaults to the
  -- weakest value for exactly this reason.
  evidence_type         text,

  -- IMPORTED-VIA. Not the evidence source. See header.
  import_session_id     uuid REFERENCES import_sessions(id) ON DELETE SET NULL,

  notes                 text,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS timing_guidance_niche_idx  ON timing_guidance(niche_id);
CREATE INDEX IF NOT EXISTS timing_guidance_source_idx ON timing_guidance(source_id);
-- Supports "this niche's cycle, newest evidence first" without a latest-flag.
CREATE INDEX IF NOT EXISTS timing_guidance_niche_created_idx
  ON timing_guidance(niche_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Structured guidance split
-- ---------------------------------------------------------------------------
-- A real child table rather than an array column on timing_guidance, matching
-- listing_generation_keywords / competitor_listing_tags. Necessary because one
-- printed note can be two types at once -- the calendar's Christmas entry is
-- cross-niche advice AND SEO advice in a single sentence, so it becomes two
-- rows here while guidance_text keeps the original intact.
--
-- guidance_type NULL means unclassified, which is a real and expected state:
-- assigning a type to a mixed sentence is a human judgment, not something to
-- infer at import. assigned_by records whose judgment it was.
CREATE TABLE IF NOT EXISTS timing_guidance_notes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guidance_id    uuid NOT NULL REFERENCES timing_guidance(id) ON DELETE CASCADE,
  -- 'timing' | 'niche' | 'audience' | 'seo' | 'cross_niche' | NULL
  guidance_type  text,
  text           text NOT NULL,
  assigned_by    text,   -- 'import_proposal' | 'user'
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS timing_guidance_notes_guidance_idx
  ON timing_guidance_notes(guidance_id);

-- ---------------------------------------------------------------------------
-- Production lead time
-- ---------------------------------------------------------------------------
-- Ships with ZERO rows on purpose. There is no real evidence of how long TCC
-- takes from research to live, so any seeded default would be invented, and an
-- invented lead time silently produces an invented Latest Safe Start -- the
-- exact failure this phase is built to avoid. Until a profile exists the
-- engine falls back to the source's own month-level phases and says so.
--
-- Every component is nullable and nulls are skipped (never treated as zero)
-- when summing, so a partially-known runway is representable.
--
-- indexing_days is stored and displayed but deliberately NOT subtracted when
-- computing Latest Safe Start: Taylor's DUE date already sits weeks ahead of
-- the actual event precisely because listings need indexing time, so
-- subtracting it again would double-count the same runway.
--
-- source = 'learned' is an inert seam for a future phase that derives real
-- averages from TCC's own workflow history. Nothing writes it today, and
-- nothing can yet -- no product in the shop has a went_live_at.
CREATE TABLE IF NOT EXISTS lead_time_profiles (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL,
  scope          text NOT NULL,   -- 'default' | 'collection' | 'niche'
  collection_id  uuid REFERENCES collections(id)   ON DELETE CASCADE,
  niche_id       uuid REFERENCES timing_niches(id) ON DELETE CASCADE,
  -- 'user_defined' | 'source_attributed' | 'learned'
  source         text NOT NULL DEFAULT 'user_defined',
  source_id      uuid REFERENCES timing_sources(id) ON DELETE SET NULL,

  research_days  integer,
  concept_days   integer,
  design_days    integer,
  mockup_days    integer,
  listing_days   integer,
  indexing_days  integer,

  notes          text,
  status         text NOT NULL DEFAULT 'active',   -- 'active' | 'archived'
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lead_time_profiles_scope_idx ON lead_time_profiles(scope);

-- ---------------------------------------------------------------------------
-- RLS -- TCC is single-user; permissive policies mirror every other table.
-- Not safely re-runnable (Postgres has no CREATE POLICY IF NOT EXISTS) --
-- same caveat as every prior migration's RLS block in this repo.
-- ---------------------------------------------------------------------------
ALTER TABLE timing_sources           ENABLE ROW LEVEL SECURITY;
ALTER TABLE timing_niches            ENABLE ROW LEVEL SECURITY;
ALTER TABLE timing_niche_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE timing_guidance          ENABLE ROW LEVEL SECURITY;
ALTER TABLE timing_guidance_notes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_time_profiles       ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all_timing_sources"           ON timing_sources           FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_timing_niches"            ON timing_niches            FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_timing_niche_collections" ON timing_niche_collections FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_timing_guidance"          ON timing_guidance          FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_timing_guidance_notes"    ON timing_guidance_notes    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_lead_time_profiles"       ON lead_time_profiles       FOR ALL USING (true) WITH CHECK (true);
