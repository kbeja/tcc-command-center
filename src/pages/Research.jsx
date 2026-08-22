import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useResearchSessions, useProducts, createCollection, deleteCollection, updateKeyword, deleteKeyword, recomputeKeywordInterpretation } from '../lib/hooks';
import { useCollectionsContext } from '../context/CollectionsContext';
import ResearchSessionCard from '../components/ResearchSessionCard';
import ResearchSessionForm from '../components/ResearchSessionForm';
import EtsyInsightsCapture from '../components/EtsyInsightsCapture';
import KeywordExplore from '../components/KeywordExplore';
import KeywordDetail from '../components/KeywordDetail';
import ConfirmButton from '../components/ConfirmButton';
import { assignBucket, BucketBadge, BUCKET_STYLE, isLowQualityKeyword, ClassificationBadge, ConfidenceBadge, StatusBadge, TrendIndicator, DisagreementFlag } from '../lib/keywords';
import { CLASSIFICATIONS, CONFIDENCE_LEVELS, TREND_CLASSIFICATIONS, RESEARCH_STATUSES } from '../lib/keywordIntelligence';

// Plain filter-state presets (not a persisted "saved views" feature) for the
// five named quick views from the spec. Applied on top of, not instead of,
// the manual classification/confidence/trend/status filters below.
const KEYWORD_PRESETS = {
  emerging:    { label: 'Emerging Opportunities', test: k => k.classification === 'Emerging Unicorn' },
  unicorn:     { label: 'Unicorn Candidates',      test: k => k.classification === 'Strong Unicorn' || k.classification === 'Emerging Unicorn' },
  investigate: { label: 'Needs Investigation',     test: k => k.classification === 'Suspect / Low Confidence' || k.disagreement_flag },
  seasonal:    { label: 'Seasonal Opportunities',   test: k => k.classification === 'Seasonal' || k.trend_classification === 'Seasonal' },
  evergreen:   { label: 'Evergreen Foundation',     test: k => k.classification === 'Evergreen' },
};

const SEASONS = ['Halloween', 'Christmas', 'Valentine\'s Day', 'Mother\'s Day', 'Back to School', '4th of July', 'Summer', 'Spring', 'Fall'];

function CollectionsManager({ refetch: refetchNames }) {
  const { collectionObjects: collObjs, refetchCollectionObjects: refetch, chapters } = useCollectionsContext();
  const [newName, setNewName]           = useState('');
  const [newChapter, setNewChapter]     = useState('');
  const [newSeason, setNewSeason]       = useState('');
  const [newLaunch, setNewLaunch]       = useState('');
  const [saving, setSaving]             = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [error, setError]               = useState('');
  const [adding, setAdding]             = useState(false);

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
      setAdding(false);
      refetch(); refetchNames?.();
    }
    setSaving(false);
  }

  async function handleDelete(id) {
    await deleteCollection(id);
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: adding ? 12 : 20 }}>
        <div className="section-label" style={{ margin: 0 }}>Your Collections</div>
        {!adding && (
          <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>+ Add</button>
        )}
      </div>

      {adding && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="section-label" style={{ marginBottom: 12 }}>Add Collection</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Name</label>
              <input autoFocus value={newName} onChange={e => setNewName(e.target.value)}
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
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={handleAdd} disabled={!newName.trim() || saving}>
              {saving ? 'Saving…' : 'Add Collection'}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => { setAdding(false); setNewName(''); setNewChapter(''); setNewSeason(''); setNewLaunch(''); setError(''); }}>Cancel</button>
          </div>
          {error && <div style={{ fontSize: '0.75rem', color: 'var(--alert)', marginTop: 6 }}>{error}</div>}
        </div>
      )}
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
                  <ConfirmButton
                    label="🗑"
                    triggerStyle={{ fontSize: '0.75rem', opacity: 0.5 }}
                    promptText="Delete?"
                    confirming={confirmDelete === c.id}
                    onTrigger={() => setConfirmDelete(c.id)}
                    onCancel={() => setConfirmDelete(null)}
                    onConfirm={() => handleDelete(c.id)}
                  />
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const BUCKET_LABELS = { 1: 'B1 Visibility', 2: 'B2 Reach', 3: 'B3 Bestseller' };

