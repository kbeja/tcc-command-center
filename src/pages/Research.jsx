import { useState } from 'react';
import { useProducts } from '../lib/hooks';
import { useResearchSessions } from '../lib/hooks';
import ResearchSessionCard from '../components/ResearchSessionCard';
import ResearchSessionForm from '../components/ResearchSessionForm';

export default function Research() {
  const { products } = useProducts();
  const { sessions, loading, refetch } = useResearchSessions();
  const [adding, setAdding] = useState(false);
  const [filterProduct, setFilterProduct] = useState('');

  const filtered = sessions.filter(s => !filterProduct || s.product_id === filterProduct);

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div className="page-title">Research</div>
          <button className="btn btn-primary btn-sm" onClick={() => setAdding(!adding)}>
            {adding ? 'Cancel' : '+ Add Session'}
          </button>
        </div>
      </div>

      {adding && (
        <div className="card" style={{ marginBottom: 20 }}>
          <ResearchSessionForm
            products={products}
            onSaved={() => { setAdding(false); refetch(); }}
            onCancel={() => setAdding(false)}
          />
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <select value={filterProduct} onChange={e => setFilterProduct(e.target.value)}>
          <option value="">All products</option>
          {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {loading && <div style={{ color: 'var(--charcoal-soft)', fontSize: '0.85rem' }}>Loading…</div>}

      {!loading && filtered.length === 0 && (
        <div className="empty-state">
          <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>🔬</div>
          <p>No research sessions yet. Add one to start tracking keyword research.</p>
        </div>
      )}

      {filtered.map(s => {
        const product = products.find(p => p.id === s.product_id);
        return (
          <div key={s.id} className="card" style={{ marginBottom: 10 }}>
            {product && (
              <div style={{ fontSize: '0.72rem', color: 'var(--charcoal-soft)', marginBottom: 6, fontWeight: 500, letterSpacing: '0.04em' }}>
                {product.name}
              </div>
            )}
            <ResearchSessionCard session={s} />
          </div>
        );
      })}
    </div>
  );
}
