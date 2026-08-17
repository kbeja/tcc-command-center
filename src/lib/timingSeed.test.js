// Phase 22 — seed/engine integration check.
//
// Unlike timingIntelligence.test.js (which tests the engine against
// hand-written fixtures), this reads the ACTUAL seed migration Kristen runs
// and pushes all 186 real guidance rows through the real engine. It exists
// because the two can drift apart silently: a transcription fix or a change
// to how cycles resolve would still pass every unit test while producing
// nonsense on the shipped data.
//
// The assertions are deliberately about SHAPE and known-correct spot cases,
// not about exact state counts — those legitimately change as the calendar
// year advances, and a test that has to be edited every month is a test
// nobody trusts. TODAY is pinned for the same reason.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import { computeTimingState, TIMING_STATES } from './timingIntelligence.js';

const SEED = 'supabase/migrations/20260820_taylor_niche_calendar_v4_seed.sql';
const TODAY = '2026-08-17';

const SOURCE = { id: 'taylor', name: 'Taylor POD Niche Calendar', version: '4.0', source_type: 'expert_guidance' };

// Parses the migration's own VALUES rows back into the row shape the app
// reads from Supabase, so this really is the shipped data and not a copy.
function loadSeedRows() {
  const sql = fs.readFileSync(SEED, 'utf8');
  const block = sql
    .split('AS v(niche, label, state, month, day, precision, classification, symbol)')[0]
    .split('FROM (VALUES')[1];
  const re = /\(\s*'((?:[^']|'')*)'(?:::text)?,\s*'((?:[^']|'')*)'(?:::text)?,\s*'([A-Z]+)'(?:::text)?,\s*(\d+|NULL)(?:::integer)?,\s*(\d+|NULL)(?:::integer)?,\s*'(\w+)'(?:::text)?,\s*(?:'(\w+)'|NULL)(?:::text)?,\s*(?:'(.*?)'|NULL)(?:::text)?\)/g;
  const rows = [];
  let m;
  while ((m = re.exec(block))) {
    const [, niche, label, state, month, day, precision, classification, symbol] = m;
    rows.push({
      source_id: SOURCE.id, timing_sources: SOURCE,
      niche_id: niche.replace(/''/g, "'"),
      source_niche_label: label.replace(/''/g, "'"),
      guidance_state: state,
      month: month === 'NULL' ? null : Number(month),
      day: day === 'NULL' ? null : Number(day),
      date_precision: precision,
      classification: classification || null,
      classification_symbol: symbol || null,
      evidence_type: 'expert_guidance',
    });
  }
  return rows;
}

function byNiche(rows) {
  const map = new Map();
  for (const r of rows) {
    const list = map.get(r.niche_id) || [];
    list.push(r);
    map.set(r.niche_id, list);
  }
  return map;
}

const rows = loadSeedRows();
const grouped = byNiche(rows);
const stateFor = name => computeTimingState({ guidance: grouped.get(name), todayStr: TODAY });

describe('Taylor calendar seed', () => {
  it('parses the expected volume of transcribed evidence', () => {
    expect(rows.length).toBe(186);
    expect(grouped.size).toBe(69);
  });

  it('produces a real state and a real explanation for every niche', () => {
    for (const [name, guidance] of grouped) {
      const t = computeTimingState({ guidance, todayStr: TODAY });
      expect(Object.values(TIMING_STATES), `${name} produced an unknown state value`).toContain(t.state);
      expect(t.reason, `${name} produced no explanation`).toBeTruthy();
    }
  });

  it('never lands on UNKNOWN for a niche that has a dated target', () => {
    for (const [name, guidance] of grouped) {
      const hasDatedDue = guidance.some(g => g.guidance_state === 'DUE' && g.day);
      if (!hasDatedDue) continue;
      expect(stateFor(name).state, `${name} has a dated DUE but resolved to UNKNOWN`)
        .not.toBe(TIMING_STATES.UNKNOWN);
    }
  });
});

describe('Taylor calendar seed — known-correct cases', () => {
  // Each of these is checked against what the calendar actually prints, so a
  // failure means either the transcription or the engine has moved.

  it('places a niche inside its CONTINUE month in development', () => {
    // Halloween: START July, CONTINUE August, DUE September 30.
    const t = stateFor('Halloween');
    expect(t.state).toBe(TIMING_STATES.IN_DEVELOPMENT);
    expect(t.targetLiveDate).toBe('2026-09-30');
  });

  it('places a niche inside its START month in research', () => {
    // Christmas: START August, DUE November 22.
    const t = stateFor('Christmas');
    expect(t.state).toBe(TIMING_STATES.RESEARCH_NOW);
    expect(t.targetLiveDate).toBe('2026-11-22');
  });

  it('holds a niche whose runway has not opened yet', () => {
    // Winter Sports: START September — one month away from the pinned date.
    const t = stateFor('Winter Sports');
    expect(t.state).toBe(TIMING_STATES.TOO_EARLY_WATCH);
    expect(t.targetLiveDate).toBe('2026-11-08');
  });

  it('resolves the year-wrapping cycle to the correct calendar year', () => {
    // Bachelorette: START December, CONTINUE January-August, DUE September 5.
    // August belongs to a cycle that began the PREVIOUS December.
    const t = stateFor('Bachelorette');
    expect(t.state).toBe(TIMING_STATES.IN_DEVELOPMENT);
    expect(t.targetLiveDate).toBe('2026-09-05');
  });

  it('reports a just-passed target as a late window, not as next year', () => {
    // Back to School: DUE July 15, i.e. a month before the pinned date.
    const t = stateFor('Back to School');
    expect(t.state).toBe(TIMING_STATES.LATE_WINDOW);
    expect(t.targetLiveDate).toBe('2026-07-15');
    expect(t.daysPastTarget).toBeGreaterThan(0);
    expect(t.nextCycleTarget).toBe('2027-07-15');
  });

  it('leaves a START-only niche unknown rather than inventing a target', () => {
    // Hobbies appears in April's START column and in no DUE column anywhere.
    const t = stateFor('Hobbies');
    expect(t.state).toBe(TIMING_STATES.UNKNOWN);
    expect(t.targetLiveDate).toBeNull();
    expect(t.unknowns).toContain('target live date');
  });

  it('handles the one DUE entry the source prints without a date', () => {
    // Gender Reveal is listed in September's DUE column but has no date in
    // that month's grid. It is also classified evergreen, so it falls back to
    // the evergreen baseline rather than to a fabricated window.
    const t = stateFor('Gender Reveal');
    expect(t.targetLiveDate).toBeNull();
    expect(t.state).toBe(TIMING_STATES.EVERGREEN_WATCH);
    expect(t.unknowns.join(' ')).toMatch(/month only/i);
  });

  it('keeps a self-contradicting classification intact rather than picking one', () => {
    // Girls Trip is printed low-competition in January and December,
    // emotion-based in February and March.
    const values = new Set(stateFor('Girls Trip').classifications.map(c => c.value));
    expect(values.has('low_competition')).toBe(true);
    expect(values.has('emotion_based')).toBe(true);
  });

  it('preserves both printed spellings of a niche recorded under one id', () => {
    const labels = new Set(grouped.get('Birthday Themes').map(r => r.source_niche_label));
    expect(labels.has('Birthday Themes')).toBe(true);
    expect(labels.has('Birthday Theme')).toBe(true);
  });

  it('never reports peak or close dates as known, because no source has them', () => {
    for (const [, guidance] of grouped) {
      const t = computeTimingState({ guidance, todayStr: TODAY });
      expect(t.unknowns).toContain('demand peak date');
      expect(t.unknowns).toContain('window close date');
    }
  });
});
