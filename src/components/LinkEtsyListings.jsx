import { useState, useMemo } from 'react';
import { proposeListingLinks } from '../lib/tccIntelligence';
import { useProducts, linkProductToEtsyListing } from '../lib/hooks';

// Phase 23A — the one-time linkage step.
//
// products.etsy_listing_id is unset on every product, so nothing captured
// from Etsy can be matched to anything in TCC. Everything per-listing depends
// on fixing that: ad performance, traffic sources, search terms, snapshots.
//
// Title matching is used HERE and only here, to PROPOSE matches for a human
// to confirm. It is never used again afterwards, because this shop genuinely
// contains two byte-identical listing titles belonging to different listings
// with materially different performance (120 impressions at 0.8% CTR versus
// 85 at 2.4%). An automated matcher cannot tell those apart, so it refuses to
// try and asks instead.
//
// Nothing is written until she presses Link on a row.

const CONFIDENCE_STYLE = {
  exact_title:    { label: 'Exact title match', color: '#2d6b3c', bg: 'rgba(124,175,138,0.15)' },
  likely:         { label: 'Likely match',      color: '#2d4270', bg: 'rgba(107,130,168,0.15)' },
  ambiguous:      { label: 'Needs your call',   color: '#7a4a1e', bg: 'rgba(232,168,124,0.2)'  },
  no_match:       { label: 'No match found',    color: 'var(--charcoal-soft)', bg: 'rgba(43,41,38,0.08)' },
  already_linked: { label: 'Already linked',    color: '#2d6b3c', bg: 'rgba(124,175,138,0.1)'  },
};

function Badge({ confidence }) {
  const s = CONFIDENCE_STYLE[confidence] || CONFIDENCE_STYLE.no_match;
  return (
    <span style={{
      fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
      padding: '2px 8px', borderRadius: 10, background: s.bg, color: s.color, whiteSpace: 'nowrap',
    }}>{s.label}</span>
  );
}

