import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from './supabase';
import { daysBetween, today } from '../data/seasons';
import { interpretKeyword } from './keywordIntelligence';
import { buildNicheTimings } from './timingIntelligence';
import { childLevelOf, planReparent, levelForDepth, ancestorsOf } from './niches';
import { analyzeVisual } from './claude';
import { nowISO } from './utils';

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
    .update({ ...updates, updated_at: nowISO() })
    .eq('id', id)
    .select()
    .single();
  return { data, error };
}

// Read-then-append-write onto products.notes — shared by SaveFlagsButton
// and KeywordEvidencePanel (Milestone B) so neither presentational
// component touches Supabase directly. Always a plain append; never
// rewrites or removes prior notes content.
export async function appendProductNote(productId, text) {
  const { data: current } = await supabase.from('products').select('notes').eq('id', productId).single();
  const existing = current?.notes || '';
  const newNotes = existing ? `${existing}\n\n${text}` : text;
  return updateProduct(productId, { notes: newNotes });
}

export async function deleteProduct(id) {
  return supabase.from('products').delete().eq('id', id);
}

export async function createProduct(product) {
  const now = nowISO();
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
  model, inputTokens, outputTokens, changeReason, performanceSnapshot, productTruthSources,
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
    // Milestone C1 — which layer each policy-eligible Product Truth field
    // actually came from at generation time (product row vs. a named/dated
    // store policy). See src/lib/storePolicies.js's header for why this
    // travels as a value snapshot, never reconstructed from live tables.
    product_truth_sources: productTruthSources || null,
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

// ─── Verified Libraries (Milestone C1) ─────────────────────────────────────
// Product Templates and Store Policies — reference data, rarely written,
// applied/resolved by Listing Builder (see src/lib/productTemplates.js and
// src/lib/storePolicies.js for the actual matching/resolution logic; these
// are plain CRUD + archive, same shape as useExperiments/createExperiment
// and useConcepts/archiveConcept elsewhere in this file).

export function useProductTemplates(statusFilter = 'active') {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    let q = supabase.from('product_templates').select('*').order('name');
    if (statusFilter !== 'all') q = q.eq('status', statusFilter);
    const { data } = await q;
    setTemplates(data || []);
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => { fetch(); }, [fetch]);
  return { templates, loading, refetch: fetch };
}

export async function createProductTemplate(fields) {
  return supabase.from('product_templates').insert([{ ...fields, status: 'active' }]).select().single();
}

// Never stamps last_verified — editing wording isn't re-checking the spec
// against Printify, and that distinction is the entire point of the
// provenance block. Only markProductTemplateVerified() sets it.
export async function updateProductTemplate(id, updates) {
  return supabase.from('product_templates').update({ ...updates, updated_at: nowISO() }).eq('id', id);
}

export async function archiveProductTemplate(id) {
  return updateProductTemplate(id, { status: 'archived' });
}

export async function markProductTemplateVerified(id, note) {
  return supabase.from('product_templates').update({
    last_verified: nowISO().slice(0, 10),
    verification_note: note || null,
    updated_at: nowISO(),
  }).eq('id', id);
}

export function useStorePolicies(statusFilter = 'active') {
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    let q = supabase.from('store_policies').select('*').order('policy_type');
    if (statusFilter !== 'all') q = q.eq('status', statusFilter);
    const { data } = await q;
    setPolicies(data || []);
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => { fetch(); }, [fetch]);
  return { policies, loading, refetch: fetch };
}

export async function createStorePolicy(fields) {
  return supabase.from('store_policies').insert([{ ...fields, status: 'active' }]).select().single();
}

export async function updateStorePolicy(id, updates) {
  return supabase.from('store_policies').update({ ...updates, updated_at: nowISO() }).eq('id', id);
}

export async function archiveStorePolicy(id) {
  return updateStorePolicy(id, { status: 'archived' });
}

export async function markStorePolicyVerified(id, note) {
  return supabase.from('store_policies').update({
    last_verified: nowISO().slice(0, 10),
    verification_note: note || null,
    updated_at: nowISO(),
  }).eq('id', id);
}

// ─── Checkpoint Reviews (Milestone C3) ─────────────────────────────────────
// Two intentionally separate write functions, not one function with a mode
// flag — matches this file's own convention elsewhere (e.g.
// archiveProductTemplate vs updateProductTemplate). Both accept an
// already-built performanceSnapshot (from listingReviews.js's
// buildPerformanceSnapshot(), called once by the caller when a review flow
// opens) rather than building it here — guarantees the exact numbers the
// AI reasoned over (for a real review) are the exact numbers persisted,
// even if LiveStats gets edited again a minute later.

export function useListingReviews(productId) {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!productId) { setReviews([]); setLoading(false); return; }
    const { data } = await supabase
      .from('listing_reviews')
      .select('*')
      .eq('product_id', productId)
      .order('created_at', { ascending: false });
    setReviews(data || []);
    setLoading(false);
  }, [productId]);

  useEffect(() => { fetch(); }, [fetch]);
  return { reviews, loading, refetch: fetch };
}

export async function createListingReview({
  productId, checkpointNumber, daysLiveAtReview, performanceSnapshot,
  generationId, generationSnapshot,
  aiRecommendation, aiReasoning, aiModel,
  userDecision, userNotes,
}) {
  return supabase.from('listing_reviews').insert({
    product_id: productId,
    checkpoint_number: checkpointNumber,
    status: 'reviewed',
    days_live_at_review: daysLiveAtReview,
    performance_snapshot: performanceSnapshot,
    generation_id: generationId || null,
    generation_snapshot: generationSnapshot || null,
    ai_recommendation: aiRecommendation || null,
    ai_reasoning: aiReasoning || null,
    ai_model: aiModel || null,
    user_decision: userDecision,
    user_notes: userNotes || null,
  }).select().single();
}

