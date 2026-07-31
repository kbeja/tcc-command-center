import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useProduct, useCollections, useCollectionObjects, usePlaybooks, createProduct, updateProduct } from '../lib/hooks';
import { nicheStyleGuides } from '../data/collections';
import { STAGES } from '../data/stages';

const SEO_STANDARDS_FALLBACK = `TCC SEO STANDARDS v2 — 3-Bucket Keyword Framework (Taylor Posada method)

KEYWORD BUCKETS
Bucket 1 — Visibility (Unicorn): High volume, LOW competition. Primary search intent. Usually just ONE per listing — scarce by design. Represents what the buyer actually types first.
Bucket 2 — Reach (Supporting): High-to-medium volume, medium-to-low competition. Where most keywords live. This is the real depth of a listing — expect the most usable keywords here.
Bucket 3 — Scalability (Broad): High volume, medium-to-high competition. Category terms, seasonal language, and buyer-intent phrases ("gift for her", "birthday gift", "booktok gift") all fold into Bucket 3 — they are content within it, not a separate tier.

BALANCE RULE: all three buckets must have real representation in both title and tags — not just ordered correctly, but genuinely covered. A listing missing any bucket is incomplete.

TITLE STRUCTURE — ORDER IS FIXED
[Bucket 1] , [Bucket 2] , [Bucket 3]
• Comma ( , ) marks every bucket boundary — NOT pipes, NOT dashes
• First 30–50 characters must contain the Bucket 1 phrase
• Title Case Throughout, max 140 characters
• CORRECT: "Morally Gray Enthusiast Shirt, Fantasy Reader Shirt, Book Lover Gift"
• Overlap check: if two keywords significantly overlap (e.g. "SLP grad" + "SLP grad student"), use the longer phrase — Etsy direct-matches the shorter within it, so both is redundant

TAG RULES
• Bucket 1 phrase repeats directly in tags — intentional, not a mistake
• Buckets 2–3: reinforce with adjacent phrasing, do NOT restate title terms verbatim
• Misspellings (is_misspelling_variant): tags only — never title or description

DESCRIPTION — 6-SECTION STRUCTURE
1. SEO Opener  2. Product Details  3. Ordering Steps  4. Cross-Sell  5. Shipping  6. Brand Voice Closer`;

const BRAND_VOICE_FALLBACK = `THE THREE GEARS
Aspirational: "You already know who you are. This is just the shirt that proves it."
Honest & Grounding: "It's not always beautiful. But it's always real."
Sarcastic & Warm: "Fine. You didn't ask for advice. Here's a shirt instead."

TARGET CUSTOMER VOICE
Present, capable, carries chaos lightly — without performing it.
She's not surviving motherhood as a brand. She just lives it.
✅ Dry, specific, occasionally delighted by small things
❌ No Hallmark energy — no sappy, wistful, or inspirational-quote copy
❌ No "Every moment is precious" / "You are enough" / "You've got this"
❌ No wistful past-tense ("Remember when…") — she lives in the present tense`;

const DESC_META = {
  seo_opener:        { label: 'SEO Opener',         hint: '2 sentences, keyword-dense, naturally phrased' },
  product_details:   { label: 'Product Details',    hint: 'Size, color, material, format, what\'s included' },
  ordering_steps:    { label: 'Ordering Steps',     hint: 'How to order, customize, or download' },
  cross_sell:        { label: 'Cross-Sell',         hint: 'Shop our [collection] for more designs like this…' },
  shipping:          { label: 'Shipping',           hint: 'Standard shipping policy language' },
  brand_voice_closer:{ label: 'Brand Voice Closer', hint: '1–2 sentences, TCC voice, no Hallmark energy' },
};

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="btn btn-ghost btn-sm"
      style={{ flexShrink: 0 }}
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
    >
      {copied ? '✓' : 'Copy'}
    </button>
  );
}

function SaveFlagsButton({ flags, productId }) {
  const [state, setState] = useState('idle'); // idle | saving | saved | copied
  if (!flags?.length) return null;

  const flagText = `--- Listing Builder Flags ---\n${flags.map(f => `⚠ ${f}`).join('\n')}`;

  async function handleSave() {
    if (!productId) {
      navigator.clipboard.writeText(flagText);
      setState('copied');
      setTimeout(() => setState('idle'), 2000);
      return;
    }
    setState('saving');
    const { data: current } = await supabase.from('products').select('notes').eq('id', productId).single();
    const existing = current?.notes || '';
    const newNotes = existing ? `${existing}\n\n${flagText}` : flagText;
    await updateProduct(productId, { notes: newNotes });
    setState('saved');
    setTimeout(() => setState('idle'), 3000);
  }

  return (
    <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.68rem' }} onClick={handleSave} disabled={state === 'saving'}>
      {state === 'saved' ? '✓ Saved to notes' : state === 'copied' ? '✓ Copied' : state === 'saving' ? 'Saving…' : productId ? 'Save to notes' : 'Copy flags'}
    </button>
  );
}

