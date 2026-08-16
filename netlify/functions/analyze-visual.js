// Marketplace Visual Intelligence — vision analysis (Phase 20).
//
// Pure vision-analysis endpoint: image in, structured Visual Profile out.
// No Supabase access here on purpose — mirrors claude-process.js's
// analyze_design_image/extract_keywords_image (the two existing vision
// handlers this most resembles), not mobile-capture.js/mobile-concepts.js
// (which own their own DB writes because their caller is an iOS Shortcut
// with no live Supabase client of its own). The caller here is always the
// React app, which already has a live Supabase client with full read/write
// access — persistence (visual_profiles, competitor_listing_tags, the
// storage snapshot) happens client-side in src/lib/hooks.js, same division
// of labor as every other Claude-vision call in this codebase.
//
// Separate file from claude-process.js on purpose (per the approved plan)
// — this is a large, distinct capability (its own taxonomy-driven tool
// schema), not a good fit for a switch-case bolted onto a 500-line file.
//
// The taxonomy term lists below are intentionally duplicated from
// src/lib/visualTaxonomy.js rather than imported — no existing Netlify
// function in this codebase imports from src/lib/ (they only require npm
// packages), and visualTaxonomy.js's own header comment already documents
// that its lists are a hand-kept-in-sync convenience default, not a single
// hard source of truth, for exactly this reason. Keep both in sync by hand
// if the taxonomy changes.

const TYPOGRAPHY_TERMS = [
  'varsity', 'collegiate', 'serif', 'editorial serif', 'retro serif', 'script',
  'handwritten', 'bubble', 'sans serif', 'condensed', 'western', 'blackletter',
  'mixed typography',
];
const COMPOSITION_TERMS = [
  'arch', 'stacked', 'sandwich', 'grid', 'crest', 'badge', 'circular',
  'oversized center', 'minimal center', 'icon row', 'pocket + back',
];
const TREATMENT_TERMS = [
  'clean', 'distressed', 'patchwork', 'modern patchwork', 'doodle', 'hand-drawn',
  'watercolor', 'halftone', 'embroidered-look', 'puff-look', 'vintage wash',
];
const AESTHETIC_TERMS = [
  'elevated sports', 'coquette', 'romantic gothic', 'dark academia', 'preppy',
  'retro collegiate', 'minimalist', 'dopamine', 'western', 'camp', 'modern patchwork',
];
const MOTIF_EXAMPLES = [
  'bow', 'skeleton', 'floral', 'hockey stick', 'football', 'books', 'ghost',
  'cherry', 'raccoon',
];

const TAXONOMY_VERSION = '2026-08-14';
const CONFIDENCE_ENUM = ['High', 'Medium', 'Low'];

// {value, confidence} pair — the shape every non-taxonomy attribute uses so
// confidence lives at the attribute level, not as one blanket score.
const valueConfidencePair = (valueSchema) => ({
  type: 'object',
  properties: { value: valueSchema, confidence: { type: 'string', enum: CONFIDENCE_ENUM } },
});

// {name, confidence} — one per applied tag, so confidence lives on the
// individual tag application (maps 1:1 to a competitor_listing_tags row),
// not just once per whole category.
const taggedTermArray = (exampleTerms, extensible) => ({
  type: 'array',
  description: extensible
    ? `Open-ended — not limited to these examples: ${exampleTerms.join(', ')}, etc. Only include a term if it's clearly present; omit anything uncertain.`
    : `Only from this controlled list when it clearly applies — do not force a weak match: ${exampleTerms.join(', ')}.`,
  items: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      confidence: { type: 'string', enum: CONFIDENCE_ENUM },
    },
    required: ['name', 'confidence'],
  },
});

const DESIGN_SCHEMA = {
  type: 'object',
  description: 'The artwork/design itself — typography, composition, motifs, palette, aesthetic, treatment, text/graphic relationship. NOT the product photo staging (that is `mockup`).',
  properties: {
    typography: taggedTermArray(TYPOGRAPHY_TERMS, false),
    composition: taggedTermArray(COMPOSITION_TERMS, false),
    treatment: taggedTermArray(TREATMENT_TERMS, false),
    aesthetic: taggedTermArray(AESTHETIC_TERMS, false),
    motifs: taggedTermArray(MOTIF_EXAMPLES, true),
    palette: {
      type: 'object',
      description: 'The GRAPHIC\'s own color palette — not the garment/product color, that belongs in mockup.garment_color.',
      properties: {
        dominant_colors: { type: 'array', items: { type: 'string' }, description: 'Descriptive color names (e.g. "burgundy", "cream"), not hex codes unless clearly legible.' },
        approx_color_count: valueConfidencePair({ type: 'integer' }),
      },
    },
    text_to_graphic_balance: valueConfidencePair({ type: 'string' }),
    visual_density: valueConfidencePair({ type: 'string', description: 'How busy the GRAPHIC itself is — distinct from mockup.image_density (how busy the overall listing photo is).' }),
    phrase_vs_illustration_led: valueConfidencePair({ type: 'string' }),
    headline_text_present: valueConfidencePair({ type: 'boolean' }),
    secondary_text_present: valueConfidencePair({ type: 'boolean' }),
    motif_count: valueConfidencePair({ type: 'integer' }),
    audience_cues: { type: 'array', items: { type: 'string' } },
    seasonal_cues: { type: 'array', items: { type: 'string' } },
    distinctive_characteristics: { type: 'string' },
    overall_confidence: { type: 'string', enum: CONFIDENCE_ENUM },
  },
};

