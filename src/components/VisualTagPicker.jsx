import { useState } from 'react';
import { TAG_KINDS, tagKindLabel, tagKindStyle, groupTagsByKind } from '../data/tagKinds';

// Shared visual-tag picker — autocomplete over the existing vocabulary, with
// an inline "+ Create ..." option when nothing matches. This is the expected
// shape for a real, growing taxonomy (not a fixed dropdown). Presentational/
// controlled only — owns no data fetching or mutation, matching how
// CollectionKnowledge.jsx and ConceptChatImport.jsx's own Field component
// stay props-driven.
//
// onAdd receives either an existing tag object ({ id, name }) when the user
// picks a suggestion, or a bare { name } (no id) when they choose
// "+ Create ...". The caller decides what "add" means: ConceptWorkspace.jsx
// and CollectionDetail.jsx call createVisualTag()+applyTagTo*() immediately
// (the parent entity already has a real id); ConceptChatImport.jsx just
// pushes the name into local state and defers both calls until handleSave()
// has a real concept id — mirrors exactly how it already defers saving
// kittl_prompt as a concept_output until after createConcept() succeeds.
export default function VisualTagPicker({ allTags, appliedTags, onAdd, onRemove, dark = false }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const appliedIds = new Set(appliedTags.filter(t => t.id).map(t => t.id));
  const appliedNamesLower = new Set(appliedTags.map(t => t.name.toLowerCase()));

  const q = query.trim().toLowerCase();
  const suggestions = q
    ? allTags.filter(t => !appliedIds.has(t.id) && t.name.toLowerCase().includes(q)).slice(0, 8)
    : [];
  const exactMatch = q ? allTags.some(t => t.name.toLowerCase() === q) : true;
  const showCreateOption = q && !exactMatch && !appliedNamesLower.has(q);

  const palette = dark
    ? { bg: '#111', border: '#333', text: '#e5e5e5', pillBg: 'rgba(124,175,138,0.15)', pillText: '#86efac', createText: '#86efac' }
    : { bg: 'var(--warm-white)', border: 'rgba(43,41,38,0.2)', text: 'var(--warm-charcoal)', pillBg: 'rgba(124,175,138,0.15)', pillText: '#2d6b3c', createText: '#2d6b3c' };

  function pick(tag) {
    onAdd(tag);
    setQuery('');
    setOpen(false);
  }

  function handleKeyDown(e) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    // Enter picks the top suggestion, but never CREATES — a new tag needs a
    // kind chosen explicitly, and silently creating an unsorted one on Enter
    // is how the pool became 54 unclassified tags in the first place.
    if (suggestions[0]) pick(suggestions[0]);
  }

  return (
    <div>
      {appliedTags.length > 0 && groupTagsByKind(appliedTags).map(group => (
        <div key={group.kind} style={{ marginBottom: 8 }}>
          <div style={{ fontSize: '0.6rem', letterSpacing: '0.06em', textTransform: 'uppercase', color: palette.text, opacity: 0.5, marginBottom: 3 }}>
            {group.label}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {group.tags.map(t => (
            <span key={t.id || t.name} style={{
              display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.72rem',
              padding: '3px 6px 3px 10px', borderRadius: 20,
              // Dark mode keeps the single palette pill — the four kind tints
              // were chosen against the light background and lose contrast on
              // black, and the group heading already says which kind it is.
              ...(dark ? { background: palette.pillBg, color: palette.pillText } : tagKindStyle(t.kind)),
            }}>
              {t.name}
              <button type="button" onClick={() => onRemove(t)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', opacity: 0.6, fontSize: '0.8rem', lineHeight: 1, padding: 0 }}>
                ×
              </button>
            </span>
          ))}
          </div>
        </div>
      ))}
      <div style={{ position: 'relative' }}>
        <input
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={handleKeyDown}
          placeholder="Add a visual tag…"
          style={{
            width: '100%', padding: '6px 10px', borderRadius: 5, fontSize: 13,
            border: `1px solid ${palette.border}`, background: palette.bg, color: palette.text, boxSizing: 'border-box',
          }}
        />
        {open && (suggestions.length > 0 || showCreateOption) && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, marginTop: 2,
            border: `1px solid ${palette.border}`, background: palette.bg, borderRadius: 5,
            maxHeight: 180, overflowY: 'auto',
          }}>
            {suggestions.map(t => (
              <div key={t.id} onMouseDown={() => pick(t)}
                style={{ padding: '6px 10px', fontSize: 13, cursor: 'pointer', color: palette.text, display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                <span>{t.name}</span>
                <span style={{ fontSize: '0.6rem', opacity: 0.6, whiteSpace: 'nowrap' }}>{tagKindLabel(t.kind)}</span>
              </div>
            ))}
            {showCreateOption && (
              <div style={{ padding: '6px 10px', fontSize: 13, color: palette.createText }}>
                <div style={{ marginBottom: 4 }}>+ Create &ldquo;{query.trim()}&rdquo; as:</div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {TAG_KINDS.map(k => (
                    <button key={k} type="button"
                      onMouseDown={() => pick({ name: query.trim(), kind: k })}
                      style={{
                        fontSize: '0.65rem', padding: '2px 8px', borderRadius: 20,
                        border: 'none', cursor: 'pointer', ...tagKindStyle(k),
                      }}>
                      {tagKindLabel(k)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
