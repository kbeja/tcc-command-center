import { STAGES, STAGE_ORDER } from '../data/stages';

export default function StageTracker({ currentStage, onStageSelect }) {
  const currentIdx = STAGE_ORDER[currentStage] ?? 0;

  return (
    <div style={{ overflowX: 'auto', paddingBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', minWidth: 'max-content', gap: 0 }}>
        {STAGES.map((stage, idx) => {
          const done = idx < currentIdx;
          const active = idx === currentIdx;
          return (
            <div key={stage} style={{ display: 'flex', alignItems: 'center' }}>
              <button
                onClick={() => onStageSelect(stage)}
                title={stage}
                style={{
                  width: active ? 28 : 20,
                  height: active ? 28 : 20,
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
                    : 'var(--warm-white)',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  position: 'relative',
                }}
              >
                {done && (
                  <span style={{ fontSize: '0.55rem', color: 'var(--dusty-rose)', fontWeight: 700 }}>✓</span>
                )}
                {active && (
                  <span style={{ fontSize: '0.55rem', color: 'white', fontWeight: 700 }}>●</span>
                )}
                <span style={{
                  position: 'absolute', top: '110%', left: '50%', transform: 'translateX(-50%)',
                  fontSize: '0.55rem', whiteSpace: 'nowrap', color: active ? 'var(--dusty-rose)' : 'var(--charcoal-soft)',
                  fontWeight: active ? 600 : 400, marginTop: 2,
                }}>
                  {stage}
                </span>
              </button>
              {idx < STAGES.length - 1 && (
                <div style={{
                  width: 20, height: 1,
                  background: done ? 'var(--dusty-rose)' : 'rgba(43,41,38,0.12)',
                }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
