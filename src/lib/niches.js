// ─── Niche Taxonomy — pure tree logic (Phase 2b) ───────────────────────────
// Pure, deterministic, no DB/AI calls — same house style as
// keywordIntelligence.js / listingSEO.js / productTruth.js.
//
// The taxonomy is Broad → Sub → Specific, stored as a self-referencing
// adjacency list (see supabase/migrations/20260822_niche_taxonomy_phase2a.sql
// for why one table rather than three). `level` is stored on the row rather
// than derived by walking parents, which makes "all specific niches" a plain
// filter — but it also means level and actual depth can drift if anything
// writes carelessly. Every mutation helper here recomputes level from depth so
// that can't happen through the UI.
//
// The interesting problem in this file is reparenting. Moving a node moves its
// whole subtree, which means:
//   1. every descendant's level shifts by the same delta, and
//   2. the move must be rejected if that would push any descendant past
//      'specific' — the tree is exactly three levels deep by design.
//   3. a node can never be moved under its own descendant (that silently
//      severs the subtree from the root and creates an orphan cycle the DB's
//      FK cannot catch, since parent_id → niches.id is satisfied either way).
// planReparent() is the single place all three are enforced.

export const LEVELS = ['broad', 'sub', 'specific'];

export const LEVEL_LABELS = {
  broad: 'Broad Niche',
  sub: 'Sub-Niche',
  specific: 'Specific Niche',
};

export const MAX_DEPTH = LEVELS.length;

// Depth is the index into LEVELS: broad=0, sub=1, specific=2.
export function levelForDepth(depth) {
  return LEVELS[depth] ?? null;
}

export function depthForLevel(level) {
  const i = LEVELS.indexOf(level);
  return i === -1 ? null : i;
}

// The level a new child of `parent` would get. null parent → a new broad
// niche. Returns null when the parent is already at max depth, which callers
// use to disable "add child" rather than to signal an error.
export function childLevelOf(parent) {
  if (!parent) return LEVELS[0];
  const d = depthForLevel(parent.level);
  if (d == null) return null;
  return levelForDepth(d + 1);
}

function indexById(niches) {
  const byId = new Map();
  for (const n of niches || []) byId.set(n.id, n);
  return byId;
}

// ── Tree shape ─────────────────────────────────────────────────────────────
// Returns roots, each with a `children` array, sorted by name at every level.
// Nodes whose parent_id points at something not in the input (archived-and-
// filtered-out, or mid-fetch) are surfaced as roots rather than silently
// dropped — losing a node from the UI entirely is worse than showing it in the
// wrong place, because an invisible node can't be fixed by the person looking
// at the screen.
export function buildNicheTree(niches) {
  const list = niches || [];
  const byId = indexById(list);
  const childrenOf = new Map();
  const roots = [];

  for (const n of list) {
    if (n.parent_id && byId.has(n.parent_id)) {
      if (!childrenOf.has(n.parent_id)) childrenOf.set(n.parent_id, []);
      childrenOf.get(n.parent_id).push(n);
    } else {
      roots.push(n);
    }
  }

  const byName = (a, b) => (a.name || '').localeCompare(b.name || '');
  const attach = node => ({
    ...node,
    children: (childrenOf.get(node.id) || []).sort(byName).map(attach),
  });

  return roots.sort(byName).map(attach);
}

// ── Paths ──────────────────────────────────────────────────────────────────
// Ancestor chain, root first, including the node itself. Defends against a
// cycle in stored data (which planReparent prevents but a hand-written SQL
// edit could still create) by bounding the walk at MAX_DEPTH — an unbounded
// walk here would hang the whole page.
export function ancestorsOf(niche, niches) {
  const byId = indexById(niches);
  const chain = [];
  let cur = niche;
  const seen = new Set();
  while (cur && chain.length <= MAX_DEPTH && !seen.has(cur.id)) {
    seen.add(cur.id);
    chain.unshift(cur);
    cur = cur.parent_id ? byId.get(cur.parent_id) : null;
  }
  return chain;
}

export function nichePath(niche, niches, separator = ' → ') {
  if (!niche) return '';
  return ancestorsOf(niche, niches).map(n => n.name).join(separator);
}

