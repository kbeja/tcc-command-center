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

const PARENT_NICHES = ['Reader Chapter', 'Mom Chapter', 'Kids Chapter'];

export default function Research() {
  const [tab, setTab] = useState('sessions');
  const [filterParent, setFilterParent] = useState('');
  const [filterCollection, setFilterCollection] = useState('');
  const { sessions, loading, refetch } = useResearchSessions(filterCollection || undefined);
  const { collections, refetch: refetchCollections } = useCollections();
  const [adding, setAdding] = useState(false);

  // Filter by parent niche first if set
  const visibleSessions = filterParent
    ? sessions.filter(s => s.parent_niche === filterParent)
    : sessions;

  // Group by parent_niche → collection (two-level hierarchy)
  const hierarchy = visibleSessions.reduce((acc, s) => {
    const parent = s.parent_niche || 'Uncategorized';
    const col = s.collection || 'Uncategorized';
    if (!acc[parent]) acc[parent] = {};
    if (!acc[parent][col]) acc[parent][col] = [];
    acc[parent][col].push(s);
    return acc;
  }, {});

  // Sort: known niches first, then Uncategorized
  const parentOrder = [...PARENT_NICHES, 'Uncategorized'];
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

          {/* Parent niche filter bar */}
          <div style={{ marginBottom: 16, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              className={`btn btn-sm ${!filterParent && !filterCollection ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => { setFilterParent(''); setFilterCollection(''); }}
            >
              All ({sessions.length})
            </button>
            {PARENT_NICHES.map(p => {
              const count = sessions.filter(s => s.parent_niche === p).length;
              if (!count) return null;
              return (
                <button
                  key={p}
                  className={`btn btn-sm ${filterParent === p ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => { setFilterParent(filterParent === p ? '' : p); setFilterCollection(''); }}
                >
                  {p} ({count})
                </button>
              );
            })}
            {sessions.some(s => !s.parent_niche) && (
              <button
                className={`btn btn-sm ${filterParent === '__none' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => { setFilterParent(filterParent === '__none' ? '' : '__none'); setFilterCollection(''); }}
              >
                Uncategorized ({sessions.filter(s => !s.parent_niche).length})
              </button>
            )}
          </div>

          {loading && <div style={{ color: 'var(--charcoal-soft)', fontSize: '0.85rem' }}>Loading…</div>}

          {!loading && totalSessions === 0 && (
            <div className="empty-state">
              <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>🔬</div>
              <p>No research sessions yet. Add one to start tracking keyword research by collection.</p>
            </div>
          )}

          {sortedParents.map(parent => {
            const cols = hierarchy[parent];
            const parentTotal = Object.values(cols).flat().length;
            return (
              <div key={parent} style={{ marginBottom: 32 }}>
                {/* Parent niche header */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12,
                  paddingBottom: 8, borderBottom: '2px solid rgba(43,41,38,0.12)',
                }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: '1rem' }}>{parent}</div>
                  <span style={{ fontSize: '0.7rem', color: 'var(--charcoal-soft)' }}>
                    {parentTotal} session{parentTotal !== 1 ? 's' : ''}
                  </span>
                </div>

                {/* Sub-niches */}
                {Object.keys(cols).sort().map(col => (
                  <div key={col} style={{ marginBottom: 20, paddingLeft: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <div style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: 'var(--dusty-rose)', flexShrink: 0,
                      }} />
                      <div className="section-label" style={{ margin: 0 }}>{col}</div>
                      <span style={{ fontSize: '0.68rem', color: 'var(--charcoal-soft)' }}>
                        {cols[col].length} session{cols[col].length !== 1 ? 's' : ''} ·{' '}
                        {cols[col].reduce((s, r) => s + (r.keywords?.length || 0), 0)} keywords
                      </span>
                    </div>
                    <div className="card" style={{ paddingTop: 4 }}>
                      {cols[col].map(s => (
                        <ResearchSessionCard key={s.id} session={s} onDeleted={refetch} />
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
