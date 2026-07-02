export const seasonalWindows = [
  { name: 'Back to School', opens: '2026-08-01', peaks: '2026-08-20', collections: ['Kids Chapter', 'Tween Chapter', 'Mom Chapter'] },
  { name: 'Holiday', opens: '2026-10-01', peaks: '2026-12-01', collections: ['All'] },
  { name: "Father's Day", opens: '2027-05-01', peaks: '2027-06-10', collections: ['Dad Collection'] },
  { name: "Mother's Day", opens: '2027-04-01', peaks: '2027-05-08', collections: ['Mom Chapter'] },
];

export function daysBetween(a, b) {
  const da = new Date(a);
  const db = new Date(b);
  return Math.round((db - da) / (1000 * 60 * 60 * 24));
}

export function today() {
  return new Date().toISOString().split('T')[0];
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
