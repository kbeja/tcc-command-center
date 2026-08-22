import { useMemo } from 'react';
import { useNiches } from '../lib/hooks';
import { flattenForPicker, nichePath, LEVEL_LABELS } from '../lib/niches';

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
}) {
  const { niches, loading } = useNiches();

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
