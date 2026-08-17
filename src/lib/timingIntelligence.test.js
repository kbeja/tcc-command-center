// Phase 22 — Timing Intelligence. Same house convention as
// listingReviews.test.js / listingSEO.test.js: unit tests for the
// deterministic module, weighted toward the parts that can silently be wrong.
// computeTimingState's cycle resolution gets the heaviest coverage — the
// year-wrapping case (a niche that STARTs in December and is DUE the
// following September) is the single most likely place for a real bug, and
// several scenarios are transcribed straight from the real seeded calendar
// rather than invented, so a passing test means the shipped data works.
//
// Every date here is a fixed literal and todayStr is always passed
// explicitly — no test depends on the wall clock, so none can drift the way
// C3's own daysAgo() helper did when a long session crossed local midnight.
import { describe, it, expect } from 'vitest';
import {
  TIMING_STATES, computeTimingState, resolveCycle, sourceImpliedRunway,
  summarizeLeadTime, computeProductTiming, groupNichesByState, monthName,
  LEAD_TIME_COMPONENTS,
} from './timingIntelligence.js';

const TAYLOR = { id: 'src-taylor', name: 'Taylor POD Niche Calendar', version: '4.0', source_type: 'expert_guidance' };
const MARKET = { id: 'src-market', name: 'Etsy marketplace observation', source_type: 'marketplace_observation' };

function g(state, month, day, extra = {}) {
  return {
    source_id: TAYLOR.id, timing_sources: TAYLOR, niche_id: 'n1',
    guidance_state: state, month, day,
    date_precision: day ? 'day' : 'month',
    classification: null, classification_symbol: null,
    evidence_type: 'expert_guidance', guidance_text: null,
    ...extra,
  };
}

// The real seeded rows for Winter Sports: START September, CONTINUE October,
// DUE November 8, printed low-competition throughout.
const WINTER_SPORTS = [
  g('START', 9, null, { classification: 'low_competition', classification_symbol: '⭐' }),
  g('CONTINUE', 10, null, { classification: 'low_competition', classification_symbol: '⭐' }),
  g('DUE', 11, 8, { classification: 'low_competition', classification_symbol: '⭐' }),
];

// The real seeded rows for Bachelorette — the year-wrapping cycle.
const BACHELORETTE = [
  g('START', 12, null, { classification: 'high_competition' }),
  ...[1, 2, 3, 4, 5, 6, 7, 8].map(m => g('CONTINUE', m, null, { classification: 'high_competition' })),
  g('DUE', 9, 5, { classification: 'high_competition' }),
];

const FULL_LEAD = {
  name: 'Standard POD', research_days: 14, concept_days: 7, design_days: 14,
  mockup_days: 3, listing_days: 3, indexing_days: 21,
};

describe('summarizeLeadTime', () => {
  it('sums only the five pre-live components and excludes indexing', () => {
    const s = summarizeLeadTime(FULL_LEAD);
    expect(s.total).toBe(41);              // 14+7+14+3+3 — 21 indexing days NOT included
    expect(s.indexingDays).toBe(21);
    expect(s.unknown).toEqual([]);
    expect(s.usable).toBe(true);
  });

  it('reports null components as unknown rather than counting them as zero', () => {
    const s = summarizeLeadTime({ research_days: 10, concept_days: null, design_days: 5 });
    expect(s.total).toBe(15);
    expect(s.unknown).toContain('concept_days');
    expect(s.unknown).toContain('mockup_days');
    expect(s.unknown).toContain('listing_days');
    expect(s.usable).toBe(true);
  });

  it('is unusable when every component is unset — no fabricated runway', () => {
    expect(summarizeLeadTime(null).usable).toBe(false);
    expect(summarizeLeadTime({ name: 'empty' }).usable).toBe(false);
    expect(summarizeLeadTime({ name: 'empty' }).unknown).toEqual(LEAD_TIME_COMPONENTS);
  });

  it('treats a non-numeric value as unknown, not as zero', () => {
    const s = summarizeLeadTime({ research_days: 'soon', design_days: 4 });
    expect(s.unknown).toContain('research_days');
    expect(s.total).toBe(4);
  });
});

