import { useState } from 'react';
import { deleteResearchSession, deleteKeyword, recomputeKeywordInterpretation } from '../lib/hooks';
import { useCollectionsContext } from '../context/CollectionsContext';
import { supabase } from '../lib/supabase';
import { BucketBadge, BUCKET_STYLE } from '../lib/keywords';
import { nowISO } from '../lib/utils';
import ConfirmButton from './ConfirmButton';

const STATUS_STYLES = {
  'Complete': { background: 'rgba(124,175,138,0.2)', color: '#2d6b3c' },
  'Needs More Data': { background: 'rgba(232,168,124,0.25)', color: '#7a4a1e' },
  'Gaps Identified': { background: 'rgba(201,123,123,0.2)', color: '#7a2b2b' },
};

const KW_COLORS = { use: '#7CAF8A', watch: '#E8A87C', discard: '#C97B7B' };
const TAG_CYCLE = { use: 'watch', watch: 'discard', discard: 'use' };

function EditableKeyword({ k, onSave, onDelete, collections = [], source }) {
  const [editing, setEditing] = useState(false);
  const [keyword, setKeyword] = useState(k.keyword);
  const [volume, setVolume] = useState(k.volume ?? '');
  const [competition, setCompetition] = useState(k.competition ?? '');
  const [score, setScore] = useState(k.score ?? '');
  const [tagType, setTagType] = useState(k.tag_type || 'watch');
  const [tagsOnly, setTagsOnly] = useState(!!k.tags_only);
  const [bucket, setBucket] = useState(k.bucket || '');
  const [collectionTag, setCollectionTag] = useState(k.collection_tag || '');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    const updates = {
      keyword,
      volume: volume !== '' ? parseInt(volume) : null,
      competition: competition !== '' ? parseInt(competition) : null,
      score: score !== '' ? parseInt(score) : null,
      tag_type: tagType,
      tags_only: tagsOnly,
      bucket: bucket !== '' ? parseInt(bucket) : null,
      bucket_source: bucket !== '' && bucket !== k.bucket ? 'manual' : (k.bucket_source || null),
      collection_tag: collectionTag || null,
      updated_at: nowISO(),
    };
    await supabase.from('keywords').update(updates).eq('id', k.id);
    // Volume/competition/score may have just changed — re-run classification
    // against this keyword's full history so classification/confidence/trend
    // don't go stale relative to the numbers just typed in. Not itself a new
    // source reading, so this never writes a keyword_history row.
    const { data: interpretation } = await recomputeKeywordInterpretation(k.id);
    onSave({ ...k, ...updates, ...(interpretation || {}) });
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
        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', marginBottom: 6, flexWrap: 'wrap' }}>
          <button onClick={cycleTag} title="Cycle tag" style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: '1rem', color: KW_COLORS[tagType], padding: 0, flexShrink: 0, marginBottom: 2,
          }}>●</button>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 2, minWidth: 120 }}>
            <span style={{ fontSize: '0.6rem', color: 'var(--charcoal-soft)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Keyword</span>
            <input value={keyword} onChange={e => setKeyword(e.target.value)}
              style={{ padding: '4px 8px', fontSize: '0.78rem' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, width: 72 }}>
            <span style={{ fontSize: '0.6rem', color: 'var(--charcoal-soft)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Volume</span>
            <input value={volume} onChange={e => setVolume(e.target.value)} type="number"
              style={{ padding: '4px 8px', fontSize: '0.78rem' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, width: 72 }}>
            <span style={{ fontSize: '0.6rem', color: 'var(--charcoal-soft)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Competition</span>
            <input value={competition} onChange={e => setCompetition(e.target.value)} type="number"
              style={{ padding: '4px 8px', fontSize: '0.78rem' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, width: 72 }}>
            <span style={{ fontSize: '0.6rem', color: 'var(--charcoal-soft)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Score</span>
            <input value={score} onChange={e => setScore(e.target.value)} type="number"
              style={{ padding: '4px 8px', fontSize: '0.78rem' }} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>Cancel</button>
          <select
            value={bucket}
            onChange={e => setBucket(e.target.value)}
            style={{ fontSize: '0.72rem', padding: '3px 6px', width: 'auto' }}
            title="Bucket assignment"
          >
            <option value="">— Bucket —</option>
            <option value="1">B1 Visibility (niche-specific)</option>
            <option value="2">B2 Reach</option>
            <option value="3">B3 Bestseller (broad/any niche)</option>
          </select>
          <select
            value={collectionTag}
            onChange={e => setCollectionTag(e.target.value)}
            style={{ fontSize: '0.72rem', padding: '3px 6px', width: 'auto' }}
            title="Collection"
          >
            <option value="">— Collection —</option>
            {collections.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: '0.68rem', color: 'var(--charcoal-soft)' }}>
            <input type="checkbox" checked={tagsOnly} onChange={e => setTagsOnly(e.target.checked)} style={{ width: 'auto', margin: 0 }} />
            Tags-only (misspelling)
          </label>
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
        background: k.tags_only ? 'rgba(43,41,38,0.04)' : 'var(--charcoal-faint)',
        borderRadius: '0 2px 2px 0',
        alignItems: 'center', flexWrap: 'wrap', cursor: 'pointer',
      }}
      title="Click to edit"
    >
      <span style={{ flex: 1, minWidth: 120, fontStyle: k.tags_only ? 'italic' : 'normal' }}>{keyword}</span>
      <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
        {k.tags_only && (
          <span style={{ fontSize: '0.6rem', padding: '1px 6px', borderRadius: 10, background: 'rgba(43,41,38,0.12)', color: 'var(--charcoal-soft)', whiteSpace: 'nowrap' }}>
            tags only
          </span>
        )}
        {source && (
          <span style={{ fontSize: '0.6rem', padding: '1px 6px', borderRadius: 10, background: 'rgba(43,41,38,0.08)', color: 'var(--charcoal-soft)', whiteSpace: 'nowrap' }}>
            {source}
          </span>
        )}
        <BucketBadge bucket={k.bucket} />
        {collectionTag && (
          <span style={{ fontSize: '0.6rem', padding: '1px 6px', borderRadius: 10, background: 'var(--rose-faint)', color: 'var(--dusty-rose)', whiteSpace: 'nowrap' }}>
            {collectionTag}
          </span>
        )}
        {volume && <span style={{ color: 'var(--charcoal-soft)', fontSize: '0.72rem' }}>vol {Number(volume).toLocaleString()}</span>}
        {score && <span style={{ color: 'var(--charcoal-soft)', fontSize: '0.72rem' }}>score {score}</span>}
        <span style={{ color: 'var(--charcoal-soft)', fontSize: '0.68rem', opacity: 0.4 }}>✎</span>
      </span>
    </div>
  );
}

export default function ResearchSessionCard({ session, onDeleted, onUpdated }) {
  const [open, setOpen] = useState(false);
  const [keywords, setKeywords] = useState(session.keywords || []);
  const [seasonal, setSeasonal] = useState(!!session.seasonal);
  const [kwSelecting, setKwSelecting] = useState(false);
  const [kwSelected, setKwSelected] = useState(new Set());
  const [kwBulkTag, setKwBulkTag] = useState('');
  const [kwBulkDone, setKwBulkDone] = useState('');
  const { collectionNames: collections } = useCollectionsContext();
  const kwCount = keywords.length;
  const statusStyle = STATUS_STYLES[session.status] || STATUS_STYLES['Complete'];

  async function toggleSeasonal() {
    const next = !seasonal;
    setSeasonal(next);
    await supabase.from('research_sessions').update({ seasonal: next }).eq('id', session.id);
    onUpdated?.();
  }

  async function handleDelete() {
    await deleteResearchSession(session.id);
    onDeleted?.();
  }

  async function handleDeleteKeyword(kwId) {
    await deleteKeyword(kwId);
    setKeywords(prev => prev.filter(k => k.id !== kwId));
    onUpdated?.();
  }

  function handleKeywordSave(updated) {
    setKeywords(prev => prev.map(k => k.id === updated.id ? updated : k));
    onUpdated?.();
  }

  function toggleKwSelect(id) {
    setKwSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function applyKwBulkTag() {
    if (!kwBulkTag || !kwSelected.size) return;
    const ids = [...kwSelected];
    await supabase.from('keywords').update({ collection_tag: kwBulkTag }).in('id', ids);
    setKeywords(prev => prev.map(k => ids.includes(k.id) ? { ...k, collection_tag: kwBulkTag } : k));
    setKwBulkDone(`Tagged ${ids.length} → ${kwBulkTag}`);
    setKwSelected(new Set());
    setKwBulkTag('');
    onUpdated?.();
    setTimeout(() => setKwBulkDone(''), 2500);
  }

  return (
    <div style={{ borderTop: '1px solid rgba(43,41,38,0.08)', paddingTop: 12, marginTop: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        {/* div, not button — a real "seasonal" toggle button lives inside this
            row, and buttons can't nest inside buttons (invalid HTML, unreliable
            for screen readers/keyboard nav). tabIndex+onKeyDown keep it
            keyboard-operable like a native button would be. */}
        <div
          role="button" tabIndex={0}
          style={{ background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0, flex: 1 }}
          onClick={() => setOpen(!open)}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(!open); } }}
        >
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 500, fontSize: '0.82rem' }}>{session.date}</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--charcoal-soft)' }}>
              {session.source} · {kwCount} keyword{kwCount !== 1 ? 's' : ''}
            </span>
            {(() => {
              if (!session.date) return null;
              const days = Math.floor((Date.now() - new Date(session.date).getTime()) / 86400000);
              if (days >= 180) return <span style={{ fontSize: '0.62rem', fontWeight: 600, padding: '1px 7px', borderRadius: 20, background: 'rgba(201,123,123,0.18)', color: '#7a2b2b' }}>Stale ({Math.floor(days/30)}mo)</span>;
              if (days >= 90)  return <span style={{ fontSize: '0.62rem', fontWeight: 600, padding: '1px 7px', borderRadius: 20, background: 'rgba(232,168,124,0.2)', color: '#7a4a1e' }}>Aged ({Math.floor(days/30)}mo)</span>;
              return null;
            })()}
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
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <ConfirmButton
            label="🗑"
            triggerTitle="Delete session"
            triggerStyle={{ fontSize: '0.8rem', opacity: 0.6 }}
            wrapperStyle={{ gap: 6, fontSize: '0.75rem' }}
            promptText="Delete this session?"
            onConfirm={handleDelete}
          />
          <span style={{ fontSize: '0.65rem', color: 'var(--charcoal-soft)' }}>{open ? '▲' : '▼'}</span>
        </div>
      </div>

      {open && (
        <div style={{ marginTop: 12, fontSize: '0.8rem' }}>
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <div className="eyebrow" style={{ margin: 0 }}>Keywords <span style={{ fontWeight: 400, opacity: 0.5 }}>— tap to edit</span></div>
                <button
                  onClick={() => { setKwSelecting(!kwSelecting); setKwSelected(new Set()); setKwBulkDone(''); }}
                  style={{ fontSize: '0.65rem', color: 'var(--charcoal-soft)', background: 'none', border: 'none', cursor: 'pointer', marginLeft: 'auto', opacity: 0.6 }}
                >
                  {kwSelecting ? 'Cancel' : 'Tag'}
                </button>
              </div>

              {kwSelecting && (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.68rem', color: 'var(--charcoal-soft)' }}>{kwSelected.size} selected</span>
                  <button
                    onClick={() => setKwSelected(new Set(keywords.map(k => k.id)))}
                    style={{ fontSize: '0.65rem', color: 'var(--charcoal-soft)', background: 'none', border: 'none', cursor: 'pointer' }}
                  >
                    All
                  </button>
                  {kwBulkDone ? (
                    <span style={{ fontSize: '0.68rem', color: 'var(--success)', marginLeft: 4 }}>{kwBulkDone} ✓</span>
                  ) : (
                    <>
                      <select
                        value={kwBulkTag}
                        onChange={e => setKwBulkTag(e.target.value)}
                        style={{ fontSize: '0.68rem', padding: '2px 4px' }}
                      >
                        <option value="">— Collection —</option>
                        {collections.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <button
                        onClick={applyKwBulkTag}
                        disabled={!kwSelected.size || !kwBulkTag}
                        style={{ fontSize: '0.65rem', padding: '2px 8px', borderRadius: 2, border: '1px solid rgba(43,41,38,0.2)', background: 'none', cursor: 'pointer' }}
                      >
                        Apply
                      </button>
                    </>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {keywords.map(k => (
                  <div key={k.id} style={{ display: 'flex', alignItems: 'stretch', gap: 4 }}>
                    {kwSelecting && (
                      <div
                        onClick={() => toggleKwSelect(k.id)}
                        style={{
                          width: 16, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          cursor: 'pointer',
                          border: `2px solid ${kwSelected.has(k.id) ? 'var(--dusty-rose)' : 'rgba(43,41,38,0.2)'}`,
                          borderRadius: 2,
                          background: kwSelected.has(k.id) ? 'var(--dusty-rose)' : 'transparent',
                        }}
                      >
                        {kwSelected.has(k.id) && <span style={{ color: 'white', fontSize: '0.5rem', fontWeight: 800 }}>✓</span>}
                      </div>
                    )}
                    <div style={{ flex: 1 }}>
                      <EditableKeyword
                        k={k}
                        onSave={handleKeywordSave}
                        onDelete={handleDeleteKeyword}
                        collections={collections}
                        source={session.source}
                      />
                    </div>
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
