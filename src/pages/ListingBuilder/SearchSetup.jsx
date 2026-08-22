import { useState } from 'react';

// ─── Listing Search Setup (Phase 6) ────────────────────────────────────────
// §12/§13: Etsy's own guidance is that search relevance draws on category,
// attributes, description and listing quality — not title and tags alone.
// Before this, TCC had no field for either of the first two, which made the
// Listing Builder a title+tag generator rather than the "Etsy Listing Search +
// Conversion Setup" §12 asks for.
//
// Deliberately NOT an Etsy category tree. §13: "Do not hard-code Etsy category
// names indefinitely. Etsy category taxonomy can change." A stale imported tree
// that looks canonical is worse than none — it would quietly offer categories
// that no longer exist while hiding new ones. So: paste the path Etsy shows
// you, then confirm it is the most specific one. The confirmation is the part
// that carries meaning; a path alone is a draft.
//
// Attributes are free key/value pairs because Etsy defines them PER CATEGORY —
// a tee has neckline and sleeve length, a mug has capacity, an ornament
// neither. Nothing here can know how many a given category offers, so this
// never shows "n of N" and never infers completeness; §13 warns specifically
// against rigid automatic rules here without testing.

function Tri({ value, onChange, yesLabel, noLabel }) {
  // Three states, not a checkbox: null = not looked at, true = confirmed,
  // false = looked at and not right. Collapsing null into false would make an
  // untouched listing claim it had been reviewed and rejected.
  const opts = [
    { v: true, label: yesLabel, bg: 'rgba(124,175,138,0.9)', fg: '#fff', idleFg: '#2d6b3c', idleBg: 'rgba(124,175,138,0.12)' },
    { v: false, label: noLabel, bg: 'rgba(201,123,123,0.85)', fg: '#fff', idleFg: '#7a2b2b', idleBg: 'rgba(201,123,123,0.12)' },
  ];
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {opts.map(o => {
        const active = value === o.v;
        return (
          <button key={String(o.v)} type="button"
            onClick={() => onChange(active ? null : o.v)}
            title={active ? 'Click again to clear' : undefined}
            style={{
              fontSize: '0.68rem', padding: '3px 10px', borderRadius: 20, cursor: 'pointer',
              border: 'none', fontWeight: active ? 600 : 400,
              background: active ? o.bg : o.idleBg, color: active ? o.fg : o.idleFg,
            }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export default function SearchSetup({
  etsyCategory, etsyCategoryConfirmed,
  etsyAttributes, etsyAttributesComplete,
  heroImageApproved,
  onChange,          // (patch) => void
}) {
  const attributes = Array.isArray(etsyAttributes) ? etsyAttributes : [];
  const [draftName, setDraftName] = useState('');
  const [draftValue, setDraftValue] = useState('');

  function addAttribute() {
    const name = draftName.trim();
    const value = draftValue.trim();
    if (!name || !value) return;
    onChange({ etsy_attributes: [...attributes, { name, value }] });
    setDraftName('');
    setDraftValue('');
  }

  function removeAttribute(i) {
    onChange({ etsy_attributes: attributes.filter((_, idx) => idx !== i) });
  }

  return (
    <div style={{ marginBottom: 20 }}>
      <div className="section-label" style={{ marginBottom: 4 }}>Search Setup</div>
      <div style={{ fontSize: '0.7rem', color: 'var(--charcoal-soft)', marginBottom: 12, lineHeight: 1.5 }}>
        Etsy matches listings on more than title and tags. None of this blocks publishing &mdash; it&rsquo;s a checklist, not a gate.
      </div>

      {/* ── Category ── */}
      <div className="form-group">
        <label className="form-label">Etsy category</label>
        <input
          value={etsyCategory || ''}
          onChange={e => onChange({ etsy_category: e.target.value })}
          placeholder="Paste the path from Etsy, e.g. Clothing > Women's Clothing > Tops & Tees > T-shirts"
        />
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 6 }}>
          <span style={{ fontSize: '0.68rem', color: 'var(--charcoal-soft)' }}>
            Is this the most specific category that fits?
          </span>
          <Tri
            value={etsyCategoryConfirmed ?? null}
            onChange={v => onChange({ etsy_category_confirmed: v })}
            yesLabel="Yes, most specific"
            noLabel="Not yet"
          />
        </div>
        <div style={{ fontSize: '0.66rem', color: 'var(--charcoal-soft)', marginTop: 4 }}>
          Free text on purpose &mdash; Etsy changes its category tree, and a stale copied-in list would offer
          categories that no longer exist.
        </div>
      </div>

      {/* ── Attributes ── */}
      <div className="form-group">
        <label className="form-label">
          Etsy attributes {attributes.length > 0 && (
            <span style={{ fontWeight: 400, opacity: 0.6 }}>&mdash; {attributes.length} recorded</span>
          )}
        </label>

        {attributes.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
            {attributes.map((a, i) => (
              <div key={`${a.name}-${i}`} style={{
                display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.75rem',
                background: 'var(--charcoal-faint)', borderRadius: 3, padding: '4px 8px',
              }}>
                <span style={{ fontWeight: 600, minWidth: 110 }}>{a.name}</span>
                <span style={{ flex: 1 }}>{a.value}</span>
                <button type="button" onClick={() => removeAttribute(i)}
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--charcoal-soft)', fontSize: '0.85rem', lineHeight: 1 }}>
                  &times;
                </button>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <input
            value={draftName}
            onChange={e => setDraftName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addAttribute()}
            placeholder="Attribute, e.g. Neckline"
            style={{ flex: '1 1 140px', minWidth: 0 }}
          />
          <input
            value={draftValue}
            onChange={e => setDraftValue(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addAttribute()}
            placeholder="Value, e.g. Crew neck"
            style={{ flex: '1 1 140px', minWidth: 0 }}
          />
          <button type="button" className="btn btn-ghost btn-sm"
            onClick={addAttribute} disabled={!draftName.trim() || !draftValue.trim()}>
            Add
          </button>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
          <span style={{ fontSize: '0.68rem', color: 'var(--charcoal-soft)' }}>
            Have you filled every attribute Etsy offers for this category?
          </span>
          <Tri
            value={etsyAttributesComplete ?? null}
            onChange={v => onChange({ etsy_attributes_complete: v })}
            yesLabel="All done"
            noLabel="Not yet"
          />
        </div>
        <div style={{ fontSize: '0.66rem', color: 'var(--charcoal-soft)', marginTop: 4 }}>
          Which attributes exist depends on the category, so TCC can&rsquo;t count them for you.
        </div>
      </div>

      {/* ── Hero image ── */}
      <div className="form-group" style={{ marginBottom: 0 }}>
        <label className="form-label">Hero image</label>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.68rem', color: 'var(--charcoal-soft)' }}>
            Design readable at thumbnail size, product type obvious, colour matches the listing?
          </span>
          <Tri
            value={heroImageApproved ?? null}
            onChange={v => onChange({ hero_image_approved: v })}
            yesLabel="Approved"
            noLabel="Needs work"
          />
        </div>
      </div>
    </div>
  );
}
