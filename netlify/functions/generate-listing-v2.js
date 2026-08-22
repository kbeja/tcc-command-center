// Listing Intelligence Milestone A — structured listing generation.
//
// Replaces claude-process.js's generate_listing. Separate file for the same
// reason analyze-visual.js is separate: a large, distinct capability with
// its own substantial tool schema, not a good fit bolted onto a switch-case.
//
// Pure request/response — no Supabase access. The client (ListingBuilder.jsx)
// does all the safety-critical work BEFORE calling this: fetching Product
// Truth, running the deterministic format-compatibility gate (excluding
// incompatible keywords from the pool entirely — they're never sent here at
// all, not just discouraged in prompt text), and computing discussion
// permissions (src/lib/productTruth.js, all pure/importable client-side —
// no reason to duplicate that logic into this function the way analyze-
// visual.js had to duplicate a taxonomy list, since nothing here needs to
// re-derive it). This function's only job is turning already-safe inputs
// into a well-written listing via one forced-tool-use call, plus the
// defense-in-depth checks that re-verify the AI didn't undo the safety work
// upstream (validateOutput below).
//
// Model is Sonnet, not Haiku (every other call in this codebase uses Haiku)
// — deliberate: this call's highest-stakes output, Primary Search Intent
// selection, is a direct quality judgment tied to the bug that motivated
// this rebuild (a T-shirt got "hockey mom sweatshirt" as its anchor). At
// solo-shop generation volume the cost delta over Haiku is negligible
// against the cost of another wrong anchor keyword.

const { FORMAT_TAXONOMY_VERSION } = require('../../src/lib/productTruth.js');
const { checkRateLimit } = require('../lib/rateLimit.js');

// Derived the same way ListingBuilder.jsx derives its own copy — see
// productTruth.js's FORMAT_TAXONOMY_VERSION comment. Was previously a
// separate hardcoded literal here, which is exactly the drift the shared
// constant exists to prevent — folded into one source of truth.
const GENERATION_VERSION = `milestone-a-${FORMAT_TAXONOMY_VERSION}`;
const RELEVANCE_CATEGORIES = ['exact_product_intent', 'close_product_intent', 'audience', 'style', 'occasion', 'buyer_intent', 'adjacent'];
const CONFIDENCE = ['High', 'Medium', 'Low'];

const TOPIC_LABELS = {
  shipping: 'shipping details (carriers, timelines, international shipping)',
  production_time: 'production or processing time',
  material: 'material or fabric composition',
  sizing: 'available sizes or size range',
  personalization: 'personalization',
  customization: 'customization',
  gift_wrap: 'gift wrapping',
};

function permissionsBlock(permissions) {
  const entries = Object.entries(permissions || {});
  const permitted = entries.filter(([, ok]) => ok).map(([k]) => TOPIC_LABELS[k]).filter(Boolean);
  const forbidden = entries.filter(([, ok]) => !ok).map(([k]) => TOPIC_LABELS[k]).filter(Boolean);
  return [
    'PERMITTED factual topics (may be discussed, using only the facts given below — never invent specifics beyond them):',
    permitted.length ? permitted.map(t => `  - ${t}`).join('\n') : '  (none)',
    'FORBIDDEN topics — do not mention, imply, or hint at these under any circumstance, not even vaguely or by suggestion. If a forbidden topic would normally appear in a listing description, omit that content entirely rather than writing around it:',
    forbidden.length ? forbidden.map(t => `  - ${t}`).join('\n') : '  (none)',
  ].join('\n');
}

