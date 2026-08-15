// ─── Listing SEO — deterministic composite status (Phase 21) ──────────────
// Pure, deterministic, no AI/DB calls — mirrors keywordIntelligence.js's
// shape and house style.
//
// Core principle: collection research is evidence, not automatically a
// listing's gap set. Phase 19's classification/confidence measures whether
// a keyword itself is good evidence — real, trending, well-supported. It
// says nothing about whether that keyword is relevant to THIS product, any
// more than a strong "hockey sweatshirt" keyword was ever relevant to a
// hockey t-shirt (the exact bug Milestone A fixed, one layer down). When a
// Milestone A generation exists for a product, its primary_search_intent /
// supporting_keywords / excluded_keywords are the real, already-made
// product-specific relevance judgment — that's the relevance layer.
// Collection research is the evidence layer underneath it, plus a source of
// new candidates. Never the other way around.

import { phraseAppearsIn } from './textMatch.js';
import { CLASSIFICATIONS, CONFIDENCE_LEVELS } from './keywordIntelligence.js';
import { checkFormatCompatibility } from './productTruth.js';

export const SEO_STATUSES = ['Strong', 'Needs Attention', 'Weak'];

const REJECTED_STATUSES = ['Reject', 'Archived'];
const SUSPECT_CLASSIFICATION = 'Suspect / Low Confidence';
const FRESHNESS_DUE_DAYS = 15; // matches the existing manual-audit cadence badge

const CONFIDENCE_RANK = Object.fromEntries(CONFIDENCE_LEVELS.map((c, i) => [c, i]));

function classificationRank(classification) {
  const idx = CLASSIFICATIONS.indexOf(classification);
  return idx === -1 ? CLASSIFICATIONS.length : idx;
}
function confidenceRank(confidence) {
  return CONFIDENCE_RANK[confidence] ?? CONFIDENCE_LEVELS.length;
}

// Does `candidate` carry more real evidence than `current` — non-null
// classification beats null, then higher confidence beats lower. Used to
// pick which raw row represents a keyword researched under multiple
// sessions/sources, mirroring Research.jsx's own dedup preference rule.
function hasMoreEvidence(candidate, current) {
  const candHasClass = candidate.classification != null;
  const currHasClass = current.classification != null;
  if (candHasClass !== currHasClass) return candHasClass;
  return confidenceRank(candidate.confidence) > confidenceRank(current.confidence)
    ? true
    : false;
}

// Flattens sessions[].keywords[] into one deduped-by-text pool — the
// evidence layer. Mirrors Research.jsx's dedup pattern (merge same-text
// rows across sessions/sources into one entry, track every source).
export function buildKeywordPool(sessions, { isSeasonalProduct } = {}) {
  const byText = new Map();
  for (const s of sessions || []) {
    if (s.seasonal && !isSeasonalProduct) continue;
    for (const k of (s.keywords || [])) {
      if (k.tags_only) continue;
      if (k.tag_type === 'discard') continue;
      const text = (k.keyword || '').trim();
      if (!text) continue;
      const key = text.toLowerCase();
      const sourceEntry = { session_id: s.id, source: s.source, date: s.date };
      const existing = byText.get(key);
      if (!existing) {
        byText.set(key, { ...k, keyword: text, sources: [sourceEntry] });
        continue;
      }
      const sources = [...existing.sources, sourceEntry];
      if (hasMoreEvidence(k, existing)) {
        byText.set(key, { ...k, keyword: text, sources });
      } else {
        existing.sources = sources;
      }
    }
  }
  return [...byText.values()];
}

// Comparator for ranking opportunity candidates — real evidence first
// (classification tier, then confidence), the old volume/competition
// formula only as a tiebreaker among equally-evidenced keywords.
export function compareOpportunity(a, b) {
  const ca = classificationRank(a.classification), cb = classificationRank(b.classification);
  if (ca !== cb) return ca - cb;
  const fa = confidenceRank(a.confidence), fb = confidenceRank(b.confidence);
  if (fa !== fb) return fa - fb;
  const legacyA = (a.score || 0) / Math.log2((a.competition || 0) + 2);
  const legacyB = (b.score || 0) / Math.log2((b.competition || 0) + 2);
  return legacyB - legacyA;
}

// The product-specific relevance layer, derived from the product's most
// recent Listing Builder generation (already the real, made judgment call —
// see file header). Returns hasRelevanceData: false when no generation
// exists yet for this product — a legacy product, not an error state.
export function deriveProductRelevance(latestGeneration, pool) {
  if (!latestGeneration) {
    return { hasRelevanceData: false, primarySearchIntent: null, relevant: [], excluded: [] };
  }
  const poolByText = new Map(pool.map(k => [k.keyword.toLowerCase(), k]));
  const relevant = [];
  const excluded = [];
  for (const row of latestGeneration.listing_generation_keywords || []) {
    const text = (row.keyword_text || '').trim();
    if (!text) continue;
    const evidence = poolByText.get(text.toLowerCase()) || null;
    const enriched = {
      keyword: text,
      relevanceCategory: row.relevance_category || null,
      exclusionReason: row.exclusion_reason || null,
      volume: evidence?.volume ?? row.volume ?? null,
      competition: evidence?.competition ?? row.competition ?? null,
      score: evidence?.score ?? row.score ?? null,
      classification: evidence?.classification ?? null,
      confidence: evidence?.confidence ?? null,
      trend_classification: evidence?.trend_classification ?? null,
      disagreement_flag: evidence?.disagreement_flag ?? false,
    };
    if (row.role === 'supporting') relevant.push(enriched);
    else if (row.role === 'excluded') excluded.push(enriched);
  }
  return {
    hasRelevanceData: true,
    primarySearchIntent: latestGeneration.primary_search_intent || null,
    relevant,
    excluded,
  };
}

