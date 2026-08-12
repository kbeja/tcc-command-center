import { today } from '../data/seasons';

// Shared by every "Copy Context for AI" bundle (Product, Collection,
// Concept) — kept here rather than in any one page since it's used by three
// unrelated peer files, not a natural parent/child pair.

const EXPORT_PURPOSE = 'Continue research, concept development, design development, or analysis in AI chat.';

export function buildContextHeader(contextType, identityLines) {
  return ['TCC AI CONTEXT', `Context Type: ${contextType}`, ...identityLines, `Exported: ${today()}`, `Purpose: ${EXPORT_PURPOSE}`].join('\n');
}

// "Label: value", or '' when value is falsy — omits blank lines instead of
// printing "Label: " with nothing after it.
export function field(label, value) {
  return value ? `${label}: ${value}` : '';
}

// "HEADING\n<body>", or '' (heading included) when body is empty — so an
// empty section never leaves a dangling heading in the exported text.
export function section(heading, body) {
  return body && String(body).trim() ? `${heading}\n${body}` : '';
}
