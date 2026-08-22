-- Merge the two duplicate Mahjong collections into one
-- Run this in the Supabase SQL Editor (not auto-applied).
--
-- Two active collections have been describing the same market:
--   'Mahjong Apparel & Gifts'  (d19b159a-…)  1 product, 1 research session
--   'Mahjong Products'         (9e7ce3f0-…)  0 products, 1 research session
--
-- Their rows are otherwise near-identical — same chapter (Hobbies), same
-- priority (supporting), same status, all five evaluation_* flags false, and
-- neither carries an identity, notes or style_guide. The only difference is
-- last_verified (2026-08-01 vs 2026-08-02). So nothing of substance is lost by
-- collapsing them; the only real content is the two research sessions, and
-- both are kept.
--
-- 'Mahjong Apparel & Gifts' survives because it already holds the product
-- (Mahjong Dog Tee, added during the Etsy roster reconciliation). Keeping the
-- row that has a product attached means products.collection — still the live
-- join key everywhere until Phase 7 gives products a real niche FK — never has
-- to change, so the surviving row is the one with the most inbound references.
--
-- Every reference was counted before writing this, not assumed:
--   products.collection ............ 1 / 0
--   research_sessions.collection ... 1 / 1
--   sparks.collection_tag .......... 0 / 0
--   concepts.collection_name ....... 0 / 0
--   trend_signals.collection ....... 0 / 0
--   collection_tags ................ 0 / 0
--   timing_niche_collections ....... 0 / 0
--   niche_collections .............. 0 / 0
--
-- The four text columns are soft labels matched by string, so they need
-- explicit UPDATEs; the three uuid junctions have no rows for either
-- collection, so there is nothing to repoint there. All are written anyway
-- except the empty junctions, so this stays correct if a row appears between
-- now and when it is run.

-- ---------------------------------------------------------------------------
-- 1. Repoint every text reference from the losing name to the surviving one
-- ---------------------------------------------------------------------------
UPDATE research_sessions SET collection      = 'Mahjong Apparel & Gifts' WHERE collection      = 'Mahjong Products';
UPDATE products          SET collection      = 'Mahjong Apparel & Gifts' WHERE collection      = 'Mahjong Products';
UPDATE sparks            SET collection_tag  = 'Mahjong Apparel & Gifts' WHERE collection_tag  = 'Mahjong Products';
UPDATE concepts          SET collection_name = 'Mahjong Apparel & Gifts' WHERE collection_name = 'Mahjong Products';
UPDATE trend_signals     SET collection      = 'Mahjong Apparel & Gifts' WHERE collection      = 'Mahjong Products';

-- ---------------------------------------------------------------------------
-- 2. Keep the more recent verification date
-- ---------------------------------------------------------------------------
-- The surviving row says 2026-08-01 but the losing row was verified a day
-- later, and after the merge the survivor owns both research sessions — so the
-- later date is the honest one. Without this, the merge would silently make
-- the collection's keyword research look a day staler than it is, which feeds
-- the Listing Builder's "keywords are stale" banner.
UPDATE collections
SET last_verified = GREATEST(
      COALESCE(last_verified, DATE '1900-01-01'),
      COALESCE((SELECT last_verified FROM collections WHERE name = 'Mahjong Products'), DATE '1900-01-01')
    ),
    updated_at = now()
WHERE name = 'Mahjong Apparel & Gifts';

-- ---------------------------------------------------------------------------
-- 3. Delete the now-unreferenced duplicate
-- ---------------------------------------------------------------------------
-- Guarded: only deletes if nothing still points at it. If any of the UPDATEs
-- above missed something, this becomes a no-op instead of orphaning data.
DELETE FROM collections c
WHERE c.name = 'Mahjong Products'
  AND NOT EXISTS (SELECT 1 FROM products          p WHERE p.collection      = c.name)
  AND NOT EXISTS (SELECT 1 FROM research_sessions r WHERE r.collection      = c.name)
  AND NOT EXISTS (SELECT 1 FROM sparks            s WHERE s.collection_tag  = c.name)
  AND NOT EXISTS (SELECT 1 FROM concepts          k WHERE k.collection_name = c.name)
  AND NOT EXISTS (SELECT 1 FROM trend_signals     t WHERE t.collection      = c.name);

