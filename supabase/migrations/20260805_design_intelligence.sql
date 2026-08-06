-- Design Intelligence System — Phase 1 Migration
-- Run this in Supabase SQL Editor (not auto-applied)
-- Creates: concepts, concept_assets, concept_outputs tables
-- Storage bucket: design-vault (set up separately — see README note below)

-- ─── concepts ─────────────────────────────────────────────────────────────────
-- The permanent structured record of a design concept.
-- Parsed from the --- TCC CONCEPT --- block pasted in Chat Import.

CREATE TABLE IF NOT EXISTS concepts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  concept_code      text,                    -- auto-generated, e.g. MC-001 (collection prefix + sequence)
  name              text NOT NULL,           -- from "Concept Name:" in paste block
  collection_name   text NOT NULL,           -- FK by name (matches products.collection, sparks.collection_tag)

  -- Design brief fields
  design_direction  text,                    -- the core visual/emotional intent
  target_customer   text,                    -- who this is for (defaults to Amanda lens)
  visual_style      text,                    -- e.g. "Dark academia", "Soft cottagecore"
  color_palette     text,                    -- e.g. "Linen ivory, soft sage, dusty rose"
  typography_notes  text,                    -- font direction or mood
  mood_keywords     text[],                  -- array of mood words: cozy, nostalgic, etc.

  -- Format & production
  product_types     text[],                  -- e.g. {"Tee","Mug","Tote"}
  seasonal_flag     text,                    -- "evergreen" | season name
  emotional_trigger text,                    -- the emotional hook

  -- Status
  status            text NOT NULL DEFAULT 'active',  -- active | archived | paused

  -- Raw import (original paste block, kept for reference)
  raw_import        text,

  -- Timestamps
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- ─── concept_assets ───────────────────────────────────────────────────────────
-- Files attached to a concept: reference images, mood board images, exported designs.
-- Stored in the design-vault Supabase Storage bucket.

CREATE TABLE IF NOT EXISTS concept_assets (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  concept_id     uuid NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,

  asset_type     text NOT NULL,   -- 'reference_image' | 'mood_board' | 'kittl_export' | 'mockup'
  label          text,            -- human description, e.g. "Inspo photo — dark academia desk"
  storage_path   text NOT NULL,   -- path inside design-vault bucket, e.g. "mc-001/ref-01.jpg"
  mime_type      text,            -- image/jpeg, image/png, etc.
  size_bytes     bigint,

  created_at     timestamptz NOT NULL DEFAULT now()
);

-- ─── concept_outputs ──────────────────────────────────────────────────────────
-- Every AI-generated or imported text output for a concept.
-- One row per version per output type. is_current=true marks the active version.
-- This table serves both workflows:
--   Workflow 1 (import-complete): output_source='imported', version=1, is_current=true
--   Workflow 2 (generate-from-concept): output_source='generated', version increments

CREATE TABLE IF NOT EXISTS concept_outputs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  concept_id     uuid NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,

  output_type    text NOT NULL,   -- 'kittl_prompt' | 'mockup_prompt' | 'listing_draft' | 'seo_keywords' | 'pinterest_copy'
  version        integer NOT NULL DEFAULT 1,
  is_current     boolean NOT NULL DEFAULT true,

  -- Content
  body           text NOT NULL,   -- the full text of the output

  -- Provenance
  output_source  text NOT NULL DEFAULT 'generated',  -- 'generated' | 'imported'
  model_used     text,            -- e.g. 'claude-haiku-4-5-20251001' (null if imported)
  generation_notes text,          -- any user notes or flags on this version

  -- Timestamps
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS concepts_collection_name_idx ON concepts(collection_name);
CREATE INDEX IF NOT EXISTS concepts_status_idx ON concepts(status);
CREATE INDEX IF NOT EXISTS concept_assets_concept_id_idx ON concept_assets(concept_id);
CREATE INDEX IF NOT EXISTS concept_outputs_concept_id_idx ON concept_outputs(concept_id);
CREATE INDEX IF NOT EXISTS concept_outputs_current_idx ON concept_outputs(concept_id, output_type, is_current);

-- ─── RLS ──────────────────────────────────────────────────────────────────────
-- TCC is single-user; permissive policies mirror the existing tables.

ALTER TABLE concepts ENABLE ROW LEVEL SECURITY;
ALTER TABLE concept_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE concept_outputs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all_concepts"        ON concepts        FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_concept_assets"  ON concept_assets  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_concept_outputs" ON concept_outputs FOR ALL USING (true) WITH CHECK (true);

-- ─── updated_at trigger (reuse pattern from existing tables) ──────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER concepts_updated_at
  BEFORE UPDATE ON concepts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER concept_outputs_updated_at
  BEFORE UPDATE ON concept_outputs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Storage bucket: design-vault ─────────────────────────────────────────────
-- Run this separately in Supabase Dashboard → Storage → New bucket:
--   Name: design-vault
--   Public: false
--   File size limit: 10MB
--   Allowed MIME types: image/jpeg, image/png, image/webp
--
-- Or via SQL (requires pg_storage extension enabled):
-- INSERT INTO storage.buckets (id, name, public)
--   VALUES ('design-vault', 'design-vault', false)
--   ON CONFLICT DO NOTHING;
