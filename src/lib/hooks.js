import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './supabase';
import { daysBetween, today } from '../data/seasons';
import { interpretKeyword } from './keywordIntelligence';
import { analyzeVisual } from './claude';

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
    if (!id) { setProduct(null); setLoading(false); return; }
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

// ─── Listing Intelligence (Milestone A) ────────────────────────────────────
// listing_generations is append-only (one row per generation/regeneration,
// never overwritten) — mirrors visual_profiles' shape from Phase 20, for
// the same reason: a mutable single-row-per-product design would destroy
// exactly the history (how many attempts before landing on a final
// listing, what Product Truth looked like at generation time) a later
// phase's performance-learning work will want the moment a listing is
// regenerated.

// Inserts one listing_generations row plus its listing_generation_keywords
// children (supporting + excluded) — mirrors exactly how Phase 20's
// analyzeListing() persists a visual_profiles row plus its
// competitor_listing_tags children. productId may be null: a new listing
// generates before any product row exists (handleGenerate() in
// ListingBuilder.jsx has no productId dependency, and comparing a few
// attempts before ever saving is the normal path, not an edge case) — see
// linkGenerationsToProduct() below for how an unlinked row gets connected
// once the listing is actually saved.
export async function createListingGeneration({
  productId, generationVersion, trigger, primarySearchIntent, primarySearchIntentKeywordId,
  primaryIntentStatus, researchSourcesUsed, researchGaps, productTruthSnapshot, discussionPermissions,
  titleStrategy, title, tags, description, imagePrompts, validationStatus, validationWarnings,
  model, inputTokens, outputTokens, changeReason, performanceSnapshot,
  supportingKeywords, excludedKeywords,
}) {
  const { data: row, error } = await supabase.from('listing_generations').insert({
    product_id: productId || null,
    generation_version: generationVersion || null,
    trigger: trigger || null,
    primary_search_intent: primarySearchIntent || null,
    primary_search_intent_keyword_id: primarySearchIntentKeywordId || null,
    primary_intent_status: primaryIntentStatus || null,
    research_sources_used: researchSourcesUsed || null,
    research_gaps: researchGaps || null,
    product_truth_snapshot: productTruthSnapshot || null,
    discussion_permissions: discussionPermissions || null,
    title_strategy: titleStrategy || null,
    title: title || null,
    tags: tags || null,
    description: description || null,
    image_prompts: imagePrompts || null,
    validation_status: validationStatus || null,
    validation_warnings: validationWarnings || null,
    model: model || null,
    input_tokens: inputTokens ?? null,
    output_tokens: outputTokens ?? null,
    change_reason: changeReason || null,
    performance_snapshot_at_generation: performanceSnapshot || null,
  }).select().single();
  if (error || !row) return { data: null, error };

  const keywordRows = [
    ...(supportingKeywords || []).map(k => ({
      generation_id: row.id, keyword_id: k.keywordId || null, keyword_text: k.keyword,
      role: 'supporting', relevance_category: k.relevanceCategory || null,
      volume: k.volume ?? null, competition: k.competition ?? null, score: k.score ?? null,
    })),
    ...(excludedKeywords || []).map(k => ({
      generation_id: row.id, keyword_id: k.keywordId || null, keyword_text: k.keyword,
      role: 'excluded', exclusion_reason: k.reason || null,
      volume: k.volume ?? null, competition: k.competition ?? null, score: k.score ?? null,
    })),
  ];
  if (keywordRows.length) {
    const { error: kwError } = await supabase.from('listing_generation_keywords').insert(keywordRows);
    if (kwError) console.error('[createListingGeneration] keyword rows failed:', kwError);
  }

  return { data: row, error: null };
}

// Links this session's not-yet-saved generation rows to a real product once
// handleSaveProduct() creates one.
export async function linkGenerationsToProduct(generationIds, productId) {
  if (!generationIds?.length) return { error: null };
  return supabase.from('listing_generations').update({ product_id: productId }).in('id', generationIds);
}

