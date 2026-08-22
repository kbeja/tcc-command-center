// Milestone B — Zone 4 rollup. Scoped to listingReadiness.js's pure
// functions, same house convention as productTruth.test.js/listingSEO.test.js:
// unit tests for the one safety/correctness-critical deterministic module.
import { describe, it, expect } from 'vitest';
import { computeListingReadiness, rollupReadiness } from './listingReadiness.js';

function baseInput(overrides) {
  return {
    hasGenerated: true,
    productFormat: 't-shirt',
    primarySearchIntent: 'hockey mom shirt',
    primaryIntentStatus: 'validated',
    usableKeywordCount: 12,
    keywordsStale: false,
    researchGaps: [],
    excludedKeywordCount: 0,
    validationWarnings: [],
    aiValidationStatus: 'ready',
    ...overrides,
  };
}

function dim(key, input) {
  return computeListingReadiness(input).dimensions.find(d => d.key === key);
}

describe('pre-generation', () => {
  it('headline is not_generated, never a false Ready/Caution/Needs Research', () => {
    const result = computeListingReadiness(baseInput({ hasGenerated: false, aiValidationStatus: null }));
    expect(result.headline).toBe('not_generated');
  });

  it('Search Intent and Generation Validation show pending; other dimensions still show real state', () => {
    const result = computeListingReadiness(baseInput({ hasGenerated: false, aiValidationStatus: null, productFormat: '' }));
    expect(result.dimensions.find(d => d.key === 'search_intent').state).toBe('pending');
    expect(result.dimensions.find(d => d.key === 'generation_validation').state).toBe('pending');
    // productFormat is knowable before generation — a real gap, not a "not yet known" placeholder.
    expect(result.dimensions.find(d => d.key === 'product_truth').state).toBe('attention');
  });
});

describe('Product Truth', () => {
  it('attention when product_format is unset', () => {
    expect(dim('product_truth', baseInput({ productFormat: '' })).state).toBe('attention');
  });
  it('ok when product_format is set, regardless of other unset optional fields', () => {
    expect(dim('product_truth', baseInput({ productFormat: 'crewneck sweatshirt' })).state).toBe('ok');
  });
});

describe('Search Intent', () => {
  it('ok when validated', () => {
    expect(dim('search_intent', baseInput({ primaryIntentStatus: 'validated' })).state).toBe('ok');
  });
  it('caution when supported', () => {
    expect(dim('search_intent', baseInput({ primaryIntentStatus: 'supported' })).state).toBe('caution');
  });
  it('caution when unvalidated', () => {
    expect(dim('search_intent', baseInput({ primaryIntentStatus: 'unvalidated' })).state).toBe('caution');
  });
  it('caution when edited since validation (status cleared, intent still set)', () => {
    expect(dim('search_intent', baseInput({ primaryIntentStatus: '', primarySearchIntent: 'edited phrase' })).state).toBe('caution');
  });
  it('never reaches attention, even with no intent at all', () => {
    expect(dim('search_intent', baseInput({ primaryIntentStatus: '', primarySearchIntent: '' })).state).not.toBe('attention');
  });
});

describe('Evidence', () => {
  it('attention when zero usable keywords', () => {
    expect(dim('evidence', baseInput({ usableKeywordCount: 0 })).state).toBe('attention');
  });
  it('attention on a critical research gap even with plenty of keywords', () => {
    const result = dim('evidence', baseInput({ researchGaps: [{ severity: 'critical', message: 'Primary intent has no real search volume behind it.' }] }));
    expect(result.state).toBe('attention');
    expect(result.detail).toContain('Primary intent has no real search volume');
  });
  it('caution on stale keywords alone', () => {
    expect(dim('evidence', baseInput({ keywordsStale: true })).state).toBe('caution');
  });
  it('caution on a research_opportunity gap alone', () => {
    expect(dim('evidence', baseInput({ researchGaps: [{ severity: 'research_opportunity', message: 'Consider testing "hockey mom crewneck".' }] })).state).toBe('caution');
  });
  it('an optional_test gap alone never moves the dimension off ok', () => {
    expect(dim('evidence', baseInput({ researchGaps: [{ severity: 'optional_test', message: 'Could try "hockey fan gift" as a tag.' }] })).state).toBe('ok');
  });
  it('ok when keywords are plentiful, fresh, and gap-free', () => {
    expect(dim('evidence', baseInput({})).state).toBe('ok');
  });
});

