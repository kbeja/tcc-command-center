-- Shared Niche Taxonomy — Phase 2c seed (evergreen branches)
-- Run this in the Supabase SQL Editor (not auto-applied).
--
-- Creates the 24 sub/specific niches from the reviewed triage in
-- docs/taxonomy-proposal.md §10, plus the 6 niche↔collection links for the five
-- collections that survive as curated groups.
--
-- Every node here was individually reviewed and approved by Kristen on
-- 2026-08-22 (§9 and §10.9 of that document) — this is a transcription of an
-- approved list, not an automatic classification. §40 forbids the latter.
--
-- SEASONAL IS NOT IN THIS FILE. The Seasonal branch is a separate approval
-- (which of the Phase 22 calendar's 69 entries are genuinely seasonal is its
-- own judgment call) and gets its own migration once that list is signed off.
--
-- ---------------------------------------------------------------------------
-- WHY THIS IS SQL RATHER THAN CLICKING 24 TIMES IN THE UI
-- ---------------------------------------------------------------------------
-- The Phase 2b admin UI can create every one of these, and will be how the tree
-- grows from here. But a reviewed 24-node list transcribed by hand through a UI
-- is 24 chances to fat-finger a name that then has to be found and fixed. As a
-- migration it is reviewable as one diff, re-runnable, and lands atomically.
--
-- ---------------------------------------------------------------------------
-- STRUCTURE: SUB = DOMAIN, SPECIFIC = BUYER IDENTITY
-- ---------------------------------------------------------------------------
-- Generalised from Kristen's decision that a hockey mom and a football mom are
-- different customers with different keyword universes, so the SPORT has to be
-- the sub-niche and the person the specific. Applied uniformly that gives
-- Reading → Romance Reader, Hockey → Hockey Mom, Mahjong → Mahjong Player,
-- Coffee → Coffee Lover. It is what makes Mahjong and Coffee two nodes each
-- rather than one; both are deliberately left with a single specific for now,
-- with room for Mahjong Mom / Coffee Mom style identities later.
--
-- ---------------------------------------------------------------------------
-- NO HARDCODED UUIDs
-- ---------------------------------------------------------------------------
-- Every parent is resolved by name at run time. Pasting UUIDs read from a live
-- query into a migration file is how a migration silently targets the wrong row
-- when it is re-run against a database that has been rebuilt. The lookups use
-- lower(name) to match the Phase 2a unique index's own case-insensitive
-- semantics.
--
-- Idempotent throughout via WHERE NOT EXISTS, same pattern as the Phase 2a
-- seed. Safe to re-run; re-running creates nothing and changes nothing.

-- ---------------------------------------------------------------------------
-- Helper: sub-niches (parent is a broad niche, matched by name)
-- ---------------------------------------------------------------------------
INSERT INTO niches (name, level, parent_id, source)
SELECT v.name, 'sub', b.id, v.source
FROM (VALUES
  -- HOBBIES. Reading is marked taylor_90day because Taylor's own sub-niche
  -- list for Hobbies names Reading explicitly. The sport/activity nodes are
  -- tcc_extension: Taylor nests these under a "Sports" level this taxonomy
  -- deliberately does not use (see the structure note above), so the
  -- arrangement is TCC's own even where the words overlap.
  ('Hobbies',       'Reading',      'taylor_90day'),
  ('Hobbies',       'Hockey',       'tcc_extension'),
  ('Hobbies',       'Field Hockey', 'tcc_extension'),
  ('Hobbies',       'Mahjong',      'tcc_extension'),
  ('Hobbies',       'Coffee',       'tcc_extension'),
  -- RELATIONSHIPS. Motherhood is the §38 TCC Extension case named in the brief.
  ('Relationships', 'Motherhood',   'tcc_extension'),
  ('Relationships', 'Fatherhood',   'tcc_extension'),
  -- PETS
  ('Pets',          'Pet Owners',   'tcc_extension'),
  -- PROFESSIONS
  ('Professions',   'Teachers',     'tcc_extension'),
  ('Professions',   'Librarians',   'tcc_extension'),
  -- FUNNY
  ('Funny',         'Unhinged',     'tcc_extension')
) AS v(parent_name, name, source)
JOIN niches b ON b.parent_id IS NULL AND lower(b.name) = lower(v.parent_name)
WHERE NOT EXISTS (
  SELECT 1 FROM niches n
  WHERE n.parent_id = b.id AND lower(n.name) = lower(v.name)
);

