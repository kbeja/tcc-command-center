// ─── Keyword Intelligence — deterministic interpretation engine (Phase 19) ──
// Turns a keyword's raw per-source evidence (keyword_history rows) into
// Layer-2 interpretation: opportunity classification, trend classification,
// confidence, a source-disagreement flag, and a human-readable "why". Pure,
// deterministic, rule-based functions — same house style as assignBucket()/
// isLowQualityKeyword() in ./keywords.jsx, not an AI call. Interpreting real
// stored numbers via fixed, documented rules isn't the "AI-hallucinated
// evidence" this project's roadmap forbids; nothing here invents a number
// that wasn't actually recorded.
//
// Every threshold below is TCC's own documented judgment call, exactly like
// assignBucket()'s 200/10,000/100,000 volume/competition cutoffs already are
// — tune them here if they turn out wrong in practice, nothing downstream
// depends on the exact numbers, only on classifyKeyword() always returning
// one of CLASSIFICATIONS.

export const CLASSIFICATIONS = [
  'Strong Unicorn', 'Emerging Unicorn', 'Evergreen', 'Seasonal', 'Watchlist', 'Suspect / Low Confidence',
];
export const CONFIDENCE_LEVELS = ['High', 'Medium', 'Low'];
export const TREND_CLASSIFICATIONS = ['Emerging', 'Rising', 'Stable', 'Seasonal', 'Peaking', 'Declining', 'Unknown'];
export const RESEARCH_STATUSES = ['Researching', 'Validated', 'Watch', 'Create', 'Hold', 'Reject', 'Seasonal — Future', 'Archived'];

const DISAGREEMENT_RELATIVE_THRESHOLD = 0.5;  // >=50% relative gap in *current* demand between two sources counts as real disagreement
const DISAGREEMENT_MIN_VOLUME_FLOOR = 50;      // ignore noise between two small numbers — a 10 vs. 20 "disagreement" isn't meaningful
const TREND_MIN_POINTS = 3;                    // need >=3 readings (or points in a source's own trend_data) to call a trajectory rather than 'Unknown'

// ── Grouping raw evidence ───────────────────────────────────────────────────
// keyword_history rows -> one entry per source, each holding every reading
// for that source (oldest first) plus a `latest` convenience pointer. This
// is the shape every function below expects as `readingsBySource`.
export function groupHistoryBySource(historyRows) {
  const bySource = {};
  for (const row of [...(historyRows || [])].sort((a, b) =>
    new Date(a.recorded_at || a.data_date || 0) - new Date(b.recorded_at || b.data_date || 0)
  )) {
    const key = row.source || 'Unknown';
    if (!bySource[key]) bySource[key] = { source: key, readings: [] };
    bySource[key].readings.push(row);
    bySource[key].source = key; // keep whichever casing showed up most recently
    bySource[key].latest = row;
  }
  return bySource;
}

// Best "current" demand number for one source's group — prefers the last
// point of an explicit trend_data series when present (a low eRank
// `volume` historical-average sitting next to a trend_data series climbing
// 90->650->3900 should read as "currently ~3900", not "currently 170").
function currentDemandFor(sourceGroup) {
  const td = sourceGroup?.latest?.trend_data;
  if (Array.isArray(td) && td.length) {
    const last = td[td.length - 1];
    const val = typeof last === 'number' ? last : last?.value;
    if (val != null) return val;
  }
  return sourceGroup?.latest?.volume ?? null;
}

function currentCompetitionFor(readingsBySource) {
  // Prefer the *lowest* (best/most rankable) recent competition reading
  // across sources — if any one source shows a rankable opening, that's
  // real signal a single high number elsewhere shouldn't erase.
  const vals = Object.values(readingsBySource || {}).map(g => g.latest?.competition).filter(v => v != null);
  return vals.length ? Math.min(...vals) : null;
}

