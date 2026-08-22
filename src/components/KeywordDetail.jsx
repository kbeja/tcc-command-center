import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { updateKeyword, setKeywordSearchIntent } from '../lib/hooks';
import { RESEARCH_STATUSES } from '../lib/keywordIntelligence';
import { ClassificationBadge, ConfidenceBadge, StatusBadge, TrendIndicator, DisagreementFlag } from '../lib/keywords';
import { SEARCH_INTENTS, SEARCH_INTENT_HINTS } from '../data/searchIntents';
import KeywordNicheLinks from './KeywordNicheLinks';

// A source's own trend_data series (when it provides one) is preferred over
// this app's own recorded volume readings over time — it's the source's
// fuller picture. Falls back to keyword_history's own volume trail when a
// source only ever reports one current number at a time.
function seriesForSource(rows) {
  const withTrendData = rows.find(r => Array.isArray(r.trend_data) && r.trend_data.length >= 2);
  if (withTrendData) {
    return withTrendData.trend_data
      .filter(p => p && typeof p.value === 'number')
      .map(p => ({ value: p.value }));
  }
  const withVolume = [...rows]
    .filter(r => r.volume != null)
    .sort((a, b) => new Date(a.data_date || a.recorded_at) - new Date(b.data_date || b.recorded_at));
  return withVolume.length >= 2 ? withVolume.map(r => ({ value: r.volume })) : null;
}

