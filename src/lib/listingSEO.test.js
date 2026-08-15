// Phase 21 — SEO Intelligence. Scoped to listingSEO.js's pure functions,
// same house convention as productTruth.test.js: unit tests for the one
// safety/correctness-critical deterministic module, not a general push to
// test everything.
import { describe, it, expect } from 'vitest';
import {
  buildKeywordPool, deriveProductRelevance, computeGapAnalysis,
  computeListingSEOStatus, rollupStatus, evaluateListingSEO,
} from './listingSEO.js';

function kw(overrides) {
  return {
    keyword: 'placeholder', volume: 100, competition: 1000, score: 50,
    classification: 'Watchlist', confidence: 'Medium', research_status: 'Researching',
    ...overrides,
  };
}

const sessions = [
  {
    id: 's1', source: 'Everbee', date: '2026-08-01', seasonal: false,
    keywords: [
      kw({ keyword: 'hockey shirt', volume: 500, competition: 5000, score: 80, classification: 'Strong Unicorn', confidence: 'High', research_status: 'Validated' }),
      kw({ keyword: 'hockey mom sweatshirt', volume: 620, competition: 8792, score: 58, classification: 'Strong Unicorn', confidence: 'High', research_status: 'Validated' }),
      kw({ keyword: 'hockey gift', volume: 200, competition: 9000, score: 40, classification: 'Evergreen', confidence: 'Medium', research_status: 'Validated' }),
      kw({ keyword: 'hockey rejected term', volume: 300, competition: 3000, score: 70, classification: 'Strong Unicorn', confidence: 'High', research_status: 'Reject' }),
    ],
  },
];

const generationWithData = {
  id: 'g1',
  created_at: '2026-08-10T00:00:00Z',
  primary_search_intent: 'hockey shirt',
  validation_status: 'ready',
  research_gaps: [],
  listing_generation_keywords: [
    { keyword_text: 'hockey shirt', role: 'supporting', relevance_category: 'exact_product_intent' },
    { keyword_text: 'hockey mom sweatshirt', role: 'excluded', exclusion_reason: 'Conflicts with product format (t-shirt)' },
  ],
};

describe('buildKeywordPool', () => {
  it('dedupes the same keyword text across sessions, preferring the row with more evidence', () => {
    const dup = [
      { id: 's1', source: 'Everbee', date: '2026-08-01', keywords: [kw({ keyword: 'hockey shirt', classification: null, confidence: null })] },
      { id: 's2', source: 'eRank', date: '2026-08-05', keywords: [kw({ keyword: 'Hockey Shirt', classification: 'Strong Unicorn', confidence: 'High' })] },
    ];
    const pool = buildKeywordPool(dup, {});
    expect(pool.length).toBe(1);
    expect(pool[0].classification).toBe('Strong Unicorn');
    expect(pool[0].sources.length).toBe(2);
  });
});