// Per-source "this single reading looks like a statistical anomaly" check —
// competition is measured completely differently by different sources
// (Everbee: raw listing count; eRank: a 0-100 keyword-difficulty score), so
// this has to know which source it's looking at rather than applying one
// universal threshold. Exists so a lone-source anomaly (extreme volume,
// near-zero competition, no second source available to disagree with it)
// can still reach Suspect / Low Confidence — the spec's own definition of
// that category is "extreme volume reported by only one source... data
// anomaly," which detectDisagreement() alone can never catch, since it
// only ever compares two sources against each other.
function isAnomalousReading(reading) {
  if (!reading || reading.volume == null || reading.competition == null) return false;
  const src = (reading.source || '').toLowerCase();
  if (src === 'everbee') {
    // Mirrors EverbeeCSVImport.jsx's own pre-Phase-19 isGarbage() heuristic
    // (score>50000 && competition<=1, where score=(volume/competition)*1000
    // — algebraically the same condition as this) — near-zero listing count
    // with real volume is either a hidden gem or a data error; worth
    // flagging for review, not worth discarding before anyone sees it.
    return reading.competition <= 1 && reading.volume >= 50;
  }
  // No anomaly rule defined yet for other sources' competition scales —
  // err toward not flagging rather than guessing at an unfamiliar one.
  return false;
}

function hasAnomalousReading(readingsBySource) {
  return Object.values(readingsBySource || {}).some(g => isAnomalousReading(g.latest));
}

// ── Disagreement ─────────────────────────────────────────────────────────
export function detectDisagreement(readingsBySource) {
  const sources = Object.values(readingsBySource || {});
  const pairs = [];
  for (let i = 0; i < sources.length; i++) {
    for (let j = i + 1; j < sources.length; j++) {
      const a = sources[i], b = sources[j];
      const aVal = currentDemandFor(a), bVal = currentDemandFor(b);
      if (aVal == null || bVal == null) continue;
      const hi = Math.max(aVal, bVal), lo = Math.min(aVal, bVal);
      if (hi < DISAGREEMENT_MIN_VOLUME_FLOOR) continue;
      const relDiff = lo === 0 ? 1 : (hi - lo) / hi;
      if (relDiff >= DISAGREEMENT_RELATIVE_THRESHOLD) {
        pairs.push({ a: a.source, b: b.source, aValue: aVal, bValue: bVal, relDiff, higherSource: aVal >= bVal ? a.source : b.source });
      }
    }
  }
  pairs.sort((x, y) => y.relDiff - x.relDiff);
  return { disagree: pairs.length > 0, pairs };
}

// ── Trend ────────────────────────────────────────────────────────────────
// Prefers an explicit trend_data series (any source that provides one with
// enough points); falls back to one source's own readings accumulated over
// multiple imports. Never infers a trend from a single current number.
function bestTrendSeries(readingsBySource) {
  for (const group of Object.values(readingsBySource || {})) {
    const td = group.latest?.trend_data;
    if (Array.isArray(td) && td.length >= TREND_MIN_POINTS) {
      const vals = td.map(p => (typeof p === 'number' ? p : p?.value)).filter(v => v != null);
      if (vals.length >= TREND_MIN_POINTS) return vals;
    }
  }
  for (const group of Object.values(readingsBySource || {})) {
    if (group.readings.length >= TREND_MIN_POINTS) {
      const vals = group.readings.map(r => r.volume).filter(v => v != null);
      if (vals.length >= TREND_MIN_POINTS) return vals;
    }
  }
  return null;
}

// Same search as bestTrendSeries(), but returns which source the qualifying
// series came from instead of the values — explainKeyword()'s Emerging
// Unicorn sentence needs to credit the source that actually HAS the
// supporting trend, which is routinely the lower-current-value source
// (an older/laggier reading catching up), not necessarily the source
// reporting the higher current number.
function trendSourceFor(readingsBySource) {
  for (const [source, group] of Object.entries(readingsBySource || {})) {
    const td = group.latest?.trend_data;
    if (Array.isArray(td) && td.length >= TREND_MIN_POINTS) {
      const vals = td.map(p => (typeof p === 'number' ? p : p?.value)).filter(v => v != null);
      if (vals.length >= TREND_MIN_POINTS) return source;
    }
  }
  for (const [source, group] of Object.entries(readingsBySource || {})) {
    if (group.readings.length >= TREND_MIN_POINTS) {
      const vals = group.readings.map(r => r.volume).filter(v => v != null);
      if (vals.length >= TREND_MIN_POINTS) return source;
    }
  }
  return null;
}