// A column header that's both a sort trigger (click the label) and a filter
// trigger (click the ▾) — reuses the same single-select filter state each
// column already had in the old standalone dropdown row, just relocated
// onto the column itself instead of a separate filter bar.
function ColumnFilterHeader({ label, sortKey, sortCol, sortDir, onSort, value, onChange, options, allLabel, searchable }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const normalized = options.map(o => typeof o === 'string' ? { value: o, label: o } : o);
  const visible = searchable && query
    ? normalized.filter(o => o.label.toLowerCase().includes(query.toLowerCase()))
    : normalized;
  const activeLabel = normalized.find(o => o.value === value)?.label;

  return (
    <span ref={ref} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 2, minWidth: 0, maxWidth: '100%' }}>
      <span
        onClick={() => sortKey && onSort(sortKey)}
        title={activeLabel ? `Filtered: ${activeLabel}` : label}
        style={{
          cursor: sortKey ? 'pointer' : 'default', userSelect: 'none',
          color: sortCol === sortKey || value ? 'var(--dusty-rose)' : undefined,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}
      >
        {label}{sortCol === sortKey ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ''}
      </span>
      <button
        type="button"
        onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
        title="Filter"
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: '0.55rem', lineHeight: 1, color: value ? 'var(--dusty-rose)' : 'var(--charcoal-soft)', opacity: value ? 1 : 0.5, flexShrink: 0 }}
      >▾</button>
      {open && (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 30,
            background: 'var(--warm-white)', border: '1px solid rgba(43,41,38,0.15)', borderRadius: 4,
            boxShadow: '0 4px 14px rgba(0,0,0,0.12)', minWidth: 170, maxHeight: 280, overflowY: 'auto',
            padding: 4, textTransform: 'none', letterSpacing: 'normal', fontWeight: 400,
          }}
        >
          {searchable && (
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search…"
              style={{ width: '100%', fontSize: '0.75rem', padding: '4px 6px', marginBottom: 4, boxSizing: 'border-box' }}
            />
          )}
          <div
            onClick={() => { onChange(''); setOpen(false); setQuery(''); }}
            style={{ padding: '5px 8px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: !value ? 600 : 400, borderRadius: 3, background: !value ? 'rgba(188,100,90,0.08)' : 'none' }}
          >{allLabel}</div>
          {visible.map(o => (
            <div
              key={o.value}
              onClick={() => { onChange(o.value); setOpen(false); setQuery(''); }}
              style={{ padding: '5px 8px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: value === o.value ? 600 : 400, borderRadius: 3, background: value === o.value ? 'rgba(188,100,90,0.08)' : 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
            >{o.label}</div>
          ))}
          {searchable && query && visible.length === 0 && (
            <div style={{ padding: '5px 8px', fontSize: '0.72rem', color: 'var(--charcoal-soft)' }}>No matches</div>
          )}
        </div>
      )}
    </span>
  );
}

