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
      .channel('products')
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
    if (!id) return;
    const { data } = await supabase.from('products').select('*').eq('id', id).single();
    if (data) setProduct(data);
    setLoading(false);
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
    if (p.stage === 'Reviewing' && p.last_reviewed_at && daysBetween(p.last_reviewed_at, today()) > 7) return true;
    const daysInStage = p.stage_updated_at ? daysBetween(p.stage_updated_at, today()) : 0;
    if (!['Live', 'Killed', 'Paused'].includes(p.stage) && daysInStage >= 21) return true;
    return false;
  });
}

// Priority order for Pick Up Where You Left Off
const PICKUP_PRIORITY = ['SEO Ready', 'Assets Ready', 'Design Phase', 'Validated', 'Research', 'Ready to Publish'];

export function getPickUpProduct(products) {
  const eligible = products.filter(p =>
    !['Killed', 'Paused', 'Live', 'Reviewing', 'Idea'].includes(p.stage)
  );
  if (!eligible.length) return null;
  return eligible.sort((a, b) => {
    const ai = PICKUP_PRIORITY.indexOf(a.stage);
    const bi = PICKUP_PRIORITY.indexOf(b.stage);
    if (ai !== bi) return ai - bi;
    return new Date(b.updated_at) - new Date(a.updated_at);
  })[0];
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

export async function deleteResearchSession(id) {
  return supabase.from('research_sessions').delete().eq('id', id);
}

export async function deleteKeyword(id) {
  return supabase.from('keywords').delete().eq('id', id);
}

export async function createResearchSession(session, keywords) {
  const now = new Date().toISOString();
  const { data: s, error } = await supabase
    .from('research_sessions')
    .insert({ ...session, created_at: now })
    .select()
    .single();
  if (error || !s) return { error };
  if (keywords?.length) {
    await supabase.from('keywords').insert(
      keywords.map(k => ({ ...k, research_session_id: s.id, created_at: now, updated_at: now }))
    );
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

  useEffect(() => { fetch(); }, [fetch]);
  return { collections, loading, refetch: fetch };
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

export async function createCollection(name) {
  const { data, error } = await supabase
    .from('collections')
    .insert({ name, status: 'active', priority: 'supporting', created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .select()
    .single();
  return { data, error };
}

export async function deleteCollection(name) {
  return supabase.from('collections').delete().eq('name', name);
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
  const next = (data?.current_version || 1) + 1;
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
  const { data: section } = await supabase
    .from('playbook_sections')
    .select('id, body, version, playbook_id')
    .eq('section_key', update.section_key)
    .eq('playbook_id', update.playbook_id)
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
    await incrementPlaybookVersion(update.playbook_id || section.playbook_id);
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
    .is('archived_at', null);

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