function productTruthBlock(pt) {
  const lines = [
    ['Format', pt.product_format],
    ['Blank/brand', pt.blank_brand],
    ['Blank/model', pt.blank_model],
    ['Garment color', pt.garment_color],
    ['Available colors', Array.isArray(pt.available_colors) && pt.available_colors.length ? pt.available_colors.join(', ') : null],
    ['Size range', pt.size_range],
    ['Material', pt.material],
    ['Production time', pt.production_time],
    ['Shipping policy', pt.shipping_policy],
    ['Fulfillment provider', pt.fulfillment_provider],
    ['Personalization available', pt.personalization_available === true ? 'Yes' : (pt.personalization_available === false ? 'No' : null)],
    ['Customization available', pt.customization_available === true ? 'Yes' : (pt.customization_available === false ? 'No' : null)],
    ['Gift wrap available', pt.gift_wrap_available === true ? 'Yes' : (pt.gift_wrap_available === false ? 'No' : null)],
  ].filter(([, v]) => v != null && v !== '');
  if (!lines.length) return '(No Product Truth fields have been confirmed yet.)';
  return lines.map(([label, value]) => `  ${label}: ${value}`).join('\n');
}

function keywordPoolBlock(pool) {
  if (!pool?.length) return '(No researched keywords available for this collection.)';
  return pool.map(k => {
    const parts = [`"${k.keyword}"`];
    if (k.volume != null) parts.push(`vol ${k.volume}`);
    if (k.competition != null) parts.push(`comp ${k.competition}`);
    if (k.source) parts.push(k.source);
    return `  - ${parts.join(' · ')}`;
  }).join('\n');
}

// WHY `hybrid` IS THE DEFAULT (SEO amendment §15–§16)
//
// Etsy's official guidance favours short, clear, readable titles. Current Etsy
// best sellers overwhelmingly do the opposite — long, comma-separated,
// keyword-rich. TCC deliberately follows neither camp wholesale, because the
// two are answering different questions (the amendment's own §21):
//
//   Query matching — can Etsy tell this listing is relevant to a search?
//     More distinct relevant phrases in the title = more queries matched.
//     This is what the long best-seller titles are buying.
//   Ranking / CTR — among matching listings, is this one worth showing and
//     clicking? A title that reads like keyword soup lowers click-through and
//     conversion, which feed ranking. This is what Etsy's guidance is about.
//
// The resolution is positional, not a split-the-difference compromise. Only
// the FRONT of a title survives truncation in search results, so that is the
// only part most shoppers ever read — it carries the whole CTR burden. The
// tail is effectively invisible to humans but still indexed, so extra matching
// coverage there is close to free.
//
// One caveat worth keeping in mind before treating best-seller titles as
// proof: those listings have years of sales and engagement history, which is
// itself a huge ranking signal. They may rank DESPITE their titles rather than
// because of them, and a brand-new listing has none of that cushion. That is
// why this stays a named, switchable strategy with performance tracked against
// it (products.title_strategy, already a Portfolio comparison dimension)
// rather than a hardcoded house rule — TCC's own shop data should eventually
// settle this, not an argument about whose guidance is better.
const TITLE_STRATEGY_INSTRUCTIONS = {
  hybrid: 'Build the title in two zones. FRONT ZONE — roughly the first 50-60 characters, the only part most shoppers ever see before search results truncate it: lead with the single strongest phrase that exactly matches this product and the primary search intent, written so it reads naturally to a human. This zone carries click-through, so it must never read as keyword soup. TAIL — the remainder, up to 140 characters total: add further DISTINCT researched phrases from the pool that genuinely describe this same product, for broader search coverage. Every phrase must be materially different from the others; never restate the same phrase with trivial word-order changes, and never add a phrase merely to consume characters. If the pool has nothing further worth adding, stop early — a shorter accurate title beats a padded one. Absolute rule across both zones: never combine phrases that imply different products (e.g. a sweatshirt listing must never carry a "shirt" or "hoodie" phrase), regardless of how strong that phrase\'s search numbers look.',
  buyer_clear: 'Write a natural, scannable, product-forward title a real shopper would say out loud. Under 140 characters. Do not pad with extra comma-separated phrases just to use more characters, and do not force any particular keyword to lead — put whatever reads most naturally and clearly first.',
  expanded_keyword_test: 'Naturally weave in more of the relevant supporting search phrases than the buyer_clear style would, for broader search-term coverage — but every phrase used must still read naturally in context, stay under 140 characters, and never include a keyword that was excluded or that conflicts with Product Truth. This is an experiment variant, not a return to rigid bucket-ordering rules.',
  manual: 'The shop owner intends to write or heavily edit this title herself. You may return an empty string, or a single natural, accurate suggestion if the evidence clearly points to one — do not over-invest in this field.',
};

