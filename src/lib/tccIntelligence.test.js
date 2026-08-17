// Phase 23A — TCC Intelligence evidence floor. Same house convention as
// timingIntelligence.test.js: weighted toward the parts that can silently be
// wrong. Three areas get the most coverage —
//   1. maturity/do-not-touch, because misjudging listing age is what causes
//      premature SEO changes, the exact failure the brief exists to prevent;
//   2. the funnel/diagnostic null discipline, because "no impressions" and
//      "impressions but no clicks" must never both render as 0%;
//   3. the Ads CSV parser, tested against Etsy's REAL header and real rows
//      captured from Kristen's shop on 2026-08-17.
//
// Every date is a fixed literal and todayStr is always passed explicitly, so
// nothing here depends on the wall clock.
import { describe, it, expect } from 'vitest';
import {
  MATURITY, computeMaturity, computeDoNotTouch, maturityConfidenceCap,
  computeFunnel, diagnose, DIAGNOSTIC,
  parseEtsyAdsCSV, parseEtsyDate, parseCSVLine, proposeListingLinks,
} from './tccIntelligence.js';

const TODAY = '2026-08-17';
const live = (wentLive, extra = {}) => ({ id: 'p1', stage: 'Live', went_live_at: wentLive, ...extra });

describe('computeMaturity', () => {
  it('reports launch date missing rather than assuming anything', () => {
    const m = computeMaturity({ stage: 'Live', went_live_at: null, created_at: '2026-01-01', stage_updated_at: '2026-02-01' }, TODAY);
    expect(m.state).toBe(MATURITY.NO_LAUNCH_DATE);
    expect(m.daysLive).toBeNull();
  });

  it('walks the checkpoint ladder', () => {
    expect(computeMaturity(live('2026-08-10'), TODAY).state).toBe(MATURITY.NEW);      // 7d
    expect(computeMaturity(live('2026-07-18'), TODAY).state).toBe(MATURITY.DAY_30);   // 30d
    expect(computeMaturity(live('2026-06-18'), TODAY).state).toBe(MATURITY.DAY_60);   // 60d
    expect(computeMaturity(live('2026-05-19'), TODAY).state).toBe(MATURITY.DAY_90);   // 90d
    expect(computeMaturity(live('2026-04-19'), TODAY).state).toBe(MATURITY.MATURE);   // 120d
    expect(computeMaturity(live('2025-08-17'), TODAY).state).toBe(MATURITY.MATURE);
  });

  it('counts down to the next checkpoint', () => {
    const m = computeMaturity(live('2026-08-10'), TODAY);
    expect(m.daysLive).toBe(7);
    expect(m.nextCheckpoint).toBe(30);
    expect(m.daysToNextCheckpoint).toBe(23);
  });

  it('has no next checkpoint once mature', () => {
    expect(computeMaturity(live('2026-01-01'), TODAY).nextCheckpoint).toBeNull();
  });
});

describe('computeDoNotTouch', () => {
  it('protects a young listing in the brief\'s own words', () => {
    const r = computeDoNotTouch(live('2026-08-06'), TODAY);   // 11 days
    expect(r.doNotTouch).toBe(true);
    expect(r.reason).toContain('Live 11 days');
    expect(r.reason).toContain('30-day checkpoint');
  });

  it('releases the hold once the first checkpoint is reached', () => {
    expect(computeDoNotTouch(live('2026-07-18'), TODAY).doNotTouch).toBe(false);
  });

  it('never holds on a missing launch date — unknown age is not young', () => {
    const r = computeDoNotTouch({ stage: 'Live', went_live_at: null }, TODAY);
    expect(r.doNotTouch).toBe(false);
    expect(r.reason).toMatch(/no launch date/i);
  });

  it('ignores performance entirely — bad early numbers must not release the hold', () => {
    const terrible = live('2026-08-15', { total_sales: 0, views: 0, mo_sales: 0 });
    const fine = live('2026-08-15', { total_sales: 99, views: 5000 });
    expect(computeDoNotTouch(terrible, TODAY).doNotTouch).toBe(true);
    expect(computeDoNotTouch(fine, TODAY).doNotTouch).toBe(true);
  });
});

describe('maturityConfidenceCap', () => {
  it('gives a young or undated listing no standing at all', () => {
    expect(maturityConfidenceCap(live('2026-08-15'), TODAY)).toBe('none');
    expect(maturityConfidenceCap({ went_live_at: null }, TODAY)).toBe('none');
  });

  it('rises only with elapsed time', () => {
    expect(maturityConfidenceCap(live('2026-07-18'), TODAY)).toBe('low');     // 30d
    expect(maturityConfidenceCap(live('2026-05-19'), TODAY)).toBe('medium');  // 90d
    expect(maturityConfidenceCap(live('2026-04-19'), TODAY)).toBe('high');    // 120d
  });
});

