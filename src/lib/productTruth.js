// ─── Product Truth — deterministic format/brand/permission logic ──────────
// (Listing Intelligence Milestone A)
//
// Pure, deterministic functions — no AI, no DB access — mirroring the house
// style of keywordIntelligence.js/visualTaxonomy.js. This is the one part of
// the listing-generation pipeline that must never depend on the AI behaving
// correctly: it exists specifically because a Comfort Colors 1717 T-SHIRT
// was once assigned "hockey mom SWEATSHIRT" as its anchor keyword, with
// nothing in the system checking whether the keyword's format matched the
// product. checkFormatCompatibility() below is the hard, un-bypassable gate
// that replaces that gap.
//
// Matching is token-boundary-safe, not substring matching, on purpose:
// "hockey mom sweatshirt".includes("shirt") is true, which would wrongly
// classify a sweatshirt keyword as t-shirt-compatible — exactly backwards.
// Tokenizing splits on whitespace, so "sweatshirt" is one indivisible token
// that a single-token phrase like "shirt" can never match against — the bug
// is prevented by construction, not by a special case for this one example.
// tokenize()/containsSubsequence() now live in textMatch.js — Phase 21's SEO
// gap analysis needs the exact same primitive, so it has one shared home
// instead of a second copy.
import { tokenize, containsSubsequence } from './textMatch.js';

// Extends the format vocabulary already used (advisory-only, pre-Milestone-A)
// in ListingBuilder.jsx's FORMAT_TERMS array, now grouped into canonical
// formats so "t-shirt"/"tee"/"shirt" are recognized as the same product and
// "sweatshirt"/"crewneck" as a different one. beanie/hat and notebook/journal
// are deliberately kept as SEPARATE groups even though colloquially related —
// they're commonly distinct blanks/SKUs in a POD shop, and merging them risks
// exactly the cross-format bug this file exists to prevent.
// Every phrase includes its natural plural — a plain token-equality check
// (see containsSubsequence below) treats "sweatshirt" and "sweatshirts" as
// unrelated tokens, so a plural-only keyword like real research data's
// "hockey sweatshirts" would otherwise match no phrase at all and fall
// through as format 'unknown' (unfiltered) rather than 'incompatible'.
// Confirmed live: the first real end-to-end generation run against actual
// Hockey collection research let "hockey sweatshirts" through as a tag for
// exactly this reason. Deliberately explicit plural entries, not a stemmer —
// a generic singular/plural heuristic risks the same kind of accidental
// cross-format match this file exists to prevent.
export const FORMAT_GROUPS = {
  't-shirt': ['t-shirt', 't-shirts', 'tshirt', 'tshirts', 'tee shirt', 'tee shirts', 'tee', 'tees', 'shirt', 'shirts'],
  'sweatshirt': ['sweatshirt', 'sweatshirts', 'crewneck sweatshirt', 'crewneck sweatshirts', 'crewneck', 'crewnecks'],
  'hoodie': ['hoodie', 'hoodies'],
  'sweater': ['sweater', 'sweaters'],
  'tank': ['tank top', 'tank tops', 'tank', 'tanks'],
  'tote': ['tote bag', 'tote bags', 'tote', 'totes'],
  'mug': ['mug', 'mugs'],
  'sticker': ['sticker', 'stickers'],
  'ornament': ['ornament', 'ornaments'],
  'blanket': ['blanket', 'blankets'],
  'beanie': ['beanie', 'beanies'],
  'hat': ['hat', 'hats'],
  'phone_case': ['phone case', 'phone cases'],
  'notebook': ['notebook', 'notebooks'],
  'journal': ['journal', 'journals'],
  'poster': ['poster', 'posters'],
  'print': ['print', 'prints'],
};

export const PRODUCT_FORMATS = Object.keys(FORMAT_GROUPS);

const FORMAT_PHRASE_INDEX = Object.entries(FORMAT_GROUPS).flatMap(([format, phrases]) =>
  phrases.map(phrase => ({ format, tokens: tokenize(phrase), length: tokenize(phrase).length }))
);

