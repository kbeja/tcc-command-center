import { useState } from 'react';
import { buildProductTruth } from './generation';
import { computeDiscussionPermissions } from '../../lib/productTruth';
import { DESC_META } from './constants';
import { CopyButton } from './shared';

// One accordion row per DESC_META section. Starts open when it already has
// content (the common case right after generating — she needs to see it),
// collapsed with an "empty" marker when blank (still expandable to write
// into, never hidden — an empty but *permitted* section must stay
// authorable).
function DescriptionRow({ fieldKey, meta, value, onChange }) {
  const [open, setOpen] = useState(!!value);
  return (
    <div style={{ marginBottom: 10, border: '1px solid rgba(43,41,38,0.08)', borderRadius: 4, padding: '10px 12px' }}>
      <button type="button" onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
        <span style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--charcoal-soft)' }}>
          {meta.label}
          {!value && <span style={{ fontWeight: 400, textTransform: 'none', opacity: 0.6, marginLeft: 8 }}>— empty</span>}
        </span>
        <span style={{ fontSize: '0.65rem', color: 'var(--charcoal-soft)', opacity: 0.5 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ marginTop: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontSize: '0.68rem', color: 'var(--charcoal-soft)', opacity: 0.7 }}>{meta.hint}</span>
            <CopyButton text={value || ''} />
          </div>
          <textarea
            value={value || ''}
            onChange={e => onChange(e.target.value)}
            rows={fieldKey === 'opener' ? 3 : 2}
            style={{ width: '100%', fontSize: '0.85rem', lineHeight: 1.6 }}
          />
        </div>
      )}
    </div>
  );
}

// Zone 3 — Description tab (Milestone B). The one real, confirmed
// permission mapping: generate-listing-v2.js's own comment states shipping
// content is emptied when forbidden, so when Product Truth currently has no
// shipping_policy set, the row is omitted entirely rather than shown empty
// — a quiet one-line explanation instead. Every other section always stays
// authorable, blank or not; no other confirmed permission-to-section
// mapping exists, so nothing else is filtered.
//
// Filtering is display-only: editDesc keeps whatever value it already has
// for every key, including shipping. handleSaveEdits still writes the full
// object unchanged — this component never deletes a key to implement the
// omission.
export default function Zone3Description({ form, editDesc, onChange }) {
  const permissions = computeDiscussionPermissions(buildProductTruth(form));

  return (
    <div>
      {Object.entries(DESC_META).map(([key, meta]) => {
        if (key === 'shipping' && !permissions.shipping) {
          return (
            <div key={key} style={{ fontSize: '0.72rem', color: 'var(--charcoal-soft)', opacity: 0.7, marginBottom: 10 }}>
              Shipping section omitted — no shipping policy confirmed in Product Truth yet.
            </div>
          );
        }
        return (
          <DescriptionRow
            key={key}
            fieldKey={key}
            meta={meta}
            value={editDesc[key]}
            onChange={v => onChange(key, v)}
          />
        );
      })}
      <div style={{ marginTop: 6 }}>
        <CopyButton text={Object.entries(DESC_META).map(([k, m]) => `${m.label.toUpperCase()}\n${editDesc[k] || ''}`).join('\n\n')} />
        <span style={{ fontSize: '0.72rem', color: 'var(--charcoal-soft)', marginLeft: 8 }}>Copy all sections</span>
      </div>
    </div>
  );
}