const MOCKUP_SCHEMA = {
  type: 'object',
  description: 'How the SELLER PRESENTS the product in this listing photo — model vs flat lay, crop, staging, background. NOT the artwork itself (that is `design`).',
  properties: {
    garment_color: valueConfidencePair({ type: 'string', description: 'The physical product\'s own base color, e.g. shirt color — not the graphic\'s palette.' }),
    mockup_type: valueConfidencePair({ type: 'string' }),
    model_vs_flatlay: valueConfidencePair({ type: 'string' }),
    crop: valueConfidencePair({ type: 'string' }),
    garment_visibility: valueConfidencePair({ type: 'string' }),
    lifestyle_vs_studio: valueConfidencePair({ type: 'string' }),
    background_type: valueConfidencePair({ type: 'string' }),
    prop_usage: valueConfidencePair({ type: 'string' }),
    close_up_vs_full: valueConfidencePair({ type: 'string' }),
    image_density: valueConfidencePair({ type: 'string', description: 'How busy the overall LISTING PHOTO is (props/staging) — distinct from design.visual_density (how busy the graphic itself is).' }),
    product_prominence: valueConfidencePair({ type: 'string' }),
    graphic_readability: valueConfidencePair({ type: 'string' }),
    presentation_style: valueConfidencePair({ type: 'string' }),
    overall_confidence: { type: 'string', enum: CONFIDENCE_ENUM },
  },
};

const VISUAL_PROFILE_TOOL = {
  name: 'record_visual_profile',
  description: 'Record a structured Visual Profile for one competitor Etsy listing image, abstracted into reusable visual-language attributes — never a description aimed at recreating the artwork.',
  input_schema: {
    type: 'object',
    properties: {
      image_quality_sufficient: {
        type: 'boolean',
        description: 'false if the image is too unclear, too low-resolution, or not actually a product/listing photo to analyze meaningfully. When false, leave design/mockup minimal — do not guess to fill them in.',
      },
      design: DESIGN_SCHEMA,
      mockup: MOCKUP_SCHEMA,
      analysis_notes: { type: 'string', description: '1-3 sentences of caveats or things you were unsure about, kept separate from the structured fields above.' },
    },
    required: ['image_quality_sufficient', 'design', 'mockup'],
  },
};

const SYSTEM_PROMPT = `You are a marketplace visual-research analyst for TCC (The Current Chapter), a print-on-demand Etsy shop. You are analyzing a COMPETITOR's listing image to understand marketplace visual-language patterns — typography, composition, treatment, aesthetic, motifs — NOT to describe the artwork closely enough that someone could recreate or closely imitate it. Think "what visual language is this," not "what exactly does this say and show."

Treat DESIGN (the artwork itself) and MOCKUP (how the seller photographed/staged the product) as genuinely separate dimensions — a listing can have a strong design with weak mockup photography or vice versa.

Use the controlled vocabulary terms provided for typography/composition/treatment/aesthetic ONLY when they clearly apply — leave an array empty rather than forcing a weak or uncertain match. Motifs are open-ended by design; feel free to name a motif not in the examples if it's clearly present. Every applied term needs its own confidence (High/Medium/Low) — do not give one blanket confidence for a whole category.

Never claim an exact color hex code, exact font name, or exact material/technique the image doesn't clearly support — use descriptive terms (e.g. "burgundy" not "#7B2D3E") and mark uncertain attributes with Low confidence rather than omitting confidence or guessing precisely.

Call record_visual_profile with your findings.`;

const { checkRateLimit } = require('../lib/rateLimit.js');

const LIMITS = { imageBase64: 6_000_000 };

function safeError(err, label) {
  console.error(`[analyze-visual] ${label}:`, err);
  return { statusCode: 500, body: JSON.stringify({ error: 'Visual analysis failed. Please try again.' }) };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  if (process.env.FUNCTION_SECRET) {
    if (event.headers['x-function-secret'] !== process.env.FUNCTION_SECRET) {
      return { statusCode: 403, body: JSON.stringify({ error: 'Unauthorized' }) };
    }
  }

  const rl = await checkRateLimit(event, 'analyze-visual');
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

  const { imageBase64, mediaType } = body || {};
  if (!imageBase64) {
    return { statusCode: 400, body: JSON.stringify({ error: 'No image data' }) };
  }
  if (imageBase64.length > LIMITS.imageBase64) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Image too large (max 6MB)' }) };
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2500,
        system: SYSTEM_PROMPT,
        tools: [VISUAL_PROFILE_TOOL],
        tool_choice: { type: 'tool', name: 'record_visual_profile' },
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: imageBase64 } },
            { type: 'text', text: 'Analyze this competitor Etsy listing image and call record_visual_profile.' },
          ],
        }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[analyze-visual] upstream error:', response.status, errText);
      return { statusCode: 502, body: JSON.stringify({ error: 'Visual analysis failed upstream. Please try again.' }) };
    }

    const data = await response.json();
    const toolUse = (data.content || []).find(block => block.type === 'tool_use' && block.name === 'record_visual_profile');

    if (!toolUse) {
      console.error('[analyze-visual] no tool_use block in response:', JSON.stringify(data));
      return { statusCode: 502, body: JSON.stringify({ error: 'Analysis did not return structured data. Please try again.' }) };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        taxonomyVersion: TAXONOMY_VERSION,
        model: data.model || 'claude-haiku-4-5-20251001',
        profile: toolUse.input,
        usage: {
          input_tokens: data.usage?.input_tokens ?? null,
          output_tokens: data.usage?.output_tokens ?? null,
        },
      }),
    };
  } catch (err) {
    return safeError(err, 'record_visual_profile');
  }
};
