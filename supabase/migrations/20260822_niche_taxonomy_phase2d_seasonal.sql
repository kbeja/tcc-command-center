-- Shared Niche Taxonomy — Phase 2d: Seasonal branch + calendar-derived niches
-- Run this in the Supabase SQL Editor (not auto-applied).
--
-- Adds 34 sub-niches and 34 links to the Phase 22 timing calendar. Purely
-- additive: no existing row is modified, nothing is deleted, and Phase 2c's
-- 34 niches are untouched.
--
-- Reviewed and approved by Kristen 2026-08-22 (docs/taxonomy-proposal.md §11).
--
-- ---------------------------------------------------------------------------
-- WHY MOST OF THE CALENDAR IS NOT IN HERE
-- ---------------------------------------------------------------------------
-- The Phase 22 calendar has 69 entries and is NOT a seasonal set -- roughly
-- half are wedding/baby lifecycle events (Bachelorette, Gender Reveal,
-- Baptism), life events (Divorce/Breakup, New Homeowner, Retirement) or plain
-- evergreen niches (Book Reading, Zodiac, Pet Related). Those belong to
-- Wedding / Relationships / Hobbies, not Seasonal, and several already exist
-- as Phase 2c niches. They are deliberately left alone here -- nothing in this
-- file deletes or changes a timing_niches row.
--
-- The calendar's months are LISTING months, not event months (Christmas sits
-- at 8-11), so seasonality could not have been detected automatically from the
-- data either. The split in §11 of the proposal doc is a human judgment call,
-- reviewed before this file was written.
--
-- ---------------------------------------------------------------------------
-- A SEASON IS A WINDOW ON A NODE, NOT A PLACE IN THE TREE
-- ---------------------------------------------------------------------------
-- Kristen's ruling on the borderline set: entries that are not really seasonal
-- "should fall under the correct broad niches." So "Football Season" does not
-- become Seasonal -> Football Season; it becomes Hobbies -> Football, and the
-- calendar entry attaches as TIMING GUIDANCE through niche_timing_niches.
--
-- That is exactly what §1.1 of the proposal designed that junction for, and it
-- keeps the sport-first rule intact: Hobbies -> Football -> Football Mom stays
-- available, which would have been impossible if "Football Season" had eaten
-- the Football slot.
--
-- Deliberately NOT created: Winter Sports and Summer Sports. Both are
-- groupings rather than sports, and would sit awkwardly beside Hockey and
-- Football under the sport-first rule. Only specific sports are created.
--
-- White Elephant / Gag Gifts sits under Funny, not Seasonal: the humor is the
-- product and the Christmas window is only timing, which the timing link
-- carries anyway.
--
-- ---------------------------------------------------------------------------
-- TCC NAMES VS SOURCE LABELS
-- ---------------------------------------------------------------------------
-- The niche name is TCC's own; the calendar label is the source's, quoted
-- exactly as printed. They differ in four places -- the calendar uses curly
-- apostrophes (Mother’s Day), omits one (Valentines Day), and carries a
-- misspelling (Mardis Gras). Phase 22's whole design premise is that a
-- source's vocabulary is never silently promoted to TCC fact, so the links
-- below map explicitly between the two rather than assuming the strings match.
-- Get this wrong and the link silently inserts zero rows.
--
-- Idempotent throughout via WHERE NOT EXISTS. Safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. Seasonal sub-niches (27)
-- ---------------------------------------------------------------------------
INSERT INTO niches (name, level, parent_id, source)
SELECT v.name, 'sub', b.id, 'tcc_extension'
FROM (VALUES
  -- Fixed-date holidays
  ('Christmas'), ('Christmas in July'), ('Halloween'), ('Thanksgiving'),
  ('Easter'), ('Valentine''s Day'), ('Galentines'), ('St. Patrick''s Day'),
  ('4th of July'), ('Hanukkah'), ('Cinco de Mayo'), ('Mardi Gras'),
  ('Oktoberfest'), ('Earth Day'),
  -- Awareness observances
  ('Black History Month'), ('Pride Month'), ('Breast Cancer Awareness'),
  ('Autism Awareness'), ('International Women''s Day'),
  -- School calendar
  ('Back to School'), ('100th Day of School'), ('Spring Break'), ('Graduation'),
  -- Dated gifting
  ('Mother''s Day'), ('Father''s Day'), ('Company Holiday Parties'),
  -- Not in the calendar at all -- needed for the Summer Printables overlay,
  -- so it gets no timing link below.
  ('Summer')
) AS v(name)
JOIN niches b ON b.parent_id IS NULL AND lower(b.name) = 'seasonal'
WHERE NOT EXISTS (
  SELECT 1 FROM niches n WHERE n.parent_id = b.id AND lower(n.name) = lower(v.name)
);

