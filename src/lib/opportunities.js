// ─── Opportunities — "what should I build right now" ───────────────────────
// Pure, deterministic, no AI/DB calls — same house style as
// timingIntelligence.js, which supplies the timing half.
//
// WHAT THIS ANSWERS
// The timing engine already says which niches are in an open window. On its
// own that is a calendar, not a decision: "Halloween is in BUILD_NOW" does not
// tell you whether to act. This joins that to two things you already know —
// what research exists for it, and whether you already sell into it — so the
// answer becomes visible rather than inferred.
//
// The strongest signal in the whole app is an OPEN WINDOW WITH ZERO COVERAGE:
// a market whose timing says build now, where research exists, and where you
// currently sell nothing. That combination is what this exists to surface.
//
// WHAT IT DOES NOT DO
// No score, no ranking beyond timing urgency, and no "do this first". Ordering
// is by the timing engine's own STATE_URGENCY_ORDER — a real, sourced calendar
// position — never by a blended number. §15's ban on collapsing multi-source
// evidence into one opaque figure applies here as much as to keywords: an
// "opportunity score" would hide exactly the tradeoff being surfaced.

import { STATE_URGENCY_ORDER, TIMING_STATES } from './timingIntelligence.js';
import { descendantsOf } from './niches.js';

// The states that call for work now. LATE_WINDOW is included on purpose — a
// closing window is still actionable, and often more urgent than an open one.
export const ACTIONABLE_STATES = [
  TIMING_STATES.LIST_NOW,
  TIMING_STATES.BUILD_NOW,
  TIMING_STATES.DESIGN_NOW,
  TIMING_STATES.RESEARCH_NOW,
  TIMING_STATES.LATE_WINDOW,
];

// Loose text match between a niche name and free text, used only to SUGGEST
// sparks that may belong to a niche nobody has classified yet. Deliberately
// crude: it exists so the feature is useful before 382 sparks are classified,
// not to replace classifying them. It never writes anything and its results
// are always labelled as suggestions.
//
// Matches on whole words so "Reading" does not match "threading", and requires
// a token of 4+ characters so short niche names cannot match half the vault.
//
// The stoplist is load-bearing, not tidiness. Taylor's calendar contains names
// like "Honeymoon/Just Married" and "Family Vacation", whose tokens "just" and
// "family" appear in an enormous share of ordinary spark text. Left in, one
// common word made an unrelated niche look like it had matching ideas — which
// put Honeymoon and Maternity at the top of Home as opportunities on the first
// real run. A false match is worse than a missed one: a missed spark gets
// classified later, a false one sends you to build the wrong thing.
const MATCH_STOPWORDS = new Set([
  'just', 'with', 'from', 'this', 'that', 'your', 'their', 'other', 'more',
  'like', 'want', 'need', 'make', 'made', 'best', 'good', 'love', 'gift',
  'gifts', 'shirt', 'shirts', 'tees', 'idea', 'ideas', 'season', 'themes',
  'related', 'general', 'events', 'party', 'family', 'home', 'time', 'people',
  // Calendar-entry scaffolding. Taylor names entries "Midwifery Week",
  // "Principal Month", "Breast Cancer Awareness" — and "week"/"month"/"day"
  // appear constantly in ordinary spark text, so on the first real run
  // "Midwifery Week" matched 9 unrelated sparks purely on the word "week".
  // The distinctive half of each name still matches.
  'week', 'weeks', 'month', 'months', 'national', 'awareness', 'annual',
]);

export function looseNicheMatch(nicheName, text) {
  const name = String(nicheName || '').toLowerCase();
  const hay = String(text || '').toLowerCase();
  if (!name || !hay) return false;
  const tokens = name
    .split(/[^a-z0-9]+/)
    .filter(t => t.length >= 4 && !MATCH_STOPWORDS.has(t));
  if (!tokens.length) return false;
  return tokens.some(t => new RegExp(`\\b${t}`, 'i').test(hay));
}

