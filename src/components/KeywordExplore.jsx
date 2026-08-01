import { useState, useRef } from 'react';
import { assignBucket, BucketBadge, BUCKET_STYLE } from '../lib/keywords';
import { supabase } from '../lib/supabase';
import { createCollection } from '../lib/hooks';

// ─── Column detection ─────────────────────────────────────────────────────────

const COL_MAPS = {
  keyword:     ['keyword', 'keywords', 'search term', 'term', 'key phrase'],
  volume:      ['avg. searches', 'avg searches', 'average searches', 'search volume', 'monthly searches', 'searches', 'volume', 'avg. monthly searches'],
  competition: ['etsy competition', 'competition', 'competitors', 'competing listings', 'etsy listings', 'listing count'],
  clicks:      ['avg. clicks', 'avg clicks', 'average clicks', 'clicks'],
  ctr:         ['avg. ctr', 'avg ctr', 'average ctr', 'ctr', 'click through rate'],
  difficulty:  ['keyword difficulty', 'difficulty', 'kd', 'seo difficulty'],
  google:      ['google searches', 'google volume', 'google search volume', 'google monthly searches'],
  score:       ['everbee score', 'score', 'opportunity score', 'listing quality score'],
  note:        ['note', 'notes', 'comment'],
};

function detectColumn(headers, field) {
  const candidates = COL_MAPS[field];
  return headers.findIndex(h => candidates.some(c => h.toLowerCase().trim() === c));
}

function detectSourceTool(headers) {
  const flat = headers.map(h => h.toLowerCase());
  if (flat.some(h => h.includes('keyword difficulty') || h.includes('google searches'))) return 'eRank';
  if (flat.some(h => h.includes('everbee') || h.includes('listing quality'))) return 'Everbee';
  return 'Unknown';
}

// ─── CSV parser ───────────────────────────────────────────────────────────────

