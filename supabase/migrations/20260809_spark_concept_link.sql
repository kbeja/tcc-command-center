-- Spark-Concept Link Migration (Phase 11 — Spark -> Concept persistent lineage)
-- Run this in Supabase SQL Editor (not auto-applied)
--
-- Why: Concepts are currently only ever created from a blank ChatGPT-paste
-- import with no memory of what inspired them, and a Spark's only existing
-- "promotion" path (SparkCard's Activate button) skips Concept entirely and
-- creates a Product directly. This adds the FK so a Concept created from a
-- Spark keeps a permanent link back to it, a Spark can show every Concept
-- made from it, and older Concepts can be linked to a Spark manually.
--
-- Nullable, ON DELETE SET NULL -- matches products.concept_id's pattern.
-- Deleting a Spark (a real, reachable action) should never take a linked
-- Concept down with it. A Concept never requires a Spark.

ALTER TABLE concepts ADD COLUMN IF NOT EXISTS spark_id uuid REFERENCES sparks(id) ON DELETE SET NULL;