// Full generation history for one product, most recent first — the
// append-only ledger a later phase will build version-history/performance-
// learning UI on top of. Not paginated — a single product's regeneration
// count is realistically small.
export function useListingGenerations(productId) {
  const [generations, setGenerations] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!productId) { setGenerations([]); setLoading(false); return; }
    const { data } = await supabase
      .from('listing_generations')
      .select('*, listing_generation_keywords(*)')
      .eq('product_id', productId)
      .order('created_at', { ascending: false });
    setGenerations(data || []);
    setLoading(false);
  }, [productId]);

  useEffect(() => { fetch(); }, [fetch]);
  return { generations, loading, refetch: fetch };
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
  const requestIdRef = useRef(0);

  const fetch = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    let query = supabase
      .from('research_sessions')
      .select('*, keywords(*)')
      .order('date', { ascending: false });
    if (collection) query = query.eq('collection', collection);
    const { data } = await query;
    if (requestId !== requestIdRef.current) return; // a newer request superseded this one
    if (data) setSessions(data);
    setLoading(false);
  }, [collection]);

  useEffect(() => { fetch(); }, [fetch]);
  return { sessions, loading, refetch: fetch };
}

export function useResearchSession(id) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!id) { setSession(null); setLoading(false); return; }
    const { data } = await supabase.from('research_sessions').select('*, keywords(*)').eq('id', id).single();
    setSession(data || null);
    setLoading(false);
  }, [id]);

  useEffect(() => { fetch(); }, [fetch]);
  return { session, loading, refetch: fetch };
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
// inserting a duplicate, so the keyword bank stays current. Unlike before Phase
// 19, this no longer discards the prior reading: every incoming (keyword,
// source) reading gets its own keyword_history row — including a keyword's
// very first sighting, not just re-imports — so keyword_history becomes a
// real, append-only, multi-source-safe evidence ledger (Everbee and eRank
// readings for the same keyword now both survive, queryable side by side,
// instead of the second import silently erasing the first). classifyKeyword()
// (src/lib/keywordIntelligence.js) reads that full ledger and writes
// classification/confidence/trend/disagreement/interpretation_summary back
// onto the live row alongside the usual volume/competition/score/bucket.
// tags_only keywords (misspelling/tag variants) are always inserted fresh —
// they're not part of the bucket-ranked "current value" concept this is for.
// Pass a session with a real `id` (a full row from an existing
// research_sessions fetch, e.g. ListingBuilder's InlineKeywordAdd letting you
// pick "add to session X" from a dropdown) to append keywords to that
// existing session instead of creating a new one — merge/history/
// interpretation all behave identically either way; only the
// research_sessions insert itself is skipped. Every downstream reference
// already reads collection/date/source off the `session` param rather than
// the inserted row, so this needed no other changes to the function body.
export async function createResearchSession(session, keywords) {
  const now = new Date().toISOString();
  const todayStr = now.split('T')[0];

  let s;
  let createdSession = false;
  if (session.id) {
    s = session;
  } else {
    const { data, error } = await supabase
      .from('research_sessions')
      .insert({ ...session, created_at: now })
      .select()
      .single();
    if (error || !data) return { error };
    s = data;
    createdSession = true;
  }

  if (keywords?.length) {
    const mergeable = keywords.filter(k => !k.tags_only && k.keyword?.trim());
    const alwaysInsert = keywords.filter(k => k.tags_only || !k.keyword?.trim());

    let existingByKeyword = new Map();
    let collectionSeason = null;
    if (mergeable.length && session.collection) {
      const [{ data: existingRows }, { data: collectionRow }] = await Promise.all([
        supabase
          .from('keywords')
          .select('id, keyword, volume, competition, score, updated_at, created_at, research_sessions!inner(collection, source)')
          .eq('research_sessions.collection', session.collection),
        supabase.from('collections').select('season').eq('name', session.collection).maybeSingle(),
      ]);
      for (const row of existingRows || []) {
        const key = (row.keyword || '').toLowerCase().trim();
        if (key && !existingByKeyword.has(key)) existingByKeyword.set(key, row);
      }
      collectionSeason = collectionRow?.season || null;
    }

    // Every matched keyword's full evidence trail, batched in one query — the
    // interpretation engine needs the complete history, not just whichever
    // single reading is being saved right now. Still O(1) round trips
    // relative to keyword count, not one query per keyword.
    const matchedIds = [...existingByKeyword.values()].map(m => m.id);
    const historyByKeywordId = new Map();
    if (matchedIds.length) {
      const { data: priorHistory } = await supabase.from('keyword_history').select('*').in('keyword_id', matchedIds);
      for (const row of priorHistory || []) {
        if (!historyByKeywordId.has(row.keyword_id)) historyByKeywordId.set(row.keyword_id, []);
        historyByKeywordId.get(row.keyword_id).push(row);
      }
    }

    const toInsert = [];
    const toUpdate = [];
    const historyRows = [];          // rows with a real keyword_id — insertable immediately
    const historyRowsPendingId = []; // rows for brand-new keywords — backfilled once the keywords insert returns real ids

    // Explicit whitelist, not a raw {...k} spread — callers increasingly attach
    // ledger-only fields to k (clicks, ctr, data_window, trend_data, a source's
    // own precomputed score, …) that belong on keyword_history, not keywords.
    // Spreading k straight into a keywords insert would send those same field
    // names to PostgREST and fail with "column does not exist" the moment any
    // caller's keyword row carries one.
    const baseKeywordFields = k => ({
      keyword: k.keyword,
      volume: k.volume ?? null,
      competition: k.competition ?? null,
      score: k.score ?? null,
      tag_type: k.tag_type,
      tags_only: k.tags_only || false,
      bucket: k.bucket ?? null,
      bucket_source: k.bucket_source ?? null,
    });

    for (const k of mergeable) {
      const match = existingByKeyword.get(k.keyword.toLowerCase().trim());
      const incomingReading = {
        source: session.source || null,
        volume: k.volume ?? null,
        competition: k.competition ?? null,
        score: k.score ?? null,
        clicks: k.clicks ?? null,
        ctr: k.ctr ?? null,
        data_date: session.date || todayStr,
        data_window: k.data_window ?? null,
        trend_data: k.trend_data ?? null,
        source_score: k.source_score ?? null,
        research_session_id: s.id,
        recorded_at: now,
      };

      if (match) {
        const fullHistory = [...(historyByKeywordId.get(match.id) || []), { ...incomingReading, keyword: k.keyword }];
        const interpretation = interpretKeyword(fullHistory, { collectionSeason });

        historyRows.push({ ...incomingReading, keyword_id: match.id, keyword: k.keyword });
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
          ...interpretation,
        });
      } else {
        const interpretation = interpretKeyword([{ ...incomingReading, keyword: k.keyword }], { collectionSeason });
        toInsert.push({ ...baseKeywordFields(k), research_session_id: s.id, created_at: now, updated_at: now, ...interpretation });
        historyRowsPendingId.push({ ...incomingReading, keyword: k.keyword, _matchKeyword: k.keyword.toLowerCase().trim() });
      }
    }
    for (const k of alwaysInsert) {
      toInsert.push({ ...baseKeywordFields(k), research_session_id: s.id, created_at: now, updated_at: now });
    }

    // Roll back the session so we don't leave an orphaned session on any
    // failure — but only when this call created it. Deleting a session an
    // earlier call already committed (the attach-to-existing path above)
    // would destroy a pre-existing research session and any keywords/history
    // already filed under it, just because a later, unrelated add failed.
    if (historyRows.length) {
      const { error: histErr } = await supabase.from('keyword_history').insert(historyRows);
      if (histErr) {
        if (createdSession) await supabase.from('research_sessions').delete().eq('id', s.id);
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
        if (createdSession) await supabase.from('research_sessions').delete().eq('id', s.id);
        return { error: updErr };
      }
    }
    if (toInsert.length) {
      const { data: insertedRows, error: insErr } = await supabase.from('keywords').insert(toInsert).select('id, keyword');
      if (insErr) {
        if (createdSession) await supabase.from('research_sessions').delete().eq('id', s.id);
        return { error: insErr };
      }
      // Backfill keyword_id onto the pending history rows now that the new
      // keywords rows have real ids, then write them.
      if (historyRowsPendingId.length && insertedRows?.length) {
        const idByKeyword = new Map(insertedRows.map(r => [(r.keyword || '').toLowerCase().trim(), r.id]));
        const readyHistoryRows = historyRowsPendingId
          .map(({ _matchKeyword, ...row }) => ({ ...row, keyword_id: idByKeyword.get(_matchKeyword) || null }))
          .filter(row => row.keyword_id);
        if (readyHistoryRows.length) {
          const { error: histErr2 } = await supabase.from('keyword_history').insert(readyHistoryRows);
          if (histErr2) {
            if (createdSession) await supabase.from('research_sessions').delete().eq('id', s.id);
            return { error: histErr2 };
          }
        }
      }
    }
    // Touch the collection's last_verified date here so every ingestion path
    // (manual form, Everbee CSV import, pasted session summary, …) marks
    // keywords as freshly confirmed — not just whichever caller remembers to
    // do it themselves. Previously only the manual research form did this,
    // so collections researched via CSV import or session-summary paste
    // always showed "never verified" regardless of how current the data was.
    if (session.collection) {
      await supabase.from('collections').update({ last_verified: todayStr }).eq('name', session.collection);
    }
  }
  return { data: s };
}

