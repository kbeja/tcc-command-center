import { useState } from 'react';
import { resolveWorkshopItem, createSpark, createProduct, createCodexEntry } from '../lib/hooks';

const CODEX_CATEGORIES = ['Product Strategy', 'Process & Workflow', 'Brand & Voice', 'Pricing & Business', 'Lessons Learned'];

export default function WorkshopItem({ item, onAction }) {
  const [confirm, setConfirm] = useState(null);
  const [codexPanel, setCodexPanel] = useState(false);
  const [codexContent, setCodexContent] = useState(item.content);
  const [codexCategory, setCodexCategory] = useState('Product Strategy');
  const [savingCodex, setSavingCodex] = useState(false);

  async function handle(action) {
    if (action === 'spark') {
      await createSpark(item.content);
      await resolveWorkshopItem(item.id, 'reviewed');
    } else if (action === 'pipeline') {
      await createProduct({ name: item.content, stage: 'Idea' });
      await resolveWorkshopItem(item.id, 'reviewed');
    } else if (action === 'archive') {
      await resolveWorkshopItem(item.id, 'archived');
    } else {
      await resolveWorkshopItem(item.id, 'reviewed');
    }
    setConfirm(action);
    setTimeout(() => { setConfirm(null); onAction?.(); }, 1200);
  }

  async function handleCodexSave() {
    if (!codexContent.trim()) return;
    setSavingCodex(true);
    await createCodexEntry({ category: codexCategory, content: codexContent.trim(), source: 'Workshop Triage' });
    await resolveWorkshopItem(item.id, 'reviewed');
    setSavingCodex(false);
    setCodexPanel(false);
    setConfirm('codex');
    setTimeout(() => { setConfirm(null); onAction?.(); }, 1200);
  }

  const typeLabel = {
    spark: '💡 Spark',
    session_summary: '📋 Session',
    decision: '📌 Decision',
    note: '📝 Note',
    unparseable: '⚠️ Could Not Parse',
  }[item.type] || item.type;

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

      {codexPanel && (
        <div style={{ background: 'var(--charcoal-faint)', borderRadius: 4, padding: '12px 14px', marginBottom: 12 }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>Save to Codex</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {CODEX_CATEGORIES.map(c => (
              <button
                key={c}
                onClick={() => setCodexCategory(c)}
                style={{
                  fontSize: '0.65rem', padding: '3px 8px', borderRadius: 20, cursor: 'pointer',
                  border: '1px solid rgba(43,41,38,0.2)',
                  background: codexCategory === c ? 'var(--dusty-rose)' : 'transparent',
                  color: codexCategory === c ? 'white' : 'var(--charcoal-soft)',
                  fontWeight: codexCategory === c ? 600 : 400,
                }}
              >
                {c}
              </button>
            ))}
          </div>
          <textarea
            value={codexContent}
            onChange={e => setCodexContent(e.target.value)}
            rows={3}
            style={{ marginBottom: 10, fontSize: '0.82rem' }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={handleCodexSave} disabled={savingCodex || !codexContent.trim()}>
              {savingCodex ? 'Saving…' : 'Save to Codex →'}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setCodexPanel(false)}>Cancel</button>
          </div>
        </div>
      )}

      {confirm ? (
        <span className="inline-confirm">✓ {confirm === 'codex' ? 'Saved to Codex' : 'Done'}</span>
      ) : !codexPanel && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button className="btn btn-primary btn-sm" onClick={() => handle('pipeline')}>→ Pipeline</button>
          <button className="btn btn-ghost btn-sm" onClick={() => handle('spark')}>→ Idea Vault</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setCodexPanel(true)}>→ Codex</button>
          <button className="btn btn-ghost btn-sm" onClick={() => handle('archive')} style={{ color: 'var(--charcoal-soft)' }}>→ Archive</button>
        </div>
      )}
    </div>
  );
}
