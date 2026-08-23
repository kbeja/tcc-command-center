-- Bridge the Hockey niche to the "Winter Sports" timing calendar entry
-- Run this in the Supabase SQL Editor (not auto-applied).
--
-- One row in niche_timing_niches. No niche, collection, product or keyword is
-- touched, and nothing in the timing calendar itself changes.
--
-- ---------------------------------------------------------------------------
-- WHY
-- ---------------------------------------------------------------------------
-- Kristen: hockey season generally starts in September. Taylor's calendar
-- already says the same thing, verified live 2026-08-23:
--
--     Winter Sports   START     Sep      low_competition   expert_guidance
--     Winter Sports   CONTINUE  Oct
--     Winter Sports   DUE       Nov 8
--
-- Hockey has four live products and 24 researched keywords, but no bridge to
-- the calendar — so it can never appear in Home's "Build this now", no matter
-- how good its data gets. Coverage there routes through niche_timing_niches,
-- and Hockey has no row in it.
--
-- Of the 34 existing bridges, none point at Winter Sports or Summer Sports;
-- every other sport already has one (Football Season -> Football, Soccer
-- Season -> Soccer, Baseball/Softball Season -> Baseball + Softball). This is
-- the missing member of that set, not a new pattern.
--
-- ---------------------------------------------------------------------------
-- WHY ONLY THE PARENT NICHE
-- ---------------------------------------------------------------------------
-- buildOpportunities() expands each bridge through descendantsOf(), so linking
-- "Hockey" automatically covers Hockey Mom, Hockey Girlfriend and Hockey Fan.
-- Adding rows for the children would be redundant and would double-count them.
--
-- FIELD HOCKEY IS DELIBERATELY NOT INCLUDED. It sits under Hobbies as its own
-- top-level niche rather than beneath Hockey, so descendant expansion does not
-- reach it and it would need its own row. Field hockey is a school FALL sport
-- (roughly August to November), which overlaps the September START but is not
-- the same season as ice hockey — that is a judgment about the market, not
-- something to infer from a name, so it is left for a human to decide. The
-- statement to add it, if wanted, is at the bottom of this file.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS DOES AND DOES NOT ASSERT
-- ---------------------------------------------------------------------------
-- §40 and the source-vocabulary separation both hold here. The calendar keeps
-- Taylor's own name ("Winter Sports"); TCC's taxonomy keeps its own ("Hockey");
-- this row is the human-made link between them and nothing infers it from the
-- names. The guidance rows stay expert_guidance — this does not upgrade any
-- claim to evidence, and it does not assert that Hockey will sell in
-- September, only that the calendar's Winter Sports window applies to it.

begin;

insert into niche_timing_niches (niche_id, timing_niche_id, created_at)
select n.id, t.id, now()
from   niches n
cross  join timing_niches t
where  n.name = 'Hockey'
and    n.parent_id = (select id from niches where name = 'Hobbies')
and    t.name = 'Winter Sports'
-- Re-runnable, and safe if the row was added by hand in the meantime.
and    not exists (
         select 1 from niche_timing_niches x
         where  x.niche_id = n.id and x.timing_niche_id = t.id
       );

commit;

-- ---------------------------------------------------------------------------
-- VERIFY — expected: one row, Hockey -> Winter Sports.
-- ---------------------------------------------------------------------------
-- select n.name as taxonomy_niche, t.name as timing_entry
-- from   niche_timing_niches ntn
-- join   niches        n on n.id = ntn.niche_id
-- join   timing_niches t on t.id = ntn.timing_niche_id
-- where  t.name in ('Winter Sports', 'Summer Sports')
-- order  by t.name, n.name;
--
-- -- And what the calendar says for it:
-- select guidance_state, month, day, classification
-- from   timing_guidance
-- where  source_niche_label = 'Winter Sports'
-- order  by month;

-- ---------------------------------------------------------------------------
-- OPTIONAL — only if Field Hockey should follow the same Winter Sports window.
-- Kristen's call; see the note above. Uncomment and re-run to add it.
-- ---------------------------------------------------------------------------
-- insert into niche_timing_niches (niche_id, timing_niche_id, created_at)
-- select n.id, t.id, now()
-- from   niches n cross join timing_niches t
-- where  n.name = 'Field Hockey' and t.name = 'Winter Sports'
-- and    not exists (
--          select 1 from niche_timing_niches x
--          where  x.niche_id = n.id and x.timing_niche_id = t.id
--        );
