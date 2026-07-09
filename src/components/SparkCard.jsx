import { useState } from 'react';
import { updateSpark, archiveSpark, createProduct, useCollections } from '../lib/hooks';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';

const IDEA_TYPES = ['Product Idea', 'Strategy Idea', 'Tool/Resource'];

const TYPE_STYLES = {
  'Product Idea':   { background: 'rgba(124,175,138,0.15)', color: '#2d6b3c' },
  'Strategy Idea':  { background: 'rgba(107,130,168,0.15)', color: '#2d4270' },
  'Tool/Resource':  { background: 'rgba(232,168,124,0.2)',  color: '#7a4a1e' },
};

export default function SparkCard({ spark, onAction }) {
  const navigate = useNavigate();
  const { collections } = useCollections();
  const [confirm, setConfirm] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editingCollection, setEditingCollection] = useState(false);
  const [collection, setCollection] = useState(spark.collection_tag || '');
  const [ideaType, setIdeaType] = useState(spark.idea_type || 'Product Idea');
  const [editingType, setEditingType] = useState(false);

  // Evaluate panel state
  const [evaluating, setEvaluating] = useState(false);
  const [evalAnswers, setEvalAnswers] = useState({ collection: null, amanda: null, market: null });
  const [suggestion, setSuggestion] = useState(null);
  const [activating, setActivating] = useState(false);

  async function handleActivate() {
    setActivating(true);
    const { data, error } = await createProduct({
      name: spark.content,
      stage: 'Idea',
      collection: spark.collection_tag || null,
    });
    if (error || !data?.id) { setActivating(false); return; }
    await archiveSpark(spark.id);
    onAction?.();
    navigate(`/products/${data.id}`);
  }

  async function handle(action) {
    if (action === 'archive') { await archiveSpark(spark.id); }
    else if (action === 'cool') { await updateSpark(spark.id, { temperature: 'cold', hot_reason: null }); }
    else if (action === 'hot') { await updateSpark(spark.id, { temperature: 'hot', hot_reason: 'Evaluated — promising' }); }
    setConfirm(action);
    setTimeout(() => { setConfirm(null); onAction?.(); }, 1200);
  }

  async function handleDelete() {
    await supabase.from('sparks').delete().eq('id', spark.id);
    onAction?.();
  }

  async function handleCollectionSave(val) {
    setCollection(val);
    setEditingCollection(false);
    await updateSpark(spark.id, { collection_tag: val || null });
    onAction?.();
  }

  async function handleTypeSave(val) {
    setIdeaType(val);
    setEditingType(false);
    await updateSpark(spark.id, { idea_type: val });
  }

  function computeSuggestion(answers) {
    const { collection: c, amanda: a, market: m } = answers;
    if (c === 'yes' && a === 'yes' && m === 'yes') return 'activate';
    if (c === 'no' && a === 'no' && m === 'no') return 'archive';
    if (c !== null && a !== null && m !== null) return 'hot';
    return null;
  }

  function setEvalAnswer(key, val) {
    const next = { ...evalAnswers, [key]: val };
    setEvalAnswers(next);
    setSuggestion(computeSuggestion(next));
  }

  async function confirmSuggestion() {
    if (suggestion === 'activate') {
      await handleActivate();
    } else if (suggestion === 'hot') {
      await handle('hot');
      setEvaluating(false);
    } else if (suggestion === 'archive') {
      await handle('archive');
      setEvaluating(false);
    }
  }

  const typeStyle = TYPE_STYLES[ideaType] || TYPE_STYLES['Product Idea'];

  const SUGGESTION_LABELS = {
    activate: { label: 'Activate → move to Pipeline', btn: 'btn-primary' },
    hot: { label: 'Mark Hot — revisit later', btn: 'btn-ghost' },
    archive: { label: 'Archive — not a fit right now', btn: 'btn-ghost' },
  };

  return (
    <div className="card" style={{ marginBottom: 8 }}>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', marginBottom: 6 }}>
          {spark.content}
        </div>
        {spark.temperature === 'hot' && (
          <div style={{ fontSize: '0.72rem', color: 'var(--dusty-rose)', fontWeight: 500, marginBottom: 4 }}>
            🔥 Hot{spark.hot_reason ? ` — ${spark.hot_reason}` : ''}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.72rem', color: 'var(--charcoal-soft)' }}>
            {new Date(spark.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>

          {/* Idea type badge */}
          {editingType ? (
            <select
              value={ideaType}
              onChange={e => handleTypeSave(e.target.value)}
              onBlur={() => setEditingType(false)}
              autoFocus
              style={{ fontSize: '0.72rem', padding: '2px 6px', height: 'auto' }}
            >
              {IDEA_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          ) : (
            <button
              onClick={() => setEditingType(true)}
              style={{
                fontSize: '0.65rem', fontWeight: 500, padding: '2px 8px', borderRadius: 20,
                border: 'none', cursor: 'pointer', ...typeStyle,
              }}
            >
              {ideaType}
            </button>
          )}

          {/* Collection tag */}
          {editingCollection ? (
            <select
              value={collection}
              onChange={e => handleCollectionSave(e.target.value)}
              onBlur={() => setEditingCollection(false)}
              autoFocus
              style={{ fontSize: '0.72rem', padding: '2px 6px', height: 'auto' }}
            >
              <option value="">No collection</option>
              {collections.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          ) : (
            <button
              onClick={() => setEditingCollection(true)}
              style={{
                fontSize: '0.68rem', padding: '2px 8px', borderRadius: 20,
                background: collection ? 'var(--rose-faint)' : 'var(--charcoal-faint)',
                color: collection ? 'var(--dusty-rose)' : 'var(--charcoal-soft)',
                border: 'none', cursor: 'pointer',
              }}
            >
              {collection || '+ collection'}
            </button>
          )}
        </div>
      </div>

      {/* Evaluate panel for cold sparks */}
      {evaluating && (
        <div style={{
          background: 'var(--charcoal-faint)', borderRadius: 4,
          padding: '12px 14px', marginBottom: 10,
        }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>Quick Eval</div>

          {[
            { key: 'collection', label: 'Fits an existing TCC collection?', opts: ['yes', 'no'] },
            { key: 'amanda', label: 'Would Amanda buy this?', opts: ['yes', 'no'] },
            { key: 'market', label: 'Market evidence?', opts: ['yes', 'no', 'unknown'] },
          ].map(({ key, label, opts }) => (
            <div key={key} style={{ marginBottom: 8 }}>
              <div style={{ fontSize: '0.75rem', marginBottom: 4 }}>{label}</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {opts.map(o => (
                  <button
                    key={o}
                    onClick={() => setEvalAnswer(key, o)}
                    style={{
                      fontSize: '0.72rem', padding: '3px 10px', borderRadius: 20, cursor: 'pointer',
                      border: '1px solid rgba(43,41,38,0.2)',
                      background: evalAnswers[key] === o ? 'var(--dusty-rose)' : 'transparent',
                      color: evalAnswers[key] === o ? 'white' : 'var(--charcoal)',
                      fontWeight: evalAnswers[key] === o ? 600 : 400,
                    }}
                  >
                    {o}
                  </button>
                ))}
              </div>
            </div>
          ))}

          {suggestion && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(43,41,38,0.1)' }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--charcoal-soft)', marginBottom: 8 }}>
                Suggestion: <strong>{SUGGESTION_LABELS[suggestion].label}</strong>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className={`btn ${SUGGESTION_LABELS[suggestion].btn} btn-sm`}
                  onClick={confirmSuggestion}
                  disabled={activating}
                >
                  {activating ? 'Creating…' : 'Confirm →'}
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => { setEvaluating(false); setEvalAnswers({ collection: null, amanda: null, market: null }); setSuggestion(null); }}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {!suggestion && (
            <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => { setEvaluating(false); setEvalAnswers({ collection: null, amanda: null, market: null }); }}>
              Cancel
            </button>
          )}
        </div>
      )}

      {confirm ? (
        <span className="inline-confirm">✓ Done</span>
      ) : confirmDelete ? (
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.78rem' }}>
          <span style={{ color: 'var(--charcoal-soft)' }}>Remove this spark?</span>
          <button onClick={handleDelete} style={{ color: 'var(--alert)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer' }}>Yes</button>
          <button onClick={() => setConfirmDelete(false)} style={{ color: 'var(--charcoal-soft)', background: 'none', border: 'none', cursor: 'pointer' }}>Cancel</button>
        </span>
      ) : !evaluating && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {spark.temperature === 'hot' ? (
            <>
              <button className="btn btn-primary btn-sm" onClick={handleActivate} disabled={activating}>
                {activating ? 'Creating…' : 'Activate →'}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => handle('cool')}>Not yet</button>
            </>
          ) : (
            <button className="btn btn-ghost btn-sm" onClick={() => setEvaluating(true)}>Evaluate →</button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={() => handle('archive')} style={{ color: 'var(--charcoal-soft)' }}>Archive</button>
          <button onClick={() => setConfirmDelete(true)} style={{ marginLeft: 'auto', color: 'var(--charcoal-soft)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem', opacity: 0.5 }} title="Delete spark">🗑</button>
        </div>
      )}
    </div>
  );
}
