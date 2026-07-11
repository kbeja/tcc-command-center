import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCollectionObjects, useCollectionObjects as useColls, createCollection } from '../lib/hooks';
import { useSparks, useProducts } from '../lib/hooks';

const PRIORITY_ORDER = ['flagship', 'priority_1', 'priority_2', 'supporting', 'archived'];

const PRIORITY_LABELS = {
  flagship:   '⭐ Flagship',
  priority_1: 'Priority 1 — Build now',
  priority_2: 'Priority 2 — Build next',
  supporting: 'Supporting — Active but not primary focus',
  archived:   'Archived',
};

function evalScore(c) {
  return [
    c.evaluation_market_evidence,
    c.evaluation_human_truth,
    c.evaluation_tcc_brand_fit,
    c.evaluation_expandability,
    c.evaluation_long_term_opportunity,
  ].filter(Boolean).length;
}

function CollectionCard({ collection, productCount, sparkCount, onClick }) {
  const score = evalScore(collection);
  const allChecked = score === 5;

  return (
    <div
      onClick={onClick}
      style={{
        border: '1px solid rgba(43,41,38,0.12)', borderRadius: 2,
        padding: '16px', marginBottom: 10, background: 'var(--warm-white)',
        cursor: 'pointer',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 500 }}>
          {collection.priority === 'flagship' && '⭐ '}{collection.name}
        </div>
        {!allChecked && (
          <span style={{ fontSize: '0.62rem', background: 'rgba(232,168,124,0.2)', color: '#7a4a1e', padding: '2px 7px', borderRadius: 20, whiteSpace: 'nowrap', marginLeft: 8 }}>
            {score}/5 evaluated
          </span>
        )}
      </div>
      <div style={{ fontSize: '0.72rem', color: 'var(--charcoal-soft)', marginBottom: 8 }}>
        {collection.parent_chapter && <span>{collection.parent_chapter} · </span>}
        <span>{productCount} product{productCount !== 1 ? 's' : ''}</span>
        <span style={{ margin: '0 4px' }}>·</span>
        <span>{sparkCount} spark{sparkCount !== 1 ? 's' : ''}</span>
        {collection.status === 'planned' && (
          <span style={{ marginLeft: 6, color: 'var(--charcoal-soft)', opacity: 0.6 }}>· Planned</span>
        )}
      </div>
      {collection.identity && (
        <div style={{ fontSize: '0.78rem', color: 'var(--charcoal-soft)', lineHeight: 1.5, marginBottom: 10 }}>
          {collection.identity.length > 90 ? collection.identity.slice(0, 90) + '…' : collection.identity}
        </div>
      )}
      <div style={{ fontSize: '0.72rem', color: 'var(--dusty-rose)', fontWeight: 500 }}>
        View →
      </div>
    </div>
  );
}

export default function Collections() {
  const navigate = useNavigate();
  const { collections, loading, refetch } = useCollectionObjects();
  const { sparks } = useSparks();
  const { products } = useProducts();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  function sparkCount(name) {
    return sparks.filter(s => s.collection_tag === name && !s.archived_at).length;
  }

  function productCount(name) {
    return products.filter(p => p.collection === name && !['Killed', 'Paused'].includes(p.stage)).length;
  }

  async function handleAdd() {
    if (!newName.trim()) return;
    setSaving(true);
    await createCollection(newName.trim());
    setNewName('');
    setSaving(false);
    setAdding(false);
    refetch();
  }

  const grouped = PRIORITY_ORDER.reduce((acc, p) => {
    acc[p] = collections.filter(c => (c.priority || 'supporting') === p);
    return acc;
  }, {});

  const visiblePriorities = showArchived ? PRIORITY_ORDER : PRIORITY_ORDER.filter(p => p !== 'archived');

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div className="page-title">Collections</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--charcoal-soft)', marginTop: 4 }}>
              {collections.filter(c => c.status !== 'archived').length} active
            </div>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>+ Add</button>
        </div>
      </div>

      {adding && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>New Collection</div>
          <input
            autoFocus
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            placeholder="Collection name…"
            style={{ marginBottom: 10 }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={handleAdd} disabled={saving || !newName.trim()}>
              {saving ? 'Saving…' : 'Save →'}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => { setAdding(false); setNewName(''); }}>Cancel</button>
          </div>
        </div>
      )}

      {loading && <div style={{ color: 'var(--charcoal-soft)', fontSize: '0.85rem' }}>Loading…</div>}

      {visiblePriorities.map(priority => {
        const items = grouped[priority] || [];
        if (!items.length) return null;
        return (
          <div key={priority} style={{ marginBottom: 28 }}>
            <div className="section-label" style={{ marginBottom: 12 }}>{PRIORITY_LABELS[priority]}</div>
            {items.map(c => (
              <CollectionCard
                key={c.id}
                collection={c}
                productCount={productCount(c.name)}
                sparkCount={sparkCount(c.name)}
                onClick={() => navigate(`/collections/${encodeURIComponent(c.name)}`)}
              />
            ))}
          </div>
        );
      })}

      {!showArchived && (grouped['archived'] || []).length > 0 && (
        <button
          className="btn btn-ghost btn-sm"
          style={{ marginTop: 8 }}
          onClick={() => setShowArchived(true)}
        >
          Show {grouped['archived'].length} archived →
        </button>
      )}
    </div>
  );
}
