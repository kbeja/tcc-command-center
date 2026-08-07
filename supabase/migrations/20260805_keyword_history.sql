-- Keyword History Migration
-- Run this in Supabase SQL Editor (not auto-applied)
-- Creates: keyword_history table
--
-- Why: re-importing a keyword you already track (Everbee CSV, manual paste,
-- chat-summary import, or a per-listing audit) used to insert a brand-new
-- duplicate row every time, so the keyword bank filled up with stale copies
-- of the same keyword and nothing ever reflected the latest numbers cleanly.
-- Going forward, createResearchSession() updates the existing `keywords` row
-- in place and snapshots what it *used* to say into keyword_history first —
-- so the keyword bank stays current while volume/competition/score history
-- is preserved for trend analysis.

-- ─── keyword_history ────────────────────────────────────────────────────────
-- One row per superseded reading. keyword_id is nullable (ON DELETE SET NULL)
-- so history survives even if the current `keywords` row is later deleted —
-- the denormalized `keyword` text keeps old snapshots queryable on their own.

CREATE TABLE IF NOT EXISTS keyword_history (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword_id    uuid REFERENCES keywords(id) ON DELETE SET NULL,
  keyword       text NOT NULL,

  volume        integer,
  competition   integer,
  score         integer,
  source        text,            -- research_sessions.source at the time this reading was current

  recorded_at   timestamptz NOT NULL DEFAULT now()  -- when this reading was superseded
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS keyword_history_keyword_id_idx ON keyword_history(keyword_id);
CREATE INDEX IF NOT EXISTS keyword_history_keyword_idx ON keyword_history(lower(keyword));

-- ─── RLS ──────────────────────────────────────────────────────────────────────
-- TCC is single-user; permissive policy mirrors the existing tables.

ALTER TABLE keyword_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all_keyword_history" ON keyword_history FOR ALL USING (true) WITH CHECK (true);
