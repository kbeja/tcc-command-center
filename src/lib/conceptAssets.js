// ─── Concept assets — the design-vault upload path ─────────────────────────
// Lifted out of ConceptWorkspace so the IMPORT modal can use the same code.
//
// Why that matters: the workflow is "talk a design through in chat, screenshot
// it, keep the screenshot with the brief". Until now the importer took text
// only, and images could be attached solely from a concept's own workspace —
// which you can only reach once the concept already exists. So the pictures
// arrived at the one moment there was nowhere to put them, and in practice
// they never got attached at all: the sole image in the whole system belonged
// to an archived test concept, while the one real concept had none.
//
// Nothing here is new behaviour. Same bucket, same path scheme, same row
// shape — one implementation instead of two.

import { supabase } from './supabase';

const EXT_BY_MIME = {
  'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png',
  'image/webp': 'webp', 'image/gif': 'gif',
};

// The two kinds of image a concept actually has, and they are genuinely
// different things rather than a tidy-up of one idea:
//
//   mood_board      — what it should FEEL like. Inspiration, references,
//                     palettes, things seen elsewhere. Never the product.
//   reference_image — the artwork itself, or a draft of it. This is the thing
//                     that becomes a listing.
//
// Keeping them apart is not bookkeeping. analyze-visual reads an artwork as a
// product image and a mood board as inspiration, and a mood board mistaken for
// artwork would put someone else's reference into a listing's visual profile.
// ConceptWorkspace already splits its galleries on exactly this line.
export const CONCEPT_ASSET_TYPES = [
  { key: 'reference_image', label: 'Artwork', hint: 'The design itself, or a draft of it' },
  { key: 'mood_board', label: 'Mood board', hint: 'Inspiration and references — not the product' },
];

export function assetTypeLabel(key) {
  return CONCEPT_ASSET_TYPES.find(t => t.key === key)?.label || key;
}

export function isSupportedAssetMime(mime) {
  return Object.prototype.hasOwnProperty.call(EXT_BY_MIME, mime);
}

// Upload one file into design-vault and record it against the concept.
// Storage first, row second: a row pointing at a file that failed to upload
// would render as a permanently broken thumbnail, whereas a file with no row
// is invisible and harmless.
export async function uploadConceptAsset(conceptId, conceptCode, file, assetType = 'reference_image', label = null) {
  const ext = (file.name && file.name.includes('.'))
    ? file.name.split('.').pop()
    : (EXT_BY_MIME[file.type] || 'jpg');
  const slug = (conceptCode || conceptId).toLowerCase().replace(/[^a-z0-9]/g, '-');
  const path = `${slug}/${Date.now()}-${Math.round(performance.now())}.${ext}`;

  const { error } = await supabase.storage.from('design-vault').upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  });
  if (error) throw error;

  const now = new Date().toISOString();
  const { data: assetRow, error: dbError } = await supabase
    .from('concept_assets')
    .insert({
      concept_id: conceptId,
      asset_type: assetType,
      storage_path: path,
      mime_type: file.type,
      size_bytes: file.size,
      label: label || file.name || 'Pasted image',
      created_at: now,
    })
    .select()
    .single();
  if (dbError) throw dbError;
  return assetRow;
}
