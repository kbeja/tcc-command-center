import { STAGES, STAGE_ORDER } from '../data/stages';

export default function StageTracker({ currentStage, onStageSelect }) {
  const currentIdx = STAGE_ORDER[currentStage] ?? 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {STAGES.map((stage, idx) => {
        const done = idx < currentIdx;
        const active = idx === currentIdx;

        return (
          <button
            key={stage}
            onClick={() => onStageSelect(stage)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '8px 12px',
              background: active ? 'var(--rose-faint)' : 'transparent',
              border: 'none',
              borderLeft: active ? '2px solid var(--dusty-rose)' : '2px solid transparent',
              cursor: 'pointer',
              textAlign: 'left',
              borderRadius: '0 2px 2px 0',
              transition: 'background 0.12s',
            }}
          >
            <div style={{
              width: 18,
              height: 18,
              borderRadius: '50%',
              border: active
                ? '2px solid var(--dusty-rose)'
                : done
                ? '2px solid var(--dusty-rose)'
                : '2px solid rgba(43,41,38,0.15)',
              background: active
                ? 'var(--dusty-rose)'
                : done
                ? 'var(--rose-faint)'
                : 'transparent',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              {done && <span style={{ fontSize: '0.5rem', color: 'var(--dusty-rose)', fontWeight: 700 }}>✓</span>}
            </div>
            <span style={{
              fontSize: '0.8rem',
              fontWeight: active ? 600 : 400,
              color: active ? 'var(--warm-charcoal)' : done ? 'var(--charcoal-soft)' : 'var(--charcoal-soft)',
            }}>
              {stage}
            </span>
            {active && (
              <span style={{ marginLeft: 'auto', fontSize: '0.65rem', color: 'var(--dusty-rose)', fontWeight: 500 }}>
                current
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
