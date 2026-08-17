import { useState, useMemo } from 'react';
import { useNicheTimings, useProducts } from '../lib/hooks';
import { useCollectionsContext } from '../context/CollectionsContext';
import { computeProductTiming, TIMING_STATE_LABEL } from '../lib/timingIntelligence';
import { TimingStateBadge } from './TimingPanel';
import { daysBetween, today } from '../data/seasons';

// Phase 22 — product-level timing, deliberately thin.
//
// Two jobs only: make a missing launch date impossible to miss and trivial to
// fix, and show where this listing sits relative to its niche's window. It
// does NOT interpret performance — the 30/60/90/120 checkpoint loop already
// owns that, and a second opinion living next to it would be a competing
// source of truth about whether a listing is doing well.
//
// went_live_at is never inferred. created_at, updated_at, stage_updated_at
// and analytics import dates are all different events, and this is an
// evidence field: unknown stays unknown until she enters it.

export default function ProductTiming({ product, onSaveLaunchDate }) {
  const { collectionObjects: collections } = useCollectionsContext();
  // Shop-wide products, not just this one: hasLiveCoverage asks whether ANY
  // listing in a linked collection is live, which is what separates MAINTAIN
  // from LATE_WINDOW for the niche as a whole.
  const { products } = useProducts();
  const { results } = useNicheTimings(products, collections);
  const [entry, setEntry] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Only niches explicitly linked to this product's collection — no name
  // guessing, same rule as everywhere else in this phase.
  const nicheResults = useMemo(
    () => results.filter(r => r.linkedCollections.some(c => c.name === product?.collection)),
    [results, product?.collection]
  );

  const pt = computeProductTiming(product, nicheResults[0]?.timing || null);

  async function save() {
    if (!entry) return;
    setSaving(true); setError(null);
    const ok = await onSaveLaunchDate({ went_live_at: entry });
    setSaving(false);
    if (!ok) { setError('Save failed — see the banner above.'); return; }
    setEntry('');
  }

  if (!product) return null;

  return (
    <div>
      <div className="section-label" style={{ marginBottom: 10 }}>Timing</div>

      {!pt.hasLaunchDate ? (
        <div style={{
          border: '1px solid rgba(232,168,124,0.5)', borderRadius: 2, padding: '12px 14px',
          background: 'rgba(232,168,124,0.08)',
        }}>
          <div style={{ fontSize: '0.84rem', fontWeight: 600, color: '#7a4a1e', marginBottom: 4 }}>
            ⚠ Launch date missing
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--charcoal-soft)', marginBottom: 10, lineHeight: 1.5 }}>
            Add the date this listing went live to enable timing analysis and the 30/60/90/120 review
            checkpoints. It is not filled in from the created or last-edited date — those are different
            events, so this stays unknown until you set it.
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input type="date" value={entry} max={today()} onChange={e => setEntry(e.target.value)}
              style={{ fontSize: '0.8rem', width: 'auto' }} />
            <button className="btn btn-primary btn-sm" onClick={save} disabled={!entry || saving}>
              {saving ? 'Saving…' : 'Save launch date'}
            </button>
          </div>
          {error && <div style={{ fontSize: '0.76rem', color: '#8b3a3a', marginTop: 6 }}>{error}</div>}
        </div>
      ) : (
        <div style={{ border: 'var(--border)', borderRadius: 2, padding: '12px 14px', background: 'var(--warm-white)' }}>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: '0.82rem' }}>
            <span>Went live: <strong>{product.went_live_at}</strong></span>
            <span>Age: <strong>{pt.daysLive} day{pt.daysLive === 1 ? '' : 's'}</strong></span>
          </div>

          {nicheResults.length ? (
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(43,41,38,0.08)' }}>
              {nicheResults.map(r => (
                <div key={r.niche.id} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 5 }}>
                  <span style={{ fontSize: '0.78rem' }}>{r.niche.name}</span>
                  <TimingStateBadge state={r.timing.state} size="sm" />
                  {r.timing.targetLiveDate ? (
                    <span style={{ fontSize: '0.74rem', color: 'var(--charcoal-soft)' }}>
                      target {r.timing.targetLiveDate}
                      {product.went_live_at <= r.timing.targetLiveDate
                        ? ` · went live ${daysBetween(product.went_live_at, r.timing.targetLiveDate)} days before target`
                        : ` · went live ${daysBetween(r.timing.targetLiveDate, product.went_live_at)} days after target`}
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: '0.74rem', color: 'var(--charcoal-soft)', marginTop: 8, fontStyle: 'italic' }}>
              No timing niche is linked to this product&rsquo;s collection, so there is no window to place it in.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export { TIMING_STATE_LABEL };
