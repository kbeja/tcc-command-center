import { useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import {
  useProducts, useCompetitorListings, useTrendSignals, createTrendSignal,
  useVisualProfilesByListing, useVisualTags, createVisualTag, analyzeListing, applyTagToListingProfile, removeTagFromListingProfile,
} from '../lib/hooks';
import { useCollectionsContext } from '../context/CollectionsContext';
import { useNavigate } from 'react-router-dom';
import GoalCalculator from '../components/GoalCalculator';
import EtsyAdsCSVImport from '../components/EtsyAdsCSVImport';
import PinterestCSVImport from '../components/PinterestCSVImport';
import EverbeeCSVImport from '../components/EverbeeCSVImport';
import WeeklyReview from '../components/WeeklyReview';
import EtsyStatsEntry from '../components/EtsyStatsEntry';
import VisualDNACard from '../components/VisualDNACard';
import { nowISO } from '../lib/utils';

const PRINTIFY_COST_DEFAULT = 14;
const JUNK_TAG = /^[-–—]+$|^null$|^undefined$|^n\/a$/i;
const TAG_KEYS = Array.from({ length: 13 }, (_, i) => `tag_${i + 1}`);

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

// A missing number and a real zero are different findings and must not render
// the same. This previously labelled any product whose `views` was NULL as
// "0 views — discoverability problem, check SEO and tags", which asserts a
// diagnosis from data nobody ever recorded. 21 of 22 Live products have never
// had stats entered at all, so that badge was telling Kristen to fix SEO on
// listings the app knows nothing about. Phase 23A's engine draws the same
// null-vs-zero line (see computeFunnel in tccIntelligence.js).
function listingStatus(p) {
  // Whether stats were ever SAVED, not whether the column holds a number.
  // 24 of 25 products have stats_updated_at null while carrying views values —
  // mostly 0, some not — so the column value cannot distinguish "measured
  // zero" from "never touched". stats_updated_at is the only field that
  // actually records a human having entered anything.
  const recorded = !!p.stats_updated_at;
  if ((p.mo_sales || 0) > 0) return { label: '✓', title: 'Has sales' };
  if (!recorded) return { label: 'No data', title: 'No performance data recorded for this listing yet — this is not a result, just an absence of evidence' };
  if (p.views === 0) return { label: '0 views', title: '0 views recorded — discoverability problem, check SEO and tags' };
  if ((p.ad_spend || 0) > 0) return { label: '⚑ Ads', title: 'Ad spend active but no sales this month' };
  return { label: 'Review', title: 'Has views but 0 sales — check price, photos, or copy' };
}

function ClusterCard({ cluster, creating, onCreate }) {
  const [selectedNiche, setSelectedNiche] = useState('');
  const { chapters } = useCollectionsContext();
  const shops = [...new Set(cluster.listings.map(l => l.shop_name).filter(Boolean))].slice(0, 3);
  return (
    <div style={{ padding: '10px 14px', border: 'var(--border)', borderRadius: 2, background: 'var(--warm-white)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 500, fontSize: '0.82rem', textTransform: 'capitalize', marginBottom: 2 }}>{cluster.tag}</div>
          <div style={{ fontSize: '0.7rem', color: 'var(--charcoal-soft)' }}>
            {cluster.listings.length} listings · {shops.join(', ')}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
          <select
            value={selectedNiche}
            onChange={e => setSelectedNiche(e.target.value)}
            style={{ fontSize: '0.72rem', padding: '3px 6px' }}
          >
            <option value="">No niche</option>
            {chapters.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <button
            className="btn btn-ghost btn-sm"
            style={{ whiteSpace: 'nowrap' }}
            disabled={creating}
            onClick={() => onCreate(cluster.tag, selectedNiche)}
          >
            {creating ? 'Creating…' : '+ Watch signal'}
          </button>
        </div>
      </div>
    </div>
  );
}

function CompetitorsTab({ listings, loading, signals, onRefetch }) {
  const navigate = useNavigate();
  const [sortCol, setSortCol] = useState('est_sales');
  const [sortDir, setSortDir] = useState('desc');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [whiteSpaceOnly, setWhiteSpaceOnly] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [savingMatch, setSavingMatch] = useState(null);
  const [creatingCluster, setCreatingCluster] = useState(null);

  // ── Marketplace Visual Intelligence (Phase 20) ──
  const { profilesByListingId, refetch: refetchProfiles } = useVisualProfilesByListing();
  const { tags: allVisualTags } = useVisualTags();
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [analyzingId, setAnalyzingId] = useState(null);
  const [batch, setBatch] = useState(null); // { total, done, tokens } while a batch is running
  const [confirmBatch, setConfirmBatch] = useState(null); // 'selected' | 'unanalyzed' — pending confirmation

  function toggleSelected(id) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function runAnalysis(listing) {
    setAnalyzingId(listing.id);
    const result = await analyzeListing(listing);
    setAnalyzingId(null);
    refetchProfiles();
    return result;
  }

  // Sequential, not parallel — mirrors EverbeeCSVImport's own chunked-import
  // pattern (client-side loop, visible progress) rather than firing many
  // vision calls at once, which would make the progress count and any
  // partial-failure story much harder to follow for very little speed gain
  // on what's realistically a few dozen listings at a time.
  async function runBatch(listingsToAnalyze) {
    setConfirmBatch(null);
    setBatch({ total: listingsToAnalyze.length, done: 0, tokens: 0 });
    for (const listing of listingsToAnalyze) {
      const result = await analyzeListing(listing);
      const used = (result.data?.input_tokens || 0) + (result.data?.output_tokens || 0);
      setBatch(prev => prev && ({ ...prev, done: prev.done + 1, tokens: prev.tokens + used }));
    }
    refetchProfiles();
    setSelectedIds(new Set());
    setBatch(null);
  }

  async function handleAddTag(profile, category, tag) {
    let tagId = tag.id;
    if (!tagId) {
      const { data: created } = await createVisualTag(tag.name);
      if (!created) return;
      tagId = created.id;
    }
    await applyTagToListingProfile(profile.id, tagId, category);
    refetchProfiles();
  }

  async function handleRemoveTag(profile, category, tag) {
    await removeTagFromListingProfile(profile.id, tag.id, category);
    refetchProfiles();
  }

  async function handleManualMatch(listingId, signalId) {
    setSavingMatch(listingId);
    await supabase.from('competitor_listings').update({
      matched_signal_id: signalId || null,
      white_space_flag: !signalId,
      last_updated_at: nowISO(),
    }).eq('id', listingId);
    setSavingMatch(null);
    onRefetch?.();
  }

  async function handleCreateSignalFromCluster(tag, collection) {
    setCreatingCluster(tag);
    const now = nowISO();
    await createTrendSignal({
      name: tag,
      collection: collection || null,
      status: 'watch',
      score: 0,
      score_breakdown: {},
      evidence: `Auto-detected from competitor white-space cluster: ${tag}`,
      source: 'Competitor Analysis',
      first_spotted: now.split('T')[0],
      last_updated: now.split('T')[0],
    });
    setCreatingCluster(null);
    onRefetch?.();
  }

  if (loading) return <div style={{ color: 'var(--charcoal-soft)', fontSize: '0.85rem' }}>Loading…</div>;
  if (listings.length === 0) return <div className="empty-state"><p>No competitor data yet. Import an Everbee listing export to get started.</p></div>;

  // ── Tag frequency analysis ──
  const tagCounts = {};
  for (const l of listings) {
    for (const key of TAG_KEYS) {
      const raw = l[key];
      if (!raw) continue;
      const t = String(raw).trim().toLowerCase();
      if (!t || JUNK_TAG.test(t)) continue;
      tagCounts[t] = (tagCounts[t] || 0) + 1;
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
            fontSize: '0.72rem', padding: '4px 4px 4px 10px', borderRadius: 20,
            background: 'var(--rose-faint)', border: '1px solid rgba(188,143,143,0.3)',
            display: 'flex', alignItems: 'center', gap: 5,
          }}>
            <span>{tag}</span>
            <span style={{ color: 'var(--dusty-rose)', fontWeight: 600 }}>{count}</span>
            <button
              onClick={() => navigate(`/research?keyword=${encodeURIComponent(tag)}`)}
              title="Add to Research"
              style={{ background: 'rgba(188,143,143,0.2)', border: 'none', borderRadius: 10, cursor: 'pointer', padding: '1px 6px', fontSize: '0.6rem', color: 'var(--dusty-rose)' }}
            >+ Research</button>
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

      {/* Visual analysis actions — always human-triggered, never automatic on
          capture or import. Counts are computed against `filtered` (the
          currently-visible set, respecting the filters above) rather than
          every tracked listing, so "unanalyzed" can't silently balloon into
          a many-thousand-row batch just because no filter happens to be set. */}
      {(() => {
        const unanalyzed = filtered.filter(l => {
          const p = profilesByListingId[l.id];
          return !p || p.status !== 'complete';
        });
        return (
          <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center', fontSize: '0.75rem' }}>
            <button
              className="btn btn-ghost btn-sm"
              disabled={selectedIds.size === 0 || !!batch}
              onClick={() => setConfirmBatch('selected')}
            >
              Analyze selected ({selectedIds.size})
            </button>
            <button
              className="btn btn-ghost btn-sm"
              disabled={unanalyzed.length === 0 || !!batch}
              onClick={() => setConfirmBatch('unanalyzed')}
            >
              Analyze unanalyzed in view ({unanalyzed.length})
            </button>
            {confirmBatch && (
              <span style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--charcoal-soft)' }}>
                Run {confirmBatch === 'selected' ? selectedIds.size : unanalyzed.length} vision analysis call{(confirmBatch === 'selected' ? selectedIds.size : unanalyzed.length) === 1 ? '' : 's'}?
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => runBatch(confirmBatch === 'selected' ? filtered.filter(l => selectedIds.has(l.id)) : unanalyzed)}
                >
                  Confirm
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setConfirmBatch(null)}>Cancel</button>
              </span>
            )}
            {batch && (
              <span style={{ color: 'var(--charcoal-soft)' }}>
                Analyzing {batch.done}/{batch.total}… ({batch.tokens.toLocaleString()} tokens so far)
              </span>
            )}
          </div>
        );
      })()}

      {/* Listings table */}
      <div style={{ overflowX: 'auto', maxHeight: 500, overflowY: 'auto', marginBottom: 24, border: 'var(--border)', borderRadius: 2 }}>
        <table style={{ width: '100%', minWidth: 600, borderCollapse: 'collapse', fontSize: '0.75rem', tableLayout: 'fixed' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(43,41,38,0.12)', position: 'sticky', top: 0, background: 'var(--warm-white)', zIndex: 1 }}>
              <th style={{ padding: '8px 4px', width: 26 }}>
                <input
                  type="checkbox"
                  title="Select all visible"
                  checked={filtered.length > 0 && filtered.every(l => selectedIds.has(l.id))}
                  onChange={e => setSelectedIds(e.target.checked ? new Set(filtered.map(l => l.id)) : new Set())}
                />
              </th>
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
                  <td style={{ padding: '8px 4px' }} onClick={e => e.stopPropagation()}>
                    <input type="checkbox" checked={selectedIds.has(l.id)} onChange={() => toggleSelected(l.id)} />
                  </td>
                  <td style={{ padding: '8px 8px', maxWidth: 200 }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.product_name}</div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--charcoal-soft)', marginTop: 2 }}>
                      {l.shop_name}{l.white_space_flag ? <span style={{ color: 'var(--dusty-rose)', marginLeft: 4 }}>⚑ white-space</span> : null}
                      {profilesByListingId[l.id]?.status === 'complete' ? <span style={{ color: 'var(--success)', marginLeft: 4 }} title="Visual analysis complete">🎨</span> : null}
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
                    <td colSpan={8} style={{ padding: '10px 12px' }}>
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
                          {/* Signal match */}
                          <div style={{ marginTop: 8 }}>
                            <div style={{ fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--charcoal-soft)', marginBottom: 6 }}>Signal Match</div>
                            {l.matched_signal_id ? (
                              <div style={{ fontSize: '0.72rem', color: 'var(--success)', marginBottom: 6 }}>
                                🎯 {signals.find(s => s.id === l.matched_signal_id)?.name || 'Matched signal'}
                              </div>
                            ) : (
                              <div style={{ fontSize: '0.72rem', color: 'var(--charcoal-soft)', marginBottom: 6 }}>⚑ Unmatched</div>
                            )}
                            <div style={{ fontSize: '0.65rem', color: 'var(--charcoal-soft)', marginBottom: 4 }}>Assign to existing signal:</div>
                            <select
                              value={l.matched_signal_id || ''}
                              onChange={e => handleManualMatch(l.id, e.target.value || null)}
                              disabled={savingMatch === l.id}
                              style={{ fontSize: '0.72rem', padding: '3px 6px', width: '100%', marginBottom: 8 }}
                            >
                              <option value="">— Select signal —</option>
                              {signals.filter(s => s.status !== 'discarded').map(s => (
                                <option key={s.id} value={s.id}>{s.name}{s.collection ? ` (${s.collection})` : ''}</option>
                              ))}
                            </select>
                            {/* Tag-based: create new signal from listing's own tags */}
                            {(() => {
                              const listingTags = TAG_KEYS
                                .map(key => l[key])
                                .filter(t => t && !/^[-–—]+$/.test(t.trim()));
                              const trackedNames = new Set(signals.map(s => s.name.toLowerCase()));
                              const newTags = listingTags.filter(t => !trackedNames.has(t.toLowerCase())).slice(0, 6);
                              if (!newTags.length) return null;
                              return (
                                <div>
                                  <div style={{ fontSize: '0.65rem', color: 'var(--charcoal-soft)', marginBottom: 4 }}>Or create a signal from this listing's tags:</div>
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                    {newTags.map(tag => (
                                      <button
                                        key={tag}
                                        disabled={savingMatch === l.id}
                                        onClick={async () => {
                                          setSavingMatch(l.id);
                                          const now = nowISO();
                                          const { data: newSignal } = await createTrendSignal({
                                            name: tag,
                                            status: 'watch', score: 0, score_breakdown: {},
                                            evidence: `Created from competitor listing: ${l.product_name || ''}`,
                                            source: 'Competitor Analysis',
                                            first_spotted: now.split('T')[0],
                                            last_updated: now.split('T')[0],
                                          });
                                          if (newSignal) {
                                            await supabase.from('competitor_listings').update({
                                              matched_signal_id: newSignal.id,
                                              white_space_flag: false,
                                              last_updated_at: now,
                                            }).eq('id', l.id);
                                          }
                                          setSavingMatch(null);
                                          onRefetch?.();
                                        }}
                                        style={{ fontSize: '0.68rem', padding: '2px 8px', borderRadius: 20, cursor: 'pointer', border: '1px dashed rgba(43,41,38,0.3)', background: 'transparent', color: 'var(--charcoal-soft)' }}
                                      >
                                        + {tag}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              );
                            })()}
                            {savingMatch === l.id && <div style={{ fontSize: '0.68rem', color: 'var(--charcoal-soft)', marginTop: 4 }}>Saving…</div>}
                          </div>
                        </div>
                      </div>
                      {/* Tags */}
                      {(() => {
                        const tags = TAG_KEYS.map(key => l[key]).filter(Boolean);
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

                      {/* Visual DNA — Marketplace Visual Intelligence (Phase 20) */}
                      <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(43,41,38,0.1)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                          <div style={{ fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--charcoal-soft)' }}>Visual Analysis</div>
                          <button
                            className="btn btn-ghost btn-sm"
                            disabled={analyzingId === l.id || !!batch}
                            onClick={() => runAnalysis(l)}
                          >
                            {analyzingId === l.id ? 'Analyzing…' : profilesByListingId[l.id] ? 'Re-analyze' : 'Analyze this listing'}
                          </button>
                        </div>
                        <VisualDNACard
                          profile={profilesByListingId[l.id]}
                          allTags={allVisualTags}
                          editable
                          onAddTag={(category, tag) => handleAddTag(profilesByListingId[l.id], category, tag)}
                          onRemoveTag={(category, tag) => handleRemoveTag(profilesByListingId[l.id], category, tag)}
                        />
                      </div>
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

      {/* White-space cluster discovery */}
      {(() => {
        const unmatched = listings.filter(l => l.white_space_flag && !l.matched_signal_id);
        if (unmatched.length === 0) return null;

        // Count tag frequency across unmatched listings
        // Filter out blank, null, "--", and dash-only values
        const tagMap = {};
        for (const l of unmatched) {
          for (const key of TAG_KEYS) {
            const raw = l[key];
            if (!raw) continue;
            const tag = String(raw).trim().toLowerCase();
            if (!tag || JUNK_TAG.test(tag)) continue;
            if (!tagMap[tag]) tagMap[tag] = { tag, listings: [] };
            tagMap[tag].listings.push(l);
          }
        }

        // Clusters = tags appearing in 3+ unmatched listings, not already a signal name
        const signalNames = new Set(signals.map(s => s.name.toLowerCase()));
        const clusters = Object.values(tagMap)
          .filter(c => c.listings.length >= 3 && !signalNames.has(c.tag))
          .sort((a, b) => b.listings.length - a.listings.length)
          .slice(0, 8);

        if (clusters.length === 0) return null;

        return (
          <div style={{ marginTop: 32, paddingTop: 20, borderTop: 'var(--border)' }}>
            <div className="section-label" style={{ marginBottom: 4 }}>Possible New Signals</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--charcoal-soft)', marginBottom: 16, lineHeight: 1.5 }}>
              These tags appear across {unmatched.length} unmatched competitor listings but don't correspond to any signal you're tracking. They may represent niches worth watching.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {clusters.map(c => (
                <ClusterCard
                  key={c.tag}
                  cluster={c}
                  creating={creatingCluster === c.tag}
                  onCreate={handleCreateSignalFromCluster}
                />
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

export default function Analytics() {
  const { products, loading, refetch } = useProducts();
  const { listings: competitors, loading: compLoading, refetch: refetchCompetitors } = useCompetitorListings();
  const { signals } = useTrendSignals();
  const navigate = useNavigate();
  const [tab, setTab] = useState('overview');
  const [collectionFilter, setCollectionFilter] = useState('');
  const [sortCol, setSortCol] = useState('mo_revenue');
  const [sortDir, setSortDir] = useState('desc');

  const live = useMemo(() => products.filter(p => p.stage === 'Live' || p.stage === 'Reviewing'), [products]);
  const inProgress = useMemo(() => products.filter(p => !['Live', 'Reviewing', 'Paused', 'Killed'].includes(p.stage)), [products]);


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
    const revenue = items.reduce((s, p) => s + (p.mo_revenue || 0), 0);
    const withConv = items.filter(p => p.conversion_rate);
    return {
      name: col,
      count: items.length,
      orders: items.reduce((s, p) => s + (p.mo_sales || 0), 0),
      revenue,
      revenuePerListing: items.length > 0 ? revenue / items.length : 0,
      avgConv: withConv.length > 0 ? withConv.reduce((s, p) => s + (p.conversion_rate || 0), 0) / withConv.length : null,
    };
  }).sort((a, b) => b.revenue - a.revenue);

  // Listing table
  const tableListings = useMemo(() => {
    const calcProfit = p => (p.printify_cost && p.mo_sales) ? (p.mo_revenue || 0) - p.printify_cost * p.mo_sales : 0;
    let list = [...live];
    if (collectionFilter) list = list.filter(p => p.collection === collectionFilter);
    const calcRpv = p => p.views > 0 ? (p.mo_revenue || 0) / p.views * 1000 : 0;
    list.sort((a, b) => {
      const val = (p) => sortCol === 'profit' ? calcProfit(p) : sortCol === 'rev_per_view' ? calcRpv(p) : (p[sortCol] || 0);
      const av = val(a), bv = val(b);
      return sortDir === 'desc' ? bv - av : av - bv;
    });
    return list;
  }, [live, collectionFilter, sortCol, sortDir]);

  function toggleSort(col) {
    if (sortCol === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortCol(col); setSortDir('desc'); }
  }

  // Needs attention
  // Every item here is a DIAGNOSIS, so each is gated on stats actually having
  // been recorded for that product. Previously the 0-views branch fired for
  // any product whose views column was 0 or null, which flagged 15 listings
  // with "possible indexing issue" purely because nobody had ever entered
  // their numbers — an alarming conclusion manufactured from absence. Same
  // null-vs-zero discipline as Phase 23A's diagnose().
  const attention = [];
  live.forEach(p => {
    const recorded = !!p.stats_updated_at;
    if ((p.ad_spend || 0) > 0 && (p.mo_sales || 0) === 0) {
      attention.push({ icon: '⚑', text: `${p.name} — ads running with 0 sales`, id: p.id });
    }
    if (!recorded) return;
    if ((p.total_sales || 0) === 0 && (p.views || 0) > 10) {
      attention.push({ icon: '📊', text: `${p.name} — ${p.views} views, 0 sales — consider SEO audit`, id: p.id });
    }
    if (p.views === 0) {
      attention.push({ icon: '📊', text: `${p.name} — 0 views recorded, possible indexing issue`, id: p.id });
    }
  });

  const SortArrow = ({ col }) => sortCol === col
    ? <span style={{ opacity: 0.6 }}>{sortDir === 'desc' ? ' ↓' : ' ↑'}</span>
    : <span style={{ opacity: 0.2 }}> ↕</span>;

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title">Analytics</div>
        <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          {[['overview','Overview'],['etsy','Etsy Stats'],['goals','Goals'],['competitors','Competitors']].map(([t, label]) => (
            <button key={t} className={`btn btn-sm ${tab === t ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab(t)}>
              {label}
            </button>
          ))}
          <span style={{ width: 1, height: 18, background: 'rgba(43,41,38,0.15)', margin: '0 2px' }} />
          {[['import','Import Data'],['weekly','Weekly Review']].map(([t, label]) => (
            <button key={t} className={`btn btn-sm ${tab === t ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab(t)}
              style={{ fontSize: '0.7rem', opacity: 0.8 }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading && <div style={{ color: 'var(--charcoal-soft)', fontSize: '0.85rem' }}>Loading…</div>}

      {/* ── OVERVIEW TAB ── */}
      {tab === 'overview' && !loading && (
        <div>
          {/* Shop Overview */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div className="section-label" style={{ margin: 0 }}>Shop Overview</div>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/products?view=live')} title="Update live product stats">Update Stats →</button>
          </div>
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
                <div className="eyebrow" style={{ marginBottom: 8 }}>Averages</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                    <span style={{ color: 'var(--charcoal-soft)' }}>Avg order</span>
                    <span style={{ fontWeight: 500 }}>{avgOrderValue ? fmt$(avgOrderValue) : '—'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                    <span style={{ color: 'var(--charcoal-soft)' }}>Profit margin</span>
                    <span style={{ fontWeight: 500, color: hasCostData ? (totalMoProfit > 0 ? 'var(--success)' : 'var(--alert)') : undefined }}>
                      {hasCostData && totalMoRevenue > 0 ? `${Math.round((totalMoProfit / totalMoRevenue) * 100)}%` : '—'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                    <span style={{ color: 'var(--charcoal-soft)' }}>Revenue/listing</span>
                    <span style={{ fontWeight: 500 }}>{live.length > 0 ? fmt$(totalMoRevenue / live.length) : '—'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                    <span style={{ color: 'var(--charcoal-soft)' }}>Conversion</span>
                    <span style={{ fontWeight: 500 }}>{pct(conversionRate)}</span>
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
                    {col.avgConv != null && ` · ${col.avgConv.toFixed(1)}% conv`}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem' }}>
                    {col.revenue > 0 ? fmt$(col.revenue) : '—'}
                  </div>
                  {col.revenuePerListing > 0 && (
                    <div style={{ fontSize: '0.65rem', color: 'var(--charcoal-soft)', marginTop: 2 }}>
                      {fmt$(col.revenuePerListing)}/listing
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>

          {/* Needs Attention — shown above the table so urgent items aren't buried */}
          {attention.length > 0 && (
            <div style={{ marginBottom: 20, background: 'rgba(232,168,124,0.08)', border: '1px solid rgba(232,168,124,0.35)', borderRadius: 4, padding: '12px 14px' }}>
              <div className="section-label" style={{ marginBottom: 8, color: '#7a4a1e' }}>⚑ Needs Your Attention ({attention.length})</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {attention.map((a, i) => (
                  <div
                    key={i}
                    onClick={() => a.id && navigate(`/products/${a.id}`)}
                    style={{
                      display: 'flex', gap: 10, alignItems: 'flex-start',
                      padding: '8px 10px', borderRadius: 2,
                      background: 'rgba(255,255,255,0.6)', cursor: a.id ? 'pointer' : 'default',
                      fontSize: '0.78rem',
                    }}
                  >
                    <span>{a.icon}</span>
                    <span>{a.text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

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
                    { key: 'profit', label: 'Profit' },
                    { key: 'ad_spend', label: 'Ad $' },
                    { key: 'ad_roas', label: 'ROAS' },
                    { key: 'rev_per_view', label: '$/1k views' },
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
                  // Numbers are shown only where stats were actually saved.
                  // The columns hold values on products whose stats were never
                  // entered (mostly 0, a few not) with no date attached, so
                  // rendering them implies a measurement that never happened.
                  // Display-gated rather than deleted — the underlying values
                  // stay recoverable if their provenance is ever established.
                  const rec = !!p.stats_updated_at;
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
                      <td style={{ textAlign: 'right', padding: '8px 8px', color: 'var(--charcoal-soft)' }}>{rec ? fmtN(p.views) : '—'}</td>
                      <td style={{ textAlign: 'right', padding: '8px 8px', color: 'var(--charcoal-soft)' }}>{rec ? fmtN(p.mo_sales) : '—'}</td>
                      <td style={{ textAlign: 'right', padding: '8px 8px', fontWeight: (p.mo_revenue || 0) > 0 ? 500 : 400 }}>{rec ? fmt$(p.mo_revenue) : '—'}</td>
                      <td style={{ textAlign: 'right', padding: '8px 8px', color: (() => { const profit = p.printify_cost && p.mo_sales ? (p.mo_revenue || 0) - p.printify_cost * p.mo_sales : null; return profit === null ? 'var(--charcoal-soft)' : profit > 0 ? 'var(--success)' : 'var(--alert)'; })() }}>
                        {p.printify_cost && p.mo_sales ? fmt$((p.mo_revenue || 0) - p.printify_cost * p.mo_sales) : '—'}
                      </td>
                      <td style={{ textAlign: 'right', padding: '8px 8px', color: (p.ad_spend || 0) > 0 && (p.mo_sales || 0) === 0 ? 'var(--alert)' : 'var(--charcoal-soft)' }}>
                        {(p.ad_spend || 0) > 0 ? fmt$(p.ad_spend) : '—'}
                      </td>
                      <td style={{ textAlign: 'right', padding: '8px 8px', color: (() => { const r = p.ad_roas; return !r ? 'var(--charcoal-soft)' : r >= 3 ? 'var(--success)' : r >= 2 ? '#E8A87C' : 'var(--alert)'; })() }}>
                        {p.ad_roas ? `${Number(p.ad_roas).toFixed(1)}×` : '—'}
                      </td>
                      <td style={{ textAlign: 'right', padding: '8px 8px', color: 'var(--charcoal-soft)' }}>
                        {p.views > 0 && p.mo_revenue > 0 ? fmt$(((p.mo_revenue || 0) / p.views) * 1000) : '—'}
                      </td>
                      <td style={{ textAlign: 'right', padding: '8px 8px', color: 'var(--charcoal-soft)' }}>{rec ? pct(p.conversion_rate) : '—'}</td>
                      <td style={{ textAlign: 'center', padding: '8px 8px' }}>
                        <span title={status.title} style={{
                          fontSize: '0.65rem', fontWeight: 500, padding: '2px 6px', borderRadius: 20,
                          // 'No data' is deliberately neutral, not amber: an
                          // absence of evidence is not a warning about the listing.
                          background: status.label === '✓' ? 'rgba(124,175,138,0.15)'
                            : status.label === 'SEO' ? 'rgba(201,123,123,0.15)'
                            : status.label === 'No data' ? 'rgba(43,41,38,0.06)'
                            : 'rgba(232,168,124,0.15)',
                          color: status.label === '✓' ? '#2d6b3c'
                            : status.label === 'SEO' ? '#7a2b2b'
                            : status.label === 'No data' ? 'var(--charcoal-soft)'
                            : '#7a4a1e',
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

        </div>
      )}

      {/* ── ETSY STATS TAB ── */}
      {tab === 'etsy' && (
        <EtsyStatsEntry />
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
          {/* Phase 23A: replaces the old EtsyCSVImport, which parsed a
              per-listing stats CSV Etsy has never produced (its instructions
              pointed at Etsy Studio, shut down in 2018) and had never once
              run. Etsy Ads is the only real performance export Etsy offers. */}
          <div style={{ borderTop: 'var(--border)', paddingTop: 24, marginBottom: 32 }}>
            <EtsyAdsCSVImport onImported={refetch} />
          </div>
          <div style={{ borderTop: 'var(--border)', paddingTop: 24 }}>
            <PinterestCSVImport products={products} onImported={refetch} />
          </div>
        </div>
      )}

      {/* ── COMPETITORS TAB ── */}
      {tab === 'competitors' && (
        <CompetitorsTab listings={competitors} loading={compLoading} signals={signals} onRefetch={refetchCompetitors} />
      )}

      {/* ── WEEKLY REVIEW TAB ── */}
      {tab === 'weekly' && (
        <WeeklyReview onApplied={refetch} />
      )}
    </div>
  );
}