// One keyword's full keyword_history, re-interpreted and written back — for
// the manual single-keyword-edit paths (ResearchSessionCard's EditableKeyword,
// Research.jsx's inline KeywordList edit) so hand-correcting a volume/
// competition number doesn't leave stale classification sitting on the row.
// Re-derives interpretation only; does not itself write a new keyword_history
// row (a manual field correction isn't a new source reading).
export async function recomputeKeywordInterpretation(keywordId) {
  const { data: kw } = await supabase
    .from('keywords')
    .select('id, research_sessions(collection)')
    .eq('id', keywordId)
    .single();
  if (!kw) return { error: new Error('Keyword not found') };

  const collectionName = kw.research_sessions?.collection || null;
  const [{ data: history }, { data: collectionRow }] = await Promise.all([
    supabase.from('keyword_history').select('*').eq('keyword_id', keywordId),
    collectionName ? supabase.from('collections').select('season').eq('name', collectionName).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  const interpretation = interpretKeyword(history || [], { collectionSeason: collectionRow?.season || null });
  // Return the already-computed interpretation, not the raw (unselected,
  // data:null) update result — callers that want to merge fresh
  // classification/confidence into local state without an extra fetch
  // (e.g. ResearchSessionCard's EditableKeyword) can use it directly.
  const { error } = await supabase.from('keywords').update(interpretation).eq('id', keywordId);
  return { data: interpretation, error };
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

export function useSpark(id) {
  const [spark, setSpark] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!id) { setSpark(null); setLoading(false); return; }
    const { data } = await supabase.from('sparks').select('*').eq('id', id).single();
    setSpark(data || null);
    setLoading(false);
  }, [id]);

  useEffect(() => { fetch(); }, [fetch]);
  return { spark, loading, refetch: fetch };
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

export async function createTrendSignal(fields) {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('trend_signals')
    .insert({ ...fields, created_at: now, updated_at: now })
    .select()
    .single();
  return { data, error };
}

export async function updateTrendSignal(id, updates) {
  const { data, error } = await supabase
    .from('trend_signals')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  return { data, error };
}

// ─── Competitor Listings ──────────────────────────────────────────────────────

export function useCompetitorListings() {
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    // Supabase/PostgREST caps an unbounded select at 1000 rows by default —
    // this table already exceeds that, so page through with .range() until a
    // page comes back short. A secondary sort on id keeps pagination stable
    // even when many rows share the same last_updated_at (e.g. a whole CSV
    // import batch stamped with one timestamp), which .range() alone can't
    // guarantee — without it, ties at a page boundary could be skipped or
    // duplicated across pages.
    const PAGE_SIZE = 1000;
    let all = [];
    let from = 0;
    while (true) {
      const { data } = await supabase
        .from('competitor_listings')
        .select('*')
        .order('last_updated_at', { ascending: false })
        .order('id', { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (!data || data.length === 0) break;
      all = all.concat(data);
      if (data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }
    setListings(all);
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);
  return { listings, loading, refetch: fetch };
}

// ─── Marketplace Visual Intelligence (Phase 20) ────────────────────────────
// visual_profiles is append-only (one row per analysis run, never
// overwritten — see migration comment) so a listing's CURRENT profile is
// "whichever row has the latest analyzed_at", not a single mutable record.

const EXT_BY_MIME = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };

// Every visual_profiles row (with its tags embedded via the real FK to
// competitor_listing_tags), collapsed down to just the latest per
// listing_id in JS. Deliberately queries the base table rather than the
// current_visual_profiles view — PostgREST's relationship-embedding isn't
// guaranteed to trace a real FK through a DISTINCT ON view the way it does
// a plain table, and this sidesteps that uncertainty entirely. Same
// sort-then-take-first-per-key shape as groupHistoryBySource() in
// keywordIntelligence.js. Never paginated like useCompetitorListings() —
// this table only grows as listings are actually analyzed (human-gated),
// realistically dozens to low hundreds of rows, not thousands.
export function useVisualProfilesByListing() {
  const [profilesByListingId, setProfilesByListingId] = useState({});
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    const { data } = await supabase
      .from('visual_profiles')
      .select('*, competitor_listing_tags(tag_id, category, confidence, visual_tags(id, name))')
      .order('analyzed_at', { ascending: false });
    const grouped = {};
    for (const row of data || []) {
      if (!grouped[row.listing_id]) grouped[row.listing_id] = row;
    }
    setProfilesByListingId(grouped);
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);
  return { profilesByListingId, loading, refetch: fetch };
}

// Runs the full per-listing pipeline: fetch the captured image server-side
// (reusing fetch-image.js exactly as ConceptWorkspace.jsx's
// uploadAssetFromUrl() does — same CORS-bypass reasoning), send it to
// analyze-visual.js for structured vision analysis, then persist. Every
// early-exit path (no image_url, fetch failure, analysis failure, model
// flags the image itself as unusable) still writes a visual_profiles row —
// status 'image_unavailable' or 'failed' with failure_reason set — rather
// than silently doing nothing, so "unanalyzed" (see CompetitorsTab) can
// mean "no row at all, or the last attempt didn't succeed" and a listing
// never just vanishes from view when something goes wrong.
//
// The storage snapshot is only uploaded AFTER analysis succeeds, not
// before — so a failed run never leaves an orphaned storage object with
// nothing pointing at it (concept_assets/mobile-capture.js both had to
// learn this the hard way; doing it in this order avoids the problem
// rather than adding rollback-after-the-fact).
export async function analyzeListing(listing) {
  const base = { listing_id: listing.id, source_image_url: listing.image_url || null };

  if (!listing.image_url) {
    const { data, error } = await supabase.from('visual_profiles')
      .insert({ ...base, status: 'image_unavailable', failure_reason: 'No image captured for this listing' })
      .select('*, competitor_listing_tags(tag_id, category, confidence, visual_tags(id, name))').single();
    return { data, error, tagsApplied: 0 };
  }

  // Wrapped in try/catch, not just an .ok check — a fully unreachable
  // function endpoint (offline, DNS failure, etc.) makes fetch() itself
  // reject rather than resolve with a bad status, and an uncaught rejection
  // here would silently abort runBatch()'s whole loop on one bad listing
  // instead of recording this one as failed and moving on.
  let fetchRes, fetchData;
  try {
    fetchRes = await fetch('/.netlify/functions/fetch-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: listing.image_url }),
    });
    fetchData = await fetchRes.json();
  } catch (err) {
    const { data, error } = await supabase.from('visual_profiles')
      .insert({ ...base, status: 'image_unavailable', failure_reason: `Image fetch failed: ${err.message}` })
      .select('*, competitor_listing_tags(tag_id, category, confidence, visual_tags(id, name))').single();
    return { data, error, tagsApplied: 0 };
  }
  if (!fetchRes.ok) {
    const { data, error } = await supabase.from('visual_profiles')
      .insert({ ...base, status: 'image_unavailable', failure_reason: fetchData?.error || `Image fetch failed (${fetchRes.status})` })
      .select('*, competitor_listing_tags(tag_id, category, confidence, visual_tags(id, name))').single();
    return { data, error, tagsApplied: 0 };
  }

  let analysis;
  try {
    analysis = await analyzeVisual(fetchData.base64, fetchData.mediaType);
  } catch (err) {
    analysis = { ok: false, error: `Analysis request failed: ${err.message}` };
  }
  if (!analysis.ok) {
    const { data, error } = await supabase.from('visual_profiles')
      .insert({ ...base, status: 'failed', failure_reason: analysis.error })
      .select('*, competitor_listing_tags(tag_id, category, confidence, visual_tags(id, name))').single();
    return { data, error, tagsApplied: 0 };
  }

  const { profile, model, taxonomyVersion, usage } = analysis.data;
  const provenance = {
    model,
    taxonomy_version: taxonomyVersion,
    analysis_notes: profile.analysis_notes || null,
    input_tokens: usage?.input_tokens ?? null,
    output_tokens: usage?.output_tokens ?? null,
  };

  if (profile.image_quality_sufficient === false) {
    const { data, error } = await supabase.from('visual_profiles')
      .insert({ ...base, ...provenance, status: 'failed', failure_reason: 'Image quality insufficient for analysis' })
      .select('*, competitor_listing_tags(tag_id, category, confidence, visual_tags(id, name))').single();
    return { data, error, tagsApplied: 0 };
  }

  // Taxonomy arrays are stripped out of design before it's stored — they
  // live ONLY in competitor_listing_tags (step below), never duplicated
  // into design_profile jsonb. See migration header comment for why.
  const { typography, composition, treatment, aesthetic, motifs, ...designProfile } = profile.design || {};

  const byteChars = atob(fetchData.base64);
  const bytes = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
  const snapshotPath = `${listing.id}/${Date.now()}.${EXT_BY_MIME[fetchData.mediaType] || 'jpg'}`;
  const { error: uploadError } = await supabase.storage
    .from('competitor-visual-snapshots')
    .upload(snapshotPath, new Blob([bytes], { type: fetchData.mediaType }), { cacheControl: '3600', upsert: false });
  // Non-fatal — the analysis is still real and worth keeping even if the
  // snapshot upload itself has a problem; just record it without a path.

  const { data: profileRow, error: profileError } = await supabase
    .from('visual_profiles')
    .insert({
      ...base,
      ...provenance,
      status: 'complete',
      snapshot_storage_path: uploadError ? null : snapshotPath,
      design_profile: designProfile,
      mockup_profile: profile.mockup || null,
      design_confidence: profile.design?.overall_confidence || null,
      mockup_confidence: profile.mockup?.overall_confidence || null,
    })
    .select()
    .single();
  if (profileError || !profileRow) return { data: null, error: profileError, tagsApplied: 0 };

  const tagGroups = [
    ['typography', typography], ['composition', composition], ['treatment', treatment],
    ['aesthetic', aesthetic], ['motif', motifs],
  ];
  let tagsApplied = 0;
  for (const [category, entries] of tagGroups) {
    for (const entry of entries || []) {
      if (!entry?.name) continue;
      const { data: tag } = await createVisualTag(entry.name);
      if (!tag) continue;
      const { error: tagError } = await supabase.from('competitor_listing_tags')
        .insert({ visual_profile_id: profileRow.id, tag_id: tag.id, category, confidence: entry.confidence || null });
      if (!tagError) tagsApplied++;
    }
  }

  const { data: fullRow } = await supabase.from('visual_profiles')
    .select('*, competitor_listing_tags(tag_id, category, confidence, visual_tags(id, name))')
    .eq('id', profileRow.id).single();
  return { data: fullRow || profileRow, error: null, tagsApplied };
}

