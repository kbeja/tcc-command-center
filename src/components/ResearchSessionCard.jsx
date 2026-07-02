import { useState } from 'react';

export default function ResearchSessionCard({ session }) {
  const [open, setOpen] = useState(false);
  const kwCount = session.keywords?.length || 0;

  return (
    <div style={{ borderTop: '1px solid rgba(43,41,38,0.08)', paddingTop: 10, marginTop: 10 }}>
      <button
        style={{ background: 'none', border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left', padding: 0 }}
        onClick={() => setOpen(!open)}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span style={{ fontSize: '0.82rem', fontWeight: 500 }}>{session.date}</span>
            <span style={{ color: 'var(--charcoal-soft)', fontSize: '0.78rem' }}> · {session.source} · {kwCount} keyword{kwCount !== 1 ? 's' : ''}</span>
          </div>
          <span style={{ fontSize: '0.65rem', color: 'var(--charcoal-soft)' }}>{open ? '▲' : '▼'}</span>
        </div>
      </button>
      {open && (
        <div style={{ marginTop: 10, fontSize: '0.8rem' }}>
          {session.decision && (
            <div style={{ marginBottom: 8 }}>
              <span className="eyebrow">Decision: </span>
              <span style={{ fontWeight: 500 }}>{session.decision}</span>
            </div>
          )}
          {session.notes && <p style={{ color: 'var(--charcoal-soft)', marginBottom: 8 }}>{session.notes}</p>}
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
