import { useState, useMemo } from 'react';
import {
  useNiches, useNicheCollections, createNiche, updateNiche,
  archiveNiche, unarchiveNiche, deleteNiche, reparentNiche, recomputeNicheLevels,
} from '../lib/hooks';
import {
  buildNicheTree, LEVEL_LABELS, childLevelOf, canDeleteNiche,
  validateNicheName, flattenForPicker,
} from '../lib/niches';

// ─── Niche Tree — taxonomy admin (Phase 2b) ────────────────────────────────
// The §36 governance surface: add, rename, archive, reparent, delete. Lives as
// a tab on the Collections page rather than its own nav item, because the
// Phase 2c triage is a side-by-side job — "is this collection a niche, an
// aesthetic, or a product type?" — and tab-hopping would make it worse.
//
// Every destructive-ish action is explicit and reversible: archive is the
// default removal (unarchive restores), and delete is only offered for leaves
// with no children, matching the DB's ON DELETE RESTRICT.

const LEVEL_TINT = {
  broad:    { color: '#1e306b', bg: 'rgba(120,140,200,0.14)' },
  sub:      { color: '#2d6b3c', bg: 'rgba(124,175,138,0.16)' },
  specific: { color: '#7a4a1e', bg: 'rgba(232,168,124,0.18)' },
};

function LevelBadge({ level }) {
  const s = LEVEL_TINT[level] || LEVEL_TINT.specific;
  return (
    <span style={{
      fontSize: '0.58rem', fontWeight: 700, padding: '1px 6px', borderRadius: 10,
      background: s.bg, color: s.color, whiteSpace: 'nowrap', letterSpacing: '0.03em',
    }}>
      {LEVEL_LABELS[level] || level}
    </span>
  );
}