// Manual correction after AI analysis — same shape as applyTagToConcept/
// removeTagFromConcept below, just keyed to a visual_profile_id + category
// instead of a concept_id. confidence is left null for a human-applied tag
// (no AI confidence to record) rather than defaulting to 'High' — an
// invented confidence value would be exactly the kind of fabricated
// certainty this project's evidence model rules out.
export async function applyTagToListingProfile(visualProfileId, tagId, category) {
  const { data, error } = await supabase.from('competitor_listing_tags')
    .insert({ visual_profile_id: visualProfileId, tag_id: tagId, category })
    .select('tag_id, category, confidence, visual_tags(id, name)').single();
  return { data, error };
}

export async function removeTagFromListingProfile(visualProfileId, tagId, category) {
  return supabase.from('competitor_listing_tags').delete()
    .eq('visual_profile_id', visualProfileId).eq('tag_id', tagId).eq('category', category);
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
    status: result,
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
    if (!id) { setConcept(null); setLoading(false); return; }
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

// Concepts grouped by their source spark — used on the Idea Vault page to
// show which Concepts grew out of each Spark, without an N+1 query per card.
// A spark with none simply has no entry in the map.
export function useConceptsBySpark() {
  const [conceptsBySparkId, setConceptsBySparkId] = useState({});
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    const { data } = await supabase
      .from('concepts')
      .select('id, name, spark_id')
      .eq('status', 'active')
      .not('spark_id', 'is', null);
    const grouped = {};
    (data || []).forEach(c => { (grouped[c.spark_id] ||= []).push(c); });
    setConceptsBySparkId(grouped);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetch();
    const sub = supabase
      .channel('concepts-by-spark-' + Math.random().toString(36).slice(2))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'concepts' }, fetch)
      .subscribe();
    return () => supabase.removeChannel(sub);
  }, [fetch]);

  return { conceptsBySparkId, loading, refetch: fetch };
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