-- ---------------------------------------------------------------------------
-- 4. Link the survivor to its taxonomy niche
-- ---------------------------------------------------------------------------
-- "One source" is the point of this merge, and the taxonomy is the real one.
-- Phase 2c/2d created Hobbies -> Mahjong -> Mahjong Player but linked no
-- collection to it, because the §4 triage classified BOTH Mahjong collections
-- as things that become niche nodes rather than surviving as curated
-- Collections. That remains the plan: once Phase 7 gives products a real niche
-- FK, this collection becomes redundant and can be archived outright.
--
-- Until then products.collection is still the live join key, so the collection
-- has to exist — and linking it to the niche now means the two layers agree in
-- the meantime instead of drifting.
INSERT INTO niche_collections (niche_id, collection_id)
SELECT n.id, c.id
FROM niches n
JOIN collections c ON c.name = 'Mahjong Apparel & Gifts'
WHERE lower(n.name) = 'mahjong'
  AND n.level = 'sub'
  AND NOT EXISTS (
    SELECT 1 FROM niche_collections nc WHERE nc.niche_id = n.id AND nc.collection_id = c.id
  );

-- ---------------------------------------------------------------------------
-- OPTIONAL — rename the survivor to just 'Mahjong'
-- ---------------------------------------------------------------------------
-- Not run by default. "Apparel & Gifts" is product-type plus gift-intent
-- language, which is exactly the vocabulary the taxonomy work moved OUT of
-- market names — and the niche it maps to is simply 'Mahjong'. Renaming makes
-- the two layers read identically.
--
-- Left commented because it is a judgment call, not part of the merge, and
-- because collections are referenced by NAME in five places (all updated
-- below, in dependency order) — a partial run would scatter the references
-- this migration just consolidated. Uncomment the whole block or none of it.
--
-- UPDATE research_sessions SET collection      = 'Mahjong' WHERE collection      = 'Mahjong Apparel & Gifts';
-- UPDATE products          SET collection      = 'Mahjong' WHERE collection      = 'Mahjong Apparel & Gifts';
-- UPDATE sparks            SET collection_tag  = 'Mahjong' WHERE collection_tag  = 'Mahjong Apparel & Gifts';
-- UPDATE concepts          SET collection_name = 'Mahjong' WHERE collection_name = 'Mahjong Apparel & Gifts';
-- UPDATE trend_signals     SET collection      = 'Mahjong' WHERE collection      = 'Mahjong Apparel & Gifts';
-- UPDATE collections       SET name = 'Mahjong', updated_at = now() WHERE name = 'Mahjong Apparel & Gifts';

-- ---------------------------------------------------------------------------
-- Verify (optional — run after the above)
-- ---------------------------------------------------------------------------
-- Expect exactly one Mahjong collection, holding 1 product and 2 research
-- sessions, last_verified 2026-08-02, linked to the Mahjong niche.
--
-- SELECT name, last_verified, chapter, status FROM collections WHERE name ILIKE 'Mahjong%';
--
-- SELECT (SELECT count(*) FROM products          WHERE collection = 'Mahjong Apparel & Gifts') AS products,
--        (SELECT count(*) FROM research_sessions WHERE collection = 'Mahjong Apparel & Gifts') AS sessions;
--
-- SELECT n.name AS niche, c.name AS collection
-- FROM niche_collections nc
-- JOIN niches n      ON n.id = nc.niche_id
-- JOIN collections c ON c.id = nc.collection_id
-- WHERE c.name ILIKE 'Mahjong%';
