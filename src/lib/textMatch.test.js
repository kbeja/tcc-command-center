// Bucket readout matching. The rendering is trivial; the matching is not —
// it has to agree with the Product Compatibility Gate and the SEO gap
// analysis about what "this title contains that keyword" means, and it has to
// avoid reporting the same piece of text twice under two overlapping phrases.
import { describe, it, expect } from 'vitest';
import { matchKeywordPhrases as matchedKeywords } from './textMatch.js';

const pool = [
  { keyword: 'hockey mom shirt', bucket: 1 },
  { keyword: 'hockey shirt', bucket: 3 },
  { keyword: 'hockey mom', bucket: 2 },
  { keyword: 'gift for her', bucket: 3 },
  { keyword: 'sweatshirt', bucket: 3 },
  { keyword: 'unbucketed phrase', bucket: null },
];

describe('matchedKeywords', () => {
  it('finds a researched phrase inside a real title', () => {
    const m = matchedKeywords('Hockey Mom Shirt, Comfort Colors Tee', pool);
    expect(m.map(k => k.keyword)).toContain('hockey mom shirt');
  });

  it('drops shorter phrases subsumed by a longer match on the same text', () => {
    // "hockey shirt" and "hockey mom" both technically appear inside
    // "hockey mom shirt"; reporting all three would triple-count one phrase.
    const m = matchedKeywords('Hockey Mom Shirt for Rink Days', pool);
    expect(m.map(k => k.keyword)).toEqual(['hockey mom shirt']);
  });

  it('keeps genuinely separate matches', () => {
    const m = matchedKeywords('Hockey Mom Shirt - Gift For Her', pool).map(k => k.keyword);
    expect(m).toContain('hockey mom shirt');
    expect(m).toContain('gift for her');
    expect(m).toHaveLength(2);
  });

  it('never matches across a word boundary', () => {
    // The bug this whole primitive exists to prevent: "sweatshirt" must not
    // be found inside "shirt", nor "hockey shirt" inside "hockey sweatshirt".
    expect(matchedKeywords('Hockey Sweatshirt', pool).map(k => k.keyword)).toEqual(['sweatshirt']);
    expect(matchedKeywords('Cozy Shirt', pool).map(k => k.keyword)).toEqual([]);
  });

  it('is case and punctuation insensitive', () => {
    expect(matchedKeywords('HOCKEY MOM, shirt!', pool).map(k => k.keyword)).toContain('hockey mom shirt');
  });

  it('returns an unbucketed keyword rather than hiding it', () => {
    const m = matchedKeywords('an unbucketed phrase here', pool);
    expect(m).toHaveLength(1);
    expect(m[0].bucket).toBeNull();
  });

  it('handles empty input without throwing', () => {
    expect(matchedKeywords('', pool)).toEqual([]);
    expect(matchedKeywords('Hockey Mom Shirt', [])).toEqual([]);
    expect(matchedKeywords(null, pool)).toEqual([]);
  });
});
