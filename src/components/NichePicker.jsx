import { useMemo, useState } from 'react';
import { useNiches, createNiche } from '../lib/hooks';
import { flattenForPicker, nichePath, LEVEL_LABELS, childLevelOf, validateNicheName } from '../lib/niches';

// ─── Niche Picker — the shared taxonomy control (Phase 2b) ─────────────────
// One picker, reused by Sparks (Phase 3), Concepts (4), Products (7) and
// Research (5), so those phases do not each invent their own. §36's "one
// canonical taxonomy source shared by Sparks, Concepts, Research, Keywords and
// Products — do not duplicate taxonomy lists in different features" is as much
// about the UI as the table.
//
// A single flat <select> of full paths rather than three chained dropdowns.
// Three dropdowns force a top-down walk (pick Hobbies, then Hockey, then
// Hockey Mom) and strand you if the branch you want is not built yet; one list
// of "Hobbies → Hockey → Hockey Mom" is scannable, searchable by the browser's
// own type-ahead, and shows the whole path at the point of choosing — which
// matters because "Hockey" and "Field Hockey" are only distinguishable in
// context.
//
// Selecting a niche at ANY level is allowed on purpose. §35 requires
// progressive classification: "Hobbies" alone is a legitimate, honest answer
// early on, and forcing a specific niche would push people into inventing
// precision they do not have — exactly the fabricated-certainty failure this
// project's evidence model rules out everywhere else.

export default function NichePicker({
  value,                       // niche id, or null
  onChange,                    // (nicheId | null) => void
  label = 'Niche',
  allowClear = true,
  disabled = false,
  levels = null,               // e.g. ['specific'] to restrict; null = any level
  helpText = null,
  compact = false,
  // Discovering a new market IS the research workflow -- if creating a niche
  // means leaving the page, going to the Niches tab and coming back, the
  // research gets filed under whatever already exists instead, which is how
  // taxonomy drifts. Off by default: only surfaces where creating a niche is a
  // legitimate part of the task at hand.
  allowCreate = false,
}) {
  const { niches, loading, refetch } = useNiches();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newParentId, setNewParentId] = useState('');
  const [createError, setCreateError] = useState('');
  const [busy, setBusy] = useState(false);

  const options = useMemo(() => {
    const all = flattenForPicker(niches);
    return levels ? all.filter(o => levels.includes(o.level)) : all;
  }, [niches, levels]);

  // The currently-selected niche may be archived (classified before it was
  // retired). It is deliberately still rendered, appended to the list, rather
  // than silently reverting the field to blank — quietly dropping an existing
  // classification because the branch was archived would be a silent write.
  const selected = niches.find(n => n.id === value) || null;
  const selectedMissingFromOptions = selected && !options.some(o => o.id === selected.id);

  // Only niches that can actually take a child -- a specific niche is already
  // at the deepest level, so offering it as a parent would produce an error
  // the moment they typed a name.
  const parentOptions = useMemo(
    () => flattenForPicker(niches).filter(o => !!childLevelOf(o.node)),
    [niches]);

  const newLevel = newParentId
    ? childLevelOf(niches.find(n => n.id === newParentId))
    : null;

  async function handleCreate() {
    const trimmed = newName.trim();
    if (!trimmed || !newParentId) return;
    const check = validateNicheName(trimmed, newParentId, niches);
    if (!check.ok) { setCreateError(check.error); return; }
    setBusy(true);
    // alreadyExisted means the name collided case-insensitively under this
    // parent and createNiche returned the existing row instead of failing --
    // selecting it is the right outcome either way, so this needs no branch.
    const { data, error } = await createNiche(trimmed, { parentId: newParentId });
    setBusy(false);
    if (error) { setCreateError(error.message); return; }
    await refetch();
    // Select it immediately -- creating a niche here is always in service of
    // classifying the thing in front of you, never an end in itself.
    onChange(data.id);
    setCreating(false);
    setNewName('');
    setNewParentId('');
    setCreateError('');
  }

  return (
    <div className={compact ? undefined : 'form-group'}>
      {label && <label className="form-label">{label}</label>}
      <select
        value={value || ''}
        disabled={disabled || loading}
        onChange={e => onChange(e.target.value || null)}
        style={{ width: '100%', fontSize: compact ? '0.75rem' : undefined }}
      >
        <option value="">{loading ? 'Loading niches…' : allowClear ? '— Unclassified —' : '— Choose a niche —'}</option>
        {options.map(o => (
          <option key={o.id} value={o.id}>
            {'  '.repeat(o.depth)}{o.path}
          </option>
        ))}
        {selectedMissingFromOptions && (
          <option value={selected.id}>
            {nichePath(selected, niches)} (archived)
          </option>
        )}
      </select>

      {selected && (
        <div style={{ fontSize: '0.68rem', color: 'var(--charcoal-soft)', marginTop: 3 }}>
          {LEVEL_LABELS[selected.level]}
          {selected.status === 'archived' && ' · archived'}
        </div>
      )}

      {allowCreate && !creating && (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          style={{ fontSize: '0.65rem', padding: '2px 6px', marginTop: 4 }}
          onClick={() => { setCreating(true); setCreateError(''); }}
        >
          + New niche
        </button>
      )}

      {allowCreate && creating && (
        <div style={{
          marginTop: 6, padding: '8px', borderRadius: 3,
          background: 'rgba(43,41,38,0.03)', border: '1px solid rgba(43,41,38,0.1)',
          display: 'flex', flexDirection: 'column', gap: 6,
        }}>
          <select
            value={newParentId}
            onChange={e => { setNewParentId(e.target.value); setCreateError(''); }}
            style={{ fontSize: '0.72rem' }}
          >
            <option value="">Where does it belong?…</option>
            {parentOptions.map(o => (
              <option key={o.id} value={o.id}>{'—'.repeat(o.depth)} {o.path}</option>
            ))}
          </select>
          <input
            value={newName}
            onChange={e => { setNewName(e.target.value); setCreateError(''); }}
            onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setCreating(false); }}
            placeholder={newLevel ? `New ${LEVEL_LABELS[newLevel]} name…` : 'Pick a parent first…'}
            disabled={!newParentId}
            style={{ fontSize: '0.75rem', padding: '3px 6px' }}
          />
          {createError && (
            <div style={{ fontSize: '0.66rem', color: '#7a2b2b' }}>{createError}</div>
          )}
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" className="btn btn-primary btn-sm" style={{ fontSize: '0.65rem' }}
              onClick={handleCreate} disabled={busy || !newName.trim() || !newParentId}>
              {busy ? 'Creating…' : 'Create & select'}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" style={{ fontSize: '0.65rem' }}
              onClick={() => { setCreating(false); setNewName(''); setCreateError(''); }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {helpText && (
        <div style={{ fontSize: '0.68rem', color: 'var(--charcoal-soft)', marginTop: 3 }}>{helpText}</div>
      )}

      {!loading && !options.length && (
        <div style={{ fontSize: '0.68rem', color: 'var(--charcoal-soft)', marginTop: 3 }}>
          No niches yet — add them under Collections → Niches.
        </div>
      )}
    </div>
  );
}

// Read-only path display, for cards and detail headers that show a
// classification without offering to change it.
export function NichePathLabel({ nicheId, fallback = 'Unclassified', style }) {
  const { niches } = useNiches();
  const niche = niches.find(n => n.id === nicheId);
  return (
    <span style={{ fontSize: '0.72rem', color: 'var(--charcoal-soft)', ...style }}>
      {niche ? nichePath(niche, niches) : fallback}
    </span>
  );
}
