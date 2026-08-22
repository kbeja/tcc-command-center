// Phase 9 / §4, §26 — Analysis findings. Same house convention as
// keywordIntelligence/listingSEO tests: cover the deterministic module whose
// output a human then judges, and pin the boundaries it must not cross.
import { describe, it, expect } from 'vitest';
import {
  findKeywordFindings, summarizeFindings, sortFindings,
  FINDING_TYPES, ANALYSIS_LAYERS,
} from './analysis.js';

const TODAY = new Date('2026-08-22T00:00:00Z').getTime();

function reading(source, overrides = {}) {
  return {
    source, keyword: 'hockey mom shirt',
    volume: 500, competition: 5000,
    data_date: '2026-08-20', recorded_at: '2026-08-20T00:00:00Z',
    ...overrides,
  };
}

function types(findings) {
  return findings.map(f => f.type);
}

describe('evidence presence', () => {
  it('reports insufficient evidence and stops when there are no readings', () => {
    const f = findKeywordFindings({}, [], { todayMs: TODAY });
    expect(types(f)).toEqual([FINDING_TYPES.INSUFFICIENT_EVIDENCE]);
  });

  it('flags a keyword only one source has ever reported on', () => {
    const f = findKeywordFindings({ search_intent: 'Product' }, [reading('eRank')], { niches: [{ id: 'n' }], todayMs: TODAY });
    expect(types(f)).toContain(FINDING_TYPES.SINGLE_SOURCE_ONLY);
  });
});

describe('cross-source agreement', () => {
  it('detects real disagreement between two sources', () => {
    const f = findKeywordFindings({}, [
      reading('eRank', { volume: 200 }),
      reading('Everbee', { volume: 900 }),
    ], { todayMs: TODAY });
    const d = f.find(x => x.type === FINDING_TYPES.SOURCES_DISAGREE);
    expect(d).toBeTruthy();
    expect(d.severity).toBe('flag');
    // The numbers travel with the finding — a finding you cannot audit is
    // indistinguishable from an assertion.
    expect(d.evidence.sources.map(s => s.source).sort()).toEqual(['Everbee', 'eRank']);
    expect(d.evidence.relativeGap).toBeGreaterThan(0.5);
  });

  it('does not call two small numbers a disagreement', () => {
    // 10 vs 30 is a 67% gap but both are noise — the floor exists for this.
    const f = findKeywordFindings({}, [
      reading('eRank', { volume: 10 }),
      reading('Everbee', { volume: 30 }),
    ], { todayMs: TODAY });
    expect(types(f)).not.toContain(FINDING_TYPES.SOURCES_DISAGREE);
  });

  it('reports corroboration when sources land close together', () => {
    const f = findKeywordFindings({}, [
      reading('eRank', { volume: 500 }),
      reading('Everbee', { volume: 460 }),
    ], { todayMs: TODAY });
    expect(types(f)).toContain(FINDING_TYPES.SOURCES_AGREE);
  });
});

describe('demand versus competition', () => {
  it('notes strong demand against a very crowded field', () => {
    const f = findKeywordFindings({}, [reading('Everbee', { volume: 5000, competition: 250000 })], { todayMs: TODAY });
    const hit = f.find(x => x.type === FINDING_TYPES.HIGH_DEMAND_HIGH_COMP);
    expect(hit.evidence).toEqual({ volume: 5000, competition: 250000 });
  });

  it('notes a genuine opening', () => {
    const f = findKeywordFindings({}, [reading('Everbee', { volume: 5000, competition: 900 })], { todayMs: TODAY });
    expect(types(f)).toContain(FINDING_TYPES.LOW_COMPETITION_OPENING);
  });

  it('says nothing about demand when competition is unknown', () => {
    const f = findKeywordFindings({}, [reading('Everbee', { volume: 5000, competition: null })], { todayMs: TODAY });
    expect(types(f)).not.toContain(FINDING_TYPES.HIGH_DEMAND_HIGH_COMP);
    expect(types(f)).not.toContain(FINDING_TYPES.LOW_COMPETITION_OPENING);
  });
});

