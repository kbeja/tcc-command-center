// The `seasonalWindows` constant that used to live here was removed in Phase
// 22. It held four hardcoded windows with absolute one-off dates
// (2026-08-01, 2027-05-08, ...) — no recurrence, no source attribution, no
// research/design/build phases — and although Home.jsx imported it, nothing
// in the app ever read it. Real seasonal windows are now persisted,
// recurring and source-attributed: see supabase/migrations/
// 20260820_timing_intelligence_phase22.sql and src/lib/timingIntelligence.js.
//
// The date helpers below are unrelated and very much alive — they are the
// shared UTC day-math used by hooks.js, ProductWorkspace, ReviewCheckpoints,
// listingReviews.js and the timing engine.

import { nowISO } from '../lib/utils';

export function daysBetween(a, b) {
  const da = new Date(a);
  const db = new Date(b);
  return Math.round((db - da) / (1000 * 60 * 60 * 24));
}

export function today() {
  return nowISO().split('T')[0];
}

export function getNextSaturday(fromDate = new Date()) {
  const d = new Date(fromDate);
  const day = d.getDay();
  const daysUntilSat = (6 - day + 7) % 7 || 7;
  d.setDate(d.getDate() + daysUntilSat);
  return d;
}

export function isFirstSaturday(date) {
  const d = new Date(date);
  return d.getDay() === 6 && d.getDate() <= 7;
}

export function getNextReviewDates() {
  const nextSat = getNextSaturday();
  const monthly = isFirstSaturday(nextSat);
  const daysAway = daysBetween(today(), nextSat.toISOString().split('T')[0]);
  return {
    nextDate: nextSat.toISOString().split('T')[0],
    isBiweekly: true,
    isMonthly: monthly,
    daysAway,
  };
}