export function classifyTrend(readingsBySource, { collectionSeason } = {}) {
  const series = bestTrendSeries(readingsBySource);
  if (!series || series.length < TREND_MIN_POINTS) return 'Unknown';

  const first = series[0];
  const mid = series[Math.floor(series.length / 2)];
  const last = series[series.length - 1];
  const overallChange = first > 0 ? (last - first) / first : (last > 0 ? Infinity : 0);
  const isFlat = Math.abs(overallChange) < 0.15;

  // The one place collections.season feeds interpretation — honestly gated
  // on that field actually being set (no real niche calendar exists to
  // check dates against), and only when the numeric pattern is otherwise flat.
  if (isFlat && collectionSeason) return 'Seasonal';
  if (overallChange >= 3) return 'Emerging';      // e.g. the spec's own 90->650->3900 example is ~43x
  if (overallChange >= 0.4) return 'Rising';
  if (overallChange <= -0.4) return 'Declining';
  if (last < mid && mid > first) return 'Peaking'; // rose, now falling
  if (isFlat) return 'Stable';
  return 'Unknown';
}

// ── Confidence ───────────────────────────────────────────────────────────
export function scoreConfidence(readingsBySource, { classification, trend } = {}) {
  if (classification === 'Suspect / Low Confidence') return 'Low';

  const sourceCount = Object.keys(readingsBySource || {}).length;
  const hasTrend = trend && trend !== 'Unknown';
  const mostRecent = Object.values(readingsBySource || {})
    .map(g => g.latest?.data_date || g.latest?.recorded_at)
    .filter(Boolean)
    .sort()
    .pop();
  const daysSince = mostRecent ? Math.round((Date.now() - new Date(mostRecent).getTime()) / 86400000) : null;
  const isStale = daysSince != null && daysSince > 120;

  if (isStale) return 'Low';
  // <=1, not ===1 — a keyword with zero recorded history (every keyword that
  // predates this phase's always-append history write, confirmed live: 0
  // keyword_history rows existed anywhere before this recompute) has even
  // less evidence than a single-source one, not more; it must not fall
  // through to the 'Medium' default below.
  if (sourceCount <= 1 && !hasTrend) return 'Low';
  if (sourceCount >= 2 && hasTrend && classification !== 'Emerging Unicorn') return 'High';
  return 'Medium';
}

// ── Classification ───────────────────────────────────────────────────────
// Priority order — first match wins. Emerging Unicorn is deliberately
// checked before Suspect: the spec calls this out by name as the case that
// must NOT be penalized just because a historical number looks low on its
// own — a low eRank historical average next to a much higher, trend-backed
// current EverBee number is exactly this category.
export function classifyKeyword(readingsBySource, { collectionSeason } = {}) {
  readingsBySource = readingsBySource || {};
  const sourceCount = Object.keys(readingsBySource).length;
  const disagreement = detectDisagreement(readingsBySource);
  const anomaly = hasAnomalousReading(readingsBySource);
  const trend = classifyTrend(readingsBySource, { collectionSeason });
  const competition = currentCompetitionFor(readingsBySource);
  const bestCurrent = Math.max(0, ...Object.values(readingsBySource).map(g => currentDemandFor(g) ?? 0));

  let classification;
  if (disagreement.disagree && ['Emerging', 'Rising'].includes(trend)) {
    classification = 'Emerging Unicorn';
  } else if (disagreement.disagree || anomaly) {
    classification = 'Suspect / Low Confidence';
  } else if (bestCurrent >= 500 && (competition == null || competition < 50000) && (sourceCount >= 2 || ['Rising', 'Stable'].includes(trend))) {
    classification = 'Strong Unicorn';
  } else if (trend === 'Seasonal') {
    classification = 'Seasonal';
  } else if (trend === 'Stable' && bestCurrent >= 200) {
    classification = 'Evergreen';
  } else {
    // Safe fallback — incomplete evidence, early-stage, or doesn't cleanly
    // fit anywhere above. Never auto-Reject/Archive here; that stays a
    // human call (spec section 18) via the separate research_status field.
    classification = 'Watchlist';
  }

  const confidence = scoreConfidence(readingsBySource, { classification, trend });
  return { classification, confidence, trend, disagreement, anomaly, competition, bestCurrent };
}