describe('resolveCycle', () => {
  it('targets this year when the due date is still ahead', () => {
    const c = resolveCycle(WINTER_SPORTS, 41, '2026-08-17');
    expect(c.targetLiveDate).toBe('2026-11-08');
    expect(c.startMonth).toBe(9);
    expect(c.continueMonths).toEqual([10]);
    expect(c.datePrecision).toBe('day');
  });

  it('anchors to a just-passed target while still inside the trailing runway', () => {
    const c = resolveCycle(WINTER_SPORTS, 41, '2026-11-20');
    expect(c.targetLiveDate).toBe('2026-11-08');
    expect(c.daysPastTarget).toBe(12);
    expect(c.nextCycleTarget).toBe('2027-11-08');
  });

  it('rolls forward once the trailing runway is exhausted', () => {
    // 41-day runway: Nov 8 + 41 = Dec 19 is the last day it stays anchored.
    expect(resolveCycle(WINTER_SPORTS, 41, '2026-12-19').targetLiveDate).toBe('2026-11-08');
    expect(resolveCycle(WINTER_SPORTS, 41, '2026-12-20').targetLiveDate).toBe('2027-11-08');
  });

  it('does not strand a niche in a year-long tail — the old year-boundary bug', () => {
    // Keying off "past THIS calendar year's date" made a March target report
    // ten straight months of late-window while a November one reported seven
    // weeks. Anchoring to the runway makes the trailing span uniform.
    const march = [g('START', 1, null), g('DUE', 3, 8)];
    expect(resolveCycle(march, 41, '2026-07-01').targetLiveDate).toBe('2027-03-08');
    expect(resolveCycle(march, 41, '2026-03-20').targetLiveDate).toBe('2026-03-08');
  });

  it('anchors to the upcoming target when approaching but not yet in the runway', () => {
    const c = resolveCycle(WINTER_SPORTS, 41, '2026-09-20');
    expect(c.targetLiveDate).toBe('2026-11-08');
    expect(c.daysPastTarget).toBeNull();
  });

  it('never anchors backwards when no runway is known', () => {
    // runway 0 must not strand every niche permanently in the past.
    expect(resolveCycle(WINTER_SPORTS, 0, '2026-11-20').targetLiveDate).toBe('2027-11-08');
  });

  it('resolves a cycle that wraps the year boundary', () => {
    // Bachelorette STARTs in December and is DUE the following September.
    const c = resolveCycle(BACHELORETTE, 278, '2026-12-20');
    expect(c.targetLiveDate).toBe('2027-09-05');
    expect(c.cycleYear).toBe(2027);
    expect(c.startMonth).toBe(12);
  });

  it('caps the trailing span by the runway so a long runway is not a long tail', () => {
    // Bachelorette's runway is 278 days. Without the cap, every day from
    // September to the following December would anchor backwards and read
    // LATE_WINDOW. The dead zone here (Sep 5 -> Dec 1) is the shorter bound.
    expect(resolveCycle(BACHELORETTE, 278, '2026-10-01').targetLiveDate).toBe('2026-09-05');
    expect(resolveCycle(BACHELORETTE, 278, '2026-12-01').targetLiveDate).toBe('2027-09-05');
  });

  it('returns no target when the source gives a DUE month but no day', () => {
    // Gender Reveal is real: listed in September's DUE column, absent from
    // that month's grid, so the source genuinely has no date for it.
    const c = resolveCycle([g('START', 4, null), g('DUE', 9, null)], 0, '2026-08-17');
    expect(c.targetLiveDate).toBeNull();
    expect(c.datePrecision).toBe('month');
    expect(c.dueMonth).toBe(9);
  });

  it('returns no target when the niche has no DUE entry at all', () => {
    // Six real niches are shaped this way (Hobbies, Officiant Gifts, ...).
    const c = resolveCycle([g('START', 4, null)], 0, '2026-08-17');
    expect(c.targetLiveDate).toBeNull();
    expect(c.startMonth).toBe(4);
  });
});

