import { useState } from 'react';
import { createSpark, createWorkshopItem, updateProduct, createResearchSession } from '../lib/hooks';
import { supabase } from '../lib/supabase';

function autoColor(score, competition) {
  const s = parseFloat(score) || 0;
  const c = parseFloat(competition) || 0;
  if (s >= 1000 && c <= 500) return 'use';
  if (s === 0 || c >= 50000) return 'discard';
  return 'watch';
}

// Strip markdown bold/italic and leading bullets from a line
function cleanLine(line) {
  return line
    .replace(/\*\*/g, '')   // remove **bold**
    .replace(/^[\*\-]\s+/, '') // remove leading * or - bullet
    .trim();
}

function parseSummary(text, products) {
  const result = {
    sparks: [],
    stageUpdates: [],
    research: [],
    decisions: [],
    notes: [],
    unparseable: [],
  };

  // Normalize: strip ** from section headers so regex can find them
  const normalized = text.replace(/\*\*([A-Z][A-Z\s\(\)]+)\*\*/g, '$1');

  // Extract section blocks — handles both "- bullet" and "* bullet" lines
  function extractBlock(label) {
    const re = new RegExp(
      `${label}[^\\n]*\\n([\\s\\S]*?)(?=\\n\\s*[A-Z][A-Z \\(\\)]*\\s*\\n|--- END|$)`
    );
    return normalized.match(re)?.[1]?.trim() || '';
  }

  const bulletLines = (block) =>
    block.split('\n')
      .map(cleanLine)
      .filter(Boolean)
      // skip lines that look like sub-keys in a research block
      .filter(l => !/^(Collection|Niche|Source|Keywords?):/i.test(l));

  // SPARKS
  const sparksBlock = extractBlock('SPARKS');
  for (const line of bulletLines(sparksBlock)) {
    result.sparks.push(line);
  }

  // STAGE UPDATES
  const stageBlock = extractBlock('STAGE UPDATES');
  for (const rawLine of stageBlock.split('\n').map(cleanLine).filter(Boolean)) {
    const m = rawLine.match(/(.+?)\s*[→>]\s*(.+)/);
    if (m) {
      const productName = m[1].trim();
      const stage = m[2].trim();
      const match = products?.find(p =>
        p.name.toLowerCase().includes(productName.toLowerCase())
      );
      result.stageUpdates.push({ raw: rawLine, productName, stage, productId: match?.id || null, matched: !!match });
    } else {
      result.unparseable.push({ section: 'STAGE UPDATES', line: rawLine });
    }
  }

  // RESEARCH — each item starts with "Collection:"
  const researchBlock = extractBlock('RESEARCH');
  const researchItems = researchBlock.split(/\n(?=[\*\-]?\s*Collection:)/i).filter(Boolean);
  for (const item of researchItems) {
    const colMatch = item.match(/Collection:\s*(.+)/i);
    const nicheMatch = item.match(/Niche:\s*(.+)/i);
    const sourceMatch = item.match(/Source:\s*(.+)/i);
    const kwLine = item.split('\n').find(l => /Keywords?:/i.test(l)) || '';
    const kwPart = kwLine.replace(/Keywords?:\s*/i, '').trim();

    if (!colMatch) {
      result.unparseable.push({ section: 'RESEARCH', line: item.trim().slice(0, 80) });
      continue;
    }

    const keywords = [];
    // Skip N/A or empty
    if (kwPart && kwPart.toLowerCase() !== 'n/a') {
      for (const entry of kwPart.split(',')) {
        const parts = entry.split('|').map(p => p.trim());
        if (parts[0]) {
          keywords.push({
            keyword: parts[0],
            volume: parts[1] ? parseInt(parts[1]) : null,
            competition: parts[2] ? parseInt(parts[2]) : null,
            score: parts[3] ? parseInt(parts[3]) : null,
            tag_type: autoColor(parts[3], parts[2]),
          });
        }
      }
    }

    result.research.push({
      collection: colMatch[1].trim(),
      niche: nicheMatch?.[1]?.trim() || null,
      source: sourceMatch?.[1]?.trim() || 'Other',
    keywords,
    });
  }

  // DECISIONS — go to Triage
  const decisionsBlock = extractBlock('DECISIONS');
  for (const line of bulletLines(decisionsBlock)) {
    result.decisions.push(line);
  }

  // NOTES — captured but NOT sent to Triage
  const notesBlock = extractBlock('NOTES');
  for (const line of bulletLines(notesBlock)) {
    result.notes.push(line);
  }

  return result;
}

