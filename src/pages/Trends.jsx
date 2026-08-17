import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useProducts, useCollections, autoHotSparksForSignal, useChapters, useTrendSignals, createTrendSignal, updateTrendSignal } from '../lib/hooks';
import ConfidenceSelector from '../components/ConfidenceSelector';
import ConfirmButton from '../components/ConfirmButton';
import { nowISO } from '../lib/utils';

const STATUSES = [
  { key: 'pursue',    label: '🟢 Pursue',    color: '#2d6b3c', bg: 'rgba(124,175,138,0.15)' },
  { key: 'watch',     label: '👁 Watch',      color: '#2d4270', bg: 'rgba(107,130,168,0.15)' },
  { key: 'timing',    label: '⚠️ Timing',    color: '#7a4a1e', bg: 'rgba(232,168,124,0.2)' },
  { key: 'saturated', label: '🔴 Saturated', color: '#7a2b2b', bg: 'rgba(201,123,123,0.15)' },
  { key: 'discarded', label: '✗ Discarded',  color: 'var(--charcoal-soft)', bg: 'rgba(43,41,38,0.08)' },
];

const SCORE_DIALS = [
  { key: 'listing_count',       label: 'Listing count trajectory', rubric: '0=declining · 1-2=flat · 3=+10% MoM · 4=+25% MoM · 5=explosive growth' },
  { key: 'bestseller_density',  label: 'Bestseller density',       rubric: '0=none · 1=1-2 BSellers · 2=3-5 · 3=6-10 · 4=11-20 · 5=20+' },
  { key: 'google_trends',       label: 'Google Trends slope',      rubric: '0=declining · 1=flat · 2=slight uptick · 3=rising · 4=steep climb · 5=breakout' },
  { key: 'demand_floor',        label: 'Demand floor (Everbee)',   rubric: '0=<100 est. sales · 1=100-500 · 2=500-1k · 3=1k-3k · 4=3k-10k · 5=10k+' },
  { key: 'cultural_timing',     label: 'Cultural timing',          rubric: '0=past peak · 1=unclear · 2=ambient · 3=growing buzz · 4=seasonal fit · 5=perfect timing' },
];

function statusStyle(s) {
  return STATUSES.find(st => st.key === s) || STATUSES[1];
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
              title={d.rubric}
            />
          ) : (
            <span style={{ fontSize: '0.8rem', fontWeight: 500, width: 24, textAlign: 'center' }}>
              {breakdown?.[d.key] ?? '—'}
            </span>
          )}
          <span style={{ fontSize: '0.65rem', color: 'var(--charcoal-soft)' }}>/5</span>
          <span title={d.rubric} style={{ fontSize: '0.65rem', color: 'var(--charcoal-soft)', cursor: 'help', userSelect: 'none' }}>?</span>
        </div>
      ))}
    </div>
  );
}

