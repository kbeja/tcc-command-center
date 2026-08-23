import { useState, useEffect, useRef } from 'react';
import { createConcept, createConceptOutput, setCurrentOutput, generateConceptCode, createCollection, useSparks, useResearchSessions, createImportSession, useVisualTags, createVisualTag, applyTagToConcept } from '../lib/hooks';
import { useCollectionsContext } from '../context/CollectionsContext';
import { uploadConceptAsset, isSupportedAssetMime, CONCEPT_ASSET_TYPES } from '../lib/conceptAssets';
import VisualTagPicker from './VisualTagPicker';

// Bidirectional case-insensitive substring match — same rule used for
// Source Spark / Related Research matching everywhere this concept-import
// logic runs (this modal and SessionSummaryParser.jsx's CONCEPTS section),
// so a reference and its target match regardless of which one is more
// specific/truncated.
export function looseTextMatch(a, b) {
  if (!a || !b) return false;
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  return x.includes(y) || y.includes(x);
}

const SEASONS = ['Halloween', 'Christmas', "Valentine's Day", "Mother's Day", 'Back to School', '4th of July', 'Summer', 'Spring', 'Fall'];

// ── Parse concept fields from a text block ──────────────────────────────────
// Shared with src/components/SessionSummaryParser.jsx's CONCEPTS section, so
// there's exactly one definition of the field vocabulary (Concept Name,
// Design Direction, Mood Keywords, etc.) instead of two copies to keep in
// sync by hand. Operates on any text block containing "Label: value" lines —
// no longer requires the "--- TCC CONCEPT ---" marker itself (that check
// stays local to parsePasteBlock() below, since it's specific to this
// standalone modal's own paste flow).
// First array with anything in it. Exists because `a || b` is wrong for
// arrays — [] is truthy — and every label here has an accepted alias.
function firstNonEmpty(...lists) {
  return lists.find(l => l.length > 0) || [];
}

export function parseConceptFields(raw) {
  // Strip a leading "- "/"* " bullet if present (the session-summary CONCEPTS
  // section follows the same bulleted-line convention as its other sections)
  // — a no-op for the standalone modal's own unbulleted paste format, so this
  // is strictly additive, not a behavior change for existing callers.
  const lines = raw.trim().split('\n').map(l => l.trim().replace(/^[\*\-]\s+/, ''));
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
    // `||` cannot pick between these: getArray returns [] when a label is
    // absent, and [] is truthy, so the fallback never fired. "Mood:" and
    // "Products:" looked supported and silently imported nothing — the exact
    // failure that bites when a paste format is standardised on an alias.
    mood_keywords: firstNonEmpty(getArray('Mood Keywords'), getArray('Mood')),
    product_types: firstNonEmpty(getArray('Product Types'), getArray('Products')),
    seasonal_flag: get('Seasonal') || get('Seasonal Flag'),
    emotional_trigger: get('Emotional Trigger'),
    kittl_prompt: kittlPrompt,
    raw_import: raw,
    // Raw text only — not real concepts columns. Each caller resolves these
    // against its own sparks/research-sessions lists (mirrors how collection
    // matching already works: the shared parser extracts the text, the
    // caller does the matching) and must strip them before calling
    // createConcept(), same as kittl_prompt already gets stripped.
    source_spark_text: get('Source Spark'),
    related_research_text: get('Related Research'),
  };
}

// ── Parse --- TCC CONCEPT --- paste block ────────────────────────────────────

