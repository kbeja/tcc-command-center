// ─── Timing Intelligence — Phase 22 ────────────────────────────────────────
// Pure, deterministic, no AI/DB calls, no browser globals — same shape and
// house style as listingReviews.js / listingSEO.js / portfolioAnalysis.js.
// Deliberately does NOT import claude.js: Phase 22 answers "when" from dates
// and stored evidence only. TCC does not yet have enough historical timing or
// performance evidence to justify an interpretation layer on top, so the seam
// is left empty rather than filled with something unsupported.
//
// WHAT THIS FILE IS ALLOWED TO CONCLUDE
// Only "what stage of work should this be in right now, given the dates".
// It never emits pursue / don't-pursue, never scores an opportunity, and
// never combines timing with trend/marketplace/SEO/performance signal — that
// convergence belongs to a later Opportunity Intelligence phase. Timing
// answers "when?", not "should we?".
//
// SOURCE GUIDANCE IS NEVER RESTATED AS FACT
// A computed state always travels with the source it came from. Where several
// sources disagree, every one of them is returned unreconciled in
// `otherSources` — nothing here averages, ranks or silently prefers one.
//
// UNKNOWN IS A REAL ANSWER
// Missing dates produce UNKNOWN and a populated `unknowns` list, never a
// substituted guess. The real calendar has niches with no target date at all
// and one niche (Gender Reveal) whose DUE has no day, so this path is
// exercised by genuine data, not just defensively.
//
// All date math is UTC (isoFrom/shiftISO below, and daysBetween/today from
// data/seasons.js, which are themselves UTC-referenced). Milestone C4 lost an
// afternoon to a test helper that mixed local setDate() with UTC
// toISOString() and drifted a day once real wall-clock time crossed local
// midnight — nothing in this file uses a local-timezone date method.

import { daysBetween, today } from '../data/seasons.js';

// ── TCC operational states ─────────────────────────────────────────────────
// Research / design / build / list stay genuinely distinct — collapsing them
// into one generic "prep now" was explicitly ruled out. IN_DEVELOPMENT is not
// that collapse: it fires only where the evidence itself cannot separate
// design from build (see TIER 2 below), and every other state remains
// reachable the moment a lead-time profile makes the distinction real.
export const TIMING_STATES = {
  TOO_EARLY_WATCH:  'TOO_EARLY_WATCH',
  RESEARCH_NOW:     'RESEARCH_NOW',
  DESIGN_NOW:       'DESIGN_NOW',
  BUILD_NOW:        'BUILD_NOW',
  IN_DEVELOPMENT:   'IN_DEVELOPMENT',
  LIST_NOW:         'LIST_NOW',
  MAINTAIN:         'MAINTAIN',
  LATE_WINDOW:      'LATE_WINDOW',
  MISSED_NEXT_YEAR: 'MISSED_NEXT_YEAR',
  EVERGREEN_WATCH:  'EVERGREEN_WATCH',
  UNKNOWN:          'UNKNOWN',
};

export const TIMING_STATE_LABEL = {
  TOO_EARLY_WATCH:  'Too Early / Watch',
  RESEARCH_NOW:     'Research Now',
  DESIGN_NOW:       'Design Now',
  BUILD_NOW:        'Build Now',
  IN_DEVELOPMENT:   'In Development',
  LIST_NOW:         'List Now',
  MAINTAIN:         'Maintain',
  LATE_WINDOW:      'Late Window',
  MISSED_NEXT_YEAR: 'Missed / Next Year',
  EVERGREEN_WATCH:  'Evergreen Watch',
  UNKNOWN:          'Unknown',
};

