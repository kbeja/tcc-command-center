import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { nowISO } from '../lib/utils';

function fmt$(n) {
  if (!n && n !== 0) return '—';
  return '$' + Number(n).toFixed(2);
}
function fmtN(n) {
  if (!n && n !== 0) return '—';
  return Number(n).toLocaleString();
}
function pct(n) {
  if (!n && n !== 0) return '—';
  return Number(n).toFixed(1) + '%';
}

const EMPTY_FORM = {
  visits: '',
  orders: '',
  conversion_rate: '',
  revenue: '',
  item_favorites: '',
  shop_follows: '',
  reviews: '',
  repeat_buyers: '',
  cities_reached: '',
  abandoned_carts: '',
  etsy_pct: '',
  you_pct: '',
  etsy_app_visits: '',
  etsy_search_visits: '',
  etsy_marketing_visits: '',
  direct_visits: '',
  social_media_visits: '',
  etsy_ads_visits: '',
};

function numOrNull(v) {
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

function Field({ label, value, onChange, prefix, suffix }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <label style={{ fontSize: '0.68rem', color: 'var(--charcoal-soft)', fontWeight: 500 }}>{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {prefix && <span style={{ fontSize: '0.75rem', color: 'var(--charcoal-soft)' }}>{prefix}</span>}
        <input
          type="number"
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{ fontSize: '0.78rem', padding: '5px 8px', width: '100%' }}
          placeholder="—"
        />
        {suffix && <span style={{ fontSize: '0.75rem', color: 'var(--charcoal-soft)' }}>{suffix}</span>}
      </div>
    </div>
  );
}

