import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase';
import { daysBetween, today } from '../data/seasons';

// ─── Products ───────────────────────────────────────────────────────────────

export function useProducts() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    const { data } = await supabase
      .from('products')
      .select('*')
      .order('updated_at', { ascending: false });
    if (data) setProducts(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetch();
    const sub = supabase
      .channel('products-' + Math.random().toString(36).slice(2))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, fetch)
      .subscribe();
    return () => supabase.removeChannel(sub);
  }, [fetch]);

  return { products, loading, refetch: fetch };
}

export function useProduct(id) {
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!id) { setLoading(false); return; }
    try {
      const { data } = await supabase.from('products').select('*').eq('id', id).single();
      setProduct(data || null);
    } catch (err) {
      console.error('[useProduct] fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetch(); }, [fetch]);

  return { product, loading, refetch: fetch };
}

export async function updateProduct(id, updates) {
  const { data, error } = await supabase
    .from('products')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  return { data, error };
}

export async function deleteProduct(id) {
  return supabase.from('products').delete().eq('id', id);
}

export async function createProduct(product) {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('products')
    .insert({ ...product, created_at: now, updated_at: now })
    .select()
    .single();
  return { data, error };
}

// ─── Needs Attention ─────────────────────────────────────────────────────────

export function getNeedsAttention(products) {
  return products.filter(p => {
    if (['Killed', 'Paused'].includes(p.stage)) return false;
    const daysLive = p.went_live_at ? daysBetween(p.went_live_at, today()) : 0;
    if (p.stage === 'Live' && daysLive >= 30 && !p.total_sales) return true;
    if (p.stage === 'Live' && (p.ad_spend || 0) > 0 && (p.mo_sales || 0) === 0) return true;
    if (p.stage === 'Reviewing' && p.last_reviewed_at && daysBetween(p.last_reviewed_at, today()) > 7) return true;
    const daysInStage = p.stage_updated_at ? daysBetween(p.stage_updated_at, today()) : 0;
    if (!['Live', 'Killed', 'Paused'].includes(p.stage) && daysInStage >= 21) return true;
    return false;
  });
}

// Priority order for Pick Up Where You Left Off
const PICKUP_PRIORITY = ['Ready to Publish', 'SEO Ready', 'Assets Ready', 'Design Phase', 'Validated', 'Research'];

export function getPickUpProducts(products, n = 3) {
  const eligible = products.filter(p =>
    !['Killed', 'Paused', 'Live', 'Reviewing', 'Idea'].includes(p.stage)
  );
  if (!eligible.length) return [];
  return eligible.sort((a, b) => {
    const ai = PICKUP_PRIORITY.indexOf(a.stage);
    const bi = PICKUP_PRIORITY.indexOf(b.stage);
    if (ai !== bi) return ai - bi;
    return new Date(b.updated_at) - new Date(a.updated_at);
  }).slice(0, n);
}

// ─── Research Sessions ───────────────────────────────────────────────────────

export function useResearchSessions(collection) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    let query = supabase
      .from('research_sessions')
      .select('*, keywords(*)')
      .order('date', { ascending: false });
    if (collection) query = query.eq('collection', collection);
    const { data } = await query;
    if (data) setSessions(data);
    setLoading(false);
  }, [collection]);

  useEffect(() => { fetch(); }, [fetch]);
  return { sessions, loading, refetch: fetch };
}

export function useLatestSessionDates() {
  const [dates, setDates] = useState({});
  useEffect(() => {
    supabase.from('research_sessions').select('collection, date, created_at')
      .then(({ data }) => {
        if (!data) return;
        const map = {};
        for (const s of data) {
          const d = s.date || s.created_at?.slice(0, 10) || '';
          if (d && (!map[s.collection] || d > map[s.collection])) map[s.collection] = d;
        }
        setDates(map);
      });
  }, []);
  return dates;
}

export async function deleteResearchSession(id) {
  return supabase.from('research_sessions').delete().eq('id', id);
}

export async function deleteKeyword(id) {
  return supabase.from('keywords').delete().eq('id', id);
}

export async function updateKeyword(id, updates) {
  return supabase.from('keywords').update(updates).eq('id', id);
}

