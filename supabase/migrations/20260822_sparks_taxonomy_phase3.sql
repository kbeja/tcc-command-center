-- Phase 3 — Sparks: taxonomy link + expanded Spark Types
-- Run this in the Supabase SQL Editor (not auto-applied).
--
-- Additive plus one in-place RENAME of existing idea_type values (see below for
-- why that is a rename and not a reclassification). No spark is deleted, no
-- spark changes temperature, and nothing is archived.
--
-- The brief is explicit that the Idea Vault must NOT be rebuilt (§8): Hot/Cold,
-- search, collection assignment, Evaluate, Activate, concept creation, archive,
-- bulk actions and stale-Hot handling all keep working exactly as they do now.
-- This only adds a niche link and widens the type vocabulary.
--
-- ---------------------------------------------------------------------------
-- 1. primary_niche_id — one primary path, not many
-- ---------------------------------------------------------------------------
-- A single nullable FK rather than a spark_niches junction. §4 is specific:
-- "Every relevant object should have ONE primary taxonomy path... Do not create
-- duplicate taxonomy records because one buyer can belong to multiple
-- identities. Use one primary path for organization. Use tags for
-- cross-discovery." Many-to-many is reserved for keywords (§29), where a term
-- genuinely serves several niches at once.
--
-- ON DELETE SET NULL: archiving or deleting a niche must never delete the ideas
-- filed under it. The idea is the asset; the niche is only how it was labelled.
--
-- Nothing is backfilled. 369 of 382 sparks have no collection either, and §10
-- is emphatic that Cold means "safely captured, not currently active" rather
-- than "unclassified backlog to work through". An unclassified spark is a
-- healthy resting state, not debt -- classification happens when an idea
-- resurfaces, per §35.
ALTER TABLE sparks
  ADD COLUMN IF NOT EXISTS primary_niche_id uuid REFERENCES niches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS sparks_primary_niche_id_idx ON sparks(primary_niche_id);

-- ---------------------------------------------------------------------------
-- 2. Spark types: 3 -> 6
-- ---------------------------------------------------------------------------
-- Current vocabulary is 'Product Idea', 'Strategy Idea', 'Tool/Resource'.
-- §9 asks for six: Product/Concept, Phrase, Niche/Market Idea, Visual
-- Direction, Research Lead, Strategy/Tool.
--
-- Worth knowing what the existing data actually says: of 382 sparks, 379 are
-- 'Product Idea' -- the column default -- with 2 'Strategy Idea' and 1
-- 'Tool/Resource'. So the field has never functioned as a classification at
-- all; almost every row simply inherited the default. The value of the six
-- types is entirely forward-looking.
--
-- The UPDATEs below are RENAMES, not reclassifications. 'Product Idea' and
-- 'Product / Concept' denote the same thing; 'Strategy Idea' and
-- 'Tool/Resource' both collapse into 'Strategy / Tool', which is how §9
-- describes that bucket ("Existing strategy/tool ideas -- keep these as Spark
-- Types"). No spark is being re-judged: deciding that some existing 'Product
-- Idea' is really a Phrase or a Research Lead is a human call per §40, and
-- nothing here attempts it. Those 379 stay Product / Concept until a person
-- says otherwise.
--
-- Type stays plain text with no CHECK constraint, matching every other
-- vocabulary column in this schema (zero CHECK constraints exist across all
-- prior migrations; vocabulary is validated in JS). A seventh type should be a
-- one-line JS change, never a migration.

UPDATE sparks SET idea_type = 'Product / Concept' WHERE idea_type = 'Product Idea';
UPDATE sparks SET idea_type = 'Strategy / Tool'   WHERE idea_type IN ('Strategy Idea', 'Tool/Resource');

-- Any spark that somehow has no type at all lands on the same default the
-- application uses, so the filter dropdown never has an invisible bucket.
UPDATE sparks SET idea_type = 'Product / Concept' WHERE idea_type IS NULL OR btrim(idea_type) = '';

-- Match the column default to the new vocabulary. Without this, any insert path
-- that omits idea_type would keep minting the retired 'Product Idea' string and
-- the vocabulary would silently split in two again.
ALTER TABLE sparks ALTER COLUMN idea_type SET DEFAULT 'Product / Concept';

-- ---------------------------------------------------------------------------
-- Verify (optional — run after the above)
-- ---------------------------------------------------------------------------
-- Expect exactly two type values in use (Product / Concept ~379,
-- Strategy / Tool 3), no legacy strings left, and 382 sparks with a NULL
-- primary_niche_id.
--
-- SELECT idea_type, count(*) FROM sparks GROUP BY idea_type ORDER BY 2 DESC;
--
-- SELECT count(*) FILTER (WHERE primary_niche_id IS NOT NULL) AS classified,
--        count(*) AS total
-- FROM sparks;
