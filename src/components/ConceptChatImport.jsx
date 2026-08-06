import { useState } from 'react';
import { createConcept, createConceptOutput, setCurrentOutput, generateConceptCode } from '../lib/hooks';

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
  const [paste, setPaste] = useState('');
  const [parsed, setParsed] = useState(null);
  const [parseError, setParseError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [editedConcept, setEditedConcept] = useState(null);

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
  }

  function handleFieldChange(field, value) {
    setEditedConcept(prev => ({ ...prev, [field]: value }));
  }

  async function handleSave() {
    setSaving(true);
    setSaveError('');
    try {
      const concept = editedConcept || parsed;
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
          {editedConcept?.name} added to {editedConcept?.collection_name}
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

function ConceptPreview({ concept, onChange }) {
  const hasKittlPrompt = !!concept.kittl_prompt;

  return (
    <div>
      <div style={{ marginBottom: 12, padding: '8px 12px', background: '#1e2a1e', border: '1px solid #2d4a2d', borderRadius: 6, fontSize: 13, color: '#86efac' }}>
        {hasKittlPrompt
          ? '✓ Kittl prompt detected — will be saved as imported output (v1)'
          : 'No Kittl Prompt section found — concept-only import. You can generate a Kittl prompt after saving.'}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
        <Field label="Concept Name" value={concept.name} onChange={v => onChange('name', v)} />
        <Field label="Collection" value={concept.collection_name} onChange={v => onChange('collection_name', v)} />
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