function SignalCard({ signal, products, collections, onAction }) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ ...signal });
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [pursueToast, setPursueToast] = useState(false);
  const { chapters } = useChapters();

  const st = statusStyle(signal.status);
  const linkedProducts = products.filter(p =>
    form.related_product_ids?.includes(p.id)
  );

  async function handleSave() {
    setSaving(true);
    setSaveError('');
    // Some signals (imported/seeded before this rubric existed) carry a raw
    // score with no breakdown. Recomputing from an empty/untouched breakdown
    // would silently zero out that score on any unrelated edit (e.g. just
    // fixing a typo in notes) — only overwrite the score once she's actually
    // filled in at least one dial.
    const breakdownTouched = form.score_breakdown && Object.values(form.score_breakdown).some(v => v !== '' && v != null);
    const totalScore = breakdownTouched
      ? SCORE_DIALS.reduce((s, d) => s + (parseInt(form.score_breakdown?.[d.key]) || 0), 0)
      : (signal.score ?? 0);
    const { error } = await updateTrendSignal(signal.id, {
      name: form.name,
      collection: form.collection,
      parent_niche: form.parent_niche || null,
      status: form.status,
      score: totalScore,
      score_breakdown: form.score_breakdown,
      evidence: form.evidence,
      notes: form.notes,
      source: form.source || null,
      confidence: form.confidence || null,
      competitor_snapshot: form.competitor_snapshot || null,
      revisit_date: form.revisit_date || null,
      last_updated: nowISO().split('T')[0],
    });
    if (error) {
      setSaveError(error.message);
      setSaving(false);
      return;
    }
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
              {chapters.map(p => <option key={p} value={p}>{p}</option>)}
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
          <input value={form.source || ''} onChange={e => setForm(f => ({ ...f, source: e.target.value }))} placeholder="Source (e.g. Everbee, Pinterest, ChatGPT)" style={{ fontSize: '0.8rem' }} />
          <ConfidenceSelector value={form.confidence || ''} onChange={v => setForm(f => ({ ...f, confidence: v }))} />
          <ScoreDials
            breakdown={form.score_breakdown || {}}
            onChange={sb => setForm(f => ({ ...f, score_breakdown: sb }))}
            editable
          />
          <textarea value={form.evidence || ''} onChange={e => setForm(f => ({ ...f, evidence: e.target.value }))} placeholder="Evidence notes…" rows={3} style={{ fontSize: '0.8rem' }} />
          <textarea value={form.notes || ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Additional notes…" rows={2} style={{ fontSize: '0.8rem' }} />
          <textarea value={form.competitor_snapshot || ''} onChange={e => setForm(f => ({ ...f, competitor_snapshot: e.target.value }))} placeholder="Competitor snapshot — top sellers, price ranges, avg reviews…" rows={3} style={{ fontSize: '0.8rem' }} />
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" style={{ fontSize: '0.72rem' }}>Revisit date</label>
            <input type="date" value={form.revisit_date || ''} onChange={e => setForm(f => ({ ...f, revisit_date: e.target.value }))} />
          </div>
        </div>
        {saveError && (
          <div style={{ background: 'rgba(201,123,123,0.12)', border: '1px solid var(--alert)', borderRadius: 2, padding: '8px 12px', marginBottom: 12, fontSize: '0.78rem', color: 'var(--charcoal-soft)' }}>
            Save failed: {saveError}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          <button className="btn btn-ghost btn-sm" onClick={() => { setEditing(false); setForm({ ...signal }); setSaveError(''); }}>Cancel</button>
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
            {!!signal.score && !(signal.score_breakdown && Object.values(signal.score_breakdown).some(v => v !== '' && v != null)) && (
              <span title="This score predates the dial rubric below — no breakdown was ever recorded to back it up. Fill in the dials to confirm or correct it."
                style={{ fontSize: '0.65rem', color: '#7a4a1e', cursor: 'help' }}>
                ⚠ unscored breakdown
              </span>
            )}
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
            {signal.revisit_date && (() => {
              const today = nowISO().split('T')[0];
              const overdue = signal.revisit_date < today;
              return (
                <span style={{ fontSize: '0.65rem', color: overdue ? 'var(--alert)' : 'var(--charcoal-soft)', fontWeight: overdue ? 600 : 400 }}>
                  {overdue ? `⚑ Revisit overdue (${signal.revisit_date})` : `revisit ${signal.revisit_date}`}
                </span>
              );
            })()}
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
          {(signal.source || signal.confidence) && (
            <div style={{ fontSize: '0.7rem', color: 'var(--charcoal-soft)', marginBottom: 12 }}>
              {signal.source && `Source: ${signal.source}`}{signal.source && signal.confidence ? ' · ' : ''}{signal.confidence && `Confidence: ${signal.confidence}`}
            </div>
          )}
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
          {signal.competitor_snapshot && (
            <div style={{ marginBottom: 12 }}>
              <div className="eyebrow" style={{ marginBottom: 6 }}>Competitor Snapshot</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--charcoal-soft)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{signal.competitor_snapshot}</div>
            </div>
          )}
          {signal.first_spotted && (
            <div style={{ fontSize: '0.7rem', color: 'var(--charcoal-soft)', marginBottom: 12 }}>
              First spotted: {signal.first_spotted} · Last updated: {signal.last_updated || '—'}
            </div>
          )}
        </div>
      )}

      {confirmingDelete ? (
        <div style={{ marginTop: 8 }}>
          <ConfirmButton
            confirming
            promptText="Delete this signal?"
            onConfirm={handleDelete}
            onCancel={() => setConfirmingDelete(false)}
          />
        </div>
      ) : (
        <>
          {pursueToast && (
            <div style={{ fontSize: '0.75rem', color: '#2d6b3c', background: 'rgba(124,175,138,0.15)', border: '1px solid rgba(124,175,138,0.4)', borderRadius: 4, padding: '6px 12px', marginTop: 8 }}>
              ✓ Pursuing — hot sparks created for <strong>{signal.collection || 'collection'}</strong>. Check Idea Vault.
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
          {signal.status !== 'pursue' && (
            <button
              className="btn btn-sm"
              style={{ background: 'rgba(124,175,138,0.15)', color: '#2d6b3c', border: '1px solid rgba(124,175,138,0.4)', fontWeight: 600 }}
              onClick={async () => {
                setSaving(true);
                await supabase.from('trend_signals').update({ status: 'pursue', last_updated: nowISO().split('T')[0], updated_at: nowISO() }).eq('id', signal.id);
                if (signal.collection) await autoHotSparksForSignal(signal.collection);
                setSaving(false);
                setPursueToast(true);
                setTimeout(() => { setPursueToast(false); onAction?.(); }, 2500);
              }}
              disabled={saving}
            >
              🟢 Pursue
            </button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>Update signal</button>
          <ConfirmButton
            label="🗑"
            triggerStyle={{ marginLeft: 'auto', fontSize: '0.8rem', opacity: 0.5 }}
            confirming={false}
            onTrigger={() => setConfirmingDelete(true)}
            onConfirm={handleDelete}
            onCancel={() => setConfirmingDelete(false)}
            promptText="Delete this signal?"
          />
        </div>
        </>
      )}
    </div>
  );
}

function AddSignalForm({ collections, onSaved, onCancel }) {
  const { chapters } = useChapters();
  const [form, setForm] = useState({
    name: '', collection: '', parent_niche: '', status: 'watch',
    score_breakdown: {}, evidence: '', notes: '', source: '', confidence: '',
    competitor_snapshot: '', revisit_date: '',
    first_spotted: nowISO().split('T')[0],
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  async function handleSave() {
    if (!form.name.trim()) return;
    setSaving(true);
    setSaveError('');
    const score = SCORE_DIALS.reduce((s, d) => s + (parseInt(form.score_breakdown?.[d.key]) || 0), 0);
    const { error } = await createTrendSignal({
      ...form,
      source: form.source || null,
      confidence: form.confidence || null,
      revisit_date: form.revisit_date || null,
      score,
      last_updated: form.first_spotted,
    });
    setSaving(false);
    if (error) { setSaveError(error.message); return; }
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
            {chapters.map(p => <option key={p} value={p}>{p}</option>)}
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
        <input value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))} placeholder="Source (e.g. Everbee, Pinterest, ChatGPT)" style={{ fontSize: '0.8rem' }} />
        <ConfidenceSelector value={form.confidence} onChange={v => setForm(f => ({ ...f, confidence: v }))} />
        <ScoreDials
          breakdown={form.score_breakdown}
          onChange={sb => setForm(f => ({ ...f, score_breakdown: sb }))}
          editable
        />
        <textarea value={form.evidence} onChange={e => setForm(f => ({ ...f, evidence: e.target.value }))} placeholder="Evidence — bullet points, sources, data…" rows={3} style={{ fontSize: '0.8rem' }} />
        <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Notes…" rows={2} style={{ fontSize: '0.8rem' }} />
        <textarea value={form.competitor_snapshot || ''} onChange={e => setForm(f => ({ ...f, competitor_snapshot: e.target.value }))} placeholder="Competitor snapshot — top sellers, price ranges, avg reviews…" rows={3} style={{ fontSize: '0.8rem' }} />
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
      {saveError && (
        <div style={{ background: 'rgba(201,123,123,0.12)', border: '1px solid var(--alert)', borderRadius: 2, padding: '8px 12px', marginTop: 12, fontSize: '0.78rem', color: 'var(--charcoal-soft)' }}>
          Save failed: {saveError}
        </div>
      )}
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
  const { chapters } = useChapters();
  const [adding, setAdding] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [nicheFilter, setNicheFilter] = useState('');

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
          {chapters.map(p => {
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
    </div>
  );
}