// ── Descendants ────────────────────────────────────────────────────────────
// Every node beneath `id`, excluding the node itself. Iterative, and guarded
// against cycles for the same reason as ancestorsOf.
export function descendantsOf(id, niches) {
  const childrenOf = new Map();
  for (const n of niches || []) {
    if (!n.parent_id) continue;
    if (!childrenOf.has(n.parent_id)) childrenOf.set(n.parent_id, []);
    childrenOf.get(n.parent_id).push(n);
  }
  const out = [];
  const seen = new Set([id]);
  const queue = [...(childrenOf.get(id) || [])];
  while (queue.length) {
    const n = queue.shift();
    if (seen.has(n.id)) continue;
    seen.add(n.id);
    out.push(n);
    queue.push(...(childrenOf.get(n.id) || []));
  }
  return out;
}

// Height of the subtree rooted at `id`, in edges. A leaf is 0.
export function subtreeHeight(id, niches) {
  const descendants = descendantsOf(id, niches);
  if (!descendants.length) return 0;
  const byId = indexById(niches);
  const depthFromRoot = node => ancestorsOf(node, niches).length;
  const base = depthFromRoot(byId.get(id));
  return Math.max(...descendants.map(d => depthFromRoot(d) - base));
}

// ── Naming ─────────────────────────────────────────────────────────────────
// Sibling uniqueness, case-insensitive — mirrors the DB's COALESCE(parent_id,
// sentinel) + lower(name) unique index. Checked here so the user gets a
// sentence instead of a Postgres unique-violation, not instead of the index:
// the index stays the actual guarantee.
export function findSiblingConflict(name, parentId, niches, { excludeId = null } = {}) {
  const trimmed = (name || '').trim().toLowerCase();
  if (!trimmed) return null;
  return (niches || []).find(n =>
    n.id !== excludeId &&
    (n.parent_id || null) === (parentId || null) &&
    (n.name || '').trim().toLowerCase() === trimmed
  ) || null;
}

export function validateNicheName(name, parentId, niches, { excludeId = null } = {}) {
  const trimmed = (name || '').trim();
  if (!trimmed) return { ok: false, error: 'Name is required.' };
  const conflict = findSiblingConflict(trimmed, parentId, niches, { excludeId });
  if (conflict) {
    return { ok: false, error: `"${conflict.name}" already exists at this level.` };
  }
  return { ok: true, error: null };
}

// ── Reparenting ────────────────────────────────────────────────────────────
// Returns { ok, error, updates } where updates is the complete list of rows to
// write: the moved node plus every descendant whose level shifts. Callers
// write exactly what this returns and nothing else, so the level column can
// never drift out of sync with actual depth.
//
// newParentId null means "promote to a broad niche".
export function planReparent(nicheId, newParentId, niches) {
  const byId = indexById(niches);
  const niche = byId.get(nicheId);
  if (!niche) return { ok: false, error: 'Niche not found.', updates: [] };

  const currentParentId = niche.parent_id || null;
  const targetParentId = newParentId || null;
  if (currentParentId === targetParentId) {
    return { ok: false, error: 'Already in that position.', updates: [] };
  }

  if (targetParentId === nicheId) {
    return { ok: false, error: 'A niche cannot be its own parent.', updates: [] };
  }

  const descendants = descendantsOf(nicheId, niches);
  if (targetParentId && descendants.some(d => d.id === targetParentId)) {
    return {
      ok: false,
      error: 'Cannot move a niche underneath one of its own sub-niches.',
      updates: [],
    };
  }

  const newParent = targetParentId ? byId.get(targetParentId) : null;
  if (targetParentId && !newParent) {
    return { ok: false, error: 'Destination niche not found.', updates: [] };
  }

  const newLevel = childLevelOf(newParent);
  if (!newLevel) {
    return {
      ok: false,
      error: `${LEVEL_LABELS[newParent.level] || 'That niche'} is already the deepest level — it cannot take sub-niches.`,
      updates: [],
    };
  }

  // Would the subtree overflow? The moved node lands at newDepth; its deepest
  // descendant lands that much lower again.
  const newDepth = depthForLevel(newLevel);
  const height = subtreeHeight(nicheId, niches);
  if (newDepth + height >= MAX_DEPTH) {
    return {
      ok: false,
      error: `Moving this would push its sub-niches past ${LEVEL_LABELS.specific} — the taxonomy is only ${MAX_DEPTH} levels deep. Move or archive the sub-niches first.`,
      updates: [],
    };
  }

  const delta = newDepth - depthForLevel(niche.level);
  const updates = [{ id: niche.id, parent_id: targetParentId, level: newLevel }];
  if (delta !== 0) {
    for (const d of descendants) {
      const shifted = levelForDepth(depthForLevel(d.level) + delta);
      if (shifted) updates.push({ id: d.id, level: shifted });
    }
  }

  const nameCheck = validateNicheName(niche.name, targetParentId, niches, { excludeId: nicheId });
  if (!nameCheck.ok) return { ok: false, error: nameCheck.error, updates: [] };

  return { ok: true, error: null, updates };
}

