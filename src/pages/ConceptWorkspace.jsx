import { useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { uploadConceptAsset } from '../lib/conceptAssets';
import { resizeImageForUpload } from '../lib/image';
import { nowISO } from '../lib/utils';
import ConfirmButton from '../components/ConfirmButton';
import { useCollectionsContext } from '../context/CollectionsContext';
import NichePicker from '../components/NichePicker';
import {
  useConcept,
  updateConcept,
  archiveConcept,
  createConceptOutput,
  updateConceptOutput,
  setCurrentOutput,
  nextOutputVersion,
  useSpark,
  useSparks,
  useResearchSession,
  useResearchSessions,
  useImportSession,
  useVisualTags,
  useConceptTags,
  createVisualTag,
  applyTagToConcept,
  removeTagFromConcept,
} from '../lib/hooks';
// section is aliased -- formatKeywordContext() below already declares its
// own locally-scoped `section` helper (a different shape: label+array, not
// heading+body); the alias avoids two same-named functions in one file.
import { buildContextHeader, field, section as ctxSection } from '../lib/context';
import VisualTagPicker from '../components/VisualTagPicker';

const FUNCTION_URL = '/.netlify/functions/claude-process';

// Every AI-generated concept output — Kittl prompt, mockup prompt, listing
// draft, Pinterest copy — is generated from the same concept brief and shares
// the same version/current/edit lifecycle, so they're driven off one config
// list and one <GeneratedOutputTab> rather than four near-duplicate blocks.
const OUTPUT_TABS = [
  { key: 'kittl', outputType: 'kittl_prompt', functionType: 'generate_kittl_prompt', label: 'Kittl Prompt', resultField: 'kittl_prompt', notesField: 'design_notes' },
  { key: 'mockup', outputType: 'mockup_prompt', functionType: 'generate_mockup_prompt', label: 'Mockup Prompt', resultField: 'body', notesField: 'notes' },
  { key: 'listing', outputType: 'listing_draft', functionType: 'generate_listing_draft', label: 'Listing Draft', resultField: 'body', notesField: 'notes', extraField: { key: 'tags', label: 'Suggested tags' } },
  { key: 'pinterest', outputType: 'pinterest_copy', functionType: 'generate_pinterest_copy', label: 'Pinterest Copy', resultField: 'body', notesField: 'notes', extraField: { key: 'boards', label: 'Suggested boards' } },
];

// ── Build the concept brief sent to every generator ────────────────────────────

function buildConceptBrief(concept) {
  return `Concept Name: ${concept.name}
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
}

async function generateOutput(concept, functionType, extraContext) {
  const brief = extraContext ? `${buildConceptBrief(concept)}\n\n${extraContext}` : buildConceptBrief(concept);
  const res = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-function-secret': import.meta.env.VITE_FUNCTION_SECRET },
    body: JSON.stringify({ type: functionType, payload: brief }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || `Generation failed (${res.status})`);
  return data.parsed || data;
}

// Real B1/B2/B3 keywords from existing research for the given collections —
// used to ground the Listing Draft's suggested tags in actual search data
// instead of Claude guessing plausible-sounding phrases. Confirmed ("use")
// keywords only, so an early/unreviewed CSV import can't leak in as if vetted.
async function fetchCollectionKeywords(collectionNames) {
  if (!collectionNames?.length) return [];
  const { data: sessions } = await supabase
    .from('research_sessions')
    .select('id')
    .in('collection', collectionNames);
  if (!sessions?.length) return [];
  const { data: keywords } = await supabase
    .from('keywords')
    .select('keyword, bucket, volume, score')
    .in('research_session_id', sessions.map(s => s.id))
    .eq('tag_type', 'use')
    .eq('tags_only', false)
    .not('bucket', 'is', null);
  return keywords || [];
}

function formatKeywordContext(keywords) {
  if (!keywords.length) return '';
  const byBucket = n => keywords.filter(k => k.bucket === n).sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 8);
  const fmt = k => `"${k.keyword}"${k.volume != null ? ` (vol: ${k.volume})` : ''}`;
  const section = (label, arr) => arr.length ? `${label}:\n${arr.map(fmt).join('\n')}` : '';
  return `REAL RESEARCHED KEYWORDS (from existing TCC research — use these for suggested tags, don't invent phrases when these fit):\n\n${[
    section('Bucket 1', byBucket(1)),
    section('Bucket 2', byBucket(2)),
    section('Bucket 3', byBucket(3)),
  ].filter(Boolean).join('\n\n')}`;
}

// ── Context Bundle — "Copy Context for AI" ──────────────────────────────────
// Same pattern as ProductWorkspace.jsx's ContextBundle. Deliberately a new
// function, not a reuse of buildConceptBrief() above — that one primes
// AI-generation prompts (defaults Seasonal Flag to 'evergreen' when unset,
// correct for priming a generator) where this one represents what's actually
// been set (omits it instead). concept.raw_import's full original paste text
// is deliberately excluded from the bundle body — the parsed fields below
// already carry the substance; re-including the whole paste would duplicate
// content. It stays visible on-page under "View original paste", just not
// exported.
function ConceptContextBundle({ concept, sourceSpark, relatedResearch, importSession, moodAssets }) {
  const [copied, setCopied] = useState(null);

  function buildBundle() {
    const briefBlock = [
      field('Design Direction', concept.design_direction),
      field('Target Customer', concept.target_customer),
      field('Visual Style', concept.visual_style),
      field('Color Palette', concept.color_palette),
      field('Typography Notes', concept.typography_notes),
      field('Mood Keywords', (concept.mood_keywords || []).join(', ')),
      field('Product Types', (concept.product_types || []).join(', ')),
      field('Seasonal Flag', concept.seasonal_flag),
      field('Emotional Trigger', concept.emotional_trigger),
    ].filter(Boolean).join('\n');

    const importLine = importSession && (importSession.date || importSession.source)
      ? `Imported: ${[importSession.date, importSession.source].filter(Boolean).join(' · ')}`
      : '';

    const relatedResearchLine = relatedResearch
      ? `${relatedResearch.collection}${relatedResearch.niche ? ` / ${relatedResearch.niche}` : ''} — ${relatedResearch.source || 'source not set'} — ${relatedResearch.date || 'date not set'}`
      : '';

    // Always shows all 4 types, including "not yet generated" ones -- a
    // status checklist for "what's already done", not a content dump.
    const outputsBlock = OUTPUT_TABS.map(t => {
      const current = (concept.concept_outputs || []).find(o => o.output_type === t.outputType && o.is_current);
      return `${t.label}: ${current ? `v${current.version} (${current.output_source === 'imported' ? 'imported' : 'generated'})` : 'not yet generated'}`;
    }).join('\n');

    return `${buildContextHeader('Concept', [`Collection: ${concept.collection_name}`, `Concept: ${concept.name}${concept.concept_code ? ` (${concept.concept_code})` : ''}`])}
Mood board: ${moodAssets.length} image${moodAssets.length !== 1 ? 's' : ''} uploaded
${importLine}

${ctxSection('DESIGN BRIEF', briefBlock)}

${ctxSection('SOURCE SPARK', sourceSpark?.content)}

${ctxSection('RELATED RESEARCH', relatedResearchLine)}

GENERATED OUTPUTS
${outputsBlock}
--- END CONTEXT ---`.replace(/\n{3,}/g, '\n\n');
  }

  function handleCopy(variant) {
    navigator.clipboard.writeText(buildBundle());
    setCopied(variant);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div style={{ marginTop: 20 }}>
      <div className="section-label" style={{ marginBottom: 10 }}>Context Bundle</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="btn btn-ghost btn-sm" onClick={() => handleCopy('claude')}>📋 Copy Context for Claude</button>
        <button className="btn btn-ghost btn-sm" onClick={() => handleCopy('chatgpt')}>📋 Copy Context for ChatGPT</button>
        {copied && <span className="inline-confirm">Copied to clipboard ✓</span>}
      </div>
    </div>
  );
}

// ── Upload asset to design-vault ──────────────────────────────────────────
// The implementation now lives in src/lib/conceptAssets.js so the concept
// IMPORT modal can use the same one — screenshots arrive at import time, and
// until now they could only be attached from here, after the concept existed.
const uploadAsset = uploadConceptAsset;

// Fetches an external image URL via the fetch-image function (bypasses the
// CORS wall a direct browser fetch would hit on most image hosts) and
// uploads the result the same way a local file upload would.
async function uploadAssetFromUrl(conceptId, conceptCode, url, assetType = 'mood_board') {
  const res = await fetch('/.netlify/functions/fetch-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-function-secret': import.meta.env.VITE_FUNCTION_SECRET },
    body: JSON.stringify({ url }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || `Fetch failed (${res.status})`);
  const byteChars = atob(data.base64);
  const bytes = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
  const blob = new Blob([bytes], { type: data.mediaType });
  return uploadAsset(conceptId, conceptCode, blob, assetType);
}

// Duplicates an existing asset's file to a new storage path rather than
// re-tagging/sharing the original row — so a Mood Board copy and its Visuals
// original never share a storage_path, and deleting one can never silently
// break the other (the existing AssetCard delete always removes the file).
async function copyAssetToMoodBoard(conceptId, conceptCode, asset) {
  const ext = asset.storage_path.split('.').pop();
  const slug = (conceptCode || conceptId).toLowerCase().replace(/[^a-z0-9]/g, '-');
  const newPath = `${slug}/${Date.now()}.${ext}`;
  const { error: copyError } = await supabase.storage.from('design-vault').copy(asset.storage_path, newPath);
  if (copyError) throw copyError;
  const { data: assetRow, error: dbError } = await supabase
    .from('concept_assets')
    .insert({
      concept_id: conceptId,
      asset_type: 'mood_board',
      storage_path: newPath,
      mime_type: asset.mime_type,
      size_bytes: asset.size_bytes,
      label: asset.label,
      created_at: nowISO(),
    })
    .select()
    .single();
  if (dbError) throw dbError;
  return assetRow;
}

// Push a concept into a fresh Listing Builder draft.
//
// Only Product Type (a factual description of the blank) and the design image
// carry over — Product Name is a plain working label, never the concept's own
// guessed title, because the real title is supposed to come from whatever
// keywords get selected in Listing Builder itself, not from here.
//
// artworkAssets is deliberately the NON-mood-board list. A mood board is
// somebody else's reference image; sending one into a listing draft would put
// it into that listing's visual profile as though it were the product.
//
// Module scope so both the header and the Listing Draft tab call one
// implementation. It used to live inside the output tab, which is why the
// only route to it was: open the concept, find the Listing Draft sub-tab, and
// already have a draft generated — three steps guarding a button whose real
// prerequisite is just the concept.
async function pushConceptToListingBuilder({ concept, conceptId, artworkAssets, navigate }) {
  let imageBase64 = null;
  let imageMediaType = null;
  const asset = (artworkAssets || [])[0];
  if (asset) {
    const url = await getAssetUrl(asset.storage_path);
    if (url) {
      const res = await fetch(url);
      const blob = await res.blob();
      const resized = await resizeImageForUpload(blob);
      imageBase64 = resized.base64;
      imageMediaType = resized.mediaType;
    }
  }
  sessionStorage.setItem('tcc_concept_push', JSON.stringify({
    productName: concept.name,
    productType: (concept.product_types || []).join(', '),
    imageBase64,
    imageMediaType,
  }));
  navigate('/listing-builder?fromConcept=' + conceptId);
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
  // Called unconditionally (before the loading/not-found early return below)
  // to satisfy the Rules of Hooks — useSpark(undefined) no-ops safely while
  // concept is still null.
  const { spark: sourceSpark } = useSpark(concept?.spark_id);
  const { sparks: pickableSparks } = useSparks();
  const { session: relatedResearch } = useResearchSession(concept?.research_session_id);
  // Scoped to this concept's own collection (unlike the spark picker, which
  // stays unscoped since spark.collection_tag is often empty) — a concept's
  // collection is always set, so scoping here is unambiguous and keeps the
  // list relevant.
  const { sessions: pickableResearchSessions } = useResearchSessions(concept?.collection_name);
  // Same unconditional-call rationale as useSpark/useResearchSession above —
  // useImportSession(undefined) no-ops safely while concept is still null.
  const { session: importSession } = useImportSession(concept?.session_id);
  const { tags: allVisualTags } = useVisualTags();
  const { tags: conceptTags, refetch: refetchConceptTags } = useConceptTags(id);

  const [activeTab, setActiveTab] = useState('overview');
  const [fieldSaved, setFieldSaved] = useState('');
  const [uploading, setUploading] = useState(false);
  const [assetUrls, setAssetUrls] = useState({});
  const [assetsLoaded, setAssetsLoaded] = useState(false);
  const [headerPushing, setHeaderPushing] = useState(false);
  const [headerPushError, setHeaderPushError] = useState('');
  const fileInputRef = useRef(null);

  if (loading) return <div className="page"><div style={{ color: 'var(--charcoal-soft)', padding: 24 }}>Loading…</div></div>;
  if (!concept) return <div className="page"><div style={{ color: 'var(--charcoal-soft)', padding: 24 }}>Concept not found.</div></div>;

  // Phase 4: the concept's own classification. Saved on change rather than on
  // blur -- these are pickers, not free text, so there is no half-typed state
  // worth waiting for.
  async function handleNicheSave(field, val) {
    await updateConcept(id, { [field]: val });
    refetch();
  }

  async function handleFieldBlur(field, value) {
    await updateConcept(id, { [field]: value || null });
    setFieldSaved(field);
    refetch();
    setTimeout(() => setFieldSaved(''), 1500);
  }

  async function handleLinkSpark(sparkId) {
    await updateConcept(id, { spark_id: sparkId || null });
    refetch();
  }

  async function handleLinkResearch(sessionId) {
    await updateConcept(id, { research_session_id: sessionId || null });
    refetch();
  }

  async function handleArrayBlur(field, value) {
    const arr = value.split(',').map(s => s.trim()).filter(Boolean);
    await updateConcept(id, { [field]: arr });
    setFieldSaved(field);
    refetch();
    setTimeout(() => setFieldSaved(''), 1500);
  }

  async function handleAddConceptTag(tag) {
    let tagId = tag.id;
    if (!tagId) {
      const { data, error } = await createVisualTag(tag.name, tag.kind || null);
      if (error || !data) return;
      tagId = data.id;
    }
    await applyTagToConcept(id, tagId);
    refetchConceptTags();
  }

  async function handleRemoveConceptTag(tag) {
    await removeTagFromConcept(id, tag.id);
    refetchConceptTags();
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

  if ((activeTab === 'visuals' || activeTab === 'moodboard') && !assetsLoaded) {
    loadAssetUrls();
  }

  const moodAssets = (concept.concept_assets || []).filter(a => a.asset_type === 'mood_board');
  const otherAssets = (concept.concept_assets || []).filter(a => a.asset_type !== 'mood_board');

  const saved = (field) => fieldSaved === field;
  const activeOutputTab = OUTPUT_TABS.find(t => t.key === activeTab);

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

          {/* The point of the whole pipeline: a concept exists in order to
              become a listing. This was previously reachable only from inside
              the Listing Draft tab, and only once a draft had been generated
              there — so the one action the concept exists for was the hardest
              to find. The concept is the only real prerequisite. */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
            <button
              className="btn btn-primary btn-sm"
              disabled={headerPushing}
              onClick={async () => {
                setHeaderPushing(true);
                setHeaderPushError('');
                try {
                  await pushConceptToListingBuilder({ concept, conceptId: id, artworkAssets: otherAssets, navigate });
                } catch (err) {
                  setHeaderPushError('Push failed: ' + err.message);
                } finally {
                  setHeaderPushing(false);
                }
              }}
              title="Opens a fresh Listing Builder draft carrying this concept's product type and artwork. You still pick the collection and build the real title from actual keyword research there."
            >
              {headerPushing ? 'Pushing…' : '→ Build the listing'}
            </button>
            <span style={{ fontSize: '0.66rem', color: 'var(--charcoal-soft)' }}>
              {otherAssets.length > 0
                ? `carries product type + artwork`
                : 'carries product type — no artwork attached yet'}
            </span>
          </div>
        </div>
        {headerPushError && (
          <div style={{ fontSize: '0.72rem', color: '#a33', marginTop: 8 }}>{headerPushError}</div>
        )}
      </div>

      {/* Classification (Phase 4) — the niche is the market this concept
          serves; the seasonal overlay is the §1.1 crossover, pointing at the
          SAME niches table so a Christmas concept and a generic Christmas
          product reference one row rather than two drifting ones. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 18 }}>
        <NichePicker
          value={concept.primary_niche_id || null}
          onChange={val => handleNicheSave('primary_niche_id', val)}
          label="Niche"
          allowCreate
          helpText="Who this concept is for."
        />
        <NichePicker
          value={concept.seasonal_niche_id || null}
          onChange={val => handleNicheSave('seasonal_niche_id', val)}
          label="Seasonal overlay"
          pathPrefix="Seasonal"
          helpText="Optional — only if this concept is tied to a season or occasion."
        />
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid rgba(43,41,38,0.12)', marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          ['overview', 'Overview'],
          ...OUTPUT_TABS.map(t => {
            const versions = (concept.concept_outputs || []).filter(o => o.output_type === t.outputType);
            const current = versions.find(o => o.is_current);
            return [t.key, `${t.label}${versions.length > 1 ? ` (v${current?.version || 1})` : ''}`];
          }),
          ['moodboard', `Mood Board${moodAssets.length ? ` (${moodAssets.length})` : ''}`],
          ['visuals', `Visuals${otherAssets.length ? ` (${otherAssets.length})` : ''}`],
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
          <FieldRow label="Source Spark">
            {sourceSpark ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{
                  fontSize: '0.78rem', padding: '4px 10px', borderRadius: 20,
                  background: 'rgba(124,175,138,0.12)', color: '#2d6b3c',
                  border: '1px solid rgba(124,175,138,0.3)',
                }}>
                  🔗 {sourceSpark.content.length > 80 ? sourceSpark.content.slice(0, 80) + '…' : sourceSpark.content}
                </span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => handleLinkSpark(null)}>
                  Unlink
                </button>
              </div>
            ) : pickableSparks.length > 0 ? (
              <select value="" onChange={e => { if (e.target.value) handleLinkSpark(e.target.value); }} style={{ fontSize: '0.82rem' }}>
                <option value="">— None —</option>
                {pickableSparks.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.content.length > 60 ? s.content.slice(0, 60) + '…' : s.content}
                  </option>
                ))}
              </select>
            ) : (
              <div style={{ fontSize: '0.78rem', color: 'var(--charcoal-soft)' }}>No sparks available to link.</div>
            )}
          </FieldRow>
          <FieldRow label="Related Research">
            {relatedResearch ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{
                  fontSize: '0.78rem', padding: '4px 10px', borderRadius: 20,
                  background: 'rgba(107,130,168,0.12)', color: '#2d4270',
                  border: '1px solid rgba(107,130,168,0.3)',
                }}>
                  📊 {relatedResearch.collection}{relatedResearch.niche ? ` / ${relatedResearch.niche}` : ''} — {relatedResearch.date}
                </span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => handleLinkResearch(null)}>
                  Unlink
                </button>
              </div>
            ) : pickableResearchSessions.length > 0 ? (
              <select value="" onChange={e => { if (e.target.value) handleLinkResearch(e.target.value); }} style={{ fontSize: '0.82rem' }}>
                <option value="">— None —</option>
                {pickableResearchSessions.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.collection}{s.niche ? ` / ${s.niche}` : ''} — {s.date}
                  </option>
                ))}
              </select>
            ) : (
              <div style={{ fontSize: '0.78rem', color: 'var(--charcoal-soft)' }}>No research sessions yet for this collection.</div>
            )}
          </FieldRow>
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
          <FieldRow label="Visual Tags">
            <VisualTagPicker allTags={allVisualTags} appliedTags={conceptTags} onAdd={handleAddConceptTag} onRemove={handleRemoveConceptTag} />
          </FieldRow>

          {concept.raw_import && (
            <div style={{ marginTop: 20 }}>
              {importSession && (importSession.date || importSession.source) && (
                <div style={{ fontSize: '0.72rem', color: 'var(--charcoal-soft)', marginBottom: 6 }}>
                  📅 Imported{importSession.date ? ` ${importSession.date}` : ''}{importSession.source ? ` · ${importSession.source}` : ''}
                </div>
              )}
              <details>
                <summary style={{ fontSize: '0.75rem', color: 'var(--charcoal-soft)', cursor: 'pointer' }}>
                  View original paste
                </summary>
                <pre style={{
                  marginTop: 8, padding: '10px 12px', fontSize: '0.72rem', lineHeight: 1.6,
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'inherit',
                  background: 'var(--charcoal-faint)', borderRadius: 4, maxHeight: 300, overflowY: 'auto',
                }}>
                  {concept.raw_import}
                </pre>
              </details>
            </div>
          )}

          <ConceptContextBundle
            concept={concept}
            sourceSpark={sourceSpark}
            relatedResearch={relatedResearch}
            importSession={importSession}
            moodAssets={moodAssets}
          />

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

      {/* ── Generated output tabs (Kittl Prompt, Mockup Prompt, Listing Draft, Pinterest Copy) ── */}
      {activeOutputTab && (
        <GeneratedOutputTab
          key={activeOutputTab.key}
          concept={concept}
          refetch={refetch}
          conceptId={id}
          config={activeOutputTab}
          navigate={navigate}
          otherAssets={otherAssets}
        />
      )}

      {/* ── Mood Board tab ── */}
      {activeTab === 'moodboard' && (
        <MoodBoardTab
          concept={concept}
          conceptId={id}
          refetch={refetch}
          assetUrls={assetUrls}
          moodAssets={moodAssets}
          otherAssets={otherAssets}
          onAssetsChanged={() => setAssetsLoaded(false)}
        />
      )}

      {/* ── Visuals tab ── */}
      {activeTab === 'visuals' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--charcoal-soft)' }}>
              Reference images and exported designs
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

          {!otherAssets.length ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--charcoal-soft)' }}>
              <div style={{ fontSize: '2rem', marginBottom: 8 }}>🖼</div>
              <div style={{ fontSize: '0.85rem', marginBottom: 8 }}>No visuals yet</div>
              <div style={{ fontSize: '0.72rem', marginBottom: 16 }}>Upload reference images or Kittl exports</div>
              <button className="btn btn-primary btn-sm" onClick={() => fileInputRef.current?.click()}>+ Add Image</button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
              {otherAssets.map(asset => (
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

// One tab's worth of "current output / generate new / version history" — shared
// by Kittl Prompt, Mockup Prompt, Listing Draft, and Pinterest Copy. Each tab
// instance owns its own generate/edit state so switching tabs doesn't bleed
// state between output types.
function GeneratedOutputTab({ concept, refetch, conceptId, config, navigate, otherAssets }) {
  const { outputType, functionType, label, resultField, notesField, extraField } = config;
  const isListingTab = config.key === 'listing';
  const [generating, setGenerating] = useState(false);
  const [genResult, setGenResult] = useState(null);
  const [genError, setGenError] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingOutput, setEditingOutput] = useState(null);
  const [editBody, setEditBody] = useState('');
  const [selectedCollections, setSelectedCollections] = useState([]);
  const [pushing, setPushing] = useState(false);
  const { collectionNames: collections } = useCollectionsContext();

  const current = concept.concept_outputs?.find(o => o.output_type === outputType && o.is_current);
  const allVersions = (concept.concept_outputs || [])
    .filter(o => o.output_type === outputType)
    .sort((a, b) => b.version - a.version);

  function toggleCollection(name) {
    setSelectedCollections(sel => sel.includes(name) ? sel.filter(c => c !== name) : [...sel, name]);
  }

  async function handleGenerate() {
    setGenerating(true);
    setGenError('');
    setGenResult(null);
    try {
      let extraContext = '';
      if (isListingTab && selectedCollections.length) {
        const keywords = await fetchCollectionKeywords(selectedCollections);
        extraContext = formatKeywordContext(keywords);
      }
      const result = await generateOutput(concept, functionType, extraContext);
      if (!result?.[resultField]) throw new Error('No result returned');
      setGenResult(result);
    } catch (err) {
      setGenError('Generation failed: ' + err.message);
    } finally {
      setGenerating(false);
    }
  }

  async function handlePushToListingBuilder() {
    setPushing(true);
    try {
      await pushConceptToListingBuilder({ concept, conceptId, artworkAssets: otherAssets, navigate });
    } catch (err) {
      setGenError('Push failed: ' + err.message);
    } finally {
      setPushing(false);
    }
  }

  async function handleSaveGenerated() {
    if (!genResult?.[resultField]) return;
    setSaving(true);
    try {
      const version = await nextOutputVersion(conceptId, outputType);
      const { data: output, error } = await createConceptOutput({
        concept_id: conceptId,
        output_type: outputType,
        version,
        is_current: true,
        body: genResult[resultField],
        output_source: 'generated',
        model_used: 'claude-haiku-4-5-20251001',
        generation_notes: genResult[notesField] || null,
      });
      if (error || !output) throw new Error(error?.message || 'Save failed');
      await setCurrentOutput(conceptId, outputType, output.id);
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
    await setCurrentOutput(conceptId, outputType, outputId);
    refetch();
  }

  return (
    <div>
      {/* Current output */}
      {current ? (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--charcoal-soft)' }}>
              Current · v{current.version} · {current.output_source === 'imported' ? 'imported' : 'generated'}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {isListingTab && (
                <button
                  className="btn btn-primary btn-sm"
                  onClick={handlePushToListingBuilder}
                  disabled={pushing}
                  title="Opens a fresh Listing Builder draft with product type and design image carried over — you still pick the collection and build the real title from actual keyword research there."
                >
                  {pushing ? 'Pushing…' : '→ Push to Listing Builder'}
                </button>
              )}
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => { setEditingOutput(current); setEditBody(current.body); }}
              >
                Edit
              </button>
            </div>
          </div>

          {editingOutput?.id === current.id ? (
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
              {current.body}
            </div>
          )}

          {current.generation_notes && (
            <div style={{ marginTop: 8, fontSize: '0.72rem', color: 'var(--charcoal-soft)', fontStyle: 'italic' }}>
              {current.generation_notes}
            </div>
          )}
        </div>
      ) : (
        <div style={{ marginBottom: 24, padding: '16px', background: 'rgba(232,168,124,0.08)', border: '1px solid rgba(232,168,124,0.3)', borderRadius: 8, fontSize: '0.82rem', color: 'var(--charcoal-soft)' }}>
          No {label.toLowerCase()} yet. Generate one below or import a concept that includes one.
        </div>
      )}

      {/* Generate new */}
      <div style={{ marginBottom: 24 }}>
        {isListingTab && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--charcoal-soft)', marginBottom: 6 }}>
              Pull real keywords from research (optional) — picks suggested tags from actual search data instead of guessing. Leave blank for a rough pre-research draft.
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {collections.map(name => (
                <button key={name} type="button" onClick={() => toggleCollection(name)}
                  style={{
                    fontSize: '0.7rem', padding: '3px 10px', borderRadius: 20, cursor: 'pointer',
                    border: '1px solid rgba(43,41,38,0.2)',
                    background: selectedCollections.includes(name) ? 'var(--dusty-rose)' : 'transparent',
                    color: selectedCollections.includes(name) ? 'white' : 'var(--charcoal-soft)',
                    fontWeight: selectedCollections.includes(name) ? 600 : 400,
                  }}>
                  {name}
                </button>
              ))}
            </div>
          </div>
        )}
        <div style={{ fontSize: '0.75rem', color: 'var(--charcoal-soft)', marginBottom: 10 }}>
          Generate a new {label.toLowerCase()} from this concept's brief using Claude.
        </div>
        <button
          className="btn btn-primary btn-sm"
          onClick={handleGenerate}
          disabled={generating}
        >
          {generating ? 'Generating…' : current ? 'Generate new version' : `Generate ${label}`}
        </button>

        {genError && (
          <div style={{ marginTop: 8, fontSize: '0.75rem', color: 'var(--alert)' }}>{genError}</div>
        )}

        {genResult && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--charcoal-soft)', marginBottom: 6 }}>
              Preview — v{allVersions.length + 1} · generated
            </div>
            <div style={{ padding: '14px 16px', background: 'rgba(124,175,138,0.08)', border: '1px solid rgba(124,175,138,0.3)', borderRadius: 8, fontSize: '0.85rem', lineHeight: 1.6, whiteSpace: 'pre-wrap', marginBottom: 10 }}>
              {genResult[resultField]}
            </div>
            {extraField && genResult[extraField.key]?.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: '0.68rem', color: 'var(--charcoal-soft)', marginBottom: 4 }}>{extraField.label}</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {genResult[extraField.key].map((v, i) => (
                    <span key={i} style={{ fontSize: '0.72rem', padding: '3px 9px', borderRadius: 12, background: 'rgba(124,175,138,0.12)', color: '#2d6b3c' }}>{v}</span>
                  ))}
                </div>
              </div>
            )}
            {genResult[notesField] && (
              <div style={{ fontSize: '0.72rem', color: 'var(--charcoal-soft)', fontStyle: 'italic', marginBottom: 10 }}>
                {genResult[notesField]}
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
      {allVersions.length > 1 && (
        <div>
          <div className="section-label" style={{ marginBottom: 10 }}>Version history</div>
          {allVersions.map(v => (
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
  );
}

function AssetCard({ asset, url, onDelete }) {
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
        <ConfirmButton
          label="Remove"
          triggerStyle={{ fontSize: '0.65rem', opacity: 0.5 }}
          wrapperStyle={{ gap: 6, fontSize: '0.68rem' }}
          confirmLabel="Delete"
          onConfirm={onDelete}
        />
      </div>
    </div>
  );
}

// Pinterest-style masonry board, independent from the Visuals tab's assets —
// images get here by direct upload, drag-and-drop, pasting an image URL, or
// copying one over from Visuals. Each add method funnels through the same
// asset_type: 'mood_board' concept_assets row.
function MoodBoardTab({ concept, conceptId, refetch, assetUrls, moodAssets, otherAssets, onAssetsChanged }) {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [urlSubmitting, setUrlSubmitting] = useState(false);
  const [showAddExisting, setShowAddExisting] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  async function addFile(file) {
    setError('');
    setUploading(true);
    try {
      await uploadAsset(conceptId, concept.concept_code, file, 'mood_board');
      refetch();
      onAssetsChanged();
    } catch (err) {
      setError('Upload failed: ' + err.message);
    } finally {
      setUploading(false);
    }
  }

  function handleFileInput(e) {
    const file = e.target.files?.[0];
    if (file) addFile(file);
    e.target.value = '';
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) addFile(file);
  }

  async function handleAddUrl() {
    if (!urlInput.trim()) return;
    setError('');
    setUrlSubmitting(true);
    try {
      await uploadAssetFromUrl(conceptId, concept.concept_code, urlInput.trim());
      setUrlInput('');
      refetch();
      onAssetsChanged();
    } catch (err) {
      setError("Couldn't add that image: " + err.message);
    } finally {
      setUrlSubmitting(false);
    }
  }

  async function handleAddExisting(asset) {
    setError('');
    try {
      await copyAssetToMoodBoard(conceptId, concept.concept_code, asset);
      refetch();
      onAssetsChanged();
    } catch (err) {
      setError("Couldn't add that image: " + err.message);
    }
  }

  async function handleRemove(asset) {
    await supabase.storage.from('design-vault').remove([asset.storage_path]);
    await supabase.from('concept_assets').delete().eq('id', asset.id);
    refetch();
    onAssetsChanged();
  }

  return (
    <div>
      <div style={{ fontSize: '0.75rem', color: 'var(--charcoal-soft)', marginBottom: 16 }}>
        Inspiration and reference images for this concept — upload, drag in, paste an image URL, or pull one from Visuals.
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <button className="btn btn-primary btn-sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
          {uploading ? 'Uploading…' : '+ Upload Image'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          style={{ display: 'none' }}
          onChange={handleFileInput}
        />
        {otherAssets.length > 0 && (
          <button className="btn btn-ghost btn-sm" onClick={() => setShowAddExisting(v => !v)}>
            {showAddExisting ? 'Close' : '+ Add from Visuals'}
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          value={urlInput}
          onChange={e => setUrlInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleAddUrl(); }}
          placeholder="Paste an image URL (e.g. from Pinterest)…"
          style={{ flex: 1, fontSize: '0.8rem' }}
        />
        <button className="btn btn-ghost btn-sm" onClick={handleAddUrl} disabled={urlSubmitting || !urlInput.trim()}>
          {urlSubmitting ? 'Adding…' : 'Add'}
        </button>
      </div>

      {error && <div style={{ fontSize: '0.75rem', color: 'var(--alert)', marginBottom: 12 }}>{error}</div>}

      {showAddExisting && (
        <div style={{ marginBottom: 16, padding: 12, background: 'var(--warm-white)', border: '1px solid rgba(43,41,38,0.1)', borderRadius: 8 }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--charcoal-soft)', marginBottom: 8 }}>Click an image to copy it onto the board</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: 8 }}>
            {otherAssets.map(asset => (
              <img
                key={asset.id}
                src={assetUrls[asset.id]}
                alt={asset.label || 'asset'}
                onClick={() => handleAddExisting(asset)}
                style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 6, cursor: 'pointer', display: 'block' }}
              />
            ))}
          </div>
        </div>
      )}

      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        style={{
          border: dragOver ? '2px dashed var(--dusty-rose)' : '2px solid transparent',
          borderRadius: 8, padding: dragOver ? 10 : 0,
          background: dragOver ? 'rgba(124,175,138,0.05)' : 'transparent',
        }}
      >
        {!moodAssets.length ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--charcoal-soft)', border: '2px dashed rgba(43,41,38,0.15)', borderRadius: 8 }}>
            <div style={{ fontSize: '2rem', marginBottom: 8 }}>📌</div>
            <div style={{ fontSize: '0.85rem', marginBottom: 4 }}>No mood board images yet</div>
            <div style={{ fontSize: '0.72rem' }}>Drag an image here, upload one, or paste a URL above</div>
          </div>
        ) : (
          <div style={{ columnWidth: 180, columnGap: 12 }}>
            {moodAssets.map(asset => (
              <MoodBoardCard key={asset.id} asset={asset} url={assetUrls[asset.id]} onDelete={() => handleRemove(asset)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MoodBoardCard({ asset, url, onDelete }) {
  return (
    <div style={{ breakInside: 'avoid', marginBottom: 12, position: 'relative', borderRadius: 8, overflow: 'hidden', background: 'var(--warm-white)', border: '1px solid rgba(43,41,38,0.1)' }}>
      {url ? (
        <img src={url} alt={asset.label || 'mood board image'} style={{ width: '100%', display: 'block' }} />
      ) : (
        <div style={{ width: '100%', aspectRatio: '1', background: 'rgba(43,41,38,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem' }}>🖼</div>
      )}
      <div style={{ position: 'absolute', top: 6, right: 6 }}>
        <ConfirmButton
          dark
          label="✕"
          triggerStyle={{ background: 'rgba(43,41,38,0.6)', borderRadius: '50%', width: 24, height: 24, fontSize: '0.7rem' }}
          wrapperStyle={{ gap: 4, background: 'rgba(43,41,38,0.85)', borderRadius: 6, padding: '3px 6px', fontSize: '0.68rem' }}
          confirmLabel="Remove"
          onConfirm={onDelete}
        />
      </div>
    </div>
  );
}
