-- Research Intelligence + SEO Evidence Layer Migration (Phase 19)
-- Run this in Supabase SQL Editor (not auto-applied)
--
-- Why: EverBee, eRank, and Etsy Marketplace Insights routinely report very
-- different numbers for the same keyword -- expected, since they measure
-- demand differently, not a data-quality problem to average away. Today
-- TCC has nowhere to preserve more than one source's numbers per keyword:
-- createResearchSession()'s merge logic (src/lib/hooks.js) matches on
-- (collection, keyword text) only, not source, so importing the same
-- keyword from a second source overwrites the first source's live values
-- outright. The one place a superseded value survives -- keyword_history,
-- added earlier this session -- has zero readers anywhere in the app and
-- is only ever written when an existing match gets overwritten, never on
-- a keyword's first sighting. This migration turns keyword_history into
-- the real, always-append, per-source evidence ledger (Layer 1 -- Fact),
-- and adds a small set of derived interpretation columns to keywords
-- (Layer 2 -- Interpretation: classification, confidence, trend, source
-- disagreement, a human-readable "why", and an actionable research
-- status) computed by a new deterministic engine
-- (src/lib/keywordIntelligence.js) from that evidence. Fact and
-- Interpretation are deliberately two different tables/columns, never
-- collapsed into one -- see this project's standing "never let AI/TCC
-- interpretation silently overwrite raw evidence" rule.
--
-- Sources stay free text (not an enum) on every table here, exactly like
-- research_sessions.source already is -- a new source is just a new
-- string value, never a schema change. This is what lets the spec's own
-- "don't hard-code the system to only EverBee/eRank/Etsy" requirement
-- hold without inventing named per-source columns (everbee_volume,
-- erank_volume, ...), which would need a new migration every time a new
-- source shows up -- the opposite of what was asked for.
--
-- keyword_concepts is a new many-to-many junction, not a single
-- keywords.concept_id FK -- a strong anchor keyword is routinely reused
-- across sibling concepts in the same collection, and the spec itself
-- calls for keywords to be "reusable across research records"; a single
-- FK can't express that cardinality. Same shape as Phase 18's
-- concept_tags/collection_tags (composite PK, ON DELETE CASCADE both
-- sides).

-- ─── keyword_history: extend into the real per-source evidence ledger ──────
-- clicks/ctr: shopper-intent data eRank/Etsy can provide that Everbee's
-- CSV export doesn't -- search volume alone isn't opportunity (spec's own
-- "2,000 searches/1,900 clicks may beat 8,000 searches/800 clicks" example).
-- data_date: the date this NUMBER is as of, distinct from recorded_at
-- (when TCC captured it) -- EverBee/eRank readings can lag by days or weeks.
-- data_window: free text ('30d'/'90d'/'12mo') -- EverBee reports volume for
-- a selectable window; not an enum, same reasoning as `source` itself.
-- trend_data: a source's own historical series when it provides one
-- (e.g. eRank's sparkline: [{date, value}, ...]) -- null when the source
-- only ever reports one current number. Read by classifyTrend() in
-- src/lib/keywordIntelligence.js.
-- research_session_id: which paste/import produced this specific reading,
-- same provenance-chain pattern as every other session_id FK this roadmap
-- has added (sparks/research_sessions/workshop_items/concepts/trend_signals).

ALTER TABLE keyword_history ADD COLUMN IF NOT EXISTS clicks integer;
ALTER TABLE keyword_history ADD COLUMN IF NOT EXISTS ctr numeric;
ALTER TABLE keyword_history ADD COLUMN IF NOT EXISTS data_date date;
ALTER TABLE keyword_history ADD COLUMN IF NOT EXISTS data_window text;
ALTER TABLE keyword_history ADD COLUMN IF NOT EXISTS trend_data jsonb;
ALTER TABLE keyword_history ADD COLUMN IF NOT EXISTS research_session_id uuid REFERENCES research_sessions(id) ON DELETE SET NULL;

-- source_score: the source's OWN precomputed opportunity/quality score, when
-- it reports one (e.g. Everbee's "Keyword Score" column) -- kept distinct
-- from this ledger's `score`, which is always TCC's own (volume/competition)
-- *1000 formula computed the same way regardless of source. Collapsing the
-- two would silently let Everbee's proprietary metric overwrite TCC's own
-- comparable-across-sources number, or vice versa -- exactly what this
-- migration's evidence-ledger design exists to prevent. Generic column name
-- (not everbee_score), same free-source-text reasoning as every other column
-- here: not every source will provide one, and a source that does is just a
-- reading with this field populated, never a schema change.
ALTER TABLE keyword_history ADD COLUMN IF NOT EXISTS source_score numeric;

-- ─── keywords: new Layer-2 interpretation columns ──────────────────────────
-- These are derived/recomputed by classifyKeyword() every time new evidence
-- lands for a keyword -- current-state-only, not themselves historical (the
-- historical trail lives entirely in keyword_history above). confidence
-- reuses the existing High/Medium/Low ConfidenceSelector convention already
-- used by products.confidence and trend_signals.confidence.
-- research_status default is Title Case ('Researching') to match
-- research_sessions.status's existing exact-case convention ('Complete',
-- 'Needs More Data') rather than inventing a new lowercase-enum convention.

ALTER TABLE keywords ADD COLUMN IF NOT EXISTS classification text;
ALTER TABLE keywords ADD COLUMN IF NOT EXISTS confidence text;
ALTER TABLE keywords ADD COLUMN IF NOT EXISTS trend_classification text;
ALTER TABLE keywords ADD COLUMN IF NOT EXISTS disagreement_flag boolean NOT NULL DEFAULT false;
ALTER TABLE keywords ADD COLUMN IF NOT EXISTS interpretation_summary text;
ALTER TABLE keywords ADD COLUMN IF NOT EXISTS research_status text NOT NULL DEFAULT 'Researching';

-- ─── keyword_concepts: many-to-many keyword <-> concept association ────────

CREATE TABLE IF NOT EXISTS keyword_concepts (
  keyword_id  uuid NOT NULL REFERENCES keywords(id) ON DELETE CASCADE,
  concept_id  uuid NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (keyword_id, concept_id)
);

-- concept_id is the trailing column of the composite PK, so it needs its
-- own index for "which keywords feed this concept" lookups.
CREATE INDEX IF NOT EXISTS keyword_concepts_concept_id_idx ON keyword_concepts(concept_id);

ALTER TABLE keyword_concepts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_keyword_concepts" ON keyword_concepts FOR ALL USING (true) WITH CHECK (true);

-- No index added for keywords.classification/confidence/research_status --
-- Research.jsx's KeywordList already fetches the full keyword set
-- unfiltered and applies every existing filter (chapter/collection/bucket)
-- client-side; the new filters follow that same established pattern rather
-- than pushing filtering into the query.
