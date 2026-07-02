import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useProduct, updateProduct } from '../lib/hooks';
import { useResearchSessions, createResearchSession } from '../lib/hooks';
import { useProducts } from '../lib/hooks';
import { STAGE_NEXT_ACTIONS, STAGE_PILL_CLASS } from '../data/stages';
import StageTracker from '../components/StageTracker';
import ConfidenceSelector from '../components/ConfidenceSelector';
import ContextBundleButton from '../components/ContextBundleButton';
import CollectionKnowledge from '../components/CollectionKnowledge';
import ResearchSessionCard from '../components/ResearchSessionCard';
import ResearchSessionForm from '../components/ResearchSessionForm';

export default function ProductWorkspace() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { product, loading, refetch } = useProduct(id);
  const { sessions, refetch: refetchSessions } = useResearchSessions(id);
  const { products } = useProducts();
  const [notes, setNotes] = useState('');
  const [noteSaved, setNoteSaved] = useState(false);
  const [addingResearch, setAddingResearch] = useState(false);
  const [stageSaved, setStageSaved] = useState(false);

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

  return (
    <div className="page">
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/products')} style={{ marginBottom: 12 }}>
          ← Back
        </button>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', fontWeight: 300, marginBottom: 6 }}>
          {product.name}
        </div>
        <div style={{ fontSize: '0.78rem', color: 'var(--charcoal-soft)', marginBottom: 10 }}>
          {product.collection}{product.portfolio_level ? ` · ${product.portfolio_level}` : ''}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className={`stage-pill ${STAGE_PILL_CLASS[product.stage]}`}>{product.stage}</span>
          {product.confidence && <span className="confidence-badge">{product.confidence} confidence</span>}
          {stageSaved && <span className="inline-confirm">✓ Stage updated</span>}
        </div>
      </div>

      <hr className="rule" />

      {/* Stage Tracker */}
      <div style={{ marginBottom: 24 }}>
        <div className="section-label">Stage</div>
        <div style={{ paddingBottom: 32 }}>
          <StageTracker currentStage={product.stage} onStageSelect={handleStageUpdate} />
        </div>
      </div>

      {/* Confidence */}
      <div style={{ marginBottom: 24 }}>
        <ConfidenceSelector value={product.confidence} onChange={handleConfidence} />
      </div>

      <hr className="rule" />

      {/* Next Action */}
      <div style={{ marginBottom: 24 }}>
        <div className="section-label">Next Step</div>
        <div style={{
          background: 'var(--charcoal-faint)', borderRadius: 2, padding: '12px 16px',
          fontSize: '0.85rem', lineHeight: 1.5,
        }}>
          {STAGE_NEXT_ACTIONS[product.stage]}
        </div>
      </div>

      <hr className="rule" />

      {/* Context Bundle */}
      <div style={{ marginBottom: 24 }}>
        <div className="section-label" style={{ marginBottom: 10 }}>Context Bundle</div>
        <ContextBundleButton product={product} recentResearch={sessions} />
      </div>

      <hr className="rule" />

      {/* Collection Knowledge */}
      {product.collection && (
        <div style={{ marginBottom: 24 }}>
          <div className="section-label" style={{ marginBottom: 8 }}>Collection Knowledge</div>
          <CollectionKnowledge collection={product.collection} stage={product.stage} />
        </div>
      )}

      <hr className="rule" />

      {/* Research Sessions */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div className="section-label" style={{ margin: 0 }}>Research Sessions</div>
          <button className="btn btn-ghost btn-sm" onClick={() => setAddingResearch(!addingResearch)}>
            {addingResearch ? 'Cancel' : '+ Add Research Session'}
          </button>
        </div>
        {addingResearch && (
          <div className="card" style={{ marginBottom: 12 }}>
            <ResearchSessionForm
              products={products}
              defaultProductId={id}
              onSaved={() => { setAddingResearch(false); refetchSessions(); }}
              onCancel={() => setAddingResearch(false)}
            />
          </div>
        )}
        {sessions.length === 0 && !addingResearch && (
          <div style={{ fontSize: '0.8rem', color: 'var(--charcoal-soft)' }}>No research sessions yet.</div>
        )}
        {sessions.map(s => <ResearchSessionCard key={s.id} session={s} />)}
      </div>

      <hr className="rule" />

      {/* Notes */}
      <div style={{ marginBottom: 24 }}>
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
    </div>
  );
}
