import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProducts, useWorkshopItems, useSparks, getNeedsAttention, getPickUpProduct } from '../lib/hooks';
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

  const active = products.filter(p => !['Killed', 'Paused'].includes(p.stage));
  const pickUp = getPickUpProduct(active);
  const needsAttn = getNeedsAttention(products);
  const inProgress = active.filter(p => !['Live', 'Idea'].includes(p.stage));
  const hotSparks = sparks.filter(s => s.temperature === 'hot');
  const coldSparks = sparks.filter(s => s.temperature === 'cold');
  const review = getNextReviewDates();
  const reviewListings = products.filter(p => p.stage === 'Live');

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
      <Section icon="🔴" title="Needs Attention" badge={needsAttn.length}>
        {needsAttn.length === 0 ? (
          <div style={{ fontSize: '0.82rem', color: 'var(--charcoal-soft)' }}>Nothing needs attention right now.</div>
        ) : (
          needsAttn.map(p => <ProductCard key={p.id} product={p} alert />)
        )}
      </Section>

      {/* In Progress */}
      <Section icon="✅" title="In Progress" badge={inProgress.length}>
        {inProgress.map(p => <ProductCard key={p.id} product={p} />)}
      </Section>

      {/* Sparks */}
      <Section icon="💡" title="Sparks" badge={`${hotSparks.length} hot · ${coldSparks.length} cold`}>
        {hotSparks.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div className="section-label">Hot</div>
            {hotSparks.map(s => <SparkCard key={s.id} spark={s} onAction={refetchSparks} />)}
          </div>
        )}
        {coldSparks.slice(0, 3).map(s => <SparkCard key={s.id} spark={s} onAction={refetchSparks} />)}
        {coldSparks.length > 3 && (
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/sparks')} style={{ marginTop: 4 }}>
            See all {coldSparks.length} sparks →
          </button>
        )}
      </Section>
    </div>
  );
}