describe('computeFunnel', () => {
  it('separates never-shown from shown-but-not-clicked', () => {
    // The distinction the whole units discipline exists to protect.
    expect(computeFunnel({ impressions: 0, visits: 0 }).clickRate).toBeNull();
    expect(computeFunnel({ impressions: 500, visits: 0 }).clickRate).toBe(0);
  });

  it('returns null rates rather than zero when the input is missing', () => {
    const f = computeFunnel({ impressions: null, visits: null, orders: null });
    expect(f.clickRate).toBeNull();
    expect(f.conversionRate).toBeNull();
  });

  it('computes real rates', () => {
    const f = computeFunnel({ impressions: 1000, visits: 20, orders: 2 });
    expect(f.clickRate).toBe(0.02);
    expect(f.conversionRate).toBe(0.1);
  });

  it('keeps the paid subset separate and never folds it into the totals', () => {
    const f = computeFunnel({ impressions: 200, visits: 10, ad_impressions: 1012, ad_clicks: 4 });
    expect(f.impressions).toBe(200);          // not 1212
    expect(f.visits).toBe(10);                // not 14
    expect(f.adImpressions).toBe(1012);
    expect(f.organicVisits).toBe(6);          // 10 total - 4 paid
  });

  it('leaves organic unknown when the paid subset is not known', () => {
    expect(computeFunnel({ impressions: 200, visits: 10 }).organicVisits).toBeNull();
  });
});

describe('diagnose', () => {
  const mature = live('2026-01-01');

  it('refuses to diagnose a listing that is too young', () => {
    const r = diagnose({ impressions: 5000, visits: 0 }, { product: live('2026-08-15'), todayStr: TODAY });
    expect(r.state).toBe(DIAGNOSTIC.INSUFFICIENT);
    expect(r.reason).toMatch(/first review checkpoint/i);
  });

  it('calls thin exposure insufficient rather than a click problem', () => {
    // 3 impressions and no clicks is an absence of evidence, not a finding.
    const r = diagnose({ impressions: 3, visits: 0 }, { product: mature, todayStr: TODAY });
    expect(r.state).toBe(DIAGNOSTIC.INSUFFICIENT);
  });

  it('flags a real click problem once exposure is genuine', () => {
    const r = diagnose({ impressions: 1000, visits: 0 }, { product: mature, todayStr: TODAY });
    expect(r.state).toBe(DIAGNOSTIC.LOW_CLICK);
  });

  it('flags conversion only once there are enough visits to read', () => {
    expect(diagnose({ impressions: 1000, visits: 5, orders: 0 }, { product: mature, todayStr: TODAY }).state)
      .toBe(DIAGNOSTIC.INSUFFICIENT);
    expect(diagnose({ impressions: 1000, visits: 40, orders: 0 }, { product: mature, todayStr: TODAY }).state)
      .toBe(DIAGNOSTIC.LOW_CONVERSION);
  });

  it('recognises a listing moving through the whole funnel', () => {
    expect(diagnose({ impressions: 1000, visits: 40, orders: 3 }, { product: mature, todayStr: TODAY }).state)
      .toBe(DIAGNOSTIC.PERFORMING);
  });
});

describe('parseEtsyDate', () => {
  it('reads Etsy\'s own format', () => {
    expect(parseEtsyDate('Aug 17, 2026')).toBe('2026-08-17');
    expect(parseEtsyDate('"Jul 4, 2026"')).toBe('2026-07-04');
  });
  it('passes through ISO and refuses anything else rather than guessing', () => {
    expect(parseEtsyDate('2026-08-17')).toBe('2026-08-17');
    expect(parseEtsyDate('17/08/2026')).toBeNull();
    expect(parseEtsyDate('')).toBeNull();
  });
});

describe('parseCSVLine', () => {
  it('respects quoted commas', () => {
    expect(parseCSVLine('"Aug 17, 2026",40,0')).toEqual(['Aug 17, 2026', '40', '0']);
  });
});

