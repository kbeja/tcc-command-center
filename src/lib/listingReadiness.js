// ─── Listing Readiness — Zone 4 rollup (Milestone B) ───────────────────────
// Pure, deterministic, no AI/DB calls — same house style as listingSEO.js's
// computeListingSEOStatus/rollupStatus. This is a UI consolidation only: it
// takes values Milestone A already produces (keyword pool size/freshness,
// primaryIntentStatus, excluded-keyword count, validationWarnings,
// researchGaps, the AI's own validation.status) and rolls them into one
// headline + five dimension rows. It never re-runs the compatibility gate
// or validateGeneratedListing, and it never invents a new check.

export const READINESS_HEADLINES = ['not_generated', 'ready', 'ready_with_caution', 'needs_research'];
const HEADLINE_RANK = { ready: 0, ready_with_caution: 1, needs_research: 2 };

// Five dimensions, each 'ok' | 'caution' | 'attention' | 'pending'. Only
// Product Truth and Evidence can ever reach 'attention' — Search Intent and
// Generation Validation are capped at 'caution' by design (an Unvalidated
// intent or a deterministic warning can still generate and publish; see
// each dimension below for why), and Compatibility never scores anything
// beyond 'ok'/'pending' at all, to avoid double-counting a problem that
// Product Truth or Generation Validation already surfaces on its own.
function buildDimensions({
  hasGenerated, productFormat, primarySearchIntent, primaryIntentStatus,
  usableKeywordCount, keywordsStale, researchGaps, excludedKeywordCount, validationWarnings,
  // Phase 6 — Listing Search Setup (§13, §24). All optional: a caller that
  // passes none of them gets exactly the five original dimensions, so every
  // existing call site keeps its previous behaviour.
  etsyCategory, etsyCategoryConfirmed, etsyAttributes, etsyAttributesComplete,
  heroImageApproved, title, tags,
}) {
  const dimensions = [];

  // Product Truth — attention only if product_format is unset, since the
  // compatibility gate is fully inert without it (the exact class of bug
  // Milestone A exists to prevent). Deliberately no caution tier for other
  // unset-but-optional fields: Milestone A treats "unset" as deliberate
  // silence, not a defect, and this dimension only ever looks at
  // product_format — nothing else it could see would move it.
  dimensions.push({
    key: 'product_truth',
    state: productFormat ? 'ok' : 'attention',
    detail: productFormat
      ? `Product format: ${productFormat}`
      : "Product format not set — the compatibility gate can't check any keyword against it until this is set.",
  });

  // Search Intent — ok only if validated; caution for supported/
  // unvalidated/edited-since-validation (empty status with an intent
  // already set); pending pre-generation. Never attention — a Supported or
  // Unvalidated intent may still generate and publish with Ready with
  // Caution.
  let searchIntentState, searchIntentDetail;
  if (!hasGenerated) {
    searchIntentState = 'pending';
    searchIntentDetail = 'Not yet generated.';
  } else if (primaryIntentStatus === 'validated') {
    searchIntentState = 'ok';
    searchIntentDetail = `"${primarySearchIntent}" — validated against real research.`;
  } else if (primaryIntentStatus === 'supported' || primaryIntentStatus === 'unvalidated') {
    searchIntentState = 'caution';
    searchIntentDetail = `"${primarySearchIntent}" — ${primaryIntentStatus}, not yet validated. Can still generate and publish with caution.`;
  } else {
    searchIntentState = 'caution';
    searchIntentDetail = primarySearchIntent
      ? `"${primarySearchIntent}" — edited since it was last evaluated.`
      : 'No primary search intent set.';
  }
  dimensions.push({ key: 'search_intent', state: searchIntentState, detail: searchIntentDetail });

  // Evidence — attention only on zero usable keywords or a critical-
  // severity research gap; caution on staleness or a research_opportunity
  // gap; optional_test gaps are informational only (surfaced in full by
  // ResearchEvidence.jsx) and never move this dimension.
  const criticalGaps = (researchGaps || []).filter(g => g.severity === 'critical');
  const opportunityGaps = (researchGaps || []).filter(g => g.severity === 'research_opportunity');
  let evidenceState, evidenceDetail;
  if (usableKeywordCount === 0) {
    evidenceState = 'attention';
    evidenceDetail = 'No researched keywords available for this collection yet.';
  } else if (criticalGaps.length > 0) {
    evidenceState = 'attention';
    evidenceDetail = criticalGaps.map(g => g.message).join(' ');
  } else {
    const cautions = [];
    if (keywordsStale) cautions.push('Keywords are stale — recheck recommended.');
    if (opportunityGaps.length > 0) cautions.push(...opportunityGaps.map(g => g.message));
    if (cautions.length > 0) {
      evidenceState = 'caution';
      evidenceDetail = cautions.join(' ');
    } else {
      evidenceState = 'ok';
      evidenceDetail = `${usableKeywordCount} researched keyword${usableKeywordCount !== 1 ? 's' : ''} available.`;
    }
  }
  dimensions.push({ key: 'evidence', state: evidenceState, detail: evidenceDetail });

  // Compatibility — pending without a format set, otherwise ok with the
  // excluded count surfaced as detail. Deliberately can never lower the
  // rollup on its own: a missing format is already Product Truth's
  // attention, and an actual format leak into generated copy is already a
  // string in validationWarnings (Generation Validation's job) — scoring it
  // a third time here would double-count the same problem.
  let compatibilityState, compatibilityDetail;
  if (!productFormat) {
    compatibilityState = 'pending';
    compatibilityDetail = 'Set a product format to enable compatibility checking.';
  } else {
    compatibilityState = 'ok';
    compatibilityDetail = excludedKeywordCount > 0
      ? `${excludedKeywordCount} format-incompatible keyword${excludedKeywordCount !== 1 ? 's' : ''} excluded automatically.`
      : 'No format-incompatible keywords found.';
  }
  dimensions.push({ key: 'compatibility', state: compatibilityState, detail: compatibilityDetail });

  // Generation Validation — reuses validateGeneratedListing's existing
  // output directly, never re-derived. Never attention — that function's
  // own header comment says it never blocks.
  let genValidationState, genValidationDetail;
  if (!hasGenerated) {
    genValidationState = 'pending';
    genValidationDetail = 'Not yet generated.';
  } else if ((validationWarnings || []).length > 0) {
    genValidationState = 'caution';
    genValidationDetail = `${validationWarnings.length} warning${validationWarnings.length !== 1 ? 's' : ''} from the last generation — review before publishing.`;
  } else {
    genValidationState = 'ok';
    genValidationDetail = 'No deterministic warnings from the last generation.';
  }
  dimensions.push({ key: 'generation_validation', state: genValidationState, detail: genValidationDetail });

  // ── Phase 6: Listing Search Setup ────────────────────────────────────────
  // §12's core point is that Etsy relevance is not just title + tags. These
  // dimensions are GUIDANCE, never blocking (§24 says so explicitly), so none
  // of them can reach 'attention' — the worst any returns is 'caution'.
  // Publishing without a confirmed category is a worse listing, not a broken
  // one, and a panel that shouts is a panel that gets ignored.
  //
  // NULL vs false matters throughout: null means "not looked at yet"
  // (pending), false means "looked at, not right" (caution). Collapsing them
  // would make every never-touched product claim it had been reviewed.

  if (etsyCategory !== undefined || etsyCategoryConfirmed !== undefined) {
    let state, detail;
    if (etsyCategoryConfirmed === true) {
      state = 'ok';
      detail = etsyCategory ? `${etsyCategory} — confirmed most specific.` : 'Confirmed.';
    } else if (etsyCategoryConfirmed === false) {
      state = 'caution';
      detail = 'Category marked as not yet the most specific one.';
    } else if (etsyCategory) {
      state = 'caution';
      detail = `${etsyCategory} — set, but not confirmed as the most specific.`;
    } else {
      state = 'pending';
      detail = 'No Etsy category recorded.';
    }
    dimensions.push({ key: 'etsy_category', state, detail });
  }

  if (etsyAttributes !== undefined || etsyAttributesComplete !== undefined) {
    const filled = Array.isArray(etsyAttributes)
      ? etsyAttributes.filter(a => a && a.name && a.value).length
      : 0;
    let state, detail;
    if (etsyAttributesComplete === true) {
      state = 'ok';
      detail = filled ? `${filled} attribute${filled !== 1 ? 's' : ''} recorded, marked complete.` : 'Marked complete.';
    } else if (filled) {
      // Deliberately not "n of N" — nothing here knows how many attributes a
      // given Etsy category offers, so a denominator would be invented.
      state = 'caution';
      detail = `${filled} attribute${filled !== 1 ? 's' : ''} recorded, not yet marked complete.`;
    } else {
      state = 'pending';
      detail = 'No Etsy attributes recorded.';
    }
    dimensions.push({ key: 'etsy_attributes', state, detail });
  }

  if (title !== undefined) {
    const t = (title || '').trim();
    dimensions.push({
      key: 'title',
      state: t ? 'ok' : 'pending',
      // 140 is Etsy's own field limit, not a TCC style rule — §15 forbids
      // inventing a short-title rule, not respecting the platform maximum.
      detail: t
        ? (t.length > 140 ? `${t.length} characters — over Etsy's 140 limit.` : `${t.length} of 140 characters.`)
        : 'No title yet.',
    });
    if (t.length > 140) dimensions[dimensions.length - 1].state = 'caution';
  }

  if (tags !== undefined) {
    const list = (tags || []).map(x => (x || '').trim()).filter(Boolean);
    const overlong = list.filter(x => x.length > 20).length;
    let state, detail;
    if (!list.length) {
      state = 'pending';
      detail = 'No tags yet.';
    } else if (overlong) {
      state = 'caution';
      detail = `${overlong} tag${overlong !== 1 ? 's' : ''} over Etsy's 20-character limit.`;
    } else if (list.length < 13) {
      // §19 is explicit that unrelated filler is worse than a short set, so
      // this stays a note rather than a demand for 13.
      state = 'caution';
      detail = `${list.length} of 13 tag slots used — only add more if they genuinely fit.`;
    } else {
      state = 'ok';
      detail = 'All 13 tag slots used.';
    }
    dimensions.push({ key: 'tags', state, detail });
  }

  if (heroImageApproved !== undefined) {
    dimensions.push({
      key: 'hero_image',
      state: heroImageApproved === true ? 'ok' : heroImageApproved === false ? 'caution' : 'pending',
      detail: heroImageApproved === true ? 'Hero image approved.'
        : heroImageApproved === false ? 'Hero image flagged as not ready.'
        : 'Hero image not reviewed.',
    });
  }

  return dimensions;
}

