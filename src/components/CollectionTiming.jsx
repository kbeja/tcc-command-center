import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNicheTimings, linkTimingNicheToCollection } from '../lib/hooks';
import TimingPanel from './TimingPanel';

// Phase 22 — collection-level timing. Complements the per-product view rather
// than replacing it: a collection's timing comes from the niches linked to
// it, and a product's timing comes from its own launch date.
//
// A collection with no linked niche shows an honest empty state and a way to
// link one. It never guesses which niche a collection corresponds to by name
// — the shop has both a "Hockey" and a "Field Hockey Niche" collection, and a
// name-similarity guess would silently assert they are the same thing as an
// expert source's "Hockey".

export default function CollectionTiming({ collection, products = [], collections = [] }) {
  const navigate = useNavigate();
  const { results, loading, refetch } = useNicheTimings(products, collections);
  const [linking, setLinking] = useState(false);
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const linked = useMemo(
    () => results.filter(r => r.linkedCollections.some(c => c.id === collection?.id)),
    [results, collection?.id]
  );

  async function link() {
    if (!pick) return;
    setBusy(true); setError(null);
    const { error: err } = await linkTimingNicheToCollection(pick, collection.id);
    setBusy(false);
    if (err) { setError(err.message); return; }
    setPick(''); setLinking(false); await refetch();
  }

  if (loading) return null;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        <div className="eyebrow">Timing</div>
        {linked.length ? (
          <button className="btn btn-ghost btn-sm" onClick={() => setLinking(v => !v)}>
            {linking ? 'Cancel' : '+ Link another niche'}
          </button>
        ) : null}
      </div>

      {!results.length ? (
        <div style={{ fontSize: '0.8rem', color: 'var(--charcoal-soft)', fontStyle: 'italic' }}>
          No timing niches exist yet. Run the Phase 22 migrations to seed the niche calendar, then link
          the niches that apply to this collection.
        </div>
      ) : !linked.length && !linking ? (
        <div style={{ border: 'var(--border)', borderRadius: 2, padding: '14px 16px', background: 'var(--warm-white)' }}>
          <div style={{ fontSize: '0.82rem', marginBottom: 4 }}>No timing niche linked to this collection yet.</div>
          <div style={{ fontSize: '0.76rem', color: 'var(--charcoal-soft)', marginBottom: 10, lineHeight: 1.5 }}>
            Timing evidence is recorded against a source&rsquo;s own niche names, which are deliberately not
            matched to collections automatically. Link one and this collection gets a real timing state.
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => setLinking(true)}>Link a niche</button>
        </div>
      ) : null}

      {linking ? (
        <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
          <select value={pick} onChange={e => setPick(e.target.value)} style={{ fontSize: '0.78rem', maxWidth: 280 }}>
            <option value="">Select a niche…</option>
            {results
              .filter(r => !r.linkedCollections.some(c => c.id === collection?.id))
              .map(r => <option key={r.niche.id} value={r.niche.id}>{r.niche.name}</option>)}
          </select>
          <button className="btn btn-sm btn-primary" onClick={link} disabled={!pick || busy}>Link</button>
          <button className="btn btn-sm btn-ghost" onClick={() => navigate('/knowledge')}>Manage in Knowledge →</button>
        </div>
      ) : null}
      {error && <div style={{ fontSize: '0.78rem', color: '#8b3a3a', marginBottom: 8 }}>⚠ {error}</div>}

      {linked.map(r => (
        <div key={r.niche.id} style={{ marginBottom: 12 }}>
          <TimingPanel timing={r.timing} nicheName={r.niche.name} notes={r.notes} />
        </div>
      ))}

      {/* collections.season is a separate, older concept and is deliberately
          left alone by this phase — it still feeds keyword classification and
          the Listing Builder's generation context. Naming it here keeps the
          two from looking like one thing that disagrees with itself. */}
      {linked.length && collection?.season ? (
        <div style={{ fontSize: '0.72rem', color: 'var(--charcoal-soft)', marginTop: -4 }}>
          This collection is also tagged with the season &ldquo;{collection.season}&rdquo;, which is a separate
          field used by keyword classification and listing generation — not by the timing states above.
        </div>
      ) : null}
    </div>
  );
}
