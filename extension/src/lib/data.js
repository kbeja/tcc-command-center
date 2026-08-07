import { getClient } from './supabase.js';

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