// ── Explanation ──────────────────────────────────────────────────────────
// Template-based sentence assembly — not free-generation — matching the
// worked examples in the spec as closely as possible. Every sentence is
// assembled from values classifyKeyword()/detectDisagreement() actually
// computed, never invented.
const CLASSIFICATION_CLOSINGS = {
  'Strong Unicorn': 'Strong SEO opportunity worth actively testing.',
  'Emerging Unicorn': 'Worth watching closely — early evidence of a keyword on the way up.',
  'Evergreen': 'Reliable keyword with sustained demand.',
  'Seasonal': 'Good opportunity, but timing matters.',
  'Watchlist': 'Not enough evidence yet to prioritize or reject — keep an eye on it.',
  'Suspect / Low Confidence': 'Research further before using this as a strategic SEO term.',
};

export function explainKeyword({ classification, trend, disagreement, anomaly, readingsBySource }) {
  const sentences = [];

  if (disagreement?.disagree) {
    const worst = disagreement.pairs[0];
    const higherVal = Math.max(worst.aValue, worst.bValue);
    const lowerVal = Math.min(worst.aValue, worst.bValue);
    const lowerSource = worst.higherSource === worst.a ? worst.b : worst.a;
    if (classification === 'Emerging Unicorn') {
      // The trend that justifies trusting the higher number over the lower
      // one routinely belongs to the LOWER-current-value source (an older
      // reading catching up), not the higher one — credit whichever source
      // actually has the qualifying trend, not just the higher-reporting one.
      const trendSource = trendSourceFor(readingsBySource) || worst.higherSource;
      sentences.push(`${worst.higherSource} reports ${higherVal.toLocaleString()}, well above ${lowerSource}'s ${lowerVal.toLocaleString()}. Recent ${trendSource} activity supports the higher estimate — likely an emerging trend.`);
    } else {
      sentences.push(`${worst.higherSource} reports significantly higher demand (${higherVal.toLocaleString()}) than ${lowerSource} (${lowerVal.toLocaleString()}). No trend acceleration supports the difference — treat as low-confidence until more evidence comes in.`);
    }
  } else if (anomaly) {
    sentences.push('This reading looks like a data anomaly — unusually high estimated volume paired with near-zero competition, a pattern that usually means the source misread the keyword rather than a genuine gap in the market.');
  } else {
    const sourceCount = Object.keys(readingsBySource || {}).length;
    sentences.push(sourceCount >= 2 ? `${sourceCount} sources broadly agree on demand for this keyword.` : 'Only one source has data on this keyword so far.');
  }

  if (trend && trend !== 'Unknown') sentences.push(`Trend: ${trend.toLowerCase()}.`);

  const closing = CLASSIFICATION_CLOSINGS[classification];
  if (closing) sentences.push(closing);

  return sentences.join(' ');
}

// ── Convenience: run the whole pipeline in one call ─────────────────────
// What createResearchSession()/recomputeKeywordInterpretation() actually
// call — takes raw keyword_history rows for one keyword, returns exactly
// the fields keywords.classification/.confidence/.trend_classification/
// .disagreement_flag/.interpretation_summary need.
export function interpretKeyword(historyRows, { collectionSeason } = {}) {
  const readingsBySource = groupHistoryBySource(historyRows);
  const { classification, confidence, trend, disagreement, anomaly } = classifyKeyword(readingsBySource, { collectionSeason });
  const interpretation_summary = explainKeyword({ classification, trend, disagreement, anomaly, readingsBySource });
  return {
    classification,
    confidence,
    trend_classification: trend,
    disagreement_flag: disagreement.disagree,
    interpretation_summary,
  };
}
