import { useState, useRef } from 'react';
import { assignBucket, BucketBadge, BUCKET_STYLE } from '../lib/keywords';
import { supabase } from '../lib/supabase';
import { createCollection } from '../lib/hooks';

// ─── CSV / paste parser ───────────────────────────────────────────────────────

const COL_MAPS = {
  keyword:     ['keyword', 'keywords', 'search term', 'term', 'key phrase'],
  volume:      ['avg. searches', 'avg searches', 'average searches', 'search volume', 'monthly searches', 'searches', 'volume', 'avg. monthly searches'],
  competition: ['etsy competition', 'competition', 'competitors', 'competing listings', 'etsy listings', 'listing count'],
  clicks:      ['avg. clicks', 'avg clicks', 'average clicks', 'average clicks', 'clicks'],
  ctr:         ['avg. ctr', 'avg ctr', 'average ctr', 'ctr', 'click through rate'],
};

function detectColumn(headers, field) {
  const candidates = COL_MAPS[field];
  return headers.findIndex(h => candidates.some(c => h.toLowerCase().trim() === c));
}

function parseCSVText(text) {
  const lines = text.trim().split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];

  // Detect delimiter: tab or comma
  const delim = lines[0].includes('\t') ? '\t' : ',';

  const parseRow = (line) => {
    // Handle quoted CSV fields
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
  const kwIdx   = detectColumn(headers, 'keyword');
  const volIdx  = detectColumn(headers, 'volume');
  const compIdx = detectColumn(headers, 'competition');
  const clkIdx  = detectColumn(headers, 'clicks');
  const ctrIdx  = detectColumn(headers, 'ctr');

  if (kwIdx === -1) return null; // can't parse

  const keywords = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseRow(lines[i]);
    const kw = cols[kwIdx]?.replace(/^["']|["']$/g, '').trim();
    if (!kw) continue;
    const vol  = volIdx  !== -1 ? parseNum(cols[volIdx])  : null;
    const comp = compIdx !== -1 ? parseNum(cols[compIdx]) : null;
    keywords.push({
      id: `k-${i}`,
      keyword: kw,
      volume: vol,
      competition: comp,
      clicks: clkIdx !== -1 ? parseNum(cols[clkIdx]) : null,
      ctr:    ctrIdx !== -1 ? cols[ctrIdx]?.trim() || null : null,
    });
  }
  return keywords;
}

function parseNum(val) {
  if (!val) return null;
  const n = parseFloat(String(val).replace(/[^0-9.]/g, ''));
  return isNaN(n) ? null : Math.round(n);
}

// ─── Bucket assignment across a list ─────────────────────────────────────────

function assignBucketsToExplore(keywords) {
  const context = keywords.filter(k => k.volume != null && k.competition != null);
  return keywords.map(k => ({
    ...k,
    bucket: assignBucket(k.volume, k.competition, context),
  }));
}

// ─── Bucket summary bar ───────────────────────────────────────────────────────

function BucketSummary({ keywords }) {
  const b1 = keywords.filter(k => k.bucket === 1).length;
  const b2 = keywords.filter(k => k.bucket === 2).length;
  const b3 = keywords.filter(k => k.bucket === 3).length;
  const none = keywords.filter(k => !k.bucket).length;
  const total = keywords.length;
  if (!total) return null;

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
      {[{b:1,count:b1},{b:2,count:b2},{b:3,count:b3}].map(({b,count}) => (
        <span key={b} style={{
          fontSize: '0.7rem', fontWeight: 600, padding: '3px 10px', borderRadius: 20,
          background: BUCKET_STYLE[b].bg, color: BUCKET_STYLE[b].color,
          border: `1px solid ${BUCKET_STYLE[b].border}`,
        }}>
          B{b}: {count}
        </span>
      ))}
      {none > 0 && (
        <span style={{ fontSize: '0.7rem', color: 'var(--charcoal-soft)' }}>{none} unclassified</span>
      )}
      <span style={{ fontSize: '0.7rem', color: 'var(--charcoal-soft)', opacity: 0.5 }}>· {total} total</span>
    </div>
  );
}

