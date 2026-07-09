import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useProduct, updateProduct, deleteProduct, useResearchSessions } from '../lib/hooks';
import { STAGE_NEXT_ACTIONS, STAGE_PILL_CLASS, STAGES, STAGE_ORDER } from '../data/stages';
import { collectionKnowledge } from '../data/collections';
import ConfidenceSelector from '../components/ConfidenceSelector';
import CollectionKnowledge from '../components/CollectionKnowledge';
import ResearchSessionCard from '../components/ResearchSessionCard';
import ResearchSessionForm from '../components/ResearchSessionForm';

// ─── Horizontal Stage Tracker ─────────────────────────────────────────────────

function StageTracker({ currentStage, onStageSelect, saved }) {
  const currentIdx = STAGE_ORDER[currentStage] ?? 0;
  const activeStages = STAGES.slice(0, 9); // Idea → Reviewing (linear path)
  const sideStages = ['Paused', 'Killed'];

  return (
    <div>
      {/* Main linear path */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0, overflowX: 'auto', paddingBottom: 28, paddingTop: 4 }}>
        {activeStages.map((stage, idx) => {
          const done = STAGE_ORDER[stage] < currentIdx;
          const active = stage === currentStage;
          return (
            <div key={stage} style={{ display: 'flex', alignItems: 'flex-start', flexShrink: 0 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
                <button
                  onClick={() => onStageSelect(stage)}
                  style={{
                    width: active ? 26 : 20,
                    height: active ? 26 : 20,
                    borderRadius: '50%',
                    border: `2px solid ${done || active ? 'var(--dusty-rose)' : 'rgba(43,41,38,0.2)'}`,
                    background: active ? 'var(--dusty-rose)' : done ? 'var(--rose-faint)' : 'var(--warm-white)',
                    cursor: 'pointer',
                    flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 0.15s',
                    padding: 0,
                  }}
                  title={stage}
                >
                  {done && <span style={{ fontSize: '0.45rem', color: 'var(--dusty-rose)', fontWeight: 800, lineHeight: 1 }}>✓</span>}
                </button>
                <span style={{
                  position: 'absolute', top: '100%', marginTop: 5,
                  fontSize: '0.58rem', whiteSpace: 'nowrap',
                  color: active ? 'var(--dusty-rose)' : 'var(--charcoal-soft)',
                  fontWeight: active ? 600 : 400,
                  left: '50%', transform: 'translateX(-50%)',
                }}>
                  {stage}
                </span>
              </div>
              {idx < activeStages.length - 1 && (
                <div style={{
                  width: 24, height: 2, marginTop: 9, flexShrink: 0,
                  background: done ? 'var(--dusty-rose)' : 'rgba(43,41,38,0.1)',
                }} />
              )}
            </div>
          );
        })}
      </div>

      {/* Paused / Killed as separate small toggles */}
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        {sideStages.map(stage => {
          const active = stage === currentStage;
          return (
            <button
              key={stage}
              onClick={() => onStageSelect(stage)}
              className={`btn btn-sm ${active ? 'btn-primary' : 'btn-ghost'}`}
              style={{ fontSize: '0.7rem', opacity: active ? 1 : 0.5 }}
            >
              {stage}
            </button>
          );
        })}
        {saved && <span className="inline-confirm" style={{ marginLeft: 8 }}>✓ Stage updated</span>}
      </div>
    </div>
  );
}

// ─── Context Bundle ───────────────────────────────────────────────────────────

function ContextBundle({ product, sessions }) {
  const [copied, setCopied] = useState(null);

  function buildBundle() {
    const collection = collectionKnowledge[product.collection] || {};
    const greenKeywords = sessions
      .flatMap(s => (s.keywords || []).filter(k => k.tag_type === 'use').map(k => k.keyword))
      .slice(0, 20);
    const keywordList = greenKeywords.length
      ? greenKeywords.join('\n')
      : collection.keywords?.topKeywords?.slice(0, 15).join('\n') || 'See keyword bank';

    return `--- TCC CONTEXT BUNDLE ---
Product: ${product.name}
Collection: ${product.collection}
Stage: ${product.stage}
Confidence: ${product.confidence || 'Not set'}
Ecosystem: ${product.ecosystem_primary || '—'}
Emotional trigger: ${product.emotional_trigger || '—'}

TOP KEYWORDS (confirmed green from research)
${keywordList}

COLLECTION STYLE GUIDE
${collection.styleGuide || 'See TCC OS style guides.'}

PRODUCT NOTES
${product.notes || 'None.'}
--- END CONTEXT ---`;
  }

  function handleCopy(variant) {
    navigator.clipboard.writeText(buildBundle());
    setCopied(variant);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      <button className="btn btn-ghost btn-sm" onClick={() => handleCopy('claude')}>
        📋 Copy Context for Claude
      </button>
      <button className="btn btn-ghost btn-sm" onClick={() => handleCopy('chatgpt')}>
        📋 Copy Context for ChatGPT
      </button>
      {copied && <span className="inline-confirm">Copied to clipboard ✓</span>}
    </div>
  );
}

// ─── Research Sessions (collection-linked) ────────────────────────────────────

function ResearchSection({ collection, sessions, loading, onDeleted, refetch }) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);

  const topGreen = sessions
    .flatMap(s => (s.keywords || []).filter(k => k.tag_type === 'use').map(k => k.keyword))
    .slice(0, 5);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button
          onClick={() => setOpen(!open)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, padding: 0 }}
        >
          <div className="section-label" style={{ margin: 0 }}>
            Research Sessions ({sessions.length})
          </div>
          <span style={{ fontSize: '0.65rem', color: 'var(--charcoal-soft)' }}>{open ? '▲' : '▼'}</span>
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => { setAdding(!adding); setOpen(true); }}>
          {adding ? 'Cancel' : '+ Add Session'}
        </button>
      </div>

      {/* Top green keywords always visible */}
      {!open && topGreen.length > 0 && (
        <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {topGreen.map((kw, i) => (
            <span key={i} style={{
              fontSize: '0.7rem', padding: '2px 8px', borderRadius: 20,
              background: 'rgba(124,175,138,0.15)', color: '#2d6b3c', border: '1px solid rgba(124,175,138,0.3)'
            }}>
              {kw}
            </span>
          ))}
        </div>
      )}

      {open && (
        <div style={{ marginTop: 12 }}>
          {adding && (
            <div className="card" style={{ marginBottom: 12 }}>
              <ResearchSessionForm
                defaultNiche={collection}
                onSaved={() => { setAdding(false); refetch(); }}
                onCancel={() => setAdding(false)}
              />
            </div>
          )}
          {loading && <div style={{ fontSize: '0.82rem', color: 'var(--charcoal-soft)' }}>Loading…</div>}
          {!loading && sessions.length === 0 && !adding && (
            <div style={{ fontSize: '0.82rem', color: 'var(--charcoal-soft)', padding: '8px 0' }}>
              No research sessions for {collection} yet.
            </div>
          )}
          {sessions.map(s => (
            <ResearchSessionCard key={s.id} session={s} onDeleted={onDeleted} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Workspace ───────────────────────────────────────────────────────────

export default function ProductWorkspace() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { product, loading, refetch } = useProduct(id);
  const [notes, setNotes] = useState('');
  const [noteSaved, setNoteSaved] = useState(false);
  const [stageSaved, setStageSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const collection = product?.collection;
  const { sessions, loading: sessionsLoading, refetch: refetchSessions } = useResearchSessions(collection);

  useEffect(() => {
    if (product) setNotes(product.notes || '');
  }, [product?.id]);

  async function handleStageUpdate(stage) {
    await updateProduct(id, { stage, stage_updated_at: new Date().toISOString() });
    setStageSaved(true);
    setTimeout(() => setStageSaved(false), 2000);
    refetch();
  }

  async function handleConfidence(confidence) {
    await updateProduct(id, { confidence });
    refetch();
  }

  async function handleNoteBlur() {
    await updateProduct(id, { notes });
    setNoteSaved(true);
    setTimeout(() => setNoteSaved(false), 2000);
  }

  if (loading) return <div className="page"><div style={{ color: 'var(--charcoal-soft)' }}>Loading…</div></div>;
  if (!product) return <div className="page"><div>Product not found.</div></div>;

  const pillClass = STAGE_PILL_CLASS[product.stage] || 'pill-idea';

  return (
    <div className="page">

      {/* ── Header ── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/products')}>← Back</button>
        </div>

        <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.8rem', fontWeight: 300, lineHeight: 1.2, marginBottom: 8 }}>
          {product.name}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
          {product.collection && (
            <span style={{ fontSize: '0.75rem', color: 'var(--charcoal-soft)' }}>{product.collection}</span>
          )}
          {product.portfolio_level && (
            <span style={{ fontSize: '0.75rem', color: 'var(--charcoal-soft)' }}>· {product.portfolio_level}</span>
          )}
          <span className={`stage-pill ${pillClass}`}>{product.stage}</span>
        </div>

        <ConfidenceSelector value={product.confidence} onChange={handleConfidence} />
      </div>

      <hr className="rule" />

      {/* ── Stage Tracker ── */}
      <div style={{ marginBottom: 28 }}>
        <div className="section-label" style={{ marginBottom: 12 }}>Stage</div>
        <StageTracker currentStage={product.stage} onStageSelect={handleStageUpdate} saved={stageSaved} />
      </div>

      <hr className="rule" />

      {/* ── Next Action ── */}
      <div style={{ marginBottom: 24 }}>
        <div className="section-label" style={{ marginBottom: 8 }}>Next Step</div>
        <div style={{
          background: 'var(--warm-white)', border: '1px solid rgba(43,41,38,0.1)',
          borderLeft: '3px solid var(--dusty-rose)', borderRadius: '0 2px 2px 0',
          padding: '12px 16px', fontSize: '0.88rem', lineHeight: 1.5,
        }}>
          {STAGE_NEXT_ACTIONS[product.stage]}
        </div>
      </div>

      <hr className="rule" />

      {/* ── Context Bundle ── */}
      <div style={{ marginBottom: 24 }}>
        <div className="section-label" style={{ marginBottom: 10 }}>Context Bundle</div>
        <ContextBundle product={product} sessions={sessions} />
      </div>

      <hr className="rule" />

      {/* ── Collection Knowledge ── */}
      {product.collection && collectionKnowledge[product.collection] && (
        <>
          <div style={{ marginBottom: 24 }}>
            <div className="section-label" style={{ marginBottom: 8 }}>Collection Knowledge</div>
            <CollectionKnowledge collection={product.collection} stage={product.stage} />
          </div>
          <hr className="rule" />
        </>
      )}

      {/* ── Research Sessions ── */}
      <div style={{ marginBottom: 24 }}>
        <ResearchSection
          collection={product.collection}
          sessions={sessions}
          loading={sessionsLoading}
          onDeleted={refetchSessions}
          refetch={refetchSessions}
        />
      </div>

      <hr className="rule" />

      {/* ── Notes ── */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <div className="section-label" style={{ margin: 0 }}>Notes</div>
          {noteSaved && <span className="inline-confirm">✓ Saved</span>}
        </div>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          onBlur={handleNoteBlur}
          placeholder="Add notes about this product…"
          rows={4}
        />
      </div>

      {/* ── Delete ── */}
      <div style={{ paddingTop: 8, borderTop: '1px solid rgba(43,41,38,0.08)' }}>
        {confirmDelete ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.82rem' }}>
            <span style={{ color: 'var(--warm-charcoal)' }}>Permanently delete this product?</span>
            <button
              onClick={async () => { await deleteProduct(id); navigate('/products'); }}
              style={{ color: 'var(--alert)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer' }}
            >
              Yes, delete
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              style={{ color: 'var(--charcoal-soft)', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            style={{ fontSize: '0.75rem', color: 'var(--charcoal-soft)', background: 'none', border: 'none', cursor: 'pointer', opacity: 0.6 }}
          >
            Delete product
          </button>
        )}
      </div>
    </div>
  );
}
