// Milestone C3 — Checkpoint Review Loop. Same house convention as
// storePolicies.test.js/listingSEO.test.js: unit tests for the deterministic
// module, not a general push to test everything. computeCheckpointStates is
// the safety-critical one — it's what makes "the ledger remains source of
// truth for Upcoming/Due/Reviewed/Skipped" true, so it gets the most
// coverage; the snapshot builders get lighter shape/null-guard checks.
import { describe, it, expect } from 'vitest';
import {
  CHECKPOINT_DAYS, computeCheckpointStates, getNextActionableCheckpoint,
  buildPerformanceSnapshot, buildGenerationSnapshot, summarizeKeywordEvidence,
} from './listingReviews.js';

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function product(overrides) {
  return {
    id: 'prod1', went_live_at: null, printify_cost: null,
    mo_sales: 0, mo_revenue: 0, total_sales: 0, reviews: 0, mo_reviews: 0,
    views: 0, favorites: 0, conversion_rate: 0, visibility_score: 0, review_ratio: 0,
    ad_views: 0, ad_clicks: 0, ad_click_rate: 0, ad_orders: 0, ad_revenue: 0, ad_spend: 0, ad_roas: 0,
    stats_updated_at: null,
    ...overrides,
  };
}

function reviewRow(overrides) {
  return {
    id: 'r1', product_id: 'prod1', checkpoint_number: 30, status: 'reviewed',
    created_at: '2026-08-01T00:00:00Z', user_decision: 'no_action_needed',
    ...overrides,
  };
}

describe('computeCheckpointStates', () => {
  it('no went_live_at: all four checkpoints are no_went_live_date', () => {
    const states = computeCheckpointStates(product({}), []);
    expect(states).toHaveLength(4);
    expect(states.map(s => s.state)).toEqual(['no_went_live_date', 'no_went_live_date', 'no_went_live_date', 'no_went_live_date']);
    expect(states.every(s => s.row === null)).toBe(true);
  });

  it('5 days live, no rows: all four upcoming, correct daysUntilDue', () => {
    const states = computeCheckpointStates(product({ went_live_at: daysAgo(5) }), []);
    expect(states.map(s => s.state)).toEqual(['upcoming', 'upcoming', 'upcoming', 'upcoming']);
    expect(states.find(s => s.checkpointNumber === 30).daysUntilDue).toBe(25);
    expect(states.find(s => s.checkpointNumber === 60).daysUntilDue).toBe(55);
  });

  it('35 days live, no rows: 30 is due (overdue 5), 60/90/120 still upcoming', () => {
    const states = computeCheckpointStates(product({ went_live_at: daysAgo(35) }), []);
    const c30 = states.find(s => s.checkpointNumber === 30);
    const c60 = states.find(s => s.checkpointNumber === 60);
    expect(c30.state).toBe('due');
    expect(c30.daysOverdue).toBe(5);
    expect(c60.state).toBe('upcoming');
    expect(c60.daysUntilDue).toBe(25);
  });

  it('a reviewed row for a checkpoint overrides due -> reviewed, not due', () => {
    const states = computeCheckpointStates(
      product({ went_live_at: daysAgo(35) }),
      [reviewRow({ checkpoint_number: 30, status: 'reviewed' })]
    );
    const c30 = states.find(s => s.checkpointNumber === 30);
    expect(c30.state).toBe('reviewed');
    expect(c30.row).toBeTruthy();
  });

  it('a skipped row reports state: skipped', () => {
    const states = computeCheckpointStates(
      product({ went_live_at: daysAgo(35) }),
      [reviewRow({ checkpoint_number: 30, status: 'skipped', user_decision: null })]
    );
    expect(states.find(s => s.checkpointNumber === 30).state).toBe('skipped');
  });

  it('a reviewed row with user_decision insufficient_data sets insufficientData true, state stays reviewed', () => {
    const states = computeCheckpointStates(
      product({ went_live_at: daysAgo(35) }),
      [reviewRow({ checkpoint_number: 30, status: 'reviewed', user_decision: 'insufficient_data' })]
    );
    const c30 = states.find(s => s.checkpointNumber === 30);
    expect(c30.state).toBe('reviewed');
    expect(c30.insufficientData).toBe(true);
  });

  it('a normal reviewed row (not insufficient_data) has insufficientData false', () => {
    const states = computeCheckpointStates(
      product({ went_live_at: daysAgo(35) }),
      [reviewRow({ checkpoint_number: 30, status: 'reviewed', user_decision: 'update_seo' })]
    );
    expect(states.find(s => s.checkpointNumber === 30).insufficientData).toBe(false);
  });

  it('200 days live, no rows: all four are due (unbounded, no "missed forever" state)', () => {
    const states = computeCheckpointStates(product({ went_live_at: daysAgo(200) }), []);
    expect(states.every(s => s.state === 'due')).toBe(true);
    expect(states.find(s => s.checkpointNumber === 120).daysOverdue).toBe(80);
  });

  it('two rows for the same checkpoint: most recent by created_at wins, the other lands in priorRows', () => {
    const older = reviewRow({ id: 'r_old', checkpoint_number: 30, created_at: '2026-07-01T00:00:00Z' });
    const newer = reviewRow({ id: 'r_new', checkpoint_number: 30, created_at: '2026-08-01T00:00:00Z' });
    const states = computeCheckpointStates(product({ went_live_at: daysAgo(35) }), [older, newer]);
    const c30 = states.find(s => s.checkpointNumber === 30);
    expect(c30.row.id).toBe('r_new');
    expect(c30.priorRows.map(r => r.id)).toEqual(['r_old']);
  });

  it('checkpoint_number is always CHECKPOINT_DAYS, in order', () => {
    const states = computeCheckpointStates(product({ went_live_at: daysAgo(35) }), []);
    expect(states.map(s => s.checkpointNumber)).toEqual(CHECKPOINT_DAYS);
  });
});

