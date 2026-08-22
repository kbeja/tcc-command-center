// Phase 2b — niche taxonomy tree logic. Scoped to the reparenting/validation
// rules, following the same house convention as productTruth.test.js and
// listingSEO.test.js: cover the one correctness-critical deterministic module
// rather than testing everything. Reparenting is the risk here — it mutates a
// whole subtree, and the two failure modes it prevents (an orphan cycle, and a
// subtree pushed past 'specific') are both silent and hard to undo.
import { describe, it, expect } from 'vitest';
import {
  LEVELS, childLevelOf, buildNicheTree, ancestorsOf, nichePath,
  descendantsOf, subtreeHeight, findSiblingConflict, validateNicheName,
  planReparent, canDeleteNiche, flattenForPicker,
} from './niches.js';

// Hobbies → Hockey → {Hockey Mom, Hockey Fan}
//         → Reading → Kid Reader
// Pets    → Pet Owners
// Seasonal (leaf)
const NICHES = [
  { id: 'hob', name: 'Hobbies',    level: 'broad',    parent_id: null,  status: 'active' },
  { id: 'pet', name: 'Pets',       level: 'broad',    parent_id: null,  status: 'active' },
  { id: 'sea', name: 'Seasonal',   level: 'broad',    parent_id: null,  status: 'active' },
  { id: 'hoc', name: 'Hockey',     level: 'sub',      parent_id: 'hob', status: 'active' },
  { id: 'rea', name: 'Reading',    level: 'sub',      parent_id: 'hob', status: 'active' },
  { id: 'own', name: 'Pet Owners', level: 'sub',      parent_id: 'pet', status: 'active' },
  { id: 'hom', name: 'Hockey Mom', level: 'specific', parent_id: 'hoc', status: 'active' },
  { id: 'hof', name: 'Hockey Fan', level: 'specific', parent_id: 'hoc', status: 'active' },
  { id: 'kid', name: 'Kid Reader', level: 'specific', parent_id: 'rea', status: 'active' },
];

describe('levels', () => {
  it('gives a new root the broad level', () => {
    expect(childLevelOf(null)).toBe('broad');
  });

  it('steps down one level per generation', () => {
    expect(childLevelOf({ level: 'broad' })).toBe('sub');
    expect(childLevelOf({ level: 'sub' })).toBe('specific');
  });

  it('refuses to go deeper than specific', () => {
    expect(childLevelOf({ level: 'specific' })).toBe(null);
  });
});

describe('buildNicheTree', () => {
  it('nests children under parents and sorts by name', () => {
    const tree = buildNicheTree(NICHES);
    expect(tree.map(n => n.name)).toEqual(['Hobbies', 'Pets', 'Seasonal']);
    const hobbies = tree[0];
    expect(hobbies.children.map(n => n.name)).toEqual(['Hockey', 'Reading']);
    expect(hobbies.children[0].children.map(n => n.name)).toEqual(['Hockey Fan', 'Hockey Mom']);
  });

  it('surfaces a node whose parent is missing as a root rather than dropping it', () => {
    const orphan = { id: 'x', name: 'Orphan', level: 'sub', parent_id: 'gone', status: 'active' };
    const tree = buildNicheTree([...NICHES, orphan]);
    expect(tree.map(n => n.name)).toContain('Orphan');
  });
});

describe('paths', () => {
  it('builds a root-first path', () => {
    const hom = NICHES.find(n => n.id === 'hom');
    expect(nichePath(hom, NICHES)).toBe('Hobbies → Hockey → Hockey Mom');
  });

  it('returns just the name for a broad niche', () => {
    expect(nichePath(NICHES.find(n => n.id === 'hob'), NICHES)).toBe('Hobbies');
  });

  it('terminates on a cycle instead of hanging', () => {
    const cyclic = [
      { id: 'a', name: 'A', level: 'sub', parent_id: 'b', status: 'active' },
      { id: 'b', name: 'B', level: 'sub', parent_id: 'a', status: 'active' },
    ];
    expect(ancestorsOf(cyclic[0], cyclic).length).toBeLessThanOrEqual(LEVELS.length + 1);
  });
});

describe('descendants', () => {
  it('collects the whole subtree, excluding the node itself', () => {
    expect(descendantsOf('hob', NICHES).map(n => n.id).sort())
      .toEqual(['hoc', 'hof', 'hom', 'kid', 'rea']);
  });

  it('returns nothing for a leaf', () => {
    expect(descendantsOf('hom', NICHES)).toEqual([]);
  });

  it('measures subtree height in edges', () => {
    expect(subtreeHeight('hob', NICHES)).toBe(2);
    expect(subtreeHeight('hoc', NICHES)).toBe(1);
    expect(subtreeHeight('hom', NICHES)).toBe(0);
  });
});

