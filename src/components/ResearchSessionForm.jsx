import { useState } from 'react';
import { createResearchSession } from '../lib/hooks';
import { COLLECTIONS } from '../data/collections';

const SOURCES = ['Everbee', 'Etsy Search', 'Pinterest', 'Other'];
const STATUSES = ['Complete', 'Needs More Data', 'Gaps Identified'];

const KW_STATUS = {
  use:     { color: '#7CAF8A', label: '●' },
  watch:   { color: '#E8A87C', label: '●' },
  discard: { color: '#C97B7B', label: '●' },
};

const STATUS_CYCLE = { use: 'watch', watch: 'discard', discard: 'use' };

function autoColor(score, competition, statusText) {
  const s = parseFloat(score) || 0;
  const c = parseFloat(competition) || 0;
  const t = (statusText || '').toLowerCase().trim();
  if (t === 'use' || t === 'yes' || t === 'keep') return 'use';
  if (t === 'discard' || t === 'no' || t === 'skip') return 'discard';
  if (s >= 1000 && c <= 500) return 'use';
  if (s === 0 || c >= 50000) return 'discard';
  return 'watch';
}

const STATUS_HINTS = {
  'Complete': 'Research done, decisions made',
  'Needs More Data': 'More Everbee research needed',
  'Gaps Identified': 'Known gaps noted below',
};

function KeywordRow({ kw, index, onChange, onRemove }) {
  function cycleStatus() {
    onChange(index, { ...kw, status: STATUS_CYCLE[kw.status] });
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
      borderLeft: `3px solid ${KW_STATUS[kw.status].color}`,
      background: 'var(--warm-white)', borderRadius: '0 2px 2px 0',
      marginBottom: 4,
    }}>
      <button
        onClick={cycleStatus}
        title="Click to cycle status"
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: '1rem', color: KW_STATUS[kw.status].color,
          flexShrink: 0, lineHeight: 1, padding: 0,
        }}
      >
        {KW_STATUS[kw.status].label}
      </button>
      <input
        value={kw.keyword}
        onChange={e => onChange(index, { ...kw, keyword: e.target.value })}
        style={{ flex: 2, minWidth: 0, padding: '4px 8px', fontSize: '0.78rem' }}
        placeholder="Keyword"
      />
      <input
        value={kw.volume}
        onChange={e => onChange(index, { ...kw, volume: e.target.value })}
        type="number"
        style={{ width: 72, padding: '4px 8px', fontSize: '0.78rem' }}
        placeholder="Vol"
      />
      <input
        value={kw.competition}
        onChange={e => onChange(index, { ...kw, competition: e.target.value })}
        type="number"
        style={{ width: 60, padding: '4px 8px', fontSize: '0.78rem' }}
        placeholder="Comp"
      />
      <input
        value={kw.score}
        onChange={e => onChange(index, { ...kw, score: e.target.value })}
        type="number"
        style={{ width: 72, padding: '4px 8px', fontSize: '0.78rem' }}
        placeholder="Score"
      />
      <button
        onClick={() => onRemove(index)}
        style={{ color: 'var(--charcoal-soft)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.9rem', flexShrink: 0 }}
      >
        ×
      </button>
    </div>
  );
}

