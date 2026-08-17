// ─── TCC Intelligence — Phase 23A ──────────────────────────────────────────
// Pure, deterministic, no AI/DB calls, no browser globals — same house style
// as timingIntelligence.js / listingReviews.js / listingSEO.js. Deliberately
// does NOT import claude.js: Phase 23A is the evidence floor, and the brief is
// explicit that AI must not turn every performance difference into a
// "learning". There is no generation step here to misuse.
//
// WHAT THIS FILE IS ALLOWED TO CONCLUDE
// Only how old a listing is, whether enough time has passed to judge it, and
// how to shape captured numbers into a snapshot. It computes no baselines, no
// observations and no learnings — those are 23B, and building them over the
// current population (0 orders ever, 0 launch dates) would be exactly the
// thin-evidence theatre the brief forbids.
//
// THE UNITS RULE, RESTATED IN CODE
// Etsy says "Views" for two different things on two screens. Everywhere in
// this file:
//     impressions = seen in search   (Stats "Views",  Ads "Views")
//     visits      = clicked into it  (Stats "Visits", Ads "Clicks")
// ad_* fields are the PAID SUBSET and are never summed with the totals.

import { daysBetween, today } from '../data/seasons.js';
import { CHECKPOINT_DAYS } from './listingReviews.js';

// ── Maturity ───────────────────────────────────────────────────────────────
// Derived from CHECKPOINT_DAYS rather than a second hardcoded list, so this
// and Milestone C3's checkpoint loop can never disagree about what "60 days"
// means. C3 already owns whether a checkpoint is due/reviewed/skipped; this
// only adds the single at-a-glance label the brief asks for.
export const MATURITY = {
  NO_LAUNCH_DATE: 'NO_LAUNCH_DATE',
  NEW: 'NEW',
  DAY_30: 'DAY_30',
  DAY_60: 'DAY_60',
  DAY_90: 'DAY_90',
  DAY_120: 'DAY_120',
  MATURE: 'MATURE',
};

export const MATURITY_LABEL = {
  NO_LAUNCH_DATE: 'Launch date missing',
  NEW: 'New',
  DAY_30: '30-day review',
  DAY_60: '60-day review',
  DAY_90: '90-day review',
  DAY_120: '120-day review',
  MATURE: 'Mature',
};

// Neutral/blue for young, green only once there is real standing. Reuses this
// app's existing palette rather than introducing a sixth colour vocabulary.
export const MATURITY_STYLE = {
  NO_LAUNCH_DATE: { color: '#7a4a1e', bg: 'rgba(232,168,124,0.2)' },
  NEW:            { color: '#2d4270', bg: 'rgba(107,130,168,0.15)' },
  DAY_30:         { color: '#2d4270', bg: 'rgba(107,130,168,0.2)'  },
  DAY_60:         { color: '#2d6b3c', bg: 'rgba(124,175,138,0.15)' },
  DAY_90:         { color: '#2d6b3c', bg: 'rgba(124,175,138,0.18)' },
  DAY_120:        { color: '#2d6b3c', bg: 'rgba(124,175,138,0.2)'  },
  MATURE:         { color: '#2d6b3c', bg: 'rgba(124,175,138,0.25)' },
};

// Unknown stays unknown: a missing launch date is never treated as "launched
// today" or backfilled from created_at / stage_updated_at, which are different
// events entirely.
export function computeMaturity(product, todayStr = today()) {
  if (!product?.went_live_at) {
    return { state: MATURITY.NO_LAUNCH_DATE, daysLive: null, nextCheckpoint: null, daysToNextCheckpoint: null };
  }
  const daysLive = daysBetween(product.went_live_at, todayStr);
  const passed = CHECKPOINT_DAYS.filter(d => daysLive >= d);
  const nextCheckpoint = CHECKPOINT_DAYS.find(d => daysLive < d) ?? null;

  let state;
  if (!passed.length) state = MATURITY.NEW;
  else if (passed[passed.length - 1] >= CHECKPOINT_DAYS[CHECKPOINT_DAYS.length - 1]) state = MATURITY.MATURE;
  else state = `DAY_${passed[passed.length - 1]}`;

  return {
    state,
    daysLive,
    nextCheckpoint,
    daysToNextCheckpoint: nextCheckpoint == null ? null : nextCheckpoint - daysLive,
  };
}