describe('freshness', () => {
  it('flags evidence older than the staleness window', () => {
    const f = findKeywordFindings({}, [reading('eRank', { data_date: '2026-01-01', recorded_at: '2026-01-01T00:00:00Z' })], { todayMs: TODAY });
    const stale = f.find(x => x.type === FINDING_TYPES.STALE_EVIDENCE);
    expect(stale.evidence.ageDays).toBeGreaterThan(90);
  });

  it('says nothing about recent evidence', () => {
    const f = findKeywordFindings({}, [reading('eRank')], { todayMs: TODAY });
    expect(types(f)).not.toContain(FINDING_TYPES.STALE_EVIDENCE);
  });
});

describe('classification gaps', () => {
  it('treats a missing search intent as a finding, because §7 filters on it', () => {
    const f = findKeywordFindings({}, [reading('eRank')], { niches: [{ id: 'n' }], todayMs: TODAY });
    expect(types(f)).toContain(FINDING_TYPES.UNCLASSIFIED_INTENT);
  });

  it('treats a keyword with no niche link as a finding', () => {
    const f = findKeywordFindings({ search_intent: 'Product' }, [reading('eRank')], { niches: [], todayMs: TODAY });
    expect(types(f)).toContain(FINDING_TYPES.NO_NICHE_LINK);
  });

  it('reports neither once both are classified', () => {
    const f = findKeywordFindings({ search_intent: 'Product' }, [reading('eRank')], { niches: [{ id: 'n' }], todayMs: TODAY });
    expect(types(f)).not.toContain(FINDING_TYPES.UNCLASSIFIED_INTENT);
    expect(types(f)).not.toContain(FINDING_TYPES.NO_NICHE_LINK);
  });
});

describe('findings never become conclusions', () => {
  it('never returns a score, verdict or recommendation field', () => {
    const f = findKeywordFindings({}, [
      reading('eRank', { volume: 200 }),
      reading('Everbee', { volume: 900 }),
    ], { todayMs: TODAY });
    for (const finding of f) {
      expect(Object.keys(finding).sort()).toEqual(['evidence', 'severity', 'summary', 'type']);
      expect(finding).not.toHaveProperty('score');
      expect(finding).not.toHaveProperty('recommendation');
    }
  });

  it('every finding carries the evidence it was derived from', () => {
    const f = findKeywordFindings({ search_intent: 'Product' }, [reading('Everbee', { volume: 5000, competition: 900 })], { niches: [{ id: 'n' }], todayMs: TODAY });
    for (const finding of f) expect(finding.evidence).toBeDefined();
  });
});

describe('summarizeFindings', () => {
  it('counts by type and by affected keyword without averaging anything', () => {
    const s = summarizeFindings({
      k1: [{ type: 'a', severity: 'flag' }, { type: 'b', severity: 'note' }],
      k2: [{ type: 'a', severity: 'note' }],
      k3: [],
    });
    expect(s.counts).toEqual({ a: 2, b: 1 });
    expect(s.total).toBe(3);
    expect(s.keywordsAnalyzed).toBe(3);
    expect(s.keywordsWithFlags).toBe(1);
    expect(s).not.toHaveProperty('score');
  });

  it('handles an empty set', () => {
    const s = summarizeFindings({});
    expect(s.total).toBe(0);
    expect(s.keywordsAnalyzed).toBe(0);
  });
});

describe('sortFindings', () => {
  it('puts flags first and notes last', () => {
    const sorted = sortFindings([
      { type: 'c', severity: 'note' },
      { type: 'a', severity: 'flag' },
      { type: 'b', severity: 'watch' },
    ]);
    expect(sorted.map(f => f.type)).toEqual(['a', 'b', 'c']);
  });
});

describe('the five layers', () => {
  it('stay five separate named layers in a fixed order', () => {
    expect(ANALYSIS_LAYERS.map(l => l.key)).toEqual([
      'evidence_snapshot', 'interpretation', 'decision', 'hypothesis', 'learning',
    ]);
  });
});