describe('sibling name uniqueness', () => {
  it('catches a case-insensitive duplicate under the same parent', () => {
    expect(findSiblingConflict('hockey', 'hob', NICHES)?.id).toBe('hoc');
    expect(validateNicheName('HOCKEY', 'hob', NICHES).ok).toBe(false);
  });

  it('allows the same name under a different parent', () => {
    expect(validateNicheName('Hockey', 'pet', NICHES).ok).toBe(true);
  });

  it('allows a node to keep its own name when editing', () => {
    expect(validateNicheName('Hockey', 'hob', NICHES, { excludeId: 'hoc' }).ok).toBe(true);
  });

  it('treats two broad niches as siblings even though both have a null parent', () => {
    // The DB relies on COALESCE(parent_id, sentinel) for exactly this case,
    // because NULL <> NULL would otherwise let duplicates through.
    expect(validateNicheName('Pets', null, NICHES).ok).toBe(false);
  });

  it('rejects an empty name', () => {
    expect(validateNicheName('   ', 'hob', NICHES).ok).toBe(false);
  });
});

describe('planReparent', () => {
  it('moves a sub-niche to another broad niche and keeps its level', () => {
    const plan = planReparent('own', 'hob', NICHES);
    expect(plan.ok).toBe(true);
    expect(plan.updates).toEqual([{ id: 'own', parent_id: 'hob', level: 'sub' }]);
  });

  it('promotes a sub-niche to broad and demotes nothing else when it is a leaf', () => {
    const plan = planReparent('own', null, NICHES);
    expect(plan.ok).toBe(true);
    expect(plan.updates[0]).toEqual({ id: 'own', parent_id: null, level: 'broad' });
  });

  it('shifts every descendant level when the moved node changes depth', () => {
    // Hockey (sub, with specific children) promoted to broad: children become sub.
    const plan = planReparent('hoc', null, NICHES);
    expect(plan.ok).toBe(true);
    expect(plan.updates).toContainEqual({ id: 'hoc', parent_id: null, level: 'broad' });
    expect(plan.updates).toContainEqual({ id: 'hom', level: 'sub' });
    expect(plan.updates).toContainEqual({ id: 'hof', level: 'sub' });
  });

  it('refuses to move a node under its own descendant', () => {
    const plan = planReparent('hoc', 'hom', NICHES);
    expect(plan.ok).toBe(false);
    expect(plan.error).toMatch(/own sub-niches/i);
    expect(plan.updates).toEqual([]);
  });

  it('refuses to make a node its own parent', () => {
    expect(planReparent('hoc', 'hoc', NICHES).ok).toBe(false);
  });

  it('refuses a move that would push descendants past specific', () => {
    // Hockey has specific-level children, so it cannot sit under another sub.
    const plan = planReparent('hoc', 'rea', NICHES);
    expect(plan.ok).toBe(false);
    expect(plan.error).toMatch(/past Specific Niche/i);
  });

  it('allows a leaf sub-niche to move under another sub-niche', () => {
    const plan = planReparent('own', 'rea', NICHES);
    expect(plan.ok).toBe(true);
    expect(plan.updates).toEqual([{ id: 'own', parent_id: 'rea', level: 'specific' }]);
  });

  it('refuses to nest anything under a specific niche', () => {
    const plan = planReparent('own', 'hom', NICHES);
    expect(plan.ok).toBe(false);
    expect(plan.error).toMatch(/deepest level/i);
  });

  it('refuses a move that would collide with an existing sibling name', () => {
    const extra = { id: 'hoc2', name: 'Hockey', level: 'sub', parent_id: 'pet', status: 'active' };
    const plan = planReparent('hoc2', 'hob', [...NICHES, extra]);
    expect(plan.ok).toBe(false);
    expect(plan.error).toMatch(/already exists/i);
  });

  it('is a no-op when nothing would change', () => {
    expect(planReparent('hoc', 'hob', NICHES).ok).toBe(false);
  });
});

describe('canDeleteNiche', () => {
  it('allows deleting a leaf', () => {
    expect(canDeleteNiche('hom', NICHES).ok).toBe(true);
  });

  it('blocks deleting a node with children, and says why', () => {
    const r = canDeleteNiche('hoc', NICHES);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/2 sub-niches/);
  });
});

describe('flattenForPicker', () => {
  it('lists parents before children with full paths', () => {
    const flat = flattenForPicker(NICHES);
    const ids = flat.map(f => f.id);
    expect(ids.indexOf('hob')).toBeLessThan(ids.indexOf('hoc'));
    expect(ids.indexOf('hoc')).toBeLessThan(ids.indexOf('hom'));
    expect(flat.find(f => f.id === 'hom').path).toBe('Hobbies → Hockey → Hockey Mom');
    expect(flat.find(f => f.id === 'hom').depth).toBe(2);
  });

  it('excludes archived niches by default', () => {
    const withArchived = [...NICHES, { id: 'old', name: 'Old', level: 'broad', parent_id: null, status: 'archived' }];
    expect(flattenForPicker(withArchived).map(f => f.id)).not.toContain('old');
    expect(flattenForPicker(withArchived, { includeArchived: true }).map(f => f.id)).toContain('old');
  });

  it('does not strand the children of an archived parent', () => {
    // Archiving a parent hides it from the picker; its children must still be
    // reachable rather than vanishing along with it.
    const archivedParent = NICHES.map(n => n.id === 'hoc' ? { ...n, status: 'archived' } : n);
    const flat = flattenForPicker(archivedParent);
    expect(flat.map(f => f.id)).toContain('hom');
  });
});
