import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useConcepts, archiveConcept, useConceptTagsAll } from '../lib/hooks';
import ConceptChatImport from '../components/ConceptChatImport';

export default function Concepts() {
  const navigate = useNavigate();
  const { concepts, loading, refetch } = useConcepts(); // no collection filter = all
  const { tagsByConceptId } = useConceptTagsAll();
  const [search, setSearch] = useState('');
  const [filterCollection, setFilterCollection] = useState('');
  const [filterTag, setFilterTag] = useState('');
  const [showImport, setShowImport] = useState(false);

  const collections = [...new Set(concepts.map(c => c.collection_name).filter(Boolean))].sort();
  // Derived from `concepts` (already status='active'-filtered by useConcepts()),
  // not a separate all-tags fetch -- otherwise an archived concept's tag
  // could appear as a filter option that can never match anything visible.
  const allConceptTags = [...new Map(
    concepts.flatMap(c => tagsByConceptId[c.id] || []).map(t => [t.id, t])
  ).values()].sort((a, b) => a.name.localeCompare(b.name));

  const visible = concepts.filter(c => {
    if (filterCollection && c.collection_name !== filterCollection) return false;
    if (filterTag && !(tagsByConceptId[c.id] || []).some(t => t.id === filterTag)) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        c.name?.toLowerCase().includes(q) ||
        c.collection_name?.toLowerCase().includes(q) ||
        c.visual_style?.toLowerCase().includes(q) ||
        c.design_direction?.toLowerCase().includes(q) ||
        (c.mood_keywords || []).some(k => k.toLowerCase().includes(q))
      );
    }
    return true;
  });

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div className="page-title">Design Vault</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--charcoal-soft)', marginTop: 4 }}>
              {concepts.length} concept{concepts.length !== 1 ? 's' : ''} across {collections.length} collection{collections.length !== 1 ? 's' : ''}
            </div>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => setShowImport(true)}>
            + Import Concept
          </button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search concepts…"
          style={{ flex: 1, minWidth: 180, fontSize: '0.82rem', padding: '6px 10px' }}
        />
        <select
          value={filterCollection}
          onChange={e => setFilterCollection(e.target.value)}
          style={{ fontSize: '0.78rem', padding: '6px 8px' }}
        >
          <option value="">All collections</option>
          {collections.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select
          value={filterTag}
          onChange={e => setFilterTag(e.target.value)}
          style={{ fontSize: '0.78rem', padding: '6px 8px' }}
        >
          <option value="">All tags</option>
          {allConceptTags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>

      {loading && <div style={{ color: 'var(--charcoal-soft)', fontSize: '0.85rem' }}>Loading…</div>}

      {!loading && visible.length === 0 && (
        <div className="empty-state">
          <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>✦</div>
          <p style={{ marginBottom: 12 }}>
            {concepts.length === 0 ? 'No concepts yet.' : 'No concepts match your filters.'}
          </p>
          {concepts.length === 0 && (
            <button className="btn btn-primary btn-sm" onClick={() => setShowImport(true)}>
              + Import your first concept
            </button>
          )}
        </div>
      )}

      {!loading && visible.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
          {visible.map(c => (
            <ConceptCard key={c.id} concept={c} tags={tagsByConceptId[c.id] || []} onNavigate={() => navigate(`/concepts/${c.id}`)} onArchive={async () => { await archiveConcept(c.id); refetch(); }} />
          ))}
        </div>
      )}

      {showImport && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }}>
          <div style={{ background: 'var(--warm-white)', borderRadius: 10, maxWidth: 700, width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
            <ConceptChatImport
              onSaved={() => { refetch(); setShowImport(false); }}
              onClose={() => setShowImport(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function ConceptCard({ concept, tags, onNavigate, onArchive }) {
  const [confirmArchive, setConfirmArchive] = useState(false);
  const kittlOutput = concept.concept_outputs?.find(o => o.output_type === 'kittl_prompt' && o.is_current);

  return (
    <div style={{ border: '1px solid rgba(43,41,38,0.12)', borderRadius: 8, background: 'var(--warm-white)', overflow: 'hidden' }}>
      <div
        onClick={onNavigate}
        style={{ padding: '14px 16px', cursor: 'pointer' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
          <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{concept.name}</div>
          {concept.concept_code && (
            <span style={{ fontSize: '0.62rem', color: 'var(--charcoal-soft)', fontFamily: 'monospace', background: 'rgba(43,41,38,0.06)', padding: '2px 6px', borderRadius: 4, flexShrink: 0, marginLeft: 8 }}>
              {concept.concept_code}
            </span>
          )}
        </div>

        <div style={{ fontSize: '0.7rem', color: 'var(--dusty-rose)', marginBottom: 6 }}>
          {concept.collection_name}
        </div>

        {concept.visual_style && (
          <div style={{ fontSize: '0.75rem', color: 'var(--charcoal-soft)', marginBottom: 4 }}>{concept.visual_style}</div>
        )}

        {concept.design_direction && (
          <div style={{ fontSize: '0.78rem', lineHeight: 1.4, marginBottom: 8 }}>
            {concept.design_direction.length > 100 ? concept.design_direction.slice(0, 100) + '…' : concept.design_direction}
          </div>
        )}

        {concept.mood_keywords?.length > 0 && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
            {concept.mood_keywords.slice(0, 4).map(k => (
              <span key={k} style={{ fontSize: '0.62rem', padding: '2px 7px', borderRadius: 20, background: 'rgba(107,130,168,0.12)', color: '#2d4270' }}>
                {k}
              </span>
            ))}
          </div>
        )}

        {tags?.length > 0 && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
            {tags.map(t => (
              <span key={t.id} style={{ fontSize: '0.62rem', padding: '2px 7px', borderRadius: 20, background: 'rgba(124,175,138,0.15)', color: '#2d6b3c' }}>
                {t.name}
              </span>
            ))}
          </div>
        )}

        <div style={{ fontSize: '0.68rem', color: kittlOutput ? '#2d6b3c' : 'var(--charcoal-soft)' }}>
          {kittlOutput
            ? `✓ Kittl prompt · ${kittlOutput.output_source === 'imported' ? 'imported' : `v${kittlOutput.version} generated`}`
            : 'No Kittl prompt yet'}
        </div>
      </div>

      <div style={{ borderTop: '1px solid rgba(43,41,38,0.06)', padding: '8px 16px', display: 'flex', justifyContent: 'flex-end' }}>
        {confirmArchive ? (
          <div style={{ display: 'flex', gap: 8, fontSize: '0.72rem', alignItems: 'center' }}>
            <span style={{ color: 'var(--charcoal-soft)' }}>Archive?</span>
            <button onClick={onArchive} style={{ color: 'var(--alert)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Yes</button>
            <button onClick={() => setConfirmArchive(false)} style={{ color: 'var(--charcoal-soft)', background: 'none', border: 'none', cursor: 'pointer' }}>Cancel</button>
          </div>
        ) : (
          <button onClick={() => setConfirmArchive(true)} style={{ fontSize: '0.68rem', color: 'var(--charcoal-soft)', background: 'none', border: 'none', cursor: 'pointer', opacity: 0.5 }}>
            Archive
          </button>
        )}
      </div>
    </div>
  );
}