function KeywordList({ collectionObjects, chapters, onAddSession, initialCollection = '', initialSearch = '', refreshKey }) {
  const { products } = useProducts();
  const liveListingWords = new Set(
    products.filter(p => p.stage === 'Live' && (p.live_title || p.live_tags)).flatMap(p => {
      const combined = `${p.live_title || ''} ${p.live_tags || ''}`.toLowerCase();
      return combined.split(/[\s,]+/).filter(Boolean);
    })
  );
  const [keywords, setKeywords]       = useState([]);
  const [loading, setLoading]         = useState(true);
  const [filterChapter, setFilterChapter] = useState('');
  const [filterCollection, setFilterCollection] = useState(initialCollection);
  const [filterBucket, setFilterBucket]   = useState('');
  const [filterNiche, setFilterNiche]     = useState('');
  const [filterClassification, setFilterClassification] = useState('');
  const [filterConfidence, setFilterConfidence] = useState('');
  const [filterTrend, setFilterTrend]     = useState('');
  const [filterStatus, setFilterStatus]   = useState('');
  const [filterSource, setFilterSource]   = useState('');
  const [filterDisagreement, setFilterDisagreement] = useState(false);
  const [activePreset, setActivePreset]   = useState('');
  const [search, setSearch]           = useState(initialSearch);
  const [editId, setEditId]           = useState(null);
  const [editVals, setEditVals]       = useState({});
  const [saving, setSaving]           = useState(false);
  const [rebucketing, setRebucketing] = useState(false);
  const [rebucketResult, setRebucketResult] = useState(null);
  const [cleaning, setCleaning]       = useState(false);
  const [cleanupResult, setCleanupResult] = useState(null);
  const [recomputing, setRecomputing] = useState(false);
  const [recomputeResult, setRecomputeResult] = useState(null);
  const [selectedKeywordId, setSelectedKeywordId] = useState(null);
  const [sortCol, setSortCol] = useState('');
  const [sortDir, setSortDir] = useState('desc');

  function toggleSort(col) {
    if (sortCol === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortCol(col); setSortDir('desc'); }
  }

  const colChapterMap = {};
  for (const c of collectionObjects) {
    if (c.name && c.chapter) colChapterMap[c.name] = c.chapter;
  }

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('keywords')
      .select('*, research_sessions(id, collection, source, date, notes, seasonal, niche)')
      .not('research_session_id', 'is', null)
      .order('keyword', { ascending: true });
    setKeywords(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  // All unique collections from actual keyword data (includes General, Global Keywords, etc.)
  const allCollectionsFromData = [...new Set(
    keywords.map(k => k.research_sessions?.collection).filter(Boolean)
  )].sort();

  // Derived filter options — chapter filter narrows collections
  const visibleCollections = filterChapter
    ? allCollectionsFromData.filter(col => colChapterMap[col] === filterChapter)
    : allCollectionsFromData;

  const allSourcesFromData = [...new Set(
    keywords.map(k => k.research_sessions?.source).filter(Boolean)
  )].sort();

  // Sub-niche — free-text, per-session (e.g. "90s Nostalgia" within a
  // broader collection). Restored per Kristen's request: the ResearchSessionForm
  // input that used to set this was deleted Aug 1 (commit 458d4dc) with no
  // replacement, and this column never existed — old and new niche-tagged
  // sessions were both effectively invisible here even though the data itself
  // was never lost. uncategorizedNicheCount mirrors uncategorizedCount's
  // pattern for the Collection filter below.
  const allNichesFromData = [...new Set(
    keywords.map(k => k.research_sessions?.niche).filter(Boolean)
  )].sort();
  const uncategorizedNicheCount = keywords.filter(k => !k.research_sessions?.niche).length;

  const uncategorizedCount = keywords.filter(k => !k.research_sessions?.collection).length;

  const filtered = keywords.filter(k => {
    const col = k.research_sessions?.collection || '';
    const ch  = colChapterMap[col] || '';
    if (filterChapter && ch !== filterChapter) return false;
    if (filterCollection === '__uncategorized__' ? col !== '' : (filterCollection && col !== filterCollection)) return false;
    if (filterBucket !== '') {
      const bucketNum = Number(filterBucket);
      if (bucketNum === 0 ? !!k.bucket : k.bucket !== bucketNum) return false;
    }
    if (filterNiche === '__uncategorized__' ? !!k.research_sessions?.niche : (filterNiche && k.research_sessions?.niche !== filterNiche)) return false;
    if (filterClassification && k.classification !== filterClassification) return false;
    if (filterConfidence && k.confidence !== filterConfidence) return false;
    if (filterTrend && k.trend_classification !== filterTrend) return false;
    if (filterStatus && k.research_status !== filterStatus) return false;
    if (filterSource && k.research_sessions?.source !== filterSource) return false;
    if (filterDisagreement && !k.disagreement_flag) return false;
    if (activePreset && !KEYWORD_PRESETS[activePreset].test(k)) return false;
    if (search && !k.keyword?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  function startEdit(k) {
    const col = k.research_sessions?.collection || '';
    setEditId(k.id);
    setEditVals({
      bucket: k.bucket ?? '',
      volume: k.volume ?? '',
      competition: k.competition ?? '',
      score: k.score ?? '',
      collection: col,
      editChapter: colChapterMap[col] || '',
      status: k.research_status || 'Researching',
    });
  }

  async function saveEdit(id) {
    setSaving(true);
    const kw = keywords.find(k => k.id === id);
    const updates = {};
    if (editVals.bucket !== '')      updates.bucket      = Number(editVals.bucket) || null;
    if (editVals.volume !== '')      updates.volume      = Number(editVals.volume) || null;
    if (editVals.competition !== '') updates.competition = Number(editVals.competition) || null;
    if (editVals.score !== '')       updates.score       = Number(editVals.score) || null;
    if (updates.bucket)              updates.bucket_source = 'manual';
    if (editVals.status)             updates.research_status = editVals.status;

    // If collection changed, find the most recent session for that collection and reassign
    const currentCol = kw?.research_sessions?.collection || '';
    if (editVals.collection && editVals.collection !== currentCol) {
      const { data: sessions } = await supabase
        .from('research_sessions')
        .select('id')
        .eq('collection', editVals.collection)
        .order('date', { ascending: false })
        .limit(1);
      if (sessions?.length) {
        updates.research_session_id = sessions[0].id;
      }
    }

    await updateKeyword(id, updates);
    // Volume/competition/score may have just changed — re-run classification
    // against this keyword's full history so it doesn't go stale relative to
    // the numbers just typed in. Same recompute ResearchSessionCard's inline
    // edit already does.
    await recomputeKeywordInterpretation(id);
    await load();
    setEditId(null);
    setSaving(false);
  }

  async function handleRecomputeAll() {
    setRecomputing(true);
    setRecomputeResult(null);
    const toRecompute = keywords.filter(k => !k.tags_only);
    const results = await Promise.all(toRecompute.map(k => recomputeKeywordInterpretation(k.id)));
    const failed = results.filter(r => r.error).length;
    await load();
    setRecomputeResult({ updated: toRecompute.length - failed, failed });
    setRecomputing(false);
  }

  async function handleDelete(id) {
    // Delete all rows with the same keyword text (deduped display → all sources)
    const target = keywords.find(k => k.id === id);
    const targetText = (target?.keyword || '').toLowerCase().trim();
    const allIds = targetText
      ? keywords.filter(k => (k.keyword || '').toLowerCase().trim() === targetText).map(k => k.id)
      : [id];
    await Promise.all(allIds.map(deleteKeyword));
    setKeywords(prev => prev.filter(k => !allIds.includes(k.id)));
  }

  async function handleRebucket() {
    setRebucketing(true);
    setRebucketResult(null);
    const toUpdate = keywords.filter(k => k.volume != null && k.competition != null);
    const changed = toUpdate.filter(k => assignBucket(k.volume, k.competition) !== k.bucket);
    if (changed.length > 0) {
      // .update().eq('id', …) per row — .upsert() would compile to an INSERT
      // under the hood and reject this partial row on keywords' other NOT NULL
      // columns (keyword, created_at) that this payload doesn't set.
      await Promise.all(changed.map(k => {
        const newBucket = assignBucket(k.volume, k.competition);
        return supabase.from('keywords').update({ bucket: newBucket, bucket_source: newBucket ? 'manual' : null }).eq('id', k.id);
      }));
    }
    await load();
    setRebucketResult({ updated: changed.length, skipped: toUpdate.length - changed.length, noMetrics: keywords.length - toUpdate.length });
    setRebucketing(false);
  }

  // One-time catch-up for keywords imported before the low-quality-text filter
  // existed — flags mashed tag-combos / invented words (e.g. "gifte-sweatshirt")
  // as tags_only so they stop competing for anchor/bucket slots. New imports are
  // already caught automatically by assignBucketsToList().
  async function handleCleanupLowQuality() {
    setCleaning(true);
    setCleanupResult(null);
    const toFlag = keywords.filter(k => !k.tags_only && isLowQualityKeyword(k.keyword));
    if (toFlag.length > 0) {
      await Promise.all(toFlag.map(k =>
        supabase.from('keywords').update({ tags_only: true, bucket: null, bucket_source: null }).eq('id', k.id)
      ));
    }
    await load();
    setCleanupResult({ updated: toFlag.length });
    setCleaning(false);
  }

  // Dedup by keyword text FIRST, then sort the deduped rows — not the other
  // way around. A keyword researched under two different collections exists
  // as two separate raw rows; sorting the raw rows and deduping afterward let
  // a row's sort position come from whichever raw row was encountered first
  // while its DISPLAYED collection came from whichever raw row separately won
  // "primary" status (bucket-assigned wins) — the two could disagree, making
  // e.g. a Collection sort visibly out of order. Deduping first and sorting
  // the merged rows means sort position always matches what's on screen.
  const dedupMap = new Map();
  for (const k of filtered) {
    const key = (k.keyword || '').toLowerCase().trim();
    if (!key) continue;
    if (!dedupMap.has(key)) {
      dedupMap.set(key, { primary: k, sources: [] });
    }
    const entry = dedupMap.get(key);
    const src = k.research_sessions?.source;
    if (src && !entry.sources.includes(src)) entry.sources.push(src);
    // Prefer the entry with a bucket assigned
    if (k.bucket && !entry.primary.bucket) entry.primary = k;
  }
  const dedupedRows = [...dedupMap.values()];

  // Columns whose values are strings sort alphabetically (empty/null always
  // sorts last, regardless of direction, so "unclassified" doesn't jump to
  // the top on a descending sort); the original numeric columns are unchanged.
  // Getters read the same values the row actually renders — sources.join for
  // the Source(s) column (its badges = the full merged list), primary's own
  // field for everything else.
  const SORT_STRING_GETTERS = {
    keyword:        e => e.primary.keyword || '',
    classification: e => e.primary.classification || '',
    confidence:     e => e.primary.confidence || '',
    status:         e => e.primary.research_status || '',
    collection:     e => e.primary.research_sessions?.collection || '',
    niche:          e => e.primary.research_sessions?.niche || '',
    source:         e => e.sources.join(', '),
  };
  const sortedRows = sortCol ? [...dedupedRows].sort((a, b) => {
    if (SORT_STRING_GETTERS[sortCol]) {
      const getStr = SORT_STRING_GETTERS[sortCol];
      const as = getStr(a), bs = getStr(b);
      if (!as && bs) return 1;
      if (as && !bs) return -1;
      if (!as && !bs) return 0;
      const cmp = as.localeCompare(bs);
      return sortDir === 'desc' ? -cmp : cmp;
    }
    let av, bv;
    if (sortCol === 'vol')   { av = a.primary.volume ?? -1;      bv = b.primary.volume ?? -1; }
    if (sortCol === 'comp')  { av = a.primary.competition ?? -1;  bv = b.primary.competition ?? -1; }
    if (sortCol === 'kd')    { av = a.primary.score ?? -1;         bv = b.primary.score ?? -1; }
    if (sortCol === 'bucket'){ av = a.primary.bucket ?? 0;         bv = b.primary.bucket ?? 0; }
    return sortDir === 'desc' ? bv - av : av - bv;
  }) : dedupedRows;

  const totalFiltered = filtered.length;

  return (
    <div>
      {/* Filters row — Bucket/Classification/Confidence/Status/Collection/Source
          filters now live on their own column headers below (click a header's
          ▾ to filter, click its label to sort); this bar keeps only what
          doesn't map to a single column: free-text search, chapter (a
          collection grouping, not a column), trend + disagreement (both
          displayed inline within the Classification cell, not columns of
          their own), and the bulk actions. */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search keywords…"
          style={{ flex: 1, minWidth: 160, fontSize: '0.82rem', padding: '6px 10px' }}
        />
        <select value={filterChapter} onChange={e => { setFilterChapter(e.target.value); setFilterCollection(''); }}
          style={{ fontSize: '0.78rem', padding: '6px 8px' }}>
          <option value="">All chapters</option>
          {chapters.map(ch => <option key={ch} value={ch}>{ch}</option>)}
          {keywords.some(k => !colChapterMap[k.research_sessions?.collection]) && (
            <option value="__other">— No chapter —</option>
          )}
        </select>
        <select value={filterTrend} onChange={e => setFilterTrend(e.target.value)} style={{ fontSize: '0.78rem', padding: '6px 8px' }}>
          <option value="">All trends</option>
          {TREND_CLASSIFICATIONS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <button className={`btn btn-sm ${filterDisagreement ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setFilterDisagreement(d => !d)}>
          ⚠ Disagreement only
        </button>
        <span style={{ fontSize: '0.72rem', color: 'var(--charcoal-soft)', whiteSpace: 'nowrap' }}>
          {totalFiltered} keyword{totalFiltered !== 1 ? 's' : ''}
        </span>
        <button className="btn btn-ghost btn-sm" onClick={handleRebucket} disabled={rebucketing}
          title="Re-run bucket assignment on all keywords with volume + competition data">
          {rebucketing ? 'Re-bucketing…' : '⟳ Re-bucket'}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={handleCleanupLowQuality} disabled={cleaning}
          title="Flag mashed tag-combo / invented-word keywords (e.g. 'gifte-sweatshirt') as tags-only so they stop competing for anchor/bucket slots">
          {cleaning ? 'Cleaning…' : '🧹 Clean up low-quality'}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={handleRecomputeAll} disabled={recomputing}
          title="Re-run classification/confidence/trend against every keyword's full evidence history — useful right after running the Phase 19 migration, or whenever historical data changes underneath existing keywords">
          {recomputing ? 'Recomputing…' : '✦ Recompute Classifications'}
        </button>
        <button className="btn btn-primary btn-sm" onClick={onAddSession}>+ Add Session</button>
      </div>
      {rebucketResult && (
        <div style={{ fontSize: '0.72rem', color: 'var(--charcoal-soft)', marginBottom: 10 }}>
          ✓ {rebucketResult.updated} updated · {rebucketResult.skipped} already correct · {rebucketResult.noMetrics} skipped (no metrics)
        </div>
      )}
      {cleanupResult && (
        <div style={{ fontSize: '0.72rem', color: 'var(--charcoal-soft)', marginBottom: 10 }}>
          ✓ {cleanupResult.updated} keyword{cleanupResult.updated !== 1 ? 's' : ''} flagged tags-only (mashed/invented text)
        </div>
      )}
      {recomputeResult && (
        <div style={{ fontSize: '0.72rem', color: 'var(--charcoal-soft)', marginBottom: 10 }}>
          ✓ {recomputeResult.updated} recomputed{recomputeResult.failed > 0 ? ` · ${recomputeResult.failed} failed` : ''}
        </div>
      )}

      {/* Quick-filter presets */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {Object.entries(KEYWORD_PRESETS).map(([key, { label }]) => (
          <button
            key={key}
            className={`btn btn-sm ${activePreset === key ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setActivePreset(p => p === key ? '' : key)}
          >
            {label}
          </button>
        ))}
      </div>

      {!loading && filterCollection && (() => {
        const colKws = keywords.filter(k => k.research_sessions?.collection === filterCollection);
        const b1 = colKws.filter(k => k.bucket === 1).length;
        const b2 = colKws.filter(k => k.bucket === 2).length;
        const b3 = colKws.filter(k => k.bucket === 3).length;
        const unbucketed = colKws.filter(k => !k.bucket).length;
        const gaps = [];
        if (b1 < 1) gaps.push('needs B1 (visibility keyword)');
        if (b2 < 3) gaps.push(`needs ${3 - b2} more B2`);
        if (b3 < 1) gaps.push('needs B3 (bestseller)');
        return (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', padding: '8px 12px', marginBottom: 12, background: gaps.length ? 'rgba(232,168,124,0.12)' : 'rgba(124,175,138,0.1)', borderRadius: 2, border: `1px solid ${gaps.length ? 'rgba(232,168,124,0.4)' : 'var(--success)'}`, fontSize: '0.72rem' }}>
            {[['B1', b1, '#2d6b3c'], ['B2', b2, b2 >= 3 ? '#2d6b3c' : '#7a4a1e'], ['B3', b3, b3 >= 1 ? '#2d6b3c' : '#7a2b2b']].map(([label, count, color]) => (
              <span key={label} style={{ fontWeight: 600, color }}>{label}: {count}</span>
            ))}
            {unbucketed > 0 && <span style={{ color: 'var(--charcoal-soft)' }}>· {unbucketed} unbucketed</span>}
            {gaps.length > 0
              ? <span style={{ color: '#7a4a1e', marginLeft: 4 }}>⚑ {gaps.join(' · ')}</span>
              : <span style={{ color: '#2d6b3c', marginLeft: 4 }}>✓ Coverage complete</span>}
          </div>
        );
      })()}

      {loading && <div style={{ color: 'var(--charcoal-soft)', fontSize: '0.85rem' }}>Loading…</div>}

      {/* Header renders whenever keywords have loaded at all, even when the
          current filter combination matches zero rows — the column filters
          now live in this header, so if it only rendered alongside actual
          rows, filtering down to zero would hide the very controls needed
          to undo that filter. */}
      {!loading && keywords.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 1060 }}>
          {/* Header — click a label to sort that column, click ▾ to filter it.
              Keyword stays frozen at the left edge while the rest scrolls. */}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr) 60px 72px 80px 56px 118px 62px 90px 130px 110px 120px 36px', gap: 8, padding: '4px 10px', fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--charcoal-soft)' }}>
            <span
              onClick={() => toggleSort('keyword')}
              style={{
                position: 'sticky', left: 10, zIndex: 2, background: 'var(--linen)',
                cursor: 'pointer', userSelect: 'none', color: sortCol === 'keyword' ? 'var(--dusty-rose)' : undefined,
                paddingRight: 8, boxShadow: '4px 0 6px -4px rgba(43,41,38,0.25)',
              }}
            >
              Keyword{sortCol === 'keyword' ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ''}
            </span>
            <ColumnFilterHeader label="Bucket" sortKey="bucket" sortCol={sortCol} sortDir={sortDir} onSort={toggleSort}
              value={filterBucket} onChange={setFilterBucket} allLabel="All buckets"
              options={[{ value: '1', label: 'B1 Visibility' }, { value: '2', label: 'B2 Reach' }, { value: '3', label: 'B3 Bestseller' }, { value: '0', label: 'Unclassified' }]} />
            {[['vol','Vol'],['comp','Comp'],['kd','KD']].map(([col, lbl]) => (
              <span key={col} onClick={() => toggleSort(col)} style={{ cursor: 'pointer', userSelect: 'none', color: sortCol === col ? 'var(--dusty-rose)' : undefined }}>
                {lbl}{sortCol === col ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ''}
              </span>
            ))}
            <ColumnFilterHeader label="Classification" sortKey="classification" sortCol={sortCol} sortDir={sortDir} onSort={toggleSort}
              value={filterClassification} onChange={setFilterClassification} allLabel="All classifications" options={CLASSIFICATIONS} />
            <ColumnFilterHeader label="Conf." sortKey="confidence" sortCol={sortCol} sortDir={sortDir} onSort={toggleSort}
              value={filterConfidence} onChange={setFilterConfidence} allLabel="All confidence" options={CONFIDENCE_LEVELS} />
            <ColumnFilterHeader label="Status" sortKey="status" sortCol={sortCol} sortDir={sortDir} onSort={toggleSort}
              value={filterStatus} onChange={setFilterStatus} allLabel="All statuses" options={RESEARCH_STATUSES} />
            <ColumnFilterHeader label="Collection" sortKey="collection" sortCol={sortCol} sortDir={sortDir} onSort={toggleSort}
              value={filterCollection} onChange={setFilterCollection} allLabel="All collections" searchable
              options={[
                ...(uncategorizedCount > 0 ? [{ value: '__uncategorized__', label: `— Uncategorized (${uncategorizedCount}) —` }] : []),
                ...visibleCollections,
              ]} />
            <ColumnFilterHeader label="Niche" sortKey="niche" sortCol={sortCol} sortDir={sortDir} onSort={toggleSort}
              value={filterNiche} onChange={setFilterNiche} allLabel="All niches" searchable
              options={[
                ...(uncategorizedNicheCount > 0 ? [{ value: '__uncategorized__', label: `— No niche (${uncategorizedNicheCount}) —` }] : []),
                ...allNichesFromData,
              ]} />
            <ColumnFilterHeader label="Source(s)" sortKey="source" sortCol={sortCol} sortDir={sortDir} onSort={toggleSort}
              value={filterSource} onChange={setFilterSource} allLabel="All sources" options={allSourcesFromData} />
            <span></span>
          </div>

          {filtered.length === 0 ? (
            <div className="empty-state">
              <p>No keywords match these filters.</p>
            </div>
          ) : sortedRows.map(({ primary: k, sources }) => {
              const col = k.research_sessions?.collection || '—';
              // Score direction is opposite between sources: eRank's KD is 0-100,
              // higher = harder to rank (bad). Everbee's score is unbounded and
              // higher = better opportunity (lower competition). Same field, opposite
              // meaning depending on which tool produced it.
              const isERank = (k.research_sessions?.source || '').toLowerCase() === 'erank';
              const scoreColor = !k.score ? 'var(--charcoal-soft)'
                : isERank
                  ? (k.score >= 70 ? '#7a2b2b' : k.score >= 40 ? '#6b4a10' : '#2d6b3c')
                  : (k.score >= 1000 ? '#2d6b3c' : k.score >= 100 ? '#6b4a10' : '#7a2b2b');
              const isEditing = editId === k.id;
              const hasVol = k.volume != null;
              const hasComp = k.competition != null;
              const bucketMissingReason = !k.bucket ? (!hasVol || !hasComp ? 'no metrics' : k.volume < 200 ? 'vol < 200' : null) : null;
              const kwWords = (k.keyword || '').toLowerCase().trim().split(/\s+/);
              const inLiveListing = kwWords.length > 0 && kwWords.every(w => liveListingWords.has(w));

              if (isEditing) {
              const editableCollections = editVals.editChapter
                ? allCollectionsFromData.filter(col => colChapterMap[col] === editVals.editChapter)
                : allCollectionsFromData;
              return (
                <div key={k.id} style={{ background: 'rgba(188,100,90,0.06)', border: '1px solid rgba(188,100,90,0.2)', borderRadius: 4, padding: '10px 12px', marginBottom: 2 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.82rem', marginBottom: 8 }}>{k.keyword}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
                    <div>
                      <div style={{ fontSize: '0.6rem', color: 'var(--charcoal-soft)', textTransform: 'uppercase', marginBottom: 2 }}>Bucket</div>
                      <select value={editVals.bucket} onChange={e => setEditVals(v => ({ ...v, bucket: e.target.value }))} style={{ fontSize: '0.78rem', padding: '4px 6px', width: '100%' }}>
                        <option value="">— Unclassified —</option>
                        <option value="1">B1 Visibility</option>
                        <option value="2">B2 Reach</option>
                        <option value="3">B3 Bestseller</option>
                      </select>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.6rem', color: 'var(--charcoal-soft)', textTransform: 'uppercase', marginBottom: 2 }}>Volume</div>
                      <input value={editVals.volume} onChange={e => setEditVals(v => ({ ...v, volume: e.target.value }))} style={{ fontSize: '0.78rem', padding: '4px 6px', width: '100%' }} placeholder="—" />
                    </div>
                    <div>
                      <div style={{ fontSize: '0.6rem', color: 'var(--charcoal-soft)', textTransform: 'uppercase', marginBottom: 2 }}>Competition</div>
                      <input value={editVals.competition} onChange={e => setEditVals(v => ({ ...v, competition: e.target.value }))} style={{ fontSize: '0.78rem', padding: '4px 6px', width: '100%' }} placeholder="—" />
                    </div>
                    <div>
                      <div style={{ fontSize: '0.6rem', color: 'var(--charcoal-soft)', textTransform: 'uppercase', marginBottom: 2 }}>KD Score</div>
                      <input value={editVals.score} onChange={e => setEditVals(v => ({ ...v, score: e.target.value }))} style={{ fontSize: '0.78rem', padding: '4px 6px', width: '100%' }} placeholder="—" />
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
                    <div>
                      <div style={{ fontSize: '0.6rem', color: 'var(--charcoal-soft)', textTransform: 'uppercase', marginBottom: 2 }}>Chapter</div>
                      <select value={editVals.editChapter}
                        onChange={e => setEditVals(v => ({ ...v, editChapter: e.target.value, collection: '' }))}
                        style={{ fontSize: '0.78rem', padding: '4px 6px', width: '100%' }}>
                        <option value="">— All chapters —</option>
                        {chapters.map(ch => <option key={ch} value={ch}>{ch}</option>)}
                      </select>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.6rem', color: 'var(--charcoal-soft)', textTransform: 'uppercase', marginBottom: 2 }}>Collection</div>
                      <select value={editVals.collection} onChange={e => setEditVals(v => ({ ...v, collection: e.target.value }))}
                        style={{ fontSize: '0.78rem', padding: '4px 6px', width: '100%' }}>
                        <option value="">— Pick collection —</option>
                        {editableCollections.map(col => <option key={col} value={col}>{col}</option>)}
                      </select>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.6rem', color: 'var(--charcoal-soft)', textTransform: 'uppercase', marginBottom: 2 }}>Research Status</div>
                      <select value={editVals.status} onChange={e => setEditVals(v => ({ ...v, status: e.target.value }))}
                        style={{ fontSize: '0.78rem', padding: '4px 6px', width: '100%' }}>
                        {RESEARCH_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-primary btn-sm" onClick={() => saveEdit(k.id)} disabled={saving}>
                      {saving ? 'Saving…' : 'Save'}
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditId(null)}>Cancel</button>
                  </div>
                </div>
              );
            }

              return (
                <div key={k.id}
                  onClick={() => setSelectedKeywordId(k.id)}
                  title="Click for classification, source comparison, and history"
                  style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr) 60px 72px 80px 56px 118px 62px 90px 130px 110px 120px 36px', gap: 8, padding: '7px 10px', background: 'var(--warm-white)', border: `1px solid ${inLiveListing ? 'rgba(124,175,138,0.3)' : 'rgba(43,41,38,0.07)'}`, borderRadius: 3, alignItems: 'center', cursor: 'pointer' }}>
                  <span style={{
                    fontSize: '0.82rem', fontWeight: 500,
                    position: 'sticky', left: 10, zIndex: 1, background: 'var(--warm-white)',
                    alignSelf: 'stretch', display: 'flex', alignItems: 'center', paddingRight: 8,
                    boxShadow: '4px 0 6px -4px rgba(43,41,38,0.15)',
                  }}>
                    {k.keyword}
                    {k.tags_only && <span style={{ fontSize: '0.6rem', color: 'var(--charcoal-soft)', marginLeft: 4 }}>tag</span>}
                    {inLiveListing && <span style={{ fontSize: '0.55rem', marginLeft: 5, padding: '1px 5px', borderRadius: 8, background: 'rgba(124,175,138,0.2)', color: '#2d6b3c', fontWeight: 600 }}>live</span>}
                    {k.research_sessions?.notes && (
                      <span
                        title={k.research_sessions.notes}
                        style={{ fontSize: '0.6rem', marginLeft: 5, color: 'var(--dusty-rose)', cursor: 'help', textDecoration: 'underline dotted' }}
                      >note</span>
                    )}
                    {k.research_sessions?.seasonal && (
                      <span style={{ fontSize: '0.55rem', marginLeft: 5, padding: '1px 5px', borderRadius: 8, background: 'rgba(232,168,124,0.2)', color: '#7a4a1e', fontWeight: 600 }}>seasonal</span>
                    )}
                  </span>
                  <span>
                    {k.bucket ? <BucketBadge bucket={k.bucket} /> : bucketMissingReason ? (
                      <span
                        style={{ fontSize: '0.58rem', color: 'var(--charcoal-soft)', opacity: 0.6, cursor: 'help' }}
                        title={bucketMissingReason === 'vol < 200' ? 'Volume under 200 — too low-traffic to classify into a meaningful bucket. Enter a higher-volume alternative or keep as context.' : 'Enter volume and competition to auto-assign a bucket.'}
                      >{bucketMissingReason}</span>
                    ) : null}
                  </span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--charcoal-soft)' }}>{k.volume?.toLocaleString() ?? '—'}</span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--charcoal-soft)' }}>{k.competition?.toLocaleString() ?? '—'}</span>
                  <span style={{ fontSize: '0.72rem', color: scoreColor }}>{k.score ?? '—'}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 3, overflow: 'hidden' }}>
                    <ClassificationBadge classification={k.classification} />
                    <TrendIndicator trend={k.trend_classification} />
                    <DisagreementFlag flag={k.disagreement_flag} />
                  </span>
                  <span><ConfidenceBadge confidence={k.confidence} /></span>
                  <span><StatusBadge status={k.research_status} /></span>
                  <span style={{ fontSize: '0.68rem', color: 'var(--charcoal-soft)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{col}</span>
                  <span style={{ fontSize: '0.68rem', color: 'var(--charcoal-soft)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k.research_sessions?.niche || '—'}</span>
                  <span style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                    {sources.map(s => (
                      <span key={s} style={{ fontSize: '0.58rem', padding: '1px 5px', borderRadius: 8, background: 'var(--rose-faint)', border: '1px solid rgba(188,143,143,0.3)', color: 'var(--dusty-rose)', whiteSpace: 'nowrap' }}>{s}</span>
                    ))}
                  </span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button onClick={e => { e.stopPropagation(); startEdit(k); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--charcoal-soft)', fontSize: '0.75rem', padding: '2px' }}>✎</button>
                    <button onClick={e => { e.stopPropagation(); handleDelete(k.id); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--charcoal-soft)', fontSize: '0.75rem', padding: '2px', opacity: 0.4 }}>🗑</button>
                  </div>
                </div>
              );
            })}

        </div>
        </div>
      )}

      {selectedKeywordId && (
        <KeywordDetail
          keywordId={selectedKeywordId}
          onClose={() => setSelectedKeywordId(null)}
          onUpdated={load}
        />
      )}
    </div>
  );
}

