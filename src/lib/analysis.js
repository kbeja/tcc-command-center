// ─── Analysis — deterministic findings (Phase 9 / §4, §26) ─────────────────
// Pure, deterministic, no AI/DB calls — same house style as
// keywordIntelligence.js, listingSEO.js and tccIntelligence.js.
//
// §4 lists the conclusions the Analysis layer should be able to reach: sources
// agree, sources disagree, strong demand but very high competition, strong
// competitor sales despite modest keyword volume, insufficient evidence, and
// so on. This file detects the ones that are DERIVABLE FROM STORED NUMBERS,
// and only those.
//
// WHAT THIS FILE IS NOT ALLOWED TO DO
// It returns findings, never conclusions. A finding says "these two sources
// disagree by 62%"; it does not say which is right, whether the keyword is
// good, or what to do. Those are interpretation and decision, they belong to a
// human in analysis_records, and nothing here writes anywhere.
//
// Every finding carries the numbers it was derived from. A finding you cannot
// audit is indistinguishable from an assertion, and this project's whole
// evidence model rests on being able to tell those apart.
//
// Findings are INFORMATIONAL by construction: none of them is an error, none
// blocks anything, and severity exists only to sort the list.

import { groupHistoryBySource } from './keywordIntelligence.js';

export const FINDING_SEVERITY = ['note', 'watch', 'flag'];

// Deliberately small and specific. A finding type gets added when there is a
// number that supports it, not because §4 names something plausible — an
// undetectable finding type would render as a permanently empty category and
// teach people the panel is decorative.
export const FINDING_TYPES = {
  SOURCES_DISAGREE:        'sources_disagree',
  SOURCES_AGREE:           'sources_agree',
  HIGH_DEMAND_HIGH_COMP:   'high_demand_high_competition',
  LOW_COMPETITION_OPENING: 'low_competition_opening',
  SINGLE_SOURCE_ONLY:      'single_source_only',
  INSUFFICIENT_EVIDENCE:   'insufficient_evidence',
  STALE_EVIDENCE:          'stale_evidence',
  UNCLASSIFIED_INTENT:     'unclassified_intent',
  NO_NICHE_LINK:           'no_niche_link',
};

// TCC's own thresholds, same status as assignBucket()'s cutoffs — documented
// judgment calls, tunable here, with nothing downstream depending on the exact
// numbers.
const DISAGREE_RELATIVE_GAP = 0.5;   // ≥50% relative gap between two sources' volumes
const DISAGREE_MIN_VOLUME = 50;      // below this, two small numbers differing means nothing
const AGREE_RELATIVE_GAP = 0.2;      // ≤20% apart reads as corroboration
const HIGH_COMPETITION = 100000;     // matches assignBucket()'s own "big pond" line
const HIGH_VOLUME = 1000;
const LOW_COMPETITION = 10000;       // matches assignBucket()'s rankable-fast line
const STALE_DAYS = 90;

function daysSince(dateish, todayMs) {
  if (!dateish) return null;
  const t = new Date(dateish).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((todayMs - t) / 86400000);
}

function latestVolumeBySource(readingsBySource) {
  const out = [];
  for (const [source, group] of Object.entries(readingsBySource || {})) {
    const v = group?.latest?.volume;
    if (v != null) out.push({ source, volume: Number(v) });
  }
  return out;
}

