import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useCollections, useCollectionObjects, useChapters } from '../lib/hooks';

function ConceptCard({ concept, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <>
      <div
        style={{
          border: '1px solid rgba(43,41,38,0.1)', borderRadius: 4,
          background: 'var(--warm-white)', overflow: 'hidden', cursor: 'pointer',
        }}
        onClick={() => setExpanded(true)}
      >
        <div style={{ aspectRatio: '4/3', overflow: 'hidden', background: 'rgba(43,41,38,0.04)' }}>
          <img
            src={concept.image_data}
            alt={concept.title || 'Concept'}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </div>
        <div style={{ padding: '8px 10px' }}>
          {concept.title && (
            <div style={{ fontWeight: 500, fontSize: '0.78rem', marginBottom: 2 }}>{concept.title}</div>
          )}
          {concept.collection_tag && (
            <div style={{ fontSize: '0.65rem', color: 'var(--dusty-rose)', marginBottom: 2 }}>{concept.collection_tag}</div>
          )}
          {concept.notes && (
            <div style={{ fontSize: '0.68rem', color: 'var(--charcoal-soft)', lineHeight: 1.4 }}>
              {concept.notes.length > 80 ? concept.notes.slice(0, 80) + '…' : concept.notes}
            </div>
          )}
        </div>
      </div>

      {/* Expanded lightbox */}
      {expanded && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(43,41,38,0.85)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', padding: 20,
          }}
          onClick={() => setExpanded(false)}
        >
          <div
            style={{
              background: 'var(--warm-white)', borderRadius: 6, maxWidth: 700, width: '100%',
              maxHeight: '90vh', overflow: 'auto',
            }}
            onClick={e => e.stopPropagation()}
          >
            <img src={concept.image_data} alt={concept.title || 'Concept'} style={{ width: '100%', display: 'block' }} />
            <div style={{ padding: '14px 16px' }}>
              {concept.title && <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: 6 }}>{concept.title}</div>}
              {concept.collection_tag && (
                <div style={{ fontSize: '0.7rem', color: 'var(--dusty-rose)', marginBottom: 8 }}>{concept.collection_tag}</div>
              )}
              {concept.notes && (
                <div style={{ fontSize: '0.78rem', color: 'var(--charcoal-soft)', lineHeight: 1.6, marginBottom: 12 }}>{concept.notes}</div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setExpanded(false)}>Close</button>
                {confirmDelete ? (
                  <>
                    <span style={{ fontSize: '0.75rem', color: 'var(--charcoal-soft)', alignSelf: 'center' }}>Delete?</span>
                    <button onClick={() => { onDelete(concept.id); setExpanded(false); }} style={{ color: 'var(--alert)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}>Yes</button>
                    <button onClick={() => setConfirmDelete(false)} style={{ color: 'var(--charcoal-soft)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem' }}>Cancel</button>
                  </>
                ) : (
                  <button className="btn btn-ghost btn-sm" style={{ color: 'var(--alert)', marginLeft: 'auto' }} onClick={() => setConfirmDelete(true)}>Delete</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function Studio() {
  const { collections } = useCollections();
  const { collections: collectionObjects } = useCollectionObjects();
  const { chapters } = useChapters();
  const [concepts, setConcepts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [chapterFilter, setChapterFilter] = useState('');
  const [collectionFilter, setCollectionFilter] = useState('');

  // Add form state
  const [newTitle, setNewTitle] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [newCollection, setNewCollection] = useState('');
  const [newImage, setNewImage] = useState(null); // base64 data URL
  const [saving, setSaving] = useState(false);
  const fileRef = useRef();

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('concepts').select('*').order('created_at', { ascending: false });
    setConcepts(data || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  // Paste from clipboard
  useEffect(() => {
    function onPaste(e) {
      if (!adding) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          readFile(file);
          break;
        }
      }
    }
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [adding]);

  function readFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => setNewImage(e.target.result);
    reader.readAsDataURL(file);
  }

  function handleFile(e) {
    readFile(e.target.files[0]);
  }

  async function handleSave() {
    if (!newImage) return;
    setSaving(true);
    await supabase.from('concepts').insert({
      title: newTitle.trim() || null,
      notes: newNotes.trim() || null,
      collection_tag: newCollection || null,
      image_data: newImage,
    });
    setNewTitle(''); setNewNotes(''); setNewCollection(''); setNewImage(null);
    setSaving(false);
    setAdding(false);
    load();
  }

  async function handleDelete(id) {
    await supabase.from('concepts').delete().eq('id', id);
    setConcepts(prev => prev.filter(c => c.id !== id));
  }

  function collectionsInChapter(ch) {
    return collectionObjects.filter(c => c.chapter === ch);
  }

  const visible = concepts.filter(c => {
    if (chapterFilter) {
      const subNames = new Set(collectionsInChapter(chapterFilter).map(x => x.name));
      if (c.collection_tag !== chapterFilter && !subNames.has(c.collection_tag)) return false;
    }
    if (collectionFilter && c.collection_tag !== collectionFilter) return false;
    return true;
  });

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div className="page-title">Studio</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--charcoal-soft)', marginTop: 4 }}>
              {concepts.length} concept{concepts.length !== 1 ? 's' : ''}
            </div>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => setAdding(!adding)}>
            {adding ? 'Cancel' : '+ Add'}
          </button>
        </div>
      </div>

      {/* Add form */}
      {adding && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ marginBottom: 12 }}>
            {newImage ? (
              <div style={{ position: 'relative', marginBottom: 10 }}>
                <img src={newImage} alt="preview" style={{ width: '100%', maxHeight: 300, objectFit: 'contain', borderRadius: 4 }} />
                <button
                  onClick={() => setNewImage(null)}
                  style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(43,41,38,0.6)', color: '#fff', border: 'none', borderRadius: '50%', width: 24, height: 24, cursor: 'pointer', fontSize: '0.7rem' }}
                >✕</button>
              </div>
            ) : (
              <div
                onClick={() => fileRef.current?.click()}
                style={{
                  border: '2px dashed rgba(43,41,38,0.2)', borderRadius: 4, padding: '32px 20px',
                  textAlign: 'center', cursor: 'pointer', marginBottom: 10, color: 'var(--charcoal-soft)',
                  fontSize: '0.8rem',
                }}
              >
                Click to upload or paste image from clipboard
                <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} />
              </div>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input
              placeholder="Title (optional)"
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              style={{ fontSize: '0.78rem' }}
            />
            <select value={newCollection} onChange={e => setNewCollection(e.target.value)} style={{ fontSize: '0.78rem' }}>
              <option value="">— Collection (optional) —</option>
              {chapters.map(ch => {
                const inCh = collectionObjects.filter(c => c.chapter === ch);
                if (!inCh.length) return null;
                return (
                  <optgroup key={ch} label={ch}>
                    {inCh.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                  </optgroup>
                );
              })}
            </select>
            <textarea
              placeholder="Notes (optional)"
              value={newNotes}
              onChange={e => setNewNotes(e.target.value)}
              rows={2}
              style={{ fontSize: '0.78rem', resize: 'vertical' }}
            />
            <button
              className="btn btn-primary btn-sm"
              onClick={handleSave}
              disabled={!newImage || saving}
              style={{ alignSelf: 'flex-start' }}
            >
              {saving ? 'Saving…' : 'Save Concept'}
            </button>
          </div>
        </div>
      )}

      {/* Chapter filter pills */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        <button
          className={`btn btn-sm ${!chapterFilter ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => { setChapterFilter(''); setCollectionFilter(''); }}
        >
          All ({concepts.length})
        </button>
        {chapters.map(ch => {
          const subNames = new Set(collectionsInChapter(ch).map(c => c.name));
          const count = concepts.filter(c => c.collection_tag === ch || subNames.has(c.collection_tag)).length;
          if (!count) return null;
          return (
            <button
              key={ch}
              className={`btn btn-sm ${chapterFilter === ch ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => { setChapterFilter(chapterFilter === ch ? '' : ch); setCollectionFilter(''); }}
            >
              {ch} ({count})
            </button>
          );
        })}
      </div>

      {/* Collection sub-filter */}
      {chapterFilter && (
        <div style={{ marginBottom: 12 }}>
          <select value={collectionFilter} onChange={e => setCollectionFilter(e.target.value)} style={{ fontSize: '0.78rem' }}>
            <option value="">All in {chapterFilter}</option>
            {collectionsInChapter(chapterFilter).map(c => (
              <option key={c.name} value={c.name}>{c.name}</option>
            ))}
          </select>
        </div>
      )}

      {loading && <div style={{ color: 'var(--charcoal-soft)', fontSize: '0.85rem' }}>Loading…</div>}

      {!loading && visible.length === 0 && (
        <div className="empty-state">
          <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>🎨</div>
          <p>{chapterFilter || collectionFilter ? 'No concepts in this filter.' : 'No concepts yet. Add one to get started.'}</p>
        </div>
      )}

      {!loading && visible.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
          {visible.map(c => (
            <ConceptCard key={c.id} concept={c} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </div>
  );
}
