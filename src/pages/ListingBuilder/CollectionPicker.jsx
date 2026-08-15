import { useState } from 'react';
import { createCollection } from '../../lib/hooks';
import { SEASONS } from './constants';

export default function CollectionPicker({ collections, collectionObjects, chapters, value, onChange, extraValues, onExtraChange, onCreated }) {
  const [adding, setAdding]     = useState(false);
  const [newName, setNewName]   = useState('');
  const [newChapter, setNewChapter] = useState('');
  const [newSeason, setNewSeason]   = useState('');
  const [newLaunch, setNewLaunch]   = useState('');
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');

  function resetNew() { setAdding(false); setNewName(''); setNewChapter(''); setNewSeason(''); setNewLaunch(''); setError(''); }

  async function handleCreate() {
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
      setError(error.message?.includes('unique') ? 'Already exists.' : 'Could not save.');
    } else {
      resetNew();
      onCreated?.(name);
    }
    setSaving(false);
  }

  return (
    <div className="form-group" style={{ marginBottom: 12 }}>
      <label className="form-label">Collection</label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 6 }}>
        {(() => {
          const allSelected = new Set([value, ...(extraValues || [])].filter(Boolean));

          function toggle(name) {
            if (!value) { onChange(name); return; }
            if (name === value) {
              // deselect primary — promote first extra if any, else clear
              const extras = new Set(extraValues || []);
              if (extras.size) {
                const [first, ...rest] = [...extras];
                onChange(first);
                onExtraChange?.(new Set(rest));
              } else {
                onChange('');
              }
              return;
            }
            const extras = new Set(extraValues || []);
            if (extras.has(name)) { extras.delete(name); } else { extras.add(name); }
            onExtraChange?.(extras);
          }

          const liveObjects = (collectionObjects || []).filter(c => c.status !== 'archived');
          const groups = chapters.map(ch => {
            const inCh = liveObjects.filter(c => c.chapter === ch);
            return inCh.length ? { label: ch, items: inCh } : null;
          }).filter(Boolean);
          const uncat = liveObjects.filter(c => !c.chapter);
          if (uncat.length) groups.push({ label: 'Other', items: uncat });

          return groups.map(({ label, items }) => (
            <div key={label}>
              <div style={{ fontSize: '0.65rem', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--charcoal-soft)', opacity: 0.5, marginBottom: 4 }}>{label}</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {items.map(c => {
                  const isPrimary = value === c.name;
                  const isExtra = (extraValues || new Set()).has(c.name);
                  const isOn = isPrimary || isExtra;
                  return (
                    <button key={c.name} type="button"
                      onClick={() => toggle(c.name)}
                      style={{
                        fontSize: '0.72rem', padding: '4px 10px', borderRadius: 20, cursor: 'pointer',
                        background: isPrimary ? 'var(--dusty-rose)' : isExtra ? 'rgba(124,175,138,0.25)' : 'transparent',
                        color: isPrimary ? '#fff' : isExtra ? '#2d6b3c' : 'var(--charcoal-soft)',
                        border: isOn ? 'none' : '1px solid rgba(43,41,38,0.2)',
                        fontWeight: isOn ? 600 : 400,
                        display: 'flex', alignItems: 'center', gap: 5,
                      }}
                    >
                      {c.name}
                      {isPrimary && <span style={{ fontSize: '0.55rem', opacity: 0.8 }}>primary</span>}
                      {c.season && !isPrimary && <span style={{ fontSize: '0.58rem', opacity: 0.7, fontWeight: 400 }}>· {c.season}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          ));
        })()}

        {!adding && (
          <button type="button" onClick={() => setAdding(true)}
            style={{ fontSize: '0.68rem', padding: '3px 8px', borderRadius: 20, cursor: 'pointer', alignSelf: 'flex-start', background: 'none', border: '1px dashed rgba(43,41,38,0.25)', color: 'var(--charcoal-soft)' }}>
            + New collection
          </button>
        )}
      </div>
      {adding && (
        <div style={{ background: 'var(--warm-white)', border: '1px solid rgba(43,41,38,0.1)', borderRadius: 6, padding: '12px', marginTop: 4, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input value={newName} onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Escape' && resetNew()}
            placeholder="Collection name…" autoFocus style={{ fontSize: '0.78rem' }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <select value={newChapter} onChange={e => setNewChapter(e.target.value)} style={{ fontSize: '0.75rem' }}>
              <option value="">— Chapter —</option>
              {chapters.map(ch => <option key={ch} value={ch}>{ch}</option>)}
            </select>
            <select value={newSeason} onChange={e => setNewSeason(e.target.value)} style={{ fontSize: '0.75rem' }}>
              <option value="">— Evergreen —</option>
              {SEASONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          {newSeason && (
            <div>
              <label className="form-label" style={{ marginBottom: 3 }}>Target launch date</label>
              <input type="date" value={newLaunch} onChange={e => setNewLaunch(e.target.value)} style={{ fontSize: '0.75rem' }} />
            </div>
          )}
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" className="btn btn-primary btn-sm" onClick={handleCreate} disabled={!newName.trim() || saving}>
              {saving ? '…' : 'Add'}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={resetNew}>Cancel</button>
          </div>
        </div>
      )}
      {error && <div style={{ fontSize: '0.72rem', color: 'var(--alert)', marginTop: 4 }}>{error}</div>}
    </div>
  );
}
