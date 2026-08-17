-- Phase 22: Taylor POD Niche Calendar v4.0 -- source data seed
-- Run this in Supabase SQL Editor AFTER 20260820_timing_intelligence_phase22.sql
--
-- COPYRIGHT: this calendar is a purchased, personal-use-only resource
-- (c) 2025 Taylor Posada, LLC, part of a coaching program Kristen is enrolled
-- in. Its contents live in this private single-user database only. Do not
-- reproduce, redistribute, or surface this data on any public or shareable
-- page.
--
-- Everything here is EXPERT GUIDANCE attributed to one source -- never a TCC
-- fact. See the schema migration's header for why that distinction is
-- structural rather than a convention.
--
-- TRANSCRIBED VERBATIM, including the source's own inconsistencies:
--   * "Birthday Themes" (Jan/Feb) and "Birthday Theme" (Nov/Dec) are one
--     niche printed two ways -- unified by niche_id, both spellings preserved
--     in source_niche_label.
--   * Girls Trip is printed low-competition in January, emotion-based in
--     February and March, low-competition again in December. All four
--     transcribed as printed; nothing elects a winner.
--   * "Mardis Gras" and "Teacher Retirment" are the source's spellings and
--     are kept.
--
-- REAL GAPS IN THE SOURCE, preserved as NULL rather than filled in:
--   * Gender Reveal appears in September's DUE column but has no date in
--     September's calendar grid -- month precision, no day.
--
--   * 6 niches appear in a START column and never in any DUE column, so they
--     have no target live date at all: Best Man Proposal, Bridesmaid/Maid of Honor Proposal, General Retirement, Hobbies, Officiant Gifts, Summer Sports.
--
-- Counts: 69 niches, 186 guidance entries, 23 guidance notes.

-- ---------------------------------------------------------------------------
INSERT INTO timing_sources (name, source_type, version, edition_label, publisher, url, source_notes)
SELECT 'Taylor POD Niche Calendar', 'expert_guidance', '4.0', '2025-2026', 'Taylor Posada, LLC',
       'https://www.taylorpod.com',
       'Source-level guidance from the calendar preamble, in the author''s own framing:' || chr(10) ||
       chr(10) ||
       'RECURRENCE / PRECISION: "this calendar is designed to be reused each year -- which means dates are approximate and may shift slightly depending on the calendar year. always double check exact holiday dates and Etsy trends for the current year before listing."' || chr(10) ||
       chr(10) ||
       'INDEXING RUNWAY (why DUE precedes the actual event): "etsy''s algorithm needs time to index new listings. the earlier your product is live, the more time it has to build momentum before the peak -- so don''t wait until the last minute."' || chr(10) ||
       chr(10) ||
       'EVERGREEN IS NOT ANYTIME: "some niches in here are marked as evergreen, meaning they can sell all year -- but even those tend to have seasonal spikes in search volume. the calendar aligns with those natural surges."' || chr(10) ||
       chr(10) ||
       'TRADEMARKS: the author notes sellers are responsible for verifying phrases, keywords and designs against active trademarks before listing.' || chr(10) ||
       chr(10) ||
       'SYMBOL KEY: low competition / high competition / evergreen / fast mover / emotion-based.'
WHERE NOT EXISTS (
  SELECT 1 FROM timing_sources WHERE name = 'Taylor POD Niche Calendar' AND version = '4.0'
);