function NicheRow({
  node, depth, allNiches, collectionCount, collectionIdsByNicheId,
  expanded, onToggle, onChanged, onError,
}) {
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(node.name);
  const [addingChild, setAddingChild] = useState(false);
  const [childName, setChildName] = useState('');
  const [moving, setMoving] = useState(false);
  const [busy, setBusy] = useState(false);

  const isArchived = node.status === 'archived';
  const hasChildren = (node.children || []).length > 0;
  const canAddChild = !!childLevelOf(node);
  const deletable = canDeleteNiche(node.id, allNiches);

  // Every niche that could legally become this one's parent. planReparent()
  // is the real gate, but filtering the dropdown up front means the common
  // illegal choices (itself, its own descendants, a specific niche) are never
  // offered rather than being offered and then rejected.
  const moveTargets = useMemo(() => {
    return flattenForPicker(allNiches)
      .filter(o => o.id !== node.id)
      .filter(o => !!childLevelOf(o.node))
      .filter(o => (node.parent_id || null) !== o.id);
  }, [allNiches, node.id, node.parent_id]);

  async function handleRename() {
    const trimmed = draftName.trim();
    if (!trimmed || trimmed === node.name) { setRenaming(false); setDraftName(node.name); return; }
    const check = validateNicheName(trimmed, node.parent_id || null, allNiches, { excludeId: node.id });
    if (!check.ok) { onError(check.error); return; }
    setBusy(true);
    const { error } = await updateNiche(node.id, { name: trimmed });
    setBusy(false);
    if (error) { onError(error.message); return; }
    setRenaming(false);
    onChanged();
  }

  async function handleAddChild() {
    const trimmed = childName.trim();
    if (!trimmed) return;
    const check = validateNicheName(trimmed, node.id, allNiches);
    if (!check.ok) { onError(check.error); return; }
    setBusy(true);
    const { error, alreadyExisted } = await createNiche(trimmed, { parentId: node.id });
    setBusy(false);
    if (error) { onError(error.message); return; }
    if (alreadyExisted) onError(`"${trimmed}" already existed here — reusing it.`);
    setChildName('');
    setAddingChild(false);
    if (!expanded) onToggle();
    onChanged();
  }

  async function handleMove(targetId) {
    setMoving(false);
    setBusy(true);
    const { error, needsRepair } = await reparentNiche(node.id, targetId || null, allNiches);
    setBusy(false);
    if (error) {
      onError(needsRepair
        ? `${error.message} — some sub-niche levels may be out of step. Use "Repair levels" below.`
        : error.message);
      return;
    }
    onChanged();
  }

  async function handleArchiveToggle() {
    setBusy(true);
    const { error } = isArchived ? await unarchiveNiche(node.id) : await archiveNiche(node.id);
    setBusy(false);
    if (error) { onError(error.message); return; }
    onChanged();
  }

  async function handleDelete() {
    if (!deletable.ok) return;
    if (!window.confirm(`Delete "${node.name}"? This cannot be undone. Archive instead if you might want it back.`)) return;
    setBusy(true);
    const { error } = await deleteNiche(node.id);
    setBusy(false);
    if (error) { onError(error.message); return; }
    onChanged();
  }

  return (
    <div style={{ opacity: isArchived ? 0.5 : 1 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        padding: '7px 8px', paddingLeft: 8 + depth * 22,
        borderBottom: '1px solid rgba(43,41,38,0.07)',
        background: depth === 0 ? 'rgba(43,41,38,0.02)' : 'transparent',
      }}>
        <button
          onClick={onToggle}
          disabled={!hasChildren}
          aria-label={hasChildren ? (expanded ? 'Collapse' : 'Expand') : undefined}
          style={{
            border: 'none', background: 'transparent', cursor: hasChildren ? 'pointer' : 'default',
            width: 16, padding: 0, color: 'var(--charcoal-soft)',
            fontSize: '0.7rem', opacity: hasChildren ? 1 : 0.25,
          }}
        >
          {hasChildren ? (expanded ? '▾' : '▸') : '·'}
        </button>

        {renaming ? (
          <input
            autoFocus
            value={draftName}
            onChange={e => setDraftName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleRename();
              if (e.key === 'Escape') { setRenaming(false); setDraftName(node.name); }
            }}
            onBlur={handleRename}
            style={{ fontSize: '0.85rem', padding: '2px 6px', minWidth: 180 }}
          />
        ) : (
          <span
            onDoubleClick={() => !isArchived && setRenaming(true)}
            title={isArchived ? undefined : 'Double-click to rename'}
            style={{ fontSize: '0.85rem', fontWeight: depth === 0 ? 600 : 400, cursor: isArchived ? 'default' : 'text' }}
          >
            {node.name}
          </span>
        )}

        <LevelBadge level={node.level} />

        {node.source === 'taylor_90day' && (
          <span style={{ fontSize: '0.58rem', color: 'var(--charcoal-soft)', opacity: 0.75 }} title="From Taylor's 90-Day Challenge framework">
            Taylor
          </span>
        )}
        {node.source === 'tcc_extension' && (
          <span style={{ fontSize: '0.58rem', color: 'var(--charcoal-soft)', opacity: 0.75 }} title="TCC extension — not from the source framework (§38)">
            TCC
          </span>
        )}
        {isArchived && (
          <span style={{ fontSize: '0.58rem', color: 'var(--charcoal-soft)' }}>Archived</span>
        )}
        {collectionCount > 0 && (
          <span style={{ fontSize: '0.62rem', color: 'var(--charcoal-soft)' }}>
            {collectionCount} collection{collectionCount !== 1 ? 's' : ''}
          </span>
        )}

        <span style={{ flex: 1 }} />

        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {busy && <span style={{ fontSize: '0.62rem', color: 'var(--charcoal-soft)' }}>…</span>}
          {!isArchived && canAddChild && (
            <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.62rem', padding: '2px 6px' }}
              onClick={() => setAddingChild(v => !v)}>
              + Sub
            </button>
          )}
          {!isArchived && (
            <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.62rem', padding: '2px 6px' }}
              onClick={() => setMoving(v => !v)}>
              Move
            </button>
          )}
          <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.62rem', padding: '2px 6px' }}
            onClick={handleArchiveToggle}>
            {isArchived ? 'Restore' : 'Archive'}
          </button>
          <button
            className="btn btn-ghost btn-sm"
            style={{ fontSize: '0.62rem', padding: '2px 6px', opacity: deletable.ok ? 1 : 0.35 }}
            disabled={!deletable.ok}
            title={deletable.ok ? 'Delete permanently' : deletable.reason}
            onClick={handleDelete}
          >
            Delete
          </button>
        </div>
      </div>

      {moving && (
        <div style={{ paddingLeft: 8 + depth * 22 + 24, padding: '8px', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', background: 'rgba(43,41,38,0.02)' }}>
          <span style={{ fontSize: '0.7rem', color: 'var(--charcoal-soft)' }}>Move under:</span>
          <select
            defaultValue=""
            onChange={e => e.target.value !== '' && handleMove(e.target.value === '__root__' ? null : e.target.value)}
            style={{ fontSize: '0.72rem' }}
          >
            <option value="">Choose a destination…</option>
            {node.parent_id && <option value="__root__">— Make it a Broad Niche —</option>}
            {moveTargets.map(o => (
              <option key={o.id} value={o.id}>{'—'.repeat(o.depth)} {o.name}</option>
            ))}
          </select>
          <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.62rem' }} onClick={() => setMoving(false)}>Cancel</button>
        </div>
      )}

      {addingChild && (
        <div style={{ paddingLeft: 8 + depth * 22 + 24, padding: '8px', display: 'flex', gap: 6, alignItems: 'center', background: 'rgba(43,41,38,0.02)' }}>
          <input
            autoFocus
            value={childName}
            onChange={e => setChildName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleAddChild();
              if (e.key === 'Escape') { setAddingChild(false); setChildName(''); }
            }}
            placeholder={`New ${LEVEL_LABELS[childLevelOf(node)] || 'niche'} under ${node.name}…`}
            style={{ fontSize: '0.78rem', padding: '3px 6px', minWidth: 240 }}
          />
          <button className="btn btn-primary btn-sm" style={{ fontSize: '0.62rem' }} onClick={handleAddChild} disabled={!childName.trim()}>Add</button>
          <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.62rem' }} onClick={() => { setAddingChild(false); setChildName(''); }}>Cancel</button>
        </div>
      )}

      {expanded && (node.children || []).map(child => (
        <ConnectedRow
          key={child.id}
          node={child}
          depth={depth + 1}
          allNiches={allNiches}
          collectionIdsByNicheId={collectionIdsByNicheId}
          onChanged={onChanged}
          onError={onError}
        />
      ))}
    </div>
  );
}