function Sparkline({ points, color = 'var(--dusty-rose)' }) {
  if (!points || points.length < 2) return null;
  const w = 120, h = 28, pad = 3;
  const values = points.map(p => p.value);
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  const coords = points.map((p, i) => {
    const x = pad + (i / (points.length - 1)) * (w - pad * 2);
    const y = pad + (1 - (p.value - min) / range) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block' }}>
      <polyline points={coords} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function groupBySource(history) {
  const map = new Map();
  for (const row of history) {
    const src = row.source || 'Unknown';
    if (!map.has(src)) map.set(src, []);
    map.get(src).push(row);
  }
  return map;
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const FIELD_LABEL = { fontSize: '0.6rem', color: 'var(--charcoal-soft)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 };

export default function KeywordDetail({ keywordId, onClose, onUpdated }) {
  const [kw, setKw] = useState(null);
  const [history, setHistory] = useState([]);
  const [concepts, setConcepts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [savingStatus, setSavingStatus] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    const [{ data: kwRow, error: kwErr }, { data: historyRows }, { data: conceptLinks }] = await Promise.all([
      supabase.from('keywords').select('*, research_sessions(id, collection, source, date, niche)').eq('id', keywordId).single(),
      supabase.from('keyword_history').select('*').eq('keyword_id', keywordId).order('recorded_at', { ascending: false }),
      supabase.from('keyword_concepts').select('concept_id, concepts(id, name)').eq('keyword_id', keywordId),
    ]);
    if (kwErr) { setErr(kwErr.message); setLoading(false); return; }
    setKw(kwRow);
    setHistory(historyRows || []);
    setConcepts((conceptLinks || []).map(l => l.concepts).filter(Boolean));
    setLoading(false);
  }, [keywordId]);

  useEffect(() => { load(); }, [load]);

  const [savingIntent, setSavingIntent] = useState(false);
  async function handleIntentChange(intent) {
    setSavingIntent(true);
    await setKeywordSearchIntent(keywordId, intent || null);
    setKw(prev => ({ ...prev, search_intent: intent || null }));
    setSavingIntent(false);
    onUpdated?.();
  }

  async function handleStatusChange(status) {
    setSavingStatus(true);
    await updateKeyword(keywordId, { research_status: status });
    setKw(prev => ({ ...prev, research_status: status }));
    setSavingStatus(false);
    onUpdated?.();
  }

  const bySource = groupBySource(history);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: 'var(--warm-white)', borderRadius: 10, maxWidth: 640, width: '100%', maxHeight: '90vh', overflowY: 'auto', padding: 20 }}
      >
        {loading && <div style={{ color: 'var(--charcoal-soft)', fontSize: '0.85rem' }}>Loading…</div>}
        {err && <div style={{ color: 'var(--alert)', fontSize: '0.82rem' }}>Error: {err}</div>}

        {!loading && !err && kw && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 6 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', lineHeight: 1.3 }}>{kw.keyword}</div>
              <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', color: 'var(--charcoal-soft)', flexShrink: 0 }}>✕</button>
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
              <ClassificationBadge classification={kw.classification} />
              <ConfidenceBadge confidence={kw.confidence} />
              <StatusBadge status={kw.research_status} />
              <TrendIndicator trend={kw.trend_classification} />
              <DisagreementFlag flag={kw.disagreement_flag} />
            </div>

            {kw.interpretation_summary && (
              <p style={{ fontSize: '0.8rem', lineHeight: 1.6, color: 'var(--charcoal-soft)', marginBottom: 16, background: 'var(--charcoal-faint)', padding: '10px 12px', borderRadius: 4 }}>
                {kw.interpretation_summary}
              </p>
            )}

            {/* Search intent (§5). A durable property of the KEYWORD, set by a
                human — distinct from listing_generation_keywords.relevance_category,
                which records what a keyword was judged to be for one listing at
                one moment. §7 makes this a filtering step that runs before any
                opportunity scoring, which is why it is set here in Research
                rather than inferred later at generation time. */}
            <div style={{ marginBottom: 18 }}>
              <div style={FIELD_LABEL}>Search Intent</div>
              <select
                value={kw.search_intent || ''}
                onChange={e => handleIntentChange(e.target.value)}
                disabled={savingIntent}
                style={{ fontSize: '0.8rem', padding: '5px 8px' }}
              >
                <option value="">— Unclassified —</option>
                {SEARCH_INTENTS.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
              {kw.search_intent && (
                <div style={{ fontSize: '0.68rem', color: 'var(--charcoal-soft)', marginTop: 4 }}>
                  {SEARCH_INTENT_HINTS[kw.search_intent]}
                </div>
              )}
            </div>

            {/* Niche links (§29) — many-to-many on purpose. A term like
                "bookish sweatshirt" genuinely serves several reader niches at
                once; forcing one would lose the others or duplicate the
                keyword and split its evidence ledger. */}
            <div style={{ marginBottom: 18 }}>
              <div style={FIELD_LABEL}>Niches this keyword serves</div>
              <KeywordNicheLinks keywordId={keywordId} />
            </div>

            {/* Research status control */}
            <div style={{ marginBottom: 18 }}>
              <div style={FIELD_LABEL}>Research Status</div>
              <select
                value={kw.research_status || 'Researching'}
                onChange={e => handleStatusChange(e.target.value)}
                disabled={savingStatus}
                style={{ fontSize: '0.8rem', padding: '5px 8px' }}
              >
                {RESEARCH_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            {/* Source comparison — always kept visibly separate per source, never merged into one number */}
            <div style={{ marginBottom: 18 }}>
              <div className="eyebrow" style={{ marginBottom: 8 }}>Source Comparison</div>
              {bySource.size === 0 ? (
                <p style={{ fontSize: '0.75rem', color: 'var(--charcoal-soft)' }}>No evidence recorded yet for this keyword.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[...bySource.entries()].map(([source, rows]) => {
                    const latest = [...rows].sort((a, b) => new Date(b.data_date || b.recorded_at) - new Date(a.data_date || a.recorded_at))[0];
                    const points = seriesForSource(rows);
                    return (
                      <div key={source} style={{ border: '1px solid rgba(43,41,38,0.1)', borderRadius: 4, padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: 3 }}>{source}</div>
                          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: '0.7rem', color: 'var(--charcoal-soft)' }}>
                            {latest.volume != null && <span>vol {latest.volume.toLocaleString()}</span>}
                            {latest.competition != null && <span>comp {latest.competition.toLocaleString()}</span>}
                            {latest.score != null && <span>score {latest.score.toLocaleString()}</span>}
                            {latest.source_score != null && <span>source score {latest.source_score.toLocaleString()}</span>}
                            {latest.clicks != null && <span>clicks {latest.clicks.toLocaleString()}</span>}
                            {latest.ctr != null && <span>ctr {latest.ctr}%</span>}
                          </div>
                          <div style={{ fontSize: '0.62rem', color: 'var(--charcoal-soft)', opacity: 0.7, marginTop: 2 }}>
                            as of {fmtDate(latest.data_date || latest.recorded_at)}
                          </div>
                        </div>
                        {points && <Sparkline points={points} />}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Associations */}
            <div style={{ marginBottom: 18 }}>
              <div className="eyebrow" style={{ marginBottom: 8 }}>Associations</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: '0.75rem' }}>
                {kw.research_sessions?.collection && (
                  <span style={{ padding: '3px 9px', borderRadius: 20, background: 'var(--rose-faint)', color: 'var(--dusty-rose)' }}>
                    {kw.research_sessions.collection}
                  </span>
                )}
                {kw.research_sessions?.niche && (
                  <span style={{ padding: '3px 9px', borderRadius: 20, background: 'rgba(43,41,38,0.08)', color: 'var(--charcoal-soft)' }}>
                    {kw.research_sessions.niche}
                  </span>
                )}
                {concepts.map(c => (
                  <span key={c.id} style={{ padding: '3px 9px', borderRadius: 20, background: 'rgba(124,175,138,0.15)', color: '#2d6b3c' }}>
                    {c.name}
                  </span>
                ))}
              </div>
              {!kw.research_sessions?.collection && !kw.research_sessions?.niche && concepts.length === 0 && (
                <p style={{ fontSize: '0.72rem', color: 'var(--charcoal-soft)', opacity: 0.7 }}>No associations yet.</p>
              )}
            </div>

            {/* Research history — full chronological trail, across all sources */}
            <div>
              <div className="eyebrow" style={{ marginBottom: 8 }}>Research History</div>
              {history.length === 0 ? (
                <p style={{ fontSize: '0.75rem', color: 'var(--charcoal-soft)' }}>No history recorded yet.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {history.map(row => (
                    <div key={row.id} style={{ display: 'flex', gap: 10, fontSize: '0.72rem', color: 'var(--charcoal-soft)', padding: '3px 0', borderBottom: '1px solid rgba(43,41,38,0.05)' }}>
                      <span style={{ minWidth: 90, flexShrink: 0 }}>{fmtDate(row.data_date || row.recorded_at)}</span>
                      <span style={{ minWidth: 80, flexShrink: 0, fontWeight: 500 }}>{row.source || '—'}</span>
                      <span>
                        {row.volume != null && `vol ${row.volume.toLocaleString()}`}
                        {row.competition != null && ` · comp ${row.competition.toLocaleString()}`}
                        {row.score != null && ` · score ${row.score.toLocaleString()}`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
