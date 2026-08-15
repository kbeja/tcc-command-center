const JSON_RULE = `\n\nCRITICAL: You must ALWAYS return valid JSON only. No explanations, no markdown, no conversational text. If you cannot extract information, return the JSON structure with empty arrays and a summary explaining what was missing. Never break out of JSON format for any reason.`;

const SYSTEM_PROMPTS = {
  session_summary: `You are processing a TCC (The Current Chapter) session summary. Extract structured data and identify potential playbook updates.

Return a JSON object with this exact structure:${JSON_RULE}
{
  "sparks": [{ "content": "...", "collection_tag": "..." }],
  "stage_updates": [{ "product_name": "...", "new_stage": "...", "notes": "..." }],
  "research": [{ "topic": "...", "findings": "...", "collection": "..." }],
  "decisions": [{ "decision": "...", "rationale": "..." }],
  "playbook_updates": [{ "playbook_slug": "...", "section_key": "...", "proposed_change": "...", "reason": "..." }],
  "notes": ["..."]
}

playbook_slug options: product-research, design-standards, listing-photos, seo-standards, pinterest-standards, etsy-ads, ai-workflows
For playbook_updates, only include if the session contains a clear standard change or new approved practice.`,

  research_note: `You are processing a TCC (The Current Chapter) research note or video transcript. TCC sells print-on-demand apparel and gifts on Etsy, primarily in the Mom Chapter and Reader Chapter niches.

CRITICAL SCOPE RULE: If the input is raw keyword data (lists of keywords with volume, competition, or score numbers), return an empty playbook_updates array and empty sparks array. Keyword scores are raw market data — they cannot support operational mandates, percentage targets, photo quotas, or strategy changes on their own. Do NOT synthesize keyword data into recommendations. Only generate playbook_updates when the input contains explicit human decisions, proven results, or approved standards changes.

Extract key findings relevant to TCC product strategy, SEO, design, or market trends. Only flag playbook updates when the content contains a clear, explicit standard change — not when you are inferring one from data.

Return ONLY this JSON structure — no other text:
{
  "summary": "one sentence summary of what was analyzed",
  "key_findings": ["finding 1", "finding 2"],
  "playbook_updates": [{ "playbook_slug": "...", "section_key": "...", "proposed_change": "...", "reason": "..." }],
  "sparks": [{ "content": "product idea", "collection_tag": "collection name or empty string" }]
}

playbook_slug options: product-research, design-standards, listing-photos, seo-standards, pinterest-standards, etsy-ads, ai-workflows${JSON_RULE}`,

  generate_kittl_prompt: `You are a Kittl design prompt specialist for TCC (The Current Chapter), a print-on-demand Etsy shop focused on the Mom Chapter and Reader Chapter niches.

You will receive a structured TCC design concept. Generate a single Kittl AI prompt that a designer can paste directly into Kittl to create the design.

The prompt must:
- Be 2-4 sentences, specific and visual
- Lead with the text/typography direction if any (exact phrases to include, font mood)
- Describe the graphic elements, layout, and composition
- Name the color palette explicitly (hex codes if helpful, or descriptive names)
- Capture the mood and target customer without using abstract marketing language
- End with the product format (e.g. "for a t-shirt graphic, centered composition")

Return ONLY this JSON — no markdown, no explanation:
{
  "kittl_prompt": "string — the full prompt ready to paste into Kittl",
  "design_notes": "1-2 sentences of any considerations not captured in the prompt (optional — omit if nothing to add)"
}`,

  generate_mockup_prompt: `You are an AI product-photography prompt specialist for TCC (The Current Chapter), a print-on-demand Etsy shop focused on the Mom Chapter and Reader Chapter niches.

You will receive a structured TCC design concept. Generate a single prompt for an AI image tool (e.g. Midjourney, Google Imagen) that renders a realistic product mockup/lifestyle photo of this design on its product — NOT the design graphic itself, the finished physical product as it would be photographed for the Etsy listing's main image.

The prompt must:
- Name the exact product format (e.g. "unisex crewneck sweatshirt, heather sand color")
- Describe the staging: flatlay vs. on-model vs. styled scene, background, props, lighting
- Match the mood/aesthetic of the concept's visual style and color palette
- Avoid describing the design graphic in detail (that's the Kittl prompt's job) — focus on the photography context around it
- End with camera/composition direction (e.g. "shot from above, soft natural light, negative space top-left for text overlay")

Return ONLY this JSON — no markdown, no explanation:
{
  "body": "string — the full mockup/photography prompt ready to paste into an AI image tool",
  "notes": "1-2 sentences of any considerations not captured in the prompt (optional — omit if nothing to add)"
}`,

  generate_listing_draft: `You are an Etsy listing specialist for TCC (The Current Chapter), a print-on-demand shop focused on the Mom Chapter and Reader Chapter niches.

You will receive a structured TCC design concept. This is normally an EARLY-STAGE draft written before real keyword research has happened, meant as a starting reference point — do not invent keyword volumes or bucket structure.

IF the input includes a "REAL RESEARCHED KEYWORDS" section: those are actual keywords from TCC's research, not invented — pull suggested tags from that list (verbatim phrases) rather than guessing, and prefer them in the title too where they fit naturally. Still fine to add a few concept-derived phrases alongside them if the researched list is thin.

IF no such section is present: generate plausible tag phrases as before, clearly flagged as unresearched in the notes field.

Generate:
- A working title (under 140 characters) that reads naturally and names the product, style, and audience
- A short 2-3 sentence listing description in TCC's warm, specific, non-corporate brand voice
- 5-8 suggested tag phrases (lowercase, natural search-phrase style, not single words)

Return ONLY this JSON — no markdown, no explanation:
{
  "body": "string — formatted as: the title on the first line, a blank line, then the description",
  "tags": ["tag phrase 1", "tag phrase 2"],
  "notes": "if REAL RESEARCHED KEYWORDS were provided and used, say so plainly; otherwise, the existing reminder that this is a pre-keyword-research draft and should be re-optimized in Listing Builder once real keyword data exists"
}`,

  generate_pinterest_copy: `You are a Pinterest marketing specialist for TCC (The Current Chapter), a print-on-demand Etsy shop focused on the Mom Chapter and Reader Chapter niches. Pinterest drives Etsy traffic here, not standalone engagement.

You will receive a structured TCC design concept. Generate a Pinterest pin title and description built to surface in Pinterest search and pull click-throughs to the eventual Etsy listing.

The output must:
- Title: under 100 characters, keyword-forward, names the product and its appeal
- Description: 2-3 sentences, natural keyword-rich language (not a hashtag dump), ends with a soft call to action
- Suggest 1-2 Pinterest board categories/themes this pin would fit (e.g. "Gifts for Book Lovers", "Mom Life Humor")

Return ONLY this JSON — no markdown, no explanation:
{
  "body": "string — formatted as: the title on the first line, a blank line, then the description",
  "boards": ["board theme 1", "board theme 2"],
  "notes": "1-2 sentences of any considerations not captured above (optional — omit if nothing to add)"
}`,

  cowork_paste: `You are processing a Cowork output paste for TCC (The Current Chapter). Cowork handles trend sweeps, research automation, and workflow outputs.

Return ONLY this JSON — no other text:
{
  "type": "trend_update|research_results|workflow_output",
  "inbox_items": [{ "input_type": "...", "content": "...", "tags": ["..."], "collection_tag": "..." }],
  "experiments": [{ "hypothesis": "...", "metric": "...", "timeline_days": 14, "collection": "..." }],
  "playbook_updates": [{ "playbook_slug": "...", "section_key": "...", "proposed_change": "...", "reason": "..." }]
}${JSON_RULE}`,

  manual_note: `You are classifying and routing a manual note for TCC (The Current Chapter).

Return ONLY this JSON — no other text:
{
  "classification": "spark|decision|research|standard_update|observation",
  "collection_tag": "...",
  "playbook_updates": [{ "playbook_slug": "...", "section_key": "...", "proposed_change": "...", "reason": "..." }],
  "sparks": [{ "content": "...", "collection_tag": "..." }],
  "summary": "..."
}${JSON_RULE}`,
};