// Lightweight bypass — no AI call, ever (enforced by construction: this
// function has no ai_* params at all). Still freezes a real stats snapshot
// (cheap, mechanical, no interpretation involved) so a skipped checkpoint's
// numbers-at-the-time remain visible later even though no judgment was
// rendered on them.
export async function skipListingReview({
  productId, checkpointNumber, daysLiveAtReview, performanceSnapshot, userNotes,
}) {
  return supabase.from('listing_reviews').insert({
    product_id: productId,
    checkpoint_number: checkpointNumber,
    status: 'skipped',
    days_live_at_review: daysLiveAtReview,
    performance_snapshot: performanceSnapshot,
    user_notes: userNotes || null,
  }).select().single();
}

// ─── Portfolio Comparison (Milestone C4) ───────────────────────────────────
// Unscoped reads — no .eq('product_id', ...) — the first cross-product
// queries against either table. Safe at current/expected volume: every
// prior query against these two tables has been product-scoped (both
// tables only came into existence today, Milestone A / C3), and this
// mirrors the exact "small table, fetch all, group in JS" pattern
// useVisualProfilesByListing()/useConceptTagsAll() already use above for
// their own ungated tables. No realtime subscription — matches the
// existing scoped useListingGenerations(productId)/useListingReviews(productId),
// neither of which subscribes either; Portfolio is read-only/display-only
// and exposes refetch() for the one case (arriving via nav after an edit
// elsewhere) that needs a fresh read. useCompetitorListings()'s .range()
// pagination loop is the proven fallback if either table ever grows large.

export function useAllListingGenerations() {
  const [generations, setGenerations] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    const { data } = await supabase
      .from('listing_generations')
      .select('*')
      .order('created_at', { ascending: false });
    setGenerations(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);
  return { generations, loading, refetch: fetch };
}

export function useAllListingReviews() {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    const { data } = await supabase
      .from('listing_reviews')
      .select('*')
      .order('created_at', { ascending: false });
    setReviews(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);
  return { reviews, loading, refetch: fetch };
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
  const now = nowISO();
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
        // Phase 8b — Etsy Marketplace Insights fields. Null for every other
        // source, which is exactly the point: the ledger stays honest about
        // which source knew what, and no column is ever shared across sources
        // (§3's "no mystery score" guaranteed structurally, not by policy).
        conversion_class: k.conversion_class ?? null,
        trend_pct: k.trend_pct ?? null,
        similar_terms: k.similar_terms?.length ? k.similar_terms : null,
        price_range: k.price_range ?? null,
        source_caveat: k.source_caveat ?? null,
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
  const now = nowISO();
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
    .update({ ...updates, updated_at: nowISO() })
    .eq('id', id)
    .select()
    .single();
  return { data, error };
}

export async function archiveSpark(id) {
  return updateSpark(id, { archived_at: nowISO() });
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
    .update({ ...updates, updated_at: nowISO() })
    .eq('id', id)
    .select()
    .single();
  return { data, error };
}

export async function createCollection(name, extra = {}) {
  const { data, error } = await supabase
    .from('collections')
    .insert({ name, status: 'active', priority: 'supporting', ...extra, created_at: nowISO(), updated_at: nowISO() })
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

  useEffect(() => {
    fetch();
    const sub = supabase
      .channel('workshop-items-' + Math.random().toString(36).slice(2))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workshop_items' }, fetch)
      .subscribe();
    return () => supabase.removeChannel(sub);
  }, [fetch]);

  return { items, loading, refetch: fetch };
}

export async function createWorkshopItem(item) {
  const now = nowISO();
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
    .update({ status, reviewed_at: nowISO() })
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
  const now = nowISO();
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
    .update({ ...updates, updated_at: nowISO() })
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
  const now = nowISO();
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
    .update({ ...updates, updated_at: nowISO() })
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
      headers: { 'Content-Type': 'application/json', 'x-function-secret': import.meta.env.VITE_FUNCTION_SECRET },
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
    .update({ body, updated_at: nowISO() })
    .eq('id', id);
}

export async function incrementPlaybookVersion(playbookId) {
  const { data } = await supabase.from('playbooks').select('current_version').eq('id', playbookId).single();
  if (!data) return { error: new Error(`Playbook ${playbookId} not found`) };
  const next = data.current_version + 1;
  return supabase.from('playbooks').update({ current_version: next, updated_at: nowISO() }).eq('id', playbookId);
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

    // A resolved playbook with no matching section_key is a real data
    // problem (stale/typo'd key) — must not fall through to the
    // unconditional 'approved' write below, or this becomes the exact
    // false-approved-no-write state this function exists to prevent.
    if (!section) {
      console.error('[approvePendingUpdate] section_key not found:', update.section_key, 'in playbook', resolvedPlaybookId);
      return { error: new Error(`Section "${update.section_key}" not found in this playbook`) };
    }

    await supabase.from('playbook_history').insert([{
      playbook_section_id: section.id,
      body: section.body,
      version: section.version,
      changed_by: 'user',
      changed_at: nowISO(),
    }]);
    await supabase.from('playbook_sections').update({
      body: newBody || update.text,
      version: (section.version || 1) + 1,
      updated_at: nowISO(),
    }).eq('id', section.id);
    await incrementPlaybookVersion(resolvedPlaybookId);
  }

  return supabase.from('pending_updates').update({
    status: 'approved',
    resolved_at: nowISO(),
  }).eq('id', update.id);
}

