import { useState } from 'react';
import { useProducts, getNeedsAttention } from '../lib/hooks';
import { STAGE_ORDER } from '../data/stages';
import ProductCard from '../components/ProductCard';

export default function Products() {
  const { products, loading } = useProducts();
  const [filter, setFilter] = useState('all');
  const needsAttn = getNeedsAttention(products);
  const attnIds = new Set(needsAttn.map(p => p.id));

  const sorted = [...products].sort((a, b) => {
    const aAlert = attnIds.has(a.id) ? 0 : 1;
    const bAlert = attnIds.has(b.id) ? 0 : 1;
    if (aAlert !== bAlert) return aAlert - bAlert;
    const aDist = Math.abs((STAGE_ORDER[a.stage] ?? 0) - 7);
    const bDist = Math.abs((STAGE_ORDER[b.stage] ?? 0) - 7);
    if (aDist !== bDist) return aDist - bDist;
    return new Date(b.updated_at) - new Date(a.updated_at);
  });

  const filtered = sorted.filter(p => {
    if (filter === 'live') return ['Live', 'Reviewing'].includes(p.stage);
    if (filter === 'development') return !['Live', 'Reviewing', 'Killed', 'Paused'].includes(p.stage);
    if (filter === 'paused') return ['Killed', 'Paused'].includes(p.stage);
    return true;
  });

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title">Products</div>
        <div style={{ marginTop: 12, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[['all', 'All'], ['live', 'Live'], ['development', 'In Development'], ['paused', 'Paused/Killed']].map(([val, label]) => (
            <button
              key={val}
              className={`btn btn-sm ${filter === val ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setFilter(val)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading && <div style={{ color: 'var(--charcoal-soft)', fontSize: '0.85rem' }}>Loading…</div>}

      {!loading && filtered.length === 0 && (
        <div className="empty-state">
          <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>📦</div>
          <p>No products yet. Add your first product to get started.</p>
        </div>
      )}

      {filtered.map(p => <ProductCard key={p.id} product={p} alert={attnIds.has(p.id)} />)}
    </div>
  );
}
