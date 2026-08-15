import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import {
  useProduct, useCollections, useCollectionObjects, useChapters, usePlaybooks, useConcept, useConcepts,
  createProduct, updateProduct, createCollection, createResearchSession,
  createListingGeneration, linkGenerationsToProduct,
} from '../lib/hooks';
import { resizeImageForUpload } from '../lib/image';
import { nicheStyleGuides } from '../data/collections';
import { STAGES } from '../data/stages';
import {
  PRODUCT_FORMATS, BLANK_BRANDS, checkFormatCompatibility, checkBrandMention,
  computeDiscussionPermissions, FORMAT_TAXONOMY_VERSION,
} from '../lib/productTruth';

// Listing Intelligence Milestone A — bumped when generate-listing-v2.js's
// prompt/schema or productTruth.js's taxonomy changes meaningfully. One
// combined version (not tracked separately) since they change together in
// practice — see productTruth.js's own FORMAT_TAXONOMY_VERSION comment.
const GENERATION_VERSION = `milestone-a-${FORMAT_TAXONOMY_VERSION}`;

const TITLE_STRATEGIES = [
  { key: 'buyer_clear', label: 'Buyer Clear' },
  { key: 'expanded_keyword_test', label: 'Expanded Keyword Test' },
  { key: 'manual', label: 'Manual' },
];

// Display-only labels for values the migration backfilled onto older
// products — never added to TITLE_STRATEGIES, so they're never offered as
// a live pick, but a loaded old product's value still needs to be legible
// as *something* rather than showing 3 unhighlighted buttons and nothing
// else (confirmed live: that's exactly what happened before this existed).
const LEGACY_TITLE_STRATEGY_LABELS = {
  legacy_keyword_rich: 'Keyword Rich',
  legacy_short_clean: 'Short & Clean',
};

const BRAND_VOICE_FALLBACK = `THE THREE GEARS
Aspirational: "You already know who you are. This is just the shirt that proves it."
Honest & Grounding: "It's not always beautiful. But it's always real."
Sarcastic & Warm: "Fine. You didn't ask for advice. Here's a shirt instead."

TARGET CUSTOMER VOICE
Present, capable, carries chaos lightly — without performing it.
She's not surviving motherhood as a brand. She just lives it.
✅ Dry, specific, occasionally delighted by small things
❌ No Hallmark energy — no sappy, wistful, or inspirational-quote copy
❌ No "Every moment is precious" / "You are enough" / "You've got this"
❌ No wistful past-tense ("Remember when…") — she lives in the present tense`;

// "SEO Opener" renamed to "Listing Opener" (Milestone A) — the old hint
// explicitly asked for "keyword-dense" copy, which is exactly the framing
// this rebuild removes; the new prompt (generate-listing-v2.js) never
// instructs keyword density for this section.
const DESC_META = {
  opener:             { label: 'Listing Opener',    hint: 'Warm, specific, natural — not keyword-dense filler' },
  product_details:   { label: 'Product Details',    hint: 'Size, color, material, format, what\'s included' },
  ordering_steps:    { label: 'Ordering Steps',     hint: 'How to order, customize, or download' },
  cross_sell:        { label: 'Cross-Sell',         hint: 'Shop our [collection] for more designs like this…' },
  shipping:          { label: 'Shipping',           hint: 'Only shown if a shipping policy is confirmed in Product Truth' },
  brand_voice_closer:{ label: 'Brand Voice Closer', hint: '1–2 sentences, TCC voice, no Hallmark energy' },
};

function CopyButton({ text }) {
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
function SaveFlagsButton({ flags, productId }) {
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
    const { data: current } = await supabase.from('products').select('notes').eq('id', productId).single();
    const existing = current?.notes || '';
    const newNotes = existing ? `${existing}\n\n${flagText}` : flagText;
    await updateProduct(productId, { notes: newNotes });
    setState('saved');
    setTimeout(() => setState('idle'), 3000);
  }

  return (
    <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.68rem' }} onClick={handleSave} disabled={state === 'saving'}>
      {state === 'saved' ? '✓ Saved to notes' : state === 'copied' ? '✓ Copied' : state === 'saving' ? 'Saving…' : productId ? 'Save to notes' : 'Copy flags'}
    </button>
  );
}