// ─── Import Sessions — provenance metadata for pasted imports ──────────────
// One row per paste/import event (not per-item) -- every object type
// SessionSummaryParser.jsx and ConceptChatImport.jsx create gets a nullable
// session_id FK back to this row. Callers only create a row when at least
// one of date/source was actually captured -- see SessionSummaryParser.jsx's
// handleSaveApproved and ConceptChatImport.jsx's handleSave for the
// "only when warranted" gate that keeps this table free of junk all-null rows.

export async function createImportSession(fields) {
  const { data, error } = await supabase
    .from('import_sessions')
    .insert({ ...fields, created_at: new Date().toISOString() })
    .select()
    .single();
  return { data, error };
}

export function useImportSession(id) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!id) { setSession(null); setLoading(false); return; }
    const { data } = await supabase.from('import_sessions').select('*').eq('id', id).single();
    setSession(data || null);
    setLoading(false);
  }, [id]);

  useEffect(() => { fetch(); }, [fetch]);
  return { session, loading, refetch: fetch };
}

// ─── Visual Tags (Phase 18 — shared visual-language taxonomy) ──────────────
// One shared controlled vocabulary (visual_tags), applied to both concepts
// and collections via two junction tables (concept_tags / collection_tags).
// Case-insensitive uniqueness is enforced at the DB level via a lower(name)
// unique index (see migration) as a safety net; primary matching happens
// here in JS via .toLowerCase()/.ilike(), the same convention every other
// case-insensitive match in this app already uses (looseTextMatch(), every
// comparison in SessionSummaryParser.jsx).

