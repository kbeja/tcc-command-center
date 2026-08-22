import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useProducts, useSparks, useNicheTimings, useNiches } from '../lib/hooks';
import { useCollectionsContext } from '../context/CollectionsContext';
import { STAGE_NEXT_ACTIONS, STAGE_PILL_CLASS } from '../data/stages';
import { TimingStateBadge } from '../components/TimingPanel';
import { buildOpportunities, summarizeOpportunities } from '../lib/opportunities';
import { TIMING_STATE_LABEL } from '../lib/timingIntelligence';

// ─── Home ──────────────────────────────────────────────────────────────────
// Rebuilt because the previous version reported five counters that all said
// "everything": Needs Attention 25, Review Queue 25 listings, of 25 live
// products. Every one of those was really saying "no performance data has been
// imported", phrased as though the shop were failing — technically accurate and
// informationally empty.
//
// The rule applied throughout: show what is actionable, or say plainly that
// something is missing. Never a count that is really an absence in disguise.
//
// What was cut, and why:
//   Needs Attention — 19 of 25 listings were flagged for "30+ days live with
//     no sales", but zero listings have ANY sales recorded, so it was
//     measuring the absence of an import.
//   Review Queue    — same population, same reason.
//   Idea Vault count— §10 is explicit that Cold means safely captured, not
//     overdue; "369 cold" on a dashboard is exactly the backlog framing it
//     rules out.
//   Pick up where you left off — surfaced whatever was least recently touched,
//     which meant an ON HOLD product stalled 42 days: the least actionable
//     thing in the shop, presented as the first thing to do.

