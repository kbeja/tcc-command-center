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

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
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

  const { type, payload } = body;

  // ── Vision: extract keyword table from Everbee screenshot ──
  if (type === 'extract_keywords_image') {
    const { imageBase64, mediaType } = payload || {};
    if (!imageBase64) {
      return { statusCode: 400, body: JSON.stringify({ error: 'No image data' }) };
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
      const keywords = match ? JSON.parse(match[0]) : [];
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keywords }),
      };
    } catch (err) {
      return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
    }
  }

  // ── Vision: analyze design mockup ──
  if (type === 'analyze_design_image') {
    const { imageBase64, mediaType } = payload || {};
    if (!imageBase64) return { statusCode: 400, body: JSON.stringify({ error: 'No image data' }) };
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
      const data = await response.json();
      return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ analysis: data.content?.[0]?.text || '' }) };
    } catch (err) {
      return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
    }
  }

  // ── Generate complete Etsy listing ──
  if (type === 'generate_listing') {
    const { imageBase64, mediaType, context } = payload || {};
    if (!context) return { statusCode: 400, body: JSON.stringify({ error: 'No context provided' }) };
    try {
      const userContent = [
        ...(imageBase64 ? [{ type: 'image', source: { type: 'base64', media_type: mediaType || 'image/png', data: imageBase64 } }] : []),
        { type: 'text', text: context },
      ];
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.CLAUDE_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 3000,
          system: 'You are an Etsy listing specialist for TCC (The Current Chapter), a print-on-demand shop. Generate complete, optimized Etsy listings following TCC\'s exact standards. CRITICAL: Return ONLY valid JSON — no markdown fences, no explanation, no text before or after the JSON object.',
          messages: [{ role: 'user', content: userContent }],
        }),
      });
      const data = await response.json();
      const text = data.content?.[0]?.text || '';
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) return { statusCode: 200, body: JSON.stringify({ raw: text, parsed: null }) };
      const parsed = JSON.parse(match[0]);
      return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ parsed }) };
    } catch (err) {
      return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
    }
  }

  // ── Text-based processing ──
  const systemPrompt = SYSTEM_PROMPTS[type];
  if (!systemPrompt) {
    return { statusCode: 400, body: JSON.stringify({ error: `Unknown type: ${type}` }) };
  }

  const content = typeof payload === 'string' ? payload : JSON.stringify(payload);

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
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
