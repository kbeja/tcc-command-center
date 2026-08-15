import { useState } from 'react';
import { appendProductNote } from '../../lib/hooks';

// Readiness headline vocabulary (Milestone B) — moved here from
// Zone4Review.jsx (Milestone C2) so the new Version History cards can
// render the same validation-status badge without a second copy.
export const HEADLINE_LABEL = {
  not_generated: 'Not Generated Yet',
  ready: 'Ready',
  ready_with_caution: 'Ready with Caution',
  needs_research: 'Needs Research',
};
export const HEADLINE_DOT_COLOR = {
  not_generated: 'var(--charcoal-soft)',
  ready: '#2d6b3c',
  ready_with_caution: '#7a4a1e',
  needs_research: '#7a2b2b',
};

export function Dot({ color }) {
  return <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />;
}

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
// Purely presentational discard-confirm row (Milestone C2) — was
// independently duplicated identically in Zone4Review.jsx and
// KeywordEvidencePanel.jsx; a third near-identical need (restoring a past
// version, also destructive to unsaved edits) is what tipped this into a
// shared component rather than a third copy. Knows nothing about *why*
// the caller is confirming (regenerate vs. restore) or about change-reason
// capture, which stays entirely separate per Kristen's own instruction —
// each caller still owns its own confirmRegen/unsavedEdits gate exactly as
// before; only the JSX inside that branch becomes this component.
export function ConfirmDiscardRow({ promptText, confirmLabel, onConfirm, onCancel, generating }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.82rem' }}>
      <span>{promptText}</span>
      <button onClick={onConfirm} disabled={generating}
        style={{ color: 'var(--alert)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer' }}>
        {generating ? 'Generating…' : confirmLabel}
      </button>
      <button onClick={onCancel}
        style={{ color: 'var(--charcoal-soft)', background: 'none', border: 'none', cursor: 'pointer' }}>
        Cancel
      </button>
    </div>
  );
}

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
