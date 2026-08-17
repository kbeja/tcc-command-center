// ─── Text matching — generic, dependency-free, token-boundary-safe ────────
//
// Extracted out of productTruth.js (Milestone A) so this primitive has one
// home instead of being duplicated for a second consumer (Phase 21's SEO
// gap analysis). A plain substring check is actively wrong for this kind of
// matching: "hockey mom sweatshirt".includes("shirt") is true, which would
// wrongly treat a sweatshirt keyword as t-shirt-compatible, or wrongly treat
// a "shirt"-only research keyword as already present in a listing whose
// title only says "sweatshirt". Tokenizing on whitespace makes "sweatshirt"
// one indivisible token that a single-token phrase like "shirt" can never
// match against — the bug is prevented by construction, not a special case.

export function tokenize(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

// True if `needle`'s tokens appear as a contiguous run inside `haystack`'s
// tokens — a phrase match, never a substring-of-one-token match.
export function containsSubsequence(haystack, needle) {
  if (!needle.length || needle.length > haystack.length) return false;
  for (let i = 0; i <= haystack.length - needle.length; i++) {
    let match = true;
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) { match = false; break; }
    }
    if (match) return true;
  }
  return false;
}

// Convenience wrapper for the common case: does `needlePhrase` appear as a
// contiguous token run somewhere in `haystackText`.
export function phraseAppearsIn(haystackText, needlePhrase) {
  const needle = tokenize(needlePhrase);
  if (!needle.length) return false;
  return containsSubsequence(tokenize(haystackText), needle);
}

// Which of `pool`'s researched keywords does `text` actually contain?
//
// Longest phrases are preferred: if a title contains "hockey mom shirt", the
// "hockey mom" and "hockey shirt" that also sit inside it are dropped as
// subsumed, so one piece of text is never reported three times under three
// overlapping phrases. Built on phraseAppearsIn(), so this agrees with the
// Product Compatibility Gate and the SEO gap analysis about what "contains"
// means rather than being a fourth, subtly different answer.
//
// Lives here rather than beside its component so the matching stays testable
// on its own and reusable by anything else that needs it.
export function matchKeywordPhrases(text, pool) {
  if (!text || !pool?.length) return [];
  const hits = pool
    .filter(k => k.keyword && phraseAppearsIn(text, k.keyword))
    .sort((a, b) => b.keyword.length - a.keyword.length);

  const kept = [];
  for (const hit of hits) {
    if (!kept.some(k => phraseAppearsIn(k.keyword, hit.keyword))) kept.push(hit);
  }
  return kept;
}
