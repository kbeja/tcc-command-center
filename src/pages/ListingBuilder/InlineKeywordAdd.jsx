import { useState, useEffect, useRef } from 'react';
import { createResearchSession } from '../../lib/hooks';

export default function InlineKeywordAdd({ collection, sessions, onSaved }) {
  const [open, setOpen]       = useState(false);
  const [rows, setRows]       = useState([{ keyword: '', volume: '', competition: '', bucket: '' }]);
  const [targetSession, setTargetSession] = useState('');
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);

  // Default to the most recent existing session for this collection, once per
  // collection, so leaving the dropdown untouched doesn't silently spawn a new
  // "Inline add" session every time — same auto-pick-once-then-respect-the-user
  // pattern as the anchor keyword auto-select above.
  const autoSessionTriedRef = useRef(new Set());
  useEffect(() => {
    if (autoSessionTriedRef.current.has(collection)) return;
    if (!sessions.length) return;
    autoSessionTriedRef.current.add(collection);
    const mostRecent = [...sessions].sort((a, b) => new Date(b.date || b.created_at || 0) - new Date(a.date || a.created_at || 0))[0];
    if (mostRecent) setTargetSession(mostRecent.id);
  }, [collection, sessions]);

  function updateRow(i, field, val) {
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: val } : r));
  }
  function addRow() {
    setRows(prev => [...prev, { keyword: '', volume: '', competition: '', bucket: '' }]);
  }
  function removeRow(i) {
    setRows(prev => prev.filter((_, idx) => idx !== i));
  }

  async function handleSave() {
    const valid = rows.filter(r => r.keyword.trim());
    if (!valid.length) return;
    setSaving(true);

    // targetSession holds a real research_sessions.id once one's picked from
    // the dropdown (each session object carries its own collection/source/
    // date already, from the `*, keywords(*)` fetch in the parent) — pass it
    // straight through so createResearchSession() appends to that session
    // instead of creating a new one. Blank means "+ Create new session".
    const existingSession = targetSession ? sessions.find(s => s.id === targetSession) : null;
    const sessionParam = existingSession || {
      date: new Date().toISOString().slice(0, 10),
      collection,
      source: 'Inline add',
      status: 'Needs More Data',
    };

    const kwRows = valid.map(r => ({
      keyword:       r.keyword.trim(),
      volume:        r.volume ? parseInt(r.volume) : null,
      competition:   r.competition ? parseInt(r.competition) : null,
      bucket:        r.bucket ? parseInt(r.bucket) : null,
      bucket_source: r.bucket ? 'manual' : null,
      tag_type:      'watch',
      tags_only:     false,
    }));

    const { data, error } = await createResearchSession(sessionParam, kwRows);
    if (error) { console.error(error); setSaving(false); return; }
    if (!existingSession && data?.id) setTargetSession(data.id);

    setSaving(false);
    setSaved(true);
    setRows([{ keyword: '', volume: '', competition: '', bucket: '' }]);
    onSaved?.();
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left', padding: 0 }}
      >
        <span style={{ fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--charcoal-soft)' }}>
          + Add Keywords Without Leaving
        </span>
        <span style={{ fontSize: '0.65rem', color: 'var(--charcoal-soft)', opacity: 0.5 }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ marginTop: 12 }}>
          {/* Session target */}
          <div style={{ marginBottom: 10 }}>
            <label className="form-label">Add to session</label>
            <select value={targetSession} onChange={e => setTargetSession(e.target.value)}
              style={{ fontSize: '0.78rem', padding: '5px 8px' }}>
              <option value="">+ Create new session</option>
              {sessions.map(s => (
                <option key={s.id} value={s.id}>{s.niche || s.collection} — {s.date} ({(s.keywords || []).length} kw)</option>
              ))}
            </select>
          </div>

          {/* Keyword rows */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 80px 80px 80px 24px', gap: 6, fontSize: '0.65rem', color: 'var(--charcoal-soft)', padding: '0 2px' }}>
              <span>Keyword</span><span>Volume</span><span>Competition</span><span>Bucket</span><span />
            </div>
            {rows.map((r, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 80px 80px 80px 24px', gap: 6, alignItems: 'center' }}>
                <input value={r.keyword} onChange={e => updateRow(i, 'keyword', e.target.value)}
                  placeholder="keyword phrase" style={{ fontSize: '0.78rem', padding: '4px 8px' }} />
                <input value={r.volume} onChange={e => updateRow(i, 'volume', e.target.value)}
                  type="number" placeholder="vol" style={{ fontSize: '0.78rem', padding: '4px 6px' }} />
                <input value={r.competition} onChange={e => updateRow(i, 'competition', e.target.value)}
                  type="number" placeholder="comp" style={{ fontSize: '0.78rem', padding: '4px 6px' }} />
                <select value={r.bucket} onChange={e => updateRow(i, 'bucket', e.target.value)}
                  style={{ fontSize: '0.72rem', padding: '4px 4px' }}>
                  <option value="">—</option>
                  <option value="1">B1</option>
                  <option value="2">B2</option>
                  <option value="3">B3</option>
                </select>
                <button onClick={() => removeRow(i)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--charcoal-soft)', opacity: 0.4, fontSize: '0.8rem', padding: 0 }}>✕</button>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={addRow}>+ Row</button>
            <button type="button" className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving || !rows.some(r => r.keyword.trim())}>
              {saving ? 'Saving…' : saved ? '✓ Saved — keywords updated' : 'Save & Refresh'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
