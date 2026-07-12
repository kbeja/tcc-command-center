-- Research Hierarchy Migration
-- Run in Supabase SQL editor

-- Add parent_niche column to research_sessions
ALTER TABLE research_sessions ADD COLUMN IF NOT EXISTS parent_niche text;

-- Auto-assign parent_niche to existing sessions based on collection name patterns
UPDATE research_sessions
SET parent_niche = CASE
  WHEN collection ILIKE '%mom%' THEN 'Mom Chapter'
  WHEN collection ILIKE '%reader%'
    OR collection ILIKE '%book%'
    OR collection ILIKE '%literary%'
    OR collection ILIKE '%cozy%'
    OR collection ILIKE '%elder%'
    OR collection ILIKE '%annotation%'
    OR collection ILIKE '%cottage%'
    OR collection ILIKE '%romance%'
    OR collection ILIKE '%dark academia%'
    OR collection ILIKE '%bookstore%'
    THEN 'Reader Chapter'
  WHEN collection ILIKE '%kid%' OR collection ILIKE '%children%'
    THEN 'Kids Chapter'
  ELSE NULL
END
WHERE parent_niche IS NULL;