-- ---------------------------------------------------------------------------
INSERT INTO timing_niches (name)
VALUES
  ('100th Day of School'),
  ('4th of July'),
  ('Autism Awareness'),
  ('Baby Shower'),
  ('Babymoon'),
  ('Bachelor'),
  ('Bachelorette'),
  ('Back to School'),
  ('Baptism'),
  ('Baseball/Softball Season'),
  ('Best Man Proposal'),
  ('Birthday Themes'),
  ('Black History Month'),
  ('Book Reading'),
  ('Breast Cancer Awareness'),
  ('Bridal Shower'),
  ('Bridesmaid/Maid of Honor Proposal'),
  ('Camping & Outdoors'),
  ('Christmas'),
  ('Christmas in July'),
  ('Cinco De Mayo'),
  ('Company Holiday Parties'),
  ('Divorce/Breakup'),
  ('Earth Day'),
  ('Easter'),
  ('Engagement/Getting Married'),
  ('Family Reunion'),
  ('Family Vacation'),
  ('Father’s Day'),
  ('Fitness/Health'),
  ('Football Season'),
  ('Galentines'),
  ('Gender Reveal'),
  ('General Retirement'),
  ('Geography'),
  ('Girls Trip'),
  ('Godparent Proposal'),
  ('Graduation'),
  ('Graduation Party'),
  ('Halloween'),
  ('Hanukkah'),
  ('Hobbies'),
  ('Homecoming/School Spirit'),
  ('Honeymoon/Just Married'),
  ('Infertility/IVF'),
  ('International Women’s Day'),
  ('Mardis Gras'),
  ('Maternity'),
  ('Midwifery Week'),
  ('Mother’s Day'),
  ('New Homeowner'),
  ('Officiant Gifts'),
  ('Oktoberfest'),
  ('Pet Related'),
  ('Pride Month'),
  ('Principal Month'),
  ('Professions'),
  ('Running Events'),
  ('Soccer Season'),
  ('Spring Break'),
  ('St. Patrick’s Day'),
  ('Summer Sports'),
  ('Teacher Events'),
  ('Teacher Retirement'),
  ('Thanksgiving'),
  ('Valentines Day'),
  ('White Elephant/Gag Gifts'),
  ('Winter Sports'),
  ('Zodiac')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
INSERT INTO timing_guidance
  (source_id, niche_id, source_niche_label, guidance_state, month, day, date_precision,
   classification, classification_symbol, evidence_type)
SELECT (SELECT id FROM timing_sources WHERE name = 'Taylor POD Niche Calendar' AND version = '4.0'), tn.id, v.label, v.state, v.month, v.day, v.precision,
       v.classification, v.symbol, 'expert_guidance'
