import { useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import {
  useConcept,
  updateConcept,
  archiveConcept,
  createConceptOutput,
  updateConceptOutput,
  setCurrentOutput,
  nextOutputVersion,
} from '../lib/hooks';

const FUNCTION_URL = '/.netlify/functions/claude-process';

// ── Generate Kittl prompt via Netlify function ────────────────────────────────

async function generateKittlPrompt(concept) {
  const payload = `Concept Name: ${concept.name}
Collection: ${concept.collection_name}
Design Direction: ${concept.design_direction || ''}
Target Customer: ${concept.target_customer || ''}
Visual Style: ${concept.visual_style || ''}
Color Palette: ${concept.color_palette || ''}
Typography Notes: ${concept.typography_notes || ''}
Mood Keywords: ${(concept.mood_keywords || []).join(', ')}
Product Types: ${(concept.product_types || []).join(', ')}
Seasonal Flag: ${concept.seasonal_flag || 'evergreen'}
Emotional Trigger: ${concept.emotional_trigger || ''}`;

  const res = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'generate_kittl_prompt', payload }),
  });
  const data = await res.json();
  return data.parsed || data;
}

// ── Upload asset to design-vault ──────────────────────────────────────────────

async function uploadAsset(conceptId, conceptCode, file) {
  const ext = file.name.split('.').pop();
  const slug = (conceptCode || conceptId).toLowerCase().replace(/[^a-z0-9]/g, '-');
  const path = `${slug}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('design-vault').upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  });
  if (error) throw error;
  const { data: assetRow, error: dbError } = await supabase
    .from('concept_assets')
    .insert({
      concept_id: conceptId,
      asset_type: 'reference_image',
      storage_path: path,
      mime_type: file.type,
      size_bytes: file.size,
      label: file.name,
      created_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (dbError) throw dbError;
  return assetRow;
}

async function getAssetUrl(path) {
  const { data } = await supabase.storage.from('design-vault').createSignedUrl(path, 3600);
  return data?.signedUrl || null;
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ConceptWorkspace() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { concept, loading, refetch } = useConcept(id);

  const [activeTab, setActiveTab] = useState('overview');
  const [generating, setGenerating] = useState(false);
  const [genResult, setGenResult] = useState(null);
  const [genError, setGenError] = useState('');
  const [saving, setSaving] = useState(false);
  const [fieldSaved, setFieldSaved] = useState('');
  const [uploading, setUploading] = useState(false);
  const [assetUrls, setAssetUrls] = useState({});
  const [assetsLoaded, setAssetsLoaded] = useState(false);
  const [editingOutput, setEditingOutput] = useState(null);
  const [editBody, setEditBody] = useState('');
  const fileInputRef = useRef(null);

  if (loading) return <div className="page"><div style={{ color: 'var(--charcoal-soft)', padding: 24 }}>Loading…</div></div>;
  if (!concept) return <div className="page"><div style={{ color: 'var(--charcoal-soft)', padding: 24 }}>Concept not found.</div></div>;

  const kittlOutput = concept.concept_outputs?.find(o => o.output_type === 'kittl_prompt' && o.is_current);
  const allKittlVersions = (concept.concept_outputs || [])
    .filter(o => o.output_type === 'kittl_prompt')
    .sort((a, b) => b.version - a.version);

  async function handleFieldBlur(field, value) {
    await updateConcept(id, { [field]: value || null });
    setFieldSaved(field);
    refetch();
    setTimeout(() => setFieldSaved(''), 1500);
  }

  async function handleArrayBlur(field, value) {
    const arr = value.split(',').map(s => s.trim()).filter(Boolean);
    await updateConcept(id, { [field]: arr });
    setFieldSaved(field);
    refetch();
    setTimeout(() => setFieldSaved(''), 1500);
  }

  async function handleGenerate() {
    setGenerating(true);
    setGenError('');
    setGenResult(null);
    try {
      const result = await generateKittlPrompt(concept);
      if (!result?.kittl_prompt) throw new Error('No prompt returned');
      setGenResult(result);
    } catch (err) {
      setGenError('Generation failed: ' + err.message);
    } finally {
      setGenerating(false);
    }
  }

  async function handleSaveGenerated() {
    if (!genResult?.kittl_prompt) return;
    setSaving(true);
    try {
      const version = await nextOutputVersion(id, 'kittl_prompt');
      const { data: output, error } = await createConceptOutput({
        concept_id: id,
        output_type: 'kittl_prompt',
        version,
        is_current: true,
        body: genResult.kittl_prompt,
        output_source: 'generated',
        model_used: 'claude-haiku-4-5-20251001',
        generation_notes: genResult.design_notes || null,
      });
      if (error || !output) throw new Error(error?.message || 'Save failed');
      await setCurrentOutput(id, 'kittl_prompt', output.id);
      setGenResult(null);
      refetch();
    } catch (err) {
      setGenError('Save failed: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleEditSave() {
    if (!editingOutput) return;
    setSaving(true);
    await updateConceptOutput(editingOutput.id, { body: editBody });
    setEditingOutput(null);
    setEditBody('');
    refetch();
    setSaving(false);
  }

  async function handleSetCurrent(outputId) {
    await setCurrentOutput(id, 'kittl_prompt', outputId);
    refetch();
  }

  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await uploadAsset(id, concept.concept_code, file);
      refetch();
      setAssetsLoaded(false);
    } catch (err) {
      alert('Upload failed: ' + err.message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  async function loadAssetUrls() {
    if (assetsLoaded) return;
    const urls = {};
    for (const asset of concept.concept_assets || []) {
      urls[asset.id] = await getAssetUrl(asset.storage_path);
    }
    setAssetUrls(urls);
    setAssetsLoaded(true);
  }

  if (activeTab === 'visuals' && !assetsLoaded) {
    loadAssetUrls();
  }

  const saved = (field) => fieldSaved === field;

  return (
    <div className="page">
      <div className="page-header">
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => navigate(`/collections/${encodeURIComponent(concept.collection_name)}`)}
          style={{ marginBottom: 12, padding: '4px 0', fontSize: '0.75rem' }}
        >
          ← {concept.collection_name}
        </button>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div className="page-title">{concept.name}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--charcoal-soft)', marginTop: 4 }}>
              {concept.concept_code && <span style={{ fontFamily: 'monospace', marginRight: 8 }}>{concept.concept_code}</span>}
              {concept.collection_name}
              {concept.visual_style && <span> · {concept.visual_style}</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid rgba(43,41,38,0.12)', marginBottom: 20 }}>
        {[
          ['overview', 'Overview'],
          ['kittl', `Kittl Prompt${allKittlVersions.length > 1 ? ` (v${kittlOutput?.version || 1})` : ''}`],
          ['visuals', `Visuals${concept.concept_assets?.length ? ` (${concept.concept_assets.length})` : ''}`],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            style={{
              padding: '8px 16px', background: 'none', border: 'none', cursor: 'pointer',
              fontSize: '0.8rem', fontWeight: activeTab === key ? 600 : 400,
              color: activeTab === key ? 'var(--warm-charcoal)' : 'var(--charcoal-soft)',
              borderBottom: activeTab === key ? '2px solid var(--warm-charcoal)' : '2px solid transparent',
              marginBottom: -1,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Overview tab ── */}
      {activeTab === 'overview' && (
        <div>
          <FieldRow label="Design Direction" saved={saved('design_direction')}>
            <textarea
              defaultValue={concept.design_direction || ''}
              onBlur={e => handleFieldBlur('design_direction', e.target.value)}
              rows={3} style={{ fontSize: '0.82rem' }}
              placeholder="The core visual and emotional intent…"
            />
          </FieldRow>
          <FieldRow label="Target Customer" saved={saved('target_customer')}>
            <textarea
              defaultValue={concept.target_customer || ''}
              onBlur={e => handleFieldBlur('target_customer', e.target.value)}
              rows={2} style={{ fontSize: '0.82rem' }}
              placeholder="Who is this for?"
            />
          </FieldRow>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <FieldRow label="Visual Style" saved={saved('visual_style')} inline>
              <input defaultValue={concept.visual_style || ''} onBlur={e => handleFieldBlur('visual_style', e.target.value)} placeholder="e.g. Dark academia" style={{ fontSize: '0.82rem' }} />
            </FieldRow>
            <FieldRow label="Color Palette" saved={saved('color_palette')} inline>
              <input defaultValue={concept.color_palette || ''} onBlur={e => handleFieldBlur('color_palette', e.target.value)} placeholder="e.g. Linen ivory, sage, rose" style={{ fontSize: '0.82rem' }} />
            </FieldRow>
            <FieldRow label="Typography Notes" saved={saved('typography_notes')} inline>
              <input defaultValue={concept.typography_notes || ''} onBlur={e => handleFieldBlur('typography_notes', e.target.value)} placeholder="Font mood or direction" style={{ fontSize: '0.82rem' }} />
            </FieldRow>
            <FieldRow label="Emotional Trigger" saved={saved('emotional_trigger')} inline>
              <input defaultValue={concept.emotional_trigger || ''} onBlur={e => handleFieldBlur('emotional_trigger', e.target.value)} placeholder="The hook" style={{ fontSize: '0.82rem' }} />
            </FieldRow>
            <FieldRow label="Seasonal Flag" saved={saved('seasonal_flag')} inline>
              <input defaultValue={concept.seasonal_flag || ''} onBlur={e => handleFieldBlur('seasonal_flag', e.target.value)} placeholder="evergreen or season name" style={{ fontSize: '0.82rem' }} />
            </FieldRow>
          </div>

          <FieldRow label="Mood Keywords" saved={saved('mood_keywords')}>
            <input
              defaultValue={(concept.mood_keywords || []).join(', ')}
              onBlur={e => handleArrayBlur('mood_keywords', e.target.value)}
              placeholder="comma-separated: cozy, nostalgic, warm…"
              style={{ fontSize: '0.82rem' }}
            />
          </FieldRow>
          <FieldRow label="Product Types" saved={saved('product_types')}>
            <input
              defaultValue={(concept.product_types || []).join(', ')}
              onBlur={e => handleArrayBlur('product_types', e.target.value)}
              placeholder="comma-separated: Tee, Mug, Tote…"
              style={{ fontSize: '0.82rem' }}
            />
          </FieldRow>

          <hr className="rule" style={{ marginTop: 24 }} />
          <div style={{ marginTop: 16 }}>
            <button
              className="btn btn-ghost btn-sm"
              style={{ color: 'var(--charcoal-soft)', fontSize: '0.75rem', opacity: 0.5 }}
              onClick={async () => {
                if (!window.confirm('Archive this concept?')) return;
                await archiveConcept(id);
                navigate(`/collections/${encodeURIComponent(concept.collection_name)}`);
              }}
            >
              Archive concept
            </button>
          </div>
        </div>
      )}

      {/* ── Kittl Prompt tab ── */}
      {activeTab === 'kittl' && (
        <div>
          {/* Current prompt */}
          {kittlOutput ? (
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--charcoal-soft)' }}>
                  Current · v{kittlOutput.version} · {kittlOutput.output_source === 'imported' ? 'imported' : 'generated'}
                </div>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => { setEditingOutput(kittlOutput); setEditBody(kittlOutput.body); }}
                >
                  Edit
                </button>
              </div>

              {editingOutput?.id === kittlOutput.id ? (
                <div>
                  <textarea
                    value={editBody}
                    onChange={e => setEditBody(e.target.value)}
                    rows={8}
                    style={{ width: '100%', fontSize: '0.82rem', padding: '10px 12px', borderRadius: 6, border: '1px solid rgba(43,41,38,0.2)', background: 'var(--warm-white)', resize: 'vertical' }}
                  />
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button className="btn btn-primary btn-sm" onClick={handleEditSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditingOutput(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div style={{ padding: '14px 16px', background: 'var(--warm-white)', border: '1px solid rgba(43,41,38,0.1)', borderRadius: 8, fontSize: '0.85rem', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                  {kittlOutput.body}
                </div>
              )}

              {kittlOutput.generation_notes && (
                <div style={{ marginTop: 8, fontSize: '0.72rem', color: 'var(--charcoal-soft)', fontStyle: 'italic' }}>
                  {kittlOutput.generation_notes}
                </div>
              )}
            </div>
          ) : (
            <div style={{ marginBottom: 24, padding: '16px', background: 'rgba(232,168,124,0.08)', border: '1px solid rgba(232,168,124,0.3)', borderRadius: 8, fontSize: '0.82rem', color: 'var(--charcoal-soft)' }}>
              No Kittl prompt yet. Generate one below or import a concept that includes one.
            </div>
          )}

          {/* Generate new */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--charcoal-soft)', marginBottom: 10 }}>
              Generate a new Kittl prompt from this concept's brief using Claude.
            </div>
            <button
              className="btn btn-primary btn-sm"
              onClick={handleGenerate}
              disabled={generating}
            >
              {generating ? 'Generating…' : kittlOutput ? 'Generate new version' : 'Generate Kittl Prompt'}
            </button>

            {genError && (
              <div style={{ marginTop: 8, fontSize: '0.75rem', color: 'var(--alert)' }}>{genError}</div>
            )}

            {genResult && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--charcoal-soft)', marginBottom: 6 }}>
                  Preview — v{allKittlVersions.length + 1} · generated
                </div>
                <div style={{ padding: '14px 16px', background: 'rgba(124,175,138,0.08)', border: '1px solid rgba(124,175,138,0.3)', borderRadius: 8, fontSize: '0.85rem', lineHeight: 1.6, whiteSpace: 'pre-wrap', marginBottom: 10 }}>
                  {genResult.kittl_prompt}
                </div>
                {genResult.design_notes && (
                  <div style={{ fontSize: '0.72rem', color: 'var(--charcoal-soft)', fontStyle: 'italic', marginBottom: 10 }}>
                    {genResult.design_notes}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-primary btn-sm" onClick={handleSaveGenerated} disabled={saving}>
                    {saving ? 'Saving…' : 'Save as current'}
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setGenResult(null)}>Discard</button>
                </div>
              </div>
            )}
          </div>

          {/* Version history */}
          {allKittlVersions.length > 1 && (
            <div>
              <div className="section-label" style={{ marginBottom: 10 }}>Version history</div>
              {allKittlVersions.map(v => (
                <div key={v.id} style={{ padding: '10px 14px', marginBottom: 6, background: 'var(--warm-white)', border: `1px solid ${v.is_current ? 'rgba(124,175,138,0.4)' : 'rgba(43,41,38,0.1)'}`, borderRadius: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--charcoal-soft)' }}>
                      v{v.version} · {v.output_source}
                      {v.is_current && <span style={{ marginLeft: 6, color: '#2d6b3c', fontWeight: 600 }}>current</span>}
                    </div>
                    {!v.is_current && (
                      <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.7rem' }} onClick={() => handleSetCurrent(v.id)}>
                        Set as current
                      </button>
                    )}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--charcoal-soft)', lineHeight: 1.5 }}>
                    {v.body.length > 140 ? v.body.slice(0, 140) + '…' : v.body}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Visuals tab ── */}
      {activeTab === 'visuals' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--charcoal-soft)' }}>
              Reference images, mood board photos, exported designs
            </div>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? 'Uploading…' : '+ Add Image'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              style={{ display: 'none' }}
              onChange={handleUpload}
            />
          </div>

          {!concept.concept_assets?.length ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--charcoal-soft)' }}>
              <div style={{ fontSize: '2rem', marginBottom: 8 }}>🖼</div>
              <div style={{ fontSize: '0.85rem', marginBottom: 8 }}>No visuals yet</div>
              <div style={{ fontSize: '0.72rem', marginBottom: 16 }}>Upload reference images, mood board photos, or Kittl exports</div>
              <button className="btn btn-primary btn-sm" onClick={() => fileInputRef.current?.click()}>+ Add Image</button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
              {concept.concept_assets.map(asset => (
                <AssetCard
                  key={asset.id}
                  asset={asset}
                  url={assetUrls[asset.id]}
                  onDelete={async () => {
                    await supabase.storage.from('design-vault').remove([asset.storage_path]);
                    await supabase.from('concept_assets').delete().eq('id', asset.id);
                    refetch();
                    setAssetsLoaded(false);
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function FieldRow({ label, saved, children, inline }) {
  return (
    <div className="form-group" style={inline ? { margin: 0 } : {}}>
      <label className="form-label">
        {label}
        {saved && <span className="inline-confirm" style={{ marginLeft: 6 }}>✓</span>}
      </label>
      {children}
    </div>
  );
}

function AssetCard({ asset, url, onDelete }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  return (
    <div style={{ border: '1px solid rgba(43,41,38,0.1)', borderRadius: 8, overflow: 'hidden', background: 'var(--warm-white)' }}>
      {url ? (
        <img src={url} alt={asset.label || 'asset'} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block' }} />
      ) : (
        <div style={{ width: '100%', aspectRatio: '1', background: 'rgba(43,41,38,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem' }}>🖼</div>
      )}
      <div style={{ padding: '8px 10px' }}>
        <div style={{ fontSize: '0.68rem', color: 'var(--charcoal-soft)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 4 }}>
          {asset.label || asset.asset_type}
        </div>
        {confirmDelete ? (
          <div style={{ display: 'flex', gap: 6, fontSize: '0.68rem' }}>
            <button onClick={onDelete} style={{ color: 'var(--alert)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Delete</button>
            <button onClick={() => setConfirmDelete(false)} style={{ color: 'var(--charcoal-soft)', background: 'none', border: 'none', cursor: 'pointer' }}>Cancel</button>
          </div>
        ) : (
          <button onClick={() => setConfirmDelete(true)} style={{ fontSize: '0.65rem', color: 'var(--charcoal-soft)', background: 'none', border: 'none', cursor: 'pointer', opacity: 0.5 }}>Remove</button>
        )}
      </div>
    </div>
  );
}
