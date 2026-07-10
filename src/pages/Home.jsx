import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProducts, useWorkshopItems, useSparks, useTrendSignals, getNeedsAttention, getPickUpProduct } from '../lib/hooks';
import { STAGE_NEXT_ACTIONS, STAGE_PILL_CLASS } from '../data/stages';
import { getNextReviewDates, daysBetween, today, seasonalWindows } from '../data/seasons';
import ProductCard from '../components/ProductCard';
import SparkCard from '../components/SparkCard';

function Section({ icon, title, badge, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ borderTop: '1px solid rgba(43,41,38,0.1)', marginBottom: 0 }}>
      <button
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '16px 0', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
        onClick={() => setOpen(!open)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>{icon}</span>
          <span style={{ fontSize: '0.72rem', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{title}</span>
          {badge !== undefined && badge !== null && (
            <span style={{ background: 'var(--charcoal-faint)', borderRadius: 20, padding: '1px 8px', fontSize: '0.65rem', fontWeight: 600 }}>
              {badge}
            </span>
          )}
        </div>
        <span style={{ fontSize: '0.65rem', color: 'var(--charcoal-soft)' }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && <div style={{ paddingBottom: 16 }}>{children}</div>}
    </div>
  );
}

export default function Home() {
  const navigate = useNavigate();
  const { products } = useProducts();
  const { items: workshopItems } = useWorkshopItems();
  const { sparks, refetch: refetchSparks } = useSparks();
  const { signals } = useTrendSignals();

  const active = products.filter(p => !['Killed', 'Paused'].includes(p.stage));
  const pickUp = getPickUpProduct(active);
  const needsAttn = getNeedsAttention(products);
  const inProgress = active.filter(p => !['Live', 'Idea'].includes(p.stage));
  const hotSparks = sparks.filter(s => s.temperature === 'hot');
  const coldSparks = sparks.filter(s => s.temperature === 'cold');
  const review = getNextReviewDates();
  const reviewListings = products.filter(p => p.stage === 'Live');

  // Trend signals with no product in pipeline
  const pipelineCollections = new Set(active.map(p => p.collection).filter(Boolean));
  const trendAlerts = signals.filter(s =>
    s.status === 'pursue' && s.collection && !pipelineCollections.has(s.collection)
  );

  // Watch signals with revisit_date within 7 days
  const todayStr = today();
  const trendComingUp = signals.filter(s => {
    if (s.status !== 'watch' || !s.revisit_date) return false;
    const days = daysBetween(todayStr, s.revisit_date);
    return days >= 0 && days <= 7;
  });

  return (
    <div className="page">
      <div className="page-header">
        <div className="eyebrow" style={{ marginBottom: 6 }}>the current chapter</div>
        <div style={{ height: 1, background: 'rgba(43,41,38,0.1)' }} />
      </div>

      {/* Pick Up Where You Left Off */}
      {pickUp && (
        <div style={{ background: 'var(--warm-white)', border: '1px solid rgba(43,41,38,0.12)', borderRadius: 2, padding: 20, marginBottom: 20 }}>
          <div className="eyebrow" style={{ marginBottom: 12 }}>⭐ pick up where you left off</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', fontWeight: 400, marginBottom: 6 }}>
            {pickUp.name}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
            <span className={`stage-pill ${STAGE_PILL_CLASS[pickUp.stage]}`}>{pickUp.stage}</span>
            {pickUp.confidence && <span className="confidence-badge">{pickUp.confidence}</span>}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--charcoal-soft)', marginBottom: 16 }}>
            {STAGE_NEXT_ACTIONS[pickUp.stage]}
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => navigate(`/products/${pickUp.id}`)}>
            Continue →
          </button>
        </div>
      )}

      {/* Review Queue */}
      <Section icon="📅" title="Review Queue" badge={`${reviewListings.length} listings · ${review.daysAway}d`}>
        <div style={{ fontSize: '0.8rem', color: 'var(--charcoal-soft)', marginBottom: 12 }}>
          Next review Saturday in {review.daysAway} day{review.daysAway !== 1 ? 's' : ''}{review.isMonthly ? ' (Monthly)' : ' (Bi-weekly)'}
        </div>
        {reviewListings.slice(0, 5).map(p => <ProductCard key={p.id} product={p} />)}
      </Section>

      {/* Needs Attention */}
      <Section icon="🔴" title="Needs Attention" badge={needsAttn.length + trendAlerts.length}>
        {needsAttn.length === 0 && trendAlerts.length === 0 ? (
          <div style={{ fontSize: '0.82rem', color: 'var(--charcoal-soft)' }}>Nothing needs attention right now.</div>
        ) : (
          <>
            {needsAttn.map(p => <ProductCard key={p.id} product={p} alert />)}
            {trendAlerts.map(s => (
              <div key={s.id} style={{ background: 'rgba(124,175,138,0.1)', border: '1px solid var(--success)', borderRadius: 2, padding: '12px 14px', marginBottom: 8 }}>
                <div style={{ fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#2d6b3c', marginBottom: 4 }}>🟢 Trend Signal — Pursue</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', marginBottom: 4 }}>{s.name}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--charcoal-soft)', marginBottom: 8 }}>Score {s.score}/25 · {s.collection} · No product in pipeline</div>
                <button className="btn btn-sm btn-ghost" onClick={() => navigate('/trends')}>View in Trend Radar →</button>
              </div>
            ))}
          </>
        )}
      </Section>

      {/* Coming Up */}
      {trendComingUp.length > 0 && (
        <Section icon="📅" title="Coming Up" badge={trendComingUp.length}>
          {trendComingUp.map(s => {
            const days = daysBetween(todayStr, s.revisit_date);
            return (
              <div key={s.id} style={{ border: 'var(--border)', borderRadius: 2, padding: '12px 14px', marginBottom: 8, background: 'var(--warm-white)' }}>
                <div style={{ fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--charcoal-soft)', marginBottom: 4 }}>👁 Watch — Revisit {days === 0 ? 'today' : `in ${days}d`}</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', marginBottom: 4 }}>{s.name}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--charcoal-soft)', marginBottom: 8 }}>{s.collection} · Score {s.score}/25</div>
                <button className="btn btn-sm btn-ghost" onClick={() => navigate('/trends')}>View in Trend Radar →</button>
              </div>
            );
          })}
        </Section>
      )}

      {/* In Progress */}
      <Section icon="✅" title="In Progress" badge={inProgress.length}>
        {inProgress.map(p => <ProductCard key={p.id} product={p} />)}
      </Section>

      {/* Sparks */}
      <Section icon="💡" title="Idea Vault" badge={`${hotSparks.length} hot · ${coldSparks.length} cold`}>
        {hotSparks.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div className="section-label">Hot</div>
            {hotSparks.map(s => <SparkCard key={s.id} spark={s} onAction={refetchSparks} />)}
          </div>
        )}
        {coldSparks.slice(0, 3).map(s => <SparkCard key={s.id} spark={s} onAction={refetchSparks} />)}
        {coldSparks.length > 3 && (
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/sparks')} style={{ marginTop: 4 }}>
            See all {coldSparks.length} ideas →
          </button>
        )}
      </Section>
    </div>
  );
}
