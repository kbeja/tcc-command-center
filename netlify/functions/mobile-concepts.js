// Companion to mobile-capture.js's mood_board type -- lets an iOS Shortcut
// show a live "choose a Concept" picker before uploading an image, mirroring
// extension/src/lib/data.js's fetchConcepts().

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

async function handleRequest(event) {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // Same fail-closed reasoning as mobile-capture.js -- see the comment there.
  if (!process.env.MOBILE_FUNCTION_SECRET) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Server misconfigured: MOBILE_FUNCTION_SECRET is not set.' }) };
  }
  if (event.headers['x-function-secret'] !== process.env.MOBILE_FUNCTION_SECRET) {
    return { statusCode: 403, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  if (!supabase) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Supabase not configured' }) };
  }

  const { data, error } = await supabase
    .from('concepts')
    .select('id, name, concept_code, collection_name')
    .eq('status', 'active')
    .order('collection_name', { ascending: true });

  if (error) {
    console.error('[mobile-concepts] concepts select:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Request failed. Please try again.' }) };
  }

  // Bare array, not {concepts: [...]} like every other function's response —
  // the one deliberate deviation from that convention, so a Shortcut can
  // feed this straight into "Choose from List" without an extra "Get
  // Dictionary Value" unwrap step first. `label` is pre-formatted server-side
  // for the same reason — Shortcuts' native list picker only shows plain
  // strings cleanly, not dictionaries.
  const concepts = (data || []).map(c => ({
    id: c.id,
    concept_code: c.concept_code,
    name: c.name,
    collection_name: c.collection_name,
    label: `${c.collection_name} — ${c.name}${c.concept_code ? ` (${c.concept_code})` : ''}`,
  }));

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(concepts),
  };
}

// SEC-004 — see claude-process.js's identical wrapper comment for the full
// reasoning; same pattern applied here.
const ORIGIN = process.env.URL || '';

exports.handler = async (event) => {
  const result = await handleRequest(event);
  return { ...result, headers: { ...(result.headers || {}), 'Access-Control-Allow-Origin': ORIGIN } };
};