describe('sourceImpliedRunway', () => {
  it('measures from the 1st of the START month to the DUE date', () => {
    expect(sourceImpliedRunway(WINTER_SPORTS)).toBe(68);   // Sep 1 -> Nov 8
  });

  it('handles a runway that crosses the year boundary', () => {
    expect(sourceImpliedRunway(BACHELORETTE)).toBe(278);   // Dec 1 -> Sep 5
  });

  it('is null when either end is missing', () => {
    expect(sourceImpliedRunway([g('START', 9, null)])).toBeNull();
    expect(sourceImpliedRunway([g('DUE', 11, 8)])).toBeNull();
  });
});

describe('computeTimingState — tier 1, with a lead-time profile', () => {
  const run = todayStr => computeTimingState({ guidance: WINTER_SPORTS, leadTime: FULL_LEAD, todayStr });

  it('derives latest safe start as target minus the pre-live runway', () => {
    const r = run('2026-08-17');
    expect(r.targetLiveDate).toBe('2026-11-08');
    expect(r.latestSafeStart).toBe('2026-09-28');   // Nov 8 - 41 days
    expect(r.leadTimeTotal).toBe(41);
    expect(r.tier).toBe('lead_time');
  });

  it('walks research -> design -> build -> list as the date advances', () => {
    expect(run('2026-08-17').state).toBe(TIMING_STATES.TOO_EARLY_WATCH);
    expect(run('2026-09-28').state).toBe(TIMING_STATES.RESEARCH_NOW);
    expect(run('2026-10-11').state).toBe(TIMING_STATES.RESEARCH_NOW);
    expect(run('2026-10-12').state).toBe(TIMING_STATES.DESIGN_NOW);
    expect(run('2026-11-01').state).toBe(TIMING_STATES.DESIGN_NOW);
    expect(run('2026-11-02').state).toBe(TIMING_STATES.BUILD_NOW);
    expect(run('2026-11-05').state).toBe(TIMING_STATES.LIST_NOW);
    expect(run('2026-11-08').state).toBe(TIMING_STATES.LIST_NOW);
  });

  it('never emits IN_DEVELOPMENT when the lead time can separate the stages', () => {
    const seen = ['2026-09-28', '2026-10-12', '2026-11-02', '2026-11-05'].map(d => run(d).state);
    expect(seen).not.toContain(TIMING_STATES.IN_DEVELOPMENT);
    expect(new Set(seen).size).toBe(4);
  });

  it('exposes every phase boundary so the state is explainable, not a mystery', () => {
    const r = run('2026-10-15');
    expect(r.phaseBoundaries).toEqual({
      researchStart: '2026-09-28', conceptStart: '2026-10-12', designStart: '2026-10-19',
      buildStart: '2026-11-02', listingStart: '2026-11-05',
    });
    expect(r.reason).toContain('2026-11-08');
  });

  it('flags a partial runway when components are unset instead of hiding it', () => {
    const r = computeTimingState({
      guidance: WINTER_SPORTS, leadTime: { name: 'Partial', research_days: 10 }, todayStr: '2026-10-30',
    });
    expect(r.componentsUnknown).toContain('design_days');
    expect(r.reason).toMatch(/partial/i);
  });

  it('keeps indexing days visible but never spends them on the runway', () => {
    const r = run('2026-08-17');
    expect(r.indexingDays).toBe(21);
    expect(r.leadTimeTotal).toBe(41);           // not 62
    expect(r.latestSafeStart).toBe('2026-09-28');
  });
});

