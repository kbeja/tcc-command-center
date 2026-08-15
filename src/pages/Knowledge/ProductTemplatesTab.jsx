import { useState } from 'react';
import {
  useProductTemplates, createProductTemplate, updateProductTemplate,
  archiveProductTemplate, markProductTemplateVerified,
} from '../../lib/hooks';
import { PRODUCT_FORMATS, BLANK_BRANDS } from '../../lib/productTruth';
import { TEMPLATE_OWNED_FIELDS, TEMPLATE_VERIFY_DUE_DAYS } from '../../lib/productTemplates';

const FIELD_LABELS = {
  blank_brand: 'Blank / Brand', blank_model: 'Blank / Model', material: 'Material',
  size_range: 'Size Range', available_colors: 'Available Colors',
  production_time: 'Production Time', fulfillment_provider: 'Fulfillment Provider',
};

const BLANK_FORM = {
  name: '', product_format: '', blank_brand: '', blank_model: '',
  material: '', size_range: '', available_colors: '', production_time: '', fulfillment_provider: '',
  verification_note: '', source_url: '',
};

function toFields(form) {
  return {
    name: form.name.trim(),
    product_format: form.product_format,
    blank_brand: form.blank_brand || null,
    blank_model: form.blank_model || null,
    material: form.material || null,
    size_range: form.size_range || null,
    available_colors: form.available_colors ? form.available_colors.split(',').map(s => s.trim()).filter(Boolean) : null,
    production_time: form.production_time || null,
    fulfillment_provider: form.fulfillment_provider || null,
    verification_note: form.verification_note || null,
    source_url: form.source_url || null,
  };
}

function toEditForm(t) {
  return {
    name: t.name, product_format: t.product_format, blank_brand: t.blank_brand || '', blank_model: t.blank_model || '',
    material: t.material || '', size_range: t.size_range || '',
    available_colors: (t.available_colors || []).join(', '),
    production_time: t.production_time || '', fulfillment_provider: t.fulfillment_provider || '',
    verification_note: t.verification_note || '', source_url: t.source_url || '',
  };
}

// >1 active template sharing the same (format, brand, model) identity —
// not blocked (see productTemplates.js's own header on why no unique
// constraint exists), just surfaced so it's never silently ambiguous which
// one "Apply verified product template" in Listing Builder will offer first.
function findDuplicateIds(activeTemplates) {
  const seen = new Map();
  const duplicates = new Set();
  for (const t of activeTemplates) {
    const key = `${t.product_format}|${t.blank_brand || ''}|${t.blank_model || ''}`;
    if (seen.has(key)) { duplicates.add(t.id); duplicates.add(seen.get(key)); }
    else seen.set(key, t.id);
  }
  return duplicates;
}