describe('getNextActionableCheckpoint', () => {
  it('returns the earliest due checkpoint when any are due', () => {
    const states = computeCheckpointStates(product({ went_live_at: daysAgo(65) }), []);
    expect(getNextActionableCheckpoint(states).checkpointNumber).toBe(30);
  });

  it('falls back to the earliest upcoming checkpoint when none are due', () => {
    const states = computeCheckpointStates(product({ went_live_at: daysAgo(10) }), []);
    expect(getNextActionableCheckpoint(states).checkpointNumber).toBe(30);
  });

  it('returns null when nothing is actionable (no went_live_at)', () => {
    const states = computeCheckpointStates(product({}), []);
    expect(getNextActionableCheckpoint(states)).toBeNull();
  });

  it('returns null once every checkpoint is settled', () => {
    const rows = CHECKPOINT_DAYS.map(n => reviewRow({ id: `r${n}`, checkpoint_number: n }));
    const states = computeCheckpointStates(product({ went_live_at: daysAgo(200) }), rows);
    expect(getNextActionableCheckpoint(states)).toBeNull();
  });
});

describe('buildPerformanceSnapshot', () => {
  it('picks exactly the LIVE_STATS_FIELDS values off the product', () => {
    const snap = buildPerformanceSnapshot(product({ mo_sales: 12, views: 400 }));
    expect(snap.mo_sales).toBe(12);
    expect(snap.views).toBe(400);
    expect(snap).not.toHaveProperty('id');
    expect(snap).not.toHaveProperty('name');
  });

  it('computed is null when printify_cost is unset', () => {
    const snap = buildPerformanceSnapshot(product({ printify_cost: null, mo_sales: 10, mo_revenue: 200 }));
    expect(snap.computed).toBeNull();
  });

  it('computed is null when mo_sales/mo_revenue are unset even with printify_cost present', () => {
    const snap = buildPerformanceSnapshot(product({ printify_cost: 8, mo_sales: 0, mo_revenue: 0 }));
    expect(snap.computed).toBeNull();
  });

  it('computes net_profit/margin_pct/roas correctly when all three are present', () => {
    const snap = buildPerformanceSnapshot(product({
      printify_cost: 8, mo_sales: 10, mo_revenue: 200, ad_spend: 20, ad_revenue: 60,
    }));
    // net_profit = 200 - 8*10 - 20 = 100
    expect(snap.computed.net_profit).toBe(100);
    expect(snap.computed.margin_pct).toBe(50);
    expect(snap.computed.roas).toBe(3);
  });
});

describe('buildGenerationSnapshot', () => {
  it('returns null for a null generation', () => {
    expect(buildGenerationSnapshot(null)).toBeNull();
  });

  it('picks the expected fields off a real generation row', () => {
    const snap = buildGenerationSnapshot({
      id: 'g1', title: 'Reader Chapter Tee', tags: ['book lover'],
      primary_search_intent: 'book lover shirt', primary_intent_status: 'validated',
      created_at: '2026-08-01T00:00:00Z', description: { opener: 'irrelevant here' },
    });
    expect(snap).toEqual({
      generation_id: 'g1', title: 'Reader Chapter Tee', tags: ['book lover'],
      primary_search_intent: 'book lover shirt', primary_intent_status: 'validated',
      generated_at: '2026-08-01T00:00:00Z',
    });
  });
});

describe('summarizeKeywordEvidence', () => {
  function session(keywords) {
    return { id: 's1', source: 'everbee', date: '2026-08-01', seasonal: false, keywords };
  }

  it('excludes non-use-tagged keywords', () => {
    const sessions = [session([
      { keyword: 'a', tag_type: 'use', score: 500 },
      { keyword: 'b', tag_type: 'watch', score: 900 },
      { keyword: 'c', tag_type: 'discard', score: 900 },
    ])];
    const result = summarizeKeywordEvidence(sessions);
    expect(result.map(k => k.keyword)).toEqual(['a']);
  });

  it('respects the limit', () => {
    const kws = Array.from({ length: 12 }, (_, i) => ({ keyword: `kw${i}`, tag_type: 'use', score: i }));
    const result = summarizeKeywordEvidence([session(kws)], { limit: 3 });
    expect(result).toHaveLength(3);
  });

  it('returns an empty array when there is no research evidence', () => {
    expect(summarizeKeywordEvidence([])).toEqual([]);
  });
});
