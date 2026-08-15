// ─── Checkpoint Review Loop — Milestone C3 ─────────────────────────────────
// Pure, deterministic, no AI/DB calls, no browser globals — mirrors
// storePolicies.js's/listingSEO.js's shape and house style. Two audiences
// import this file: React (src/components/ReviewCheckpoints.jsx,
// src/pages/ProductWorkspace.jsx) AND netlify/functions/claude-process.js
// via require() (the same CommonJS/ESM interop already proven live by
// generate-listing-v2.js's require('../../src/lib/productTruth.js'), which
// works because netlify.toml sets node_bundler = "esbuild"). This is the
// single source of truth for the checkpoint schedule and the shared
// recommendation/decision vocabulary, required into the AI prompt on one
// side and rendered as UI badges/buttons on the other, so they can never
// silently drift apart the way a hardcoded copy in each place could.

import { buildKeywordPool, compareOpportunity } from './listingSEO.js';
import { daysBetween, today } from '../data/seasons.js';

export const CHECKPOINT_DAYS = [30, 60, 90, 120];

// Shared between ai_recommendation and user_decision — same vocabulary on
// purpose (keeps "AI said X, I chose Y" legible at a glance in the UI), but
// always two separate columns/controls so nothing ever pre-fills one from
// the other. Traced directly to Kristen's own existing guidance text in
// src/data/stages.js's STAGE_NEXT_ACTIONS['Live'] / ['Reviewing'] rather
// than invented: "update title and 2-3 tags" / "rewrite title and tags" ->
// update_seo; "swap the hero image" -> update_creative; "consider a color
// variant or companion product" / "duplicate and expand the line" ->
// expand_line; "rewrite title and tags, or kill" (the kill half) ->
// kill_or_pause; "consistent performer" -> no_action_needed.
// insufficient_data is Kristen's own explicit required addition: the AI
// (and the human) must be allowed to hold rather than force a diagnosis.
export const CHECKPOINT_DECISION_KEYS = [
  'no_action_needed',
  'update_seo',
  'update_creative',
  'expand_line',
  'kill_or_pause',
  'insufficient_data',
];

// Haiku, matching evaluate_keyword_evidence — a bounded classification-plus-
// reasoning call, not the high-stakes creative generation generate-listing-v2.js
// reserves Sonnet for. Single source of truth so claude-process.js's actual
// API call and the ai_model value persisted alongside it can never disagree.
export const CHECKPOINT_AI_MODEL = 'claude-haiku-4-5-20251001';

// The 19 LiveStats-writeable products columns (see handleSave() in
// ProductWorkspace.jsx's LiveStats) plus printify_cost (written elsewhere in
// the same file, read-only inside LiveStats) — the exhaustive list of what
// gets frozen into performance_snapshot. Kept as one exported array so the
// migration comment, the snapshot builder below, and any future reader agree
// on exactly what "the snapshot" contains.
export const LIVE_STATS_FIELDS = [
  'went_live_at', 'stats_updated_at',
  'mo_sales', 'mo_revenue', 'total_sales', 'reviews', 'mo_reviews',
  'views', 'favorites', 'conversion_rate', 'visibility_score', 'review_ratio',
  'ad_views', 'ad_clicks', 'ad_click_rate', 'ad_orders', 'ad_revenue', 'ad_spend', 'ad_roas',
  'printify_cost',
];

// Mirrors LiveStats' own inline profit calc in ProductWorkspace.jsx exactly
// (same guards: no printify_cost, or no mo_sales/mo_revenue yet -> no
// computed block at all, never a misleading NaN/0 baked into frozen
// history). Deliberately duplicated rather than extracted out of LiveStats'
// JSX — keeps this change from touching LiveStats' working render code at
// all; if LiveStats' formula ever changes, update both.
function computeProfitSummary(product) {
  if (!product.printify_cost) return null;
  if (!product.mo_sales || !product.mo_revenue) return null;
  const netProfit = Number(product.mo_revenue) - product.printify_cost * Number(product.mo_sales) - Number(product.ad_spend || 0);
  const roas = product.ad_spend > 0 ? Number(product.ad_revenue || 0) / Number(product.ad_spend) : null;
  const marginPct = Number(product.mo_revenue) > 0 ? Number((netProfit / Number(product.mo_revenue) * 100).toFixed(1)) : null;
  return { net_profit: Number(netProfit.toFixed(2)), margin_pct: marginPct, roas: roas !== null ? Number(roas.toFixed(2)) : null };
}