export default function ResearchSessionForm({ defaultCollection, defaultNiche, onSaved, onCancel }) {
  const [collection, setCollection] = useState(defaultCollection || defaultNiche || 'Mom Chapter');
  const [niche, setNiche] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [source, setSource] = useState('Everbee');
  const [status, setStatus] = useState('Complete');
  const [notes, setNotes] = useState('');
  const [gapsNotes, setGapsNotes] = useState('');
  const [keywords, setKeywords] = useState([]);
  const [bulkText, setBulkText] = useState('');
  const [showBulk, setShowBulk] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function parseBulk() {
    const lines = bulkText.trim().split('\n').filter(Boolean);
    const parsed = [];
    for (const line of lines) {
      const parts = line.split('|').map(p => p.trim());
      if (parts.length < 1 || !parts[0]) continue;
      if (parts[0].toLowerCase() === 'keyword') continue;
      const [keyword, volume, competition, score, statusText] = parts;
      if (!keyword) continue;
      parsed.push({
        keyword,
        volume: volume || '',
        competition: competition || '',
        score: score || '',
        status: autoColor(score, competition, statusText),
        updated_at: new Date().toISOString(),
      });
    }
    if (parsed.length) {
      setKeywords(prev => {
        const merged = [...prev];
        for (const incoming of parsed) {
          const idx = merged.findIndex(
            k => k.keyword.toLowerCase() === incoming.keyword.toLowerCase()
          );
          if (idx >= 0) {
            merged[idx] = incoming;
          } else {
            merged.push(incoming);
          }
        }
        return merged;
      });
      setBulkText('');
      setShowBulk(false);
    }
  }

  function updateKeyword(index, updated) {
    setKeywords(prev => prev.map((k, i) => i === index ? updated : k));
  }

  function removeKeyword(index) {
    setKeywords(prev => prev.filter((_, i) => i !== index));
  }

  function addBlankKeyword() {
    setKeywords(prev => [...prev, { keyword: '', volume: '', competition: '', score: '', status: 'watch' }]);
  }

  async function handleSave() {
    if (!collection) return;
    setSaving(true);
    const kwList = keywords
      .filter(k => k.keyword.trim())
      .map(k => ({
        keyword: k.keyword,
        volume: k.volume ? parseInt(k.volume) : null,
        competition: k.competition ? parseInt(k.competition) : null,
        score: k.score ? parseInt(k.score) : null,
        tag_type: k.status,
      }));
    await createResearchSession(
      { collection, niche: niche.trim() || null, date, source, notes, status, gaps_notes: gapsNotes },
      kwList
    );
    setSaving(false);
    setSaved(true);
    setTimeout(() => { onSaved?.(); }, 1000);
  }

  const useCount = keywords.filter(k => k.status === 'use').length;
  const watchCount = keywords.filter(k => k.status === 'watch').length;
  const discardCount = keywords.filter(k => k.status === 'discard').length;

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="form-group">
          <label className="form-label">Collection</label>
          <select value={collection} onChange={e => setCollection(e.target.value)}>
            {COLLECTIONS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Date</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} />
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Niche <span style={{ fontWeight: 400, opacity: 0.6 }}>(optional)</span></label>
        <input
          type="text"
          value={niche}
          onChange={e => setNiche(e.target.value)}
          placeholder="e.g. Mom Humor, 90s Nostalgia, Camp Mom"
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
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
          <label className="form-label">Status</label>
          <div className="toggle-group">
            {STATUSES.map(s => (
              <button key={s} className={`toggle-btn${status === s ? ' active' : ''}`} onClick={() => setStatus(s)}>
                {s}
              </button>
            ))}
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--charcoal-soft)', marginTop: 6 }}>
            {STATUS_HINTS[status]}
          </div>
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Notes</label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="What did you find?" rows={2} />
      </div>

      {(status === 'Gaps Identified' || status === 'Needs More Data') && (
        <div className="form-group">
          <label className="form-label">What's Still Missing</label>
          <textarea value={gapsNotes} onChange={e => setGapsNotes(e.target.value)} placeholder="What gaps need to be filled?" rows={2} />
        </div>
      )}

      {/* Keywords section */}
      <div className="form-group">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div className="section-label" style={{ margin: 0 }}>
            Keywords
            {keywords.length > 0 && (
              <span style={{ marginLeft: 8, fontWeight: 400, color: 'var(--charcoal-soft)' }}>
                <span style={{ color: KW_STATUS.use.color }}>●</span> {useCount} use &nbsp;
                <span style={{ color: KW_STATUS.watch.color }}>●</span> {watchCount} watch &nbsp;
                <span style={{ color: KW_STATUS.discard.color }}>●</span> {discardCount} discard
              </span>
            )}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowBulk(!showBulk)}>
            {showBulk ? 'Hide paste' : 'Paste keywords'}
          </button>
        </div>

        {showBulk && (
          <div style={{ marginBottom: 12 }}>
            <textarea
              value={bulkText}
              onChange={e => setBulkText(e.target.value)}
              placeholder={`Paste pipe-separated keywords:\nkeyword | volume | competition | score | status\nmom life svg | 4368 | 5 | 873750 | Use\nbookish tee | 1736 | 36 | 48230 | Watch`}
              rows={5}
              style={{ fontFamily: 'monospace', fontSize: '0.75rem', marginBottom: 8 }}
            />
            <button
              className="btn btn-rose btn-sm"
              onClick={parseBulk}
              disabled={!bulkText.trim()}
            >
              Parse Keywords →
            </button>
          </div>
        )}

        {keywords.length > 0 && (
          <div style={{ marginBottom: 8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 72px 60px 72px auto', gap: 8, padding: '0 10px 6px', fontSize: '0.65rem', color: 'var(--charcoal-soft)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              <div />
              <div>Keyword</div>
              <div>Volume</div>
              <div>Comp</div>
              <div>Score</div>
              <div />
            </div>
            {keywords.map((kw, i) => (
              <KeywordRow key={i} kw={kw} index={i} onChange={updateKeyword} onRemove={removeKeyword} />
            ))}
          </div>
        )}

        <button className="btn btn-ghost btn-sm" onClick={addBlankKeyword}>+ Add keyword manually</button>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
        <button className="btn btn-primary" onClick={handleSave} disabled={!collection || saving}>
          {saving ? 'Saving…' : 'Save Session →'}
        </button>
        {onCancel && <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>}
        {saved && <span className="inline-confirm">✓ Saved</span>}
      </div>
    </div>
  );
}