// Re-importing a keyword you already track (same collection, same text) updates
// the existing row in place — fresh volume/competition/score/bucket — instead of
// inserting a duplicate. The row's prior values are snapshotted to keyword_history
// first, so nothing is lost, it just stops cluttering the keyword bank.
// tags_only keywords (misspelling/tag variants) are always inserted fresh — they're
// not part of the bucket-ranked "current value" concept this merge is for.
export async function createResearchSession(session, keywords) {
  const now = new Date().toISOString();
  const { data: s, error } = await supabase
    .from('research_sessions')
    .insert({ ...session, created_at: now })
    .select()
    .single();
  if (error || !s) return { error };

  if (keywords?.length) {
    const mergeable = keywords.filter(k => !k.tags_only && k.keyword?.trim());
    const alwaysInsert = keywords.filter(k => k.tags_only || !k.keyword?.trim());

    let existingByKeyword = new Map();
    if (mergeable.length && session.collection) {
      const { data: existingRows } = await supabase
        .from('keywords')
        .select('id, keyword, volume, competition, score, updated_at, created_at, research_sessions!inner(collection, source)')
        .eq('research_sessions.collection', session.collection);
      for (const row of existingRows || []) {
        const key = (row.keyword || '').toLowerCase().trim();
        if (key && !existingByKeyword.has(key)) existingByKeyword.set(key, row);
      }
    }

    const toInsert = [];
    const toUpdate = [];
    const historyRows = [];

    for (const k of mergeable) {
      const match = existingByKeyword.get(k.keyword.toLowerCase().trim());
      if (match) {
        historyRows.push({
          keyword_id: match.id,
          keyword: match.keyword,
          volume: match.volume,
          competition: match.competition,
          score: match.score,
          source: match.research_sessions?.source || null,
          recorded_at: match.updated_at || match.created_at,
        });
        toUpdate.push({
          id: match.id,
          keyword: k.keyword,
          volume: k.volume ?? null,
          competition: k.competition ?? null,
          score: k.score ?? null,
          tag_type: k.tag_type,
          bucket: k.bucket ?? null,
          bucket_source: k.bucket_source ?? null,
          research_session_id: s.id,
          updated_at: now,
        });
      } else {
        toInsert.push({ ...k, research_session_id: s.id, created_at: now, updated_at: now });
      }
    }
    for (const k of alwaysInsert) {
      toInsert.push({ ...k, research_session_id: s.id, created_at: now, updated_at: now });
    }

    // Roll back the session so we don't leave an orphaned session on any failure
    if (historyRows.length) {
      const { error: histErr } = await supabase.from('keyword_history').insert(historyRows);
      if (histErr) {
        await supabase.from('research_sessions').delete().eq('id', s.id);
        return { error: histErr };
      }
    }
    if (toUpdate.length) {
      // Plain .update() per row, not .upsert() — upsert compiles to INSERT ... ON
      // CONFLICT under the hood, so a partial row still has to satisfy NOT NULL
      // constraints (keyword, created_at, …) on columns this payload never
      // touches. .update().eq('id', …) only ever SETs the named columns.
      const results = await Promise.all(toUpdate.map(({ id, ...fields }) =>
        supabase.from('keywords').update(fields).eq('id', id)
      ));
      const updErr = results.find(r => r.error)?.error;
      if (updErr) {
        await supabase.from('research_sessions').delete().eq('id', s.id);
        return { error: updErr };
      }
    }
    if (toInsert.length) {
      const { error: insErr } = await supabase.from('keywords').insert(toInsert);
      if (insErr) {
        await supabase.from('research_sessions').delete().eq('id', s.id);
        return { error: insErr };
      }
    }
  }
  return { data: s };
}

// ─── Sparks ──────────────────────────────────────────────────────────────────

export function useSparks() {
  const [sparks, setSparks] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    const { data } = await supabase
      .from('sparks')
      .select('*')
      .is('archived_at', null)
      .order('created_at', { ascending: false });
    if (data) setSparks(data);
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);
  return { sparks, loading, refetch: fetch };
}

export async function createSpark(content, extra = {}) {
  const now = new Date().toISOString();
  const { collectionTag, idea_type, ...rest } = extra;
  const { data, error } = await supabase
    .from('sparks')
    .insert({
      content,
      collection_tag: collectionTag || null,
      idea_type: idea_type || 'Product Idea',
      temperature: 'cold',
      created_at: now,
      updated_at: now,
      ...rest,
    })
    .select()
    .single();
  return { data, error };
}

export async function updateSpark(id, updates) {
  const { data, error } = await supabase
    .from('sparks')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  return { data, error };
}

export async function archiveSpark(id) {
  return updateSpark(id, { archived_at: new Date().toISOString() });
}

// ─── Collections ─────────────────────────────────────────────────────────────