// The format a keyword's own text implies, independent of any product.
// format: null means the keyword names no recognized format at all (the
// common case — most keywords, e.g. "hockey mom gift", don't mention a
// garment). ambiguous: true means phrases from more than one canonical
// group matched at the same (longest) specificity — deliberately NOT
// resolved to a guess; checkFormatCompatibility() below treats this as
// incompatible rather than picking one, since over-excluding a possibly-
// fine keyword is cheap and under-excluding a wrong-format one is the
// exact failure this file exists to prevent.
export function detectImpliedFormat(keywordText) {
  const tokens = tokenize(keywordText);
  const matches = FORMAT_PHRASE_INDEX.filter(p => containsSubsequence(tokens, p.tokens));
  if (!matches.length) return { format: null, ambiguous: false };
  const maxLen = Math.max(...matches.map(m => m.length));
  const longest = matches.filter(m => m.length === maxLen);
  const distinctFormats = new Set(longest.map(m => m.format));
  if (distinctFormats.size > 1) return { format: null, ambiguous: true };
  return { format: [...distinctFormats][0], ambiguous: false };
}

// 'compatible' | 'incompatible' | 'unknown'.
// unknown covers two different situations, both meaning "nothing to
// exclude": the keyword names no format at all, or the product's own
// format hasn't been set yet (a Product Truth gap to surface elsewhere,
// not a reason to silently block every keyword).
export function checkFormatCompatibility(keywordText, productFormat) {
  if (!productFormat) return 'unknown';
  const { format, ambiguous } = detectImpliedFormat(keywordText);
  if (ambiguous) return 'incompatible';
  if (format === null) return 'unknown';
  return format === productFormat ? 'compatible' : 'incompatible';
}

// Carries forward the existing BRAND_TERMS mechanism (ListingBuilder.jsx,
// pre-Milestone-A) — a real, already-working advisory feature the rewrite
// must not silently drop. 'bella+canvas'/'bella canvas' canonicalize to one
// brand; everything else is one phrase each.
export const BRAND_GROUPS = {
  comfort_colors: ['comfort colors'],
  gildan: ['gildan'],
  bella_canvas: ['bella+canvas', 'bella canvas'],
  next_level: ['next level'],
};

export const BLANK_BRANDS = Object.keys(BRAND_GROUPS);

const BRAND_PHRASE_INDEX = Object.entries(BRAND_GROUPS).flatMap(([brand, phrases]) =>
  phrases.map(phrase => ({ brand, tokens: tokenize(phrase) }))
);

// Brand IDs mentioned in `text` that are NOT `expectedBrand` — conflicting
// claims (e.g. generated copy says "Gildan" when blank_brand is Comfort
// Colors) a post-generation validator should flag.
export function checkBrandMention(text, expectedBrand) {
  const tokens = tokenize(text);
  const mentioned = new Set();
  for (const p of BRAND_PHRASE_INDEX) {
    if (containsSubsequence(tokens, p.tokens)) mentioned.add(p.brand);
  }
  mentioned.delete(expectedBrand);
  return [...mentioned];
}

// Bumped when FORMAT_GROUPS/BRAND_GROUPS change meaningfully — folded into
// the orchestrating code's own generation_version string (one combined
// version, not tracked as a separate column) rather than a second field,
// since the taxonomy and the generation logic that consumes it change
// together in practice.
export const FORMAT_TAXONOMY_VERSION = '2026-08-15';

const TOPIC_LABELS = {
  shipping: 'shipping details (carriers, timelines, international shipping)',
  production_time: 'production or processing time',
  material: 'material or fabric composition',
  sizing: 'available sizes or size range',
  personalization: 'personalization',
  customization: 'customization',
  gift_wrap: 'gift wrapping',
};

// Unknown Product Truth means the generated copy does not discuss that
// fact AT ALL — not "the AI may infer carefully," not "flag it after the
// fact." personalization/customization/gift_wrap require an explicit
// `=== true` (both null AND false mean "don't claim it" — a confirmed
// false is just as much a reason not to offer it as an unknown is), while
// the four text fields only need to be non-null, since any actual value
// there is itself the fact to state.
export function computeDiscussionPermissions(productTruth) {
  const pt = productTruth || {};
  return {
    shipping: pt.shipping_policy != null,
    production_time: pt.production_time != null,
    material: pt.material != null,
    sizing: pt.size_range != null,
    personalization: pt.personalization_available === true,
    customization: pt.customization_available === true,
    gift_wrap: pt.gift_wrap_available === true,
  };
}

// Renders permissions into the two plain-language lists a generation
// prompt's PERMITTED/FORBIDDEN block is built from.
export function describeDiscussionPermissions(permissions) {
  const entries = Object.entries(permissions || {});
  return {
    permitted: entries.filter(([, ok]) => ok).map(([key]) => TOPIC_LABELS[key]).filter(Boolean),
    forbidden: entries.filter(([, ok]) => !ok).map(([key]) => TOPIC_LABELS[key]).filter(Boolean),
  };
}