export async function rejectPendingUpdate(id) {
  return supabase.from('pending_updates').update({
    status: 'rejected',
    resolved_at: nowISO(),
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
    started_at: nowISO(),
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
    closed_at: nowISO(),
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
      updated_at: nowISO(),
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
  const now = nowISO();
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
    .update({ ...updates, updated_at: nowISO() })
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
  const now = nowISO();
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
    .update({ is_current: true, updated_at: nowISO() })
    .eq('id', newOutputId)
    .select()
    .single();
  return { data, error };
}

export async function updateConceptOutput(id, updates) {
  const { data, error } = await supabase
    .from('concept_outputs')
    .update({ ...updates, updated_at: nowISO() })
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
    .insert({ ...fields, created_at: nowISO() })
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
// kind is chosen at creation time in VisualTagPicker. Passing it here is what
// keeps a newly-invented tag out of the Unsorted bucket -- the pool reached 54
// unclassified tags precisely because there was nowhere to say what a tag was
// at the moment it was created.
export async function createVisualTag(name, kind = null) {
  const trimmed = (name || '').trim();
  if (!trimmed) return { data: null, error: new Error('Tag name required') };
  const { data, error } = await supabase.from('visual_tags').insert({ name: trimmed, kind }).select().single();
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

// ─── Timing Intelligence (Phase 22) ─────────────────────────────────────────
// One fetch per table rather than a deep embedded select: the whole dataset is
// small and bounded (69 niches / 186 guidance rows from the seeded calendar),
// and several consumers need different slices of the same data, so composing
// in JS keeps every caller off a bespoke query shape.

export function useTimingSources(statusFilter = 'active') {
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    let q = supabase.from('timing_sources').select('*').order('name');
    if (statusFilter !== 'all') q = q.eq('status', statusFilter);
    const { data } = await q;
    setSources(data || []);
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => { fetch(); }, [fetch]);
  return { sources, loading, refetch: fetch };
}

export async function createTimingSource(fields) {
  return supabase.from('timing_sources').insert([{ status: 'active', ...fields }]).select().single();
}

export async function updateTimingSource(id, updates) {
  return supabase.from('timing_sources').update(updates).eq('id', id);
}

export async function archiveTimingSource(id) {
  return updateTimingSource(id, { status: 'archived' });
}

export function useTimingNiches() {
  const [niches, setNiches] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    const { data } = await supabase.from('timing_niches').select('*').order('name');
    setNiches(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);
  return { niches, loading, refetch: fetch };
}

export async function createTimingNiche(name, notes = null) {
  return supabase.from('timing_niches').insert([{ name: name.trim(), notes }]).select().single();
}

// Case-insensitive, matching the lower(name) unique index — so a paste naming
// "book reading" resolves to the existing "Book Reading" niche instead of
// failing on the constraint or minting a near-duplicate.
export function findNicheByName(niches, name) {
  if (!name) return null;
  const needle = String(name).trim().toLowerCase();
  return niches.find(n => n.name.toLowerCase() === needle) || null;
}

// Embeds the source so every guidance row can state who asserted it without a
// second lookup — computeTimingState() reads g.timing_sources directly and
// must never be handed an unattributed row.
export function useTimingGuidance(nicheId = null) {
  const [guidance, setGuidance] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    let q = supabase
      .from('timing_guidance')
      .select('*, timing_sources(id, name, source_type, version, edition_label, publisher, url, status)')
      .order('month');
    if (nicheId) q = q.eq('niche_id', nicheId);
    const { data } = await q;
    setGuidance(data || []);
    setLoading(false);
  }, [nicheId]);

  useEffect(() => { fetch(); }, [fetch]);
  return { guidance, loading, refetch: fetch };
}

export async function createTimingGuidance(fields) {
  return supabase.from('timing_guidance').insert([fields]).select().single();
}

export async function deleteTimingGuidance(id) {
  return supabase.from('timing_guidance').delete().eq('id', id);
}

export function useTimingGuidanceNotes() {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    const { data } = await supabase.from('timing_guidance_notes').select('*');
    setNotes(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);
  return { notes, loading, refetch: fetch };
}

export async function createTimingGuidanceNote(guidanceId, guidanceType, text) {
  return supabase.from('timing_guidance_notes')
    .insert([{ guidance_id: guidanceId, guidance_type: guidanceType || null, text, assigned_by: 'user' }])
    .select().single();
}

// Reclassifying always flips assigned_by to 'user': once she has made the
// call it is no longer the transcription's proposal, and that distinction is
// what keeps "which of these did I actually decide?" answerable later.
export async function setGuidanceNoteType(noteId, guidanceType) {
  return supabase.from('timing_guidance_notes')
    .update({ guidance_type: guidanceType || null, assigned_by: 'user' })
    .eq('id', noteId);
}

// Splitting a mixed note into two typed notes is a human act — the calendar's
// Christmas entry is cross-niche advice AND SEO advice in one sentence. The
// original text stays on the parent guidance row either way, so a split can
// never destroy what the page actually said.
export async function splitGuidanceNote(note, parts) {
  const rows = parts
    .filter(p => p.text && p.text.trim())
    .map(p => ({ guidance_id: note.guidance_id, guidance_type: p.guidanceType || null,
                 text: p.text.trim(), assigned_by: 'user' }));
  if (!rows.length) return { error: { message: 'Nothing to split into.' } };
  const { error } = await supabase.from('timing_guidance_notes').insert(rows);
  if (error) return { error };
  return supabase.from('timing_guidance_notes').delete().eq('id', note.id);
}

// Reads timing_niche_collections -- Phase 22's SOURCE-vocabulary junction,
// which is a different table from Phase 2b's taxonomy junction below. Renamed
// from useNicheCollections when the real niche_collections table arrived: two
// hooks called useNicheCollections reading two different tables is how a
// future phase writes a taxonomy link into the timing calendar by accident.
// Had no consumers at the time of the rename; linkTimingNicheToCollection()
// below is what the Timing UI actually calls.
export function useTimingNicheCollections() {
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    const { data } = await supabase.from('timing_niche_collections').select('*');
    setLinks(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);
  return { links, loading, refetch: fetch };
}

// Always an explicit human action — nothing anywhere auto-matches a source's
// niche name onto a TCC collection. "Hockey" in an expert calendar and this
// shop's separate "Field Hockey Niche" collection may not be the same thing,
// and guessing would quietly turn a source's vocabulary into a TCC fact.
export async function linkTimingNicheToCollection(nicheId, collectionId) {
  const { data, error } = await supabase.from('timing_niche_collections')
    .insert({ niche_id: nicheId, collection_id: collectionId }).select().single();
  return { data, error };
}

export async function unlinkTimingNicheFromCollection(nicheId, collectionId) {
  return supabase.from('timing_niche_collections').delete()
    .eq('niche_id', nicheId).eq('collection_id', collectionId);
}

export function useLeadTimeProfiles(statusFilter = 'active') {
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    let q = supabase.from('lead_time_profiles').select('*').order('name');
    if (statusFilter !== 'all') q = q.eq('status', statusFilter);
    const { data } = await q;
    setProfiles(data || []);
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => { fetch(); }, [fetch]);
  return { profiles, loading, refetch: fetch };
}

