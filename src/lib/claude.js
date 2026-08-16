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
