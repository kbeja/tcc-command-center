import { useState } from 'react';
import {
  TIMING_STATE_LABEL, TIMING_STATE_STYLE, LEAD_TIME_LABEL,
  GUIDANCE_TYPE_LABEL, monthName,
} from '../lib/timingIntelligence';

// Phase 22 — the shared timing display. One implementation used at both the
// collection level and (in a compact variant) the product level, rather than
// two that can drift apart — the same reasoning as ResearchEvidence.jsx being
// shared between Listing Builder zones 2 and 3.
//
// Everything shown here is either a stored date or a value derived from
// stored dates by src/lib/timingIntelligence.js. Nothing is generated, and
// there is no AI call anywhere behind this component. Where evidence is
// missing it says so in plain words — a missing peak date renders as
// "Unknown", never as a blank that reads like zero.
//
// It deliberately shows no revenue, sales or opportunity number of any kind.
// Timing answers "when", and putting a performance figure next to a timing
// state would invite reading the two as one combined verdict.

function Row({ label, children, muted }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', marginBottom: 6 }}>
      <div style={{
        fontSize: '0.62rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase',
        color: 'var(--charcoal-soft)', width: 132, flexShrink: 0,
      }}>{label}</div>
      <div style={{ fontSize: '0.82rem', color: muted ? 'var(--charcoal-soft)' : 'var(--charcoal)', flex: 1 }}>
        {children}
      </div>
    </div>
  );
}

export function TimingStateBadge({ state, size = 'md' }) {
  if (!state) return null;
  const style = TIMING_STATE_STYLE[state] || TIMING_STATE_STYLE.UNKNOWN;
  return (
    <span style={{
      fontSize: size === 'sm' ? '0.62rem' : '0.68rem', fontWeight: 700,
      textTransform: 'uppercase', letterSpacing: '0.06em',
      padding: size === 'sm' ? '2px 7px' : '3px 10px', borderRadius: 10,
      background: style.bg, color: style.color, whiteSpace: 'nowrap',
    }}>
      {TIMING_STATE_LABEL[state] || state}
    </span>
  );
}

// "Unknown" is rendered explicitly rather than left blank. A blank cell reads
// as zero or as nothing-to-see; the whole point of this phase is that missing
// evidence is a visible, named result.
function Unknown({ children }) {
  return <span style={{ color: 'var(--charcoal-soft)', opacity: 0.75, fontStyle: 'italic' }}>{children || 'Unknown'}</span>;
}

