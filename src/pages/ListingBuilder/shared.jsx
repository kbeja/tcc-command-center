import { useState } from 'react';
import { appendProductNote } from '../../lib/hooks';

export function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="btn btn-ghost btn-sm"
      style={{ flexShrink: 0 }}
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
    >
      {copied ? '✓' : 'Copy'}
    </button>
  );
}

// flags: research_gaps shape, [{severity, message}] — Listing Intelligence
// Milestone A (was a plain string array before).
export function SaveFlagsButton({ flags, productId }) {
  const [state, setState] = useState('idle'); // idle | saving | saved | copied
  if (!flags?.length) return null;

  const flagText = `--- Listing Builder Research Gaps ---\n${flags.map(f => `[${f.severity}] ${f.message}`).join('\n')}`;

  async function handleSave() {
    if (!productId) {
      navigator.clipboard.writeText(flagText);
      setState('copied');
      setTimeout(() => setState('idle'), 2000);
      return;
    }
    setState('saving');
    await appendProductNote(productId, flagText);
    setState('saved');
    setTimeout(() => setState('idle'), 3000);
  }

  return (
    <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.68rem' }} onClick={handleSave} disabled={state === 'saving'}>
      {state === 'saved' ? '✓ Saved to notes' : state === 'copied' ? '✓ Copied' : state === 'saving' ? 'Saving…' : productId ? 'Save to notes' : 'Copy flags'}
    </button>
  );
}

export function SectionHeader({ title }) {
  return (
    <div className="section-label" style={{ marginTop: 24, marginBottom: 12 }}>{title}</div>
  );
}

// Unknown/Yes/No — never a plain checkbox. A checkbox can't represent
// "unconfirmed," and defaulting an unconfirmed fact to false would assert
// "not available" for something nobody ever actually checked, which is
// exactly the false confidence Product Truth exists to prevent.
export function TriState({ label, value, onChange }) {
  const opts = [{ key: null, label: 'Unknown' }, { key: true, label: 'Yes' }, { key: false, label: 'No' }];
  return (
    <div>
      <div style={{ fontSize: '0.7rem', color: 'var(--charcoal-soft)', marginBottom: 3 }}>{label}</div>
      <div style={{ display: 'flex', gap: 4 }}>
        {opts.map(o => (
          <button key={String(o.key)} type="button" onClick={() => onChange(o.key)}
            style={{
              fontSize: '0.68rem', padding: '3px 9px', borderRadius: 20, cursor: 'pointer',
              background: value === o.key ? 'rgba(124,175,138,0.9)' : 'rgba(124,175,138,0.1)',
              color: value === o.key ? '#fff' : '#2d6b3c',
              border: `1px solid rgba(124,175,138,${value === o.key ? '0.9' : '0.25'})`,
              fontWeight: value === o.key ? 600 : 400,
            }}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