describe('computeTimingState — tier 2, no lead-time profile', () => {
  const run = todayStr => computeTimingState({ guidance: WINTER_SPORTS, leadTime: null, todayStr });

  it('uses the source\'s own months and says so', () => {
    expect(run('2026-09-15').state).toBe(TIMING_STATES.RESEARCH_NOW);
    expect(run('2026-09-15').tier).toBe('source_phase');
    expect(run('2026-09-15').reason).toContain('Taylor POD Niche Calendar v4.0');
  });

  it('reports IN_DEVELOPMENT only where the source cannot separate design from build', () => {
    const r = run('2026-10-15');
    expect(r.state).toBe(TIMING_STATES.IN_DEVELOPMENT);
    expect(r.reason).toMatch(/cannot be separated/i);
  });

  it('lists the missing lead time as a named unknown rather than guessing one', () => {
    expect(run('2026-10-15').unknowns.join(' ')).toMatch(/lead time/i);
    expect(run('2026-10-15').latestSafeStart).toBeNull();
  });

  it('distinguishes an explicit CONTINUE month from a gap month in the runway', () => {
    // Infertility/IVF is real: START August, DUE October, no CONTINUE printed
    // for September at all.
    const ivf = [g('START', 8, null), g('DUE', 10, 25)];
    const r = computeTimingState({ guidance: ivf, todayStr: '2026-09-15' });
    expect(r.state).toBe(TIMING_STATES.IN_DEVELOPMENT);
    expect(r.reason).toMatch(/prints no CONTINUE entry/i);
  });

  it('handles the year-wrapping runway without special-casing', () => {
    expect(computeTimingState({ guidance: BACHELORETTE, todayStr: '2026-12-10' }).state)
      .toBe(TIMING_STATES.RESEARCH_NOW);
    expect(computeTimingState({ guidance: BACHELORETTE, todayStr: '2027-03-10' }).state)
      .toBe(TIMING_STATES.IN_DEVELOPMENT);
    expect(computeTimingState({ guidance: BACHELORETTE, todayStr: '2027-09-02' }).state)
      .toBe(TIMING_STATES.LIST_NOW);
  });
});

describe('computeTimingState — past the target date', () => {
  it('is LATE_WINDOW when nothing is live yet', () => {
    const r = computeTimingState({ guidance: WINTER_SPORTS, leadTime: FULL_LEAD, todayStr: '2026-11-20' });
    expect(r.state).toBe(TIMING_STATES.LATE_WINDOW);
  });

  it('is MAINTAIN when a linked listing is already live — a date check, not a judgment', () => {
    const r = computeTimingState({
      guidance: WINTER_SPORTS, leadTime: FULL_LEAD, hasLiveCoverage: true, todayStr: '2026-11-20',
    });
    expect(r.state).toBe(TIMING_STATES.MAINTAIN);
  });

  it('only reaches MISSED_NEXT_YEAR once a real close date exists', () => {
    const args = { guidance: WINTER_SPORTS, leadTime: FULL_LEAD, todayStr: '2026-12-01' };
    expect(computeTimingState(args).state).toBe(TIMING_STATES.LATE_WINDOW);
    expect(computeTimingState({ ...args, closeDate: '2026-11-25' }).state)
      .toBe(TIMING_STATES.MISSED_NEXT_YEAR);
  });

  it('always reports peak and close as unknown, since no source supplies them', () => {
    const r = computeTimingState({ guidance: WINTER_SPORTS, leadTime: FULL_LEAD, todayStr: '2026-10-15' });
    expect(r.unknowns).toContain('demand peak date');
    expect(r.unknowns).toContain('window close date');
  });
});

describe('computeTimingState — evergreen', () => {
  const evergreenNiche = [
    g('START', 8, null, { classification: 'evergreen', classification_symbol: '💡' }),
    g('DUE', 10, 15, { classification: 'evergreen', classification_symbol: '💡' }),
  ];

  it('falls back to EVERGREEN_WATCH outside the runway instead of TOO_EARLY_WATCH', () => {
    const r = computeTimingState({ guidance: evergreenNiche, todayStr: '2026-03-01' });
    expect(r.state).toBe(TIMING_STATES.EVERGREEN_WATCH);
    expect(r.isEvergreen).toBe(true);
  });

  it('is overridden by a real window state while the window is active', () => {
    const r = computeTimingState({ guidance: evergreenNiche, todayStr: '2026-08-10' });
    expect(r.state).toBe(TIMING_STATES.RESEARCH_NOW);
  });

  it('reads evergreen off the source classification, never off the niche itself', () => {
    const r = computeTimingState({ guidance: evergreenNiche, todayStr: '2026-03-01' });
    expect(r.classifications.every(c => c.value === 'evergreen')).toBe(true);
    expect(r.primarySource.name).toBe('Taylor POD Niche Calendar');
  });
});