// Listing Image Plan (image_prompts) — a fixed role taxonomy instead of
// free-text slot/type fields, so the set reads as one cohesive plan rather
// than disconnected prompts, and the frontend (Zone3Images.jsx — ROLE_LABEL/
// ROLE_ORDER, kept in sync by hand, same convention as analyze-visual.js's
// duplicated taxonomy) can group and label predictably. hero/lifestyle_1/
// flat_lay/detail are always expected; lifestyle_2 and alternate_colors are
// conditional — see IMAGE_PROMPT_INSTRUCTIONS.
const IMAGE_ROLES = ['hero', 'lifestyle_1', 'lifestyle_2', 'flat_lay', 'detail', 'alternate_colors'];

const IMAGE_PROMPT_INSTRUCTIONS = `IMAGE PROMPT PLAN — produce a cohesive, Etsy-ready set of image prompts, each tagged with its role from this fixed set: ${IMAGE_ROLES.join(', ')}. Always include hero, lifestyle_1, flat_lay, and detail. Only include lifestyle_2 when there's a genuinely distinct second styling angle worth showing (a different setting, activity, or framing than lifestyle_1) — omit it rather than duplicate lifestyle_1's concept. Only include alternate_colors when Product Truth lists 2 or more Available Colors — never invent color options that aren't confirmed there.

The whole set should read as one intentional visual strategy — modern boutique Etsy apparel photography filtered through TCC's warm, natural aesthetic — never generic POD-template or wholesale-catalog photography. Across every role, avoid: stiff POD-template mockups, sterile catalog photography, vendor sell sheets, floating-shirt wholesale grids, excessive props, unreadable designs, unlabeled color images, and multiple redundant flat-lay images.

- hero (the Main Image — the single most important image, and the one every other role exists in contrast to): a simple, product-focused mockup, but NOT a sterile catalog shot, stiff front-facing studio template, or wholesale-catalog vibe. Clean, minimal, non-distracting, warm neutral background with subtle depth (not a blank studio void). Minimal or no props. The garment fills roughly 70-85% of the frame, cropped in close enough that the shirt is clearly the focus. The design must be large, centered, fully visible, and readable at thumbnail size. Use soft natural lighting. Pose/styling: avoid a stiff straight-on pose — a relaxed, natural body position with a slight angle or softer stance is preferred, as long as the shirt stays the clear focal point. Avoid busy environments, heavy scene styling, or any composition choice that competes with the graphic. Overall feel: simple, clean, product-led, slightly styled, warm and natural — modern boutique, not generic mockup.
- lifestyle_1 / lifestyle_2: real-world styled shots showing the product worn in a setting that fits the product's aesthetic and audience — secondary to hero, so keep them warm, natural, and lightly styled rather than a heavy storytelling scene. Support the product without overpowering it; keep the shirt and design readable; avoid overly busy scenes. Should read as soft, current, Etsy-friendly support images — not a chaotic lifestyle collage.
- flat_lay: ONE combined flat-lay overview image — never split across several separate flat-lay prompts. If showing multiple colorways or styling variations, arrange them together in a single cohesive layout — clean, intentional, and balanced, on a warm neutral background consistent with the rest of the set. Avoid a busy collage or catalog-sheet look. This complements hero/lifestyle/alternate_colors; it does not replace hero.
- detail: a close-up on the design/print itself — texture, print quality, readability up close. A clean, intentional supporting image, not a repeat of another role's framing.
- alternate_colors: show the product's other Available Colors side by side in a polished boutique presentation — clean editorial layout, warm neutral background consistent with the rest of the set, accurate garment colors. Every color shown MUST have its own clean, readable, neatly placed text label naming that exact color (e.g. if the Available Colors are Ivory, Pepper, Bay, and White, the image must show all four with each one explicitly labeled "Ivory," "Pepper," "Bay," and "White") — never leave a color unlabeled. This should read as a branded Etsy color-options slide, not a manufacturer's line sheet or wholesale product sheet.

STYLING DIRECTION (hero and any lifestyle role showing the garment worn): prefer a relaxed, slightly oversized look over a fitted/bodycon silhouette — natural drape, a roomier fit, a casual and current feel. Pair with simple casual bottoms (denim shorts, relaxed jeans, biker shorts, etc.) when the scene calls for it. This is a styling preference, not license to misrepresent the product: the garment must still read as believably true to the actual blank in Product Truth (see PRODUCT TRUTH OVERRIDES EVERYTHING above) — avoid extreme silhouette exaggeration or styling that makes the shirt look like a different garment cut.

Return image_prompts as an array of {role, prompt} objects, one per included role, in the order listed above (hero first).`;

