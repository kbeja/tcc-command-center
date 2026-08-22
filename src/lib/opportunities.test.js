// Home's "build this now" logic. Same house convention as the other lib
// tests: cover the deterministic module a real decision rests on, and pin the
// boundaries it must not cross — chiefly that a text-matched spark never gets
// presented as a classified one.
import { describe, it, expect } from 'vitest';
import { buildOpportunities, summarizeOpportunities, looseNicheMatch, ACTIONABLE_STATES } from './opportunities.js';

function result(state, nicheName, collections = [], extra = {}) {
  return {
    niche: { id: nicheName, name: nicheName },
    timing: { state, daysRemaining: 10, ...extra },
    linkedCollections: collections.map(c => ({ id: c, name: c })),
  };
}

describe('looseNicheMatch', () => {
  it('matches a niche name appearing in spark text', () => {
    expect(looseNicheMatch('Halloween', 'spooky halloween tee idea')).toBe(true);
  });

  it('matches on a word boundary, not mid-word', () => {
    // "Reading" must not match "threading".
    expect(looseNicheMatch('Reading', 'threading the needle')).toBe(false);
  });

  it('ignores short tokens so a small name cannot match everything', () => {
    // No token of 4+ chars, so no match is attempted at all.
    expect(looseNicheMatch('Pet', 'a pet shirt')).toBe(false);
  });

  it('handles empty input safely', () => {
    expect(looseNicheMatch('', 'anything')).toBe(false);
    expect(looseNicheMatch('Halloween', '')).toBe(false);
    expect(looseNicheMatch(null, null)).toBe(false);
  });
});

describe('buildOpportunities', () => {
  it('includes only actionable timing states', () => {
    const out = buildOpportunities({
      timingResults: [
        result('BUILD_NOW', 'Halloween'),
        result('EVERGREEN_WATCH', 'Reading'),
        result('MISSED_NEXT_YEAR', 'Easter'),
        result('TOO_EARLY_WATCH', 'Christmas'),
      ],
    });
    expect(out.map(o => o.niche.name)).toEqual(['Halloween']);
  });

  it('orders by timing urgency, not by any score', () => {
    const out = buildOpportunities({
      timingResults: [
        result('RESEARCH_NOW', 'C'),
        result('LIST_NOW', 'A'),
        result('BUILD_NOW', 'B'),
      ],
    });
    expect(out.map(o => o.niche.name)).toEqual(['A', 'B', 'C']);
  });

  it('never returns a score field', () => {
    const [o] = buildOpportunities({ timingResults: [result('BUILD_NOW', 'Halloween')] });
    expect(o).not.toHaveProperty('score');
    expect(o).not.toHaveProperty('rank');
  });

  it('counts live and in-progress products through linked collections', () => {
    const [o] = buildOpportunities({
      timingResults: [result('BUILD_NOW', 'Halloween', ['Spooky'])],
      products: [
        { stage: 'Live', collection: 'Spooky' },
        { stage: 'Live', collection: 'Other' },
        { stage: 'Design Phase', collection: 'Spooky' },
        { stage: 'Killed', collection: 'Spooky' },
      ],
    });
    expect(o.liveCount).toBe(1);
    expect(o.inProgressCount).toBe(1);   // Killed excluded
  });

  it('reports the highest-volume keyword as the evidence line', () => {
    const [o] = buildOpportunities({
      timingResults: [result('BUILD_NOW', 'Halloween', ['Spooky'])],
      keywords: [
        { keyword: 'a', volume: 100, research_sessions: { collection: 'Spooky' } },
        { keyword: 'b', volume: 900, research_sessions: { collection: 'Spooky' } },
        { keyword: 'c', volume: 5000, research_sessions: { collection: 'Elsewhere' } },
      ],
    });
    expect(o.keywordCount).toBe(2);
    expect(o.bestKeyword.keyword).toBe('b');
  });
});

describe('linked versus suggested sparks', () => {
  const timingResults = [result('BUILD_NOW', 'Halloween', ['Spooky'])];
  const sparks = [
    { id: 1, content: 'ghost tee', collection_tag: 'Spooky' },
    { id: 2, content: 'halloween bookmark idea', collection_tag: null },
    { id: 3, content: 'hockey mom crest', collection_tag: null },
    { id: 4, content: 'old halloween idea', collection_tag: null, archived_at: '2026-01-01' },
  ];

  it('keeps a filed spark and a text-matched one strictly separate', () => {
    const [o] = buildOpportunities({ timingResults, sparks });
    expect(o.linkedSparks.map(s => s.id)).toEqual([1]);
    expect(o.suggestedSparks.map(s => s.id)).toEqual([2]);
  });

  it('never counts a spark as both', () => {
    const [o] = buildOpportunities({ timingResults, sparks });
    const overlap = o.linkedSparks.filter(s => o.suggestedSparks.some(x => x.id === s.id));
    expect(overlap).toEqual([]);
  });

  it('excludes archived sparks from both', () => {
    const [o] = buildOpportunities({ timingResults, sparks });
    const all = [...o.linkedSparks, ...o.suggestedSparks].map(s => s.id);
    expect(all).not.toContain(4);
  });
});