export async function createLeadTimeProfile(fields) {
  return supabase.from('lead_time_profiles')
    .insert([{ status: 'active', source: 'user_defined', ...fields }]).select().single();
}

export async function updateLeadTimeProfile(id, updates) {
  return supabase.from('lead_time_profiles').update(updates).eq('id', id);
}

export async function archiveLeadTimeProfile(id) {
  return updateLeadTimeProfile(id, { status: 'archived' });
}

// Most specific wins: a profile scoped to this niche, else one scoped to a
// collection the niche is linked to, else the default. Returns null rather
// than a fabricated fallback when nothing is configured — the engine's tier-2
// path exists precisely so an unconfigured shop still gets a real answer.
export function resolveLeadTimeProfile(profiles, { nicheId = null, collectionIds = [] } = {}) {
  if (!profiles?.length) return null;
  return profiles.find(p => p.scope === 'niche' && p.niche_id === nicheId)
      || profiles.find(p => p.scope === 'collection' && collectionIds.includes(p.collection_id))
      || profiles.find(p => p.scope === 'default')
      || null;
}

// Composed timing view — every surface (collection page, product page, Home,
// the Knowledge tab) reads from this one hook so they can never disagree
// about what state a niche is in. The underlying dataset is small and
// bounded, so fetching all of it once is cheaper than four bespoke queries.
export function useNicheTimings(products = [], collections = []) {
  const { niches, loading: l1, refetch: r1 } = useTimingNiches();
  const { guidance, loading: l2, refetch: r2 } = useTimingGuidance();
  const { notes, loading: l3, refetch: r3 } = useTimingGuidanceNotes();
  const { links, loading: l4, refetch: r4 } = useNicheCollections();
  const { profiles, loading: l5, refetch: r5 } = useLeadTimeProfiles();

  const results = useMemo(
    () => buildNicheTimings({ niches, guidance, notes, links, profiles, collections, products }),
    [niches, guidance, notes, links, profiles, collections, products]
  );

  const refetch = useCallback(async () => {
    await Promise.all([r1(), r2(), r3(), r4(), r5()]);
  }, [r1, r2, r3, r4, r5]);

  return { results, loading: l1 || l2 || l3 || l4 || l5, refetch };
}

// ─── TCC Performance Evidence (Phase 23A) ───────────────────────────────────
// The capture layer for the learning loop. Everything here is append-only
// except shop_ads_daily, which is keyed by date because a given calendar day
// has exactly one true set of shop totals — re-importing an overlapping range
// must correct a day rather than duplicate it.

export function useShopAdsDaily(limit = 120) {
  const [days, setDays] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    const { data } = await supabase
      .from('shop_ads_daily')
      .select('*')
      .order('date', { ascending: false })
      .limit(limit);
    setDays(data || []);
    setLoading(false);
  }, [limit]);

  useEffect(() => { fetch(); }, [fetch]);
  return { days, loading, refetch: fetch };
}

// Upsert on date: re-importing an overlapping export corrects those days
// rather than duplicating them. Returns per-row outcome so the UI can report
// what actually changed instead of claiming a flat success.
export async function importShopAdsDaily(rows) {
  if (!rows?.length) return { inserted: 0, updated: 0, error: null };

  const dates = rows.map(r => r.date);
  const { data: existing } = await supabase
    .from('shop_ads_daily')
    .select('date')
    .in('date', dates);
  const had = new Set((existing || []).map(r => r.date));

  const payload = rows.map(r => ({ ...r, imported_at: nowISO() }));
  const { error } = await supabase
    .from('shop_ads_daily')
    .upsert(payload, { onConflict: 'date' });

  if (error) return { inserted: 0, updated: 0, error };
  return {
    inserted: rows.filter(r => !had.has(r.date)).length,
    updated: rows.filter(r => had.has(r.date)).length,
    error: null,
  };
}

export function useListingSnapshots(productId = null, limit = 200) {
  const [snapshots, setSnapshots] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    let q = supabase
      .from('listing_performance_snapshots')
      .select('*, listing_traffic_sources(*), listing_search_terms(*)')
      .order('captured_at', { ascending: false })
      .limit(limit);
    if (productId) q = q.eq('product_id', productId);
    const { data } = await q;
    setSnapshots(data || []);
    setLoading(false);
  }, [productId, limit]);

  useEffect(() => { fetch(); }, [fetch]);
  return { snapshots, loading, refetch: fetch };
}

