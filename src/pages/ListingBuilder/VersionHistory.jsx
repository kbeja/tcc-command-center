import { useState } from 'react';
import { TRIGGER_LABELS, INTENT_STATUS_STYLE } from './constants';
import { HEADLINE_LABEL, HEADLINE_DOT_COLOR, Dot, ConfirmDiscardRow } from './shared';
import { hasUnsavedEdits } from './generation';
import { formatProductTruthSourceNotes } from '../../lib/storePolicies';

function truncate(text, max) {
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function VersionCard({
  generation, isLatest, isOpen, onToggle,
  editTitle, editTags, editDesc, editPrompts, output, generating, onRestore,
}) {
  const [confirmRestore, setConfirmRestore] = useState(false);
  const date = (generation.created_at || '').slice(0, 10);
  const triggerLabel = TRIGGER_LABELS[generation.trigger] || generation.trigger;
  const excludedCount = (generation.listing_generation_keywords || []).filter(k => k.role === 'excluded').length;
  const provenanceNotes = formatProductTruthSourceNotes(generation.product_truth_sources);

  const unsavedEdits = hasUnsavedEdits({ editTitle, editTags, editDesc, editPrompts, output });
  function handleRestoreClick() {
    if (unsavedEdits && !confirmRestore) { setConfirmRestore(true); return; }
    setConfirmRestore(false);
    onRestore();
  }

  return (
    <div
      className="card"
      style={{
        padding: 14,
        border: isLatest ? '1px solid rgba(124,175,138,0.4)' : '1px solid rgba(43,41,38,0.1)',
        background: 'var(--warm-white)',
      }}
    >
      <button
        type="button" onClick={onToggle}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left', gap: 10 }}
      >
        <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.72rem', color: 'var(--charcoal-soft)', flexShrink: 0 }}>{date}</span>
          <span style={{ fontSize: '0.68rem', color: 'var(--charcoal-soft)', opacity: 0.7, flexShrink: 0 }}>{triggerLabel}</span>
          {isLatest && (
            <span style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', padding: '1px 6px', borderRadius: 10, background: 'rgba(124,175,138,0.18)', color: '#2d6b3c', flexShrink: 0 }}>
              latest
            </span>
          )}
          <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--charcoal)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {generation.title || '(no title)'}
          </span>
        </div>
        <span style={{ fontSize: '0.65rem', color: 'var(--charcoal-soft)', opacity: 0.5, flexShrink: 0 }}>{isOpen ? '▲' : '▼'}</span>
      </button>

      {isOpen && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(43,41,38,0.08)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {generation.tags?.length > 0 && (
            <div style={{ fontSize: '0.76rem', color: 'var(--charcoal-soft)' }}>{generation.tags.join(', ')}</div>
          )}

          {generation.description?.opener && (
            <div style={{ fontSize: '0.8rem', color: 'var(--charcoal)', lineHeight: 1.5 }}>
              {truncate(generation.description.opener, 140)}
            </div>
          )}

          {generation.primary_search_intent && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: '0.78rem' }}>{generation.primary_search_intent}</span>
              {generation.primary_intent_status && INTENT_STATUS_STYLE[generation.primary_intent_status] && (
                <span style={{
                  fontSize: '0.62rem', padding: '2px 7px', borderRadius: 10,
                  background: INTENT_STATUS_STYLE[generation.primary_intent_status].bg,
                  color: INTENT_STATUS_STYLE[generation.primary_intent_status].color,
                }}>
                  {generation.primary_intent_status}
                </span>
              )}
            </div>
          )}

          {generation.change_reason && (
            <div style={{ fontSize: '0.76rem', color: 'var(--charcoal-soft)', fontStyle: 'italic' }}>
              "{generation.change_reason}"
            </div>
          )}

          {generation.validation_status && HEADLINE_LABEL[generation.validation_status] && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Dot color={HEADLINE_DOT_COLOR[generation.validation_status]} />
              <span style={{ fontSize: '0.74rem', color: 'var(--charcoal-soft)' }}>{HEADLINE_LABEL[generation.validation_status]}</span>
            </div>
          )}

          {excludedCount > 0 && (
            <details>
              <summary style={{ fontSize: '0.7rem', color: 'var(--charcoal-soft)', cursor: 'pointer' }}>
                {excludedCount} keyword{excludedCount !== 1 ? 's' : ''} excluded
              </summary>
            </details>
          )}

          {/* Product Truth provenance — Milestone C1's product_truth_sources,
              formatted from this row's own STORED value, never re-resolved
              against currently-active policies. Re-resolving would silently
              rewrite what an old card claims if a policy is later edited or
              archived — see storePolicies.js's own header. */}
          {generation.product_truth_sources == null ? (
            <div style={{ fontSize: '0.7rem', color: 'var(--charcoal-soft)', opacity: 0.7 }}>
              Provenance not recorded for this generation (predates Verified Libraries).
            </div>
          ) : provenanceNotes.length > 0 ? (
            <div style={{ fontSize: '0.7rem', color: 'var(--charcoal-soft)', lineHeight: 1.5 }}>
              {provenanceNotes.map(n => <div key={n.field}>ℹ {n.text}</div>)}
            </div>
          ) : null}

          <div>
            {confirmRestore ? (
              <ConfirmDiscardRow
                promptText="Discard edits & load this version instead?"
                confirmLabel="Yes, load version"
                onConfirm={handleRestoreClick}
                onCancel={() => setConfirmRestore(false)}
              />
            ) : (
              <button className="btn btn-ghost btn-sm" onClick={handleRestoreClick} disabled={generating}>
                Load this version →
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Milestone C2 — browsable history of every past AI generation for this
// product, reading the existing append-only listing_generations ledger
// (useListingGenerations already fetches the full array; nothing before
// this rendered more than index 0). Nothing shows for a single-version
// product — one entry next to the already-visible current output is
// clutter, not information (mirrors ConceptWorkspace.jsx's identical
// allVersions.length > 1 gate). This also naturally keeps the section
// invisible for a not-yet-saved product, since `generations` is [] until
// a real productId exists — not a special case, a free consequence of
// the same gate.
export default function VersionHistory({
  generations, editTitle, editTags, editDesc, editPrompts, output, generating, onRestore,
}) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState({});

  if (!generations || generations.length <= 1) return null;

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <button
        type="button" onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
      >
        <span className="eyebrow" style={{ margin: 0 }}>Version History — {generations.length} past versions</span>
        <span style={{ fontSize: '0.65rem', color: 'var(--charcoal-soft)', opacity: 0.5 }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {generations.map((gen, i) => {
            const isOpenCard = gen.id in expanded ? expanded[gen.id] : i === 0;
            return (
              <VersionCard
                key={gen.id}
                generation={gen}
                isLatest={i === 0}
                isOpen={isOpenCard}
                onToggle={() => setExpanded(prev => ({ ...prev, [gen.id]: !isOpenCard }))}
                editTitle={editTitle} editTags={editTags} editDesc={editDesc} editPrompts={editPrompts} output={output}
                generating={generating}
                onRestore={() => onRestore(gen)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