// Returns just names — used by dropdowns throughout the app
export function useCollections() {
  const [collections, setCollections] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    const { data } = await supabase
      .from('collections')
      .select('name')
      .neq('status', 'archived')
      .order('name', { ascending: true });
    if (data) setCollections(data.map(c => c.name));
    setLoading(false);
  }, []);

  useEffect(() => {
    fetch();
    const sub = supabase.channel('tcc-collections-names-' + Math.random().toString(36).slice(2))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'collections' }, fetch)
      .subscribe();
    return () => supabase.removeChannel(sub);
  }, [fetch]);
  return { collections, loading, refetch: fetch };
}

// Returns distinct chapter names from collections
export function useChapters() {
  const [chapters, setChapters] = useState([]);
  const fetch = useCallback(async () => {
    const { data } = await supabase
      .from('collections')
      .select('chapter')
      .neq('status', 'archived')
      .not('chapter', 'is', null)
      .order('chapter', { ascending: true });
    if (data) setChapters([...new Set(data.map(c => c.chapter).filter(Boolean))].sort());
  }, []);
  useEffect(() => { fetch(); }, [fetch]);
  return { chapters, refetch: fetch };
}

// Returns full collection objects — used by Collections page
export function useCollectionObjects() {
  const [collections, setCollections] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    const { data } = await supabase
      .from('collections')
      .select('*')
      .order('name', { ascending: true });
    if (data) setCollections(data);
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);
  return { collections, loading, refetch: fetch };
}

export async function updateCollection(id, updates) {
  const { data, error } = await supabase
    .from('collections')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  return { data, error };
}

export async function createCollection(name, extra = {}) {
  const { data, error } = await supabase
    .from('collections')
    .insert({ name, status: 'active', priority: 'supporting', ...extra, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .select()
    .single();
  return { data, error };
}

export async function deleteCollection(id) {
  return supabase.from('collections').delete().eq('id', id);
}

// ─── Workshop Items ───────────────────────────────────────────────────────────

export function useWorkshopItems() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    const { data } = await supabase
      .from('workshop_items')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    if (data) setItems(data);
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);
  return { items, loading, refetch: fetch };
}

export async function createWorkshopItem(item) {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('workshop_items')
    .insert({ ...item, status: 'pending', created_at: now })
    .select()
    .single();
  return { data, error };
}

export async function resolveWorkshopItem(id, status = 'reviewed') {
  const { data, error } = await supabase
    .from('workshop_items')
    .update({ status, reviewed_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  return { data, error };
}

// ─── Codex ───────────────────────────────────────────────────────────────────

export function useCodexEntries() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    const { data } = await supabase
      .from('codex_entries')
      .select('*')
      .order('created_at', { ascending: false });
    if (data) setEntries(data);
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);
  return { entries, loading, refetch: fetch };
}

export async function createCodexEntry(entry) {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('codex_entries')
    .insert({ ...entry, created_at: now, updated_at: now })
    .select()
    .single();
  return { data, error };
}

export async function updateCodexEntry(id, updates) {
  const { data, error } = await supabase
    .from('codex_entries')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  return { data, error };
}

export async function deleteCodexEntry(id) {
  return supabase.from('codex_entries').delete().eq('id', id);
}

// ─── Trend Signals ───────────────────────────────────────────────────────────

export function useTrendSignals() {
  const [signals, setSignals] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    const { data } = await supabase
      .from('trend_signals')
      .select('*')
      .order('score', { ascending: false });
    if (data) setSignals(data);
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);
  return { signals, loading, refetch: fetch };
}

// ─── Competitor Listings ──────────────────────────────────────────────────────

export function useCompetitorListings() {
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    const { data } = await supabase
      .from('competitor_listings')
      .select('*')
      .order('last_updated_at', { ascending: false });
    if (data) setListings(data);
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);
  return { listings, loading, refetch: fetch };
}

// ─── Knowledge Base ──────────────────────────────────────────────────────────

export function useKnowledgeInbox(statusFilter = 'pending') {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    let q = supabase.from('knowledge_inbox').select('*').order('created_at', { ascending: false });
    if (statusFilter !== 'all') q = q.eq('status', statusFilter);
    const { data } = await q;
    if (data) setItems(data);
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => { fetch(); }, [fetch]);
  return { items, loading, refetch: fetch };
}

export async function createInboxItem(fields) {
  return supabase.from('knowledge_inbox').insert([{ ...fields }]).select().single();
}

export async function updateInboxItem(id, updates) {
  return supabase.from('knowledge_inbox').update({ ...updates }).eq('id', id);
}

