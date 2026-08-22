// ─── Visual tag kinds (Phase 4) ────────────────────────────────────────────
// §6 requires Design Style and Aesthetic / Trend to be distinct concepts.
// visual_tags was one undifferentiated pool of 54, so "show me every crest
// layout" and "show me everything dark academia" were the same query.
//
// Four kinds, not the two §6 names, because the real pool contains four axes
// in meaningful numbers (8 / 25 / 11 / 10). Collapsing typography into
// design_style would make "does script outperform serif here" unanswerable
// while "does a crest beat a stacked layout" stayed answerable, though they
// are the same shape of question. See
// supabase/migrations/20260822_classify_visual_tag_kinds.sql for the full
// reviewed assignment of every existing tag.

export const TAG_KINDS = ['aesthetic', 'design_style', 'typography', 'motif'];

export const TAG_KIND_LABELS = {
  aesthetic:    'Aesthetic',
  design_style: 'Design Style',
  typography:   'Typography',
  motif:        'Motif',
};

export const TAG_KIND_HINTS = {
  aesthetic:    'The overall vibe — dark academia, coquette, preppy.',
  design_style: 'How the artwork is built — crest, stacked, distressed.',
  typography:   'Letterforms — script, serif, blackletter.',
  motif:        'What is depicted — skeleton, bow, hockey stick.',
};

// Reuses the palette already in play (bucket badges, classification badges,
// niche level badges) rather than introducing four new hues.
export const TAG_KIND_STYLES = {
  aesthetic:    { background: 'var(--rose-faint)',      color: 'var(--dusty-rose)' },
  design_style: { background: 'rgba(124,175,138,0.16)', color: '#2d6b3c' },
  typography:   { background: 'rgba(120,140,200,0.16)', color: '#1e306b' },
  motif:        { background: 'rgba(232,168,124,0.2)',  color: '#7a4a1e' },
};

// Tags created before Phase 4, or created without picking a kind, sort here.
// Rendered as its own group rather than hidden — an invisible bucket is how
// half the vocabulary quietly stops being classified.
export const UNSORTED_KIND = '(unsorted)';

export const TAG_KIND_STYLES_WITH_UNSORTED = {
  ...TAG_KIND_STYLES,
  [UNSORTED_KIND]: { background: 'rgba(43,41,38,0.08)', color: 'var(--charcoal-soft)' },
};

export function tagKindLabel(kind) {
  return TAG_KIND_LABELS[kind] || 'Unsorted';
}

export function tagKindStyle(kind) {
  return TAG_KIND_STYLES_WITH_UNSORTED[kind] || TAG_KIND_STYLES_WITH_UNSORTED[UNSORTED_KIND];
}

// Groups a tag list into display order: the four real kinds first, unsorted
// last. Empty groups are dropped so a concept with only aesthetic tags does
// not render three empty headings.
export function groupTagsByKind(tags) {
  const groups = new Map();
  for (const kind of TAG_KINDS) groups.set(kind, []);
  groups.set(UNSORTED_KIND, []);
  for (const t of tags || []) {
    const key = TAG_KINDS.includes(t.kind) ? t.kind : UNSORTED_KIND;
    groups.get(key).push(t);
  }
  return [...groups.entries()]
    .filter(([, list]) => list.length)
    .map(([kind, list]) => ({
      kind,
      label: tagKindLabel(kind === UNSORTED_KIND ? null : kind),
      tags: [...list].sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    }));
}
