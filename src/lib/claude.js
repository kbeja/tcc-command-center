export async function processWithClaude(type, payload) {
  const res = await fetch('/.netlify/functions/claude-process', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, payload }),
  });
  if (!res.ok) throw new Error(`Claude function error: ${res.status}`);
  return res.json();
}