// Isolated so the rule itself — any attention wins, else any caution, else
// ready — is directly testable regardless of what the dimension builder
// above happens to compute today. Mirrors listingSEO.js's rollupStatus().
export function rollupReadiness(dimensions) {
  if ((dimensions || []).some(d => d.state === 'attention')) return 'needs_research';
  if ((dimensions || []).some(d => d.state === 'caution')) return 'ready_with_caution';
  return 'ready';
}

// Takes the worse of the dimension rollup and the AI's own validation.status
// — folds in the model's judgment without letting a model-emitted 'ready'
// paper over a real deterministic problem the dimensions found.
function mergeWithAiStatus(dimensionHeadline, aiValidationStatus) {
  if (!aiValidationStatus) return dimensionHeadline;
  return HEADLINE_RANK[aiValidationStatus] > HEADLINE_RANK[dimensionHeadline] ? aiValidationStatus : dimensionHeadline;
}

// hasGenerated: true once this product has ever completed a generation —
// either fresh this session (`output`) or hydrated from its most recent
// ledger row (existing product, see Zone 4's hydration). Pre-generation the
// headline is the distinct 'not_generated' state rather than a real rollup
// value — Product Truth/Evidence/Compatibility still show their real
// current state underneath (whatever's knowable pre-generation), but the
// headline itself never claims Ready, Ready with Caution, or Needs Research
// before a generation has actually run.
export function computeListingReadiness({
  hasGenerated, productFormat, primarySearchIntent, primaryIntentStatus,
  usableKeywordCount, keywordsStale, researchGaps, excludedKeywordCount,
  validationWarnings, aiValidationStatus,
  etsyCategory, etsyCategoryConfirmed, etsyAttributes, etsyAttributesComplete,
  heroImageApproved, title, tags,
}) {
  const dimensions = buildDimensions({
    hasGenerated, productFormat, primarySearchIntent, primaryIntentStatus,
    usableKeywordCount, keywordsStale, researchGaps, excludedKeywordCount, validationWarnings,
    etsyCategory, etsyCategoryConfirmed, etsyAttributes, etsyAttributesComplete,
    heroImageApproved, title, tags,
  });

  if (!hasGenerated) {
    return { headline: 'not_generated', dimensions };
  }

  const headline = mergeWithAiStatus(rollupReadiness(dimensions), aiValidationStatus);
  return { headline, dimensions };
}
