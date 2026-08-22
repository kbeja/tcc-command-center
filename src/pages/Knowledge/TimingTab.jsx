import { useState, useMemo } from 'react';
import {
  useNicheTimings, useTimingSources, useLeadTimeProfiles, useProducts,
  createLeadTimeProfile, updateLeadTimeProfile, archiveLeadTimeProfile,
  linkTimingNicheToCollection, unlinkTimingNicheFromCollection,
  setGuidanceNoteType, splitGuidanceNote, createTimingNiche,
} from '../../lib/hooks';
import { useCollectionsContext } from '../../context/CollectionsContext';
import {
  groupNichesByState, TIMING_STATE_LABEL, LEAD_TIME_COMPONENTS, LEAD_TIME_LABEL,
  GUIDANCE_TYPES, GUIDANCE_TYPE_LABEL, monthName,
} from '../../lib/timingIntelligence';
import TimingPanel, { TimingStateBadge } from '../../components/TimingPanel';

// Phase 22 — Timing Intelligence library. Lives as a Knowledge tab rather
// than a new top-level route for the same reason Templates and Policies do:
// this is reference material she maintains, not a daily workspace, and the
// bottom nav is already at 12 items after Portfolio.

const SUBTABS = ['Niches', 'Lead Time', 'Sources'];

