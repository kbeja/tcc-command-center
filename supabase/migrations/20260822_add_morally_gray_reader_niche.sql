-- Add 'Morally Gray Reader' as a specific niche under Reading
-- Run this in the Supabase SQL Editor (not auto-applied).
--
-- ---------------------------------------------------------------------------
-- WHY THIS WAS RECLASSIFIED
-- ---------------------------------------------------------------------------
-- The Phase 2c triage filed "Morally Gray Society" as a Collection -- a curated
-- creative grouping rather than a market. Kristen pushed back, and the research
-- data agrees with her:
--
--     morally grey shirt ....... vol 142, comp 2,711
--     morally gray shirt ....... vol  21, comp 2,702
--     romantasy / romance reader ... ZERO keywords anywhere in research
--
-- It passes both tests the taxonomy uses to separate a niche from a collection:
-- the term exists in the world independently of TCC (established bookish
-- vocabulary), and shoppers demonstrably search it. Two live listings lead
-- their titles with it. It is better-evidenced than Romantasy Reader, which the
-- brief named but which has no research behind it at all.
--
-- (Aside, confirming the Reader Chapter style guide's own note: the UK spelling
-- "grey" outsearches "gray" here 142 to 21.)
--
-- ---------------------------------------------------------------------------
-- SIBLING OF ROMANTASY READER, NOT CHILD OF IT
-- ---------------------------------------------------------------------------
-- Kristen's instinct was a four-level chain:
--     Hobbies -> Reading -> Romantasy Reader -> Morally Gray
-- The taxonomy is three levels (LEVELS in src/lib/niches.js, enforced by
-- planReparent), so that does not fit as stated.
--
-- Resolved by flattening (Kristen's choice, 2026-08-22): Morally Gray Reader
-- sits under Reading as a SIBLING of Romantasy Reader. That is not merely a
-- workaround for the depth limit -- morally gray characters appear across
-- romance, fantasy AND romantasy, so it is a trope preference cutting sideways
-- through those genres rather than a subset of any one of them. Siblings model
-- that honestly; a parent-child edge would assert a containment that is not
-- true. Keyword overlap between them is handled by the many-to-many keyword
-- links Phase 5 adds, which is the right layer for it.
--
-- If cases like this recur (genre -> trope is a real hierarchy in books with no
-- equivalent in, say, hockey), a fourth level is the honest answer and should
-- be added deliberately rather than by accumulating flattened siblings.
--
-- ---------------------------------------------------------------------------
-- THE COLLECTION STAYS, AND STAYS A COLLECTION
-- ---------------------------------------------------------------------------
-- "Morally Gray Society" -- the club, the crest, the badge tee -- remains a
-- Collection. That name IS a TCC invention and nobody searches it. The word
-- "Society" is precisely the dividing line:
--     Morally Gray Reader   -> the customer      (niche, searchable)
--     Morally Gray Society  -> the creative world (collection, invented)
-- Both are true at once, which is exactly what the two layers are for.

-- ---------------------------------------------------------------------------
-- 1. The niche
-- ---------------------------------------------------------------------------
INSERT INTO niches (name, level, parent_id, source)
SELECT 'Morally Gray Reader', 'specific', s.id, 'tcc_extension'
FROM niches s
JOIN niches b ON b.id = s.parent_id AND b.parent_id IS NULL AND lower(b.name) = 'hobbies'
WHERE lower(s.name) = 'reading'
  AND NOT EXISTS (
    SELECT 1 FROM niches n
    WHERE n.parent_id = s.id AND lower(n.name) = 'morally gray reader'
  );

-- ---------------------------------------------------------------------------
-- 2. Link the collection to it, ALONGSIDE its existing links
-- ---------------------------------------------------------------------------
-- Morally Gray Society is already linked to Romance Reader and Fantasy Reader
-- from the Phase 2c seed. This ADDS Morally Gray Reader rather than replacing
-- them: the collection genuinely serves all three, which is the whole reason
-- niche_collections is many-to-many. Nothing is unlinked here.
INSERT INTO niche_collections (niche_id, collection_id)
SELECT n.id, c.id
FROM niches n
JOIN collections c ON c.name = 'Morally Gray Society'
WHERE lower(n.name) = 'morally gray reader'
  AND NOT EXISTS (
    SELECT 1 FROM niche_collections nc WHERE nc.niche_id = n.id AND nc.collection_id = c.id
  );

-- ---------------------------------------------------------------------------
-- Verify (optional — run after the above)
-- ---------------------------------------------------------------------------
-- Expect Reading to have 7 specific niches, and Morally Gray Society to be
-- linked to 3.
--
-- SELECT sp.name FROM niches sp
-- JOIN niches s ON s.id = sp.parent_id
-- WHERE lower(s.name) = 'reading' ORDER BY sp.name;
--
-- SELECT c.name AS collection, n.name AS niche
-- FROM niche_collections nc
-- JOIN collections c ON c.id = nc.collection_id
-- JOIN niches n      ON n.id = nc.niche_id
-- WHERE c.name = 'Morally Gray Society' ORDER BY n.name;
