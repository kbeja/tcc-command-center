-- Listing Builder Milestone C1: Verified Libraries Migration
-- Run this in Supabase SQL Editor (not auto-applied)
--
-- Why: every Product Truth field (blank brand/model, material, size range,
-- production time, shipping policy, ...) is a bare free-text input in
-- Zone1Product.jsx, retyped from scratch on every new listing even when
-- the physical product -- e.g. a Comfort Colors 1717 T-shirt -- is one
-- Kristen has listed dozens of times, and even when the store-level facts
-- (shipping policy, returns wording) never change listing to listing at
-- all. Confirmed live: no template/policy concept exists anywhere in this
-- app today -- PRODUCT_FORMATS/BLANK_BRANDS in productTruth.js are pure
-- enum-name vocabularies for dropdowns and keyword-matching, carrying no
-- attached fact data.
--
-- Two new reference tables, both small and rarely written, both following
-- the create/edit/archive + last_verified provenance shape already
-- established by keywords' research_status and collections.last_verified:
-- product_templates (verified reusable blank/brand facts) and
-- store_policies (approved store-level text for shipping/returns/etc.).
--
-- Critical distinction the whole design protects: a template's fields get
-- APPLIED into a product's own Product Truth columns via an explicit,
-- human-confirmed action in Listing Builder (Milestone A's compatibility
-- gate and generation pipeline then read the product row exactly as they
-- always have -- these tables are never read directly by generation). A
-- policy's text is instead RESOLVED at generation time, filling a gap only
-- when the product's own field is unset, and only for the narrow set of
-- fields src/lib/storePolicies.js's POLICY_FIELD_MAP explicitly maps --
-- never overriding a product-specific value, never granting permission to
-- discuss a topic without also supplying the fact that topic is about (see
-- that file's own header for why those two must never travel separately).
--
-- No versioning/history table for either -- historical integrity (a
-- generation from August must keep explaining itself in September even if
-- the underlying template/policy changes later) is satisfied by VALUE, not
-- by reference: every generation snapshots the resolved facts it actually
-- used into listing_generations.product_truth_snapshot (existing, Milestone
-- A) plus the new product_truth_sources column below. A policy-history
-- table would only duplicate what the ledger already preserves. Archive-
-- don't-delete is enough for the reference tables themselves.
--
-- Every status/type/policy_type column below is plain text, not a CHECK
-- constraint or enum type -- matches this app's consistent, explicitly-
-- stated convention: a new value is a new string, never a schema change.
-- Validated in JS, same as every other controlled-but-extensible
-- vocabulary in this app.
--
-- Confirmed against live Supabase before writing this file (2026-08-15):
-- neither product_templates nor store_policies exists yet, neither new
-- column below exists yet, and listing_generations' live columns match its
-- Milestone A migration exactly (no drift on that table specifically --
-- this app does have real drift elsewhere, see CLAUDE.md, just not here).

-- ─── product_templates: verified reusable blank/brand facts ───────────────
-- product_format is NOT NULL -- mirrors checkFormatCompatibility's own
-- fail-safe in productTruth.js: no format means no safe matching, not a
-- guess. blank_brand/blank_model stay nullable so a genuinely brand-level
-- template ("any Gildan hoodie") is expressible, not just SKU-level ones.
--
-- Deliberately excludes garment_color and the 3 tri-state booleans
-- (personalization/customization/gift_wrap available) -- Kristen's own
-- explicit do-not-template list (colors/personalization vary per listing),
-- and a blank-level row can't answer a per-product capability question a
-- human must individually confirm. gift-wrap in particular belongs to
-- store_policies below, not here.
--
-- No unique constraint on the (format, brand, model) identity fields --
-- Postgres NULLs don't enforce uniqueness usefully here, and legitimate
-- overlapping generic/specific templates should be representable. The
-- matcher (src/lib/productTemplates.js) ranks by specificity and the
-- library UI warns on duplicates instead of hard-blocking, consistent with
-- this app's "surface it, don't silently block" posture elsewhere.
CREATE TABLE IF NOT EXISTS product_templates (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  text NOT NULL,
  -- identity: what a product is matched against
  product_format        text NOT NULL,
  blank_brand           text,
  blank_model           text,
  -- owned facts: what "apply" can fill on a product
  material              text,
  size_range            text,
  available_colors      text[],
  production_time       text,
  fulfillment_provider  text,
  -- provenance
  status                text NOT NULL DEFAULT 'active',
  last_verified         date,
  verification_note     text,
  source_url            text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz
);

CREATE INDEX IF NOT EXISTS product_templates_status_idx ON product_templates(status);
CREATE INDEX IF NOT EXISTS product_templates_match_idx
  ON product_templates(product_format, blank_brand, blank_model);

-- ─── store_policies: approved store-level facts, never invented per listing ─
-- approved_text is the human-approved source of truth generation may draw
-- from -- never AI-drafted, never inferred. policy_type vocabulary lives in
-- src/lib/storePolicies.js's POLICY_TYPES, not a DB constraint (see file
-- header above). Only the types in that file's POLICY_FIELD_MAP actually
-- reach generation in C1 (shipping, international_shipping,
-- production_time); the rest (returns_exchanges, personalization,
-- gift_wrap, care_instructions) are stored and manageable here but stay
-- reference-only until a later milestone adds their matching permission
-- topic and output section in generate-listing-v2.js -- injecting approved
-- text into a field nothing validates would be a new leak class, not a
-- feature. The library UI marks each row accordingly so this scope limit
-- is visible, never silent.
CREATE TABLE IF NOT EXISTS store_policies (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_type        text NOT NULL,
  title              text,
  approved_text      text NOT NULL,
  status             text NOT NULL DEFAULT 'active',
  last_verified      date,
  verification_note  text,
  source_url         text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz
);

CREATE INDEX IF NOT EXISTS store_policies_type_status_idx ON store_policies(policy_type, status);

-- ─── listing_generations: provenance for policy-resolved fields ───────────
-- Separate column from the existing product_truth_snapshot -- that column
-- IS the Product Truth object as Milestone A defined it; this is a
-- parallel provenance fact about the same fields (which layer each
-- policy-eligible field's value actually came from at generation time:
-- the product's own row, or a named/dated store policy), not another field
-- on it. This is what lets a future version-history view explain "shipping
-- came from store policy 'Standard US Shipping', verified Jul 2" without
-- ever reading a live table -- the ledger is the historical source of
-- truth, never reconstructed from current state.
ALTER TABLE listing_generations ADD COLUMN IF NOT EXISTS product_truth_sources jsonb;

-- ─── products: template application provenance ────────────────────────────
-- Records that a human explicitly applied this template via Listing
-- Builder's "Apply verified product template" action -- NEVER read by
-- generation, which continues reading the product's own Product Truth
-- columns exactly as it always has. This FK is not a second path to those
-- facts, only a record of where they were last confirmed to come from, so
-- the UI can later flag "this product's saved values now differ from the
-- template it was built from" without guessing which template a product
-- might match.
ALTER TABLE products ADD COLUMN IF NOT EXISTS product_template_id uuid
  REFERENCES product_templates(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS products_product_template_id_idx ON products(product_template_id);

-- RLS -- TCC is single-user; permissive policy mirrors every other table.
-- Not safely re-runnable (Postgres has no CREATE POLICY IF NOT EXISTS) --
-- same caveat as every prior migration's RLS block in this repo.
ALTER TABLE product_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_policies    ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all_product_templates" ON product_templates FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_store_policies"    ON store_policies    FOR ALL USING (true) WITH CHECK (true);