FROM (VALUES
  ('St. Patrick’s Day'::text, 'St. Patrick’s Day'::text, 'START'::text, 1::integer, NULL::integer, 'month'::text, 'high_competition'::text, '🔥'::text),
  ('Camping & Outdoors', 'Camping & Outdoors', 'START', 1, NULL, 'month', 'high_competition', '🔥'),
  ('Geography', 'Geography', 'START', 1, NULL, 'month', 'evergreen', '💡'),
  ('Family Vacation', 'Family Vacation', 'START', 1, NULL, 'month', 'evergreen', '💡'),
  ('Spring Break', 'Spring Break', 'START', 1, NULL, 'month', 'fast_mover', '⚡'),
  ('International Women’s Day', 'International Women’s Day', 'START', 1, NULL, 'month', 'emotion_based', '❤️'),
  ('Baseball/Softball Season', 'Baseball/Softball Season', 'START', 1, NULL, 'month', 'low_competition', '⭐'),
  ('Bachelorette', 'Bachelorette', 'CONTINUE', 1, NULL, 'month', 'high_competition', '🔥'),
  ('Girls Trip', 'Girls Trip', 'CONTINUE', 1, NULL, 'month', 'low_competition', '⭐'),
  ('Birthday Themes', 'Birthday Themes', 'CONTINUE', 1, NULL, 'month', 'evergreen', '💡'),
  ('Professions', 'Professions', 'CONTINUE', 1, NULL, 'month', 'evergreen', '💡'),
  ('Valentines Day', 'Valentines Day', 'DUE', 1, 10, 'day', 'emotion_based', '❤️'),
  ('100th Day of School', '100th Day of School', 'DUE', 1, 15, 'day', 'fast_mover', '⚡'),
  ('Mardis Gras', 'Mardis Gras', 'DUE', 1, 31, 'day', 'high_competition', '🔥'),
  ('Black History Month', 'Black History Month', 'DUE', 1, 17, 'day', 'emotion_based', '❤️'),
  ('Godparent Proposal', 'Godparent Proposal', 'DUE', 1, 25, 'day', 'low_competition', '⭐'),
  ('Galentines', 'Galentines', 'DUE', 1, 10, 'day', 'low_competition', '⭐'),
  ('Mother’s Day', 'Mother’s Day', 'START', 2, NULL, 'month', 'emotion_based', '❤️'),
  ('Graduation', 'Graduation', 'START', 2, NULL, 'month', 'evergreen', '💡'),
  ('Earth Day', 'Earth Day', 'START', 2, NULL, 'month', 'fast_mover', '⚡'),
  ('Autism Awareness', 'Autism Awareness', 'START', 2, NULL, 'month', 'emotion_based', '❤️'),
  ('Easter', 'Easter', 'START', 2, NULL, 'month', 'high_competition', '🔥'),
  ('Baptism', 'Baptism', 'START', 2, NULL, 'month', 'evergreen', '💡'),
  ('Bridal Shower', 'Bridal Shower', 'START', 2, NULL, 'month', 'evergreen', '💡'),
  ('Baby Shower', 'Baby Shower', 'START', 2, NULL, 'month', 'evergreen', '💡'),
  ('Bachelorette', 'Bachelorette', 'CONTINUE', 2, NULL, 'month', 'high_competition', '🔥'),
  ('Girls Trip', 'Girls Trip', 'CONTINUE', 2, NULL, 'month', 'emotion_based', '❤️'),
  ('Camping & Outdoors', 'Camping & Outdoors', 'CONTINUE', 2, NULL, 'month', 'high_competition', '🔥'),
  ('Geography', 'Geography', 'CONTINUE', 2, NULL, 'month', 'evergreen', '💡'),
  ('Family Vacation', 'Family Vacation', 'CONTINUE', 2, NULL, 'month', 'evergreen', '💡'),
  ('Baseball/Softball Season', 'Baseball/Softball Season', 'CONTINUE', 2, NULL, 'month', 'low_competition', '⭐'),
  ('Professions', 'Professions', 'CONTINUE', 2, NULL, 'month', 'evergreen', '💡'),
  ('Birthday Themes', 'Birthday Themes', 'CONTINUE', 2, NULL, 'month', 'evergreen', '💡'),
  ('St. Patrick’s Day', 'St. Patrick’s Day', 'DUE', 2, 17, 'day', 'high_competition', '🔥'),
  ('Spring Break', 'Spring Break', 'DUE', 2, 21, 'day', 'fast_mover', '⚡'),
  ('International Women’s Day', 'International Women’s Day', 'DUE', 2, 14, 'day', 'emotion_based', '❤️'),
  ('Birthday Themes', 'Birthday Themes', 'DUE', 2, 15, 'day', 'evergreen', '💡'),
  ('Teacher Retirement', 'Teacher Retirement', 'START', 3, NULL, 'month', 'evergreen', '💡'),
  ('Bachelor', 'Bachelor', 'START', 3, NULL, 'month', 'high_competition', '🔥'),
  ('Father’s Day', 'Father’s Day', 'START', 3, NULL, 'month', 'emotion_based', '❤️'),
  ('Teacher Events', 'Teacher Events', 'START', 3, NULL, 'month', 'low_competition', '⭐'),
  ('Cinco De Mayo', 'Cinco De Mayo', 'START', 3, NULL, 'month', 'fast_mover', '⚡'),
  ('Graduation Party', 'Graduation Party', 'START', 3, NULL, 'month', 'fast_mover', '⚡'),
  ('New Homeowner', 'New Homeowner', 'START', 3, NULL, 'month', 'evergreen', '💡'),
  ('Mother’s Day', 'Mother’s Day', 'CONTINUE', 3, NULL, 'month', 'emotion_based', '❤️'),
  ('Graduation', 'Graduation', 'CONTINUE', 3, NULL, 'month', 'evergreen', '💡'),
  ('Earth Day', 'Earth Day', 'CONTINUE', 3, NULL, 'month', 'fast_mover', '⚡'),
  ('Bachelorette', 'Bachelorette', 'CONTINUE', 3, NULL, 'month', 'high_competition', '🔥'),
  ('Baptism', 'Baptism', 'CONTINUE', 3, NULL, 'month', 'evergreen', '💡'),
  ('Bridal Shower', 'Bridal Shower', 'CONTINUE', 3, NULL, 'month', 'evergreen', '💡'),
  ('Baby Shower', 'Baby Shower', 'CONTINUE', 3, NULL, 'month', 'evergreen', '💡'),
  ('Easter', 'Easter', 'DUE', 3, 15, 'day', 'high_competition', '🔥'),
  ('Girls Trip', 'Girls Trip', 'DUE', 3, 31, 'day', 'emotion_based', '❤️'),
  ('Camping & Outdoors', 'Camping & Outdoors', 'DUE', 3, 15, 'day', 'high_competition', '🔥'),
  ('Geography', 'Geography', 'DUE', 3, 28, 'day', 'evergreen', '💡'),
  ('Family Vacation', 'Family Vacation', 'DUE', 3, 30, 'day', 'evergreen', '💡'),
  ('Baseball/Softball Season', 'Baseball/Softball Season', 'DUE', 3, 8, 'day', 'low_competition', '⭐'),
  ('Professions', 'Professions', 'DUE', 3, 31, 'day', 'evergreen', '💡'),
  ('Autism Awareness', 'Autism Awareness', 'DUE', 3, 21, 'day', 'emotion_based', '❤️'),
  ('Pride Month', 'Pride Month', 'START', 4, NULL, 'month', 'fast_mover', '⚡'),
  ('Gender Reveal', 'Gender Reveal', 'START', 4, NULL, 'month', 'evergreen', '💡'),
  ('Babymoon', 'Babymoon', 'START', 4, NULL, 'month', 'evergreen', '💡'),
  ('Hobbies', 'Hobbies', 'START', 4, NULL, 'month', 'low_competition', '⭐'),
  ('General Retirement', 'General Retirement', 'START', 4, NULL, 'month', 'evergreen', '💡'),
  ('Bachelorette', 'Bachelorette', 'CONTINUE', 4, NULL, 'month', 'high_competition', '🔥'),
  ('Teacher Retirement', 'Teacher Retirement', 'CONTINUE', 4, NULL, 'month', 'evergreen', '💡'),
  ('Bachelor', 'Bachelor', 'CONTINUE', 4, NULL, 'month', 'high_competition', '🔥'),
  ('Father’s Day', 'Father’s Day', 'CONTINUE', 4, NULL, 'month', 'emotion_based', '❤️'),
  ('Graduation Party', 'Graduation Party', 'CONTINUE', 4, NULL, 'month', 'fast_mover', '⚡'),
  ('New Homeowner', 'New Homeowner', 'CONTINUE', 4, NULL, 'month', 'evergreen', '💡'),
  ('Mother’s Day', 'Mother’s Day', 'DUE', 4, 12, 'day', 'emotion_based', '❤️'),
  ('Graduation', 'Graduation', 'DUE', 4, 25, 'day', 'evergreen', '💡'),
  ('Earth Day', 'Earth Day', 'DUE', 4, 4, 'day', 'fast_mover', '⚡'),
  ('Teacher Events', 'Teacher Events', 'DUE', 4, 15, 'day', 'low_competition', '⭐'),
  ('Baptism', 'Baptism', 'DUE', 4, 25, 'day', 'evergreen', '💡'),
  ('Cinco De Mayo', 'Cinco De Mayo', 'DUE', 4, 5, 'day', 'fast_mover', '⚡'),
  ('Bridal Shower', 'Bridal Shower', 'DUE', 4, 30, 'day', 'evergreen', '💡'),
  ('Baby Shower', 'Baby Shower', 'DUE', 4, 30, 'day', 'evergreen', '💡'),
  ('4th of July', '4th of July', 'START', 5, NULL, 'month', 'high_competition', '🔥'),
  ('Family Reunion', 'Family Reunion', 'START', 5, NULL, 'month', 'low_competition', '⭐'),
  ('Christmas in July', 'Christmas in July', 'START', 5, NULL, 'month', 'fast_mover', '⚡'),
  ('Summer Sports', 'Summer Sports', 'START', 5, NULL, 'month', 'low_competition', '⭐'),
  ('Divorce/Breakup', 'Divorce/Breakup', 'START', 5, NULL, 'month', 'low_competition', '⭐'),
  ('Bachelorette', 'Bachelorette', 'CONTINUE', 5, NULL, 'month', 'high_competition', '🔥'),
  ('Bachelor', 'Bachelor', 'CONTINUE', 5, NULL, 'month', 'high_competition', '🔥'),
  ('Gender Reveal', 'Gender Reveal', 'CONTINUE', 5, NULL, 'month', 'evergreen', '💡'),
  ('Babymoon', 'Babymoon', 'CONTINUE', 5, NULL, 'month', 'evergreen', '💡'),
  ('New Homeowner', 'New Homeowner', 'CONTINUE', 5, NULL, 'month', 'evergreen', '💡'),
  ('Pride Month', 'Pride Month', 'DUE', 5, 9, 'day', 'fast_mover', '⚡'),
  ('Teacher Retirement', 'Teacher Retirement', 'DUE', 5, 2, 'day', 'evergreen', '💡'),
  ('Father’s Day', 'Father’s Day', 'DUE', 5, 14, 'day', 'emotion_based', '❤️'),
  ('Graduation Party', 'Graduation Party', 'DUE', 5, 30, 'day', 'fast_mover', '⚡'),
  ('Back to School', 'Back to School', 'START', 6, NULL, 'month', 'high_competition', '🔥'),
  ('Maternity', 'Maternity', 'START', 6, NULL, 'month', 'evergreen', '💡'),
  ('Honeymoon/Just Married', 'Honeymoon/Just Married', 'START', 6, NULL, 'month', 'low_competition', '⭐'),
  ('Bachelorette', 'Bachelorette', 'CONTINUE', 6, NULL, 'month', 'high_competition', '🔥'),
  ('Bachelor', 'Bachelor', 'CONTINUE', 6, NULL, 'month', 'high_competition', '🔥'),
  ('Gender Reveal', 'Gender Reveal', 'CONTINUE', 6, NULL, 'month', 'evergreen', '💡'),
  ('Babymoon', 'Babymoon', 'CONTINUE', 6, NULL, 'month', 'evergreen', '💡'),
  ('Divorce/Breakup', 'Divorce/Breakup', 'CONTINUE', 6, NULL, 'month', 'low_competition', '⭐'),
  ('4th of July', '4th of July', 'DUE', 6, 4, 'day', 'high_competition', '🔥'),
  ('Family Reunion', 'Family Reunion', 'DUE', 6, 15, 'day', 'low_competition', '⭐'),
  ('Christmas in July', 'Christmas in July', 'DUE', 6, 13, 'day', 'fast_mover', '⚡'),
  ('New Homeowner', 'New Homeowner', 'DUE', 6, 30, 'day', 'evergreen', '💡'),
  ('Halloween', 'Halloween', 'START', 7, NULL, 'month', 'high_competition', '🔥'),
  ('Oktoberfest', 'Oktoberfest', 'START', 7, NULL, 'month', 'low_competition', '⭐'),
  ('Football Season', 'Football Season', 'START', 7, NULL, 'month', 'fast_mover', '⚡'),
  ('Soccer Season', 'Soccer Season', 'START', 7, NULL, 'month', 'low_competition', '⭐'),
  ('Bachelorette', 'Bachelorette', 'CONTINUE', 7, NULL, 'month', 'high_competition', '🔥'),
  ('Bachelor', 'Bachelor', 'CONTINUE', 7, NULL, 'month', 'high_competition', '🔥'),
  ('Gender Reveal', 'Gender Reveal', 'CONTINUE', 7, NULL, 'month', 'evergreen', '💡'),
  ('Honeymoon/Just Married', 'Honeymoon/Just Married', 'CONTINUE', 7, NULL, 'month', 'low_competition', '⭐'),
  ('Maternity', 'Maternity', 'CONTINUE', 7, NULL, 'month', 'evergreen', '💡'),
  ('Back to School', 'Back to School', 'DUE', 7, 15, 'day', 'high_competition', '🔥'),
  ('Babymoon', 'Babymoon', 'DUE', 7, 31, 'day', 'evergreen', '💡'),
  ('Divorce/Breakup', 'Divorce/Breakup', 'DUE', 7, 11, 'day', 'low_competition', '⭐'),
  ('Christmas', 'Christmas', 'START', 8, NULL, 'month', 'high_competition', '🔥'),
  ('Principal Month', 'Principal Month', 'START', 8, NULL, 'month', 'low_competition', '⭐'),
  ('Midwifery Week', 'Midwifery Week', 'START', 8, NULL, 'month', 'low_competition', '⭐'),
  ('Book Reading', 'Book Reading', 'START', 8, NULL, 'month', 'evergreen', '💡'),
  ('Zodiac', 'Zodiac', 'START', 8, NULL, 'month', 'evergreen', '💡'),
  ('Homecoming/School Spirit', 'Homecoming/School Spirit', 'START', 8, NULL, 'month', 'low_competition', '⭐'),
  ('Breast Cancer Awareness', 'Breast Cancer Awareness', 'START', 8, NULL, 'month', 'fast_mover', '⚡'),
  ('Infertility/IVF', 'Infertility/IVF', 'START', 8, NULL, 'month', 'low_competition', '⭐'),
  ('Bachelorette', 'Bachelorette', 'CONTINUE', 8, NULL, 'month', 'high_competition', '🔥'),
  ('Bachelor', 'Bachelor', 'CONTINUE', 8, NULL, 'month', 'high_competition', '🔥'),
  ('Gender Reveal', 'Gender Reveal', 'CONTINUE', 8, NULL, 'month', 'evergreen', '💡'),
  ('Halloween', 'Halloween', 'CONTINUE', 8, NULL, 'month', 'high_competition', '🔥'),
  ('Honeymoon/Just Married', 'Honeymoon/Just Married', 'DUE', 8, 30, 'day', 'low_competition', '⭐'),
  ('Oktoberfest', 'Oktoberfest', 'DUE', 8, 16, 'day', 'low_competition', '⭐'),
  ('Football Season', 'Football Season', 'DUE', 8, 9, 'day', 'fast_mover', '⚡'),
  ('Soccer Season', 'Soccer Season', 'DUE', 8, 9, 'day', 'low_competition', '⭐'),
  ('Maternity', 'Maternity', 'DUE', 8, 30, 'day', 'evergreen', '💡'),
  ('Winter Sports', 'Winter Sports', 'START', 9, NULL, 'month', 'low_competition', '⭐'),
  ('Thanksgiving', 'Thanksgiving', 'START', 9, NULL, 'month', 'fast_mover', '⚡'),
  ('Running Events', 'Running Events', 'START', 9, NULL, 'month', 'low_competition', '⭐'),
  ('Christmas', 'Christmas', 'CONTINUE', 9, NULL, 'month', 'high_competition', '🔥'),
  ('Book Reading', 'Book Reading', 'CONTINUE', 9, NULL, 'month', 'evergreen', '💡'),
  ('Zodiac', 'Zodiac', 'CONTINUE', 9, NULL, 'month', 'evergreen', '💡'),
  ('Bachelorette', 'Bachelorette', 'DUE', 9, 5, 'day', 'high_competition', '🔥'),
  ('Bachelor', 'Bachelor', 'DUE', 9, 5, 'day', 'high_competition', '🔥'),
  ('Halloween', 'Halloween', 'DUE', 9, 30, 'day', 'high_competition', '🔥'),
  ('Homecoming/School Spirit', 'Homecoming/School Spirit', 'DUE', 9, 6, 'day', 'low_competition', '⭐'),
  ('Breast Cancer Awareness', 'Breast Cancer Awareness', 'DUE', 9, 15, 'day', 'fast_mover', '⚡'),
  ('Principal Month', 'Principal Month', 'DUE', 9, 7, 'day', 'low_competition', '⭐'),
  ('Midwifery Week', 'Midwifery Week', 'DUE', 9, 7, 'day', 'low_competition', '⭐'),
  ('Gender Reveal', 'Gender Reveal', 'DUE', 9, NULL, 'month', 'evergreen', '💡'),
  ('Hanukkah', 'Hanukkah', 'START', 10, NULL, 'month', 'low_competition', '⭐'),
  ('Engagement/Getting Married', 'Engagement/Getting Married', 'START', 10, NULL, 'month', 'high_competition', '🔥'),
  ('Pet Related', 'Pet Related', 'START', 10, NULL, 'month', 'evergreen', '💡'),
  ('Company Holiday Parties', 'Company Holiday Parties', 'START', 10, NULL, 'month', 'low_competition', '⭐'),
  ('White Elephant/Gag Gifts', 'White Elephant/Gag Gifts', 'START', 10, NULL, 'month', 'low_competition', '⭐'),
  ('Christmas', 'Christmas', 'CONTINUE', 10, NULL, 'month', 'high_competition', '🔥'),
  ('Winter Sports', 'Winter Sports', 'CONTINUE', 10, NULL, 'month', 'low_competition', '⭐'),
  ('Book Reading', 'Book Reading', 'DUE', 10, 15, 'day', 'evergreen', '💡'),
  ('Zodiac', 'Zodiac', 'DUE', 10, 11, 'day', 'evergreen', '💡'),
  ('Thanksgiving', 'Thanksgiving', 'DUE', 10, 26, 'day', 'fast_mover', '⚡'),
  ('Running Events', 'Running Events', 'DUE', 10, 31, 'day', 'low_competition', '⭐'),
  ('Infertility/IVF', 'Infertility/IVF', 'DUE', 10, 25, 'day', 'low_competition', '⭐'),
  ('Professions', 'Professions', 'START', 11, NULL, 'month', 'evergreen', '💡'),
  ('Fitness/Health', 'Fitness/Health', 'START', 11, NULL, 'month', 'evergreen', '💡'),
  ('Birthday Themes', 'Birthday Theme', 'START', 11, NULL, 'month', 'evergreen', '💡'),
  ('Godparent Proposal', 'Godparent Proposal', 'START', 11, NULL, 'month', 'low_competition', '⭐'),
  ('Engagement/Getting Married', 'Engagement/Getting Married', 'CONTINUE', 11, NULL, 'month', 'high_competition', '🔥'),
  ('Pet Related', 'Pet Related', 'CONTINUE', 11, NULL, 'month', 'evergreen', '💡'),
  ('Christmas', 'Christmas', 'DUE', 11, 22, 'day', 'high_competition', '🔥'),
  ('Winter Sports', 'Winter Sports', 'DUE', 11, 8, 'day', 'low_competition', '⭐'),
  ('Hanukkah', 'Hanukkah', 'DUE', 11, 22, 'day', 'low_competition', '⭐'),
  ('White Elephant/Gag Gifts', 'White Elephant/Gag Gifts', 'DUE', 11, 12, 'day', 'low_competition', '⭐'),
  ('Company Holiday Parties', 'Company Holiday Parties', 'DUE', 11, 15, 'day', 'low_competition', '⭐'),
  ('Bachelorette', 'Bachelorette', 'START', 12, NULL, 'month', 'high_competition', '🔥'),
  ('Valentines Day', 'Valentines Day', 'START', 12, NULL, 'month', 'emotion_based', '❤️'),
  ('Galentines', 'Galentines', 'START', 12, NULL, 'month', 'low_competition', '⭐'),
  ('100th Day of School', '100th Day of School', 'START', 12, NULL, 'month', 'fast_mover', '⚡'),
  ('Girls Trip', 'Girls Trip', 'START', 12, NULL, 'month', 'low_competition', '⭐'),
  ('Mardis Gras', 'Mardis Gras', 'START', 12, NULL, 'month', 'high_competition', '🔥'),
  ('Bridesmaid/Maid of Honor Proposal', 'Bridesmaid/Maid of Honor Proposal', 'START', 12, NULL, 'month', 'low_competition', '⭐'),
  ('Officiant Gifts', 'Officiant Gifts', 'START', 12, NULL, 'month', 'low_competition', '⭐'),
  ('Best Man Proposal', 'Best Man Proposal', 'START', 12, NULL, 'month', 'low_competition', '⭐'),
  ('Black History Month', 'Black History Month', 'START', 12, NULL, 'month', 'emotion_based', '❤️'),
  ('Professions', 'Professions', 'CONTINUE', 12, NULL, 'month', 'evergreen', '💡'),
  ('Birthday Themes', 'Birthday Theme', 'CONTINUE', 12, NULL, 'month', 'evergreen', '💡'),
  ('Godparent Proposal', 'Godparent Proposal', 'CONTINUE', 12, NULL, 'month', 'low_competition', '⭐'),
  ('Engagement/Getting Married', 'Engagement/Getting Married', 'DUE', 12, 6, 'day', 'high_competition', '🔥'),
  ('Pet Related', 'Pet Related', 'DUE', 12, 15, 'day', 'evergreen', '💡'),
  ('Fitness/Health', 'Fitness/Health', 'DUE', 12, 20, 'day', 'evergreen', '💡')
) AS v(niche, label, state, month, day, precision, classification, symbol)
JOIN timing_niches tn ON lower(tn.name) = lower(v.niche);

