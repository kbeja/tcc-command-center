-- Product Title Style Migration
-- Run this in Supabase SQL Editor (not auto-applied)
--
-- Why: Listing Builder is adding a toggle between the existing "keyword-rich,
-- 130-140 char" title style and a "short & clean" style matching Etsy's
-- current stated search guidance. Kristen wants this run as a trackable A/B
-- test against her existing Shop Stats columns (views, favorites, mo_sales,
-- conversion_rate, visibility_score) rather than a cosmetic-only toggle, so
-- every listing needs to record which style it was generated with.
--
-- Existing rows default to 'keyword_rich' since that's the only style that
-- has ever existed until now — leaving them NULL would read as a third,
-- unintentional category when she compares performance later.

ALTER TABLE products ADD COLUMN IF NOT EXISTS title_style text DEFAULT 'keyword_rich';

UPDATE products SET title_style = 'keyword_rich' WHERE title_style IS NULL;
