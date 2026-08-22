// Phase 7 / §17 — competitor title pattern measurement. Same house convention
// as productTruth.test.js and listingSEO.test.js: unit tests for the one
// deterministic module whose output feeds a real decision (the §15–16 title
// strategy debate), not a general push to test everything.
import { describe, it, expect } from 'vitest';
import {
  classifyTitlePattern, measureRepetition, summarizeTitlePatterns,
  TITLE_PATTERNS, ETSY_TITLE_MAX,
} from './titlePatterns.js';

// Real titles pulled from competitor_listings, kept verbatim — including the
// HTML entity in the Father's Day one, which is exactly how it is stored.
const REAL = {
  spell: 'Avoidant to Obsessed Love Spell, Twin Flame Attraction Ritual, Romantic Magnetism Spell, Intense Love Energy Invocation',
  flag: 'Christian American Flag Tee, 250 Years Anniversary USA Shirt, 1776 Patriotic T‑Shirt, Fourth of July Faith & Freedom Graphic Shirts',
  grill: 'Custom Dad Grill Plate Daddy Grilling Platter Gift Personalized BBQ Tray for Him Dads Grilling Plate Birthday Father&#39;s Day Gifts from Kids',
};

describe('classifyTitlePattern', () => {
  it('always returns a known pattern', () => {
    for (const t of [...Object.values(REAL), '', null, undefined, 'x']) {
      expect(TITLE_PATTERNS).toContain(classifyTitlePattern(t));
    }
  });

  it('calls an empty or missing title "other"', () => {
    expect(classifyTitlePattern('')).toBe('other');
    expect(classifyTitlePattern('   ')).toBe('other');
    expect(classifyTitlePattern(null)).toBe('other');
  });

  it('classifies a genuinely short title as short descriptive', () => {
    expect(classifyTitlePattern('Hockey Mom Sweatshirt')).toBe('short_descriptive');
  });

  it('classifies a mid-length two-phrase title as medium keyword-rich', () => {
    // 61–100 chars, distinct phrases, no repetition.
    const t = 'Hockey Mom Sweatshirt, Comfort Colors Crewneck for Game Day Bleachers';
    expect(t.length).toBeGreaterThan(60);
    expect(t.length).toBeLessThanOrEqual(100);
    expect(classifyTitlePattern(t)).toBe('medium_keyword_rich');
  });

  it('classifies a long title of distinct phrases as long keyword-rich, not stuffed', () => {
    // The distinction that matters most: length alone is coverage, not padding.
    expect(classifyTitlePattern(REAL.spell)).toBe('long_keyword_rich');
  });

  it('catches padding where one phrase is restated across segments', () => {
    expect(classifyTitlePattern('Hockey Mom Shirt, Hockey Mom Tee, Hockey Mom Gift, Hockey Mom Top'))
      .toBe('stuffed');
  });

  it('lets repetition beat length in both directions', () => {
    // Short but repetitive -> stuffed, not short_descriptive.
    expect(classifyTitlePattern('Mug, Mug, Mug')).toBe('stuffed');
    // Long but varied -> long_keyword_rich, not stuffed.
    expect(classifyTitlePattern(REAL.flag)).toBe('long_keyword_rich');
  });

  it('does not treat a word repeated inside ONE phrase as padding', () => {
    // Segment spread is 1, so this must not trip the padding rule on its own.
    expect(classifyTitlePattern('Very Very Cosy Reading Sweatshirt')).not.toBe('stuffed');
  });
});

describe('measureRepetition', () => {
  it('counts distinct phrases a word spans, not raw occurrences', () => {
    const r = measureRepetition('Hockey Mom Shirt, Hockey Mom Tee, Hockey Mom Gift');
    expect(r.segments).toBe(3);
    expect(r.maxSegmentSpread).toBe(3);
  });

  it('reports no repetition for a title of distinct phrases', () => {
    const r = measureRepetition('Camp Mom Tee, Chaos Coordinator Shirt, Summer Gift');
    expect(r.maxSegmentSpread).toBe(1);
    expect(r.ratio).toBe(0);
  });

  it('ignores stopwords so "for"/"and" never look like padding', () => {
    const r = measureRepetition('Gift for Her, Gift for Him, Present for Them');
    // "gift" spans 2 phrases; "for" spans 3 but is a stopword and must not count.
    expect(r.maxSegmentSpread).toBeLessThan(3);
  });

  it('strips HTML entities rather than reading them as words', () => {
    // &#39; would otherwise contribute a bogus "39" token.
    expect(measureRepetition(REAL.grill).ratio).toBeLessThan(1);
    expect(classifyTitlePattern(REAL.grill)).not.toBe('other');
  });

  it('handles a title with no significant words at all', () => {
    expect(measureRepetition('& the of').ratio).toBe(0);
  });
});

describe('summarizeTitlePatterns', () => {
  const listings = [
    { product_name: 'Hockey Mom Sweatshirt', est_sales: 500 },
    { product_name: REAL.spell, est_sales: 4063 },
    { product_name: REAL.flag, est_sales: 1201 },
    { product_name: 'Mug, Mug, Mug', est_sales: 5 },
  ];

  it('counts every listing and reports the sample size', () => {
    const s = summarizeTitlePatterns(listings);
    expect(s.total).toBe(4);
    expect(s.sampleSize).toBe(4);
    expect(s.counts.long_keyword_rich).toBe(2);
    expect(s.counts.short_descriptive).toBe(1);
    expect(s.counts.stuffed).toBe(1);
  });

  it('percentages sum to about 100', () => {
    const s = summarizeTitlePatterns(listings);
    const sum = Object.values(s.percentages).reduce((a, b) => a + b, 0);
    expect(Math.abs(sum - 100)).toBeLessThanOrEqual(2); // rounding slack
  });

  it('minSales narrows to listings actually worth learning from', () => {
    const s = summarizeTitlePatterns(listings, { minSales: 1000 });
    expect(s.sampleSize).toBe(2);
    expect(s.total).toBe(4);          // total stays honest about what was excluded
    expect(s.counts.stuffed).toBe(0);
  });

  it('returns dominant null on a tie rather than picking arbitrarily', () => {
    const tied = [
      { product_name: 'Hockey Mom Tee', est_sales: 10 },
      { product_name: REAL.spell, est_sales: 10 },
    ];
    expect(summarizeTitlePatterns(tied).dominant).toBe(null);
  });

  it('survives an empty set without inventing a dominant pattern', () => {
    const s = summarizeTitlePatterns([]);
    expect(s.sampleSize).toBe(0);
    expect(s.dominant).toBe(null);
    expect(s.averageLength).toBe(null);
  });

  it('averages length only over titles that exist', () => {
    const s = summarizeTitlePatterns([
      { product_name: 'abcde', est_sales: 1 },
      { product_name: '', est_sales: 1 },
    ]);
    expect(s.averageLength).toBe(5);
  });

  it('exposes Etsy’s real field limit, not a TCC style rule', () => {
    expect(ETSY_TITLE_MAX).toBe(140);
  });
});
