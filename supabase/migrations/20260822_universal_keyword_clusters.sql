-- Universal (cross-niche) keyword clusters
-- Run this in the Supabase SQL Editor (not auto-applied).
--
-- One column, one seeded cluster row. Nothing else is touched and no keyword is
-- moved — membership is a human decision made in the app.
--
-- ---------------------------------------------------------------------------
-- THE PROBLEM
-- ---------------------------------------------------------------------------
-- Some keywords genuinely belong to no market: "custom", "personalized",
-- "gift for her", "gift for him", "plus sized", "boyfriend". They apply to a
-- hockey listing and a bookish listing equally.
--
-- These must never be given a niche. A niche assignment asserts "this term
-- belongs to this market", which for "gift for her" is false — and worse than
-- unclassified, because the Listing Builder would then surface it for that one
-- niche while hiding it from every other listing that legitimately wants it.
--
-- The behaviour already exists, but as a magic string: ListingBuilder's
-- GLOBAL_COLLECTIONS = ['Global Keywords', 'General'] pools those two
-- collections into every listing. That works only while those exact collection
-- NAMES exist, breaks silently if either is renamed, and cannot survive the
-- eventual move off collection-name matching entirely.
--
-- ---------------------------------------------------------------------------
-- WHY A CLUSTER AND NOT A NICHE
-- ---------------------------------------------------------------------------
-- §28 is explicit that clusters are reusable SEO groupings and NOT taxonomy
-- branches. A cross-niche set of terms is exactly that: a real group, with no
-- market claim attached. keyword_clusters.niche_id is already nullable for
-- precisely this kind of grouping.
--
-- is_universal is a separate flag rather than "niche_id IS NULL" meaning
-- universal, because those are two genuinely different states. A cluster with
-- no niche is usually just unclassified — exploratory grouping done before a
-- niche was decided (§10's capture-first-classify-second). Treating every
-- unclassified cluster as universal would pool half-finished research into
-- every listing in the shop.
ALTER TABLE keyword_clusters
  ADD COLUMN IF NOT EXISTS is_universal boolean NOT NULL DEFAULT false;

-- Partial index: "which clusters pool into every listing" runs on every
-- generation, and only ever wants the handful flagged true.
CREATE INDEX IF NOT EXISTS keyword_clusters_universal_idx
  ON keyword_clusters(is_universal) WHERE is_universal;

-- ---------------------------------------------------------------------------
-- Seed the one cluster, empty
-- ---------------------------------------------------------------------------
-- Created with no members on purpose. Which keywords are genuinely universal
-- is a judgment call — the "General" collection currently holds 101 keywords
-- and a large share of them are tag-combination artifacts from an old import
-- ("gifte-sweatshirt", "giftful book lover", "mom-shirts-giftful"), not search
-- terms anyone types. Bulk-moving all 101 in here would pool that noise into
-- every listing in the shop, which is the opposite of the point.
--
-- Add members in the app, ideally after running Research's existing
-- "Clean up low-quality" pass.
INSERT INTO keyword_clusters (name, niche_id, is_universal, notes)
SELECT 'Universal / Cross-Niche', NULL, true,
       'Terms that apply to any listing regardless of market — custom, personalized, gift for her, plus sized. Pooled into every generation. Deliberately has no niche: assigning one would claim these belong to a single market.'
WHERE NOT EXISTS (
  SELECT 1 FROM keyword_clusters WHERE lower(name) = 'universal / cross-niche'
);

-- ---------------------------------------------------------------------------
-- Verify (optional)
-- ---------------------------------------------------------------------------
-- Expect one universal cluster with zero members.
--
-- SELECT c.name, c.is_universal, count(k.keyword_id) AS members
-- FROM keyword_clusters c
-- LEFT JOIN keyword_cluster_keywords k ON k.cluster_id = c.id
-- WHERE c.is_universal GROUP BY c.id, c.name, c.is_universal;
