import { ConfidenceBadge } from '../../lib/keywords.jsx';
import { SaveFlagsButton } from './shared';

const GAP_SEVERITY_COLOR = { critical: '#8b3a3a', research_opportunity: '#7a4a1e', optional_test: 'var(--charcoal-soft)' };

function relevanceLabel(category) {
  return (category || '').replace(/_/g, ' ');
}

// Shared between Zone 2 (Search Strategy, variant="full") and Zone 3's
// Research tab (variant="echo", no interactive controls — same data,
// read-only recap). One implementation, not two, per the Milestone B plan's
// own risk note about fields named in multiple zones. Pure display of
// values Milestone A already computes — supporting_keywords/research_gaps
// come straight off the generation object, nothing recomputed here.
export default function ResearchEvidence({
  variant = 'full',
  supportingKeywords, researchGaps, excludedKeywords, sources, saveFlagsProductId,
}) {
  const hasSupporting = supportingKeywords?.length > 0;
  const hasGaps = researchGaps?.length > 0;
  const hasExcluded = excludedKeywords?.length > 0;
  const hasSources = sources?.length > 0;

  if (!hasSupporting && !hasGaps && !hasExcluded && !hasSources) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {hasSupporting && (
        <div>
          <div style={{ fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--charcoal-soft)', marginBottom: 6 }}>
            Supporting Keywords
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {supportingKeywords.map((k, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.78rem' }}>
                <strong>{k.keyword}</strong>
                <span style={{ color: 'var(--charcoal-soft)', opacity: 0.75 }}>{relevanceLabel(k.relevance_category)}</span>
                <ConfidenceBadge confidence={k.confidence} />
              </div>
            ))}
          </div>
        </div>
      )}

      {hasGaps && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <div style={{ fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--charcoal-soft)' }}>
              Research Gaps
            </div>
            {variant === 'full' && <SaveFlagsButton flags={researchGaps} productId={saveFlagsProductId} />}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {researchGaps.map((g, i) => (
              <div key={i} style={{ fontSize: '0.78rem', color: GAP_SEVERITY_COLOR[g.severity] || 'var(--charcoal-soft)', lineHeight: 1.6 }}>
                <span style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', marginRight: 6 }}>{g.severity?.replace(/_/g, ' ')}</span>
                {g.message}
              </div>
            ))}
          </div>
        </div>
      )}

      {hasExcluded && (
        <div>
          <details>
            <summary style={{ fontSize: '0.75rem', color: 'var(--charcoal-soft)', cursor: 'pointer' }}>
              {excludedKeywords.length} keyword{excludedKeywords.length !== 1 ? 's' : ''} excluded — view
            </summary>
            <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
              {excludedKeywords.map((k, i) => (
                <div key={i} style={{ fontSize: '0.75rem', color: 'var(--charcoal-soft)' }}>
                  <strong>{k.keyword}</strong> — {k.reason}
                </div>
              ))}
            </div>
          </details>
        </div>
      )}

      {hasSources && (
        <div style={{ fontSize: '0.72rem', color: 'var(--charcoal-soft)' }}>
          Sources: {sources.join(', ')}
        </div>
      )}
    </div>
  );
}
