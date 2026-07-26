import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useProduct, useCollections, useCollectionObjects, usePlaybooks, createProduct, updateProduct } from '../lib/hooks';
import { nicheStyleGuides } from '../data/collections';
import { STAGES } from '../data/stages';

const SEO_STANDARDS_FALLBACK = `TCC SEO STANDARDS v2 — Keyword Hierarchy & Listing Builder Logic

KEYWORD TIERS
Tier 1 — Unicorn (Primary Search Intent): ONE per listing. High volume, low competition. Exact buyer search behavior.
Tier 2 — Supporting: High volume, medium competition. Reinforce Tier 1, same buyer intent.
Tier 3 — Broad: High volume, high competition. Category terms (e.g. "book lover shirt", "comfort colors shirt"). Discoverability only.
Tier 4 — Seasonal: Only when directly relevant (Halloween, Fall, Beach Vacation, etc.).
Tier 5 — Buyer Intent: Why someone shops, not what the product is ("gift for her", "birthday gift", "booktok gift").

TITLE STRUCTURE — ORDER IS FIXED
[Tier 1 Unicorn] , [Tier 2 Supporting] , [Tier 3 Broad] , [Tier 5 Buyer Intent]
• Comma ( , ) marks every tier boundary — NOT pipes, NOT dashes
• First 30–50 characters must immediately communicate primary search intent
• Title Case Throughout, max 140 characters
• CORRECT: "Morally Gray Enthusiast Shirt, Fantasy Reader Shirt, Book Lover Gift, Comfort Colors Tee"
• Never stack near-duplicate phrasings unless each reflects genuinely distinct buyer behavior

TAG RULES
• Tier 1 keyword repeats directly in tags — intentional, not redundant
• Tiers 2–5: reinforce-not-duplicate — extend reach into adjacent phrasings rather than restating title terms verbatim
• Misspellings: tags only, and only when listed explicitly — never invented
• Fill each tag to 18–20 characters, max 20

DESCRIPTION — 6-SECTION STRUCTURE
1. SEO Opener: keyword-dense, naturally phrased. First 40 words matter most.
2. Product Details: size, color, material, format, what's included.
3. Ordering Steps: how to order, customize, or download.
4. Cross-Sell: "Shop our [collection] for more designs like this…"
5. Shipping: standard policy language.
6. Brand Voice Closer: 1–2 sentences. TCC voice. No Hallmark energy.`;

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

function oppScore(k) {
  return (k.score || 0) / Math.log2((k.competition || 0) + 2);
}

function computeTierWarnings(keywords) {
  const useKws = keywords.filter(k => k.tag_type === 'use' && !k.tags_only);
  const sorted = [...useKws].sort((a, b) => oppScore(b) - oppScore(a));
  const warnings = [];
  if (useKws.length === 0) {
    warnings.push({ severity: 'high', msg: 'No validated keywords — run Everbee research before generating.' });
  } else if (useKws.length < 3) {
    warnings.push({ severity: 'high', msg: `Only ${useKws.length} validated keyword(s) — need at least 5 for solid tier coverage.` });
  }
  const best = sorted[0];
  if (best) {
    const comp = best.competition || 0;
    const vol  = best.volume || 0;
    if (comp > 5000) {
      warnings.push({ severity: 'high', msg: `Best keyword "${best.keyword}" has very high competition (${comp.toLocaleString()}) — no clear Tier 1 Unicorn. More research needed.` });
    } else if (comp > 2000) {
      warnings.push({ severity: 'medium', msg: `Best keyword "${best.keyword}" has moderate-high competition (${comp.toLocaleString()}) — verify it's your strongest unicorn candidate.` });
    }
    if (vol < 300 && comp > 0) {
      warnings.push({ severity: 'medium', msg: `Best keyword "${best.keyword}" has low search volume (${vol}) — may not drive meaningful traffic as Tier 1.` });
    }
  }
  const watchOnly = keywords.filter(k => k.tag_type === 'watch' && !k.tags_only);
  if (useKws.length < 5 && watchOnly.length > 0) {
    warnings.push({ severity: 'medium', msg: `${watchOnly.length} watch keyword(s) not yet promoted to use — review and upgrade any that now qualify.` });
  }
  return warnings;
}

