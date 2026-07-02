import { useState, useRef, useEffect } from 'react';
import { createSpark } from '../lib/hooks';

export default function CaptureField({ onClose }) {
  const [text, setText] = useState('');
  const [saved, setSaved] = useState(false);
  const ref = useRef(null);

  useEffect(() => { ref.current?.focus(); }, []);

  async function handleSave() {
    if (!text.trim()) return;
    await createSpark(text.trim());
    setSaved(true);
    setTimeout(() => { onClose(); }, 1200);
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSave(); }
    if (e.key === 'Escape') onClose();
  }

  return (
    <div style={overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={sheet}>
        <p className="eyebrow" style={{ marginBottom: 12 }}>what's on your mind?</p>
        <textarea
          ref={ref}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKey}
          placeholder="New idea, observation, spark..."
          rows={3}
          style={{ marginBottom: 12 }}
        />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn btn-rose" onClick={handleSave} disabled={!text.trim()}>
            Save to Sparks →
          </button>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
          {saved && <span className="inline-confirm">✓ Saved</span>}
        </div>
      </div>
    </div>
  );
}

const overlay = {
  position: 'fixed', inset: 0, background: 'rgba(43,41,38,0.4)',
  display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
  zIndex: 200, padding: '0 0 80px',
};

const sheet = {
  background: 'var(--warm-white)', border: '1px solid rgba(43,41,38,0.12)',
  borderRadius: '4px 4px 0 0', padding: 24, width: '100%', maxWidth: 600,
};
