-- Research sessions restructure: topic-based instead of product-based

alter table research_sessions
  drop column if exists product_id,
  add column if not exists topic text,
  add column if not exists niche text,
  add column if not exists status text default 'Complete',
  add column if not exists gaps_notes text;

-- Backfill existing rows
update research_sessions set topic = 'General Research', niche = 'Mom Chapter', status = 'Complete' where topic is null;