function fmtDate(iso) {
  if (!iso) return null;
  const d = new Date(iso + 'T00:00:00Z');
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

function SourceLine({ entry }) {
  const s = entry.source;
  const name = s ? (s.version ? `${s.name} v${s.version}` : s.name) : 'Unrecorded source';
  const when = entry.month
    ? `${monthName(entry.month)}${entry.day ? ` ${entry.day}` : ''}`
    : null;
  return (
    <div style={{ fontSize: '0.78rem', marginBottom: 3 }}>
      <strong>{name}</strong>
      {': '}
      {/* The source's own word, never translated into a TCC state — that
          distinction is the entire architecture of this phase. */}
      <span style={{ fontWeight: 600 }}>{entry.guidanceState}</span>
      {when ? <span style={{ color: 'var(--charcoal-soft)' }}> · {when}</span> : null}
      {entry.evidenceType && entry.evidenceType !== 'expert_guidance' ? (
        <span style={{
          marginLeft: 6, fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '0.05em', padding: '1px 6px', borderRadius: 8,
          background: entry.evidenceType === 'hypothesis' ? 'rgba(232,168,124,0.2)' : 'rgba(107,130,168,0.15)',
          color: entry.evidenceType === 'hypothesis' ? '#7a4a1e' : '#2d4270',
        }}>{entry.evidenceType}</span>
      ) : null}
    </div>
  );
}

export default function TimingPanel({
  timing, nicheName, notes = [], compact = false,
  onLinkCollection = null, linkedCollectionNames = [],
}) {
  const [showWhy, setShowWhy] = useState(false);

  if (!timing) return null;

  const {
    state, reason, targetLiveDate, latestSafeStart, daysRemaining, daysUntilTarget,
    daysPastTarget, nextCycleTarget, expertGuidance, otherSources, classifications,
    isEvergreen, leadTimeTotal, leadTimeProfileName, componentsUsed, componentsUnknown,
    indexingDays, sourceImpliedRunwayDays, unknowns, confidence, phaseBoundaries, tier,
  } = timing;

  return (
    <div style={{ border: 'var(--border)', borderRadius: 2, padding: '14px 16px', background: 'var(--warm-white)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        {nicheName ? (
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1rem' }}>{nicheName}</div>
        ) : null}
        <TimingStateBadge state={state} />
        {isEvergreen ? (
          <span style={{ fontSize: '0.68rem', color: 'var(--charcoal-soft)' }}>
            💡 evergreen <span style={{ opacity: 0.7 }}>(per source)</span>
          </span>
        ) : null}
      </div>

      <Row label="Target live">
        {targetLiveDate ? fmtDate(targetLiveDate) : <Unknown />}
        {daysUntilTarget != null && daysUntilTarget >= 0 ? (
          <span style={{ color: 'var(--charcoal-soft)' }}> · in {daysUntilTarget} day{daysUntilTarget === 1 ? '' : 's'}</span>
        ) : null}
        {daysPastTarget != null ? (
          <span style={{ color: '#7a4a1e' }}> · {daysPastTarget} day{daysPastTarget === 1 ? '' : 's'} past</span>
        ) : null}
      </Row>

      <Row label="Latest safe start">
        {latestSafeStart
          ? <>{fmtDate(latestSafeStart)}{daysRemaining != null ? <span style={{ color: daysRemaining <= 7 ? '#7a4a1e' : 'var(--charcoal-soft)' }}> · {daysRemaining} day{daysRemaining === 1 ? '' : 's'} remaining</span> : null}</>
          : <Unknown>Unknown — no TCC lead-time profile set</Unknown>}
      </Row>

      <Row label="Lead time">
        {leadTimeTotal != null
          ? <>{leadTimeTotal} days{leadTimeProfileName ? <span style={{ color: 'var(--charcoal-soft)' }}> · {leadTimeProfileName}</span> : null}</>
          : sourceImpliedRunwayDays
            ? <Unknown>Not configured — the source implies {sourceImpliedRunwayDays} days from its START month</Unknown>
            : <Unknown />}
      </Row>

      {!compact && (
        <Row label="Expert guidance">
          {expertGuidance?.length
            ? expertGuidance.map((e, i) => <SourceLine key={i} entry={e} />)
            : <Unknown>No source guidance recorded</Unknown>}
        </Row>
      )}

      {/* Conflicting sources are shown side by side, never merged or ranked.
          Which one is right is a later phase's question, not this one's. */}
      {!compact && otherSources?.length ? (
        <Row label="Other sources">
          <div style={{ fontSize: '0.72rem', color: 'var(--charcoal-soft)', marginBottom: 4 }}>
            Not reconciled with the guidance above — both are kept as recorded.
          </div>
          {otherSources.map((e, i) => <SourceLine key={i} entry={e} />)}
        </Row>
      ) : null}

      {/* The calendar genuinely disagrees with itself across months for some
          niches, so every printed classification is listed rather than one
          being elected the winner. */}
      {!compact && classifications?.length ? (
        <Row label="Classification">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[...new Map(classifications.map(c => [c.value, c])).values()].map(c => (
              <span key={c.value} style={{
                fontSize: '0.7rem', padding: '2px 8px', borderRadius: 10,
                background: 'rgba(43,41,38,0.06)', color: 'var(--charcoal-soft)',
              }}>{c.symbol ? `${c.symbol} ` : ''}{c.label}</span>
            ))}
          </div>
          {new Set(classifications.map(c => c.value)).size > 1 ? (
            <div style={{ fontSize: '0.7rem', color: '#7a4a1e', marginTop: 4 }}>
              The source labels this niche differently in different months. Both labels are kept as printed.
            </div>
          ) : null}
        </Row>
      ) : null}

      <Row label="Timing confidence">
        {confidence?.value || <Unknown />}
        {confidence?.reason ? (
          <div style={{ fontSize: '0.72rem', color: 'var(--charcoal-soft)', marginTop: 2 }}>{confidence.reason}</div>
        ) : null}
      </Row>

      {!compact && notes?.length ? (
        <Row label="Source guidance">
          {notes.map(n => (
            <div key={n.id} style={{ marginBottom: 5 }}>
              <span style={{
                fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
                padding: '1px 6px', borderRadius: 8, marginRight: 6,
                background: n.guidance_type ? 'rgba(107,130,168,0.15)' : 'rgba(43,41,38,0.08)',
                color: n.guidance_type ? '#2d4270' : 'var(--charcoal-soft)',
              }}>
                {n.guidance_type ? GUIDANCE_TYPE_LABEL[n.guidance_type] : 'Unclassified'}
              </span>
              <span style={{ fontSize: '0.78rem' }}>{n.text}</span>
            </div>
          ))}
        </Row>
      ) : null}

      {onLinkCollection ? (
        <Row label="TCC collections">
          {linkedCollectionNames.length
            ? linkedCollectionNames.join(', ')
            : <Unknown>Not linked to any collection yet</Unknown>}
          <button className="btn btn-sm btn-ghost" style={{ marginLeft: 8 }} onClick={onLinkCollection}>
            Manage links →
          </button>
        </Row>
      ) : null}

      {/* Missing evidence gets its own row rather than being inferred away.
          Peak and close dates are absent from every source that exists today,
          so this row is never empty — which is the honest picture. */}
      {unknowns?.length ? (
        <Row label="Not known yet" muted>
          {unknowns.join(' · ')}
        </Row>
      ) : null}

      <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(43,41,38,0.08)' }}>
        <button
          onClick={() => setShowWhy(v => !v)}
          style={{
            background: 'none', border: 'none', padding: 0, cursor: 'pointer',
            fontSize: '0.72rem', color: 'var(--charcoal-soft)', textDecoration: 'underline',
          }}
        >
          {showWhy ? 'Hide the calculation' : 'Why this state?'}
        </button>
        {showWhy ? (
          <div style={{ marginTop: 8, fontSize: '0.78rem', lineHeight: 1.55 }}>
            <div style={{ marginBottom: 8 }}>{reason}</div>

            {phaseBoundaries ? (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: '0.62rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--charcoal-soft)', marginBottom: 3 }}>
                  Calculated runway
                </div>
                {[
                  ['Research opens', phaseBoundaries.researchStart],
                  ['Concept/design opens', phaseBoundaries.conceptStart],
                  ['Mockups/build opens', phaseBoundaries.buildStart],
                  ['Listing window opens', phaseBoundaries.listingStart],
                  ['Target live', targetLiveDate],
                ].map(([label, date]) => (
                  <div key={label} style={{ display: 'flex', gap: 8, fontSize: '0.76rem' }}>
                    <span style={{ width: 168, color: 'var(--charcoal-soft)' }}>{label}</span>
                    <span>{fmtDate(date)}</span>
                  </div>
                ))}
              </div>
            ) : null}

            {Object.keys(componentsUsed || {}).length ? (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: '0.62rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--charcoal-soft)', marginBottom: 3 }}>
                  Lead-time components
                </div>
                {Object.entries(componentsUsed).map(([key, days]) => (
                  <div key={key} style={{ display: 'flex', gap: 8, fontSize: '0.76rem' }}>
                    <span style={{ width: 168, color: 'var(--charcoal-soft)' }}>{LEAD_TIME_LABEL[key]}</span>
                    <span>{days} days</span>
                  </div>
                ))}
                {/* Stored and shown, never subtracted — a source's DUE date
                    already sits ahead of the event because listings need
                    indexing time, so spending it again would double-count. */}
                {indexingDays != null ? (
                  <div style={{ display: 'flex', gap: 8, fontSize: '0.76rem' }}>
                    <span style={{ width: 168, color: 'var(--charcoal-soft)' }}>{LEAD_TIME_LABEL.indexing_days}</span>
                    <span>{indexingDays} days <span style={{ color: 'var(--charcoal-soft)' }}>— after going live, not part of the pre-live runway</span></span>
                  </div>
                ) : null}
                {componentsUnknown?.length ? (
                  <div style={{ fontSize: '0.74rem', color: '#7a4a1e', marginTop: 4 }}>
                    Not set: {componentsUnknown.map(k => LEAD_TIME_LABEL[k]).join(', ')} — this runway is partial.
                  </div>
                ) : null}
              </div>
            ) : null}

            <div style={{ fontSize: '0.72rem', color: 'var(--charcoal-soft)' }}>
              {tier === 'lead_time'
                ? 'Calculated from a dated target and your configured lead time.'
                : tier === 'source_phase'
                  ? 'Calculated from the source\'s own months. No TCC lead-time profile is set, so the precise research/design/build split is not available.'
                  : 'Not enough dated evidence to calculate a runway.'}
              {nextCycleTarget && daysPastTarget != null ? ` Next cycle's target: ${fmtDate(nextCycleTarget)}.` : ''}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