// Pure snapshot builder — called ONCE by the caller (ReviewCheckpoints.jsx)
// at the moment a checkpoint flow opens, then threaded unchanged through
// both the AI-call payload and the final DB write, so what the AI reasoned
// over and what gets persisted are provably identical, even if Kristen edits
// LiveStats again in the minutes in between.
export function buildPerformanceSnapshot(product) {
  const snapshot = {};
  for (const field of LIVE_STATS_FIELDS) snapshot[field] = product[field] ?? null;
  snapshot.computed = computeProfitSummary(product);
  return snapshot;
}

// null when there's no generation yet (a checkpoint can exist before any
// AI-generated listing does, e.g. a hand-written pre-Milestone-A listing) —
// callers/prompt-builders must handle that, not treat it as an error.
export function buildGenerationSnapshot(generation) {
  if (!generation) return null;
  return {
    generation_id: generation.id,
    title: generation.title || null,
    tags: generation.tags || null,
    primary_search_intent: generation.primary_search_intent || null,
    primary_intent_status: generation.primary_intent_status || null,
    generated_at: generation.created_at || null,
  };
}

// Compact, real "current research evidence" for the AI prompt — reuses
// listingSEO.js's own evidence-pool/ranking logic (buildKeywordPool,
// compareOpportunity) rather than re-deriving keyword dedup/ranking a
// second time. 'use'-tagged only — the keywords already promoted to actual
// listing candidates, same filter ProductWorkspace.jsx itself applies
// (allUseKws), not the full raw research pool. Top N by real evidence
// quality (classification/confidence), not by raw score alone — same
// ranking listingSEO.js already uses for "opportunities."
export function summarizeKeywordEvidence(sessions, { isSeasonalProduct = false, limit = 8 } = {}) {
  const pool = buildKeywordPool(sessions, { isSeasonalProduct });
  return pool
    .filter(k => k.tag_type === 'use')
    .sort(compareOpportunity)
    .slice(0, limit)
    .map(k => ({
      keyword: k.keyword, volume: k.volume ?? null, competition: k.competition ?? null,
      score: k.score ?? null, classification: k.classification ?? null, confidence: k.confidence ?? null,
    }));
}

// The core state machine — analogous to getNeedsAttention()'s shape in
// hooks.js but returning full per-checkpoint state, not a boolean. Pure:
// takes a product row and this product's listing_reviews rows (any order),
// returns one entry per CHECKPOINT_DAYS value. Never mutates, never calls
// Supabase. daysBetween/today reused from data/seasons.js — the exact same
// day-math LiveStats' own 30-day bar already uses, so this never drifts
// from what that existing indicator shows.
export function computeCheckpointStates(product, reviewRows = []) {
  if (!product?.went_live_at) {
    return CHECKPOINT_DAYS.map(checkpointNumber => ({
      checkpointNumber, state: 'no_went_live_date', insufficientData: false,
      dueDate: null, daysUntilDue: null, daysOverdue: null, row: null, priorRows: [],
    }));
  }

  const daysLive = daysBetween(product.went_live_at, today());

  const byCheckpoint = new Map();
  for (const row of reviewRows) {
    const list = byCheckpoint.get(row.checkpoint_number) || [];
    list.push(row);
    byCheckpoint.set(row.checkpoint_number, list);
  }

  return CHECKPOINT_DAYS.map(checkpointNumber => {
    const dueDate = new Date(product.went_live_at + 'T00:00:00');
    dueDate.setDate(dueDate.getDate() + checkpointNumber);
    const dueDateStr = dueDate.toISOString().slice(0, 10);

    const rows = (byCheckpoint.get(checkpointNumber) || [])
      .slice()
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const [row, ...priorRows] = rows;

    if (row) {
      return {
        checkpointNumber,
        state: row.status, // 'reviewed' | 'skipped'
        insufficientData: row.status === 'reviewed' && row.user_decision === 'insufficient_data',
        dueDate: dueDateStr,
        daysUntilDue: null, daysOverdue: null,
        row, priorRows,
      };
    }

    const state = daysLive >= checkpointNumber ? 'due' : 'upcoming';
    return {
      checkpointNumber, state, insufficientData: false,
      dueDate: dueDateStr,
      daysUntilDue: state === 'upcoming' ? checkpointNumber - daysLive : null,
      daysOverdue: state === 'due' ? daysLive - checkpointNumber : null,
      row: null, priorRows: [],
    };
  });
}

// Convenience for a compact "act on this next" summary badge — earliest
// Due first, else earliest Upcoming, else null (nothing left to act on /
// no went-live date). Pure, small, kept exported/testable rather than
// inlined in the component.
export function getNextActionableCheckpoint(checkpointStates) {
  const due = checkpointStates.filter(c => c.state === 'due');
  if (due.length) return due[0];
  const upcoming = checkpointStates.filter(c => c.state === 'upcoming');
  return upcoming[0] || null;
}
