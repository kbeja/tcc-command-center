-- Classify the 54 existing visual_tags into kinds
-- Run this in the Supabase SQL Editor (not auto-applied).
--
-- REVIEW BEFORE RUNNING. This is a proposed classification, not a derived one.
-- Every assignment below is a judgment call about what a tag MEANS, which is
-- exactly the kind of decision §40 reserves for a human — the migration exists
-- so 54 decisions can be reviewed as one list rather than made one at a time
-- through a UI. Seven genuinely ambiguous ones are marked AMBIGUOUS inline;
-- change any line before running and nothing else is affected.
--
-- ---------------------------------------------------------------------------
-- WHY FOUR KINDS AND NOT THE TWO §6 NAMES
-- ---------------------------------------------------------------------------
-- §6 separates "Design Style" from "Aesthetic / Trend". The actual tag pool
-- contains two further axes in real numbers, and collapsing them would lose
-- questions §27 explicitly wants answerable:
--
--   aesthetic ...... the overall vibe or cultural style      (8 tags)
--   design_style ... how the artwork is built or executed   (25 tags)
--   typography ..... letterform choices                     (11 tags)
--   motif .......... the subject matter depicted            (10 tags)
--
-- Folding typography into design_style would make "does script outperform
-- serif in this niche" unanswerable while "does a crest layout outperform a
-- stacked one" stayed answerable, even though they are the same shape of
-- question. Folding motif in would conflate "a skeleton is drawn on it" with
-- "it is drawn in a distressed style" — different decisions entirely.
--
-- kind stays free text with no CHECK, consistent with every other vocabulary
-- in this schema. A fifth kind is a one-line JS change.

-- ── aesthetic: the overall vibe ─────────────────────────────────────────────
UPDATE visual_tags SET kind = 'aesthetic' WHERE lower(name) IN (
  'coquette', 'dark academia', 'dopamine', 'preppy', 'romantic gothic',
  'western', 'minimalist',
  'elevated sports'          -- AMBIGUOUS: a vibe, but arguably a design_style
);

-- ── design_style: how it is built ───────────────────────────────────────────
UPDATE visual_tags SET kind = 'design_style' WHERE lower(name) IN (
  -- layout / composition
  'arch', 'badge', 'crest', 'circular', 'stacked', 'oversized center',
  'minimal center', 'icon row', 'pocket + back', 'grid', 'sandwich',
  -- treatment / technique
  'patchwork', 'modern patchwork', 'embroidered-look', 'puff-look',
  'distressed', 'halftone', 'hand-drawn', 'doodle', 'watercolor',
  'photograph/portrait',
  'vintage wash',            -- AMBIGUOUS: a print/garment treatment, but reads as a vibe too
  -- sports-lettering families: named layout conventions, not vibes
  'collegiate',              -- AMBIGUOUS: could be aesthetic
  'varsity',                 -- AMBIGUOUS: could be aesthetic
  'retro collegiate'         -- AMBIGUOUS: retro is a vibe, collegiate a layout
);

-- ── typography: letterforms ─────────────────────────────────────────────────
UPDATE visual_tags SET kind = 'typography' WHERE lower(name) IN (
  'blackletter', 'condensed', 'editorial serif', 'handwritten',
  'mixed typography', 'retro serif', 'sans serif', 'script', 'serif',
  'bubble',                  -- AMBIGUOUS: read as bubble LETTERS, not bubbles-as-imagery
  'clean'                    -- AMBIGUOUS: sits among type terms, but could be aesthetic
);

-- ── motif: what is depicted ─────────────────────────────────────────────────
UPDATE visual_tags SET kind = 'motif' WHERE lower(name) IN (
  'books', 'bow', 'cherry', 'floral', 'ghost', 'hockey stick', 'football',
  'raccoon', 'skeleton',
  'camp'                     -- AMBIGUOUS: read as summer-camp imagery (cf. the Camp Mom
                             -- products), not the "camp" aesthetic
);

-- ---------------------------------------------------------------------------
-- Verify (optional — run after the above)
-- ---------------------------------------------------------------------------
-- Expect 8 aesthetic, 25 design_style, 11 typography, 10 motif, 0 unsorted.
-- Anything left unsorted means a name below did not match a real tag — check
-- for a spelling drift rather than assuming the tag is gone.
--
-- SELECT COALESCE(kind, '(unsorted)') AS kind, count(*)
-- FROM visual_tags GROUP BY 1 ORDER BY 2 DESC;
--
-- SELECT name FROM visual_tags WHERE kind IS NULL ORDER BY name;
