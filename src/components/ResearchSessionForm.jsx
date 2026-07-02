import { useState } from 'react';
import { createResearchSession } from '../lib/hooks';

const SOURCES = ['Everbee', 'Etsy Search', 'Pinterest', 'Other'];
const DECISIONS = ['Pursue', 'Watch', 'Discard'];

export default function ResearchSessionForm({ products, defaultProductId, onSaved, onCancel }) {
  const [productId, setProductId] = useState(defaultProductId || '');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [source, setSource] = useState('Everbee');
  const [notes, setNotes] = useState('');
  const [decision, setDecision] = useState('Pursue');
  const [keywords, setKeywords] = useState([]);
  const [kw, setKw] = useState({ keyword: '', volume: '', competition: '', score: '' });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function addKeyword() {
    if (!kw.keyword.trim()) return;
    setKeywords(prev => [...prev, { ...kw }]);
    setKw({ keyword: '', volume: '', competition: '', score: '' });
  }

  async function handleSave() {
    if (!productId) return;
    setSaving(true);
    const kwList = keywords.map(k => ({
      keyword: k.keyword,
      volume: k.volume ? parseInt(k.volume) : null,
      competition: k.competition ? parseInt(k.competition) : null,
      score: k.score ? parseInt(k.score) : null,
    }));
    await createResearchSession({ product_id: productId, date, source, notes, decision }, kwList);
    setSaving(false);
    setSaved(true);
    setTimeout(() => { onSaved?.(); }, 1000);
  }

  return (
    <div>
      <div className="form-group">
        <label className="form-label">Product</label>
        <select value={productId} onChange={e => setProductId(e.target.value)}>
          <option value="">Select product…</option>
          {products?.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      <div className="form-group">
        <label className="form-label">Date</label>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} />
      </div>

      <div className="form-group">
        <label className="form-label">Source</label>
        <div className="toggle-group source-toggle">
          {SOURCES.map(s => (
            <button key={s} className={`toggle-btn${source === s ? ' active' : ''}`} onClick={() => setSource(s)}>
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Notes</label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="What did you find?" rows={2} />
      </div>

      <div className="form-group">
        <div className="section-label" style={{ marginBottom: 8 }}>Keywords Found</div>
        {keywords.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            {keywords.map((k, i) => (
              <div key={i} style={{ fontSize: '0.78rem', padding: '4px 0', display: 'flex', gap: 8, borderBottom: '1px solid rgba(43,41,38,0.07)' }}>
                <span style={{ flex: 1 }}>{k.keyword}</span>
                {k.volume && <span style={{ color: 'var(--charcoal-soft)' }}>v{k.volume}</span>}
                {k.competition && <span style={{ color: 'var(--charcoal-soft)' }}>c{k.competition}</span>}
                {k.score && <span style={{ color: 'var(--charcoal-soft)' }}>s{k.score}</span>}
                <button style={{ fontSize: '0.7rem', color: 'var(--alert)', background: 'none', border: 'none', cursor: 'pointer' }}
                  onClick={() => setKeywords(prev => prev.filter((_, j) => j !== i))}>×</button>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr auto', gap: 6 }}>
          <input placeholder="Keyword" value={kw.keyword} onChange={e => setKw(p => ({ ...p, keyword: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && addKeyword()} />
          <input placeholder="Vol" type="number" value={kw.volume} onChange={e => setKw(p => ({ ...p, volume: e.target.value }))} />
          <input placeholder="Comp" type="number" value={kw.competition} onChange={e => setKw(p => ({ ...p, competition: e.target.value }))} />
          <input placeholder="Score" type="number" value={kw.score} onChange={e => setKw(p => ({ ...p, score: e.target.value }))} />
          <button className="btn btn-ghost btn-sm" onClick={addKeyword} style={{ whiteSpace: 'nowrap' }}>+ Add</button>
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Decision</label>
        <div className="toggle-group">
          {DECISIONS.map(d => (
            <button key={d} className={`toggle-btn${decision === d ? ' active' : ''}`} onClick={() => setDecision(d)}>
              {d}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
        <button className="btn btn-primary" onClick={handleSave} disabled={!productId || saving}>
          {saving ? 'Saving…' : 'Save Session →'}
        </button>
        {onCancel && <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>}
        {saved && <span className="inline-confirm">✓ Saved</span>}
      </div>
    </div>
  );
}