// ── "Do not touch yet" ─────────────────────────────────────────────────────
// The brief treats this as a real system state, not a soft hint: a listing
// that is simply young must not be mistaken for a validated failure. Poor
// early numbers are an absence of evidence, not evidence of absence.
//
// Deliberately does NOT look at performance at all. Whether a listing is too
// young to judge is a question about elapsed time, and letting weak numbers
// override it would defeat the entire purpose — the states most in need of
// protection are precisely the ones that look bad.
export function computeDoNotTouch(product, todayStr = today()) {
  const maturity = computeMaturity(product, todayStr);

  if (maturity.state === MATURITY.NO_LAUNCH_DATE) {
    return {
      doNotTouch: false,
      reason: 'No launch date recorded, so listing age is unknown and no review window can be calculated.',
      maturity,
    };
  }
  if (maturity.state === MATURITY.NEW) {
    return {
      doNotTouch: true,
      reason: `Live ${maturity.daysLive} day${maturity.daysLive === 1 ? '' : 's'}. Has not reached the first ${CHECKPOINT_DAYS[0]}-day checkpoint. Continue collecting evidence.`,
      maturity,
    };
  }
  return {
    doNotTouch: false,
    reason: `Live ${maturity.daysLive} days and past the ${maturity.state.replace('DAY_', '')}-day checkpoint${maturity.state === MATURITY.MATURE ? 's' : ''}. There is enough elapsed time to review.`,
    maturity,
  };
}

// How much weight any reading about this listing can carry. Used to cap
// confidence everywhere downstream so a 3-day-old listing can never produce a
// "supported" conclusion, however striking its numbers look.
export function maturityConfidenceCap(product, todayStr = today()) {
  const { state } = computeMaturity(product, todayStr);
  if (state === MATURITY.NO_LAUNCH_DATE || state === MATURITY.NEW) return 'none';
  if (state === MATURITY.DAY_30 || state === MATURITY.DAY_60) return 'low';
  if (state === MATURITY.DAY_90) return 'medium';
  return 'high';
}

// ── Funnel shaping ─────────────────────────────────────────────────────────
// The brief's discovery -> click -> conversion split, computed only where the
// inputs genuinely exist. Every rate returns null rather than 0 when its
// denominator is missing or zero: "no impressions yet" and "impressions but
// nobody clicked" are completely different findings and must not both render
// as 0%.
export function computeFunnel(snapshot) {
  if (!snapshot) return null;
  const num = v => (v === null || v === undefined || v === '' ? null : Number(v));

  const impressions = num(snapshot.impressions);
  const visits = num(snapshot.visits);
  const orders = num(snapshot.orders);
  const revenue = num(snapshot.revenue);

  const rate = (a, b) => (a == null || b == null || b === 0 ? null : a / b);

  return {
    impressions, visits, orders, revenue,
    clickRate: rate(visits, impressions),
    conversionRate: rate(orders, visits),
    // Paid subset, kept separate and never folded into the above.
    adImpressions: num(snapshot.ad_impressions),
    adClicks: num(snapshot.ad_clicks),
    adSpend: num(snapshot.ad_spend),
    adClickRate: rate(num(snapshot.ad_clicks), num(snapshot.ad_impressions)),
    // Organic is only honest when the paid subset is actually known.
    organicVisits: visits != null && num(snapshot.ad_clicks) != null
      ? Math.max(0, visits - num(snapshot.ad_clicks))
      : null,
  };
}

// The brief's §14 diagnostic framing. Returns POSSIBILITIES, never causes —
// "low CTR" has at least four plausible explanations and this file has no way
// to tell them apart. Anything that reads like a diagnosis is a bug.
export const DIAGNOSTIC = {
  NO_EXPOSURE: 'NO_EXPOSURE',
  LOW_CLICK: 'LOW_CLICK',
  LOW_CONVERSION: 'LOW_CONVERSION',
  PERFORMING: 'PERFORMING',
  INSUFFICIENT: 'INSUFFICIENT',
};

export const DIAGNOSTIC_COPY = {
  NO_EXPOSURE: {
    label: 'Little or no exposure',
    possibilities: ['SEO / keyword targeting', 'search demand', 'indexing time', 'competition', 'timing'],
  },
  LOW_CLICK: {
    label: 'Being shown, rarely clicked',
    possibilities: ['hero image / mockup', 'design', 'price', 'visual differentiation in results'],
  },
  LOW_CONVERSION: {
    label: 'Clicked, not converting',
    possibilities: ['offer / product', 'price', 'trust signals', 'listing detail', 'expectation mismatch'],
  },
  PERFORMING: { label: 'Moving through the funnel', possibilities: [] },
  INSUFFICIENT: { label: 'Not enough data yet', possibilities: [] },
};

