import { FORMAT_TAXONOMY_VERSION } from '../../lib/productTruth';

// Listing Intelligence Milestone A — bumped when generate-listing-v2.js's
// prompt/schema or productTruth.js's taxonomy changes meaningfully. One
// combined version (not tracked separately) since they change together in
// practice — see productTruth.js's own FORMAT_TAXONOMY_VERSION comment.
export const GENERATION_VERSION = `milestone-a-${FORMAT_TAXONOMY_VERSION}`;

export const TITLE_STRATEGIES = [
  // Hybrid is the default -- see TITLE_STRATEGY_INSTRUCTIONS in
  // netlify/functions/generate-listing-v2.js for the reasoning (front zone
  // carries click-through, tail carries matching coverage). The other two stay
  // selectable so title strategy remains a real, comparable experiment
  // dimension in Portfolio rather than a house rule nobody can test.
  { key: 'hybrid', label: 'Hybrid' },
  { key: 'buyer_clear', label: 'Buyer Clear' },
  { key: 'expanded_keyword_test', label: 'Expanded Keyword Test' },
  { key: 'manual', label: 'Manual' },
];

// Display-only labels for values the migration backfilled onto older
// products — never added to TITLE_STRATEGIES, so they're never offered as
// a live pick, but a loaded old product's value still needs to be legible
// as *something* rather than showing 3 unhighlighted buttons and nothing
// else (confirmed live: that's exactly what happened before this existed).
export const LEGACY_TITLE_STRATEGY_LABELS = {
  legacy_keyword_rich: 'Keyword Rich',
  legacy_short_clean: 'Short & Clean',
};

export const BRAND_VOICE_FALLBACK = `THE THREE GEARS
Aspirational: "You already know who you are. This is just the shirt that proves it."
Honest & Grounding: "It's not always beautiful. But it's always real."
Sarcastic & Warm: "Fine. You didn't ask for advice. Here's a shirt instead."

TARGET CUSTOMER VOICE
Present, capable, carries chaos lightly — without performing it.
She's not surviving motherhood as a brand. She just lives it.
✅ Dry, specific, occasionally delighted by small things
❌ No Hallmark energy — no sappy, wistful, or inspirational-quote copy
❌ No "Every moment is precious" / "You are enough" / "You've got this"
❌ No wistful past-tense ("Remember when…") — she lives in the present tense`;

// "SEO Opener" renamed to "Listing Opener" (Milestone A) — the old hint
// explicitly asked for "keyword-dense" copy, which is exactly the framing
// this rebuild removes; the new prompt (generate-listing-v2.js) never
// instructs keyword density for this section.
export const DESC_META = {
  opener:             { label: 'Listing Opener',    hint: 'Warm, specific, natural — not keyword-dense filler' },
  product_details:   { label: 'Product Details',    hint: 'Size, color, material, format, what\'s included' },
  ordering_steps:    { label: 'Ordering Steps',     hint: 'How to order, customize, or download' },
  cross_sell:        { label: 'Cross-Sell',         hint: 'Shop our [collection] for more designs like this…' },
  shipping:          { label: 'Shipping',           hint: 'Only shown if a shipping policy is confirmed in Product Truth' },
  brand_voice_closer:{ label: 'Brand Voice Closer', hint: '1–2 sentences, TCC voice, no Hallmark energy' },
};

export const SEASONS = ['Halloween', 'Christmas', "Valentine's Day", "Mother's Day", 'Back to School', '4th of July', 'Summer', 'Spring', 'Fall'];

// Was independently duplicated in both Zone2SearchStrategy.jsx and
// Zone3Listing.jsx (Milestone B) — consolidated here (Milestone C2) rather
// than adding a third copy for the new Version History cards.
export const INTENT_STATUS_STYLE = {
  validated: { bg: 'rgba(124,175,138,0.2)', color: '#2d6b3c' },
  supported: { bg: 'rgba(232,168,124,0.2)', color: '#7a4a1e' },
};

// listing_generations.trigger — only these two values are ever written
// (confirmed via full-repo grep, generation.js's own handleGenerate call
// site), for Version History's collapsed-row label (Milestone C2).
export const TRIGGER_LABELS = {
  initial_generation: 'Initial generation',
  manual_regenerate: 'Manual regenerate',
};