function TemplateForm({ form, setForm, onSave, onCancel, saving, saveLabel }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <input
        autoFocus
        placeholder="Name — e.g. Comfort Colors 1717 — T-Shirt"
        value={form.name}
        onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
        style={{ fontSize: '0.9rem', fontWeight: 500 }}
      />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div>
          <label className="form-label">Format</label>
          <select value={form.product_format} onChange={e => setForm(f => ({ ...f, product_format: e.target.value }))}>
            <option value="">— Unset —</option>
            {PRODUCT_FORMATS.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">Blank / Brand <span style={{ fontWeight: 400, opacity: 0.6 }}>(optional)</span></label>
          <select value={form.blank_brand} onChange={e => setForm(f => ({ ...f, blank_brand: e.target.value }))}>
            <option value="">— Unset —</option>
            {BLANK_BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
      </div>
      <div className="form-group" style={{ margin: 0 }}>
        <label className="form-label">Blank / Model <span style={{ fontWeight: 400, opacity: 0.6 }}>(optional)</span></label>
        <input value={form.blank_model} onChange={e => setForm(f => ({ ...f, blank_model: e.target.value }))} placeholder="e.g. Comfort Colors 1717" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Material</label>
          <input value={form.material} onChange={e => setForm(f => ({ ...f, material: e.target.value }))} placeholder="e.g. 100% ring-spun cotton" />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Size Range</label>
          <input value={form.size_range} onChange={e => setForm(f => ({ ...f, size_range: e.target.value }))} placeholder="e.g. S–3XL" />
        </div>
      </div>
      <div className="form-group" style={{ margin: 0 }}>
        <label className="form-label">Available Colors <span style={{ fontWeight: 400, opacity: 0.6 }}>(comma-separated)</span></label>
        <input value={form.available_colors} onChange={e => setForm(f => ({ ...f, available_colors: e.target.value }))} placeholder="e.g. Black, White, Pepper" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Production Time</label>
          <input value={form.production_time} onChange={e => setForm(f => ({ ...f, production_time: e.target.value }))} placeholder="e.g. 2–3 business days" />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Fulfillment Provider</label>
          <input value={form.fulfillment_provider} onChange={e => setForm(f => ({ ...f, fulfillment_provider: e.target.value }))} placeholder="e.g. Printify" />
        </div>
      </div>
      <div className="form-group" style={{ margin: 0 }}>
        <label className="form-label">Verification Note / Source <span style={{ fontWeight: 400, opacity: 0.6 }}>(optional)</span></label>
        <input value={form.verification_note} onChange={e => setForm(f => ({ ...f, verification_note: e.target.value }))} placeholder="e.g. Confirmed against Printify product page, Aug 2026" />
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
        <button className="btn btn-primary btn-sm" onClick={onSave} disabled={saving || !form.name.trim() || !form.product_format}>
          {saving ? 'Saving…' : saveLabel}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

export default function ProductTemplatesTab() {
  const [showArchived, setShowArchived] = useState(false);
  const { templates, loading, refetch } = useProductTemplates(showArchived ? 'all' : 'active');
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ ...BLANK_FORM });
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState({});
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [verifiedId, setVerifiedId] = useState(null);

  const duplicateIds = findDuplicateIds(templates.filter(t => t.status === 'active'));

  async function handleAdd() {
    setSaving(true);
    await createProductTemplate(toFields(form));
    setForm({ ...BLANK_FORM });
    setAdding(false);
    setSaving(false);
    refetch();
  }

  async function handleSaveEdit(id) {
    setSaving(true);
    await updateProductTemplate(id, toFields(editForm));
    setEditingId(null);
    setSaving(false);
    refetch();
  }

  async function handleMarkVerified(t) {
    await markProductTemplateVerified(t.id, t.verification_note);
    setVerifiedId(t.id);
    setTimeout(() => setVerifiedId(null), 2000);
    refetch();
  }

  async function handleArchive(id) {
    await archiveProductTemplate(id);
    refetch();
  }

  return (
    <div>
      <div style={{ fontSize: '0.78rem', color: 'var(--charcoal-soft)', marginBottom: 14, lineHeight: 1.5 }}>
        Verified reusable blank/brand facts — Listing Builder offers to apply a matching template when a product's
        Format/Blank Brand/Blank Model identify one, filling only the fields it owns and never overwriting a
        conflicting product-specific value.
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        {!adding && (
          <button className="btn btn-ghost btn-sm" onClick={() => setAdding(true)}>+ New Template</button>
        )}
        <button
          onClick={() => setShowArchived(s => !s)}
          style={{ fontSize: '0.72rem', color: 'var(--charcoal-soft)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
        >
          {showArchived ? 'Hide archived' : 'Show archived'}
        </button>
      </div>

      {adding && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="section-label" style={{ marginBottom: 12 }}>New Template</div>
          <TemplateForm form={form} setForm={setForm} onSave={handleAdd} onCancel={() => { setAdding(false); setForm({ ...BLANK_FORM }); }} saving={saving} saveLabel="Create Template →" />
        </div>
      )}

      {loading && <div style={{ color: 'var(--charcoal-soft)', fontSize: '0.85rem' }}>Loading…</div>}
      {!loading && templates.length === 0 && <div className="empty-state"><p>No templates yet.</p></div>}

      {templates.map(t => {
        const isOpen = !!expanded[t.id];
        const isEditing = editingId === t.id;
        const isArchived = t.status === 'archived';
        const days = t.last_verified ? Math.floor((Date.now() - new Date(t.last_verified).getTime()) / 86400000) : null;
        const isDue = days === null || days >= TEMPLATE_VERIFY_DUE_DAYS;

        return (
          <div key={t.id} className="card" style={{ marginBottom: 10, opacity: isArchived ? 0.6 : 1 }}>
            <button
              onClick={() => setExpanded(prev => ({ ...prev, [t.id]: !prev[t.id] }))}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.95rem', marginBottom: 4 }}>
                  {t.name}
                  {isArchived && <span style={{ fontSize: '0.65rem', color: 'var(--charcoal-soft)', marginLeft: 8, fontWeight: 400 }}>archived</span>}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--charcoal-soft)' }}>
                  {t.product_format}{t.blank_brand ? ` · ${t.blank_brand}` : ''}{t.blank_model ? ` · ${t.blank_model}` : ''}
                  {' · '}
                  <span style={{ color: isDue ? '#7a4a1e' : 'inherit' }}>
                    {t.last_verified ? `verified ${days}d ago` : 'never verified'}
                  </span>
                  {duplicateIds.has(t.id) && <span style={{ color: '#7a4a1e' }}> · ⚠ shares identity with another active template</span>}
                </div>
              </div>
              <span style={{ fontSize: '0.65rem', color: 'var(--charcoal-soft)', marginLeft: 8, flexShrink: 0 }}>{isOpen ? '▲' : '▼'}</span>
            </button>

            {isOpen && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(43,41,38,0.08)' }}>
                {isEditing ? (
                  <TemplateForm form={editForm} setForm={setEditForm} onSave={() => handleSaveEdit(t.id)} onCancel={() => setEditingId(null)} saving={saving} saveLabel="Save Changes" />
                ) : (
                  <>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
                      {TEMPLATE_OWNED_FIELDS.filter(f => t[f] != null && !(Array.isArray(t[f]) && t[f].length === 0)).map(f => (
                        <div key={f} style={{ fontSize: '0.78rem' }}>
                          <span style={{ color: 'var(--charcoal-soft)' }}>{FIELD_LABELS[f]}: </span>
                          <span>{Array.isArray(t[f]) ? t[f].join(', ') : t[f]}</span>
                        </div>
                      ))}
                      {t.verification_note && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--charcoal-soft)', fontStyle: 'italic', marginTop: 4 }}>"{t.verification_note}"</div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => { setEditingId(t.id); setEditForm(toEditForm(t)); }}>Edit</button>
                      {verifiedId === t.id ? (
                        <span className="inline-confirm">✓ Marked verified</span>
                      ) : (
                        <button className="btn btn-ghost btn-sm" onClick={() => handleMarkVerified(t)}>✓ Mark verified</button>
                      )}
                      {!isArchived && (
                        <button className="btn btn-ghost btn-sm" onClick={() => handleArchive(t.id)} style={{ color: 'var(--charcoal-soft)' }}>Archive</button>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
