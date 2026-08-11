-- Concept-Research Link Migration (Phase 13 — related research)
-- Run this in Supabase SQL Editor (not auto-applied)
--
-- Why: Phase 13 asks for Concepts to record which research informed them.
-- research_sessions already exists, so this is a real link, not a deferred
-- placeholder like the Trend/Visual-Language fields on the same wishlist
-- (those have no schema anywhere yet).
--
-- Nullable, ON DELETE SET NULL -- same pattern as concepts.spark_id and
-- products.concept_id. A concept never requires a linked research session.

ALTER TABLE concepts ADD COLUMN IF NOT EXISTS research_session_id uuid REFERENCES research_sessions(id) ON DELETE SET NULL;