function buildContext({ form, keywords, styleGuide, seoStandards, brandVoice, photoStandards, imageAnalysis }) {
  const useKws   = keywords.filter(k => k.tag_type === 'use'   && !k.tags_only);
  const watchKws = keywords.filter(k => k.tag_type === 'watch' && !k.tags_only);
  const tagsKws  = keywords.filter(k => k.tags_only);
  const byOpp    = arr => [...arr].sort((a, b) => oppScore(b) - oppScore(a));

  const fmtKw = k =>
    `  "${k.keyword}"` +
    (k.volume      != null ? ` (vol: ${Number(k.volume).toLocaleString()}` : '') +
    (k.competition != null ? `, comp: ${Number(k.competition).toLocaleString()}` : '') +
    (k.score       != null ? `, score: ${Number(k.score).toLocaleString()}` : '') +
    (k.volume      != null ? ')' : '');

  const sorted = byOpp(useKws);
  const unicorn    = sorted[0];
  const supporting = sorted.slice(1, 6);
  const broad      = sorted.slice(6);

  return `Generate a complete Etsy listing for TCC (The Current Chapter).

━━━ TCC SEO STANDARDS v2 — FOLLOW EXACTLY ━━━
KEYWORD TIERS (apply to the keywords provided below):
  Tier 1 — Unicorn: ONE keyword. Highest opportunity (high vol, LOW comp). This is the primary search intent. Goes first in title + first tag.
  Tier 2 — Supporting: High vol, medium comp. Same buyer intent. Reinforce the unicorn.
  Tier 3 — Broad: High vol, HIGH comp. Category terms ("book lover shirt", "comfort colors shirt"). Discoverability only — later in title + tags.
  Tier 4 — Seasonal: Only if directly relevant to THIS product.
  Tier 5 — Buyer Intent: WHY someone shops ("gift for her", "birthday gift", "booktok gift"). End of title + tags.

TITLE FORMAT — ORDER IS FIXED:
  [Tier 1 Unicorn] , [Tier 2 Supporting] , [Tier 3 Broad] , [Tier 5 Buyer Intent]
  - Comma ( , ) marks every tier boundary — NOT pipes, NOT dashes
  - First 30–50 characters = Tier 1 phrase (primary search intent comes first)
  - Title Case Throughout, max 140 characters
  - CORRECT: "Morally Gray Enthusiast Shirt, Fantasy Reader Shirt, Book Lover Gift, Comfort Colors Tee"
  - WRONG:   "Morally Gray Enthusiast Shirt | Fantasy Reader | Book Lover | Gift" (pipes not allowed)
  - WRONG:   "Book Lover Shirt Morally Gray Fantasy Reader Gift Comfort Colors" (no separators, no order)

TAG RULES:
  - Tier 1: repeat the exact unicorn phrase in tags — INTENTIONAL, not an error
  - Tiers 2–5: reinforce with adjacent phrasings that extend reach, do NOT restate title terms verbatim
  - Misspellings listed below: include in tags exactly as listed — never invent misspellings
  - Fill each tag to 18–20 characters, max 20
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PRODUCT:
Name: ${form.productName || 'Untitled product'}
Product Type: ${form.productType || 'print-on-demand item'}
Collection: ${form.collection || '—'}
Niche / Sub-niche: ${form.niche || '—'}
Emotional Trigger: ${form.emotionalTrigger || '— NOT SET; infer from design and niche'}
${form.notes ? `Notes: ${form.notes}` : ''}

${imageAnalysis ? `DESIGN IMAGE ANALYSIS:\n${imageAnalysis}\n` : ''}
VALIDATED KEYWORDS (classify into tiers based on volume + competition):

Tier 1 Unicorn candidate (best opportunity score — lowest comp relative to volume):
${unicorn ? fmtKw(unicorn) : '  [none with data — identify from niche context]'}

Tier 2/3 candidates (classify by competition level — lower comp = Tier 2, higher = Tier 3):
${supporting.map(fmtKw).join('\n') || '  [none]'}
${broad.length ? '\nAdditional broad/supporting candidates:\n' + broad.map(fmtKw).join('\n') : ''}

Watch keywords (Tier 3/4 consideration — lower priority):
${byOpp(watchKws).slice(0, 8).map(fmtKw).join('\n') || '  [none]'}

Misspelling variants (Tier tag-only — NEVER in title or description):
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
  "title": "string — comma-separated tier format, max 140 chars, Title Case",
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
  "tier_assignment": {"t1": "string — the unicorn keyword chosen", "t2": ["strings"], "t3": ["strings"], "t5": ["strings"]},
  "research_flags": ["string — keyword gaps, tier coverage issues, or validation concerns"]
}

REQUIREMENTS:
- Title: comma-separated tier order (T1 , T2 , T3 , T5), max 140 chars, Title Case
- Tags: exactly 13, each max 20 chars, Tier 1 repeats intentionally, Tiers 2–5 reinforce not duplicate
- Tags-only/misspelling keywords in tags only — never title or description
- Each description section is distinct content, not one paragraph split arbitrarily
- Image prompts: specific enough for ChatGPT to generate professional Etsy-quality mockups
- research_flags: flag any tier coverage gaps, missing unicorn, or keywords needing further validation`;
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
  const tierWarnings = form.collection ? computeTierWarnings(allKeywords) : [];

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
        {tierWarnings.length > 0 && (
          <div style={{ marginTop: 12, borderTop: '1px solid rgba(43,41,38,0.08)', paddingTop: 10 }}>
            <div style={{ fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#7a4a1e', marginBottom: 6 }}>
              Keyword Tier Validation
            </div>
            {tierWarnings.map((w, i) => (
              <div key={i} style={{
                fontSize: '0.75rem',
                color: w.severity === 'high' ? '#8b3a3a' : '#7a4a1e',
                padding: '5px 10px',
                marginBottom: 4,
                borderRadius: 4,
                background: w.severity === 'high' ? 'rgba(201,123,123,0.1)' : 'rgba(232,168,124,0.1)',
                border: `1px solid ${w.severity === 'high' ? 'rgba(201,123,123,0.25)' : 'rgba(232,168,124,0.25)'}`,
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