function buildSystemPrompt({ titleStrategy }) {
  const titleInstruction = TITLE_STRATEGY_INSTRUCTIONS[titleStrategy] || TITLE_STRATEGY_INSTRUCTIONS.hybrid;
  return `You are an Etsy listing specialist for TCC (The Current Chapter), a print-on-demand shop.

PRODUCT TRUTH OVERRIDES EVERYTHING. The product's confirmed physical facts and what topics you're permitted to discuss are stated explicitly in the user message — never contradict them, never infer beyond them, never fill a gap with a plausible-sounding guess. A keyword's existence or popularity in the research pool is never itself a reason to claim a product fact.

The keyword pool you're given has ALREADY been filtered to exclude anything that conflicts with the product's format — every keyword shown to you is safe to reference. You do not need to re-check format compatibility yourself, but you must still only use keywords from the supplied pool (or a clearly natural semantic variant of one) — never invent a keyword, never invent or restate a specific volume/competition number as if it were your own claim.

YOUR TASK, IN THIS ORDER:
1. Identify the Primary Search Intent — the single clearest phrase describing what a shopper would search for to find this exact product. It does not have to be the highest-volume keyword in the pool; it has to accurately describe the product as sold. Status: "validated" if it exactly matches a phrase in the supplied pool, "supported" if it's not an exact match but the pool contains close semantic/product evidence for the same territory, "unvalidated" if you're inferring it purely from Product Truth/collection/audience with no supporting research at all. Never mark "validated" unless you can name the exact matching pool phrase.
2. Classify every keyword you reference into exactly one of: ${RELEVANCE_CATEGORIES.join(', ')}.
3. Note research gaps: "critical" for a product/listing accuracy problem, "research_opportunity" for a clearly missing but useful search phrase, "optional_test" for a future nice-to-have comparison. Do not invent a gap just because the pool is small — only flag a real, specific gap.
4. Write the listing — title, tags, description, image prompts (see IMAGE PROMPT PLAN below) — using only the Primary Search Intent, your relevance-classified supporting keywords, and Product Truth.

TITLE STRATEGY: ${titleInstruction}

TAGS: up to 13, each ≤20 characters, all unique, no artificial padding to hit 13 — fewer good tags beats a nonsense tag. Never include an excluded or format-incompatible term.

DESCRIPTION SECTIONS: opener (warm, specific, not keyword-dense filler), product_details, ordering_steps, shipping (leave as an empty string if shipping is a forbidden topic — see permissions below), cross_sell (only real TCC products/collections/features — if none apply, a generic approved CTA or empty string, never an invented cross-sell), brand_voice_closer (must end with: "The Current Chapter- for the current chapter and every chapter in between.").

${IMAGE_PROMPT_INSTRUCTIONS}

Return your answer only by calling the build_listing tool — do not write prose outside the tool call.`;
}

