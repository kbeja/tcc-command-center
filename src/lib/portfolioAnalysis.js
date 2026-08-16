// ─── Portfolio Comparison — Milestone C4 ───────────────────────────────────
// Pure, deterministic, no DB/AI calls — house style matches listingSEO.js/
// listingReviews.js/storePolicies.js. Cross-product only: this file compares
// listings against each other, never a single product's own history (that's
// what VersionHistory.jsx/ReviewCheckpoints.jsx already do). Imports
// computeCheckpointStates from listingReviews.js (C3, unmodified) rather
// than reimplementing checkpoint logic a second time.
//
// Core discipline throughout this file, per Kristen's own explicit
// instruction: real counts are always shown, never hidden — but nothing
// here ever ranks, sorts by performance, or states a winner/trend from a
// small sample. MIN_EVIDENCE_FOR_AI_INTERPRETATION is a deliberately unused
// seam — no function in this file checks it; it exists so a future
// milestone's AI interpretation layer has a name to import and gate itself
// on, without needing to touch this file again.

import { computeCheckpointStates, CHECKPOINT_DAYS } from './listingReviews.js';

export const MIN_LISTINGS_TO_COMPARE = 2;
export const MIN_EVIDENCE_FOR_AI_INTERPRETATION = 5; // unused seam this pass — see header

export const PORTFOLIO_DIMENSIONS = [
  { key: 'collection', label: 'Collection' },
  { key: 'format', label: 'Product Format' },
  { key: 'title_strategy', label: 'Title Strategy' },
  { key: 'search_intent', label: 'Primary Search Intent / Phrase Family' },
  { key: 'visual_aesthetic', label: 'Visual Aesthetic' },
  { key: 'checkpoint', label: 'Review Checkpoint' },
  { key: 'template_usage', label: 'Product Template Usage' },
  { key: 'policy_usage', label: 'Store Policy Usage' },
];

export const EVIDENCE_MESSAGES = {
  notEnoughDataYet: 'Not enough data yet',
  noComparableListingsYet: 'No comparable listings yet',
  waitingForFirstCheckpoints: 'Waiting for first 30-day checkpoints',
  tooFewToCompare: 'Too few listings in this group to compare',
};

// Exported so callers building their own groups outside groupBy() (index.jsx's
// template_usage/policy_usage normalization, whose "no template"/"no policy"
// bucket isn't produced by groupBy() at all) can mark them as the same kind
// of "no real value" bucket — keeps summarizeGroupedDimension's real-vs-
// unspecified counting consistent across all 7 non-checkpoint dimensions
// rather than only the ones that happen to go through groupBy() itself.
export const UNSPECIFIED = 'Unspecified';

// 'empty' | 'single' | 'comparable' — the one place group-size maps to which
// of Kristen's phrases applies; every UI component calls this instead of
// re-deriving the mapping itself.
export function getGroupEvidenceState(memberCount) {
  if (!memberCount) return 'empty';
  if (memberCount === 1) return 'single';
  return 'comparable';
}

// Naive +s isn't enough — this file pluralizes "policy" and "title
// strategy" (consonant+y -> ies is the standard English rule), caught live
// rendering "2 policys" on the Portfolio page before this fix.
function plural(n, word) {
  if (n === 1) return `${n} ${word}`;
  const pluralWord = /[^aeiou]y$/i.test(word) ? `${word.slice(0, -1)}ies` : `${word}s`;
  return `${n} ${pluralWord}`;
}

function sortKeysUnspecifiedLast([a], [b]) {
  if (a === UNSPECIFIED) return 1;
  if (b === UNSPECIFIED) return -1;
  return a.localeCompare(b);
}

// Shared bucketing primitive — groups items by keyFn(item); a missing/empty
// key falls into one 'Unspecified' bucket rather than being dropped.
// Returns [{ key, label, products }], alphabetical, Unspecified always last.
function groupBy(items, keyFn) {
  const buckets = new Map();
  for (const item of items) {
    const raw = keyFn(item);
    const key = raw == null || raw === '' ? UNSPECIFIED : raw;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(item);
  }
  return [...buckets.entries()]
    .sort(sortKeysUnspecifiedLast)
    .map(([key, products]) => ({ key, label: key, products }));
}

export function groupByCollection(products) {
  return groupBy(products, p => p.collection);
}
export function groupByFormat(products) {
  return groupBy(products, p => p.product_format);
}
// Groups by the CURRENT products.title_strategy (written by
// productTruthUpdates() in ListingBuilder/index.jsx on every save), not the
// historical per-generation snapshot — this is the one "current state"
// value, consistent with grouping by products.product_format/.collection.
export function groupByTitleStrategy(products) {
  return groupBy(products, p => p.title_strategy);
}

// Map<product_id, generation> — most recent generation per product, same
// sort-then-take-first-per-key shape as hooks.js's own
// useVisualProfilesByListing(). Generations with no product_id (unsaved
// drafts) are skipped — they can't be attributed to any product row here.
export function latestGenerationByProduct(generations) {
  const map = new Map();
  const sorted = [...generations].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  for (const gen of sorted) {
    if (gen.product_id && !map.has(gen.product_id)) map.set(gen.product_id, gen);
  }
  return map;
}