function tagList(tags) {
  return (tags || '').split(',').map(t => t.trim()).filter(Boolean);
}

// Checks title and each tag as SEPARATE haystacks, not one joined string —
// Etsy tags are independent <=20-char phrases, not a single stream, and
// joining them risks a false-positive phrase match spanning a tag boundary
// (the last word of one tag + the first word of the next coincidentally
// forming a real phrase neither tag says on its own).
function isPresent(keywordText, title, tagArr) {
  if (phraseAppearsIn(title || '', keywordText)) return true;
  return tagArr.some(tag => phraseAppearsIn(tag, keywordText));
}

// Replaces computeGaps(). Relevance-first: a "Listing Gap" only ever comes
// from the product's own real relevant keywords, never raw collection
// research — see file header. Returns four groups: gaps ("Listing Gaps" —
// real, actionable), excludedGaps (deliberately excluded, with the real
// logged reason), opportunities ("Potential Research Opportunities" —
// unvetted candidates), using (already present).
export function computeGapAnalysis(pool, relevance, { title, tags, productFormat } = {}) {
  const tagArr = tagList(tags);
  const gaps = [];
  const excludedGaps = [];
  const opportunities = [];
  const using = [];

  const isFormatIncompatible = (keyword) =>
    productFormat != null && checkFormatCompatibility(keyword, productFormat) === 'incompatible';

  if (relevance.hasRelevanceData) {
    for (const k of relevance.relevant) {
      const present = isPresent(k.keyword, title, tagArr);
      const primary = !!relevance.primarySearchIntent
        && k.keyword.toLowerCase() === relevance.primarySearchIntent.toLowerCase();
      (present ? using : gaps).push({ ...k, primary });
    }
    excludedGaps.push(...relevance.excluded);

    const considered = new Set([
      ...relevance.relevant.map(k => k.keyword.toLowerCase()),
      ...relevance.excluded.map(k => k.keyword.toLowerCase()),
    ]);
    for (const k of pool) {
      const key = k.keyword.toLowerCase();
      if (considered.has(key)) continue;
      if (REJECTED_STATUSES.includes(k.research_status)) continue;
      if (isFormatIncompatible(k.keyword)) continue;
      const present = isPresent(k.keyword, title, tagArr);
      if (present) { using.push(k); continue; }
      if (k.classification === SUSPECT_CLASSIFICATION) continue;
      opportunities.push(k);
    }
  } else {
    // Legacy product, no generation yet — no real relevance data, so
    // nothing is a definitive gap. Everything real lands as a candidate.
    for (const k of pool) {
      if (REJECTED_STATUSES.includes(k.research_status)) continue;
      if (isFormatIncompatible(k.keyword)) continue;
      const present = isPresent(k.keyword, title, tagArr);
      if (present) { using.push(k); continue; }
      if (k.classification === SUSPECT_CLASSIFICATION) continue;
      opportunities.push(k);
    }
  }

  gaps.sort(compareOpportunity);
  opportunities.sort(compareOpportunity);

  return { gaps, excludedGaps, opportunities, using };
}

