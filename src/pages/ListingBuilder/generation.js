import { checkFormatCompatibility, checkBrandMention, computeDiscussionPermissions } from '../../lib/productTruth';
import { intentAdvisory } from '../../data/searchIntents';
import { resolveEffectiveProductTruth } from '../../lib/storePolicies';

// Turns form state into the canonical Product Truth object -- the thing
// that overrides everything else. Every field nullable; unset stays
// unset, never inferred. See src/lib/productTruth.js's header for why
// this exists (Listing Intelligence Milestone A).
export function buildProductTruth(form) {
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
export function buildGenerationContext({ form, keywords, styleGuide, brandStyleGuide, season, brandVoice, photoStandards, imageAnalysis, allCollectionNames, linkedConcept, approvedPolicies }) {
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
  //
  // rawProductTruth is the product's own confirmed facts only — untouched,
  // and what gets saved as listing_generations.product_truth_snapshot (the
  // Product Truth object exactly as Milestone A defined it). productTruth
  // below is the *effective* object — rawProductTruth with any still-unset
  // policy-eligible field filled from an approved store policy (Milestone
  // C1, see src/lib/storePolicies.js) — and is what computeDiscussionPermissions,
  // the compatibility gate, and the AI prompt itself all see from here on.
  // Resolving before the permission check (not after) is what guarantees a
  // policy can never grant permission to discuss a topic without also
  // supplying the fact — see storePolicies.js's own header for why that
  // matters. generate-listing-v2.js needs no changes for this: it already
  // renders whatever context.productTruth contains.
  const rawProductTruth = buildProductTruth(form);
  const { effective: productTruth, sources: productTruthSources } = resolveEffectiveProductTruth(rawProductTruth, approvedPolicies || []);
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
  // §7's ordering: niche relevance, then SEARCH INTENT, then product match,
  // then season, and only then bucket/opportunity analysis. Product match is
  // the hard gate above — it is binary and safety-critical, and it is the bug
  // Milestone A exists to prevent. Intent and season are carried as ANNOTATIONS
  // rather than filters, deliberately: §13 warns against rigid automatic rules
  // here without testing, and unlike format there is no objectively wrong
  // answer — a Gift-intent term on a self-purchase listing is often exactly
  // right. The model is told what each keyword is for and why a term might not
  // fit; it is not silently denied the term.
  //
  // Keywords with no intent set carry none, which is honest: 0 of 660 are
  // classified today, and inventing one would be exactly the fabricated
  // classification §40 rules out.
  const keywordPool = compatibleKeywords.map(k => ({
    keyword: k.keyword, keywordId: k.id, volume: k.volume ?? null, competition: k.competition ?? null,
    score: k.score ?? null, source: k._source || null, bucket: k.bucket ?? null,
    searchIntent: k.search_intent || null,
    intentNote: k.search_intent
      ? intentAdvisory(k.search_intent, { isSeasonalListing: !!season })
      : null,
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
    productTruth, rawProductTruth, productTruthSources, discussionPermissions, keywordPool, excludedKeywords, researchSourcesUsed,
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
export function asArray(v) {
  return Array.isArray(v) ? v : [];
}

// Pure diff against the generation `output` came from — data-loss
// prevention for Zone 4's Regenerate guard and KeywordEvidencePanel's
// "Regenerate listing" action (Milestone B), shared so both use the same
// predicate rather than two implementations that could drift. A field
// that was never touched compares equal and never trips the guard.
export function hasUnsavedEdits({ editTitle, editTags, editDesc, editPrompts, output }) {
  if (!output) return false;
  if (editTitle !== (output.title || '')) return true;
  const outputTags = asArray(output.tags);
  if (editTags.length !== outputTags.length || editTags.some((t, i) => t !== outputTags[i])) return true;
  const outputDesc = output.description || {};
  const descKeys = new Set([...Object.keys(editDesc || {}), ...Object.keys(outputDesc)]);
  for (const k of descKeys) {
    if ((editDesc?.[k] || '') !== (outputDesc[k] || '')) return true;
  }
  const outputPrompts = asArray(output.image_prompts);
  if (editPrompts.length !== outputPrompts.length) return true;
  if (editPrompts.some((p, i) => p.prompt !== outputPrompts[i]?.prompt)) return true;
  return false;
}

// Defense-in-depth checks re-run against the AI's actual output, on top of
// (not instead of) the deterministic pre-filter and permission-based
// prompt instructions upstream — catches the case where free-text
// generation undoes upstream safety despite clean inputs. Never blocks the
// result; returns warnings for the user to review.
export function validateGeneratedListing({ listing, productTruth, discussionPermissions, keywordPool }) {
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

// Milestone C2 — reconstructs the exact shape handleGenerate's own
// sanitize step produces for `output` (index.jsx), but from a stored
// listing_generations row instead of a fresh API response. Powers
// restoring a past version: setOutput(buildOutputFromGeneration(row))
// feeds the same "output changed" effect a fresh generation already
// triggers, so editTitle/editTags/editDesc/editPrompts/primarySearchIntent/
// primaryIntentStatus/researchGaps all populate for free, with zero new
// effect logic. Writes nothing to the database -- this is a pure shape
// transform, called only from a client-side restore action.
//
// Column-name translation: the row stores validation as two flat columns
// (validation_status/validation_warnings); `output` nests them under
// `validation: {status, warnings}`. supporting_keywords is rebuilt from
// the child listing_generation_keywords rows (role: 'supporting'),
// renaming keyword_text -> keyword to match what ResearchEvidence.jsx
// actually reads. Known, accepted gap: reconstructed entries never carry
// `.confidence` (an AI-response-only field never persisted to that child
// table) -- ConfidenceBadge already renders nothing for a missing
// confidence, same as any other gap in that data.
export function buildOutputFromGeneration(generation) {
  return {
    title: generation.title || '',
    tags: asArray(generation.tags),
    description: generation.description || {},
    image_prompts: asArray(generation.image_prompts),
    primary_search_intent: generation.primary_search_intent || '',
    primary_intent_status: generation.primary_intent_status || '',
    research_gaps: asArray(generation.research_gaps),
    validation: {
      status: generation.validation_status || null,
      warnings: asArray(generation.validation_warnings),
    },
    supporting_keywords: (generation.listing_generation_keywords || [])
      .filter(k => k.role === 'supporting')
      .map(k => ({ keyword: k.keyword_text, relevance_category: k.relevance_category })),
  };
}

// Milestone C2 — the same three-field derivation the existing-product
// hydration effect (index.jsx) already computes from the latest ledger
// row, lifted out verbatim so a second caller (restoring an OLDER row,
// also Milestone C2) doesn't grow a second, potentially-drifting copy of
// this transformation. Deliberately does NOT cover primary_search_intent/
// primary_intent_status/research_gaps -- those flow through
// buildOutputFromGeneration -> setOutput -> the existing "output changed"
// effect instead, which already handles them.
export function extractHistoryDisplay(generation) {
  return {
    validationWarnings: asArray(generation?.validation_warnings),
    researchSourcesUsed: asArray(generation?.research_sources_used),
    excludedKeywordsDisplay: (generation?.listing_generation_keywords || [])
      .filter(k => k.role === 'excluded')
      .map(k => ({ keyword: k.keyword_text, reason: k.exclusion_reason })),
  };
}