// "New Keyword Evidence" (Listing Intelligence Milestone A) — replaces the
// old "apply to title & tags" patch flow. Deliberately never proposes a
// title/tag rewrite at all anymore: it compares new evidence against the
// CURRENT Primary Search Intent and returns a recommendation only
// (no_change / consider_at_next_review / notable_shift). If the evidence
// genuinely changes the strategy, that's a real regenerate through the
// Generate button, not a quiet patch — this stops new research from
// encouraging immediate, unreviewed listing edits outside any cadence.
function KeywordPatchPanel({ currentPrimaryIntent, currentPrimaryIntentStatus }) {
  const [open, setOpen]                   = useState(false);
  const [manualText, setManualText]       = useState('');
  const [extracted, setExtracted]         = useState([]);
  const [extracting, setExtracting]       = useState(false);
  const [evaluating, setEvaluating]       = useState(false);
  const [result, setResult]               = useState(null);
  const [error, setError]                 = useState('');

  async function handleScreenshot(file) {
    setExtracting(true);
    setError('');
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target.result.split(',')[1];
      try {
        const res = await fetch('/.netlify/functions/claude-process', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'extract_keywords_image', payload: { imageBase64: base64, mediaType: file.type || 'image/png' } }),
        });
        const data = await res.json();
        setExtracted(data.keywords || []);
      } catch { setError('Screenshot extraction failed'); }
      setExtracting(false);
    };
    reader.readAsDataURL(file);
  }

  function parseManual() {
    return manualText.trim().split('\n').filter(Boolean).map(line => {
      const [keyword, volume, competition, score] = line.split('|').map(p => p.trim());
      return { keyword, volume: volume ? parseInt(volume) : null, competition: competition ? parseInt(competition) : null, score: score ? parseInt(score) : null };
    }).filter(k => k.keyword);
  }

  const keywords = extracted.length > 0 ? extracted : parseManual();
  const hasInput = extracted.length > 0 || manualText.trim().length > 0;

  async function handleEvaluate() {
    setEvaluating(true);
    setError('');
    try {
      const res = await fetch('/.netlify/functions/claude-process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'evaluate_keyword_evidence', payload: { currentPrimaryIntent, currentPrimaryIntentStatus, newKeywords: keywords } }),
      });
      const raw = await res.text();
      let data;
      try { data = JSON.parse(raw); } catch { setError(`Server error: ${raw.slice(0, 150)}`); setEvaluating(false); return; }
      if (!data.parsed) { setError(data.error || 'No output returned'); setEvaluating(false); return; }
      setResult(data.parsed);
    } catch (err) { setError(err.message); }
    setEvaluating(false);
  }

  function reset() { setOpen(false); setManualText(''); setExtracted([]); setResult(null); setError(''); }

  if (!open) {
    return (
      <button className="btn btn-ghost btn-sm" style={{ marginTop: 8, fontSize: '0.75rem' }} onClick={() => setOpen(true)}>
        + Found new keyword evidence?
      </button>
    );
  }

  const RECOMMENDATION_LABEL = { no_change: 'No change recommended', consider_at_next_review: 'Consider at next scheduled review', notable_shift: 'Notable shift — worth a real regeneration' };
  const RECOMMENDATION_COLOR = { no_change: '#2d6b3c', consider_at_next_review: '#7a4a1e', notable_shift: '#8b3a3a' };

  if (result) {
    return (
      <div style={{ marginTop: 12, background: 'var(--warm-white)', border: '1px solid rgba(43,41,38,0.1)', borderRadius: 4, padding: '12px 14px' }}>
        <div style={{ fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: RECOMMENDATION_COLOR[result.recommendation] || 'var(--charcoal-soft)', marginBottom: 6 }}>
          {RECOMMENDATION_LABEL[result.recommendation] || result.recommendation}
        </div>
        <div style={{ fontSize: '0.82rem', color: 'var(--charcoal-soft)', lineHeight: 1.6, marginBottom: result.notable_keywords?.length ? 10 : 0 }}>{result.reasoning}</div>
        {result.notable_keywords?.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
            {result.notable_keywords.map((k, i) => (
              <div key={i} style={{ fontSize: '0.75rem' }}><strong>{k.keyword}</strong> — {k.note}</div>
            ))}
          </div>
        )}
        <button className="btn btn-ghost btn-sm" onClick={reset}>OK</button>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 12, background: 'var(--warm-white)', border: '1px solid rgba(43,41,38,0.1)', borderRadius: 4, padding: '12px 14px' }}>
      <div style={{ fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--charcoal-soft)', marginBottom: 10 }}>New Keyword Evidence</div>
      {extracted.length > 0 ? (
        <div style={{ fontSize: '0.78rem', color: '#2d6b3c', marginBottom: 10 }}>✓ {extracted.length} keywords extracted — ready to evaluate</div>
      ) : (
        <>
          <div style={{ fontSize: '0.72rem', color: 'var(--charcoal-soft)', marginBottom: 6 }}>Upload an Everbee screenshot or enter keywords manually (keyword | volume | competition | score):</div>
          <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer', marginBottom: 8, display: 'inline-block' }}>
            {extracting ? 'Extracting…' : 'Upload screenshot'}
            <input type="file" accept="image/*" style={{ display: 'none' }} disabled={extracting} onChange={e => { if (e.target.files[0]) handleScreenshot(e.target.files[0]); }} />
          </label>
          <textarea
            value={manualText}
            onChange={e => setManualText(e.target.value)}
            placeholder={'beach reads shirt | 2400 | 180 | 52000\nspicy book shirt | 1800 | 95 | 38000'}
            rows={3}
            style={{ width: '100%', fontSize: '0.78rem', fontFamily: 'monospace' }}
          />
        </>
      )}
      {error && <div style={{ fontSize: '0.75rem', color: '#c97b7b', marginBottom: 8 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button className="btn btn-primary btn-sm" onClick={handleEvaluate} disabled={evaluating || !hasInput}>
          {evaluating ? 'Evaluating…' : 'Compare against current strategy →'}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={reset}>Cancel</button>
      </div>
    </div>
  );
}

function SectionHeader({ title }) {
  return (
    <div className="section-label" style={{ marginTop: 24, marginBottom: 12 }}>{title}</div>
  );
}

// Unknown/Yes/No — never a plain checkbox. A checkbox can't represent
// "unconfirmed," and defaulting an unconfirmed fact to false would assert
// "not available" for something nobody ever actually checked, which is
// exactly the false confidence Product Truth exists to prevent.
function TriState({ label, value, onChange }) {
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

// Product Truth — Listing Intelligence Milestone A. Collapsed by default
// once a format is confirmed (avoids permanently thickening an already
// busy page — the full 4-zone declutter is Milestone B's job, this just
// needs to be functional); open by default the first time, since an unset
// product_format silently disables the whole Compatibility Gate.
function ProductTruthSection({ form, setField }) {
  const [open, setOpen] = useState(!form.productFormat);
  return (
    <div style={{ marginBottom: 12, border: '1px solid rgba(43,41,38,0.1)', borderRadius: 4, padding: '10px 12px', background: 'var(--warm-white)' }}>
      <button type="button" onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
        <span style={{ fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--charcoal-soft)' }}>
          Product Truth {form.productFormat ? `— ${form.productFormat}` : '— format not set'}
        </span>
        <span style={{ fontSize: '0.65rem', color: 'var(--charcoal-soft)', opacity: 0.5 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ marginTop: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div>
              <label className="form-label">Format</label>
              <select value={form.productFormat} onChange={e => setField('productFormat', e.target.value)} style={{ fontSize: '0.78rem' }}>
                <option value="">— Unset —</option>
                {PRODUCT_FORMATS.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Blank / Brand</label>
              <select value={form.blankBrand} onChange={e => setField('blankBrand', e.target.value)} style={{ fontSize: '0.78rem' }}>
                <option value="">— Unset —</option>
                {BLANK_BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Blank / Model</label>
              <input value={form.blankModel} onChange={e => setField('blankModel', e.target.value)} placeholder="e.g. Comfort Colors 1717" style={{ fontSize: '0.78rem' }} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Garment Color</label>
              <input value={form.garmentColor} onChange={e => setField('garmentColor', e.target.value)} placeholder="e.g. Pepper" style={{ fontSize: '0.78rem' }} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Available Colors <span style={{ fontWeight: 400, opacity: 0.5 }}>(comma-separated)</span></label>
              <input
                value={(form.availableColors || []).join(', ')}
                onChange={e => setField('availableColors', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                placeholder="e.g. Black, White, Pepper" style={{ fontSize: '0.78rem' }} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Size Range</label>
              <input value={form.sizeRange} onChange={e => setField('sizeRange', e.target.value)} placeholder="e.g. S–3XL" style={{ fontSize: '0.78rem' }} />
            </div>
          </div>
          <div className="form-group" style={{ margin: '0 0 10px' }}>
            <label className="form-label">Material</label>
            <input value={form.material} onChange={e => setField('material', e.target.value)} placeholder="e.g. 100% ring-spun cotton" style={{ fontSize: '0.78rem' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
            <TriState label="Personalization available" value={form.personalizationAvailable} onChange={v => setField('personalizationAvailable', v)} />
            <TriState label="Customization available" value={form.customizationAvailable} onChange={v => setField('customizationAvailable', v)} />
            <TriState label="Gift wrap available" value={form.giftWrapAvailable} onChange={v => setField('giftWrapAvailable', v)} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Production Time</label>
              <input value={form.productionTime} onChange={e => setField('productionTime', e.target.value)} placeholder="e.g. 2–3 business days" style={{ fontSize: '0.78rem' }} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Shipping Policy</label>
              <input value={form.shippingPolicy} onChange={e => setField('shippingPolicy', e.target.value)} placeholder="e.g. USPS, 5–7 days domestic" style={{ fontSize: '0.78rem' }} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Fulfillment Provider</label>
              <input value={form.fulfillmentProvider} onChange={e => setField('fulfillmentProvider', e.target.value)} placeholder="e.g. Printify" style={{ fontSize: '0.78rem' }} />
            </div>
          </div>
          <div style={{ fontSize: '0.68rem', color: 'var(--charcoal-soft)', opacity: 0.7, marginTop: 10, lineHeight: 1.5 }}>
            Unset fields are never guessed at generation time — a listing with no shipping policy set simply won't mention shipping, rather than inventing one.
          </div>
        </div>
      )}
    </div>
  );
}

// Turns form state into the canonical Product Truth object -- the thing
// that overrides everything else. Every field nullable; unset stays
// unset, never inferred. See src/lib/productTruth.js's header for why
// this exists (Listing Intelligence Milestone A).
function buildProductTruth(form) {
  return {
    product_format: form.productFormat || null,
    blank_brand: form.blankBrand || null,
    blank_model: form.blankModel || null,
    garment_color: form.garmentColor || null,
    available_colors: form.availableColors?.length ? form.availableColors : null,
    size_range: form.sizeRange || null,
    material: form.material || null,
    personalization_available: form.personalizationAvailable,
    customization_available: form.customizationAvailable,
    gift_wrap_available: form.giftWrapAvailable,
    production_time: form.productionTime || null,
    shipping_policy: form.shippingPolicy || null,
    fulfillment_provider: form.fulfillmentProvider || null,
  };
}

// Replaces the old buildContext() text-blob builder. Returns a structured
// payload for generate-listing-v2.js instead of one giant prompt string —
// the deterministic Product Compatibility Gate (excluding format-
// incompatible keywords before Claude ever sees them, not just annotating
// them in prompt text) lives here too. See src/lib/productTruth.js.
function buildGenerationContext({ form, keywords, styleGuide, brandStyleGuide, season, brandVoice, photoStandards, imageAnalysis, allCollectionNames, linkedConcept }) {
  // Misspelling variants are excluded everywhere now — title, description, AND tags.
  // Etsy's search normalizes misspellings to the correct spelling itself, so a tag
  // slot (1 of only 13) spent on a misspelled variant is redundant, not helpful.
  // They're still captured as research signal (search volume for that phrasing),
  // just never fed into generation.
  const usable    = keywords.filter(k => !k.tags_only && k.tag_type !== 'discard' && !k.is_misspelling_variant);

  // Deterministic Product Compatibility Gate — the one part of this
  // pipeline that must never depend on the AI behaving correctly. Anything
  // incompatible with the product's own format is excluded HERE, before
  // Claude ever sees it, not just annotated in prompt text a model could
  // ignore (which is exactly what this file's old FORMAT_TERMS advisory
  // tag was, and exactly why it didn't prevent the original bug — see
  // src/lib/productTruth.js's own header).
  const productTruth = buildProductTruth(form);
  const discussionPermissions = computeDiscussionPermissions(productTruth);
  const compatibleKeywords = [];
  const excludedKeywords = [];
  for (const k of usable) {
    const result = checkFormatCompatibility(k.keyword, productTruth.product_format);
    if (result === 'incompatible') {
      excludedKeywords.push({
        keyword: k.keyword,
        keywordId: k.id,
        reason: `Conflicts with product format${productTruth.product_format ? ` (${productTruth.product_format})` : ''}`,
        volume: k.volume ?? null, competition: k.competition ?? null, score: k.score ?? null,
      });
    } else {
      compatibleKeywords.push(k);
    }
  }
  const keywordPool = compatibleKeywords.map(k => ({
    keyword: k.keyword, keywordId: k.id, volume: k.volume ?? null, competition: k.competition ?? null,
    score: k.score ?? null, source: k._source || null, bucket: k.bucket ?? null,
  }));
  const researchSourcesUsed = [...new Set(compatibleKeywords.map(k => k._source).filter(Boolean))];

  const conceptContext = linkedConcept ? [
    linkedConcept.design_direction && `Design Direction: ${linkedConcept.design_direction}`,
    linkedConcept.visual_style && `Visual Style: ${linkedConcept.visual_style}`,
    linkedConcept.color_palette && `Color Palette: ${linkedConcept.color_palette}`,
    linkedConcept.target_customer && `Target Customer: ${linkedConcept.target_customer}`,
    (linkedConcept.mood_keywords || []).length && `Mood Keywords: ${linkedConcept.mood_keywords.join(', ')}`,
    linkedConcept.emotional_trigger && `Emotional Trigger: ${linkedConcept.emotional_trigger}`,
  ].filter(Boolean).join('\n') || null : null;

  const collectionContext = [
    `Collection: ${allCollectionNames.length > 1 ? allCollectionNames.join(' + ') : (form.collection || '—')}`,
    allCollectionNames.length > 1 ? 'Note: keywords are pooled from multiple collections — use only what fits this specific product.' : null,
    form.niche && `Sub-niche: ${form.niche}`,
    season ? `Occasion/season: ${season} — this is a seasonal product, not evergreen` : 'Occasion/season: evergreen',
    form.notes && `Notes: ${form.notes}`,
  ].filter(Boolean).join('\n');

  const styleGuideText = [
    brandStyleGuide && `Brand-wide (always applies):\n${brandStyleGuide}`,
    styleGuide && `Collection-specific:\n${styleGuide}`,
  ].filter(Boolean).join('\n\n') || null;

  return {
    productTruth, discussionPermissions, keywordPool, excludedKeywords, researchSourcesUsed,
    collectionContext, conceptContext, styleGuide: styleGuideText,
    brandVoice: brandVoice || null, photoStandards: photoStandards || null, imageAnalysis: imageAnalysis || null,
  };
}

// Forced tool-use makes the model return a properly-typed array almost
// always, but not always — a live generation run returned research_gaps as
// a malformed JSON-in-a-string instead of the schema's actual array, which
// crashed the page on a bare `field || []` (truthy strings skip that
// fallback; whatever .array-method got called on the string next threw).
// Every AI-sourced field this file treats as an array goes through this
// first, not just a falsy check.
function asArray(v) {
  return Array.isArray(v) ? v : [];
}

// Defense-in-depth checks re-run against the AI's actual output, on top of
// (not instead of) the deterministic pre-filter and permission-based
// prompt instructions upstream — catches the case where free-text
// generation undoes upstream safety despite clean inputs. Never blocks the
// result; returns warnings for the user to review.
function validateGeneratedListing({ listing, productTruth, discussionPermissions, keywordPool }) {
  const warnings = [];
  if (!listing) return warnings;

  const titleAndTags = `${listing.title || ''} ${asArray(listing.tags).join(' ')}`;
  if (productTruth.product_format && checkFormatCompatibility(titleAndTags, productTruth.product_format) === 'incompatible') {
    warnings.push('Generated title/tags may reference a conflicting product format — review before publishing.');
  }

  if (listing.primary_intent_status === 'validated') {
    const claimed = (listing.primary_intent_matched_keyword || listing.primary_search_intent || '').trim().toLowerCase();
    const realMatch = keywordPool.some(k => k.keyword.trim().toLowerCase() === claimed);
    if (!realMatch) warnings.push('Primary Search Intent was marked "validated" but doesn\'t exactly match a researched keyword — treat as unconfirmed and review.');
  }

  const descText = JSON.stringify(listing.description || {});
  if (!discussionPermissions.shipping && (listing.description?.shipping || '').trim()) warnings.push('Shipping was a forbidden topic (no shipping_policy set) but the description has shipping content.');
  if (!discussionPermissions.personalization && /personali[sz]/i.test(descText)) warnings.push('Personalization was forbidden but may be mentioned — review.');
  if (!discussionPermissions.customization && /customi[sz]/i.test(descText)) warnings.push('Customization was forbidden but may be mentioned — review.');
  if (!discussionPermissions.gift_wrap && /gift.?wrap/i.test(descText)) warnings.push('Gift wrapping was forbidden but may be mentioned — review.');
  if (productTruth.blank_brand && checkBrandMention(descText, productTruth.blank_brand).length) {
    warnings.push(`Description may reference a different blank brand than confirmed (${productTruth.blank_brand}) — review.`);
  }

  if ((listing.title || '').length > 140) warnings.push('Title exceeds 140 characters.');
  const tags = asArray(listing.tags);
  if (tags.length > 13) warnings.push('More than 13 tags returned.');
  if (tags.some(t => t.length > 20)) warnings.push('One or more tags exceed 20 characters.');
  if (new Set(tags.map(t => t.toLowerCase())).size !== tags.length) warnings.push('Duplicate tags detected.');

  return warnings;
}

// ─── Collection picker with inline add ───────────────────────────────────────

const SEASONS = ['Halloween', 'Christmas', "Valentine's Day", "Mother's Day", 'Back to School', '4th of July', 'Summer', 'Spring', 'Fall'];

function CollectionPicker({ collections, collectionObjects, chapters, value, onChange, extraValues, onExtraChange, onCreated }) {
  const [adding, setAdding]     = useState(false);
  const [newName, setNewName]   = useState('');
  const [newChapter, setNewChapter] = useState('');
  const [newSeason, setNewSeason]   = useState('');
  const [newLaunch, setNewLaunch]   = useState('');
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');

  function resetNew() { setAdding(false); setNewName(''); setNewChapter(''); setNewSeason(''); setNewLaunch(''); setError(''); }

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    setSaving(true);
    setError('');
    const { error } = await createCollection(name, {
      ...(newChapter ? { chapter: newChapter } : {}),
      ...(newSeason  ? { season: newSeason }   : {}),
      ...(newLaunch  ? { launch_date: newLaunch } : {}),
    });
    if (error) {
      setError(error.message?.includes('unique') ? 'Already exists.' : 'Could not save.');
    } else {
      resetNew();
      onCreated?.(name);
    }
    setSaving(false);
  }

  return (
    <div className="form-group" style={{ marginBottom: 12 }}>
      <label className="form-label">Collection</label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 6 }}>
        {(() => {
          const allSelected = new Set([value, ...(extraValues || [])].filter(Boolean));

          function toggle(name) {
            if (!value) { onChange(name); return; }
            if (name === value) {
              // deselect primary — promote first extra if any, else clear
              const extras = new Set(extraValues || []);
              if (extras.size) {
                const [first, ...rest] = [...extras];
                onChange(first);
                onExtraChange?.(new Set(rest));
              } else {
                onChange('');
              }
              return;
            }
            const extras = new Set(extraValues || []);
            if (extras.has(name)) { extras.delete(name); } else { extras.add(name); }
            onExtraChange?.(extras);
          }

          const liveObjects = (collectionObjects || []).filter(c => c.status !== 'archived');
          const groups = chapters.map(ch => {
            const inCh = liveObjects.filter(c => c.chapter === ch);
            return inCh.length ? { label: ch, items: inCh } : null;
          }).filter(Boolean);
          const uncat = liveObjects.filter(c => !c.chapter);
          if (uncat.length) groups.push({ label: 'Other', items: uncat });

          return groups.map(({ label, items }) => (
            <div key={label}>
              <div style={{ fontSize: '0.65rem', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--charcoal-soft)', opacity: 0.5, marginBottom: 4 }}>{label}</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {items.map(c => {
                  const isPrimary = value === c.name;
                  const isExtra = (extraValues || new Set()).has(c.name);
                  const isOn = isPrimary || isExtra;
                  return (
                    <button key={c.name} type="button"
                      onClick={() => toggle(c.name)}
                      style={{
                        fontSize: '0.72rem', padding: '4px 10px', borderRadius: 20, cursor: 'pointer',
                        background: isPrimary ? 'var(--dusty-rose)' : isExtra ? 'rgba(124,175,138,0.25)' : 'transparent',
                        color: isPrimary ? '#fff' : isExtra ? '#2d6b3c' : 'var(--charcoal-soft)',
                        border: isOn ? 'none' : '1px solid rgba(43,41,38,0.2)',
                        fontWeight: isOn ? 600 : 400,
                        display: 'flex', alignItems: 'center', gap: 5,
                      }}
                    >
                      {c.name}
                      {isPrimary && <span style={{ fontSize: '0.55rem', opacity: 0.8 }}>primary</span>}
                      {c.season && !isPrimary && <span style={{ fontSize: '0.58rem', opacity: 0.7, fontWeight: 400 }}>· {c.season}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          ));
        })()}

        {!adding && (
          <button type="button" onClick={() => setAdding(true)}
            style={{ fontSize: '0.68rem', padding: '3px 8px', borderRadius: 20, cursor: 'pointer', alignSelf: 'flex-start', background: 'none', border: '1px dashed rgba(43,41,38,0.25)', color: 'var(--charcoal-soft)' }}>
            + New collection
          </button>
        )}
      </div>
      {adding && (
        <div style={{ background: 'var(--warm-white)', border: '1px solid rgba(43,41,38,0.1)', borderRadius: 6, padding: '12px', marginTop: 4, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input value={newName} onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Escape' && resetNew()}
            placeholder="Collection name…" autoFocus style={{ fontSize: '0.78rem' }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <select value={newChapter} onChange={e => setNewChapter(e.target.value)} style={{ fontSize: '0.75rem' }}>
              <option value="">— Chapter —</option>
              {chapters.map(ch => <option key={ch} value={ch}>{ch}</option>)}
            </select>
            <select value={newSeason} onChange={e => setNewSeason(e.target.value)} style={{ fontSize: '0.75rem' }}>
              <option value="">— Evergreen —</option>
              {SEASONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          {newSeason && (
            <div>
              <label className="form-label" style={{ marginBottom: 3 }}>Target launch date</label>
              <input type="date" value={newLaunch} onChange={e => setNewLaunch(e.target.value)} style={{ fontSize: '0.75rem' }} />
            </div>
          )}
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" className="btn btn-primary btn-sm" onClick={handleCreate} disabled={!newName.trim() || saving}>
              {saving ? '…' : 'Add'}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={resetNew}>Cancel</button>
          </div>
        </div>
      )}
      {error && <div style={{ fontSize: '0.72rem', color: 'var(--alert)', marginTop: 4 }}>{error}</div>}
    </div>
  );
}

// ─── Inline keyword add panel ─────────────────────────────────────────────────

function InlineKeywordAdd({ collection, sessions, onSaved }) {
  const [open, setOpen]       = useState(false);
  const [rows, setRows]       = useState([{ keyword: '', volume: '', competition: '', bucket: '' }]);
  const [targetSession, setTargetSession] = useState('');
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);

  // Default to the most recent existing session for this collection, once per
  // collection, so leaving the dropdown untouched doesn't silently spawn a new
  // "Inline add" session every time — same auto-pick-once-then-respect-the-user
  // pattern as the anchor keyword auto-select above.
  const autoSessionTriedRef = useRef(new Set());
  useEffect(() => {
    if (autoSessionTriedRef.current.has(collection)) return;
    if (!sessions.length) return;
    autoSessionTriedRef.current.add(collection);
    const mostRecent = [...sessions].sort((a, b) => new Date(b.date || b.created_at || 0) - new Date(a.date || a.created_at || 0))[0];
    if (mostRecent) setTargetSession(mostRecent.id);
  }, [collection, sessions]);

  function updateRow(i, field, val) {
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: val } : r));
  }
  function addRow() {
    setRows(prev => [...prev, { keyword: '', volume: '', competition: '', bucket: '' }]);
  }
  function removeRow(i) {
    setRows(prev => prev.filter((_, idx) => idx !== i));
  }

  async function handleSave() {
    const valid = rows.filter(r => r.keyword.trim());
    if (!valid.length) return;
    setSaving(true);

    // targetSession holds a real research_sessions.id once one's picked from
    // the dropdown (each session object carries its own collection/source/
    // date already, from the `*, keywords(*)` fetch in the parent) — pass it
    // straight through so createResearchSession() appends to that session
    // instead of creating a new one. Blank means "+ Create new session".
    const existingSession = targetSession ? sessions.find(s => s.id === targetSession) : null;
    const sessionParam = existingSession || {
      date: new Date().toISOString().slice(0, 10),
      collection,
      source: 'Inline add',
      status: 'Needs More Data',
    };

    const kwRows = valid.map(r => ({
      keyword:       r.keyword.trim(),
      volume:        r.volume ? parseInt(r.volume) : null,
      competition:   r.competition ? parseInt(r.competition) : null,
      bucket:        r.bucket ? parseInt(r.bucket) : null,
      bucket_source: r.bucket ? 'manual' : null,
      tag_type:      'watch',
      tags_only:     false,
    }));

    const { data, error } = await createResearchSession(sessionParam, kwRows);
    if (error) { console.error(error); setSaving(false); return; }
    if (!existingSession && data?.id) setTargetSession(data.id);

    setSaving(false);
    setSaved(true);
    setRows([{ keyword: '', volume: '', competition: '', bucket: '' }]);
    onSaved?.();
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left', padding: 0 }}
      >
        <span style={{ fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--charcoal-soft)' }}>
          + Add Keywords Without Leaving
        </span>
        <span style={{ fontSize: '0.65rem', color: 'var(--charcoal-soft)', opacity: 0.5 }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ marginTop: 12 }}>
          {/* Session target */}
          <div style={{ marginBottom: 10 }}>
            <label className="form-label">Add to session</label>
            <select value={targetSession} onChange={e => setTargetSession(e.target.value)}
              style={{ fontSize: '0.78rem', padding: '5px 8px' }}>
              <option value="">+ Create new session</option>
              {sessions.map(s => (
                <option key={s.id} value={s.id}>{s.niche || s.collection} — {s.date} ({(s.keywords || []).length} kw)</option>
              ))}
            </select>
          </div>

          {/* Keyword rows */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 80px 80px 80px 24px', gap: 6, fontSize: '0.65rem', color: 'var(--charcoal-soft)', padding: '0 2px' }}>
              <span>Keyword</span><span>Volume</span><span>Competition</span><span>Bucket</span><span />
            </div>
            {rows.map((r, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 80px 80px 80px 24px', gap: 6, alignItems: 'center' }}>
                <input value={r.keyword} onChange={e => updateRow(i, 'keyword', e.target.value)}
                  placeholder="keyword phrase" style={{ fontSize: '0.78rem', padding: '4px 8px' }} />
                <input value={r.volume} onChange={e => updateRow(i, 'volume', e.target.value)}
                  type="number" placeholder="vol" style={{ fontSize: '0.78rem', padding: '4px 6px' }} />
                <input value={r.competition} onChange={e => updateRow(i, 'competition', e.target.value)}
                  type="number" placeholder="comp" style={{ fontSize: '0.78rem', padding: '4px 6px' }} />
                <select value={r.bucket} onChange={e => updateRow(i, 'bucket', e.target.value)}
                  style={{ fontSize: '0.72rem', padding: '4px 4px' }}>
                  <option value="">—</option>
                  <option value="1">B1</option>
                  <option value="2">B2</option>
                  <option value="3">B3</option>
                </select>
                <button onClick={() => removeRow(i)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--charcoal-soft)', opacity: 0.4, fontSize: '0.8rem', padding: 0 }}>✕</button>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={addRow}>+ Row</button>
            <button type="button" className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving || !rows.some(r => r.keyword.trim())}>
              {saving ? 'Saving…' : saved ? '✓ Saved — keywords updated' : 'Save & Refresh'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ListingBuilder() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const productId = searchParams.get('product');
  const conceptId = searchParams.get('fromConcept');

  const { product, loading: productLoading } = useProduct(productId);
  const { collections, refetch: refetchCollections } = useCollections();
  const { collections: collectionObjs, refetch: refetchCollectionObjs } = useCollectionObjects();
  const { chapters } = useChapters();
  const { playbooks } = usePlaybooks();

  // Linked Concept (Phase 10) — set automatically when arriving via a fresh
  // push (conceptId from the URL) or when an existing product already has
  // one saved; otherwise pickable manually below. useConcept re-fetches
  // whenever the id changes, which covers picker changes; handleGenerate
  // additionally re-fetches live right before building context so an edit
  // made to the concept after linking is never stale at generation time.
  const [linkedConceptId, setLinkedConceptId] = useState(conceptId || null);
  const { concept: linkedConcept } = useConcept(linkedConceptId);

  // One-time hand-off from a Concept's "Push to Listing Builder" — resolved
  // synchronously in a lazy useState initializer (not a useEffect) so it's
  // settled before first paint and can't race the draft-restore/auto-save
  // effects below. It genuinely did race them as a useEffect: React 18
  // StrictMode's double-invocation let auto-save persist the pre-update
  // (still-empty) form to localStorage between the two passes, and
  // draft-restore's second pass then re-read that and clobbered this data.
  const [conceptPushData] = useState(() => {
    if (!conceptId) return null;
    try {
      const raw = sessionStorage.getItem('tcc_concept_push');
      if (!raw) return null;
      sessionStorage.removeItem('tcc_concept_push');
      return JSON.parse(raw);
    } catch { return null; }
  });

  // Form
  const [form, setForm] = useState({
    productName: conceptPushData?.productName || '',
    collection: '', niche: '',
    productType: conceptPushData?.productType || '',
    emotionalTrigger: '', notes: '',
    // Product Truth (Listing Intelligence Milestone A) — every field
    // nullable/empty until confirmed; the 3 booleans use null (not false)
    // for "unknown" so an unconfirmed fact is never treated as a
    // confirmed no. See src/lib/productTruth.js.
    productFormat: '', blankBrand: '', blankModel: '', garmentColor: '',
    availableColors: [], sizeRange: '', material: '',
    personalizationAvailable: null, customizationAvailable: null, giftWrapAvailable: null,
    productionTime: '', shippingPolicy: '', fulfillmentProvider: '',
    titleStrategy: 'buyer_clear',
  });
  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Candidates for the manual concept-link picker — scoped to the selected
  // collection so the list stays short and relevant; shows everything if no
  // collection is picked yet.
  const { concepts: pickableConcepts } = useConcepts(form.collection || undefined);

  // Populate from product when loaded
  const [existingListing, setExistingListing] = useState(false);
  useEffect(() => {
    if (!product) return;
    setForm(f => ({
      ...f,
      productName:      product.name || '',
      collection:       product.collection || '',
      niche:            product.niche || '',
      emotionalTrigger: product.emotional_trigger || '',
      productFormat: product.product_format || '', blankBrand: product.blank_brand || '',
      blankModel: product.blank_model || '', garmentColor: product.garment_color || '',
      availableColors: product.available_colors || [], sizeRange: product.size_range || '',
      material: product.material || '',
      personalizationAvailable: product.personalization_available ?? null,
      customizationAvailable: product.customization_available ?? null,
      giftWrapAvailable: product.gift_wrap_available ?? null,
      productionTime: product.production_time || '', shippingPolicy: product.shipping_policy || '',
      fulfillmentProvider: product.fulfillment_provider || '',
      // Only overwrite the live 'buyer_clear' default if this product was
      // actually generated under the new taxonomy — a legacy value (or one
      // of the 2 backfilled legacy_* strings) intentionally doesn't match
      // any of the 3 picker options, so the picker just shows none
      // selected rather than silently relabeling old history.
      titleStrategy: product.title_strategy || 'buyer_clear',
    }));
    if (product.concept_id) setLinkedConceptId(product.concept_id);
    if (product.live_title) {
      setEditTitle(product.live_title);
      setExistingListing(true);
    }
    if (product.live_tags) {
      setEditTags(product.live_tags.split(',').map(t => t.trim()).filter(Boolean));
      setExistingListing(true);
    }
  }, [product]);

  // State declared early — all referenced in the draft save/restore effects below
  const [imagePreview, setImagePreview] = useState(null);
  const [imageBase64, setImageBase64]   = useState(null);
  const [imageMediaType, setImageMediaType] = useState('image/png');
  const [analyzing, setAnalyzing]       = useState(false);
  const [imageAnalysis, setImageAnalysis] = useState('');
  const [imageAnalysisError, setImageAnalysisError] = useState('');
  const [selectedSessionIds, setSelectedSessionIds] = useState(new Set());
  const [extraCollections, setExtraCollections] = useState(new Set());
  const [output, setOutput]         = useState(null);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError]     = useState('');
  const [editTitle, setEditTitle]   = useState('');
  const [editTags, setEditTags]     = useState([]);
  const [editDesc, setEditDesc]     = useState({});
  const [editPrompts, setEditPrompts] = useState([]);
  // Listing Intelligence Milestone A — Primary Search Intent replaces the
  // old anchorKeyword. Populated from generation output (like editTitle/
  // editTags), not a pre-generation input the user picks from a B1 pool —
  // the AI proposes it as part of generation, the human stays the backstop
  // by editing it directly afterward, same trust model as title/tags.
  const [primarySearchIntent, setPrimarySearchIntent] = useState('');
  const [primaryIntentStatus, setPrimaryIntentStatus] = useState('');
  const [researchGaps, setResearchGaps] = useState([]);
  const [excludedKeywordsDisplay, setExcludedKeywordsDisplay] = useState([]);
  const [validationWarnings, setValidationWarnings] = useState([]);
  // listing_generations row ids created this session that don't have a real
  // product_id yet (a new listing generates before it's saved) — linked to
  // the real product the moment handleSaveProduct() succeeds.
  const [pendingGenerationIds, setPendingGenerationIds] = useState([]);

  // ── Auto-draft (new listings only) ──────────────────────────────────────────
  const DRAFT_KEY = 'tcc_listing_draft';
  const [draftRestored, setDraftRestored] = useState(false);

  // Restore draft on first load (only for new listings). Skipped entirely
  // when arriving via a concept push — that's a deliberate "start fresh for
  // this concept" action, and an old in-progress draft (already correctly
  // applied via conceptPushData in form's initial state above) shouldn't
  // silently override it.
  useEffect(() => {
    if (productId || conceptPushData) return;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (d.form)          setForm(f => ({ ...f, ...d.form }));
      if (d.imageAnalysis) setImageAnalysis(d.imageAnalysis);
      if (d.imagePreview)  setImagePreview(d.imagePreview);
      if (d.output)        setOutput(d.output);
      if (d.editTitle)     setEditTitle(d.editTitle);
      if (d.editTags)      setEditTags(d.editTags);
      if (d.selectedSessionIds) setSelectedSessionIds(new Set(d.selectedSessionIds));
      setDraftRestored(true);
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Design image half of the concept-push hand-off — the text fields
  // (productName/productType) are already in form's initial state above;
  // this only needs an effect because analysis requires an async call.
  // Deliberately does NOT set collection — that stays blank, a real human
  // choice, not inherited silently from the concept.
  const conceptPushImageAppliedRef = useRef(false);
  useEffect(() => {
    if (!conceptPushData?.imageBase64 || conceptPushImageAppliedRef.current) return;
    conceptPushImageAppliedRef.current = true;
    setImageBase64(conceptPushData.imageBase64);
    setImageMediaType(conceptPushData.imageMediaType || 'image/jpeg');
    setImagePreview(`data:${conceptPushData.imageMediaType || 'image/jpeg'};base64,${conceptPushData.imageBase64}`);
    analyzeImage(conceptPushData.imageBase64, conceptPushData.imageMediaType || 'image/jpeg');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conceptPushData]);

  // Auto-save draft whenever key state changes (new listings only)
  useEffect(() => {
    if (productId) return;
    const draft = {
      form,
      imageAnalysis,
      // imagePreview intentionally excluded — data URIs can be large and persist
      // on shared devices; imageAnalysis text is sufficient to reconstruct context
      output,
      editTitle,
      editTags,
      selectedSessionIds: [...selectedSessionIds],
      savedAt: new Date().toISOString(),
    };
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch {}
  }, [productId, form, imageAnalysis, output, editTitle, editTags, selectedSessionIds]);

  function clearDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch {}
    setDraftRestored(false);
  }
  // ─────────────────────────────────────────────────────────────────────────────

  // Research sessions for the selected collection(s)
  const [sessions, setSessions] = useState([]);
  const [collectionLastVerified, setCollectionLastVerified] = useState(null);

  const allCollectionNames = [form.collection, ...extraCollections].filter(Boolean);

  const GLOBAL_COLLECTIONS = ['Global Keywords', 'General', 'Seasonal'];

  useEffect(() => {
    if (!form.collection) { setSessions([]); setSelectedSessionIds(new Set()); setCollectionLastVerified(null); return; }
    const cols = [...new Set([form.collection, ...extraCollections, ...GLOBAL_COLLECTIONS].filter(Boolean))];
    supabase.from('research_sessions').select('*, keywords(*)')
      .in('collection', cols)
      .then(({ data }) => {
        const rows = data || [];
        setSessions(rows);
        setSelectedSessionIds(new Set(rows.map(s => s.id)));
      });
    supabase.from('collections').select('last_verified').eq('name', form.collection).single()
      .then(({ data }) => setCollectionLastVerified(data?.last_verified || null));
  }, [form.collection, extraCollections]);

  function refetchSessions() {
    if (!form.collection) return;
    const cols = [...new Set([form.collection, ...extraCollections, ...GLOBAL_COLLECTIONS].filter(Boolean))];
    supabase.from('research_sessions').select('*, keywords(*)')
      .in('collection', cols)
      .then(({ data }) => {
        const rows = data || [];
        setSessions(rows);
        setSelectedSessionIds(prev => {
          const next = new Set(prev);
          rows.forEach(s => next.add(s.id));
          return next;
        });
      });
  }

  function toggleSession(id) {
    const session = sessions.find(s => s.id === id);
    if (GLOBAL_COLLECTIONS.includes(session?.collection)) return;
    setSelectedSessionIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const keywordAgedays = collectionLastVerified
    ? Math.floor((Date.now() - new Date(collectionLastVerified).getTime()) / 86400000)
    : null;
  const keywordsStale = keywordAgedays !== null && keywordAgedays >= 20;

  // Flatten + deduplicate keywords from SELECTED sessions only
  const activeSessions = sessions.filter(s => selectedSessionIds.has(s.id));
  const allKeywords = (() => {
    const map = new Map();
    for (const s of activeSessions) {
      // Tag each keyword with whether it came from this listing's own
      // collection(s), vs. a globally-pooled session (General/Global
      // Keywords/Seasonal). Bucket coverage and tags should draw from
      // everything, but the anchor — the phrase that leads the title —
      // should prefer something specific to this listing over a
      // high-volume term that's identical on every other listing too.
      const fromPrimaryCollection = allCollectionNames.includes(s.collection);
      for (const k of (s.keywords || [])) {
        const key = `${k.keyword?.toLowerCase()}|${k.tags_only ? 'tags' : k.tag_type}`;
        const ex = map.get(key);
        if (!ex || (k.score || 0) > (ex.score || 0)) map.set(key, { ...k, _fromPrimaryCollection: fromPrimaryCollection, _source: s.source });
      }
    }
    return [...map.values()];
  })();

  const useKws   = allKeywords.filter(k => k.tag_type === 'use'   && !k.tags_only);
  const watchKws = allKeywords.filter(k => k.tag_type === 'watch' && !k.tags_only);
  const totalUsable = useKws.length + watchKws.length;

  // Playbooks. seo-standards is deliberately no longer fetched/used here —
  // Listing Intelligence Milestone A replaced the old bucket-ordering rules
  // it encoded with generate-listing-v2.js's own prompt; passing that old
  // playbook content through would just reintroduce the rules this rebuild
  // removes. The playbook itself is untouched in Knowledge — just not read
  // by generation anymore.
  const photoPlaybook      = playbooks.find(p => p.slug === 'listing-photos');
  const brandVoicePlaybook = playbooks.find(p => p.slug === 'brand-voice');
  const designPlaybook     = playbooks.find(p => p.slug === 'design-standards');

  const brandVoice     = brandVoicePlaybook?.playbook_sections?.map(s => s.body).join('\n\n') || BRAND_VOICE_FALLBACK;
  const photoStandards = photoPlaybook?.playbook_sections?.map(s => s.body).join('\n\n') || '';
  // Brand-wide style guide (Knowledge → Playbooks → Design Standards) — applies
  // to every listing regardless of collection. Layered with, not replaced by,
  // the collection-specific style guide below.
  const brandStyleGuide = designPlaybook?.playbook_sections?.map(s => s.body).join('\n\n') || '';

  const collectionObj = collectionObjs.find(c => c.name === form.collection);
  const nicheKey = (form.niche || '').toLowerCase();
  const styleGuide = nicheStyleGuides[nicheKey] || collectionObj?.style_guide || '';
  // Occasion/season tag captured on the collection (Halloween, Back to School, …) —
  // exists in the data already but wasn't reaching the generation prompt.
  const season = collectionObj?.season || '';

  // Design image
  const analyzeImage = useCallback(async (base64, mediaType) => {
    setAnalyzing(true);
    setImageAnalysisError('');
    try {
      const res = await fetch('/.netlify/functions/claude-process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'analyze_design_image', payload: { imageBase64: base64, mediaType } }),
      });
      const data = await res.json();
      if (!res.ok) {
        setImageAnalysis('');
        setImageAnalysisError(data.error || `Analysis failed (${res.status})`);
      } else if (data.analysis) {
        setImageAnalysis(data.analysis);
      } else {
        setImageAnalysis('');
        setImageAnalysisError('Analysis returned no result — try again');
      }
    } catch (err) {
      console.error('Image analysis failed:', err);
      setImageAnalysis('');
      setImageAnalysisError('Image analysis failed — check your connection and try again');
    }
    setAnalyzing(false);
  }, []);

  const handleImage = useCallback(async (file) => {
    if (!file) return;
    try {
      const { base64, mediaType } = await resizeImageForUpload(file);
      setImagePreview(`data:${mediaType};base64,${base64}`);
      setImageBase64(base64);
      setImageMediaType(mediaType);
      await analyzeImage(base64, mediaType);
    } catch (err) {
      console.error('Image resize failed:', err);
      setImageAnalysisError('Could not read that image — try a different file');
    }
  }, [analyzeImage]);

  // Ctrl+V paste listener for design image
  useEffect(() => {
    function handlePaste(e) {
      const items = e.clipboardData?.items;
      if (!items) return;
      const active = document.activeElement?.tagName;
      if (active === 'INPUT' || active === 'TEXTAREA') return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) { handleImage(file); break; }
        }
      }
    }
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [handleImage]);

  // Readiness checks
  const readiness = [
    {
      label: `${totalUsable} researched keyword${totalUsable !== 1 ? 's' : ''} available`,
      ok: totalUsable > 0,
      warn: totalUsable === 0,
    },
    {
      label: keywordsStale
        ? `Keywords last verified ${keywordAgedays}d ago — recheck recommended`
        : collectionLastVerified
          ? `Keywords verified ${keywordAgedays === 0 ? 'today' : `${keywordAgedays}d ago`}`
          : 'Keywords never verified',
      ok: collectionLastVerified !== null && !keywordsStale,
      warn: keywordsStale || collectionLastVerified === null,
    },
    {
      // Checks the brand-wide guide (Design Standards playbook), not the
      // collection-specific one — collection-level style guides are deliberately
      // not used, so warning on their absence would fire on every listing forever.
      label: brandStyleGuide ? 'Brand style guide' : 'Brand style guide missing',
      ok: !!brandStyleGuide,
      warn: !brandStyleGuide,
    },
    {
      // Product Truth's product_format is what the deterministic Compatibility
      // Gate checks against — without it, format-incompatible keywords can't
      // be excluded at all (checkFormatCompatibility() returns 'unknown', not
      // 'incompatible', when there's nothing to compare against).
      label: form.productFormat ? `Product format: ${form.productFormat}` : 'Product format not set — compatibility checks disabled',
      ok: !!form.productFormat,
      warn: !form.productFormat,
    },
    {
      label: primarySearchIntent ? `Primary Search Intent: "${primarySearchIntent}"` : 'Not yet generated',
      ok: !!primarySearchIntent,
      warn: false,
    },
    {
      label: analyzing
        ? 'Analyzing image…'
        : imageAnalysis
          ? 'Design image analyzed'
          : (imageAnalysisError || imagePreview) ? 'Image analysis failed — retry' : 'No design image',
      ok: !!imageAnalysis,
      warn: !imageAnalysis,
    },
  ];
  const hasWarnings = readiness.some(r => r.warn);

  async function handleGenerate() {
    if (!form.collection) { setGenError('Please select a collection first.'); return; }
    setGenerating(true);
    setGenError('');
    setOutput(null);
    try {
      // Live re-fetch, not the useConcept() hook's state — guarantees this
      // generation sees any edit made to the concept since it was linked,
      // rather than whatever the hook last happened to have mounted.
      let freshLinkedConcept = null;
      if (linkedConceptId) {
        const { data } = await supabase.from('concepts').select('*').eq('id', linkedConceptId).single();
        freshLinkedConcept = data || null;
      }
      const ctx = buildGenerationContext({ form, keywords: allKeywords, styleGuide, brandStyleGuide, season, brandVoice, photoStandards, imageAnalysis, allCollectionNames, linkedConcept: freshLinkedConcept });
      const res = await fetch('/.netlify/functions/generate-listing-v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: ctx,
          imageBase64: imageBase64 || null,
          mediaType: imageMediaType,
          titleStrategy: form.titleStrategy,
        }),
      });
      const rawText = await res.text();
      let data;
      try {
        data = JSON.parse(rawText);
      } catch {
        setGenError(`HTTP ${res.status} — server returned non-JSON: ${rawText.slice(0, 300)}`);
        setGenerating(false);
        return;
      }
      if (!res.ok || !data.listing) { setGenError(`Generation failed — ${data.error || 'no output returned'}`); setGenerating(false); return; }

      // Sanitize once, at the source, rather than trusting each downstream
      // reader to guard itself — this same object becomes `output` state
      // (setOutput below) and later a saved draft, so every consumer from
      // here on, including the draft-restore path, inherits the fix.
      const listing = {
        ...data.listing,
        tags: asArray(data.listing.tags),
        research_gaps: asArray(data.listing.research_gaps),
        supporting_keywords: asArray(data.listing.supporting_keywords),
        image_prompts: asArray(data.listing.image_prompts),
        validation: { ...data.listing.validation, warnings: asArray(data.listing.validation?.warnings) },
      };
      const warnings = [
        ...asArray(listing.validation?.warnings),
        ...validateGeneratedListing({ listing, productTruth: ctx.productTruth, discussionPermissions: ctx.discussionPermissions, keywordPool: ctx.keywordPool }),
      ];
      setValidationWarnings(warnings);
      setResearchGaps(asArray(listing.research_gaps));
      setExcludedKeywordsDisplay(ctx.excludedKeywords || []);

      const matchedKeyword = listing.primary_intent_matched_keyword
        ? ctx.keywordPool.find(k => k.keyword.trim().toLowerCase() === listing.primary_intent_matched_keyword.trim().toLowerCase())
        : null;
      setPrimarySearchIntent(listing.primary_search_intent || '');
      setPrimaryIntentStatus(listing.primary_intent_status || '');

      // Persist the generation ledger row immediately — before the listing
      // is ever saved as a product. A new listing generates before any
      // product row exists (productId is null throughout drafting), so this
      // inserts with product_id: null and gets linked once handleSaveProduct
      // succeeds (see pendingGenerationIds below) — otherwise every pre-save
      // attempt (comparing a few generations before deciding) would be
      // silently unlogged, losing exactly the history a later phase's
      // learning work would want most.
      const { data: genRow } = await createListingGeneration({
        productId: productId || null,
        generationVersion: GENERATION_VERSION,
        trigger: output ? 'manual_regenerate' : 'initial_generation',
        primarySearchIntent: listing.primary_search_intent,
        primarySearchIntentKeywordId: matchedKeyword?.keywordId || null,
        primaryIntentStatus: listing.primary_intent_status,
        researchSourcesUsed: ctx.researchSourcesUsed,
        researchGaps: asArray(listing.research_gaps),
        productTruthSnapshot: ctx.productTruth,
        discussionPermissions: ctx.discussionPermissions,
        titleStrategy: form.titleStrategy,
        title: listing.title,
        tags: asArray(listing.tags),
        description: listing.description,
        imagePrompts: asArray(listing.image_prompts),
        validationStatus: listing.validation?.status || null,
        validationWarnings: warnings,
        model: data.model,
        inputTokens: data.usage?.input_tokens,
        outputTokens: data.usage?.output_tokens,
        supportingKeywords: asArray(listing.supporting_keywords).map(k => ({
          keyword: k.keyword,
          keywordId: ctx.keywordPool.find(p => p.keyword.trim().toLowerCase() === (k.source_keyword || k.keyword).trim().toLowerCase())?.keywordId || null,
          relevanceCategory: k.relevance_category,
        })),
        excludedKeywords: ctx.excludedKeywords,
      });
      if (genRow?.id && !productId) setPendingGenerationIds(ids => [...ids, genRow.id]);

      setOutput(listing);
    } catch (err) {
      setGenError(err.message);
    }
    setGenerating(false);
  }

  // Save as new product (standalone mode only)
  const [saveStage, setSaveStage]   = useState('Live');
  const [saving, setSaving]         = useState(false);
  const [savedProductId, setSavedProductId] = useState(null);
  const [saveEditsState, setSaveEditsState] = useState('idle');

  // Shared Product Truth + title_strategy field mapping for both save paths
  // below. title_style (the old 2-value column) is deliberately never
  // written by either — it stays untouched historical data; title_strategy
  // is the only field new code writes going forward.
  function productTruthUpdates() {
    return {
      product_format: form.productFormat || null,
      blank_brand: form.blankBrand || null,
      blank_model: form.blankModel || null,
      garment_color: form.garmentColor || null,
      available_colors: form.availableColors?.length ? form.availableColors : null,
      size_range: form.sizeRange || null,
      material: form.material || null,
      personalization_available: form.personalizationAvailable,
      customization_available: form.customizationAvailable,
      gift_wrap_available: form.giftWrapAvailable,
      production_time: form.productionTime || null,
      shipping_policy: form.shippingPolicy || null,
      fulfillment_provider: form.fulfillmentProvider || null,
      title_strategy: form.titleStrategy || 'buyer_clear',
    };
  }

  async function handleSaveEdits() {
    setSaveEditsState('saving');
    const updates = {
      live_title: editTitle || null,
      live_tags: editTags.filter(Boolean).join(', ') || null,
      concept_id: linkedConceptId || null,
      ...productTruthUpdates(),
    };
    if (Object.keys(editDesc).length > 0) {
      updates.generated_description = editDesc;
    }
    if (editPrompts.length > 0) {
      updates.generated_image_prompts = editPrompts;
    }
    await updateProduct(productId, updates);
    setSaveEditsState('saved');
    setTimeout(() => setSaveEditsState('idle'), 2000);
  }

  async function handleSaveProduct() {
    if (!form.productName.trim() || !form.collection) return;
    setSaving(true);
    const { data, error } = await createProduct({
      name:              form.productName.trim(),
      collection:        form.collection,
      niche:             form.niche || null,
      emotional_trigger: form.emotionalTrigger || null,
      stage:             saveStage,
      live_title:        editTitle || null,
      live_tags:         editTags.filter(Boolean).join(', ') || null,
      concept_id:        linkedConceptId || null,
      stage_updated_at:  new Date().toISOString(),
      ...productTruthUpdates(),
      ...(Object.keys(editDesc).length > 0 ? { generated_description: editDesc } : {}),
      ...(editPrompts.length > 0 ? { generated_image_prompts: editPrompts } : {}),
    });
    setSaving(false);
    if (!error && data?.id) {
      setSavedProductId(data.id);
      // Link this session's pre-save generation(s) — logged with
      // product_id: null since no product existed yet at generation time
      // (see handleGenerate) — to the real product that now exists.
      if (pendingGenerationIds.length) {
        await linkGenerationsToProduct(pendingGenerationIds, data.id);
        setPendingGenerationIds([]);
      }
      clearDraft();
    }
  }

  // Editable output state (initialized from generated output). Also covers
  // the draft-restore path (a refreshed browser tab sets `output` directly
  // from localStorage, bypassing handleGenerate) — redundant-but-harmless
  // when coming from handleGenerate, which already sets these directly.
  useEffect(() => {
    if (!output) return;
    setEditTitle(output.title || '');
    setEditTags(asArray(output.tags).map(t => t));
    setEditDesc(output.description ? { ...output.description } : {});
    setEditPrompts(asArray(output.image_prompts).map(p => ({ ...p })));
    if (output.primary_search_intent) setPrimarySearchIntent(output.primary_search_intent);
    if (output.primary_intent_status) setPrimaryIntentStatus(output.primary_intent_status);
    if (output.research_gaps) setResearchGaps(asArray(output.research_gaps));
    if (output.title && !form.productName) setField('productName', output.title);
  }, [output]);

  const isLoading = productId && productLoading;

  if (isLoading) {
    return <div className="page"><div style={{ color: 'var(--charcoal-soft)', padding: 32 }}>Loading product…</div></div>;
  }

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate(productId ? `/products/${productId}` : '/products')}>
            ← Back
          </button>
          <div className="page-title">Listing Builder</div>
        </div>
        {product && (
          <div style={{ fontSize: '0.78rem', color: 'var(--charcoal-soft)', marginTop: 4 }}>
            {product.name}
          </div>
        )}
      </div>

      {/* Draft restored banner */}
      {draftRestored && !productId && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'rgba(var(--dusty-rose-rgb, 188,100,90), 0.08)',
          border: '1px solid rgba(188,100,90,0.25)',
          borderRadius: 4, padding: '8px 14px', marginBottom: 12,
          fontSize: '0.78rem', color: 'var(--charcoal-soft)',
        }}>
          <span>Draft restored — your previous work is back.</span>
          <button type="button" onClick={clearDraft}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.72rem', color: 'var(--charcoal-soft)', opacity: 0.5 }}>
            Discard draft
          </button>
        </div>
      )}

      {/* ── PRODUCT CONTEXT ─────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="eyebrow" style={{ marginBottom: 12 }}>Product Context</div>

        {/* Row 1: Product Type */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Product Name <span style={{ fontWeight: 400, opacity: 0.5 }}>(auto-fills from title)</span></label>
            <input value={form.productName} onChange={e => setField('productName', e.target.value)} placeholder="e.g. Animal Meme Crewneck" />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Product Type <span style={{ fontWeight: 400, opacity: 0.5 }}>(free text, for your own reference)</span></label>
            <input value={form.productType} onChange={e => setField('productType', e.target.value)} placeholder="e.g. crewneck sweatshirt, tote bag, mug" />
          </div>
        </div>

        {/* ── PRODUCT TRUTH — Listing Intelligence Milestone A ──────────
            The thing keyword data may never override. product_format is
            what the deterministic Compatibility Gate checks every keyword
            against before generation — this is what stops another "hockey
            mom sweatshirt on a T-shirt" from happening. Unset fields stay
            unset; nothing here is ever inferred. */}
        <ProductTruthSection form={form} setField={setField} />

        {/* Row 2: Collection chips from DB */}
        <CollectionPicker
          collections={collections}
          collectionObjects={collectionObjs}
          chapters={chapters}
          value={form.collection}
          onChange={v => { setField('collection', v); setExtraCollections(new Set()); }}
          extraValues={extraCollections}
          onExtraChange={setExtraCollections}
          onCreated={c => { setField('collection', c); refetchCollections?.(); refetchCollectionObjs?.(); }}
        />

        {/* Research session picker */}
        {sessions.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <label className="form-label" style={{ margin: 0 }}>Research Sessions</label>
              <button type="button" onClick={() => setSelectedSessionIds(new Set(sessions.map(s => s.id)))}
                style={{ fontSize: '0.65rem', color: 'var(--charcoal-soft)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                all
              </button>
              <button type="button" onClick={() => setSelectedSessionIds(new Set())}
                style={{ fontSize: '0.65rem', color: 'var(--charcoal-soft)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                none
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {sessions.map(s => {
                const kwCount = (s.keywords || []).filter(k => !k.tags_only && k.tag_type !== 'discard').length;
                const b1kws = (s.keywords || []).filter(k => k.bucket === 1);
                const b1count = b1kws.length;
                const b1Tooltip = b1kws.length > 0 ? `B1 keywords: ${b1kws.slice(0, 5).map(k => k.keyword).join(', ')}${b1kws.length > 5 ? ` +${b1kws.length - 5} more` : ''}` : '';
                const isGlobal = GLOBAL_COLLECTIONS.includes(s.collection);
                const isSelected = selectedSessionIds.has(s.id);
                return (
                  <div key={s.id}
                    onClick={() => !isGlobal && toggleSession(s.id)}
                    title={b1Tooltip || undefined}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
                      borderRadius: 4, cursor: isGlobal ? 'default' : 'pointer',
                      background: isGlobal ? 'rgba(120,140,200,0.08)' : isSelected ? 'rgba(124,175,138,0.1)' : 'var(--charcoal-faint)',
                      border: `1px solid ${isGlobal ? 'rgba(120,140,200,0.25)' : isSelected ? 'rgba(124,175,138,0.3)' : 'transparent'}`,
                    }}>
                    {isGlobal
                      ? <span
                          title={`Always included — "${s.collection}" is a pooled collection whose keywords apply to every listing, not just this one. No checkbox because it can't be turned off here.`}
                          style={{ fontSize: '0.6rem', color: '#1e306b', background: 'rgba(120,140,200,0.2)', padding: '1px 5px', borderRadius: 8, fontWeight: 600, flexShrink: 0, cursor: 'help' }}
                        >GLOBAL</span>
                      : <input type="checkbox" checked={isSelected} readOnly style={{ width: 'auto', margin: 0, flexShrink: 0, pointerEvents: 'none' }} />
                    }
                    <span style={{ fontSize: '0.75rem', fontWeight: 500 }}>{s.niche || s.collection}</span>
                    <span style={{ fontSize: '0.68rem', color: 'var(--charcoal-soft)' }}>{s.date} · {s.source}</span>
                    <span style={{ fontSize: '0.68rem', color: 'var(--charcoal-soft)', marginLeft: 'auto' }}>
                      {kwCount} kw{b1count > 0 && <span style={{ color: '#2d6b3c', fontWeight: 600 }}> · {b1count} B1</span>}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Primary Search Intent — replaces the old B1 anchor picker.
            Proposed by generation itself (see handleGenerate), not picked
            from a bucket pool beforehand — the human stays the backstop by
            editing it directly here afterward, same trust model as the
            title/tags fields below. */}
        {(primarySearchIntent || output) && (
          <div style={{ marginBottom: 12 }}>
            <label className="form-label">
              Primary Search Intent
              {primaryIntentStatus && (
                <span style={{
                  marginLeft: 8, fontSize: '0.65rem', padding: '1px 7px', borderRadius: 10, textTransform: 'capitalize',
                  background: primaryIntentStatus === 'validated' ? 'rgba(124,175,138,0.2)' : primaryIntentStatus === 'supported' ? 'rgba(232,168,124,0.2)' : 'rgba(43,41,38,0.08)',
                  color: primaryIntentStatus === 'validated' ? '#2d6b3c' : primaryIntentStatus === 'supported' ? '#7a4a1e' : 'var(--charcoal-soft)',
                }}>
                  {primaryIntentStatus}
                </span>
              )}
            </label>
            <input value={primarySearchIntent} onChange={e => { setPrimarySearchIntent(e.target.value); setPrimaryIntentStatus(''); }}
              style={{ fontSize: '0.82rem' }} placeholder="Generated after you click Generate Listing — editable" />
          </div>
        )}

        {/* Sub-niche + Notes */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Sub-niche <span style={{ fontWeight: 400, opacity: 0.5 }}>(optional)</span></label>
            <input value={form.niche} onChange={e => setField('niche', e.target.value)} placeholder="e.g. 90s Nostalgia, Animal Memes" />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Notes <span style={{ fontWeight: 400, opacity: 0.5 }}>(optional)</span></label>
            <input value={form.notes} onChange={e => setField('notes', e.target.value)} placeholder="Design direction, specific angle, etc." />
          </div>
        </div>

        {/* Title Strategy — replaces the old 2-value Title Style toggle.
            Only the 3 live strategies are ever offered as buttons here;
            legacy_keyword_rich/legacy_short_clean exist only as backfilled
            historical values on older products (see the migration) and are
            deliberately not selectable — clicking a button can never land on
            one, and loading an old product doesn't silently relabel its
            value into a live choice. But the value must still remain
            *readable* (Kristen's explicit requirement) rather than just
            showing 3 unhighlighted buttons with no indication anything
            historical is even set — the note below covers that. */}
        <div style={{ marginTop: 12 }}>
          <label className="form-label">
            Title Strategy <span style={{ fontWeight: 400, opacity: 0.5 }}>— saved with the listing so you can compare performance later</span>
          </label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
            {TITLE_STRATEGIES.map(opt => {
              const active = form.titleStrategy === opt.key;
              return (
                <button key={opt.key} type="button"
                  onClick={() => setField('titleStrategy', opt.key)}
                  style={{
                    fontSize: '0.72rem', padding: '4px 10px', borderRadius: 20, cursor: 'pointer',
                    background: active ? 'rgba(124,175,138,0.9)' : 'rgba(124,175,138,0.12)',
                    color: active ? '#fff' : '#2d6b3c',
                    border: `1px solid rgba(124,175,138,${active ? '0.9' : '0.3'})`,
                    fontWeight: active ? 600 : 400,
                  }}>
                  {opt.label}
                </button>
              );
            })}
          </div>
          {form.titleStrategy && LEGACY_TITLE_STRATEGY_LABELS[form.titleStrategy] && (
            <div style={{ fontSize: '0.72rem', opacity: 0.6, marginTop: 4 }}>
              Current: {LEGACY_TITLE_STRATEGY_LABELS[form.titleStrategy]} (legacy — historical value, not selectable above; pick a strategy to replace it)
            </div>
          )}
        </div>

        {/* Linked Concept (Phase 10) */}
        <div style={{ marginTop: 12 }}>
          <label className="form-label">
            Linked Concept <span style={{ fontWeight: 400, opacity: 0.5 }}>— design direction, visual style, and mood get pulled into generation</span>
          </label>
          {linkedConcept ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
              <span style={{
                fontSize: '0.72rem', padding: '4px 10px', borderRadius: 20,
                background: 'rgba(124,175,138,0.12)', color: '#2d6b3c',
                border: '1px solid rgba(124,175,138,0.3)',
              }}>
                🔗 {linkedConcept.name}
              </span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setLinkedConceptId(null)}>
                Unlink
              </button>
            </div>
          ) : pickableConcepts.length > 0 ? (
            <select
              value=""
              onChange={e => { if (e.target.value) setLinkedConceptId(e.target.value); }}
              style={{ marginTop: 4, fontSize: '0.78rem' }}
            >
              <option value="">— None —</option>
              {pickableConcepts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          ) : (
            <div style={{ fontSize: '0.75rem', color: 'var(--charcoal-soft)', marginTop: 4 }}>
              {form.collection ? 'No concepts found for this collection.' : 'Select a collection to see linkable concepts.'}
            </div>
          )}
        </div>
      </div>

      {/* ── DESIGN IMAGE ────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="eyebrow" style={{ marginBottom: 12 }}>Design Image</div>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          {imagePreview && (
            <img
              src={imagePreview}
              alt="Design mockup"
              style={{ width: 120, height: 120, objectFit: 'contain', borderRadius: 4, border: '1px solid rgba(43,41,38,0.12)', background: '#f5f3f0', flexShrink: 0 }}
            />
          )}
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>
                {imagePreview ? 'Replace image' : 'Upload mockup'}
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { if (e.target.files[0]) handleImage(e.target.files[0]); }} />
              </label>
              {!imagePreview && (
                <span style={{ fontSize: '0.75rem', color: 'var(--charcoal-soft)', alignSelf: 'center' }}>
                  or Ctrl+V to paste a Snip Tool screenshot
                </span>
              )}
            </div>
            {analyzing && (
              <div style={{ fontSize: '0.8rem', color: 'var(--charcoal-soft)' }}>Analyzing design…</div>
            )}
            {imageAnalysisError && !analyzing && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.8rem', color: 'var(--alert)' }}>
                <span>⚠ {imageAnalysisError}</span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => analyzeImage(imageBase64, imageMediaType)}>
                  Retry
                </button>
              </div>
            )}
            {imageAnalysis && !analyzing && (
              <div>
                <div style={{ fontSize: '0.65rem', color: 'var(--charcoal-soft)', marginBottom: 4, opacity: 0.6 }}>
                  AI analysis — edit if anything is wrong
                </div>
                <textarea
                  value={imageAnalysis}
                  onChange={e => setImageAnalysis(e.target.value)}
                  rows={4}
                  style={{ width: '100%', fontSize: '0.78rem', lineHeight: 1.6, borderLeft: '3px solid var(--dusty-rose)', borderRadius: '0 4px 4px 0', padding: '8px 12px', resize: 'vertical', boxSizing: 'border-box', background: 'var(--warm-white)', border: '1px solid rgba(43,41,38,0.12)' }}
                />
              </div>
            )}
            {!imagePreview && !analyzing && (
              <div style={{ fontSize: '0.75rem', color: 'var(--charcoal-soft)', opacity: 0.6 }}>
                Upload your Printify mockup — Claude will analyze the style and colors for better copy.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── RESEARCH READINESS ──────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="eyebrow" style={{ marginBottom: 10 }}>Research Readiness</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {readiness.map((r, i) => (
            <span
              key={i}
              style={{
                fontSize: '0.75rem',
                padding: '4px 10px',
                borderRadius: 20,
                background: r.ok ? 'rgba(124,175,138,0.15)' : 'rgba(232,168,124,0.15)',
                color: r.ok ? '#3d6b4a' : '#7a4a1e',
                border: `1px solid ${r.ok ? 'rgba(124,175,138,0.3)' : 'rgba(232,168,124,0.3)'}`,
              }}
            >
              {r.ok ? '✓' : '⚠'} {r.label}
            </span>
          ))}
        </div>
        {hasWarnings && (
          <div style={{ fontSize: '0.72rem', color: 'var(--charcoal-soft)', marginTop: 8 }}>
            Generation is never blocked by thin research — these are things worth checking, not requirements.
          </div>
        )}
      </div>
      {/* Bucket Coverage removed (Listing Intelligence Milestone A) — buckets
          are research metadata now, not a generation gate; this block's
          entire purpose was explaining a hard block that no longer exists.
          Bucket display stays exactly as-is in Research/KeywordDetail. */}

      {/* ── INLINE KEYWORD ADD ──────────────────────────────────── */}
      {form.collection && <InlineKeywordAdd collection={form.collection} sessions={sessions} onSaved={refetchSessions} />}

      {/* ── GENERATE BUTTON ─────────────────────────────────────── */}
      {!output && !existingListing && (
        <div style={{ marginBottom: 24 }}>
          <button
            className="btn btn-primary"
            style={{ width: '100%', padding: '14px', fontSize: '1rem' }}
            onClick={handleGenerate}
            disabled={generating || !form.collection}
          >
            {generating ? 'Generating listing…' : '✦ Generate Listing'}
          </button>
          {!form.collection && (
            <div style={{ fontSize: '0.75rem', color: 'var(--charcoal-soft)', textAlign: 'center', marginTop: 6 }}>
              Select a collection to enable generation
            </div>
          )}
          {genError && (
            <div style={{ fontSize: '0.8rem', color: '#c97b7b', marginTop: 8, padding: '8px 12px', background: 'rgba(201,123,123,0.1)', borderRadius: 4 }}>
              {genError}
            </div>
          )}
        </div>
      )}

      {/* ── OUTPUT ──────────────────────────────────────────────── */}
      {(output || existingListing) && (
        <div>
          {/* Regenerate / action buttons */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' }}>
            {output && <button className="btn btn-ghost btn-sm" onClick={() => { setOutput(null); setExistingListing(false); }}>← Edit setup</button>}
            <button className="btn btn-primary btn-sm" onClick={handleGenerate} disabled={generating || !form.collection}>
              {generating ? 'Generating…' : output ? '↺ Regenerate' : '✦ Generate New Version'}
            </button>
            {genError && (
              <span style={{ fontSize: '0.75rem', color: '#c97b7b' }}>{genError}</span>
            )}
          </div>

          {/* Existing listing notice */}
          {existingListing && !output && (
            <div style={{ background: 'rgba(43,41,38,0.04)', border: '1px solid rgba(43,41,38,0.1)', borderRadius: 4, padding: '10px 14px', marginBottom: 20, fontSize: '0.78rem', color: 'var(--charcoal-soft)' }}>
              Showing your current live listing. Make edits directly, patch keywords below, or generate a new version above.
            </div>
          )}

          {/* Validation warnings — the deterministic post-generation checks
              (format re-check, unsupported-claim scan, validated-status
              verification, tag/title mechanics) plus whatever the AI itself
              flagged. Never blocks the result; review before publishing. */}
          {validationWarnings.length > 0 && (
            <div style={{ background: 'rgba(201,123,123,0.08)', border: '1px solid rgba(201,123,123,0.25)', borderRadius: 4, padding: '10px 14px', marginBottom: 20 }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#8b3a3a', marginBottom: 6 }}>Review Before Publishing</div>
              {validationWarnings.map((w, i) => (
                <div key={i} style={{ fontSize: '0.78rem', color: '#8b3a3a', lineHeight: 1.6 }}>⚠ {w}</div>
              ))}
            </div>
          )}

          {/* Research Gaps — severity-styled (critical / research_opportunity /
              optional_test), replaces the old flat research_flags string list. */}
          {researchGaps.length > 0 && (
            <div style={{ background: 'rgba(232,168,124,0.1)', border: '1px solid rgba(232,168,124,0.3)', borderRadius: 4, padding: '10px 14px', marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#7a4a1e' }}>Research Gaps</div>
                <SaveFlagsButton flags={researchGaps} productId={productId || savedProductId} />
              </div>
              {researchGaps.map((g, i) => (
                <div key={i} style={{ fontSize: '0.78rem', color: g.severity === 'critical' ? '#8b3a3a' : '#7a4a1e', lineHeight: 1.6 }}>
                  <span style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', marginRight: 6 }}>{g.severity?.replace(/_/g, ' ')}</span>
                  {g.message}
                </div>
              ))}
            </div>
          )}

          {/* Excluded Keywords — format-incompatible keywords the
              deterministic Compatibility Gate removed before generation ever
              saw them, shown with why, so a thin-looking keyword pool has a
              visible explanation instead of just looking sparse. */}
          {excludedKeywordsDisplay.length > 0 && (
            <details style={{ marginBottom: 20 }}>
              <summary style={{ fontSize: '0.75rem', color: 'var(--charcoal-soft)', cursor: 'pointer' }}>
                {excludedKeywordsDisplay.length} keyword{excludedKeywordsDisplay.length !== 1 ? 's' : ''} excluded — view
              </summary>
              <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
                {excludedKeywordsDisplay.map((k, i) => (
                  <div key={i} style={{ fontSize: '0.75rem', color: 'var(--charcoal-soft)' }}>
                    <strong>{k.keyword}</strong> — {k.reason}
                  </div>
                ))}
              </div>
            </details>
          )}

          {/* Keyword patch panel — show whenever we have a listing (new or existing) */}
          {(editTitle || editTags.length > 0) && (
            <KeywordPatchPanel
              currentPrimaryIntent={primarySearchIntent}
              currentPrimaryIntentStatus={primaryIntentStatus}
            />
          )}

          {/* Save edits back to product — linked mode only */}
          {productId && (editTitle || editTags.length > 0) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <button
                className="btn btn-primary btn-sm"
                onClick={handleSaveEdits}
                disabled={saveEditsState === 'saving'}
              >
                {saveEditsState === 'saving' ? 'Saving…' : saveEditsState === 'saved' ? '✓ Saved' : 'Save edits to product →'}
              </button>
              <span style={{ fontSize: '0.72rem', color: 'var(--charcoal-soft)' }}>Writes title + tags to live listing record</span>
            </div>
          )}

          {/* Save as new product — standalone only */}
          {!productId && (
            <div style={{ background: 'var(--warm-white)', border: '1px solid rgba(43,41,38,0.12)', borderRadius: 4, padding: '14px 16px', marginBottom: 20 }}>
              <div className="eyebrow" style={{ marginBottom: 10 }}>Save as New Product</div>
              {savedProductId ? (
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span style={{ fontSize: '0.82rem', color: '#3d6b4a' }}>✓ Saved</span>
                  <button className="btn btn-primary btn-sm" onClick={() => navigate(`/products/${savedProductId}`)}>
                    Open Product →
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <select
                    value={saveStage}
                    onChange={e => setSaveStage(e.target.value)}
                    style={{ width: 'auto', fontSize: '0.82rem' }}
                  >
                    {STAGES.filter(s => !['Killed', 'Paused'].includes(s)).map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={handleSaveProduct}
                    disabled={saving || !form.productName.trim() || !form.collection}
                  >
                    {saving ? 'Saving…' : 'Save as New Product →'}
                  </button>
                  {(!form.productName.trim() || !form.collection) && (
                    <span style={{ fontSize: '0.72rem', color: 'var(--charcoal-soft)' }}>
                      Requires product name + collection
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Title */}
          <SectionHeader title="Title" />
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <input
                value={editTitle}
                onChange={e => setEditTitle(e.target.value)}
                style={{ width: '100%', fontSize: '0.9rem', fontFamily: 'var(--font-display)' }}
                maxLength={140}
              />
              <div style={{ fontSize: '0.7rem', color: editTitle.length > 130 ? '#c97b7b' : 'var(--charcoal-soft)', marginTop: 4 }}>
                {editTitle.length}/140 characters
              </div>
            </div>
            <CopyButton text={editTitle} />
          </div>

          {/* Tags */}
          <SectionHeader title={`Tags (${editTags.length}/13)`} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
            <CopyButton text={editTags.join(', ')} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 6 }}>
            {editTags.map((tag, i) => {
              const len = tag.length;
              const countColor = len === 20 ? '#c97b7b' : len >= 17 ? '#E8A87C' : 'var(--charcoal-soft)';
              return (
                <div key={i} style={{ position: 'relative' }}>
                  <input
                    value={tag}
                    onChange={e => { const t = [...editTags]; t[i] = e.target.value; setEditTags(t); }}
                    style={{ width: '100%', fontSize: '0.78rem', paddingRight: 28 }}
                    maxLength={20}
                    placeholder={`Tag ${i + 1}`}
                  />
                  <span style={{
                    position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                    fontSize: '0.6rem', color: countColor, fontWeight: 600, pointerEvents: 'none',
                  }}>{len}</span>
                </div>
              );
            })}
            {editTags.length < 13 && (
              <button className="btn btn-ghost btn-sm" onClick={() => setEditTags(t => [...t, ''])}>+ Add tag</button>
            )}
          </div>

          {/* Description */}
          <SectionHeader title="Description" />
          {Object.entries(DESC_META).map(([key, meta]) => (
            <div key={key} style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <div>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--charcoal-soft)' }}>
                    {meta.label}
                  </span>
                  <span style={{ fontSize: '0.68rem', color: 'var(--charcoal-soft)', opacity: 0.7, marginLeft: 8 }}>
                    {meta.hint}
                  </span>
                </div>
                <CopyButton text={editDesc[key] || ''} />
              </div>
              <textarea
                value={editDesc[key] || ''}
                onChange={e => setEditDesc(d => ({ ...d, [key]: e.target.value }))}
                rows={key === 'opener' ? 3 : 2}
                style={{ width: '100%', fontSize: '0.85rem', lineHeight: 1.6 }}
              />
            </div>
          ))}
          <div style={{ marginBottom: 8 }}>
            <CopyButton text={Object.entries(DESC_META).map(([k, m]) => `${m.label.toUpperCase()}\n${editDesc[k] || ''}`).join('\n\n')} />
            <span style={{ fontSize: '0.72rem', color: 'var(--charcoal-soft)', marginLeft: 8 }}>Copy all sections</span>
          </div>
          <div style={{ marginBottom: 16 }}>
            <CopyButton text={[
              `TITLE\n${editTitle}`,
              `TAGS\n${editTags.filter(Boolean).join(', ')}`,
              ...Object.entries(DESC_META).map(([k, m]) => `${m.label.toUpperCase()}\n${editDesc[k] || ''}`),
            ].join('\n\n')} />
            <span style={{ fontSize: '0.72rem', color: 'var(--charcoal-soft)', marginLeft: 8 }}>Copy full listing</span>
          </div>

          {/* Image Prompts */}
          {editPrompts.length > 0 && <SectionHeader title="ChatGPT Image Prompts" />}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {editPrompts.map((p, i) => (
              <div key={i} style={{ background: 'var(--warm-white)', borderRadius: 4, padding: '12px 14px', border: '1px solid rgba(43,41,38,0.08)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--charcoal-soft)' }}>
                    {p.slot}. {p.type}
                  </div>
                  <CopyButton text={p.prompt} />
                </div>
                <textarea
                  value={p.prompt}
                  onChange={e => {
                    const arr = [...editPrompts];
                    arr[i] = { ...arr[i], prompt: e.target.value };
                    setEditPrompts(arr);
                  }}
                  rows={3}
                  style={{ width: '100%', fontSize: '0.82rem', lineHeight: 1.6 }}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
