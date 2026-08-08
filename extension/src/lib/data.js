import { getClient } from './supabase.js';

const EXT_BY_MIME = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };

export async function fetchConcepts() {
  const supabase = await getClient();
  if (!supabase) return { data: [], error: new Error('Not configured') };
  const { data, error } = await supabase
    .from('concepts')
    .select('id, name, concept_code, collection_name')
    .eq('status', 'active')
    .order('collection_name', { ascending: true });
  return { data: data || [], error };
}

// Mirrors ConceptWorkspace.jsx's uploadAsset()/copyAssetToMoodBoard() shape —
// same design-vault bucket, same concept_assets row shape, tagged mood_board
// so it shows up on that concept's Mood Board tab in the main app.
export async function saveMoodBoardImage({ conceptId, conceptCode, base64, mediaType, label }) {
  const supabase = await getClient();
  if (!supabase) return { error: new Error('Not configured') };

  const byteChars = atob(base64);
  const bytes = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
  const blob = new Blob([bytes], { type: mediaType });

  const ext = EXT_BY_MIME[mediaType] || 'jpg';
  const slug = (conceptCode || conceptId).toLowerCase().replace(/[^a-z0-9]/g, '-');
  const path = `${slug}/${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage.from('design-vault').upload(path, blob, {
    cacheControl: '3600',
    upsert: false,
  });
  if (uploadError) return { error: uploadError };

  const { data, error } = await supabase
    .from('concept_assets')
    .insert({
      concept_id: conceptId,
      asset_type: 'mood_board',
      storage_path: path,
      mime_type: mediaType,
      size_bytes: blob.size,
      label: label || 'Captured image',
      created_at: new Date().toISOString(),
    })
    .select()
    .single();
  return { data, error };
}

// Fields Everbee's own CSV export computes but a live page can never expose
// (growth_rate, shop_age, avg_reviews, total_shop_sales, est_revenue) are
// simply omitted here rather than guessed — they stay whatever the DB
// default is (null) instead of being fabricated.
//
// Unlike EverbeeCSVImport's bulk upsert (which blindly overwrites
// first_seen_at on every re-import — fine for a full re-sync, not for a
// single ad-hoc capture), this checks for an existing row first so
// first_seen_at is only ever set once, on the row's actual first capture.
export async function saveCompetitorListing(fields) {
  const supabase = await getClient();
  if (!supabase) return { error: new Error('Not configured') };
  const now = new Date().toISOString();

  const { data: existing } = await supabase
    .from('competitor_listings')
    .select('id')
    .eq('product_link', fields.product_link)
    .maybeSingle();

  const row = {
    product_name: fields.product_name,
    product_link: fields.product_link,
    shop_name: fields.shop_name || null,
    shop_link: fields.shop_link || null,
    price: fields.price ?? null,
    category: fields.category || null,
    avg_reviews: fields.avg_reviews ?? null,
    total_reviews: fields.total_reviews ?? null,
    est_sales: fields.est_sales ?? null,
    est_total_sales: fields.est_total_sales ?? null,
    total_views: fields.total_views ?? null,
    conversion_rate: fields.conversion_rate ?? null,
    listing_age: fields.listing_age || null,
    total_favorites: fields.total_favorites ?? null,
    import_context: fields.import_context || 'Captured via Quick Capture extension',
    last_updated_at: now,
  };

  if (existing) {
    const { data, error } = await supabase
      .from('competitor_listings')
      .update(row)
      .eq('id', existing.id)
      .select()
      .single();
    return { data, error };
  }

  const { data, error } = await supabase
    .from('competitor_listings')
    .insert({ ...row, first_seen_at: now, white_space_flag: true })
    .select()
    .single();
  return { data, error };
}

export async function fetchCollections() {
  const supabase = await getClient();
  if (!supabase) return { data: [], error: new Error('Not configured') };
  const { data, error } = await supabase
    .from('collections')
    .select('name, chapter')
    .neq('status', 'archived')
    .order('name', { ascending: true });
  return { data: data || [], error };
}

export async function saveSpark({ content, collectionTag }) {
  const supabase = await getClient();
  if (!supabase) return { error: new Error('Not configured') };
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('sparks')
    .insert({
      content,
      collection_tag: collectionTag || null,
      idea_type: 'Product Idea',
      temperature: 'cold',
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();
  return { data, error };
}

export async function saveWorkshopNote({ content, source }) {
  const supabase = await getClient();
  if (!supabase) return { error: new Error('Not configured') };
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('workshop_items')
    .insert({ type: 'note', content, source: source || 'Quick Capture', status: 'pending', created_at: now })
    .select()
    .single();
  return { data, error };
}

// A single ad-hoc keyword capture (no volume/competition data — this is a
// quick note-to-self, not an Everbee import). Creates a lightweight research
// session to hold it since every keywords row needs one; the user can attach
// real metrics and re-bucket it from the Research page later.
export async function saveKeyword({ keyword, collection }) {
  const supabase = await getClient();
  if (!supabase) return { error: new Error('Not configured') };
  const now = new Date().toISOString();
  const { data: session, error: sessionError } = await supabase
    .from('research_sessions')
    .insert({
      collection,
      date: now.split('T')[0],
      source: 'Quick Capture',
      status: 'Needs More Data',
      notes: 'Captured via browser extension',
      seasonal: false,
      created_at: now,
    })
    .select()
    .single();
  if (sessionError || !session) return { error: sessionError };

  const { data: kw, error: kwError } = await supabase
    .from('keywords')
    .insert({
      keyword,
      tag_type: 'watch',
      research_session_id: session.id,
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();
  if (kwError) {
    // Roll back the session so we don't leave an orphaned empty one behind.
    await supabase.from('research_sessions').delete().eq('id', session.id);
    return { error: kwError };
  }
  return { data: kw };
}
