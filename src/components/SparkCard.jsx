import { useState } from 'react';
import { updateSpark, archiveSpark, createProduct } from '../lib/hooks';
import { useCollectionsContext } from '../context/CollectionsContext';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import ConfirmButton from './ConfirmButton';
import NichePicker from './NichePicker';
import { SPARK_TYPES, SPARK_TYPE_STYLES, normalizeSparkType } from '../data/sparkTypes';
import { nichePath } from '../lib/niches';

// `niches` is passed in rather than fetched here on purpose. useNiches() opens
// a realtime channel per call, and the Idea Vault renders hundreds of cards at
// once — fetching per card would open hundreds of Supabase subscriptions. The
// list is read once in Sparks.jsx and threaded down for the display pill; the
// NichePicker (which does call useNiches) only mounts while one card is being
// edited, so at most one extra channel exists at a time.
export default function SparkCard({ spark, onAction, linkedConcepts = [], onCreateConcept, niches = [] }) {
  const navigate = useNavigate();
  const { collectionNames: collections } = useCollectionsContext();
  const [confirm, setConfirm] = useState(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [editingCollection, setEditingCollection] = useState(false);
  const [collection, setCollection] = useState(spark.collection_tag || '');
  const [ideaType, setIdeaType] = useState(normalizeSparkType(spark.idea_type));
  const [editingType, setEditingType] = useState(false);
  const [nicheId, setNicheId] = useState(spark.primary_niche_id || null);
  const [editingNiche, setEditingNiche] = useState(false);

  // Evaluate panel state
  const [evaluating, setEvaluating] = useState(false);
  const [evalAnswers, setEvalAnswers] = useState({ collection: null, market: null, identity: null });
  const [suggestion, setSuggestion] = useState(null);
  const [activating, setActivating] = useState(false);

  async function handleActivate() {
    if (!spark.collection_tag) {
      setEditingCollection(true);
      return;
    }
    setActivating(true);
    const { data, error } = await createProduct({
      name: spark.content,
      stage: 'Idea',
      collection: spark.collection_tag,
      // §12 inheritance: activating a spark straight into a product carries
      // its classification across. Without this the taxonomy would be lost at
      // exactly the point it starts being worth analysing.
      primary_niche_id: spark.primary_niche_id || null,
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

  // Saved immediately on change rather than behind an edit/confirm step. A
  // spark is a low-ceremony object -- if classifying one costs three clicks,
  // 369 unclassified sparks stay unclassified.
  async function handleNicheSave(val) {
    setNicheId(val);
    await updateSpark(spark.id, { primary_niche_id: val });
    onAction?.();
  }

  function computeSuggestion(answers) {
    const { collection: c, market: m, identity: i } = answers;
    if (c === 'yes' && m === 'yes' && i === 'yes') return 'activate';
    if (c === 'no' && m === 'no' && i === 'no') return 'archive';
    if (c !== null && m !== null && i !== null) return 'hot';
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

  const typeStyle = SPARK_TYPE_STYLES[ideaType] || SPARK_TYPE_STYLES['Product / Concept'];
  // Full path, not just the leaf — "Hockey" and "Field Hockey" are only
  // distinguishable in context, and the pill is the only place the
  // classification is visible from the list.
  const nicheLabel = nicheId
    ? nichePath(niches.find(n => n.id === nicheId), niches) || null
    : null;

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
        {spark.temperature === 'hot' && (() => {
          const days = Math.floor((Date.now() - new Date(spark.created_at).getTime()) / 86400000);
          const isStale = days > 21;
          return (
            <div style={{ fontSize: '0.72rem', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ color: isStale ? '#7a4a1e' : 'var(--dusty-rose)', fontWeight: 500 }}>
                🔥 Hot{spark.hot_reason ? ` — ${spark.hot_reason}` : ''}
              </span>
              <span style={{ color: 'var(--charcoal-soft)' }}>· {days}d ago</span>
              {isStale && (
                <span style={{ fontSize: '0.65rem', padding: '1px 7px', borderRadius: 20, background: 'rgba(232,168,124,0.2)', color: '#7a4a1e' }}>
                  Still relevant?
                </span>
              )}
            </div>
          );
        })()}
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
              {SPARK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
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

          {/* Niche — the primary taxonomy path (Phase 3). Sits before the
              collection pill because the niche is now the main question and
              the collection the rarer one. */}
          {editingNiche ? (
            <div style={{ minWidth: 230 }}>
              <NichePicker
                value={nicheId}
                onChange={async val => { await handleNicheSave(val); setEditingNiche(false); }}
                label={null}
                compact
                allowCreate
              />
              <button
                onClick={() => setEditingNiche(false)}
                style={{ fontSize: '0.62rem', marginTop: 3, border: 'none', background: 'transparent', color: 'var(--charcoal-soft)', cursor: 'pointer', padding: 0 }}
              >
                done
              </button>
            </div>
          ) : (
            <button
              onClick={() => setEditingNiche(true)}
              title={nicheLabel || 'Assign a niche'}
              style={{
                fontSize: '0.68rem', padding: '2px 8px', borderRadius: 20,
                background: nicheId ? 'rgba(124,175,138,0.15)' : 'var(--charcoal-faint)',
                color: nicheId ? '#2d6b3c' : 'var(--charcoal-soft)',
                border: 'none', cursor: 'pointer', maxWidth: 240,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
            >
              {nicheLabel || '+ niche'}
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

        {linkedConcepts.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
            {linkedConcepts.map(c => (
              <button
                key={c.id}
                onClick={() => navigate(`/concepts/${c.id}`)}
                style={{
                  fontSize: '0.68rem', padding: '2px 9px', borderRadius: 20, cursor: 'pointer',
                  background: 'rgba(124,175,138,0.12)', color: '#2d6b3c',
                  border: '1px solid rgba(124,175,138,0.3)',
                }}
              >
                🔗 {c.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Evaluate panel for cold sparks */}
      {evaluating && (
        <div style={{
          background: 'var(--charcoal-faint)', borderRadius: 4,
          padding: '12px 14px', marginBottom: 10,
        }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>Quick Eval</div>

          {[
            { key: 'collection', label: 'Does this fit an existing TCC collection?', opts: ['yes', 'no'] },
            { key: 'market', label: 'Is there market evidence for this idea?', opts: ['yes', 'no', 'unknown'] },
            { key: 'identity', label: 'Does this have identity or ecosystem potential — could it support multiple products?', opts: ['yes', 'no'] },
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
                <button className="btn btn-ghost btn-sm" onClick={() => { setEvaluating(false); setEvalAnswers({ collection: null, market: null, identity: null }); setSuggestion(null); }}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {!suggestion && (
            <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => { setEvaluating(false); setEvalAnswers({ collection: null, market: null, identity: null }); }}>
              Cancel
            </button>
          )}
        </div>
      )}

      {confirm ? (
        <span className="inline-confirm">✓ Done</span>
      ) : confirmingDelete ? (
        <ConfirmButton
          confirming
          promptText="Remove this spark?"
          onConfirm={handleDelete}
          onCancel={() => setConfirmingDelete(false)}
        />
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
          {onCreateConcept && (
            <button className="btn btn-ghost btn-sm" onClick={() => onCreateConcept(spark)}>+ Concept</button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={() => handle('archive')} style={{ color: 'var(--charcoal-soft)' }}>Archive</button>
          <ConfirmButton
            label="🗑"
            triggerTitle="Delete spark"
            triggerStyle={{ marginLeft: 'auto', fontSize: '0.8rem', opacity: 0.5 }}
            confirming={false}
            onTrigger={() => setConfirmingDelete(true)}
            onConfirm={handleDelete}
            onCancel={() => setConfirmingDelete(false)}
            promptText="Remove this spark?"
          />
        </div>
      )}
    </div>
  );
}
