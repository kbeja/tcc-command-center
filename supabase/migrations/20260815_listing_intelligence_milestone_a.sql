-- Listing Intelligence Milestone A Migration
-- Run this in Supabase SQL Editor (not auto-applied)
--
-- Why: ListingBuilder.jsx's "Anchor Keyword (B1)" picker has zero filter
-- against the product's actual format -- confirmed live: a Comfort Colors
-- 1717 T-SHIRT was assigned "hockey mom SWEATSHIRT" as its anchor because
-- that was the only researched Bucket-1 keyword available, and nothing in
-- the system checks whether a candidate keyword's format matches the
-- product being sold. Root cause: "Product Truth" -- what the product
-- physically IS -- has never existed as real data. `products.form.productType`
-- (the closest thing) is a free-text input, never populated from the loaded
-- product, never saved -- retyped from scratch every session, discarded on
-- save. This migration adds real Product Truth columns plus an append-only
-- generation ledger, so keyword evidence can never again silently override
-- what the product actually is.
--
-- listing_generations is append-only (one row per generation/regeneration,
-- never overwritten) -- mirrors visual_profiles' shape from the
-- Marketplace Visual Intelligence migration earlier this same day, for the
-- same reason: a mutable single-row-per-product design would destroy the
-- "how many attempts before landing on a final listing" and "what did
-- Product Truth look like at generation time" history a later
-- performance-learning phase will want, the moment a listing is
-- regenerated. product_id is nullable -- generation happens BEFORE a
-- product row exists for every new listing (confirmed live:
-- handleGenerate() has no dependency on productId; comparing several
-- generations before ever saving is the normal path, not an edge case) --
-- the app inserts with product_id NULL and links it once the product is
-- actually saved.
--
-- listing_generation_keywords is a real child table, NOT a jsonb array on
-- listing_generations -- mirrors keyword_history's pattern (a nullable FK
-- PLUS a denormalized text column, giving both "survives the referenced
-- row being edited/deleted" AND "still joinable/queryable", which a jsonb
-- blob only gives the first of) and competitor_listing_tags' pattern (tag/
-- role data that a later phase will want to query across rows -- "show me
-- every generation that ever excluded keyword X" -- belongs in a real
-- table with an index on the reverse-lookup column, not an opaque blob).
--
-- Relevance classification (exact_product_intent / close_product_intent /
-- audience / style / occasion / buyer_intent / adjacent) is deliberately
-- NOT a keywords column -- it's a function of a (keyword, product) PAIR
-- (the same keyword is exact-intent for one product and incompatible for
-- another), so it can't be a static property of the keyword row the way
-- Phase 19's classification/confidence are (those measure demand-evidence
-- quality, a different axis entirely). It's computed fresh per generation
-- and only ever persisted here, on the row describing that specific
-- (keyword, generation) pairing.
--
-- Every status/category column below is plain text, not a CHECK
-- constraint or enum type -- matches this app's consistent, explicitly-
-- stated convention (see keyword_history/research_intelligence
-- migrations): a new value is a new string, never a schema change.
-- Validated in JS (src/lib/productTruth.js), same as every other
-- controlled-but-extensible vocabulary in this app.

-- ─── products: Product Truth (13 columns, all nullable) ───────────────────
-- The 3 boolean columns get NO default (nullable, no DEFAULT false) on
-- purpose -- NULL means "unknown," distinguishable from a confirmed
-- false. Defaulting to false would assert "personalization is NOT
-- available" for products where it's simply never been recorded, which is
-- exactly the false confidence this phase exists to eliminate.
--
-- Deliberately excludes design_text/design_subject/visual_style/
-- intended_audience from Kristen's original wishlist -- those already
-- exist on concepts (design_direction/visual_style/color_palette/
-- target_customer/mood_keywords). Duplicating them onto products would
-- create the same "two places, they drift" risk the Visual Language
-- taxonomy explicitly avoided for tags. When a product has a linked
-- concept, generation reads creative direction from there, same as today.
ALTER TABLE products ADD COLUMN IF NOT EXISTS product_format text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS blank_brand text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS blank_model text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS garment_color text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS available_colors text[];
ALTER TABLE products ADD COLUMN IF NOT EXISTS size_range text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS material text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS personalization_available boolean;
ALTER TABLE products ADD COLUMN IF NOT EXISTS customization_available boolean;
ALTER TABLE products ADD COLUMN IF NOT EXISTS gift_wrap_available boolean;
ALTER TABLE products ADD COLUMN IF NOT EXISTS production_time text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS shipping_policy text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS fulfillment_provider text;