export function useVisualTags() {
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    const { data } = await supabase.from('visual_tags').select('*').order('name', { ascending: true });
    if (data) setTags(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetch();
    const sub = supabase
      .channel('visual-tags-' + Math.random().toString(36).slice(2))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'visual_tags' }, fetch)
      .subscribe();
    return () => supabase.removeChannel(sub);
  }, [fetch]);

  return { tags, loading, refetch: fetch };
}

// Insert-or-reuse: a unique-violation on the lower(name) index means this
// name already exists under different casing -- same "unique error means
// it already exists, use it" recovery ConceptChatImport.jsx's handleSave()
// already does by hand for createCollection(), centralized here since
// every tag-creating call site (both pickers, Visual Language paste
// ingestion) needs the identical recovery.
export async function createVisualTag(name) {
  const trimmed = (name || '').trim();
  if (!trimmed) return { data: null, error: new Error('Tag name required') };
  const { data, error } = await supabase.from('visual_tags').insert({ name: trimmed }).select().single();
  if (error) {
    if (error.message?.toLowerCase().includes('unique')) {
      const { data: existing } = await supabase.from('visual_tags').select('*').ilike('name', trimmed).maybeSingle();
      if (existing) return { data: existing, error: null };
    }
    return { data: null, error };
  }
  return { data, error: null };
}

