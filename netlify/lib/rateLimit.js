// Shared per-IP rate limiter for the Claude-calling / external-fetch
// functions (SEC-003). Sibling to netlify/functions/ (not inside it) so
// Netlify's function-discovery scan can't mistake this for an endpoint --
// same cross-directory require()-of-an-ESM-file pattern netlify/functions/
// already proves works for src/lib/listingReviews.js/productTruth.js, one
// directory-level shallower. Written as a genuine ES module (export, not
// module.exports) -- a CommonJS file under this repo's root "type": "module"
// package.json gets silently mis-bundled by esbuild (confirmed live: a
// module.exports version here broke every function's handler resolution
// entirely, "lambdaFunc[lambdaHandler] is not a function"). The functions'
// own require('../lib/rateLimit.js') calls stay CommonJS -- that half of
// the interop (CJS requiring an ESM file) is the half already proven to
// work, by src/lib/listingReviews.js/productTruth.js being require()'d
// into claude-process.js/generate-listing-v2.js today.
//
// Fixed 60s window, Netlify Blobs-backed counter. Fails open: a Blobs error
// logs and lets the request through rather than blocking everything -- for
// a single real user, availability should win over strict enforcement here.
// FUNCTION_SECRET is the primary defense; this is a secondary cost cap, not
// a distributed-systems-grade limiter (read-then-write, not atomic -- a
// burst of truly concurrent requests can let a couple extra through right
// at the threshold, and up to ~2x the limit can pass across a window
// boundary -- both explicitly acceptable for this use case).

import { getStore } from '@netlify/blobs';

const WINDOW_MS = 60_000;
const DEFAULT_LIMIT = 30;

function getClientIp(event) {
  const headers = event.headers || {};
  if (headers['x-nf-client-connection-ip']) return headers['x-nf-client-connection-ip'];
  const fwd = headers['x-forwarded-for'];
  if (fwd) return fwd.split(',')[0].trim();
  return 'unknown';
}

export async function checkRateLimit(event, functionName, limit = DEFAULT_LIMIT) {
  try {
    const ip = getClientIp(event);
    const windowStart = Math.floor(Date.now() / WINDOW_MS);
    const key = `${functionName}:${ip}:${windowStart}`;
    const store = getStore('rate-limits');
    const current = (await store.get(key, { type: 'json' })) || 0;
    if (current >= limit) {
      const retryAfterSeconds = Math.ceil((WINDOW_MS - (Date.now() % WINDOW_MS)) / 1000);
      return { allowed: false, retryAfterSeconds };
    }
    await store.setJSON(key, current + 1);
    return { allowed: true };
  } catch (err) {
    console.error(`[rateLimit] ${functionName} check failed, allowing request:`, err);
    return { allowed: true };
  }
}
