-- Phase 9 — the Analysis layer
-- Run this in the Supabase SQL Editor (not auto-applied).
--
-- One new table. Nothing existing is touched.
--
-- ---------------------------------------------------------------------------
-- THE PROBLEM THIS SOLVES
-- ---------------------------------------------------------------------------
-- TCC already computes interpretation — keywordIntelligence.js writes
-- classification, confidence, trend_classification, disagreement_flag and
-- interpretation_summary onto the keywords row. But those columns are
-- RECOMPUTED AND OVERWRITTEN every time new evidence lands
-- (recomputeKeywordInterpretation). Evidence is versioned in keyword_history;
-- interpretation is not versioned at all.
--
-- That is fine for a machine-derived reading, and wrong for a human judgment.
-- §26 asks that analysis be "visible and editable", and there is currently
-- nowhere for Kristen to write "these two sources disagree and I think eRank is
-- the one that's wrong here" — nowhere that would survive the next import.
--
-- ---------------------------------------------------------------------------
-- THE FIVE LAYERS STAY FIVE COLUMNS
-- ---------------------------------------------------------------------------
-- This project's standing rule is that Evidence, Interpretation, Decision,
-- Hypothesis and Learning are never collapsed into one field or one concept.
-- They are five separate nullable columns here for exactly that reason, and
-- the UI renders them as five separate inputs. A single "notes" field would
-- have been easier and would have quietly destroyed the distinction — you
-- cannot later ask "what did we DECIDE about Hockey Mom" of a prose blob.
--
--   evidence_snapshot — what the numbers actually said, as jsonb, frozen at
--                       the moment the analysis was written. Not a live query:
--                       an interpretation written in August must still be
--                       readable against August's numbers in December, or it
--                       becomes unfalsifiable.
--   interpretation    — what it might mean. May be AI-proposed.
--   decision          — what we will do. Human only in practice; the UI never
--                       lets AI fill this.
--   hypothesis        — what we expect to happen if the decision is right.
--   learning          — what actually happened, written later.
--
-- ---------------------------------------------------------------------------
-- WHY scope_type/scope_id AND NOT SEVEN FK COLUMNS
-- ---------------------------------------------------------------------------
-- §27 wants analysis at niche, keyword, cluster, product, aesthetic, season
-- and listing level. Seven nullable FK columns with a "exactly one must be
-- set" rule is the shape this codebase has avoided everywhere else, and the
-- Phase 18 migration explicitly noted it has no precedent for polymorphic
-- association — but that note was about junction tables with real referential
-- integrity to gain. Here the alternative is seven columns of which six are
-- always null, plus a CHECK constraint this schema has no precedent for
-- either.
--
-- The tradeoff is accepted knowingly: scope_id gets NO foreign key, so a
-- deleted niche leaves an orphaned analysis rather than cascading. That is the
-- safer failure for this table — an analysis is a written judgment, and
-- silently deleting Kristen's reasoning because a niche was archived would be
-- worse than leaving a row whose subject is gone. The UI resolves scope_label
-- at write time so an orphan still says what it was about.
CREATE TABLE IF NOT EXISTS analysis_records (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 'niche' | 'keyword' | 'cluster' | 'product' | 'aesthetic' | 'season' | 'listing'
  scope_type    text NOT NULL,
  scope_id      uuid,
  -- Denormalized at write time so an analysis stays readable even if its
  -- subject is later renamed or removed — same reasoning as
  -- keyword_history.keyword and listing_generation_keywords.keyword_text.
  scope_label   text,

  evidence_snapshot jsonb,
  interpretation    text,
  decision          text,
  hypothesis        text,
  learning          text,

  -- 'ai' | 'human'. An AI-authored row is a PROPOSAL and nothing downstream
  -- may treat it as settled until status flips to 'approved' — §40's "AI can
  -- suggest, human approves durable decisions", enforced by data rather than
  -- by everyone remembering.
  authored_by   text NOT NULL DEFAULT 'human',
  status        text NOT NULL DEFAULT 'draft',   -- 'draft' | 'proposed' | 'approved' | 'superseded'

  -- Which deterministic findings were on screen when this was written. Kept so
  -- a later reader can tell whether a judgment was made against a signal that
  -- has since changed, rather than guessing.
  findings      jsonb,

  approved_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS analysis_records_scope_idx  ON analysis_records(scope_type, scope_id);
CREATE INDEX IF NOT EXISTS analysis_records_status_idx ON analysis_records(status);
-- "What is waiting on me" — the review queue, and the only read that runs on
-- every visit to the Analysis surface.
CREATE INDEX IF NOT EXISTS analysis_records_pending_idx
  ON analysis_records(created_at DESC) WHERE status IN ('draft', 'proposed');

ALTER TABLE analysis_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_analysis_records" ON analysis_records FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS analysis_records_set_updated_at ON analysis_records;
CREATE TRIGGER analysis_records_set_updated_at
  BEFORE UPDATE ON analysis_records
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- NOT DONE HERE, DELIBERATELY
-- ---------------------------------------------------------------------------
-- Nothing is written into this table by the migration, and no existing
-- interpretation is copied in. keywords.classification and friends stay
-- exactly as they are — machine-derived, recomputed, current-state-only. The
-- two coexist on purpose: the columns answer "what do the numbers say right
-- now", this table answers "what did we conclude, and when, and did it hold".
-- Collapsing them would put a human judgment somewhere that gets overwritten
-- by the next CSV import.

-- ---------------------------------------------------------------------------
-- Verify (optional)
-- ---------------------------------------------------------------------------
-- SELECT count(*) FROM analysis_records;