describe('Compatibility', () => {
  it('pending without a product format', () => {
    expect(dim('compatibility', baseInput({ productFormat: '' })).state).toBe('pending');
  });
  it('ok with a format set and zero exclusions', () => {
    expect(dim('compatibility', baseInput({ excludedKeywordCount: 0 })).state).toBe('ok');
  });
  it('stays ok even with a large excluded count — never independently escalates the dimension', () => {
    expect(dim('compatibility', baseInput({ excludedKeywordCount: 40 })).state).toBe('ok');
  });
});

describe('Generation Validation', () => {
  it('pending pre-generation', () => {
    expect(dim('generation_validation', baseInput({ hasGenerated: false })).state).toBe('pending');
  });
  it('ok with no warnings', () => {
    expect(dim('generation_validation', baseInput({ validationWarnings: [] })).state).toBe('ok');
  });
  it('caution with warnings present, never attention', () => {
    expect(dim('generation_validation', baseInput({ validationWarnings: ['Title exceeds 140 characters.'] })).state).toBe('caution');
  });
});

describe('rollupReadiness', () => {
  it('any attention wins over any caution', () => {
    const dims = [{ state: 'ok' }, { state: 'caution' }, { state: 'attention' }];
    expect(rollupReadiness(dims)).toBe('needs_research');
  });
  it('any caution with no attention', () => {
    const dims = [{ state: 'ok' }, { state: 'caution' }, { state: 'pending' }];
    expect(rollupReadiness(dims)).toBe('ready_with_caution');
  });
  it('all ok/pending rolls up to ready', () => {
    const dims = [{ state: 'ok' }, { state: 'ok' }, { state: 'pending' }];
    expect(rollupReadiness(dims)).toBe('ready');
  });
});

describe('merging with the AI validation status', () => {
  it('a worse AI status overrides an all-clear dimension rollup', () => {
    const result = computeListingReadiness(baseInput({ aiValidationStatus: 'needs_research' }));
    expect(result.headline).toBe('needs_research');
  });
  it('a falsely-optimistic AI "ready" never downgrades a real dimension problem', () => {
    const result = computeListingReadiness(baseInput({ usableKeywordCount: 0, aiValidationStatus: 'ready' }));
    expect(result.headline).toBe('needs_research');
  });
  it('matching statuses pass through unchanged', () => {
    const result = computeListingReadiness(baseInput({ aiValidationStatus: 'ready_with_caution', keywordsStale: true }));
    expect(result.headline).toBe('ready_with_caution');
  });
});

// ─── Phase 6: Listing Search Setup dimensions ──────────────────────────────
function dimOf(result, key) {
  return result.dimensions.find(d => d.key === key);
}

// §12's point is that Etsy relevance goes beyond title + tags, and §24 is
// explicit that the panel is guidance rather than a gate. These tests pin both
// halves: the dimensions appear and read correctly, and none of them can ever
// escalate a listing to needs_research.

describe('search setup — opt-in', () => {
  it('adds no new dimensions when no Phase 6 values are passed', () => {
    const keys = computeListingReadiness(baseInput()).dimensions.map(d => d.key);
    expect(keys).not.toContain('etsy_category');
    expect(keys).not.toContain('etsy_attributes');
    expect(keys).not.toContain('title');
    expect(keys).not.toContain('tags');
    expect(keys).not.toContain('hero_image');
  });
});

describe('etsy category', () => {
  it('is ok only once confirmed', () => {
    const r = computeListingReadiness(baseInput({ etsyCategory: 'Clothing > Tops', etsyCategoryConfirmed: true }));
    expect(dimOf(r, 'etsy_category').state).toBe('ok');
  });

  it('is caution when set but unconfirmed — a path alone is a draft', () => {
    const r = computeListingReadiness(baseInput({ etsyCategory: 'Clothing > Tops' }));
    expect(dimOf(r, 'etsy_category').state).toBe('caution');
  });

  it('distinguishes never-looked-at (pending) from reviewed-and-rejected (caution)', () => {
    // Explicit null means "this listing tracks a category and it is unset" ->
    // a pending row. Only omitting the field entirely (undefined) suppresses
    // the dimension, which is what keeps the five original dimensions intact
    // for callers that never pass Phase 6 values at all.
    const explicitNull = computeListingReadiness(baseInput({ etsyCategory: null, etsyCategoryConfirmed: null }));
    expect(dimOf(explicitNull, 'etsy_category').state).toBe('pending');
    const untouched = computeListingReadiness(baseInput({ etsyCategory: '' }));
    expect(dimOf(untouched, 'etsy_category').state).toBe('pending');
    const rejected = computeListingReadiness(baseInput({ etsyCategoryConfirmed: false }));
    expect(dimOf(rejected, 'etsy_category').state).toBe('caution');
  });
});