function buildUserMessage(ctx) {
  const sections = [
    ['PRODUCT TRUTH', productTruthBlock(ctx.productTruth || {})],
    ['WHAT YOU MAY DISCUSS', permissionsBlock(ctx.discussionPermissions)],
    ['COLLECTION / CREATIVE CONTEXT', ctx.collectionContext || '(none provided)'],
    ['LINKED CONCEPT (creative direction only — not additional keywords)', ctx.conceptContext || '(no linked concept)'],
    ['DESIGN IMAGE ANALYSIS', ctx.imageAnalysis || '(no image analyzed)'],
    ['RESEARCHED KEYWORDS (already format-filtered — safe to use)', keywordPoolBlock(ctx.keywordPool)],
    ['STYLE GUIDE', ctx.styleGuide || '(none)'],
    ['BRAND VOICE', ctx.brandVoice || '(none)'],
    ['PHOTO STANDARDS (for image prompts)', ctx.photoStandards || '(none)'],
  ];
  return sections.map(([heading, body]) => `━━━ ${heading} ━━━\n${body}`).join('\n\n');
}

const BUILD_LISTING_TOOL = {
  name: 'build_listing',
  description: 'Return a complete Etsy listing strategy and copy, grounded strictly in the supplied Product Truth and researched keywords.',
  input_schema: {
    type: 'object',
    properties: {
      primary_search_intent: { type: 'string' },
      primary_intent_status: { type: 'string', enum: ['validated', 'supported', 'unvalidated'] },
      primary_intent_matched_keyword: {
        type: ['string', 'null'],
        description: 'The exact pool phrase primary_search_intent matches, if status is validated. Null otherwise. Do not fabricate a match.',
      },
      supporting_keywords: {
        type: 'array',
        description: 'Keywords actually referenced in the listing, each classified. Leave empty rather than forcing weak entries.',
        items: {
          type: 'object',
          properties: {
            keyword: { type: 'string' },
            source_keyword: { type: ['string', 'null'], description: 'Exact matching pool phrase, or null if this is a natural semantic variant with no direct research match.' },
            relevance_category: { type: 'string', enum: RELEVANCE_CATEGORIES },
            confidence: { type: 'string', enum: CONFIDENCE },
          },
          required: ['keyword', 'relevance_category'],
        },
      },
      research_gaps: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            severity: { type: 'string', enum: ['critical', 'research_opportunity', 'optional_test'] },
            message: { type: 'string' },
          },
          required: ['severity', 'message'],
        },
      },
      title: { type: 'string' },
      tags: { type: 'array', items: { type: 'string' } },
      description: {
        type: 'object',
        properties: {
          opener: { type: 'string' },
          product_details: { type: 'string' },
          ordering_steps: { type: 'string' },
          shipping: { type: 'string' },
          cross_sell: { type: 'string' },
          brand_voice_closer: { type: 'string' },
        },
        required: ['opener', 'product_details', 'ordering_steps', 'shipping', 'cross_sell', 'brand_voice_closer'],
      },
      image_prompts: {
        type: 'array',
        description: 'The Listing Image Plan — see IMAGE PROMPT PLAN instructions for role definitions, order, and which roles are conditional.',
        items: {
          type: 'object',
          properties: { role: { type: 'string', enum: IMAGE_ROLES }, prompt: { type: 'string' } },
          required: ['role', 'prompt'],
        },
      },
      validation: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['ready', 'ready_with_caution', 'needs_research'] },
          warnings: { type: 'array', items: { type: 'string' } },
        },
        required: ['status'],
      },
    },
    required: ['primary_search_intent', 'primary_intent_status', 'title', 'tags', 'description', 'validation'],
  },
};

