import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useProducts, useCollections, autoHotSparksForSignal } from '../lib/hooks';

const PARENT_NICHES = ['Reader Chapter', 'Mom Chapter', 'Kids Chapter'];

const STATUSES = [
  { key: 'pursue',    label: '🟢 Pursue',    color: '#2d6b3c', bg: 'rgba(124,175,138,0.15)' },
  { key: 'watch',     label: '👁 Watch',      color: '#2d4270', bg: 'rgba(107,130,168,0.15)' },
  { key: 'timing',    label: '⚠️ Timing',    color: '#7a4a1e', bg: 'rgba(232,168,124,0.2)' },
  { key: 'saturated', label: '🔴 Saturated', color: '#7a2b2b', bg: 'rgba(201,123,123,0.15)' },
  { key: 'discarded', label: '✗ Discarded',  color: 'var(--charcoal-soft)', bg: 'rgba(43,41,38,0.08)' },
];

const SCORE_DIALS = [
  { key: 'listing_count',       label: 'Listing count trajectory' },
  { key: 'bestseller_density',  label: 'Bestseller density' },
  { key: 'google_trends',       label: 'Google Trends slope' },
  { key: 'demand_floor',        label: 'Demand floor (Everbee)' },
  { key: 'cultural_timing',     label: 'Cultural timing' },
];

function statusStyle(s) {
  return STATUSES.find(st => st.key === s) || STATUSES[1];
}

function useTrendSignals() {
  const [signals, setSignals] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    const { data } = await supabase
      .from('trend_signals')
      .select('*')
      .order('score', { ascending: false });
    if (data) setSignals(data);
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);
  return { signals, loading, refetch: fetch };
}

function ScoreDials({ breakdown, onChange, editable }) {
  const total = SCORE_DIALS.reduce((s, d) => s + (parseInt(breakdown?.[d.key]) || 0), 0);
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <div className="eyebrow">Score Breakdown</div>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem' }}>{total}/25</span>
      </div>
      {SCORE_DIALS.map(d => (
        <div key={d.key} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <label style={{ fontSize: '0.72rem', color: 'var(--charcoal-soft)', flex: 1 }}>{d.label}</label>
          {editable ? (
            <input
              type="number" min={0} max={5}
              value={breakdown?.[d.key] ?? ''}
              onChange={e => onChange({ ...breakdown, [d.key]: parseInt(e.target.value) || 0 })}
              style={{ width: 48, fontSize: '0.8rem', textAlign: 'center' }}
            />
          ) : (
            <span style={{ fontSize: '0.8rem', fontWeight: 500, width: 24, textAlign: 'center' }}>
              {breakdown?.[d.key] ?? '—'}
            </span>
          )}
          <span style={{ fontSize: '0.65rem', color: 'var(--charcoal-soft)' }}>/5</span>
        </div>
      ))}
    </div>
  );
}