// Reuses this app's existing green/blue/amber/red/neutral palette (same hex
// values as keywords.jsx's scoreColor and the Trends.jsx status pills) rather
// than introducing a fifth colour vocabulary. UNKNOWN is deliberately neutral,
// never red — insufficient evidence is not a bad result.
export const TIMING_STATE_STYLE = {
  TOO_EARLY_WATCH:  { color: '#2d4270', bg: 'rgba(107,130,168,0.15)' },
  RESEARCH_NOW:     { color: '#2d4270', bg: 'rgba(107,130,168,0.2)'  },
  DESIGN_NOW:       { color: '#2d6b3c', bg: 'rgba(124,175,138,0.15)' },
  BUILD_NOW:        { color: '#2d6b3c', bg: 'rgba(124,175,138,0.2)'  },
  IN_DEVELOPMENT:   { color: '#2d6b3c', bg: 'rgba(124,175,138,0.12)' },
  LIST_NOW:         { color: '#7a4a1e', bg: 'rgba(232,168,124,0.25)' },
  MAINTAIN:         { color: '#2d6b3c', bg: 'rgba(124,175,138,0.12)' },
  LATE_WINDOW:      { color: '#7a4a1e', bg: 'rgba(232,168,124,0.2)'  },
  MISSED_NEXT_YEAR: { color: '#7a2b2b', bg: 'rgba(201,123,123,0.15)' },
  EVERGREEN_WATCH:  { color: '#2d4270', bg: 'rgba(107,130,168,0.12)' },
  UNKNOWN:          { color: 'var(--charcoal-soft)', bg: 'rgba(43,41,38,0.08)' },
};

// ── Source vocabulary ──────────────────────────────────────────────────────
// The Taylor calendar's own three words. Kept as data rather than hardcoded
// in comparisons so a future source's vocabulary can be mapped here without
// touching the state machine.
export const SOURCE_PHASES = { START: 'START', CONTINUE: 'CONTINUE', DUE: 'DUE' };

export const CLASSIFICATION_LABEL = {
  low_competition:  'Low competition',
  high_competition: 'High competition',
  evergreen:        'Evergreen',
  fast_mover:       'Fast mover',
  emotion_based:    'Emotion-based',
};

export const GUIDANCE_TYPES = ['timing', 'niche', 'audience', 'seo', 'cross_niche'];
export const GUIDANCE_TYPE_LABEL = {
  timing:      'Timing Guidance',
  niche:       'Niche Guidance',
  audience:    'Audience Guidance',
  seo:         'SEO Guidance',
  cross_niche: 'Cross-Niche Guidance',
};

// ── Lead time ──────────────────────────────────────────────────────────────
// Ordered back-to-front from the target live date. indexing is NOT in this
// list on purpose: a source's DUE date already sits weeks ahead of the actual
// event *because* listings need time to index, so subtracting indexing days
// again would double-count the same runway. It is stored and displayed, just
// never spent twice.
export const LEAD_TIME_COMPONENTS = ['research_days', 'concept_days', 'design_days', 'mockup_days', 'listing_days'];

export const LEAD_TIME_LABEL = {
  research_days: 'Research',
  concept_days:  'Concept development',
  design_days:   'Design production',
  mockup_days:   'Mockups',
  listing_days:  'Listing creation',
  indexing_days: 'Indexing / ranking runway',
};

// A null component contributes no days AND is reported in `unknown`, so a
// partially-configured profile yields a Latest Safe Start that is explicitly
// labelled as partial rather than quietly presented as complete. Unknown is
// not silently rounded to zero — it is carried through to the explanation.
export function summarizeLeadTime(profile) {
  const used = {}, unknown = [];
  let total = 0;
  for (const key of LEAD_TIME_COMPONENTS) {
    const v = profile?.[key];
    if (v === null || v === undefined || v === '') { unknown.push(key); continue; }
    const n = Number(v);
    if (!Number.isFinite(n)) { unknown.push(key); continue; }
    used[key] = n;
    total += n;
  }
  const indexing = profile?.indexing_days;
  return {
    total,
    used,
    unknown,
    // Displayed alongside, never subtracted — see LEAD_TIME_COMPONENTS above.
    indexingDays: indexing === null || indexing === undefined || indexing === '' ? null : Number(indexing),
    usable: Object.keys(used).length > 0,
  };
}

