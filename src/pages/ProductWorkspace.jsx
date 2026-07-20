import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useProduct, updateProduct, deleteProduct, useResearchSessions, usePlaybooks, useCollectionObjects, createResearchSession } from '../lib/hooks';
import { STAGE_NEXT_ACTIONS, STAGE_PILL_CLASS, STAGES, STAGE_ORDER } from '../data/stages';
import { collectionKnowledge, nicheStyleGuides } from '../data/collections';
import { daysBetween, today } from '../data/seasons';
import ConfidenceSelector from '../components/ConfidenceSelector';
import CollectionKnowledge from '../components/CollectionKnowledge';
import ResearchSessionCard from '../components/ResearchSessionCard';
import ResearchSessionForm from '../components/ResearchSessionForm';

// ─── Stage Tracker (2-col grid, no overflow) ─────────────────────────────────

function StageTracker({ currentStage, onStageSelect, saved }) {
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
              {active && <span style={{ marginLeft: 'auto', fontSize: '0.6rem', color: 'var(--dusty-rose)', fontWeight: 500 }}>current</span>}
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

  async function handleSave() {
    await onSave({
      went_live_at: wentLive || null,
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

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button className="btn btn-primary btn-sm" onClick={handleSave}>Save Stats</button>
        {saved && <span className="inline-confirm">✓ Saved</span>}
      </div>
    </div>
  );
}

// ─── Context Bundle ───────────────────────────────────────────────────────────

const SEO_STANDARDS_FALLBACK = `TITLE FORMAT
[Opening phrase, title case] | [Keyword chain]
Rule: Human-readable opening + overlapping keyword chain. Title case throughout.
Example: "Cool Mom Sweatshirt | Mom Life Crewneck | Mama Bear Pullover"

KEYWORD BUCKETS
B1 Visibility — High-volume anchors the algorithm uses to place you. Put in title + first tags.
B2 Reach — Medium-volume, specific. Qualified buyers. Title + tags where it fits.
B3 Bestseller — Exact phrases from top competitor listings. Identify via Everbee/Trend Radar.

TAG FORMAT
• Fill all 13 tags to 20 characters when possible
• Split long phrases across tags (e.g. "cozy mom sweatshirt" → "cozy mom sweat" + "shirt gift for mom")
• No single-word tags unless the word fills 20 characters

DESCRIPTION — 6-SECTION STRUCTURE
1. SEO Opener: 2 sentences, keyword-dense, naturally phrased. First 40 words matter most.
2. Product Details: Size/color/format, file type (if digital), what's included.
3. Ordering Steps: How to customize, download, or place the order.
4. Cross-Sell: "Shop our [collection] for more designs like this…"
5. Shipping: [Standard shop policy language]
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
❌ No wistful past-tense ("Remember when…") — she lives in the present tense

NOTE: Customer recognition is one input within the Product Validation Framework
(alongside market evidence, human truth, and authentic expression) — not a standalone gate.`;

function ContextBundle({ product, sessions, photoPlaybook, seoPlaybook, brandVoicePlaybook, collectionObj, validationNotes }) {
  const [copied, setCopied] = useState(null);

  function buildBundle() {
    const colKnowledge = collectionKnowledge[product.collection] || {};
    const isSeasonalProduct = product.portfolio_level === 'Seasonal';

    // ── Keywords: B1/B2/Watch/Tags-only ──
    const useMap = new Map();
    const watchMap = new Map();
    const tagsOnlyMap = new Map();
    for (const s of sessions) {
      if (s.seasonal && !isSeasonalProduct) continue;
      for (const k of (s.keywords || [])) {
        const key = k.keyword.toLowerCase();
        if (k.tags_only) {
          const ex = tagsOnlyMap.get(key);
          if (!ex || (k.score || 0) > (ex.score || 0)) tagsOnlyMap.set(key, k);
          continue;
        }
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
    const sortedUse = [...useMap.values()].sort((a, b) => (b.score || 0) - (a.score || 0));
    const sortedWatch = [...watchMap.values()].sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 10);
    const sortedTagsOnly = [...tagsOnlyMap.values()].sort((a, b) => (b.score || 0) - (a.score || 0));

    const kwFallback = colKnowledge.keywords?.topKeywords?.slice(0, 15) || [];
    let keywordSection;
    if (sortedUse.length === 0 && kwFallback.length === 0) {
      keywordSection = 'No keywords found — add research sessions to this collection.';
    } else if (sortedUse.length === 0) {
      keywordSection = `B1 — Visibility\n${kwFallback.slice(0, 5).join('\n')}\n\nB2 — Reach\n${kwFallback.slice(5).join('\n')}\n\nB3 — Bestseller\n  ⚠ Not yet mapped — pull from competitor bestseller listings in Trend Radar.`;
    } else {
      const b1 = sortedUse.slice(0, 5);
      const b2 = sortedUse.slice(5, 20);
      keywordSection = `B1 — Visibility (title anchor + first tags)\n${b1.map(fmt).join('\n')}\n\nB2 — Reach (supporting title + description terms)\n${b2.length ? b2.map(fmt).join('\n') : '  (none beyond B1)'}\n\nB3 — Bestseller (exact phrases from top competitor listings)\n  ⚠ Not yet mapped — pull from competitor bestseller research in Trend Radar.\n\nWatch List (monitoring — not yet confirmed)\n${sortedWatch.length ? sortedWatch.map(fmt).join('\n') : '  (none)'}`;
    }

    const tagsOnlyBlock = sortedTagsOnly.length
      ? `\nTAGS-ONLY — misspelling variants (never use in title or description)\n${sortedTagsOnly.map(fmt).join('\n')}`
      : '';

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

    return `--- TCC CONTEXT BUNDLE ---
Product: ${product.name}
Collection: ${product.collection}${product.niche ? `\nNiche: ${product.niche}` : ''}
Stage: ${product.stage}
Confidence: ${product.confidence || 'Not set'}
Ecosystem: ${product.ecosystem_primary || '—'}
${triggerLine}

PRODUCT VALIDATION STATUS
${validationBlock}

TOP KEYWORDS
${keywordSection}
${tagsOnlyBlock}

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

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      <button className="btn btn-ghost btn-sm" onClick={() => handleCopy('claude')}>📋 Copy Context for Claude</button>
      <button className="btn btn-ghost btn-sm" onClick={() => handleCopy('chatgpt')}>📋 Copy Context for ChatGPT</button>
      {copied && <span className="inline-confirm">Copied to clipboard ✓</span>}
    </div>
  );
}

// ─── Research Section ─────────────────────────────────────────────────────────

function ResearchSection({ collection, sessions, loading, onDeleted, refetch }) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);

  const topGreen = sessions
    .flatMap(s => (s.keywords || []).filter(k => k.tag_type === 'use').map(k => k.keyword))
    .filter((v, i, a) => a.indexOf(v) === i)
    .slice(0, 6);

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

      {topGreen.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          {topGreen.map((kw, i) => (
            <span key={i} style={{
              fontSize: '0.68rem', padding: '2px 8px', borderRadius: 20,
              background: 'rgba(124,175,138,0.15)', color: '#2d6b3c',
              border: '1px solid rgba(124,175,138,0.3)',
            }}>{kw}</span>
          ))}
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
          {sessions.map(s => <ResearchSessionCard key={s.id} session={s} onDeleted={onDeleted} />)}
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

function opportunityScore(k) {
  const score = k.score || 0;
  const comp = k.competition ?? null;
  if (comp === null) return score;
  // Penalise high competition: divide by log of competition+2 so the penalty
  // is meaningful but doesn't obliterate a high-volume keyword with moderate comp
  return score / Math.log2((comp || 0) + 2);
}

function computeGaps(keywords, title, tags) {
  const haystack = `${title || ''} ${tags || ''}`.toLowerCase();
  return keywords
    .filter(k => k.tag_type !== 'discard')
    .map(k => ({ ...k, inListing: haystack.includes(k.keyword.toLowerCase()), oppScore: opportunityScore(k) }))
    .sort((a, b) => b.oppScore - a.oppScore);
}

function KeywordGapRow({ k }) {
  const lowComp = k.competition != null && k.competition < 500;
  const compColor = k.competition == null ? 'var(--charcoal-soft)'
    : k.competition < 500 ? '#2d6b3c'
    : k.competition > 10000 ? 'var(--alert)'
    : 'var(--charcoal-soft)';
  return (
    <div style={{ display: 'flex', gap: 8, padding: '5px 0', borderBottom: '1px solid rgba(43,41,38,0.06)', fontSize: '0.78rem', alignItems: 'center' }}>
      <span style={{ flex: 1 }}>{k.keyword}</span>
      {lowComp && (
        <span style={{ fontSize: '0.6rem', padding: '1px 6px', borderRadius: 10, background: 'rgba(124,175,138,0.2)', color: '#2d6b3c', whiteSpace: 'nowrap', fontWeight: 500 }}>low comp</span>
      )}
      {k.volume != null && <span style={{ color: 'var(--charcoal-soft)', fontSize: '0.68rem', minWidth: 54, textAlign: 'right' }}>vol {k.volume.toLocaleString()}</span>}
      {k.competition != null && <span style={{ color: compColor, fontSize: '0.68rem', minWidth: 66, textAlign: 'right' }}>comp {k.competition.toLocaleString()}</span>}
      {k.score != null && <span style={{ color: 'var(--charcoal-soft)', fontSize: '0.68rem', minWidth: 72, textAlign: 'right' }}>score {k.score.toLocaleString()}</span>}
    </div>
  );
}

function KeywordAuditSection({ product, sessions, liveTitle, liveTags, onAuditComplete }) {
  const [auditRows, setAuditRows] = useState(null);
  const [screenshotExtracting, setScreenshotExtracting] = useState(false);
  const [auditSaving, setAuditSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [pasteHint, setPasteHint] = useState(false);

  const auditSessions = sessions
    .filter(s => s.product_id === product.id)
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  const latestAudit = auditSessions[0];
  const latestKeywords = latestAudit?.keywords || [];
  const gapResults = (liveTitle || liveTags) && latestKeywords.length
    ? computeGaps(latestKeywords, liveTitle, liveTags)
    : [];
  const gaps = gapResults.filter(k => !k.inListing);
  const using = gapResults.filter(k => k.inListing);

  const lastAuditDate = product.last_keyword_audit || latestAudit?.date || null;
  const cadenceDays = lastAuditDate
    ? Math.floor((Date.now() - new Date(lastAuditDate).getTime()) / 86400000)
    : null;
  const isDue = cadenceDays === null || cadenceDays >= 15;

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
          headers: { 'Content-Type': 'application/json' },
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
    const today = new Date().toISOString().split('T')[0];
    await createResearchSession(
      {
        collection: product.collection,
        parent_niche: product.parent_niche || null,
        niche: product.niche || null,
        date: today,
        source: 'Listing Audit',
        status: 'Complete',
        notes: `Per-listing keyword audit for ${product.name}`,
        product_id: product.id,
        seasonal: false,
      },
      auditRows.filter(r => r.keyword.trim())
    );
    await updateProduct(product.id, { last_keyword_audit: today });
    setAuditRows(null);
    setAuditSaving(false);
    onAuditComplete();
  }

  function updateRow(i, updates) {
    setAuditRows(prev => prev.map((r, idx) => idx === i ? { ...r, ...updates } : r));
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div className="section-label" style={{ margin: 0 }}>Keyword Audit</div>
        {cadenceDays !== null ? (
          <span style={{
            fontSize: '0.68rem', padding: '2px 9px', borderRadius: 20, fontWeight: 500,
            background: isDue ? 'rgba(201,123,123,0.15)' : 'rgba(124,175,138,0.15)',
            color: isDue ? 'var(--alert)' : '#2d6b3c',
          }}>
            {isDue ? `⚠ Due — last audited ${cadenceDays}d ago` : `✓ Audited ${cadenceDays}d ago`}
          </span>
        ) : (
          <span style={{ fontSize: '0.68rem', color: 'var(--charcoal-soft)' }}>Target: every 15–20 days</span>
        )}
      </div>

      {auditRows ? (
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
            marginBottom: gapResults.length ? 14 : 0,
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
      )}

      {gapResults.length > 0 && !auditRows && (
        <div style={{ marginTop: 10 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Gap Analysis — {latestAudit.date}</div>
          {gaps.length > 0 ? (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--alert)', fontWeight: 500, marginBottom: 6 }}>
                ⚠ {gaps.length} keyword{gaps.length !== 1 ? 's' : ''} not in your title or tags:
              </div>
              {gaps.slice(0, 12).map((k, i) => <KeywordGapRow key={i} k={k} />)}
              {gaps.length > 12 && <div style={{ fontSize: '0.68rem', color: 'var(--charcoal-soft)', marginTop: 4 }}>+{gaps.length - 12} more</div>}
            </div>
          ) : (
            <div style={{ fontSize: '0.78rem', color: '#2d6b3c' }}>✓ All audited keywords appear in your title or tags.</div>
          )}
          {using.length > 0 && (
            <details style={{ marginTop: 6 }}>
              <summary style={{ fontSize: '0.7rem', color: 'var(--charcoal-soft)', cursor: 'pointer' }}>
                ✓ Already using ({using.length})
              </summary>
              <div style={{ marginTop: 4 }}>
                {using.map((k, i) => <KeywordGapRow key={i} k={k} />)}
              </div>
            </details>
          )}
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
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { sessions, loading: sessionsLoading, refetch: refetchSessions } = useResearchSessions(product?.collection);
  const { playbooks } = usePlaybooks();
  const photoPlaybook = playbooks.find(p => p.slug === 'listing-photos');
  const seoPlaybook = playbooks.find(p => p.slug === 'seo-standards');
  const brandVoicePlaybook = playbooks.find(p => p.slug === 'brand-voice');
  const { collections: allCollections } = useCollectionObjects();
  const collectionObj = allCollections.find(c => c.name === product?.collection);

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
    await updateProduct(id, { [field]: value || null });
    setFieldSaved(field);
    setTimeout(() => setFieldSaved(''), 2000);
  }

  async function handleStageUpdate(stage) {
    await updateProduct(id, { stage, stage_updated_at: new Date().toISOString() });
    setStageSaved(true);
    setTimeout(() => setStageSaved(false), 2000);
    refetch();
  }

  async function handleConfidence(confidence) {
    await updateProduct(id, { confidence });
    refetch();
  }

  async function handleNoteBlur() {
    await updateProduct(id, { notes });
    setNoteSaved(true);
    setTimeout(() => setNoteSaved(false), 2000);
  }

  async function handleStatsSave(stats) {
    await updateProduct(id, stats);
    refetch();
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
          <button
            className="btn btn-primary btn-sm"
            style={{ flexShrink: 0, marginTop: 4 }}
            onClick={() => navigate(`/listing-builder?product=${id}`)}
          >
            Create Listing →
          </button>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
          {product.collection && <span style={{ fontSize: '0.75rem', color: 'var(--charcoal-soft)' }}>{product.collection}</span>}
          {product.portfolio_level && <span style={{ fontSize: '0.75rem', color: 'var(--charcoal-soft)' }}>· {product.portfolio_level}</span>}
          <span className={`stage-pill ${pillClass}`}>{product.stage}</span>
        </div>
        <ConfidenceSelector value={product.confidence} onChange={handleConfidence} />
      </div>

      <hr className="rule" />

      {/* ── Stage Tracker ── */}
      <div style={{ marginBottom: 24 }}>
        <div className="section-label" style={{ marginBottom: 10 }}>Stage</div>
        <StageTracker currentStage={product.stage} onStageSelect={handleStageUpdate} saved={stageSaved} />
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
            <div className="section-label" style={{ marginBottom: 10 }}>Listing Stats</div>
            <LiveStats product={product} onSave={handleStatsSave} />
          </div>
          <hr className="rule" />
        </>
      )}

      {/* ── Product Details ── */}
      <div style={{ marginBottom: 24 }}>
        <div className="section-label" style={{ marginBottom: 10 }}>Product Details</div>
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
              onBlur={() => handleFieldBlur('printify_cost', printifyCost ? parseFloat(printifyCost) : null)}
              placeholder="e.g. 12.50"
            />
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
                await updateProduct(id, {
                  ecosystem_primary: ecosystem || null,
                  emotional_trigger: emotionalTrigger || null,
                  niche: niche || null,
                  printify_cost: printifyCost ? parseFloat(printifyCost) : null,
                  live_title: liveTitle || null,
                  live_tags: liveTags || null,
                });
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
        />
      </div>

      <hr className="rule" />

      {/* ── Collection Knowledge ── */}
      {product.collection && collectionKnowledge[product.collection] && (
        <>
          <div style={{ marginBottom: 24 }}>
            <div className="section-label" style={{ marginBottom: 8 }}>Collection Knowledge</div>
            <CollectionKnowledge collection={product.collection} stage={product.stage} />
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
        {confirmDelete ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.82rem' }}>
            <span>Permanently delete this product?</span>
            <button onClick={async () => { await deleteProduct(id); navigate('/products'); }}
              style={{ color: 'var(--alert)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer' }}>
              Yes, delete
            </button>
            <button onClick={() => setConfirmDelete(false)}
              style={{ color: 'var(--charcoal-soft)', background: 'none', border: 'none', cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        ) : (
          <button onClick={() => setConfirmDelete(true)}
            style={{ fontSize: '0.75rem', color: 'var(--charcoal-soft)', background: 'none', border: 'none', cursor: 'pointer', opacity: 0.6 }}>
            Delete product
          </button>
        )}
      </div>
    </div>
  );
}