function SignalCard({ signal, products, collections, onAction }) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ ...signal });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);

  const st = statusStyle(signal.status);
  const linkedProducts = products.filter(p =>
    form.related_product_ids?.includes(p.id)
  );

  async function handleSave() {
    setSaving(true);
    const totalScore = SCORE_DIALS.reduce((s, d) => s + (parseInt(form.score_breakdown?.[d.key]) || 0), 0);
    await supabase.from('trend_signals').update({
      name: form.name,
      collection: form.collection,
      parent_niche: form.parent_niche || null,
      status: form.status,
      score: totalScore,
      score_breakdown: form.score_breakdown,
      evidence: form.evidence,
      notes: form.notes,
      revisit_date: form.revisit_date || null,
      last_updated: new Date().toISOString().split('T')[0],
      updated_at: new Date().toISOString(),
    }).eq('id', signal.id);
    if (form.status === 'pursue' && signal.status !== 'pursue') {
      await autoHotSparksForSignal(form.collection);
    }
    setSaving(false);
    setEditing(false);
    onAction?.();
  }

  async function handleDelete() {
    await supabase.from('trend_signals').delete().eq('id', signal.id);
    onAction?.();
  }

  if (editing) {
    return (
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="eyebrow" style={{ marginBottom: 12 }}>Edit Signal</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Signal name" style={{ fontSize: '0.9rem' }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <select value={form.parent_niche || ''} onChange={e => setForm(f => ({ ...f, parent_niche: e.target.value || null }))}>
              <option value="">— Main niche —</option>
              {PARENT_NICHES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <select value={form.collection || ''} onChange={e => setForm(f => ({ ...f, collection: e.target.value }))}>
              <option value="">— Collection —</option>
              {collections.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {STATUSES.map(s => (
              <button key={s.key} onClick={() => setForm(f => ({ ...f, status: s.key }))}
                style={{ fontSize: '0.68rem', padding: '3px 10px', borderRadius: 20, cursor: 'pointer', border: '1px solid rgba(43,41,38,0.2)', background: form.status === s.key ? 'var(--dusty-rose)' : 'transparent', color: form.status === s.key ? 'white' : 'var(--charcoal-soft)', fontWeight: form.status === s.key ? 600 : 400 }}>
                {s.label}
              </button>
            ))}
          </div>
          <ScoreDials
            breakdown={form.score_breakdown || {}}
            onChange={sb => setForm(f => ({ ...f, score_breakdown: sb }))}
            editable
          />
          <textarea value={form.evidence || ''} onChange={e => setForm(f => ({ ...f, evidence: e.target.value }))} placeholder="Evidence notes…" rows={3} style={{ fontSize: '0.8rem' }} />
          <textarea value={form.notes || ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Additional notes…" rows={2} style={{ fontSize: '0.8rem' }} />
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" style={{ fontSize: '0.72rem' }}>Revisit date</label>
            <input type="date" value={form.revisit_date || ''} onChange={e => setForm(f => ({ ...f, revisit_date: e.target.value }))} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          <button className="btn btn-ghost btn-sm" onClick={() => { setEditing(false); setForm({ ...signal }); }}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', marginBottom: 4 }}>{signal.name}</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: '0.68rem', fontWeight: 500, padding: '2px 8px', borderRadius: 20, background: st.bg, color: st.color }}>
              {st.label}
            </span>
            <span style={{ fontSize: '0.7rem', color: 'var(--charcoal-soft)' }}>Score: {signal.score}/25</span>
            {signal.parent_niche && (
              <span style={{ fontSize: '0.65rem', padding: '2px 8px', borderRadius: 20, background: 'rgba(43,41,38,0.08)', color: 'var(--charcoal-soft)' }}>
                {signal.parent_niche}
              </span>
            )}
            {signal.collection && (
              <span style={{ fontSize: '0.65rem', padding: '2px 8px', borderRadius: 20, background: 'var(--rose-faint)', color: 'var(--dusty-rose)' }}>
                {signal.collection}
              </span>
            )}
            {signal.revisit_date && (
              <span style={{ fontSize: '0.65rem', color: 'var(--charcoal-soft)' }}>revisit {signal.revisit_date}</span>
            )}
          </div>
        </div>
        <button onClick={() => setExpanded(!expanded)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--charcoal-soft)', fontSize: '0.75rem', flexShrink: 0, marginLeft: 8 }}>
          {expanded ? '▲' : '▼'}
        </button>
      </div>

      {signal.evidence && !expanded && (
        <div style={{ fontSize: '0.75rem', color: 'var(--charcoal-soft)', marginBottom: 10, lineHeight: 1.5 }}>
          {signal.evidence.slice(0, 100)}{signal.evidence.length > 100 ? '…' : ''}
        </div>
      )}

      {expanded && (
        <div style={{ marginTop: 8, borderTop: 'var(--border)', paddingTop: 12 }}>
          {signal.evidence && (
            <div style={{ marginBottom: 12 }}>
              <div className="eyebrow" style={{ marginBottom: 6 }}>Evidence</div>
              <div style={{ fontSize: '0.78rem', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{signal.evidence}</div>
            </div>
          )}
          <div style={{ marginBottom: 12 }}>
            <ScoreDials breakdown={signal.score_breakdown} editable={false} />
          </div>
          {signal.notes && (
            <div style={{ marginBottom: 12 }}>
              <div className="eyebrow" style={{ marginBottom: 6 }}>Notes</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--charcoal-soft)', lineHeight: 1.5 }}>{signal.notes}</div>
            </div>
          )}
          {signal.first_spotted && (
            <div style={{ fontSize: '0.7rem', color: 'var(--charcoal-soft)', marginBottom: 12 }}>
              First spotted: {signal.first_spotted} · Last updated: {signal.last_updated || '—'}
            </div>
          )}
        </div>
      )}

      {confirmDelete ? (
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.78rem', marginTop: 8 }}>
          <span style={{ color: 'var(--charcoal-soft)' }}>Delete this signal?</span>
          <button onClick={handleDelete} style={{ color: 'var(--alert)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer' }}>Yes</button>
          <button onClick={() => setConfirmDelete(false)} style={{ color: 'var(--charcoal-soft)', background: 'none', border: 'none', cursor: 'pointer' }}>Cancel</button>
        </span>
      ) : (
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>Update signal</button>
          <button onClick={() => setConfirmDelete(true)} style={{ marginLeft: 'auto', color: 'var(--charcoal-soft)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem', opacity: 0.5 }}>🗑</button>
        </div>
      )}
    </div>
  );
}

function AddSignalForm({ collections, onSaved, onCancel }) {
  const [form, setForm] = useState({
    name: '', collection: '', parent_niche: '', status: 'watch',
    score_breakdown: {}, evidence: '', notes: '', revisit_date: '',
    first_spotted: new Date().toISOString().split('T')[0],
  });
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!form.name.trim()) return;
    setSaving(true);
    const score = SCORE_DIALS.reduce((s, d) => s + (parseInt(form.score_breakdown?.[d.key]) || 0), 0);
    const now = new Date().toISOString();
    await supabase.from('trend_signals').insert({
      ...form,
      score,
      last_updated: form.first_spotted,
      created_at: now,
      updated_at: now,
    });
    setSaving(false);
    onSaved?.();
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="eyebrow" style={{ marginBottom: 12 }}>Add Trend Signal</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Signal name" style={{ fontSize: '0.9rem' }} autoFocus />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <select value={form.parent_niche} onChange={e => setForm(f => ({ ...f, parent_niche: e.target.value }))}>
            <option value="">— Main niche —</option>
            {PARENT_NICHES.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <select value={form.collection} onChange={e => setForm(f => ({ ...f, collection: e.target.value }))}>
            <option value="">— Collection —</option>
            {collections.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {STATUSES.map(s => (
            <button key={s.key} onClick={() => setForm(f => ({ ...f, status: s.key }))}
              style={{ fontSize: '0.68rem', padding: '3px 10px', borderRadius: 20, cursor: 'pointer', border: '1px solid rgba(43,41,38,0.2)', background: form.status === s.key ? 'var(--dusty-rose)' : 'transparent', color: form.status === s.key ? 'white' : 'var(--charcoal-soft)', fontWeight: form.status === s.key ? 600 : 400 }}>
              {s.label}
            </button>
          ))}
        </div>
        <ScoreDials
          breakdown={form.score_breakdown}
          onChange={sb => setForm(f => ({ ...f, score_breakdown: sb }))}
          editable
        />
        <textarea value={form.evidence} onChange={e => setForm(f => ({ ...f, evidence: e.target.value }))} placeholder="Evidence — bullet points, sources, data…" rows={3} style={{ fontSize: '0.8rem' }} />
        <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Notes…" rows={2} style={{ fontSize: '0.8rem' }} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" style={{ fontSize: '0.72rem' }}>First spotted</label>
            <input type="date" value={form.first_spotted} onChange={e => setForm(f => ({ ...f, first_spotted: e.target.value }))} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" style={{ fontSize: '0.72rem' }}>Revisit date</label>
            <input type="date" value={form.revisit_date} onChange={e => setForm(f => ({ ...f, revisit_date: e.target.value }))} />
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving || !form.name.trim()}>
          {saving ? 'Saving…' : 'Save Signal →'}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

export default function Trends() {
  const { signals, loading, refetch } = useTrendSignals();
  const { products } = useProducts();
  const { collections } = useCollections();
  const [adding, setAdding] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [nicheFilter, setNicheFilter] = useState('');
  const [importText, setImportText] = useState('');
  const [showImport, setShowImport] = useState(false);

  const filtered = signals.filter(s =>
    (!statusFilter || s.status === statusFilter) &&
    (!nicheFilter || s.parent_niche === nicheFilter)
  );

  const grouped = {
    pursue: filtered.filter(s => s.status === 'pursue'),
    watch: filtered.filter(s => s.status === 'watch'),
    timing: filtered.filter(s => s.status === 'timing'),
    saturated: filtered.filter(s => s.status === 'saturated'),
    discarded: filtered.filter(s => s.status === 'discarded'),
  };

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div className="page-title">Trend Radar</div>
          <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>+ Signal</button>
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
          <button className={`btn btn-sm ${!statusFilter ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setStatusFilter('')}>
            All ({signals.length})
          </button>
          {STATUSES.map(s => {
            const count = signals.filter(sig => sig.status === s.key).length;
            if (!count) return null;
            return (
              <button key={s.key} className={`btn btn-sm ${statusFilter === s.key ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setStatusFilter(statusFilter === s.key ? '' : s.key)}>
                {s.label} ({count})
              </button>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          <button className={`btn btn-sm ${!nicheFilter ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setNicheFilter('')} style={{ fontSize: '0.68rem' }}>
            All niches
          </button>
          {PARENT_NICHES.map(p => {
            const count = signals.filter(s => s.parent_niche === p).length;
            if (!count) return null;
            return (
              <button key={p} className={`btn btn-sm ${nicheFilter === p ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setNicheFilter(nicheFilter === p ? '' : p)} style={{ fontSize: '0.68rem' }}>
                {p} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {adding && (
        <AddSignalForm
          collections={collections}
          onSaved={() => { setAdding(false); refetch(); }}
          onCancel={() => setAdding(false)}
        />
      )}

      {loading && <div style={{ color: 'var(--charcoal-soft)', fontSize: '0.85rem' }}>Loading…</div>}

      {!loading && signals.length === 0 && (
        <div className="empty-state">
          <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>📡</div>
          <p>No trend signals yet. Add your first signal to start tracking market direction.</p>
        </div>
      )}

      {['pursue', 'watch', 'timing', 'saturated', 'discarded'].map(key => {
        const items = grouped[key];
        if (!items.length) return null;
        const st = statusStyle(key);
        return (
          <div key={key} style={{ marginBottom: 24 }}>
            <div className="section-label" style={{ marginBottom: 10 }}>{st.label}</div>
            {items.map(s => (
              <SignalCard key={s.id} signal={s} products={products} collections={collections} onAction={refetch} />
            ))}
          </div>
        );
      })}

      {/* Cowork Import */}
      <div style={{ marginTop: 32, paddingTop: 20, borderTop: 'var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div className="section-label" style={{ margin: 0 }}>Import from Cowork</div>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowImport(!showImport)}>
            {showImport ? 'Hide' : 'Paste import'}
          </button>
        </div>
        {showImport && (
          <div>
            <div style={{ fontSize: '0.78rem', color: 'var(--charcoal-soft)', marginBottom: 10, lineHeight: 1.6 }}>
              Paste your Cowork trend radar output below. Signal updates will be shown for approval before applying.
            </div>
            <textarea
              value={importText}
              onChange={e => setImportText(e.target.value)}
              placeholder="Paste Cowork trend radar output here…"
              rows={8}
              style={{ marginBottom: 10, fontSize: '0.78rem' }}
            />
            <div style={{ fontSize: '0.75rem', color: 'var(--charcoal-soft)' }}>
              Cowork import parsing coming in a future update. Add signals manually above for now.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
