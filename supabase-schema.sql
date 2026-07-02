-- TCC Command Center Phase 3B — Supabase Schema
-- Run this in the Supabase SQL Editor

create table products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  collection text,
  portfolio_level text,
  stage text not null default 'Idea',
  confidence text,
  ecosystem_primary text,
  ecosystem_secondary text,
  emotional_trigger text,
  notes text,
  etsy_listing_id text,
  total_sales integer default 0,
  went_live_at date,
  stage_updated_at timestamptz default now(),
  last_reviewed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table research_sessions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id) on delete cascade,
  date date not null default current_date,
  source text,
  notes text,
  decision text,
  created_at timestamptz default now()
);

create table keywords (
  id uuid primary key default gen_random_uuid(),
  research_session_id uuid references research_sessions(id) on delete cascade,
  keyword text not null,
  volume integer,
  competition integer,
  score integer,
  tag_type text,
  created_at timestamptz default now()
);

create table sparks (
  id uuid primary key default gen_random_uuid(),
  content text not null,
  collection_tag text,
  temperature text default 'cold',
  hot_reason text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  archived_at timestamptz
);

create table workshop_items (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  content text not null,
  source text,
  status text default 'pending',
  created_at timestamptz default now(),
  reviewed_at timestamptz
);

create table review_sessions (
  id uuid primary key default gen_random_uuid(),
  type text,
  scheduled_date date,
  completed_at timestamptz,
  notes text,
  created_at timestamptz default now()
);

-- Enable realtime on products table
alter publication supabase_realtime add table products;

-- Seed: In-progress products
insert into products (name, collection, portfolio_level, stage, confidence, emotional_trigger) values
  ('Raising Kids Like It''s 1997', 'Mom Chapter', 'Core', 'SEO Ready', 'High', 'Nostalgia · belonging'),
  ('Camp Mom Tee', 'Mom Chapter', 'Seasonal', 'Ready to Publish', 'High', 'Identity · humor'),
  ('Late Bloomers Club Badge', 'Mom Chapter', 'Growth', 'Design Phase', 'Medium', 'Encouragement · identity');

-- Seed: review session
insert into review_sessions (type, scheduled_date) values
  ('biweekly', '2026-07-05'),
  ('monthly', '2026-07-05');
