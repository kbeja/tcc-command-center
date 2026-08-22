-- Backfill products.went_live_at for existing Live listings
-- Run this in the Supabase SQL Editor (not auto-applied).
--
-- ---------------------------------------------------------------------------
-- WHY THIS MATTERS MORE THAN ITS SIZE SUGGESTS
-- ---------------------------------------------------------------------------
-- Every one of the shop's 23 Live products currently has went_live_at = NULL.
-- That single empty column disables a surprising amount of the app:
--
--   * listingReviews.js  — no 30/60/90/120 checkpoint clock can start
--   * tccIntelligence.js — computeMaturity() returns NO_LAUNCH_DATE, so
--                          diagnose() returns INSUFFICIENT for every listing
--                          and the whole funnel diagnosis is inert
--   * timingIntelligence.js — no launched-before/after-target comparison
--   * portfolioAnalysis.js  — no performance comparison by title strategy,
--                             format, aesthetic or anything else
--
-- So the learning loop cannot run at all until this is populated, no matter
-- what else gets built on top of it.
--
-- ---------------------------------------------------------------------------
-- WHY stage_updated_at IS A LEGITIMATE SOURCE HERE, NOT A GUESS
-- ---------------------------------------------------------------------------
-- timingIntelligence.js and tccIntelligence.js both carry explicit comments
-- refusing to infer went_live_at from created_at / updated_at / stage_updated_at.
-- That rule is about the ENGINES never silently substituting a proxy at read
-- time, and it stays intact — nothing in those files changes.
--
-- This is a different thing: a one-time, human-authorised backfill. Kristen
-- confirmed on 2026-08-22 that moving a product to Live IS the launch event,
-- which makes stage_updated_at on a Live product a record of when that
-- happened, not a guess about it. The app now writes went_live_at directly at
-- that moment (ProductWorkspace.handleStageUpdate and the Listing Builder save
-- path), so this migration only ever has to cover history.
--
-- Confidence is not uniform, and the split is worth knowing:
--   * 21 of 23 products have stage_updated_at = created_at, meaning they were
--     created straight as Live. For those the date is as good as recorded.
--   * 2 products changed stage at some point after creation, so their
--     stage_updated_at is the LAST stage change, which may be later than the
--     actual launch. Those two are listed by the verification query at the
--     bottom so they can be eyeballed and hand-corrected in the Timing panel.
--
-- Deliberately scoped to stage = 'Live'. A Paused or Killed product's
-- stage_updated_at records when it was paused or killed, which is emphatically
-- not a launch date; if any of those were once live, set them by hand.

UPDATE products
SET went_live_at = (stage_updated_at AT TIME ZONE 'UTC')::date
WHERE stage = 'Live'
  AND went_live_at IS NULL
  AND stage_updated_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Verify (optional — run after the above)
-- ---------------------------------------------------------------------------
-- Expect 23 Live products with a launch date and 0 without.
--
-- SELECT count(*) FILTER (WHERE went_live_at IS NOT NULL) AS with_date,
--        count(*) FILTER (WHERE went_live_at IS NULL)     AS without_date
-- FROM products WHERE stage = 'Live';
--
-- The 2 lower-confidence rows — stage changed at some point after creation, so
-- check these two dates look right and correct them in the Timing panel if not:
--
-- SELECT name, went_live_at, created_at::date AS created
-- FROM products
-- WHERE stage = 'Live' AND stage_updated_at <> created_at
-- ORDER BY went_live_at;
