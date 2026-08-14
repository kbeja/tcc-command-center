// ─── Marketplace Visual Intelligence — controlled taxonomy (Phase 20) ──────
// Single source of truth for the 5 controlled-vocabulary categories a
// competitor listing's Visual Profile can be tagged against. Reused in three
// places that all need to agree: the migration's visual_tags seed insert,
// analyze-visual.js's tool-schema enum guidance for Claude, and any UI that
// needs to group VisualTagPicker calls by category.
//
// These lists are starter terms, not an exhaustive enum — Kristen's own spec
// explicitly ends the Motifs example list with "etc." and says "the taxonomy
// must remain extensible." visual_tags has no CHECK constraint tying it to
// this list; a listing can always be tagged with a brand-new term via
// VisualTagPicker's "+ Create" path, same as Concepts/Collections already do.
// Update this file when that happens so the vision prompt's enum guidance and
// the seed seen by future fresh databases stay reasonably current — it's a
// convenience default, not a hard boundary.
//
// Some terms deliberately appear under more than one category ("western" is
// both a Typography style and an Aesthetic; "modern patchwork" is both a
// Treatment and an Aesthetic) — that's real, not a copy/paste error. The
// competitor_listing_tags junction's primary key includes `category`
// specifically so the same visual_tags row can be applied twice on one
// listing under two different categories without conflict.

export const TAXONOMY_CATEGORIES = ['typography', 'composition', 'treatment', 'aesthetic', 'motif'];

export const CATEGORY_LABELS = {
  typography: 'Typography',
  composition: 'Composition',
  treatment: 'Treatment',
  aesthetic: 'Aesthetic',
  motif: 'Motifs',
};

export const TYPOGRAPHY_TERMS = [
  'varsity', 'collegiate', 'serif', 'editorial serif', 'retro serif', 'script',
  'handwritten', 'bubble', 'sans serif', 'condensed', 'western', 'blackletter',
  'mixed typography',
];

export const COMPOSITION_TERMS = [
  'arch', 'stacked', 'sandwich', 'grid', 'crest', 'badge', 'circular',
  'oversized center', 'minimal center', 'icon row', 'pocket + back',
];

export const TREATMENT_TERMS = [
  'clean', 'distressed', 'patchwork', 'modern patchwork', 'doodle', 'hand-drawn',
  'watercolor', 'halftone', 'embroidered-look', 'puff-look', 'vintage wash',
];

export const AESTHETIC_TERMS = [
  'elevated sports', 'coquette', 'romantic gothic', 'dark academia', 'preppy',
  'retro collegiate', 'minimalist', 'dopamine', 'western', 'camp', 'modern patchwork',
];

// Deliberately short and explicitly non-exhaustive — motifs are the most
// open-ended category by Kristen's own framing ("bow, skeleton, floral...
// etc."). These exist only to give the vision prompt a few concrete examples
// of the *kind* of thing a motif is, not a list to constrain against.
export const MOTIF_EXAMPLES = [
  'bow', 'skeleton', 'floral', 'hockey stick', 'football', 'books', 'ghost',
  'cherry', 'raccoon',
];

export const TERMS_BY_CATEGORY = {
  typography: TYPOGRAPHY_TERMS,
  composition: COMPOSITION_TERMS,
  treatment: TREATMENT_TERMS,
  aesthetic: AESTHETIC_TERMS,
  motif: MOTIF_EXAMPLES,
};

// Flat {name, category} pairs for seeding — one visual_tags row per unique
// name, one competitor_listing_tags-shaped category association per pairing.
// Cross-category terms (see file header) legitimately produce two entries
// with the same name here.
export const SEED_TAXONOMY = TAXONOMY_CATEGORIES.flatMap(category =>
  TERMS_BY_CATEGORY[category].map(name => ({ name, category }))
);
