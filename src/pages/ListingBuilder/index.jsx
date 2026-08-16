import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import {
  useProduct, useCollections, useCollectionObjects, useChapters, usePlaybooks, useConcept, useConcepts,
  useListingGenerations, createProduct, updateProduct, createListingGeneration, linkGenerationsToProduct,
  useStorePolicies, useProductTemplates,
} from '../../lib/hooks';
import { resizeImageForUpload } from '../../lib/image';
import { nicheStyleGuides } from '../../data/collections';
import { STAGES } from '../../data/stages';

import { GENERATION_VERSION, BRAND_VOICE_FALLBACK } from './constants';
import { buildGenerationContext, asArray, validateGeneratedListing, buildOutputFromGeneration, extractHistoryDisplay } from './generation';
import InlineKeywordAdd from './InlineKeywordAdd';
import KeywordEvidencePanel from './KeywordEvidencePanel';
import Zone1Product from './Zone1Product';
import Zone2SearchStrategy from './Zone2SearchStrategy';
import Zone3Listing from './Zone3Listing';
import Zone4Review from './Zone4Review';
import VersionHistory from './VersionHistory';

export default function ListingBuilder() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const productId = searchParams.get('product');
  const conceptId = searchParams.get('fromConcept');

  const { product, loading: productLoading } = useProduct(productId);
  // Existing-product hydration (Milestone B) — Search Intent/status/gaps/
  // sources/excluded/validation live only on the generation ledger, never
  // on the product row itself (see listingReadiness.js's header). Most
  // recent row only; see the hydration effect below for how/when it's used.
  // refetch destructured (Milestone C2) — previously fetched once on mount
  // and never refreshed, so a same-session regenerate left this hook
  // returning stale data; the new Version History section needs it live.
  const { generations: pastGenerations, refetch: refetchGenerations } = useListingGenerations(productId);
  const latestGeneration = pastGenerations[0] || null;
  const { collections, refetch: refetchCollections } = useCollections();
  const { collections: collectionObjs, refetch: refetchCollectionObjs } = useCollectionObjects();
  const { chapters } = useChapters();
  const { playbooks } = usePlaybooks();
  // Approved Store Policy Library (Milestone C1) — active only; generation
  // resolves the effective Product Truth from these via
  // resolveEffectiveProductTruth(), see generation.js's buildGenerationContext.
  const { policies: approvedPolicies } = useStorePolicies('active');
  // Product Template Library (Milestone C1) — active only; Zone1Product's
  // TemplateMatchBar matches/diffs against these. Never read by generation
  // itself — applying a template only ever writes into form via setField.
  const { templates: productTemplates } = useProductTemplates('active');

  // Linked Concept (Phase 10) — set automatically when arriving via a fresh
  // push (conceptId from the URL) or when an existing product already has
  // one saved; otherwise pickable manually below. useConcept re-fetches
  // whenever the id changes, which covers picker changes; handleGenerate
  // additionally re-fetches live right before building context so an edit
  // made to the concept after linking is never stale at generation time.
  const [linkedConceptId, setLinkedConceptId] = useState(conceptId || null);
  const { concept: linkedConcept } = useConcept(linkedConceptId);

  // One-time hand-off from a Concept's "Push to Listing Builder" — resolved
  // synchronously in a lazy useState initializer (not a useEffect) so it's
  // settled before first paint and can't race the draft-restore/auto-save
  // effects below. It genuinely did race them as a useEffect: React 18
  // StrictMode's double-invocation let auto-save persist the pre-update
  // (still-empty) form to localStorage between the two passes, and
  // draft-restore's second pass then re-read that and clobbered this data.
  const [conceptPushData] = useState(() => {
    if (!conceptId) return null;
    try {
      const raw = sessionStorage.getItem('tcc_concept_push');
      if (!raw) return null;
      sessionStorage.removeItem('tcc_concept_push');
      return JSON.parse(raw);
    } catch { return null; }
  });

  // Form
  const [form, setForm] = useState({
    productName: conceptPushData?.productName || '',
    collection: '', niche: '',
    productType: conceptPushData?.productType || '',
    emotionalTrigger: '', notes: '',
    // Product Truth (Listing Intelligence Milestone A) — every field
    // nullable/empty until confirmed; the 3 booleans use null (not false)
    // for "unknown" so an unconfirmed fact is never treated as a
    // confirmed no. See src/lib/productTruth.js.
    productFormat: '', blankBrand: '', blankModel: '', garmentColor: '',
    availableColors: [], sizeRange: '', material: '',
    personalizationAvailable: null, customizationAvailable: null, giftWrapAvailable: null,
    productionTime: '', shippingPolicy: '', fulfillmentProvider: '',
    // Provenance only (Milestone C1) — records that a human explicitly
    // applied this template via TemplateMatchBar; never read by generation.
    productTemplateId: null,
    titleStrategy: 'buyer_clear',
  });
  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Candidates for the manual concept-link picker — scoped to the selected
  // collection so the list stays short and relevant; shows everything if no
  // collection is picked yet.
  const { concepts: pickableConcepts } = useConcepts(form.collection || undefined);

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
      productFormat: product.product_format || '', blankBrand: product.blank_brand || '',
      blankModel: product.blank_model || '', garmentColor: product.garment_color || '',
      availableColors: product.available_colors || [], sizeRange: product.size_range || '',
      material: product.material || '',
      personalizationAvailable: product.personalization_available ?? null,
      customizationAvailable: product.customization_available ?? null,
      giftWrapAvailable: product.gift_wrap_available ?? null,
      productionTime: product.production_time || '', shippingPolicy: product.shipping_policy || '',
      fulfillmentProvider: product.fulfillment_provider || '',
      productTemplateId: product.product_template_id || null,
      // Only overwrite the live 'buyer_clear' default if this product was
      // actually generated under the new taxonomy — a legacy value (or one
      // of the 2 backfilled legacy_* strings) intentionally doesn't match
      // any of the 3 picker options, so the picker just shows none
      // selected rather than silently relabeling old history.
      titleStrategy: product.title_strategy || 'buyer_clear',
    }));
    if (product.concept_id) setLinkedConceptId(product.concept_id);
    if (product.live_title) {
      setEditTitle(product.live_title);
      setExistingListing(true);
    }
    if (product.live_tags) {
      setEditTags(product.live_tags.split(',').map(t => t.trim()).filter(Boolean));
      setExistingListing(true);
    }
    // Milestone B fix: generated_description/generated_image_prompts were
    // write-only (saved by both save handlers, never read back) — Zone 3's
    // Description/Images tabs rendered empty for every saved product
    // despite the data sitting in the row.
    if (product.generated_description) setEditDesc(product.generated_description);
    if (product.generated_image_prompts) setEditPrompts(product.generated_image_prompts);
  }, [product]);

  // Zone 1 (Product) collapse — Milestone B. Reactive to completeness, not
  // derived fresh every render (that would re-collapse on every keystroke
  // once the third field fills) and not a lazy useState initializer (that
  // would always see an empty form on an async-loaded existing product and
  // never auto-collapse at all). The three gate fields aren't invented —
  // they're already handleSaveProduct's own guard and the Compatibility
  // Gate's own prerequisite. Ref-guarded one-shot, matching this file's
  // established pattern (conceptPushImageAppliedRef, autoSessionTriedRef).
  const productTruthConfirmed = !!form.productName.trim() && !!form.collection && !!form.productFormat;
  const [productZoneOpen, setProductZoneOpen] = useState(true);
  const autoCollapsedRef = useRef(false);
  useEffect(() => {
    if (autoCollapsedRef.current || !productTruthConfirmed) return;
    autoCollapsedRef.current = true;
    setProductZoneOpen(false);
  }, [productTruthConfirmed]);

  // State declared early — all referenced in the draft save/restore effects below
  const [imagePreview, setImagePreview] = useState(null);
  const [imageBase64, setImageBase64]   = useState(null);
  const [imageMediaType, setImageMediaType] = useState('image/png');
  const [analyzing, setAnalyzing]       = useState(false);
  const [imageAnalysis, setImageAnalysis] = useState('');
  const [imageAnalysisError, setImageAnalysisError] = useState('');
  const [selectedSessionIds, setSelectedSessionIds] = useState(new Set());
  const [extraCollections, setExtraCollections] = useState(new Set());
  const [output, setOutput]         = useState(null);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError]     = useState('');
  const [editTitle, setEditTitle]   = useState('');
  const [editTags, setEditTags]     = useState([]);
  const [editDesc, setEditDesc]     = useState({});
  const [editPrompts, setEditPrompts] = useState([]);
  // Listing Intelligence Milestone A — Primary Search Intent replaces the
  // old anchorKeyword. Populated from generation output (like editTitle/
  // editTags), not a pre-generation input the user picks from a B1 pool —
  // the AI proposes it as part of generation, the human stays the backstop
  // by editing it directly afterward, same trust model as title/tags.
  const [primarySearchIntent, setPrimarySearchIntent] = useState('');
  const [primaryIntentStatus, setPrimaryIntentStatus] = useState('');
  const [researchGaps, setResearchGaps] = useState([]);
  const [excludedKeywordsDisplay, setExcludedKeywordsDisplay] = useState([]);
  const [validationWarnings, setValidationWarnings] = useState([]);
  // Research source summary (Milestone B, Zone 2) — the value is already
  // computed by buildGenerationContext and already shipped to the ledger;
  // this just captures it for display, same pattern as excludedKeywordsDisplay.
  const [researchSourcesUsed, setResearchSourcesUsed] = useState([]);
  // listing_generations row ids created this session that don't have a real
  // product_id yet (a new listing generates before it's saved) — linked to
  // the real product the moment handleSaveProduct() succeeds.
  const [pendingGenerationIds, setPendingGenerationIds] = useState([]);

  // ── Auto-draft (new listings only) ──────────────────────────────────────────
  const DRAFT_KEY = 'tcc_listing_draft';
  const [draftRestored, setDraftRestored] = useState(false);

  // Restore draft on first load (only for new listings). Skipped entirely
  // when arriving via a concept push — that's a deliberate "start fresh for
  // this concept" action, and an old in-progress draft (already correctly
  // applied via conceptPushData in form's initial state above) shouldn't
  // silently override it.
  useEffect(() => {
    if (productId || conceptPushData) return;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (d.form)          setForm(f => ({ ...f, ...d.form }));
      if (d.imageAnalysis) setImageAnalysis(d.imageAnalysis);
      if (d.imagePreview)  setImagePreview(d.imagePreview);
      if (d.output)        setOutput(d.output);
      if (d.editTitle)     setEditTitle(d.editTitle);
      if (d.editTags)      setEditTags(d.editTags);
      if (d.selectedSessionIds) setSelectedSessionIds(new Set(d.selectedSessionIds));
      setDraftRestored(true);
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Design image half of the concept-push hand-off — the text fields
  // (productName/productType) are already in form's initial state above;
  // this only needs an effect because analysis requires an async call.
  // Deliberately does NOT set collection — that stays blank, a real human
  // choice, not inherited silently from the concept.
  const conceptPushImageAppliedRef = useRef(false);
  useEffect(() => {
    if (!conceptPushData?.imageBase64 || conceptPushImageAppliedRef.current) return;
    conceptPushImageAppliedRef.current = true;
    setImageBase64(conceptPushData.imageBase64);
    setImageMediaType(conceptPushData.imageMediaType || 'image/jpeg');
    setImagePreview(`data:${conceptPushData.imageMediaType || 'image/jpeg'};base64,${conceptPushData.imageBase64}`);
    analyzeImage(conceptPushData.imageBase64, conceptPushData.imageMediaType || 'image/jpeg');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conceptPushData]);

  // Auto-save draft whenever key state changes (new listings only)
  useEffect(() => {
    if (productId) return;
    const draft = {
      form,
      imageAnalysis,
      // imagePreview intentionally excluded — data URIs can be large and persist
      // on shared devices; imageAnalysis text is sufficient to reconstruct context
      output,
      editTitle,
      editTags,
      selectedSessionIds: [...selectedSessionIds],
      savedAt: new Date().toISOString(),
    };
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch {}
  }, [productId, form, imageAnalysis, output, editTitle, editTags, selectedSessionIds]);

  function clearDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch {}
    setDraftRestored(false);
  }
  // ─────────────────────────────────────────────────────────────────────────────

  // Research sessions for the selected collection(s)
  const [sessions, setSessions] = useState([]);
  const [collectionLastVerified, setCollectionLastVerified] = useState(null);

  const allCollectionNames = [form.collection, ...extraCollections].filter(Boolean);

  // 'Seasonal' deliberately excluded — unlike General/Global Keywords (truly
  // universal terms), Seasonal holds holiday/occasion-specific keywords that
  // only apply to a subset of listings. Pooling it into every listing meant
  // e.g. Halloween/Christmas terms leaking into evidence for non-seasonal
  // products with no way to turn it off. A listing that actually wants those
  // terms adds that collection explicitly via extraCollections instead.
  const GLOBAL_COLLECTIONS = ['Global Keywords', 'General'];

  useEffect(() => {
    if (!form.collection) { setSessions([]); setSelectedSessionIds(new Set()); setCollectionLastVerified(null); return; }
    const cols = [...new Set([form.collection, ...extraCollections, ...GLOBAL_COLLECTIONS].filter(Boolean))];
    supabase.from('research_sessions').select('*, keywords(*)')
      .in('collection', cols)
      .then(({ data }) => {
        const rows = data || [];
        setSessions(rows);
        setSelectedSessionIds(new Set(rows.map(s => s.id)));
      });
    supabase.from('collections').select('last_verified').eq('name', form.collection).single()
      .then(({ data }) => setCollectionLastVerified(data?.last_verified || null));
  }, [form.collection, extraCollections]);

  function refetchSessions() {
    if (!form.collection) return;
    const cols = [...new Set([form.collection, ...extraCollections, ...GLOBAL_COLLECTIONS].filter(Boolean))];
    supabase.from('research_sessions').select('*, keywords(*)')
      .in('collection', cols)
      .then(({ data }) => {
        const rows = data || [];
        setSessions(rows);
        setSelectedSessionIds(prev => {
          const next = new Set(prev);
          rows.forEach(s => next.add(s.id));
          return next;
        });
      });
  }

  function toggleSession(id) {
    const session = sessions.find(s => s.id === id);
    if (GLOBAL_COLLECTIONS.includes(session?.collection)) return;
    setSelectedSessionIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const keywordAgedays = collectionLastVerified
    ? Math.floor((Date.now() - new Date(collectionLastVerified).getTime()) / 86400000)
    : null;
  const keywordsStale = keywordAgedays !== null && keywordAgedays >= 20;

  // Flatten + deduplicate keywords from SELECTED sessions only
  const activeSessions = sessions.filter(s => selectedSessionIds.has(s.id));
  const allKeywords = (() => {
    const map = new Map();
    for (const s of activeSessions) {
      // Tag each keyword with whether it came from this listing's own
      // collection(s), vs. a globally-pooled session (General/Global
      // Keywords/Seasonal). Bucket coverage and tags should draw from
      // everything, but the anchor — the phrase that leads the title —
      // should prefer something specific to this listing over a
      // high-volume term that's identical on every other listing too.
      const fromPrimaryCollection = allCollectionNames.includes(s.collection);
      for (const k of (s.keywords || [])) {
        const key = `${k.keyword?.toLowerCase()}|${k.tags_only ? 'tags' : k.tag_type}`;
        const ex = map.get(key);
        if (!ex || (k.score || 0) > (ex.score || 0)) map.set(key, { ...k, _fromPrimaryCollection: fromPrimaryCollection, _source: s.source });
      }
    }
    return [...map.values()];
  })();

  const useKws   = allKeywords.filter(k => k.tag_type === 'use'   && !k.tags_only);
  const watchKws = allKeywords.filter(k => k.tag_type === 'watch' && !k.tags_only);
  const totalUsable = useKws.length + watchKws.length;

  // Bucket coverage across the same usable pool totalUsable counts — Kristen's
  // request: real visibility in Zone 2 plus a non-blocking warning when a
  // bucket's empty, not a return of Milestone A's hard-blocking gate (that
  // gate was removed on purpose; this only ever informs, never blocks
  // Generate). Same B1≥1/B2≥3/B3≥1 thresholds and gap wording Research.jsx's
  // own per-collection coverage banner already uses, for consistency.
  const usableForBuckets = [...useKws, ...watchKws];
  const bucketCounts = {
    1: usableForBuckets.filter(k => k.bucket === 1).length,
    2: usableForBuckets.filter(k => k.bucket === 2).length,
    3: usableForBuckets.filter(k => k.bucket === 3).length,
    unbucketed: usableForBuckets.filter(k => !k.bucket).length,
  };

  // Playbooks. seo-standards is deliberately no longer fetched/used here —
  // Listing Intelligence Milestone A replaced the old bucket-ordering rules
  // it encoded with generate-listing-v2.js's own prompt; passing that old
  // playbook content through would just reintroduce the rules this rebuild
  // removes. The playbook itself is untouched in Knowledge — just not read
  // by generation anymore.
  const photoPlaybook      = playbooks.find(p => p.slug === 'listing-photos');
  const brandVoicePlaybook = playbooks.find(p => p.slug === 'brand-voice');
  const designPlaybook     = playbooks.find(p => p.slug === 'design-standards');

  const brandVoice     = brandVoicePlaybook?.playbook_sections?.map(s => s.body).join('\n\n') || BRAND_VOICE_FALLBACK;
  const photoStandards = photoPlaybook?.playbook_sections?.map(s => s.body).join('\n\n') || '';
  // Brand-wide style guide (Knowledge → Playbooks → Design Standards) — applies
  // to every listing regardless of collection. Layered with, not replaced by,
  // the collection-specific style guide below.
  const brandStyleGuide = designPlaybook?.playbook_sections?.map(s => s.body).join('\n\n') || '';

  const collectionObj = collectionObjs.find(c => c.name === form.collection);
  const nicheKey = (form.niche || '').toLowerCase();
  const styleGuide = nicheStyleGuides[nicheKey] || collectionObj?.style_guide || '';
  // Occasion/season tag captured on the collection (Halloween, Back to School, …) —
  // exists in the data already but wasn't reaching the generation prompt.
  const season = collectionObj?.season || '';

  // Design image
  const analyzeImage = useCallback(async (base64, mediaType) => {
    setAnalyzing(true);
    setImageAnalysisError('');
    try {
      const res = await fetch('/.netlify/functions/claude-process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'analyze_design_image', payload: { imageBase64: base64, mediaType } }),
      });
      const data = await res.json();
      if (!res.ok) {
        setImageAnalysis('');
        setImageAnalysisError(data.error || `Analysis failed (${res.status})`);
      } else if (data.analysis) {
        setImageAnalysis(data.analysis);
      } else {
        setImageAnalysis('');
        setImageAnalysisError('Analysis returned no result — try again');
      }
    } catch (err) {
      console.error('Image analysis failed:', err);
      setImageAnalysis('');
      setImageAnalysisError('Image analysis failed — check your connection and try again');
    }
    setAnalyzing(false);
  }, []);

  const handleImage = useCallback(async (file) => {
    if (!file) return;
    try {
      const { base64, mediaType } = await resizeImageForUpload(file);
      setImagePreview(`data:${mediaType};base64,${base64}`);
      setImageBase64(base64);
      setImageMediaType(mediaType);
      await analyzeImage(base64, mediaType);
    } catch (err) {
      console.error('Image resize failed:', err);
      setImageAnalysisError('Could not read that image — try a different file');
    }
  }, [analyzeImage]);

  // Ctrl+V paste listener for design image. Force-opens Zone 1 (Milestone
  // B) — a paste landing inside an already-collapsed zone would be
  // invisible, since the design image lives in Zone 1's body.
  useEffect(() => {
    function handlePaste(e) {
      const items = e.clipboardData?.items;
      if (!items) return;
      const active = document.activeElement?.tagName;
      if (active === 'INPUT' || active === 'TEXTAREA') return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) { setProductZoneOpen(true); handleImage(file); break; }
        }
      }
    }
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [handleImage]);

  // Readiness — the old 6-pill wall built here is gone (see Zone4Review.jsx
  // + src/lib/listingReadiness.js). brandStyleGuide's "missing" signal has
  // no home yet — it's earmarked for Zone 2/ResearchEvidence.jsx (Milestone
  // B, next task), a short-lived gap, not a dropped requirement.

  // changeReason (Milestone C2) — optional, human-entered, never required.
  // Threaded straight into createListingGeneration below; purely
  // client-side text that never reaches the generation prompt itself.
  async function handleGenerate(changeReason) {
    if (!form.collection) { setGenError('Please select a collection first.'); return; }
    setGenerating(true);
    setGenError('');
    setOutput(null);
    try {
      // Live re-fetch, not the useConcept() hook's state — guarantees this
      // generation sees any edit made to the concept since it was linked,
      // rather than whatever the hook last happened to have mounted.
      let freshLinkedConcept = null;
      if (linkedConceptId) {
        const { data } = await supabase.from('concepts').select('*').eq('id', linkedConceptId).single();
        freshLinkedConcept = data || null;
      }
      const ctx = buildGenerationContext({ form, keywords: allKeywords, styleGuide, brandStyleGuide, season, brandVoice, photoStandards, imageAnalysis, allCollectionNames, linkedConcept: freshLinkedConcept, approvedPolicies });
      const res = await fetch('/.netlify/functions/generate-listing-v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: ctx,
          imageBase64: imageBase64 || null,
          mediaType: imageMediaType,
          titleStrategy: form.titleStrategy,
        }),
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
      if (!res.ok || !data.listing) { setGenError(`Generation failed — ${data.error || 'no output returned'}`); setGenerating(false); return; }

      // Sanitize once, at the source, rather than trusting each downstream
      // reader to guard itself — this same object becomes `output` state
      // (setOutput below) and later a saved draft, so every consumer from
      // here on, including the draft-restore path, inherits the fix.
      const listing = {
        ...data.listing,
        tags: asArray(data.listing.tags),
        research_gaps: asArray(data.listing.research_gaps),
        supporting_keywords: asArray(data.listing.supporting_keywords),
        image_prompts: asArray(data.listing.image_prompts),
        validation: { ...data.listing.validation, warnings: asArray(data.listing.validation?.warnings) },
      };
      const warnings = [
        ...asArray(listing.validation?.warnings),
        ...validateGeneratedListing({ listing, productTruth: ctx.productTruth, discussionPermissions: ctx.discussionPermissions, keywordPool: ctx.keywordPool }),
      ];
      setValidationWarnings(warnings);
      setResearchGaps(asArray(listing.research_gaps));
      setExcludedKeywordsDisplay(ctx.excludedKeywords || []);
      setResearchSourcesUsed(ctx.researchSourcesUsed || []);

      const matchedKeyword = listing.primary_intent_matched_keyword
        ? ctx.keywordPool.find(k => k.keyword.trim().toLowerCase() === listing.primary_intent_matched_keyword.trim().toLowerCase())
        : null;
      setPrimarySearchIntent(listing.primary_search_intent || '');
      setPrimaryIntentStatus(listing.primary_intent_status || '');

      // Persist the generation ledger row immediately — before the listing
      // is ever saved as a product. A new listing generates before any
      // product row exists (productId is null throughout drafting), so this
      // inserts with product_id: null and gets linked once handleSaveProduct
      // succeeds (see pendingGenerationIds below) — otherwise every pre-save
      // attempt (comparing a few generations before deciding) would be
      // silently unlogged, losing exactly the history a later phase's
      // learning work would want most.
      const { data: genRow } = await createListingGeneration({
        productId: productId || null,
        generationVersion: GENERATION_VERSION,
        trigger: output ? 'manual_regenerate' : 'initial_generation',
        primarySearchIntent: listing.primary_search_intent,
        primarySearchIntentKeywordId: matchedKeyword?.keywordId || null,
        primaryIntentStatus: listing.primary_intent_status,
        researchSourcesUsed: ctx.researchSourcesUsed,
        researchGaps: asArray(listing.research_gaps),
        productTruthSnapshot: ctx.rawProductTruth,
        productTruthSources: ctx.productTruthSources,
        discussionPermissions: ctx.discussionPermissions,
        titleStrategy: form.titleStrategy,
        title: listing.title,
        tags: asArray(listing.tags),
        description: listing.description,
        imagePrompts: asArray(listing.image_prompts),
        validationStatus: listing.validation?.status || null,
        validationWarnings: warnings,
        changeReason: changeReason || null,
        model: data.model,
        inputTokens: data.usage?.input_tokens,
        outputTokens: data.usage?.output_tokens,
        supportingKeywords: asArray(listing.supporting_keywords).map(k => ({
          keyword: k.keyword,
          keywordId: ctx.keywordPool.find(p => p.keyword.trim().toLowerCase() === (k.source_keyword || k.keyword).trim().toLowerCase())?.keywordId || null,
          relevanceCategory: k.relevance_category,
        })),
        excludedKeywords: ctx.excludedKeywords,
      });
      if (genRow?.id && !productId) setPendingGenerationIds(ids => [...ids, genRow.id]);
      // Milestone C2 — keeps Version History current after a same-session
      // regenerate; previously this hook was fetched once on mount only.
      if (genRow?.id) refetchGenerations();

      setOutput(listing);
    } catch (err) {
      setGenError(err.message);
    }
    setGenerating(false);
  }

  // Restore a past version (Milestone C2) — loads a stored
  // listing_generations row back into the same draft state a fresh
  // generation already populates. Writes NOTHING to the database: no
  // createListingGeneration call, no pendingGenerationIds change. `form`
  // (Product Truth) is deliberately never touched — restore only ever
  // reloads output-shaped state, never rolls back product-level facts.
  // setOutput below triggers the existing "output changed" effect, which
  // already fills editTitle/editTags/editDesc/editPrompts/
  // primarySearchIntent/primaryIntentStatus/researchGaps from it.
  function handleRestoreVersion(generation) {
    setOutput(buildOutputFromGeneration(generation));
    const history = extractHistoryDisplay(generation);
    setValidationWarnings(history.validationWarnings);
    setResearchSourcesUsed(history.researchSourcesUsed);
    setExcludedKeywordsDisplay(history.excludedKeywordsDisplay);
  }

  // Save as new product (standalone mode only)
  const [saveStage, setSaveStage]   = useState('Live');
  const [saving, setSaving]         = useState(false);
  const [savedProductId, setSavedProductId] = useState(null);
  const [saveEditsState, setSaveEditsState] = useState('idle');

  // Shared Product Truth + title_strategy field mapping for both save paths
  // below. title_style (the old 2-value column) is deliberately never
  // written by either — it stays untouched historical data; title_strategy
  // is the only field new code writes going forward.
  function productTruthUpdates() {
    return {
      product_format: form.productFormat || null,
      blank_brand: form.blankBrand || null,
      blank_model: form.blankModel || null,
      garment_color: form.garmentColor || null,
      available_colors: form.availableColors?.length ? form.availableColors : null,
      size_range: form.sizeRange || null,
      material: form.material || null,
      personalization_available: form.personalizationAvailable,
      customization_available: form.customizationAvailable,
      gift_wrap_available: form.giftWrapAvailable,
      production_time: form.productionTime || null,
      shipping_policy: form.shippingPolicy || null,
      fulfillment_provider: form.fulfillmentProvider || null,
      product_template_id: form.productTemplateId || null,
      title_strategy: form.titleStrategy || 'buyer_clear',
    };
  }

  async function handleSaveEdits() {
    setSaveEditsState('saving');
    const updates = {
      live_title: editTitle || null,
      live_tags: editTags.filter(Boolean).join(', ') || null,
      concept_id: linkedConceptId || null,
      ...productTruthUpdates(),
    };
    if (Object.keys(editDesc).length > 0) {
      updates.generated_description = editDesc;
    }
    if (editPrompts.length > 0) {
      updates.generated_image_prompts = editPrompts;
    }
    await updateProduct(productId, updates);
    setSaveEditsState('saved');
    setTimeout(() => setSaveEditsState('idle'), 2000);
  }

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
      concept_id:        linkedConceptId || null,
      stage_updated_at:  new Date().toISOString(),
      ...productTruthUpdates(),
      ...(Object.keys(editDesc).length > 0 ? { generated_description: editDesc } : {}),
      ...(editPrompts.length > 0 ? { generated_image_prompts: editPrompts } : {}),
    });
    setSaving(false);
    if (!error && data?.id) {
      setSavedProductId(data.id);
      // Link this session's pre-save generation(s) — logged with
      // product_id: null since no product existed yet at generation time
      // (see handleGenerate) — to the real product that now exists.
      if (pendingGenerationIds.length) {
        await linkGenerationsToProduct(pendingGenerationIds, data.id);
        setPendingGenerationIds([]);
      }
      clearDraft();
    }
  }

  // Editable output state (initialized from generated output). Also covers
  // the draft-restore path (a refreshed browser tab sets `output` directly
  // from localStorage, bypassing handleGenerate) — redundant-but-harmless
  // when coming from handleGenerate, which already sets these directly.
  useEffect(() => {
    if (!output) return;
    setEditTitle(output.title || '');
    setEditTags(asArray(output.tags).map(t => t));
    setEditDesc(output.description ? { ...output.description } : {});
    setEditPrompts(asArray(output.image_prompts).map(p => ({ ...p })));
    if (output.primary_search_intent) setPrimarySearchIntent(output.primary_search_intent);
    if (output.primary_intent_status) setPrimaryIntentStatus(output.primary_intent_status);
    if (output.research_gaps) setResearchGaps(asArray(output.research_gaps));
    if (output.title && !form.productName) setField('productName', output.title);
  }, [output]);

  // Existing-product hydration (Milestone B) — populates Search Intent/
  // status/gaps/sources/excluded/validation from the most recent ledger row
  // when this session hasn't produced a fresh generation yet. Settles once:
  // either a fresh `output` appears first (its own effect above always
  // wins from then on) or the ledger's last row hydrates display state
  // first. Without this guard, a later "← Edit setup" — which nulls
  // `output` but never refetches the ledger — would silently revert a
  // just-generated result back to stale history. Title/tags are
  // deliberately never touched here; they always come from
  // products.live_title/live_tags via the product-load effect above, never
  // from ledger history.
  const historyHydrationSettledRef = useRef(false);
  useEffect(() => {
    if (historyHydrationSettledRef.current) return;
    if (output) { historyHydrationSettledRef.current = true; return; }
    if (!latestGeneration) return;
    historyHydrationSettledRef.current = true;
    if (latestGeneration.primary_search_intent) setPrimarySearchIntent(latestGeneration.primary_search_intent);
    if (latestGeneration.primary_intent_status) setPrimaryIntentStatus(latestGeneration.primary_intent_status);
    setResearchGaps(asArray(latestGeneration.research_gaps));
    const history = extractHistoryDisplay(latestGeneration);
    setValidationWarnings(history.validationWarnings);
    setResearchSourcesUsed(history.researchSourcesUsed);
    setExcludedKeywordsDisplay(history.excludedKeywordsDisplay);
  }, [output, latestGeneration]);

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

      {/* Draft restored banner */}
      {draftRestored && !productId && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'rgba(var(--dusty-rose-rgb, 188,100,90), 0.08)',
          border: '1px solid rgba(188,100,90,0.25)',
          borderRadius: 4, padding: '8px 14px', marginBottom: 12,
          fontSize: '0.78rem', color: 'var(--charcoal-soft)',
        }}>
          <span>Draft restored — your previous work is back.</span>
          <button type="button" onClick={clearDraft}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.72rem', color: 'var(--charcoal-soft)', opacity: 0.5 }}>
            Discard draft
          </button>
        </div>
      )}

      {/* ── ZONE 1: PRODUCT (Milestone B) ───────────────────────────
          Product Name/Type, Product Truth, Collection, Sub-niche/Notes,
          Linked Concept, Design Image — see Zone1Product.jsx. Research
          Sessions / Primary Search Intent / Title Strategy stay here
          temporarily (unmoved) — they're explicitly Zone 2's content per
          the Milestone B plan, landing in the next task. */}
      <Zone1Product
        open={productZoneOpen} onToggle={() => setProductZoneOpen(o => !o)}
        form={form} setField={setField}
        collections={collections} collectionObjects={collectionObjs} chapters={chapters}
        extraCollections={extraCollections} onExtraCollectionsChange={setExtraCollections}
        onCollectionCreated={c => { setField('collection', c); refetchCollections?.(); refetchCollectionObjs?.(); }}
        linkedConcept={linkedConcept} pickableConcepts={pickableConcepts}
        onUnlinkConcept={() => setLinkedConceptId(null)} onLinkConcept={id => setLinkedConceptId(id)}
        imagePreview={imagePreview} analyzing={analyzing} imageAnalysis={imageAnalysis}
        onImageAnalysisChange={setImageAnalysis} imageAnalysisError={imageAnalysisError}
        onUploadFile={handleImage} onRetryAnalysis={() => analyzeImage(imageBase64, imageMediaType)}
        templates={productTemplates} approvedPolicies={approvedPolicies}
      />

      {/* ── ZONE 2: SEARCH STRATEGY (Milestone B) ───────────────────
          Primary Search Intent, Title Strategy, research summary +
          evidence — see Zone2SearchStrategy.jsx / ResearchEvidence.jsx. */}
      <Zone2SearchStrategy
        form={form} setField={setField}
        primarySearchIntent={primarySearchIntent}
        onIntentChange={v => { setPrimarySearchIntent(v); setPrimaryIntentStatus(''); }}
        primaryIntentStatus={primaryIntentStatus} output={output}
        sessions={sessions} activeSessions={activeSessions} selectedSessionIds={selectedSessionIds}
        onToggleSession={toggleSession}
        onSelectAllSessions={() => setSelectedSessionIds(new Set(sessions.map(s => s.id)))}
        onSelectNoSessions={() => setSelectedSessionIds(new Set())}
        globalCollections={GLOBAL_COLLECTIONS}
        totalUsable={totalUsable} bucketCounts={bucketCounts}
        sourcesForDisplay={researchSourcesUsed.length > 0 ? researchSourcesUsed : [...new Set(allKeywords.map(k => k._source).filter(Boolean))]}
        keywordAgedays={keywordAgedays} collectionLastVerified={collectionLastVerified} keywordsStale={keywordsStale}
        brandStyleGuide={brandStyleGuide}
        supportingKeywords={asArray(output?.supporting_keywords)}
        researchGaps={researchGaps} excludedKeywords={excludedKeywordsDisplay}
        saveFlagsProductId={productId || savedProductId}
      />

      {/* Zone 4 — Review (Milestone B). Consolidates the old 6-pill
          readiness wall, the red Validation Warnings box, the Excluded
          Keywords disclosure, and both Save flows into one component —
          see Zone4Review.jsx and src/lib/listingReadiness.js. Renders
          unconditionally: pre-generation it shows "Not Generated Yet" plus
          whatever dimensions are already knowable (Product Truth,
          Evidence, Compatibility); its own action row (Regenerate/Save)
          stays hidden until a generation actually exists. */}
      <Zone4Review
        output={output} latestGeneration={latestGeneration}
        generating={generating} genError={genError}
        productFormat={form.productFormat} primarySearchIntent={primarySearchIntent} primaryIntentStatus={primaryIntentStatus}
        usableKeywordCount={totalUsable} keywordsStale={keywordsStale} researchGaps={researchGaps}
        excludedKeywordCount={excludedKeywordsDisplay.length} excludedKeywords={excludedKeywordsDisplay}
        validationWarnings={validationWarnings} hasCollection={!!form.collection}
        onRegenerate={handleGenerate} onEditSetup={() => { setOutput(null); setExistingListing(false); }}
        editTitle={editTitle} editTags={editTags} editDesc={editDesc} editPrompts={editPrompts}
        productId={productId} onSaveEdits={handleSaveEdits} saveEditsState={saveEditsState}
        savedProductId={savedProductId} saving={saving} saveStage={saveStage} onSaveStageChange={setSaveStage}
        saveStages={STAGES.filter(s => !['Killed', 'Paused'].includes(s))}
        onSaveProduct={handleSaveProduct} canSaveProduct={!!form.productName.trim() && !!form.collection}
        onOpenProduct={() => navigate(`/products/${savedProductId}`)}
      />
      <VersionHistory
        generations={pastGenerations}
        editTitle={editTitle} editTags={editTags} editDesc={editDesc} editPrompts={editPrompts} output={output}
        generating={generating}
        onRestore={handleRestoreVersion}
      />
      {/* Bucket Coverage removed (Listing Intelligence Milestone A) — buckets
          are research metadata now, not a generation gate; this block's
          entire purpose was explaining a hard block that no longer exists.
          Bucket display stays exactly as-is in Research/KeywordDetail. */}

      {/* ── INLINE KEYWORD ADD ──────────────────────────────────── */}
      {form.collection && <InlineKeywordAdd collection={form.collection} sessions={sessions} onSaved={refetchSessions} />}

      {/* ── GENERATE BUTTON ─────────────────────────────────────── */}
      {!output && !existingListing && (
        <div style={{ marginBottom: 24 }}>
          <button
            className="btn btn-primary"
            style={{ width: '100%', padding: '14px', fontSize: '1rem' }}
            onClick={() => handleGenerate()}
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
          {/* Existing listing notice */}
          {existingListing && !output && (
            <div style={{ background: 'rgba(43,41,38,0.04)', border: '1px solid rgba(43,41,38,0.1)', borderRadius: 4, padding: '10px 14px', marginBottom: 20, fontSize: '0.78rem', color: 'var(--charcoal-soft)' }}>
              Showing your current live listing. Make edits directly, patch keywords below, or generate a new version above.
            </div>
          )}

          {/* Keyword evidence panel — show whenever we have a listing (new or existing) */}
          {(editTitle || editTags.length > 0) && (
            <KeywordEvidencePanel
              currentPrimaryIntent={primarySearchIntent}
              currentPrimaryIntentStatus={primaryIntentStatus}
              productId={productId || savedProductId}
              isLive={product?.stage === 'Live'}
              editTitle={editTitle} editTags={editTags} editDesc={editDesc} editPrompts={editPrompts} output={output}
              onRegenerate={handleGenerate}
            />
          )}

          {/* Zone 3 — Listing (Milestone B). Tab bar: Listing/Description/
              Images/Research — see Zone3Listing.jsx. */}
          <Zone3Listing
            editTitle={editTitle} onTitleChange={setEditTitle}
            editTags={editTags} onTagsChange={setEditTags}
            primarySearchIntent={primarySearchIntent} primaryIntentStatus={primaryIntentStatus}
            form={form} editDesc={editDesc} onDescChange={(key, v) => setEditDesc(d => ({ ...d, [key]: v }))}
            imagePreview={imagePreview} imageAnalysis={imageAnalysis}
            editPrompts={editPrompts} onPromptsChange={setEditPrompts}
            supportingKeywords={asArray(output?.supporting_keywords)}
            researchGaps={researchGaps} excludedKeywords={excludedKeywordsDisplay}
            sources={researchSourcesUsed.length > 0 ? researchSourcesUsed : [...new Set(allKeywords.map(k => k._source).filter(Boolean))]}
          />
        </div>
      )}
    </div>
  );
}
