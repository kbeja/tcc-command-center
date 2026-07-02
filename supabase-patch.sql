-- Phase 3B patch — adds missing columns and seeds data
-- Safe to run on existing tables

alter table products add column if not exists total_sales integer default 0;
alter table products add column if not exists went_live_at date;
alter table products add column if not exists stage_updated_at timestamptz default now();
alter table products add column if not exists last_reviewed_at timestamptz;

-- Seed in-progress products (skip if already there)
insert into products (name, collection, portfolio_level, stage, confidence, emotional_trigger)
select * from (values
  ('Raising Kids Like It''s 1997', 'Mom Chapter', 'Core', 'SEO Ready', 'High', 'Nostalgia · belonging'),
  ('Camp Mom Tee', 'Mom Chapter', 'Seasonal', 'Ready to Publish', 'High', 'Identity · humor'),
  ('Late Bloomers Club Badge', 'Mom Chapter', 'Growth', 'Design Phase', 'Medium', 'Encouragement · identity')
) as v(name, collection, portfolio_level, stage, confidence, emotional_trigger)
where not exists (select 1 from products where products.name = v.name);

-- Seed review sessions
insert into review_sessions (type, scheduled_date)
select * from (values
  ('biweekly', '2026-07-05'::date),
  ('monthly', '2026-07-05'::date)
) as v(type, scheduled_date)
where not exists (select 1 from review_sessions where review_sessions.scheduled_date = v.scheduled_date and review_sessions.type = v.type);

-- Enable realtime (ignore error if already enabled)
alter publication supabase_realtime add table products;
