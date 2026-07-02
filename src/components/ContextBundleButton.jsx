import { useState } from 'react';
import { collectionKnowledge } from '../data/collections';

export default function ContextBundleButton({ product, recentResearch }) {
  const [copied, setCopied] = useState(null);

  function buildBundle(variant) {
    const collection = collectionKnowledge[product.collection] || {};
    const keywords = collection.keywords?.topKeywords?.slice(0, 20).join('\n') || 'See keyword bank';
    const research = recentResearch?.length
      ? recentResearch.slice(0, 3).map(s =>
          `${s.date} · ${s.source}${s.keywords?.length ? '\nKeywords: ' + s.keywords.map(k => k.keyword).join(', ') : ''}${s.notes ? '\nNotes: ' + s.notes : ''}`
        ).join('\n\n')
      : 'No recent research sessions.';

    const bundle = `--- TCC CONTEXT BUNDLE ---
Product: ${product.name}
Collection: ${product.collection}
Stage: ${product.stage}
Confidence: ${product.confidence || 'Not set'}
Ecosystem: ${product.ecosystem_primary || '—'}
Emotional trigger: ${product.emotional_trigger || '—'}

RELEVANT KEYWORDS
${keywords}

COLLECTION STYLE GUIDE
${collection.styleGuide || 'See TCC OS style guides.'}

LISTING PROMPTS
${collection.prompts || 'See TCC OS prompt library.'}

PRODUCT NOTES
${product.notes || 'None.'}

RECENT RESEARCH
${research}
--- END CONTEXT ---`;

    navigator.clipboard.writeText(bundle);
    setCopied(variant);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      <button className="btn btn-ghost btn-sm" onClick={() => buildBundle('claude')}>
        📋 Copy Context for Claude
      </button>
      <button className="btn btn-ghost btn-sm" onClick={() => buildBundle('chatgpt')}>
        📋 Copy Context for ChatGPT
      </button>
      {copied && <span className="inline-confirm">Copied to clipboard ✓</span>}
    </div>
  );
}