const LIMITS = {
  imageBase64: 6_000_000,
  context: 60_000, // whole-prompt backstop; per-field caps below stop any one field from crowding out the rest
  collectionContext: 10_000,
  conceptContext: 10_000,
  imageAnalysis: 10_000,
  styleGuide: 15_000,
  brandVoice: 5_000,
  photoStandards: 5_000,
};
const CONTEXT_TEXT_FIELDS = ['collectionContext', 'conceptContext', 'imageAnalysis', 'styleGuide', 'brandVoice', 'photoStandards'];

function safeError(err, label) {
  console.error(`[generate-listing-v2] ${label}:`, err);
  return { statusCode: 500, body: JSON.stringify({ error: 'Listing generation failed. Please try again.' }) };
}

async function handleRequest(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  if (process.env.FUNCTION_SECRET) {
    if (event.headers['x-function-secret'] !== process.env.FUNCTION_SECRET) {
      return { statusCode: 403, body: JSON.stringify({ error: 'Unauthorized' }) };
    }
  }

  const rl = await checkRateLimit(event, 'generate-listing-v2');
  if (!rl.allowed) {
    return {
      statusCode: 429,
      headers: rl.retryAfterSeconds ? { 'Retry-After': String(rl.retryAfterSeconds) } : undefined,
      body: JSON.stringify({ error: 'Too many requests. Please wait a moment and try again.' }),
    };
  }

  if (!process.env.CLAUDE_API_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'API key not configured' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { context, imageBase64, mediaType, titleStrategy } = body || {};
  if (!context) return { statusCode: 400, body: JSON.stringify({ error: 'No context provided' }) };
  if (imageBase64 && imageBase64.length > LIMITS.imageBase64) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Image too large (max 6MB)' }) };
  }
  for (const field of CONTEXT_TEXT_FIELDS) {
    const val = context[field];
    if (val != null && typeof val === 'string' && val.length > LIMITS[field]) {
      return { statusCode: 400, body: JSON.stringify({ error: `${field} too large` }) };
    }
  }

  try {
    const userText = buildUserMessage(context);
    if (userText.length > LIMITS.context) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Context too large' }) };
    }
    const userContent = [
      ...(imageBase64 ? [{ type: 'image', source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: imageBase64 } }] : []),
      { type: 'text', text: userText },
    ];

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 4000,
        system: buildSystemPrompt({ titleStrategy }),
        tools: [BUILD_LISTING_TOOL],
        tool_choice: { type: 'tool', name: 'build_listing' },
        messages: [{ role: 'user', content: userContent }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[generate-listing-v2] upstream error:', response.status, errText);
      return { statusCode: 502, body: JSON.stringify({ error: 'Listing generation failed upstream. Please try again.' }) };
    }

    const data = await response.json();
    const toolUse = (data.content || []).find(block => block.type === 'tool_use' && block.name === 'build_listing');
    if (!toolUse) {
      console.error('[generate-listing-v2] no tool_use block in response:', JSON.stringify(data));
      return { statusCode: 502, body: JSON.stringify({ error: 'Generation did not return structured data. Please try again.' }) };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        generationVersion: GENERATION_VERSION,
        model: data.model || 'claude-sonnet-5',
        listing: toolUse.input,
        usage: {
          input_tokens: data.usage?.input_tokens ?? null,
          output_tokens: data.usage?.output_tokens ?? null,
        },
      }),
    };
  } catch (err) {
    return safeError(err, 'build_listing');
  }
}

// SEC-004 — see claude-process.js's identical wrapper comment for the full
// reasoning; same pattern applied here.
const ORIGIN = process.env.URL || '';

exports.handler = async (event) => {
  const result = await handleRequest(event);
  return { ...result, headers: { ...(result.headers || {}), 'Access-Control-Allow-Origin': ORIGIN } };
};