// Composite status. Dimensions are explicitly blocking or supporting, not
// equal-vote (Kristen's correction) — only relevance_coverage can produce
// 'Weak'. historical_context is informational only and never enters the
// rollup: a stored critical gap from a past generation can't be reliably
// re-verified from free text alone, so it never scores the CURRENT status
// on its own. If the underlying problem is still real, relevance_coverage
// (computed fresh against current title/tags every time) catches it again
// independently. If it's been fixed since, the historical note stays
// visible as context but stops affecting anything.
export function computeListingSEOStatus({ pool, relevance, gapAnalysis, latestGeneration, hasLiveListing, lastVerified, lastAuditDate }) {
  if (!hasLiveListing) return { status: null, reason: 'no_live_listing', dimensions: [] };

  const hasEvidence = (pool && pool.length > 0)
    || (relevance.hasRelevanceData && (relevance.relevant.length > 0 || relevance.excluded.length > 0));
  if (!hasEvidence) return { status: null, reason: 'no_keyword_evidence', dimensions: [] };

  const dimensions = [];

  // relevance_coverage — BLOCKING. The only dimension that can produce Weak.
  let covState, covDetail;
  if (!relevance.hasRelevanceData) {
    covState = 'caution';
    covDetail = 'No product-specific relevance data yet — run this listing through Listing Builder for a real gap analysis. What\'s shown below are collection keywords worth considering, not confirmed gaps.';
  } else {
    const total = relevance.relevant.length;
    const missing = gapAnalysis.gaps.length;
    const missingPrimary = gapAnalysis.gaps.some(g => g.primary);
    if (total === 0) {
      covState = 'good';
      covDetail = 'No supporting keywords beyond what was excluded — nothing real is missing.';
    } else if (missingPrimary) {
      covState = 'bad';
      covDetail = `The primary search intent ("${relevance.primarySearchIntent}") is missing from the live title/tags.`;
    } else if (missing === 0) {
      covState = 'good';
      covDetail = `All ${total} real supporting keywords are present in the live title/tags.`;
    } else if (missing / total > 0.4) {
      covState = 'bad';
      covDetail = `${missing} of ${total} real supporting keywords are missing from the live title/tags.`;
    } else {
      covState = 'caution';
      covDetail = `${missing} of ${total} real supporting keywords are missing from the live title/tags.`;
    }
  }
  dimensions.push({ key: 'relevance_coverage', blocking: true, state: covState, detail: covDetail });

  // evidence_quality — SUPPORTING. Caveats confidence in the assessment,
  // isn't itself proof of a bad listing.
  const poolSize = pool.length;
  const thinCount = pool.filter(k => k.confidence === 'Low' || k.classification == null).length;
  let evState, evDetail;
  if (poolSize === 0) {
    evState = 'caution';
    evDetail = 'No collection research evidence available yet.';
  } else if (poolSize < 5 || thinCount / poolSize > 0.6) {
    evState = 'caution';
    evDetail = `Research pool is thin or mostly low-confidence (${poolSize} keyword${poolSize === 1 ? '' : 's'}) — treat this assessment as a starting point.`;
  } else {
    evState = 'good';
    evDetail = `${poolSize} researched keywords with real evidence back this assessment.`;
  }
  dimensions.push({ key: 'evidence_quality', blocking: false, state: evState, detail: evDetail });

  // freshness — SUPPORTING.
  const freshnessDate = lastVerified || lastAuditDate || null;
  let freshState, freshDetail;
  if (!freshnessDate) {
    freshState = 'caution';
    freshDetail = 'No research or audit date on record yet.';
  } else {
    const days = Math.floor((Date.now() - new Date(freshnessDate).getTime()) / 86400000);
    if (days >= FRESHNESS_DUE_DAYS) {
      freshState = 'caution';
      freshDetail = `Last verified ${days}d ago — due for a fresh check.`;
    } else {
      freshState = 'good';
      freshDetail = `Verified ${days}d ago.`;
    }
  }
  dimensions.push({ key: 'freshness', blocking: false, state: freshState, detail: freshDetail });

  // historical_context — INFORMATIONAL ONLY. Never scored (see header doc).
  if (latestGeneration) {
    const criticalGaps = (latestGeneration.research_gaps || []).filter(g => g.severity === 'critical');
    if (criticalGaps.length || latestGeneration.validation_status === 'needs_research') {
      const date = (latestGeneration.created_at || '').slice(0, 10);
      const message = criticalGaps.length
        ? criticalGaps.map(g => g.message).join(' ')
        : `Validation status was "${latestGeneration.validation_status}" at generation time.`;
      dimensions.push({
        key: 'historical_context', blocking: false, informational: true, state: 'neutral',
        detail: `From a generation on ${date}: ${message}`,
      });
    }
  }

  return { status: rollupStatus(dimensions), dimensions };
}

// Blocking vs. supporting rollup, isolated as its own function so the rule
// itself — a supporting dimension can never independently produce Weak,
// only a blocking one can — is directly testable regardless of what the
// current dimension calculations above happen to produce today.
// informational dimensions (historical_context) never enter the rollup.
export function rollupStatus(dimensions) {
  const scored = (dimensions || []).filter(d => !d.informational);
  const blocking = scored.filter(d => d.blocking);
  const supporting = scored.filter(d => !d.blocking);
  if (blocking.some(d => d.state === 'bad')) return 'Weak';
  if (blocking.some(d => d.state === 'caution')) return 'Needs Attention';
  if (supporting.some(d => d.state !== 'good')) return 'Needs Attention';
  return 'Strong';
}

// One wrapper chaining the full pipeline — single call site for the
// component, mirroring keywordIntelligence.js's own interpretKeyword().
export function evaluateListingSEO({
  sessions, isSeasonalProduct, latestGeneration, title, tags, productFormat,
  hasLiveListing, lastVerified, lastAuditDate,
}) {
  const pool = buildKeywordPool(sessions, { isSeasonalProduct });
  const relevance = deriveProductRelevance(latestGeneration, pool);
  const gapAnalysis = computeGapAnalysis(pool, relevance, { title, tags, productFormat });
  const seoStatus = computeListingSEOStatus({
    pool, relevance, gapAnalysis, latestGeneration, hasLiveListing, lastVerified, lastAuditDate,
  });
  return { pool, relevance, gapAnalysis, ...seoStatus };
}
