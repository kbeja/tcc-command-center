import { useState } from 'react';
import { computeListingReadiness } from '../../lib/listingReadiness';
import { hasUnsavedEdits } from './generation';
import { HEADLINE_LABEL, HEADLINE_DOT_COLOR, Dot, ConfirmDiscardRow } from './shared';

const STATE_DOT_COLOR = { ok: '#2d6b3c', caution: '#7a4a1e', attention: '#7a2b2b', pending: 'var(--charcoal-soft)' };
const DIMENSION_LABEL = {
  product_truth: 'Product Truth',
  search_intent: 'Search Intent',
  evidence: 'Evidence',
  compatibility: 'Compatibility',
  generation_validation: 'Generation Check',
  // Phase 6 — §24's pre-publish Search Setup checklist.
  etsy_category: 'Etsy Category',
  etsy_attributes: 'Etsy Attributes',
  title: 'Title',
  tags: 'Tags',
  hero_image: 'Hero Image',
};

// Consolidates what used to be three scattered pieces (the 6-pill Research
// Readiness wall, the red Validation Warnings box, the Excluded Keywords
// disclosure) into one readiness rollup, plus the Save/Regenerate actions.
// Pure display of values Milestone A already computes — see
// src/lib/listingReadiness.js's header for what this does and doesn't do.
export default function Zone4Review({
  output, latestGeneration, generating, genError,
  productFormat, primarySearchIntent, primaryIntentStatus,
  usableKeywordCount, keywordsStale, researchGaps, excludedKeywordCount, excludedKeywords,
  validationWarnings, hasCollection, onRegenerate, onEditSetup,
  etsyCategory, etsyCategoryConfirmed, etsyAttributes, etsyAttributesComplete,
  heroImageApproved, title, tags,
  editTitle, editTags, editDesc, editPrompts,
  productId, onSaveEdits, saveEditsState,
  savedProductId, saving, saveStage, onSaveStageChange, saveStages, onSaveProduct, canSaveProduct, onOpenProduct,
}) {
  const [confirmRegen, setConfirmRegen] = useState(false);
  // Milestone C2 — always available, never required, never blocking (her
  // own words). Independent of the unsaved-edits confirm below: read at
  // the moment Regenerate is actually clicked, whether that's immediate
  // or after confirming a discard, and persisted to change_reason only
  // when non-blank.
  const [reason, setReason] = useState('');

  const hasGenerated = !!output || !!latestGeneration;
  const readiness = computeListingReadiness({
    hasGenerated, productFormat, primarySearchIntent, primaryIntentStatus,
    usableKeywordCount, keywordsStale, researchGaps, excludedKeywordCount,
    validationWarnings, aiValidationStatus: output?.validation?.status,
    etsyCategory, etsyCategoryConfirmed, etsyAttributes, etsyAttributesComplete,
    heroImageApproved, title, tags,
  });

  const unsavedEdits = hasUnsavedEdits({ editTitle, editTags, editDesc, editPrompts, output });
  function handleRegenerateClick() {
    if (unsavedEdits && !confirmRegen) { setConfirmRegen(true); return; }
    setConfirmRegen(false);
    onRegenerate(reason.trim() || null);
  }

  const hydratedLabel = !output && latestGeneration
    ? `From your last generation on ${(latestGeneration.created_at || '').slice(0, 10)}`
    : null;

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <Dot color={HEADLINE_DOT_COLOR[readiness.headline]} />
        <span style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--charcoal)' }}>
          {HEADLINE_LABEL[readiness.headline]}
        </span>
      </div>
      {hydratedLabel && (
        <div style={{ fontSize: '0.7rem', color: 'var(--charcoal-soft)', opacity: 0.7, marginBottom: 10 }}>{hydratedLabel}</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '10px 0 16px' }}>
        {readiness.dimensions.map(d => (
          <div key={d.key}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <span style={{ marginTop: 5 }}><Dot color={STATE_DOT_COLOR[d.state]} /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--charcoal-soft)' }}>{DIMENSION_LABEL[d.key]}</div>
                <div style={{ fontSize: '0.76rem', color: 'var(--charcoal-soft)', lineHeight: 1.5 }}>{d.detail}</div>
                {d.key === 'generation_validation' && d.state === 'caution' && (
                  <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {validationWarnings.map((w, i) => (
                      <div key={i} style={{ fontSize: '0.74rem', color: '#8b3a3a', lineHeight: 1.5 }}>⚠ {w}</div>
                    ))}
                  </div>
                )}
                {d.key === 'compatibility' && excludedKeywordCount > 0 && (
                  <details style={{ marginTop: 4 }}>
                    <summary style={{ fontSize: '0.72rem', color: 'var(--charcoal-soft)', cursor: 'pointer' }}>
                      view excluded keywords
                    </summary>
                    <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
                      {excludedKeywords.map((k, i) => (
                        <div key={i} style={{ fontSize: '0.74rem', color: 'var(--charcoal-soft)' }}>
                          <strong>{k.keyword}</strong> — {k.reason}
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ fontSize: '0.7rem', color: 'var(--charcoal-soft)', opacity: 0.7, marginBottom: 14 }}>
        Generation is never blocked by thin research — these are things worth checking, not requirements.
      </div>

      {/* Actions only make sense once something's actually been generated —
          pre-generation, the page's own full-width "Generate Listing" CTA
          is the only entry point, and this row staying hidden avoids a
          second, redundant generate button sitting right above it. */}
      {hasGenerated && (
        <>
          <input
            type="text"
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Why regenerate? (optional)"
            style={{ fontSize: '0.75rem', padding: '5px 8px', width: '100%', maxWidth: 360, marginBottom: 8, display: 'block' }}
          />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: productId || !savedProductId ? 16 : 0 }}>
            {output && <button className="btn btn-ghost btn-sm" onClick={onEditSetup}>← Edit setup</button>}
            {confirmRegen ? (
              <ConfirmDiscardRow
                promptText="Discard edits & regenerate?"
                confirmLabel="Yes, regenerate"
                onConfirm={handleRegenerateClick}
                onCancel={() => setConfirmRegen(false)}
                generating={generating}
              />
            ) : (
              <button className="btn btn-primary btn-sm" onClick={handleRegenerateClick} disabled={generating || !hasCollection}>
                {generating ? 'Generating…' : output ? '↺ Regenerate' : '✦ Generate New Version'}
              </button>
            )}
            {genError && <span style={{ fontSize: '0.75rem', color: '#c97b7b' }}>{genError}</span>}
          </div>

          {/* Save edits back to product — linked mode only */}
          {productId && (editTitle || editTags.length > 0) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button className="btn btn-primary btn-sm" onClick={onSaveEdits} disabled={saveEditsState === 'saving'}>
                {saveEditsState === 'saving' ? 'Saving…' : saveEditsState === 'saved' ? '✓ Saved' : 'Save edits to product →'}
              </button>
              <span style={{ fontSize: '0.72rem', color: 'var(--charcoal-soft)' }}>Writes title, tags, linked concept, Product Truth, and any edited description/image prompts</span>
            </div>
          )}

          {/* Save as new product — standalone only */}
          {!productId && (
            <div style={{ background: 'var(--warm-white)', border: '1px solid rgba(43,41,38,0.12)', borderRadius: 4, padding: '14px 16px' }}>
              <div className="eyebrow" style={{ marginBottom: 10 }}>Save as New Product</div>
              {savedProductId ? (
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span style={{ fontSize: '0.82rem', color: '#3d6b4a' }}>✓ Saved</span>
                  <button className="btn btn-primary btn-sm" onClick={onOpenProduct}>Open Product →</button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <select value={saveStage} onChange={e => onSaveStageChange(e.target.value)} style={{ width: 'auto', fontSize: '0.82rem' }}>
                    {saveStages.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <button className="btn btn-primary btn-sm" onClick={onSaveProduct} disabled={saving || !canSaveProduct}>
                    {saving ? 'Saving…' : 'Save as New Product →'}
                  </button>
                  {!canSaveProduct && <span style={{ fontSize: '0.72rem', color: 'var(--charcoal-soft)' }}>Requires product name + collection</span>}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
