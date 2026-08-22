-- Phase 5 — Products: taxonomy link and seasonal overlay
-- Run this in the Supabase SQL Editor (not auto-applied).
--
-- Two nullable columns, no backfill, nothing existing touched. Same shape as
-- Phase 3 (sparks) and Phase 4 (concepts), completing the
-- Spark -> Concept -> Product chain so a classification made once at the idea
-- stage survives all the way to the listing.
--
-- ---------------------------------------------------------------------------
-- WHY THIS MATTERS MORE HERE THAN ANYWHERE ELSE
-- ---------------------------------------------------------------------------
-- Products are where the taxonomy stops being organisation and starts being
-- analysis. §27 wants questions answerable at niche level -- "is Hockey Mom
-- performing?", "does collegiate outperform minimalist for this market?" --
-- and none of them can be asked while a product's only market label is the
-- free-text `collection` string.
--
-- It also unblocks the Listing Builder cutover later: today the entire keyword
-- universe for a generation comes from research_sessions matched on collection
-- NAME (ListingBuilder/index.jsx's .in('collection', cols)). A real niche FK on
-- both sides is the precondition for replacing that join with something that
-- cannot silently miss research filed under a differently-spelled collection.
--
-- ---------------------------------------------------------------------------
-- WHAT IS DELIBERATELY LEFT ALONE
-- ---------------------------------------------------------------------------
-- products.collection stays, untouched, and stays the field every existing
-- query joins on. Removing it is the Phase 8 cutover and carries the highest
-- risk in the roadmap; nothing here goes near it.
--
-- products.niche (free text) also stays. Only 3 of 28 rows use it -- two say
-- "90s Nostalgia", which is an AESTHETIC and belongs in visual_tags, and one
-- says "Hockey", which is a real niche. That is three judgment calls, not a
-- pattern to automate, so they are left for a human. Backfilling
-- primary_niche_id by string-matching that column would classify two products
-- as markets they do not belong to, which is precisely the fabricated-evidence
-- failure the earlier launch-date backfill nearly committed.
--
-- Nothing is backfilled from `collection` either, even though 25 of 28 products
-- have one. The collection-to-niche mapping is many-to-many and several
-- collections map to no niche at all (they were aesthetics or product types);
-- auto-resolving would guess. §40 forbids automatic taxonomy assignment, and
-- the Product Workspace picker makes doing it by hand a single click.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS primary_niche_id uuid REFERENCES niches(id) ON DELETE SET NULL;

-- The §1.1 crossover again: points into the same niches table at the Seasonal
-- branch, so a Hockey Mom Christmas listing carries Hockey Mom as its market
-- and Christmas as its overlay, both referencing rows that already exist
-- rather than a second seasons vocabulary.
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS seasonal_niche_id uuid REFERENCES niches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS products_primary_niche_id_idx  ON products(primary_niche_id);
CREATE INDEX IF NOT EXISTS products_seasonal_niche_id_idx ON products(seasonal_niche_id);

-- ---------------------------------------------------------------------------
-- Verify (optional — run after the above)
-- ---------------------------------------------------------------------------
-- Expect 28 products, 0 classified. Classification happens per product in the
-- Product Workspace, or is inherited when a product is created from a concept.
--
-- SELECT count(*) AS total,
--        count(primary_niche_id)  AS with_niche,
--        count(seasonal_niche_id) AS with_season
-- FROM products;