// Input size limits
const LIMITS = {
  imageBase64: 6_000_000,
  keywords: 20_000,
  currentTitle: 200,
  notes: 5_000,
  // Whole-request-body ceiling — must clear imageBase64 plus its JSON/text
  // overhead, or every image upload gets rejected here before the
  // type-specific (and more informative) imageBase64 check ever runs.
  body: 8_000_000,
  content: 50_000,
};

function safeError(err, label) {
  console.error(`[claude-process] ${label}:`, err);
  return { statusCode: 500, body: JSON.stringify({ error: 'Processing failed. Please try again.' }) };
}

// Claude is told to return raw JSON, but on longer generations it
// occasionally leaves a trailing comma before a closing } or ] — strip
// those defensively rather than letting one stray comma fail the parse.
function stripTrailingCommas(jsonText) {
  return jsonText.replace(/,(\s*[}\]])/g, '$1');
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // Auth check — only enforced when FUNCTION_SECRET is set in Netlify env vars
  if (process.env.FUNCTION_SECRET) {
    if (event.headers['x-function-secret'] !== process.env.FUNCTION_SECRET) {
      return { statusCode: 403, body: JSON.stringify({ error: 'Unauthorized' }) };
    }
  }

  if (!process.env.CLAUDE_API_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'API key not configured' }) };
  }

  // Body size guard
  if ((event.body?.length || 0) > LIMITS.body) {
    return { statusCode: 413, body: JSON.stringify({ error: 'Request too large' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { type, payload } = body;

  // ── Vision: extract keyword table from Everbee screenshot ──
  if (type === 'extract_keywords_image') {
    const { imageBase64, mediaType } = payload || {};
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
          max_tokens: 2000,
          messages: [{
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: mediaType || 'image/png', data: imageBase64 },
              },
              {
                type: 'text',
                text: 'Extract the keyword data table from this Everbee screenshot. Return ONLY a JSON array — no other text, no markdown. Each object must have: {"keyword": string, "volume": number or null, "competition": number or null, "score": number or null}. Strip commas from numbers (e.g. "1,234" → 1234). Skip the header row. If a value is unclear return null. Example output: [{"keyword":"mom life svg","volume":4368,"competition":5,"score":873750}]',
              },
            ],
          }],
        }),
      });
      const data = await response.json();
      const text = data.content?.[0]?.text || '[]';
      const match = text.match(/\[[\s\S]*\]/);
      const keywords = match ? JSON.parse(stripTrailingCommas(match[0])) : [];
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keywords }),
      };
    } catch (err) {
      return safeError(err, 'extract_keywords_image');
    }
  }

  // ── Vision: analyze design mockup ──
  if (type === 'analyze_design_image') {
    const { imageBase64, mediaType } = payload || {};
    if (!imageBase64) return { statusCode: 400, body: JSON.stringify({ error: 'No image data' }) };
    if (imageBase64.length > LIMITS.imageBase64) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Image too large (max 6MB)' }) };
    }
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.CLAUDE_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 500,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType || 'image/png', data: imageBase64 } },
              { type: 'text', text: 'Analyze this Printify product mockup for an Etsy listing. In 3-4 sentences describe: product type, primary colors and palette, visual style (minimalist, illustrated, typographic, etc.), any visible text or graphics, and the mood or customer it appeals to. Be specific and visual — this will be used to write listing copy.' },
            ],
          }],
        }),
      });
      if (!response.ok) {
        const errText = await response.text();
        console.error('[claude-process] analyze_design_image upstream error:', response.status, errText);
        return { statusCode: 502, body: JSON.stringify({ error: 'Image analysis failed upstream. Please try again.' }) };
      }
      const data = await response.json();
      const analysis = data.content?.[0]?.text || '';
      if (!analysis) {
        console.error('[claude-process] analyze_design_image empty response:', JSON.stringify(data));
        return { statusCode: 502, body: JSON.stringify({ error: 'Image analysis returned no result. Please try again.' }) };
      }
      return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ analysis }) };
    } catch (err) {
      return safeError(err, 'analyze_design_image');
    }
  }

  // ── generate_listing removed (Listing Intelligence Milestone A) ──
  // Replaced by netlify/functions/generate-listing-v2.js — a separate file,
  // real forced tool-use, Sonnet — not a case here. The old prompt baked
  // the rigid B1/B2/B3 bucket rules in verbatim (bucket-ordering, 130-140
  // char padding target, verbatim-only keywords) with no format-vs-keyword
  // check at all; that's the literal mechanism that once assigned "hockey
  // mom sweatshirt" to a T-shirt listing. See generate-listing-v2.js's own
  // header comment for the replacement design.

  // ── New Keyword Evidence — compare against current listing strategy ──
  // Replaces the old "patch_listing_keywords" (rewrite title/tags
  // immediately when new keywords appear). That encouraged folding new
  // research straight into a live listing outside any review cadence; this
  // returns a RECOMMENDATION only ("no_change" / "consider_at_next_review"
  // / "notable_shift") and never proposes a rewritten title/tags at all —
  // if the shop owner decides new evidence genuinely changes the strategy,
  // that's a real regeneration through generate-listing-v2.js, not a quiet
  // patch. Uses real forced tool-use, matching generate-listing-v2.js and
  // analyze-visual.js rather than this file's older regex-scrape pattern.
  if (type === 'evaluate_keyword_evidence') {
    const { currentPrimaryIntent, currentPrimaryIntentStatus, newKeywords } = payload || {};
    if (!currentPrimaryIntent) return { statusCode: 400, body: JSON.stringify({ error: 'No current Primary Search Intent provided' }) };
    if (typeof currentPrimaryIntent !== 'string' || currentPrimaryIntent.length > LIMITS.currentTitle) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Primary Search Intent too long' }) };
    }
    const kwList = (newKeywords || []).map(k =>
      `  - "${k.keyword}"${k.volume != null ? ` (vol ${k.volume}` : ''}${k.competition != null ? `, comp ${k.competition}` : ''}${k.volume != null ? ')' : ''}`
    ).join('\n') || '  (none provided)';
    const evaluateTool = {
      name: 'evaluate_evidence',
      description: 'Compare newly found keyword evidence against the listing\'s current Primary Search Intent and recommend whether it changes anything.',
      input_schema: {
        type: 'object',
        properties: {
          recommendation: { type: 'string', enum: ['no_change', 'consider_at_next_review', 'notable_shift'] },
          reasoning: { type: 'string' },
          notable_keywords: {
            type: 'array',
            items: {
              type: 'object',
              properties: { keyword: { type: 'string' }, note: { type: 'string' } },
              required: ['keyword', 'note'],
            },
          },
        },
        required: ['recommendation', 'reasoning'],
      },
    };
    const prompt = `A listing's current Primary Search Intent is "${currentPrimaryIntent}" (status: ${currentPrimaryIntentStatus || 'unknown'}).

NEW KEYWORD EVIDENCE FOUND:
${kwList}

Compare this new evidence against the current Primary Search Intent. Do NOT propose a new title or tags — this is an evidence review, not a rewrite. Recommend one of:
- "no_change": the current intent is still clearly the right choice.
- "consider_at_next_review": the new evidence is interesting but not urgent — worth a look at the next scheduled SEO review, not an immediate edit.
- "notable_shift": the new evidence meaningfully outperforms or better matches the product than the current intent, and the shop owner should consider a real regeneration soon.

Only use "notable_shift" for a genuinely material difference — new evidence being merely present is not itself a reason to recommend a change.`;
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.CLAUDE_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 800,
          system: 'You are an Etsy SEO specialist reviewing new keyword evidence against an existing listing strategy for TCC (The Current Chapter). Call evaluate_evidence with your recommendation.',
          tools: [evaluateTool],
          tool_choice: { type: 'tool', name: 'evaluate_evidence' },
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      if (!response.ok) {
        const errText = await response.text();
        console.error('[claude-process] evaluate_keyword_evidence upstream error:', response.status, errText);
        return { statusCode: 502, body: JSON.stringify({ error: 'Evidence review failed upstream. Please try again.' }) };
      }
      const data = await response.json();
      const toolUse = (data.content || []).find(block => block.type === 'tool_use' && block.name === 'evaluate_evidence');
      if (!toolUse) {
        console.error('[claude-process] evaluate_keyword_evidence: no tool_use block:', JSON.stringify(data));
        return { statusCode: 502, body: JSON.stringify({ error: 'Evidence review did not return structured data. Please try again.' }) };
      }
      return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ parsed: toolUse.input }) };
    } catch (err) {
      return safeError(err, 'evaluate_keyword_evidence');
    }
  }

  // ── Cluster keywords into themed groups ──
  if (type === 'cluster_keywords') {
    const { keywords } = payload || {};
    if (!keywords) return { statusCode: 400, body: JSON.stringify({ error: 'No keywords provided' }) };
    if (typeof keywords !== 'string' || keywords.length > LIMITS.keywords) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Keywords payload too large (max 20,000 chars)' }) };
    }
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.CLAUDE_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 8000,
          system: `You are a keyword research analyst for an Etsy print-on-demand shop. Group the provided keywords into themed clusters that represent distinct product or niche opportunities. Each group should have 2-8 keywords that share a clear theme. Return ONLY valid JSON — no markdown, no explanation.\n\nFormat:\n{"groups":[{"name":"Group Name","theme":"1-sentence rationale","keywords":["keyword1","keyword2"]}]}`,
          messages: [{ role: 'user', content: `Group these keywords into themed clusters:\n\n${keywords}` }],
        }),
      });
      const data = await response.json();
      const text = data.content?.[0]?.text || '';
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) return { statusCode: 200, body: JSON.stringify({ raw: text, parsed: null, error: 'No JSON found in response' }) };
      try {
        const parsed = JSON.parse(match[0]);
        return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ parsed }) };
      } catch (parseErr) {
        console.error('[claude-process] cluster_keywords JSON parse failed:', parseErr);
        return { statusCode: 200, body: JSON.stringify({ raw: text, parsed: null, error: 'JSON parse failed' }) };
      }
    } catch (err) {
      return safeError(err, 'cluster_keywords');
    }
  }

  // ── Text-based processing ──
  const systemPrompt = SYSTEM_PROMPTS[type];
  if (!systemPrompt) {
    return { statusCode: 400, body: JSON.stringify({ error: `Unknown type: ${type}` }) };
  }

  const content = typeof payload === 'string' ? payload : JSON.stringify(payload);
  if (content.length > LIMITS.content) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Content too large (max 50,000 chars)' }) };
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
        max_tokens: 2048,
        system: systemPrompt,
        messages: [{ role: 'user', content }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[claude-process] ${type} upstream error:`, response.status, errText);
      return { statusCode: 502, body: JSON.stringify({ error: 'Generation failed upstream. Please try again.' }) };
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { statusCode: 200, body: JSON.stringify({ raw: text, parsed: null }) };
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parsed, raw: text }),
    };
  } catch (err) {
    return safeError(err, type);
  }
};