// One capture = one snapshot row + its channel breakdown + its search terms,
// written together. The children are inserted after the parent so a failed
// child can never leave a snapshot claiming a traffic split it doesn't have;
// on child failure the parent is removed rather than left half-populated.
export async function createListingSnapshot(snapshot, { trafficSources = [], searchTerms = [] } = {}) {
  const { data: row, error } = await supabase
    .from('listing_performance_snapshots')
    .insert([snapshot])
    .select()
    .single();
  if (error || !row) return { data: null, error: error || { message: 'Snapshot insert returned no row' } };

  if (trafficSources.length) {
    const { error: tsErr } = await supabase
      .from('listing_traffic_sources')
      .insert(trafficSources.map(t => ({ ...t, snapshot_id: row.id })));
    if (tsErr) {
      await supabase.from('listing_performance_snapshots').delete().eq('id', row.id);
      return { data: null, error: tsErr };
    }
  }

  if (searchTerms.length) {
    const { error: stErr } = await supabase
      .from('listing_search_terms')
      .insert(searchTerms.map(t => ({ ...t, snapshot_id: row.id })));
    if (stErr) {
      await supabase.from('listing_performance_snapshots').delete().eq('id', row.id);
      return { data: null, error: stErr };
    }
  }

  return { data: row, error: null };
}

// Links a TCC product to its Etsy listing. Always an explicit human action —
// proposeListingLinks() only ever proposes, because two of this shop's
// listings share a byte-identical title and no automated matcher can tell
// them apart.
export async function linkProductToEtsyListing(productId, etsyListingId) {
  return supabase.from('products').update({ etsy_listing_id: etsyListingId }).eq('id', productId);
}

// ─── Niche Taxonomy (Phase 2b) ─────────────────────────────────────────────
// The canonical Broad → Sub → Specific tree. Replaces the nine free-text
// niche-ish labels catalogued in docs/taxonomy-architecture-audit.md — but
// additively: nothing here writes to collections/sparks/concepts/products, and
// no existing read path depends on it. Pure tree logic lives in ./niches.js;
// this file only does I/O.
//
// Case-insensitive sibling uniqueness is enforced by a DB index (see the
// Phase 2a migration) with JS-side matching in front of it, exactly the
// visual_tags convention above.

export function useNiches() {
  const [niches, setNiches] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    const { data } = await supabase.from('niches').select('*').order('name', { ascending: true });
    if (data) setNiches(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetch();
    const sub = supabase
      .channel('niches-' + Math.random().toString(36).slice(2))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'niches' }, fetch)
      .subscribe();
    return () => supabase.removeChannel(sub);
  }, [fetch]);

  return { niches, loading, refetch: fetch };
}

// level is derived from the parent rather than passed in — the caller should
// never be able to create a 'specific' directly under a broad niche. source
// defaults to 'tcc_extension' because anything created by hand after the
// Phase 2a seed is, by definition, not from Taylor's framework (§38).
export async function createNiche(name, { parentId = null, source = 'tcc_extension', notes = null } = {}) {
  const trimmed = (name || '').trim();
  if (!trimmed) return { data: null, error: new Error('Niche name required') };

  let level = 'broad';
  if (parentId) {
    const { data: parent } = await supabase.from('niches').select('level').eq('id', parentId).single();
    if (!parent) return { data: null, error: new Error('Parent niche not found') };
    level = childLevelOf(parent);
    if (!level) return { data: null, error: new Error('That niche is already at the deepest level.') };
  }

  const now = nowISO();
  const { data, error } = await supabase
    .from('niches')
    .insert({ name: trimmed, level, parent_id: parentId, source, notes, created_at: now, updated_at: now })
    .select()
    .single();

  if (error) {
    // Same insert-or-reuse recovery as createVisualTag: a unique violation
    // here means this name already exists under this parent in different
    // casing, which is a duplicate the user should be pointed at, not a
    // failure. Scoped to the same parent — a name is only a duplicate
    // relative to its siblings.
    if (error.message?.toLowerCase().includes('unique')) {
      let q = supabase.from('niches').select('*').ilike('name', trimmed);
      q = parentId ? q.eq('parent_id', parentId) : q.is('parent_id', null);
      const { data: existing } = await q.maybeSingle();
      if (existing) return { data: existing, error: null, alreadyExisted: true };
    }
    return { data: null, error };
  }
  return { data, error: null };
}

export async function updateNiche(id, updates) {
  const { data, error } = await supabase
    .from('niches')
    .update({ ...updates, updated_at: nowISO() })
    .eq('id', id)
    .select()
    .single();
  return { data, error };
}

// §36 asks for archive as the normal removal path. Archiving a parent leaves
// its children alone on purpose: they stay individually reachable and can be
// archived or moved deliberately, rather than a whole branch disappearing
// from one click. flattenForPicker() in ./niches.js is written to match —
// it keeps the children of an archived parent visible.
export async function archiveNiche(id)   { return updateNiche(id, { status: 'archived' }); }
export async function unarchiveNiche(id) { return updateNiche(id, { status: 'active' }); }

// Only ever succeeds for a leaf — the DB's ON DELETE RESTRICT on parent_id is
// the real guarantee; canDeleteNiche() in ./niches.js gives the UI the same
// answer up front so the button can be disabled with a reason.
export async function deleteNiche(id) {
  return supabase.from('niches').delete().eq('id', id);
}

// Moving a node moves its subtree, so this is several row updates, and
// PostgREST gives us no transaction to wrap them in. Ordering is deliberate:
// the moved node's parent_id goes LAST, after every descendant's level has
// already been corrected. If a descendant write fails, the tree structure is
// still untouched and the only damage is a stale level column on rows that
// have not moved — recoverable, and invisible to every read that does not
// filter on level. Writing the move first would instead leave a genuinely
// relocated subtree carrying wrong levels.
//
// If anything does fail partway, the caller gets needsRepair: true and should
// offer recomputeNicheLevels(), which rebuilds every level from actual depth.
export async function reparentNiche(nicheId, newParentId, allNiches) {
  const plan = planReparent(nicheId, newParentId, allNiches);
  if (!plan.ok) return { error: new Error(plan.error) };

  const moveRow = plan.updates.find(u => u.id === nicheId);
  const descendantRows = plan.updates.filter(u => u.id !== nicheId);
  const now = nowISO();

  for (const row of descendantRows) {
    const { id, ...fields } = row;
    const { error } = await supabase.from('niches').update({ ...fields, updated_at: now }).eq('id', id);
    if (error) return { error, needsRepair: true };
  }

  const { id, ...moveFields } = moveRow;
  const { error } = await supabase.from('niches').update({ ...moveFields, updated_at: now }).eq('id', id);
  if (error) return { error, needsRepair: descendantRows.length > 0 };

  return { error: null };
}

