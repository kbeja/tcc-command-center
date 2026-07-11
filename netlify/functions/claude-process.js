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

Extract key findings relevant to TCC product strategy, SEO, design, or market trends. Identify if anything updates existing TCC standards.

Return ONLY this JSON structure — no other text:
{
  "summary": "one sentence summary of what was analyzed",
  "key_findings": ["finding 1", "finding 2"],
  "playbook_updates": [{ "playbook_slug": "...", "section_key": "...", "proposed_change": "...", "reason": "..." }],
  "sparks": [{ "content": "product idea", "collection_tag": "collection name or empty string" }]
}

playbook_slug options: product-research, design-standards, listing-photos, seo-standards, pinterest-standards, etsy-ads, ai-workflows
If no transcript was available, set summary to "No transcript available" and return empty arrays.${JSON_RULE}`,

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

// ─── YouTube transcript fetcher ───────────────────────────────────────────────

function extractVideoId(url) {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

async function fetchYouTubeTranscript(videoId) {
  try {
    const res = await fetch(
      `${process.env.URL || 'https://tcc-command-center.netlify.app'}/.netlify/functions/youtube-transcript?videoId=${videoId}`
    );
    if (!res.ok) return { transcript: null };
    const text = await res.text();
    if (text.startsWith('No transcript')) return { transcript: null };
    return { transcript: text.slice(0, 8000) };
  } catch {
    return { transcript: null };
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

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
  const systemPrompt = SYSTEM_PROMPTS[type];
  if (!systemPrompt) {
    return { statusCode: 400, body: JSON.stringify({ error: `Unknown type: ${type}` }) };
  }

  // Resolve content — detect YouTube URLs and fetch transcript
  let content = typeof payload === 'string' ? payload : JSON.stringify(payload);
  let youtubeContext = '';

  const youtubeUrlMatch = content.match(/https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\/\S+/);
  if (youtubeUrlMatch) {
    const videoId = extractVideoId(youtubeUrlMatch[0]);
    if (videoId) {
      try {
        const { title, author, description, transcript } = await fetchYouTubeTranscript(videoId);
        youtubeContext = `\n\nYOUTUBE VIDEO: "${title}" by ${author}\nDESCRIPTION: ${description}`;
        if (transcript) {
          youtubeContext += `\n\nTRANSCRIPT:\n${transcript.slice(0, 8000)}`;
        } else {
          youtubeContext += '\n\n(No transcript available for this video)';
        }
        content = content.replace(youtubeUrlMatch[0], '').trim() + youtubeContext;
      } catch (err) {
        content += `\n\n(Could not fetch YouTube transcript: ${err.message})`;
      }
    }
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
    console.error('Claude API error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