// Tags currently applied to one concept -- used by ConceptWorkspace.jsx's picker.
export function useConceptTags(conceptId) {
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!conceptId) { setTags([]); setLoading(false); return; }
    const { data } = await supabase.from('concept_tags').select('tag_id, visual_tags(id, name)').eq('concept_id', conceptId);
    setTags((data || []).map(r => r.visual_tags).filter(Boolean));
    setLoading(false);
  }, [conceptId]);

  useEffect(() => { fetch(); }, [fetch]);
  return { tags, loading, refetch: fetch };
}

// Tags currently applied to one collection -- used by CollectionDetail.jsx's picker.
export function useCollectionTags(collectionId) {
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!collectionId) { setTags([]); setLoading(false); return; }
    const { data } = await supabase.from('collection_tags').select('tag_id, visual_tags(id, name)').eq('collection_id', collectionId);
    setTags((data || []).map(r => r.visual_tags).filter(Boolean));
    setLoading(false);
  }, [collectionId]);

  useEffect(() => { fetch(); }, [fetch]);
  return { tags, loading, refetch: fetch };
}

// All concept_tags grouped by concept_id -- used by Concepts.jsx (Design
// Vault) for tag-pill display and the tag filter dropdown without an N+1
// query per card. Mirrors useConceptsBySpark()'s grouped-map shape.
export function useConceptTagsAll() {
  const [tagsByConceptId, setTagsByConceptId] = useState({});
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    const { data } = await supabase.from('concept_tags').select('concept_id, visual_tags(id, name)');
    const grouped = {};
    (data || []).forEach(r => { if (r.visual_tags) (grouped[r.concept_id] ||= []).push(r.visual_tags); });
    setTagsByConceptId(grouped);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetch();
    const sub = supabase
      .channel('concept-tags-all-' + Math.random().toString(36).slice(2))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'concept_tags' }, fetch)
      .subscribe();
    return () => supabase.removeChannel(sub);
  }, [fetch]);

  return { tagsByConceptId, loading, refetch: fetch };
}

export async function applyTagToConcept(conceptId, tagId) {
  const { data, error } = await supabase.from('concept_tags').insert({ concept_id: conceptId, tag_id: tagId }).select().single();
  return { data, error };
}

export async function removeTagFromConcept(conceptId, tagId) {
  return supabase.from('concept_tags').delete().eq('concept_id', conceptId).eq('tag_id', tagId);
}

export async function applyTagToCollection(collectionId, tagId) {
  const { data, error } = await supabase.from('collection_tags').insert({ collection_id: collectionId, tag_id: tagId }).select().single();
  return { data, error };
}

export async function removeTagFromCollection(collectionId, tagId) {
  return supabase.from('collection_tags').delete().eq('collection_id', collectionId).eq('tag_id', tagId);
}
