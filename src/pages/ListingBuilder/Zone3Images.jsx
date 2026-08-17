import { useState } from 'react';
import { CopyButton } from './shared';
import { processWithClaude } from '../../lib/claude';

// Role taxonomy duplicated from generate-listing-v2.js's IMAGE_ROLES (kept
// in sync by hand, same convention as analyze-visual.js's taxonomy
// duplication) — labels + display order for the Listing Image Plan.
const ROLE_LABEL = {
  hero: 'Main Image / Hero',
  lifestyle_1: 'Lifestyle 1',
  lifestyle_2: 'Lifestyle 2',
  flat_lay: 'Flat Lay Overview',
  detail: 'Detail / Close-Up',
  alternate_colors: 'Alternate Colors / Variations',
};
const ROLE_ORDER = Object.keys(ROLE_LABEL);

// Generations saved before this rework used a free-text {slot, type, prompt}
// shape (no role taxonomy) — jsonb column, no migration involved, so old
// rows still need a readable fallback label rather than showing blank.
function roleLabel(p) {
  if (p.role) return ROLE_LABEL[p.role] || p.role;
  if (p.slot || p.type) return [p.slot, p.type].filter(Boolean).join('. ');
  return 'Image';
}

// Defends against the AI not returning roles in canonical order — display
// should always read hero-first regardless. Legacy (roleless) rows sort
// after every real role, in their original relative order.
function sortedIndices(prompts) {
  return prompts
    .map((p, i) => ({ p, i }))
    .sort((a, b) => {
      const ai = a.p.role ? ROLE_ORDER.indexOf(a.p.role) : Infinity;
      const bi = b.p.role ? ROLE_ORDER.indexOf(b.p.role) : Infinity;
      return (ai === -1 ? Infinity : ai) - (bi === -1 ? Infinity : bi);
    })
    .map(x => x.i);
}

// Zone 3 — Images tab (Milestone B; reworked for the Listing Image Plan —
// see generate-listing-v2.js's IMAGE_ROLES/IMAGE_PROMPT_INSTRUCTIONS).
// Existing prompt cards plus a read-only echo of Zone 1's design image —
// Zone 1 stays the authoritative edit surface (upload/replace/re-analyze);
// this is display only, same pattern as Primary Search Intent's echo on the
// Listing tab.
export default function Zone3Images({ imagePreview, imageAnalysis, editPrompts, onPromptsChange }) {
  const [regeneratingIndex, setRegeneratingIndex] = useState(null);
  const [regenError, setRegenError] = useState('');
  const [feedbackDraft, setFeedbackDraft] = useState({});

  const order = sortedIndices(editPrompts);
  const allPromptsText = order.map(i => `${roleLabel(editPrompts[i])}\n${editPrompts[i].prompt}`).join('\n\n');

  async function handleRegenerate(i) {
    const p = editPrompts[i];
    if (!p.role) return; // legacy row with no defined role — edit the text directly instead
    setRegeneratingIndex(i);
    setRegenError('');
    try {
      const { parsed } = await processWithClaude('regenerate_image_prompt', {
        role: p.role,
        currentPrompt: p.prompt,
        imageAnalysis: imageAnalysis || undefined,
        feedback: feedbackDraft[i]?.trim() || undefined,
      });
      if (!parsed?.prompt) throw new Error('No prompt returned');
      const arr = [...editPrompts];
      arr[i] = { ...arr[i], prompt: parsed.prompt };
      onPromptsChange(arr);
    } catch (err) {
      setRegenError(err.message || 'Regeneration failed. Please try again.');
    } finally {
      setRegeneratingIndex(null);
    }
  }

  return (
    <div>
      {(imagePreview || imageAnalysis) && (
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid rgba(43,41,38,0.08)' }}>
          {imagePreview && (
            <img
              src={imagePreview}
              alt="Design mockup"
              style={{ width: 80, height: 80, objectFit: 'contain', borderRadius: 4, border: '1px solid rgba(43,41,38,0.12)', background: '#f5f3f0', flexShrink: 0 }}
            />
          )}
          {imageAnalysis && (
            <div style={{ fontSize: '0.76rem', color: 'var(--charcoal-soft)', lineHeight: 1.6 }}>{imageAnalysis}</div>
          )}
        </div>
      )}

      {editPrompts.length > 0 && (
        <>
          <div className="section-label" style={{ marginTop: 24, marginBottom: 4 }}>Listing Image Plan</div>
          <div style={{ fontSize: '0.72rem', color: 'var(--charcoal-soft)', marginBottom: 10, lineHeight: 1.5 }}>
            One cohesive set — a simple, product-led main image first, styled support images after.
          </div>
          <div style={{ marginBottom: 14 }}>
            <CopyButton text={allPromptsText} />
            <span style={{ fontSize: '0.72rem', color: 'var(--charcoal-soft)', marginLeft: 8 }}>Copy all prompts</span>
          </div>
        </>
      )}

      {regenError && (
        <div style={{ background: 'rgba(201,123,123,0.12)', border: '1px solid var(--alert)', borderRadius: 2, padding: '8px 12px', marginBottom: 12, fontSize: '0.76rem', color: 'var(--alert)' }}>
          ⚠ {regenError}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {order.map(i => {
          const p = editPrompts[i];
          const isHero = p.role === 'hero';
          return (
            <div key={i} style={{
              background: isHero ? 'rgba(124,175,138,0.07)' : 'var(--warm-white)',
              borderRadius: 4, padding: '12px 14px',
              border: isHero ? '1px solid rgba(124,175,138,0.35)' : '1px solid rgba(43,41,38,0.08)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, flexWrap: 'wrap', gap: 6 }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: isHero ? '#2d6b3c' : 'var(--charcoal-soft)' }}>
                  {roleLabel(p)}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {p.role && (
                    <button className="btn btn-ghost btn-sm" onClick={() => handleRegenerate(i)} disabled={regeneratingIndex === i}>
                      {regeneratingIndex === i ? 'Regenerating…' : '↺ Regenerate'}
                    </button>
                  )}
                  <CopyButton text={p.prompt} />
                </div>
              </div>
              <textarea
                value={p.prompt}
                onChange={e => {
                  const arr = [...editPrompts];
                  arr[i] = { ...arr[i], prompt: e.target.value };
                  onPromptsChange(arr);
                }}
                rows={3}
                style={{ width: '100%', fontSize: '0.82rem', lineHeight: 1.6 }}
              />
              {p.role && (
                <input
                  type="text"
                  value={feedbackDraft[i] || ''}
                  onChange={e => setFeedbackDraft(f => ({ ...f, [i]: e.target.value }))}
                  placeholder="Feedback for Regenerate (optional) — e.g. “less crowded, focus more on the design”"
                  style={{ width: '100%', fontSize: '0.72rem', marginTop: 8, padding: '4px 8px' }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
