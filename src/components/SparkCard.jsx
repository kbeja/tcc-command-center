import { useState } from 'react';
import { updateSpark, archiveSpark } from '../lib/hooks';
import { supabase } from '../lib/supabase';
import { COLLECTIONS } from '../data/collections';

export default function SparkCard({ spark, onAction }) {
  const [confirm, setConfirm] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editingCollection, setEditingCollection] = useState(false);
  const [collection, setCollection] = useState(spark.collection_tag || '');

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

  async function handleDelete() {
    await supabase.from('sparks').delete().eq('id', spark.id);
    onAction?.();
  }

  async function handleCollectionSave(val) {
    setCollection(val);
    setEditingCollection(false);
    await updateSpark(spark.id, { collection_tag: val || null });
    onAction?.();
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.72rem', color: 'var(--charcoal-soft)' }}>
            {new Date(spark.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>

          {/* Collection tag */}
          {editingCollection ? (
            <select
              value={collection}
              onChange={e => handleCollectionSave(e.target.value)}
              onBlur={() => setEditingCollection(false)}
              autoFocus
              style={{ fontSize: '0.72rem', padding: '2px 6px', height: 'auto' }}
            >
              <option value="">No collection</option>
              {COLLECTIONS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          ) : (
            <button
              onClick={() => setEditingCollection(true)}
              style={{
                fontSize: '0.68rem', padding: '2px 8px', borderRadius: 20,
                background: collection ? 'var(--rose-faint)' : 'var(--charcoal-faint)',
                color: collection ? 'var(--dusty-rose)' : 'var(--charcoal-soft)',
                border: 'none', cursor: 'pointer',
              }}
            >
              {collection || '+ collection'}
            </button>
          )}
        </div>
      </div>

      {confirm ? (
        <span className="inline-confirm">✓ Done</span>
      ) : confirmDelete ? (
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.78rem' }}>
          <span style={{ color: 'var(--charcoal-soft)' }}>Remove this spark?</span>
          <button onClick={handleDelete} style={{ color: 'var(--alert)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer' }}>Yes</button>
          <button onClick={() => setConfirmDelete(false)} style={{ color: 'var(--charcoal-soft)', background: 'none', border: 'none', cursor: 'pointer' }}>Cancel</button>
        </span>
      ) : (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {spark.temperature === 'hot' ? (
            <>
              <button className="btn btn-primary btn-sm" onClick={() => handle('activate')}>Activate →</button>
              <button className="btn btn-ghost btn-sm" onClick={() => handle('cool')}>Not yet →</button>
            </>
          ) : (
            <button className="btn btn-ghost btn-sm" onClick={() => handle('activate')}>Evaluate →</button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={() => handle('archive')} style={{ color: 'var(--charcoal-soft)' }}>Archive →</button>
          <button onClick={() => setConfirmDelete(true)} style={{ marginLeft: 'auto', color: 'var(--charcoal-soft)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem', opacity: 0.5 }} title="Delete spark">🗑</button>
        </div>
      )}
    </div>
  );
}
