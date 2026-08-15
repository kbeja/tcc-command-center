import ResearchEvidence from './ResearchEvidence';

// Zone 3 — Research tab (Milestone B). Thin wrapper: same evidence Zone 2
// already shows, read-only recap (variant="echo" drops the interactive
// SaveFlagsButton) — Zone 2 stays the authoritative surface.
export default function Zone3Research({ supportingKeywords, researchGaps, excludedKeywords, sources }) {
  return (
    <ResearchEvidence
      variant="echo"
      supportingKeywords={supportingKeywords}
      researchGaps={researchGaps}
      excludedKeywords={excludedKeywords}
      sources={sources}
    />
  );
}
