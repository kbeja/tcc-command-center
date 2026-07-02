import { useState } from 'react';
import { createSpark, createWorkshopItem, updateProduct } from '../lib/hooks';
import { supabase } from '../lib/supabase';

function parseSummary(text) {
  const result = { sparks: [], stageUpdates: [], research: [], decisions: [], notes: [] };

  const blocks = {
    SPARKS: /SPARKS\s*\n([\s\S]*?)(?=\n[A-Z ]+\n|--- END)/,
    STAGE_UPDATES: /STAGE UPDATES\s*\n([\s\S]*?)(?=\n[A-Z ]+\n|--- END)/,
    RESEARCH: /RESEARCH\s*\n([\s\S]*?)(?=\n[A-Z ]+\n|--- END)/,
    DECISIONS: /DECISIONS[^\n]*\n([\s\S]*?)(?=\n[A-Z ]+\n|--- END)/,
    NOTES: /NOTES\s*\n([\s\S]*?)(?=\n[A-Z ]+\n|--- END)/,
  };

  const lines = (block) => block?.trim().split('\n').map(l => l.replace(/^-\s*/, '').trim()).filter(Boolean) || [];

  const sparksMatch = text.match(blocks.SPARKS);
  result.sparks = lines(sparksMatch?.[1]);

  const stageMatch = text.match(blocks.STAGE_UPDATES);
  result.stageUpdates = lines(stageMatch?.[1]).map(l => {
    const m = l.match(/(.+?)\s*→\s*(.+)/);
    return m ? { product: m[1].trim(), stage: m[2].trim() } : null;
  }).filter(Boolean);

  const decisionsMatch = text.match(blocks.DECISIONS);
  result.decisions = lines(decisionsMatch?.[1]);

  const notesMatch = text.match(blocks.NOTES);
  result.notes = lines(notesMatch?.[1]);

  return result;
}

export default function SessionSummaryParser({ products, onDone }) {
  const [text, setText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [result, setResult] = useState(null);

  async function handleParse() {
    if (!text.trim()) return;
    setParsing(true);

    const parsed = parseSummary(text);
    const now = new Date().toISOString();
    const counts = { sparks: 0, stages: 0, decisions: 0 };

    // Create sparks
    for (const content of parsed.sparks) {
      if (content) { await createSpark(content); counts.sparks++; }
    }

    // Update product stages
    for (const update of parsed.stageUpdates) {
      const product = products?.find(p => p.name.toLowerCase().includes(update.product.toLowerCase()));
      if (product) {
        await supabase.from('products').update({ stage: update.stage, stage_updated_at: now, updated_at: now }).eq('id', product.id);
        counts.stages++;
      }
    }

    // Flag decisions for Codex
    for (const d of parsed.decisions) {
      if (d) { await createWorkshopItem({ type: 'decision', content: d, source: 'Session Import' }); counts.decisions++; }
    }

    setResult({ ...counts, stageDetails: parsed.stageUpdates });
    setParsing(false);
  }

  if (result) {
    return (
      <div>
        <div className="section-label" style={{ marginBottom: 12 }}>Imported</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
          {result.sparks > 0 && <div style={{ fontSize: '0.85rem' }}>✓ {result.sparks} new Spark{result.sparks !== 1 ? 's' : ''} added</div>}
          {result.stages > 0 && (
            <div style={{ fontSize: '0.85rem' }}>
              ✓ {result.stages} product stage{result.stages !== 1 ? 's' : ''} updated
              {result.stageDetails.map((u, i) => (
                <div key={i} style={{ fontSize: '0.75rem', color: 'var(--charcoal-soft)', marginLeft: 16 }}>
                  {u.product} → {u.stage}
                </div>
              ))}
            </div>
          )}
          {result.decisions > 0 && <div style={{ fontSize: '0.85rem' }}>✓ {result.decisions} decision{result.decisions !== 1 ? 's' : ''} flagged for Codex review</div>}
          {result.sparks === 0 && result.stages === 0 && result.decisions === 0 && (
            <div style={{ fontSize: '0.85rem', color: 'var(--charcoal-soft)' }}>No structured data found. Check the summary format.</div>
          )}
        </div>
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
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder={`--- SESSION SUMMARY ---\nDATE: 2026-06-28\nSOURCE: Claude\n\nSPARKS\n- New idea here\n\nSTAGE UPDATES\n- Product Name → New Stage\n\nDECISIONS (for Codex)\n- Decision here\n--- END SUMMARY ---`}
        rows={12}
        style={{ marginBottom: 12, fontFamily: 'monospace', fontSize: '0.78rem' }}
      />
      <button className="btn btn-primary" onClick={handleParse} disabled={!text.trim() || parsing}>
        {parsing ? 'Parsing…' : 'Parse and Import →'}
      </button>
    </div>
  );
}