export default function LinkEtsyListings({ onClose }) {
  const { products, refetch } = useProducts();
  const [raw, setRaw] = useState('');
  const [captured, setCaptured] = useState(null);
  const [error, setError] = useState('');
  const [choice, setChoice] = useState({});     // etsyListingId -> productId
  const [busy, setBusy] = useState(null);
  const [done, setDone] = useState({});         // etsyListingId -> productId

  function handleParse() {
    setError('');
    try {
      const parsed = JSON.parse(raw);
      const listings = Array.isArray(parsed) ? parsed : parsed.listings;
      if (!Array.isArray(listings) || !listings.length) {
        setError('That JSON has no listings in it. Copy again from the extension on your Etsy listings page.');
        return;
      }
      if (!listings.every(l => l.etsyListingId)) {
        setError('Some entries have no Etsy listing id — that is the one field this cannot work without.');
        return;
      }
      setCaptured(listings);
    } catch {
      setError('That is not valid JSON. Paste exactly what the extension copied, without editing it.');
    }
  }

  const proposals = useMemo(
    () => (captured ? proposeListingLinks(captured, products) : []),
    [captured, products]
  );

  const unlinkedProducts = useMemo(
    () => products.filter(p => !p.etsy_listing_id).sort((a, b) => a.name.localeCompare(b.name)),
    [products]
  );

  async function link(etsyListingId, productId) {
    if (!productId) return;
    setBusy(etsyListingId);
    const { error: err } = await linkProductToEtsyListing(productId, etsyListingId);
    setBusy(null);
    if (err) { setError(err.message); return; }
    setDone(d => ({ ...d, [etsyListingId]: productId }));
    await refetch();
  }

  const counts = proposals.reduce((a, p) => { a[p.confidence] = (a[p.confidence] || 0) + 1; return a; }, {});
  const linkedCount = products.filter(p => p.etsy_listing_id).length;

  return (
    <div style={{ border: 'var(--border)', borderRadius: 2, padding: 18, background: 'var(--warm-white)', marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
        <div className="eyebrow">Link Etsy listings</div>
        <span style={{ fontSize: '0.74rem', color: 'var(--charcoal-soft)' }}>
          {linkedCount} of {products.length} products linked
        </span>
      </div>

      <div style={{ fontSize: '0.78rem', color: 'var(--charcoal-soft)', marginBottom: 12, lineHeight: 1.55 }}>
        Open your Etsy <strong>Shop Manager → Listings</strong> page, scroll to the bottom so every listing has
        loaded, then click the TCC extension and copy. Paste the result below. This only has to be done once —
        afterwards everything matches on the Etsy listing id, never on titles.
      </div>

      {!captured && (
        <>
          <textarea
            rows={4}
            value={raw}
            onChange={e => setRaw(e.target.value)}
            placeholder="Paste what the extension copied…"
            style={{ width: '100%', fontSize: '0.76rem', fontFamily: 'monospace' }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={handleParse} disabled={!raw.trim()}>Read listings</button>
            {onClose && <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>}
          </div>
        </>
      )}

      {error && <div style={{ fontSize: '0.78rem', color: '#8b3a3a', marginTop: 8 }}>⚠ {error}</div>}

      {captured && (
        <div>
          <div style={{ fontSize: '0.8rem', marginBottom: 10 }}>
            <strong>{captured.length}</strong> listings read
            {Object.entries(counts).map(([k, n]) => (
              <span key={k} style={{ marginLeft: 8 }}><Badge confidence={k} /> {n}</span>
            ))}
          </div>

          {proposals.map(p => {
            const linkedTo = done[p.listing.etsyListingId];
            const selected = choice[p.listing.etsyListingId] ?? p.match?.id ?? '';
            return (
              <div key={p.listing.etsyListingId} style={{
                borderTop: '1px solid rgba(43,41,38,0.08)', padding: '10px 0',
                opacity: p.confidence === 'already_linked' || linkedTo ? 0.55 : 1,
              }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap', marginBottom: 5 }}>
                  <Badge confidence={linkedTo ? 'already_linked' : p.confidence} />
                  <span style={{ fontSize: '0.8rem', flex: 1, minWidth: 200 }}>{p.listing.title}</span>
                  <span style={{ fontSize: '0.66rem', color: 'var(--charcoal-soft)', fontFamily: 'monospace' }}>
                    {p.listing.etsyListingId}
                  </span>
                </div>

                {/* The duplicate-title case: two Etsy listings with the same
                    text. No proposal is offered, because any guess here has a
                    50% chance of attaching performance to the wrong product
                    permanently. */}
                {p.ambiguous && !linkedTo && (
                  <div style={{ fontSize: '0.74rem', color: '#7a4a1e', marginBottom: 5 }}>
                    Another Etsy listing has this exact title, so it cannot be matched automatically.
                    Open both on Etsy and pick the right product yourself.
                  </div>
                )}

                {linkedTo ? (
                  <div style={{ fontSize: '0.76rem', color: '#2d6b3c' }}>
                    ✓ Linked to {products.find(x => x.id === linkedTo)?.name || 'product'}
                  </div>
                ) : p.confidence === 'already_linked' ? (
                  <div style={{ fontSize: '0.76rem', color: 'var(--charcoal-soft)' }}>
                    Already linked to a product.
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <select
                      value={selected}
                      onChange={e => setChoice(c => ({ ...c, [p.listing.etsyListingId]: e.target.value }))}
                      style={{ fontSize: '0.76rem', maxWidth: 320 }}
                    >
                      <option value="">Select the TCC product…</option>
                      {unlinkedProducts.map(prod => (
                        <option key={prod.id} value={prod.id}>{prod.name}</option>
                      ))}
                    </select>
                    <button
                      className="btn btn-sm btn-primary"
                      disabled={!selected || busy === p.listing.etsyListingId}
                      onClick={() => link(p.listing.etsyListingId, selected)}
                    >
                      {busy === p.listing.etsyListingId ? 'Linking…' : 'Link'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => { setCaptured(null); setRaw(''); setDone({}); setChoice({}); }}>
              Paste a different capture
            </button>
            {onClose && <button className="btn btn-ghost btn-sm" onClick={onClose}>Done</button>}
          </div>
        </div>
      )}
    </div>
  );
}