describe('computeTimingState — unknown and missing evidence', () => {
  it('is UNKNOWN with no guidance at all', () => {
    const r = computeTimingState({ guidance: [], todayStr: '2026-08-17' });
    expect(r.state).toBe(TIMING_STATES.UNKNOWN);
    expect(r.unknowns).toContain('timing source');
  });

  it('still reports RESEARCH_NOW during a START month with no target date', () => {
    const r = computeTimingState({ guidance: [g('START', 8, null)], todayStr: '2026-08-17' });
    expect(r.state).toBe(TIMING_STATES.RESEARCH_NOW);
    expect(r.targetLiveDate).toBeNull();
    expect(r.unknowns).toContain('target live date');
  });

  it('is UNKNOWN outside that START month rather than inventing a runway', () => {
    const r = computeTimingState({ guidance: [g('START', 8, null)], todayStr: '2026-02-17' });
    expect(r.state).toBe(TIMING_STATES.UNKNOWN);
  });

  it('names month-only precision explicitly when a DUE has no day', () => {
    const r = computeTimingState({ guidance: [g('START', 4, null), g('DUE', 9, null)], todayStr: '2026-08-17' });
    expect(r.targetLiveDate).toBeNull();
    expect(r.unknowns[0]).toMatch(/month only/i);
  });
});

describe('computeTimingState — multiple sources', () => {
  const mixed = [
    ...WINTER_SPORTS,
    { source_id: MARKET.id, timing_sources: MARKET, guidance_state: 'ACTIVITY_RISING',
      month: 10, day: null, classification: null, evidence_type: 'observation',
      guidance_text: 'Competitor listing counts climbing since early October' },
  ];

  it('computes from the expert source and leaves the others unreconciled', () => {
    const r = computeTimingState({ guidance: mixed, leadTime: FULL_LEAD, todayStr: '2026-10-15' });
    expect(r.primarySource.name).toBe('Taylor POD Niche Calendar');
    expect(r.otherSources).toHaveLength(1);
    expect(r.otherSources[0].guidanceState).toBe('ACTIVITY_RISING');
    expect(r.otherSources[0].source.name).toBe('Etsy marketplace observation');
  });

  it('never merges a second source into the computed state', () => {
    const withMarket = computeTimingState({ guidance: mixed, leadTime: FULL_LEAD, todayStr: '2026-10-15' });
    const taylorOnly = computeTimingState({ guidance: WINTER_SPORTS, leadTime: FULL_LEAD, todayStr: '2026-10-15' });
    expect(withMarket.state).toBe(taylorOnly.state);
    expect(withMarket.targetLiveDate).toBe(taylorOnly.targetLiveDate);
  });

  it('honours an explicitly requested primary source', () => {
    const r = computeTimingState({ guidance: mixed, primarySourceId: MARKET.id, todayStr: '2026-10-15' });
    expect(r.primarySource.name).toBe('Etsy marketplace observation');
  });

  it('preserves a classification that disagrees with itself across months', () => {
    // Girls Trip really is printed low-competition in January and
    // emotion-based in February/March. Both survive; neither wins.
    const girlsTrip = [
      g('CONTINUE', 1, null, { classification: 'low_competition' }),
      g('CONTINUE', 2, null, { classification: 'emotion_based' }),
      g('DUE', 3, 31, { classification: 'emotion_based' }),
      g('START', 12, null, { classification: 'low_competition' }),
    ];
    const r = computeTimingState({ guidance: girlsTrip, todayStr: '2026-02-10' });
    const values = r.classifications.map(c => c.value);
    expect(values).toContain('low_competition');
    expect(values).toContain('emotion_based');
    expect(r.classifications).toHaveLength(4);
  });
});