describe('the core correction: relevance vs. evidence', () => {
  it('a strong collection keyword never evaluated by the generation lands in opportunities, never gaps', () => {
    const pool = buildKeywordPool(sessions, {});
    const relevance = deriveProductRelevance(generationWithData, pool);
    const gapAnalysis = computeGapAnalysis(pool, relevance, { title: 'Hockey Shirt For Fans', tags: '', productFormat: 't-shirt' });
    expect(gapAnalysis.gaps.some(g => g.keyword === 'hockey gift')).toBe(false);
    expect(gapAnalysis.opportunities.some(o => o.keyword === 'hockey gift')).toBe(true);
  });

  it('the generation\'s real supporting keyword, when missing, is a Listing Gap', () => {
    const pool = buildKeywordPool(sessions, {});
    const relevance = deriveProductRelevance(generationWithData, pool);
    const gapAnalysis = computeGapAnalysis(pool, relevance, { title: 'A Nice Shirt', tags: '', productFormat: 't-shirt' });
    expect(gapAnalysis.gaps.some(g => g.keyword === 'hockey shirt' && g.primary)).toBe(true);
  });

  it('the generation\'s excluded keyword is never a gap or an opportunity, and shows its real reason', () => {
    const pool = buildKeywordPool(sessions, {});
    const relevance = deriveProductRelevance(generationWithData, pool);
    const gapAnalysis = computeGapAnalysis(pool, relevance, { title: 'A Nice Shirt', tags: '', productFormat: 't-shirt' });
    expect(gapAnalysis.gaps.some(g => g.keyword === 'hockey mom sweatshirt')).toBe(false);
    expect(gapAnalysis.opportunities.some(o => o.keyword === 'hockey mom sweatshirt')).toBe(false);
    const excluded = gapAnalysis.excludedGaps.find(e => e.keyword === 'hockey mom sweatshirt');
    expect(excluded.exclusionReason).toBe('Conflicts with product format (t-shirt)');
  });

  it('a legacy product with no generation has zero Listing Gaps — everything real is a Potential Research Opportunity', () => {
    const pool = buildKeywordPool(sessions, {});
    const relevance = deriveProductRelevance(null, pool);
    const gapAnalysis = computeGapAnalysis(pool, relevance, { title: 'Totally unrelated title', tags: '', productFormat: null });
    expect(relevance.hasRelevanceData).toBe(false);
    expect(gapAnalysis.gaps.length).toBe(0);
    expect(gapAnalysis.opportunities.some(o => o.keyword === 'hockey shirt')).toBe(true);
  });
});

describe('tag-boundary-safe matching', () => {
  it('does not false-positive match a phrase spanning a tag boundary', () => {
    const pool = [kw({ keyword: 'shirt sweat', classification: 'Watchlist' })];
    const relevance = { hasRelevanceData: false, primarySearchIntent: null, relevant: [], excluded: [] };
    const result = computeGapAnalysis(pool, relevance, { title: 'Cool Product', tags: 'shirt, sweat', productFormat: null });
    expect(result.using.some(u => u.keyword === 'shirt sweat')).toBe(false);
    expect(result.opportunities.some(o => o.keyword === 'shirt sweat')).toBe(true);
  });

  it('does match a phrase that is genuinely present within one tag', () => {
    const pool = [kw({ keyword: 'hockey shirt', classification: 'Watchlist' })];
    const relevance = { hasRelevanceData: false, primarySearchIntent: null, relevant: [], excluded: [] };
    const result = computeGapAnalysis(pool, relevance, { title: 'Cool Product', tags: 'hockey shirt, gift', productFormat: null });
    expect(result.using.some(u => u.keyword === 'hockey shirt')).toBe(true);
  });
});

describe('Reject/Archived exclusion', () => {
  it('a rejected keyword never reappears as an opportunity, gap, or "using" row', () => {
    const pool = [kw({ keyword: 'hockey rejected term', research_status: 'Reject' })];
    const relevance = { hasRelevanceData: false, primarySearchIntent: null, relevant: [], excluded: [] };
    const result = computeGapAnalysis(pool, relevance, { title: 'hockey rejected term', tags: '', productFormat: null });
    expect(result.opportunities.length).toBe(0);
    expect(result.gaps.length).toBe(0);
    expect(result.using.length).toBe(0);
  });
});

describe('computeListingSEOStatus — no evidence / no listing', () => {
  it('returns a null status with a reason rather than asserting Weak', () => {
    const base = { pool: [], relevance: { hasRelevanceData: false, relevant: [], excluded: [] }, gapAnalysis: { gaps: [] } };
    const noListing = computeListingSEOStatus({ ...base, latestGeneration: null, hasLiveListing: false });
    expect(noListing.status).toBeNull();
    expect(noListing.reason).toBe('no_live_listing');

    const noEvidence = computeListingSEOStatus({ ...base, latestGeneration: null, hasLiveListing: true });
    expect(noEvidence.status).toBeNull();
    expect(noEvidence.reason).toBe('no_keyword_evidence');
  });
});

describe('computeListingSEOStatus — legacy products never reach relevance_coverage: bad', () => {
  it('a legacy product with real research still caps relevance_coverage at caution', () => {
    const pool = buildKeywordPool(sessions, {});
    const relevance = deriveProductRelevance(null, pool);
    const gapAnalysis = computeGapAnalysis(pool, relevance, { title: 'unrelated', tags: '', productFormat: null });
    const result = computeListingSEOStatus({ pool, relevance, gapAnalysis, latestGeneration: null, hasLiveListing: true });
    const coverage = result.dimensions.find(d => d.key === 'relevance_coverage');
    expect(coverage.state).not.toBe('bad');
  });
});