// Self-heal for the partial-failure case above: recomputes every niche's level
// from its actual depth in the tree and writes back only the rows that are
// wrong. Safe to run at any time — a no-op when everything already agrees.
export async function recomputeNicheLevels() {
  const { data: niches, error } = await supabase.from('niches').select('*');
  if (error) return { error, fixed: 0 };

  const now = nowISO();
  let fixed = 0;
  for (const n of niches || []) {
    const correct = levelForDepth(ancestorsOf(n, niches).length - 1);
    if (correct && correct !== n.level) {
      const { error: updErr } = await supabase.from('niches').update({ level: correct, updated_at: now }).eq('id', n.id);
      if (updErr) return { error: updErr, fixed };
      fixed++;
    }
  }
  return { error: null, fixed };
}

// ─── niche ↔ collection links ──────────────────────────────────────────────
// Many-to-many, human-populated only. Collections survive as a separate
// curated layer (§5); this is the join that lets a collection span several
// niches without either concept swallowing the other.

export function useNicheCollections() {
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    const { data } = await supabase.from('niche_collections').select('niche_id, collection_id');
    setLinks(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetch();
    const sub = supabase
      .channel('niche-collections-' + Math.random().toString(36).slice(2))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'niche_collections' }, fetch)
      .subscribe();
    return () => supabase.removeChannel(sub);
  }, [fetch]);

  // Both directions, since the Collections page needs "which niches is this
  // collection in?" and the niche tree needs "how many collections hang off
  // this node?" — computing both once here beats every consumer re-reducing
  // the same array.
  const collectionIdsByNicheId = {};
  const nicheIdsByCollectionId = {};
  for (const l of links) {
    (collectionIdsByNicheId[l.niche_id] ||= []).push(l.collection_id);
    (nicheIdsByCollectionId[l.collection_id] ||= []).push(l.niche_id);
  }

  return { links, collectionIdsByNicheId, nicheIdsByCollectionId, loading, refetch: fetch };
}

export async function linkNicheCollection(nicheId, collectionId) {
  const { data, error } = await supabase
    .from('niche_collections')
    .insert({ niche_id: nicheId, collection_id: collectionId })
    .select()
    .single();
  // Composite PK — re-linking something already linked is a no-op, not an error.
  if (error?.message?.toLowerCase().includes('duplicate')) return { data: null, error: null };
  return { data, error };
}

export async function unlinkNicheCollection(nicheId, collectionId) {
  return supabase.from('niche_collections')
    .delete()
    .eq('niche_id', nicheId)
    .eq('collection_id', collectionId);
}

// ─── Competitor Title Patterns (Phase 7 / §17) ─────────────────────────────
// Marketplace evidence for the §15–16 title debate: what do real Etsy listings
// that actually sell look like? Reads competitor_listings.product_name, which
// already holds 3,000 real titles, and measures them via the pure classifier in
// ./titlePatterns.js. Nothing is written — patterns are derived on read, which
// is what keeps this clear of §29's "no full historical competitor/title
// reclassification".
//
// minSales filters server-side rather than pulling everything and discarding
// most of it: §17 asks about BEST SELLERS specifically, and a pattern shared by
// thousands of listings that barely sell is not evidence of anything. The cap
// exists because this runs inside the Listing Builder, where a multi-thousand
// row fetch on every mount would be felt.
export function useCompetitorTitlePatterns({ minSales = 100, category = null, limit = 1000 } = {}) {
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from('competitor_listings')
      .select('product_name, est_sales, category')
      .gte('est_sales', minSales)
      .order('est_sales', { ascending: false })
      .limit(limit);
    if (category) q = q.eq('category', category);
    const { data } = await q;
    setListings(data || []);
    setLoading(false);
  }, [minSales, category, limit]);

  useEffect(() => { fetch(); }, [fetch]);
  return { listings, loading, refetch: fetch };
}

// ─── SEO Network — keyword↔niche links and clusters (Phase 8a) ─────────────
// §13: "Taxonomy is a tree. SEO is a network around that tree." These are the
// network edges. Unlike sparks/concepts/products, which each carry ONE
// primary_niche_id, a keyword links to as many niches as it genuinely serves
// (§29) — shoppers do not respect the tree, and forcing "bookish sweatshirt"
// into a single branch would either lose three real markets or duplicate the
// keyword four times, which would split its evidence ledger.

// Every niche link for a set of keywords, grouped by keyword_id. Batched
// rather than one query per keyword: the Research keyword list renders
// hundreds of rows at once, and an N+1 there is felt immediately.
export function useKeywordNiches(keywordIds) {
  const [byKeywordId, setByKeywordId] = useState({});
  const [loading, setLoading] = useState(true);
  // Join on a stable string so a caller passing a fresh array literal each
  // render doesn't re-trigger the fetch forever.
  const idKey = (keywordIds || []).join(',');

  const fetch = useCallback(async () => {
    const ids = idKey ? idKey.split(',') : [];
    if (!ids.length) { setByKeywordId({}); setLoading(false); return; }
    const { data } = await supabase
      .from('keyword_niches')
      .select('keyword_id, niche_id, is_primary')
      .in('keyword_id', ids);
    const grouped = {};
    for (const row of data || []) (grouped[row.keyword_id] ||= []).push(row);
    setByKeywordId(grouped);
    setLoading(false);
  }, [idKey]);

  useEffect(() => { fetch(); }, [fetch]);
  return { byKeywordId, loading, refetch: fetch };
}