-- ---------------------------------------------------------------------------
-- 2. Calendar entries that belong to other broad niches (7)
-- ---------------------------------------------------------------------------
-- Baseball and Softball are separate sub-niches (Kristen, 2026-08-22) even
-- though Taylor tracks them as one calendar entry -- same reasoning that keeps
-- hockey and football apart: different buyers, different search terms. Both
-- link back to that single shared calendar entry in step 3.
INSERT INTO niches (name, level, parent_id, source)
SELECT v.name, 'sub', b.id, 'tcc_extension'
FROM (VALUES
  ('Hobbies',     'Football'),
  ('Hobbies',     'Soccer'),
  ('Hobbies',     'Baseball'),
  ('Hobbies',     'Softball'),
  ('Professions', 'Principals'),
  ('Professions', 'Midwives'),
  ('Funny',       'White Elephant / Gag Gifts')
) AS v(parent_name, name)
JOIN niches b ON b.parent_id IS NULL AND lower(b.name) = lower(v.parent_name)
WHERE NOT EXISTS (
  SELECT 1 FROM niches n WHERE n.parent_id = b.id AND lower(n.name) = lower(v.name)
);

-- ---------------------------------------------------------------------------
-- 3. Timing links — niche ↔ Phase 22 calendar entry (34)
-- ---------------------------------------------------------------------------
-- This is what makes the Seasonal branch carry real sourced launch windows
-- instead of a guessed date, and what lets Hobbies -> Football inherit
-- "Football Season" timing without that season occupying a slot in the tree.
--
-- Teachers is matched but NOT created -- it already exists from Phase 2c, and
-- gains only its Teacher Events window here.
--
-- Niches are matched by name across the whole tree rather than by parent,
-- because every name on the right-hand side is unique in the taxonomy as it
-- stands. If a future duplicate name appears, this needs a parent qualifier.
INSERT INTO niche_timing_niches (niche_id, timing_niche_id)
SELECT n.id, t.id
FROM (VALUES
  -- Seasonal: TCC name  -> calendar label exactly as printed
  ('Christmas',                  'Christmas'),
  ('Christmas in July',          'Christmas in July'),
  ('Halloween',                  'Halloween'),
  ('Thanksgiving',               'Thanksgiving'),
  ('Easter',                     'Easter'),
  ('Valentine''s Day',           'Valentines Day'),           -- source omits the apostrophe
  ('Galentines',                 'Galentines'),
  ('St. Patrick''s Day',         'St. Patrick’s Day'),        -- curly apostrophe in source
  ('4th of July',                '4th of July'),
  ('Hanukkah',                   'Hanukkah'),
  ('Cinco de Mayo',              'Cinco De Mayo'),            -- source capitalises De
  ('Mardi Gras',                 'Mardis Gras'),              -- source misspells it
  ('Oktoberfest',                'Oktoberfest'),
  ('Earth Day',                  'Earth Day'),
  ('Black History Month',        'Black History Month'),
  ('Pride Month',                'Pride Month'),
  ('Breast Cancer Awareness',    'Breast Cancer Awareness'),
  ('Autism Awareness',           'Autism Awareness'),
  ('International Women''s Day', 'International Women’s Day'),-- curly apostrophe
  ('Back to School',             'Back to School'),
  ('100th Day of School',        '100th Day of School'),
  ('Spring Break',               'Spring Break'),
  ('Graduation',                 'Graduation'),
  ('Mother''s Day',              'Mother’s Day'),             -- curly apostrophe
  ('Father''s Day',              'Father’s Day'),             -- curly apostrophe
  ('Company Holiday Parties',    'Company Holiday Parties'),
  -- Hobbies: the sport is the niche, the season is its window
  ('Football',                   'Football Season'),
  ('Soccer',                     'Soccer Season'),
  ('Baseball',                   'Baseball/Softball Season'), -- one source entry,
  ('Softball',                   'Baseball/Softball Season'), -- two TCC niches
  -- Professions
  ('Teachers',                   'Teacher Events'),           -- niche already exists (Phase 2c)
  ('Principals',                 'Principal Month'),
  ('Midwives',                   'Midwifery Week'),
  -- Funny
  ('White Elephant / Gag Gifts', 'White Elephant/Gag Gifts')
) AS v(niche_name, calendar_label)
JOIN niches n        ON lower(n.name) = lower(v.niche_name)
JOIN timing_niches t ON lower(t.name) = lower(v.calendar_label)
WHERE NOT EXISTS (
  SELECT 1 FROM niche_timing_niches x
  WHERE x.niche_id = n.id AND x.timing_niche_id = t.id
);

-- ---------------------------------------------------------------------------
-- Verify (optional — run after the above)
-- ---------------------------------------------------------------------------
-- Expect 10 broad, 45 sub, 13 specific = 68 niches, and 34 timing links.
-- If timing links comes back lower than 34, a calendar label above failed to
-- match -- the mapping comments explain the four that differ.
--
-- SELECT level, count(*) FROM niches GROUP BY level ORDER BY level;
-- SELECT count(*) AS timing_links FROM niche_timing_niches;
--
-- Any mapping that silently matched nothing:
-- SELECT v.niche_name, v.calendar_label
-- FROM (VALUES ('Mardi Gras','Mardis Gras')) AS v(niche_name, calendar_label)
-- LEFT JOIN timing_niches t ON lower(t.name) = lower(v.calendar_label)
-- WHERE t.id IS NULL;