// One opportunity per actionable niche.
//
// timingResults comes straight from buildNicheTimings(). Each carries its
// linkedCollections, which is how a SOURCE niche (Taylor's calendar) reaches
// TCC's own data — those links are human-made and deliberately never inferred
// from names, so a niche with no linked collection genuinely has no coverage
// or research to report, and says so rather than guessing.
export function buildOpportunities({
  timingResults = [],
  products = [],
  keywords = [],
  sparks = [],
  // Taxonomy bridge: rows of { niche_id, timing_niche_id } from
  // niche_timing_niches, plus the niche tree itself.
  nicheTimingLinks = [],
  niches = [],
} = {}) {
  const actionable = timingResults.filter(r => ACTIONABLE_STATES.includes(r?.timing?.state));

  // Timing calendar niche -> the TCC taxonomy niches linked to it, expanded to
  // include descendants so a calendar entry linked to "Reading" also covers
  // "Book Lover" and "Romance Reader" beneath it.
  //
  // This path exists because the original one is empty in practice:
  // timing_niche_collections has zero rows, so routing coverage through
  // collections found nothing for any niche. The taxonomy route has real data
  // (34 links, 26 classified products), which is the difference between a
  // feature that works today and one that waits on a linking job nobody has
  // done. Collections are still honoured below where they exist — this is
  // additive, not a replacement.
  const taxonomyByTiming = new Map();
  for (const link of nicheTimingLinks) {
    const ids = taxonomyByTiming.get(link.timing_niche_id) || new Set();
    ids.add(link.niche_id);
    for (const d of descendantsOf(link.niche_id, niches)) ids.add(d.id);
    taxonomyByTiming.set(link.timing_niche_id, ids);
  }

  const opportunities = actionable.map(r => {
    const collectionNames = new Set((r.linkedCollections || []).map(c => c.name));
    const nicheIds = taxonomyByTiming.get(r.niche?.id) || new Set();
    const hasAnyLink = collectionNames.size > 0 || nicheIds.size > 0;

    // Either route counts. A product reached through the taxonomy and one
    // reached through a collection are the same product to the person reading
    // this, so the union is what they mean by "do I sell here".
    const inScope = p => nicheIds.has(p.primary_niche_id) || collectionNames.has(p.collection);

    const liveProducts = products.filter(p => p.stage === 'Live' && inScope(p));
    const inProgress = products.filter(
      p => !['Live', 'Killed', 'Paused'].includes(p.stage) && inScope(p)
    );

    const nicheKeywords = keywords.filter(
      k => nicheIds.has(k.research_sessions?.niche_id)
        || collectionNames.has(k.research_sessions?.collection)
    );
    const bestKeyword = nicheKeywords
      .filter(k => k.volume != null)
      .sort((a, b) => (b.volume || 0) - (a.volume || 0))[0] || null;

    // Sparks already filed to one of this niche's collections — a real link,
    // not a guess.
    const linkedSparks = sparks.filter(
      s => !s.archived_at
        && (nicheIds.has(s.primary_niche_id) || collectionNames.has(s.collection_tag))
    );
    // Plus unfiled sparks whose text mentions the niche. Kept separate from
    // linkedSparks throughout, and labelled as suggestions in the UI, because
    // presenting a text match as a classification is how a guess becomes a
    // fact nobody remembers making.
    const suggestedSparks = sparks.filter(
      s => !s.archived_at
        && !nicheIds.has(s.primary_niche_id)
        && !collectionNames.has(s.collection_tag)
        && looseNicheMatch(r.niche?.name, s.content)
    );

    return {
      niche: r.niche,
      timing: r.timing,
      linkedCollections: r.linkedCollections || [],
      liveCount: liveProducts.length,
      inProgressCount: inProgress.length,
      keywordCount: nicheKeywords.length,
      bestKeyword,
      linkedSparks,
      suggestedSparks,
      // The headline case: window open, nothing live, and something to work
      // from. Two guards, both learned from the first run against real data:
      //   - Requires EVIDENCE. An empty niche with no research and no ideas is
      //     not an opportunity, it is a blank.
      //   - Requires a LINKED COLLECTION. Without one, liveProducts is zero
      //     because nothing CAN be counted, not because nothing is there, and
      //     "nothing live here yet" would be an absence of measurement
      //     reported as a finding.
      isUncovered: hasAnyLink
        && liveProducts.length === 0
        && (nicheKeywords.length > 0 || linkedSparks.length > 0 || suggestedSparks.length > 0),
      // No linked collection at all: nothing here is knowable, and the fix is
      // a one-off human link rather than more research.
      needsLink: !hasAnyLink,
    };
  });

  // Timing urgency only. Within a state, uncovered niches come first — that is
  // still not a score, just "you sell nothing here" sorting above "you already
  // do", which is the ordering the reader would apply themselves anyway.
  return opportunities.sort((a, b) => {
    const sa = STATE_URGENCY_ORDER.indexOf(a.timing.state);
    const sb = STATE_URGENCY_ORDER.indexOf(b.timing.state);
    if (sa !== sb) return sa - sb;
    if (a.isUncovered !== b.isUncovered) return a.isUncovered ? -1 : 1;
    const da = a.timing.daysRemaining ?? Infinity;
    const db = b.timing.daysRemaining ?? Infinity;
    return da - db;
  });
}

// Counts for a headline line. No percentages and no health score — just how
// many of each thing there are, so an empty state reads as empty rather than
// as a bad number.
export function summarizeOpportunities(opportunities) {
  return {
    total: opportunities.length,
    uncovered: opportunities.filter(o => o.isUncovered).length,
    needingLink: opportunities.filter(o => o.needsLink).length,
    withResearch: opportunities.filter(o => o.keywordCount > 0).length,
  };
}