describe('parseEtsyAdsCSV', () => {
  // Etsy's real 30-day export header and real rows from Kristen's shop.
  const REAL_DAILY = `Date (ET),Views,Clicks,Orders,Revenue (USD),Spend (USD),ROAS,Click rate,Ending budget (USD)
"Jul 18, 2026",40,0,0,0,0,0,0,25
"Jul 19, 2026",59,1,0,0,0.22,0,1.7,25
"Aug 16, 2026",140,4,0,0,0.52,0,2.9,25`;

  it('parses the real daily export and renames Views to impressions', () => {
    const { rows, problems, hourly } = parseEtsyAdsCSV(REAL_DAILY);
    expect(problems).toEqual([]);
    expect(hourly).toBe(false);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ date: '2026-07-18', impressions: 40, clicks: 0, spend: 0 });
    expect(rows[2]).toMatchObject({ date: '2026-08-16', impressions: 140, clicks: 4, spend: 0.52 });
    expect(rows[0].views).toBeUndefined();   // the ambiguous word never survives
  });

  it('collapses the hourly single-day export into one daily row', () => {
    // A single-day range exports 24 hourly rows instead of one daily row.
    const hourlyCsv = `Date (ET),Hour (ET),Views,Clicks,Orders,Revenue (USD),Spend (USD),ROAS,Click rate,Ending budget (USD)
"Aug 17, 2026",12am,0,0,0,0,0,0,0,25
"Aug 17, 2026",1am,1,0,0,0,0,0,0,25
"Aug 17, 2026",2am,6,1,0,0,0.15,0,16.6,25`;
    const { rows, hourly } = parseEtsyAdsCSV(hourlyCsv);
    expect(hourly).toBe(true);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ date: '2026-08-17', impressions: 7, clicks: 1 });
  });

  it('recomputes rates rather than summing them across hours', () => {
    const hourlyCsv = `Date (ET),Hour (ET),Views,Clicks,Orders,Revenue (USD),Spend (USD),ROAS,Click rate,Ending budget (USD)
"Aug 17, 2026",1am,50,1,0,0,0,0,2,25
"Aug 17, 2026",2am,50,1,0,0,0,0,2,25`;
    const { rows } = parseEtsyAdsCSV(hourlyCsv);
    expect(rows[0].click_rate).toBe(2);   // not 4
  });

  it('rejects an unrecognised file instead of importing garbage', () => {
    const { rows, problems } = parseEtsyAdsCSV('Listing Title,Visits,Orders\nfoo,1,2');
    expect(rows).toEqual([]);
    expect(problems[0]).toMatch(/unrecognised file/i);
  });

  it('reports unparseable dates as problems rather than dropping them silently', () => {
    const bad = `Date (ET),Views,Clicks,Orders,Revenue (USD),Spend (USD),ROAS,Click rate,Ending budget (USD)
"17/08/2026",40,0,0,0,0,0,0,25`;
    const { rows, problems } = parseEtsyAdsCSV(bad);
    expect(rows).toHaveLength(0);
    expect(problems[0]).toMatch(/could not read the date/i);
  });
});

describe('proposeListingLinks', () => {
  const products = [
    { id: 'a', name: 'Hockey Mom Shirt', live_title: 'Hockey Mom Shirt, Comfort Colors Hockey Mom Tee', etsy_listing_id: null },
    { id: 'b', name: 'Morally Grey Shirt', live_title: 'Morally Grey Shirt, Bookish Shirt', etsy_listing_id: null },
    { id: 'c', name: 'Camp Mom Chaos Coordinator Tee', live_title: null, etsy_listing_id: null },
  ];

  it('proposes an exact title match', () => {
    const [p] = proposeListingLinks(
      [{ etsyListingId: '111', title: 'Hockey Mom Shirt, Comfort Colors Hockey Mom Tee' }], products);
    expect(p.confidence).toBe('exact_title');
    expect(p.match.id).toBe('a');
  });

  it('refuses to guess when two Etsy listings share a title', () => {
    // The real hazard: Kristen has two byte-identical "Morally Grey Shirt"
    // listings with very different performance.
    const props = proposeListingLinks([
      { etsyListingId: '222', title: 'Morally Grey Shirt, Bookish Shirt' },
      { etsyListingId: '333', title: 'Morally Grey Shirt, Bookish Shirt' },
    ], products);
    expect(props.every(p => p.ambiguous)).toBe(true);
    expect(props.every(p => p.match === null)).toBe(true);
  });

  it('falls back to a word-overlap suggestion, still unconfirmed', () => {
    const [p] = proposeListingLinks(
      [{ etsyListingId: '444', title: 'Chaos Coordinator, Camp Mom Shirt, Funny Graphic Tee' }], products);
    expect(p.confidence).toBe('likely');
    expect(p.match.id).toBe('c');
  });

  it('reports no match rather than forcing a bad one', () => {
    const [p] = proposeListingLinks([{ etsyListingId: '555', title: 'Completely Unrelated Widget' }], products);
    expect(p.confidence).toBe('no_match');
    expect(p.match).toBeNull();
  });

  it('skips listings that are already linked', () => {
    const [p] = proposeListingLinks(
      [{ etsyListingId: '999', title: 'Anything' }],
      [{ id: 'z', name: 'x', etsy_listing_id: '999' }]);
    expect(p.confidence).toBe('already_linked');
  });
});
