// Write-capable capture endpoint for the iOS Shortcuts / Share Sheet mobile
// flow (Phase 15) -- called directly by a Shortcut on Kristen's phone, not
// from the React app. Mirrors extension/src/lib/data.js's saveSpark /
// saveWorkshopNote / saveMoodBoardImage field-for-field, adapted for the
// Node runtime (Buffer instead of Blob -- a Buffer carries no .type of its
// own, so contentType has to be passed explicitly on the storage upload,
// unlike the browser Blob version which gets it for free).

const { createClient } = require('@supabase/supabase-js');

const EXT_BY_MIME = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };

const LIMITS = {
  body: 5_500_000,
  imageBase64: 5_000_000, // below Netlify's real ~6MB platform ceiling, unlike
  content: 20_000,        // claude-process.js's 6,000,000 which leaves no headroom
};

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
// Guarded so a missing env var returns a friendly 500 per-request instead of
// throwing at module init (createClient(undefined, undefined) throws
// synchronously, which would break every invocation until redeploy).
const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // Unlike claude-process.js/fetch-image.js's optional FUNCTION_SECRET check
  // (silently skipped when unset), this endpoint is publicly reachable and
  // write-capable, meant to be called from anywhere -- fail closed rather
  // than silently allow every request through if never configured. A
  // dedicated secret, not shared with FUNCTION_SECRET, since this one has to
  // live in plaintext inside a Shortcut on a phone (no secure-field
  // primitive there) -- a more leak-prone location than Netlify's dashboard.
  if (!process.env.MOBILE_FUNCTION_SECRET) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Server misconfigured: MOBILE_FUNCTION_SECRET is not set.' }) };
  }
  if (event.headers['x-function-secret'] !== process.env.MOBILE_FUNCTION_SECRET) {
    return { statusCode: 403, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  if (!supabase) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Supabase not configured' }) };
  }

  if ((event.body?.length || 0) > LIMITS.body) {
    return { statusCode: 413, body: JSON.stringify({ error: 'Request too large' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { type, payload } = body || {};
  const now = new Date().toISOString();

  if (type === 'spark') {
    const { content, collectionTag } = payload || {};
    if (!content || typeof content !== 'string') {
      return { statusCode: 400, body: JSON.stringify({ error: 'content is required' }) };
    }
    if (content.length > LIMITS.content) {
      return { statusCode: 400, body: JSON.stringify({ error: 'content too large' }) };
    }
    const { data, error } = await supabase.from('sparks').insert({
      content,
      collection_tag: collectionTag || null,
      idea_type: 'Product Idea',
      temperature: 'cold',
      created_at: now,
      updated_at: now,
    }).select().single();
    if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ spark: data }) };
  }

  if (type === 'note') {
    const { content, source_url } = payload || {};
    if (!content || typeof content !== 'string') {
      return { statusCode: 400, body: JSON.stringify({ error: 'content is required' }) };
    }
    if (content.length > LIMITS.content) {
      return { statusCode: 400, body: JSON.stringify({ error: 'content too large' }) };
    }
    // Mirrors the extension's actual behavior (a real captured URL when
    // there is one, a label fallback when there isn't) rather than always
    // hardcoding a constant -- 'Mobile Capture', not the extension's own
    // 'Quick Capture', so Kristen can tell phone- vs desktop-sourced items
    // apart in the Workshop queue at a glance.
    const { data, error } = await supabase.from('workshop_items').insert({
      type: 'note',
      content,
      source: source_url || 'Mobile Capture',
      status: 'pending',
      created_at: now,
    }).select().single();
    if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note: data }) };
  }

  if (type === 'mood_board') {
    const { conceptId, conceptCode, base64, mediaType, label } = payload || {};
    if (!conceptId || typeof conceptId !== 'string') {
      return { statusCode: 400, body: JSON.stringify({ error: 'conceptId is required' }) };
    }
    if (!base64 || typeof base64 !== 'string') {
      return { statusCode: 400, body: JSON.stringify({ error: 'base64 is required' }) };
    }
    if (base64.length > LIMITS.imageBase64) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Image too large (max 5MB) — resize/compress before sending' }) };
    }
    if (!mediaType || !EXT_BY_MIME[mediaType]) {
      return { statusCode: 400, body: JSON.stringify({ error: 'mediaType must be one of: ' + Object.keys(EXT_BY_MIME).join(', ') }) };
    }

    // Defensive: strip a data: URI prefix if the Shortcut sent one (e.g.
    // "data:image/jpeg;base64,...") instead of raw base64.
    const clean = base64.includes(',') ? base64.split(',').pop() : base64;
    const buffer = Buffer.from(clean, 'base64');

    const ext = EXT_BY_MIME[mediaType];
    const slug = (conceptCode || conceptId).toLowerCase().replace(/[^a-z0-9]/g, '-');
    const path = `${slug}/${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage.from('design-vault').upload(path, buffer, {
      contentType: mediaType, // a Buffer has no .type of its own, unlike the
      cacheControl: '3600',   // browser Blob the extension's version uploads --
      upsert: false,          // omitting this would store the object with the
    });                       // wrong content-type and could break rendering later
    if (uploadError) {
      return { statusCode: 500, body: JSON.stringify({ error: uploadError.message }) };
    }

    const { data, error: dbError } = await supabase.from('concept_assets').insert({
      concept_id: conceptId,
      asset_type: 'mood_board',
      storage_path: path,
      mime_type: mediaType,
      size_bytes: buffer.length,
      label: label || 'Captured from iPhone',
      created_at: now,
    }).select().single();

    if (dbError) {
      // Roll back the orphaned storage upload rather than leaving it
      // dangling -- the extension's own saveMoodBoardImage doesn't do this
      // today, a deliberate small improvement here, not a silent deviation.
      await supabase.storage.from('design-vault').remove([path]);
      return { statusCode: 500, body: JSON.stringify({ error: dbError.message }) };
    }

    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ asset: data }) };
  }

  return { statusCode: 400, body: JSON.stringify({ error: `Unknown type: ${type}` }) };
};