// Combines Kristen's "Primary Search Intent / SEO territory" and "phrase
// family" into ONE dimension — both point at the same underlying field
// (listing_generations.primary_search_intent); no phrase-clustering
// mechanism exists anywhere in this codebase to build a second, different
// one from. Grouping key is trim().toLowerCase() (merges pure case/
// whitespace duplicates only — still exact match, not fuzzy); the group's
// label keeps the original casing from whichever generation supplied it.
// Products with no generation at all land in Unspecified.
export function groupBySearchIntent(products, generations) {
  const latestByProduct = latestGenerationByProduct(generations);
  const buckets = new Map();
  for (const product of products) {
    const raw = latestByProduct.get(product.id)?.primary_search_intent;
    const normalized = raw ? raw.trim().toLowerCase() : null;
    const key = normalized || UNSPECIFIED;
    if (!buckets.has(key)) buckets.set(key, { label: raw ? raw.trim() : UNSPECIFIED, products: [] });
    buckets.get(key).products.push(product);
  }
  return [...buckets.entries()]
    .sort(sortKeysUnspecifiedLast)
    .map(([key, { label, products }]) => ({ key, label, products }));
}

// Many-to-many, structurally different from the dimensions above — a
// product's linked concept can carry zero, one, or many visual_tags, so
// there's no single "the aesthetic" value to group by. Groups by
// INDIVIDUAL tag (a product can appear in more than one group, unlike every
// other dimension here). `noData` covers BOTH "no concept_id at all" and
// "concept_id set but concept has zero tags applied" as one combined list
// — the UI explains both reasons in text; kept as the actual product list
// (not just a count) for consistency with every other dimension's
// Unspecified bucket, which also carries real products, not a number.
// tagsByConceptId: the exact shape useConceptTagsAll() already returns,
// { [concept_id]: [{id, name}, ...] }.
export function groupByVisualAesthetic(products, tagsByConceptId) {
  const buckets = new Map();
  const noData = [];
  for (const product of products) {
    const tags = product.concept_id ? tagsByConceptId[product.concept_id] : null;
    if (!tags || !tags.length) { noData.push(product); continue; }
    for (const tag of tags) {
      if (!buckets.has(tag.id)) buckets.set(tag.id, { label: tag.name, products: [] });
      buckets.get(tag.id).products.push(product);
    }
  }
  const groups = [...buckets.entries()]
    .sort(([, a], [, b]) => a.label.localeCompare(b.label))
    .map(([key, { label, products }]) => ({ key, label, products }));
  return { groups, noData };
}

// Always exactly 4 entries (CHECKPOINT_DAYS), regardless of data — matches
// ReviewCheckpoints.jsx's own convention of always rendering all 4
// checkpoints. Groups `reviews` by product_id, then reuses the EXISTING
// computeCheckpointStates(product, rows) per product (C3, unmodified) —
// never reimplements the due/upcoming/reviewed/skipped logic a second time.
export function groupByReviewCheckpoint(products, reviews) {
  const reviewsByProduct = new Map();
  for (const review of reviews) {
    if (!reviewsByProduct.has(review.product_id)) reviewsByProduct.set(review.product_id, []);
    reviewsByProduct.get(review.product_id).push(review);
  }

  const perCheckpoint = new Map(
    CHECKPOINT_DAYS.map(n => [n, { checkpointNumber: n, entries: [], stateCounts: {}, decisionCounts: {} }])
  );

  for (const product of products) {
    const states = computeCheckpointStates(product, reviewsByProduct.get(product.id) || []);
    for (const state of states) {
      const bucket = perCheckpoint.get(state.checkpointNumber);
      bucket.entries.push({ product, state });
      bucket.stateCounts[state.state] = (bucket.stateCounts[state.state] || 0) + 1;
      const decision = state.row?.user_decision;
      if (decision) bucket.decisionCounts[decision] = (bucket.decisionCounts[decision] || 0) + 1;
    }
  }

  return CHECKPOINT_DAYS.map(n => perCheckpoint.get(n));
}

// Reverse lookup — curated vocabulary: shows the FULL list passed in
// (pass ALL templates, active + archived, via useProductTemplates('all') —
// a product referencing an archived template must still be attributable to
// it, not silently misfiled as "no template"), including zero-usage
// entries. "Nobody uses this yet" is itself the answer to a reverse-lookup
// question, not noise to hide.
export function computeTemplateUsage(products, templates) {
  const byTemplate = new Map(templates.map(t => [t.id, { template: t, products: [] }]));
  const noTemplate = [];
  for (const product of products) {
    const entry = product.product_template_id ? byTemplate.get(product.product_template_id) : null;
    if (entry) entry.products.push(product);
    else noTemplate.push(product);
  }
  return [...byTemplate.values(), { template: null, products: noTemplate }];
}

