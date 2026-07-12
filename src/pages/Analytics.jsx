import { useState, useMemo } from 'react';
import { useProducts } from '../lib/hooks';
import { useNavigate } from 'react-router-dom';
import GoalCalculator from '../components/GoalCalculator';
import EtsyCSVImport from '../components/EtsyCSVImport';
import PinterestCSVImport from '../components/PinterestCSVImport';
import EverbeeCSVImport from '../components/EverbeeCSVImport';
import WeeklyReview from '../components/WeeklyReview';

const PRINTIFY_COST_DEFAULT = 14; // fallback if no cost set

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

function listingStatus(p) {
  if ((p.mo_sales || 0) > 0) return { label: '✓', title: 'Has sales' };
  if ((p.ad_spend || 0) > 0) return { label: '⚑ Ads', title: 'Ad campaign active' };
  if ((p.views || 0) === 0 && (p.mo_sales || 0) === 0) return { label: 'SEO', title: '0 views — discoverability problem' };
  return { label: 'Review', title: '0 sales — worth investigating' };
}

export default function Analytics() {
  const { products, loading, refetch } = useProducts();
  const navigate = useNavigate();
  const [tab, setTab] = useState('overview');
  const [collectionFilter, setCollectionFilter] = useState('');
  const [sortCol, setSortCol] = useState('mo_revenue');
  const [sortDir, setSortDir] = useState('desc');

  const live = products.filter(p => p.stage === 'Live' || p.stage === 'Reviewing');
  const inProgress = products.filter(p => !['Live', 'Reviewing', 'Paused', 'Killed'].includes(p.stage));

  // Shop totals
  const totalOrders = live.reduce((s, p) => s + (p.total_sales || 0), 0);
  const totalRevenue = live.reduce((s, p) => s + (p.mo_revenue || 0), 0);
  const totalMoSales = live.reduce((s, p) => s + (p.mo_sales || 0), 0);
  const totalMoRevenue = live.reduce((s, p) => s + (p.mo_revenue || 0), 0);
  const avgOrderValue = totalOrders > 0 ? (live.reduce((s, p) => s + ((p.mo_revenue || 0)), 0) / Math.max(totalMoSales, 1)) : null;
  const conversionRate = live.reduce((s, p) => s + (p.conversion_rate || 0), 0) / Math.max(live.filter(p => p.conversion_rate).length, 1);

  // Profit estimates
  const totalMoProfit = live.reduce((s, p) => {
    if (p.printify_cost && p.mo_sales) return s + (p.mo_revenue || 0) - (p.printify_cost * p.mo_sales);
    return s;
  }, 0);
  const hasCostData = live.some(p => p.printify_cost);

  // Collections
  const collections = [...new Set(live.map(p => p.collection).filter(Boolean))];
  const collectionStats = collections.map(col => {
    const items = live.filter(p => p.collection === col);
    return {
      name: col,
      count: items.length,
      orders: items.reduce((s, p) => s + (p.mo_sales || 0), 0),
      revenue: items.reduce((s, p) => s + (p.mo_revenue || 0), 0),
    };
  }).sort((a, b) => b.revenue - a.revenue);

  // Listing table
  const tableListings = useMemo(() => {
    let list = [...live];
    if (collectionFilter) list = list.filter(p => p.collection === collectionFilter);
    list.sort((a, b) => {
      const av = a[sortCol] || 0, bv = b[sortCol] || 0;
      return sortDir === 'desc' ? bv - av : av - bv;
    });
    return list;
  }, [live, collectionFilter, sortCol, sortDir]);

  function toggleSort(col) {
    if (sortCol === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortCol(col); setSortDir('desc'); }
  }

  // Needs attention
  const attention = [];
  live.forEach(p => {
    if ((p.ad_spend || 0) > 0 && (p.mo_sales || 0) === 0) {
      attention.push({ icon: '⚑', text: `${p.name} — ads running with 0 sales`, id: p.id });
    }
    if ((p.total_sales || 0) === 0 && (p.views || 0) > 10) {
      attention.push({ icon: '📊', text: `${p.name} — ${p.views} views, 0 sales — consider SEO audit`, id: p.id });
    }
    if ((p.views || 0) === 0) {
      attention.push({ icon: '📊', text: `${p.name} — 0 views, possible indexing issue`, id: p.id });
    }
  });

  const SortArrow = ({ col }) => sortCol === col
    ? <span style={{ opacity: 0.6 }}>{sortDir === 'desc' ? ' ↓' : ' ↑'}</span>
    : <span style={{ opacity: 0.2 }}> ↕</span>;

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title">Analytics</div>
        <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
          {['overview', 'goals', 'import', 'weekly'].map(t => (
            <button
              key={t}
              className={`btn btn-sm ${tab === t ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setTab(t)}
            >
              {{ overview: 'Overview', goals: 'Goals', import: 'Import Data', weekly: 'Weekly Review' }[t]}
            </button>
          ))}
        </div>
      </div>

      {loading && <div style={{ color: 'var(--charcoal-soft)', fontSize: '0.85rem' }}>Loading…</div>}

      {/* ── OVERVIEW TAB ── */}
      {tab === 'overview' && !loading && (
        <div>
          {/* Shop Overview */}
          <div className="section-label" style={{ marginBottom: 10 }}>Shop Overview</div>
          <div style={{ border: 'var(--border)', borderRadius: 2, padding: '16px', marginBottom: 24 }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--charcoal-soft)', marginBottom: 12 }}>
              THE CURRENT CHAPTER
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--charcoal-soft)', marginBottom: 16 }}>
              {live.length} live · {inProgress.length} in progress
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <div className="eyebrow" style={{ marginBottom: 8 }}>This month</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                    <span style={{ color: 'var(--charcoal-soft)' }}>Orders</span>
                    <span style={{ fontWeight: 500 }}>{fmtN(totalMoSales) || '—'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                    <span style={{ color: 'var(--charcoal-soft)' }}>Revenue</span>
                    <span style={{ fontWeight: 500 }}>{fmt$(totalMoRevenue) || '—'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                    <span style={{ color: 'var(--charcoal-soft)' }}>Est. profit</span>
                    <span style={{ fontWeight: 500 }}>{hasCostData ? fmt$(totalMoProfit) : '—'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                    <span style={{ color: 'var(--charcoal-soft)' }}>Conversion</span>
                    <span style={{ fontWeight: 500 }}>{pct(conversionRate)}</span>
                  </div>
                </div>
              </div>
              <div>
                <div className="eyebrow" style={{ marginBottom: 8 }}>All time</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                    <span style={{ color: 'var(--charcoal-soft)' }}>Orders</span>
                    <span style={{ fontWeight: 500 }}>{fmtN(totalOrders)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                    <span style={{ color: 'var(--charcoal-soft)' }}>Revenue</span>
                    <span style={{ fontWeight: 500 }}>{fmt$(live.reduce((s, p) => s + (p.mo_revenue || 0), 0))}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                    <span style={{ color: 'var(--charcoal-soft)' }}>Est. profit</span>
                    <span style={{ fontWeight: 500 }}>—</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                    <span style={{ color: 'var(--charcoal-soft)' }}>Avg order</span>
                    <span style={{ fontWeight: 500 }}>{avgOrderValue ? fmt$(avgOrderValue) : '—'}</span>
                  </div>
                </div>
              </div>
            </div>
            {!hasCostData && (
              <div style={{ fontSize: '0.7rem', color: 'var(--charcoal-soft)', marginTop: 12, opacity: 0.7 }}>
                Add Printify cost to products to see profit estimates
              </div>
            )}
          </div>

          {/* Collection Performance */}
          <div className="section-label" style={{ marginBottom: 10 }}>Collection Performance</div>
          <div style={{ marginBottom: 24, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {collectionStats.length === 0 && (
              <div style={{ fontSize: '0.82rem', color: 'var(--charcoal-soft)' }}>No collection data yet.</div>
            )}
            {collectionStats.map(col => (
              <button
                key={col.name}
                onClick={() => setCollectionFilter(collectionFilter === col.name ? '' : col.name)}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '10px 14px', border: 'var(--border)', borderRadius: 2,
                  background: collectionFilter === col.name ? 'var(--rose-faint)' : 'var(--warm-white)',
                  cursor: 'pointer', textAlign: 'left',
                  borderLeft: collectionFilter === col.name ? '3px solid var(--dusty-rose)' : 'var(--border)',
                }}
              >
                <div>
                  <div style={{ fontWeight: 500, fontSize: '0.82rem' }}>{col.name}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--charcoal-soft)', marginTop: 2 }}>
                    {col.count} listing{col.count !== 1 ? 's' : ''} · {col.orders} order{col.orders !== 1 ? 's' : ''}
                  </div>
                </div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem' }}>
                  {col.revenue > 0 ? fmt$(col.revenue) : '—'}
                </div>
              </button>
            ))}
          </div>

          {/* Listing Table */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div className="section-label" style={{ margin: 0 }}>
              {collectionFilter ? `${collectionFilter} — ` : ''}Listings
            </div>
            {collectionFilter && (
              <button className="btn btn-ghost btn-sm" onClick={() => setCollectionFilter('')}>Clear filter</button>
            )}
          </div>

          <div style={{ overflowX: 'auto', marginBottom: 24 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(43,41,38,0.12)' }}>
                  <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 500, color: 'var(--charcoal-soft)' }}>Listing</th>
                  {[
                    { key: 'views', label: 'Views' },
                    { key: 'mo_sales', label: 'Orders' },
                    { key: 'mo_revenue', label: 'Revenue' },
                    { key: 'conversion_rate', label: 'Conv%' },
                  ].map(({ key, label }) => (
                    <th
                      key={key}
                      onClick={() => toggleSort(key)}
                      style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 500, color: 'var(--charcoal-soft)', cursor: 'pointer', whiteSpace: 'nowrap' }}
                    >
                      {label}<SortArrow col={key} />
                    </th>
                  ))}
                  <th style={{ textAlign: 'center', padding: '6px 8px', fontWeight: 500, color: 'var(--charcoal-soft)' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {tableListings.map(p => {
                  const status = listingStatus(p);
                  return (
                    <tr
                      key={p.id}
                      onClick={() => navigate(`/products/${p.id}`)}
                      style={{ borderBottom: '1px solid rgba(43,41,38,0.06)', cursor: 'pointer' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--charcoal-faint)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <td style={{ padding: '8px 8px', maxWidth: 180 }}>
                        <div style={{ fontWeight: 400, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                        {p.collection && <div style={{ fontSize: '0.65rem', color: 'var(--charcoal-soft)', marginTop: 2 }}>{p.collection}</div>}
                      </td>
                      <td style={{ textAlign: 'right', padding: '8px 8px', color: 'var(--charcoal-soft)' }}>{fmtN(p.views)}</td>
                      <td style={{ textAlign: 'right', padding: '8px 8px', color: 'var(--charcoal-soft)' }}>{fmtN(p.mo_sales)}</td>
                      <td style={{ textAlign: 'right', padding: '8px 8px', fontWeight: (p.mo_revenue || 0) > 0 ? 500 : 400 }}>{fmt$(p.mo_revenue)}</td>
                      <td style={{ textAlign: 'right', padding: '8px 8px', color: 'var(--charcoal-soft)' }}>{pct(p.conversion_rate)}</td>
                      <td style={{ textAlign: 'center', padding: '8px 8px' }}>
                        <span title={status.title} style={{
                          fontSize: '0.65rem', fontWeight: 500, padding: '2px 6px', borderRadius: 20,
                          background: status.label === '✓' ? 'rgba(124,175,138,0.15)' : status.label === 'SEO' ? 'rgba(201,123,123,0.15)' : 'rgba(232,168,124,0.15)',
                          color: status.label === '✓' ? '#2d6b3c' : status.label === 'SEO' ? '#7a2b2b' : '#7a4a1e',
                        }}>
                          {status.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {tableListings.length === 0 && (
              <div style={{ textAlign: 'center', padding: '20px', color: 'var(--charcoal-soft)', fontSize: '0.82rem' }}>
                No listings match the current filter.
              </div>
            )}
          </div>

          {/* Needs Attention */}
          {attention.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div className="section-label" style={{ marginBottom: 10 }}>Needs Your Attention</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {attention.map((a, i) => (
                  <div
                    key={i}
                    onClick={() => a.id && navigate(`/products/${a.id}`)}
                    style={{
                      display: 'flex', gap: 10, alignItems: 'flex-start',
                      padding: '10px 14px', border: 'var(--border)', borderRadius: 2,
                      background: 'var(--warm-white)', cursor: a.id ? 'pointer' : 'default',
                      fontSize: '0.8rem',
                    }}
                  >
                    <span>{a.icon}</span>
                    <span>{a.text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── GOALS TAB ── */}
      {tab === 'goals' && !loading && (
        <GoalCalculator
          liveProducts={live}
          totalMoRevenue={totalMoRevenue}
          totalMoSales={totalMoSales}
          avgOrderValue={avgOrderValue}
          conversionRate={conversionRate}
        />
      )}

      {/* ── IMPORT TAB ── */}
      {tab === 'import' && (
        <div>
          <div style={{ marginBottom: 32 }}>
            <EverbeeCSVImport products={products} onImported={refetch} />
          </div>
          <div style={{ borderTop: 'var(--border)', paddingTop: 24, marginBottom: 32 }}>
            <EtsyCSVImport products={products} onImported={refetch} />
          </div>
          <div style={{ borderTop: 'var(--border)', paddingTop: 24 }}>
            <PinterestCSVImport products={products} onImported={refetch} />
          </div>
        </div>
      )}

      {/* ── WEEKLY REVIEW TAB ── */}
      {tab === 'weekly' && (
        <WeeklyReview onApplied={refetch} />
      )}
    </div>
  );
}