// minImpressions guards the most common false read: a listing with 3
// impressions and no clicks is not a click-rate problem, it is an absence of
// evidence. Maturity gates it too — a listing too young to judge always
// returns INSUFFICIENT regardless of how its numbers look.
export function diagnose(snapshot, { product = null, todayStr = today(), minImpressions = 100, minVisits = 25 } = {}) {
  const f = computeFunnel(snapshot);
  if (!f) return { state: DIAGNOSTIC.INSUFFICIENT, reason: 'No performance snapshot recorded.' };

  if (product && computeDoNotTouch(product, todayStr).doNotTouch) {
    return {
      state: DIAGNOSTIC.INSUFFICIENT,
      reason: 'Listing has not reached its first review checkpoint. Too early to diagnose.',
    };
  }
  if (f.impressions == null) {
    return { state: DIAGNOSTIC.INSUFFICIENT, reason: 'No impression data captured for this period.' };
  }
  if (f.impressions < minImpressions) {
    return {
      state: DIAGNOSTIC.INSUFFICIENT,
      reason: `Only ${f.impressions} impressions in this period — below the ${minImpressions} needed to read click behaviour.`,
    };
  }
  if (f.visits == null || f.visits === 0) {
    return {
      state: DIAGNOSTIC.LOW_CLICK,
      reason: `Shown ${f.impressions} times with no clicks recorded.`,
    };
  }
  if (f.visits < minVisits) {
    return {
      state: DIAGNOSTIC.INSUFFICIENT,
      reason: `${f.visits} visits is below the ${minVisits} needed to read conversion behaviour.`,
    };
  }
  if (!f.orders) {
    return { state: DIAGNOSTIC.LOW_CONVERSION, reason: `${f.visits} visits produced no orders in this period.` };
  }
  return { state: DIAGNOSTIC.PERFORMING, reason: `${f.impressions} impressions, ${f.visits} visits, ${f.orders} orders.` };
}

// ── Etsy Ads CSV ───────────────────────────────────────────────────────────
// Parses Etsy's real export, whose header is exactly:
//   Date (ET),Views,Clicks,Orders,Revenue (USD),Spend (USD),ROAS,Click rate,Ending budget (USD)
// A single-day range exports hourly instead, adding an "Hour (ET)" column;
// those rows are summed to one daily row rather than being rejected, since a
// day is the grain the table stores.
//
// "Views" here means ad IMPRESSIONS and is renamed on the way in — see the
// units rule at the top of this file.
const ADS_HEADER_MAP = {
  'date (et)': 'date',
  'hour (et)': 'hour',
  'views': 'impressions',
  'clicks': 'clicks',
  'orders': 'orders',
  'revenue (usd)': 'revenue',
  'spend (usd)': 'spend',
  'roas': 'roas',
  'click rate': 'click_rate',
  'ending budget (usd)': 'ending_budget',
};

export function parseCSVLine(line) {
  const out = [];
  let cur = '', inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map(s => s.trim());
}