export function usePlaybooks() {
  const [playbooks, setPlaybooks] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    const { data } = await supabase
      .from('playbooks')
      .select('*, playbook_sections(*)')
      .order('title');
    if (data) setPlaybooks(data);
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);
  return { playbooks, loading, refetch: fetch };
}

export async function updatePlaybookSection(id, body) {
  return supabase
    .from('playbook_sections')
    .update({ body, updated_at: new Date().toISOString() })
    .eq('id', id);
}

export async function incrementPlaybookVersion(playbookId) {
  const { data } = await supabase.from('playbooks').select('current_version').eq('id', playbookId).single();
  if (!data) return { error: new Error(`Playbook ${playbookId} not found`) };
  const next = data.current_version + 1;
  return supabase.from('playbooks').update({ current_version: next, updated_at: new Date().toISOString() }).eq('id', playbookId);
}

export function usePendingUpdates() {
  const [updates, setUpdates] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    const { data } = await supabase
      .from('pending_updates')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    if (data) setUpdates(data);
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);
  return { updates, loading, refetch: fetch };
}

export async function createPendingUpdate(fields) {
  const row = {
    playbook_slug: fields.playbook_slug || null,
    section_key: fields.section_key || null,
    section_title: fields.section_title || null,
    action: fields.action || 'UPDATE',
    text: fields.proposed_body || fields.text || null,
    source: fields.source || fields.source_type || null,
    source_ids: fields.source_id ? [fields.source_id] : (fields.source_ids || null),
    status: fields.status || 'pending',
  };
  return supabase.from('pending_updates').insert([row]).select().single();
}

export async function approvePendingUpdate(update, newBody) {
  // pending_updates stores playbook_slug, not playbook_id — resolve it first
  let resolvedPlaybookId = null;
  if (update.playbook_slug) {
    const { data: pb } = await supabase
      .from('playbooks')
      .select('id')
      .eq('slug', update.playbook_slug)
      .single();
    if (!pb) {
      console.error('[approvePendingUpdate] playbook not found for slug:', update.playbook_slug);
      return { error: new Error(`Playbook "${update.playbook_slug}" not found`) };
    }
    resolvedPlaybookId = pb.id;
  }

  if (resolvedPlaybookId && update.section_key) {
    const { data: section } = await supabase
      .from('playbook_sections')
      .select('id, body, version, playbook_id')
      .eq('section_key', update.section_key)
      .eq('playbook_id', resolvedPlaybookId)
      .single();

    if (section) {
      await supabase.from('playbook_history').insert([{
        playbook_section_id: section.id,
        body: section.body,
        version: section.version,
        changed_by: 'user',
        changed_at: new Date().toISOString(),
      }]);
      await supabase.from('playbook_sections').update({
        body: newBody || update.text,
        version: (section.version || 1) + 1,
        updated_at: new Date().toISOString(),
      }).eq('id', section.id);
      await incrementPlaybookVersion(resolvedPlaybookId);
    }
  }

  return supabase.from('pending_updates').update({
    status: 'approved',
    resolved_at: new Date().toISOString(),
  }).eq('id', update.id);
}

export async function rejectPendingUpdate(id) {
  return supabase.from('pending_updates').update({
    status: 'rejected',
    resolved_at: new Date().toISOString(),
  }).eq('id', id);
}

export function useExperiments(statusFilter = 'all') {
  const [experiments, setExperiments] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    let q = supabase.from('experiments').select('*').order('started_at', { ascending: false });
    if (statusFilter !== 'all') q = q.eq('status', statusFilter);
    const { data } = await q;
    if (data) setExperiments(data);
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => { fetch(); }, [fetch]);
  return { experiments, loading, refetch: fetch };
}

export async function createExperiment(fields) {
  return supabase.from('experiments').insert([{
    ...fields,
    status: 'running',
    started_at: new Date().toISOString(),
  }]).select().single();
}

export async function updateExperiment(id, updates) {
  return supabase.from('experiments').update({ ...updates }).eq('id', id);
}

export async function closeExperiment(id, result, resultNotes) {
  return supabase.from('experiments').update({
    status: result === 'proven' ? 'proven' : 'closed',
    result,
    result_notes: resultNotes,
    closed_at: new Date().toISOString(),
  }).eq('id', id);
}

// ─── Codex Migration ─────────────────────────────────────────────────────────