describe('the uncovered signal', () => {
  it('fires when a window is open, nothing is live, and evidence exists', () => {
    const [o] = buildOpportunities({
      timingResults: [result('BUILD_NOW', 'Halloween', ['Spooky'])],
      keywords: [{ keyword: 'x', volume: 10, research_sessions: { collection: 'Spooky' } }],
    });
    expect(o.isUncovered).toBe(true);
  });

  it('does NOT fire on an empty niche with no research and no ideas', () => {
    // A blank is not an opportunity — without this guard every unresearched
    // niche in the calendar would present as a missed chance.
    const [o] = buildOpportunities({
      timingResults: [result('BUILD_NOW', 'Halloween', ['Spooky'])],
    });
    expect(o.isUncovered).toBe(false);
  });

  it('does not fire when something is already live there', () => {
    const [o] = buildOpportunities({
      timingResults: [result('BUILD_NOW', 'Halloween', ['Spooky'])],
      products: [{ stage: 'Live', collection: 'Spooky' }],
      keywords: [{ keyword: 'x', volume: 10, research_sessions: { collection: 'Spooky' } }],
    });
    expect(o.isUncovered).toBe(false);
  });

  it('flags a niche with no linked collection as unknowable rather than empty', () => {
    const [o] = buildOpportunities({ timingResults: [result('BUILD_NOW', 'Halloween', [])] });
    expect(o.needsLink).toBe(true);
    expect(o.isUncovered).toBe(false);
  });
});

describe('summarizeOpportunities', () => {
  it('counts without producing a percentage or a health score', () => {
    const s = summarizeOpportunities([
      { isUncovered: true, needsLink: false, keywordCount: 3 },
      { isUncovered: false, needsLink: true, keywordCount: 0 },
    ]);
    expect(s).toEqual({ total: 2, uncovered: 1, needingLink: 1, withResearch: 1 });
  });

  it('handles an empty list', () => {
    expect(summarizeOpportunities([]).total).toBe(0);
  });
});

describe('ACTIONABLE_STATES', () => {
  it('includes a closing window, which is often more urgent than an open one', () => {
    expect(ACTIONABLE_STATES).toContain('LATE_WINDOW');
  });

  it('excludes states that call for no work now', () => {
    expect(ACTIONABLE_STATES).not.toContain('MAINTAIN');
    expect(ACTIONABLE_STATES).not.toContain('EVERGREEN_WATCH');
    expect(ACTIONABLE_STATES).not.toContain('UNKNOWN');
  });
});

// ─── Regressions found on real data ────────────────────────────────────────
// Both of these put irrelevant markets at the top of Home, which is the exact
// failure the feature exists to avoid.
describe('false-positive guards', () => {
  it('does not match a niche on a common word in its name', () => {
    // "Honeymoon/Just Married" tokenises to include "just", which appears in a
    // large share of ordinary spark text. Without the stoplist this made an
    // unrelated niche look like it had matching ideas.
    expect(looseNicheMatch('Honeymoon/Just Married', 'just a mom thing tee')).toBe(false);
    // The distinctive tokens still work.
    expect(looseNicheMatch('Honeymoon/Just Married', 'honeymoon gift set')).toBe(true);
  });

  it('does not match "Family Vacation" on the word family alone', () => {
    expect(looseNicheMatch('Family Vacation', 'family matching tee')).toBe(false);
    expect(looseNicheMatch('Family Vacation', 'vacation mode shirt')).toBe(true);
  });

  it('never calls a niche uncovered when nothing about it can be measured', () => {
    // No linked collection means liveCount is 0 because nothing COUNTS, not
    // because nothing exists. Reporting that as "nothing live here yet" is an
    // absence of measurement dressed as a finding.
    const [o] = buildOpportunities({
      timingResults: [result('BUILD_NOW', 'Maternity', [])],
      sparks: [{ id: 1, content: 'maternity announcement tee' }],
    });
    expect(o.needsLink).toBe(true);
    expect(o.isUncovered).toBe(false);
  });
});

describe('calendar scaffolding words', () => {
  it('does not match a niche on "week" or "month" alone', () => {
    // "Midwifery Week" matched 9 unrelated sparks on the first real run,
    // purely because "week" is 4+ characters and appears everywhere.
    expect(looseNicheMatch('Midwifery Week', 'restock next week')).toBe(false);
    expect(looseNicheMatch('Principal Month', 'plan for the month')).toBe(false);
    // The distinctive half still works.
    expect(looseNicheMatch('Midwifery Week', 'midwifery gift set')).toBe(true);
    expect(looseNicheMatch('Principal Month', 'principal appreciation tee')).toBe(true);
  });
});
