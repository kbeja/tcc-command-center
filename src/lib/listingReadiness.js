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
}) {
  const dimensions = buildDimensions({
    hasGenerated, productFormat, primarySearchIntent, primaryIntentStatus,
    usableKeywordCount, keywordsStale, researchGaps, excludedKeywordCount, validationWarnings,
  });

  if (!hasGenerated) {
    return { headline: 'not_generated', dimensions };
  }

  const headline = mergeWithAiStatus(rollupReadiness(dimensions), aiValidationStatus);
  return { headline, dimensions };
}
