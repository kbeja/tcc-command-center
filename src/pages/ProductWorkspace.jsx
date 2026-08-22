import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useProduct, updateProduct, deleteProduct, useResearchSessions, usePlaybooks, createResearchSession, useConcept, useConcepts, useListingGenerations, useListingReviews } from '../lib/hooks';
import { useCollectionsContext } from '../context/CollectionsContext';
import { STAGE_NEXT_ACTIONS, STAGE_PILL_CLASS, STAGES, STAGE_ORDER } from '../data/stages';
import { collectionKnowledge, nicheStyleGuides } from '../data/collections';
import { daysBetween, today } from '../data/seasons';
import { buildContextHeader } from '../lib/context';
import { assignBucketsToList, ClassificationBadge, ConfidenceBadge, TrendIndicator, DisagreementFlag, SEOStatusBadge } from '../lib/keywords.jsx';
import { evaluateListingSEO } from '../lib/listingSEO.js';
import ConfidenceSelector from '../components/ConfidenceSelector';
import CollectionKnowledge from '../components/CollectionKnowledge';
import ResearchSessionCard from '../components/ResearchSessionCard';
import ResearchSessionForm from '../components/ResearchSessionForm';
import ReviewCheckpoints from '../components/ReviewCheckpoints';
import ProductTiming from '../components/ProductTiming';
import NichePicker from '../components/NichePicker';
import ConfirmButton from '../components/ConfirmButton';
import { nowISO } from '../lib/utils';
import { supabase } from '../lib/supabase';

// ─── Stage Tracker (2-col grid, no overflow) ─────────────────────────────────

