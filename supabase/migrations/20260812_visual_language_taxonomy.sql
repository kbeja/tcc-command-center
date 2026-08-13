-- Visual Language Taxonomy Migration (Phase 18)
-- Run this in Supabase SQL Editor (not auto-applied)
--
-- Why: concepts.visual_style/color_palette/mood_keywords/... and
-- collections.style_guide have always been pure free text with zero
-- controlled vocabulary and zero cross-referencing -- there has never been
-- any way to ask "show me every concept tagged cottagecore" or "which
-- collections share a dark-academia visual language." This adds one shared
-- controlled vocabulary (visual_tags) plus two junction tables so both
-- concepts AND collections can be classified against the same tag pool --
-- deliberately one shared table, not two separate ones, so Phase 19
-- (Marketplace Visual Intelligence) can classify competitor/marketplace
-- visuals against this exact same vocabulary later by adding one more
-- junction table, without redesigning anything here.
--
-- Two junction tables (concept_tags / collection_tags), not one polymorphic
-- table -- this codebase has no precedent anywhere for a polymorphic
-- entity_type/entity_id association, and two plain FK junction tables get
-- real referential integrity for free (matches the concept_assets /
-- concept_outputs precedent: a purpose-specific child table per
-- relationship, not a generic shared one).
--
-- collection_tags.collection_id FKs collections(id) (a real uuid PK,
-- confirmed live via the REST API), NOT collections.name -- a deliberate
-- departure from how every OTHER cross-table "collection" reference in
-- this app works today (concepts.collection_name / trend_signals.collection
-- / products.collection / sparks.collection_tag are all plain text,
-- matched app-side). Those are all legacy "soft label" fields; the
-- standing per-phase convention for NEW relationships is a real
-- nullable/cascading FK (concepts.spark_id, concepts.research_session_id,
-- trend_signals.session_id all do this already), and a tag-application row
-- is genuinely meaningless without its parent collection existing -- the
-- same category as concept_assets.concept_id / concept_outputs.concept_id,
-- which already FK concepts(id) with ON DELETE CASCADE. deleteCollection()
-- is a real, reachable code path (Research.jsx) so CASCADE here (rather
-- than RESTRICT, the FK default) is what keeps a collection delete from
-- being blocked by its own tag rows.
--
-- Case-insensitive tag-name uniqueness ("Cottagecore" and "cottagecore"
-- must not become two rows) is enforced via a lower(name) unique index,
-- not the citext extension -- this codebase has zero precedent for citext
-- or any other Postgres extension, and every existing case-insensitive
-- match anywhere in the app (looseTextMatch() in ConceptChatImport.jsx,
-- every .toLowerCase() comparison in SessionSummaryParser.jsx) is plain
-- application-level JS, never a DB extension. The unique index here is a
-- pure safety net behind that same JS-side matching (see createVisualTag()
-- in src/lib/hooks.js) -- primary matching still happens in JS exactly
-- like collections/sparks/trend signals already do; the index just
-- guarantees a race or bug can't silently create a case-duplicate in
-- what's supposed to be a curated, controlled vocabulary.

CREATE TABLE IF NOT EXISTS visual_tags (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS visual_tags_name_ci_unique_idx ON visual_tags (lower(name));

CREATE TABLE IF NOT EXISTS concept_tags (
  concept_id  uuid NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  tag_id      uuid NOT NULL REFERENCES visual_tags(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (concept_id, tag_id)
);

CREATE TABLE IF NOT EXISTS collection_tags (
  collection_id uuid NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  tag_id        uuid NOT NULL REFERENCES visual_tags(id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (collection_id, tag_id)
);

-- tag_id is the trailing column of each composite PK, so it needs its own
-- index for "which concepts/collections carry this tag" lookups (a
-- composite btree only serves lookups on its leading column for free).
CREATE INDEX IF NOT EXISTS concept_tags_tag_id_idx ON concept_tags(tag_id);
CREATE INDEX IF NOT EXISTS collection_tags_tag_id_idx ON collection_tags(tag_id);

-- RLS -- TCC is single-user; permissive policy mirrors every other table.
-- Not safely re-runnable (Postgres has no CREATE POLICY IF NOT EXISTS) --
-- same caveat as every prior migration's RLS block in this repo.
ALTER TABLE visual_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE concept_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all_visual_tags"     ON visual_tags     FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_concept_tags"    ON concept_tags    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_collection_tags" ON collection_tags FOR ALL USING (true) WITH CHECK (true);

-- ─── Backfill: migrate the 2 hand-authored static style guides (Mom Chapter,
-- Reader Chapter, from src/data/collections.js's collectionKnowledge) into
-- the real DB column, copied verbatim from that source file. WHERE
-- style_guide IS NULL guards against silently overwriting real data if
-- either row has been given a real style guide by hand since this
-- migration was written (verified both are currently null live via the
-- REST API on 2026-08-12, but the guard costs nothing and this is exactly
-- the kind of one-shot data migration that must never clobber a real edit
-- made between when this file was written and when it's actually run).
-- This is additive, not a cutover -- the JS constants in
-- src/data/collections.js are intentionally left in place as a fallback
-- (see CollectionKnowledge.jsx), not deleted.

UPDATE collections SET
  style_guide = $$90s DOPAMINE — MOM CHAPTER STYLE GUIDE

Aesthetic: Bold, retro, saturated. Think Lisa Frank meets vintage sportswear.
Colors: Electric brights on soft grounds — coral, teal, purple, yellow.
Typography: Bold rounded fonts, outlined text, varsity lettering.
Motifs: Stars, lightning bolts, smiley faces, sunbursts, cassette tapes, scrunchies.
Vibe: Nostalgic but modern. The mom who still knows how to party.

ALSO WORKS: Warm editorial style for heartfelt mom pieces (watercolor, script, neutral tones).
Match the aesthetic to the emotional trigger — fun vs. sentimental.$$,
  updated_at = now()
WHERE name = 'Mom Chapter' AND style_guide IS NULL;

UPDATE collections SET
  style_guide = $$DARK ACADEMIA — READER CHAPTER STYLE GUIDE

Aesthetic: Moody, intellectual, literary. Oxford library meets Tumblr 2013.
Colors: Deep navy, forest green, burgundy, warm cream, aged sepia.
Typography: Serif, editorial, slightly condensed. Old book vibes.
Motifs: Books, candles, quill pens, astronomical charts, botanical illustrations, arched windows.
Vibe: The reader who buys a new journal every month and has strong opinions about coffee.

NOTE: Test both "gray" and "grey" spellings in SEO — UK spelling "grey" outperforms in bookish niche.$$,
  updated_at = now()
WHERE name = 'Reader Chapter' AND style_guide IS NULL;
