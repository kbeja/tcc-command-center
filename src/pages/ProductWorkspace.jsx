import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useProduct, updateProduct, deleteProduct, useResearchSessions } from '../lib/hooks';
import { STAGE_NEXT_ACTIONS, STAGE_PILL_CLASS, STAGES, STAGE_ORDER } from '../data/stages';
import { collectionKnowledge } from '../data/collections';
import { daysBetween, today } from '../data/seasons';
import ConfidenceSelector from '../components/ConfidenceSelector';
import CollectionKnowledge from '../components/CollectionKnowledge';
import ResearchSessionCard from '../components/ResearchSessionCard';
import ResearchSessionForm from '../components/ResearchSessionForm';

// ─── Stage Tracker (2-col grid, no overflow) ─────────────────────────────────

function StageTracker({ currentStage, onStageSelect, saved }) {
  const currentIdx = STAGE_ORDER[currentStage] ?? 0;

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
        {STAGES.map((stage, idx) => {
          const done = idx < currentIdx;
          const active = stage === currentStage;
          return (
            <button
              key={stage}
              onClick={() => onStageSelect(stage)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '7px 10px', textAlign: 'left', cursor: 'pointer',
                background: active ? 'var(--rose-faint)' : 'transparent',
                border: 'none',
                borderLeft: active ? '2px solid var(--dusty-rose)' : '2px solid transparent',
                borderRadius: '0 2px 2px 0', transition: 'background 0.12s',
              }}
            >
              <div style={{
                width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
                border: `2px solid ${done || active ? 'var(--dusty-rose)' : 'rgba(43,41,38,0.18)'}`,
                background: active ? 'var(--dusty-rose)' : done ? 'var(--rose-faint)' : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {done && <span style={{ fontSize: '0.45rem', color: 'var(--dusty-rose)', fontWeight: 800 }}>✓</span>}
              </div>
              <span style={{
                fontSize: '0.78rem',
                fontWeight: active ? 600 : 400,
                color: active ? 'var(--warm-charcoal)' : 'var(--charcoal-soft)',
              }}>
                {stage}
              </span>
              {active && <span style={{ marginLeft: 'auto', fontSize: '0.6rem', color: 'var(--dusty-rose)', fontWeight: 500 }}>current</span>}
            </button>
          );
        })}
      </div>
      {saved && <div style={{ marginTop: 8 }}><span className="inline-confirm">✓ Stage updated</span></div>}
    </div>
  );
}

// ─── Live Stats Panel ─────────────────────────────────────────────────────────

function StatInput({ label, value, onChange, type = 'number', prefix, suffix }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: '0.65rem', color: 'var(--charcoal-soft)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {prefix && <span style={{ fontSize: '0.78rem', color: 'var(--charcoal-soft)' }}>{prefix}</span>}
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          min="0"
          step={type === 'number' ? '1' : '0.01'}
          style={{ width: '100%', padding: '6px 8px', fontSize: '0.82rem' }}
        />
        {suffix && <span style={{ fontSize: '0.78rem', color: 'var(--charcoal-soft)' }}>{suffix}</span>}
      </div>
    </div>
  );
}

