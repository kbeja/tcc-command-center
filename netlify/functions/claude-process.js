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

// Input size limits
const LIMITS = {
  imageBase64: 6_000_000,
  keywords: 20_000,
  currentTitle: 200,
  notes: 5_000,
  body: 500_000,
  content: 50_000,
};

function safeError(err, label) {
  console.error(`[claude-process] ${label}:`, err);
  return { statusCode: 500, body: JSON.stringify({ error: 'Processing failed. Please try again.' }) };
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
      const keywords = match ? JSON.parse(match[0]) : [];
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
      const data = await response.json();
      return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ analysis: data.content?.[0]?.text || '' }) };
    } catch (err) {
      return safeError(err, 'analyze_design_image');
    }
  }

  // ── Generate complete Etsy listing ──
  if (type === 'generate_listing') {
    const { imageBase64, mediaType, context } = payload || {};
    if (!context) return { statusCode: 400, body: JSON.stringify({ error: 'No context provided' }) };
    if (typeof context !== 'string' || context.length > LIMITS.content) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Context too large' }) };
    }
    if (imageBase64 && imageBase64.length > LIMITS.imageBase64) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Image too large (max 6MB)' }) };
    }
    try {
      const userContent = [
        ...(imageBase64 ? [{ type: 'image', source: { type: 'base64', media_type: mediaType || 'image/png', data: imageBase64 } }] : []),
        { type: 'text', text: context },
      ];
      // Use streaming to avoid inactivity timeout on long generations
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.CLAUDE_API_KEY,
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'messages-2023-12-15',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 3000,
          stream: true,
          system: 'You are an Etsy listing specialist for TCC (The Current Chapter), a print-on-demand shop. Generate complete, optimized Etsy listings following TCC SEO Standards v2: 3-bucket keyword framework (Bucket 1 = Visibility/unicorn, Bucket 2 = Reach/supporting, Bucket 3 = Scalability/broad+seasonal+buyer-intent), comma-separated title format ([B1] , [B2] , [B3]), tag rule: B1 AND B2 phrases repeat exactly in tags, B3 uses adjacent phrasing only. CRITICAL: Return ONLY valid JSON — no markdown fences, no explanation, no text before or after the JSON object.',
          messages: [{ role: 'user', content: userContent }],
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error('[claude-process] generate_listing upstream error:', response.status, errText);
        return { statusCode: 502, body: JSON.stringify({ error: 'Listing generation failed. Please try again.' }) };
      }

      // Collect the full streamed text
      let fullText = '';
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;
          try {
            const evt = JSON.parse(data);
            if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
              fullText += evt.delta.text;
            }
          } catch { /* skip malformed lines */ }
        }
      }

      const match = fullText.match(/\{[\s\S]*\}/);
      if (!match) return { statusCode: 200, body: JSON.stringify({ raw: fullText, parsed: null }) };
      const parsed = JSON.parse(match[0]);
      return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ parsed }) };
    } catch (err) {
      return safeError(err, 'generate_listing');
    }
  }

  // ── Patch title & tags with new keyword research ──
  if (type === 'patch_listing_keywords') {
    const { currentTitle, currentTags, newKeywords, researchFlags } = payload || {};
    if (!currentTitle || !currentTags) return { statusCode: 400, body: JSON.stringify({ error: 'Missing listing data' }) };
    if (typeof currentTitle !== 'string' || currentTitle.length > LIMITS.currentTitle) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Title too long' }) };
    }
    if (!Array.isArray(currentTags) || currentTags.some(t => typeof t !== 'string' || t.length > 25)) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid tags' }) };
    }
    const kwList = (newKeywords || []).map(k =>
      `  "${k.keyword}"${k.score ? ` (score: ${k.score}` : ''}${k.competition != null ? `, comp: ${k.competition}` : ''}${k.score ? ')' : ''}`
    ).join('\n') || '  [none provided]';
    const prompt = `Update an Etsy listing's title and tags with newly discovered keywords, following TCC SEO Standards v2.

TITLE FORMAT — 3-BUCKET COMMA STRUCTURE:
[Bucket 1 Visibility] , [Bucket 2 Reach] , [Bucket 3 Scalability]
- Comma ( , ) marks every bucket boundary — NOT pipes, NOT dashes
- Bucket 1 = high volume, low competition (unicorn — the rarest, most valuable)
- Bucket 3 includes seasonal and buyer-intent language ("gift for her", "birthday gift")
- Title Case Throughout Every Word, max 140 characters
- TAG RULE: B1 and B2 phrases repeat exactly in tags; B3 uses adjacent phrasing only
- BALANCE: all three buckets must have representation in both title and tags

CURRENT TITLE:
${currentTitle}

CURRENT TAGS (13):
${(currentTags || []).map((t, i) => `  ${i + 1}. "${t}"`).join('\n')}

NEW KEYWORDS FOUND:
${kwList}

${researchFlags?.length ? `CONTEXT (what prompted this research):\n${researchFlags.map(f => `  - ${f}`).join('\n')}` : ''}

Only make changes if a new keyword clearly improves the title or replaces a weaker tag. Keep changes minimal and intentional. If nothing is an improvement, return the current values unchanged.

Return ONLY this JSON:
{
  "title": "string",
  "tags": ["string", "string", "string", "string", "string", "string", "string", "string", "string", "string", "string", "string", "string"],
  "changes": "1-2 sentences: what changed and why, or 'No changes — existing keywords are already optimal'"
}`;
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.CLAUDE_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 800,
          system: 'You are an Etsy SEO specialist. Update listings with new keyword data. Return ONLY valid JSON — no markdown, no explanation.',
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      const data = await response.json();
      const text = data.content?.[0]?.text || '';
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) return { statusCode: 200, body: JSON.stringify({ raw: text, parsed: null }) };
      const parsed = JSON.parse(match[0]);
      return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ parsed }) };
    } catch (err) {
      return safeError(err, 'patch_listing_keywords');
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