// Same shape as computeTemplateUsage, but policy usage is per-GENERATION
// (not a direct FK on products) — recorded in each generation's own
// product_truth_sources jsonb. Scans the two mapped fields (shipping_policy,
// production_time, per storePolicies.js's own POLICY_FIELD_MAP) on each
// product's LATEST generation only, since that's what the product's current
// listing actually reflects. shipping_policy can resolve from up to 2
// policies at once (shipping + international_shipping both map there,
// storePolicies.js:49) — always iterates policies[] as an array, never
// assumes exactly one. Pass ALL policies (active + archived) for the same
// archived-but-referenced reason as computeTemplateUsage above.
export function computePolicyUsage(products, generations, policies) {
  const latestByProduct = latestGenerationByProduct(generations);
  const byPolicy = new Map(policies.map(p => [p.id, { policy: p, products: [], fieldCounts: {} }]));
  const noPolicy = [];

  for (const product of products) {
    const sources = latestByProduct.get(product.id)?.product_truth_sources;
    let usedAny = false;
    if (sources) {
      for (const field of ['shipping_policy', 'production_time']) {
        const src = sources[field];
        if (src?.source !== 'store_policy') continue;
        for (const used of src.policies || []) {
          const entry = byPolicy.get(used.id);
          if (!entry) continue;
          usedAny = true;
          if (!entry.products.includes(product)) entry.products.push(product);
          entry.fieldCounts[field] = (entry.fieldCounts[field] || 0) + 1;
        }
      }
    }
    if (!usedAny) noPolicy.push(product);
  }

  return [...byPolicy.values(), { policy: null, products: noPolicy }];
}

// ── Deterministic template-sentence summaries — buildOpportunitySummary()
//    style (CollectionDetail.jsx): describe counts already computed, invent
//    nothing, never a ranking/winner/trend claim. ──

// The per-group sentence for the comparable case (2+ members) ONLY —
// matches Kristen's own example shape exactly: "3 listings currently share
// this Primary Search Intent." For 0 or 1 members there's nothing to
// "describe sharing" yet — callers use getGroupEvidenceState() +
// EVIDENCE_MESSAGES directly instead of calling this.
export function describeGroupMembership(count, dimensionLabel) {
  return `${plural(count, 'listing')} currently ${count === 1 ? 'shares' : 'share'} this ${dimensionLabel}.`;
}

// Dimension-level paragraph — how many groups exist, how many are
// comparable (2+) vs. singleton vs. how many products have no value set for
// this dimension at all (the Unspecified bucket). Never states which group
// is "winning" — only counts.
export function summarizeGroupedDimension(groups, { noun }) {
  const real = groups.filter(g => g.key !== UNSPECIFIED);
  const unspecified = groups.find(g => g.key === UNSPECIFIED);
  const totalProducts = groups.reduce((sum, g) => sum + g.products.length, 0);
  if (!totalProducts) return EVIDENCE_MESSAGES.notEnoughDataYet;

  const comparable = real.filter(g => g.products.length >= MIN_LISTINGS_TO_COMPARE).length;
  const singleton = real.filter(g => g.products.length === 1).length;

  const parts = [`${plural(totalProducts, 'product')} across ${plural(real.length, noun)}.`];
  if (comparable) parts.push(`${plural(comparable, noun)} ${comparable === 1 ? 'has' : 'have'} 2+ listings to compare.`);
  if (singleton) parts.push(`${plural(singleton, noun)} ${singleton === 1 ? 'has' : 'have'} only 1 listing so far.`);
  if (unspecified?.products.length) {
    parts.push(`${plural(unspecified.products.length, 'product')} ${unspecified.products.length === 1 ? 'has' : 'have'} no value set for this yet.`);
  }
  return parts.join(' ');
}

// Matches Kristen's own two example shapes: "2 listings in this group have
// reached a 30-day checkpoint." / "This group has 1 reviewed listing and 4
// listings still waiting for their first checkpoint." One sentence per
// checkpoint, in CHECKPOINT_DAYS order.
export function summarizeCheckpointDimension(checkpointGroups) {
  return checkpointGroups.map(group => {
    const reviewed = group.stateCounts.reviewed || 0;
    const skipped = group.stateCounts.skipped || 0;
    const due = group.stateCounts.due || 0;
    const upcoming = group.stateCounts.upcoming || 0;
    const notLive = group.stateCounts.no_went_live_date || 0;
    const waiting = due + upcoming + notLive;

    let sentence;
    if (!reviewed && !skipped) {
      sentence = waiting
        ? `No listings have completed the ${group.checkpointNumber}-day checkpoint yet — ${plural(waiting, 'listing')} still waiting.`
        : EVIDENCE_MESSAGES.notEnoughDataYet;
    } else {
      const parts = [`This group has ${plural(reviewed, 'reviewed listing')}`];
      if (skipped) parts.push(`${plural(skipped, 'skipped listing')}`);
      sentence = `${parts.join(' and ')}${waiting ? ` and ${plural(waiting, 'listing')} still waiting for their first checkpoint` : ''}.`;
    }
    return { checkpointNumber: group.checkpointNumber, sentence };
  });
}