// One keyword's findings, from its own evidence ledger plus whatever context
// the caller can supply. history is keyword_history rows.
export function findKeywordFindings(keyword, history, { niches = [], todayMs = Date.now() } = {}) {
  const findings = [];
  const rows = history || [];
  const bySource = groupHistoryBySource(rows);
  const volumes = latestVolumeBySource(bySource);
  const sourceCount = Object.keys(bySource).length;

  const push = (type, severity, summary, evidence) =>
    findings.push({ type, severity, summary, evidence });

  if (!rows.length) {
    push(FINDING_TYPES.INSUFFICIENT_EVIDENCE, 'watch',
      'No readings recorded for this keyword yet.', { readings: 0 });
    return findings;
  }

  // ── Cross-source agreement ───────────────────────────────────────────────
  if (volumes.length >= 2) {
    const sorted = [...volumes].sort((a, b) => b.volume - a.volume);
    const hi = sorted[0], lo = sorted[sorted.length - 1];
    const gap = hi.volume > 0 ? (hi.volume - lo.volume) / hi.volume : 0;

    if (hi.volume >= DISAGREE_MIN_VOLUME && gap >= DISAGREE_RELATIVE_GAP) {
      push(FINDING_TYPES.SOURCES_DISAGREE, 'flag',
        `${hi.source} and ${lo.source} differ by ${Math.round(gap * 100)}% on search volume.`,
        { sources: sorted, relativeGap: Number(gap.toFixed(2)) });
    } else if (gap <= AGREE_RELATIVE_GAP) {
      push(FINDING_TYPES.SOURCES_AGREE, 'note',
        `${volumes.length} sources agree within ${Math.round(gap * 100)}% on search volume.`,
        { sources: sorted, relativeGap: Number(gap.toFixed(2)) });
    }
  } else if (sourceCount === 1) {
    // §15 of the original brief calls out extreme volume from a single source
    // as a data-anomaly risk. Stated as a fact about coverage, not a doubt
    // about the number itself.
    push(FINDING_TYPES.SINGLE_SOURCE_ONLY, 'watch',
      `Only ${Object.keys(bySource)[0]} has reported on this keyword — nothing to corroborate it.`,
      { source: Object.keys(bySource)[0], readings: rows.length });
  }

  // ── Demand vs competition ────────────────────────────────────────────────
  const vol = volumes.length ? Math.max(...volumes.map(v => v.volume)) : null;
  const comps = Object.values(bySource).map(g => g?.latest?.competition).filter(c => c != null).map(Number);
  const comp = comps.length ? Math.min(...comps) : null;

  if (vol != null && comp != null) {
    if (vol >= HIGH_VOLUME && comp >= HIGH_COMPETITION) {
      push(FINDING_TYPES.HIGH_DEMAND_HIGH_COMP, 'watch',
        `Strong demand (${vol.toLocaleString()}) against ${comp.toLocaleString()} competing listings.`,
        { volume: vol, competition: comp });
    } else if (vol >= HIGH_VOLUME && comp < LOW_COMPETITION) {
      push(FINDING_TYPES.LOW_COMPETITION_OPENING, 'note',
        `${vol.toLocaleString()} searches against only ${comp.toLocaleString()} listings.`,
        { volume: vol, competition: comp });
    }
  }

  // ── Freshness ────────────────────────────────────────────────────────────
  const newest = rows
    .map(r => new Date(r.data_date || r.recorded_at || 0).getTime())
    .filter(t => !Number.isNaN(t) && t > 0)
    .sort((a, b) => b - a)[0];
  const age = newest ? daysSince(newest, todayMs) : null;
  if (age != null && age >= STALE_DAYS) {
    push(FINDING_TYPES.STALE_EVIDENCE, 'watch',
      `Newest reading is ${age} days old.`, { ageDays: age });
  }

  // ── Classification gaps (§5, §29) ────────────────────────────────────────
  // Absence of a human classification is a real finding: §7 makes intent and
  // niche relevance filtering steps that run BEFORE opportunity scoring, so an
  // unclassified keyword cannot be filtered correctly no matter how good its
  // numbers are.
  if (!keyword?.search_intent) {
    push(FINDING_TYPES.UNCLASSIFIED_INTENT, 'note',
      'No search intent set — this keyword cannot be intent-filtered for a listing yet.', {});
  }
  if (!niches.length) {
    push(FINDING_TYPES.NO_NICHE_LINK, 'note',
      'Not linked to any niche yet.', {});
  }

  return findings;
}

// Roll a set of keyword findings up to a niche/cluster level. Counts only —
// no averaging into a score, and no "this niche is good/bad". §15 of the
// original brief forbids collapsing multi-source evidence into one opaque
// number, and a rolled-up finding count is the largest summary that stays
// honest about what it is made of.
export function summarizeFindings(findingsByKeyword) {
  const counts = {};
  let keywordsWithFlags = 0;
  let total = 0;

  for (const findings of Object.values(findingsByKeyword || {})) {
    let hasFlag = false;
    for (const f of findings || []) {
      counts[f.type] = (counts[f.type] || 0) + 1;
      total += 1;
      if (f.severity === 'flag') hasFlag = true;
    }
    if (hasFlag) keywordsWithFlags += 1;
  }

  return {
    counts,
    total,
    keywordsAnalyzed: Object.keys(findingsByKeyword || {}).length,
    keywordsWithFlags,
  };
}

// Sort for display: flags first, then watches, then notes; stable within a
// severity so the order does not shuffle between renders.
export function sortFindings(findings) {
  const rank = { flag: 0, watch: 1, note: 2 };
  return [...(findings || [])].sort(
    (a, b) => (rank[a.severity] ?? 3) - (rank[b.severity] ?? 3)
  );
}

// The five layers, named once so the UI and any future consumer cannot drift
// on what they are or what order they go in. This project's standing rule is
// that they are never collapsed into one field or one concept.
export const ANALYSIS_LAYERS = [
  { key: 'evidence_snapshot', label: 'Evidence',       hint: 'What the numbers actually said, frozen at the time of writing.' },
  { key: 'interpretation',    label: 'Interpretation', hint: 'What it might mean. May be AI-proposed.' },
  { key: 'decision',          label: 'Decision',       hint: 'What we will do about it.' },
  { key: 'hypothesis',        label: 'Hypothesis',     hint: 'What we expect to happen if that is right.' },
  { key: 'learning',          label: 'Learning',       hint: 'What actually happened. Written later.' },
];

export const ANALYSIS_SCOPES = ['niche', 'keyword', 'cluster', 'product', 'aesthetic', 'season', 'listing'];
export const ANALYSIS_STATUSES = ['draft', 'proposed', 'approved', 'superseded'];