function SnapshotCard({ snap, onDelete }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const label = snap.period_type === 'ytd' ? 'Year to Date' : 'Last 30 Days';
  const date = new Date(snap.snapshot_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div style={{ border: 'var(--border)', borderRadius: 4, background: 'var(--warm-white)', overflow: 'hidden', marginBottom: 12 }}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(43,41,38,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <span style={{ fontSize: '0.78rem', fontWeight: 600 }}>{label}</span>
          <span style={{ fontSize: '0.68rem', color: 'var(--charcoal-soft)', marginLeft: 8 }}>Saved {date}</span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {confirmDelete ? (
            <>
              <span style={{ fontSize: '0.72rem', color: 'var(--charcoal-soft)', alignSelf: 'center' }}>Delete?</span>
              <button onClick={() => onDelete(snap.id)} style={{ color: 'var(--alert)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 600 }}>Yes</button>
              <button onClick={() => setConfirmDelete(false)} style={{ color: 'var(--charcoal-soft)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.72rem' }}>Cancel</button>
            </>
          ) : (
            <button className="btn btn-ghost btn-sm" style={{ color: 'var(--alert)', fontSize: '0.68rem' }} onClick={() => setConfirmDelete(true)}>Delete</button>
          )}
        </div>
      </div>

      <div style={{ padding: '12px 14px' }}>
        {/* Main stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 14 }}>
          {[
            { label: 'Visits', value: fmtN(snap.visits) },
            { label: 'Orders', value: fmtN(snap.orders) },
            { label: 'Conv. Rate', value: snap.conversion_rate != null ? pct(snap.conversion_rate) : '—' },
            { label: 'Revenue', value: snap.revenue != null ? fmt$(snap.revenue) : '—' },
          ].map(s => (
            <div key={s.label}>
              <div style={{ fontSize: '0.6rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--charcoal-soft)', marginBottom: 3 }}>{s.label}</div>
              <div style={{ fontSize: '0.9rem', fontFamily: 'var(--font-display)' }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Shopper stats */}
        {(snap.item_favorites != null || snap.shop_follows != null || snap.reviews != null) && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: '0.6rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--charcoal-soft)', marginBottom: 6 }}>Shopper Activity</div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {[
                { label: 'Favorites', value: snap.item_favorites },
                { label: 'Follows', value: snap.shop_follows },
                { label: 'Reviews', value: snap.reviews },
                { label: 'Repeat buyers', value: snap.repeat_buyers },
                { label: 'Cities', value: snap.cities_reached },
                { label: 'Abandoned carts', value: snap.abandoned_carts },
              ].filter(s => s.value != null).map(s => (
                <div key={s.label} style={{ fontSize: '0.75rem' }}>
                  <span style={{ color: 'var(--charcoal-soft)' }}>{s.label}: </span>
                  <span style={{ fontWeight: 500 }}>{fmtN(s.value)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Traffic */}
        {(snap.etsy_pct != null || snap.you_pct != null) && (
          <div>
            <div style={{ fontSize: '0.6rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--charcoal-soft)', marginBottom: 6 }}>Traffic Sources</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: '0.72rem' }}>
              <div>
                <div style={{ color: 'var(--charcoal-soft)', marginBottom: 3 }}>Etsy brought {snap.etsy_pct != null ? pct(snap.etsy_pct) : '—'}</div>
                {[
                  { label: 'App & pages', value: snap.etsy_app_visits },
                  { label: 'Search', value: snap.etsy_search_visits },
                  { label: 'Marketing & SEO', value: snap.etsy_marketing_visits },
                ].filter(s => s.value != null).map(s => (
                  <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2, paddingLeft: 8 }}>
                    <span style={{ color: 'var(--charcoal-soft)' }}>{s.label}</span>
                    <span>{fmtN(s.value)}</span>
                  </div>
                ))}
              </div>
              <div>
                <div style={{ color: 'var(--charcoal-soft)', marginBottom: 3 }}>You brought {snap.you_pct != null ? pct(snap.you_pct) : '—'}</div>
                {[
                  { label: 'Direct & other', value: snap.direct_visits },
                  { label: 'Social media', value: snap.social_media_visits },
                  { label: 'Etsy Ads', value: snap.etsy_ads_visits },
                ].filter(s => s.value != null).map(s => (
                  <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2, paddingLeft: 8 }}>
                    <span style={{ color: 'var(--charcoal-soft)' }}>{s.label}</span>
                    <span>{fmtN(s.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function EtsyStatsEntry() {
  const [snapshots, setSnapshots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [periodType, setPeriodType] = useState('ytd');
  const [snapshotDate, setSnapshotDate] = useState(nowISO().split('T')[0]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('etsy_shop_stats')
      .select('*')
      .order('snapshot_date', { ascending: false })
      .order('period_type', { ascending: true });
    setSnapshots(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function setField(key) {
    return val => setForm(f => ({ ...f, [key]: val }));
  }

  async function handleSave() {
    setSaving(true);
    await supabase.from('etsy_shop_stats').insert({
      period_type: periodType,
      snapshot_date: snapshotDate,
      visits: numOrNull(form.visits),
      orders: numOrNull(form.orders),
      conversion_rate: numOrNull(form.conversion_rate),
      revenue: numOrNull(form.revenue),
      item_favorites: numOrNull(form.item_favorites),
      shop_follows: numOrNull(form.shop_follows),
      reviews: numOrNull(form.reviews),
      repeat_buyers: numOrNull(form.repeat_buyers),
      cities_reached: numOrNull(form.cities_reached),
      abandoned_carts: numOrNull(form.abandoned_carts),
      etsy_pct: numOrNull(form.etsy_pct),
      you_pct: numOrNull(form.you_pct),
      etsy_app_visits: numOrNull(form.etsy_app_visits),
      etsy_search_visits: numOrNull(form.etsy_search_visits),
      etsy_marketing_visits: numOrNull(form.etsy_marketing_visits),
      direct_visits: numOrNull(form.direct_visits),
      social_media_visits: numOrNull(form.social_media_visits),
      etsy_ads_visits: numOrNull(form.etsy_ads_visits),
    });
    setForm(EMPTY_FORM);
    setSaving(false);
    setAdding(false);
    load();
  }

  async function handleDelete(id) {
    await supabase.from('etsy_shop_stats').delete().eq('id', id);
    setSnapshots(prev => prev.filter(s => s.id !== id));
  }

  // Group snapshots by date for display
  const byDate = {};
  for (const s of snapshots) {
    if (!byDate[s.snapshot_date]) byDate[s.snapshot_date] = [];
    byDate[s.snapshot_date].push(s);
  }
  const sortedDates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: '0.78rem', color: 'var(--charcoal-soft)' }}>
            Enter Etsy stats manually on the 1st of each month — tracks both year-to-date and last 30 days.
          </div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setAdding(!adding)}>
          {adding ? 'Cancel' : '+ Log Stats'}
        </button>
      </div>

      {/* Entry form */}
      {adding && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 0, borderRadius: 4, border: 'var(--border)', overflow: 'hidden' }}>
              {[['ytd', 'Year to Date'], ['last_30', 'Last 30 Days']].map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setPeriodType(val)}
                  style={{
                    padding: '5px 12px', fontSize: '0.75rem', border: 'none', cursor: 'pointer',
                    background: periodType === val ? 'var(--dusty-rose)' : 'transparent',
                    color: periodType === val ? '#fff' : 'var(--charcoal)',
                    fontWeight: periodType === val ? 600 : 400,
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '0.75rem' }}>
              <label style={{ color: 'var(--charcoal-soft)' }}>Snapshot date</label>
              <input
                type="date"
                value={snapshotDate}
                onChange={e => setSnapshotDate(e.target.value)}
                style={{ fontSize: '0.75rem', padding: '4px 8px' }}
              />
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--charcoal-soft)', marginBottom: 8 }}>Stats</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
              <Field label="Visits" value={form.visits} onChange={setField('visits')} />
              <Field label="Orders" value={form.orders} onChange={setField('orders')} />
              <Field label="Conversion Rate (%)" value={form.conversion_rate} onChange={setField('conversion_rate')} suffix="%" />
              <Field label="Revenue ($)" value={form.revenue} onChange={setField('revenue')} prefix="$" />
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--charcoal-soft)', marginBottom: 8 }}>Shopper Stats</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              <Field label="Item Favorites" value={form.item_favorites} onChange={setField('item_favorites')} />
              <Field label="Shop Follows" value={form.shop_follows} onChange={setField('shop_follows')} />
              <Field label="Reviews" value={form.reviews} onChange={setField('reviews')} />
              <Field label="Repeat Buyers" value={form.repeat_buyers} onChange={setField('repeat_buyers')} />
              <Field label="Cities Reached" value={form.cities_reached} onChange={setField('cities_reached')} />
              <Field label="Abandoned Carts" value={form.abandoned_carts} onChange={setField('abandoned_carts')} />
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--charcoal-soft)', marginBottom: 8 }}>Traffic Sources</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <div style={{ fontSize: '0.68rem', color: 'var(--charcoal-soft)', marginBottom: 8 }}>Etsy brought (% of visits)</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <Field label="Etsy % total" value={form.etsy_pct} onChange={setField('etsy_pct')} suffix="%" />
                  <Field label="App & Etsy pages (visits)" value={form.etsy_app_visits} onChange={setField('etsy_app_visits')} />
                  <Field label="Etsy Search (visits)" value={form.etsy_search_visits} onChange={setField('etsy_search_visits')} />
                  <Field label="Marketing & SEO (visits)" value={form.etsy_marketing_visits} onChange={setField('etsy_marketing_visits')} />
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.68rem', color: 'var(--charcoal-soft)', marginBottom: 8 }}>You brought (% of visits)</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <Field label="You % total" value={form.you_pct} onChange={setField('you_pct')} suffix="%" />
                  <Field label="Direct & other (visits)" value={form.direct_visits} onChange={setField('direct_visits')} />
                  <Field label="Social Media (visits)" value={form.social_media_visits} onChange={setField('social_media_visits')} />
                  <Field label="Etsy Ads (visits)" value={form.etsy_ads_visits} onChange={setField('etsy_ads_visits')} />
                </div>
              </div>
            </div>
          </div>

          <button
            className="btn btn-primary btn-sm"
            onClick={handleSave}
            disabled={saving || (!form.visits && !form.orders && !form.revenue)}
          >
            {saving ? 'Saving…' : 'Save Snapshot'}
          </button>
        </div>
      )}

      {/* Snapshot history */}
      {loading && <div style={{ color: 'var(--charcoal-soft)', fontSize: '0.85rem' }}>Loading…</div>}

      {!loading && snapshots.length === 0 && (
        <div className="empty-state">
          <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>📊</div>
          <p>No stats logged yet. Hit "Log Stats" on the 1st of each month to start tracking.</p>
        </div>
      )}

      {!loading && sortedDates.map(date => {
        const displayDate = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        const snaps = byDate[date];
        return (
          <div key={date} style={{ marginBottom: 24 }}>
            <div className="section-label" style={{ marginBottom: 10 }}>{displayDate}</div>
            {snaps.map(s => (
              <SnapshotCard key={s.id} snap={s} onDelete={handleDelete} />
            ))}
          </div>
        );
      })}
    </div>
  );
}