// Thin wrapper so each row owns its own expand state without the parent having
// to hold a map of every node's open/closed state.
//
// collectionIdsByNicheId is threaded down as a prop rather than each row
// calling useNicheCollections() itself: that hook opens a realtime channel, so
// calling it per row would open one Supabase subscription per niche in the
// tree. It is called exactly once, in NicheTree below.
function ConnectedRow({ collectionIdsByNicheId, ...props }) {
  const [expanded, setExpanded] = useState(true);
  return (
    <NicheRow
      {...props}
      collectionIdsByNicheId={collectionIdsByNicheId}
      expanded={expanded}
      onToggle={() => setExpanded(v => !v)}
      collectionCount={(collectionIdsByNicheId[props.node.id] || []).length}
    />
  );
}

export default function NicheTree() {
  const { niches, loading, refetch } = useNiches();
  const { collectionIdsByNicheId } = useNicheCollections();
  const [showArchived, setShowArchived] = useState(false);
  const [addingRoot, setAddingRoot] = useState(false);
  const [rootName, setRootName] = useState('');
  const [error, setError] = useState('');
  const [repairing, setRepairing] = useState(false);
  const [search, setSearch] = useState('');

  const visible = showArchived ? niches : niches.filter(n => n.status !== 'archived');

  // Search matches on the full path, so typing "hockey" finds Hockey Mom and
  // typing "hobbies" finds everything beneath Hobbies. Matches are shown as a
  // flat list rather than a filtered tree — a filtered tree either hides
  // matched children whose parents did not match, or drags in unmatched
  // parents for context; a flat path list sidesteps the choice.
  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return null;
    return flattenForPicker(visible, { includeArchived: showArchived })
      .filter(o => o.path.toLowerCase().includes(q));
  }, [search, visible, showArchived]);

  const tree = useMemo(() => buildNicheTree(visible), [visible]);

  async function handleAddRoot() {
    const trimmed = rootName.trim();
    if (!trimmed) return;
    const check = validateNicheName(trimmed, null, niches);
    if (!check.ok) { setError(check.error); return; }
    const { error: err } = await createNiche(trimmed, { parentId: null });
    if (err) { setError(err.message); return; }
    setRootName('');
    setAddingRoot(false);
    setError('');
    refetch();
  }

  async function handleRepair() {
    setRepairing(true);
    const { error: err, fixed } = await recomputeNicheLevels();
    setRepairing(false);
    setError(err ? err.message : fixed ? `Repaired ${fixed} niche level${fixed !== 1 ? 's' : ''}.` : 'Everything already in order.');
    refetch();
  }

  const counts = ['broad', 'sub', 'specific'].map(l => ({
    level: l, n: niches.filter(x => x.level === l && x.status !== 'archived').length,
  }));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: '0.75rem', color: 'var(--charcoal-soft)' }}>
          {counts.map(c => `${c.n} ${LEVEL_LABELS[c.level].toLowerCase()}${c.n !== 1 ? 's' : ''}`).join(' · ')}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search niches…"
            style={{ fontSize: '0.75rem', padding: '3px 8px', minWidth: 160 }}
          />
          <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.68rem' }} onClick={() => setShowArchived(v => !v)}>
            {showArchived ? 'Hide archived' : 'Show archived'}
          </button>
          <button className="btn btn-primary btn-sm" style={{ fontSize: '0.68rem' }} onClick={() => setAddingRoot(v => !v)}>
            + Broad Niche
          </button>
        </div>
      </div>

      {error && (
        <div style={{
          fontSize: '0.75rem', padding: '7px 10px', marginBottom: 10, borderRadius: 3,
          background: 'rgba(201,123,123,0.12)', color: '#7a2b2b',
          display: 'flex', justifyContent: 'space-between', gap: 8,
        }}>
          <span>{error}</span>
          <button onClick={() => setError('')} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'inherit' }}>×</button>
        </div>
      )}

      {addingRoot && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 10 }}>
          <input
            autoFocus
            value={rootName}
            onChange={e => setRootName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleAddRoot();
              if (e.key === 'Escape') { setAddingRoot(false); setRootName(''); }
            }}
            placeholder="New broad niche…"
            style={{ fontSize: '0.8rem', padding: '4px 8px', minWidth: 220 }}
          />
          <button className="btn btn-primary btn-sm" style={{ fontSize: '0.68rem' }} onClick={handleAddRoot} disabled={!rootName.trim()}>Add</button>
          <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.68rem' }} onClick={() => { setAddingRoot(false); setRootName(''); }}>Cancel</button>
        </div>
      )}

      {loading && <div style={{ color: 'var(--charcoal-soft)', fontSize: '0.85rem' }}>Loading…</div>}

      {!loading && !niches.length && (
        <div style={{ fontSize: '0.82rem', color: 'var(--charcoal-soft)', padding: '20px 0' }}>
          No niches yet. If you have run the Phase 2a migration, the ten broad niches should be here —
          if this is empty, the migration has not been applied to this database.
        </div>
      )}

      {searchResults ? (
        <div style={{ border: '1px solid rgba(43,41,38,0.1)', borderRadius: 2 }}>
          {!searchResults.length && (
            <div style={{ padding: 14, fontSize: '0.8rem', color: 'var(--charcoal-soft)' }}>No niches match “{search}”.</div>
          )}
          {searchResults.map(o => (
            <div key={o.id} style={{ padding: '7px 10px', borderBottom: '1px solid rgba(43,41,38,0.07)', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.8rem' }}>{o.path}</span>
              <LevelBadge level={o.level} />
            </div>
          ))}
          <div style={{ padding: '7px 10px', fontSize: '0.7rem', color: 'var(--charcoal-soft)' }}>
            Clear the search to edit the tree.
          </div>
        </div>
      ) : (
        <div style={{ border: '1px solid rgba(43,41,38,0.1)', borderRadius: 2 }}>
          {tree.map(root => (
            <ConnectedRow
              key={root.id}
              node={root}
              depth={0}
              allNiches={niches}
              collectionIdsByNicheId={collectionIdsByNicheId}
              onChanged={refetch}
              onError={setError}
            />
          ))}
        </div>
      )}

      <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ fontSize: '0.68rem', color: 'var(--charcoal-soft)' }}>
          Double-click a name to rename. Archive is reversible; delete is only offered for niches with no sub-niches.
        </div>
        <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.62rem' }} onClick={handleRepair} disabled={repairing}>
          {repairing ? 'Repairing…' : 'Repair levels'}
        </button>
      </div>
    </div>
  );
}

export { LevelBadge };
