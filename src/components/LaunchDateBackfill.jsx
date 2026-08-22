import { useState, useMemo } from 'react';
import { updateProduct } from '../lib/hooks';

// ─── Launch Date Backfill ──────────────────────────────────────────────────
// One screen for entering the launch dates of listings that went live BEFORE
// this dashboard existed, instead of nineteen separate visits to nineteen
// Product Workspace pages.
//
// Why this is hand-entry and not a backfill: 18 of the shop's live products
// were bulk-imported from the old system in a single write on 2026-07-03, so
// their created_at/stage_updated_at record when the ROW arrived, not when the
// LISTING launched. Their real dates exist only in Etsy Shop Manager. See
// supabase/migrations/20260822_backfill_went_live_at.sql for the full
// reasoning — the short version is that guessing here would manufacture
// confident wrong dates that every checkpoint and performance comparison
// downstream would then be silently anchored to.
//
// This panel disappears on its own once every live listing has a date. It is
// deliberately not dismissible: the checkpoint clock, funnel diagnosis and all
// portfolio comparison stay dark for any listing missing one, so a hidden
// reminder would just quietly cost real analysis later.

// The row's created_at is a genuine upper bound on the launch date — a listing
// cannot have gone live after the day it was already being catalogued. Used as
// a soft warning, never a block: Kristen knows the actual history and the
// heuristic does not.
function upperBound(product) {
  return (product.created_at || '').slice(0, 10) || null;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function LaunchDateBackfill({ products, onSaved }) {
  const missing = useMemo(() => (products || [])
    .filter(p => p.stage === 'Live' && !p.went_live_at)
    .sort((a, b) => (a.collection || '').localeCompare(b.collection || '') || a.name.localeCompare(b.name)),
    [products]);

  const [open, setOpen] = useState(false);
  const [dates, setDates] = useState({});
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState('');

  if (!missing.length) return null;

  const entered = Object.entries(dates).filter(([, v]) => v);

  async function handleSave() {
    if (!entered.length) return;
    setSaving(true);
    setResult('');
    // Sequential rather than Promise.all: nineteen parallel PATCHes against
    // one table for no latency benefit at this size, and a partial failure is
    // far easier to report honestly when the count is exact.
    let saved = 0;
    let failedName = null;
    for (const [id, went_live_at] of entered) {
      const { error } = await updateProduct(id, { went_live_at });
      if (error) { failedName = missing.find(p => p.id === id)?.name || id; break; }
      saved++;
    }
    setSaving(false);
    setResult(failedName
      ? `Saved ${saved}, then failed on "${failedName}". The rest are unsaved — fix and try again.`
      : `Saved ${saved} launch date${saved !== 1 ? 's' : ''}.`);
    setDates({});
    onSaved?.();
  }

  return (
    <div style={{
      border: '1px solid rgba(232,168,124,0.45)', background: 'rgba(232,168,124,0.09)',
      borderRadius: 3, padding: '12px 14px', marginBottom: 16,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#7a4a1e' }}>
            {missing.length} live listing{missing.length !== 1 ? 's' : ''} without a launch date
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--charcoal-soft)', marginTop: 3, maxWidth: 640, lineHeight: 1.5 }}>
            These went live before the dashboard existed, so the real dates are only in Etsy Shop Manager.
            Until each has one, its 30/60/90/120 checkpoints, funnel diagnosis and portfolio comparisons
            can&rsquo;t run.
          </div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setOpen(v => !v)}>
          {open ? 'Close' : 'Add dates'}
        </button>
      </div>

      {result && (
        <div style={{ fontSize: '0.75rem', marginTop: 8, color: result.startsWith('Saved') && !result.includes('failed') ? '#2d6b3c' : '#7a2b2b' }}>
          {result}
        </div>
      )}

      {open && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--charcoal-soft)', marginBottom: 8 }}>
            In Etsy Shop Manager, sort your listings by oldest first — the order should roughly match this list.
            Leave any you&rsquo;re unsure of blank; you can come back.
          </div>

          <div style={{ display: 'grid', gap: 6 }}>
            {missing.map(p => {
              const max = upperBound(p);
              const val = dates[p.id] || '';
              // Warn rather than block — see upperBound()'s note.
              const suspect = val && max && val > max;
              return (
                <div key={p.id} style={{
                  display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 10,
                  alignItems: 'center', padding: '6px 8px', background: 'var(--warm-white)',
                  border: '1px solid rgba(43,41,38,0.08)', borderRadius: 2,
                }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '0.78rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.name}
                    </div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--charcoal-soft)', marginTop: 1 }}>
                      {p.collection || 'No collection'}
                      {max && ` · in the app since ${max}`}
                      {suspect && (
                        <span style={{ color: '#7a2b2b' }}>
                          {' '}· later than that — check it&rsquo;s right
                        </span>
                      )}
                    </div>
                  </div>
                  <input
                    type="date"
                    value={val}
                    max={todayStr()}
                    onChange={e => setDates(d => ({ ...d, [p.id]: e.target.value }))}
                    style={{ fontSize: '0.75rem', padding: '3px 6px', width: 150 }}
                  />
                </div>
              );
            })}
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10 }}>
            <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving || !entered.length}>
              {saving ? 'Saving…' : entered.length ? `Save ${entered.length} date${entered.length !== 1 ? 's' : ''}` : 'Save dates'}
            </button>
            {!!entered.length && (
              <button className="btn btn-ghost btn-sm" onClick={() => setDates({})} disabled={saving}>Clear</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
