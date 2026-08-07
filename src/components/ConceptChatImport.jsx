import { useState } from 'react';
import { createConcept, createConceptOutput, setCurrentOutput, generateConceptCode, useCollectionObjects, useChapters, createCollection } from '../lib/hooks';

const SEASONS = ['Halloween', 'Christmas', "Valentine's Day", "Mother's Day", 'Back to School', 'Summer', 'Spring', 'Fall'];

// ── Parse --- TCC CONCEPT --- paste block ────────────────────────────────────

function parsePasteBlock(raw) {
  const text = raw.trim();
  if (!text.includes('--- TCC CONCEPT ---')) return null;

  const lines = text.split('\n').map(l => l.trim());
  const get = (label) => {
    const line = lines.find(l => l.toLowerCase().startsWith(label.toLowerCase() + ':'));
    return line ? line.slice(label.length + 1).trim() : '';
  };
  const getArray = (label) => {
    const val = get(label);
    if (!val) return [];
    return val.split(',').map(s => s.trim()).filter(Boolean);
  };

  // Extract Kittl Prompt section (may be multi-line until next section or end)
  const kittlIdx = lines.findIndex(l => l.toLowerCase().startsWith('kittl prompt:'));
  let kittlPrompt = '';
  if (kittlIdx !== -1) {
    const firstLine = lines[kittlIdx].slice('kittl prompt:'.length).trim();
    const rest = [];
    for (let i = kittlIdx + 1; i < lines.length; i++) {
      if (lines[i].match(/^[A-Z][a-zA-Z ]+:/)) break;
      if (lines[i]) rest.push(lines[i]);
    }
    kittlPrompt = [firstLine, ...rest].join(' ').trim();
  }

  return {
    name: get('Concept Name') || get('Name'),
    collection_name: get('Collection'),
    design_direction: get('Design Direction'),
    target_customer: get('Target Customer'),
    visual_style: get('Visual Style'),
    color_palette: get('Color Palette'),
    typography_notes: get('Typography') || get('Typography Notes'),
    mood_keywords: getArray('Mood Keywords') || getArray('Mood'),
    product_types: getArray('Product Types') || getArray('Products'),
    seasonal_flag: get('Seasonal') || get('Seasonal Flag'),
    emotional_trigger: get('Emotional Trigger'),
    kittl_prompt: kittlPrompt,
    raw_import: raw,
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ConceptChatImport({ onSaved, onClose }) {
  const { collections: collectionObjects } = useCollectionObjects();
  const { chapters } = useChapters();
  const [paste, setPaste] = useState('');
  const [parsed, setParsed] = useState(null);
  const [parseError, setParseError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savedConceptData, setSavedConceptData] = useState(null);
  const [saveError, setSaveError] = useState('');
  const [editedConcept, setEditedConcept] = useState(null);

  // Collection selection — separate from editedConcept.collection_name because
  // it can be either an existing collection or '__new__' with its own draft
  // fields (style guide, season…), only materialized into a real row on save.
  const [collectionChoice, setCollectionChoice] = useState('');
  const [newCollectionName, setNewCollectionName] = useState('');
  const [newCollectionChapter, setNewCollectionChapter] = useState('');
  const [newCollectionStyleGuide, setNewCollectionStyleGuide] = useState('');
  const [newCollectionSeason, setNewCollectionSeason] = useState('');
  const [newCollectionLaunch, setNewCollectionLaunch] = useState('');

  function handleParse() {
    setParseError('');
    setParsed(null);
    setEditedConcept(null);
    const result = parsePasteBlock(paste);
    if (!result) {
      setParseError('Could not find "--- TCC CONCEPT ---" block. Make sure to copy the full block from ChatGPT including the header.');
      return;
    }
    if (!result.name) {
      setParseError('Missing "Concept Name:" field in the paste block.');
      return;
    }
    if (!result.collection_name) {
      setParseError('Missing "Collection:" field. Which collection does this concept belong to?');
      return;
    }
    setParsed(result);
    setEditedConcept({ ...result });

    // Seed the collection picker from whatever text was in the paste — if it
    // matches a real collection, select it; otherwise default to creating a
    // new one with that name (the brand-new-collection case).
    const matched = collectionObjects.find(c => c.name.toLowerCase() === result.collection_name.toLowerCase());
    if (matched) {
      setCollectionChoice(matched.name);
      setNewCollectionName('');
    } else {
      setCollectionChoice('__new__');
      setNewCollectionName(result.collection_name);
    }
    setNewCollectionChapter('');
    setNewCollectionStyleGuide('');
    setNewCollectionSeason('');
    setNewCollectionLaunch('');
  }

  function handleFieldChange(field, value) {
    setEditedConcept(prev => ({ ...prev, [field]: value }));
  }

  async function handleSave() {
    setSaving(true);
    setSaveError('');
    try {
      let effectiveCollectionName = collectionChoice;
      if (collectionChoice === '__new__') {
        const name = newCollectionName.trim();
        if (!name) {
          setSaveError('Enter a name for the new collection.');
          setSaving(false);
          return;
        }
        const { error: collErr } = await createCollection(name, {
          ...(newCollectionChapter ? { chapter: newCollectionChapter } : {}),
          ...(newCollectionStyleGuide.trim() ? { style_guide: newCollectionStyleGuide.trim() } : {}),
          ...(newCollectionSeason ? { season: newCollectionSeason } : {}),
          ...(newCollectionLaunch ? { launch_date: newCollectionLaunch } : {}),
        });
        // A unique-constraint error just means it already exists — fine, use it.
        if (collErr && !collErr.message?.toLowerCase().includes('unique')) {
          setSaveError('Failed to create collection: ' + collErr.message);
          setSaving(false);
          return;
        }
        effectiveCollectionName = name;
      }
      if (!effectiveCollectionName) {
        setSaveError('Please select or create a collection.');
        setSaving(false);
        return;
      }

      const concept = { ...(editedConcept || parsed), collection_name: effectiveCollectionName };
      const concept_code = await generateConceptCode(concept.collection_name);

      const { kittl_prompt, ...conceptFields } = concept;

      const { data: savedConcept, error: conceptError } = await createConcept({
        ...conceptFields,
        concept_code,
      });

      if (conceptError || !savedConcept) {
        setSaveError('Failed to save concept: ' + (conceptError?.message || 'Unknown error'));
        setSaving(false);
        return;
      }

      if (kittl_prompt) {
        const { data: output, error: outputError } = await createConceptOutput({
          concept_id: savedConcept.id,
          output_type: 'kittl_prompt',
          version: 1,
          is_current: true,
          body: kittl_prompt,
          output_source: 'imported',
        });

        if (!outputError && output) {
          await setCurrentOutput(savedConcept.id, 'kittl_prompt', output.id);
        }
      }

      setSavedConceptData(savedConcept);
      setSaved(true);
      onSaved?.(savedConcept);
    } catch (err) {
      setSaveError('Unexpected error: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  if (saved) {
    return (
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>✓</div>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>Concept saved</div>
        <div style={{ color: '#888', fontSize: 13, marginBottom: 20 }}>
          {savedConceptData?.name} added to {savedConceptData?.collection_name}
          {editedConcept?.kittl_prompt ? ' with Kittl prompt' : ''}
        </div>
        <button
          onClick={onClose}
          style={{ padding: '8px 20px', borderRadius: 6, background: '#3b82f6', color: '#fff', border: 'none', cursor: 'pointer' }}
        >
          Done
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px', maxWidth: 680, width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>Import Concept from ChatGPT</h3>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#888' }}>×</button>
      </div>

      {!parsed && (
        <>
          <p style={{ fontSize: 13, color: '#888', marginBottom: 12 }}>
            Paste the full <code>--- TCC CONCEPT ---</code> block from ChatGPT below.
            If it includes a <strong>Kittl Prompt:</strong> section, it will be saved automatically.
          </p>
          <textarea
            value={paste}
            onChange={e => setPaste(e.target.value)}
            placeholder={'--- TCC CONCEPT ---\nConcept Name: ...\nCollection: ...\nDesign Direction: ...\n...'}
            style={{
              width: '100%',
              minHeight: 200,
              padding: '10px 12px',
              borderRadius: 6,
              border: '1px solid #333',
              background: '#1a1a1a',
              color: '#e5e5e5',
              fontSize: 13,
              fontFamily: 'monospace',
              resize: 'vertical',
              boxSizing: 'border-box',
            }}
          />
          {parseError && (
            <div style={{ marginTop: 8, padding: '8px 12px', background: '#3f1f1f', borderRadius: 6, color: '#f87171', fontSize: 13 }}>
              {parseError}
            </div>
          )}
          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <button
              onClick={handleParse}
              disabled={!paste.trim()}
              style={{
                padding: '8px 20px', borderRadius: 6, background: paste.trim() ? '#3b82f6' : '#333',
                color: paste.trim() ? '#fff' : '#666', border: 'none', cursor: paste.trim() ? 'pointer' : 'default',
              }}
            >
              Preview
            </button>
            <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 6, background: 'none', border: '1px solid #333', color: '#888', cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </>
      )}

      {parsed && editedConcept && (
        <>
          <ConceptPreview
            concept={editedConcept}
            onChange={handleFieldChange}
            collectionObjects={collectionObjects}
            chapters={chapters}
            collectionChoice={collectionChoice}
            setCollectionChoice={setCollectionChoice}
            newCollectionName={newCollectionName}
            setNewCollectionName={setNewCollectionName}
            newCollectionChapter={newCollectionChapter}
            setNewCollectionChapter={setNewCollectionChapter}
            newCollectionStyleGuide={newCollectionStyleGuide}
            setNewCollectionStyleGuide={setNewCollectionStyleGuide}
            newCollectionSeason={newCollectionSeason}
            setNewCollectionSeason={setNewCollectionSeason}
            newCollectionLaunch={newCollectionLaunch}
            setNewCollectionLaunch={setNewCollectionLaunch}
          />

          {saveError && (
            <div style={{ marginTop: 8, padding: '8px 12px', background: '#3f1f1f', borderRadius: 6, color: '#f87171', fontSize: 13 }}>
              {saveError}
            </div>
          )}

          <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{ padding: '8px 20px', borderRadius: 6, background: '#3b82f6', color: '#fff', border: 'none', cursor: saving ? 'default' : 'pointer' }}
            >
              {saving ? 'Saving…' : 'Save Concept'}
            </button>
            <button
              onClick={() => { setParsed(null); setEditedConcept(null); }}
              style={{ padding: '8px 16px', borderRadius: 6, background: 'none', border: '1px solid #333', color: '#888', cursor: 'pointer' }}
            >
              ← Edit paste
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Preview / edit form ───────────────────────────────────────────────────────

function Field({ label, value, onChange, multiline }) {
  const style = {
    width: '100%',
    padding: '6px 10px',
    borderRadius: 5,
    border: '1px solid #333',
    background: '#111',
    color: '#e5e5e5',
    fontSize: 13,
    boxSizing: 'border-box',
    ...(multiline ? { minHeight: 80, resize: 'vertical', fontFamily: 'inherit' } : {}),
  };
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, color: '#666', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>{label}</div>
      {multiline
        ? <textarea value={value || ''} onChange={e => onChange(e.target.value)} style={style} />
        : <input value={value || ''} onChange={e => onChange(e.target.value)} style={style} />
      }
    </div>
  );
}

function ConceptPreview({
  concept, onChange, collectionObjects, chapters,
  collectionChoice, setCollectionChoice,
  newCollectionName, setNewCollectionName,
  newCollectionChapter, setNewCollectionChapter,
  newCollectionStyleGuide, setNewCollectionStyleGuide,
  newCollectionSeason, setNewCollectionSeason,
  newCollectionLaunch, setNewCollectionLaunch,
}) {
  const hasKittlPrompt = !!concept.kittl_prompt;
  const fieldStyle = { width: '100%', padding: '6px 10px', borderRadius: 5, border: '1px solid #333', background: '#111', color: '#e5e5e5', fontSize: 13, boxSizing: 'border-box' };
  const labelStyle = { fontSize: 11, color: '#666', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 };

  return (
    <div>
      <div style={{ marginBottom: 12, padding: '8px 12px', background: '#1e2a1e', border: '1px solid #2d4a2d', borderRadius: 6, fontSize: 13, color: '#86efac' }}>
        {hasKittlPrompt
          ? '✓ Kittl prompt detected — will be saved as imported output (v1)'
          : 'No Kittl Prompt section found — concept-only import. You can generate a Kittl prompt after saving.'}
      </div>

      <div style={{ marginBottom: 10 }}>
        <div style={labelStyle}>Collection</div>
        {collectionChoice === '__new__' ? (
          <div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
              <input
                autoFocus
                value={newCollectionName}
                onChange={e => setNewCollectionName(e.target.value)}
                placeholder="New collection name…"
                style={{ ...fieldStyle, flex: 1 }}
              />
              {collectionObjects.length > 0 && (
                <button
                  type="button"
                  onClick={() => setCollectionChoice(collectionObjects[0].name)}
                  style={{ padding: '6px 10px', borderRadius: 5, background: 'none', border: '1px solid #333', color: '#888', cursor: 'pointer', fontSize: 12, whiteSpace: 'nowrap' }}
                >
                  Pick existing instead
                </button>
              )}
            </div>
            <div style={{ fontSize: 12, color: '#f59e0b', marginBottom: 8 }}>⚑ This will create a new collection</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 6 }}>
              <select value={newCollectionChapter} onChange={e => setNewCollectionChapter(e.target.value)} style={fieldStyle}>
                <option value="">— Chapter (optional) —</option>
                {chapters.map(ch => <option key={ch} value={ch}>{ch}</option>)}
              </select>
              <select value={newCollectionSeason} onChange={e => setNewCollectionSeason(e.target.value)} style={fieldStyle}>
                <option value="">— Evergreen —</option>
                {SEASONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            {newCollectionSeason && (
              <input
                type="date"
                value={newCollectionLaunch}
                onChange={e => setNewCollectionLaunch(e.target.value)}
                placeholder="Target launch"
                style={{ ...fieldStyle, marginBottom: 6 }}
              />
            )}
            <textarea
              value={newCollectionStyleGuide}
              onChange={e => setNewCollectionStyleGuide(e.target.value)}
              placeholder="Style guide — aesthetic, colors, typography, vibe… (optional)"
              rows={2}
              style={{ ...fieldStyle, resize: 'vertical', fontFamily: 'inherit' }}
            />
          </div>
        ) : (
          <select
            value={collectionChoice}
            onChange={e => {
              if (e.target.value === '__new__') { setCollectionChoice('__new__'); setNewCollectionName(''); }
              else setCollectionChoice(e.target.value);
            }}
            style={fieldStyle}
          >
            <option value="">— Select —</option>
            {chapters.map(ch => {
              const inChapter = collectionObjects.filter(c => c.chapter === ch);
              if (!inChapter.length) return null;
              return (
                <optgroup key={ch} label={ch}>
                  {inChapter.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                </optgroup>
              );
            })}
            <option value="__new__">+ New collection…</option>
          </select>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
        <Field label="Concept Name" value={concept.name} onChange={v => onChange('name', v)} />
        <Field label="Visual Style" value={concept.visual_style} onChange={v => onChange('visual_style', v)} />
        <Field label="Seasonal Flag" value={concept.seasonal_flag} onChange={v => onChange('seasonal_flag', v)} />
        <Field label="Color Palette" value={concept.color_palette} onChange={v => onChange('color_palette', v)} />
        <Field label="Emotional Trigger" value={concept.emotional_trigger} onChange={v => onChange('emotional_trigger', v)} />
      </div>

      <Field label="Design Direction" value={concept.design_direction} onChange={v => onChange('design_direction', v)} multiline />
      <Field label="Target Customer" value={concept.target_customer} onChange={v => onChange('target_customer', v)} multiline />
      <Field label="Typography Notes" value={concept.typography_notes} onChange={v => onChange('typography_notes', v)} />

      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: '#666', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Mood Keywords</div>
        <input
          value={(concept.mood_keywords || []).join(', ')}
          onChange={e => onChange('mood_keywords', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
          style={{ width: '100%', padding: '6px 10px', borderRadius: 5, border: '1px solid #333', background: '#111', color: '#e5e5e5', fontSize: 13, boxSizing: 'border-box' }}
          placeholder="comma-separated"
        />
      </div>

      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: '#666', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Product Types</div>
        <input
          value={(concept.product_types || []).join(', ')}
          onChange={e => onChange('product_types', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
          style={{ width: '100%', padding: '6px 10px', borderRadius: 5, border: '1px solid #333', background: '#111', color: '#e5e5e5', fontSize: 13, boxSizing: 'border-box' }}
          placeholder="comma-separated"
        />
      </div>

      {hasKittlPrompt && (
        <Field label="Kittl Prompt (imported)" value={concept.kittl_prompt} onChange={v => onChange('kittl_prompt', v)} multiline />
      )}
    </div>
  );
}