// ── Deletion ───────────────────────────────────────────────────────────────
// The DB's ON DELETE RESTRICT on parent_id already refuses to delete a node
// with children. This gives the UI the same answer up front, plus the reason,
// so the button can be disabled rather than producing a raw FK error. §36 asks
// for archive as the normal path; delete stays available only for real
// mistakes, and only for leaves.
export function canDeleteNiche(nicheId, niches) {
  const children = (niches || []).filter(n => n.parent_id === nicheId);
  if (children.length) {
    return {
      ok: false,
      reason: `Has ${children.length} sub-niche${children.length !== 1 ? 's' : ''}. Archive it instead, or move them first.`,
    };
  }
  return { ok: true, reason: null };
}

// ── Flattening for pickers ─────────────────────────────────────────────────
// Depth-first, parents before children, each entry carrying its full path —
// the shape a <select> or a searchable list wants. Archived niches are
// excluded unless includeArchived, because a picker offering archived options
// is how archived branches quietly come back to life.
export function flattenForPicker(niches, { includeArchived = false } = {}) {
  const visible = (niches || []).filter(n => includeArchived || n.status !== 'archived');
  const out = [];
  const walk = (nodes, depth) => {
    for (const n of nodes) {
      out.push({
        id: n.id,
        name: n.name,
        level: n.level,
        depth,
        status: n.status,
        path: nichePath(n, visible),
        node: n,
      });
      walk(n.children || [], depth + 1);
    }
  };
  walk(buildNicheTree(visible), 0);
  return out;
}

// ── Inherited niches — which niches' keywords a listing may draw on ────────
// A listing classified to a SPECIFIC niche should see the general terms of the
// market above it: a Hockey Mom listing wants "hockey mom", "hockey gifts" and
// "hockey ornament", and those are linked at Hockey, one level up.
//
// This exists because the Listing Builder matched niche ids EXACTLY. Every
// Hockey product is classified to a child (Hockey Mom, Hockey Fan, Hockey
// Girlfriend) while every keyword link sits on the Hockey parent, so not one
// of the links reached any of the products. The classification work produced
// nothing at the only moment it mattered.
//
// UPWARD ONLY. Descendants are deliberately excluded: a Hockey Mom listing
// must not inherit Hockey Girlfriend's terms. Specific inherits general;
// siblings never bleed into each other.
//
// BROAD ANCESTORS ARE EXCLUDED, and that is the load-bearing part. A broad
// niche is a category, not a market — "Seasonal" currently holds 63 keywords
// spanning every holiday of the year. Walking the full chain would pour all of
// them into a Halloween listing, pre-selected, which is precisely the silent
// wrong-default this codebase keeps having to remove. A niche classified
// directly to a broad niche still gets its own keywords: the rule filters
// ANCESTORS, never the niche itself.
export function inheritedNicheIds(nicheId, niches) {
  if (!nicheId) return [];
  const self = (niches || []).find(n => n.id === nicheId);
  if (!self) return [nicheId];
  return ancestorsOf(self, niches)
    .filter(n => n.id === nicheId || n.level !== 'broad')
    .map(n => n.id);
}
