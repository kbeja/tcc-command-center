-- Phase 8a — SEO as a network: search intent, keyword↔niche m2m, clusters
-- Run this in the Supabase SQL Editor (not auto-applied).
--
-- Additive throughout. One column, three tables, no backfill, nothing existing
-- modified. Etsy Marketplace Insights capture is Phase 8b and is not here.
--
-- ---------------------------------------------------------------------------
-- THE CENTRAL IDEA (§13)
-- ---------------------------------------------------------------------------
-- "Taxonomy is a tree. SEO is a network around that tree." Everything below
-- exists to stop SEO becoming a second taxonomy. A keyword is not filed under
-- one branch; it connects to as many as it genuinely serves, carries its own
-- search intent, and can belong to reusable clusters that are NOT niche levels.
--
-- ---------------------------------------------------------------------------
-- 1. keywords.search_intent (§5)
-- ---------------------------------------------------------------------------
-- §5's nine values: Identity, Product, Gift, Recipient, Occasion, Seasonal,
-- Style / Message, Broad / Parent, Adjacent Discovery.
--
-- This is NOT the same thing as listing_generation_keywords.relevance_category,
-- and the two must not be merged. That one records what a keyword was judged
-- to be FOR ONE SPECIFIC LISTING at one moment, by the AI, on a generation
-- ledger row that is deliberately immutable history. This one is a durable
-- property of the keyword itself, set by a human, reusable across every
-- listing that ever touches it. Same vocabulary shape, different lifetime and
-- different authority.
--
-- Plain text, no CHECK, no backfill. 660 keywords exist and classifying them
-- is human judgment (§40) — an unclassified keyword is honest, a guessed one
-- silently corrupts the filtering §6/§7 depend on.
ALTER TABLE keywords ADD COLUMN IF NOT EXISTS search_intent text;
CREATE INDEX IF NOT EXISTS keywords_search_intent_idx ON keywords(search_intent);

-- ---------------------------------------------------------------------------
-- 2. keyword_niches — many-to-many (§9, §29)
-- ---------------------------------------------------------------------------
-- The one place the roadmap explicitly wants m2m rather than a single primary
-- path. §29's own example: "bookish sweatshirt" legitimately serves General
-- Reader, Romance Reader, Romantasy Reader and Fantasy Reader at once. Forcing
-- it into one branch would either lose three of those or duplicate the keyword
-- four times, and duplicated keywords cannot share an evidence ledger.
--
-- Note the asymmetry with sparks/concepts/products, which each got a SINGLE
-- primary_niche_id. That is deliberate and comes straight from §4: an object
-- you make has one primary path; a search term you observe has none, because
-- shoppers do not respect the tree.
--
-- Same composite-PK + cascade shape as keyword_concepts, collection_tags and
-- niche_collections. is_primary marks the niche a keyword most belongs to, for
-- the cases where one is clearly dominant — nullable in effect (a keyword may
-- have no primary), and nothing enforces at most one, because enforcing it in
-- the schema would mean a UI bug could make a keyword unsaveable.
CREATE TABLE IF NOT EXISTS keyword_niches (
  keyword_id  uuid NOT NULL REFERENCES keywords(id) ON DELETE CASCADE,
  niche_id    uuid NOT NULL REFERENCES niches(id)   ON DELETE CASCADE,
  is_primary  boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (keyword_id, niche_id)
);

-- niche_id is the trailing PK column, so "which keywords serve this niche?" —
-- the read the Listing Builder will eventually run on every generation — needs
-- its own index.
CREATE INDEX IF NOT EXISTS keyword_niches_niche_id_idx ON keyword_niches(niche_id);

-- ---------------------------------------------------------------------------
-- 3. keyword_clusters (§28) — reusable groupings, NOT niche levels
-- ---------------------------------------------------------------------------
-- §28's examples: "Hockey Mom Core", "Hockey Mom Sweatshirt", "Hockey Mom
-- Gift", "Hockey Mom Seasonal". These are SEO groupings that cut across the
-- tree; §27 is explicit that they are not taxonomy branches and must never be
-- treated as such.
--
-- niche_id is nullable on purpose. A cluster usually belongs to a niche, but
-- exploratory clustering happens before a niche is decided — the same
-- capture-first-classify-second principle (§10) that lets research sessions
-- and sparks sit unclassified. ON DELETE SET NULL: archiving a niche must not
-- delete the keyword groupings built under it.
--
-- This also gives the AI clustering in Keyword Explore somewhere real to land.
-- Today it invents group names and they are dissolved into a session's notes
-- string on save — the grouping itself is discarded, which is why 54
-- collections exist. A cluster is where those groups belong.
CREATE TABLE IF NOT EXISTS keyword_clusters (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  niche_id    uuid REFERENCES niches(id) ON DELETE SET NULL,
  notes       text,
  status      text NOT NULL DEFAULT 'active',   -- 'active' | 'archived'
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Case-insensitive uniqueness per niche, same COALESCE-the-null technique the
-- niches table needs: two clusters both called "Core" under NO niche would
-- otherwise both be allowed, since NULL <> NULL in a unique index.
CREATE UNIQUE INDEX IF NOT EXISTS keyword_clusters_niche_name_ci_idx
  ON keyword_clusters (COALESCE(niche_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));

CREATE INDEX IF NOT EXISTS keyword_clusters_niche_id_idx ON keyword_clusters(niche_id);

CREATE TABLE IF NOT EXISTS keyword_cluster_keywords (
  cluster_id  uuid NOT NULL REFERENCES keyword_clusters(id) ON DELETE CASCADE,
  keyword_id  uuid NOT NULL REFERENCES keywords(id)         ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cluster_id, keyword_id)
);

CREATE INDEX IF NOT EXISTS keyword_cluster_keywords_keyword_id_idx
  ON keyword_cluster_keywords(keyword_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
-- TCC is single-user; permissive policies mirror every other table. NOT safely
-- re-runnable (no CREATE POLICY IF NOT EXISTS) — same caveat as every prior
-- migration here. Everything above this point is idempotent.
ALTER TABLE keyword_niches           ENABLE ROW LEVEL SECURITY;
ALTER TABLE keyword_clusters         ENABLE ROW LEVEL SECURITY;
ALTER TABLE keyword_cluster_keywords ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all_keyword_niches"           ON keyword_niches           FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_keyword_clusters"         ON keyword_clusters         FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_keyword_cluster_keywords" ON keyword_cluster_keywords FOR ALL USING (true) WITH CHECK (true);

-- updated_at trigger, reusing the shared function.
DROP TRIGGER IF EXISTS keyword_clusters_set_updated_at ON keyword_clusters;
CREATE TRIGGER keyword_clusters_set_updated_at
  BEFORE UPDATE ON keyword_clusters
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Verify (optional — run after the above)
-- ---------------------------------------------------------------------------
-- Expect 660 keywords all with NULL search_intent, and three empty tables.
--
-- SELECT count(*) AS keywords, count(search_intent) AS with_intent FROM keywords;
-- SELECT
--   (SELECT count(*) FROM keyword_niches)           AS niche_links,
--   (SELECT count(*) FROM keyword_clusters)         AS clusters,
--   (SELECT count(*) FROM keyword_cluster_keywords) AS cluster_members;
