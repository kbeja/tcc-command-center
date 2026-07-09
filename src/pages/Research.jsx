import { useState } from 'react';
import { useResearchSessions } from '../lib/hooks';
import { COLLECTIONS } from '../data/collections';
import ResearchSessionCard from '../components/ResearchSessionCard';
import ResearchSessionForm from '../components/ResearchSessionForm';

export default function Research() {
  const [filterCollection, setFilterCollection] = useState('');
  const { sessions, loading, refetch } = useResearchSessions(filterCollection || undefined);
  const [adding, setAdding] = useState(false);

  // Group by collection
  const grouped = sessions.reduce((acc, s) => {
    const key = s.collection || 'Uncategorized';
    if (!acc[key]) acc[key] = [];
    acc[key].push(s);
    return acc;
  }, {});

  const collections = Object.keys(grouped).sort();

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div className="page-title">Research</div>
          <button className="btn btn-primary btn-sm" onClick={() => setAdding(!adding)}>
            {adding ? 'Cancel' : '+ Add Session'}
          </button>
        </div>
      </div>

      {adding && (
        <div className="card" style={{ marginBottom: 20 }}>
          <ResearchSessionForm
            defaultCollection={filterCollection || 'Mom Chapter'}
            onSaved={() => { setAdding(false); refetch(); }}
            onCancel={() => setAdding(false)}
          />
        </div>
      )}

      <div style={{ marginBottom: 20, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button
          className={`btn btn-sm ${!filterCollection ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setFilterCollection('')}
        >
          All
        </button>
        {COLLECTIONS.map(c => (
          <button
            key={c}
            className={`btn btn-sm ${filterCollection === c ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setFilterCollection(c)}
          >
            {c}
          </button>
        ))}
      </div>

      {loading && <div style={{ color: 'var(--charcoal-soft)', fontSize: '0.85rem' }}>Loading…</div>}

      {!loading && sessions.length === 0 && (
        <div className="empty-state">
          <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>🔬</div>
          <p>No research sessions yet. Add one to start tracking keyword research by collection.</p>
        </div>
      )}

      {collections.map(col => (
        <div key={col} style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <div className="section-label" style={{ margin: 0 }}>{col}</div>
            <span style={{ fontSize: '0.7rem', color: 'var(--charcoal-soft)' }}>
              {grouped[col].length} session{grouped[col].length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="card">
            {grouped[col].map(s => <ResearchSessionCard key={s.id} session={s} onDeleted={refetch} />)}
          </div>
        </div>
      ))}
    </div>
  );
}