// ── Lead time ───────────────────────────────────────────────────────────────
function LeadTimeForm({ profile, collections, niches, onSaved, onCancel }) {
  const [form, setForm] = useState(() => ({
    name: profile?.name || '',
    scope: profile?.scope || 'default',
    collection_id: profile?.collection_id || '',
    niche_id: profile?.niche_id || '',
    notes: profile?.notes || '',
    ...Object.fromEntries([...LEAD_TIME_COMPONENTS, 'indexing_days']
      .map(k => [k, profile?.[k] ?? ''])),
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  // Blank stays NULL rather than becoming 0 — an unset component must remain
  // genuinely unknown, and the engine reports it as such instead of quietly
  // treating it as "takes no time".
  const numOrNull = v => (v === '' || v === null || v === undefined ? null : (Number.isFinite(Number(v)) ? Number(v) : null));

  async function save() {
    if (!form.name.trim()) { setError('Give the profile a name.'); return; }
    setSaving(true); setError(null);
    const payload = {
      name: form.name.trim(),
      scope: form.scope,
      collection_id: form.scope === 'collection' ? (form.collection_id || null) : null,
      niche_id: form.scope === 'niche' ? (form.niche_id || null) : null,
      notes: form.notes.trim() || null,
      ...Object.fromEntries([...LEAD_TIME_COMPONENTS, 'indexing_days'].map(k => [k, numOrNull(form[k])])),
    };
    const { error: err } = profile
      ? await updateLeadTimeProfile(profile.id, payload)
      : await createLeadTimeProfile(payload);
    setSaving(false);
    if (err) { setError(err.message); return; }
    onSaved();
  }

  const total = LEAD_TIME_COMPONENTS.reduce((s, k) => s + (numOrNull(form[k]) || 0), 0);
  const unsetCount = LEAD_TIME_COMPONENTS.filter(k => numOrNull(form[k]) === null).length;

  return (
    <div style={{ border: 'var(--border)', borderRadius: 2, padding: 16, background: 'var(--warm-white)', marginBottom: 14 }}>
      <div className="eyebrow" style={{ marginBottom: 10 }}>{profile ? 'Edit profile' : 'New lead-time profile'}</div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
        <label style={{ fontSize: '0.75rem' }}>Name
          <input value={form.name} onChange={set('name')} placeholder="e.g. Standard POD" />
        </label>
        <label style={{ fontSize: '0.75rem' }}>Applies to
          <select value={form.scope} onChange={set('scope')}>
            <option value="default">Everything (default)</option>
            <option value="collection">One collection</option>
            <option value="niche">One niche</option>
          </select>
        </label>
      </div>

      {form.scope === 'collection' && (
        <label style={{ fontSize: '0.75rem', display: 'block', marginBottom: 10 }}>Collection
          <select value={form.collection_id} onChange={set('collection_id')}>
            <option value="">Select…</option>
            {collections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
      )}
      {form.scope === 'niche' && (
        <label style={{ fontSize: '0.75rem', display: 'block', marginBottom: 10 }}>Niche
          <select value={form.niche_id} onChange={set('niche_id')}>
            <option value="">Select…</option>
            {niches.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
          </select>
        </label>
      )}

      <div style={{ fontSize: '0.72rem', color: 'var(--charcoal-soft)', marginBottom: 8 }}>
        Days per stage. Leave any stage blank if you genuinely do not know it yet — blank stays
        unknown and is reported as such, it is not treated as zero.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 10 }}>
        {LEAD_TIME_COMPONENTS.map(k => (
          <label key={k} style={{ fontSize: '0.72rem' }}>{LEAD_TIME_LABEL[k]}
            <input type="number" min={0} value={form[k]} onChange={set(k)} placeholder="—" />
          </label>
        ))}
      </div>

      <div style={{ marginBottom: 10 }}>
        <label style={{ fontSize: '0.72rem', display: 'block', maxWidth: 240 }}>{LEAD_TIME_LABEL.indexing_days}
          <input type="number" min={0} value={form.indexing_days} onChange={set('indexing_days')} placeholder="—" />
        </label>
        {/* Recorded and shown, never spent: a source's target live date
            already sits ahead of the event because listings need indexing
            time, so subtracting it again would double-count the same runway. */}
        <div style={{ fontSize: '0.7rem', color: 'var(--charcoal-soft)', marginTop: 3 }}>
          Recorded for reference and shown in the breakdown, but not subtracted from Latest Safe Start —
          a source&rsquo;s target live date already sits ahead of the event to allow for indexing.
        </div>
      </div>

      <label style={{ fontSize: '0.75rem', display: 'block', marginBottom: 10 }}>Notes
        <textarea rows={2} value={form.notes} onChange={set('notes')} placeholder="Where these numbers came from" />
      </label>

      <div style={{ fontSize: '0.78rem', marginBottom: 10 }}>
        Pre-live runway: <strong>{total} days</strong>
        {unsetCount ? <span style={{ color: '#7a4a1e' }}> · {unsetCount} stage{unsetCount === 1 ? '' : 's'} unset, so this runway is partial</span> : null}
      </div>

      {error && <div style={{ fontSize: '0.78rem', color: '#8b3a3a', marginBottom: 8 }}>⚠ {error}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-primary btn-sm" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save profile'}</button>
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function LeadTimeSection({ collections, niches, onChanged }) {
  const { profiles, loading, refetch } = useLeadTimeProfiles('all');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);

  const active = profiles.filter(p => p.status !== 'archived');

  async function archive(p) {
    await archiveLeadTimeProfile(p.id);
    await refetch(); onChanged();
  }

  return (
    <div>
      <div style={{ fontSize: '0.8rem', color: 'var(--charcoal-soft)', marginBottom: 12, lineHeight: 1.55 }}>
        A lead-time profile is what turns a target live date into a real Latest Safe Start and a
        precise research / design / build / list breakdown. Nothing is seeded here on purpose —
        there is no evidence yet of how long TCC actually takes, and an invented number would
        silently produce an invented deadline. Until you set one, timing states fall back to the
        source&rsquo;s own months and say so.
      </div>

      {!adding && !editing && (
        <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)} style={{ marginBottom: 14 }}>
          + Lead-time profile
        </button>
      )}
      {adding && (
        <LeadTimeForm collections={collections} niches={niches}
          onSaved={async () => { setAdding(false); await refetch(); onChanged(); }}
          onCancel={() => setAdding(false)} />
      )}
      {editing && (
        <LeadTimeForm profile={editing} collections={collections} niches={niches}
          onSaved={async () => { setEditing(null); await refetch(); onChanged(); }}
          onCancel={() => setEditing(null)} />
      )}

      {loading ? <div style={{ fontSize: '0.8rem', color: 'var(--charcoal-soft)' }}>Loading…</div> : null}
      {!loading && !active.length && !adding ? (
        <div style={{ fontSize: '0.8rem', color: 'var(--charcoal-soft)', fontStyle: 'italic' }}>
          No lead-time profile set yet.
        </div>
      ) : null}

      {active.map(p => {
        const total = LEAD_TIME_COMPONENTS.reduce((s, k) => s + (p[k] || 0), 0);
        const unset = LEAD_TIME_COMPONENTS.filter(k => p[k] === null || p[k] === undefined);
        return (
          <div key={p.id} style={{ border: 'var(--border)', borderRadius: 2, padding: '12px 14px', marginBottom: 8, background: 'var(--warm-white)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <div>
                <strong style={{ fontSize: '0.88rem' }}>{p.name}</strong>
                <span style={{ fontSize: '0.72rem', color: 'var(--charcoal-soft)', marginLeft: 8 }}>
                  {p.scope === 'default' ? 'default' : p.scope}
                  {' · '}{total} day pre-live runway
                  {p.source !== 'user_defined' ? ` · ${p.source.replace('_', ' ')}` : ''}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setEditing(p)}>Edit</button>
                <button className="btn btn-ghost btn-sm" onClick={() => archive(p)}>Archive</button>
              </div>
            </div>
            <div style={{ fontSize: '0.74rem', color: 'var(--charcoal-soft)', marginTop: 5 }}>
              {LEAD_TIME_COMPONENTS.filter(k => p[k] != null).map(k => `${LEAD_TIME_LABEL[k]} ${p[k]}d`).join(' · ') || 'No stages set'}
              {p.indexing_days != null ? ` · ${LEAD_TIME_LABEL.indexing_days} ${p.indexing_days}d (not subtracted)` : ''}
            </div>
            {unset.length ? (
              <div style={{ fontSize: '0.72rem', color: '#7a4a1e', marginTop: 3 }}>
                Unset: {unset.map(k => LEAD_TIME_LABEL[k]).join(', ')} — runways using this profile are partial.
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

// ── Sources ─────────────────────────────────────────────────────────────────
function SourcesSection() {
  const { sources, loading } = useTimingSources('all');
  const [expanded, setExpanded] = useState(null);

  return (
    <div>
      <div style={{ fontSize: '0.8rem', color: 'var(--charcoal-soft)', marginBottom: 12, lineHeight: 1.55 }}>
        Every piece of timing evidence belongs to a source. A source&rsquo;s guidance is its own claim,
        never a TCC fact — which is why a new edition of a calendar is recorded as a new source
        rather than an edit, so what the old edition said stays answerable.
      </div>
      {loading ? <div style={{ fontSize: '0.8rem', color: 'var(--charcoal-soft)' }}>Loading…</div> : null}
      {!loading && !sources.length ? (
        <div style={{ fontSize: '0.8rem', color: 'var(--charcoal-soft)', fontStyle: 'italic' }}>
          No timing sources recorded yet. Run the Phase 22 migrations to seed the niche calendar.
        </div>
      ) : null}
      {sources.map(s => (
        <div key={s.id} style={{ border: 'var(--border)', borderRadius: 2, padding: '12px 14px', marginBottom: 8, background: 'var(--warm-white)' }}>
          <button onClick={() => setExpanded(expanded === s.id ? null : s.id)}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <div>
                <strong style={{ fontSize: '0.88rem' }}>{s.name}</strong>
                {s.version ? <span style={{ fontSize: '0.74rem', color: 'var(--charcoal-soft)' }}> v{s.version}</span> : null}
                {s.edition_label ? <span style={{ fontSize: '0.74rem', color: 'var(--charcoal-soft)' }}> · {s.edition_label}</span> : null}
              </div>
              <span style={{
                fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
                padding: '2px 8px', borderRadius: 10, background: 'rgba(107,130,168,0.15)', color: '#2d4270',
              }}>{(s.source_type || '').replace(/_/g, ' ')}</span>
            </div>
          </button>
          {expanded === s.id ? (
            <div style={{ marginTop: 10, fontSize: '0.78rem', lineHeight: 1.55 }}>
              {s.publisher ? <div style={{ color: 'var(--charcoal-soft)' }}>{s.publisher}</div> : null}
              {s.source_notes ? (
                <div style={{ whiteSpace: 'pre-wrap', marginTop: 8, padding: 10, background: 'rgba(43,41,38,0.03)', borderRadius: 2 }}>
                  {s.source_notes}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

// ── Guidance-note classification ────────────────────────────────────────────
// Assigning a guidance type to a printed note is a human judgment, not
// something inferred at import — several of the calendar's notes blend two
// categories in one sentence (its Christmas entry is cross-niche advice AND
// SEO advice), which is exactly why splitting exists as an explicit action
// rather than something the transcription attempted.
function NoteClassifier({ note, onChanged }) {
  const [splitting, setSplitting] = useState(false);
  const [parts, setParts] = useState([{ text: '', guidanceType: '' }, { text: '', guidanceType: '' }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function setType(value) {
    setBusy(true); setError(null);
    const { error: err } = await setGuidanceNoteType(note.id, value || null);
    setBusy(false);
    if (err) { setError(err.message); return; }
    onChanged();
  }

  async function doSplit() {
    setBusy(true); setError(null);
    const { error: err } = await splitGuidanceNote(note, parts);
    setBusy(false);
    if (err) { setError(err.message); return; }
    setSplitting(false);
    onChanged();
  }

  return (
    <div style={{ borderTop: '1px solid rgba(43,41,38,0.08)', paddingTop: 8, marginTop: 8 }}>
      <div style={{ fontSize: '0.8rem', marginBottom: 6 }}>{note.text}</div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={note.guidance_type || ''} onChange={e => setType(e.target.value)} disabled={busy}
          style={{ fontSize: '0.75rem', width: 'auto' }}>
          <option value="">Unclassified</option>
          {GUIDANCE_TYPES.map(t => <option key={t} value={t}>{GUIDANCE_TYPE_LABEL[t]}</option>)}
        </select>
        <button className="btn btn-ghost btn-sm" onClick={() => { setSplitting(v => !v); setParts([{ text: note.text, guidanceType: '' }, { text: '', guidanceType: '' }]); }}>
          {splitting ? 'Cancel split' : 'Split into two'}
        </button>
        {/* Who classified this stays visible: a proposal made during
            transcription reads differently from her own decision. */}
        <span style={{ fontSize: '0.68rem', color: 'var(--charcoal-soft)' }}>
          {note.assigned_by === 'user' ? 'classified by you' : note.assigned_by === 'import_proposal' ? 'suggested at import' : ''}
        </span>
      </div>

      {splitting ? (
        <div style={{ marginTop: 8, padding: 10, background: 'rgba(43,41,38,0.03)', borderRadius: 2 }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--charcoal-soft)', marginBottom: 6 }}>
            The original wording stays on the guidance entry either way — splitting only changes how
            it is filed.
          </div>
          {parts.map((p, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
              <textarea rows={2} value={p.text} style={{ flex: 1, fontSize: '0.76rem' }}
                onChange={e => setParts(ps => ps.map((x, j) => j === i ? { ...x, text: e.target.value } : x))} />
              <select value={p.guidanceType} style={{ fontSize: '0.72rem', width: 150 }}
                onChange={e => setParts(ps => ps.map((x, j) => j === i ? { ...x, guidanceType: e.target.value } : x))}>
                <option value="">Unclassified</option>
                {GUIDANCE_TYPES.map(t => <option key={t} value={t}>{GUIDANCE_TYPE_LABEL[t]}</option>)}
              </select>
            </div>
          ))}
          <button className="btn btn-primary btn-sm" onClick={doSplit} disabled={busy}>Save split</button>
        </div>
      ) : null}
      {error && <div style={{ fontSize: '0.74rem', color: '#8b3a3a', marginTop: 4 }}>⚠ {error}</div>}
    </div>
  );
}

// ── Niches ──────────────────────────────────────────────────────────────────
function CollectionLinker({ result, collections, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState('');
  const [error, setError] = useState(null);
  const linkedIds = new Set(result.linkedCollections.map(c => c.id));

  async function add() {
    if (!pick) return;
    setBusy(true); setError(null);
    const { error: err } = await linkTimingNicheToCollection(result.niche.id, pick);
    setBusy(false);
    if (err) { setError(err.message); return; }
    setPick(''); onChanged();
  }

  async function remove(cid) {
    setBusy(true); setError(null);
    const { error: err } = await unlinkTimingNicheFromCollection(result.niche.id, cid);
    setBusy(false);
    if (err) { setError(err.message); return; }
    onChanged();
  }

  return (
    <div style={{ marginTop: 10 }}>
      <div className="eyebrow" style={{ marginBottom: 6 }}>TCC collections</div>
      <div style={{ fontSize: '0.72rem', color: 'var(--charcoal-soft)', marginBottom: 6 }}>
        Linking is always deliberate — a source&rsquo;s niche name is its vocabulary, not TCC&rsquo;s, so
        nothing is matched automatically.
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        {result.linkedCollections.map(c => (
          <span key={c.id} style={{
            fontSize: '0.74rem', padding: '3px 8px', borderRadius: 10,
            background: 'rgba(124,175,138,0.15)', color: '#2d6b3c', display: 'inline-flex', gap: 6,
          }}>
            {c.name}
            <button onClick={() => remove(c.id)} disabled={busy}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'inherit', opacity: 0.7 }}>×</button>
          </span>
        ))}
        {!result.linkedCollections.length ? (
          <span style={{ fontSize: '0.74rem', color: 'var(--charcoal-soft)', fontStyle: 'italic' }}>None linked</span>
        ) : null}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <select value={pick} onChange={e => setPick(e.target.value)} style={{ fontSize: '0.75rem', maxWidth: 260 }}>
          <option value="">Link a collection…</option>
          {collections.filter(c => !linkedIds.has(c.id)).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button className="btn btn-sm btn-ghost" onClick={add} disabled={!pick || busy}>Link</button>
      </div>
      {error && <div style={{ fontSize: '0.74rem', color: '#8b3a3a', marginTop: 4 }}>⚠ {error}</div>}
    </div>
  );
}

function NichesSection({ results, collections, loading, onChanged }) {
  const [expanded, setExpanded] = useState(null);
  const [filter, setFilter] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');

  const filtered = useMemo(() => results.filter(r =>
    (!filter || r.niche.name.toLowerCase().includes(filter.toLowerCase())) &&
    (!stateFilter || r.timing.state === stateFilter)
  ), [results, filter, stateFilter]);

  const groups = useMemo(() => groupNichesByState(results), [results]);

  async function addNiche() {
    if (!newName.trim()) return;
    await createTimingNiche(newName.trim());
    setNewName(''); setAdding(false); onChanged();
  }

  if (loading) return <div style={{ fontSize: '0.8rem', color: 'var(--charcoal-soft)' }}>Loading…</div>;

  if (!results.length) {
    return (
      <div style={{ fontSize: '0.8rem', color: 'var(--charcoal-soft)', fontStyle: 'italic' }}>
        No timing niches recorded yet. Run the Phase 22 migrations to seed the niche calendar.
      </div>
    );
  }

  return (
    <div>
      {/* Counts by state. No ranking, no score, no "work on this first" —
          which of these to act on first is a later phase's question. */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {groups.map(gr => (
          <button key={gr.state} onClick={() => setStateFilter(stateFilter === gr.state ? '' : gr.state)}
            style={{
              border: stateFilter === gr.state ? '1px solid var(--dusty-rose)' : '1px solid transparent',
              background: gr.style.bg, color: gr.style.color, cursor: 'pointer',
              fontSize: '0.7rem', fontWeight: 600, padding: '4px 10px', borderRadius: 12,
            }}>
            {gr.label} · {gr.niches.length}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
        <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter niches…"
          style={{ fontSize: '0.78rem', maxWidth: 240 }} />
        {stateFilter ? (
          <button className="btn btn-ghost btn-sm" onClick={() => setStateFilter('')}>
            Clear {TIMING_STATE_LABEL[stateFilter]} filter
          </button>
        ) : null}
        <div style={{ marginLeft: 'auto' }}>
          {adding ? (
            <span style={{ display: 'inline-flex', gap: 6 }}>
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Niche name"
                style={{ fontSize: '0.78rem', width: 170 }} />
              <button className="btn btn-primary btn-sm" onClick={addNiche}>Add</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setAdding(false)}>Cancel</button>
            </span>
          ) : (
            <button className="btn btn-ghost btn-sm" onClick={() => setAdding(true)}>+ Niche</button>
          )}
        </div>
      </div>

      <div style={{ fontSize: '0.74rem', color: 'var(--charcoal-soft)', marginBottom: 10 }}>
        Showing {filtered.length} of {results.length} niches.
      </div>

      {filtered.map(r => (
        <div key={r.niche.id} style={{ border: 'var(--border)', borderRadius: 2, marginBottom: 8, background: 'var(--warm-white)' }}>
          <button onClick={() => setExpanded(expanded === r.niche.id ? null : r.niche.id)}
            style={{ background: 'none', border: 'none', padding: '11px 14px', cursor: 'pointer', textAlign: 'left', width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.88rem', fontWeight: 500 }}>{r.niche.name}</span>
                <TimingStateBadge state={r.timing.state} size="sm" />
              </div>
              <span style={{ fontSize: '0.72rem', color: 'var(--charcoal-soft)' }}>
                {r.timing.targetLiveDate
                  ? `target ${r.timing.dueDay ? `${monthName(r.timing.dueMonth)} ${r.timing.dueDay}` : monthName(r.timing.dueMonth)}`
                  : 'no target date'}
                {r.linkedCollections.length ? ` · ${r.linkedCollections.length} collection${r.linkedCollections.length === 1 ? '' : 's'}` : ''}
              </span>
            </div>
          </button>

          {expanded === r.niche.id ? (
            <div style={{ padding: '0 14px 14px' }}>
              <TimingPanel timing={r.timing} notes={r.notes} />
              <CollectionLinker result={r} collections={collections} onChanged={onChanged} />
              {r.notes.length ? (
                <div style={{ marginTop: 12 }}>
                  <div className="eyebrow" style={{ marginBottom: 4 }}>Classify source guidance</div>
                  {r.notes.map(n => <NoteClassifier key={n.id} note={n} onChanged={onChanged} />)}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export default function TimingTab() {
  const [sub, setSub] = useState('Niches');
  // collectionObjects, not collections — the context exposes the real rows
  // (with ids) under that name, and the junction needs a uuid, not a name.
  const { collectionObjects: collections } = useCollectionsContext();
  const { products } = useProducts();
  const { results, loading, refetch } = useNicheTimings(products, collections);

  return (
    <div>
      <div style={{ display: 'flex', gap: 14, marginBottom: 16, borderBottom: '1px solid rgba(43,41,38,0.1)' }}>
        {SUBTABS.map(t => (
          <button key={t} onClick={() => setSub(t)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 8px',
              fontSize: '0.75rem', fontWeight: sub === t ? 600 : 400,
              color: sub === t ? 'var(--charcoal)' : 'var(--charcoal-soft)',
              borderBottom: sub === t ? '2px solid var(--dusty-rose)' : '2px solid transparent',
            }}>{t}</button>
        ))}
      </div>

      {sub === 'Niches' && (
        <NichesSection results={results} collections={collections} loading={loading} onChanged={refetch} />
      )}
      {sub === 'Lead Time' && (
        <LeadTimeSection collections={collections} niches={results.map(r => r.niche)} onChanged={refetch} />
      )}
      {sub === 'Sources' && <SourcesSection />}
    </div>
  );
}
