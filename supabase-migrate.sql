-- Phase 3B Migration
-- Preserves all Phase 3A data, creates new tables, migrates relevant records

-- Step 1: Rename old products table to keep it safe
alter table products rename to products_legacy;

-- Step 2: Create new Phase 3B tables

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

-- Step 3: Migrate etsy_products → products (stage = Live)
insert into products (name, collection, stage, confidence, notes, etsy_listing_id, created_at, updated_at)
select
  title,
  case
    when lower(title) like '%mom%' or lower(title) like '%mama%' or lower(title) like '%mother%' then 'Mom Chapter'
    when lower(title) like '%book%' or lower(title) like '%read%' or lower(title) like '%library%' then 'Reader Chapter'
    when lower(title) like '%kid%' or lower(title) like '%child%' or lower(title) like '%boy%' or lower(title) like '%girl%' then 'Kids Chapter'
    else 'Mom Chapter'
  end,
  'Live',
  'High',
  notes,
  id,
  updated_at,
  updated_at
from etsy_products
where status != 'archived';

-- Step 4: Migrate pod_projects → products
insert into products (name, collection, stage, notes, created_at, updated_at)
select
  title,
  case
    when lower(title) like '%mom%' or lower(title) like '%mama%' then 'Mom Chapter'
    when lower(title) like '%book%' or lower(title) like '%read%' then 'Reader Chapter'
    else 'Mom Chapter'
  end,
  case
    when status = 'live' then 'Live'
    when status = 'ready' then 'Ready to Publish'
    when status = 'design' then 'Design Phase'
    when status = 'idea' then 'Idea'
    when status = 'paused' then 'Paused'
    else 'Idea'
  end,
  notes,
  updated_at,
  updated_at
from pod_projects
where status != 'archived'
  and not exists (
    select 1 from products where products.name = pod_projects.title
  );

-- Step 5: Migrate printables → products
insert into products (name, collection, stage, notes, created_at, updated_at)
select
  title,
  case
    when lower(title) like '%mom%' or lower(title) like '%mama%' then 'Mom Chapter'
    when lower(title) like '%book%' or lower(title) like '%read%' then 'Reader Chapter'
    else 'Mom Chapter'
  end,
  case
    when status = 'live' then 'Live'
    when status = 'ready' then 'Ready to Publish'
    when status = 'design' then 'Design Phase'
    when status = 'idea' then 'Idea'
    when status = 'paused' then 'Paused'
    else 'Idea'
  end,
  notes,
  updated_at,
  updated_at
from printables
where status != 'archived'
  and not exists (
    select 1 from products where products.name = printables.title
  );

-- Step 6: Seed in-progress products
insert into products (name, collection, portfolio_level, stage, confidence, emotional_trigger)
select * from (values
  ('Raising Kids Like It''s 1997', 'Mom Chapter', 'Core', 'SEO Ready', 'High', 'Nostalgia · belonging'),
  ('Camp Mom Tee', 'Mom Chapter', 'Seasonal', 'Ready to Publish', 'High', 'Identity · humor'),
  ('Late Bloomers Club Badge', 'Mom Chapter', 'Growth', 'Design Phase', 'Medium', 'Encouragement · identity')
) as v(name, collection, portfolio_level, stage, confidence, emotional_trigger)
where not exists (select 1 from products where products.name = v.name);

-- Step 7: Seed review sessions
insert into review_sessions (type, scheduled_date) values
  ('biweekly', '2026-07-05'),
  ('monthly', '2026-07-05');

-- Step 8: Enable realtime
alter publication supabase_realtime add table products;
