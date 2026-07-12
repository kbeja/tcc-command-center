import { useState, useMemo } from 'react';
import { useProducts, useCompetitorListings } from '../lib/hooks';
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

function CompetitorsTab({ listings, loading }) {
  const [sortCol, setSortCol] = useState('est_sales');
  const [sortDir, setSortDir] = useState('desc');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [whiteSpaceOnly, setWhiteSpaceOnly] = useState(false);
  const [expandedId, setExpandedId] = useState(null);

  if (loading) return <div style={{ color: 'var(--charcoal-soft)', fontSize: '0.85rem' }}>Loading…</div>;
  if (listings.length === 0) return <div className="empty-state"><p>No competitor data yet. Import an Everbee listing export to get started.</p></div>;

  // ── Tag frequency analysis ──
  const tagCounts = {};
  for (const l of listings) {
    for (let i = 1; i <= 13; i++) {
      const tag = l[`tag_${i}`];
      if (tag && tag.trim()) {
        const t = tag.trim().toLowerCase();
        tagCounts[t] = (tagCounts[t] || 0) + 1;
      }
    }
  }
  const topTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 15);

  // ── Shop dominance ──
  const shopCounts = {};
  for (const l of listings) {
    if (l.shop_name) shopCounts[l.shop_name] = (shopCounts[l.shop_name] || 0) + 1;
  }
  const topShops = Object.entries(shopCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

  // ── Summary stats ──
  const withSales = listings.filter(l => l.est_sales > 0);
  const avgEstSales = withSales.length ? Math.round(withSales.reduce((s, l) => s + l.est_sales, 0) / withSales.length) : 0;
  const avgPrice = listings.filter(l => l.price).length
    ? (listings.filter(l => l.price).reduce((s, l) => s + l.price, 0) / listings.filter(l => l.price).length).toFixed(2)
    : null;
  const whiteSpaceCount = listings.filter(l => l.white_space_flag).length;

  // ── Categories ──
  const categories = [...new Set(listings.map(l => l.category).filter(Boolean))];

  // ── Filtered + sorted table ──
  const filtered = listings
    .filter(l => !categoryFilter || l.category === categoryFilter)
    .filter(l => !whiteSpaceOnly || l.white_space_flag)
    .sort((a, b) => {
      const av = a[sortCol] ?? 0, bv = b[sortCol] ?? 0;
      return sortDir === 'desc' ? bv - av : av - bv;
    });

  function toggleSort(col) {
    if (sortCol === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortCol(col); setSortDir('desc'); }
  }

  const SortArrow = ({ col }) => sortCol === col
    ? <span style={{ opacity: 0.6 }}>{sortDir === 'desc' ? ' ↓' : ' ↑'}</span>
    : <span style={{ opacity: 0.2 }}> ↕</span>;

  return (
    <div>
      {/* Summary stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 24 }}>
        {[
          { label: 'Total tracked', value: listings.length },
          { label: 'Avg est. sales', value: avgEstSales },
          { label: 'Avg price', value: avgPrice ? `$${avgPrice}` : '—' },
          { label: 'White-space flags', value: whiteSpaceCount },
        ].map(s => (
          <div key={s.label} style={{ border: 'var(--border)', borderRadius: 2, padding: '12px 14px', background: 'var(--warm-white)' }}>
            <div style={{ fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--charcoal-soft)', marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem' }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Top tags */}
      <div className="section-label" style={{ marginBottom: 10 }}>Most Used Tags Across Competitors</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 24 }}>
        {topTags.map(([tag, count]) => (
          <div key={tag} style={{
            fontSize: '0.72rem', padding: '4px 10px', borderRadius: 20,
            background: 'var(--rose-faint)', border: '1px solid rgba(188,143,143,0.3)',
            display: 'flex', alignItems: 'center', gap: 5,
          }}>
            <span>{tag}</span>
            <span style={{ color: 'var(--dusty-rose)', fontWeight: 600 }}>{count}</span>
          </div>
        ))}
      </div>

      {/* Top shops */}
      <div className="section-label" style={{ marginBottom: 10 }}>Top Competitor Shops</div>
      <div style={{ marginBottom: 24, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {topShops.map(([shop, count]) => (
          <div key={shop} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', border: 'var(--border)', borderRadius: 2, background: 'var(--warm-white)', fontSize: '0.8rem' }}>
            <span>{shop}</span>
            <span style={{ color: 'var(--charcoal-soft)', fontSize: '0.72rem' }}>{count} listing{count !== 1 ? 's' : ''}</span>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="section-label" style={{ margin: 0 }}>All Listings</div>
        {categories.length > 0 && (
          <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} style={{ fontSize: '0.75rem', padding: '4px 8px' }}>
            <option value="">All categories</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.75rem', cursor: 'pointer' }}>
          <input type="checkbox" checked={whiteSpaceOnly} onChange={e => setWhiteSpaceOnly(e.target.checked)} />
          White-space only
        </label>
        {(categoryFilter || whiteSpaceOnly) && (
          <button className="btn btn-ghost btn-sm" onClick={() => { setCategoryFilter(''); setWhiteSpaceOnly(false); }}>Clear</button>
        )}
      </div>

      {/* Listings table */}
      <div style={{ overflowX: 'auto', maxHeight: 500, overflowY: 'auto', marginBottom: 24, border: 'var(--border)', borderRadius: 2 }}>
        <table style={{ width: '100%', minWidth: 600, borderCollapse: 'collapse', fontSize: '0.75rem', tableLayout: 'fixed' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(43,41,38,0.12)', position: 'sticky', top: 0, background: 'var(--warm-white)', zIndex: 1 }}>
              <th style={{ textAlign: 'left', padding: '8px 8px', fontWeight: 500, color: 'var(--charcoal-soft)', width: '30%' }}>Listing</th>
              {[
                { key: 'price', label: 'Price' },
                { key: 'est_sales', label: 'Est. Sales' },
                { key: 'est_revenue', label: 'Est. Rev' },
                { key: 'growth_rate', label: 'Growth' },
                { key: 'total_reviews', label: 'Reviews' },
                { key: 'visibility_score', label: 'Visibility' },
              ].map(({ key, label }) => (
                <th key={key} onClick={() => toggleSort(key)} style={{ textAlign: 'right', padding: '8px 8px', fontWeight: 500, color: 'var(--charcoal-soft)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  {label}<SortArrow col={key} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(l => (
              <>
                <tr
                  key={l.id}
                  onClick={() => setExpandedId(expandedId === l.id ? null : l.id)}
                  style={{ borderBottom: '1px solid rgba(43,41,38,0.06)', cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--charcoal-faint)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ padding: '8px 8px', maxWidth: 200 }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.product_name}</div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--charcoal-soft)', marginTop: 2 }}>
                      {l.shop_name}{l.white_space_flag ? <span style={{ color: 'var(--dusty-rose)', marginLeft: 4 }}>⚑ white-space</span> : null}
                    </div>
                  </td>
                  <td style={{ textAlign: 'right', padding: '8px 8px', color: 'var(--charcoal-soft)' }}>{l.price ? `$${Number(l.price).toFixed(2)}` : '—'}</td>
                  <td style={{ textAlign: 'right', padding: '8px 8px', fontWeight: l.est_sales > 0 ? 500 : 400 }}>{l.est_sales ?? '—'}</td>
                  <td style={{ textAlign: 'right', padding: '8px 8px' }}>{l.est_revenue ? `$${Number(l.est_revenue).toFixed(0)}` : '—'}</td>
                  <td style={{ textAlign: 'right', padding: '8px 8px', color: l.growth_rate > 0 ? 'var(--success)' : 'var(--charcoal-soft)' }}>{l.growth_rate != null ? `${l.growth_rate}%` : '—'}</td>
                  <td style={{ textAlign: 'right', padding: '8px 8px', color: 'var(--charcoal-soft)' }}>{l.total_reviews ?? '—'}</td>
                  <td style={{ textAlign: 'right', padding: '8px 8px', color: 'var(--charcoal-soft)' }}>{l.visibility_score ?? '—'}</td>
                </tr>
                {expandedId === l.id && (
                  <tr key={`${l.id}-expanded`} style={{ background: 'var(--charcoal-faint)' }}>
                    <td colSpan={7} style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: '0.75rem', marginBottom: 10 }}>
                        <div>
                          {[
                            ['Category', l.category],
                            ['Listing age', l.listing_age],
                            ['Shop age', l.shop_age],
                            ['Total shop sales', l.total_shop_sales?.toLocaleString()],
                            ['Total favorites', l.total_favorites?.toLocaleString()],
                            ['Total views', l.total_views?.toLocaleString()],
                            ['Conversion rate', l.conversion_rate ? `${l.conversion_rate}%` : null],
                            ['Listing type', l.listing_type],
                            ['Title chars', l.title_character_count],
                          ].filter(([, v]) => v != null).map(([label, value]) => (
                            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                              <span style={{ color: 'var(--charcoal-soft)' }}>{label}</span>
                              <span>{value}</span>
                            </div>
                          ))}
                        </div>
                        <div>
                          {l.product_link && (
                            <a href={l.product_link} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.72rem', color: 'var(--dusty-rose)', display: 'block', marginBottom: 8, wordBreak: 'break-all' }}>
                              View listing ↗
                            </a>
                          )}
                          {l.import_context && (
                            <div style={{ fontSize: '0.72rem', color: 'var(--charcoal-soft)', marginBottom: 8 }}>Context: {l.import_context}</div>
                          )}
                        </div>
                      </div>
                      {/* Tags */}
                      {(() => {
                        const tags = [1,2,3,4,5,6,7,8,9,10,11,12,13].map(i => l[`tag_${i}`]).filter(Boolean);
                        return tags.length > 0 ? (
                          <div>
                            <div style={{ fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--charcoal-soft)', marginBottom: 6 }}>Tags</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                              {tags.map((tag, i) => (
                                <span key={i} style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: 20, background: 'rgba(188,143,143,0.15)', border: '1px solid rgba(188,143,143,0.25)' }}>{tag}</span>
                              ))}
                            </div>
                          </div>
                        ) : null;
                      })()}
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: 20, color: 'var(--charcoal-soft)', fontSize: '0.82rem' }}>No listings match the current filter.</div>
        )}
      </div>
    </div>
  );
}

export default function Analytics() {
  const { products, loading, refetch } = useProducts();
  const { listings: competitors, loading: compLoading } = useCompetitorListings();
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
          {['overview', 'goals', 'competitors', 'import', 'weekly'].map(t => (
            <button
              key={t}
              className={`btn btn-sm ${tab === t ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setTab(t)}
            >
              {{ overview: 'Overview', goals: 'Goals', competitors: 'Competitors', import: 'Import Data', weekly: 'Weekly Review' }[t]}
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

      {/* ── COMPETITORS TAB ── */}
      {tab === 'competitors' && (
        <CompetitorsTab listings={competitors} loading={compLoading} />
      )}

      {/* ── WEEKLY REVIEW TAB ── */}
      {tab === 'weekly' && (
        <WeeklyReview onApplied={refetch} />
      )}
    </div>
  );
}
