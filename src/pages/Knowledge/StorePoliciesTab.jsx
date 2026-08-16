import { useState, useMemo } from 'react';
import {
  useStorePolicies, createStorePolicy, updateStorePolicy,
  archiveStorePolicy, markStorePolicyVerified, useProducts, useAllListingGenerations,
} from '../../lib/hooks';
import { POLICY_TYPES, POLICY_VERIFY_DUE_DAYS, isPolicyGenerationEligible } from '../../lib/storePolicies';
import { computePolicyUsage } from '../../lib/portfolioAnalysis';

const POLICY_TYPE_LABELS = {
  shipping: 'Shipping', international_shipping: 'International Shipping',
  production_time: 'Production Time', returns_exchanges: 'Returns / Exchanges',
  personalization: 'Personalization', gift_wrap: 'Gift Wrap', care_instructions: 'Care Instructions',
};

const BLANK_FORM = { policy_type: '', title: '', approved_text: '', verification_note: '', source_url: '' };

function toFields(form) {
  return {
    policy_type: form.policy_type,
    title: form.title.trim() || null,
    approved_text: form.approved_text.trim(),
    verification_note: form.verification_note || null,
    source_url: form.source_url || null,
  };
}

function PolicyForm({ form, setForm, onSave, onCancel, saving, saveLabel }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div>
        <label className="form-label">Policy Type</label>
        <select value={form.policy_type} onChange={e => setForm(f => ({ ...f, policy_type: e.target.value }))}>
          <option value="">— Unset —</option>
          {POLICY_TYPES.map(t => <option key={t} value={t}>{POLICY_TYPE_LABELS[t]}</option>)}
        </select>
      </div>
      {form.policy_type && !isPolicyGenerationEligible(form.policy_type) && (
        <div style={{ fontSize: '0.72rem', color: 'var(--charcoal-soft)', opacity: 0.8 }}>
          Reference only — not yet wired into generation. Shown to you here, but Listing Builder won't use this text
          to fill a listing until a future milestone adds the matching permission topic and output section.
        </div>
      )}
      <div className="form-group" style={{ margin: 0 }}>
        <label className="form-label">Title <span style={{ fontWeight: 400, opacity: 0.6 }}>(optional)</span></label>
        <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Standard US Shipping" />
      </div>
      <div className="form-group" style={{ margin: 0 }}>
        <label className="form-label">Approved Text</label>
        <textarea
          value={form.approved_text}
          onChange={e => setForm(f => ({ ...f, approved_text: e.target.value }))}
          rows={3}
          placeholder="The exact, approved wording — this is what generation may draw from, never invented text."
          style={{ width: '100%', fontFamily: 'var(--font-body)', fontSize: '0.82rem' }}
        />
      </div>
      <div className="form-group" style={{ margin: 0 }}>
        <label className="form-label">Verification Note / Source <span style={{ fontWeight: 400, opacity: 0.6 }}>(optional)</span></label>
        <input value={form.verification_note} onChange={e => setForm(f => ({ ...f, verification_note: e.target.value }))} placeholder="e.g. Confirmed against Etsy Shop Manager shipping settings, Aug 2026" />
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
        <button className="btn btn-primary btn-sm" onClick={onSave} disabled={saving || !form.policy_type || !form.approved_text.trim()}>
          {saving ? 'Saving…' : saveLabel}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function findDuplicateTypeIds(activePolicies) {
  const seen = new Map();
  const duplicates = new Set();
  for (const p of activePolicies) {
    if (seen.has(p.policy_type)) { duplicates.add(p.id); duplicates.add(seen.get(p.policy_type)); }
    else seen.set(p.policy_type, p.id);
  }
  return duplicates;
}

export default function StorePoliciesTab() {
  const [showArchived, setShowArchived] = useState(false);
  const { policies, loading, refetch } = useStorePolicies(showArchived ? 'all' : 'active');
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ ...BLANK_FORM });
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState({});
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [verifiedId, setVerifiedId] = useState(null);
  const { products } = useProducts();
  const { generations } = useAllListingGenerations();

  const duplicateIds = findDuplicateTypeIds(policies.filter(p => p.status === 'active'));

  // Milestone C4 reverse lookup — same computePolicyUsage() the Portfolio
  // page's own Policy Usage dimension calls. Policy usage is per-generation
  // (product_truth_sources on each product's latest listing_generations
  // row), not a direct FK, so this needs both products and generations,
  // unlike the template lookup's simpler direct-FK version.
  const usageByPolicyId = useMemo(() => {
    const usage = computePolicyUsage(products, generations, policies);
    const map = new Map();
    for (const u of usage) if (u.policy) map.set(u.policy.id, u.products);
    return map;
  }, [products, generations, policies]);

  async function handleAdd() {
    setSaving(true);
    await createStorePolicy(toFields(form));
    setForm({ ...BLANK_FORM });
    setAdding(false);
    setSaving(false);
    refetch();
  }

  async function handleSaveEdit(id) {
    setSaving(true);
    await updateStorePolicy(id, toFields(editForm));
    setEditingId(null);
    setSaving(false);
    refetch();
  }

  async function handleMarkVerified(p) {
    await markStorePolicyVerified(p.id, p.verification_note);
    setVerifiedId(p.id);
    setTimeout(() => setVerifiedId(null), 2000);
    refetch();
  }

  async function handleArchive(id) {
    await archiveStorePolicy(id);
    refetch();
  }

  return (
    <div>
      <div style={{ fontSize: '0.78rem', color: 'var(--charcoal-soft)', marginBottom: 14, lineHeight: 1.5 }}>
        Approved store-level facts — centralized so they're never invented per listing. Only Shipping,
        International Shipping, and Production Time currently reach generation (filling a gap only when the
        product itself leaves that field unset); the rest are stored and manageable here for reference.
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        {!adding && (
          <button className="btn btn-ghost btn-sm" onClick={() => setAdding(true)}>+ New Policy</button>
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
          <div className="section-label" style={{ marginBottom: 12 }}>New Policy</div>
          <PolicyForm form={form} setForm={setForm} onSave={handleAdd} onCancel={() => { setAdding(false); setForm({ ...BLANK_FORM }); }} saving={saving} saveLabel="Create Policy →" />
        </div>
      )}

      {loading && <div style={{ color: 'var(--charcoal-soft)', fontSize: '0.85rem' }}>Loading…</div>}
      {!loading && policies.length === 0 && <div className="empty-state"><p>No policies yet.</p></div>}

      {policies.map(p => {
        const isOpen = !!expanded[p.id];
        const isEditing = editingId === p.id;
        const isArchived = p.status === 'archived';
        const days = p.last_verified ? Math.floor((Date.now() - new Date(p.last_verified).getTime()) / 86400000) : null;
        const isDue = days === null || days >= POLICY_VERIFY_DUE_DAYS;
        const eligible = isPolicyGenerationEligible(p.policy_type);

        return (
          <div key={p.id} className="card" style={{ marginBottom: 10, opacity: isArchived ? 0.6 : 1 }}>
            <button
              onClick={() => setExpanded(prev => ({ ...prev, [p.id]: !prev[p.id] }))}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.95rem', marginBottom: 4 }}>
                  {p.title || POLICY_TYPE_LABELS[p.policy_type] || p.policy_type}
                  {isArchived && <span style={{ fontSize: '0.65rem', color: 'var(--charcoal-soft)', marginLeft: 8, fontWeight: 400 }}>archived</span>}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--charcoal-soft)' }}>
                  {POLICY_TYPE_LABELS[p.policy_type] || p.policy_type}
                  {' · '}
                  <span style={{
                    fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', padding: '1px 6px', borderRadius: 10,
                    background: eligible ? 'rgba(124,175,138,0.18)' : 'rgba(43,41,38,0.08)',
                    color: eligible ? '#2d6b3c' : 'var(--charcoal-soft)',
                  }}>
                    {eligible ? 'used in generation' : 'reference only'}
                  </span>
                  {' · '}
                  <span style={{ color: isDue ? '#7a4a1e' : 'inherit' }}>
                    {p.last_verified ? `verified ${days}d ago` : 'never verified'}
                  </span>
                  {duplicateIds.has(p.id) && <span style={{ color: '#7a4a1e' }}> · ⚠ another active policy shares this type</span>}
                </div>
              </div>
              <span style={{ fontSize: '0.65rem', color: 'var(--charcoal-soft)', marginLeft: 8, flexShrink: 0 }}>{isOpen ? '▲' : '▼'}</span>
            </button>

            {isOpen && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(43,41,38,0.08)' }}>
                {isEditing ? (
                  <PolicyForm
                    form={editForm} setForm={setEditForm} onSave={() => handleSaveEdit(p.id)}
                    onCancel={() => setEditingId(null)} saving={saving} saveLabel="Save Changes"
                  />
                ) : (
                  <>
                    <div style={{ fontSize: '0.82rem', whiteSpace: 'pre-wrap', marginBottom: 10 }}>{p.approved_text}</div>
                    {p.verification_note && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--charcoal-soft)', fontStyle: 'italic', marginBottom: 10 }}>"{p.verification_note}"</div>
                    )}
                    <div style={{ fontSize: '0.75rem', color: 'var(--charcoal-soft)', marginBottom: 12 }}>
                      {(() => {
                        const usedBy = usageByPolicyId.get(p.id) || [];
                        return usedBy.length
                          ? `Used by ${usedBy.length} product${usedBy.length === 1 ? '' : 's'}: ${usedBy.map(pr => pr.name).join(', ')}`
                          : 'Not currently used by any products';
                      })()}
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => {
                          setEditingId(p.id);
                          setEditForm({ policy_type: p.policy_type, title: p.title || '', approved_text: p.approved_text, verification_note: p.verification_note || '', source_url: p.source_url || '' });
                        }}
                      >
                        Edit
                      </button>
                      {verifiedId === p.id ? (
                        <span className="inline-confirm">✓ Marked verified</span>
                      ) : (
                        <button className="btn btn-ghost btn-sm" onClick={() => handleMarkVerified(p)}>✓ Mark verified</button>
                      )}
                      {!isArchived && (
                        <button className="btn btn-ghost btn-sm" onClick={() => handleArchive(p.id)} style={{ color: 'var(--charcoal-soft)' }}>Archive</button>
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