function parseCSVText(text) {
  const lines = text.trim().split('\n').filter(l => l.trim());
  if (lines.length < 2) return null;

  const delim = lines[0].includes('\t') ? '\t' : ',';

  const parseRow = (line) => {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === delim && !inQuotes) { result.push(current.trim()); current = ''; continue; }
      current += ch;
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseRow(lines[0]);
  const sourceTool = detectSourceTool(headers);

  const idx = {
    kw:   detectColumn(headers, 'keyword'),
    vol:  detectColumn(headers, 'volume'),
    comp: detectColumn(headers, 'competition'),
    clk:  detectColumn(headers, 'clicks'),
    ctr:  detectColumn(headers, 'ctr'),
    diff: detectColumn(headers, 'difficulty'),
    goog: detectColumn(headers, 'google'),
    scr:  detectColumn(headers, 'score'),
    note: detectColumn(headers, 'note'),
  };

  if (idx.kw === -1) return null;

  const keywords = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseRow(lines[i]);
    const kw = cols[idx.kw]?.replace(/^["']|["']$/g, '').trim();
    if (!kw) continue;
    keywords.push({
      id: `k-${i}-${Date.now()}`,
      keyword:     kw,
      volume:      parseNum(cols[idx.vol]),
      competition: parseNum(cols[idx.comp]),
      clicks:      parseNum(cols[idx.clk]),
      ctr:         idx.ctr  !== -1 ? cols[idx.ctr]?.trim() || null : null,
      difficulty:  parseNum(cols[idx.diff]),
      google:      parseNum(cols[idx.goog]),
      score:       parseNum(cols[idx.scr]),
      note:        idx.note !== -1 ? cols[idx.note]?.trim() || '' : '',
      trend:       null,
      sourceTool,
      groupId:     null,
      bucket:      null,
    });
  }
  return { keywords, sourceTool };
}

function parseNum(val) {
  if (!val) return null;
  const n = parseFloat(String(val).replace(/[^0-9.]/g, ''));
  return isNaN(n) ? null : Math.round(n);
}

// ─── Bucket assignment ────────────────────────────────────────────────────────

function applyBuckets(keywords) {
  const context = keywords.filter(k => k.volume != null && k.competition != null);
  return keywords.map(k => ({ ...k, bucket: assignBucket(k.volume, k.competition, context) }));
}

// ─── Opportunity score for a group ───────────────────────────────────────────

function opportunityScore(keywords) {
  if (!keywords.length) return 0;
  const b1Count   = keywords.filter(k => k.bucket === 1).length;
  const avgDiff   = keywords.filter(k => k.difficulty != null).reduce((s, k, _, a) => s + k.difficulty / a.length, 0) || 50;
  const avgComp   = keywords.filter(k => k.competition != null).reduce((s, k, _, a) => s + k.competition / a.length, 0) || 9999;
  const compScore = Math.max(0, 100 - Math.log10(avgComp + 1) * 20);
  return Math.round(b1Count * 30 + (100 - avgDiff) * 0.4 + compScore * 0.3);
}

// ─── Bucket summary ───────────────────────────────────────────────────────────

function BucketSummary({ keywords, compact }) {
  const counts = [1,2,3].map(b => ({ b, count: keywords.filter(k => k.bucket === b).length }));
  const none = keywords.filter(k => !k.bucket).length;
  if (!keywords.length) return null;
  return (
    <div style={{ display: 'flex', gap: compact ? 4 : 8, alignItems: 'center', flexWrap: 'wrap' }}>
      {counts.map(({ b, count }) => (
        <span key={b} style={{
          fontSize: compact ? '0.65rem' : '0.7rem', fontWeight: 600,
          padding: compact ? '2px 6px' : '3px 10px', borderRadius: 20,
          background: BUCKET_STYLE[b].bg, color: BUCKET_STYLE[b].color,
          border: `1px solid ${BUCKET_STYLE[b].border}`,
        }}>B{b}: {count}</span>
      ))}
      {none > 0 && <span style={{ fontSize: '0.65rem', color: 'var(--charcoal-soft)' }}>{none} unclassified</span>}
    </div>
  );
}

// ─── Trend picker ─────────────────────────────────────────────────────────────

const TRENDS = [
  { value: 'up',     label: '↑ Trending up',  color: '#2d6b3c' },
  { value: 'stable', label: '→ Stable',        color: '#6b4a10' },
  { value: 'down',   label: '↓ Declining',     color: '#7a2b2b' },
];

function TrendBadge({ trend }) {
  if (!trend) return null;
  const t = TRENDS.find(t => t.value === trend);
  return <span style={{ fontSize: '0.65rem', color: t.color, fontWeight: 600 }}>{t.label}</span>;
}

// ─── Keyword row ──────────────────────────────────────────────────────────────

function KeywordRow({ kw, groups, onAssignGroup, onRemove, onUpdate, selected, onToggle }) {
  const [expanded, setExpanded] = useState(false);

  const hasMeta = kw.difficulty != null || kw.google != null || kw.ctr || kw.clicks != null;

  return (
    <div style={{
      background: selected ? 'rgba(124,175,138,0.08)' : 'var(--charcoal-faint)',
      borderRadius: 2, marginBottom: 2,
      borderLeft: `3px solid ${kw.bucket ? BUCKET_STYLE[kw.bucket]?.border : 'rgba(43,41,38,0.12)'}`,
    }}>
      {/* Main row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px' }}>
        <input type="checkbox" checked={selected} onChange={() => onToggle(kw.id)}
          style={{ width: 'auto', margin: 0, flexShrink: 0 }} />

        <span style={{ flex: 1, fontSize: '0.82rem', minWidth: 100 }}>{kw.keyword}</span>

        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' }}>
          <BucketBadge bucket={kw.bucket} />
          {kw.sourceTool && kw.sourceTool !== 'Unknown' && (
            <span style={{ fontSize: '0.6rem', opacity: 0.45, color: 'var(--charcoal-soft)' }}>{kw.sourceTool}</span>
          )}
          {kw.volume != null && (
            <span style={{ fontSize: '0.7rem', color: 'var(--charcoal-soft)' }}>vol {kw.volume.toLocaleString()}</span>
          )}
          {kw.competition != null && (
            <span style={{ fontSize: '0.7rem', color: 'var(--charcoal-soft)' }}>comp {kw.competition.toLocaleString()}</span>
          )}
          {kw.difficulty != null && (
            <span style={{ fontSize: '0.68rem', color: kw.difficulty >= 70 ? '#7a2b2b' : kw.difficulty >= 40 ? '#6b4a10' : '#2d6b3c', fontWeight: 600 }}>
              diff {kw.difficulty}
            </span>
          )}
          {kw.trend && <TrendBadge trend={kw.trend} />}

          {/* Group assign */}
          <select value={kw.groupId || ''} onChange={e => onAssignGroup(kw.id, e.target.value || null)}
            onClick={e => e.stopPropagation()}
            style={{ fontSize: '0.65rem', padding: '2px 4px', maxWidth: 100, color: 'var(--charcoal-soft)' }}>
            <option value="">— group —</option>
            {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>

          {hasMeta && (
            <button onClick={() => setExpanded(!expanded)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.65rem', color: 'var(--charcoal-soft)', padding: 0 }}>
              {expanded ? '▲' : '▼'}
            </button>
          )}
          <button onClick={() => onRemove(kw.id)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--charcoal-soft)', fontSize: '0.7rem', opacity: 0.35, padding: 0 }}>✕</button>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ padding: '0 10px 8px 32px', display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: '0.72rem', color: 'var(--charcoal-soft)' }}>
          {kw.clicks != null && <span>clicks {kw.clicks.toLocaleString()}</span>}
          {kw.ctr && <span>ctr {kw.ctr}</span>}
          {kw.google != null && <span>google {kw.google.toLocaleString()}</span>}
          {kw.score != null && <span>score {kw.score.toLocaleString()}</span>}

          {/* Trend picker */}
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <span style={{ opacity: 0.6 }}>trend:</span>
            {[null, ...TRENDS].map(t => (
              <button key={t?.value || 'none'} onClick={() => onUpdate(kw.id, { trend: t?.value || null })}
                style={{
                  background: kw.trend === (t?.value || null) ? 'rgba(43,41,38,0.12)' : 'none',
                  border: '1px solid rgba(43,41,38,0.12)', borderRadius: 3,
                  cursor: 'pointer', fontSize: '0.65rem', padding: '1px 5px',
                  color: t ? t.color : 'var(--charcoal-soft)',
                }}>
                {t ? t.label : '—'}
              </button>
            ))}
          </div>

          {/* Note */}
          <input
            value={kw.note || ''}
            onChange={e => onUpdate(kw.id, { note: e.target.value })}
            placeholder="Note why this caught your eye…"
            style={{ flex: 1, minWidth: 180, fontSize: '0.72rem', padding: '2px 6px', border: '1px solid rgba(43,41,38,0.15)', borderRadius: 3 }}
          />
        </div>
      )}
    </div>
  );
}

// ─── Opportunity panel ────────────────────────────────────────────────────────

function OpportunityPanel({ keywords, groups }) {
  // Top ungrouped B1s
  const b1s = keywords.filter(k => k.bucket === 1 && !k.groupId)
    .sort((a, b) => (a.competition || 99999) - (b.competition || 99999))
    .slice(0, 5);

  // Ranked groups
  const rankedGroups = groups.map(g => ({
    group: g,
    keywords: keywords.filter(k => k.groupId === g.id),
    score: opportunityScore(keywords.filter(k => k.groupId === g.id)),
  })).sort((a, b) => b.score - a.score);

  if (!b1s.length && !rankedGroups.length) return null;

  return (
    <div style={{
      background: 'rgba(124,175,138,0.07)', border: '1px solid rgba(124,175,138,0.2)',
      borderRadius: 6, padding: '12px 14px', marginBottom: 16,
    }}>
      <div className="section-label" style={{ marginBottom: 10, color: '#2d6b3c' }}>Top Opportunities</div>

      {rankedGroups.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          {rankedGroups.map(({ group, keywords: gkws, score }) => {
            const b1 = gkws.filter(k => k.bucket === 1).length;
            const avgDiff = gkws.filter(k => k.difficulty != null).reduce((s, k, _, a) => s + k.difficulty / a.length, 0);
            return (
              <div key={group.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, fontSize: '0.78rem' }}>
                <span style={{ fontWeight: 600, minWidth: 120 }}>{group.name}</span>
                <BucketSummary keywords={gkws} compact />
                {avgDiff > 0 && (
                  <span style={{ fontSize: '0.65rem', color: avgDiff >= 70 ? '#7a2b2b' : avgDiff >= 40 ? '#6b4a10' : '#2d6b3c' }}>
                    avg diff {Math.round(avgDiff)}
                  </span>
                )}
                <span style={{ marginLeft: 'auto', fontSize: '0.65rem', fontWeight: 700, color: '#2d6b3c' }}>
                  score {score}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {b1s.length > 0 && (
        <div>
          <div style={{ fontSize: '0.65rem', color: 'var(--charcoal-soft)', marginBottom: 4 }}>UNGROUPED B1 SIGNALS</div>
          {b1s.map(k => (
            <div key={k.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.75rem', marginBottom: 3 }}>
              <BucketBadge bucket={1} />
              <span>{k.keyword}</span>
              {k.volume != null && <span style={{ color: 'var(--charcoal-soft)', fontSize: '0.68rem' }}>vol {k.volume.toLocaleString()}</span>}
              {k.competition != null && <span style={{ color: 'var(--charcoal-soft)', fontSize: '0.68rem' }}>comp {k.competition.toLocaleString()}</span>}
              {k.difficulty != null && <span style={{ fontSize: '0.65rem', color: k.difficulty >= 70 ? '#7a2b2b' : '#2d6b3c' }}>diff {k.difficulty}</span>}
              {k.google != null && <span style={{ color: 'var(--charcoal-soft)', fontSize: '0.68rem' }}>google {k.google.toLocaleString()}</span>}
              {k.trend && <TrendBadge trend={k.trend} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Group card ───────────────────────────────────────────────────────────────

function GroupCard({ group, keywords, collections, onStartCollection, onRename, onDelete }) {
  const [nameEdit, setNameEdit] = useState(false);
  const [name, setName]         = useState(group.name);
  const [converting, setConverting] = useState(false);
  const [targetColl, setTargetColl] = useState('__new__');
  const [newCollName, setNewCollName] = useState(group.name);
  const [saving, setSaving]     = useState(false);
  const [done, setDone]         = useState(false);

  const score = opportunityScore(keywords);
  const b1 = keywords.filter(k => k.bucket === 1).length;
  const strength = b1 >= 3 ? 'strong' : b1 >= 1 ? 'possible' : 'weak';
  const strengthColor = { strong: '#2d6b3c', possible: '#6b4a10', weak: 'var(--charcoal-soft)' }[strength];
  const strengthLabel = { strong: '● Strong', possible: '◐ Possible', weak: '○ Weak' }[strength];
  const avgDiff = keywords.filter(k => k.difficulty != null).reduce((s, k, _, a) => s + k.difficulty / a.length, 0);
  const upTrend = keywords.filter(k => k.trend === 'up').length;

  async function handleSave() {
    setSaving(true);
    const collName = targetColl === '__new__' ? newCollName.trim() : targetColl;
    if (!collName) { setSaving(false); return; }
    await onStartCollection(group, keywords, collName, targetColl === '__new__');
    setSaving(false);
    setDone(true);
    setConverting(false);
  }

  return (
    <div style={{ border: '1px solid rgba(43,41,38,0.1)', borderRadius: 4, padding: '12px 14px', background: 'var(--warm-white)', marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        {nameEdit ? (
          <input value={name} onChange={e => setName(e.target.value)}
            onBlur={() => { onRename(group.id, name); setNameEdit(false); }}
            onKeyDown={e => e.key === 'Enter' && e.target.blur()}
            style={{ fontSize: '0.85rem', fontWeight: 600, flex: 1, padding: '2px 6px' }} autoFocus />
        ) : (
          <span style={{ fontWeight: 600, fontSize: '0.85rem', flex: 1, cursor: 'text' }} onClick={() => setNameEdit(true)}>
            {group.name}
          </span>
        )}
        <span style={{ fontSize: '0.68rem', fontWeight: 600, color: strengthColor }}>{strengthLabel}</span>
        <span style={{ fontSize: '0.65rem', color: 'var(--charcoal-soft)' }}>score {score}</span>
        {avgDiff > 0 && (
          <span style={{ fontSize: '0.65rem', color: avgDiff >= 70 ? '#7a2b2b' : avgDiff >= 40 ? '#6b4a10' : '#2d6b3c' }}>
            avg diff {Math.round(avgDiff)}
          </span>
        )}
        {upTrend > 0 && <span style={{ fontSize: '0.65rem', color: '#2d6b3c' }}>↑ {upTrend} trending</span>}
        <button onClick={() => onDelete(group.id)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--charcoal-soft)', fontSize: '0.75rem', opacity: 0.4 }}>🗑</button>
      </div>

      <div style={{ marginBottom: 8 }}><BucketSummary keywords={keywords} /></div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 10 }}>
        {keywords.map(kw => (
          <div key={kw.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', flexWrap: 'wrap' }}>
            <BucketBadge bucket={kw.bucket} />
            <span>{kw.keyword}</span>
            {kw.volume != null && <span style={{ color: 'var(--charcoal-soft)', fontSize: '0.68rem' }}>vol {kw.volume.toLocaleString()}</span>}
            {kw.competition != null && <span style={{ color: 'var(--charcoal-soft)', fontSize: '0.68rem' }}>comp {kw.competition.toLocaleString()}</span>}
            {kw.difficulty != null && <span style={{ fontSize: '0.65rem', color: kw.difficulty >= 70 ? '#7a2b2b' : '#2d6b3c' }}>diff {kw.difficulty}</span>}
            {kw.google != null && <span style={{ color: 'var(--charcoal-soft)', fontSize: '0.65rem' }}>g:{kw.google.toLocaleString()}</span>}
            {kw.trend && <TrendBadge trend={kw.trend} />}
            {kw.note && <span style={{ fontStyle: 'italic', color: 'var(--charcoal-soft)', fontSize: '0.65rem' }}>"{kw.note}"</span>}
          </div>
        ))}
      </div>

      {done ? (
        <div style={{ fontSize: '0.75rem', color: '#2d6b3c', fontWeight: 500 }}>✓ Added to collection</div>
      ) : converting ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <select value={targetColl} onChange={e => setTargetColl(e.target.value)}
            style={{ fontSize: '0.75rem', padding: '4px 8px' }}>
            <option value="__new__">+ Create new collection</option>
            {collections.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          {targetColl === '__new__' && (
            <input value={newCollName} onChange={e => setNewCollName(e.target.value)}
              placeholder="New collection name…"
              style={{ fontSize: '0.75rem', padding: '4px 8px' }} />
          )}
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save to Collection →'}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setConverting(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <button className="btn btn-ghost btn-sm" onClick={() => setConverting(true)}>→ Start Collection</button>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

let gid = 0;
const newGroup = (name = 'New Group') => ({ id: `g-${++gid}`, name });

export default function KeywordExplore({ collections, onCollectionCreated }) {
  const [keywords, setKeywords]   = useState([]);
  const [groups, setGroups]       = useState([]);
  const [selected, setSelected]   = useState(new Set());
  const [sortBy, setSortBy]       = useState('bucket');
  const [filterBucket, setFilterBucket] = useState(0);
  const [sourceLabel, setSourceLabel]   = useState('');
  const [context, setContext]     = useState('');   // "what am I researching and why"
  const [parseError, setParseError]   = useState('');
  const [clustering, setClustering]   = useState(false);
  const [clusterError, setClusterError] = useState('');
  const [pasteMode, setPasteMode] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const fileRef = useRef();

  function ingest(text) {
    setParseError('');
    const result = parseCSVText(text);
    if (!result) { setParseError('Could not detect keyword column. Make sure your CSV has a "Keyword" or "Keywords" header.'); return; }
    if (!result.keywords.length) { setParseError('No keywords found in the file.'); return; }
    if (!sourceLabel && result.sourceTool !== 'Unknown') setSourceLabel(result.sourceTool);
    setKeywords(prev => {
      const existingIds = new Set(prev.map(k => k.keyword.toLowerCase()));
      const fresh = result.keywords.filter(k => !existingIds.has(k.keyword.toLowerCase()));
      return applyBuckets([...prev, ...fresh]);
    });
    setPasteMode(false);
    setPasteText('');
  }

  function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => ingest(ev.target.result);
    reader.readAsText(file);
    e.target.value = '';
  }

  function removeKeyword(id) {
    setKeywords(prev => applyBuckets(prev.filter(k => k.id !== id)));
  }

  function updateKeyword(id, fields) {
    setKeywords(prev => prev.map(k => k.id === id ? { ...k, ...fields } : k));
  }

  function assignGroup(kwId, groupId) {
    setKeywords(prev => prev.map(k => k.id === kwId ? { ...k, groupId: groupId || null } : k));
  }

  function toggleSelect(id) {
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  }

  function selectAll() {
    const visible = filtered.filter(k => !k.groupId).map(k => k.id);
    setSelected(new Set(visible));
  }

  function addGroupFromSelected() {
    if (!selected.size) return;
    const g = newGroup();
    setGroups(prev => [...prev, g]);
    setKeywords(prev => prev.map(k => selected.has(k.id) ? { ...k, groupId: g.id } : k));
    setSelected(new Set());
  }

  function renameGroup(id, name) {
    setGroups(prev => prev.map(g => g.id === id ? { ...g, name } : g));
  }

  function deleteGroup(id) {
    setGroups(prev => prev.filter(g => g.id !== id));
    setKeywords(prev => prev.map(k => k.groupId === id ? { ...k, groupId: null } : k));
  }

  async function handleCluster() {
    if (!keywords.length) return;
    setClustering(true);
    setClusterError('');
    try {
      const kwText = keywords.map(k =>
        `${k.keyword}|vol:${k.volume ?? '?'}|comp:${k.competition ?? '?'}|diff:${k.difficulty ?? '?'}|B${k.bucket ?? '?'}`
      ).join('\n');
      const res = await fetch('/.netlify/functions/claude-process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'cluster_keywords', payload: { keywords: kwText } }),
      });
      const data = await res.json();
      if (!data.parsed?.groups) { setClusterError(data.error || 'Clustering failed.'); setClustering(false); return; }
      const newGroups = [];
      const kwUpdates = {};
      for (const cg of data.parsed.groups) {
        const g = newGroup(cg.name);
        newGroups.push(g);
        for (const kw of (cg.keywords || [])) {
          const match = keywords.find(k => k.keyword.toLowerCase() === kw.toLowerCase());
          if (match && !match.groupId) kwUpdates[match.id] = g.id;
        }
      }
      setGroups(prev => [...prev, ...newGroups]);
      setKeywords(prev => prev.map(k => kwUpdates[k.id] ? { ...k, groupId: kwUpdates[k.id] } : k));
    } catch (err) {
      setClusterError(err.message);
    }
    setClustering(false);
  }

  async function handleStartCollection(group, groupKws, collName, isNew) {
    if (isNew) {
      const { error } = await createCollection(collName);
      if (error && !error.message?.includes('unique')) return;
    }
    const { data: session } = await supabase
      .from('research_sessions')
      .insert({
        date: new Date().toISOString().slice(0, 10),
        collection: collName,
        source: sourceLabel || 'Keyword Explore',
        status: 'Needs More Data',
        notes: [
          context ? `Research context: ${context}` : '',
          `Imported from Explore — ${group.name}`,
        ].filter(Boolean).join('\n'),
      })
      .select('id')
      .single();

    if (session?.id) {
      const rows = groupKws.map(k => ({
        research_session_id: session.id,
        keyword:     k.keyword,
        volume:      k.volume,
        competition: k.competition,
        score:       k.score ?? null,
        bucket:      k.bucket,
        bucket_source: 'everbee_score',
        tag_type:    'watch',
        tags_only:   false,
      }));
      await supabase.from('keywords').insert(rows);
    }
    if (isNew) onCollectionCreated?.();
  }

  // Sort + filter
  const sorted = [...keywords].sort((a, b) => {
    if (sortBy === 'bucket')      return (a.bucket || 99) - (b.bucket || 99);
    if (sortBy === 'volume')      return (b.volume || 0) - (a.volume || 0);
    if (sortBy === 'competition') return (a.competition || 99999) - (b.competition || 99999);
    if (sortBy === 'difficulty')  return (a.difficulty || 99) - (b.difficulty || 99);
    return 0;
  });
  const filtered = filterBucket ? sorted.filter(k => k.bucket === filterBucket) : sorted;
  const ungrouped = filtered.filter(k => !k.groupId);
  const grouped = groups.map(g => ({ group: g, keywords: keywords.filter(k => k.groupId === g.id) }));

  const hasKeywords = keywords.length > 0;
  const sources = [...new Set(keywords.map(k => k.sourceTool).filter(Boolean).filter(s => s !== 'Unknown'))];

  return (
    <div>
      {/* Context note */}
      <div style={{ marginBottom: 14 }}>
        <input
          value={context}
          onChange={e => setContext(e.target.value)}
          placeholder="What are you researching and why? (e.g. 'animal meme shirts trending, want to test B1 signal before building')"
          style={{ width: '100%', fontSize: '0.78rem', padding: '8px 12px', boxSizing: 'border-box', borderRadius: 4, border: '1px solid rgba(43,41,38,0.15)', background: 'rgba(43,41,38,0.02)' }}
        />
      </div>

      {/* Input bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="btn btn-primary btn-sm" onClick={() => fileRef.current?.click()}>↑ Upload CSV</button>
        <input ref={fileRef} type="file" accept=".csv,.tsv,.txt" style={{ display: 'none' }} onChange={handleFile} />
        <button className="btn btn-ghost btn-sm" onClick={() => setPasteMode(!pasteMode)}>
          {pasteMode ? 'Cancel' : '⌘ Paste data'}
        </button>

        {sources.length > 0 && (
          <span style={{ fontSize: '0.68rem', color: 'var(--charcoal-soft)', padding: '3px 8px', background: 'rgba(43,41,38,0.06)', borderRadius: 20 }}>
            {sources.join(' + ')}
          </span>
        )}

        {hasKeywords && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            {selected.size > 0 && (
              <button className="btn btn-ghost btn-sm" onClick={addGroupFromSelected}>
                + Group {selected.size}
              </button>
            )}
            <button className="btn btn-ghost btn-sm" onClick={handleCluster} disabled={clustering}>
              {clustering ? 'Clustering…' : '✦ AI Group'}
            </button>
          </div>
        )}
      </div>

      {pasteMode && (
        <div style={{ marginBottom: 14 }}>
          <textarea
            value={pasteText}
            onChange={e => setPasteText(e.target.value)}
            placeholder="Paste CSV or tab-separated data here (with headers)…"
            rows={6}
            style={{ width: '100%', fontSize: '0.78rem', fontFamily: 'monospace', padding: 10, resize: 'vertical', boxSizing: 'border-box' }}
          />
          <button className="btn btn-primary btn-sm" onClick={() => ingest(pasteText)} disabled={!pasteText.trim()}>Import</button>
        </div>
      )}

      {parseError && (
        <div style={{ fontSize: '0.75rem', color: 'var(--alert)', marginBottom: 12, background: 'rgba(201,123,123,0.1)', padding: '8px 12px', borderRadius: 4 }}>
          {parseError}
        </div>
      )}
      {clusterError && <div style={{ fontSize: '0.75rem', color: 'var(--alert)', marginBottom: 12 }}>{clusterError}</div>}

      {!hasKeywords && !pasteMode && (
        <div className="empty-state">
          <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>🔍</div>
          <p>Upload a CSV from eRank or Everbee, or paste keyword data directly.</p>
          <p style={{ fontSize: '0.78rem', color: 'var(--charcoal-soft)', marginTop: 6 }}>
            Captures: volume, competition, keyword difficulty, Google searches, CTR, clicks, and trend.
          </p>
        </div>
      )}

      {hasKeywords && (
        <>
          {/* Opportunity panel */}
          <OpportunityPanel keywords={keywords} groups={groups} />

          {/* Sort + filter bar */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
            <BucketSummary keywords={keywords} />
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 3 }}>
              {[['bucket','Bucket'],['volume','Vol'],['competition','Comp'],['difficulty','Diff']].map(([k,l]) => (
                <button key={k}
                  className={`btn btn-sm ${sortBy === k ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setSortBy(k)}
                  style={{ fontSize: '0.65rem', padding: '3px 7px' }}>{l}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 3 }}>
              {[0,1,2,3].map(b => (
                <button key={b}
                  className={`btn btn-sm ${filterBucket === b ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setFilterBucket(filterBucket === b ? 0 : b)}
                  style={{ fontSize: '0.65rem', padding: '3px 7px' }}>{b === 0 ? 'All' : `B${b}`}</button>
              ))}
            </div>
          </div>

          {/* Groups */}
          {groups.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div className="section-label" style={{ marginBottom: 8 }}>Groups</div>
              {grouped.map(({ group, keywords: gkws }) => (
                <GroupCard key={group.id} group={group} keywords={gkws} collections={collections}
                  onStartCollection={handleStartCollection} onRename={renameGroup} onDelete={deleteGroup} />
              ))}
            </div>
          )}

          {/* Ungrouped */}
          {ungrouped.length > 0 && (
            <div>
              {groups.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <div className="section-label" style={{ margin: 0 }}>Ungrouped ({ungrouped.length})</div>
                  <button onClick={selectAll} style={{ fontSize: '0.65rem', color: 'var(--charcoal-soft)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                    select all
                  </button>
                </div>
              )}
              {ungrouped.map(kw => (
                <KeywordRow key={kw.id} kw={kw} groups={groups}
                  onAssignGroup={assignGroup} onRemove={removeKeyword}
                  onUpdate={updateKeyword}
                  selected={selected.has(kw.id)} onToggle={toggleSelect} />
              ))}
              {selected.size > 0 && (
                <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                  <button className="btn btn-ghost btn-sm" onClick={addGroupFromSelected}>+ Group {selected.size} selected</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set())} style={{ opacity: 0.5 }}>Clear</button>
                </div>
              )}
            </div>
          )}

          <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => fileRef.current?.click()} style={{ opacity: 0.6 }}>
              ↑ Add more keywords
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => { if (window.confirm('Clear all keywords and groups?')) { setKeywords([]); setGroups([]); setSelected(new Set()); setContext(''); } }}
              style={{ opacity: 0.4, marginLeft: 'auto' }}
            >Clear all</button>
          </div>
        </>
      )}
    </div>
  );
}
