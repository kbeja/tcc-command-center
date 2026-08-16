import { useNavigate } from 'react-router-dom';
import { groupByReviewCheckpoint, summarizeCheckpointDimension, EVIDENCE_MESSAGES } from '../../lib/portfolioAnalysis';

// Local, mirrors ReviewCheckpoints.jsx's own un-exported DECISION_LABEL —
// duplicated deliberately rather than exporting that C3 file's internal
// map, keeping C3 completely untouched by this milestone.
const DECISION_LABELS = {
  no_action_needed: 'No action needed',
  update_seo: 'Update SEO',
  update_creative: 'Update creative',
  expand_line: 'Expand the line',
  kill_or_pause: 'Kill or pause',
  insufficient_data: 'Not enough data',
};

const STATE_ORDER = ['no_went_live_date', 'upcoming', 'due', 'reviewed', 'skipped'];
const STATE_LABELS = {
  no_went_live_date: 'Not live', upcoming: 'Upcoming', due: 'Due', reviewed: 'Reviewed', skipped: 'Skipped',
};

// Bespoke renderer for the review-checkpoint dimension — always exactly 4
// fixed cards (30/60/90/120), reusing C3's own computeCheckpointStates via
// groupByReviewCheckpoint() rather than re-deriving due/upcoming/reviewed
// logic here.
export default function CheckpointDimensionView({ products, reviews }) {
  const navigate = useNavigate();
  const checkpointGroups = groupByReviewCheckpoint(products, reviews);
  const summaries = summarizeCheckpointDimension(checkpointGroups);
  const anyReviewed = checkpointGroups.some(g => (g.stateCounts.reviewed || 0) > 0 || (g.stateCounts.skipped || 0) > 0);

  return (
    <div>
      {!anyReviewed && (
        <div style={{
          fontSize: '0.82rem', color: 'var(--charcoal-soft)', marginBottom: 16, padding: '10px 12px',
          background: 'var(--warm-white)', border: '1px solid rgba(43,41,38,0.1)', borderRadius: 4,
        }}>
          {EVIDENCE_MESSAGES.waitingForFirstCheckpoints} — no listings have completed a checkpoint review yet.
        </div>
      )}

      {checkpointGroups.map((group, i) => {
        const reviewedEntries = group.entries.filter(e => e.state === 'reviewed' || e.state === 'skipped');
        return (
          <div key={group.checkpointNumber} className="card" style={{ marginBottom: 10 }}>
            <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: 6 }}>Day {group.checkpointNumber}</div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: '0.72rem', color: 'var(--charcoal-soft)', marginBottom: 8 }}>
              {STATE_ORDER.map(state => (
                <span key={state}>{STATE_LABELS[state]}: <strong style={{ color: 'var(--charcoal)' }}>{group.stateCounts[state] || 0}</strong></span>
              ))}
            </div>
            <div style={{ fontSize: '0.8rem', marginBottom: reviewedEntries.length ? 8 : 0 }}>{summaries[i].sentence}</div>
            {reviewedEntries.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {reviewedEntries.map(({ product, state }) => (
                  <button
                    key={product.id} className="btn btn-ghost btn-sm"
                    style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}
                    onClick={() => navigate(`/products/${product.id}`)}
                  >
                    <span>{product.name}</span>
                    <span style={{ fontSize: '0.68rem', opacity: 0.7 }}>
                      {state.row?.user_decision ? DECISION_LABELS[state.row.user_decision] || state.row.user_decision : 'Skipped'}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
