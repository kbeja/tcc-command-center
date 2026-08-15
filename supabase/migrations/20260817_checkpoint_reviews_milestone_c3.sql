-- Milestone C3: 30/60/90/120 Checkpoint Review Loop
-- Run this in Supabase SQL Editor (not auto-applied)
--
-- Why: at 30/60/90/120 days after a product goes live, Kristen wants a
-- structured checkpoint -- real performance data, an AI interpretation of
-- what it suggests, and her own recorded decision -- building a durable
-- per-product history of what was decided and why. products.notes is an
-- unstructured append-only blob (appendProductNote() never parses it back)
-- and the one existing "review" table (review_sessions, Phase 3B era) is a
-- dead, unrelated team-meeting-reminder concept with no product_id at all --
-- not reused or touched here.
--
-- NAME NOTE: "listing_reviews" means Kristen's own 30/60/90/120 performance
-- checkpoints -- NOT Etsy customer star ratings (those live on
-- products.reviews / products.mo_reviews, simply two of the fields frozen
-- into this table's performance_snapshot).
--
-- Checkpoints are fully independent of products.stage -- any stage
-- transitions freely to any other today, and 'Live'/'Reviewing' are already
-- treated as one bucket everywhere else in this app. This table is the sole
-- source of truth for whether a checkpoint is Upcoming, Due, Reviewed, or
-- Skipped. Upcoming/Due are pure computed states from went_live_at +
-- elapsed time (see src/lib/listingReviews.js) -- nothing to store for a
-- checkpoint that hasn't happened yet, so this table only gets a row once a
-- checkpoint is actually acted on. Rows are NEVER created automatically.
--
-- "Not Enough Data" is deliberately NOT a third status value (status is
-- only ever 'reviewed' or 'skipped') -- it's a value of ai_recommendation /
-- user_decision on an otherwise-normal 'reviewed' row. Skip is the ONLY
-- lightweight, AI-free path; a checkpoint concluding "not enough signal
-- yet" still went through the full AI-assisted flow -- different in kind
-- from a Skip ("didn't engage with this checkpoint, e.g. traveling").
--
-- generation_id is a soft link (ON DELETE SET NULL) to "which generation
-- was current at this review" -- generation_snapshot denormalizes its
-- identifying content BY VALUE alongside it, mirroring
-- listing_generation_keywords' keyword_id (nullable FK) + keyword_text
-- (NOT NULL, denormalized) pattern from the Milestone A migration. This row
-- must never need to be re-resolved against the referenced generation to
-- know what it meant at the time it was written.
--
-- performance_snapshot freezes all 19 LiveStats-writeable products columns
-- plus printify_cost (20 fields -- see LIVE_STATS_FIELDS in
-- src/lib/listingReviews.js, the single source of truth for this list) on
-- EVERY row, reviewed or skipped -- freezing already-entered numbers is
-- cheap and mechanical, unlike the AI/decision fields which only apply to a
-- real review. days_live_at_review is a plain stored integer, not
-- re-derived from went_live_at, so this row stays self-contained even if
-- went_live_at is edited later.
--
-- last_reviewed_at (products, Phase 3B era) is deliberately left untouched
-- -- see this milestone's plan for why (reviving it would misfire a stale,
-- mismatched staleness rule in getNeedsAttention()).
--
-- No CHECK constraint on checkpoint_number and no unique constraint on
-- (product_id, checkpoint_number) -- consistent with every other table in
-- this schema (zero data-validation CHECK constraints exist anywhere;
-- vocabulary is plain text, validated in JS) and with listing_generations'
-- own append-only shape (many rows allowed per product+checkpoint, "current"
-- derived by created_at DESC -- leaves room for a future "redo this
-- checkpoint" action with zero schema change, not built in C3).

CREATE TABLE IF NOT EXISTS listing_reviews (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id             uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  checkpoint_number      integer NOT NULL,
  status                 text NOT NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),

  -- Evidence: frozen at row-creation time, self-contained
  days_live_at_review    integer NOT NULL,
  performance_snapshot   jsonb NOT NULL,
  generation_id          uuid REFERENCES listing_generations(id) ON DELETE SET NULL,
  generation_snapshot    jsonb,

  -- Interpretation: AI's advisory read, always separate from the decision
  ai_recommendation      text,
  ai_reasoning           text,
  ai_model               text,

  -- Decision: Kristen's own, explicit, final
  user_decision          text,
  user_notes             text
);

CREATE INDEX IF NOT EXISTS listing_reviews_product_id_idx ON listing_reviews(product_id);
-- Supports "most recent row per (product, checkpoint)" without a mutable
-- latest-flag -- same pattern as listing_generations' own product+created_at
-- index.
CREATE INDEX IF NOT EXISTS listing_reviews_product_checkpoint_idx
  ON listing_reviews(product_id, checkpoint_number, created_at DESC);

-- RLS -- TCC is single-user; permissive policy mirrors every other table.
-- Not safely re-runnable (Postgres has no CREATE POLICY IF NOT EXISTS) --
-- same caveat as every prior migration's RLS block in this repo.
ALTER TABLE listing_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_listing_reviews" ON listing_reviews FOR ALL USING (true) WITH CHECK (true);