function LiveStats({ product, onSave }) {
  const [wentLive, setWentLive] = useState(product.went_live_at || '');
  // Everbee
  const [moSales, setMoSales] = useState(product.mo_sales || 0);
  const [moRevenue, setMoRevenue] = useState(product.mo_revenue || 0);
  const [totalSales, setTotalSales] = useState(product.total_sales || 0);
  const [reviews, setReviews] = useState(product.reviews || 0);
  const [moReviews, setMoReviews] = useState(product.mo_reviews || 0);
  const [views, setViews] = useState(product.views || 0);
  const [favorites, setFavorites] = useState(product.favorites || 0);
  const [conversionRate, setConversionRate] = useState(product.conversion_rate || 0);
  const [visibilityScore, setVisibilityScore] = useState(product.visibility_score || 0);
  const [reviewRatio, setReviewRatio] = useState(product.review_ratio || 0);
  // Ads
  const [adViews, setAdViews] = useState(product.ad_views || 0);
  const [adClicks, setAdClicks] = useState(product.ad_clicks || 0);
  const [adClickRate, setAdClickRate] = useState(product.ad_click_rate || 0);
  const [adOrders, setAdOrders] = useState(product.ad_orders || 0);
  const [adRevenue, setAdRevenue] = useState(product.ad_revenue || 0);
  const [adSpend, setAdSpend] = useState(product.ad_spend || 0);
  const [adRoas, setAdRoas] = useState(product.ad_roas || 0);

  const [saved, setSaved] = useState(false);

  const daysLive = wentLive ? daysBetween(wentLive, today()) : null;
  const daysTo30 = daysLive !== null ? Math.max(0, 30 - daysLive) : null;

  async function handleSave() {
    await onSave({
      went_live_at: wentLive || null,
      mo_sales: parseInt(moSales) || 0,
      mo_revenue: parseFloat(moRevenue) || 0,
      total_sales: parseInt(totalSales) || 0,
      reviews: parseInt(reviews) || 0,
      mo_reviews: parseInt(moReviews) || 0,
      views: parseInt(views) || 0,
      favorites: parseInt(favorites) || 0,
      conversion_rate: parseFloat(conversionRate) || 0,
      visibility_score: parseFloat(visibilityScore) || 0,
      review_ratio: parseFloat(reviewRatio) || 0,
      ad_views: parseInt(adViews) || 0,
      ad_clicks: parseInt(adClicks) || 0,
      ad_click_rate: parseFloat(adClickRate) || 0,
      ad_orders: parseInt(adOrders) || 0,
      ad_revenue: parseFloat(adRevenue) || 0,
      ad_spend: parseFloat(adSpend) || 0,
      ad_roas: parseFloat(adRoas) || 0,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div>
      {/* 30-day monitor bar */}
      {daysLive !== null && (
        <div style={{
          background: daysTo30 === 0 ? 'rgba(201,123,123,0.12)' : 'var(--charcoal-faint)',
          border: `1px solid ${daysTo30 === 0 ? 'var(--alert)' : 'rgba(43,41,38,0.1)'}`,
          borderRadius: 2, padding: '10px 14px', marginBottom: 16,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: '0.72rem', fontWeight: 500, color: daysTo30 === 0 ? 'var(--alert)' : 'var(--warm-charcoal)' }}>
              {daysTo30 === 0 ? '🔴 30-day mark reached — review now' : `📅 ${daysLive} day${daysLive !== 1 ? 's' : ''} live`}
            </div>
            {daysTo30 > 0 && (
              <div style={{ fontSize: '0.68rem', color: 'var(--charcoal-soft)', marginTop: 2 }}>
                {daysTo30} day{daysTo30 !== 1 ? 's' : ''} until 30-day review
              </div>
            )}
          </div>
          <div style={{ width: 80, height: 4, background: 'rgba(43,41,38,0.1)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{
              width: `${Math.min(100, (daysLive / 30) * 100)}%`,
              height: '100%',
              background: daysTo30 === 0 ? 'var(--alert)' : 'var(--dusty-rose)',
              borderRadius: 2,
            }} />
          </div>
        </div>
      )}

      {/* Went live date */}
      <div className="form-group" style={{ marginBottom: 16 }}>
        <label className="form-label">Went Live Date</label>
        <input type="date" value={wentLive} onChange={e => setWentLive(e.target.value)} style={{ maxWidth: 200 }} />
      </div>

      {/* Everbee stats */}
      <div className="eyebrow" style={{ marginBottom: 10 }}>Everbee Stats</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
        <StatInput label="Mo. Sales" value={moSales} onChange={setMoSales} />
        <StatInput label="Mo. Revenue" value={moRevenue} onChange={setMoRevenue} prefix="$" type="text" />
        <StatInput label="Total Sales" value={totalSales} onChange={setTotalSales} />
        <StatInput label="Views" value={views} onChange={setViews} />
        <StatInput label="Favorites" value={favorites} onChange={setFavorites} />
        <StatInput label="Reviews" value={reviews} onChange={setReviews} />
        <StatInput label="Mo. Reviews" value={moReviews} onChange={setMoReviews} />
        <StatInput label="Conversion %" value={conversionRate} onChange={setConversionRate} suffix="%" type="text" />
        <StatInput label="Visibility %" value={visibilityScore} onChange={setVisibilityScore} suffix="%" type="text" />
        <StatInput label="Review Ratio" value={reviewRatio} onChange={setReviewRatio} type="text" />
      </div>

      {/* Etsy Ads stats */}
      <div className="eyebrow" style={{ marginBottom: 10 }}>Etsy Ads</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
        <StatInput label="Ad Views" value={adViews} onChange={setAdViews} />
        <StatInput label="Ad Clicks" value={adClicks} onChange={setAdClicks} />
        <StatInput label="Click Rate" value={adClickRate} onChange={setAdClickRate} suffix="%" type="text" />
        <StatInput label="Ad Orders" value={adOrders} onChange={setAdOrders} />
        <StatInput label="Ad Revenue" value={adRevenue} onChange={setAdRevenue} prefix="$" type="text" />
        <StatInput label="Spend" value={adSpend} onChange={setAdSpend} prefix="$" type="text" />
        <StatInput label="ROAS" value={adRoas} onChange={setAdRoas} type="text" />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button className="btn btn-primary btn-sm" onClick={handleSave}>Save Stats</button>
        {saved && <span className="inline-confirm">✓ Saved</span>}
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
      <button className="btn btn-ghost btn-sm" onClick={() => handleCopy('claude')}>📋 Copy Context for Claude</button>
      <button className="btn btn-ghost btn-sm" onClick={() => handleCopy('chatgpt')}>📋 Copy Context for ChatGPT</button>
      {copied && <span className="inline-confirm">Copied to clipboard ✓</span>}
    </div>
  );
}

// ─── Research Section ─────────────────────────────────────────────────────────

function ResearchSection({ collection, sessions, loading, onDeleted, refetch }) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);

  const topGreen = sessions
    .flatMap(s => (s.keywords || []).filter(k => k.tag_type === 'use').map(k => k.keyword))
    .filter((v, i, a) => a.indexOf(v) === i)
    .slice(0, 6);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <button
          onClick={() => setOpen(!open)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, padding: 0 }}
        >
          <div className="section-label" style={{ margin: 0 }}>Research Sessions ({sessions.length})</div>
          <span style={{ fontSize: '0.65rem', color: 'var(--charcoal-soft)' }}>{open ? '▲' : '▼'}</span>
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => { setAdding(!adding); setOpen(true); }}>
          {adding ? 'Cancel' : '+ Add Session'}
        </button>
      </div>

      {topGreen.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          {topGreen.map((kw, i) => (
            <span key={i} style={{
              fontSize: '0.68rem', padding: '2px 8px', borderRadius: 20,
              background: 'rgba(124,175,138,0.15)', color: '#2d6b3c',
              border: '1px solid rgba(124,175,138,0.3)',
            }}>{kw}</span>
          ))}
        </div>
      )}

      {open && (
        <div style={{ marginTop: 8 }}>
          {adding && (
            <div className="card" style={{ marginBottom: 12 }}>
              <ResearchSessionForm
                defaultCollection={collection}
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
          {sessions.map(s => <ResearchSessionCard key={s.id} session={s} onDeleted={onDeleted} />)}
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

  const { sessions, loading: sessionsLoading, refetch: refetchSessions } = useResearchSessions(product?.collection);

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

  async function handleStatsSave(stats) {
    await updateProduct(id, stats);
    refetch();
  }

  if (loading) return <div className="page"><div style={{ color: 'var(--charcoal-soft)' }}>Loading…</div></div>;
  if (!product) return <div className="page"><div>Product not found.</div></div>;

  const pillClass = STAGE_PILL_CLASS[product.stage] || 'pill-idea';
  const isLive = product.stage === 'Live' || product.stage === 'Reviewing';

  return (
    <div className="page">

      {/* ── Header ── */}
      <div style={{ marginBottom: 24 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/products')} style={{ marginBottom: 14 }}>
          ← Back
        </button>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.8rem', fontWeight: 300, lineHeight: 1.2, marginBottom: 8 }}>
          {product.name}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
          {product.collection && <span style={{ fontSize: '0.75rem', color: 'var(--charcoal-soft)' }}>{product.collection}</span>}
          {product.portfolio_level && <span style={{ fontSize: '0.75rem', color: 'var(--charcoal-soft)' }}>· {product.portfolio_level}</span>}
          <span className={`stage-pill ${pillClass}`}>{product.stage}</span>
        </div>
        <ConfidenceSelector value={product.confidence} onChange={handleConfidence} />
      </div>

      <hr className="rule" />

      {/* ── Stage Tracker ── */}
      <div style={{ marginBottom: 24 }}>
        <div className="section-label" style={{ marginBottom: 10 }}>Stage</div>
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

      {/* ── Live Stats (only for Live / Reviewing) ── */}
      {isLive && (
        <>
          <div style={{ marginBottom: 24 }}>
            <div className="section-label" style={{ marginBottom: 10 }}>Listing Stats</div>
            <LiveStats product={product} onSave={handleStatsSave} />
          </div>
          <hr className="rule" />
        </>
      )}

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
            <span>Permanently delete this product?</span>
            <button onClick={async () => { await deleteProduct(id); navigate('/products'); }}
              style={{ color: 'var(--alert)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer' }}>
              Yes, delete
            </button>
            <button onClick={() => setConfirmDelete(false)}
              style={{ color: 'var(--charcoal-soft)', background: 'none', border: 'none', cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        ) : (
          <button onClick={() => setConfirmDelete(true)}
            style={{ fontSize: '0.75rem', color: 'var(--charcoal-soft)', background: 'none', border: 'none', cursor: 'pointer', opacity: 0.6 }}>
            Delete product
          </button>
        )}
      </div>
    </div>
  );
}
