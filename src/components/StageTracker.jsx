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
            <div key={stage} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <button
                  onClick={() => onStageSelect(stage)}
                  title={stage}
                  style={{
                    width: active ? 28 : 22,
                    height: active ? 28 : 22,
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
                  }}
                >
                  {done && <span style={{ fontSize: '0.5rem', color: 'var(--dusty-rose)', fontWeight: 700 }}>✓</span>}
                  {active && <span style={{ fontSize: '0.5rem', color: 'white', fontWeight: 700 }}>●</span>}
                </button>
                {idx < STAGES.length - 1 && (
                  <div style={{ width: 28, height: 1, background: done ? 'var(--dusty-rose)' : 'rgba(43,41,38,0.12)' }} />
                )}
              </div>
              <span style={{
                fontSize: '0.55rem', whiteSpace: 'nowrap', marginTop: 6,
                color: active ? 'var(--dusty-rose)' : 'var(--charcoal-soft)',
                fontWeight: active ? 600 : 400,
                position: 'absolute', top: '100%',
                left: '50%', transform: 'translateX(-50%)',
              }}>
                {stage}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
