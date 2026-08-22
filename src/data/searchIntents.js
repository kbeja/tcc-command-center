// ─── Search Intent (Phase 8 / §5) ──────────────────────────────────────────
// Why a shopper is searching, as a durable property of the keyword itself.
//
// §5's core claim: "Keywords should not be treated as interchangeable just
// because they share the same niche." Two terms in the Hockey Mom research —
// "hockey mom sweatshirt" and "hockey mom gift" — belong to the same market
// but answer different questions, and §7 makes intent match a filtering step
// that runs BEFORE any opportunity scoring.
//
// NOT the same as listing_generation_keywords.relevance_category. That records
// what a keyword was judged to be for ONE listing, by the AI, on an immutable
// ledger row. This is set by a human, lives on the keyword, and is reused by
// every listing that touches it. Same shape, different lifetime and authority.

export const SEARCH_INTENTS = [
  'Identity',
  'Product',
  'Gift',
  'Recipient',
  'Occasion',
  'Seasonal',
  'Style / Message',
  'Broad / Parent',
  'Adjacent Discovery',
];

// §5's own worked examples, kept as the hint text — the classification only
// stays consistent if the difference is obvious at the moment of choosing.
export const SEARCH_INTENT_HINTS = {
  'Identity':           'Who the shopper is — "hockey mom", "romance reader".',
  'Product':            'A specific product — "hockey mom sweatshirt".',
  'Gift':               'Buying for someone else — "hockey mom gift".',
  'Recipient':          'Who it is for — "gift for hockey mom".',
  'Occasion':           'An event — "teacher appreciation", "graduation".',
  'Seasonal':           'Time-bound — "hockey mom christmas gift".',
  'Style / Message':    'Tone or slogan — "funny hockey mom".',
  'Broad / Parent':     'The wide category above this one — "hockey".',
  'Adjacent Discovery': 'Nearby territory worth watching, not a direct match.',
};

export const SEARCH_INTENT_STYLES = {
  'Identity':           { background: 'rgba(120,140,200,0.16)', color: '#1e306b' },
  'Product':            { background: 'rgba(124,175,138,0.16)', color: '#2d6b3c' },
  'Gift':               { background: 'var(--rose-faint)',      color: 'var(--dusty-rose)' },
  'Recipient':          { background: 'var(--rose-faint)',      color: 'var(--dusty-rose)' },
  'Occasion':           { background: 'rgba(232,168,124,0.2)',  color: '#7a4a1e' },
  'Seasonal':           { background: 'rgba(232,168,124,0.2)',  color: '#7a4a1e' },
  'Style / Message':    { background: 'rgba(107,130,168,0.15)', color: '#2d4270' },
  'Broad / Parent':     { background: 'rgba(43,41,38,0.08)',    color: 'var(--charcoal-soft)' },
  'Adjacent Discovery': { background: 'rgba(43,41,38,0.08)',    color: 'var(--charcoal-soft)' },
};

export const UNCLASSIFIED_INTENT = 'Unclassified';

export function searchIntentStyle(intent) {
  return SEARCH_INTENT_STYLES[intent]
    || { background: 'rgba(43,41,38,0.06)', color: 'var(--charcoal-soft)' };
}

// Which intents are safe to use on a listing of a given product type.
//
// Deliberately advisory and deliberately NOT a replacement for
// checkFormatCompatibility(). That function is the hard gate and works on the
// keyword TEXT ("hockey mom shirt" names a t-shirt); this works on the
// keyword's declared intent, which is a different axis. A Product-intent
// keyword still has to pass the format gate; an Identity-intent one is
// format-agnostic and never needed to.
//
// Returns a reason string when an intent is questionable for a listing, or
// null when it is fine. §13 warns against rigid automatic rules without
// testing, so nothing here excludes anything by itself — it explains.
export function intentAdvisory(intent, { isSeasonalListing = false } = {}) {
  if (intent === 'Seasonal' && !isSeasonalListing) {
    return 'Seasonal term on a listing with no seasonal overlay set.';
  }
  if (intent === 'Adjacent Discovery') {
    return 'Adjacent territory — useful for research, rarely right for a title.';
  }
  return null;
}
