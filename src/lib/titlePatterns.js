// ─── Competitor Title Patterns (Phase 7 / §17) ─────────────────────────────
// Pure, deterministic, no AI/DB calls — same house style as keywords.jsx's
// assignBucket() and keywordIntelligence.js.
//
// WHY THIS EXISTS
// The title debate (§15–16) has two sources that appear to contradict each
// other: Etsy's official guidance favours short readable titles, while current
// best sellers overwhelmingly use long comma-separated keyword-rich ones. §25
// is explicit that neither automatically wins and that both must stay visible
// as separate evidence streams. This module turns the second one from an
// impression into a measurement, over the 3,001 real competitor titles already
// stored in competitor_listings.product_name.
//
// MEASUREMENT, NOT JUDGEMENT
// Everything here is computed from the title text itself — length, how many
// comma-separated phrases it carries, and how much those phrases repeat. None
// of it decides whether a pattern is GOOD; that is the Analysis layer's job
// and ultimately TCC's own performance data. Deliberately no scoring, ranking
// or recommendation in this file.
//
// NOTHING IS WRITTEN. Patterns are derived on read rather than stored on
// competitor_listings, which is what keeps this clear of §29's "no full
// historical competitor/title reclassification" — there is nothing to
// reclassify because nothing is classified at rest. It also means a threshold
// change below takes effect everywhere immediately instead of needing a
// re-run over 3,001 rows.

export const TITLE_PATTERNS = [
  'short_descriptive',
  'medium_keyword_rich',
  'long_keyword_rich',
  'stuffed',
  'other',
];

export const TITLE_PATTERN_LABELS = {
  short_descriptive:   'Short descriptive',
  medium_keyword_rich: 'Medium keyword-rich',
  long_keyword_rich:   'Long keyword-rich',
  stuffed:             'Highly repetitive',
  other:               'Other',
};

// Etsy's own maximum, for reference in the UI — not a TCC rule (§15 forbids
// inventing a short-title rule; this is the platform's field limit).
export const ETSY_TITLE_MAX = 140;

// TCC's own judgment calls, exactly like assignBucket()'s 200/10,000/100,000
// cutoffs. Tune them here; nothing downstream depends on the exact numbers,
// only on classifyTitlePattern() always returning one of TITLE_PATTERNS.
const SHORT_MAX_CHARS = 60;
const MEDIUM_MAX_CHARS = 100;
// A significant word appearing in this many separate phrases reads as padding
// rather than description — "hockey mom shirt, hockey mom tee, hockey mom gift".
const REPEAT_SEGMENT_THRESHOLD = 3;
// …or, independent of any single word, this share of all significant words
// being repeats.
const REPEAT_RATIO_THRESHOLD = 0.4;

// Words too common to signal padding when repeated. Kept small on purpose —
// an aggressive stoplist would hide the exact repetition this is looking for.
const STOPWORDS = new Set([
  'a', 'an', 'and', 'for', 'from', 'in', 'of', 'on', 'or', 'the', 'to', 'with', '&',
]);

// Etsy titles separate phrases with commas, and occasionally pipes or bullets.
// Hyphens are NOT separators — "t-shirt" is one word.
function splitSegments(title) {
  return String(title || '')
    .split(/[,|•·]+/)
    .map(s => s.trim())
    .filter(Boolean);
}

function significantWords(text) {
  return String(text || '')
    .toLowerCase()
    // Strip HTML entities that survive Etsy scraping (&#39; and friends)
    // before punctuation, or the entity's own letters become fake words.
    .replace(/&#?\w+;/g, ' ')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1 && !STOPWORDS.has(w));
}

// How much a title repeats itself: the share of significant words that are
// not their first occurrence, plus whether any single word spans enough
// separate phrases to read as deliberate padding.
export function measureRepetition(title) {
  const segments = splitSegments(title);
  const words = significantWords(title);
  if (!words.length) return { ratio: 0, maxSegmentSpread: 0, segments: segments.length };

  const counts = new Map();
  for (const w of words) counts.set(w, (counts.get(w) || 0) + 1);
  const repeats = [...counts.values()].reduce((sum, n) => sum + (n - 1), 0);

  // Per-word segment spread — counts DISTINCT phrases a word appears in, so
  // "hockey hockey" inside one phrase does not look like padding while
  // "hockey mom shirt, hockey mom tee, hockey mom gift" does.
  let maxSegmentSpread = 0;
  for (const w of counts.keys()) {
    const spread = segments.filter(seg => significantWords(seg).includes(w)).length;
    if (spread > maxSegmentSpread) maxSegmentSpread = spread;
  }

  return { ratio: repeats / words.length, maxSegmentSpread, segments: segments.length };
}

export function classifyTitlePattern(title) {
  const text = String(title || '').trim();
  if (!text) return 'other';

  const { ratio, maxSegmentSpread } = measureRepetition(text);

  // Repetition wins over length: a short title that says the same thing three
  // times is padded, not concise, and a long one built from genuinely distinct
  // phrases is coverage rather than stuffing. Length alone cannot tell those
  // apart, which is the whole reason this check runs first.
  if (maxSegmentSpread >= REPEAT_SEGMENT_THRESHOLD || ratio >= REPEAT_RATIO_THRESHOLD) {
    return 'stuffed';
  }

  if (text.length <= SHORT_MAX_CHARS) return 'short_descriptive';
  if (text.length <= MEDIUM_MAX_CHARS) return 'medium_keyword_rich';
  return 'long_keyword_rich';
}

// Distribution across a set of listings. Returns counts, percentages and the
// sample size — never a "winner", and never a recommendation.
//
// minSales filters to listings actually worth learning from: §17 asks about
// BEST SELLERS specifically, and a pattern shared by 3,000 listings that
// mostly do not sell says nothing. Returns the filtered sample size alongside
// the total so a distribution can never be read as more evidence than it is.
export function summarizeTitlePatterns(listings, { minSales = 0, titleField = 'product_name', salesField = 'est_sales' } = {}) {
  const all = listings || [];
  const sample = minSales > 0
    ? all.filter(l => (Number(l?.[salesField]) || 0) >= minSales)
    : all;

  const counts = Object.fromEntries(TITLE_PATTERNS.map(p => [p, 0]));
  let lengthSum = 0;
  let lengthN = 0;

  for (const l of sample) {
    const title = l?.[titleField];
    counts[classifyTitlePattern(title)] += 1;
    const len = String(title || '').trim().length;
    if (len) { lengthSum += len; lengthN += 1; }
  }

  const n = sample.length;
  return {
    total: all.length,
    sampleSize: n,
    minSales,
    counts,
    // Rounded for display; the raw counts stay available so nobody has to
    // reverse a percentage back into a number.
    percentages: Object.fromEntries(
      TITLE_PATTERNS.map(p => [p, n ? Math.round((counts[p] / n) * 100) : 0])
    ),
    averageLength: lengthN ? Math.round(lengthSum / lengthN) : null,
    // The single most common pattern, or null on a tie or an empty sample.
    // Null rather than an arbitrary pick — a tie is a real finding.
    dominant: (() => {
      if (!n) return null;
      const sorted = TITLE_PATTERNS
        .map(p => [p, counts[p]])
        .filter(([, c]) => c > 0)
        .sort((a, b) => b[1] - a[1]);
      if (!sorted.length) return null;
      if (sorted.length > 1 && sorted[0][1] === sorted[1][1]) return null;
      return sorted[0][0];
    })(),
  };
}