export async function runCodexMigrationIfNeeded() {
  if (localStorage.getItem('codex_migration_done')) return;
  const { data: entries } = await supabase.from('codex_entries').select('id').limit(1);
  if (entries?.length) { localStorage.setItem('codex_migration_done', '1'); return; }

  const { data: decisions } = await supabase.from('workshop_items')
    .select('*')
    .eq('type', 'decision')
    .eq('status', 'pending');

  if (decisions?.length) {
    const mapped = decisions.map(d => ({
      category: 'decision',
      title: d.content?.slice(0, 80) || 'Decision',
      body: d.content,
      source: 'workshop_migration',
      created_at: d.created_at,
    }));
    await supabase.from('codex_entries').insert(mapped);
  }
  localStorage.setItem('codex_migration_done', '1');
}

// When a signal is set to Pursue, mark cold sparks in the same collection as Hot
export async function autoHotSparksForSignal(collection) {
  if (!collection) return;
  const { data: sparks } = await supabase
    .from('sparks')
    .select('id')
    .eq('collection_tag', collection)
    .eq('temperature', 'cold')
    .is('archived_at', null);
  if (!sparks?.length) return;
  await supabase
    .from('sparks')
    .update({
      temperature: 'hot',
      trend_signal_reason: 'Trend signal: Pursue',
      updated_at: new Date().toISOString(),
    })
    .in('id', sparks.map(s => s.id));
}

// ─── Design Intelligence — Concepts ─────────────────────────────────────────

export function useConcepts(collectionName) {
  const [concepts, setConcepts] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from('concepts')
      .select('*, concept_outputs(id, output_type, version, is_current, output_source, body, created_at)')
      .eq('status', 'active')
      .order('created_at', { ascending: false });
    if (collectionName) q = q.eq('collection_name', collectionName);
    const { data } = await q;
    setConcepts(data || []);
    setLoading(false);
  }, [collectionName]);

  useEffect(() => {
    fetch();
    const sub = supabase
      .channel('concepts-' + Math.random().toString(36).slice(2))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'concepts' }, fetch)
      .subscribe();
    return () => supabase.removeChannel(sub);
  }, [fetch]);

  return { concepts, loading, refetch: fetch };
}

export function useConcept(id) {
  const [concept, setConcept] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!id) { setLoading(false); return; }
    const { data } = await supabase
      .from('concepts')
      .select('*, concept_outputs(*), concept_assets(*)')
      .eq('id', id)
      .single();
    setConcept(data || null);
    setLoading(false);
  }, [id]);

  useEffect(() => { fetch(); }, [fetch]);

  return { concept, loading, refetch: fetch };
}

export async function createConcept(fields) {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('concepts')
    .insert({ ...fields, created_at: now, updated_at: now })
    .select()
    .single();
  return { data, error };
}

export async function updateConcept(id, updates) {
  const { data, error } = await supabase
    .from('concepts')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  return { data, error };
}

export async function archiveConcept(id) {
  return updateConcept(id, { status: 'archived' });
}

// ─── Design Intelligence — Concept Outputs ──────────────────────────────────

export async function createConceptOutput(fields) {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('concept_outputs')
    .insert({ ...fields, created_at: now, updated_at: now })
    .select()
    .single();
  return { data, error };
}

export async function setCurrentOutput(conceptId, outputType, newOutputId) {
  await supabase
    .from('concept_outputs')
    .update({ is_current: false })
    .eq('concept_id', conceptId)
    .eq('output_type', outputType);
  const { data, error } = await supabase
    .from('concept_outputs')
    .update({ is_current: true, updated_at: new Date().toISOString() })
    .eq('id', newOutputId)
    .select()
    .single();
  return { data, error };
}

export async function updateConceptOutput(id, updates) {
  const { data, error } = await supabase
    .from('concept_outputs')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  return { data, error };
}

export async function nextOutputVersion(conceptId, outputType) {
  const { data } = await supabase
    .from('concept_outputs')
    .select('version')
    .eq('concept_id', conceptId)
    .eq('output_type', outputType)
    .order('version', { ascending: false })
    .limit(1);
  return data?.length ? data[0].version + 1 : 1;
}

export async function generateConceptCode(collectionName) {
  const prefix = (collectionName || 'XX')
    .split(/\s+/)
    .map(w => w[0]?.toUpperCase() || '')
    .join('')
    .slice(0, 3);
  const { count } = await supabase
    .from('concepts')
    .select('*', { count: 'exact', head: true })
    .eq('collection_name', collectionName);
  const seq = String((count || 0) + 1).padStart(3, '0');
  return `${prefix}-${seq}`;
}