describe('etsy attributes', () => {
  it('is ok when marked complete', () => {
    const r = computeListingReadiness(baseInput({
      etsyAttributes: [{ name: 'Neckline', value: 'Crew' }], etsyAttributesComplete: true,
    }));
    expect(dimOf(r, 'etsy_attributes').state).toBe('ok');
  });

  it('counts only fully-filled pairs, and never invents a denominator', () => {
    const r = computeListingReadiness(baseInput({
      etsyAttributes: [{ name: 'Neckline', value: 'Crew' }, { name: 'Sleeve', value: '' }],
    }));
    expect(dimOf(r, 'etsy_attributes').state).toBe('caution');
    expect(dimOf(r, 'etsy_attributes').detail).toContain('1 attribute');
    expect(dimOf(r, 'etsy_attributes').detail).not.toMatch(/of \d/);
  });

  it('is pending with an empty list', () => {
    expect(dimOf(computeListingReadiness(baseInput({ etsyAttributes: [] })), 'etsy_attributes').state).toBe('pending');
  });
});

describe('title', () => {
  it('reports length against Etsy\u2019s 140 limit', () => {
    const r = computeListingReadiness(baseInput({ title: 'Hockey Mom Sweatshirt' }));
    expect(dimOf(r, 'title').state).toBe('ok');
    expect(dimOf(r, 'title').detail).toContain('of 140');
  });

  it('cautions over 140 characters', () => {
    const r = computeListingReadiness(baseInput({ title: 'x'.repeat(141) }));
    expect(dimOf(r, 'title').state).toBe('caution');
  });

  it('does not penalise a short title — §15 forbids a short-title rule', () => {
    expect(dimOf(computeListingReadiness(baseInput({ title: 'Hockey Mom Tee' })), 'title').state).toBe('ok');
  });
});

describe('tags', () => {
  it('is ok at 13', () => {
    const tags = Array.from({ length: 13 }, (_, i) => `tag ${i}`);
    expect(dimOf(computeListingReadiness(baseInput({ tags })), 'tags').state).toBe('ok');
  });

  it('cautions below 13 without demanding filler', () => {
    const r = computeListingReadiness(baseInput({ tags: ['hockey mom', 'hockey tee'] }));
    expect(dimOf(r, 'tags').state).toBe('caution');
    expect(dimOf(r, 'tags').detail).toContain('genuinely fit');
  });

  it('flags tags over Etsy\u2019s 20-character limit', () => {
    const r = computeListingReadiness(baseInput({ tags: ['a'.repeat(21)] }));
    expect(dimOf(r, 'tags').state).toBe('caution');
    expect(dimOf(r, 'tags').detail).toContain('20-character');
  });
});

describe('hero image', () => {
  it('separates approved, rejected and unreviewed', () => {
    expect(dimOf(computeListingReadiness(baseInput({ heroImageApproved: true })), 'hero_image').state).toBe('ok');
    expect(dimOf(computeListingReadiness(baseInput({ heroImageApproved: false })), 'hero_image').state).toBe('caution');
    expect(dimOf(computeListingReadiness(baseInput({ heroImageApproved: null })), 'hero_image').state).toBe('pending');
  });
});

describe('search setup is guidance, never a gate (§24)', () => {
  it('cannot push a listing to needs_research on its own', () => {
    const r = computeListingReadiness(baseInput({
      etsyCategory: '', etsyAttributes: [], title: '', tags: [], heroImageApproved: false,
    }));
    expect(r.dimensions.some(d => ['etsy_category', 'etsy_attributes', 'title', 'tags', 'hero_image'].includes(d.key) && d.state === 'attention')).toBe(false);
    expect(r.headline).not.toBe('needs_research');
  });
});
