// Fetches an external image URL server-side and returns it as base64 so the
// client can upload it to Supabase storage. Exists because browser fetch()
// hits CORS on most image hosts (Pinterest included) — the browser can't read
// the bytes of a cross-origin image response without permissive CORS headers,
// but a server-side fetch has no such restriction.

const { checkRateLimit } = require('../lib/rateLimit.js');

const MAX_BYTES = 6_000_000; // matches claude-process.js LIMITS.imageBase64
const TIMEOUT_MS = 10_000;

// Basic SSRF hygiene for a single-user internal tool — not exhaustive
// DNS-rebinding protection, just blocking the obvious local/metadata targets.
const BLOCKED_HOSTNAME_RE = /^(localhost|127\.|0\.0\.0\.0|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|\[?::1\]?)/i;

function isBlockedUrl(url) {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return true;
  return BLOCKED_HOSTNAME_RE.test(url.hostname);
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

  const rl = await checkRateLimit(event, 'fetch-image');
  if (!rl.allowed) {
    return {
      statusCode: 429,
      headers: rl.retryAfterSeconds ? { 'Retry-After': String(rl.retryAfterSeconds) } : undefined,
      body: JSON.stringify({ error: 'Too many requests. Please wait a moment and try again.' }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { url: rawUrl } = body || {};
  if (!rawUrl) {
    return { statusCode: 400, body: JSON.stringify({ error: 'No URL provided' }) };
  }

  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid URL' }) };
  }

  if (isBlockedUrl(url)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'That URL is not allowed' }) };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url.toString(), {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TCC-CommandCenter/1.0)' },
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return { statusCode: 502, body: JSON.stringify({ error: `Fetch failed (${response.status})` }) };
    }

    const mediaType = response.headers.get('content-type') || '';
    if (!mediaType.startsWith('image/')) {
      return { statusCode: 400, body: JSON.stringify({ error: 'That URL is not an image' }) };
    }

    const contentLength = Number(response.headers.get('content-length') || 0);
    if (contentLength > MAX_BYTES) {
      return { statusCode: 413, body: JSON.stringify({ error: 'Image too large (max 6MB)' }) };
    }

    const buf = Buffer.from(await response.arrayBuffer());
    if (buf.length > MAX_BYTES) {
      return { statusCode: 413, body: JSON.stringify({ error: 'Image too large (max 6MB)' }) };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base64: buf.toString('base64'), mediaType }),
    };
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      return { statusCode: 504, body: JSON.stringify({ error: 'Fetch timed out' }) };
    }
    console.error('[fetch-image] error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Fetch failed. Please try again.' }) };
  }
}

// SEC-004 — see claude-process.js's identical wrapper comment for the full
// reasoning; same pattern applied here.
const ORIGIN = process.env.URL || '';

exports.handler = async (event) => {
  const result = await handleRequest(event);
  return { ...result, headers: { ...(result.headers || {}), 'Access-Control-Allow-Origin': ORIGIN } };
};
