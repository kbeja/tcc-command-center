import { TITLE_STRATEGIES, LEGACY_TITLE_STRATEGY_LABELS, INTENT_STATUS_STYLE } from './constants';
import ResearchEvidence from './ResearchEvidence';

// Zone 2 — Search Strategy (Milestone B). The page's center of gravity:
// Primary Search Intent, Title Strategy (a search-strategy decision, not a
// product fact — relocated here from Zone 1), a research summary replacing
// the old flat always-expanded session list, and the full evidence picture
// (ResearchEvidence, variant="full") behind whatever the current strategy
// claims.
export default function Zone2SearchStrategy({
  form, setField,
  primarySearchIntent, onIntentChange, primaryIntentStatus, output,
  sessions, activeSessions, selectedSessionIds, onToggleSession, onSelectAllSessions, onSelectNoSessions, globalCollections,
  totalUsable, bucketCounts, sourcesForDisplay,
  keywordAgedays, collectionLastVerified, keywordsStale,
  brandStyleGuide,
  supportingKeywords, researchGaps, excludedKeywords, saveFlagsProductId,
}) {
  const freshnessLabel = keywordsStale
    ? `${keywordAgedays}d ago — recheck recommended`
    : collectionLastVerified
      ? (keywordAgedays === 0 ? 'today' : `${keywordAgedays}d ago`)
      : 'never';
  const matchedKeyword = output?.primary_intent_matched_keyword;

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="eyebrow" style={{ marginBottom: 12 }}>Search Strategy</div>

      {/* Primary Search Intent — proposed by generation itself, not picked
          from a bucket pool beforehand; the human stays the backstop by
          editing it directly here afterward, same trust model as title/tags. */}
      {(primarySearchIntent || output) && (
        <div style={{ marginBottom: 14 }}>
          <label className="form-label">
            Primary Search Intent
            {primaryIntentStatus && INTENT_STATUS_STYLE[primaryIntentStatus] && (
              <span style={{
                marginLeft: 8, fontSize: '0.65rem', padding: '1px 7px', borderRadius: 10, textTransform: 'capitalize',
                background: INTENT_STATUS_STYLE[primaryIntentStatus].bg, color: INTENT_STATUS_STYLE[primaryIntentStatus].color,
              }}>
                {primaryIntentStatus}
              </span>
            )}
          </label>
          <input value={primarySearchIntent} onChange={e => onIntentChange(e.target.value)}
            style={{ fontSize: '0.82rem' }} placeholder="Generated after you click Generate Listing — editable" />
          {matchedKeyword && (
            <div style={{ fontSize: '0.68rem', color: 'var(--charcoal-soft)', opacity: 0.75, marginTop: 4 }}>
              Matched research keyword: "{matchedKeyword}"
            </div>
          )}
        </div>
      )}

      {/* Title Strategy — replaces the old 2-value Title Style toggle. Only
          the 3 live strategies are ever offered as buttons here;
          legacy_keyword_rich/legacy_short_clean exist only as backfilled
          historical values on older products and are deliberately not
          selectable — clicking a button can never land on one, and loading
          an old product doesn't silently relabel its value into a live
          choice. The value must still remain readable, though, not just 3
          unhighlighted buttons with no indication anything historical is set. */}
      <div style={{ marginBottom: 16 }}>
        <label className="form-label">
          Title Strategy <span style={{ fontWeight: 400, opacity: 0.5 }}>— saved with the listing so you can compare performance later</span>
        </label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
          {TITLE_STRATEGIES.map(opt => {
            const active = form.titleStrategy === opt.key;
            return (
              <button key={opt.key} type="button"
                onClick={() => setField('titleStrategy', opt.key)}
                style={{
                  fontSize: '0.72rem', padding: '4px 10px', borderRadius: 20, cursor: 'pointer',
                  background: active ? 'rgba(124,175,138,0.9)' : 'rgba(124,175,138,0.12)',
                  color: active ? '#fff' : '#2d6b3c',
                  border: `1px solid rgba(124,175,138,${active ? '0.9' : '0.3'})`,
                  fontWeight: active ? 600 : 400,
                }}>
                {opt.label}
              </button>
            );
          })}
        </div>
        {form.titleStrategy && LEGACY_TITLE_STRATEGY_LABELS[form.titleStrategy] && (
          <div style={{ fontSize: '0.72rem', opacity: 0.6, marginTop: 4 }}>
            Current: {LEGACY_TITLE_STRATEGY_LABELS[form.titleStrategy]} (legacy — historical value, not selectable above; pick a strategy to replace it)
          </div>
        )}
      </div>

      {/* Bucket coverage — informational only, same B1≥1/B2≥3/B3≥1 thresholds
          and gap wording as Research.jsx's own per-collection banner, kept
          visible here (not buried in "View research details" below) per
          Kristen's request. Milestone A deliberately removed the old
          hard-blocking gate; this is its opposite by design — it never
          blocks Generate, only informs. */}
      {sessions.length > 0 && (() => {
        const gaps = [];
        if (bucketCounts[1] < 1) gaps.push('needs B1 (visibility keyword)');
        if (bucketCounts[2] < 3) gaps.push(`needs ${3 - bucketCounts[2]} more B2`);
        if (bucketCounts[3] < 1) gaps.push('needs B3 (bestseller)');
        return (
          <div style={{
            display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', padding: '8px 12px', marginBottom: 14,
            background: gaps.length ? 'rgba(232,168,124,0.12)' : 'rgba(124,175,138,0.1)', borderRadius: 2,
            border: `1px solid ${gaps.length ? 'rgba(232,168,124,0.4)' : 'var(--success)'}`, fontSize: '0.72rem',
          }}>
            <span style={{ color: 'var(--charcoal-soft)' }}>Bucket coverage:</span>
            {[['B1', bucketCounts[1], bucketCounts[1] >= 1 ? '#2d6b3c' : '#7a2b2b'],
              ['B2', bucketCounts[2], bucketCounts[2] >= 3 ? '#2d6b3c' : '#7a4a1e'],
              ['B3', bucketCounts[3], bucketCounts[3] >= 1 ? '#2d6b3c' : '#7a2b2b']].map(([label, count, color]) => (
              <span key={label} style={{ fontWeight: 600, color }}>{label}: {count}</span>
            ))}
            {bucketCounts.unbucketed > 0 && <span style={{ color: 'var(--charcoal-soft)' }}>· {bucketCounts.unbucketed} unbucketed</span>}
            {gaps.length > 0
              ? <span style={{ color: '#7a4a1e', marginLeft: 4 }}>⚑ {gaps.join(' · ')} — doesn't block generating</span>
              : <span style={{ color: '#2d6b3c', marginLeft: 4 }}>✓ Coverage complete</span>}
          </div>
        );
      })()}

      {/* Research summary — replaces the old flat, always-expanded session
          list. activeSessions.length (not sessions.length) for the selected
          count: the session-fetch effect silently resets selection to "all"
          on every collection change, so a stale total would misrepresent
          actual manual deselections once they're hidden behind this summary. */}
      {sessions.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: '0.78rem', color: 'var(--charcoal-soft)', marginBottom: 6 }}>
            {activeSessions.length} of {sessions.length} session{sessions.length !== 1 ? 's' : ''} · {totalUsable} usable keyword{totalUsable !== 1 ? 's' : ''} · {sourcesForDisplay.length} source{sourcesForDisplay.length !== 1 ? 's' : ''} · updated {freshnessLabel}
          </div>
          <details>
            <summary style={{ fontSize: '0.75rem', color: 'var(--charcoal-soft)', cursor: 'pointer' }}>View research details</summary>
            <div style={{ marginTop: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <button type="button" onClick={onSelectAllSessions}
                  style={{ fontSize: '0.65rem', color: 'var(--charcoal-soft)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                  all
                </button>
                <button type="button" onClick={onSelectNoSessions}
                  style={{ fontSize: '0.65rem', color: 'var(--charcoal-soft)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                  none
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {sessions.map(s => {
                  const kwCount = (s.keywords || []).filter(k => !k.tags_only && k.tag_type !== 'discard').length;
                  const b1kws = (s.keywords || []).filter(k => k.bucket === 1);
                  const b1count = b1kws.length;
                  const b1Tooltip = b1kws.length > 0 ? `B1 keywords: ${b1kws.slice(0, 5).map(k => k.keyword).join(', ')}${b1kws.length > 5 ? ` +${b1kws.length - 5} more` : ''}` : '';
                  const isGlobal = globalCollections.includes(s.collection);
                  const isSelected = selectedSessionIds.has(s.id);
                  return (
                    <div key={s.id}
                      onClick={() => !isGlobal && onToggleSession(s.id)}
                      title={b1Tooltip || undefined}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
                        borderRadius: 4, cursor: isGlobal ? 'default' : 'pointer',
                        background: isGlobal ? 'rgba(120,140,200,0.08)' : isSelected ? 'rgba(124,175,138,0.1)' : 'var(--charcoal-faint)',
                        border: `1px solid ${isGlobal ? 'rgba(120,140,200,0.25)' : isSelected ? 'rgba(124,175,138,0.3)' : 'transparent'}`,
                      }}>
                      {isGlobal
                        ? <span
                            title={`Always included — "${s.collection}" is a pooled collection whose keywords apply to every listing, not just this one. No checkbox because it can't be turned off here.`}
                            style={{ fontSize: '0.6rem', color: '#1e306b', background: 'rgba(120,140,200,0.2)', padding: '1px 5px', borderRadius: 8, fontWeight: 600, flexShrink: 0, cursor: 'help' }}
                          >GLOBAL</span>
                        : <input type="checkbox" checked={isSelected} readOnly style={{ width: 'auto', margin: 0, flexShrink: 0, pointerEvents: 'none' }} />
                      }
                      <span style={{ fontSize: '0.75rem', fontWeight: 500 }}>{s.niche || s.collection}</span>
                      <span style={{ fontSize: '0.68rem', color: 'var(--charcoal-soft)' }}>{s.date} · {s.source}</span>
                      <span style={{ fontSize: '0.68rem', color: 'var(--charcoal-soft)', marginLeft: 'auto' }}>
                        {kwCount} kw{b1count > 0 && <span style={{ color: '#2d6b3c', fontWeight: 600 }}> · {b1count} B1</span>}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </details>
        </div>
      )}

      {/* Doesn't fit any of Zone 4's 5 named readiness dimensions — quiet
          one-line caveat, not a 6th dimension. Checks the brand-wide guide
          (Design Standards playbook), not the collection-specific one:
          collection-level style guides are deliberately not used, so
          warning on their absence would fire on every listing forever. */}
      {!brandStyleGuide && (
        <div style={{ fontSize: '0.72rem', color: 'var(--charcoal-soft)', opacity: 0.8, marginBottom: 14 }}>
          ⚠ Brand style guide missing — set one in Knowledge → Playbooks → Design Standards.
        </div>
      )}

      <ResearchEvidence
        variant="full"
        supportingKeywords={supportingKeywords}
        researchGaps={researchGaps}
        excludedKeywords={excludedKeywords}
        sources={sourcesForDisplay}
        saveFlagsProductId={saveFlagsProductId}
      />
    </div>
  );
}
