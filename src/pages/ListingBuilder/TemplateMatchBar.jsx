import { useState, useEffect } from 'react';
import { matchTemplates, diffTemplate, buildApplyPayload, TEMPLATE_VERIFY_DUE_DAYS } from '../../lib/productTemplates';

const FIELD_LABELS = {
  blank_brand: 'Blank / Brand', blank_model: 'Blank / Model', material: 'Material',
  size_range: 'Size Range', available_colors: 'Available Colors',
  production_time: 'Production Time', fulfillment_provider: 'Fulfillment Provider',
};

function formatValue(v) {
  return Array.isArray(v) ? (v.join(', ') || '—') : (v ?? '—');
}

function DiffTable({ rows, checked, setChecked }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, margin: '10px 0' }}>
      {rows.map(row => (
        <label
          key={row.field}
          style={{
            display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', fontSize: '0.76rem',
            padding: '6px 8px', borderRadius: 4,
            background: row.state === 'differs' ? 'rgba(180,120,40,0.08)' : 'rgba(124,175,138,0.08)',
          }}
        >
          <input
            type="checkbox"
            checked={!!checked[row.field]}
            onChange={e => setChecked(prev => ({ ...prev, [row.field]: e.target.checked }))}
            style={{ width: 'auto', margin: '2px 0 0', flexShrink: 0 }}
          />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600 }}>
              {FIELD_LABELS[row.field] || row.field}
              {row.state === 'differs' && <span style={{ color: '#7a4a1e', fontWeight: 400 }}> ⚠ differs from your value</span>}
            </div>
            {row.state === 'differs' ? (
              <div style={{ color: 'var(--charcoal-soft)' }}>Yours: {formatValue(row.productValue)} → Template: {formatValue(row.templateValue)}</div>
            ) : (
              <div style={{ color: 'var(--charcoal-soft)' }}>{formatValue(row.templateValue)}</div>
            )}
          </div>
        </label>
      ))}
    </div>
  );
}

// An already-applied template (form.productTemplateId set) whose owned
// fields no longer all agree with the product's current values — a quiet
// flag, never an auto-correction. Only rendered when there's something to
// flag; disappears the moment every owned field agrees again.
function DriftFlag({ productTruth, template, setField }) {
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState({});
  const rows = diffTemplate(productTruth, template).filter(r => r.state === 'differs');

  useEffect(() => { setChecked({}); }, [template.id]);

  if (rows.length === 0) return null;

  function handleSync() {
    const selected = rows.filter(r => checked[r.field]).map(r => r.field);
    const payload = buildApplyPayload(template, selected);
    Object.entries(payload).forEach(([k, v]) => setField(k, v));
    setOpen(false);
  }

  return (
    <div style={{
      fontSize: '0.76rem', padding: '8px 10px', borderRadius: 4, marginBottom: 10,
      background: 'rgba(180,120,40,0.08)', border: '1px solid rgba(180,120,40,0.2)',
    }}>
      <button
        type="button" onClick={() => setOpen(o => !o)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, width: '100%', textAlign: 'left', color: '#7a4a1e', fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}
      >
        <span>⚠ {rows.length} field{rows.length !== 1 ? 's' : ''} differ{rows.length === 1 ? 's' : ''} from the applied template "{template.name}"</span>
        <span>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <>
          <DiffTable rows={rows} checked={checked} setChecked={setChecked} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={handleSync} disabled={!Object.values(checked).some(Boolean)}>
              Sync checked fields →
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>Dismiss</button>
          </div>
        </>
      )}
    </div>
  );
}

// A verified template whose format/brand/model agree with (or are less
// specific than) the product's own — never conflict with it, see
// matchTemplates()'s own header. Collapsed by default; expanding shows a
// diff-and-pick table (fill rows pre-checked, differs rows pre-unchecked)
// rather than a one-click "use this" — the non-destructive guarantee is the
// checkbox default, not a warning someone can click past.
function MatchSuggestion({ productTruth, matches, setField }) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const match = matches[Math.min(index, matches.length - 1)];
  const template = match.template;
  const actionableRows = diffTemplate(productTruth, template).filter(r => r.state !== 'same');
  const [checked, setChecked] = useState(() => Object.fromEntries(actionableRows.map(r => [r.field, r.state === 'fill'])));

  useEffect(() => {
    setChecked(Object.fromEntries(diffTemplate(productTruth, template).filter(r => r.state !== 'same').map(r => [r.field, r.state === 'fill'])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template.id]);

  const days = template.last_verified ? Math.floor((Date.now() - new Date(template.last_verified).getTime()) / 86400000) : null;
  const isDue = days === null || days >= TEMPLATE_VERIFY_DUE_DAYS;

  function handleApply() {
    const selected = actionableRows.filter(r => checked[r.field]).map(r => r.field);
    const payload = buildApplyPayload(template, selected);
    Object.entries(payload).forEach(([k, v]) => setField(k, v));
    setField('productTemplateId', template.id);
    setOpen(false);
  }

  return (
    <div style={{
      fontSize: '0.76rem', padding: '8px 10px', borderRadius: 4, marginBottom: 10,
      background: 'rgba(124,175,138,0.08)', border: '1px solid rgba(124,175,138,0.25)',
    }}>
      <button
        type="button" onClick={() => setOpen(o => !o)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, width: '100%', textAlign: 'left', color: '#2d6b3c', fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}
      >
        <span>✨ Matches verified template "{template.name}"{isDue ? ' — verification due' : ''}</span>
        <span>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <>
          {matches.length > 1 && (
            <select value={index} onChange={e => setIndex(Number(e.target.value))} style={{ fontSize: '0.72rem', marginTop: 8 }}>
              {matches.map((m, i) => <option key={m.template.id} value={i}>{m.template.name}</option>)}
            </select>
          )}
          {actionableRows.length > 0 ? (
            <DiffTable rows={actionableRows} checked={checked} setChecked={setChecked} />
          ) : (
            <div style={{ color: 'var(--charcoal-soft)', margin: '10px 0' }}>Every field this template owns already matches your product.</div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-primary btn-sm" onClick={handleApply}>
              {actionableRows.length > 0 ? 'Apply selected →' : 'Link to this template →'}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>Dismiss</button>
          </div>
        </>
      )}
    </div>
  );
}

// Zone 1's link to the Product Template Library (Milestone C1). Nothing
// renders when there's no match and no drift — Zone 1 stays exactly as
// calm as Milestone B left it until a real verified template is relevant.
// Applying writes only into `form` via the existing setField, never to the
// database directly — the existing draft autosave and both existing save
// paths pick it up for free, zero new write path. See
// src/lib/productTemplates.js's header for the matching/diff rules.
export default function TemplateMatchBar({ productTruth, appliedTemplateId, setField, templates }) {
  const appliedTemplate = appliedTemplateId ? (templates || []).find(t => t.id === appliedTemplateId) : null;

  if (appliedTemplate) {
    return <DriftFlag productTruth={productTruth} template={appliedTemplate} setField={setField} />;
  }

  const matches = matchTemplates(productTruth, templates || []);
  if (matches.length === 0) return null;
  return <MatchSuggestion productTruth={productTruth} matches={matches} setField={setField} />;
}