-- ---------------------------------------------------------------------------
-- guidance_type NULL = mixed or ambiguous, left for a human to classify.
-- assigned_by 'import_proposal' marks every type below as a proposal made
-- during transcription, not Kristen's own judgment -- so which is which stays
-- visible and correctable.
INSERT INTO timing_guidance_notes (guidance_id, guidance_type, text, assigned_by)
SELECT g.id, v.gtype, v.text, 'import_proposal'
FROM (VALUES
  (1::integer, 'START'::text, 'Geography'::text, 'niche'::text, 'states, cities, countries'::text),
  (1, 'START', 'Family Vacation', 'niche', 'camping, cruises, etc.'),
  (1, 'START', 'Baseball/Softball Season', NULL, 'focus towards youth sports (ie: ‘baseball mom’)'),
  (2, 'START', 'Graduation', 'niche', 'high school college, class of 20xx'),
  (3, 'START', 'Teacher Retirement', 'niche', 'include Principal Retirment'),
  (3, 'START', 'Teacher Events', 'niche', 'teacher appreciation, field day, grade level recognition, last day of school'),
  (4, 'START', 'Pride Month', 'audience', 'focus on specific LGBTQ+ identities (like lesbian, trans, nonbinary, bisexual, etc.).'),
  (4, 'START', 'Hobbies', 'niche', 'scrapbooking, photography, baking, etc.'),
  (5, 'START', 'Summer Sports', NULL, 'golf, swimming, swim team, swim coach.'),
  (6, 'START', 'Back to School', NULL, 'for children, for teachers, specific school subjects, senior graduating class of 20xx, and kindergarten future class of 20xx)'),
  (6, 'START', 'Maternity', NULL, 'first time mom and pregnancy announcement'),
  (7, 'START', 'Halloween', NULL, 'costume themes work well, avoid generic halloween'),
  (7, 'START', 'Football Season', NULL, 'fantasy football, youth football focused (ie: ’”football mom”, dad, coach, etc.)'),
  (7, 'START', 'Soccer Season', NULL, 'focus towards youth sports (ie: “soccer mom”, etc.'),
  (8, 'START', 'Christmas', NULL, 'cross-niche with other themes for best results and remember christmas is a gift giving season focus on gift related keywords'),
  (8, 'START', 'Book Reading', 'seo', 'avoid book titles, focus on book genres & themes (ie: smut, spicy books, etc.)'),
  (8, 'START', 'Zodiac', 'timing', 'target each zodiac sign as it approaches through the year'),
  (9, 'START', 'Winter Sports', NULL, 'continue sports focuses towards youth sports (ie: basketball). also include snowboarding and skiing.'),
  (9, 'START', 'Running Events', NULL, 'a great combination can be for 5k’s (the ‘Turkey Trot’ is a common local 5k for Thanksgiving. Also consider 10k, half marathons, marathons.'),
  (10, 'START', 'Pet Related', NULL, 'specific breeds/pet types, new pet parent, animal rescue, pet memorial/grieving'),
  (11, 'START', 'Fitness/Health', 'niche', 'pilates, barre, weightlifting, yoga, anti-fitness humor'),
  (11, 'START', 'Birthday Themes', 'niche', 'childrens birthdays, decade celebrations (30s, 40s, 50s, etc.)'),
  (12, 'START', 'Bachelorette', NULL, 'there are new themes every year that begin to emerge, be specific with the theme you target for this')
) AS v(month, state, niche, gtype, text)
JOIN timing_niches tn ON lower(tn.name) = lower(v.niche)
JOIN timing_guidance g
  ON g.niche_id = tn.id AND g.month = v.month AND g.guidance_state = v.state
 AND g.source_id = (SELECT id FROM timing_sources WHERE name = 'Taylor POD Niche Calendar' AND version = '4.0');

-- ---------------------------------------------------------------------------
-- The verbatim note also lives on the parent row, unsplit, so the structured
-- split above can never be the only surviving copy of what the page said.
UPDATE timing_guidance g
SET guidance_text = sub.text
FROM (
  SELECT n.guidance_id, n.text FROM timing_guidance_notes n
  JOIN timing_guidance gg ON gg.id = n.guidance_id
  WHERE gg.source_id = (SELECT id FROM timing_sources WHERE name = 'Taylor POD Niche Calendar' AND version = '4.0')
) sub
WHERE g.id = sub.guidance_id;