-- ---------------------------------------------------------------------------
-- Specific niches (parent is a sub-niche, matched by name + its own parent)
-- ---------------------------------------------------------------------------
-- The parent join is qualified by grandparent as well as name, so a future
-- sub-niche sharing a name under a different broad niche cannot capture these.
INSERT INTO niches (name, level, parent_id, source)
SELECT v.name, 'specific', s.id, 'tcc_extension'
FROM (VALUES
  -- Hobbies → Reading
  ('Hobbies', 'Reading',    'Book Lover'),
  ('Hobbies', 'Reading',    'BookTok Reader'),
  ('Hobbies', 'Reading',    'Romance Reader'),
  ('Hobbies', 'Reading',    'Romantasy Reader'),
  ('Hobbies', 'Reading',    'Fantasy Reader'),
  ('Hobbies', 'Reading',    'Kid Reader'),
  -- Hobbies → Hockey. Three distinct buyers currently sharing one collection:
  -- the shop's four live hockey listings target a mom, a girlfriend and a
  -- general fan, which is the evidence that forced three levels in the first
  -- place.
  ('Hobbies', 'Hockey',     'Hockey Mom'),
  ('Hobbies', 'Hockey',     'Hockey Girlfriend'),
  ('Hobbies', 'Hockey',     'Hockey Fan'),
  -- Hobbies → other
  ('Hobbies', 'Mahjong',    'Mahjong Player'),
  ('Hobbies', 'Coffee',     'Coffee Lover'),
  -- Relationships → Motherhood. Deliberately only one specific: the twelve Mom
  -- Chapter products read as one audience in different moods, not as separate
  -- buyer identities, and Kristen confirmed there are no others to split out.
  ('Relationships', 'Motherhood', 'Elder Millennial Mom'),
  -- Pets → Pet Owners
  ('Pets', 'Pet Owners', 'Dog Owner')
) AS v(grandparent_name, parent_name, name)
JOIN niches b ON b.parent_id IS NULL AND lower(b.name) = lower(v.grandparent_name)
JOIN niches s ON s.parent_id = b.id AND lower(s.name) = lower(v.parent_name)
WHERE NOT EXISTS (
  SELECT 1 FROM niches n
  WHERE n.parent_id = s.id AND lower(n.name) = lower(v.name)
);

-- ---------------------------------------------------------------------------
-- niche ↔ collection links for the five surviving curated Collections
-- ---------------------------------------------------------------------------
-- Morally Gray Society links to TWO niches, which is the case the many-to-many
-- junction exists for: it is genuinely both a romance and a fantasy reader
-- concept, and forcing it into one would lose half of what it is.
--
-- Matched on collections.name, which is not unique-constrained in that table --
-- if a duplicate name ever exists, this inserts a link for each, which is
-- harmless (the junction's composite PK dedupes identical pairs) and visible.
INSERT INTO niche_collections (niche_id, collection_id)
SELECT n.id, c.id
FROM (VALUES
  ('Morally Gray Society',   'Romance Reader'),
  ('Morally Gray Society',   'Fantasy Reader'),
  ('Spicy Books Social Club','Romance Reader'),
  ('Annotation Club',        'Reading'),
  ('Bookstore Weekend',      'Reading'),
  ('Reading Rituals',        'Reading')
) AS v(collection_name, niche_name)
JOIN collections c ON lower(c.name) = lower(v.collection_name)
JOIN niches n      ON lower(n.name) = lower(v.niche_name)
WHERE NOT EXISTS (
  SELECT 1 FROM niche_collections nc
  WHERE nc.niche_id = n.id AND nc.collection_id = c.id
);

-- ---------------------------------------------------------------------------
-- Verify (optional — run after the above)
-- ---------------------------------------------------------------------------
-- Expect 10 broad, 11 sub, 13 specific = 34 niches, and 6 collection links.
--
-- SELECT level, count(*) FROM niches GROUP BY level ORDER BY level;
--
-- SELECT b.name AS broad, s.name AS sub, sp.name AS specific
-- FROM niches b
-- LEFT JOIN niches s  ON s.parent_id  = b.id
-- LEFT JOIN niches sp ON sp.parent_id = s.id
-- WHERE b.parent_id IS NULL
-- ORDER BY b.name, s.name, sp.name;
--
-- SELECT c.name AS collection, n.name AS niche
-- FROM niche_collections nc
-- JOIN collections c ON c.id = nc.collection_id
-- JOIN niches n      ON n.id = nc.niche_id
-- ORDER BY c.name, n.name;
