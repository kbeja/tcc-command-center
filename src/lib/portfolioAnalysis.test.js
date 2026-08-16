// Milestone C4 — Portfolio Comparison. Same house convention as
// listingReviews.test.js/storePolicies.test.js: unit tests for the
// deterministic module. Extra emphasis here on the "never a winner/ranking/
// trend from a small sample" requirement — several tests exist specifically
// to prove a size-1 group is shown, captioned, and never silently treated
// as comparable.
import { describe, it, expect } from 'vitest';
import {
  getGroupEvidenceState,
  groupByCollection, groupByFormat, groupByTitleStrategy,
  latestGenerationByProduct, groupBySearchIntent, groupByVisualAesthetic,
  groupByReviewCheckpoint, computeTemplateUsage, computePolicyUsage,
  describeGroupMembership, summarizeGroupedDimension, summarizeCheckpointDimension,
  EVIDENCE_MESSAGES, UNSPECIFIED,
} from './portfolioAnalysis.js';

// UTC throughout (setUTCDate, not setDate) — matches listingReviews.test.js's
// own daysAgo() fix: mixing local-timezone subtraction with a UTC
// serialization drifts a day right at local-midnight boundaries.
function daysAgo(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function product(overrides) {
  return { id: 'p1', name: 'Product', collection: null, product_format: null, title_strategy: null, product_template_id: null, concept_id: null, went_live_at: null, ...overrides };
}
function generation(overrides) {
  return { id: 'g1', product_id: 'p1', created_at: '2026-08-01T00:00:00Z', primary_search_intent: null, product_truth_sources: null, ...overrides };
}
function review(overrides) {
  return { id: 'r1', product_id: 'p1', checkpoint_number: 30, status: 'reviewed', user_decision: 'no_action_needed', created_at: '2026-08-01T00:00:00Z', ...overrides };
}

describe('getGroupEvidenceState', () => {
  it('maps 0/1/2+ to empty/single/comparable', () => {
    expect(getGroupEvidenceState(0)).toBe('empty');
    expect(getGroupEvidenceState(1)).toBe('single');
    expect(getGroupEvidenceState(2)).toBe('comparable');
    expect(getGroupEvidenceState(50)).toBe('comparable');
  });
});

describe('UNSPECIFIED', () => {
  it('is exported so callers building groups outside groupBy() (index.jsx\'s template/policy "no value" buckets) can mark them consistently', () => {
    expect(UNSPECIFIED).toBe('Unspecified');
  });
});

describe('groupByCollection / groupByFormat / groupByTitleStrategy', () => {
  it('groups by the given field and sorts alphabetically', () => {
    const products = [
      product({ id: 'a', collection: 'Reader Chapter' }),
      product({ id: 'b', collection: 'Mom Chapter' }),
      product({ id: 'c', collection: 'Mom Chapter' }),
    ];
    const groups = groupByCollection(products);
    expect(groups.map(g => g.key)).toEqual(['Mom Chapter', 'Reader Chapter']);
    expect(groups[0].products).toHaveLength(2);
  });

  it('buckets null/empty values into Unspecified, always sorted last', () => {
    const products = [
      product({ id: 'a', product_format: 't-shirt' }),
      product({ id: 'b', product_format: null }),
      product({ id: 'c', product_format: '' }),
    ];
    const groups = groupByFormat(products);
    expect(groups.map(g => g.key)).toEqual(['t-shirt', 'Unspecified']);
    expect(groups[1].products).toHaveLength(2);
  });

  it('groupByTitleStrategy reads title_strategy', () => {
    const groups = groupByTitleStrategy([product({ title_strategy: 'buyer_clear' })]);
    expect(groups[0].key).toBe('buyer_clear');
  });
});

describe('latestGenerationByProduct', () => {
  it('picks the most recent generation per product, ignores generations with no product_id', () => {
    const generations = [
      generation({ id: 'old', product_id: 'p1', created_at: '2026-07-01T00:00:00Z', primary_search_intent: 'old intent' }),
      generation({ id: 'new', product_id: 'p1', created_at: '2026-08-01T00:00:00Z', primary_search_intent: 'new intent' }),
      generation({ id: 'orphan', product_id: null, primary_search_intent: 'unsaved draft' }),
    ];
    const map = latestGenerationByProduct(generations);
    expect(map.get('p1').id).toBe('new');
    expect(map.size).toBe(1);
  });
});

describe('groupBySearchIntent', () => {
  it('groups by trimmed/lowercased primary_search_intent, keeps original casing as label', () => {
    const products = [product({ id: 'a' }), product({ id: 'b' })];
    const generations = [
      generation({ product_id: 'a', primary_search_intent: 'Book Lover Shirt' }),
      generation({ product_id: 'b', primary_search_intent: '  book lover shirt  ' }),
    ];
    const groups = groupBySearchIntent(products, generations);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe('Book Lover Shirt');
    expect(groups[0].products).toHaveLength(2);
  });

  it('products with no generation land in Unspecified', () => {
    const groups = groupBySearchIntent([product({ id: 'a' })], []);
    expect(groups[0].key).toBe('Unspecified');
  });
});

describe('groupByVisualAesthetic', () => {
  it('a product with multiple tags appears in multiple groups', () => {
    const products = [product({ id: 'a', concept_id: 'c1' })];
    const tagsByConceptId = { c1: [{ id: 't1', name: 'Minimalist' }, { id: 't2', name: 'Serif' }] };
    const { groups, noData } = groupByVisualAesthetic(products, tagsByConceptId);
    expect(groups.map(g => g.label).sort()).toEqual(['Minimalist', 'Serif']);
    expect(noData).toHaveLength(0);
  });

  it('collects both no-concept and concept-with-no-tags products into noData', () => {
    const products = [product({ id: 'a', concept_id: null }), product({ id: 'b', concept_id: 'c2' })];
    const { groups, noData } = groupByVisualAesthetic(products, { c2: [] });
    expect(groups).toHaveLength(0);
    expect(noData.map(p => p.id)).toEqual(['a', 'b']);
  });
});

describe('groupByReviewCheckpoint', () => {
  it('always returns exactly 4 entries, in CHECKPOINT_DAYS order, even with zero products', () => {
    const groups = groupByReviewCheckpoint([], []);
    expect(groups.map(g => g.checkpointNumber)).toEqual([30, 60, 90, 120]);
  });

  it('tallies state and decision counts correctly for a real product+review', () => {
    const p = product({ id: 'a', went_live_at: daysAgo(35) });
    const r = review({ product_id: 'a', checkpoint_number: 30, status: 'reviewed', user_decision: 'update_seo' });
    const groups = groupByReviewCheckpoint([p], [r]);
    const c30 = groups.find(g => g.checkpointNumber === 30);
    expect(c30.stateCounts.reviewed).toBe(1);
    expect(c30.decisionCounts.update_seo).toBe(1);
  });

  it('a skipped review is tallied by state but not by decision (no user_decision)', () => {
    const p = product({ id: 'a', went_live_at: daysAgo(35) });
    const r = review({ product_id: 'a', checkpoint_number: 30, status: 'skipped', user_decision: null });
    const groups = groupByReviewCheckpoint([p], [r]);
    const c30 = groups.find(g => g.checkpointNumber === 30);
    expect(c30.stateCounts.skipped).toBe(1);
    expect(Object.keys(c30.decisionCounts)).toHaveLength(0);
  });
});

describe('computeTemplateUsage', () => {
  it('includes zero-usage templates and a "no template" bucket', () => {
    const templates = [{ id: 't1', name: 'Comfort Colors 1717' }, { id: 't2', name: 'Unused Template' }];
    const products = [product({ id: 'a', product_template_id: 't1' }), product({ id: 'b', product_template_id: null })];
    const usage = computeTemplateUsage(products, templates);
    expect(usage.find(u => u.template?.id === 't1').products).toHaveLength(1);
    expect(usage.find(u => u.template?.id === 't2').products).toHaveLength(0);
    expect(usage.find(u => u.template === null).products).toHaveLength(1);
  });

  it('a product referencing a template not in the passed list falls to no-template (never silently dropped from total)', () => {
    const usage = computeTemplateUsage([product({ id: 'a', product_template_id: 'archived-not-passed' })], []);
    expect(usage.find(u => u.template === null).products).toHaveLength(1);
  });
});

describe('computePolicyUsage', () => {
  it('shipping_policy resolving from 2 policies at once counts toward both', () => {
    const policies = [{ id: 'pol1', title: 'Domestic Shipping' }, { id: 'pol2', title: 'International Shipping' }];
    const products = [product({ id: 'a' })];
    const generations = [generation({
      product_id: 'a',
      product_truth_sources: { shipping_policy: { source: 'store_policy', policies: [{ id: 'pol1' }, { id: 'pol2' }] } },
    })];
    const usage = computePolicyUsage(products, generations, policies);
    expect(usage.find(u => u.policy?.id === 'pol1').products).toHaveLength(1);
    expect(usage.find(u => u.policy?.id === 'pol2').products).toHaveLength(1);
  });

  it('a product-sourced (not policy-sourced) field does not count as usage', () => {
    const policies = [{ id: 'pol1', title: 'Domestic Shipping' }];
    const products = [product({ id: 'a' })];
    const generations = [generation({ product_id: 'a', product_truth_sources: { shipping_policy: { source: 'product' } } })];
    const usage = computePolicyUsage(products, generations, policies);
    expect(usage.find(u => u.policy?.id === 'pol1').products).toHaveLength(0);
    expect(usage.find(u => u.policy === null).products).toHaveLength(1);
  });

  it('a product with no generation at all lands in the no-policy bucket', () => {
    const usage = computePolicyUsage([product({ id: 'a' })], [], []);
    expect(usage.find(u => u.policy === null).products).toHaveLength(1);
  });
});

describe('describeGroupMembership', () => {
  it('matches the "N listings currently share this X" shape', () => {
    expect(describeGroupMembership(3, 'Primary Search Intent')).toBe('3 listings currently share this Primary Search Intent.');
  });
  it('handles singular count grammatically', () => {
    expect(describeGroupMembership(1, 'collection')).toBe('1 listing currently shares this collection.');
  });
});

describe('summarizeGroupedDimension', () => {
  it('returns notEnoughDataYet when there are zero products total', () => {
    expect(summarizeGroupedDimension([], { noun: 'collection' })).toBe(EVIDENCE_MESSAGES.notEnoughDataYet);
  });

  it('pluralizes consonant+y nouns correctly (caught live: "2 policys" before this fix)', () => {
    const groups = [
      { key: 'A', label: 'A', products: [product(), product()] },
      { key: 'B', label: 'B', products: [product(), product()] },
    ];
    expect(summarizeGroupedDimension(groups, { noun: 'policy' })).toContain('2 policies');
    expect(summarizeGroupedDimension(groups, { noun: 'title strategy' })).toContain('2 title strategies');
  });

  it('never mentions which group is largest/winning — only counts', () => {
    const groups = [
      { key: 'A', label: 'A', products: [product(), product()] },
      { key: 'B', label: 'B', products: [product()] },
    ];
    const summary = summarizeGroupedDimension(groups, { noun: 'collection' });
    expect(summary).not.toMatch(/winning|best|top|highest/i);
    expect(summary).toContain('3 products across 2 collections');
    expect(summary).toContain('1 collection has 2+ listings to compare');
    expect(summary).toContain('1 collection has only 1 listing so far');
  });
});

describe('summarizeCheckpointDimension', () => {
  it('matches "This group has N reviewed listing(s) and M listings still waiting" for a mixed group', () => {
    const groups = [{ checkpointNumber: 30, stateCounts: { reviewed: 1, due: 2, upcoming: 2 }, decisionCounts: {} }];
    const [result] = summarizeCheckpointDimension(groups);
    expect(result.sentence).toBe('This group has 1 reviewed listing and 4 listings still waiting for their first checkpoint.');
  });

  it('reports notEnoughDataYet when a checkpoint group is completely empty', () => {
    const groups = [{ checkpointNumber: 30, stateCounts: {}, decisionCounts: {} }];
    const [result] = summarizeCheckpointDimension(groups);
    expect(result.sentence).toBe(EVIDENCE_MESSAGES.notEnoughDataYet);
  });

  it('reports the waiting-only case distinctly from the reviewed case', () => {
    const groups = [{ checkpointNumber: 30, stateCounts: { upcoming: 3 }, decisionCounts: {} }];
    const [result] = summarizeCheckpointDimension(groups);
    expect(result.sentence).toContain('No listings have completed the 30-day checkpoint yet');
    expect(result.sentence).toContain('3 listings still waiting');
  });
});
