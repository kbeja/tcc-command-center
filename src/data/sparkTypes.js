// ─── Spark Types (Phase 3) ─────────────────────────────────────────────────
// One shared vocabulary. Previously the list was duplicated verbatim in
// CaptureField.jsx, SparkCard.jsx and again as a default string in
// netlify/functions/mobile-capture.js — so adding a type meant finding all
// three, and the mobile capture path could silently drift from the UI's list.
//
// §9 expands the three original types to six. The three that existed were
// barely functioning as a classification at all: of 382 sparks, 379 carried
// 'Product Idea' purely because it was the column default. So these six are
// forward-looking — they exist to make NEW capture more precise, not to
// retroactively judge the backlog.
//
// Plain strings, not an enum or a lookup table. Every vocabulary in this
// schema is free text validated in JS (see the Phase 2a migration's note on
// why there are zero CHECK constraints anywhere), so a seventh type is a
// one-line change here and nothing else.

export const SPARK_TYPES = [
  'Product / Concept',
  'Phrase',
  'Niche / Market Idea',
  'Visual Direction',
  'Research Lead',
  'Strategy / Tool',
];

export const DEFAULT_SPARK_TYPE = 'Product / Concept';

// What each one is for, in Kristen's own framing from §9. Shown as hint text
// at capture time — the types only earn their keep if the difference between
// "Phrase" and "Product / Concept" is obvious in the half-second someone is
// deciding, otherwise everything lands on the default again.
export const SPARK_TYPE_HINTS = {
  'Product / Concept':   'A potential product.',
  'Phrase':              'A saying, fragment or hook — e.g. "Top Shelf, Where Momma Hides the Cookies".',
  'Niche / Market Idea': 'A customer segment worth exploring — e.g. Hockey Wife, Bookish Mom.',
  'Visual Direction':    'A design or aesthetic idea — e.g. dark academia crest, varsity stripes.',
  'Research Lead':       'Something to look into later — e.g. compare "rink mom" vs "hockey mom".',
  'Strategy / Tool':     'A way of working, or a tool worth trying.',
};

// Reuses the palette already in play across the app rather than introducing
// new hues — the same green/blue/amber/rose/indigo/neutral set used by the
// bucket badges, classification badges and niche level badges.
export const SPARK_TYPE_STYLES = {
  'Product / Concept':   { background: 'rgba(124,175,138,0.15)', color: '#2d6b3c' },
  'Phrase':              { background: 'var(--rose-faint)',      color: 'var(--dusty-rose)' },
  'Niche / Market Idea': { background: 'rgba(120,140,200,0.16)', color: '#1e306b' },
  'Visual Direction':    { background: 'rgba(232,168,124,0.2)',  color: '#7a4a1e' },
  'Research Lead':       { background: 'rgba(107,130,168,0.15)', color: '#2d4270' },
  'Strategy / Tool':     { background: 'rgba(43,41,38,0.08)',    color: 'var(--charcoal-soft)' },
};

// Legacy values from before Phase 3. The migration renames these in the
// database, but this exists so the UI stays correct regardless of whether the
// migration has run yet, and so a spark created by an older cached client (or
// restored from a backup) never renders as an unstyled unknown type.
const LEGACY_TYPE_MAP = {
  'Product Idea':  'Product / Concept',
  'Strategy Idea': 'Strategy / Tool',
  'Tool/Resource': 'Strategy / Tool',
};

export function normalizeSparkType(type) {
  const t = (type || '').trim();
  if (!t) return DEFAULT_SPARK_TYPE;
  if (SPARK_TYPES.includes(t)) return t;
  return LEGACY_TYPE_MAP[t] || DEFAULT_SPARK_TYPE;
}