describe('computeProductTiming', () => {
  it('reports a missing launch date rather than inferring one', () => {
    const r = computeProductTiming({
      stage: 'Live', went_live_at: null,
      created_at: '2026-01-01', stage_updated_at: '2026-02-01', updated_at: '2026-03-01',
    }, null, '2026-08-17');
    expect(r.hasLaunchDate).toBe(false);
    expect(r.daysLive).toBeNull();
    expect(r.needsLaunchDate).toBe(true);
  });

  it('does not nudge for a product that is not live yet', () => {
    const r = computeProductTiming({ stage: 'Idea', went_live_at: null }, null, '2026-08-17');
    expect(r.needsLaunchDate).toBe(false);
  });

  it('reports days live from the real launch date only', () => {
    const r = computeProductTiming({ stage: 'Live', went_live_at: '2026-08-10' }, null, '2026-08-17');
    expect(r.daysLive).toBe(7);
    expect(r.hasLaunchDate).toBe(true);
  });
});

describe('groupNichesByState', () => {
  it('orders groups by urgency and never scores or ranks within them', () => {
    const groups = groupNichesByState([
      { niche: 'A', timing: { state: TIMING_STATES.TOO_EARLY_WATCH } },
      { niche: 'B', timing: { state: TIMING_STATES.LIST_NOW } },
      { niche: 'C', timing: { state: TIMING_STATES.RESEARCH_NOW } },
      { niche: 'D', timing: { state: TIMING_STATES.LIST_NOW } },
    ]);
    expect(groups.map(x => x.state)).toEqual([
      TIMING_STATES.LIST_NOW, TIMING_STATES.RESEARCH_NOW, TIMING_STATES.TOO_EARLY_WATCH,
    ]);
    expect(groups[0].niches).toHaveLength(2);
    expect(groups[0].niches[0]).not.toHaveProperty('score');
  });

  it('omits states with no members instead of rendering empty buckets', () => {
    const groups = groupNichesByState([{ niche: 'A', timing: { state: TIMING_STATES.MAINTAIN } }]);
    expect(groups).toHaveLength(1);
  });
});

describe('timing confidence', () => {
  it('is High only when a dated target and a real lead time both exist', () => {
    const r = computeTimingState({ guidance: WINTER_SPORTS, leadTime: FULL_LEAD, todayStr: '2026-10-15' });
    expect(r.confidence.value).toBe('High');
  });

  it('is Medium with a dated target but no configured lead time', () => {
    const r = computeTimingState({ guidance: WINTER_SPORTS, todayStr: '2026-10-15' });
    expect(r.confidence.value).toBe('Medium');
    expect(r.confidence.reason).toMatch(/no TCC lead-time profile/i);
  });

  it('is Low when the source gives no usable target date', () => {
    const monthOnly = computeTimingState({ guidance: [g('START', 4, null), g('DUE', 9, null)], todayStr: '2026-08-17' });
    expect(monthOnly.confidence.value).toBe('Low');
    expect(monthOnly.confidence.reason).toMatch(/no date/i);
    expect(computeTimingState({ guidance: [], todayStr: '2026-08-17' }).confidence.value).toBe('Low');
  });

  it('measures evidence completeness only — never whether the niche is a good bet', () => {
    // A high-competition niche and a low-competition one with identical date
    // evidence must score identically.
    const hot = [g('START', 9, null, { classification: 'high_competition' }), g('DUE', 11, 8, { classification: 'high_competition' })];
    const cold = [g('START', 9, null, { classification: 'low_competition' }), g('DUE', 11, 8, { classification: 'low_competition' })];
    const a = computeTimingState({ guidance: hot, leadTime: FULL_LEAD, todayStr: '2026-10-15' });
    const b = computeTimingState({ guidance: cold, leadTime: FULL_LEAD, todayStr: '2026-10-15' });
    expect(a.confidence.value).toBe(b.confidence.value);
  });
});

describe('monthName', () => {
  it('maps 1-12 and degrades gracefully', () => {
    expect(monthName(1)).toBe('January');
    expect(monthName(12)).toBe('December');
    expect(monthName(99)).toBe('99');
  });
});
