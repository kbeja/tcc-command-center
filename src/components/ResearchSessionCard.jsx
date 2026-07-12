import { useState } from 'react';
import { deleteResearchSession, deleteKeyword } from '../lib/hooks';
import { supabase } from '../lib/supabase';

const PARENT_NICHES = ['Reader Chapter', 'Mom Chapter', 'Kids Chapter'];

const STATUS_STYLES = {
  'Complete': { background: 'rgba(124,175,138,0.2)', color: '#2d6b3c' },
  'Needs More Data': { background: 'rgba(232,168,124,0.25)', color: '#7a4a1e' },
  'Gaps Identified': { background: 'rgba(201,123,123,0.2)', color: '#7a2b2b' },
};

const KW_COLORS = { use: '#7CAF8A', watch: '#E8A87C', discard: '#C97B7B' };
const TAG_CYCLE = { use: 'watch', watch: 'discard', discard: 'use' };

function EditableKeyword({ k, onSave, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [keyword, setKeyword] = useState(k.keyword);
  const [volume, setVolume] = useState(k.volume ?? '');
  const [competition, setCompetition] = useState(k.competition ?? '');
  const [score, setScore] = useState(k.score ?? '');
  const [tagType, setTagType] = useState(k.tag_type || 'watch');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    const updates = {
      keyword,
      volume: volume !== '' ? parseInt(volume) : null,
      competition: competition !== '' ? parseInt(competition) : null,
      score: score !== '' ? parseInt(score) : null,
      tag_type: tagType,
      updated_at: new Date().toISOString(),
    };
    await supabase.from('keywords').update(updates).eq('id', k.id);
    onSave({ ...k, ...updates });
    setSaving(false);
    setEditing(false);
  }

  function cycleTag(e) {
    e.stopPropagation();
    const next = TAG_CYCLE[tagType];
    setTagType(next);
  }

  if (editing) {
    return (
      <div style={{
        borderLeft: `3px solid ${KW_COLORS[tagType] || KW_COLORS.watch}`,
        background: 'var(--warm-white)', borderRadius: '0 2px 2px 0',
        padding: '8px 10px', marginBottom: 3,
      }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
          <button onClick={cycleTag} title="Cycle tag" style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: '1rem', color: KW_COLORS[tagType], padding: 0, flexShrink: 0,
          }}>●</button>
          <input value={keyword} onChange={e => setKeyword(e.target.value)}
            style={{ flex: 2, minWidth: 120, padding: '4px 8px', fontSize: '0.78rem' }} placeholder="Keyword" />
          <input value={volume} onChange={e => setVolume(e.target.value)} type="number"
            style={{ width: 72, padding: '4px 8px', fontSize: '0.78rem' }} placeholder="Vol" />
          <input value={competition} onChange={e => setCompetition(e.target.value)} type="number"
            style={{ width: 60, padding: '4px 8px', fontSize: '0.78rem' }} placeholder="Comp" />
          <input value={score} onChange={e => setScore(e.target.value)} type="number"
            style={{ width: 72, padding: '4px 8px', fontSize: '0.78rem' }} placeholder="Score" />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>Cancel</button>
          <button onClick={() => onDelete(k.id)}
            style={{ marginLeft: 'auto', color: 'var(--alert)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem' }}>
            Delete
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={() => setEditing(true)}
      style={{
        display: 'flex', gap: 10, padding: '5px 10px',
        borderLeft: `3px solid ${KW_COLORS[tagType] || KW_COLORS.watch}`,
        background: 'var(--charcoal-faint)', borderRadius: '0 2px 2px 0',
        alignItems: 'center', flexWrap: 'wrap', cursor: 'pointer',
      }}
      title="Click to edit"
    >
      <span style={{ flex: 1, minWidth: 120 }}>{keyword}</span>
      <span style={{ display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
        {volume && <span style={{ color: 'var(--charcoal-soft)', fontSize: '0.72rem' }}>vol {volume}</span>}
        {competition && <span style={{ color: 'var(--charcoal-soft)', fontSize: '0.72rem' }}>comp {competition}</span>}
        {score && <span style={{ color: 'var(--charcoal-soft)', fontSize: '0.72rem' }}>score {score}</span>}
        {k.updated_at && (
          <span style={{ color: 'var(--charcoal-soft)', fontSize: '0.65rem', opacity: 0.7 }}>
            updated {new Date(k.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        )}
        <span style={{ color: 'var(--charcoal-soft)', fontSize: '0.68rem', opacity: 0.4 }}>✎</span>
      </span>
    </div>
  );
}

export default function ResearchSessionCard({ session, onDeleted, onUpdated }) {
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [keywords, setKeywords] = useState(session.keywords || []);
  const [seasonal, setSeasonal] = useState(!!session.seasonal);
  const [parentNiche, setParentNiche] = useState(session.parent_niche || '');
  const [savingParent, setSavingParent] = useState(false);
  const kwCount = keywords.length;
  const statusStyle = STATUS_STYLES[session.status] || STATUS_STYLES['Complete'];

  async function handleParentNicheChange(val) {
    setParentNiche(val);
    setSavingParent(true);
    await supabase.from('research_sessions')
      .update({ parent_niche: val || null })
      .eq('id', session.id);
    setSavingParent(false);
    onUpdated?.();
  }

  async function toggleSeasonal() {
    const next = !seasonal;
    setSeasonal(next);
    await supabase.from('research_sessions').update({ seasonal: next }).eq('id', session.id);
  }

  async function handleDelete() {
    await deleteResearchSession(session.id);
    onDeleted?.();
  }

  async function handleDeleteKeyword(kwId) {
    await deleteKeyword(kwId);
    setKeywords(prev => prev.filter(k => k.id !== kwId));
  }

  function handleKeywordSave(updated) {
    setKeywords(prev => prev.map(k => k.id === updated.id ? updated : k));
  }

  return (
    <div style={{ borderTop: '1px solid rgba(43,41,38,0.08)', paddingTop: 12, marginTop: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <button
          style={{ background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0, flex: 1 }}
          onClick={() => setOpen(!open)}
        >
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 500, fontSize: '0.82rem' }}>{session.date}</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--charcoal-soft)' }}>
              {session.source} · {kwCount} keyword{kwCount !== 1 ? 's' : ''}
            </span>
            {session.niche && (
              <span style={{ fontSize: '0.65rem', fontWeight: 500, padding: '2px 8px', borderRadius: 20, background: 'var(--rose-faint)', color: 'var(--dusty-rose)' }}>
                {session.niche}
              </span>
            )}
            <button
              onClick={e => { e.stopPropagation(); toggleSeasonal(); }}
              title={seasonal ? 'Marked seasonal — click to unmark' : 'Mark as seasonal'}
              style={{
                fontSize: '0.65rem', fontWeight: 500, padding: '2px 8px', borderRadius: 20,
                background: seasonal ? 'rgba(232,168,124,0.2)' : 'transparent',
                color: seasonal ? '#7a4a1e' : 'var(--charcoal-soft)',
                border: seasonal ? 'none' : '1px dashed rgba(43,41,38,0.2)',
                cursor: 'pointer', opacity: seasonal ? 1 : 0.5,
              }}
            >
              {seasonal ? 'seasonal' : '+ seasonal'}
            </button>
            {session.status && (
              <span style={{ fontSize: '0.65rem', fontWeight: 500, padding: '2px 8px', borderRadius: 20, ...statusStyle }}>
                {session.status}
              </span>
            )}
          </div>
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {confirmDelete ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem' }}>
              <span style={{ color: 'var(--charcoal-soft)' }}>Delete this session?</span>
              <button onClick={handleDelete} style={{ color: 'var(--alert)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem' }}>Yes</button>
              <button onClick={() => setConfirmDelete(false)} style={{ color: 'var(--charcoal-soft)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem' }}>Cancel</button>
            </span>
          ) : (
            <button onClick={() => setConfirmDelete(true)} style={{ color: 'var(--charcoal-soft)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem', opacity: 0.6 }} title="Delete session">
              🗑
            </button>
          )}
          <span style={{ fontSize: '0.65rem', color: 'var(--charcoal-soft)' }}>{open ? '▲' : '▼'}</span>
        </div>
      </div>

      {open && (
        <div style={{ marginTop: 12, fontSize: '0.8rem' }}>
          {/* Parent niche editor */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: '0.68rem', color: 'var(--charcoal-soft)', flexShrink: 0 }}>Main niche:</span>
            <select
              value={parentNiche}
              onChange={e => handleParentNicheChange(e.target.value)}
              disabled={savingParent}
              style={{ fontSize: '0.72rem', padding: '2px 6px' }}
            >
              <option value="">— Uncategorized —</option>
              {PARENT_NICHES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            {savingParent && <span style={{ fontSize: '0.65rem', color: 'var(--charcoal-soft)' }}>Saving…</span>}
          </div>
          {session.notes && (
            <p style={{ color: 'var(--charcoal-soft)', marginBottom: 8, lineHeight: 1.5 }}>{session.notes}</p>
          )}
          {session.gaps_notes && (
            <div style={{ background: 'rgba(232,168,124,0.15)', borderLeft: '2px solid var(--warning)', padding: '8px 12px', borderRadius: '0 2px 2px 0', marginBottom: 8 }}>
              <div className="eyebrow" style={{ marginBottom: 4 }}>Still Missing</div>
              <p style={{ lineHeight: 1.5 }}>{session.gaps_notes}</p>
            </div>
          )}
          {keywords.length > 0 && (
            <div>
              <div className="eyebrow" style={{ marginBottom: 6 }}>Keywords <span style={{ fontWeight: 400, opacity: 0.5 }}>— tap to edit</span></div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {keywords.map(k => (
                  <EditableKeyword
                    key={k.id}
                    k={k}
                    onSave={handleKeywordSave}
                    onDelete={handleDeleteKeyword}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
