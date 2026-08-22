// Etsy Marketplace Insights — screenshot extraction (§16).
//
// Image in, structured keyword readings out. Reads a screenshot of Etsy's
// Marketplace Insights panel and returns what it can see, so those numbers can
// be reviewed and corrected rather than typed from scratch.
//
// THIS FUNCTION NEVER WRITES ANYTHING. It returns a suggestion; the React app
// pre-fills the capture form with it and nothing reaches the database until a
// human saves. §16 spells the sequence out — "Screenshot -> extraction
// suggestion -> human review -> approved structured keyword records" — and §29
// separately rules out "automatic screenshot OCR without review". Transcription
// with review is the intended path; transcription that writes is not.
//
// Same shape as analyze-visual.js: pure vision endpoint, forced tool use, no
// Supabase access, persistence handled client-side.
//
// TRANSCRIPTION, NOT INTERPRETATION. The prompt below is deliberately narrow:
// read what is on screen, never estimate, never fill a gap, never convert
// between units. A misread search volume becomes evidence in the ledger and
// then feeds classification and title decisions downstream, so a null is
// always better than a plausible guess. Every field is nullable for that
// reason and the model is told to use null rather than infer.

const { checkRateLimit } = require('../lib/rateLimit.js');

// Mirrors CONVERSION_CLASSES in src/components/EtsyInsightsCapture.jsx —
// hand-kept in sync, same convention analyze-visual.js documents for its own
// duplicated taxonomy lists (no Netlify function here imports from src/).
const CONVERSION_CLASSES = ['Very high', 'High', 'Typical', 'Low', 'Very low'];

const EXTRACT_TOOL = {
  name: 'record_etsy_insights',
  description: 'Transcribe the keyword rows visible in a screenshot of Etsy Marketplace Insights.',
  input_schema: {
    type: 'object',
    properties: {
      readable: {
        type: 'boolean',
        description: 'false if this is not an Etsy Marketplace Insights screen, or is too blurry/cropped to read reliably. When false, return an empty rows array rather than guessing.',
      },
      capture_date: {
        type: 'string',
        description: 'Any date visible on screen, as YYYY-MM-DD. Null if no date is shown — do NOT substitute today.',
      },
      rows: {
        type: 'array',
        description: 'One entry per search term visible. Omit a row entirely if its term cannot be read.',
        items: {
          type: 'object',
          properties: {
            keyword: { type: 'string', description: 'The search term exactly as shown, including spelling.' },
            volume: { type: ['integer', 'null'], description: 'Searches in the last 30 days, as a plain integer. Expand abbreviations: 1.2K becomes 1200. Null if not visible.' },
            competition: { type: ['integer', 'null'], description: 'Search results / competing listings, as a plain integer. Null if not visible.' },
            trend_pct: { type: ['number', 'null'], description: 'Percent change versus the prior period. Negative for a decline. Null if not visible.' },
            conversion_class: { type: ['string', 'null'], enum: [...CONVERSION_CLASSES, null], description: 'Etsy conversion classification, only if one is shown.' },
            price_range: { type: ['string', 'null'], description: 'Listing price range or median price, as displayed (e.g. "$18-$32"). Null if not visible.' },
            similar_terms: { type: 'array', items: { type: 'string' }, description: 'Similar search terms listed for this keyword. Empty array if none shown.' },
            uncertain_fields: {
              type: 'array',
              items: { type: 'string' },
              description: 'Names of any fields above you transcribed but are not fully confident about — partially obscured, ambiguous, or hard to read. The reviewer sees these flagged.',
            },
          },
          required: ['keyword', 'volume', 'competition', 'trend_pct', 'conversion_class', 'price_range', 'similar_terms', 'uncertain_fields'],
        },
      },
      notes: {
        type: ['string', 'null'],
        description: 'Anything the reviewer should know — a cut-off column, an unreadable row, a number that could be misread.',
      },
    },
    required: ['readable', 'capture_date', 'rows', 'notes'],
  },
};

const SYSTEM_PROMPT = `You are transcribing a screenshot of Etsy's Marketplace Insights panel for TCC, a print-on-demand Etsy shop.

Your job is TRANSCRIPTION, not analysis. Read what is on the screen and record it. You are not assessing whether a keyword is good, and you must not say so.

Rules, in order of importance:

1. NEVER INVENT A NUMBER. If a value is cut off, blurred, covered by a tooltip, or simply not shown, return null for that field. A null is correct and expected; a plausible-looking guess becomes permanent evidence in this shop's keyword ledger and will later feed classification and real listing decisions. There is no situation where guessing is better than null.

2. NEVER ESTIMATE OR DERIVE. Do not calculate a trend from a chart, do not infer competition from how crowded a screenshot looks, do not carry a value from one row to another. Only transcribe values that are printed as text.

3. Expand abbreviated numbers exactly: "1.2K" is 1200, "15K" is 15000, "1.2M" is 1200000. If an abbreviation is ambiguous, use null and say so in notes.

4. Transcribe the search term exactly as printed, including unusual spelling. Do not correct, expand, singularise or tidy it — "morally grey shirt" must not become "morally gray shirt". The spelling is itself research data.

5. Flag anything you are less than certain about in that row's uncertain_fields, even if you did transcribe it. The reviewer will check flagged fields first.

6. If the image is not Etsy Marketplace Insights, or is too unclear to read, set readable to false and return an empty rows array. Do not attempt a partial reading of an image you cannot see properly.

Everything you return is a SUGGESTION shown to a human for review and correction before anything is saved.`;

async function handleRequest(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  if (process.env.FUNCTION_SECRET) {
    if (event.headers['x-function-secret'] !== process.env.FUNCTION_SECRET) {
      return { statusCode: 403, body: JSON.stringify({ error: 'Unauthorized' }) };
    }
  }

  const rl = await checkRateLimit(event, 'extract-etsy-insights');
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
    return { statusCode: 400, body: JSON.stringify({ error: 'No image provided' }) };
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
        // Sonnet rather than Haiku, matching generate-listing-v2's reasoning:
        // this is dense small-text transcription where a misread digit becomes
        // permanent evidence, and at a handful of screenshots a week the cost
        // difference is negligible against re-checking a wrong number later.
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 4000,
        system: SYSTEM_PROMPT,
        tools: [EXTRACT_TOOL],
        tool_choice: { type: 'tool', name: 'record_etsy_insights' },
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType || 'image/png', data: imageBase64 } },
            { type: 'text', text: 'Transcribe every search term row visible in this Etsy Marketplace Insights screenshot. Use null for anything not clearly readable.' },
          ],
        }],
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('[extract-etsy-insights] API error:', response.status, text);
      return { statusCode: 502, body: JSON.stringify({ error: `Extraction failed (${response.status})` }) };
    }

    const data = await response.json();
    const toolUse = (data.content || []).find(b => b.type === 'tool_use' && b.name === 'record_etsy_insights');
    if (!toolUse) {
      return { statusCode: 502, body: JSON.stringify({ error: 'Extraction did not return structured data. Please try again.' }) };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: data.model || null,
        extraction: toolUse.input,
        usage: {
          input_tokens: data.usage?.input_tokens ?? null,
          output_tokens: data.usage?.output_tokens ?? null,
        },
      }),
    };
  } catch (err) {
    console.error('[extract-etsy-insights]', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Extraction failed' }) };
  }
}

// SEC-004 — see claude-process.js's identical wrapper comment.
const ORIGIN = process.env.URL || '';

exports.handler = async (event) => {
  const result = await handleRequest(event);
  return { ...result, headers: { ...(result.headers || {}), 'Access-Control-Allow-Origin': ORIGIN } };
};
