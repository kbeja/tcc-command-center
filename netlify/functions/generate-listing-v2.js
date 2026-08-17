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

const TITLE_STRATEGY_INSTRUCTIONS = {
  buyer_clear: 'Write a natural, scannable, product-forward title a real shopper would say out loud. Under 140 characters. Do not pad with extra comma-separated phrases just to use more characters, and do not force any particular keyword to lead — put whatever reads most naturally and clearly first.',
  expanded_keyword_test: 'Naturally weave in more of the relevant supporting search phrases than the buyer_clear style would, for broader search-term coverage — but every phrase used must still read naturally in context, stay under 140 characters, and never include a keyword that was excluded or that conflicts with Product Truth. This is an experiment variant, not a return to rigid bucket-ordering rules.',
  manual: 'The shop owner intends to write or heavily edit this title herself. You may return an empty string, or a single natural, accurate suggestion if the evidence clearly points to one — do not over-invest in this field.',
};

function buildSystemPrompt({ titleStrategy }) {
  const titleInstruction = TITLE_STRATEGY_INSTRUCTIONS[titleStrategy] || TITLE_STRATEGY_INSTRUCTIONS.buyer_clear;
  return `You are an Etsy listing specialist for TCC (The Current Chapter), a print-on-demand shop.

PRODUCT TRUTH OVERRIDES EVERYTHING. The product's confirmed physical facts and what topics you're permitted to discuss are stated explicitly in the user message — never contradict them, never infer beyond them, never fill a gap with a plausible-sounding guess. A keyword's existence or popularity in the research pool is never itself a reason to claim a product fact.

The keyword pool you're given has ALREADY been filtered to exclude anything that conflicts with the product's format — every keyword shown to you is safe to reference. You do not need to re-check format compatibility yourself, but you must still only use keywords from the supplied pool (or a clearly natural semantic variant of one) — never invent a keyword, never invent or restate a specific volume/competition number as if it were your own claim.

YOUR TASK, IN THIS ORDER:
1. Identify the Primary Search Intent — the single clearest phrase describing what a shopper would search for to find this exact product. It does not have to be the highest-volume keyword in the pool; it has to accurately describe the product as sold. Status: "validated" if it exactly matches a phrase in the supplied pool, "supported" if it's not an exact match but the pool contains close semantic/product evidence for the same territory, "unvalidated" if you're inferring it purely from Product Truth/collection/audience with no supporting research at all. Never mark "validated" unless you can name the exact matching pool phrase.
2. Classify every keyword you reference into exactly one of: ${RELEVANCE_CATEGORIES.join(', ')}.
3. Note research gaps: "critical" for a product/listing accuracy problem, "research_opportunity" for a clearly missing but useful search phrase, "optional_test" for a future nice-to-have comparison. Do not invent a gap just because the pool is small — only flag a real, specific gap.
4. Write the listing — title, tags, description, image prompts — using only the Primary Search Intent, your relevance-classified supporting keywords, and Product Truth.

TITLE STRATEGY: ${titleInstruction}

TAGS: up to 13, each ≤20 characters, all unique, no artificial padding to hit 13 — fewer good tags beats a nonsense tag. Never include an excluded or format-incompatible term.

DESCRIPTION SECTIONS: opener (warm, specific, not keyword-dense filler), product_details, ordering_steps, shipping (leave as an empty string if shipping is a forbidden topic — see permissions below), cross_sell (only real TCC products/collections/features — if none apply, a generic approved CTA or empty string, never an invented cross-sell), brand_voice_closer (must end with: "The Current Chapter- for the current chapter and every chapter in between.").

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
        items: {
          type: 'object',
          properties: { slot: { type: 'string' }, type: { type: 'string' }, prompt: { type: 'string' } },
          required: ['prompt'],
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
