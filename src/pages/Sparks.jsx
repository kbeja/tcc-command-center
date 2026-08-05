import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useSparks, updateSpark, archiveSpark, useCollections, useCollectionObjects, useChapters } from '../lib/hooks';
import { supabase } from '../lib/supabase';
import SparkCard from '../components/SparkCard';

export default function Sparks() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { sparks, loading, refetch } = useSparks();
  const { collections } = useCollections();
  const { collections: collectionObjects } = useCollectionObjects();
  const { chapters } = useChapters();
  const [search, setSearch] = useState('');
  const [chapterFilter, setChapterFilter] = useState('');
  const [collectionFilter, setCollectionFilter] = useState(searchParams.get('collection') || '');
  const [specificCollection, setSpecificCollection] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [bulkDone, setBulkDone] = useState('');
  const [bulkTag, setBulkTag] = useState('');

  // Collections belonging to the selected chapter
  const collectionsInChapter = chapterFilter
    ? collectionObjects.filter(c => c.chapter === chapterFilter)
    : [];

  function sparkMatchesChapter(spark, chapter) {
    if (!chapter) return true;
    if (spark.collection_tag === chapter) return true;
    const subNames = new Set(collectionObjects.filter(c => c.chapter === chapter).map(c => c.name));
    return subNames.has(spark.collection_tag);
  }

  const hot = sparks.filter(s => s.temperature === 'hot');
  const cold = sparks.filter(s => s.temperature === 'cold').filter(s => {
    const matchSearch = !search || s.content.toLowerCase().includes(search.toLowerCase());
    const matchChapter = sparkMatchesChapter(s, chapterFilter);
    const matchColl = !collectionFilter || s.collection_tag === collectionFilter;
    const matchSpecific = !specificCollection || s.collection_tag === specificCollection;
    const matchType = !typeFilter || (s.idea_type || 'Product Idea') === typeFilter;
    return matchSearch && matchChapter && matchColl && matchSpecific && matchType;
  });

  function toggleSelect(id) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(cold.map(s => s.id)));
  }

  function cancelSelect() {
    setSelecting(false);
    setSelected(new Set());
    setBulkDone('');
    setBulkTag('');
  }

  async function bulkAction(action) {
    const ids = [...selected];
    if (!ids.length) return;
    const now = new Date().toISOString();
    const count = ids.length;

    if (action === 'archive') {
      await supabase.from('sparks').update({ archived_at: now, updated_at: now }).in('id', ids);
      setBulkDone(`Archived ${count} spark${count !== 1 ? 's' : ''}`);
    } else if (action === 'delete') {
      await supabase.from('sparks').delete().in('id', ids);
      setBulkDone(`Deleted ${count} spark${count !== 1 ? 's' : ''}`);
    } else if (action === 'hot') {
      await supabase.from('sparks').update({ temperature: 'hot', updated_at: now }).in('id', ids);
      setBulkDone(`Moved ${count} to hot`);
    } else if (action === 'cold') {
      await supabase.from('sparks').update({ temperature: 'cold', updated_at: now }).in('id', ids);
      setBulkDone(`Moved ${count} to cold`);
    } else if (action === 'tag') {
      if (!bulkTag) return;
      await supabase.from('sparks').update({ collection_tag: bulkTag, updated_at: now }).in('id', ids);
      setBulkDone(`Tagged ${count} → ${bulkTag}`);
      setBulkTag('');
    }

    await refetch();
    setSelected(new Set());
    setTimeout(() => setBulkDone(''), 2500);
  }

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div className="page-title">Idea Vault</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--charcoal-soft)', marginTop: 4 }}>
              {hot.length} hot · {sparks.filter(s => s.temperature === 'cold').length} cold
            </div>
          </div>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => selecting ? cancelSelect() : setSelecting(true)}
          >
            {selecting ? 'Cancel' : 'Select'}
          </button>
        </div>
      </div>

      {/* Bulk action bar */}
      {selecting && (
        <div style={{
          position: 'sticky', top: 0, zIndex: 10,
          background: 'var(--warm-white)', border: '1px solid rgba(43,41,38,0.12)',
          borderRadius: 2, padding: '10px 14px', marginBottom: 16,
          display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--charcoal-soft)', marginRight: 4 }}>
            {selected.size} selected
          </span>
          <button className="btn btn-ghost btn-sm" onClick={selectAll}>Select all</button>
          <div style={{ flex: 1 }} />
          {bulkDone ? (
            <span className="inline-confirm">{bulkDone} ✓</span>
          ) : (
            <>
              <button className="btn btn-ghost btn-sm" onClick={() => bulkAction('hot')} disabled={!selected.size}>Make Hot</button>
              <button className="btn btn-ghost btn-sm" onClick={() => bulkAction('cold')} disabled={!selected.size}>Make Cold</button>
              <button className="btn btn-ghost btn-sm" onClick={() => bulkAction('archive')} disabled={!selected.size}>Archive</button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => bulkAction('delete')}
                disabled={!selected.size}
                style={{ color: selected.size ? 'var(--alert)' : undefined }}
              >
                Delete
              </button>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <select
                  value={bulkTag}
                  onChange={e => setBulkTag(e.target.value)}
                  disabled={!selected.size}
                  style={{ fontSize: '0.72rem', padding: '3px 6px' }}
                >
                  <option value="">— Tag collection —</option>
                  {collections.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => bulkAction('tag')}
                  disabled={!selected.size || !bulkTag}
                >
                  Apply
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {hot.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div className="section-label">Hot Sparks</div>
          {hot.filter(s => !s.collection_tag).length > 0 && (
            <div style={{ fontSize: '0.75rem', background: 'rgba(232,168,124,0.12)', border: '1px solid rgba(232,168,124,0.35)', borderRadius: 4, padding: '8px 12px', marginBottom: 10, color: '#7a4a1e' }}>
              ⚑ {hot.filter(s => !s.collection_tag).length} hot spark{hot.filter(s => !s.collection_tag).length !== 1 ? 's have' : ' has'} no collection — tap the badge on the card to assign one so they appear in research and listing workflows.
            </div>
          )}
          {hot.map(s => <SparkCard key={s.id} spark={s} onAction={refetch} />)}
        </div>
      )}

      <div>
        <div className="section-label" style={{ marginBottom: 10 }}>Cold Sparks</div>
        {/* Chapter filter bar */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
          <button
            className={`btn btn-sm ${!chapterFilter ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => { setChapterFilter(''); setCollectionFilter(''); setSpecificCollection(''); }}
          >
            All ({sparks.filter(s => s.temperature === 'cold').length})
          </button>
          {chapters.map(p => {
            const subNames = new Set(collectionObjects.filter(c => c.chapter === p).map(c => c.name));
            const count = sparks.filter(s => s.temperature === 'cold' && (s.collection_tag === p || subNames.has(s.collection_tag))).length;
            if (!count) return null;
            return (
              <button
                key={p}
                className={`btn btn-sm ${chapterFilter === p ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => { setChapterFilter(chapterFilter === p ? '' : p); setCollectionFilter(''); setSpecificCollection(''); }}
              >
                {p} ({count})
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <input
            placeholder="Search sparks…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ flex: 1, minWidth: 160 }}
          />
          {/* Collection dropdown — scoped to chapter when one is selected, grouped by chapter otherwise */}
          <select
            value={collectionFilter}
            onChange={e => { setCollectionFilter(e.target.value); setSpecificCollection(''); }}
            style={{ width: 'auto' }}
          >
            <option value="">{chapterFilter ? `All in ${chapterFilter}` : 'All collections'}</option>
            {chapterFilter ? (
              collectionsInChapter.map(c => <option key={c.name} value={c.name}>{c.name}</option>)
            ) : (
              chapters.map(ch => {
                const inCh = collectionObjects.filter(c => c.chapter === ch);
                if (!inCh.length) return null;
                return (
                  <optgroup key={ch} label={ch}>
                    {inCh.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                  </optgroup>
                );
              })
            )}
          </select>
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{ width: 'auto' }}>
            <option value="">All types</option>
            <option value="Product Idea">Product Idea</option>
            <option value="Strategy Idea">Strategy Idea</option>
            <option value="Tool/Resource">Tool/Resource</option>
          </select>
        </div>

        {loading && <div style={{ color: 'var(--charcoal-soft)', fontSize: '0.85rem' }}>Loading…</div>}

        {!loading && cold.length === 0 && (
          <div className="empty-state">
            <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>💡</div>
            <p>{search || collectionFilter ? 'No sparks match your search.' : 'No cold sparks.'}</p>
          </div>
        )}

        {cold.map(s => (
          <div
            key={s.id}
            style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}
            onClick={selecting ? () => toggleSelect(s.id) : undefined}
          >
            {selecting && (
              <div style={{
                width: 18, height: 18, borderRadius: 3, flexShrink: 0, marginTop: 16,
                border: `2px solid ${selected.has(s.id) ? 'var(--dusty-rose)' : 'rgba(43,41,38,0.2)'}`,
                background: selected.has(s.id) ? 'var(--dusty-rose)' : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
              }}>
                {selected.has(s.id) && <span style={{ color: 'white', fontSize: '0.6rem', fontWeight: 800 }}>✓</span>}
              </div>
            )}
            <div style={{ flex: 1 }}>
              <SparkCard spark={s} onAction={refetch} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