export default function Research() {
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState('keywords');
  const [filterChapter, setFilterChapter] = useState('');
  const [filterCollection, setFilterCollection] = useState(searchParams.get('collection') || '');
  const { sessions, loading, refetch } = useResearchSessions(filterCollection || undefined);
  const { collectionNames: collections, refetchCollectionNames: refetchCollections, collectionObjects, chapters } = useCollectionsContext();
  const [adding, setAdding] = useState(false);
  // KeywordList fetches its own keyword data independently (not from `sessions`
  // above), so saving a session from the Keywords tab left its list stale —
  // refetch() only refreshed the Sessions tab's data. Bumping this forces
  // KeywordList's effect to re-run.
  const [kwRefreshKey, setKwRefreshKey] = useState(0);

  // Build a map of collection name → chapter
  const colChapterMap = {};
  for (const c of collectionObjects) {
    if (c.name && c.chapter) colChapterMap[c.name] = c.chapter;
  }

  // Filter by chapter (derived from collection's chapter, not session's parent_niche)
  const visibleSessions = filterChapter === '__uncategorized__'
    ? sessions.filter(s => !s.collection)
    : filterChapter === '__other'
    ? sessions.filter(s => s.collection && !colChapterMap[s.collection])
    : filterChapter
    ? sessions.filter(s => colChapterMap[s.collection] === filterChapter)
    : sessions;

  // Group by chapter → collection (using the collections table, not parent_niche)
  const hierarchy = visibleSessions.reduce((acc, s) => {
    const chapter = s.collection ? (colChapterMap[s.collection] || 'Other') : 'Uncategorized';
    const col = s.collection || 'Uncategorized — broad/exploratory research';
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
          <button className={`btn btn-sm ${tab === 'etsy' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('etsy')}>Etsy Insights</button>
        </div>
      </div>

      {tab === 'keywords' && (
        <>
          {adding && (
            <div className="card" style={{ marginBottom: 20 }}>
              <ResearchSessionForm
                defaultCollection={collections[0] || ''}
                onSaved={() => { setAdding(false); refetch(); setKwRefreshKey(k => k + 1); }}
                onCancel={() => setAdding(false)}
              />
            </div>
          )}
          <KeywordList
            collectionObjects={collectionObjects}
            chapters={chapters}
            onAddSession={() => setAdding(a => !a)}
            initialCollection={searchParams.get('collection') || ''}
            initialSearch={searchParams.get('keyword') || ''}
            refreshKey={kwRefreshKey}
          />
        </>
      )}

      {tab === 'collections' && (
        <CollectionsManager refetch={refetchCollections} />
      )}

      {tab === 'etsy' && <EtsyInsightsCapture onSaved={() => setTab('sessions')} />}

      {tab === 'explore' && (
        <KeywordExplore
          collections={collections}
          onCollectionCreated={refetchCollections}
        />
      )}

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
            {sessions.some(s => s.collection && !colChapterMap[s.collection]) && (
              <button
                className={`btn btn-sm ${filterChapter === '__other' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setFilterChapter(filterChapter === '__other' ? '' : '__other')}
              >
                Other ({sessions.filter(s => s.collection && !colChapterMap[s.collection]).length})
              </button>
            )}
            {sessions.some(s => !s.collection) && (
              <button
                className={`btn btn-sm ${filterChapter === '__uncategorized__' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setFilterChapter(filterChapter === '__uncategorized__' ? '' : '__uncategorized__')}
              >
                Uncategorized ({sessions.filter(s => !s.collection).length})
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
                    {(() => {
                      const colKws = cols[col].flatMap(s => s.keywords || []);
                      const b1 = colKws.filter(k => k.bucket === 1).length;
                      const b2 = colKws.filter(k => k.bucket === 2).length;
                      const b3 = colKws.filter(k => k.bucket === 3).length;
                      const hasBuckets = b1 + b2 + b3 > 0;
                      return (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                          {!filterChapter && (
                            <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--dusty-rose)', flexShrink: 0 }} />
                          )}
                          <div className="section-label" style={{ margin: 0 }}>{col}</div>
                          <span style={{ fontSize: '0.68rem', color: 'var(--charcoal-soft)' }}>
                            {cols[col].length} session{cols[col].length !== 1 ? 's' : ''} · {colKws.length} keywords
                          </span>
                          {hasBuckets && (
                            <span style={{ display: 'flex', gap: 4 }}>
                              {[['B1', b1, b1 >= 1 ? '#2d6b3c' : '#7a2b2b', b1 >= 1 ? 'rgba(124,175,138,0.15)' : 'rgba(201,123,123,0.12)'], ['B2', b2, b2 >= 3 ? '#2d6b3c' : '#7a4a1e', b2 >= 3 ? 'rgba(124,175,138,0.15)' : 'rgba(232,168,124,0.15)'], ['B3', b3, b3 >= 1 ? '#2d6b3c' : '#7a2b2b', b3 >= 1 ? 'rgba(124,175,138,0.15)' : 'rgba(201,123,123,0.12)']].map(([label, count, color, bg]) => (
                                <span key={label} style={{ fontSize: '0.6rem', fontWeight: 600, padding: '1px 6px', borderRadius: 10, color, background: bg }}>{label}:{count}</span>
                              ))}
                            </span>
                          )}
                        </div>
                      );
                    })()}
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