function Section({ icon, title, badge, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ borderTop: '1px solid rgba(43,41,38,0.1)' }}>
      <button
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '14px 0', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
        onClick={() => setOpen(!open)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>{icon}</span>
          <span style={{ fontSize: '0.72rem', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{title}</span>
          {badge !== undefined && badge !== null && (
            <span style={{ background: 'var(--charcoal-faint)', borderRadius: 20, padding: '1px 8px', fontSize: '0.65rem', fontWeight: 600 }}>{badge}</span>
          )}
        </div>
        <span style={{ fontSize: '0.65rem', color: 'var(--charcoal-soft)' }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && <div style={{ paddingBottom: 16 }}>{children}</div>}
    </div>
  );
}

function Stat({ label, value, tone }) {
  return (
    <span style={{ fontSize: '0.72rem', color: tone || 'var(--charcoal-soft)' }}>
      <strong style={{ color: tone || 'var(--charcoal)' }}>{value}</strong> {label}
    </span>
  );
}

// One open window. Timing on the left, what you have for it on the right —
// research, ideas, and existing coverage together, because any one of them
// alone is not a decision.
function OpportunityCard({ o, onOpenNiche }) {
  const days = o.timing.daysRemaining;
  return (
    <div style={{
      border: o.isUncovered ? '1px solid rgba(124,175,138,0.5)' : '1px solid rgba(43,41,38,0.1)',
      background: o.isUncovered ? 'rgba(124,175,138,0.06)' : 'transparent',
      borderRadius: 3, padding: '10px 12px', marginBottom: 8,
    }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
        <TimingStateBadge state={o.timing.state} size="sm" />
        <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>{o.niche.name}</span>
        {days != null && Number.isFinite(days) && (
          <span style={{ fontSize: '0.7rem', color: 'var(--charcoal-soft)' }}>
            {days} day{days !== 1 ? 's' : ''} left in this phase
          </span>
        )}
        {o.isUncovered && (
          <span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#2d6b3c', background: 'rgba(124,175,138,0.22)', padding: '1px 7px', borderRadius: 10 }}>
            nothing live here yet
          </span>
        )}
      </div>

      {o.needsLink ? (
        // Not an empty niche — an unknowable one. Says so, and says what fixes
        // it, rather than rendering zeros that look like a verdict.
        <div style={{ fontSize: '0.72rem', color: 'var(--charcoal-soft)' }}>
          No collection linked to this niche, so TCC can&rsquo;t tell what research or products relate to it.
          {' '}
          <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.65rem', padding: '1px 6px' }} onClick={onOpenNiche}>
            Link one →
          </button>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: o.bestKeyword ? 4 : 0 }}>
            <Stat label={`live product${o.liveCount !== 1 ? 's' : ''}`} value={o.liveCount}
              tone={o.liveCount === 0 ? '#2d6b3c' : undefined} />
            {o.inProgressCount > 0 && <Stat label="in progress" value={o.inProgressCount} />}
            <Stat label={`keyword${o.keywordCount !== 1 ? 's' : ''} researched`} value={o.keywordCount} />
            {o.linkedSparks.length > 0 && <Stat label="ideas filed here" value={o.linkedSparks.length} />}
          </div>

          {o.bestKeyword && (
            <div style={{ fontSize: '0.72rem', color: 'var(--charcoal-soft)' }}>
              Strongest term: <strong>{o.bestKeyword.keyword}</strong>
              {o.bestKeyword.volume != null && ` · ${o.bestKeyword.volume.toLocaleString()} searches`}
            </div>
          )}

          {o.suggestedSparks.length > 0 && (
            // Deliberately worded as a suggestion and kept visually apart from
            // "ideas filed here" — these matched on text, nobody classified
            // them, and presenting a guess as a fact is how it becomes one.
            <div style={{ fontSize: '0.7rem', color: 'var(--charcoal-soft)', marginTop: 4, fontStyle: 'italic' }}>
              {o.suggestedSparks.length} unfiled spark{o.suggestedSparks.length !== 1 ? 's' : ''} mention
              {o.suggestedSparks.length === 1 ? 's' : ''} &ldquo;{o.niche.name}&rdquo; — may or may not belong here.
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function Home() {
  const navigate = useNavigate();
  const { products } = useProducts();
  const { sparks } = useSparks();
  const { collectionObjects } = useCollectionsContext();
  const { results: timingResults } = useNicheTimings(products, collectionObjects);
  const { niches } = useNiches();

  // The bridge between Taylor's calendar and TCC's own taxonomy. Without it
  // every opportunity routes through timing_niche_collections, which has zero
  // rows — so nothing would ever be measurable.
  const [nicheTimingLinks, setNicheTimingLinks] = useState([]);
  useEffect(() => {
    supabase.from('niche_timing_niches').select('niche_id, timing_niche_id')
      .then(({ data }) => setNicheTimingLinks(data || []));
  }, []);

  // Keywords with their session's collection, for the research half of each
  // opportunity. Fetched here rather than via a hook because Home is the only
  // consumer and it needs exactly this shape.
  const [keywords, setKeywords] = useState([]);
  useEffect(() => {
    supabase.from('keywords')
      .select('keyword, volume, research_sessions(collection, niche_id)')
      .not('research_session_id', 'is', null)
      .then(({ data }) => setKeywords(data || []));
  }, []);

  const allOpportunities = buildOpportunities({
    timingResults, products, keywords, sparks, nicheTimingLinks, niches,
  });
  const summary = summarizeOpportunities(allOpportunities);

  // Split before rendering. Taylor's calendar covers the WHOLE Etsy market —
  // 69 niches including Honeymoon, Maternity and Bachelorette — and this shop
  // sells into about six of them. On the first real run those unlinked niches
  // filled the top of the page with windows for markets that aren't hers,
  // which is exactly the noise this page was rebuilt to remove.
  //
  // They aren't dropped, because an unlinked niche might be one worth entering.
  // They're just moved below the ones where something is actually knowable.
  const opportunities = allOpportunities.filter(o => !o.needsLink);
  const unlinked = allOpportunities.filter(o => o.needsLink);

  const live = products.filter(p => p.stage === 'Live');
  const inProgress = products.filter(p => !['Live', 'Idea', 'Killed', 'Paused'].includes(p.stage));

  // The honest state of the data behind everything above. Each line is a
  // specific missing input with a specific fix, not a health score — an empty
  // dashboard should say what would fill it.
  const noPerf = live.filter(p => !p.stats_updated_at).length;
  const unclassifiedProducts = products.filter(p => !p.primary_niche_id && !['Killed', 'Paused'].includes(p.stage)).length;
  const gaps = [
    noPerf > 0 && {
      text: `${noPerf} live listing${noPerf !== 1 ? 's have' : ' has'} no performance data — review checkpoints and diagnosis stay dark until it's imported.`,
      action: 'Products', to: '/products',
    },
    summary.needingLink > 0 && {
      text: `${summary.needingLink} niche${summary.needingLink !== 1 ? 's are' : ' is'} in an open window but linked to no collection, so nothing can be measured for ${summary.needingLink !== 1 ? 'them' : 'it'}.`,
      action: 'Timing library', to: '/knowledge',
    },
    unclassifiedProducts > 0 && {
      text: `${unclassifiedProducts} active product${unclassifiedProducts !== 1 ? 's have' : ' has'} no niche.`,
      action: 'Classify', to: '/research',
    },
  ].filter(Boolean);

  return (
    <div className="page">
      <div className="page-header">
        <div className="eyebrow" style={{ marginBottom: 6 }}>the current chapter</div>
        <div style={{ height: 1, background: 'rgba(43,41,38,0.1)' }} />
      </div>

      {/* ── Build this now ── */}
      <div style={{ marginBottom: 22 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem' }}>Build this now</span>
          {summary.uncovered > 0 && (
            <span style={{ fontSize: '0.72rem', color: '#2d6b3c' }}>
              {summary.uncovered} open window{summary.uncovered !== 1 ? 's' : ''} with nothing live
            </span>
          )}
        </div>
        <div style={{ fontSize: '0.73rem', color: 'var(--charcoal-soft)', marginBottom: 10, lineHeight: 1.5 }}>
          Niches whose timing window is open right now, with what you already have for each.
          Ordered by how soon the window closes &mdash; not by any score.
        </div>

        {opportunities.length === 0 ? (
          <div style={{ fontSize: '0.8rem', color: 'var(--charcoal-soft)', padding: '10px 0' }}>
            {unlinked.length
              ? `None of the niches you sell into has an open window today. ${unlinked.length} other${unlinked.length !== 1 ? 's are' : ' is'} open in the calendar — see below.`
              : 'No niche is in an actionable window today. That’s a real answer, not a missing one — the calendar simply has nothing opening right now.'}
          </div>
        ) : (
          <>
            {opportunities.slice(0, 6).map(o => (
              <OpportunityCard key={o.niche.id} o={o} onOpenNiche={() => navigate('/knowledge')} />
            ))}
            {opportunities.length > 6 && (
              <button className="btn btn-ghost btn-sm" onClick={() => navigate('/knowledge')}>
                {opportunities.length - 6} more open window{opportunities.length - 6 !== 1 ? 's' : ''} →
              </button>
            )}
          </>
        )}

        {unlinked.length > 0 && (
          <div style={{ fontSize: '0.72rem', color: 'var(--charcoal-soft)', marginTop: 10, lineHeight: 1.5 }}>
            {unlinked.length} other niche{unlinked.length !== 1 ? 's are' : ' is'} in an open window but
            {unlinked.length !== 1 ? ' aren’t' : ' isn’t'} linked to anything you sell &mdash; {unlinked.slice(0, 4).map(o => o.niche.name).join(', ')}
            {unlinked.length > 4 ? `, and ${unlinked.length - 4} more` : ''}.
            {' '}These come from the full Etsy calendar, so most won&rsquo;t be yours.
            {' '}
            <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.65rem', padding: '1px 6px' }} onClick={() => navigate('/knowledge')}>
              Link one if it is →
            </button>
          </div>
        )}
      </div>

      {/* ── In progress ── */}
      {inProgress.length > 0 && (
        <Section icon="✅" title="In progress" badge={inProgress.length} defaultOpen>
          {inProgress.map(p => (
            <div key={p.id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '5px 0' }}>
              <span style={{ flex: '1 1 200px', fontSize: '0.82rem' }}>{p.name}</span>
              <span className={`stage-pill ${STAGE_PILL_CLASS[p.stage]}`}>{p.stage}</span>
              <span style={{ fontSize: '0.7rem', color: 'var(--charcoal-soft)', flex: '1 1 160px' }}>
                {STAGE_NEXT_ACTIONS[p.stage]}
              </span>
              <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.66rem' }} onClick={() => navigate(`/products/${p.id}`)}>
                Open →
              </button>
            </div>
          ))}
        </Section>
      )}

      {/* ── What's missing ── */}
      {gaps.length > 0 && (
        <Section icon="🔌" title="Waiting on data" badge={gaps.length}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {gaps.map((g, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: '0.76rem' }}>
                <span style={{ flex: '1 1 300px', color: 'var(--charcoal-soft)' }}>{g.text}</span>
                <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.66rem' }} onClick={() => navigate(g.to)}>
                  {g.action} →
                </button>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ── Shop at a glance ── */}
      <Section icon="📦" title="Shop at a glance">
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: '0.78rem' }}>
          <Stat label="live listings" value={live.length} />
          <Stat label="in progress" value={inProgress.length} />
          <Stat label="ideas captured" value={sparks.filter(s => !s.archived_at).length} />
          <Stat label="niches in an open window" value={summary.total} />
        </div>
        <div style={{ fontSize: '0.68rem', color: 'var(--charcoal-soft)', marginTop: 8, lineHeight: 1.5 }}>
          Counts only. Captured ideas are not a to-do list &mdash; an idea can sit for months and that is
          the system working, not a backlog.
        </div>
      </Section>
    </div>
  );
}
