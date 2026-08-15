import { useState } from 'react';
import { processWithClaude } from '../lib/claude';
import { createListingReview, skipListingReview } from '../lib/hooks';
import {
  CHECKPOINT_DECISION_KEYS, computeCheckpointStates,
  buildPerformanceSnapshot, buildGenerationSnapshot, summarizeKeywordEvidence,
} from '../lib/listingReviews';
import { daysBetween, today } from '../data/seasons';
import { STAGE_NEXT_ACTIONS } from '../data/stages';

// Milestone C3 — 30/60/90/120 checkpoint review loop. A product has at most
// 4 checkpoints, ever, so (unlike VersionHistory.jsx, which hides an
// unboundedly-growing list behind one master toggle) all 4 always render —
// hiding them would work against seeing the whole arc at a glance. Each
// settled (reviewed/skipped) row still individually expands for its own
// detail.
//
// Checkpoints are fully independent of product.stage by design (confirmed
// with Kristen directly) — this component reads only went_live_at + the
// listing_reviews rows already passed in as `reviews`. It never reads or
// writes product.stage.

const DECISION_LABEL = {
  no_action_needed: 'No action needed',
  update_seo: 'Update SEO',
  update_creative: 'Update creative',
  expand_line: 'Expand the line',
  kill_or_pause: 'Kill or pause',
  insufficient_data: 'Not enough data',
};
// {bg, color} pairs, same shape/palette as constants.js's INTENT_STATUS_STYLE
// and KeywordEvidencePanel's RECOMMENDATION_COLOR — reuses this app's
// existing good/caution/alert color vocabulary rather than inventing a new
// one for this one component.
const DECISION_STYLE = {
  no_action_needed: { bg: 'rgba(124,175,138,0.2)', color: '#2d6b3c' },
  update_seo: { bg: 'rgba(232,168,124,0.2)', color: '#7a4a1e' },
  update_creative: { bg: 'rgba(232,168,124,0.2)', color: '#7a4a1e' },
  expand_line: { bg: 'rgba(232,168,124,0.2)', color: '#7a4a1e' },
  kill_or_pause: { bg: 'rgba(139,58,58,0.15)', color: '#8b3a3a' },
  insufficient_data: { bg: 'rgba(43,41,38,0.08)', color: '#6b6862' },
};

function DecisionBadge({ decisionKey, fallback }) {
  if (!decisionKey) return fallback ? <span style={{ fontSize: '0.72rem', color: 'var(--charcoal-soft)', opacity: 0.7 }}>{fallback}</span> : null;
  const style = DECISION_STYLE[decisionKey] || { bg: 'rgba(43,41,38,0.08)', color: 'var(--charcoal-soft)' };
  return (
    <span style={{
      fontSize: '0.66rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
      padding: '2px 8px', borderRadius: 10, background: style.bg, color: style.color,
    }}>
      {DECISION_LABEL[decisionKey] || decisionKey}
    </span>
  );
}

// Compact "at a glance" subset — the full 20-field snapshot is what's
// persisted for audit purposes; re-dumping all of it in the UI on every
// settled row would bury the numbers that actually matter for a quick read.
function SnapshotGlance({ snapshot }) {
  if (!snapshot) return null;
  const rows = [
    ['Mo. sales', snapshot.mo_sales], ['Mo. revenue', snapshot.mo_revenue != null ? `$${snapshot.mo_revenue}` : null],
    ['Views', snapshot.views], ['Conversion', snapshot.conversion_rate != null ? `${snapshot.conversion_rate}%` : null],
    ['Ad spend', snapshot.ad_spend != null ? `$${snapshot.ad_spend}` : null],
  ].filter(([, v]) => v != null);
  if (!rows.length) return null;
  return (
    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: '0.74rem', color: 'var(--charcoal-soft)' }}>
      {rows.map(([label, value]) => <span key={label}>{label}: <strong style={{ color: 'var(--charcoal)' }}>{value}</strong></span>)}
    </div>
  );
}

