import { useState } from 'react';

const STATUS_STYLES = {
  'Complete': { background: 'rgba(124,175,138,0.2)', color: '#2d6b3c' },
  'Needs More Data': { background: 'rgba(232,168,124,0.25)', color: '#7a4a1e' },
  'Gaps Identified': { background: 'rgba(201,123,123,0.2)', color: '#7a2b2b' },
};

export default function ResearchSessionCard({ session }) {
  const [open, setOpen] = useState(false);
  const kwCount = session.keywords?.length || 0;
  const statusStyle = STATUS_STYLES[session.status] || STATUS_STYLES['Complete'];

  return (
    <div style={{ borderTop: '1px solid rgba(43,41,38,0.08)', paddingTop: 12, marginTop: 12 }}>
      <button
        style={{ background: 'none', border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left', padding: 0 }}
        onClick={() => setOpen(!open)}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 500, fontSize: '0.88rem', marginBottom: 4 }}>
              {session.topic || 'Untitled Research'}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--charcoal-soft)' }}>
                {session.date} · {session.source} · {kwCount} keyword{kwCount !== 1 ? 's' : ''}
              </span>
              {session.status && (
                <span style={{
                  fontSize: '0.65rem', fontWeight: 500, padding: '2px 8px', borderRadius: 20,
                  ...statusStyle
                }}>
                  {session.status}
                </span>
              )}
            </div>
          </div>
          <span style={{ fontSize: '0.65rem', color: 'var(--charcoal-soft)', flexShrink: 0 }}>{open ? '▲' : '▼'}</span>
        </div>
      </button>

      {open && (
        <div style={{ marginTop: 12, fontSize: '0.8rem' }}>
          {session.decision && (
            <div style={{ marginBottom: 8 }}>
              <span className="eyebrow">Decision: </span>
              <span style={{ fontWeight: 500 }}>{session.decision}</span>
            </div>
          )}
          {session.notes && (
            <p style={{ color: 'var(--charcoal-soft)', marginBottom: 8, lineHeight: 1.5 }}>{session.notes}</p>
          )}
          {session.gaps_notes && (
            <div style={{ background: 'rgba(232,168,124,0.15)', borderLeft: '2px solid var(--warning)', padding: '8px 12px', borderRadius: '0 2px 2px 0', marginBottom: 8 }}>
              <div className="eyebrow" style={{ marginBottom: 4 }}>Still Missing</div>
              <p style={{ lineHeight: 1.5 }}>{session.gaps_notes}</p>
            </div>
          )}
          {session.keywords?.length > 0 && (
            <div>
              <div className="eyebrow" style={{ marginBottom: 6 }}>Keywords</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {session.keywords.map(k => (
                  <div key={k.id} style={{ display: 'flex', gap: 12, padding: '4px 0', borderBottom: '1px solid rgba(43,41,38,0.06)' }}>
                    <span style={{ flex: 1 }}>{k.keyword}</span>
                    {k.volume && <span style={{ color: 'var(--charcoal-soft)' }}>vol {k.volume}</span>}
                    {k.competition && <span style={{ color: 'var(--charcoal-soft)' }}>comp {k.competition}</span>}
                    {k.score && <span style={{ color: 'var(--charcoal-soft)' }}>score {k.score}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