export async function linkKeywordToNiche(keywordId, nicheId, { isPrimary = false } = {}) {
  const { data, error } = await supabase
    .from('keyword_niches')
    .insert({ keyword_id: keywordId, niche_id: nicheId, is_primary: isPrimary })
    .select()
    .single();
  // Composite PK — re-linking an existing pair is a no-op, not a failure.
  if (error?.message?.toLowerCase().includes('duplicate')) return { data: null, error: null };
  return { data, error };
}

export async function unlinkKeywordFromNiche(keywordId, nicheId) {
  return supabase.from('keyword_niches')
    .delete().eq('keyword_id', keywordId).eq('niche_id', nicheId);
}

// At most one primary per keyword, enforced here rather than by a DB
// constraint: a partial unique index would make a UI bug leave a keyword
// unsaveable, and "which niche does this term mostly belong to" is a
// preference, not an integrity rule.
export async function setPrimaryKeywordNiche(keywordId, nicheId) {
  await supabase.from('keyword_niches')
    .update({ is_primary: false })
    .eq('keyword_id', keywordId);
  if (!nicheId) return { error: null };
  return supabase.from('keyword_niches')
    .update({ is_primary: true })
    .eq('keyword_id', keywordId).eq('niche_id', nicheId);
}

export async function setKeywordSearchIntent(keywordId, intent) {
  const { data, error } = await supabase
    .from('keywords')
    .update({ search_intent: intent || null, updated_at: nowISO() })
    .eq('id', keywordId)
    .select()
    .single();
  return { data, error };
}

// ─── Keyword clusters (§28) ────────────────────────────────────────────────
// Reusable SEO groupings that cut across the tree. §27 is explicit that a
// cluster is NOT a niche level, which is why membership is its own junction
// rather than a column on keywords.

export function useKeywordClusters(nicheId = undefined) {
  const [clusters, setClusters] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    let q = supabase
      .from('keyword_clusters')
      .select('*, keyword_cluster_keywords(keyword_id)')
      .neq('status', 'archived')
      .order('name', { ascending: true });
    // undefined means "every cluster"; null means "only unassigned ones",
    // which is a real filter and not the same question.
    if (nicheId === null) q = q.is('niche_id', null);
    else if (nicheId) q = q.eq('niche_id', nicheId);
    const { data } = await q;
    setClusters((data || []).map(c => ({
      ...c,
      keywordIds: (c.keyword_cluster_keywords || []).map(k => k.keyword_id),
    })));
    setLoading(false);
  }, [nicheId]);

  useEffect(() => { fetch(); }, [fetch]);
  return { clusters, loading, refetch: fetch };
}

export async function createKeywordCluster(name, { nicheId = null, notes = null } = {}) {
  const trimmed = (name || '').trim();
  if (!trimmed) return { data: null, error: new Error('Cluster name required') };
  const now = nowISO();
  const { data, error } = await supabase
    .from('keyword_clusters')
    .insert({ name: trimmed, niche_id: nicheId, notes, created_at: now, updated_at: now })
    .select()
    .single();
  if (error) {
    // Same insert-or-reuse recovery as createVisualTag/createNiche: a unique
    // violation means this name already exists under this niche, which is a
    // cluster to reuse rather than an error to show.
    if (error.message?.toLowerCase().includes('unique')) {
      let q = supabase.from('keyword_clusters').select('*').ilike('name', trimmed);
      q = nicheId ? q.eq('niche_id', nicheId) : q.is('niche_id', null);
      const { data: existing } = await q.maybeSingle();
      if (existing) return { data: existing, error: null, alreadyExisted: true };
    }
    return { data: null, error };
  }
  return { data, error: null };
}

export async function updateKeywordCluster(id, updates) {
  const { data, error } = await supabase
    .from('keyword_clusters')
    .update({ ...updates, updated_at: nowISO() })
    .eq('id', id)
    .select()
    .single();
  return { data, error };
}

export async function archiveKeywordCluster(id) {
  return updateKeywordCluster(id, { status: 'archived' });
}

export async function addKeywordToCluster(clusterId, keywordId) {
  const { data, error } = await supabase
    .from('keyword_cluster_keywords')
    .insert({ cluster_id: clusterId, keyword_id: keywordId })
    .select()
    .single();
  if (error?.message?.toLowerCase().includes('duplicate')) return { data: null, error: null };
  return { data, error };
}

export async function removeKeywordFromCluster(clusterId, keywordId) {
  return supabase.from('keyword_cluster_keywords')
    .delete().eq('cluster_id', clusterId).eq('keyword_id', keywordId);
}

// ─── Research Evidence — the screenshot trail (Phase 8b / §16) ─────────────
// §16 rules out a fake automatic Etsy importer and asks instead for
// Screenshot -> extraction suggestion -> HUMAN REVIEW -> structured data,
// with the original evidence stored where practical. These functions cover
// the capture and review ends; nothing here extracts anything, and §29
// explicitly rules out automatic OCR without review.
//
// reviewed_at NULL is the meaningful state — captured but not yet turned into
// data. That is a queue, not a defect, which is why the "unreviewed" read gets
// its own partial index in the migration.

export function useResearchEvidence({ sessionId = undefined, nicheId = undefined, unreviewedOnly = false } = {}) {
  const [evidence, setEvidence] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    let q = supabase.from('research_evidence').select('*').order('created_at', { ascending: false });
    if (sessionId) q = q.eq('research_session_id', sessionId);
    if (nicheId) q = q.eq('niche_id', nicheId);
    if (unreviewedOnly) q = q.is('reviewed_at', null);
    const { data } = await q;
    setEvidence(data || []);
    setLoading(false);
  }, [sessionId, nicheId, unreviewedOnly]);

  useEffect(() => { fetch(); }, [fetch]);
  return { evidence, loading, refetch: fetch };
}

