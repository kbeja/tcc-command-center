import { useState } from 'react';
import { updateSpark, archiveSpark } from '../lib/hooks';

export default function SparkCard({ spark, onAction }) {
  const [confirm, setConfirm] = useState(null);

  async function handle(action) {
    if (action === 'archive') {
      await archiveSpark(spark.id);
    } else if (action === 'activate') {
      await updateSpark(spark.id, { temperature: 'hot', hot_reason: 'Manually activated' });
    } else if (action === 'cool') {
      await updateSpark(spark.id, { temperature: 'cold', hot_reason: null });
    }
    setConfirm(action);
    setTimeout(() => { setConfirm(null); onAction?.(); }, 1200);
  }

  return (
    <div className="card" style={{ marginBottom: 8 }}>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', marginBottom: 4 }}>
          {spark.content}
        </div>
        {spark.temperature === 'hot' && (
          <div style={{ fontSize: '0.72rem', color: 'var(--dusty-rose)', fontWeight: 500, marginBottom: 4 }}>
            🔥 Hot{spark.hot_reason ? ` — ${spark.hot_reason}` : ''}
          </div>
        )}
        <div style={{ fontSize: '0.72rem', color: 'var(--charcoal-soft)' }}>
          {new Date(spark.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          {spark.collection_tag ? ` · ${spark.collection_tag}` : ''}
        </div>
      </div>

      {confirm ? (
        <span className="inline-confirm">✓ Done</span>
      ) : (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {spark.temperature === 'hot' ? (
            <>
              <button className="btn btn-primary btn-sm" onClick={() => handle('activate')}>Activate →</button>
              <button className="btn btn-ghost btn-sm" onClick={() => handle('cool')}>Not yet →</button>
            </>
          ) : (
            <button className="btn btn-ghost btn-sm" onClick={() => handle('activate')}>Evaluate →</button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={() => handle('archive')} style={{ color: 'var(--charcoal-soft)' }}>Archive →</button>
        </div>
      )}
    </div>
  );
}
