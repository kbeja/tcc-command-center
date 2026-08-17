import { useState } from 'react';

// Replaces the "click trigger -> show prompt + Yes/Cancel" pattern that was
// independently duplicated across 9 call sites (SparkCard, EtsyStatsEntry,
// ProductWorkspace, Trends, Research, ResearchSessionCard, Codex,
// ConceptWorkspace x2) — OPT-011. Self-manages its own confirm state by
// default (uncontrolled). Pass `confirming` + `onTrigger` + `onCancel`
// instead to run controlled — needed by Research.jsx's CollectionsManager,
// which tracks "which row is confirming" as one piece of parent state keyed
// by row id, not N independent child states.
//
// Deliberately does not preserve every historical site's exact
// gap/font-size for the confirm row — those differences were incidental,
// not intentional, so this normalizes to one consistent look (matching
// src/pages/ListingBuilder/shared.jsx's ConfirmDiscardRow, the same pattern
// already extracted there for that folder). Trigger styling varies for real
// reasons (icon vs text, light vs dark-overlay context) so that stays fully
// overridable via triggerStyle/triggerClassName.
export default function ConfirmButton({
  label,
  onConfirm,
  promptText,
  confirmLabel = 'Yes',
  triggerStyle,
  triggerClassName,
  triggerTitle,
  wrapperStyle,
  dark = false,
  confirming: confirmingProp,
  onTrigger,
  onCancel: onCancelProp,
}) {
  const [internalConfirming, setInternalConfirming] = useState(false);
  const controlled = confirmingProp !== undefined;
  const confirming = controlled ? confirmingProp : internalConfirming;
  const trigger = () => (controlled ? onTrigger?.() : setInternalConfirming(true));
  const cancel = () => (controlled ? onCancelProp?.() : setInternalConfirming(false));

  const mutedColor = dark ? 'rgba(255,255,255,0.7)' : 'var(--charcoal-soft)';
  const confirmColor = dark ? '#fff' : 'var(--alert)';

  if (confirming) {
    return (
      <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.82rem', ...wrapperStyle }}>
        {promptText && <span style={{ color: mutedColor }}>{promptText}</span>}
        <button
          onClick={onConfirm}
          style={{ color: confirmColor, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer' }}
        >
          {confirmLabel}
        </button>
        <button onClick={cancel} style={{ color: mutedColor, background: 'none', border: 'none', cursor: 'pointer' }}>
          Cancel
        </button>
      </span>
    );
  }

  return (
    <button
      onClick={trigger}
      className={triggerClassName}
      title={triggerTitle}
      style={{ color: mutedColor, background: 'none', border: 'none', cursor: 'pointer', ...triggerStyle }}
    >
      {label}
    </button>
  );
}