// Uploads to the research-evidence bucket, then records the row. Deliberately
// two steps with the row written second: an orphaned file in storage is
// invisible clutter, whereas a row pointing at a file that failed to upload is
// a broken record that looks real. Fail toward the harmless one.
export async function uploadResearchEvidence(file, { sessionId = null, nicheId = null, source = null, capturedAt = null, label = null, notes = null } = {}) {
  if (!file) return { data: null, error: new Error('No file provided') };

  const ext = (file.name?.split('.').pop() || 'png').toLowerCase();
  const stamp = nowISO().replace(/[:.]/g, '-');
  const path = `${nicheId || 'unfiled'}/${stamp}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('research-evidence')
    .upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (uploadError) return { data: null, error: uploadError };

  const { data, error } = await supabase
    .from('research_evidence')
    .insert({
      research_session_id: sessionId,
      niche_id: nicheId,
      source,
      storage_path: path,
      mime_type: file.type || null,
      size_bytes: file.size ?? null,
      // The date the SCREEN showed, not the upload date — Etsy's panel reports
      // a trailing 30-day window, so when it was captured matters more than
      // when it happened to be filed.
      captured_at: capturedAt || null,
      label,
      notes,
    })
    .select()
    .single();

  if (error) {
    // Roll the file back so a failed insert doesn't leave an unreferenced
    // object behind — same rollback discipline createResearchSession uses.
    await supabase.storage.from('research-evidence').remove([path]);
    return { data: null, error };
  }
  return { data, error: null };
}

// Signed URL, because the bucket is private. Short-lived on purpose: these are
// display links inside the app, not something to paste anywhere.
export async function getResearchEvidenceUrl(storagePath, expiresInSeconds = 3600) {
  const { data, error } = await supabase.storage
    .from('research-evidence')
    .createSignedUrl(storagePath, expiresInSeconds);
  return { url: data?.signedUrl || null, error };
}

// Marks evidence as turned into data. Never sets it automatically — §16's
// whole point is that a human stands between the screenshot and the numbers.
export async function markResearchEvidenceReviewed(id, { sessionId = undefined } = {}) {
  const patch = { reviewed_at: nowISO() };
  if (sessionId !== undefined) patch.research_session_id = sessionId;
  const { data, error } = await supabase
    .from('research_evidence')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  return { data, error };
}

export async function deleteResearchEvidence(id, storagePath) {
  if (storagePath) await supabase.storage.from('research-evidence').remove([storagePath]);
  return supabase.from('research_evidence').delete().eq('id', id);
}

// ─── Analysis records (Phase 9 / §4, §26) ──────────────────────────────────
// Durable, human-editable analysis, kept deliberately separate from the
// machine-derived interpretation columns on `keywords`. Those are recomputed
// and overwritten every time new evidence lands; these are not. The columns
// answer "what do the numbers say right now"; these answer "what did we
// conclude, when, and did it hold".
//
// §40's "AI can suggest, human approves durable decisions" is enforced by
// data here rather than by convention: an AI-authored row is created with
// status 'proposed' and nothing downstream may treat it as settled until a
// human flips it to 'approved'.

export function useAnalysisRecords({ scopeType = undefined, scopeId = undefined, pendingOnly = false } = {}) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    let q = supabase.from('analysis_records').select('*').order('created_at', { ascending: false });
    if (scopeType) q = q.eq('scope_type', scopeType);
    if (scopeId) q = q.eq('scope_id', scopeId);
    if (pendingOnly) q = q.in('status', ['draft', 'proposed']);
    const { data } = await q;
    setRecords(data || []);
    setLoading(false);
  }, [scopeType, scopeId, pendingOnly]);

  useEffect(() => { fetch(); }, [fetch]);
  return { records, loading, refetch: fetch };
}

// scopeLabel is denormalized at write time on purpose: scope_id carries no FK
// (see the migration for why), so a niche that is later archived or renamed
// would otherwise leave an analysis whose subject is unreadable. A written
// judgment outliving its subject is the expected case, not an edge case.
export async function createAnalysisRecord({
  scopeType, scopeId = null, scopeLabel = null,
  evidenceSnapshot = null, interpretation = null, decision = null,
  hypothesis = null, learning = null, findings = null,
  authoredBy = 'human', status = 'draft',
}) {
  const now = nowISO();
  const { data, error } = await supabase
    .from('analysis_records')
    .insert({
      scope_type: scopeType,
      scope_id: scopeId,
      scope_label: scopeLabel,
      evidence_snapshot: evidenceSnapshot,
      interpretation, decision, hypothesis, learning,
      findings,
      authored_by: authoredBy,
      // An AI-authored record can never be created already-approved, whatever
      // the caller asks for. This is the one place that rule can be enforced
      // once rather than trusted at every call site.
      status: authoredBy === 'ai' && status === 'approved' ? 'proposed' : status,
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();
  return { data, error };
}

export async function updateAnalysisRecord(id, updates) {
  const { data, error } = await supabase
    .from('analysis_records')
    .update({ ...updates, updated_at: nowISO() })
    .eq('id', id)
    .select()
    .single();
  return { data, error };
}

// Approval is always an explicit human act and always stamps a time, so
// "when did we decide this" is answerable later without reading history.
export async function approveAnalysisRecord(id) {
  return updateAnalysisRecord(id, { status: 'approved', approved_at: nowISO() });
}

// Superseding rather than deleting: an analysis that turned out wrong is
// evidence about how TCC reasons, and deleting it would quietly erase the
// learning §26 is trying to accumulate.
export async function supersedeAnalysisRecord(id) {
  return updateAnalysisRecord(id, { status: 'superseded' });
}

export async function deleteAnalysisRecord(id) {
  return supabase.from('analysis_records').delete().eq('id', id);
}