describe('rollupStatus — blocking vs. supporting', () => {
  it('a bad supporting dimension alone caps at Needs Attention, never Weak', () => {
    const status = rollupStatus([
      { key: 'relevance_coverage', blocking: true, state: 'good' },
      { key: 'evidence_quality', blocking: false, state: 'bad' },
    ]);
    expect(status).toBe('Needs Attention');
  });

  it('only a bad blocking dimension produces Weak', () => {
    const status = rollupStatus([
      { key: 'relevance_coverage', blocking: true, state: 'bad' },
      { key: 'evidence_quality', blocking: false, state: 'good' },
    ]);
    expect(status).toBe('Weak');
  });

  it('a caution blocking dimension produces Needs Attention, not Weak', () => {
    const status = rollupStatus([
      { key: 'relevance_coverage', blocking: true, state: 'caution' },
    ]);
    expect(status).toBe('Needs Attention');
  });

  it('an informational dimension never affects the rollup either way', () => {
    const status = rollupStatus([
      { key: 'relevance_coverage', blocking: true, state: 'good' },
      { key: 'evidence_quality', blocking: false, state: 'good' },
      { key: 'freshness', blocking: false, state: 'good' },
      { key: 'historical_context', blocking: false, informational: true, state: 'neutral' },
    ]);
    expect(status).toBe('Strong');
  });

  it('all-good dimensions produce Strong', () => {
    const status = rollupStatus([
      { key: 'relevance_coverage', blocking: true, state: 'good' },
      { key: 'evidence_quality', blocking: false, state: 'good' },
      { key: 'freshness', blocking: false, state: 'good' },
    ]);
    expect(status).toBe('Strong');
  });
});

describe('historical_context does not independently force Weak', () => {
  it('a critical past gap is surfaced as historical context, and has zero marginal effect on the current status', () => {
    const pool = buildKeywordPool(sessions, {});
    const relevance = deriveProductRelevance(generationWithData, pool);
    // Current title/tags now fully cover the real relevant keyword — the
    // only thing that differs between the two calls below is whether the
    // generation record happens to carry a critical historical gap.
    const gapAnalysis = computeGapAnalysis(pool, relevance, { title: 'Hockey Shirt', tags: '', productFormat: 't-shirt' });
    const args = { pool, relevance, gapAnalysis, hasLiveListing: true, lastVerified: new Date().toISOString() };

    const clean = computeListingSEOStatus({ ...args, latestGeneration: generationWithData });
    const withCriticalGap = computeListingSEOStatus({
      ...args,
      latestGeneration: { ...generationWithData, research_gaps: [{ severity: 'critical', message: 'Something was wrong once.' }] },
    });

    const historical = withCriticalGap.dimensions.find(d => d.key === 'historical_context');
    expect(historical).toBeTruthy();
    expect(historical.informational).toBe(true);
    expect(clean.dimensions.find(d => d.key === 'historical_context')).toBeUndefined();
    // The only difference between the two runs is a display-only dimension —
    // the actual status must be identical either way.
    expect(withCriticalGap.status).toBe(clean.status);
  });
});

describe('evaluateListingSEO', () => {
  it('chains the full pipeline and returns pool, relevance, gapAnalysis, status, and dimensions together', () => {
    const result = evaluateListingSEO({
      sessions, isSeasonalProduct: false, latestGeneration: generationWithData,
      title: 'Hockey Shirt', tags: '', productFormat: 't-shirt', hasLiveListing: true,
      lastVerified: new Date().toISOString(),
    });
    expect(result.pool.length).toBeGreaterThan(0);
    expect(result.relevance.hasRelevanceData).toBe(true);
    expect(Array.isArray(result.gapAnalysis.gaps)).toBe(true);
    expect(result.status).toBeTruthy();
    expect(Array.isArray(result.dimensions)).toBe(true);
  });
});
