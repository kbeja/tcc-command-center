import { useState } from 'react';
import { collectionKnowledge } from '../data/collections';

function Collapsible({ title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="collapsible-section">
      <button className="collapsible-trigger" onClick={() => setOpen(!open)}>
        <span style={{ fontSize: '0.75rem', fontWeight: 500 }}>{title}</span>
        <span className={`collapsible-chevron${open ? ' open' : ''}`}>▼</span>
      </button>
      {open && <div className="collapsible-content">{children}</div>}
    </div>
  );
}

export default function CollectionKnowledge({ collection, stage }) {
  const data = collectionKnowledge[collection];
  if (!data) return null;

  const stageTip = data.stageTips?.[stage];

  return (
    <div>
      {stageTip && (
        <div style={{
          background: 'var(--rose-faint)', border: '1px solid var(--dusty-rose)',
          borderRadius: 2, padding: '10px 14px', marginBottom: 12,
          fontSize: '0.8rem',
        }}>
          💡 {stageTip}
        </div>
      )}

      <Collapsible title={`${collection} Keywords`}>
        <div style={{ fontSize: '0.78rem', lineHeight: 1.8 }}>
          <div className="eyebrow" style={{ marginBottom: 6 }}>Title Keywords</div>
          <div style={{ marginBottom: 10 }}>{data.keywords.titleKeywords?.join(' · ')}</div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>Top Volume Keywords</div>
          <div>{data.keywords.topKeywords?.slice(0, 15).join(' · ')}</div>
        </div>
      </Collapsible>

      <Collapsible title="Style Guide">
        <pre style={{ fontSize: '0.78rem', whiteSpace: 'pre-wrap', lineHeight: 1.7, fontFamily: 'var(--font-body)' }}>
          {data.styleGuide}
        </pre>
      </Collapsible>

      <Collapsible title="Listing Prompts">
        <pre style={{ fontSize: '0.78rem', whiteSpace: 'pre-wrap', lineHeight: 1.7, fontFamily: 'var(--font-body)' }}>
          {data.prompts}
        </pre>
      </Collapsible>
    </div>
  );
}