function parsePasteBlock(raw) {
  const text = raw.trim();
  if (!text.includes('--- TCC CONCEPT ---')) return null;
  return parseConceptFields(text);
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ConceptChatImport({ onSaved, onClose, sourceSpark }) {
  const { collectionObjects, chapters } = useCollectionsContext();
  const { sparks: allSparks } = useSparks();
  const { sessions: allResearchSessions } = useResearchSessions();
  const { tags: allVisualTags } = useVisualTags();
  // When opened from a Spark, ask upfront whether to quick-create from the
  // spark's own text or paste a fuller ChatGPT-drafted block — either way
  // spark_id ends up on the saved concept. With no source spark this is
  // moot, so it defaults straight to 'paste' and behaves exactly as before.
  const [sparkChoice, setSparkChoice] = useState(sourceSpark ? null : 'paste');
  const [paste, setPaste] = useState('');
  const [parsed, setParsed] = useState(null);
  const [parseError, setParseError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savedConceptData, setSavedConceptData] = useState(null);
  const [saveError, setSaveError] = useState('');
  const [editedConcept, setEditedConcept] = useState(null);

  // ── Images ───────────────────────────────────────────────────────────────
  // Staged in memory until the concept row exists, because concept_assets
  // needs a concept_id. Nothing is uploaded on a cancelled import.
  //
  // Each entry is { id, file, previewUrl, assetType }. assetType is per-image
  // rather than one setting for the batch: a single chat session routinely
  // produces both the reference that inspired the design and a draft of the
  // design itself, and calling those the same thing would feed a mood board
  // into a listing's visual profile.
  const [pendingImages, setPendingImages] = useState([]);
  const [imageError, setImageError] = useState('');

  function addImageFiles(files) {
    const incoming = Array.from(files || []).filter(f => f && f.type?.startsWith('image/'));
    if (!incoming.length) return;
    const rejected = incoming.filter(f => !isSupportedAssetMime(f.type));
    if (rejected.length) {
      setImageError(`Skipped ${rejected.length} file${rejected.length !== 1 ? 's' : ''} — only PNG, JPG, WebP and GIF can be stored.`);
    } else {
      setImageError('');
    }
    const accepted = incoming.filter(f => isSupportedAssetMime(f.type));
    if (!accepted.length) return;
    setPendingImages(prev => [
      ...prev,
      ...accepted.map((file, i) => ({
        // Date.now() alone collides when several files land in one drop.
        id: `${Date.now()}-${prev.length + i}-${file.name || 'img'}`,
        file,
        previewUrl: URL.createObjectURL(file),
        assetType: 'reference_image',
      })),
    ]);
  }

  function removePendingImage(id) {
    setPendingImages(prev => {
      const gone = prev.find(p => p.id === id);
      // Revoking matters here: these are full-size screenshots and an import
      // modal can be opened and abandoned many times in a sitting.
      if (gone) URL.revokeObjectURL(gone.previewUrl);
      return prev.filter(p => p.id !== id);
    });
  }

  function setPendingImageType(id, assetType) {
    setPendingImages(prev => prev.map(p => (p.id === id ? { ...p, assetType } : p)));
  }

  // Release any previews still held when the modal unmounts. Via a ref rather
  // than the state value directly: an unmount-only effect closes over the
  // FIRST render's empty array, so reading state there would revoke nothing.
  const pendingImagesRef = useRef(pendingImages);
  pendingImagesRef.current = pendingImages;
  useEffect(() => () => {
    pendingImagesRef.current.forEach(p => URL.revokeObjectURL(p.previewUrl));
  }, []);

  // Collection selection — separate from editedConcept.collection_name because
  // it can be either an existing collection or '__new__' with its own draft
  // fields (style guide, season…), only materialized into a real row on save.
  const [collectionChoice, setCollectionChoice] = useState('');
  const [newCollectionName, setNewCollectionName] = useState('');
  const [newCollectionChapter, setNewCollectionChapter] = useState('');
  const [newCollectionStyleGuide, setNewCollectionStyleGuide] = useState('');
  const [newCollectionSeason, setNewCollectionSeason] = useState('');
  const [newCollectionLaunch, setNewCollectionLaunch] = useState('');
  const [selectedTags, setSelectedTags] = useState([]);

  // Manual Date/Source — this paste format has no DATE:/SOURCE: header to
  // auto-parse (unlike SessionSummaryParser.jsx's summary format), so this
  // is Phase 14's parity input for the standalone modal. Scoped to the
  // paste flow only (see showSessionFields below) — the quick-create-from-
  // spark path has no paste text to keep as raw_text, so a session row
  // wouldn't have anything real to point at.
  const [sessionDate, setSessionDate] = useState('');
  const [sessionSource, setSessionSource] = useState('');

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
    // Even in the full-paste path, still attach the source spark if this
    // modal was opened from one — she may have started with a quick capture
    // and then fleshed the idea out in ChatGPT before coming back to paste it.
    // Otherwise, an explicit "Source Spark:" line in the paste itself gets
    // matched against every spark — warn if unmatched, don't block the save
    // on it, same treatment SessionSummaryParser gives an unmatched match.
    let withSpark;
    if (sourceSpark) {
      // Inherit the spark's niche here too — the paste path is the same
      // Spark -> Concept lineage as quick-create, just with a design brief
      // attached, so it should not lose the classification.
      withSpark = {
        ...result,
        spark_id: sourceSpark.id,
        sourceSparkMatched: true,
        primary_niche_id: result.primary_niche_id || sourceSpark.primary_niche_id || null,
      };
    } else if (result.source_spark_text) {
      const matchedSpark = allSparks.find(s => looseTextMatch(s.content, result.source_spark_text));
      withSpark = { ...result, spark_id: matchedSpark?.id || null, sourceSparkMatched: !!matchedSpark };
    } else {
      withSpark = result;
    }

    let withResearch = withSpark;
    if (result.related_research_text) {
      const collectionSessions = allResearchSessions.filter(
        rs => rs.collection?.toLowerCase() === result.collection_name.toLowerCase()
      );
      const matchedSession = collectionSessions.find(rs =>
        looseTextMatch(rs.niche || '', result.related_research_text) || looseTextMatch(rs.source || '', result.related_research_text)
      );
      withResearch = { ...withSpark, research_session_id: matchedSession?.id || null, relatedResearchMatched: !!matchedSession };
    }

    setParsed(withResearch);
    setEditedConcept({ ...withResearch });

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
    setSessionDate('');
    setSessionSource('');
    setSelectedTags([]);
  }

  // Quick-create path: seed a blank concept straight from the spark's own
  // text and jump directly to the editable preview — no paste block needed.
  function seedFromSpark() {
    const seed = {
      name: sourceSpark.content,
      collection_name: sourceSpark.collection_tag || '',
      design_direction: '', target_customer: '', visual_style: '', color_palette: '',
      typography_notes: '', mood_keywords: [], product_types: [], seasonal_flag: '',
      emotional_trigger: '', kittl_prompt: '', raw_import: '',
      spark_id: sourceSpark.id,
      // §11 inheritance: a concept made from a spark starts with the spark's
      // classification rather than asking for it again. A default, not a lock
      // -- the picker in the preview can change it before saving, which is why
      // this is copied in application code and not by a DB trigger.
      primary_niche_id: sourceSpark.primary_niche_id || null,
    };
    setParsed(seed);
    setEditedConcept({ ...seed });
    setSparkChoice('quick');
  }

  // Collection auto-match for the quick-create path, split out from
  // seedFromSpark() into its own effect: useCollectionObjects() loads async,
  // so matching synchronously at click time could still see an empty list
  // and wrongly fall into "create new collection" even when a real match
  // exists. Re-running this once collectionObjects finishes loading fixes it.
  useEffect(() => {
    if (sparkChoice !== 'quick' || !sourceSpark?.collection_tag) return;
    const matched = collectionObjects.find(c => c.name.toLowerCase() === sourceSpark.collection_tag.toLowerCase());
    if (matched) {
      setCollectionChoice(matched.name);
      setNewCollectionName('');
    } else {
      setCollectionChoice('__new__');
      setNewCollectionName(sourceSpark.collection_tag);
    }
  }, [collectionObjects, sparkChoice, sourceSpark]);

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

      // Strip fields that aren't real concepts columns: kittl_prompt gets
      // saved separately as a concept_output; the rest are intermediate
      // text/flags used only to resolve spark_id/research_session_id above.
      const { kittl_prompt, source_spark_text, related_research_text, sourceSparkMatched, relatedResearchMatched, ...conceptFields } = concept;

      // Session provenance — paste flow only (quick-create from a Spark has
      // no paste text to keep as raw_text), and only when a date or source
      // was actually filled in. Errors here degrade silently to
      // session_id: null rather than blocking the concept save — same
      // "warn/degrade, never block" treatment SessionSummaryParser.jsx uses
      // for its own session row.
      let session_id = null;
      if (sparkChoice !== 'quick' && (sessionDate || sessionSource.trim())) {
        const { data: importSession } = await createImportSession({
          date: sessionDate || null,
          source: sessionSource.trim() || null,
          raw_text: paste,
        });
        session_id = importSession?.id || null;
      }

      const { data: savedConcept, error: conceptError } = await createConcept({
        ...conceptFields,
        concept_code,
        session_id,
      });

      if (conceptError || !savedConcept) {
        setSaveError('Failed to save concept: ' + (conceptError?.message || 'Unknown error'));
        setSaving(false);
        return;
      }

      if (selectedTags.length) {
        for (const t of selectedTags) {
          const tagId = t.id || (await createVisualTag(t.name, t.kind || null)).data?.id;
          if (tagId) await applyTagToConcept(savedConcept.id, tagId);
        }
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

      // Images last: the concept row must exist first, and a failed upload
      // must not lose the brief. A screenshot can be re-dropped in the
      // workspace; a parsed concept cannot be re-parsed once the modal closes.
      if (pendingImages.length) {
        const failed = [];
        for (const img of pendingImages) {
          try {
            await uploadConceptAsset(savedConcept.id, savedConcept.concept_code, img.file, img.assetType);
          } catch (e) {
            failed.push(img.file.name || 'image');
          }
        }
        if (failed.length) {
          // Surfaced, not thrown. The concept saved; saying so and naming what
          // did not is more useful than an error that implies nothing worked.
          setSaveError(
            `Concept saved, but ${failed.length} image${failed.length !== 1 ? 's' : ''} failed to upload `
            + `(${failed.join(', ')}). Add them from the concept's Visuals tab.`
          );
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
        <h3 style={{ margin: 0, fontSize: 16 }}>{sourceSpark ? 'Create Concept from Spark' : 'Import Concept from ChatGPT'}</h3>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#888' }}>×</button>
      </div>

      {!parsed && sourceSpark && sparkChoice === null && (
        <>
          <p style={{ fontSize: 13, color: '#888', marginBottom: 8 }}>Creating a Concept from this Spark:</p>
          <div style={{ padding: '10px 12px', background: '#1a1a1a', border: '1px solid #333', borderRadius: 6, fontSize: 13, color: '#e5e5e5', fontStyle: 'italic', marginBottom: 16 }}>
            "{sourceSpark.content}"
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              onClick={seedFromSpark}
              style={{ padding: '10px 16px', borderRadius: 6, background: '#3b82f6', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, textAlign: 'left' }}
            >
              Quick-create from this spark →
            </button>
            <button
              onClick={() => setSparkChoice('paste')}
              style={{ padding: '10px 16px', borderRadius: 6, background: 'none', border: '1px solid #333', color: '#e5e5e5', cursor: 'pointer', fontSize: 13, textAlign: 'left' }}
            >
              I already fleshed this out in ChatGPT — paste it instead
            </button>
          </div>
          <div style={{ marginTop: 12 }}>
            <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 6, background: 'none', border: '1px solid #333', color: '#888', cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </>
      )}

      {!parsed && (!sourceSpark || sparkChoice === 'paste') && (
        <>
          <p style={{ fontSize: 13, color: '#888', marginBottom: 12 }}>
            Paste the full <code>--- TCC CONCEPT ---</code> block from ChatGPT below.
            If it includes a <strong>Kittl Prompt:</strong> section, it will be saved automatically.
          </p>
          <textarea
            value={paste}
            onChange={e => setPaste(e.target.value)}
            placeholder={'--- TCC CONCEPT ---\nConcept Name: ...\nCollection: ...\nDesign Direction: ...\nSource Spark: ... (optional)\nRelated Research: ... (optional)\n...'}
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
            sourceSpark={sourceSpark}
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
            showSessionFields={sparkChoice !== 'quick'}
            sessionDate={sessionDate}
            setSessionDate={setSessionDate}
            sessionSource={sessionSource}
            setSessionSource={setSessionSource}
            allTags={allVisualTags}
            selectedTags={selectedTags}
            setSelectedTags={setSelectedTags}
          />

          <ImageDropZone
            images={pendingImages}
            onAdd={addImageFiles}
            onRemove={removePendingImage}
            onSetType={setPendingImageType}
            error={imageError}
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
  concept, onChange, collectionObjects, chapters, sourceSpark,
  collectionChoice, setCollectionChoice,
  newCollectionName, setNewCollectionName,
  newCollectionChapter, setNewCollectionChapter,
  newCollectionStyleGuide, setNewCollectionStyleGuide,
  newCollectionSeason, setNewCollectionSeason,
  newCollectionLaunch, setNewCollectionLaunch,
  showSessionFields, sessionDate, setSessionDate, sessionSource, setSessionSource,
  allTags, selectedTags, setSelectedTags,
}) {
  const hasKittlPrompt = !!concept.kittl_prompt;
  const fieldStyle = { width: '100%', padding: '6px 10px', borderRadius: 5, border: '1px solid #333', background: '#111', color: '#e5e5e5', fontSize: 13, boxSizing: 'border-box' };
  const labelStyle = { fontSize: 11, color: '#666', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 };

  return (
    <div>
      {sourceSpark && (
        <div style={{ marginBottom: 12, padding: '8px 12px', background: 'rgba(124,175,138,0.12)', border: '1px solid rgba(124,175,138,0.3)', borderRadius: 6, fontSize: 13, color: '#2d6b3c' }}>
          🔗 Linked to Spark: "{sourceSpark.content.length > 80 ? sourceSpark.content.slice(0, 80) + '…' : sourceSpark.content}"
        </div>
      )}
      {!sourceSpark && concept.source_spark_text && (
        <div style={{
          marginBottom: 12, padding: '8px 12px', borderRadius: 6, fontSize: 13,
          ...(concept.sourceSparkMatched
            ? { background: 'rgba(124,175,138,0.12)', border: '1px solid rgba(124,175,138,0.3)', color: '#2d6b3c' }
            : { background: '#3f2f1f', border: '1px solid #7a4a1e', color: '#f0b87a' }),
        }}>
          {concept.sourceSparkMatched
            ? `🔗 Source Spark matched: "${concept.source_spark_text}"`
            : `⚠ Source Spark "${concept.source_spark_text}" not found — will save without a spark link`}
        </div>
      )}
      {concept.related_research_text && (
        <div style={{
          marginBottom: 12, padding: '8px 12px', borderRadius: 6, fontSize: 13,
          ...(concept.relatedResearchMatched
            ? { background: 'rgba(124,175,138,0.12)', border: '1px solid rgba(124,175,138,0.3)', color: '#2d6b3c' }
            : { background: '#3f2f1f', border: '1px solid #7a4a1e', color: '#f0b87a' }),
        }}>
          {concept.relatedResearchMatched
            ? `📊 Related Research matched: "${concept.related_research_text}"`
            : `⚠ Related Research "${concept.related_research_text}" not found for this collection — will save without a research link`}
        </div>
      )}
      <div style={{ marginBottom: 12, padding: '8px 12px', background: '#1e2a1e', border: '1px solid #2d4a2d', borderRadius: 6, fontSize: 13, color: '#86efac' }}>
        {hasKittlPrompt
          ? '✓ Kittl prompt detected — will be saved as imported output (v1)'
          : 'No Kittl Prompt section found — concept-only import. You can generate a Kittl prompt after saving.'}
      </div>

      {showSessionFields && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <div>
              <div style={labelStyle}>Session Date</div>
              <input type="date" value={sessionDate} onChange={e => setSessionDate(e.target.value)} style={fieldStyle} />
            </div>
            <div>
              <div style={labelStyle}>Session Source</div>
              <input value={sessionSource} onChange={e => setSessionSource(e.target.value)} placeholder="e.g. ChatGPT, Claude" style={fieldStyle} />
            </div>
          </div>
          <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
            Optional — when/where this concept came from. Leave both blank to skip.
          </div>
        </div>
      )}

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
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: '#666', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Visual Tags</div>
        <VisualTagPicker
          allTags={allTags}
          appliedTags={selectedTags}
          onAdd={tag => setSelectedTags(prev => [...prev, tag])}
          onRemove={tag => setSelectedTags(prev => prev.filter(t => (t.id || t.name) !== (tag.id || tag.name)))}
          dark
        />
      </div>

      {hasKittlPrompt && (
        <Field label="Kittl Prompt (imported)" value={concept.kittl_prompt} onChange={v => onChange('kittl_prompt', v)} multiline />
      )}
    </div>
  );
}

// ── Image drop zone ─────────────────────────────────────────────────────────
// Sits in the review step, beside the parsed fields, because that is the point
// at which the concept is real to the person doing it — they are looking at
// the brief and can say which picture is the artwork and which is the mood.
//
// Three ways in, because screenshots arrive three ways: a system paste
// (Cmd/Ctrl+V straight from a screenshot tool, the common case here), a drag
// from a folder, and a file picker. The paste handler is on the zone rather
// than the window so it cannot swallow a Ctrl+V meant for a text field.
function ImageDropZone({ images, onAdd, onRemove, onSetType, error }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  return (
    <div style={{ marginTop: 14 }}>
      <div className="eyebrow" style={{ marginBottom: 6 }}>
        Images {images.length > 0 && `(${images.length})`}
      </div>

      <div
        tabIndex={0}
        onPaste={e => {
          const files = Array.from(e.clipboardData?.files || []);
          if (files.length) { e.preventDefault(); onAdd(files); }
        }}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); onAdd(e.dataTransfer?.files); }}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `1px dashed ${dragging ? 'var(--dusty-rose)' : 'rgba(43,41,38,0.25)'}`,
          background: dragging ? 'rgba(196,149,152,0.08)' : 'transparent',
          borderRadius: 4, padding: '14px 12px', textAlign: 'center', cursor: 'pointer',
          fontSize: '0.74rem', color: 'var(--charcoal-soft)',
        }}
      >
        Drop screenshots here, click to browse, or focus this box and paste
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          multiple
          onChange={e => { onAdd(e.target.files); e.target.value = ''; }}
          style={{ display: 'none' }}
        />
      </div>

      {error && (
        <div style={{ fontSize: '0.7rem', color: '#a33', marginTop: 6 }}>{error}</div>
      )}

      {images.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 10 }}>
          {images.map(img => (
            <div key={img.id} style={{
              width: 150, border: '1px solid rgba(43,41,38,0.12)', borderRadius: 4,
              padding: 6, display: 'flex', flexDirection: 'column', gap: 5,
            }}>
              <img
                src={img.previewUrl}
                alt=""
                style={{ width: '100%', height: 96, objectFit: 'cover', borderRadius: 3, display: 'block' }}
              />
              {/* Per image, not per batch — one chat session usually yields
                  both the reference that inspired the design and a draft of
                  the design itself. */}
              <select
                value={img.assetType}
                onChange={e => onSetType(img.id, e.target.value)}
                style={{ fontSize: '0.68rem', padding: '2px 4px', width: '100%' }}
              >
                {CONCEPT_ASSET_TYPES.map(t => (
                  <option key={t.key} value={t.key}>{t.label}</option>
                ))}
              </select>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 4 }}>
                <span style={{
                  fontSize: '0.62rem', color: 'var(--charcoal-soft)', overflow: 'hidden',
                  textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0,
                }}>
                  {img.file.name || 'pasted'}
                </span>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ fontSize: '0.62rem', padding: '0 5px' }}
                  onClick={() => onRemove(img.id)}
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
          <div style={{ fontSize: '0.66rem', color: 'var(--charcoal-soft)', width: '100%', lineHeight: 1.5 }}>
            <strong>Artwork</strong> is the design itself and becomes a listing image.
            {' '}<strong>Mood board</strong> is inspiration and reference — it stays with the brief and is never listed.
          </div>
        </div>
      )}
    </div>
  );
}
