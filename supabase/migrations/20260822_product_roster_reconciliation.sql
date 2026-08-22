-- Product roster reconciliation against the live Etsy shop
-- Run this in the Supabase SQL Editor (not auto-applied).
--
-- Reconciled 2026-08-22 against screenshots of Etsy Shop Manager. The counts
-- close exactly, which is why this is a correction rather than a guess:
--
--   Etsy live listings ................................. 25
--   products rows at stage 'Live' ...................... 23
--   of those, matched to a real Etsy listing ........... 22
--   phantom (no Etsy listing exists) ................... 1   -> deleted below
--   live on Etsy but absent from the dashboard ......... 3   -> created below
--   22 + 3 = 25. Reconciled.
--
-- ---------------------------------------------------------------------------
-- 1. DELETE the phantom 'Camp Mom Tee'
-- ---------------------------------------------------------------------------
-- This row was never a listing. It is Phase 3B seed data -- see the seed block
-- at the bottom of supabase-schema.sql, which inserted three placeholder
-- products ('Raising Kids Like It''s 1997', 'Camp Mom Tee', 'Late Bloomers
-- Club Badge'). The other two are still at non-Live stages and are harmless;
-- this one somehow ended up at stage 'Live', so it has been masquerading as a
-- real listing ever since.
--
-- The seed had a WHERE NOT EXISTS (... WHERE name = ...) guard, but Kristen's
-- real listing came across from the old etsy_products table under a DIFFERENT
-- name -- 'Camp Mom Chaos Coordinator Tee' -- so the guard never fired and both
-- rows landed. Etsy confirms exactly one Camp Mom listing exists
-- ("Chaos Coordinator, Camp...", matching the Chaos Coordinator row, launched
-- 2026-06-28).
--
-- Independent corroboration: when Kristen hand-entered the 19 missing launch
-- dates, this is the one and only row she skipped.
--
-- Verified before writing this: the row has zero listing_generations, zero
-- listing_reviews, zero listing_performance_snapshots and zero
-- research_sessions, so the ON DELETE CASCADE relationships take nothing real
-- with it. The guards below make the statement a no-op rather than a
-- catastrophe if any of that has changed since.
DELETE FROM products
WHERE name = 'Camp Mom Tee'
  AND stage = 'Live'
  AND went_live_at IS NULL          -- the real Camp Mom listing HAS a date
  AND live_title IS NULL            -- and would have live listing content
  AND COALESCE(total_sales, 0) = 0;

-- ---------------------------------------------------------------------------
-- 2. CREATE the 3 listings that are live on Etsy but missing here
-- ---------------------------------------------------------------------------
-- ON LAUNCH DATES, AND WHY THEY MAY NEED CORRECTING
--
-- Etsy listings run in 4-month periods, so the expiry/renewal date shown in
-- Shop Manager minus 4 months gives the start of the CURRENT period. That
-- equals the original launch only if the listing has never renewed.
--
-- All three of these are recent enough that a renewal is unlikely (a listing
-- expiring 2026-11-19 would have had to be first listed 2026-03-19 to have
-- renewed once), so these dates are probably right. But "probably" is doing
-- real work in that sentence -- the same reasoning that kept 18 other products
-- out of the earlier backfill applies here in weaker form.
--
-- If any is wrong, correct it in the Timing panel on the Product Workspace;
-- nothing downstream caches it.
--
--   Mahjong ............ expires 2026-12-03  ->  2026-08-03
--   One More Chapter ... expires 2026-11-19  ->  2026-07-19
--   Summerween ......... renews  2026-11-18  ->  2026-07-18
--
-- product_format is deliberately left NULL on all three even though the
-- thumbnails all look like tees. Format is the single field the deterministic
-- keyword gate depends on (checkFormatCompatibility in src/lib/productTruth.js),
-- and a format guessed from a thumbnail is exactly the kind of invented
-- Product Truth that gate exists to prevent. The Listing Builder's readiness
-- panel will flag it as an unfilled gap, which is the correct outcome.
--
-- Names are short internal ones matching the older rows' convention, not the
-- full Etsy titles -- rename freely, nothing keys off them. The Mahjong Etsy
-- title was truncated in the screenshot ("Mahjong Apparel, Dog M...") so its
-- name here is a placeholder more than a transcription.
--
-- Collection note: TWO active Mahjong collections exist ('Mahjong Apparel &
-- Gifts' and 'Mahjong Products'), each with one research session. The apparel
-- one is used here since the listing is a garment. Worth merging them at some
-- point -- flagged, not done, since merging collections is not this file's job.

INSERT INTO products (name, collection, stage, went_live_at, stage_updated_at, notes)
SELECT v.name, v.collection, 'Live', v.went_live_at::date, now(), v.notes
FROM (VALUES
  ('Mahjong Dog Tee',
   'Mahjong Apparel & Gifts',
   '2026-08-03',
   'Added 2026-08-22 during Etsy roster reconciliation. Launch date derived from the Etsy expiry date (2026-12-03 minus one 4-month period) — verify. Etsy title was truncated in the source screenshot; rename to the real one.'),

  ('One More Chapter Tee',
   'Reader Chapter',
   '2026-07-19',
   'Added 2026-08-22 during Etsy roster reconciliation. Launch date derived from the Etsy expiry date (2026-11-19 minus one 4-month period) — verify. Distinct from the "One Cozy Chapter" idea record, which Kristen confirmed was never launched.'),

  ('Summerween One More Chapter Tee',
   'Reader Chapter',
   '2026-07-18',
   'Added 2026-08-22 during Etsy roster reconciliation. Launch date derived from the Etsy auto-renew date (2026-11-18 minus one 4-month period) — verify; this one auto-renews, so it may have run an earlier period. Seasonal Halloween/Summerween variant of the One More Chapter design.')
) AS v(name, collection, went_live_at, notes)
WHERE NOT EXISTS (
  SELECT 1 FROM products p WHERE lower(p.name) = lower(v.name)
);

-- ---------------------------------------------------------------------------
-- NOT CHANGED, deliberately
-- ---------------------------------------------------------------------------
-- 'One Cozy Chapter' (Reader Chapter, stage 'Idea') stays exactly as it is.
-- Kristen confirmed it was never launched and that the two One More Chapter
-- listings on Etsy are separate products, so it is a real unbuilt idea rather
-- than a mis-stated record of a live listing.
--
-- 'Raising Kids Like It''s 1997' and 'Late Bloomers Club Badge' also stay --
-- same seed origin as the deleted row, but both sit at non-Live stages and are
-- real ideas worth keeping.

-- ---------------------------------------------------------------------------
-- Verify (optional — run after the above)
-- ---------------------------------------------------------------------------
-- Expect 25 Live products, all 25 with a launch date, and no 'Camp Mom Tee'.
--
-- SELECT count(*) FILTER (WHERE went_live_at IS NOT NULL) AS with_date,
--        count(*) FILTER (WHERE went_live_at IS NULL)     AS without_date,
--        count(*)                                          AS live_total
-- FROM products WHERE stage = 'Live';
--
-- SELECT name, collection, went_live_at FROM products
-- WHERE stage = 'Live' ORDER BY collection, name;
