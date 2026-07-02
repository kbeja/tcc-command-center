import { useState } from 'react';
import { resolveWorkshopItem, createSpark } from '../lib/hooks';

export default function WorkshopItem({ item, onAction }) {
  const [confirm, setConfirm] = useState(null);

  async function handle(action) {
    if (action === 'spark') {
      await createSpark(item.content);
      await resolveWorkshopItem(item.id, 'reviewed');
    } else if (action === 'codex') {
      await resolveWorkshopItem(item.id, 'reviewed');
    } else if (action === 'archive') {
      await resolveWorkshopItem(item.id, 'archived');
    } else {
      await resolveWorkshopItem(item.id, 'reviewed');
    }
    setConfirm(action);
    setTimeout(() => { setConfirm(null); onAction?.(); }, 1200);
  }

  const typeLabel = { spark: '💡 Spark', session_summary: '📋 Session', decision: '📌 Decision' }[item.type] || item.type;

  return (
    <div className="card" style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: '0.65rem', color: 'var(--charcoal-soft)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          {typeLabel}
        </span>
        <span style={{ fontSize: '0.65rem', color: 'var(--charcoal-soft)' }}>
          {item.source} · {new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </span>
      </div>
      <p style={{ fontSize: '0.85rem', lineHeight: 1.5, marginBottom: 12 }}>{item.content}</p>

      {confirm ? (
        <span className="inline-confirm">✓ Done</span>
      ) : (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button className="btn btn-primary btn-sm" onClick={() => handle('pipeline')}>→ Activate to Pipeline</button>
          <button className="btn btn-ghost btn-sm" onClick={() => handle('spark')}>→ Keep in Sparks</button>
          <button className="btn btn-ghost btn-sm" onClick={() => handle('codex')}>→ Flag for Codex</button>
          <button className="btn btn-ghost btn-sm" onClick={() => handle('archive')} style={{ color: 'var(--charcoal-soft)' }}>→ Archive</button>
        </div>
      )}
    </div>
  );
}
