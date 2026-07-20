import { useNavigate } from 'react-router-dom';
import { STAGE_PILL_CLASS, STAGE_NEXT_ACTIONS } from '../data/stages';

export default function ProductCard({ product, alert, kwAlert }) {
  const navigate = useNavigate();
  const pillClass = STAGE_PILL_CLASS[product.stage] || 'pill-idea';

  return (
    <div
      className="card"
      style={{ marginBottom: 10, cursor: 'pointer', borderLeft: alert ? '3px solid var(--alert)' : undefined }}
      onClick={() => navigate(`/products/${product.id}`)}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', fontWeight: 400, marginBottom: 4 }}>
            {product.name}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--charcoal-soft)', marginBottom: 8 }}>
            {product.collection}{product.portfolio_level ? ` · ${product.portfolio_level}` : ''}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
            <span className={`stage-pill ${pillClass}`}>{product.stage}</span>
            {product.confidence && (
              <span className="confidence-badge">{product.confidence}</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ fontSize: '0.78rem', color: 'var(--charcoal-soft)' }}>
              {STAGE_NEXT_ACTIONS[product.stage]}
            </div>
            {kwAlert && (
              <span style={{ fontSize: '0.68rem', padding: '2px 8px', borderRadius: 20, background: 'rgba(124,175,138,0.2)', color: '#2d6b3c', border: '1px solid rgba(124,175,138,0.4)', whiteSpace: 'nowrap' }}>
                ✦ New keywords
              </span>
            )}
          </div>
        </div>
        <span style={{ color: 'var(--charcoal-soft)', fontSize: '0.8rem', flexShrink: 0, marginTop: 4 }}>→</span>
      </div>
    </div>
  );
}