// "Aug 17, 2026" -> "2026-08-17". Returns null rather than guessing on
// anything unrecognised, so a format change surfaces as unparsed rows the
// preview can show rather than as silently wrong dates.
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
export function parseEtsyDate(raw) {
  if (!raw) return null;
  const m = String(raw).trim().replace(/"/g, '').match(/^([A-Za-z]{3})[a-z]*\s+(\d{1,2}),\s*(\d{4})$/);
  if (!m) return /^\d{4}-\d{2}-\d{2}$/.test(String(raw).trim()) ? String(raw).trim() : null;
  const mi = MONTHS.indexOf(m[1].toLowerCase());
  if (mi < 0) return null;
  return `${m[3]}-${String(mi + 1).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}`;
}

export function parseEtsyAdsCSV(text) {
  const rows = [], problems = [];
  const lines = String(text || '').replace(/^﻿/, '').trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return { rows, problems: ['File has no data rows.'], hourly: false };

  const headers = parseCSVLine(lines[0]).map(h => h.replace(/^﻿/, '').toLowerCase().replace(/"/g, '').trim());
  const mapped = headers.map(h => ADS_HEADER_MAP[h] || null);
  if (!mapped.includes('date')) {
    return { rows, problems: [`Unrecognised file — expected an Etsy Ads export with a "Date (ET)" column, got: ${headers.join(', ')}`], hourly: false };
  }
  const hourly = mapped.includes('hour');

  const byDate = new Map();
  for (let i = 1; i < lines.length; i++) {
    const vals = parseCSVLine(lines[i]);
    const row = {};
    mapped.forEach((key, idx) => { if (key) row[key] = vals[idx]; });

    const date = parseEtsyDate(row.date);
    if (!date) { problems.push(`Row ${i + 1}: could not read the date "${row.date}"`); continue; }

    const n = v => {
      if (v === undefined || v === null || v === '') return null;
      const parsed = Number(String(v).replace(/[$,%]/g, '').trim());
      return Number.isFinite(parsed) ? parsed : null;
    };
    const add = (a, b) => (a == null && b == null ? null : (a || 0) + (b || 0));

    const prev = byDate.get(date);
    const next = {
      date,
      impressions: add(prev?.impressions, n(row.impressions)),
      clicks: add(prev?.clicks, n(row.clicks)),
      orders: add(prev?.orders, n(row.orders)),
      revenue: add(prev?.revenue, n(row.revenue)),
      spend: add(prev?.spend, n(row.spend)),
      // Rates and budget are point-in-time values, not additive across hours —
      // summing 24 hourly click-rates would be meaningless. Recomputed below.
      ending_budget: n(row.ending_budget) ?? prev?.ending_budget ?? null,
    };
    byDate.set(date, next);
  }

  for (const row of byDate.values()) {
    row.click_rate = row.impressions ? Number(((row.clicks || 0) / row.impressions * 100).toFixed(2)) : null;
    row.roas = row.spend ? Number(((row.revenue || 0) / row.spend).toFixed(2)) : null;
    rows.push(row);
  }
  rows.sort((a, b) => a.date.localeCompare(b.date));
  return { rows, problems, hourly };
}

// ── Listing linkage ────────────────────────────────────────────────────────
// products.etsy_listing_id is populated on 0 of 24 rows, so nothing captured
// from Etsy can be matched to a TCC product yet. Title matching is used HERE
// and only here — once, to propose links for a human to confirm — and never
// again afterwards, because two of Kristen's listings share a byte-identical
// title with materially different performance.
//
// Returns proposals, never links. Nothing is written without approval.
export function proposeListingLinks(capturedListings = [], products = []) {
  const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const linked = new Set(products.map(p => p.etsy_listing_id).filter(Boolean));

  const titleCounts = new Map();
  for (const l of capturedListings) {
    const k = norm(l.title);
    titleCounts.set(k, (titleCounts.get(k) || 0) + 1);
  }

  return capturedListings.map(listing => {
    if (linked.has(listing.etsyListingId)) {
      return { listing, match: null, confidence: 'already_linked', ambiguous: false, candidates: [] };
    }
    const lt = norm(listing.title);
    const exact = products.filter(p => norm(p.live_title) === lt && !p.etsy_listing_id);

    // A title shared by more than one Etsy listing can never be resolved by
    // title. Flagged rather than guessed — this is the specific case that
    // would otherwise corrupt data silently.
    const duplicateTitleOnEtsy = (titleCounts.get(lt) || 0) > 1;

    if (exact.length === 1 && !duplicateTitleOnEtsy) {
      return { listing, match: exact[0], confidence: 'exact_title', ambiguous: false, candidates: exact };
    }
    if (exact.length > 1 || duplicateTitleOnEtsy) {
      return { listing, match: null, confidence: 'ambiguous', ambiguous: true, candidates: exact };
    }

    const words = new Set(lt.split(' ').filter(w => w.length > 3));
    const scored = products
      .filter(p => !p.etsy_listing_id)
      .map(p => {
        const pw = new Set(norm(p.name).split(' ').filter(w => w.length > 3));
        const overlap = [...words].filter(w => pw.has(w)).length;
        return { product: p, overlap, ratio: words.size ? overlap / words.size : 0 };
      })
      .filter(s => s.overlap >= 2)
      .sort((a, b) => b.ratio - a.ratio);

    if (scored.length && scored[0].ratio >= 0.5 && (!scored[1] || scored[0].ratio - scored[1].ratio > 0.15)) {
      return { listing, match: scored[0].product, confidence: 'likely', ambiguous: false, candidates: scored.slice(0, 3).map(s => s.product) };
    }
    return { listing, match: null, confidence: 'no_match', ambiguous: false, candidates: scored.slice(0, 3).map(s => s.product) };
  });
}