function KeywordPatchPanel({ currentTitle, currentTags, researchFlags, onApply }) {
  const [open, setOpen]                   = useState(false);
  const [manualText, setManualText]       = useState('');
  const [extracted, setExtracted]         = useState([]);
  const [extracting, setExtracting]       = useState(false);
  const [patching, setPatching]           = useState(false);
  const [proposal, setProposal]           = useState(null);
  const [error, setError]                 = useState('');

  async function handleScreenshot(file) {
    setExtracting(true);
    setError('');
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target.result.split(',')[1];
      try {
        const res = await fetch('/.netlify/functions/claude-process', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'extract_keywords_image', payload: { imageBase64: base64, mediaType: file.type || 'image/png' } }),
        });
        const data = await res.json();
        setExtracted(data.keywords || []);
      } catch { setError('Screenshot extraction failed'); }
      setExtracting(false);
    };
    reader.readAsDataURL(file);
  }

  function parseManual() {
    return manualText.trim().split('\n').filter(Boolean).map(line => {
      const [keyword, volume, competition, score] = line.split('|').map(p => p.trim());
      return { keyword, volume: volume ? parseInt(volume) : null, competition: competition ? parseInt(competition) : null, score: score ? parseInt(score) : null };
    }).filter(k => k.keyword);
  }

  const keywords = extracted.length > 0 ? extracted : parseManual();
  const hasInput = extracted.length > 0 || manualText.trim().length > 0;

  async function handlePatch() {
    setPatching(true);
    setError('');
    try {
      const res = await fetch('/.netlify/functions/claude-process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'patch_listing_keywords', payload: { currentTitle, currentTags, newKeywords: keywords, researchFlags } }),
      });
      const raw = await res.text();
      let data;
      try { data = JSON.parse(raw); } catch { setError(`Server error: ${raw.slice(0, 150)}`); setPatching(false); return; }
      if (!data.parsed) { setError(data.error || 'No output returned'); setPatching(false); return; }
      setProposal(data.parsed);
    } catch (err) { setError(err.message); }
    setPatching(false);
  }

  function reset() { setOpen(false); setManualText(''); setExtracted([]); setProposal(null); setError(''); }

  if (!open) {
    return (
      <button className="btn btn-ghost btn-sm" style={{ marginTop: 8, fontSize: '0.75rem' }} onClick={() => setOpen(true)}>
        + Found new keywords? Apply to title & tags →
      </button>
    );
  }

  if (proposal) {
    const titleChanged = proposal.title !== currentTitle;
    const tagsChanged  = JSON.stringify(proposal.tags) !== JSON.stringify(currentTags);
    const anyChange    = titleChanged || tagsChanged;
    return (
      <div style={{ marginTop: 12, background: 'rgba(124,175,138,0.08)', border: '1px solid rgba(124,175,138,0.3)', borderRadius: 4, padding: '12px 14px' }}>
        <div style={{ fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#2d6b3c', marginBottom: 6 }}>Proposed Update</div>
        <div style={{ fontSize: '0.82rem', color: '#2d6b3c', lineHeight: 1.6, marginBottom: 10 }}>{proposal.changes}</div>
        {anyChange ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={() => { onApply(proposal.title, proposal.tags); reset(); }}>Accept changes</button>
            <button className="btn btn-ghost btn-sm" onClick={reset}>Dismiss</button>
          </div>
        ) : (
          <button className="btn btn-ghost btn-sm" onClick={reset}>OK</button>
        )}
      </div>
    );
  }

  return (
    <div style={{ marginTop: 12, background: 'var(--warm-white)', border: '1px solid rgba(43,41,38,0.1)', borderRadius: 4, padding: '12px 14px' }}>
      <div style={{ fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--charcoal-soft)', marginBottom: 10 }}>Apply New Keywords</div>
      {extracted.length > 0 ? (
        <div style={{ fontSize: '0.78rem', color: '#2d6b3c', marginBottom: 10 }}>✓ {extracted.length} keywords extracted — ready to apply</div>
      ) : (
        <>
          <div style={{ fontSize: '0.72rem', color: 'var(--charcoal-soft)', marginBottom: 6 }}>Upload an Everbee screenshot or enter keywords manually (keyword | volume | competition | score):</div>
          <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer', marginBottom: 8, display: 'inline-block' }}>
            {extracting ? 'Extracting…' : 'Upload screenshot'}
            <input type="file" accept="image/*" style={{ display: 'none' }} disabled={extracting} onChange={e => { if (e.target.files[0]) handleScreenshot(e.target.files[0]); }} />
          </label>
          <textarea
            value={manualText}
            onChange={e => setManualText(e.target.value)}
            placeholder={'beach reads shirt | 2400 | 180 | 52000\nspicy book shirt | 1800 | 95 | 38000'}
            rows={3}
            style={{ width: '100%', fontSize: '0.78rem', fontFamily: 'monospace' }}
          />
        </>
      )}
      {error && <div style={{ fontSize: '0.75rem', color: '#c97b7b', marginBottom: 8 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button className="btn btn-primary btn-sm" onClick={handlePatch} disabled={patching || !hasInput}>
          {patching ? 'Applying…' : 'Apply to title & tags →'}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={reset}>Cancel</button>
      </div>
    </div>
  );
}

function SectionHeader({ title }) {
  return (
    <div className="section-label" style={{ marginTop: 24, marginBottom: 12 }}>{title}</div>
  );
}

function computeBucketWarnings(keywords, sessions) {
  const usable = keywords.filter(k => !k.tags_only && k.tag_type !== 'discard');
  if (usable.length === 0) {
    return [{ severity: 'high', msg: 'No validated keywords — run research before generating.' }];
  }

  const b1 = usable.filter(k => k.bucket === 1);
  const b2 = usable.filter(k => k.bucket === 2);
  const b3 = usable.filter(k => k.bucket === 3);
  const unclassified = usable.filter(k => !k.bucket);
  const warnings = [];

  if (b1.length === 0) {
    warnings.push({ severity: 'high', msg: 'No Bucket 1 keyword (high volume, low competition). Keep researching — this is your unicorn and it\'s scarce by design.' });
  }
  if (b2.length === 0) {
    warnings.push({ severity: 'high', msg: 'No Bucket 2 keywords (reach/supporting). These are the bulk of a listing — more research needed.' });
  }
  if (b3.length === 0 && usable.length >= 3) {
    warnings.push({ severity: 'medium', msg: 'No Bucket 3 keywords (scalability). Add broad category terms and buyer-intent phrases (gift for her, birthday gift, etc.).' });
  }
  if (unclassified.length > 0) {
    warnings.push({ severity: 'medium', msg: `${unclassified.length} keyword(s) not yet bucket-classified. Run the SQL migration or edit keywords manually to assign buckets.` });
  }

  const seasonalSessions = (sessions || []).filter(s => s.seasonal);
  if (seasonalSessions.length > 0 && b1.length > 0) {
    warnings.push({ severity: 'low', msg: `${seasonalSessions.length} seasonal research session(s) in use — verify keyword spikes fall within the next 2–3 months before publishing.` });
  }

  return warnings;
}

function buildContext({ form, keywords, styleGuide, seoStandards, brandVoice, photoStandards, imageAnalysis }) {
  const usable    = keywords.filter(k => !k.tags_only && k.tag_type !== 'discard');
  const watchKws  = keywords.filter(k => k.tag_type === 'watch' && !k.tags_only);
  const tagsKws   = keywords.filter(k => k.tags_only || k.is_misspelling_variant);

  const b1 = usable.filter(k => k.bucket === 1 && k.tag_type !== 'watch');
  const b2 = usable.filter(k => k.bucket === 2 && k.tag_type !== 'watch');
  const b3 = usable.filter(k => k.bucket === 3 && k.tag_type !== 'watch');
  const unclassified = usable.filter(k => !k.bucket && k.tag_type !== 'watch');

  const byScore = arr => [...arr].sort((a, b) => (b.score || 0) - (a.score || 0));

  const fmtKw = k =>
    `  "${k.keyword}"` +
    (k.volume      != null ? ` (vol: ${Number(k.volume).toLocaleString()}` : '') +
    (k.competition != null ? `, comp: ${Number(k.competition).toLocaleString()}` : '') +
    (k.score       != null ? `, score: ${Number(k.score).toLocaleString()}` : '') +
    (k.volume      != null ? ')' : '');

  return `Generate a complete Etsy listing for TCC (The Current Chapter).

━━━ TCC SEO STANDARDS v2 — 3-BUCKET SYSTEM — FOLLOW EXACTLY ━━━
BUCKET DEFINITIONS:
  Bucket 1 — Visibility (Unicorn): High volume, LOW competition. Primary search intent. ONE per listing — scarce by design. Goes FIRST in title and tags.
  Bucket 2 — Reach (Supporting): High-to-medium volume, medium-to-low competition. The bulk of a listing's depth. Most keywords live here.
  Bucket 3 — Scalability (Broad): High volume, medium-to-HIGH competition. Category terms, seasonal language ("Fall", "Halloween"), and buyer-intent phrases ("gift for her", "birthday gift") all belong in Bucket 3 — they are CONTENT within it, not separate tiers.

TITLE FORMAT — ORDER IS FIXED:
  [Bucket 1] , [Bucket 2] , [Bucket 3]
  - Comma ( , ) marks every bucket boundary — NOT pipes, NOT dashes
  - First 30–50 characters must contain the Bucket 1 phrase
  - Title Case Throughout, max 140 characters
  - CORRECT: "Morally Gray Enthusiast Shirt, Fantasy Reader Shirt, Book Lover Gift"
  - WRONG: "Morally Gray Enthusiast Shirt | Fantasy Reader | Book Lover" (no pipes)
  - OVERLAP CHECK: if two keywords significantly overlap (e.g. "SLP grad" and "SLP grad student"), use the longer phrase only — Etsy direct-matches the shorter within it, so listing both is redundant

TAG RULES:
  - Bucket 1 phrase: repeat exactly in tags — INTENTIONAL, not an error
  - Buckets 2–3: reinforce with adjacent phrasing, do NOT restate title terms verbatim
  - Misspellings listed below: include in tags exactly as shown — never invent new ones
  - Fill each tag to 18–20 characters, max 20

BALANCE REQUIREMENT: all three buckets must have real representation in both title and tags.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PRODUCT:
Name: ${form.productName || 'Untitled product'}
Product Type: ${form.productType || 'print-on-demand item'}
Collection: ${form.collection || '—'}
Niche / Sub-niche: ${form.niche || '—'}
Emotional Trigger: ${form.emotionalTrigger || '— NOT SET; infer from design and niche'}
${form.notes ? `Notes: ${form.notes}` : ''}

${imageAnalysis ? `DESIGN IMAGE ANALYSIS:\n${imageAnalysis}\n` : ''}
KEYWORDS — USE THESE IN THE LISTING:

Bucket 1 — Visibility (high vol, low comp — your unicorn):
${byScore(b1).map(fmtKw).join('\n') || '  [none classified yet — infer from niche context and listed keywords]'}

Bucket 2 — Reach (high-med vol, med-low comp — supporting keywords):
${byScore(b2).map(fmtKw).join('\n') || '  [none]'}

Bucket 3 — Scalability (high vol, high comp — broad + seasonal + buyer-intent):
${byScore(b3).map(fmtKw).join('\n') || '  [none — add broad category terms and buyer-intent phrases as Bucket 3 content]'}

${unclassified.length ? `Unclassified (use best judgment — incorporate where they fit):\n${byScore(unclassified).map(fmtKw).join('\n')}` : ''}
${watchKws.length ? `\nWatch keywords (lower confidence — use only if needed for coverage):\n${byScore(watchKws).slice(0, 6).map(fmtKw).join('\n')}` : ''}

Misspelling variants (tags only — NEVER in title or description):
${tagsKws.map(k => `  "${k.keyword}"`).join('\n') || '  [none]'}

STYLE GUIDE:
${styleGuide || '— No style guide. Infer aesthetic from design image and niche.'}

SEO STANDARDS:
${seoStandards}

BRAND VOICE:
${brandVoice}

${photoStandards ? `LISTING PHOTO STANDARDS:\n${photoStandards}\n` : ''}
Generate now. Return ONLY this JSON — no markdown, no text outside the object:
{
  "title": "string — [B1] , [B2] , [B3] comma format, max 140 chars, Title Case",
  "tags": ["string", "string", "string", "string", "string", "string", "string", "string", "string", "string", "string", "string", "string"],
  "description": {
    "seo_opener": "string",
    "product_details": "string",
    "ordering_steps": "string",
    "cross_sell": "string",
    "shipping": "string",
    "brand_voice_closer": "string"
  },
  "image_prompts": [
    {"slot": 1, "type": "Main product shot", "prompt": "string — detailed ChatGPT image prompt"},
    {"slot": 2, "type": "Lifestyle — worn/in use", "prompt": "string"},
    {"slot": 3, "type": "Lifestyle — environment", "prompt": "string"},
    {"slot": 4, "type": "Detail / closeup", "prompt": "string"},
    {"slot": 5, "type": "Flat lay", "prompt": "string"},
    {"slot": 6, "type": "Gift context", "prompt": "string"},
    {"slot": 7, "type": "Color or style variant", "prompt": "string"},
    {"slot": 8, "type": "Size reference", "prompt": "string"},
    {"slot": 9, "type": "Social / UGC style", "prompt": "string"},
    {"slot": 10, "type": "Brand aesthetic / mood", "prompt": "string"}
  ],
  "bucket_assignment": {"b1": "string — the bucket 1 keyword used", "b2": ["strings"], "b3": ["strings"]},
  "research_flags": ["string — missing bucket coverage, balance issues, overlap candidates, or anything that needs more research"]
}

REQUIREMENTS:
- Title: [B1] , [B2] , [B3] comma order, max 140 chars, Title Case, B1 in first 30–50 chars
- Tags: exactly 13, each max 20 chars, B1 repeats intentionally, B2–3 reinforce not duplicate
- Balance: all three buckets represented in both title and tags
- Misspellings/tags-only keywords: tags only, never title or description
- Each description section distinct — not one paragraph split arbitrarily
- Image prompts: specific enough for ChatGPT — include product type, colors, setting, lighting, demographic, angle
- research_flags: flag any missing bucket, balance gap, overlap to combine, or keywords needing validation`;
}

const PARENT_NICHES = ['Reader Chapter', 'Mom Chapter', 'Kids Chapter'];

export default function ListingBuilder() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const productId = searchParams.get('product');

  const { product, loading: productLoading } = useProduct(productId);
  const { collections } = useCollections();
  const { collections: collectionObjs } = useCollectionObjects();
  const { playbooks } = usePlaybooks();

  // Form
  const [form, setForm] = useState({
    productName: '', collection: '', niche: '', productType: '', emotionalTrigger: '', notes: '',
  });
  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Populate from product when loaded
  const [existingListing, setExistingListing] = useState(false);
  useEffect(() => {
    if (!product) return;
    setForm(f => ({
      ...f,
      productName:      product.name || '',
      collection:       product.collection || '',
      niche:            product.niche || '',
      emotionalTrigger: product.emotional_trigger || '',
    }));
    if (product.live_title) {
      setEditTitle(product.live_title);
      setExistingListing(true);
    }
    if (product.live_tags) {
      setEditTags(product.live_tags.split(',').map(t => t.trim()).filter(Boolean));
      setExistingListing(true);
    }
  }, [product]);

  // Research sessions for the selected collection
  const [sessions, setSessions] = useState([]);
  useEffect(() => {
    if (!form.collection) { setSessions([]); return; }
    supabase.from('research_sessions').select('*, keywords(*)')
      .eq('collection', form.collection)
      .then(({ data }) => setSessions(data || []));
  }, [form.collection]);

  // Flatten + deduplicate keywords
  const allKeywords = (() => {
    const map = new Map();
    for (const s of sessions) {
      for (const k of (s.keywords || [])) {
        const key = `${k.keyword?.toLowerCase()}|${k.tags_only ? 'tags' : k.tag_type}`;
        const ex = map.get(key);
        if (!ex || (k.score || 0) > (ex.score || 0)) map.set(key, k);
      }
    }
    return [...map.values()];
  })();

  const useKws   = allKeywords.filter(k => k.tag_type === 'use'   && !k.tags_only);
  const watchKws = allKeywords.filter(k => k.tag_type === 'watch' && !k.tags_only);
  const totalUsable = useKws.length + watchKws.length;

  // Playbooks
  const photoPlaybook      = playbooks.find(p => p.slug === 'listing-photos');
  const seoPlaybook        = playbooks.find(p => p.slug === 'seo-standards');
  const brandVoicePlaybook = playbooks.find(p => p.slug === 'brand-voice');

  const seoStandards  = seoPlaybook?.playbook_sections?.map(s => s.body).join('\n\n') || SEO_STANDARDS_FALLBACK;
  const brandVoice    = brandVoicePlaybook?.playbook_sections?.map(s => s.body).join('\n\n') || BRAND_VOICE_FALLBACK;
  const photoStandards = photoPlaybook?.playbook_sections?.map(s => s.body).join('\n\n') || '';

  const collectionObj = collectionObjs.find(c => c.name === form.collection);
  const nicheKey = (form.niche || '').toLowerCase();
  const styleGuide = nicheStyleGuides[nicheKey] || collectionObj?.style_guide || '';

  // Design image
  const [imagePreview, setImagePreview] = useState(null);
  const [imageBase64, setImageBase64]   = useState(null);
  const [imageMediaType, setImageMediaType] = useState('image/png');
  const [analyzing, setAnalyzing]       = useState(false);
  const [imageAnalysis, setImageAnalysis] = useState('');

  const handleImage = useCallback(async (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target.result;
      setImagePreview(dataUrl);
      const base64 = dataUrl.split(',')[1];
      const mediaType = file.type || 'image/png';
      setImageBase64(base64);
      setImageMediaType(mediaType);
      setAnalyzing(true);
      try {
        const res = await fetch('/.netlify/functions/claude-process', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'analyze_design_image', payload: { imageBase64: base64, mediaType } }),
        });
        const data = await res.json();
        setImageAnalysis(data.analysis || '');
      } catch (err) {
        console.error('Image analysis failed:', err);
      }
      setAnalyzing(false);
    };
    reader.readAsDataURL(file);
  }, []);

  // Ctrl+V paste listener for design image
  useEffect(() => {
    function handlePaste(e) {
      const items = e.clipboardData?.items;
      if (!items) return;
      const active = document.activeElement?.tagName;
      if (active === 'INPUT' || active === 'TEXTAREA') return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) { handleImage(file); break; }
        }
      }
    }
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [handleImage]);

  // Readiness checks
  const readiness = [
    { label: `${totalUsable} usable keyword${totalUsable !== 1 ? 's' : ''}`, ok: totalUsable >= 5, warn: totalUsable < 5 },
    { label: styleGuide ? 'Style guide' : 'Style guide missing', ok: !!styleGuide, warn: !styleGuide },
    { label: form.emotionalTrigger ? 'Emotional trigger' : 'Emotional trigger not set', ok: !!form.emotionalTrigger, warn: !form.emotionalTrigger },
    { label: imageAnalysis ? 'Design image analyzed' : (imagePreview ? 'Analyzing image…' : 'No design image'), ok: !!imageAnalysis, warn: !imageAnalysis },
  ];
  const hasWarnings = readiness.some(r => r.warn);
  const bucketWarnings = form.collection ? computeBucketWarnings(allKeywords, sessions) : [];

  // Generation
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError]     = useState('');
  const [output, setOutput]         = useState(null);

  async function handleGenerate() {
    if (!form.collection) { setGenError('Please select a collection first.'); return; }
    setGenerating(true);
    setGenError('');
    setOutput(null);
    try {
      const context = buildContext({ form, keywords: allKeywords, styleGuide, seoStandards, brandVoice, photoStandards, imageAnalysis });
      const res = await fetch('/.netlify/functions/claude-process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'generate_listing', payload: { imageBase64: imageBase64 || null, mediaType: imageMediaType, context } }),
      });
      const rawText = await res.text();
      let data;
      try {
        data = JSON.parse(rawText);
      } catch {
        setGenError(`HTTP ${res.status} — server returned non-JSON: ${rawText.slice(0, 300)}`);
        setGenerating(false);
        return;
      }
      if (!data.parsed) { setGenError(`Generation failed — ${data.error || data.raw?.slice(0, 200) || 'no output returned'}`); setGenerating(false); return; }
      setOutput(data.parsed);
    } catch (err) {
      setGenError(err.message);
    }
    setGenerating(false);
  }

  // Save as new product (standalone mode only)
  const [saveStage, setSaveStage]   = useState('Live');
  const [saving, setSaving]         = useState(false);
  const [savedProductId, setSavedProductId] = useState(null);

  async function handleSaveProduct() {
    if (!form.productName.trim() || !form.collection) return;
    setSaving(true);
    const { data, error } = await createProduct({
      name:              form.productName.trim(),
      collection:        form.collection,
      niche:             form.niche || null,
      emotional_trigger: form.emotionalTrigger || null,
      stage:             saveStage,
      live_title:        editTitle || null,
      live_tags:         editTags.filter(Boolean).join(', ') || null,
      stage_updated_at:  new Date().toISOString(),
    });
    setSaving(false);
    if (!error && data?.id) {
      setSavedProductId(data.id);
    }
  }

  // Editable output state (initialized from generated output)
  const [editTitle, setEditTitle]   = useState('');
  const [editTags, setEditTags]     = useState([]);
  const [editDesc, setEditDesc]     = useState({});
  const [editPrompts, setEditPrompts] = useState([]);

  useEffect(() => {
    if (!output) return;
    setEditTitle(output.title || '');
    setEditTags(output.tags ? [...output.tags] : []);
    setEditDesc(output.description ? { ...output.description } : {});
    setEditPrompts(output.image_prompts ? output.image_prompts.map(p => ({ ...p })) : []);
  }, [output]);

  const isLoading = productId && productLoading;

  if (isLoading) {
    return <div className="page"><div style={{ color: 'var(--charcoal-soft)', padding: 32 }}>Loading product…</div></div>;
  }

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate(productId ? `/products/${productId}` : '/products')}>
            ← Back
          </button>
          <div className="page-title">Listing Builder</div>
        </div>
        {product && (
          <div style={{ fontSize: '0.78rem', color: 'var(--charcoal-soft)', marginTop: 4 }}>
            {product.name}
          </div>
        )}
      </div>

      {/* ── PRODUCT CONTEXT ─────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="eyebrow" style={{ marginBottom: 12 }}>Product Context</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Product Name</label>
            <input value={form.productName} onChange={e => setField('productName', e.target.value)} placeholder="e.g. Elder Millennial Crewneck" />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Product Type</label>
            <input value={form.productType} onChange={e => setField('productType', e.target.value)} placeholder="e.g. crewneck sweatshirt, tote bag, mug" />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Collection</label>
            <select value={form.collection} onChange={e => setField('collection', e.target.value)}>
              <option value="">— Select collection —</option>
              {collections.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Niche / Sub-niche</label>
            <input value={form.niche} onChange={e => setField('niche', e.target.value)} placeholder="e.g. Elder Millennial, Mom Humor" />
          </div>
        </div>
        <div className="form-group" style={{ marginTop: 12, marginBottom: 12 }}>
          <label className="form-label">Emotional Trigger</label>
          <input value={form.emotionalTrigger} onChange={e => setField('emotionalTrigger', e.target.value)} placeholder="e.g. 'I finally feel seen'" />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Notes <span style={{ fontWeight: 400, opacity: 0.6 }}>(optional)</span></label>
          <textarea value={form.notes} onChange={e => setField('notes', e.target.value)} rows={2} placeholder="Any specific direction, design notes, or context for this listing" />
        </div>
      </div>

      {/* ── DESIGN IMAGE ────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="eyebrow" style={{ marginBottom: 12 }}>Design Image</div>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          {imagePreview && (
            <img
              src={imagePreview}
              alt="Design mockup"
              style={{ width: 120, height: 120, objectFit: 'contain', borderRadius: 4, border: '1px solid rgba(43,41,38,0.12)', background: '#f5f3f0', flexShrink: 0 }}
            />
          )}
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>
                {imagePreview ? 'Replace image' : 'Upload mockup'}
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { if (e.target.files[0]) handleImage(e.target.files[0]); }} />
              </label>
              {!imagePreview && (
                <span style={{ fontSize: '0.75rem', color: 'var(--charcoal-soft)', alignSelf: 'center' }}>
                  or Ctrl+V to paste a Snip Tool screenshot
                </span>
              )}
            </div>
            {analyzing && (
              <div style={{ fontSize: '0.8rem', color: 'var(--charcoal-soft)' }}>Analyzing design…</div>
            )}
            {imageAnalysis && !analyzing && (
              <div style={{ fontSize: '0.8rem', color: 'var(--charcoal-soft)', lineHeight: 1.6, background: 'var(--warm-white)', padding: '10px 12px', borderRadius: 4, borderLeft: '3px solid var(--dusty-rose)' }}>
                {imageAnalysis}
              </div>
            )}
            {!imagePreview && !analyzing && (
              <div style={{ fontSize: '0.75rem', color: 'var(--charcoal-soft)', opacity: 0.6 }}>
                Upload your Printify mockup — Claude will analyze the style and colors for better copy.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── RESEARCH READINESS ──────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="eyebrow" style={{ marginBottom: 10 }}>Research Readiness</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {readiness.map((r, i) => (
            <span
              key={i}
              style={{
                fontSize: '0.75rem',
                padding: '4px 10px',
                borderRadius: 20,
                background: r.ok ? 'rgba(124,175,138,0.15)' : 'rgba(232,168,124,0.15)',
                color: r.ok ? '#3d6b4a' : '#7a4a1e',
                border: `1px solid ${r.ok ? 'rgba(124,175,138,0.3)' : 'rgba(232,168,124,0.3)'}`,
              }}
            >
              {r.ok ? '✓' : '⚠'} {r.label}
            </span>
          ))}
        </div>
        {hasWarnings && (
          <div style={{ fontSize: '0.72rem', color: 'var(--charcoal-soft)', marginTop: 8 }}>
            Warnings won't block generation — Claude will infer what it can.
          </div>
        )}
        {bucketWarnings.length > 0 && (
          <div style={{ marginTop: 12, borderTop: '1px solid rgba(43,41,38,0.08)', paddingTop: 10 }}>
            <div style={{ fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#7a4a1e', marginBottom: 6 }}>
              Bucket Coverage Check
            </div>
            {bucketWarnings.map((w, i) => (
              <div key={i} style={{
                fontSize: '0.75rem',
                color: w.severity === 'high' ? '#8b3a3a' : '#7a4a1e',
                padding: '5px 10px',
                marginBottom: 4,
                borderRadius: 4,
                background: w.severity === 'high' ? 'rgba(201,123,123,0.1)' : w.severity === 'low' ? 'rgba(43,41,38,0.04)' : 'rgba(232,168,124,0.1)',
                border: `1px solid ${w.severity === 'high' ? 'rgba(201,123,123,0.25)' : w.severity === 'low' ? 'rgba(43,41,38,0.12)' : 'rgba(232,168,124,0.25)'}`,
              }}>
                {w.severity === 'high' ? '✗' : '⚠'} {w.msg}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── GENERATE BUTTON ─────────────────────────────────────── */}
      {!output && !existingListing && (
        <div style={{ marginBottom: 24 }}>
          <button
            className="btn btn-primary"
            style={{ width: '100%', padding: '14px', fontSize: '1rem' }}
            onClick={handleGenerate}
            disabled={generating || !form.collection}
          >
            {generating ? 'Generating listing…' : '✦ Generate Listing'}
          </button>
          {!form.collection && (
            <div style={{ fontSize: '0.75rem', color: 'var(--charcoal-soft)', textAlign: 'center', marginTop: 6 }}>
              Select a collection to enable generation
            </div>
          )}
          {genError && (
            <div style={{ fontSize: '0.8rem', color: '#c97b7b', marginTop: 8, padding: '8px 12px', background: 'rgba(201,123,123,0.1)', borderRadius: 4 }}>
              {genError}
            </div>
          )}
        </div>
      )}

      {/* ── OUTPUT ──────────────────────────────────────────────── */}
      {(output || existingListing) && (
        <div>
          {/* Regenerate / action buttons */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' }}>
            {output && <button className="btn btn-ghost btn-sm" onClick={() => { setOutput(null); setExistingListing(false); }}>← Edit setup</button>}
            <button className="btn btn-primary btn-sm" onClick={handleGenerate} disabled={generating || !form.collection}>
              {generating ? 'Generating…' : output ? '↺ Regenerate' : '✦ Generate New Version'}
            </button>
            {genError && (
              <span style={{ fontSize: '0.75rem', color: '#c97b7b' }}>{genError}</span>
            )}
          </div>

          {/* Existing listing notice */}
          {existingListing && !output && (
            <div style={{ background: 'rgba(43,41,38,0.04)', border: '1px solid rgba(43,41,38,0.1)', borderRadius: 4, padding: '10px 14px', marginBottom: 20, fontSize: '0.78rem', color: 'var(--charcoal-soft)' }}>
              Showing your current live listing. Make edits directly, patch keywords below, or generate a new version above.
            </div>
          )}

          {/* Research flags */}
          {output?.research_flags?.length > 0 && (
            <div style={{ background: 'rgba(232,168,124,0.1)', border: '1px solid rgba(232,168,124,0.3)', borderRadius: 4, padding: '10px 14px', marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#7a4a1e' }}>Research Gaps Flagged</div>
                <SaveFlagsButton flags={output.research_flags} productId={productId || savedProductId} />
              </div>
              {output.research_flags.map((f, i) => (
                <div key={i} style={{ fontSize: '0.78rem', color: '#7a4a1e', lineHeight: 1.6 }}>⚠ {f}</div>
              ))}
            </div>
          )}

          {/* Keyword patch panel — show whenever we have a listing (new or existing) */}
          {(editTitle || editTags.length > 0) && (
            <KeywordPatchPanel
              currentTitle={editTitle}
              currentTags={editTags}
              researchFlags={output?.research_flags || []}
              onApply={(title, tags) => { setEditTitle(title); setEditTags(tags); }}
            />
          )}

          {/* Save as new product — standalone only */}
          {!productId && (
            <div style={{ background: 'var(--warm-white)', border: '1px solid rgba(43,41,38,0.12)', borderRadius: 4, padding: '14px 16px', marginBottom: 20 }}>
              <div className="eyebrow" style={{ marginBottom: 10 }}>Save as New Product</div>
              {savedProductId ? (
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span style={{ fontSize: '0.82rem', color: '#3d6b4a' }}>✓ Saved</span>
                  <button className="btn btn-primary btn-sm" onClick={() => navigate(`/products/${savedProductId}`)}>
                    Open Product →
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <select
                    value={saveStage}
                    onChange={e => setSaveStage(e.target.value)}
                    style={{ width: 'auto', fontSize: '0.82rem' }}
                  >
                    {STAGES.filter(s => !['Killed', 'Paused'].includes(s)).map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={handleSaveProduct}
                    disabled={saving || !form.productName.trim() || !form.collection}
                  >
                    {saving ? 'Saving…' : 'Save as New Product →'}
                  </button>
                  {(!form.productName.trim() || !form.collection) && (
                    <span style={{ fontSize: '0.72rem', color: 'var(--charcoal-soft)' }}>
                      Requires product name + collection
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Title */}
          <SectionHeader title="Title" />
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <input
                value={editTitle}
                onChange={e => setEditTitle(e.target.value)}
                style={{ width: '100%', fontSize: '0.9rem', fontFamily: 'var(--font-display)' }}
                maxLength={140}
              />
              <div style={{ fontSize: '0.7rem', color: editTitle.length > 130 ? '#c97b7b' : 'var(--charcoal-soft)', marginTop: 4 }}>
                {editTitle.length}/140 characters
              </div>
            </div>
            <CopyButton text={editTitle} />
          </div>

          {/* Tags */}
          <SectionHeader title={`Tags (${editTags.length}/13)`} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
            <CopyButton text={editTags.join(', ')} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 6 }}>
            {editTags.map((tag, i) => {
              const len = tag.length;
              const countColor = len > 20 ? '#c97b7b' : len >= 18 ? '#7CAF8A' : 'var(--charcoal-soft)';
              return (
                <div key={i} style={{ position: 'relative' }}>
                  <input
                    value={tag}
                    onChange={e => { const t = [...editTags]; t[i] = e.target.value; setEditTags(t); }}
                    style={{ width: '100%', fontSize: '0.78rem', paddingRight: 28 }}
                    maxLength={25}
                    placeholder={`Tag ${i + 1}`}
                  />
                  <span style={{
                    position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                    fontSize: '0.6rem', color: countColor, fontWeight: 600, pointerEvents: 'none',
                  }}>{len}</span>
                </div>
              );
            })}
            {editTags.length < 13 && (
              <button className="btn btn-ghost btn-sm" onClick={() => setEditTags(t => [...t, ''])}>+ Add tag</button>
            )}
          </div>

          {/* Description */}
          <SectionHeader title="Description" />
          {Object.entries(DESC_META).map(([key, meta]) => (
            <div key={key} style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <div>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--charcoal-soft)' }}>
                    {meta.label}
                  </span>
                  <span style={{ fontSize: '0.68rem', color: 'var(--charcoal-soft)', opacity: 0.7, marginLeft: 8 }}>
                    {meta.hint}
                  </span>
                </div>
                <CopyButton text={editDesc[key] || ''} />
              </div>
              <textarea
                value={editDesc[key] || ''}
                onChange={e => setEditDesc(d => ({ ...d, [key]: e.target.value }))}
                rows={key === 'seo_opener' ? 3 : 2}
                style={{ width: '100%', fontSize: '0.85rem', lineHeight: 1.6 }}
              />
            </div>
          ))}
          <div style={{ marginBottom: 16 }}>
            <CopyButton text={Object.entries(DESC_META).map(([k, m]) => `${m.label.toUpperCase()}\n${editDesc[k] || ''}`).join('\n\n')} />
            <span style={{ fontSize: '0.72rem', color: 'var(--charcoal-soft)', marginLeft: 8 }}>Copy all sections</span>
          </div>

          {/* Image Prompts */}
          {editPrompts.length > 0 && <SectionHeader title="ChatGPT Image Prompts" />}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {editPrompts.map((p, i) => (
              <div key={i} style={{ background: 'var(--warm-white)', borderRadius: 4, padding: '12px 14px', border: '1px solid rgba(43,41,38,0.08)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--charcoal-soft)' }}>
                    {p.slot}. {p.type}
                  </div>
                  <CopyButton text={p.prompt} />
                </div>
                <textarea
                  value={p.prompt}
                  onChange={e => {
                    const arr = [...editPrompts];
                    arr[i] = { ...arr[i], prompt: e.target.value };
                    setEditPrompts(arr);
                  }}
                  rows={3}
                  style={{ width: '100%', fontSize: '0.82rem', lineHeight: 1.6 }}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
