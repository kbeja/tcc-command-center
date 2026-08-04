import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useResearchSessions, useCollections, useCollectionObjects, useChapters, createCollection, deleteCollection, updateKeyword, deleteKeyword } from '../lib/hooks';
import ResearchSessionCard from '../components/ResearchSessionCard';
import ResearchSessionForm from '../components/ResearchSessionForm';
import KeywordExplore from '../components/KeywordExplore';
import { assignBucket, BucketBadge, BUCKET_STYLE } from '../lib/keywords';

const SEASONS = ['Halloween', 'Christmas', 'Valentine\'s Day', 'Mother\'s Day', 'Back to School', 'Summer', 'Spring', 'Fall'];

function CollectionsManager({ refetch: refetchNames }) {
  const { collections: collObjs, refetch } = useCollectionObjects();
  const { chapters } = useChapters();
  const [newName, setNewName]           = useState('');
  const [newChapter, setNewChapter]     = useState('');
  const [newSeason, setNewSeason]       = useState('');
  const [newLaunch, setNewLaunch]       = useState('');
  const [saving, setSaving]             = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [error, setError]               = useState('');

  async function handleAdd() {
    const name = newName.trim();
    if (!name) return;
    setSaving(true);
    setError('');
    const { error } = await createCollection(name, {
      ...(newChapter ? { chapter: newChapter } : {}),
      ...(newSeason  ? { season: newSeason }   : {}),
      ...(newLaunch  ? { launch_date: newLaunch } : {}),
    });
    if (error) {
      setError(error.message?.includes('unique') ? 'A collection with that name already exists.' : 'Could not save.');
    } else {
      setNewName(''); setNewChapter(''); setNewSeason(''); setNewLaunch('');
      refetch(); refetchNames?.();
    }
    setSaving(false);
  }

  async function handleDelete(name) {
    await deleteCollection(name);
    setConfirmDelete(null);
    refetch(); refetchNames?.();
  }

  // Group by chapter
  const byChapter = {};
  for (const c of collObjs) {
    const ch = c.chapter || 'Other';
    if (!byChapter[ch]) byChapter[ch] = [];
    byChapter[ch].push(c);
  }
  const sortedChapters = [...new Set([...chapters, ...Object.keys(byChapter)])];

  return (
    <div>
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="section-label" style={{ marginBottom: 12 }}>Add Collection</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Name</label>
            <input value={newName} onChange={e => setNewName(e.target.value)}
              placeholder="e.g. Dark Academia" onKeyDown={e => e.key === 'Enter' && handleAdd()} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Chapter</label>
            <select value={newChapter} onChange={e => setNewChapter(e.target.value)}>
              <option value="">— None —</option>
              {chapters.map(ch => <option key={ch} value={ch}>{ch}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Season <span style={{ fontWeight: 400, opacity: 0.5 }}>(optional)</span></label>
            <select value={newSeason} onChange={e => setNewSeason(e.target.value)}>
              <option value="">— Evergreen —</option>
              {SEASONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Target launch <span style={{ fontWeight: 400, opacity: 0.5 }}>(optional)</span></label>
            <input type="date" value={newLaunch} onChange={e => setNewLaunch(e.target.value)} />
          </div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={handleAdd} disabled={!newName.trim() || saving}>
          {saving ? 'Saving…' : 'Add Collection'}
        </button>
        {error && <div style={{ fontSize: '0.75rem', color: 'var(--alert)', marginTop: 6 }}>{error}</div>}
      </div>

      <div className="section-label" style={{ marginBottom: 10 }}>Your Collections</div>
      {sortedChapters.map(ch => {
        const items = byChapter[ch];
        if (!items?.length) return null;
        return (
          <div key={ch} style={{ marginBottom: 20 }}>
            <div style={{ fontSize: '0.7rem', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--charcoal-soft)', marginBottom: 6, paddingBottom: 4, borderBottom: '1px solid rgba(43,41,38,0.08)' }}>{ch}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {items.map(c => (
                <div key={c.name} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '9px 14px', background: 'var(--warm-white)',
                  border: '1px solid rgba(43,41,38,0.08)', borderRadius: 2,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: '0.85rem' }}>{c.name}</span>
                    {c.season && (
                      <span style={{ fontSize: '0.65rem', padding: '2px 8px', borderRadius: 10, background: 'rgba(188,100,90,0.12)', color: 'var(--dusty-rose)', fontWeight: 500 }}>
                        {c.season}{c.launch_date ? ` · ${new Date(c.launch_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}
                      </span>
                    )}
                  </div>
                  {confirmDelete === c.name ? (
                    <span style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.75rem' }}>
                      <span style={{ color: 'var(--charcoal-soft)' }}>Delete?</span>
                      <button onClick={() => handleDelete(c.name)} style={{ color: 'var(--alert)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer' }}>Yes</button>
                      <button onClick={() => setConfirmDelete(null)} style={{ color: 'var(--charcoal-soft)', background: 'none', border: 'none', cursor: 'pointer' }}>Cancel</button>
                    </span>
                  ) : (
                    <button onClick={() => setConfirmDelete(c.name)} style={{ color: 'var(--charcoal-soft)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem', opacity: 0.5 }}>🗑</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SourceCompare() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [filterCollection, setFilter] = useState('');
  const { collections } = useCollections();

  useEffect(() => {
    async function load() {
      setLoading(true);
      setErr('');
      const { data, error } = await supabase
        .from('keywords')
        .select('keyword, volume, competition, score, bucket, research_session_id, research_sessions(source, collection)');
      if (error) { setErr(error.message); setLoading(false); return; }
      if (!data || data.length === 0) { setLoading(false); return; }
      const withSession = data.filter(k => k.research_session_id && k.research_sessions);

      // Group by lowercase keyword
      const map = {};
      for (const k of withSession) {
        const key = k.keyword?.toLowerCase().trim();
        if (!key) continue;
        if (!map[key]) map[key] = { keyword: k.keyword, entries: [] };
        map[key].entries.push({
          source: k.research_sessions?.source || '—',
          collection: k.research_sessions?.collection || '—',
          volume: k.volume,
          competition: k.competition,
          score: k.score,
        });
      }

      // Keep only keywords that appear in both eRank and Everbee
      const conflicts = Object.values(map).filter(r => {
        const sources = new Set(r.entries.map(e => e.source?.toLowerCase()));
        return sources.has('erank') && r.entries.some(e => e.source?.toLowerCase() !== 'erank');
      }).map(r => {
        const erank   = r.entries.find(e => e.source?.toLowerCase() === 'erank');
        const everbee = r.entries.find(e => e.source?.toLowerCase() !== 'erank');
        const volDiff = (erank?.volume != null && everbee?.volume != null)
          ? Math.abs(erank.volume - everbee.volume) : null;
        const compDiff = (erank?.competition != null && everbee?.competition != null)
          ? Math.abs(erank.competition - everbee.competition) : null;
        return { keyword: r.keyword, erank, everbee, volDiff, compDiff,
          collection: erank?.collection || everbee?.collection };
      }).sort((a, b) => (b.volDiff || 0) - (a.volDiff || 0));

      setRows(conflicts);
      setLoading(false);
    }
    load();
  }, []);

  const visible = filterCollection ? rows.filter(r => r.collection === filterCollection) : rows;

  const cell = (val, alt, diff, pct) => (
    <td style={{ fontSize: '0.72rem', padding: '4px 8px', verticalAlign: 'middle' }}>
      <div>{val != null ? val.toLocaleString() : '—'}</div>
      {alt != null && diff != null && (
        <div style={{ fontSize: '0.62rem', color: pct > 30 ? '#7a2b2b' : 'var(--charcoal-soft)', opacity: 0.7 }}>
          vs {alt.toLocaleString()} {pct != null ? `(${pct}% diff)` : ''}
        </div>
      )}
    </td>
  );

  return (
    <div style={{ paddingTop: 8 }}>
      <p style={{ fontSize: '0.78rem', color: 'var(--charcoal-soft)', marginBottom: 12 }}>
        Keywords appearing in both eRank and Everbee sessions — sorted by volume discrepancy.
      </p>
      <div style={{ marginBottom: 12 }}>
        <select value={filterCollection} onChange={e => setFilter(e.target.value)} style={{ fontSize: '0.78rem' }}>
          <option value="">All collections</option>
          {collections.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      {loading && <div style={{ color: 'var(--charcoal-soft)', fontSize: '0.85rem' }}>Loading…</div>}
      {err && <div style={{ color: 'var(--alert)', fontSize: '0.82rem', padding: '10px 0' }}>Error: {err}</div>}
      {!loading && !err && visible.length === 0 && (
        <div className="empty-state">
          <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>📊</div>
          <p style={{ marginBottom: 6 }}>No cross-source keyword matches yet.</p>
          <p style={{ fontSize: '0.72rem', color: 'var(--charcoal-soft)', lineHeight: 1.6 }}>
            This tab shows keywords that appear in <strong>both</strong> an eRank session and an Everbee session so you can compare their volume and competition numbers side by side. Research the same keyword in both tools to see discrepancies here.
          </p>
        </div>
      )}
      {!loading && visible.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(43,41,38,0.12)', textAlign: 'left' }}>
                <th style={{ padding: '6px 8px', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--charcoal-soft)' }}>Keyword</th>
                <th style={{ padding: '6px 8px', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--charcoal-soft)' }}>Collection</th>
                <th style={{ padding: '6px 8px', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#2d6b3c' }}>eRank Vol</th>
                <th style={{ padding: '6px 8px', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6b4a10' }}>Everbee Vol</th>
                <th style={{ padding: '6px 8px', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#2d6b3c' }}>eRank Comp</th>
                <th style={{ padding: '6px 8px', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6b4a10' }}>Everbee Comp</th>
                <th style={{ padding: '6px 8px', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--charcoal-soft)' }}>eRank KD</th>
                <th style={{ padding: '6px 8px', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--charcoal-soft)' }}>Everbee Score</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r, i) => {
                const volPct = (r.erank?.volume && r.everbee?.volume)
                  ? Math.round(Math.abs(r.erank.volume - r.everbee.volume) / Math.max(r.erank.volume, r.everbee.volume) * 100) : null;
                const compPct = (r.erank?.competition && r.everbee?.competition)
                  ? Math.round(Math.abs(r.erank.competition - r.everbee.competition) / Math.max(r.erank.competition, r.everbee.competition) * 100) : null;
                return (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(43,41,38,0.06)' }}>
                    <td style={{ padding: '4px 8px', fontWeight: 500, fontSize: '0.78rem' }}>{r.keyword}</td>
                    <td style={{ padding: '4px 8px', fontSize: '0.68rem', color: 'var(--charcoal-soft)' }}>{r.collection}</td>
                    {cell(r.erank?.volume, r.everbee?.volume, r.volDiff, volPct)}
                    {cell(r.everbee?.volume, r.erank?.volume, r.volDiff, volPct)}
                    {cell(r.erank?.competition, r.everbee?.competition, r.compDiff, compPct)}
                    {cell(r.everbee?.competition, r.erank?.competition, r.compDiff, compPct)}
                    <td style={{ padding: '4px 8px', fontSize: '0.72rem', color: 'var(--charcoal-soft)' }}>{r.erank?.score ?? '—'}</td>
                    <td style={{ padding: '4px 8px', fontSize: '0.72rem', color: 'var(--charcoal-soft)' }}>{r.everbee?.score ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const BUCKET_LABELS = { 1: 'B1 Visibility', 2: 'B2 Reach', 3: 'B3 Bestseller' };

function KeywordList({ collectionObjects, chapters, onAddSession }) {
  const [keywords, setKeywords]       = useState([]);
  const [loading, setLoading]         = useState(true);
  const [filterChapter, setFilterChapter] = useState('');
  const [filterCollection, setFilterCollection] = useState('');
  const [filterBucket, setFilterBucket]   = useState('');
  const [search, setSearch]           = useState('');
  const [editId, setEditId]           = useState(null);
  const [editVals, setEditVals]       = useState({});
  const [saving, setSaving]           = useState(false);
  const [rebucketing, setRebucketing] = useState(false);
  const [rebucketResult, setRebucketResult] = useState(null);

  const colChapterMap = {};
  for (const c of collectionObjects) {
    if (c.name && c.chapter) colChapterMap[c.name] = c.chapter;
  }

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('keywords')
      .select('*, research_sessions(id, collection, source, date)')
      .not('research_session_id', 'is', null)
      .order('keyword', { ascending: true });
    setKeywords(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Derived filter options
  const visibleCollections = filterChapter
    ? collectionObjects.filter(c => colChapterMap[c.name] === filterChapter).map(c => c.name)
    : collectionObjects.map(c => c.name);

  const filtered = keywords.filter(k => {
    const col = k.research_sessions?.collection || '';
    const ch  = colChapterMap[col] || '';
    if (filterChapter && ch !== filterChapter) return false;
    if (filterCollection && col !== filterCollection) return false;
    if (filterBucket && k.bucket !== Number(filterBucket)) return false;
    if (search && !k.keyword?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  function startEdit(k) {
    setEditId(k.id);
    setEditVals({ bucket: k.bucket ?? '', volume: k.volume ?? '', competition: k.competition ?? '', score: k.score ?? '' });
  }

  async function saveEdit(id) {
    setSaving(true);
    const updates = {};
    if (editVals.bucket !== '')     updates.bucket      = Number(editVals.bucket) || null;
    if (editVals.volume !== '')     updates.volume      = Number(editVals.volume) || null;
    if (editVals.competition !== '') updates.competition = Number(editVals.competition) || null;
    if (editVals.score !== '')      updates.score       = Number(editVals.score) || null;
    if (updates.bucket) updates.bucket_source = 'manual';
    await updateKeyword(id, updates);
    await load();
    setEditId(null);
    setSaving(false);
  }

  async function handleDelete(id) {
    await deleteKeyword(id);
    setKeywords(prev => prev.filter(k => k.id !== id));
  }

  async function handleRebucket() {
    setRebucketing(true);
    setRebucketResult(null);
    const toUpdate = keywords.filter(k => k.volume != null && k.competition != null);
    let updated = 0;
    let skipped = 0;
    for (const k of toUpdate) {
      const newBucket = assignBucket(k.volume, k.competition);
      if (newBucket !== k.bucket) {
        await updateKeyword(k.id, { bucket: newBucket, bucket_source: newBucket ? 'manual' : null });
        updated++;
      } else {
        skipped++;
      }
    }
    await load();
    setRebucketResult({ updated, skipped, noMetrics: keywords.length - toUpdate.length });
    setRebucketing(false);
  }

  const bucketCounts = { 1: 0, 2: 0, 3: 0, null: 0 };
  for (const k of filtered) bucketCounts[k.bucket ?? 'null']++;

  return (
    <div>
      {/* Search + add */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search keywords…"
          style={{ flex: 1, fontSize: '0.82rem', padding: '6px 10px' }}
        />
        <button className="btn btn-ghost btn-sm" onClick={handleRebucket} disabled={rebucketing}
          title="Re-run bucket assignment on all keywords that have volume + competition data">
          {rebucketing ? 'Re-bucketing…' : '⟳ Re-bucket all'}
        </button>
        <button className="btn btn-primary btn-sm" onClick={onAddSession}>+ Add Session</button>
      </div>
      {rebucketResult && (
        <div style={{ fontSize: '0.72rem', color: 'var(--charcoal-soft)', marginBottom: 10 }}>
          ✓ {rebucketResult.updated} updated · {rebucketResult.skipped} already correct · {rebucketResult.noMetrics} skipped (no metrics)
        </div>
      )}

      {/* Chapter filter */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        <button className={`btn btn-sm ${!filterChapter ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => { setFilterChapter(''); setFilterCollection(''); }}>
          All chapters
        </button>
        {chapters.map(ch => (
          <button key={ch} className={`btn btn-sm ${filterChapter === ch ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => { setFilterChapter(ch); setFilterCollection(''); }}>
            {ch}
          </button>
        ))}
        {keywords.some(k => !colChapterMap[k.research_sessions?.collection]) && (
          <button className={`btn btn-sm ${filterChapter === '__other' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => { setFilterChapter('__other'); setFilterCollection(''); }}>
            Other
          </button>
        )}
      </div>

      {/* Collection filter */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        <button className={`btn btn-sm ${!filterCollection ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setFilterCollection('')}>
          All collections
        </button>
        {visibleCollections.map(col => (
          <button key={col} className={`btn btn-sm ${filterCollection === col ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setFilterCollection(filterCollection === col ? '' : col)}
            style={{ fontSize: '0.7rem' }}>
            {col}
          </button>
        ))}
      </div>

      {/* Bucket filter + counts */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
        <button className={`btn btn-sm ${!filterBucket ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setFilterBucket('')}>
          All buckets ({filtered.length})
        </button>
        {[1, 2, 3].map(b => {
          const count = filtered.filter(k => k.bucket === b).length;
          return (
            <button key={b} className={`btn btn-sm ${filterBucket === String(b) ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setFilterBucket(filterBucket === String(b) ? '' : String(b))}
              style={{ fontSize: '0.7rem', color: BUCKET_STYLE[b].color }}>
              B{b} ({count})
            </button>
          );
        })}
        {bucketCounts.null > 0 && (
          <button className={`btn btn-sm ${filterBucket === '0' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setFilterBucket(filterBucket === '0' ? '' : '0')}
            style={{ fontSize: '0.7rem', color: 'var(--charcoal-soft)' }}>
            Unclassified ({bucketCounts.null})
          </button>
        )}
      </div>

      {loading && <div style={{ color: 'var(--charcoal-soft)', fontSize: '0.85rem' }}>Loading…</div>}

      {!loading && filtered.length === 0 && (
        <div className="empty-state">
          <p>No keywords match these filters.</p>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* Header */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 48px 72px 80px 56px 100px 80px 36px', gap: 8, padding: '4px 10px', fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--charcoal-soft)' }}>
            <span>Keyword</span><span>Bucket</span><span>Vol</span><span>Comp</span><span>KD</span><span>Collection</span><span>Source</span><span></span>
          </div>

          {filtered.map(k => {
            const col = k.research_sessions?.collection || '—';
            const src = k.research_sessions?.source || '—';
            const isEditing = editId === k.id;

            if (isEditing) return (
              <div key={k.id} style={{ display: 'grid', gridTemplateColumns: '1fr 48px 72px 80px 56px 100px 80px 36px', gap: 8, padding: '8px 10px', background: 'rgba(188,100,90,0.06)', border: '1px solid rgba(188,100,90,0.2)', borderRadius: 4, alignItems: 'center' }}>
                <span style={{ fontSize: '0.82rem', fontWeight: 500 }}>{k.keyword}</span>
                <select value={editVals.bucket} onChange={e => setEditVals(v => ({ ...v, bucket: e.target.value }))} style={{ fontSize: '0.72rem', padding: '2px 4px' }}>
                  <option value="">—</option>
                  {[1,2,3].map(b => <option key={b} value={b}>B{b}</option>)}
                </select>
                <input value={editVals.volume} onChange={e => setEditVals(v => ({ ...v, volume: e.target.value }))} style={{ fontSize: '0.72rem', padding: '2px 4px', width: '100%' }} placeholder="vol" />
                <input value={editVals.competition} onChange={e => setEditVals(v => ({ ...v, competition: e.target.value }))} style={{ fontSize: '0.72rem', padding: '2px 4px', width: '100%' }} placeholder="comp" />
                <input value={editVals.score} onChange={e => setEditVals(v => ({ ...v, score: e.target.value }))} style={{ fontSize: '0.72rem', padding: '2px 4px', width: '100%' }} placeholder="KD" />
                <span style={{ fontSize: '0.7rem', color: 'var(--charcoal-soft)' }}>{col}</span>
                <span style={{ fontSize: '0.7rem', color: 'var(--charcoal-soft)' }}>{src}</span>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button className="btn btn-primary btn-sm" onClick={() => saveEdit(k.id)} disabled={saving} style={{ fontSize: '0.65rem', padding: '2px 6px' }}>✓</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditId(null)} style={{ fontSize: '0.65rem', padding: '2px 6px' }}>✕</button>
                </div>
              </div>
            );

            return (
              <div key={k.id} style={{ display: 'grid', gridTemplateColumns: '1fr 48px 72px 80px 56px 100px 80px 36px', gap: 8, padding: '7px 10px', background: 'var(--warm-white)', border: '1px solid rgba(43,41,38,0.07)', borderRadius: 3, alignItems: 'center' }}>
                <span style={{ fontSize: '0.82rem', fontWeight: 500 }}>{k.keyword}{k.tags_only && <span style={{ fontSize: '0.6rem', color: 'var(--charcoal-soft)', marginLeft: 4 }}>tag</span>}</span>
                <span><BucketBadge bucket={k.bucket} /></span>
                <span style={{ fontSize: '0.72rem', color: 'var(--charcoal-soft)' }}>{k.volume?.toLocaleString() ?? '—'}</span>
                <span style={{ fontSize: '0.72rem', color: 'var(--charcoal-soft)' }}>{k.competition?.toLocaleString() ?? '—'}</span>
                <span style={{ fontSize: '0.72rem', color: k.score >= 70 ? '#7a2b2b' : k.score >= 40 ? '#6b4a10' : k.score ? '#2d6b3c' : 'var(--charcoal-soft)' }}>{k.score ?? '—'}</span>
                <span style={{ fontSize: '0.68rem', color: 'var(--charcoal-soft)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{col}</span>
                <span style={{ fontSize: '0.68rem', color: 'var(--charcoal-soft)' }}>{src}</span>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button onClick={() => startEdit(k)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--charcoal-soft)', fontSize: '0.75rem', padding: '2px' }}>✎</button>
                  <button onClick={() => handleDelete(k.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--charcoal-soft)', fontSize: '0.75rem', padding: '2px', opacity: 0.4 }}>🗑</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function Research() {
  const [tab, setTab] = useState('keywords');
  const [filterChapter, setFilterChapter] = useState('');
  const [filterCollection, setFilterCollection] = useState('');
  const { sessions, loading, refetch } = useResearchSessions(filterCollection || undefined);
  const { collections, refetch: refetchCollections } = useCollections();
  const { collections: collectionObjects } = useCollectionObjects();
  const { chapters } = useChapters();
  const [adding, setAdding] = useState(false);

  // Build a map of collection name → chapter
  const colChapterMap = {};
  for (const c of collectionObjects) {
    if (c.name && c.chapter) colChapterMap[c.name] = c.chapter;
  }

  // Filter by chapter (derived from collection's chapter, not session's parent_niche)
  const visibleSessions = filterChapter === '__other'
    ? sessions.filter(s => !colChapterMap[s.collection])
    : filterChapter
    ? sessions.filter(s => colChapterMap[s.collection] === filterChapter)
    : sessions;

  // Group by chapter → collection (using the collections table, not parent_niche)
  const hierarchy = visibleSessions.reduce((acc, s) => {
    const chapter = colChapterMap[s.collection] || 'Other';
    const col = s.collection || 'Other';
    if (!acc[chapter]) acc[chapter] = {};
    if (!acc[chapter][col]) acc[chapter][col] = [];
    acc[chapter][col].push(s);
    return acc;
  }, {});

  // Sort: known chapters first, then Other
  const parentOrder = [...chapters, 'Other'];
  const sortedParents = Object.keys(hierarchy).sort((a, b) => {
    const ai = parentOrder.indexOf(a), bi = parentOrder.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  const totalSessions = visibleSessions.length;

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div className="page-title">Research</div>
          {(tab === 'sessions') && (
            <button className="btn btn-primary btn-sm" onClick={() => setAdding(!adding)}>
              {adding ? 'Cancel' : '+ Add Session'}
            </button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
          <button className={`btn btn-sm ${tab === 'keywords' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('keywords')}>Keywords</button>
          <button className={`btn btn-sm ${tab === 'sessions' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('sessions')}>Sessions</button>
          <button className={`btn btn-sm ${tab === 'collections' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('collections')}>Collections</button>
          <button className={`btn btn-sm ${tab === 'explore' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('explore')}>Explore</button>
          <button className={`btn btn-sm ${tab === 'compare' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('compare')}>Compare Sources</button>
        </div>
      </div>

      {tab === 'keywords' && (
        <>
          {adding && (
            <div className="card" style={{ marginBottom: 20 }}>
              <ResearchSessionForm
                defaultCollection={collections[0] || ''}
                onSaved={() => { setAdding(false); refetch(); }}
                onCancel={() => setAdding(false)}
              />
            </div>
          )}
          <KeywordList
            collectionObjects={collectionObjects}
            chapters={chapters}
            onAddSession={() => setAdding(a => !a)}
          />
        </>
      )}

      {tab === 'collections' && (
        <CollectionsManager refetch={refetchCollections} />
      )}

      {tab === 'explore' && (
        <KeywordExplore
          collections={collections}
          onCollectionCreated={refetchCollections}
        />
      )}

      {tab === 'compare' && <SourceCompare />}

      {tab === 'sessions' && (
        <>
          {adding && (
            <div className="card" style={{ marginBottom: 20 }}>
              <ResearchSessionForm
                defaultCollection={collections[0] || ''}
                onSaved={() => { setAdding(false); refetch(); }}
                onCancel={() => setAdding(false)}
              />
            </div>
          )}

          {/* Chapter filter bar */}
          <div style={{ marginBottom: 20, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              className={`btn btn-sm ${!filterChapter ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setFilterChapter('')}
            >
              All ({sessions.length})
            </button>
            {chapters.map(ch => {
              const count = sessions.filter(s => colChapterMap[s.collection] === ch).length;
              if (!count) return null;
              return (
                <button
                  key={ch}
                  className={`btn btn-sm ${filterChapter === ch ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setFilterChapter(filterChapter === ch ? '' : ch)}
                >
                  {ch} ({count})
                </button>
              );
            })}
            {sessions.some(s => !colChapterMap[s.collection]) && (
              <button
                className={`btn btn-sm ${filterChapter === '__other' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setFilterChapter(filterChapter === '__other' ? '' : '__other')}
              >
                Other ({sessions.filter(s => !colChapterMap[s.collection]).length})
              </button>
            )}
          </div>

          {loading && <div style={{ color: 'var(--charcoal-soft)', fontSize: '0.85rem' }}>Loading…</div>}

          {!loading && sessions.length === 0 && (
            <div className="empty-state">
              <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>🔬</div>
              <p>No research sessions yet. Add one to start tracking keyword research by collection.</p>
            </div>
          )}

          {!loading && sessions.length > 0 && sortedParents.map(parent => {
            const cols = hierarchy[parent];
            if (!cols) return null;
            const parentSessions = Object.values(cols).flat();
            const kwTotal = parentSessions.reduce((s, r) => s + (r.keywords?.length || 0), 0);
            return (
              <div key={parent} style={{ marginBottom: 32 }}>
                {/* Chapter header — only show when "All" is active */}
                {!filterChapter && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14,
                    paddingBottom: 8, borderBottom: '2px solid rgba(43,41,38,0.15)',
                  }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem' }}>{parent}</div>
                    <span style={{ fontSize: '0.7rem', color: 'var(--charcoal-soft)' }}>
                      {parentSessions.length} sessions · {kwTotal} keywords
                    </span>
                  </div>
                )}

                {/* Collections within chapter */}
                {Object.keys(cols).sort().map(col => (
                  <div key={col} style={{ marginBottom: 20, paddingLeft: filterChapter ? 0 : 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      {!filterChapter && (
                        <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--dusty-rose)', flexShrink: 0 }} />
                      )}
                      <div className="section-label" style={{ margin: 0 }}>{col}</div>
                      <span style={{ fontSize: '0.68rem', color: 'var(--charcoal-soft)' }}>
                        {cols[col].length} session{cols[col].length !== 1 ? 's' : ''} · {cols[col].reduce((s, r) => s + (r.keywords?.length || 0), 0)} keywords
                      </span>
                    </div>
                    <div className="card">
                      {cols[col].map(s => (
                        <ResearchSessionCard key={s.id} session={s} onDeleted={refetch} onUpdated={refetch} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
