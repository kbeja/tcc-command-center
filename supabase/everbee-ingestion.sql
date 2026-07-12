-- Everbee CSV Ingestion — Phase 3E
-- Run in Supabase SQL editor

create table if not exists competitor_listings (
  id uuid primary key default gen_random_uuid(),

  -- Identity
  product_name text,
  product_link text unique,
  shop_name text,
  shop_link text,

  -- Pricing & performance
  price numeric,
  growth_rate numeric,
  total_reviews integer,
  listing_age text,
  category text,
  shop_age text,
  visibility_score numeric,
  conversion_rate numeric,
  total_shop_sales integer,
  est_sales integer,
  est_revenue numeric,
  est_total_sales integer,
  total_favorites integer,
  avg_reviews numeric,
  total_views integer,

  -- Listing metadata
  tags_used text,
  description_character_count integer,
  minimum_processing text,
  placement_in_shop integer,
  shop_digital_listing boolean,
  title_character_count integer,
  listing_type text,
  tags text,
  tag_1 text, tag_2 text, tag_3 text, tag_4 text, tag_5 text,
  tag_6 text, tag_7 text, tag_8 text, tag_9 text, tag_10 text,
  tag_11 text, tag_12 text, tag_13 text,

  -- Routing
  matched_signal_id uuid references trend_signals(id) on delete set null,
  matched_product_id uuid references products(id) on delete set null,
  white_space_flag boolean default false,
  import_context text,

  -- Timestamps
  first_seen_at timestamptz default now(),
  last_updated_at timestamptz default now()
);