-- ─── products.title_strategy: 5-value taxonomy replacing title_style ──────
-- No DB default here (unlike title_style's own DEFAULT 'keyword_rich') --
-- ADD COLUMN ... DEFAULT retroactively fills EVERY existing row with that
-- default the moment the column is created, which would make the backfill
-- UPDATE below a no-op (every row already non-null, its WHERE clauses
-- never match). New rows get 'buyer_clear' set explicitly by application
-- code (ListingBuilder.jsx's save paths), not a schema default -- avoids
-- that sequencing trap entirely. title_style itself is left untouched, not
-- deleted or renamed -- existing historical records stay exactly as they
-- are; only new code paths stop writing to it.
ALTER TABLE products ADD COLUMN IF NOT EXISTS title_strategy text;

UPDATE products SET title_strategy = 'legacy_keyword_rich' WHERE title_style = 'keyword_rich' AND title_strategy IS NULL;
UPDATE products SET title_strategy = 'legacy_short_clean' WHERE title_style = 'short_clean' AND title_strategy IS NULL;
-- Defensive catch-all: title_style has always had its own DB default and
-- backfill, so every row should already be one of the two values above --
-- but if any row somehow has a NULL/unexpected title_style, don't leave
-- title_strategy silently null after this migration.
UPDATE products SET title_strategy = 'legacy_keyword_rich' WHERE title_strategy IS NULL;

-- ─── listing_generations: append-only generation ledger ───────────────────
CREATE TABLE IF NOT EXISTS listing_generations (
  id                                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id                          uuid REFERENCES products(id) ON DELETE CASCADE,
  created_at                          timestamptz NOT NULL DEFAULT now(),
  generation_version                  text,
  trigger                             text,
  primary_search_intent               text,
  primary_search_intent_keyword_id    uuid REFERENCES keywords(id) ON DELETE SET NULL,
  primary_intent_status               text,
  research_sources_used               text[],
  research_gaps                       jsonb,
  product_truth_snapshot              jsonb,
  discussion_permissions              jsonb,
  title_strategy                      text,
  title                               text,
  tags                                text[],
  description                         jsonb,
  image_prompts                       jsonb,
  validation_status                   text,
  validation_warnings                 jsonb,
  model                               text,
  input_tokens                        integer,
  output_tokens                       integer,
  change_reason                       text,
  performance_snapshot_at_generation  jsonb
);

CREATE INDEX IF NOT EXISTS listing_generations_product_id_idx ON listing_generations(product_id);
-- Supports "current generation per product" reads without a mutable
-- latest-flag -- same DISTINCT ON pattern as current_visual_profiles.
CREATE INDEX IF NOT EXISTS listing_generations_product_created_idx ON listing_generations(product_id, created_at DESC);

-- ─── listing_generation_keywords: real child table, not jsonb ─────────────
-- keyword_id is nullable with ON DELETE SET NULL, and keyword_text is
-- denormalized NOT NULL alongside it -- exactly keyword_history's own
-- pattern for "must survive the referenced keyword being edited/deleted
-- while staying joinable." volume/competition/score are denormalized too,
-- for the same reason: this row is a historical snapshot of what a
-- specific past generation actually saw, which must stay accurate even if
-- the live keyword row's numbers change later.
CREATE TABLE IF NOT EXISTS listing_generation_keywords (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_id       uuid NOT NULL REFERENCES listing_generations(id) ON DELETE CASCADE,
  keyword_id          uuid REFERENCES keywords(id) ON DELETE SET NULL,
  keyword_text        text NOT NULL,
  role                text NOT NULL,
  relevance_category  text,
  exclusion_reason    text,
  volume              integer,
  competition         integer,
  score                integer,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS listing_generation_keywords_generation_id_idx ON listing_generation_keywords(generation_id);
-- The Milestone C query this whole child-table-not-jsonb decision exists
-- for: "show me every generation that ever excluded/used keyword X."
CREATE INDEX IF NOT EXISTS listing_generation_keywords_keyword_id_idx ON listing_generation_keywords(keyword_id);

-- RLS -- TCC is single-user; permissive policy mirrors every other table.
-- Not safely re-runnable (Postgres has no CREATE POLICY IF NOT EXISTS) --
-- same caveat as every prior migration's RLS block in this repo.
ALTER TABLE listing_generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE listing_generation_keywords ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all_listing_generations" ON listing_generations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_listing_generation_keywords" ON listing_generation_keywords FOR ALL USING (true) WITH CHECK (true);
