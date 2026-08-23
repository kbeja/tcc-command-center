-- Resolve the 12 sparks tagged "Reader"
-- Run this in the Supabase SQL Editor (not auto-applied).
--
-- Two real sparks get a valid collection tag; ten import artifacts get
-- archived. Nothing is deleted and no spark content is edited.
--
-- ---------------------------------------------------------------------------
-- WHAT THESE ARE
-- ---------------------------------------------------------------------------
-- Twelve sparks carry collection_tag = 'Reader'. No collection of that name
-- exists — the real one is 'Reader Chapter' — so the tag resolves to nothing
-- anywhere in the app.
--
-- Ten of the twelve are not ideas. Verified live on 2026-08-23, all ten were
-- created on 2026-07-09, all begin with a literal '* ', and every one is a
-- bare name:
--
--     * Dark Academia          * Spicy Book Club       * Cottage Reader
--     * Cozy Romance           * Bookstore Girl        * Elder Millennial Reader
--     * Fantasy Reader         * Literary Minimalist
--     * Morally Gray Reader    * Thriller Reader
--
-- Two days later, on 2026-07-11, those same names were created as the ten
-- Reader Chapter collections — each with a written identity statement. So this
-- is the bullet list that BECAME the collections, captured one bullet per
-- spark by an importer that treated list markup as content.
--
-- The collections table now holds the same ten concepts with more information
-- attached. Keeping them as sparks means the Idea Vault shows ten entries that
-- are really a duplicate of the collections list.
--
-- The other two are genuine ideas and are treated as such:
--     One Cozy Chapter        (already archived, left archived)
--     Weekend Reading Ritual
--
-- ---------------------------------------------------------------------------
-- WHY ARCHIVE AND NOT DELETE
-- ---------------------------------------------------------------------------
-- §10: Cold means safely captured, not overdue. Archiving is the existing,
-- reversible way this app retires a spark, and archived_at is already how the
-- Idea Vault and the Home opportunity logic exclude things. A delete would
-- discard the only record that this import happened.
--
-- The ten are matched on all three properties together — the '* ' prefix, the
-- 'Reader' tag, and the 2026-07-09 creation date — rather than by id list or
-- by prefix alone, so a spark someone legitimately wrote starting with an
-- asterisk cannot be caught by accident.

begin;

-- 1. The two real sparks: point them at the collection that actually exists.
--    Excludes the '* ' artifacts by the same guard used below, so the two sets
--    can never overlap.
update sparks
set    collection_tag = 'Reader Chapter',
       updated_at     = now()
where  collection_tag = 'Reader'
and    not (content like '* %' and created_at::date = date '2026-07-09');

-- 2. The ten import artifacts: archive, and record why on the row itself.
--    archived_at is set only where it is still null, so the already-archived
--    'One Cozy Chapter' keeps its original date. (It is not in this set, but
--    the guard costs nothing and makes a re-run safe.)
update sparks
set    archived_at = coalesce(archived_at, now()),
       collection_tag = 'Reader Chapter',
       notes = trim(both from
                 coalesce(notes || E'\n\n', '')
                 || 'Archived 2026-08-23: import artifact. One bullet from the '
                 || 'list captured 2026-07-09 that became the Reader Chapter '
                 || 'collections on 2026-07-11, where the same concept is '
                 || 'recorded with a full identity statement.'
               ),
       updated_at = now()
where  collection_tag = 'Reader'
and    content like '* %'
and    created_at::date = date '2026-07-09';

commit;

-- ---------------------------------------------------------------------------
-- VERIFY — expected: no spark left tagged 'Reader'; 10 archived artifacts;
-- 2 others (one of which, 'One Cozy Chapter', was already archived before
-- this ran and keeps its original archived_at).
-- ---------------------------------------------------------------------------
-- select count(*) as still_tagged_reader from sparks where collection_tag = 'Reader';
--
-- select content,
--        collection_tag,
--        (archived_at is not null) as archived,
--        left(notes, 40)           as note
-- from   sparks
-- where  collection_tag = 'Reader Chapter'
-- order  by archived, content;