export default function SessionSummaryParser({ products, onDone }) {
  const [text, setText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [result, setResult] = useState(null);

  async function handleParse() {
    if (!text.trim()) return;
    setParsing(true);

    const parsed = parseSummary(text, products);
    const now = new Date().toISOString();
    const today = new Date().toISOString().split('T')[0];
    const counts = { sparks: 0, stages: 0, research: 0, decisions: 0 };
    const stageDetails = [];

    for (const content of parsed.sparks) {
      if (content) { await createSpark(content); counts.sparks++; }
    }

    for (const update of parsed.stageUpdates) {
      if (update.productId) {
        await supabase.from('products').update({
          stage: update.stage,
          stage_updated_at: now,
          updated_at: now,
        }).eq('id', update.productId);
        counts.stages++;
        stageDetails.push(update);
      } else {
        parsed.unparseable.push({ section: 'STAGE UPDATES', line: `"${update.productName}" not found in products` });
      }
    }

    for (const session of parsed.research) {
      await createResearchSession(
        {
          collection: session.collection,
          niche: session.niche,
          date: today,
          source: session.source,
          status: 'Complete',
          notes: '',
        },
        session.keywords
      );
      counts.research++;
    }

    for (const d of parsed.decisions) {
      if (d) { await createWorkshopItem({ type: 'decision', content: d, source: 'Session Import' }); counts.decisions++; }
    }

    setResult({ ...counts, stageDetails, notes: parsed.notes, unparseable: parsed.unparseable });
    setParsing(false);
  }

  if (result) {
    const total = result.sparks + result.stages + result.research + result.decisions;
    return (
      <div>
        <div className="section-label" style={{ marginBottom: 12 }}>Imported</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
          {result.sparks > 0 && (
            <div style={{ fontSize: '0.85rem' }}>✓ {result.sparks} new Spark{result.sparks !== 1 ? 's' : ''} added</div>
          )}
          {result.stages > 0 && (
            <div style={{ fontSize: '0.85rem' }}>
              ✓ {result.stages} product stage{result.stages !== 1 ? 's' : ''} updated
              {result.stageDetails.map((u, i) => (
                <div key={i} style={{ fontSize: '0.75rem', color: 'var(--charcoal-soft)', marginLeft: 16 }}>
                  {u.productName} → {u.stage}
                </div>
              ))}
            </div>
          )}
          {result.research > 0 && (
            <div style={{ fontSize: '0.85rem' }}>✓ {result.research} research session{result.research !== 1 ? 's' : ''} created</div>
          )}
          {result.decisions > 0 && (
            <div style={{ fontSize: '0.85rem' }}>✓ {result.decisions} decision{result.decisions !== 1 ? 's' : ''} flagged for Codex review</div>
          )}
          {total === 0 && (
            <div style={{ fontSize: '0.85rem', color: 'var(--charcoal-soft)' }}>No structured data found. Check the summary format.</div>
          )}
        </div>

        {result.notes?.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div className="eyebrow" style={{ marginBottom: 8 }}>Notes (not stored)</div>
            {result.notes.map((n, i) => (
              <div key={i} style={{ fontSize: '0.78rem', color: 'var(--charcoal-soft)', marginBottom: 4, paddingLeft: 8, borderLeft: '2px solid rgba(43,41,38,0.1)' }}>
                {n}
              </div>
            ))}
          </div>
        )}

        {result.unparseable?.length > 0 && (
          <div style={{
            background: 'rgba(232,168,124,0.12)',
            border: '1px solid var(--warning)',
            borderRadius: 2, padding: '12px 14px', marginBottom: 16,
          }}>
            <div className="eyebrow" style={{ marginBottom: 8 }}>Could not parse</div>
            {result.unparseable.map((u, i) => (
              <div key={i} style={{ fontSize: '0.75rem', color: 'var(--charcoal-soft)', marginBottom: 4 }}>
                <span style={{ fontWeight: 500 }}>{u.section}:</span> {u.line}
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary btn-sm" onClick={onDone}>View imported items →</button>
          <button className="btn btn-ghost btn-sm" onClick={() => { setText(''); setResult(null); }}>Parse another</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="section-label" style={{ marginBottom: 8 }}>Paste Session Summary</div>
      <div style={{ fontSize: '0.78rem', color: 'var(--charcoal-soft)', marginBottom: 12, lineHeight: 1.6 }}>
        Paste a structured summary from Claude or ChatGPT. Items will be routed automatically — sparks to Sparks, stage changes to products, research to Research, decisions to Workshop.
      </div>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder={`--- SESSION SUMMARY ---
DATE: 2026-07-09
SOURCE: Claude

SPARKS
- New product idea here

STAGE UPDATES
- Product Name → SEO Ready

RESEARCH
- Collection: Mom Chapter
  Niche: Mom Humor
  Source: Everbee
  Keywords: mom shirt | 4368 | 5 | 873750

DECISIONS (for Codex)
- Decision that needs to go into TCC OS

NOTES
- Anything else worth capturing
--- END SUMMARY ---`}
        rows={16}
        style={{ marginBottom: 12, fontFamily: 'monospace', fontSize: '0.75rem' }}
      />
      <button className="btn btn-primary" onClick={handleParse} disabled={!text.trim() || parsing}>
        {parsing ? 'Parsing…' : 'Parse and Import →'}
      </button>
    </div>
  );
}