function CompleteReviewForm({ product, checkpointNumber, daysLive, generations, sessions, onSaved, onCancel }) {
  const [snapshot] = useState(() => buildPerformanceSnapshot(product));
  const [genSnapshot] = useState(() => buildGenerationSnapshot(generations?.[0] || null));
  const [aiResult, setAiResult] = useState(null);
  const [aiModel, setAiModel] = useState(null);
  const [loadingAI, setLoadingAI] = useState(false);
  const [error, setError] = useState('');
  const [decision, setDecision] = useState(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleGetInterpretation() {
    setLoadingAI(true);
    setError('');
    try {
      const researchEvidence = summarizeKeywordEvidence(sessions, { isSeasonalProduct: product.portfolio_level === 'Seasonal' });
      const data = await processWithClaude('evaluate_checkpoint_review', {
        checkpointNumber, daysLive, performanceSnapshot: snapshot, generationSnapshot: genSnapshot,
        researchEvidence, stageGuidance: { live: STAGE_NEXT_ACTIONS.Live, reviewing: STAGE_NEXT_ACTIONS.Reviewing },
      });
      if (!data.parsed) { setError(data.error || 'No interpretation returned'); setLoadingAI(false); return; }
      setAiResult(data.parsed);
      setAiModel(data.model || null);
    } catch (err) {
      setError(err.message || 'Checkpoint review failed');
    }
    setLoadingAI(false);
  }

  async function handleSave() {
    if (!decision) return;
    setSaving(true);
    await createListingReview({
      productId: product.id, checkpointNumber, daysLiveAtReview: daysLive,
      performanceSnapshot: snapshot, generationId: genSnapshot?.generation_id || null, generationSnapshot: genSnapshot,
      aiRecommendation: aiResult?.recommendation || null, aiReasoning: aiResult?.reasoning || null, aiModel,
      userDecision: decision, userNotes: notes.trim() || null,
    });
    setSaving(false);
    onSaved();
  }

  return (
    <div style={{ marginTop: 10, background: 'var(--warm-white)', border: '1px solid rgba(43,41,38,0.1)', borderRadius: 4, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <div className="eyebrow" style={{ marginBottom: 6 }}>Frozen performance snapshot — this is what will be recorded</div>
        <SnapshotGlance snapshot={snapshot} />
        {!snapshot.mo_sales && !snapshot.views && (
          <div style={{ fontSize: '0.72rem', color: 'var(--charcoal-soft)', opacity: 0.8, marginTop: 4 }}>
            No stats recorded yet — consider updating Listing Stats above first, or proceed and note that below.
          </div>
        )}
      </div>

      {!aiResult ? (
        <button className="btn btn-primary btn-sm" onClick={handleGetInterpretation} disabled={loadingAI}>
          {loadingAI ? 'Interpreting…' : 'Get AI Interpretation →'}
        </button>
      ) : (
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>AI Interpretation</div>
          <div style={{ marginBottom: 6 }}>
            <DecisionBadge decisionKey={aiResult.recommendation} />
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--charcoal-soft)', lineHeight: 1.6 }}>{aiResult.reasoning}</div>
        </div>
      )}

      {error && <div style={{ fontSize: '0.75rem', color: '#c97b7b' }}>{error}</div>}

      {aiResult && (
        <div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Your Decision</div>
          <div className="toggle-group" style={{ flexWrap: 'wrap', marginBottom: 8 }}>
            {CHECKPOINT_DECISION_KEYS.map(key => (
              <button
                key={key}
                type="button"
                className={`toggle-btn${decision === key ? ' active' : ''}`}
                onClick={() => setDecision(key)}
              >
                {DECISION_LABEL[key]}
              </button>
            ))}
          </div>
          <textarea
            placeholder="Notes (optional)"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={2}
            style={{ width: '100%', fontSize: '0.8rem', fontFamily: 'var(--font-body)' }}
          />
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        {aiResult && (
          <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={!decision || saving}>
            {saving ? 'Saving…' : 'Save Review'}
          </button>
        )}
        <button className="btn btn-ghost btn-sm" onClick={onCancel} disabled={saving}>Cancel</button>
      </div>
    </div>
  );
}

function SkipForm({ product, checkpointNumber, daysLive, onSaved, onCancel }) {
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleConfirm() {
    setSaving(true);
    await skipListingReview({
      productId: product.id, checkpointNumber, daysLiveAtReview: daysLive,
      performanceSnapshot: buildPerformanceSnapshot(product), userNotes: notes.trim() || null,
    });
    setSaving(false);
    onSaved();
  }

  return (
    <div style={{ marginTop: 10, background: 'var(--warm-white)', border: '1px solid rgba(43,41,38,0.1)', borderRadius: 4, padding: '12px 14px' }}>
      <textarea
        placeholder="Why skip this checkpoint? (optional — e.g. traveling, will catch up at next checkpoint)"
        value={notes}
        onChange={e => setNotes(e.target.value)}
        rows={2}
        style={{ width: '100%', fontSize: '0.8rem', fontFamily: 'var(--font-body)', marginBottom: 8 }}
      />
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-primary btn-sm" onClick={handleConfirm} disabled={saving}>
          {saving ? 'Saving…' : 'Confirm Skip'}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onCancel} disabled={saving}>Cancel</button>
      </div>
    </div>
  );
}

function CheckpointRow({ checkpoint, product, daysLive, generations, sessions, onSaved }) {
  const [action, setAction] = useState(null); // null | 'review' | 'skip'
  const [open, setOpen] = useState(false);
  const { checkpointNumber, state, insufficientData, dueDate, daysUntilDue, daysOverdue, row } = checkpoint;

  function handleSaved() {
    setAction(null);
    onSaved();
  }

  if (state === 'upcoming') {
    return (
      <div style={{ padding: '8px 0', fontSize: '0.8rem', color: 'var(--charcoal-soft)' }}>
        Day {checkpointNumber} checkpoint — in {daysUntilDue} day{daysUntilDue !== 1 ? 's' : ''} ({dueDate})
      </div>
    );
  }

  if (state === 'due') {
    return (
      <div style={{ padding: '10px 0', borderLeft: daysOverdue > 0 ? '3px solid var(--alert)' : '3px solid var(--warning)', paddingLeft: 10 }}>
        <div style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: 6, color: daysOverdue > 0 ? 'var(--alert)' : '#7a4a1e' }}>
          {daysOverdue > 0 ? `⚠ Day ${checkpointNumber} checkpoint overdue by ${daysOverdue}d` : `Day ${checkpointNumber} checkpoint due today`}
        </div>
        {action === 'review' ? (
          <CompleteReviewForm
            product={product} checkpointNumber={checkpointNumber} daysLive={daysLive}
            generations={generations} sessions={sessions} onSaved={handleSaved} onCancel={() => setAction(null)}
          />
        ) : action === 'skip' ? (
          <SkipForm
            product={product} checkpointNumber={checkpointNumber} daysLive={daysLive}
            onSaved={handleSaved} onCancel={() => setAction(null)}
          />
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={() => setAction('review')}>Complete Review →</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setAction('skip')}>Skip this checkpoint</button>
          </div>
        )}
      </div>
    );
  }

  // Settled: reviewed or skipped
  const isSkipped = state === 'skipped';
  return (
    <div style={{ padding: '8px 0', borderTop: '1px solid rgba(43,41,38,0.06)' }}>
      <button
        type="button" onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left', gap: 10 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.78rem', fontWeight: 600 }}>Day {checkpointNumber}</span>
          <span style={{ fontSize: '0.7rem', color: 'var(--charcoal-soft)' }}>{(row.created_at || '').slice(0, 10)}</span>
          {isSkipped ? (
            <span style={{ fontSize: '0.66rem', color: 'var(--charcoal-soft)', opacity: 0.7 }}>Skipped</span>
          ) : insufficientData ? (
            <DecisionBadge decisionKey="insufficient_data" />
          ) : (
            <DecisionBadge decisionKey={row.user_decision} />
          )}
        </div>
        <span style={{ fontSize: '0.65rem', color: 'var(--charcoal-soft)', opacity: 0.5 }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <SnapshotGlance snapshot={row.performance_snapshot} />
          {isSkipped ? (
            row.user_notes && <div style={{ fontSize: '0.78rem', color: 'var(--charcoal-soft)', fontStyle: 'italic' }}>"{row.user_notes}"</div>
          ) : (
            <>
              {row.ai_recommendation && (
                <div>
                  <div className="eyebrow" style={{ marginBottom: 4 }}>AI Interpretation</div>
                  <div style={{ marginBottom: 4 }}><DecisionBadge decisionKey={row.ai_recommendation} /></div>
                  {row.ai_reasoning && <div style={{ fontSize: '0.78rem', color: 'var(--charcoal-soft)', lineHeight: 1.5 }}>{row.ai_reasoning}</div>}
                </div>
              )}
              <div>
                <div className="eyebrow" style={{ marginBottom: 4 }}>Decision</div>
                <div style={{ marginBottom: 4 }}><DecisionBadge decisionKey={row.user_decision} /></div>
                {row.user_notes && <div style={{ fontSize: '0.78rem', color: 'var(--charcoal-soft)', fontStyle: 'italic' }}>"{row.user_notes}"</div>}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function ReviewCheckpoints({ product, reviews, loadingReviews, onReviewSaved, generations, sessions }) {
  const states = computeCheckpointStates(product, reviews);
  const noWentLive = states[0]?.state === 'no_went_live_date';
  const dueCount = states.filter(s => s.state === 'due').length;
  const daysLive = product.went_live_at ? daysBetween(product.went_live_at, today()) : null;

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div className="section-label" style={{ margin: 0 }}>Checkpoint Reviews</div>
        {!noWentLive && !loadingReviews && (
          <span style={{ fontSize: '0.68rem', fontWeight: 600, color: dueCount > 0 ? 'var(--alert)' : 'var(--charcoal-soft)' }}>
            {dueCount > 0 ? `${dueCount} due` : 'all caught up'}
          </span>
        )}
      </div>

      {noWentLive ? (
        <div style={{ fontSize: '0.8rem', color: 'var(--charcoal-soft)' }}>
          Set a Went Live Date above (in Listing Stats) to start tracking 30/60/90/120-day checkpoints.
        </div>
      ) : loadingReviews ? (
        <div style={{ fontSize: '0.8rem', color: 'var(--charcoal-soft)' }}>Loading…</div>
      ) : (
        <div>
          {states.map(checkpoint => (
            <CheckpointRow
              key={checkpoint.checkpointNumber}
              checkpoint={checkpoint} product={product} daysLive={daysLive}
              generations={generations} sessions={sessions} onSaved={onReviewSaved}
            />
          ))}
        </div>
      )}
    </div>
  );
}
