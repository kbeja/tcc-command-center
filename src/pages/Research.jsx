import { useState } from 'react';
import { useResearchSessions, useCollections, createCollection, deleteCollection } from '../lib/hooks';
import ResearchSessionCard from '../components/ResearchSessionCard';
import ResearchSessionForm from '../components/ResearchSessionForm';

function CollectionsManager({ collections, refetch }) {
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [error, setError] = useState('');

  async function handleAdd() {
    const name = newName.trim();
    if (!name) return;
    setSaving(true);
    setError('');
    const { error } = await createCollection(name);
    if (error) {
      setError(error.message?.includes('unique') ? 'A collection with that name already exists.' : 'Could not save.');
    } else {
      setNewName('');
      refetch();
    }
    setSaving(false);
  }

  async function handleDelete(name) {
    await deleteCollection(name);
    setConfirmDelete(null);
    refetch();
  }

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div className="section-label" style={{ marginBottom: 10 }}>Add Collection</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Collection name…"
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            style={{ flex: 1 }}
          />
          <button className="btn btn-primary btn-sm" onClick={handleAdd} disabled={!newName.trim() || saving}>
            {saving ? 'Saving…' : 'Add'}
          </button>
        </div>
        {error && <div style={{ fontSize: '0.75rem', color: 'var(--alert)', marginTop: 6 }}>{error}</div>}
      </div>

      <div className="section-label" style={{ marginBottom: 10 }}>Your Collections</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {collections.map(name => (
          <div key={name} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 14px', background: 'var(--warm-white)',
            border: '1px solid rgba(43,41,38,0.08)', borderRadius: 2,
          }}>
            <span style={{ fontSize: '0.85rem' }}>{name}</span>
            {confirmDelete === name ? (
              <span style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.75rem' }}>
                <span style={{ color: 'var(--charcoal-soft)' }}>Delete?</span>
                <button onClick={() => handleDelete(name)} style={{ color: 'var(--alert)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer' }}>Yes</button>
                <button onClick={() => setConfirmDelete(null)} style={{ color: 'var(--charcoal-soft)', background: 'none', border: 'none', cursor: 'pointer' }}>Cancel</button>
              </span>
            ) : (
              <button onClick={() => setConfirmDelete(name)} style={{ color: 'var(--charcoal-soft)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem', opacity: 0.5 }}>
                🗑
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Research() {
  const [tab, setTab] = useState('sessions');
  const [filterCollection, setFilterCollection] = useState('');
  const { sessions, loading, refetch } = useResearchSessions(filterCollection || undefined);
  const { collections, refetch: refetchCollections } = useCollections();
  const [adding, setAdding] = useState(false);

  const grouped = sessions.reduce((acc, s) => {
    const key = s.collection || 'Uncategorized';
    if (!acc[key]) acc[key] = [];
    acc[key].push(s);
    return acc;
  }, {});

  const groupKeys = Object.keys(grouped).sort();

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div className="page-title">Research</div>
          {tab === 'sessions' && (
            <button className="btn btn-primary btn-sm" onClick={() => setAdding(!adding)}>
              {adding ? 'Cancel' : '+ Add Session'}
            </button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
          <button className={`btn btn-sm ${tab === 'sessions' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('sessions')}>
            Sessions
          </button>
          <button className={`btn btn-sm ${tab === 'collections' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('collections')}>
            Collections
          </button>
        </div>
      </div>

      {tab === 'collections' && (
        <CollectionsManager collections={collections} refetch={refetchCollections} />
      )}

      {tab === 'sessions' && (
        <>
          {adding && (
            <div className="card" style={{ marginBottom: 20 }}>
              <ResearchSessionForm
                defaultCollection={filterCollection || collections[0] || ''}
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
            {collections.map(c => (
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

          {groupKeys.map(col => (
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
        </>
      )}
    </div>
  );
}
