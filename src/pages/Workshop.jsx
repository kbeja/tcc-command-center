import { useState } from 'react';
import { useWorkshopItems, useProducts } from '../lib/hooks';
import WorkshopItem from '../components/WorkshopItem';
import SessionSummaryParser from '../components/SessionSummaryParser';

export default function Workshop() {
  const { items, loading, refetch } = useWorkshopItems();
  const { products } = useProducts();
  const [tab, setTab] = useState('triage');

  const codexPrompt = `Please update TCC OS with the following decisions from my recent sessions:\n\n${items.filter(i => i.type === 'decision').map(i => `- ${i.content}`).join('\n') || '(no pending decisions)'}\n\nAlso sync any stage changes and new products discussed.`;

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div className="page-title">Workshop</div>
          {items.length > 0 && (
            <span style={{ background: 'var(--alert)', color: 'white', borderRadius: 20, padding: '2px 10px', fontSize: '0.72rem', fontWeight: 600 }}>
              {items.length}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
          <button className={`btn btn-sm ${tab === 'triage' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('triage')}>
            Triage ({items.length})
          </button>
          <button className={`btn btn-sm ${tab === 'import' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('import')}>
            Import Session
          </button>
        </div>
      </div>

      {tab === 'import' && (
        <SessionSummaryParser products={products} onDone={() => { refetch(); setTab('triage'); }} />
      )}

      {tab === 'triage' && (
        <div>
          {loading && <div style={{ color: 'var(--charcoal-soft)', fontSize: '0.85rem' }}>Loading…</div>}

          {!loading && items.length === 0 && (
            <div>
              <div style={{
                textAlign: 'center', padding: '40px 24px',
                border: '1px solid rgba(43,41,38,0.1)', borderRadius: 2, marginBottom: 16,
              }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', marginBottom: 8 }}>
                  Workshop is clear.
                </div>
                <div style={{ fontSize: '0.82rem', color: 'var(--charcoal-soft)', marginBottom: 16 }}>
                  Ready to sync TCC OS?
                </div>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => navigator.clipboard.writeText(codexPrompt)}
                >
                  Copy Codex prompt →
                </button>
              </div>
            </div>
          )}

          {items.map(item => (
            <WorkshopItem key={item.id} item={item} onAction={refetch} />
          ))}
        </div>
      )}
    </div>
  );
}
