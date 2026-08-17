-- Phase 23A: TCC Intelligence -- the performance evidence floor
-- Run this in Supabase SQL Editor (not auto-applied)
--
-- WHY THIS EXISTS
-- Phase 23's brief asks for a learning loop over TCC's own results. Inspection
-- found there is currently almost nothing to learn from and no way to collect
-- it: zero orders ever, zero launch dates, zero checkpoint reviews, and the
-- one Etsy importer that exists parses a CSV format Etsy has never produced
-- (its instructions still name Etsy Studio, shut down in 2018 -- import_history
-- is empty because it has never once run). This migration builds the capture
-- floor. The interpretation layer (observations, learnings, baselines) is
-- deliberately NOT built here -- see the plan's 23A/23B split. Building
-- baselines over an empty population is exactly what the brief's own minimum-
-- sample-discipline section forbids.
--
-- THE UNITS PROBLEM, DESIGNED OUT
-- Etsy uses the word "Views" for two different things on two different screens:
--   Shop Stats page:  Views = times the listing was SEEN in search
--                     Visits = times it was CLICKED into
--   Etsy Ads page:    Views = ad impressions
--                     Clicks = ad clicks
-- Same two concepts, swapped labels. Shop-wide these differ by roughly 50x
-- (1,012 ad impressions vs 18 listing visits in the same period), so conflating
-- them would not produce a slightly-off number, it would produce a
-- catastrophically wrong one. This schema therefore never uses the word
-- "views". It says `impressions` (seen) and `visits` (clicked), and keeps the
-- paid subset in separately-named ad_* columns that must never be summed with
-- the organic-inclusive totals.
--
-- This maps directly onto the brief's own discovery -> click -> conversion
-- funnel:  impressions -> visits -> orders/revenue.
--
-- MATCHING KEY
-- Everything keys off the Etsy listing id, never the listing title. Kristen's
-- shop contains two byte-identical titles ("Morally Grey Shirt, Bookish
-- Shirt, ...") with materially different performance (120 impressions/0.8% CTR
-- vs 85/2.4%). Title matching would silently merge or misassign them -- the
-- single most likely source of quiet data corruption in this whole phase.
-- products.etsy_listing_id already exists as a column but is populated on 0 of
-- 24 rows, so a one-time human-approved linkage step has to precede any
-- import; see the plan. Nothing here writes it automatically.
--
-- APPEND-ONLY
-- Snapshots are never updated. This is the roadmap's established evidence-
-- ledger philosophy (keyword_history, visual_profiles, listing_generations,
-- listing_reviews, timing_guidance all work this way) and it is what makes
-- longitudinal learning possible at all: the brief explicitly wants day-30 /
-- day-60 / day-90 / day-120 numbers, not one mutable current total.
--
-- NO BACKFILL
-- 10 products carry legacy `views`/`favorites` values with no date, no source,
-- and no indication whether they are cumulative or period-based. The brief
-- forbids fabricating historical snapshots from current cumulative totals, so
-- those values are deliberately NOT imported into this series. Day one of the
-- series is the first real capture.
--
-- No CHECK constraints, consistent with all 22 prior migrations in this repo
-- (vocabulary is plain text validated in JS).

