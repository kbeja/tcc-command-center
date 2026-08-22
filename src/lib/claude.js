export async function processWithClaude(type, payload) {
  const res = await fetch('/.netlify/functions/claude-process', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-function-secret': import.meta.env.VITE_FUNCTION_SECRET },
    body: JSON.stringify({ type, payload }),
  });
  if (!res.ok) throw new Error(`Claude function error: ${res.status}`);
  return res.json();
}

// Separate function/file from claude-process.js (analyze-visual.js) — see
// its own header comment for why. Returns { ok, data } instead of throwing
// so callers (analyzeListing() in hooks.js) can record a graceful 'failed'
// visual_profiles row instead of an uncaught exception.
export async function analyzeVisual(imageBase64, mediaType) {
  const res = await fetch('/.netlify/functions/analyze-visual', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-function-secret': import.meta.env.VITE_FUNCTION_SECRET },
    body: JSON.stringify({ imageBase64, mediaType }),
  });
  const data = await res.json();
  if (!res.ok) return { ok: false, error: data?.error || `Analysis failed (${res.status})` };
  return { ok: true, data };
}

// Etsy Marketplace Insights screenshot -> suggested rows (§16). Returns
// { ok, data } like analyzeVisual rather than throwing, so a failed extraction
// degrades to "type it in yourself" instead of losing the form.
//
// The result is ALWAYS a suggestion. It pre-fills the capture form and nothing
// reaches the database until a human saves — §16's sequence is Screenshot ->
// extraction suggestion -> human review -> approved records, and §29 rules out
// OCR that writes without review.
export async function extractEtsyInsights(imageBase64, mediaType) {
  const res = await fetch('/.netlify/functions/extract-etsy-insights', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-function-secret': import.meta.env.VITE_FUNCTION_SECRET },
    body: JSON.stringify({ imageBase64, mediaType }),
  });
  const data = await res.json();
  if (!res.ok) return { ok: false, error: data?.error || `Extraction failed (${res.status})` };
  return { ok: true, data };
}
