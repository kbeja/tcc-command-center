import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useCollectionObjects, updateCollection, useSparks, useProducts, useResearchSessions } from '../lib/hooks';

const EVAL_FIELDS = [
  { key: 'evaluation_market_evidence',         label: 'Market evidence' },
  { key: 'evaluation_human_truth',             label: 'Human truth' },
  { key: 'evaluation_tcc_brand_fit',           label: 'TCC brand fit' },
  { key: 'evaluation_expandability',           label: 'Expandability' },
  { key: 'evaluation_long_term_opportunity',   label: 'Long-term opportunity vs competition' },
];

const PRIORITY_OPTIONS = [
  { value: 'flagship',   label: '⭐ Flagship' },
  { value: 'priority_1', label: 'Priority 1 — Build now' },
  { value: 'priority_2', label: 'Priority 2 — Build next' },
  { value: 'supporting', label: 'Supporting' },
  { value: 'archived',   label: 'Archived' },
];

const STATUS_OPTIONS = ['active', 'planned', 'archived'];

export default function CollectionDetail() {
  const { name: encodedName } = useParams();
  const name = decodeURIComponent(encodedName);
  const navigate = useNavigate();

  const { collections, loading: colLoading, refetch } = useCollectionObjects();
  const { sparks } = useSparks();
  const { products } = useProducts();
  const { sessions } = useResearchSessions(name);

  const collection = collections.find(c => c.name === name);

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [fieldSaved, setFieldSaved] = useState('');

  useEffect(() => {
    if (collection && !form) {
      setForm({ ...collection });
    }
  }, [collection]);

  if (colLoading) return <div className="page"><div style={{ color: 'var(--charcoal-soft)', padding: 24 }}>Loading…</div></div>;
  if (!collection) return <div className="page"><div style={{ color: 'var(--charcoal-soft)', padding: 24 }}>Collection not found.</div></div>;

  const collectionSparks = sparks.filter(s => s.collection_tag === name && !s.archived_at);
  const collectionProducts = products.filter(p => p.collection === name && !['Killed'].includes(p.stage));
  const liveProducts = collectionProducts.filter(p => p.stage === 'Live' || p.stage === 'Reviewing');
  const inProgressProducts = collectionProducts.filter(p => !['Live', 'Reviewing', 'Killed', 'Paused'].includes(p.stage));

  const evalScore = EVAL_FIELDS.filter(f => collection[f.key]).length;
  const allChecked = evalScore === 5;

  async function handleSave() {
    if (!form) return;
    setSaving(true);
    await updateCollection(collection.id, form);
    setSaving(false);
    setSaved(true);
    setEditing(false);
    refetch();
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleEvalToggle(field) {
    const updated = { [field]: !collection[field] };
    await updateCollection(collection.id, updated);
    setFieldSaved(field);
    refetch();
    setTimeout(() => setFieldSaved(''), 1500);
  }

  async function handleFieldBlur(field, value) {
    await updateCollection(collection.id, { [field]: value || null });
    setFieldSaved(field);
    refetch();
    setTimeout(() => setFieldSaved(''), 1500);
  }

  async function handleArchive() {
    await updateCollection(collection.id, { status: 'archived', priority: 'archived' });
    refetch();
    navigate('/collections');
  }

  const priorityLabel = PRIORITY_OPTIONS.find(p => p.value === (collection.priority || 'supporting'))?.label || 'Supporting';

  return (
    <div className="page">
      <div className="page-header">
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => navigate('/collections')}
          style={{ marginBottom: 12, padding: '4px 0', fontSize: '0.75rem' }}
        >
          ← Collections
        </button>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div className="page-title">{collection.name}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--charcoal-soft)', marginTop: 4 }}>
              {collection.parent_chapter && <span>{collection.parent_chapter} · </span>}
              <span>{priorityLabel}</span>
              {collection.status === 'planned' && <span> · Planned</span>}
            </div>
          </div>
          {saved && <span className="inline-confirm">Saved ✓</span>}
        </div>
      </div>

      <hr className="rule" />

      {/* ── Evaluation ── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div className="section-label" style={{ margin: 0 }}>Evaluation</div>
          <span style={{
            fontSize: '0.62rem', padding: '2px 8px', borderRadius: 20,
            background: allChecked ? 'rgba(124,175,138,0.15)' : 'rgba(232,168,124,0.2)',
            color: allChecked ? '#2d6b3c' : '#7a4a1e',
          }}>
            {evalScore}/5 {allChecked ? 'complete' : 'needs evaluation'}
          </span>
        </div>
        {EVAL_FIELDS.map(f => (
          <button
            key={f.key}
            onClick={() => handleEvalToggle(f.key)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, width: '100%',
              background: 'none', border: 'none', cursor: 'pointer', padding: '7px 0',
              borderBottom: '1px solid rgba(43,41,38,0.06)', textAlign: 'left',
            }}
          >
            <span style={{
              width: 18, height: 18, borderRadius: 3, flexShrink: 0,
              border: `2px solid ${collection[f.key] ? 'var(--success)' : 'rgba(43,41,38,0.2)'}`,
              background: collection[f.key] ? 'var(--success)' : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {collection[f.key] && <span style={{ color: 'white', fontSize: '0.6rem', fontWeight: 800 }}>✓</span>}
            </span>
            <span style={{ fontSize: '0.82rem', color: collection[f.key] ? 'var(--warm-charcoal)' : 'var(--charcoal-soft)' }}>
              {f.label}
            </span>
            {fieldSaved === f.key && <span className="inline-confirm" style={{ marginLeft: 'auto', fontSize: '0.65rem' }}>✓</span>}
          </button>
        ))}
      </div>

      <hr className="rule" />

      {/* ── Identity & Details ── */}
      <div style={{ marginBottom: 24 }}>
        <div className="section-label" style={{ marginBottom: 12 }}>Identity</div>
        <div className="form-group">
          <label className="form-label">
            What this collection stands for
            {fieldSaved === 'identity' && <span className="inline-confirm" style={{ marginLeft: 6 }}>✓</span>}
          </label>
          <textarea
            defaultValue={collection.identity || ''}
            onBlur={e => handleFieldBlur('identity', e.target.value)}
            rows={3}
            placeholder="What this collection stands for, who it's for, what feeling it captures…"
            style={{ fontSize: '0.82rem' }}
          />
        </div>
        <div className="form-group">
          <label className="form-label">
            Expansion opportunities
            {fieldSaved === 'expansion_opportunities' && <span className="inline-confirm" style={{ marginLeft: 6 }}>✓</span>}
          </label>
          <input
            defaultValue={collection.expansion_opportunities || ''}
            onBlur={e => handleFieldBlur('expansion_opportunities', e.target.value)}
            placeholder="e.g. Apparel, mugs, totes, bookmarks, journals, printables"
          />
        </div>
      </div>

      <hr className="rule" />

      {/* ── Priority & Status ── */}
      <div style={{ marginBottom: 24 }}>
        <div className="section-label" style={{ marginBottom: 12 }}>Priority & Status</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Priority</label>
            <select
              value={collection.priority || 'supporting'}
              onChange={e => updateCollection(collection.id, { priority: e.target.value }).then(() => refetch())}
            >
              {PRIORITY_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Status</label>
            <select
              value={collection.status || 'active'}
              onChange={e => updateCollection(collection.id, { status: e.target.value }).then(() => refetch())}
            >
              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
            </select>
          </div>
        </div>
        <div className="form-group" style={{ marginTop: 12, marginBottom: 0 }}>
          <label className="form-label">
            Parent chapter
            {fieldSaved === 'parent_chapter' && <span className="inline-confirm" style={{ marginLeft: 6 }}>✓</span>}
          </label>
          <input
            defaultValue={collection.parent_chapter || ''}
            onBlur={e => handleFieldBlur('parent_chapter', e.target.value)}
            placeholder="e.g. Reader Chapter, Mom Chapter"
          />
        </div>
      </div>

      <hr className="rule" />

      {/* ── Products ── */}
      <div style={{ marginBottom: 24 }}>
        <div className="section-label" style={{ marginBottom: 10 }}>
          Products ({liveProducts.length} live · {inProgressProducts.length} in progress)
        </div>
        {collectionProducts.length === 0 ? (
          <div style={{ fontSize: '0.82rem', color: 'var(--charcoal-soft)', fontStyle: 'italic' }}>
            No products yet — activate a spark to start.
          </div>
        ) : (
          collectionProducts.map(p => (
            <button
              key={p.id}
              onClick={() => navigate(`/products/${p.id}`)}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                width: '100%', background: 'none', border: 'none', cursor: 'pointer',
                padding: '8px 0', borderBottom: '1px solid rgba(43,41,38,0.06)',
                textAlign: 'left',
              }}
            >
              <span style={{ fontSize: '0.82rem' }}>{p.name}</span>
              <span style={{ fontSize: '0.65rem', color: 'var(--charcoal-soft)' }}>{p.stage}</span>
            </button>
          ))
        )}
      </div>

      <hr className="rule" />

      {/* ── Sparks ── */}
      <div style={{ marginBottom: 24 }}>
        <div className="section-label" style={{ marginBottom: 10 }}>
          Sparks ({collectionSparks.length})
        </div>
        {collectionSparks.length === 0 ? (
          <div style={{ fontSize: '0.82rem', color: 'var(--charcoal-soft)', fontStyle: 'italic' }}>No sparks assigned to this collection.</div>
        ) : (
          <>
            {collectionSparks.slice(0, 6).map(s => (
              <div key={s.id} style={{ fontSize: '0.82rem', padding: '6px 0', borderBottom: '1px solid rgba(43,41,38,0.06)', color: 'var(--charcoal-soft)' }}>
                {s.temperature === 'hot' && <span style={{ color: 'var(--dusty-rose)', marginRight: 6 }}>🔥</span>}
                {s.content.length > 80 ? s.content.slice(0, 80) + '…' : s.content}
              </div>
            ))}
            {collectionSparks.length > 6 && (
              <button
                className="btn btn-ghost btn-sm"
                style={{ marginTop: 8 }}
                onClick={() => navigate(`/sparks?collection=${encodeURIComponent(name)}`)}
              >
                View all {collectionSparks.length} sparks →
              </button>
            )}
          </>
        )}
      </div>

      <hr className="rule" />

      {/* ── Research ── */}
      {sessions && sessions.length > 0 && (
        <>
          <div style={{ marginBottom: 24 }}>
            <div className="section-label" style={{ marginBottom: 10 }}>Research ({sessions.length})</div>
            {sessions.slice(0, 3).map(s => (
              <div key={s.id} style={{ fontSize: '0.82rem', padding: '6px 0', borderBottom: '1px solid rgba(43,41,38,0.06)', display: 'flex', justifyContent: 'space-between' }}>
                <span>{s.niche || s.collection || 'General'}</span>
                <span style={{ color: 'var(--charcoal-soft)', fontSize: '0.72rem' }}>
                  {new Date(s.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              </div>
            ))}
            <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => navigate('/research')}>
              View research →
            </button>
          </div>
          <hr className="rule" />
        </>
      )}

      {/* ── Notes ── */}
      <div style={{ marginBottom: 24 }}>
        <div className="section-label" style={{ marginBottom: 10 }}>
          Notes
          {fieldSaved === 'notes' && <span className="inline-confirm" style={{ marginLeft: 8 }}>✓</span>}
        </div>
        <textarea
          defaultValue={collection.notes || ''}
          onBlur={e => handleFieldBlur('notes', e.target.value)}
          rows={4}
          placeholder="Strategy notes, decisions, context…"
          style={{ fontSize: '0.82rem' }}
        />
      </div>

      <hr className="rule" />

      {/* ── Archive ── */}
      <div style={{ marginBottom: 40 }}>
        {confirmArchive ? (
          <div style={{ fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ color: 'var(--charcoal-soft)' }}>Archive this collection?</span>
            <button onClick={handleArchive} style={{ color: 'var(--alert)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer' }}>Archive</button>
            <button onClick={() => setConfirmArchive(false)} style={{ color: 'var(--charcoal-soft)', background: 'none', border: 'none', cursor: 'pointer' }}>Cancel</button>
          </div>
        ) : (
          <button
            className="btn btn-ghost btn-sm"
            style={{ color: 'var(--charcoal-soft)', opacity: 0.5, fontSize: '0.75rem' }}
            onClick={() => setConfirmArchive(true)}
          >
            Archive collection
          </button>
        )}
      </div>
    </div>
  );
}