function StageTracker({ currentStage, onStageSelect, saved, stageUpdatedAt }) {
  const currentIdx = STAGE_ORDER[currentStage] ?? 0;

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
        {STAGES.map((stage, idx) => {
          const done = idx < currentIdx;
          const active = stage === currentStage;
          return (
            <button
              key={stage}
              onClick={() => onStageSelect(stage)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '7px 10px', textAlign: 'left', cursor: 'pointer',
                background: active ? 'var(--rose-faint)' : 'transparent',
                border: 'none',
                borderLeft: active ? '2px solid var(--dusty-rose)' : '2px solid transparent',
                borderRadius: '0 2px 2px 0', transition: 'background 0.12s',
              }}
            >
              <div style={{
                width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
                border: `2px solid ${done || active ? 'var(--dusty-rose)' : 'rgba(43,41,38,0.18)'}`,
                background: active ? 'var(--dusty-rose)' : done ? 'var(--rose-faint)' : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {done && <span style={{ fontSize: '0.45rem', color: 'var(--dusty-rose)', fontWeight: 800 }}>✓</span>}
              </div>
              <span style={{
                fontSize: '0.78rem',
                fontWeight: active ? 600 : 400,
                color: active ? 'var(--warm-charcoal)' : 'var(--charcoal-soft)',
              }}>
                {stage}
              </span>
              {active && (
                <span style={{ marginLeft: 'auto', fontSize: '0.6rem', color: 'var(--dusty-rose)', fontWeight: 500 }}>
                  current
                  {stageUpdatedAt && (() => {
                    const days = Math.floor((Date.now() - new Date(stageUpdatedAt).getTime()) / 86400000);
                    if (days === 0) return null;
                    const color = days > 30 ? 'var(--alert)' : days > 14 ? '#E8A87C' : 'var(--charcoal-soft)';
                    return <span style={{ color, marginLeft: 4 }}>· {days}d</span>;
                  })()}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {saved && <div style={{ marginTop: 8 }}><span className="inline-confirm">✓ Stage updated</span></div>}
    </div>
  );
}

// ─── Live Stats Panel ─────────────────────────────────────────────────────────

function StatInput({ label, value, onChange, type = 'number', prefix, suffix }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: '0.65rem', color: 'var(--charcoal-soft)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {prefix && <span style={{ fontSize: '0.78rem', color: 'var(--charcoal-soft)' }}>{prefix}</span>}
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          min="0"
          step={type === 'number' ? '1' : '0.01'}
          style={{ width: '100%', padding: '6px 8px', fontSize: '0.82rem' }}
        />
        {suffix && <span style={{ fontSize: '0.78rem', color: 'var(--charcoal-soft)' }}>{suffix}</span>}
      </div>
    </div>
  );
}

function LiveStats({ product, onSave }) {
  const [wentLive, setWentLive] = useState(product.went_live_at || '');
  // Everbee
  const [moSales, setMoSales] = useState(product.mo_sales || 0);
  const [moRevenue, setMoRevenue] = useState(product.mo_revenue || 0);
  const [totalSales, setTotalSales] = useState(product.total_sales || 0);
  const [reviews, setReviews] = useState(product.reviews || 0);
  const [moReviews, setMoReviews] = useState(product.mo_reviews || 0);
  const [views, setViews] = useState(product.views || 0);
  const [favorites, setFavorites] = useState(product.favorites || 0);
  const [conversionRate, setConversionRate] = useState(product.conversion_rate || 0);
  const [visibilityScore, setVisibilityScore] = useState(product.visibility_score || 0);
  const [reviewRatio, setReviewRatio] = useState(product.review_ratio || 0);
  // Ads
  const [adViews, setAdViews] = useState(product.ad_views || 0);
  const [adClicks, setAdClicks] = useState(product.ad_clicks || 0);
  const [adClickRate, setAdClickRate] = useState(product.ad_click_rate || 0);
  const [adOrders, setAdOrders] = useState(product.ad_orders || 0);
  const [adRevenue, setAdRevenue] = useState(product.ad_revenue || 0);
  const [adSpend, setAdSpend] = useState(product.ad_spend || 0);
  const [adRoas, setAdRoas] = useState(product.ad_roas || 0);

  const [saved, setSaved] = useState(false);

  const daysLive = wentLive ? daysBetween(wentLive, today()) : null;
  const daysTo30 = daysLive !== null ? Math.max(0, 30 - daysLive) : null;
  const daysSinceUpdate = product.stats_updated_at ? Math.floor((Date.now() - new Date(product.stats_updated_at).getTime()) / 86400000) : null;
  const staleThreshold = daysLive !== null && daysLive < 30 ? 2 : 7;
  const isStale = daysSinceUpdate !== null && daysSinceUpdate >= staleThreshold;

  async function handleSave() {
    const ok = await onSave({
      went_live_at: wentLive || null,
      stats_updated_at: nowISO(),
      mo_sales: parseInt(moSales) || 0,
      mo_revenue: parseFloat(moRevenue) || 0,
      total_sales: parseInt(totalSales) || 0,
      reviews: parseInt(reviews) || 0,
      mo_reviews: parseInt(moReviews) || 0,
      views: parseInt(views) || 0,
      favorites: parseInt(favorites) || 0,
      conversion_rate: parseFloat(conversionRate) || 0,
      visibility_score: parseFloat(visibilityScore) || 0,
      review_ratio: parseFloat(reviewRatio) || 0,
      ad_views: parseInt(adViews) || 0,
      ad_clicks: parseInt(adClicks) || 0,
      ad_click_rate: parseFloat(adClickRate) || 0,
      ad_orders: parseInt(adOrders) || 0,
      ad_revenue: parseFloat(adRevenue) || 0,
      ad_spend: parseFloat(adSpend) || 0,
      ad_roas: parseFloat(adRoas) || 0,
    });
    // Only claim success if the write actually persisted — see handleStatsSave.
    if (!ok) return;
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div>
      {/* 30-day monitor bar */}
      {daysLive !== null && (
        <div style={{
          background: daysTo30 === 0 ? 'rgba(201,123,123,0.12)' : 'var(--charcoal-faint)',
          border: `1px solid ${daysTo30 === 0 ? 'var(--alert)' : 'rgba(43,41,38,0.1)'}`,
          borderRadius: 2, padding: '10px 14px', marginBottom: 16,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: '0.72rem', fontWeight: 500, color: daysTo30 === 0 ? 'var(--alert)' : 'var(--warm-charcoal)' }}>
              {daysTo30 === 0 ? '🔴 30-day mark reached — review now' : `📅 ${daysLive} day${daysLive !== 1 ? 's' : ''} live`}
            </div>
            {daysTo30 > 0 && (
              <div style={{ fontSize: '0.68rem', color: 'var(--charcoal-soft)', marginTop: 2 }}>
                {daysTo30} day{daysTo30 !== 1 ? 's' : ''} until 30-day review
              </div>
            )}
            {isStale && (
              <div style={{ fontSize: '0.65rem', marginTop: 2, color: '#7a4a1e', fontWeight: 500 }}>
                ⚑ Stats not updated in {daysSinceUpdate}d — update now
              </div>
            )}
          </div>
          <div style={{ width: 80, height: 4, background: 'rgba(43,41,38,0.1)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{
              width: `${Math.min(100, (daysLive / 30) * 100)}%`,
              height: '100%',
              background: daysTo30 === 0 ? 'var(--alert)' : 'var(--dusty-rose)',
              borderRadius: 2,
            }} />
          </div>
        </div>
      )}

      {/* Went live date */}
      <div className="form-group" style={{ marginBottom: 16 }}>
        <label className="form-label">Went Live Date</label>
        <input type="date" value={wentLive} onChange={e => setWentLive(e.target.value)} style={{ maxWidth: 200 }} />
      </div>

      {/* Everbee stats */}
      <div className="eyebrow" style={{ marginBottom: 10 }}>Everbee Stats</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
        <StatInput label="Mo. Sales" value={moSales} onChange={setMoSales} />
        <StatInput label="Mo. Revenue" value={moRevenue} onChange={setMoRevenue} prefix="$" type="text" />
        <StatInput label="Total Sales" value={totalSales} onChange={setTotalSales} />
        <StatInput label="Views" value={views} onChange={setViews} />
        <StatInput label="Favorites" value={favorites} onChange={setFavorites} />
        <StatInput label="Reviews" value={reviews} onChange={setReviews} />
        <StatInput label="Mo. Reviews" value={moReviews} onChange={setMoReviews} />
        <StatInput label="Conversion %" value={conversionRate} onChange={setConversionRate} suffix="%" type="text" />
        <StatInput label="Visibility %" value={visibilityScore} onChange={setVisibilityScore} suffix="%" type="text" />
        <StatInput label="Review Ratio" value={reviewRatio} onChange={setReviewRatio} type="text" />
      </div>

      {/* Etsy Ads stats */}
      <div className="eyebrow" style={{ marginBottom: 10 }}>Etsy Ads</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
        <StatInput label="Ad Views" value={adViews} onChange={setAdViews} />
        <StatInput label="Ad Clicks" value={adClicks} onChange={setAdClicks} />
        <StatInput label="Click Rate" value={adClickRate} onChange={setAdClickRate} suffix="%" type="text" />
        <StatInput label="Ad Orders" value={adOrders} onChange={setAdOrders} />
        <StatInput label="Ad Revenue" value={adRevenue} onChange={setAdRevenue} prefix="$" type="text" />
        <StatInput label="Spend" value={adSpend} onChange={setAdSpend} prefix="$" type="text" />
        <StatInput label="ROAS" value={adRoas} onChange={setAdRoas} type="text" />
      </div>

      {/* Profit & ROAS summary — always visible for live products */}
      {(() => {
        if (!product.printify_cost) {
          return (
            <div style={{ padding: '10px 14px', background: 'var(--charcoal-faint)', borderRadius: 4, marginBottom: 12, fontSize: '0.75rem', color: 'var(--charcoal-soft)' }}>
              Add Printify cost in Product Details to see profit margin.
            </div>
          );
        }
        if (!moSales || !moRevenue) {
          return (
            <div style={{ padding: '10px 14px', background: 'var(--charcoal-faint)', borderRadius: 4, marginBottom: 12, fontSize: '0.75rem', color: 'var(--charcoal-soft)' }}>
              Update stats above to see this month's margin.
            </div>
          );
        }
        const netProfit = parseFloat(moRevenue) - product.printify_cost * parseInt(moSales) - parseFloat(adSpend || 0);
        const roas = adSpend > 0 ? parseFloat(adRevenue || 0) / parseFloat(adSpend) : null;
        const margin = parseFloat(moRevenue) > 0 ? (netProfit / parseFloat(moRevenue) * 100).toFixed(0) : null;
        const roasColor = roas === null ? 'var(--charcoal-soft)' : roas >= 3 ? '#2d6b3c' : roas >= 2 ? '#E8A87C' : 'var(--alert)';
        return (
          <div style={{ display: 'flex', gap: 16, padding: '10px 14px', background: netProfit > 0 ? 'rgba(124,175,138,0.1)' : 'rgba(201,123,123,0.1)', borderRadius: 4, marginBottom: 12, fontSize: '0.78rem' }}>
            <span>Net profit: <strong style={{ color: netProfit > 0 ? '#2d6b3c' : 'var(--alert)' }}>${netProfit.toFixed(2)}</strong></span>
            {margin && <span>Margin: <strong>{margin}%</strong></span>}
            {roas !== null && <span>ROAS: <strong style={{ color: roasColor }}>{roas.toFixed(1)}×</strong></span>}
          </div>
        );
      })()}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button className="btn btn-primary btn-sm" onClick={handleSave}>Save Stats</button>
        {saved && <span className="inline-confirm">✓ Saved</span>}
        {product.stats_updated_at && !saved && (
          <span style={{ fontSize: '0.68rem', color: 'var(--charcoal-soft)' }}>
            {(() => {
              const days = Math.floor((Date.now() - new Date(product.stats_updated_at).getTime()) / 86400000);
              return days === 0 ? 'Updated today' : `Updated ${days}d ago${days > 7 ? ' ⚑' : ''}`;
            })()}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Context Bundle ───────────────────────────────────────────────────────────

const SEO_STANDARDS_FALLBACK = `TCC SEO STANDARDS v2 — 3-Bucket Keyword Framework (Taylor Posada method)

KEYWORD BUCKETS
Bucket 1 — Visibility (Unicorn): High volume, LOW competition. Primary search intent. Usually one per listing — scarce by design.
Bucket 2 — Reach (Supporting): High-to-medium volume, medium-to-low competition. Most keywords live here — the real depth of a listing.
Bucket 3 — Bestseller (Broad): High volume, medium-to-high competition. Category terms, seasonal language, and buyer-intent phrases ("gift for her", "birthday gift") all fold into Bucket 3.

BALANCE RULE: all three buckets must have real representation in both title and tags.

TITLE STRUCTURE — ORDER IS FIXED
[Bucket 1] , [Bucket 2] , [Bucket 3]
• Comma ( , ) marks every bucket boundary — NOT pipes, NOT dashes
• First 30–50 characters must contain the Bucket 1 phrase
• Title Case Throughout, max 140 characters
• CORRECT: "Morally Gray Enthusiast Shirt, Fantasy Reader Shirt, Book Lover Gift"
• Overlap check: if two keywords significantly overlap, use the longer phrase — Etsy direct-matches the shorter within it

TAG RULES
• Bucket 1 phrase repeats directly in tags — intentional, not redundant
• Buckets 2–3: reinforce with adjacent phrasing, do NOT restate title terms verbatim

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
❌ No wistful past-tense ("Remember when…") — she lives in the present tense

NOTE: Customer recognition is one input within the Product Validation Framework
(alongside market evidence, human truth, and authentic expression) — not a standalone gate.`;

function ContextBundle({ product, sessions, photoPlaybook, seoPlaybook, brandVoicePlaybook, collectionObj, validationNotes, linkedConcept }) {
  const [copied, setCopied] = useState(null);

  function buildBundle() {
    const colKnowledge = collectionKnowledge[product.collection] || {};
    const isSeasonalProduct = product.portfolio_level === 'Seasonal';

    // ── Keywords: B1/B2/Watch ──
    const useMap = new Map();
    const watchMap = new Map();
    for (const s of sessions) {
      if (s.seasonal && !isSeasonalProduct) continue;
      for (const k of (s.keywords || [])) {
        const key = k.keyword.toLowerCase();
        // Misspelling variants: Etsy's search normalizes these to the correct
        // spelling itself, so they're excluded entirely — not title/description
        // (unchanged), and no longer tags either (a dedicated misspelled tag is
        // redundant now). Still captured as research signal in the raw session data.
        if (k.tags_only) continue;
        if (k.tag_type === 'use') {
          const ex = useMap.get(key);
          if (!ex || (k.score || 0) > (ex.score || 0)) useMap.set(key, k);
        } else if (k.tag_type === 'watch') {
          const ex = watchMap.get(key);
          if (!ex || (k.score || 0) > (ex.score || 0)) watchMap.set(key, k);
        }
      }
    }
    const fmt = k => `  ${k.keyword}${k.volume ? ` | vol ${k.volume}` : ''}${k.score ? ` | score ${k.score}` : ''}`;
    const allUse = [...useMap.values()].sort((a, b) => (b.score || 0) - (a.score || 0));
    const sortedWatch = [...watchMap.values()].sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 10);

    // Split by explicit bucket field; fall back to positional if no buckets set
    const hasBuckets = allUse.some(k => k.bucket);
    const b1 = hasBuckets ? allUse.filter(k => k.bucket === 1) : allUse.slice(0, 5);
    const b2 = hasBuckets ? allUse.filter(k => k.bucket === 2) : allUse.slice(5, 20);
    const b3 = hasBuckets ? allUse.filter(k => k.bucket === 3) : [];

    const kwFallback = colKnowledge.keywords?.topKeywords?.slice(0, 15) || [];
    let keywordSection;
    if (allUse.length === 0 && kwFallback.length === 0) {
      keywordSection = 'No keywords found — add research sessions to this collection.';
    } else if (allUse.length === 0) {
      keywordSection = `B1 — Visibility\n${kwFallback.slice(0, 5).join('\n')}\n\nB2 — Reach\n${kwFallback.slice(5).join('\n')}\n\nB3 — Bestseller\n  ⚠ Not yet mapped — pull from competitor bestseller listings in Trend Radar.`;
    } else {
      keywordSection = `B1 — Visibility (title anchor + first tags)\n${b1.length ? b1.map(fmt).join('\n') : '  ⚠ No B1 keywords assigned — re-bucket in Research'}\n\nB2 — Reach (supporting title + description terms)\n${b2.length ? b2.map(fmt).join('\n') : '  ⚠ No B2 keywords assigned — re-bucket in Research'}\n\nB3 — Bestseller (exact phrases from top competitor listings)\n${b3.length ? b3.map(fmt).join('\n') : '  ⚠ Not yet mapped — pull from competitor bestseller research in Trend Radar.'}\n\nWatch List (monitoring — not yet confirmed)\n${sortedWatch.length ? sortedWatch.map(fmt).join('\n') : '  (none)'}`;
    }

    // ── Style guide: niche-specific → collection DB guide → warning (no chapter fallback) ──
    const nicheKey = (product.niche || '').toLowerCase();
    const staticNicheGuide = nicheKey ? nicheStyleGuides[nicheKey] : null;
    const nicheSessions = product.niche
      ? sessions.filter(s => s.niche?.toLowerCase() === nicheKey && s.notes)
      : [];
    const nicheSessionNotes = nicheSessions.length
      ? `Niche research notes (${product.niche}):\n${nicheSessions.map(s => s.notes).join('\n')}`
      : '';
    const dbCollectionGuide = collectionObj?.style_guide || null;

    let styleGuide;
    if (staticNicheGuide) {
      styleGuide = [staticNicheGuide, nicheSessionNotes].filter(Boolean).join('\n\n');
    } else if (dbCollectionGuide) {
      styleGuide = [dbCollectionGuide, nicheSessionNotes].filter(Boolean).join('\n\n');
    } else {
      styleGuide = `⚠ No style guide found for "${product.niche || product.collection}" — add one in Collections to fix this. Do not substitute a chapter-level default.`;
    }

    // ── Emotional trigger ──
    const triggerLine = product.emotional_trigger
      ? `Emotional trigger: ${product.emotional_trigger}`
      : `Emotional trigger: ⚠ NOT SET — add in Product Details for targeted style direction`;

    // ── Validation status ──
    const vn = validationNotes || {};
    const validationBlock = [
      `Market evidence: ${vn.market_evidence || '⚠ NOT SET'}`,
      `Human truth: ${vn.human_truth || '⚠ NOT SET'}`,
      `Authentic expression: ${vn.authentic_expression || '⚠ NOT SET'}`,
      `Customer recognition: ${vn.customer_recognition || '⚠ NOT SET'}`,
    ].join('\n');

    // ── SEO Standards ──
    const seoSections = seoPlaybook?.playbook_sections || [];
    const seoBlock = seoSections.length
      ? seoSections.map(s => `${s.section_title}:\n${s.body || '(empty)'}`).join('\n\n')
      : SEO_STANDARDS_FALLBACK;

    // ── Brand Voice ──
    const brandSections = brandVoicePlaybook?.playbook_sections || [];
    const brandVoiceBlock = brandSections.length
      ? brandSections.map(s => `${s.section_title}:\n${s.body || '(empty)'}`).join('\n\n')
      : BRAND_VOICE_FALLBACK;

    // ── Listing Photo Standards ──
    const photoSections = photoPlaybook?.playbook_sections || [];
    const photoBlock = photoSections.length
      ? photoSections.map(s => `${s.section_title}:\n${s.body || '(empty)'}`).join('\n\n')
      : 'Listing Photo Standards not loaded — check Knowledge Base > Playbooks > Listing Photos.';

    return `${buildContextHeader('Product', [`Collection: ${product.collection}`, `Product: ${product.name}`])}
${product.niche ? `Niche: ${product.niche}\n` : ''}Stage: ${product.stage}
Confidence: ${product.confidence || 'Not set'}
Ecosystem: ${product.ecosystem_primary || '—'}
${triggerLine}
${linkedConcept ? `
CONCEPT BRIEF (from linked concept "${linkedConcept.name}")
${linkedConcept.design_direction ? `Design Direction: ${linkedConcept.design_direction}\n` : ''}${linkedConcept.visual_style ? `Visual Style: ${linkedConcept.visual_style}\n` : ''}${linkedConcept.color_palette ? `Color Palette: ${linkedConcept.color_palette}\n` : ''}${linkedConcept.target_customer ? `Target Customer: ${linkedConcept.target_customer}\n` : ''}${(linkedConcept.mood_keywords || []).length ? `Mood Keywords: ${linkedConcept.mood_keywords.join(', ')}\n` : ''}` : ''}
PRODUCT VALIDATION STATUS
${validationBlock}

TOP KEYWORDS
${keywordSection}

STYLE GUIDE
${styleGuide}

SEO STANDARDS
${seoBlock}

BRAND VOICE
${brandVoiceBlock}

LISTING PHOTO STANDARDS
${photoBlock}

PRODUCT NOTES
${product.notes || 'None.'}
--- END CONTEXT ---`;
  }

  function handleCopy(variant) {
    navigator.clipboard.writeText(buildBundle());
    setCopied(variant);
    setTimeout(() => setCopied(null), 2000);
  }

  const colKnowledge = collectionKnowledge[product.collection] || {};
  const hasStyleGuide = !!(product.niche && nicheStyleGuides[(product.niche||'').toLowerCase()]) || !!(collectionObj?.style_guide);
  const hasEmotionalTrigger = !!product.emotional_trigger;
  const allUseKws = sessions.flatMap(s => (s.keywords || []).filter(k => k.tag_type === 'use'));
  const hasBucketData = allUseKws.some(k => k.bucket);
  const b1Count = hasBucketData ? allUseKws.filter(k => k.bucket === 1).length : 0;
  const b2Count = hasBucketData ? allUseKws.filter(k => k.bucket === 2).length : 0;
  const b3Count = hasBucketData ? allUseKws.filter(k => k.bucket === 3).length : 0;
  const totalUse = allUseKws.length;
  const validationCount = Object.values(validationNotes || {}).filter(v => v && v.trim()).length;

  const healthChecks = [
    { label: 'Style guide', ok: hasStyleGuide },
    { label: 'Emotional trigger', ok: hasEmotionalTrigger },
    { label: hasBucketData ? `B1 (${b1Count})` : `Keywords (${totalUse})`, ok: hasBucketData ? b1Count >= 1 : totalUse >= 3 },
    { label: hasBucketData ? `B2 (${b2Count})` : null, ok: b2Count >= 3 },
    { label: hasBucketData ? `B3 (${b3Count})` : null, ok: b3Count >= 1 },
    { label: `Validation (${validationCount}/4)`, ok: validationCount >= 3 },
  ].filter(h => h.label !== null);

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        {healthChecks.map(h => (
          <span key={h.label} style={{ fontSize: '0.68rem', fontWeight: 500, padding: '2px 8px', borderRadius: 20, background: h.ok ? 'rgba(124,175,138,0.15)' : 'rgba(201,123,123,0.15)', color: h.ok ? '#2d6b3c' : '#7a2b2b' }}>
            {h.ok ? '✓' : '⚑'} {h.label}
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="btn btn-ghost btn-sm" onClick={() => handleCopy('claude')}>📋 Copy Context for Claude</button>
        <button className="btn btn-ghost btn-sm" onClick={() => handleCopy('chatgpt')}>📋 Copy Context for ChatGPT</button>
        {copied && <span className="inline-confirm">Copied to clipboard ✓</span>}
      </div>
    </div>
  );
}

// ─── Research Section ─────────────────────────────────────────────────────────

function ResearchSection({ collection, sessions, loading, onDeleted, refetch }) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);

  const allUseKws = sessions.flatMap(s => (s.keywords || []).filter(k => k.tag_type === 'use'));
  const topB1 = allUseKws.filter(k => k.bucket === 1).slice(0, 1);
  const topB2 = allUseKws.filter(k => k.bucket === 2).slice(0, 3);
  const topB3 = allUseKws.filter(k => k.bucket === 3).slice(0, 1);
  const hasBucketedKws = topB1.length || topB2.length || topB3.length;
  const fallbackKws = allUseKws.filter(k => !k.bucket).slice(0, 4);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <button
          onClick={() => setOpen(!open)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, padding: 0 }}
        >
          <div className="section-label" style={{ margin: 0 }}>Research Sessions ({sessions.length})</div>
          <span style={{ fontSize: '0.65rem', color: 'var(--charcoal-soft)' }}>{open ? '▲' : '▼'}</span>
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => { setAdding(!adding); setOpen(true); }}>
          {adding ? 'Cancel' : '+ Add Session'}
        </button>
      </div>

      {hasBucketedKws ? (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          {topB1.length === 0 && (
            <span style={{ fontSize: '0.65rem', padding: '2px 8px', borderRadius: 20, background: 'rgba(201,123,123,0.15)', color: '#7a2b2b', border: '1px solid rgba(201,123,123,0.3)' }}>No B1 ⚑</span>
          )}
          {topB1.map((k, i) => (
            <span key={i} style={{ fontSize: '0.68rem', padding: '2px 8px', borderRadius: 20, background: 'rgba(124,175,138,0.25)', color: '#2d6b3c', border: '1px solid rgba(124,175,138,0.4)', fontWeight: 600 }}>B1 · {k.keyword}</span>
          ))}
          {topB2.map((k, i) => (
            <span key={i} style={{ fontSize: '0.68rem', padding: '2px 8px', borderRadius: 20, background: 'rgba(124,175,138,0.12)', color: '#2d6b3c', border: '1px solid rgba(124,175,138,0.25)' }}>{k.keyword}</span>
          ))}
          {topB3.map((k, i) => (
            <span key={i} style={{ fontSize: '0.68rem', padding: '2px 8px', borderRadius: 20, background: 'rgba(107,130,168,0.12)', color: '#2d4270', border: '1px solid rgba(107,130,168,0.25)' }}>B3 · {k.keyword}</span>
          ))}
        </div>
      ) : fallbackKws.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          {fallbackKws.map((k, i) => (
            <span key={i} style={{ fontSize: '0.68rem', padding: '2px 8px', borderRadius: 20, background: 'rgba(124,175,138,0.15)', color: '#2d6b3c', border: '1px solid rgba(124,175,138,0.3)' }}>{k.keyword}</span>
          ))}
          <span style={{ fontSize: '0.62rem', color: 'var(--charcoal-soft)', alignSelf: 'center' }}>Re-bucket in Research to see B1/B2/B3</span>
        </div>
      )}

      {open && (
        <div style={{ marginTop: 8 }}>
          {adding && (
            <div className="card" style={{ marginBottom: 12 }}>
              <ResearchSessionForm
                defaultCollection={collection}
                onSaved={() => { setAdding(false); refetch(); }}
                onCancel={() => setAdding(false)}
              />
            </div>
          )}
          {loading && <div style={{ fontSize: '0.82rem', color: 'var(--charcoal-soft)' }}>Loading…</div>}
          {!loading && sessions.length === 0 && !adding && (
            <div style={{ fontSize: '0.82rem', color: 'var(--charcoal-soft)', padding: '8px 0' }}>
              No research sessions for {collection} yet.
            </div>
          )}
          {sessions.map(s => <ResearchSessionCard key={s.id} session={s} onDeleted={onDeleted} onUpdated={refetch} />)}
        </div>
      )}
    </div>
  );
}

// ─── Keyword Audit ────────────────────────────────────────────────────────────

function parseKeywordCSV(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  const firstData = lines.find(l => l.toLowerCase().indexOf('keyword') === -1) || lines[0] || '';
  const isComma = (firstData.match(/,/g) || []).length >= (firstData.match(/\|/g) || []).length;
  const rows = [];
  for (const line of lines) {
    const parts = isComma
      ? line.split(',').map(p => p.trim().replace(/^"|"$/g, ''))
      : line.split('|').map(p => p.trim().replace(/^"|"$/g, ''));
    if (!parts[0] || parts[0].toLowerCase() === 'keyword') continue;
    const [keyword, volume, competition, score] = parts;
    if (!keyword.trim()) continue;
    rows.push({
      keyword: keyword.trim(),
      volume: volume ? parseInt(String(volume).replace(/[^0-9]/g, '')) || null : null,
      competition: competition ? parseInt(String(competition).replace(/[^0-9]/g, '')) || null : null,
      score: score ? parseInt(String(score).replace(/[^0-9]/g, '')) || null : null,
      tag_type: 'watch',
    });
  }
  return rows;
}

// Real classification/confidence/trend/disagreement badges when the row has
// them (a real researched or generation-linked keyword); a plain row when
// it doesn't (e.g. a raw manual-import row before it's ever been matched
// against real evidence). showExclusionReason renders the real logged
// reason from Milestone A's listing_generation_keywords instead of ranking
// metrics — only meaningful for the Excluded group.
function KeywordGapRow({ k, showExclusionReason }) {
  const lowComp = k.competition != null && k.competition < 500;
  const compColor = k.competition == null ? 'var(--charcoal-soft)'
    : k.competition < 500 ? '#2d6b3c'
    : k.competition > 10000 ? 'var(--alert)'
    : 'var(--charcoal-soft)';
  return (
    <div style={{ padding: '5px 0', borderBottom: '1px solid rgba(43,41,38,0.06)', fontSize: '0.78rem' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {k.primary && <span title="Primary search intent" style={{ fontSize: '0.7rem' }}>★</span>}
        <span style={{ flex: 1 }}>{k.keyword}</span>
        <ClassificationBadge classification={k.classification} />
        <ConfidenceBadge confidence={k.confidence} />
        <TrendIndicator trend={k.trend_classification} />
        <DisagreementFlag flag={k.disagreement_flag} />
        {lowComp && (
          <span style={{ fontSize: '0.6rem', padding: '1px 6px', borderRadius: 10, background: 'rgba(124,175,138,0.2)', color: '#2d6b3c', whiteSpace: 'nowrap', fontWeight: 500 }}>low comp</span>
        )}
        {k.volume != null && <span style={{ color: 'var(--charcoal-soft)', fontSize: '0.68rem', minWidth: 54, textAlign: 'right' }}>vol {k.volume.toLocaleString()}</span>}
        {k.competition != null && <span style={{ color: compColor, fontSize: '0.68rem', minWidth: 66, textAlign: 'right' }}>comp {k.competition.toLocaleString()}</span>}
        {k.score != null && <span style={{ color: 'var(--charcoal-soft)', fontSize: '0.68rem', minWidth: 72, textAlign: 'right' }}>score {k.score.toLocaleString()}</span>}
      </div>
      {showExclusionReason && k.exclusionReason && (
        <div style={{ fontSize: '0.68rem', color: 'var(--charcoal-soft)', paddingLeft: 20, marginTop: 1 }}>↳ {k.exclusionReason}</div>
      )}
    </div>
  );
}

function KeywordAuditSection({ product, sessions, generations, collectionObj, liveTitle, liveTags, onAuditComplete }) {
  const [auditRows, setAuditRows] = useState(null);
  const [screenshotExtracting, setScreenshotExtracting] = useState(false);
  const [auditSaving, setAuditSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [manualImportOpen, setManualImportOpen] = useState(null); // null = default to (no real research yet)

  const latestGeneration = generations?.[0] || null;
  const hasLiveListing = !!(liveTitle || liveTags);

  // Pure JS over already-fetched data — memoized because this page
  // re-renders on every keystroke in several unrelated fields (Notes,
  // Details) that have nothing to do with the audit.
  const seo = useMemo(() => evaluateListingSEO({
    sessions,
    isSeasonalProduct: product.portfolio_level === 'Seasonal',
    latestGeneration,
    title: liveTitle,
    tags: liveTags,
    productFormat: product.product_format,
    hasLiveListing,
    lastVerified: collectionObj?.last_verified || null,
    lastAuditDate: product.last_keyword_audit || null,
  }), [sessions, product.portfolio_level, latestGeneration, liveTitle, liveTags, product.product_format, hasLiveListing, collectionObj?.last_verified, product.last_keyword_audit]);

  const { pool, relevance, gapAnalysis, status, dimensions } = seo;
  const { gaps, excludedGaps, opportunities, using } = gapAnalysis;
  const historicalDimension = dimensions.find(d => d.key === 'historical_context');
  const freshnessDimension = dimensions.find(d => d.key === 'freshness');
  const showManualImport = manualImportOpen === null ? pool.length === 0 : manualImportOpen;

  // Manual-audit-only cadence badge — the original 15-day target, now only
  // the prominent freshness signal when there's no real collection research
  // to fall back on (see freshnessDimension above for that case).
  const manualCadenceDays = product.last_keyword_audit
    ? Math.floor((Date.now() - new Date(product.last_keyword_audit).getTime()) / 86400000)
    : null;
  const manualIsDue = manualCadenceDays === null || manualCadenceDays >= 15;

  useEffect(() => {
    if (screenshotExtracting) return;
    function onPaste(e) {
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      const items = e.clipboardData?.items || [];
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) { e.preventDefault(); handleScreenshotExtract(file); return; }
        }
      }
    }
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [screenshotExtracting]);

  async function handleCSVFile(file) {
    if (!file) return;
    const text = await file.text();
    const rows = parseKeywordCSV(text);
    if (rows.length) setAuditRows(rows);
  }

  async function handleScreenshotExtract(file) {
    if (!file) return;
    setScreenshotExtracting(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target.result.split(',')[1];
      const mediaType = file.type || 'image/png';
      try {
        const resp = await fetch('/.netlify/functions/claude-process', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-function-secret': import.meta.env.VITE_FUNCTION_SECRET },
          body: JSON.stringify({ type: 'extract_keywords_image', payload: { imageBase64: base64, mediaType } }),
        });
        const data = await resp.json();
        if (data.keywords?.length) {
          const incoming = data.keywords.map(k => ({ ...k, tag_type: 'watch' }));
          setAuditRows(prev => {
            if (!prev) return incoming;
            const merged = [...prev];
            for (const r of incoming) {
              const idx = merged.findIndex(m => m.keyword.toLowerCase() === r.keyword.toLowerCase());
              if (idx >= 0) {
                if ((r.score || 0) > (merged[idx].score || 0)) merged[idx] = { ...merged[idx], ...r };
              } else {
                merged.push(r);
              }
            }
            return merged;
          });
        }
      } catch (err) {
        console.error('Screenshot extraction failed:', err);
      }
      setScreenshotExtracting(false);
    };
    reader.readAsDataURL(file);
  }

  async function handleAuditCommit() {
    setAuditSaving(true);
    const todayStr = nowISO().split('T')[0];
    await createResearchSession(
      {
        collection: product.collection,
        parent_niche: product.parent_niche || null,
        niche: product.niche || null,
        date: todayStr,
        source: 'Listing Audit',
        status: 'Complete',
        notes: `Per-listing keyword audit for ${product.name}`,
        product_id: product.id,
        seasonal: false,
      },
      // assignBucketsToList: same bucket/low-quality-text treatment every
      // other import path (CSV, Everbee) already gets — manual audit rows
      // never had it before.
      assignBucketsToList(auditRows.filter(r => r.keyword.trim()))
    );
    await updateProduct(product.id, { last_keyword_audit: today() });
    setAuditRows(null);
    setAuditSaving(false);
    onAuditComplete();
  }

  function updateRow(i, updates) {
    setAuditRows(prev => prev.map((r, idx) => idx === i ? { ...r, ...updates } : r));
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
        <div className="section-label" style={{ margin: 0 }}>Keyword Audit</div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <SEOStatusBadge status={status} />
          {pool.length > 0 && freshnessDimension ? (
            <span style={{
              fontSize: '0.68rem', padding: '2px 9px', borderRadius: 20, fontWeight: 500,
              background: freshnessDimension.state === 'good' ? 'rgba(124,175,138,0.15)' : 'rgba(201,123,123,0.15)',
              color: freshnessDimension.state === 'good' ? '#2d6b3c' : 'var(--alert)',
            }}>
              {freshnessDimension.detail}
            </span>
          ) : pool.length === 0 && manualCadenceDays !== null ? (
            <span style={{
              fontSize: '0.68rem', padding: '2px 9px', borderRadius: 20, fontWeight: 500,
              background: manualIsDue ? 'rgba(201,123,123,0.15)' : 'rgba(124,175,138,0.15)',
              color: manualIsDue ? 'var(--alert)' : '#2d6b3c',
            }}>
              {manualIsDue ? `⚠ Due — last audited ${manualCadenceDays}d ago` : `✓ Audited ${manualCadenceDays}d ago`}
            </span>
          ) : pool.length === 0 ? (
            <span style={{ fontSize: '0.68rem', color: 'var(--charcoal-soft)' }}>Target: every 15 days</span>
          ) : null}
        </div>
      </div>

      {dimensions.length > 0 && (
        <details style={{ marginBottom: 10 }}>
          <summary style={{ fontSize: '0.7rem', color: 'var(--charcoal-soft)', cursor: 'pointer' }}>Why this status?</summary>
          <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {dimensions.map(d => (
              <div key={d.key} style={{ fontSize: '0.72rem', color: 'var(--charcoal-soft)' }}>
                <strong style={{ color: d.state === 'bad' ? 'var(--alert)' : d.state === 'good' ? '#2d6b3c' : 'inherit' }}>
                  {d.informational ? 'ℹ' : d.state === 'good' ? '✓' : d.state === 'caution' ? '⚠' : '✕'}
                </strong>{' '}{d.detail}
              </div>
            ))}
          </div>
        </details>
      )}

      <div style={{ marginBottom: 10 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => setManualImportOpen(!showManualImport)}>
          {showManualImport ? '− Manual import' : '+ Add supplemental keywords manually'}
        </button>
        {pool.length > 0 && !showManualImport && (
          <span style={{ fontSize: '0.68rem', color: 'var(--charcoal-soft)', marginLeft: 8 }}>
            {pool.length} real researched keyword{pool.length === 1 ? '' : 's'} found — manual import is optional.
          </span>
        )}
      </div>

      {showManualImport && (auditRows ? (
        <div>
          <div style={{ fontSize: '0.72rem', color: 'var(--charcoal-soft)', marginBottom: 8 }}>
            {auditRows?.length} keywords — review before saving. Ctrl+V to paste another screenshot and merge.
          </div>
          <div style={{ maxHeight: 280, overflowY: 'auto', marginBottom: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 60px 80px 24px', gap: 4, padding: '3px 8px 6px', fontSize: '0.63rem', color: 'var(--charcoal-soft)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              <div>Keyword</div><div>Volume</div><div>Comp</div><div>Score</div><div />
            </div>
            {auditRows.map((r, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 60px 80px 24px', gap: 4, padding: '3px 8px', alignItems: 'center', background: i % 2 === 0 ? 'var(--charcoal-faint)' : 'transparent', borderRadius: 2 }}>
                <input value={r.keyword} onChange={e => updateRow(i, { keyword: e.target.value })} style={{ padding: '2px 6px', fontSize: '0.75rem' }} />
                <input type="number" value={r.volume ?? ''} onChange={e => updateRow(i, { volume: parseInt(e.target.value) || null })} style={{ padding: '2px 6px', fontSize: '0.75rem' }} />
                <input type="number" value={r.competition ?? ''} onChange={e => updateRow(i, { competition: parseInt(e.target.value) || null })} style={{ padding: '2px 6px', fontSize: '0.75rem' }} />
                <input type="number" value={r.score ?? ''} onChange={e => updateRow(i, { score: parseInt(e.target.value) || null })} style={{ padding: '2px 6px', fontSize: '0.75rem' }} />
                <button onClick={() => setAuditRows(prev => prev.filter((_, j) => j !== i))} style={{ color: 'var(--charcoal-soft)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem', padding: 0 }}>×</button>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="btn btn-primary btn-sm" onClick={handleAuditCommit} disabled={auditSaving || !auditRows.length}>
              {auditSaving ? 'Saving…' : `Save ${auditRows.length} keywords →`}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setAuditRows(null)}>Cancel</button>
          </div>
        </div>
      ) : (
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer.files[0];
            if (!file) return;
            if (file.type.startsWith('image/')) handleScreenshotExtract(file);
            else handleCSVFile(file);
          }}
          style={{
            border: dragOver ? '2px dashed var(--dusty-rose)' : '2px dashed transparent',
            borderRadius: 4,
            padding: dragOver ? '10px 12px' : '0',
            marginBottom: 14,
            transition: 'all 0.12s',
            background: dragOver ? 'var(--rose-faint)' : 'transparent',
          }}
        >
          {dragOver ? (
            <div style={{ fontSize: '0.78rem', color: 'var(--dusty-rose)', textAlign: 'center', padding: '4px 0' }}>
              Drop image or CSV to import
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <label style={{ cursor: 'pointer', display: 'inline-block' }}>
                <span className="btn btn-ghost btn-sm">📥 Import CSV</span>
                <input type="file" accept=".csv,.txt" style={{ display: 'none' }} onChange={e => { handleCSVFile(e.target.files[0]); e.target.value = ''; }} />
              </label>
              <label style={{ cursor: screenshotExtracting ? 'wait' : 'pointer', display: 'inline-block', opacity: screenshotExtracting ? 0.6 : 1 }}>
                <span className="btn btn-ghost btn-sm">{screenshotExtracting ? 'Extracting…' : '🖼 Screenshot'}</span>
                <input type="file" accept="image/*" disabled={screenshotExtracting} style={{ display: 'none' }} onChange={e => { handleScreenshotExtract(e.target.files[0]); e.target.value = ''; }} />
              </label>
              <span style={{ fontSize: '0.68rem', color: 'var(--charcoal-soft)', opacity: 0.7 }}>
                {screenshotExtracting ? 'Extracting from screenshot…' : 'Snip tool → Ctrl+V to paste'}
              </span>
              {!liveTitle && !liveTags && (
                <span style={{ fontSize: '0.68rem', color: 'var(--charcoal-soft)', fontStyle: 'italic' }}>
                  · Add live title + tags above to enable gap analysis
                </span>
              )}
            </div>
          )}
        </div>
      ))}

      {gaps.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Listing Gaps</div>
          {gaps[0] && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'rgba(232,168,124,0.12)', border: '1px solid rgba(232,168,124,0.35)', borderRadius: 4, marginBottom: 8 }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#7a4a1e' }}>Top gap:</span>
              <span style={{ fontSize: '0.78rem', fontWeight: 600 }}>{gaps[0].keyword}</span>
              {gaps[0].volume && <span style={{ fontSize: '0.68rem', color: 'var(--charcoal-soft)' }}>vol {gaps[0].volume.toLocaleString()}</span>}
              {gaps[0].competition && <span style={{ fontSize: '0.68rem', color: 'var(--charcoal-soft)' }}>· comp {gaps[0].competition.toLocaleString()}</span>}
              <span style={{ fontSize: '0.68rem', color: 'var(--charcoal-soft)', marginLeft: 'auto' }}>Add to title/tags →</span>
            </div>
          )}
          <div style={{ fontSize: '0.7rem', color: 'var(--alert)', fontWeight: 500, marginBottom: 6 }}>
            ⚠ {gaps.length} real keyword{gaps.length !== 1 ? 's' : ''} missing from your title or tags:
          </div>
          {gaps.slice(0, 12).map((k, i) => <KeywordGapRow key={i} k={k} />)}
          {gaps.length > 12 && <div style={{ fontSize: '0.68rem', color: 'var(--charcoal-soft)', marginTop: 4 }}>+{gaps.length - 12} more</div>}
        </div>
      )}
      {gaps.length === 0 && relevance.hasRelevanceData && relevance.relevant.length > 0 && (
        <div style={{ fontSize: '0.78rem', color: '#2d6b3c', marginTop: 10 }}>✓ No Listing Gaps — every real supporting keyword is in your title or tags.</div>
      )}

      {opportunities.length > 0 && (
        <details style={{ marginTop: 10 }} open={!relevance.hasRelevanceData}>
          <summary style={{ fontSize: '0.72rem', color: 'var(--charcoal-soft)', cursor: 'pointer', fontWeight: 600 }}>
            Potential Research Opportunities ({opportunities.length})
          </summary>
          {!relevance.hasRelevanceData && (
            <div style={{ fontSize: '0.68rem', color: 'var(--charcoal-soft)', fontStyle: 'italic', margin: '6px 0' }}>
              No product-specific relevance data yet — these are collection keywords worth considering, not confirmed gaps. Run this listing through Listing Builder for a real gap analysis.
            </div>
          )}
          <div style={{ marginTop: 4 }}>
            {opportunities.slice(0, 20).map((k, i) => <KeywordGapRow key={i} k={k} />)}
            {opportunities.length > 20 && <div style={{ fontSize: '0.68rem', color: 'var(--charcoal-soft)', marginTop: 4 }}>+{opportunities.length - 20} more</div>}
          </div>
        </details>
      )}

      {excludedGaps.length > 0 && (
        <details style={{ marginTop: 8 }}>
          <summary style={{ fontSize: '0.7rem', color: 'var(--charcoal-soft)', cursor: 'pointer' }}>
            Excluded ({excludedGaps.length})
          </summary>
          <div style={{ marginTop: 4 }}>
            {excludedGaps.map((k, i) => <KeywordGapRow key={i} k={k} showExclusionReason />)}
          </div>
        </details>
      )}

      {using.length > 0 && (
        <details style={{ marginTop: 8 }}>
          <summary style={{ fontSize: '0.7rem', color: 'var(--charcoal-soft)', cursor: 'pointer' }}>
            ✓ Already using ({using.length})
          </summary>
          <div style={{ marginTop: 4 }}>
            {using.map((k, i) => <KeywordGapRow key={i} k={k} />)}
          </div>
        </details>
      )}

      {historicalDimension && (
        <div style={{ marginTop: 10, padding: '8px 12px', background: 'rgba(43,41,38,0.04)', border: '1px solid rgba(43,41,38,0.1)', borderRadius: 4 }}>
          <div style={{ fontSize: '0.68rem', color: 'var(--charcoal-soft)', fontWeight: 600, marginBottom: 2 }}>Historical context</div>
          <div style={{ fontSize: '0.72rem', color: 'var(--charcoal-soft)' }}>{historicalDimension.detail}</div>
        </div>
      )}
    </div>
  );
}

// ─── Main Workspace ───────────────────────────────────────────────────────────

export default function ProductWorkspace() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { product, loading, refetch } = useProduct(id);
  const [notes, setNotes] = useState('');
  const [ecosystem, setEcosystem] = useState('');
  const [emotionalTrigger, setEmotionalTrigger] = useState('');
  const [niche, setNiche] = useState('');
  const [printifyCost, setPrintifyCost] = useState('');
  const [validationNotes, setValidationNotes] = useState({ market_evidence: '', human_truth: '', authentic_expression: '', customer_recognition: '' });
  const [liveTitle, setLiveTitle] = useState('');
  const [liveTags, setLiveTags] = useState('');
  const [noteSaved, setNoteSaved] = useState(false);
  const [stageSaved, setStageSaved] = useState(false);
  const [fieldSaved, setFieldSaved] = useState('');
  const [saveError, setSaveError] = useState('');

  const { sessions, loading: sessionsLoading, refetch: refetchSessions } = useResearchSessions(product?.collection);
  const { generations: listingGenerations } = useListingGenerations(product?.id);
  const { reviews: listingReviews, loading: reviewsLoading, refetch: refetchReviews } = useListingReviews(product?.id);
  const { playbooks } = usePlaybooks();
  const photoPlaybook = playbooks.find(p => p.slug === 'listing-photos');
  const seoPlaybook = playbooks.find(p => p.slug === 'seo-standards');
  const brandVoicePlaybook = playbooks.find(p => p.slug === 'brand-voice');
  const { collectionObjects: allCollections } = useCollectionsContext();
  const collectionObj = allCollections.find(c => c.name === product?.collection);

  // Linked Concept (Phase 10) — manual picker only here (no push bridge lands
  // on this page); Listing Builder is where the auto-link-on-push happens.
  const { concept: linkedConcept } = useConcept(product?.concept_id || null);
  const { concepts: pickableConcepts } = useConcepts(product?.collection || undefined);
  async function handleConceptLink(conceptId) {
    const patch = { concept_id: conceptId || null };

    // §12 inheritance, Concept -> Product. Only fills a niche that is still
    // EMPTY -- linking a concept must never overwrite a classification already
    // made on the product, which would be a silent write over a human
    // judgment. Reads the concept fresh rather than trusting linkedConcept,
    // which still holds the previously-linked one at this point.
    if (conceptId && !product?.primary_niche_id) {
      const { data: picked } = await supabase
        .from('concepts')
        .select('primary_niche_id, seasonal_niche_id')
        .eq('id', conceptId)
        .maybeSingle();
      if (picked?.primary_niche_id) patch.primary_niche_id = picked.primary_niche_id;
      if (picked?.seasonal_niche_id && !product?.seasonal_niche_id) {
        patch.seasonal_niche_id = picked.seasonal_niche_id;
      }
    }

    const { error } = await updateProduct(id, patch);
    if (error) { setSaveError(error.message); return; }
    setSaveError('');
    refetch();
  }

  useEffect(() => {
    if (product) {
      setNotes(product.notes || '');
      setEcosystem(product.ecosystem_primary || '');
      setEmotionalTrigger(product.emotional_trigger || '');
      setNiche(product.niche || '');
      setPrintifyCost(product.printify_cost != null ? String(product.printify_cost) : '');
      setLiveTitle(product.live_title || '');
      setLiveTags(product.live_tags || '');
      const vn = product.validation_notes || {};
      setValidationNotes({
        market_evidence: vn.market_evidence || '',
        human_truth: vn.human_truth || '',
        authentic_expression: vn.authentic_expression || '',
        customer_recognition: vn.customer_recognition || '',
      });
    }
  }, [product?.id]);

  async function handleFieldBlur(field, value) {
    // Use explicit null check so numeric 0 is preserved, not coerced to null
    const dbValue = (value === '' || value === undefined) ? null : value;
    const { error } = await updateProduct(id, { [field]: dbValue });
    if (error) { setSaveError(error.message); return; }
    setSaveError('');
    setFieldSaved(field);
    setTimeout(() => setFieldSaved(''), 2000);
  }

  async function handleStageUpdate(stage) {
    // Moving a product to Live IS the launch event (Kristen, 2026-08-22), so
    // this is where went_live_at gets recorded — it is a real observed moment,
    // not an inference from created_at/updated_at, which is what every
    // downstream consumer needs it to be (see timingIntelligence.js and
    // tccIntelligence.js, both of which explicitly refuse to guess it).
    //
    // Only ever set, never overwritten: a product moved Live → Paused → Live
    // keeps its original launch date, because the 30/60/90/120 checkpoint
    // clock and every performance comparison are anchored to the first launch.
    // Re-launching would otherwise silently reset a listing's whole history.
    // The date stays hand-editable in the Timing panel for corrections.
    const patch = { stage, stage_updated_at: nowISO() };
    if (stage === 'Live' && !product?.went_live_at) {
      patch.went_live_at = nowISO().split('T')[0];   // date-only, matching the column
    }
    const { error } = await updateProduct(id, patch);
    if (error) { setSaveError(error.message); return; }
    setSaveError('');
    setStageSaved(true);
    setTimeout(() => setStageSaved(false), 2000);
    refetch();
  }

  async function handleConfidence(confidence) {
    const { error } = await updateProduct(id, { confidence });
    if (error) { setSaveError(error.message); return; }
    setSaveError('');
    refetch();
  }

  async function handleNoteBlur() {
    const { error } = await updateProduct(id, { notes });
    if (error) { setSaveError(error.message); return; }
    setSaveError('');
    setNoteSaved(true);
    setTimeout(() => setNoteSaved(false), 2000);
  }

  // Returns true on success / false on failure so LiveStats (which owns its
  // own "✓ Saved" indicator) never shows success for a save that didn't
  // actually persist — this exact silent-success mismatch is the bug being fixed.
  async function handleStatsSave(stats) {
    const { error } = await updateProduct(id, stats);
    if (error) { setSaveError(error.message); return false; }
    setSaveError('');
    refetch();
    return true;
  }

  if (loading) return <div className="page"><div style={{ color: 'var(--charcoal-soft)' }}>Loading…</div></div>;
  if (!product) return <div className="page"><div>Product not found.</div></div>;

  const pillClass = STAGE_PILL_CLASS[product.stage] || 'pill-idea';
  const isLive = product.stage === 'Live' || product.stage === 'Reviewing';

  return (
    <div className="page">

      {/* ── Header ── */}
      <div style={{ marginBottom: 24 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/products')} style={{ marginBottom: 14 }}>
          ← Back
        </button>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.8rem', fontWeight: 300, lineHeight: 1.2, marginBottom: 8 }}>
            {product.name}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 4 }}>
            {['SEO Ready', 'Assets Ready', 'Ready to Publish'].includes(product.stage) ? (
              <button
                className="btn btn-primary btn-sm"
                onClick={() => navigate(`/listing-builder?product=${id}`)}
              >
                Create Listing →
              </button>
            ) : (
              <button
                className="btn btn-ghost btn-sm"
                style={{ opacity: 0.5, cursor: 'default' }}
                title="Available at SEO Ready stage — complete research first"
                disabled
              >
                Create Listing
              </button>
            )}
            {product.etsy_listing_url && (
              <a
                href={product.etsy_listing_url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-ghost btn-sm"
                style={{ textDecoration: 'none' }}
              >
                View on Etsy ↗
              </a>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
          {product.collection && <span style={{ fontSize: '0.75rem', color: 'var(--charcoal-soft)' }}>{product.collection}</span>}
          {product.portfolio_level && <span style={{ fontSize: '0.75rem', color: 'var(--charcoal-soft)' }}>· {product.portfolio_level}</span>}
          <span className={`stage-pill ${pillClass}`}>{product.stage}</span>
        </div>
        <ConfidenceSelector value={product.confidence} onChange={handleConfidence} />
      </div>

      {saveError && (
        <div style={{ padding: '10px 14px', background: 'rgba(201,123,123,0.12)', border: '1px solid var(--alert)', borderRadius: 4, marginBottom: 16, fontSize: '0.8rem', color: 'var(--alert)', fontWeight: 500 }}>
          ⚠ Save failed — your change was NOT saved: {saveError}
        </div>
      )}

      <hr className="rule" />

      {/* ── Stage Tracker ── */}
      <div style={{ marginBottom: 24 }}>
        <div className="section-label" style={{ marginBottom: 10 }}>Stage</div>
        <StageTracker currentStage={product.stage} onStageSelect={handleStageUpdate} saved={stageSaved} stageUpdatedAt={product.stage_updated_at} />
      </div>

      <hr className="rule" />

      {/* ── Next Action ── */}
      <div style={{ marginBottom: 24 }}>
        <div className="section-label" style={{ marginBottom: 8 }}>Next Step</div>
        <div style={{
          background: 'var(--warm-white)', border: '1px solid rgba(43,41,38,0.1)',
          borderLeft: '3px solid var(--dusty-rose)', borderRadius: '0 2px 2px 0',
          padding: '12px 16px', fontSize: '0.88rem', lineHeight: 1.5,
        }}>
          {STAGE_NEXT_ACTIONS[product.stage]}
        </div>
      </div>

      <hr className="rule" />

      {/* ── Live Stats (only for Live / Reviewing) ── */}
      {isLive && (
        <>
          <div style={{ marginBottom: 24 }}>
            <ProductTiming product={product} onSaveLaunchDate={handleStatsSave} />
          </div>
          <hr className="rule" />
          <div style={{ marginBottom: 24 }}>
            <div className="section-label" style={{ marginBottom: 10 }}>Listing Stats</div>
            <LiveStats product={product} onSave={handleStatsSave} />
          </div>
          <hr className="rule" />
          <div style={{ marginBottom: 24 }}>
            <ReviewCheckpoints
              product={product}
              reviews={listingReviews}
              loadingReviews={reviewsLoading}
              onReviewSaved={refetchReviews}
              generations={listingGenerations}
              sessions={sessions}
            />
          </div>
          <hr className="rule" />
        </>
      )}

      {/* ── Product Details ── */}
      <div style={{ marginBottom: 24 }}>
        <div className="section-label" style={{ marginBottom: 10 }}>Product Details</div>

        {/* Classification (Phase 5). Sits above the free-text fields because
            this is the field analysis actually groups by — §27's "is Hockey Mom
            performing?" is unanswerable from the `ecosystem` free text below,
            which is why that stays as a note rather than a dimension. */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <NichePicker
            value={product.primary_niche_id || null}
            onChange={async val => { await updateProduct(id, { primary_niche_id: val }); refetch(); }}
            label="Niche"
            allowCreate
            helpText="The market this listing serves."
          />
          <NichePicker
            value={product.seasonal_niche_id || null}
            onChange={async val => { await updateProduct(id, { seasonal_niche_id: val }); refetch(); }}
            label="Seasonal overlay"
            pathPrefix="Seasonal"
            helpText="Optional — only if tied to a season or occasion."
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">
              Ecosystem {fieldSaved === 'ecosystem_primary' && <span className="inline-confirm" style={{ marginLeft: 6 }}>✓</span>}
            </label>
            <input
              value={ecosystem}
              onChange={e => setEcosystem(e.target.value)}
              onBlur={() => handleFieldBlur('ecosystem_primary', ecosystem)}
              placeholder="e.g. Mom Life, Bookish"
            />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">
              Emotional Trigger {fieldSaved === 'emotional_trigger' && <span className="inline-confirm" style={{ marginLeft: 6 }}>✓</span>}
            </label>
            <input
              value={emotionalTrigger}
              onChange={e => setEmotionalTrigger(e.target.value)}
              onBlur={() => handleFieldBlur('emotional_trigger', emotionalTrigger)}
              placeholder="e.g. Identity, Humor, Belonging"
            />
          </div>
          <div className="form-group" style={{ margin: 0, gridColumn: '1 / -1' }}>
            <label className="form-label">
              Niche <span style={{ fontWeight: 400, opacity: 0.6 }}>(optional)</span>
              {fieldSaved === 'niche' && <span className="inline-confirm" style={{ marginLeft: 6 }}>✓</span>}
            </label>
            <input
              value={niche}
              onChange={e => setNiche(e.target.value)}
              onBlur={() => handleFieldBlur('niche', niche)}
              placeholder="e.g. Camp Mom, Mom Humor, 90s Nostalgia"
            />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">
              Printify Cost ($) {fieldSaved === 'printify_cost' && <span className="inline-confirm" style={{ marginLeft: 6 }}>✓</span>}
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={printifyCost}
              onChange={e => setPrintifyCost(e.target.value)}
              onBlur={() => handleFieldBlur('printify_cost', printifyCost !== '' ? parseFloat(printifyCost) : null)}
              placeholder="e.g. 12.50"
            />
            {printifyCost && (() => {
              const cost = parseFloat(printifyCost);
              if (!cost) return null;
              const suggestPrice = (cost / 0.62).toFixed(2); // ~38% margin after Etsy fees
              const etsyFees = p => (p * 0.065 + 0.20 + p * 0.03).toFixed(2);
              const netAt = p => (p - cost - parseFloat(etsyFees(p))).toFixed(2);
              const price = parseFloat(suggestPrice);
              return (
                <div style={{ fontSize: '0.68rem', color: 'var(--charcoal-soft)', marginTop: 4, lineHeight: 1.6 }}>
                  Suggested list price: <strong>${suggestPrice}</strong> · net ${netAt(price)} after Etsy fees (${etsyFees(price)})
                </div>
              );
            })()}
          </div>
          <div className="form-group" style={{ margin: 0, gridColumn: '1 / -1' }}>
            <label className="form-label">
              Linked Concept <span style={{ fontWeight: 400, opacity: 0.6 }}>— feeds design direction, visual style, and mood into the context bundle below</span>
            </label>
            {linkedConcept ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  fontSize: '0.72rem', padding: '4px 10px', borderRadius: 20,
                  background: 'rgba(124,175,138,0.12)', color: '#2d6b3c',
                  border: '1px solid rgba(124,175,138,0.3)',
                }}>
                  🔗 {linkedConcept.name}
                </span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => handleConceptLink(null)}>
                  Unlink
                </button>
              </div>
            ) : pickableConcepts.length > 0 ? (
              <select value="" onChange={e => { if (e.target.value) handleConceptLink(e.target.value); }}>
                <option value="">— None —</option>
                {pickableConcepts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            ) : (
              <div style={{ fontSize: '0.75rem', color: 'var(--charcoal-soft)' }}>
                No concepts found for this collection.
              </div>
            )}
          </div>
          <div className="form-group" style={{ margin: 0, gridColumn: '1 / -1' }}>
            <label className="form-label">
              Live Etsy Title {fieldSaved === 'live_title' && <span className="inline-confirm" style={{ marginLeft: 6 }}>✓</span>}
            </label>
            <input
              value={liveTitle}
              onChange={e => setLiveTitle(e.target.value)}
              onBlur={() => handleFieldBlur('live_title', liveTitle)}
              placeholder="Current listing title — used for keyword gap analysis"
            />
          </div>
          <div className="form-group" style={{ margin: 0, gridColumn: '1 / -1' }}>
            <label className="form-label">
              Live Etsy Tags {fieldSaved === 'live_tags' && <span className="inline-confirm" style={{ marginLeft: 6 }}>✓</span>}
            </label>
            <textarea
              value={liveTags}
              onChange={e => setLiveTags(e.target.value)}
              onBlur={() => handleFieldBlur('live_tags', liveTags)}
              placeholder="Current listing tags, comma-separated — used for keyword gap analysis"
              rows={2}
            />
          </div>
          <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <button
              className="btn btn-primary btn-sm"
              onClick={async () => {
                const { error } = await updateProduct(id, {
                  ecosystem_primary: ecosystem || null,
                  emotional_trigger: emotionalTrigger || null,
                  niche: niche || null,
                  printify_cost: printifyCost ? parseFloat(printifyCost) : null,
                  live_title: liveTitle || null,
                  live_tags: liveTags || null,
                });
                if (error) { setSaveError(error.message); return; }
                setSaveError('');
                setFieldSaved('details');
                setTimeout(() => setFieldSaved(''), 2000);
              }}
            >
              Save Details
            </button>
            {fieldSaved === 'details' && <span className="inline-confirm">✓ Saved</span>}
          </div>
        </div>
      </div>

      <hr className="rule" />

      {/* ── Product Validation ── */}
      <div style={{ marginBottom: 24 }}>
        <div className="section-label" style={{ marginBottom: 6 }}>
          Product Validation
          {fieldSaved === 'validation_notes' && <span className="inline-confirm" style={{ marginLeft: 8 }}>✓</span>}
        </div>
        <div style={{ fontSize: '0.7rem', color: 'var(--charcoal-soft)', marginBottom: 10, lineHeight: 1.5 }}>
          Four-input framework — market evidence · human truth · authentic expression · customer recognition
        </div>
        {[
          { key: 'market_evidence', label: 'Market Evidence', placeholder: 'Everbee data, trend signals, search volume…' },
          { key: 'human_truth', label: 'Human Truth', placeholder: 'What real feeling or experience does this tap into?' },
          { key: 'authentic_expression', label: 'Authentic Expression', placeholder: 'Does TCC have a genuine perspective here?' },
          { key: 'customer_recognition', label: 'Customer Recognition', placeholder: 'Would the target customer see themselves in this?' },
        ].map(({ key, label, placeholder }) => (
          <div key={key} className="form-group" style={{ margin: '0 0 8px 0' }}>
            <label className="form-label">{label}</label>
            <textarea
              value={validationNotes[key] || ''}
              onChange={e => setValidationNotes(prev => ({ ...prev, [key]: e.target.value }))}
              onBlur={() => handleFieldBlur('validation_notes', { ...validationNotes })}
              placeholder={placeholder}
              rows={2}
            />
          </div>
        ))}
      </div>

      <hr className="rule" />

      {/* ── Context Bundle ── */}
      <div style={{ marginBottom: 24 }}>
        <div className="section-label" style={{ marginBottom: 10 }}>Context Bundle</div>
        <ContextBundle
          product={{ ...product, ecosystem_primary: ecosystem, emotional_trigger: emotionalTrigger, niche }}
          sessions={sessions}
          photoPlaybook={photoPlaybook}
          seoPlaybook={seoPlaybook}
          brandVoicePlaybook={brandVoicePlaybook}
          collectionObj={collectionObj}
          validationNotes={validationNotes}
          linkedConcept={linkedConcept}
        />
      </div>

      <hr className="rule" />

      {/* ── Collection Knowledge ── */}
      {product.collection && collectionKnowledge[product.collection] && (
        <>
          <div style={{ marginBottom: 24 }}>
            <div className="section-label" style={{ marginBottom: 8 }}>Collection Knowledge</div>
            <CollectionKnowledge collection={product.collection} stage={product.stage} collectionObj={collectionObj} />
          </div>
          <hr className="rule" />
        </>
      )}

      {/* ── Keyword Audit ── */}
      <div style={{ marginBottom: 24 }}>
        {(() => {
          const latestSession = sessions.reduce((max, s) => (s.date || '') > (max.date || '') ? s : max, {});
          const latestDate = latestSession.date || '';
          const showBadge = latestDate && (!product.last_keyword_audit || latestDate > product.last_keyword_audit);
          return showBadge ? (
            <div style={{ fontSize: '0.75rem', padding: '8px 12px', marginBottom: 12, borderRadius: 4, background: 'rgba(124,175,138,0.12)', border: '1px solid rgba(124,175,138,0.3)', color: '#2d6b3c' }}>
              ✦ New research available since last audit — scroll down to Keyword Audit to check for gaps
            </div>
          ) : null;
        })()}
        <KeywordAuditSection
          product={product}
          sessions={sessions}
          generations={listingGenerations}
          collectionObj={collectionObj}
          liveTitle={liveTitle}
          liveTags={liveTags}
          onAuditComplete={() => { refetch(); refetchSessions(); }}
        />
      </div>

      <hr className="rule" />

      {/* ── Research Sessions ── */}
      <div style={{ marginBottom: 24 }}>
        <ResearchSection
          collection={product.collection}
          sessions={sessions}
          loading={sessionsLoading}
          onDeleted={refetchSessions}
          refetch={refetchSessions}
        />
      </div>

      <hr className="rule" />

      {/* ── Notes ── */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <div className="section-label" style={{ margin: 0 }}>Notes</div>
          {noteSaved && <span className="inline-confirm">✓ Saved</span>}
        </div>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          onBlur={handleNoteBlur}
          placeholder="Add notes about this product…"
          rows={4}
        />
      </div>

      {/* ── Delete ── */}
      <div style={{ paddingTop: 8, borderTop: '1px solid rgba(43,41,38,0.08)' }}>
        <ConfirmButton
          label="Delete product"
          triggerStyle={{ fontSize: '0.75rem', opacity: 0.6 }}
          promptText="Permanently delete this product?"
          confirmLabel="Yes, delete"
          onConfirm={async () => { await deleteProduct(id); navigate('/products'); }}
        />
      </div>
    </div>
  );
}
