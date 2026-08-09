-- Product-Concept Link Migration (Phase 10, Concept-to-Product half only)
-- Run this in Supabase SQL Editor (not auto-applied)
--
-- Why: Sparks, Concepts, and Products are only loosely related today by
-- matching collection name text. The Concept -> Listing Builder push bridge
-- (built this session) already carries a concept's id through the URL as
-- ?fromConcept=, but nothing persists that relationship once the listing is
-- saved -- it's a one-shot hand-off, not a real link. This adds the FK so
-- the relationship survives, Listing Builder can pull the concept's design
-- direction/visual style/mood live into generation, and products created the
-- old way can be linked to a concept manually after the fact.
--
-- Nullable and ON DELETE SET NULL, matching keyword_history's concept_id-style
-- FK pattern -- deleting a concept should never take a product down with it.

ALTER TABLE products ADD COLUMN IF NOT EXISTS concept_id uuid REFERENCES concepts(id) ON DELETE SET NULL;
