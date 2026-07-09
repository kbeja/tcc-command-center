import { useState } from 'react';
import { useCodexEntries, createCodexEntry, updateCodexEntry, deleteCodexEntry } from '../lib/hooks';

const CATEGORIES = ['Product Strategy', 'Process & Workflow', 'Brand & Voice', 'Pricing & Business', 'Lessons Learned'];

const CAT_STYLES = {
  'Product Strategy':  { background: 'rgba(124,175,138,0.15)', color: '#2d6b3c' },
  'Process & Workflow':{ background: 'rgba(107,130,168,0.15)', color: '#2d4270' },
  'Brand & Voice':     { background: 'rgba(201,123,123,0.15)', color: '#7a2b2b' },
  'Pricing & Business':{ background: 'rgba(232,168,124,0.2)',  color: '#7a4a1e' },
  'Lessons Learned':   { background: 'rgba(43,41,38,0.08)',    color: 'var(--charcoal-soft)' },
};

function CodexEntry({ entry, onAction }) {
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(entry.content);
  const [category, setCategory] = useState(entry.category);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    await updateCodexEntry(entry.id, { content, category });
    setSaving(false);
    setEditing(false);
    onAction?.();
  }

  async function handleDelete() {
    await deleteCodexEntry(entry.id);
    onAction?.();
  }

  const catStyle = CAT_STYLES[entry.category] || CAT_STYLES['Lessons Learned'];

  if (editing) {
    return (
      <div className="card" style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {CATEGORIES.map(c => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              style={{
                fontSize: '0.68rem', padding: '3px 10px', borderRadius: 20, cursor: 'pointer',
                border: '1px solid rgba(43,41,38,0.2)',
                background: category === c ? 'var(--dusty-rose)' : 'transparent',
                color: category === c ? 'white' : 'var(--charcoal-soft)',
                fontWeight: category === c ? 600 : 400,
              }}
            >
              {c}
            </button>
          ))}
        </div>
        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          rows={3}
          style={{ marginBottom: 10, fontSize: '0.85rem' }}
        />
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving || !content.trim()}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => { setEditing(false); setContent(entry.content); setCategory(entry.category); }}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div className="card" style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <span style={{ fontSize: '0.65rem', fontWeight: 500, padding: '2px 8px', borderRadius: 20, ...catStyle }}>
          {entry.category}
        </span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: '0.65rem', color: 'var(--charcoal-soft)' }}>
            {new Date(entry.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
          {entry.source && (
            <span style={{ fontSize: '0.65rem', color: 'var(--charcoal-soft)', opacity: 0.6 }}>{entry.source}</span>
          )}
        </div>
      </div>
      <p style={{ fontSize: '0.85rem', lineHeight: 1.6, marginBottom: 10 }}>{entry.content}</p>
      {confirmDelete ? (
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.78rem' }}>
          <span style={{ color: 'var(--charcoal-soft)' }}>Delete this entry?</span>
          <button onClick={handleDelete} style={{ color: 'var(--alert)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer' }}>Yes</button>
          <button onClick={() => setConfirmDelete(false)} style={{ color: 'var(--charcoal-soft)', background: 'none', border: 'none', cursor: 'pointer' }}>Cancel</button>
        </span>
      ) : (
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>Edit</button>
          <button onClick={() => setConfirmDelete(true)} style={{ marginLeft: 'auto', color: 'var(--charcoal-soft)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem', opacity: 0.5 }}>🗑</button>
        </div>
      )}
    </div>
  );
}

export default function Codex() {
  const { entries, loading, refetch } = useCodexEntries();
  const [categoryFilter, setCategoryFilter] = useState('');
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [newContent, setNewContent] = useState('');
  const [newCategory, setNewCategory] = useState('Product Strategy');
  const [saving, setSaving] = useState(false);

  const filtered = entries.filter(e => {
    const matchCat = !categoryFilter || e.category === categoryFilter;
    const matchSearch = !search || e.content.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const grouped = CATEGORIES.reduce((acc, cat) => {
    const items = filtered.filter(e => e.category === cat);
    if (items.length) acc[cat] = items;
    return acc;
  }, {});

  async function handleAdd() {
    if (!newContent.trim()) return;
    setSaving(true);
    await createCodexEntry({ category: newCategory, content: newContent.trim(), source: 'Manual' });
    setNewContent('');
    setNewCategory('Product Strategy');
    setSaving(false);
    setAdding(false);
    refetch();
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <input
          placeholder="Search codex…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 140 }}
        />
        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} style={{ width: 'auto' }}>
          <option value="">All categories</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>+ Add entry</button>
      </div>

      {adding && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>New Codex Entry</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {CATEGORIES.map(c => (
              <button
                key={c}
                onClick={() => setNewCategory(c)}
                style={{
                  fontSize: '0.68rem', padding: '3px 10px', borderRadius: 20, cursor: 'pointer',
                  border: '1px solid rgba(43,41,38,0.2)',
                  background: newCategory === c ? 'var(--dusty-rose)' : 'transparent',
                  color: newCategory === c ? 'white' : 'var(--charcoal-soft)',
                  fontWeight: newCategory === c ? 600 : 400,
                }}
              >
                {c}
              </button>
            ))}
          </div>
          <textarea
            value={newContent}
            onChange={e => setNewContent(e.target.value)}
            placeholder="Write the rule, decision, or lesson…"
            rows={3}
            style={{ marginBottom: 10 }}
            autoFocus
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={handleAdd} disabled={saving || !newContent.trim()}>
              {saving ? 'Saving…' : 'Save to Codex →'}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => { setAdding(false); setNewContent(''); }}>Cancel</button>
          </div>
        </div>
      )}

      {loading && <div style={{ color: 'var(--charcoal-soft)', fontSize: '0.85rem' }}>Loading…</div>}

      {!loading && entries.length === 0 && (
        <div className="empty-state">
          <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>📖</div>
          <p>No codex entries yet. Route decisions here from Triage, or add one manually.</p>
        </div>
      )}

      {!loading && entries.length > 0 && filtered.length === 0 && (
        <div className="empty-state">
          <p>No entries match your search.</p>
        </div>
      )}

      {Object.entries(grouped).map(([cat, items]) => (
        <div key={cat} style={{ marginBottom: 24 }}>
          <div className="section-label" style={{ marginBottom: 10 }}>{cat}</div>
          {items.map(e => <CodexEntry key={e.id} entry={e} onAction={refetch} />)}
        </div>
      ))}
    </div>
  );
}