-- ---------------------------------------------------------------------------
-- The snapshot series -- one row per listing per capture
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS listing_performance_snapshots (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id        uuid REFERENCES products(id) ON DELETE CASCADE,

  -- Kept alongside product_id on purpose: a capture is evidence about an Etsy
  -- listing, which is true whether or not it is currently linked to a TCC
  -- product. An unlinked capture is still real data and must not be discarded
  -- or blocked -- it just waits for linkage.
  etsy_listing_id   text,
  listing_title     text,   -- as captured, for human recognition only, never for matching

  captured_at       timestamptz NOT NULL DEFAULT now(),
  -- The window the numbers actually describe. Etsy always reports over a
  -- selected range, so a snapshot without its range is uninterpretable.
  period_start      date,
  period_end        date,
  -- 'etsy_stats_capture' | 'etsy_ads_capture' | 'order_item_csv' | 'manual'
  source            text NOT NULL,

  -- DISCOVERY: seen in search. Etsy calls this "Views" on the Stats page.
  impressions       integer,
  -- CLICK: actually opened the listing. Etsy calls this "Visits".
  visits            integer,
  -- CONVERSION
  orders            integer,
  revenue           numeric,
  favorites         integer,

  -- Paid subset only. NEVER add these to the columns above -- ad_impressions
  -- and impressions are different populations measured by different screens.
  ad_impressions    integer,
  ad_clicks         integer,
  ad_spend          numeric,
  ad_orders         integer,
  ad_revenue        numeric,
  ad_roas           numeric,
  -- Etsy's own per-listing assessment: 'Efficient spending' / 'Greater
  -- visibility' / 'Lower click cost'. Screen-only, no export, genuinely useful.
  ad_status         text,

  -- Exactly what was captured, verbatim. A DOM scrape can silently start
  -- returning nothing when Etsy changes markup; keeping the raw payload means
  -- a bad parse is diagnosable after the fact instead of being an unexplained
  -- row of zeros.
  raw               jsonb,
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lps_product_captured_idx
  ON listing_performance_snapshots(product_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS lps_listing_idx
  ON listing_performance_snapshots(etsy_listing_id);
CREATE INDEX IF NOT EXISTS lps_period_idx
  ON listing_performance_snapshots(period_end DESC);

-- ---------------------------------------------------------------------------
-- Where a listing's visits came from -- the organic/paid split, per listing
-- ---------------------------------------------------------------------------
-- This is the answer to "ads don't capture organic traffic": Etsy's per-listing
-- stats page breaks visits down by channel, including Etsy Ads as one channel
-- among six. So organic is directly recorded here rather than derived by
-- subtraction.
CREATE TABLE IF NOT EXISTS listing_traffic_sources (
  snapshot_id  uuid NOT NULL REFERENCES listing_performance_snapshots(id) ON DELETE CASCADE,
  -- 'etsy_search' | 'etsy_marketing_seo' | 'etsy_app' | 'direct' | 'social' | 'etsy_ads'
  channel      text NOT NULL,
  visits       integer,
  pct          numeric,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (snapshot_id, channel)
);

-- ---------------------------------------------------------------------------
-- Which real searches found a listing
-- ---------------------------------------------------------------------------
-- The highest-value long-term feed in this phase. Nothing in TCC has ever had
-- a source of organic keyword evidence -- Phase 19 built a whole keyword
-- ledger fed entirely by third-party research tools (EverBee/eRank), never by
-- what actually found the shop. Etsy exposes this per listing, screen-only.
-- It reads "No data available" today because organic volume is ~1 visit/month;
-- built now so it accumulates rather than being retrofitted later.
CREATE TABLE IF NOT EXISTS listing_search_terms (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id  uuid NOT NULL REFERENCES listing_performance_snapshots(id) ON DELETE CASCADE,
  term         text NOT NULL,
  impressions  integer,
  visits       integer,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lst_snapshot_idx ON listing_search_terms(snapshot_id);
-- Supports "has this real search term ever appeared before?" across captures,
-- which is what lets Phase 19's researched keywords eventually be marked
-- proven-for-TCC.
CREATE INDEX IF NOT EXISTS lst_term_idx ON listing_search_terms(lower(term));

-- ---------------------------------------------------------------------------
-- Shop-level daily ad performance -- the one real CSV export Etsy offers
-- ---------------------------------------------------------------------------
-- Columns mirror Etsy's own export header exactly:
--   Date (ET), Views, Clicks, Orders, Revenue (USD), Spend (USD), ROAS,
--   Click rate, Ending budget (USD)
-- "Views" there means ad impressions, hence the rename on the way in.
--
-- date is the PK because the export is idempotent per day: re-importing an
-- overlapping range must correct a day rather than duplicate it. This is the
-- one place in the phase that is deliberately NOT append-only -- a given
-- calendar day has exactly one true set of shop totals, unlike a per-listing
-- capture which is a reading taken at a moment.
CREATE TABLE IF NOT EXISTS shop_ads_daily (
  date           date PRIMARY KEY,
  impressions    integer,
  clicks         integer,
  orders         integer,
  revenue        numeric,
  spend          numeric,
  roas           numeric,
  click_rate     numeric,
  ending_budget  numeric,
  imported_at    timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- RLS -- TCC is single-user; permissive policies mirror every other table.
-- Not safely re-runnable (Postgres has no CREATE POLICY IF NOT EXISTS).
-- ---------------------------------------------------------------------------
ALTER TABLE listing_performance_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE listing_traffic_sources       ENABLE ROW LEVEL SECURITY;
ALTER TABLE listing_search_terms          ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_ads_daily                ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all_listing_performance_snapshots" ON listing_performance_snapshots FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_listing_traffic_sources"       ON listing_traffic_sources       FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_listing_search_terms"          ON listing_search_terms          FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_shop_ads_daily"                ON shop_ads_daily                FOR ALL USING (true) WITH CHECK (true);