// ─── Keyword row ──────────────────────────────────────────────────────────────

function KeywordRow({ kw, groups, onAssignGroup, onRemove, selected, onToggle }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '5px 10px',
      background: selected ? 'rgba(124,175,138,0.08)' : 'var(--charcoal-faint)',
      borderRadius: 2, marginBottom: 2,
      borderLeft: `3px solid ${kw.bucket ? BUCKET_STYLE[kw.bucket]?.border : 'transparent'}`,
    }}>
      <input type="checkbox" checked={selected} onChange={() => onToggle(kw.id)}
        style={{ width: 'auto', margin: 0, flexShrink: 0 }} />
      <span style={{ flex: 1, fontSize: '0.82rem', minWidth: 120 }}>{kw.keyword}</span>
      <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
        <BucketBadge bucket={kw.bucket} />
        {kw.volume != null && <span style={{ fontSize: '0.7rem', color: 'var(--charcoal-soft)' }}>vol {kw.volume.toLocaleString()}</span>}
        {kw.competition != null && <span style={{ fontSize: '0.7rem', color: 'var(--charcoal-soft)' }}>comp {kw.competition.toLocaleString()}</span>}
        {kw.ctr && <span style={{ fontSize: '0.7rem', color: 'var(--charcoal-soft)' }}>ctr {kw.ctr}</span>}
        <select
          value={kw.groupId || ''}
          onChange={e => onAssignGroup(kw.id, e.target.value || null)}
          onClick={e => e.stopPropagation()}
          style={{ fontSize: '0.68rem', padding: '2px 4px', maxWidth: 110, color: 'var(--charcoal-soft)' }}
        >
          <option value="">— group —</option>
          {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <button onClick={() => onRemove(kw.id)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--charcoal-soft)', fontSize: '0.7rem', opacity: 0.4, padding: 0 }}>✕</button>
      </span>
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

  const b1 = keywords.filter(k => k.bucket === 1).length;
  const strength = b1 >= 3 ? 'strong' : b1 >= 1 ? 'possible' : 'weak';
  const strengthColor = { strong: '#2d6b3c', possible: '#6b4a10', weak: 'var(--charcoal-soft)' }[strength];
  const strengthLabel = { strong: '● Strong signal', possible: '◐ Some signal', weak: '○ Weak signal' }[strength];

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
    <div style={{
      border: '1px solid rgba(43,41,38,0.1)', borderRadius: 4,
      padding: '12px 14px', background: 'var(--warm-white)', marginBottom: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        {nameEdit ? (
          <input value={name} onChange={e => setName(e.target.value)}
            onBlur={() => { onRename(group.id, name); setNameEdit(false); }}
            onKeyDown={e => e.key === 'Enter' && e.target.blur()}
            style={{ fontSize: '0.85rem', fontWeight: 600, flex: 1, padding: '2px 6px' }}
            autoFocus
          />
        ) : (
          <span style={{ fontWeight: 600, fontSize: '0.85rem', flex: 1, cursor: 'text' }}
            onClick={() => setNameEdit(true)}>{group.name}</span>
        )}
        <span style={{ fontSize: '0.68rem', fontWeight: 600, color: strengthColor }}>{strengthLabel}</span>
        <button onClick={() => onDelete(group.id)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--charcoal-soft)', fontSize: '0.75rem', opacity: 0.4 }}>🗑</button>
      </div>

      <BucketSummary keywords={keywords} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 10 }}>
        {keywords.map(kw => (
          <div key={kw.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem' }}>
            <BucketBadge bucket={kw.bucket} />
            <span>{kw.keyword}</span>
            {kw.volume != null && <span style={{ color: 'var(--charcoal-soft)', fontSize: '0.68rem' }}>vol {kw.volume.toLocaleString()}</span>}
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
        <button className="btn btn-ghost btn-sm" onClick={() => setConverting(true)}>
          → Start Collection
        </button>
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
  const [parseError, setParseError] = useState('');
  const [clustering, setClustering] = useState(false);
  const [clusterError, setClusterError] = useState('');
  const [pasteMode, setPasteMode] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const fileRef = useRef();

  function ingest(text) {
    setParseError('');
    const result = parseCSVText(text);
    if (!result) { setParseError('Could not detect keyword column. Make sure your CSV has a "Keyword" or "Keywords" header.'); return; }
    if (result.length === 0) { setParseError('No keywords found in the file.'); return; }
    const bucketed = assignBucketsToExplore(result);
    setKeywords(prev => {
      const existingIds = new Set(prev.map(k => k.keyword.toLowerCase()));
      const fresh = bucketed.filter(k => !existingIds.has(k.keyword.toLowerCase()));
      // re-assign buckets across merged set
      return assignBucketsToExplore([...prev, ...fresh]);
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

  function handlePaste() {
    if (!pasteText.trim()) return;
    ingest(pasteText);
  }

  function removeKeyword(id) {
    setKeywords(prev => {
      const next = prev.filter(k => k.id !== id);
      return assignBucketsToExplore(next);
    });
  }

  function assignGroup(kwId, groupId) {
    setKeywords(prev => prev.map(k => k.id === kwId ? { ...k, groupId: groupId || null } : k));
  }

  function toggleSelect(id) {
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
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
    if (keywords.length === 0) return;
    setClustering(true);
    setClusterError('');
    try {
      const kwText = keywords.map(k => `${k.keyword}|vol:${k.volume ?? '?'}|comp:${k.competition ?? '?'}|B${k.bucket ?? '?'}`).join('\n');
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
          if (match) kwUpdates[match.id] = g.id;
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

    // Create a research session for this group
    const { data: session } = await supabase
      .from('research_sessions')
      .insert({
        date: new Date().toISOString().slice(0, 10),
        collection: collName,
        source: 'Keyword Explore',
        status: 'Needs More Data',
        notes: `Imported from Explore — ${group.name}`,
      })
      .select('id')
      .single();

    if (session?.id) {
      const rows = groupKws.map(k => ({
        research_session_id: session.id,
        keyword: k.keyword,
        volume: k.volume,
        competition: k.competition,
        bucket: k.bucket,
        bucket_source: 'everbee_score',
        tag_type: 'watch',
        tags_only: false,
      }));
      await supabase.from('keywords').insert(rows);
    }

    if (isNew) onCollectionCreated?.();
  }

  // Sort + filter
  const sorted = [...keywords].sort((a, b) => {
    if (sortBy === 'bucket') return (a.bucket || 99) - (b.bucket || 99);
    if (sortBy === 'volume') return (b.volume || 0) - (a.volume || 0);
    if (sortBy === 'competition') return (a.competition || 99999) - (b.competition || 99999);
    return 0;
  });

  const filtered = filterBucket ? sorted.filter(k => k.bucket === filterBucket) : sorted;
  const ungrouped = filtered.filter(k => !k.groupId);
  const grouped   = groups.map(g => ({
    group: g,
    keywords: filtered.filter(k => k.groupId === g.id),
  }));

  const hasKeywords = keywords.length > 0;

  return (
    <div>
      {/* Input bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="btn btn-primary btn-sm" onClick={() => fileRef.current?.click()}>
          ↑ Upload CSV
        </button>
        <input ref={fileRef} type="file" accept=".csv,.tsv,.txt" style={{ display: 'none' }} onChange={handleFile} />
        <button className="btn btn-ghost btn-sm" onClick={() => setPasteMode(!pasteMode)}>
          {pasteMode ? 'Cancel paste' : '⌘ Paste data'}
        </button>
        {hasKeywords && (
          <>
            <button
              className="btn btn-ghost btn-sm"
              onClick={handleCluster}
              disabled={clustering}
              style={{ marginLeft: 'auto' }}
            >
              {clustering ? 'Clustering…' : '✦ AI Group'}
            </button>
            {selected.size > 0 && (
              <button className="btn btn-ghost btn-sm" onClick={addGroupFromSelected}>
                + Group {selected.size} selected
              </button>
            )}
          </>
        )}
      </div>

      {pasteMode && (
        <div style={{ marginBottom: 16 }}>
          <textarea
            value={pasteText}
            onChange={e => setPasteText(e.target.value)}
            placeholder="Paste CSV or tab-separated data here (with headers)…"
            rows={6}
            style={{ width: '100%', fontSize: '0.78rem', fontFamily: 'monospace', padding: 10, resize: 'vertical', boxSizing: 'border-box' }}
          />
          <button className="btn btn-primary btn-sm" onClick={handlePaste} disabled={!pasteText.trim()}>
            Import
          </button>
        </div>
      )}

      {parseError && (
        <div style={{ fontSize: '0.75rem', color: 'var(--alert)', marginBottom: 12, background: 'rgba(201,123,123,0.1)', padding: '8px 12px', borderRadius: 4 }}>
          {parseError}
        </div>
      )}

      {clusterError && (
        <div style={{ fontSize: '0.75rem', color: 'var(--alert)', marginBottom: 12 }}>{clusterError}</div>
      )}

      {!hasKeywords && !pasteMode && (
        <div className="empty-state">
          <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>🔍</div>
          <p>Upload a CSV from eRank or Everbee, or paste keyword data directly.</p>
          <p style={{ fontSize: '0.78rem', color: 'var(--charcoal-soft)', marginTop: 6 }}>
            Buckets are auto-assigned based on volume + competition across your dataset.
          </p>
        </div>
      )}

      {hasKeywords && (
        <>
          {/* Controls */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
            <BucketSummary keywords={keywords} />
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
              {[['bucket','Bucket'],['volume','Vol ↓'],['competition','Comp ↑']].map(([k,l]) => (
                <button key={k}
                  className={`btn btn-sm ${sortBy === k ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setSortBy(k)}
                  style={{ fontSize: '0.68rem', padding: '3px 8px' }}
                >{l}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {[0,1,2,3].map(b => (
                <button key={b}
                  className={`btn btn-sm ${filterBucket === b ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setFilterBucket(filterBucket === b ? 0 : b)}
                  style={{ fontSize: '0.68rem', padding: '3px 8px' }}
                >{b === 0 ? 'All' : `B${b}`}</button>
              ))}
            </div>
          </div>

          {/* Groups panel */}
          {groups.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div className="section-label" style={{ marginBottom: 8 }}>Groups</div>
              {grouped.map(({ group, keywords: gkws }) => (
                <GroupCard
                  key={group.id}
                  group={group}
                  keywords={gkws}
                  collections={collections}
                  onStartCollection={handleStartCollection}
                  onRename={renameGroup}
                  onDelete={deleteGroup}
                />
              ))}
            </div>
          )}

          {/* Ungrouped keywords */}
          {ungrouped.length > 0 && (
            <div>
              {groups.length > 0 && <div className="section-label" style={{ marginBottom: 8 }}>Ungrouped</div>}
              {ungrouped.map(kw => (
                <KeywordRow
                  key={kw.id}
                  kw={kw}
                  groups={groups}
                  onAssignGroup={assignGroup}
                  onRemove={removeKeyword}
                  selected={selected.has(kw.id)}
                  onToggle={toggleSelect}
                />
              ))}
              {selected.size > 0 && (
                <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                  <button className="btn btn-ghost btn-sm" onClick={addGroupFromSelected}>
                    + Group {selected.size} selected
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set())} style={{ opacity: 0.5 }}>
                    Clear
                  </button>
                </div>
              )}
            </div>
          )}

          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => fileRef.current?.click()} style={{ opacity: 0.6 }}>
              ↑ Add more keywords
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => { if (window.confirm('Clear all keywords?')) { setKeywords([]); setGroups([]); setSelected(new Set()); } }}
              style={{ opacity: 0.4, marginLeft: 'auto' }}
            >
              Clear all
            </button>
          </div>
        </>
      )}
    </div>
  );
}