// ── Date helpers (UTC only) ────────────────────────────────────────────────
function isoFrom(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function shiftISO(iso, deltaDays) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

function yearOf(iso)  { return parseInt(iso.slice(0, 4), 10); }
function monthOf(iso) { return parseInt(iso.slice(5, 7), 10); }

// ── Guidance shaping ───────────────────────────────────────────────────────
function rowsForSource(guidance, sourceId) {
  return guidance.filter(g => g.source_id === sourceId);
}

// Default primary source: the first expert_guidance source present, falling
// back to whatever source is there. Deliberately explicit rather than "the
// newest wins" — a newer marketplace observation should not silently take
// over the computed state from the expert calendar the user actually seeded.
function pickPrimarySourceId(guidance, requested) {
  if (requested && guidance.some(g => g.source_id === requested)) return requested;
  const expert = guidance.find(g => g.timing_sources?.source_type === 'expert_guidance');
  return (expert || guidance[0])?.source_id || null;
}

function phaseRows(rows, phase) {
  return rows.filter(g => (g.guidance_state || '').toUpperCase() === phase);
}

// ── Cycle resolution ───────────────────────────────────────────────────────
// Which annual cycle are we currently inside? Resolved from the DUE month/day
// plus how much runway precedes it, so a cycle that legitimately spans the
// year boundary works without special-casing: the calendar's Bachelorette
// entry STARTs in December and is DUE the following September, and is simply
// a cycle whose runway began in the previous calendar year.
export function resolveCycle(rows, runwayDays, todayStr) {
  const due = phaseRows(rows, SOURCE_PHASES.DUE).find(g => g.month);
  const start = phaseRows(rows, SOURCE_PHASES.START).find(g => g.month);
  const continues = phaseRows(rows, SOURCE_PHASES.CONTINUE).map(g => g.month).filter(Boolean);

  if (!due) {
    return {
      dueMonth: null, dueDay: null, targetLiveDate: null, datePrecision: null,
      startMonth: start?.month ?? null, continueMonths: continues, cycleYear: null,
      daysPastTarget: null, nextCycleTarget: null,
    };
  }

  const dueDay = due.day ?? null;

  // Month-precision DUE (real case: the calendar lists Gender Reveal in a DUE
  // column but prints no date for it in that month's grid). No exact target
  // is derivable and none is invented.
  if (!dueDay) {
    return {
      dueMonth: due.month, dueDay: null, targetLiveDate: null, datePrecision: 'month',
      startMonth: start?.month ?? null, continueMonths: continues, cycleYear: null,
      daysPastTarget: null, nextCycleTarget: null,
    };
  }

  // Which annual occurrence do we anchor to? Normally the next one at or
  // after today. The exception is the dead zone between a target that has
  // just passed and the moment the next cycle's runway opens: early in that
  // zone the useful reading is "you just missed it" (LATE_WINDOW), later in
  // it the useful reading is "the next cycle hasn't started yet"
  // (TOO_EARLY_WATCH).
  //
  // The trailing span is min(runway, length of the dead zone) — both real,
  // derived numbers, no invented constant:
  //   * bounded by the dead zone so it can never overlap the next runway;
  //   * bounded by the runway so a niche with a very long runway does not get
  //     a very long tail. That second bound is load-bearing: the calendar's
  //     Bachelorette entry runs START December to DUE September, a 278-day
  //     runway, and without this it would report LATE_WINDOW for nine months.
  //
  // This decides only which cycle to ANCHOR TO. It is never a claim about how
  // long demand lasts — the real window close date stays unknown and stays on
  // the unknowns list until evidence supplies one, and the moment a close date
  // does exist it takes over entirely (see MISSED_NEXT_YEAR below).
  //
  // Anchoring on occurrences rather than on "is today past THIS calendar
  // year's date" also avoids a year-boundary artifact: that formulation made
  // the tail end abruptly on December 31, so a March target produced ten
  // straight months of LATE_WINDOW while a November one produced seven weeks.
  const runway = Math.max(0, runwayDays || 0);
  const nowYear = yearOf(todayStr);
  const occurrences = [nowYear - 1, nowYear, nowYear + 1].map(y => isoFrom(y, due.month, dueDay));
  const upcoming = occurrences.find(o => o >= todayStr) || null;
  const justPassed = occurrences.filter(o => o < todayStr).pop() || null;

  let targetLiveDate = upcoming;
  let daysPastTarget = null;
  if (justPassed && upcoming && runway > 0) {
    const runwayOpen = shiftISO(upcoming, -runway);
    if (todayStr < runwayOpen) {
      const deadZone = Math.max(0, daysBetween(justPassed, runwayOpen));
      const trailing = Math.min(runway, deadZone);
      const past = daysBetween(justPassed, todayStr);
      if (past <= trailing) { targetLiveDate = justPassed; daysPastTarget = past; }
    }
  }

  return {
    dueMonth: due.month, dueDay, targetLiveDate, datePrecision: 'day',
    startMonth: start?.month ?? null, continueMonths: continues,
    cycleYear: targetLiveDate ? yearOf(targetLiveDate) : null,
    daysPastTarget,
    // Always available so a past-target reading can still point at what's next.
    nextCycleTarget: upcoming && upcoming !== targetLiveDate ? upcoming
      : isoFrom(yearOf(targetLiveDate || todayStr) + 1, due.month, dueDay),
  };
}

// The source's own implied runway, in days: from the 1st of its START month
// to its DUE date. Used to resolve which cycle we are in when no TCC lead
// time exists, and offered in the UI as a source-attributed assumption — it
// is derived from real printed dates, not invented.
export function sourceImpliedRunway(rows) {
  const due = phaseRows(rows, SOURCE_PHASES.DUE).find(g => g.month && g.day);
  const start = phaseRows(rows, SOURCE_PHASES.START).find(g => g.month);
  if (!due || !start) return null;
  const refYear = 2001; // arbitrary non-leap reference; only the span matters
  const dueISO = isoFrom(refYear, due.month, due.day);
  const startISO = isoFrom(start.month <= due.month ? refYear : refYear - 1, start.month, 1);
  return daysBetween(startISO, dueISO);
}

// ── The state machine ──────────────────────────────────────────────────────
export function computeTimingState({
  guidance = [],
  leadTime = null,
  hasLiveCoverage = false,
  closeDate = null,          // 'YYYY-MM-DD'; no source supplies one today
  primarySourceId = null,
  todayStr = today(),
} = {}) {
  const unknowns = [];

  if (!guidance.length) {
    return blank('No timing evidence recorded for this niche yet.', ['timing source']);
  }

  const sourceId = pickPrimarySourceId(guidance, primarySourceId);
  const rows = rowsForSource(guidance, sourceId);
  const primarySource = rows[0]?.timing_sources || null;

  const otherSources = guidance
    .filter(g => g.source_id !== sourceId)
    .map(g => ({
      source: g.timing_sources || null,
      guidanceState: g.guidance_state,
      month: g.month, day: g.day,
      evidenceType: g.evidence_type || null,
      guidanceText: g.guidance_text || null,
    }));

  // Every classification this source printed for this niche, as printed. The
  // calendar genuinely disagrees with itself across months, so this is a list
  // rather than a single value and no winner is chosen.
  const classifications = rows
    .filter(g => g.classification)
    .map(g => ({
      value: g.classification, symbol: g.classification_symbol || null,
      label: CLASSIFICATION_LABEL[g.classification] || g.classification,
      month: g.month, guidanceState: g.guidance_state,
    }));
  const isEvergreen = classifications.some(c => c.value === 'evergreen');

  const lead = summarizeLeadTime(leadTime);
  const impliedRunway = sourceImpliedRunway(rows);
  const runwayForCycle = lead.usable ? lead.total : (impliedRunway || 0);
  const cycle = resolveCycle(rows, runwayForCycle, todayStr);

  const expertGuidance = rows.map(g => ({
    source: g.timing_sources || null,
    guidanceState: g.guidance_state, month: g.month, day: g.day,
    datePrecision: g.date_precision || null,
    evidenceType: g.evidence_type || null,
    guidanceText: g.guidance_text || null,
  }));

  const base = {
    primarySource, expertGuidance, otherSources, classifications, isEvergreen,
    dueMonth: cycle.dueMonth, dueDay: cycle.dueDay, startMonth: cycle.startMonth,
    continueMonths: cycle.continueMonths,
    targetLiveDate: cycle.targetLiveDate,
    datePrecision: cycle.datePrecision,
    daysPastTarget: cycle.daysPastTarget,
    nextCycleTarget: cycle.nextCycleTarget,
    sourceImpliedRunwayDays: impliedRunway,
    leadTimeTotal: lead.usable ? lead.total : null,
    leadTimeProfileName: lead.usable ? (leadTime?.name || null) : null,
    componentsUsed: lead.used,
    componentsUnknown: lead.unknown,
    indexingDays: lead.indexingDays,
  };

  // No peak, tail or close date exists in any source yet, so these stay
  // permanently on the unknowns list until real evidence supplies them —
  // surfaced rather than papered over with an assumed tail length.
  unknowns.push('demand peak date', 'window close date');
  if (!closeDate) unknowns.push('viable tail length');

  // ── TIER 3: nothing to anchor to ────────────────────────────────────────
  if (!cycle.targetLiveDate) {
    if (cycle.datePrecision === 'month') unknowns.unshift('exact target live date (source gives the month only)');
    else unknowns.unshift('target live date');

    // A START month with no target is still real evidence — the calendar has
    // six niches shaped exactly like this. Say what can honestly be said.
    if (cycle.startMonth && monthOf(todayStr) === cycle.startMonth) {
      return {
        ...base, state: TIMING_STATES.RESEARCH_NOW, tier: 'source_phase',
        latestSafeStart: null, daysRemaining: null, phaseBoundaries: null, unknowns,
        reason: `${srcName(primarySource)} lists this niche as START in ${monthName(cycle.startMonth)}, which is the current month. No target live date is given, so no runway can be calculated.`,
      };
    }
    return {
      ...base,
      state: isEvergreen ? TIMING_STATES.EVERGREEN_WATCH : TIMING_STATES.UNKNOWN,
      tier: 'none', latestSafeStart: null, daysRemaining: null, phaseBoundaries: null, unknowns,
      reason: cycle.startMonth
        ? `${srcName(primarySource)} gives a START month (${monthName(cycle.startMonth)}) but no target live date, so no timing state can be calculated for today.`
        : `${srcName(primarySource)} records guidance for this niche but no target live date.`,
    };
  }

  const target = cycle.targetLiveDate;
  const daysUntilTarget = daysBetween(todayStr, target);

  // ── Past the target ─────────────────────────────────────────────────────
  if (todayStr > target) {
    if (closeDate && todayStr > closeDate) {
      return { ...base, state: TIMING_STATES.MISSED_NEXT_YEAR, tier: tierOf(lead), latestSafeStart: null,
        daysRemaining: null, daysUntilTarget, phaseBoundaries: null, unknowns,
        reason: `Today is past the recorded window close date (${closeDate}). Preserve what was learned for next year's cycle.` };
    }
    // MAINTAIN vs LATE_WINDOW is a factual check — does a linked product
    // actually have a live date on or before today — never a judgment about
    // whether the opportunity is worth pursuing.
    const past = cycle.daysPastTarget ?? daysBetween(target, todayStr);
    const nextUp = cycle.nextCycleTarget ? ` Next cycle's target: ${cycle.nextCycleTarget}.` : '';
    return hasLiveCoverage
      ? { ...base, state: TIMING_STATES.MAINTAIN, tier: tierOf(lead), latestSafeStart: null,
          daysRemaining: null, daysUntilTarget, phaseBoundaries: null, unknowns,
          reason: `${past} days past the ${srcName(primarySource)} target live date (${target}), and at least one linked listing is already live. No window close date is recorded, so how much of the window remains is unknown.${nextUp}` }
      : { ...base, state: TIMING_STATES.LATE_WINDOW, tier: tierOf(lead), latestSafeStart: null,
          daysRemaining: null, daysUntilTarget, phaseBoundaries: null, unknowns,
          reason: `${past} days past the ${srcName(primarySource)} target live date (${target}), and no linked listing is live yet. No window close date is recorded, so whether entry is still viable cannot be determined from the evidence.${nextUp}` };
  }

  // ── TIER 1: a usable lead-time profile → precise phase boundaries ───────
  if (lead.usable) {
    const listingStart  = shiftISO(target,        -(lead.used.listing_days  || 0));
    const buildStart    = shiftISO(listingStart,  -(lead.used.mockup_days   || 0));
    const designStart   = shiftISO(buildStart,    -(lead.used.design_days   || 0));
    const conceptStart  = shiftISO(designStart,   -(lead.used.concept_days  || 0));
    const researchStart = shiftISO(conceptStart,  -(lead.used.research_days || 0));

    const boundaries = { researchStart, conceptStart, designStart, buildStart, listingStart };
    const partial = lead.unknown.length
      ? ` ${lead.unknown.length} lead-time component${lead.unknown.length === 1 ? '' : 's'} (${lead.unknown.map(k => LEAD_TIME_LABEL[k]).join(', ')}) ${lead.unknown.length === 1 ? 'is' : 'are'} unset, so this runway is partial.`
      : '';
    const shared = {
      ...base, tier: 'lead_time', latestSafeStart: researchStart,
      daysRemaining: daysBetween(todayStr, researchStart),
      daysUntilTarget, phaseBoundaries: boundaries, unknowns,
    };

    if (todayStr < researchStart) {
      const state = isEvergreen ? TIMING_STATES.EVERGREEN_WATCH : TIMING_STATES.TOO_EARLY_WATCH;
      return { ...shared, state,
        reason: `Latest safe start is ${researchStart} (target ${target} minus ${lead.total} days of ${leadTime?.name || 'configured'} lead time). Today is ${daysBetween(todayStr, researchStart)} days before that.${isEvergreen ? ` ${srcName(primarySource)} also classifies this niche as evergreen, so it stays worth watching year-round.` : ''}${partial}` };
    }
    if (todayStr < conceptStart)  return { ...shared, state: TIMING_STATES.RESEARCH_NOW, daysRemaining: daysBetween(todayStr, conceptStart),
      reason: `Today falls inside the research runway (${researchStart} to ${conceptStart}) before the target listing date of ${target}.${partial}` };
    if (todayStr < buildStart)    return { ...shared, state: TIMING_STATES.DESIGN_NOW, daysRemaining: daysBetween(todayStr, buildStart),
      reason: `Today falls inside the concept/design runway (${conceptStart} to ${buildStart}) before the target listing date of ${target}.${partial}` };
    if (todayStr < listingStart)  return { ...shared, state: TIMING_STATES.BUILD_NOW, daysRemaining: daysBetween(todayStr, listingStart),
      reason: `Today falls inside the mockup/build runway (${buildStart} to ${listingStart}) before the target listing date of ${target}.${partial}` };
    return { ...shared, state: TIMING_STATES.LIST_NOW, daysRemaining: daysUntilTarget,
      reason: `Today falls inside the final listing window (${listingStart} to ${target}). Listings should be going live now.${partial}` };
  }

  // ── TIER 2: no lead-time profile → the source's own month-level phases ──
  // The one place design and build genuinely cannot be separated: the
  // calendar prints a single "CONTINUE" covering both. Splitting it would be
  // fabrication, so IN_DEVELOPMENT says exactly that instead of guessing.
  unknowns.unshift('TCC production lead time (no profile set — stage precision unavailable)');
  const m = monthOf(todayStr);
  const shared2 = {
    ...base, tier: 'source_phase', latestSafeStart: null,
    daysRemaining: null, daysUntilTarget, phaseBoundaries: null, unknowns,
  };
  const noteNoLead = ` No TCC lead-time profile is set, so the precise research/design/build split is unavailable and this comes from ${srcName(primarySource)}'s own months.`;

  if (cycle.startMonth && m === cycle.startMonth) {
    return { ...shared2, state: TIMING_STATES.RESEARCH_NOW,
      reason: `${srcName(primarySource)} lists this niche as START in ${monthName(cycle.startMonth)}, which is the current month.${noteNoLead}` };
  }
  if (m === cycle.dueMonth) {
    return { ...shared2, state: TIMING_STATES.LIST_NOW,
      reason: `${srcName(primarySource)} gives a target live date of ${target}, which is this month.${noteNoLead}` };
  }
  if (cycle.startMonth && inRunwayMonths(m, cycle.startMonth, cycle.dueMonth)) {
    const explicit = cycle.continueMonths.includes(m);
    return { ...shared2, state: TIMING_STATES.IN_DEVELOPMENT,
      reason: explicit
        ? `${srcName(primarySource)} lists this niche as CONTINUE in ${monthName(m)}. That single phase covers both design and build, so the two cannot be separated from this source alone.${noteNoLead}`
        : `${monthName(m)} falls between ${srcName(primarySource)}'s START (${monthName(cycle.startMonth)}) and target live date (${target}), though the source prints no CONTINUE entry for this month specifically.${noteNoLead}` };
  }
  const state = isEvergreen ? TIMING_STATES.EVERGREEN_WATCH : TIMING_STATES.TOO_EARLY_WATCH;
  return { ...shared2, state,
    reason: cycle.startMonth
      ? `Today is outside ${srcName(primarySource)}'s runway for this niche (START ${monthName(cycle.startMonth)} through target ${target}).${isEvergreen ? ` It is classified evergreen, so it stays worth watching year-round.` : ''}${noteNoLead}`
      : `${srcName(primarySource)} gives a target live date of ${target} but no START month, so when work should begin is unknown.${noteNoLead}` };
}

// Is month m inside the runway from startMonth to dueMonth, handling a cycle
// that wraps the year boundary (START December, DUE September)?
function inRunwayMonths(m, startMonth, dueMonth) {
  if (startMonth <= dueMonth) return m > startMonth && m < dueMonth;
  return m > startMonth || m < dueMonth;
}

function tierOf(lead) { return lead.usable ? 'lead_time' : 'source_phase'; }

function srcName(source) {
  if (!source?.name) return 'The recorded source';
  return source.version ? `${source.name} v${source.version}` : source.name;
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
                     'July', 'August', 'September', 'October', 'November', 'December'];
export function monthName(m) { return MONTH_NAMES[m - 1] || String(m); }

function blank(reason, unknowns) {
  return {
    state: TIMING_STATES.UNKNOWN, tier: 'none', reason, unknowns,
    primarySource: null, expertGuidance: [], otherSources: [], classifications: [],
    isEvergreen: false, dueMonth: null, dueDay: null, startMonth: null, continueMonths: [],
    targetLiveDate: null, datePrecision: null, sourceImpliedRunwayDays: null,
    latestSafeStart: null, daysRemaining: null, daysUntilTarget: null,
    leadTimeTotal: null, leadTimeProfileName: null, componentsUsed: {}, componentsUnknown: [],
    indexingDays: null, phaseBoundaries: null,
  };
}

// ── Product-level timing (§21 — deliberately thin) ─────────────────────────
// Reports position within the window and nothing else. Performance
// interpretation stays with the existing checkpoint loop in
// listingReviews.js; this must not grow into a second, competing opinion
// about whether a listing is doing well.
export function computeProductTiming(product, timing = null, todayStr = today()) {
  if (!product) return { hasLaunchDate: false, daysLive: null, windowState: null };
  if (!product.went_live_at) {
    // Never inferred from created_at / updated_at / stage_updated_at — those
    // are different events. Unknown stays unknown until she enters it.
    return { hasLaunchDate: false, daysLive: null, windowState: null, needsLaunchDate: isLiveStage(product) };
  }
  const daysLive = daysBetween(product.went_live_at, todayStr);
  return {
    hasLaunchDate: true,
    daysLive,
    needsLaunchDate: false,
    wentLiveAt: product.went_live_at,
    windowState: timing?.state || null,
    windowLabel: timing ? TIMING_STATE_LABEL[timing.state] : null,
    // Descriptive only — where in the window this listing went live.
    launchedBeforeTarget: timing?.targetLiveDate ? product.went_live_at <= timing.targetLiveDate : null,
  };
}

// 'Live' and 'Reviewing' are already treated as one bucket in 8+ places in
// this app; reused rather than inventing a ninth definition.
export function isLiveStage(product) {
  return ['Live', 'Reviewing'].includes(product?.stage);
}

// ── Grouping helper for a portfolio-style timing overview ───────────────────
// Returns niches grouped by computed state, ordered by urgency. Deliberately
// returns counts and members only — no ranking, no score, no "work on this
// first" recommendation. That prioritisation is Portfolio Intelligence's job.
export const STATE_URGENCY_ORDER = [
  TIMING_STATES.LIST_NOW,
  TIMING_STATES.BUILD_NOW,
  TIMING_STATES.DESIGN_NOW,
  TIMING_STATES.IN_DEVELOPMENT,
  TIMING_STATES.RESEARCH_NOW,
  TIMING_STATES.LATE_WINDOW,
  TIMING_STATES.MAINTAIN,
  TIMING_STATES.EVERGREEN_WATCH,
  TIMING_STATES.TOO_EARLY_WATCH,
  TIMING_STATES.MISSED_NEXT_YEAR,
  TIMING_STATES.UNKNOWN,
];

export function groupNichesByState(results) {
  const byState = new Map();
  for (const r of results) {
    const list = byState.get(r.timing.state) || [];
    list.push(r);
    byState.set(r.timing.state, list);
  }
  return STATE_URGENCY_ORDER
    .filter(s => byState.has(s))
    .map(s => ({ state: s, label: TIMING_STATE_LABEL[s], style: TIMING_STATE_STYLE[s], niches: byState.get(s) }));
}
