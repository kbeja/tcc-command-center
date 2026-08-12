-- Trend Signal Provenance Migration (Phase 17 — external trend intelligence)
-- Run this in Supabase SQL Editor (not auto-applied)
--
-- Why: trend_signals has no source/confidence/session_id today -- "source"
-- only exists as prose inside the evidence textarea's placeholder, never a
-- real column. This brings trend_signals in line with the provenance
-- pattern research_sessions.source / import_sessions.source already use,
-- and extends the session_id FK Phase 14 added to sparks/research_sessions/
-- workshop_items/concepts to trend signals too.
--
-- source: free text, not an enum -- same convention as research_sessions.source.
-- confidence: High/Medium/Low via the existing ConfidenceSelector component,
-- same convention as products.confidence -- deliberately left unset by any
-- automated creation path (confidence is a human judgment call).
-- session_id: nullable, ON DELETE SET NULL -- identical pattern to
-- sparks.session_id / concepts.session_id etc.
--
-- competitor_snapshot is a separate, unrelated fix found while verifying
-- this table's live schema: Trends.jsx has always written to this column
-- (a dedicated "Competitor Snapshot" textarea) but it never actually
-- existed live -- every signal create/edit through the page has been
-- silently failing (neither save function checked the error response).
-- Adding the column fixes this; the error-checking gap itself is fixed in
-- the same pass in Trends.jsx.

ALTER TABLE trend_signals ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE trend_signals ADD COLUMN IF NOT EXISTS confidence text;
ALTER TABLE trend_signals ADD COLUMN IF NOT EXISTS session_id uuid REFERENCES import_sessions(id) ON DELETE SET NULL;
ALTER TABLE trend_signals ADD COLUMN IF NOT EXISTS competitor_snapshot text;
