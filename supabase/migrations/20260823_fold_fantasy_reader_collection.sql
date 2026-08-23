-- Fold the "Fantasy Reader" COLLECTION into the "Fantasy Reader" NICHE
-- Run this in the Supabase SQL Editor (not auto-applied).
--
-- Two rows change: one collection is archived, one niche gains a note.
-- Nothing is deleted, and no other collection is touched.
--
-- ---------------------------------------------------------------------------
-- WHY ONLY THIS ONE
-- ---------------------------------------------------------------------------
-- Ten collections were created in a single sitting on 2026-07-11, each with a
-- written identity statement — the Reader Chapter strategy. On name alone,
-- two of them looked like duplicates of taxonomy niches that now exist:
-- "Fantasy Reader" and "Morally Gray Society".
--
-- The data disagreed about the second one. "Morally Gray Society" is bridged
-- in niche_collections to THREE niches — Fantasy Reader, Morally Gray Reader,
-- and Romance Reader. That is not a duplicate of a market; it is a curated
-- collection spanning three of them, which is exactly what a collection is
-- for once the taxonomy carries the market. It stays, untouched.
--
-- The same check clears most of that group: five of the six collections with
-- any niche_collections bridge at all are from it (Morally Gray Society,
-- Reading Rituals, Annotation Club, Bookstore Weekend, Spicy Books Social
-- Club). They are not unbuilt clutter — they are already wired up correctly.
--
-- "Fantasy Reader" is the exception, verified live via the REST API on
-- 2026-08-23:
--     products with this collection       0
--     research_sessions                   0
--     sparks (collection_tag)             0
--     concepts (collection_name)          0
--     niche_collections bridges           0
--     style_guide                         null
-- and a niche of the identical name already exists at
-- Hobbies > Reading > Fantasy Reader. Two names for one thing, with every
-- reference pointing at the niche and none at the collection.
--
-- ---------------------------------------------------------------------------
-- WHY ARCHIVE RATHER THAN DELETE
-- ---------------------------------------------------------------------------
-- research_sessions.collection, sparks.collection_tag and concepts.
-- collection_name are plain TEXT, not foreign keys. Deleting the row would
-- therefore succeed silently even if something did reference the name, and
-- leave no way to find out what had pointed at it. Archiving keeps the record
-- and is reversible with a single UPDATE.
--
-- ---------------------------------------------------------------------------
-- THE IDENTITY TEXT
-- ---------------------------------------------------------------------------
-- The collection carries "Reader identity differentiation — not just genre.
-- High demand, high competition." That is a real judgment about the market and
-- it is the only place it is written down, so it moves onto the niche rather
-- than being archived out of sight with the row. niches.notes is currently
-- null for this niche, so nothing is overwritten.
--
-- The note is prefixed with its provenance. It was written on 2026-07-11 about
-- a collection, and a reader six months from now should be able to tell that
-- from an unattributed sentence that looks like a fresh finding.

begin;

-- 1. Carry the identity statement onto the niche.
--    COALESCE guards the case where a note has been added since this file was
--    written: the existing text wins and this appends beneath it.
update niches n
set    notes = trim(both from
                 coalesce(n.notes || E'\n\n', '')
                 || 'From the "Fantasy Reader" collection, written 2026-07-11: '
                 || c.identity
               ),
       updated_at = now()
from   collections c
where  c.name  = 'Fantasy Reader'
and    n.name  = 'Fantasy Reader'
and    n.parent_id = (select id from niches where name = 'Reading')
and    c.identity is not null;

-- 2. Archive the collection.
--    Guarded on every reference being empty, so if anything has been attached
--    since this file was written the statement updates zero rows and the
--    verification below will show it still active rather than quietly
--    archiving something now in use.
update collections c
set    status = 'archived',
       notes  = trim(both from
                  coalesce(c.notes || E'\n\n', '')
                  || 'Archived 2026-08-23: duplicated the Hobbies > Reading > '
                  || 'Fantasy Reader niche. Identity text moved to that niche. '
                  || 'Had no products, sessions, sparks, concepts or niche links.'
                ),
       updated_at = now()
where  c.name = 'Fantasy Reader'
and    c.status <> 'archived'
and    not exists (select 1 from products          p where p.collection      = c.name)
and    not exists (select 1 from research_sessions r where r.collection      = c.name)
and    not exists (select 1 from sparks            s where s.collection_tag  = c.name)
and    not exists (select 1 from concepts          k where k.collection_name = c.name)
and    not exists (select 1 from niche_collections nc where nc.collection_id = c.id);

commit;

-- ---------------------------------------------------------------------------
-- VERIFY — expected: collection status 'archived', niche notes non-null.
-- If the collection still reads 'active', one of the guards above matched
-- something; run the second query to see what.
-- ---------------------------------------------------------------------------
-- select name, status, left(notes, 80) as notes from collections where name = 'Fantasy Reader';
--
-- select n.name, n.notes
-- from   niches n
-- where  n.name = 'Fantasy Reader'
-- and    n.parent_id = (select id from niches where name = 'Reading');
--
-- -- What still references it, if anything:
-- select 'products' as src, count(*) from products          where collection      = 'Fantasy Reader'
-- union all select 'sessions',      count(*) from research_sessions where collection      = 'Fantasy Reader'
-- union all select 'sparks',        count(*) from sparks            where collection_tag  = 'Fantasy Reader'
-- union all select 'concepts',      count(*) from concepts          where collection_name = 'Fantasy Reader'
-- union all select 'niche_links',   count(*) from niche_collections nc
--             join collections c on c.id = nc.collection_id where c.name = 'Fantasy Reader';
