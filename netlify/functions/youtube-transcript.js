const { YoutubeTranscript } = require('youtube-transcript');
const { checkRateLimit } = require('../lib/rateLimit.js');

async function handleRequest(event) {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  if (process.env.FUNCTION_SECRET) {
    if (event.headers['x-function-secret'] !== process.env.FUNCTION_SECRET) {
      return { statusCode: 403, body: JSON.stringify({ error: 'Unauthorized' }) };
    }
  }

  const rl = await checkRateLimit(event, 'youtube-transcript');
  if (!rl.allowed) {
    return {
      statusCode: 429,
      headers: rl.retryAfterSeconds ? { 'Retry-After': String(rl.retryAfterSeconds) } : undefined,
      body: JSON.stringify({ error: 'Too many requests. Please wait a moment and try again.' }),
    };
  }

  const { videoId } = event.queryStringParameters || {};
  if (!videoId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing videoId parameter' }) };
  }

  // YouTube video IDs are always exactly 11 chars: letters, digits, - and _
  if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid videoId format' }) };
  }

  try {
    const transcript = await YoutubeTranscript.fetchTranscript(videoId, { lang: 'en' });
    const text = transcript.map(t => t.text).join(' ').replace(/\s+/g, ' ').trim();
    if (!text) {
      return { statusCode: 404, body: 'No transcript available for this video.' };
    }
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/plain' },
      body: text,
    };
  } catch {
    return { statusCode: 404, body: 'No transcript available for this video.' };
  }
}

// SEC-004 — see claude-process.js's identical wrapper comment for the full
// reasoning; same pattern applied here.
const ORIGIN = process.env.URL || '';

exports.handler = async (event) => {
  const result = await handleRequest(event);
  return { ...result, headers: { ...(result.headers || {}), 'Access-Control-Allow-Origin': ORIGIN } };
};
