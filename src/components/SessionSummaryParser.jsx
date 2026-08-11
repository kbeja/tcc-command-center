import { useState } from 'react';
import { createSpark, createWorkshopItem, createResearchSession, createConcept, createConceptOutput, setCurrentOutput, generateConceptCode, useCollectionObjects, useSparks, useResearchSessions } from '../lib/hooks';
import { assignBucketsToList } from '../lib/keywords.jsx';
import { supabase } from '../lib/supabase';
import { STAGES } from '../data/stages';
import { parseConceptFields, looseTextMatch } from './ConceptChatImport';

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

function parseSummary(text, products, collectionObjects, sparks, researchSessions) {
  const result = {
    sparks: [],
    stageUpdates: [],
    research: [],
    decisions: [],
    notes: [],
    concepts: [],
    filed: [],
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

  const SECTION_HEADERS = new Set([
    'sparks', 'stage updates', 'research', 'decisions (for codex)', 'decisions', 'notes', 'concepts'
  ]);

  const bulletLines = (block) =>
    block.split('\n')
      .map(cleanLine)
      .filter(Boolean)
      .filter(l => !SECTION_HEADERS.has(l.toLowerCase()))
      .filter(l => !/^(Collection|Niche|Source|Keywords?):/i.test(l));

  let filedId = 0;
  const pushFiled = (section, line) => {
    result.filed.push({ id: `filed-${filedId++}`, section, line });
  };

  // SPARKS
  const sparksBlock = extractBlock('SPARKS');
  bulletLines(sparksBlock).forEach((line, i) => {
    result.sparks.push({ id: `spark-${i}`, content: line });
  });

  // STAGE UPDATES
  const stageBlock = extractBlock('STAGE UPDATES');
  stageBlock.split('\n').map(cleanLine).filter(Boolean).forEach((rawLine, i) => {
    const m = rawLine.match(/(.+?)\s*[→>]\s*(.+)/);
    if (m) {
      const productName = m[1].trim();
      const stageRaw = m[2].trim();
      const match = products?.find(p => p.name.toLowerCase().includes(productName.toLowerCase()));
      const canonicalStage = STAGES.find(s => s.toLowerCase() === stageRaw.toLowerCase());
      result.stageUpdates.push({
        id: `stage-${i}`,
        raw: rawLine,
        productName,
        stage: canonicalStage || stageRaw,
        stageRecognized: !!canonicalStage,
        productId: match?.id || null,
        matched: !!match,
      });
    } else {
      pushFiled('STAGE UPDATES', rawLine);
    }
  });

  // RESEARCH — each item starts with "Collection:"
  const researchBlock = extractBlock('RESEARCH');
  const researchItems = researchBlock.split(/\n(?=[\*\-]?\s*Collection:)/i).filter(Boolean);
  let researchIdx = 0;
  for (const item of researchItems) {
    const colMatch = item.match(/Collection:\s*(.+)/i);
    const nicheMatch = item.match(/Niche:\s*(.+)/i);
    const sourceMatch = item.match(/Source:\s*(.+)/i);
    const kwLine = item.split('\n').find(l => /Keywords?:/i.test(l)) || '';
    const kwPart = kwLine.replace(/Keywords?:\s*/i, '').trim();

    if (!colMatch) {
      pushFiled('RESEARCH', item.trim().slice(0, 80));
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

    const source = sourceMatch?.[1]?.trim() || 'Other';
    const isInternalIdeation = /internal|ideation|no.*keyword|no.*etsy/i.test(source);

    if (keywords.length === 0 || isInternalIdeation) {
      // No real keyword data — file for triage so user can decide where it goes
      const label = colMatch[1].trim() + (nicheMatch ? ` / ${nicheMatch[1].trim()}` : '');
      pushFiled('RESEARCH (no keywords)', `${label} — ${source}`);
      continue;
    }

    result.research.push({
      id: `research-${researchIdx++}`,
      collection: colMatch[1].trim(),
      niche: nicheMatch?.[1]?.trim() || null,
      source,
      keywords: assignBucketsToList(keywords),
    });
  }

  // DECISIONS
  const decisionsBlock = extractBlock('DECISIONS');
  bulletLines(decisionsBlock).forEach((line, i) => {
    result.decisions.push({ id: `decision-${i}`, content: line });
  });

  // NOTES
  const notesBlock = extractBlock('NOTES');
  bulletLines(notesBlock).forEach((line, i) => {
    result.notes.push({ id: `note-${i}`, content: line });
  });

  // CONCEPTS — each item starts with "Concept Name:" or "Name:", same field
  // vocabulary as the standalone "Import Concept from ChatGPT" modal (shared
  // via parseConceptFields so there's one definition, not two to keep in sync).
  const conceptsBlock = extractBlock('CONCEPTS');
  const conceptItems = conceptsBlock.split(/\n(?=[\*\-]?\s*(?:Concept Name|Name):)/i).filter(Boolean);
  let conceptIdx = 0;
  for (const item of conceptItems) {
    const fields = parseConceptFields(item);
    if (!fields.name || !fields.collection_name) {
      pushFiled('CONCEPTS', `Missing name/collection — "${item.trim().slice(0, 60)}"`);
      continue;
    }
    const collectionMatch = collectionObjects?.find(
      c => c.name.toLowerCase() === fields.collection_name.toLowerCase()
    );
    if (!collectionMatch) {
      pushFiled('CONCEPTS', `"${fields.name}" — collection "${fields.collection_name}" not found. Use Design Vault → Import Concept from ChatGPT to add it with the right collection.`);
      continue;
    }

    // Optional "Source Spark:" — matched against every existing spark here
    // (for the live preview annotation); also re-matched at save time against
    // sparks created in this same batch, mirroring how Notes already resolves
    // against createdSparks. Unmatched doesn't block the concept, just leaves
    // spark_id unset — same warn-don't-block treatment as an unmatched stage
    // update.
    let spark_id = null;
    let sourceSparkMatched = false;
    if (fields.source_spark_text) {
      const matchedSpark = sparks?.find(s => looseTextMatch(s.content, fields.source_spark_text));
      if (matchedSpark) { spark_id = matchedSpark.id; sourceSparkMatched = true; }
    }

    // Optional "Related Research:" — matched against research sessions for
    // this concept's own collection only (unlike sparks, a concept's
    // collection is always set, so scoping here is unambiguous).
    let research_session_id = null;
    let relatedResearchMatched = false;
    if (fields.related_research_text) {
      const collectionSessions = (researchSessions || []).filter(
        rs => rs.collection?.toLowerCase() === fields.collection_name.toLowerCase()
      );
      const matchedSession = collectionSessions.find(rs =>
        looseTextMatch(rs.niche || '', fields.related_research_text) || looseTextMatch(rs.source || '', fields.related_research_text)
      );
      if (matchedSession) { research_session_id = matchedSession.id; relatedResearchMatched = true; }
    }

    result.concepts.push({
      id: `concept-${conceptIdx++}`,
      ...fields,
      spark_id,
      sourceSparkMatched,
      research_session_id,
      relatedResearchMatched,
    });
  }

  // Any other all-caps section header — file its content for manual triage
  // rather than silently dropping or swallowing it into a neighboring
  // section. This is how object types with no schema yet (Trends, Visual
  // Language, SEO Opportunities, Timing Intelligence, Learnings, Open
  // Questions, Trend Signals, and anything else a future summary uses) get
  // captured without hardcoding a header list that will inevitably go stale.
  const seenHeadings = new Set();
  for (const rawLine of normalized.split('\n')) {
    const line = rawLine.trim();
    if (!line || !/^[A-Z][A-Z \(\)]*$/.test(line)) continue;
    const key = line.toLowerCase();
    if (seenHeadings.has(key) || SECTION_HEADERS.has(key)) continue;
    seenHeadings.add(key);
    const block = extractBlock(line);
    bulletLines(block).forEach(l => pushFiled(line, l));
  }

  return result;
}

// Shared note-target resolution rule — used identically for the live preview
// prediction and the actual save-time resolution, just fed different-shaped
// inputs (predicted preview items vs real post-insert rows), so the two
// never disagree about where notes will land.
function pickNoteTarget({ matchedProduct, sparksInPriorityOrder, notesTexts }) {
  if (matchedProduct) return { type: 'product', target: matchedProduct };
  const textMatch = sparksInPriorityOrder.find(s =>
    notesTexts.some(n => n.toLowerCase().includes((s.content || '').toLowerCase().slice(0, 20)))
  );
  const target = textMatch || sparksInPriorityOrder[0];
  if (target) return { type: 'spark', target };
  return { type: 'workshop', target: null };
}

export default function SessionSummaryParser({ products, onDone }) {
  const { collections: collectionObjects } = useCollectionObjects();
  const { sparks: allSparks } = useSparks();
  // Unscoped — concepts within one paste can span different collections, so
  // this can't be pre-filtered the way a single-collection page would.
  const { sessions: allResearchSessions } = useResearchSessions();
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState(null);
  const [checked, setChecked] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState(null);

  function handleParse() {
    if (!text.trim()) return;
    const result = parseSummary(text, products, collectionObjects, allSparks, allResearchSessions);
    setParsed(result);
    const nextChecked = {};
    for (const key of ['sparks', 'stageUpdates', 'research', 'decisions', 'notes', 'concepts', 'filed']) {
      for (const item of result[key]) nextChecked[item.id] = true;
    }
    setChecked(nextChecked);
  }

  function toggle(id) {
    setChecked(prev => ({ ...prev, [id]: !prev[id] }));
  }

  async function handleSaveApproved() {
    setSaving(true);
    const now = new Date().toISOString();
    const today = new Date().toISOString().split('T')[0];
    const counts = { sparks: 0, stages: 0, research: 0, decisions: 0, concepts: 0, filed: 0 };
    const errors = [];
    const stageDetails = [];

    const createdSparks = [];
    for (const spark of parsed.sparks) {
      if (!checked[spark.id]) continue;
      const { data, error } = await createSpark(spark.content);
      if (error) errors.push(`Spark "${spark.content.slice(0, 40)}": ${error.message}`);
      else { if (data) createdSparks.push(data); counts.sparks++; }
    }

    for (const update of parsed.stageUpdates) {
      if (!checked[update.id]) continue;
      if (update.productId) {
        const { error } = await supabase.from('products').update({
          stage: update.stage,
          stage_updated_at: now,
          updated_at: now,
        }).eq('id', update.productId);
        if (error) errors.push(`Stage update "${update.productName}": ${error.message}`);
        else { counts.stages++; stageDetails.push(update); }
      } else {
        const { error } = await createWorkshopItem({
          type: 'unparseable',
          content: `[STAGE UPDATES] "${update.productName}" not found in products`,
          source: 'Session Import',
        });
        if (!error) counts.filed++;
      }
    }

    for (const session of parsed.research) {
      if (!checked[session.id]) continue;
      const { error } = await createResearchSession(
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
      if (error) errors.push(`Research "${session.collection}": ${error.message}`);
      else counts.research++;
    }

    for (const d of parsed.decisions) {
      if (!checked[d.id]) continue;
      const { error } = await createWorkshopItem({ type: 'decision', content: d.content, source: 'Session Import' });
      if (error) errors.push(`Decision "${d.content.slice(0, 40)}": ${error.message}`);
      else counts.decisions++;
    }

    // Concepts save sequentially (not Promise.all) — generateConceptCode()
    // counts existing concepts per collection at call time, so concurrent
    // writes for the same collection in one batch could collide on the
    // same generated code.
    for (const concept of parsed.concepts) {
      if (!checked[concept.id]) continue;
      const { kittl_prompt, id, source_spark_text, related_research_text, sourceSparkMatched, relatedResearchMatched, ...fields } = concept;
      // Re-try Source Spark matching against sparks created earlier in this
      // same save (not just pre-existing ones) — a "Source Spark:" line can
      // legitimately reference a spark from this same paste's SPARKS section,
      // which didn't exist yet when parseSummary() ran its first match.
      if (!fields.spark_id && source_spark_text) {
        const batchMatch = createdSparks.find(s => looseTextMatch(s.content, source_spark_text));
        if (batchMatch) fields.spark_id = batchMatch.id;
      }
      const concept_code = await generateConceptCode(fields.collection_name);
      const { data, error } = await createConcept({ ...fields, concept_code });
      if (error || !data) {
        errors.push(`Concept "${fields.name}": ${error?.message || 'unknown error'}`);
        continue;
      }
      counts.concepts++;
      if (kittl_prompt) {
        const { data: output, error: outputError } = await createConceptOutput({
          concept_id: data.id,
          output_type: 'kittl_prompt',
          version: 1,
          is_current: true,
          body: kittl_prompt,
          output_source: 'imported',
        });
        if (!outputError && output) await setCurrentOutput(data.id, 'kittl_prompt', output.id);
      }
    }

    for (const item of parsed.filed) {
      if (!checked[item.id]) continue;
      const { error } = await createWorkshopItem({
        type: 'unparseable',
        content: `[${item.section}] ${item.line}`,
        source: 'Session Import',
      });
      if (error) errors.push(`Filed item: ${error.message}`);
      else counts.filed++;
    }

    // Notes: combine whichever are still checked, resolve target with the
    // identical rule the preview used to predict it, against real data.
    let notesResult = null;
    const checkedNoteTexts = parsed.notes.filter(n => checked[n.id]).map(n => n.content);
    if (checkedNoteTexts.length > 0) {
      const matchedStageUpdate = stageDetails.find(u => u.matched);
      const matchedProduct = matchedStageUpdate ? products?.find(p => p.id === matchedStageUpdate.productId) : null;
      const resolution = pickNoteTarget({ matchedProduct, sparksInPriorityOrder: createdSparks, notesTexts: checkedNoteTexts });
      const noteText = `\n[Session notes ${today}]\n` + checkedNoteTexts.map(n => `• ${n}`).join('\n');

      if (resolution.type === 'product') {
        const existing = resolution.target.notes || '';
        const { error } = await supabase.from('products')
          .update({ notes: existing + noteText, updated_at: now })
          .eq('id', resolution.target.id);
        if (error) errors.push(`Notes: ${error.message}`);
        else notesResult = { count: checkedNoteTexts.length, target: resolution.target.name, type: 'product' };
      } else if (resolution.type === 'spark') {
        const existing = resolution.target.notes || '';
        const { error } = await supabase.from('sparks')
          .update({ notes: (existing ? existing + '\n' : '') + noteText.trim(), updated_at: now })
          .eq('id', resolution.target.id);
        if (error) errors.push(`Notes: ${error.message}`);
        else notesResult = { count: checkedNoteTexts.length, target: resolution.target.content.slice(0, 40), type: 'spark' };
      } else {
        const combined = checkedNoteTexts.join('\n• ');
        const { error } = await createWorkshopItem({ type: 'note', content: `• ${combined}`, source: 'Session Import' });
        if (error) errors.push(`Notes: ${error.message}`);
        else notesResult = { count: checkedNoteTexts.length, target: null, type: 'workshop' };
      }
    }

    setSaveResult({ ...counts, stageDetails, notesResult, errors });
    setSaving(false);
  }

  if (saveResult) {
    const total = saveResult.sparks + saveResult.stages + saveResult.research + saveResult.decisions
      + saveResult.concepts + saveResult.filed + (saveResult.notesResult?.count || 0);
    return (
      <div>
        <div className="section-label" style={{ marginBottom: 12 }}>Saved</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
          {saveResult.sparks > 0 && (
            <div style={{ fontSize: '0.85rem' }}>✓ {saveResult.sparks} new Spark{saveResult.sparks !== 1 ? 's' : ''} added</div>
          )}
          {saveResult.stages > 0 && (
            <div style={{ fontSize: '0.85rem' }}>
              ✓ {saveResult.stages} product stage{saveResult.stages !== 1 ? 's' : ''} updated
              {saveResult.stageDetails.map((u, i) => (
                <div key={i} style={{ fontSize: '0.75rem', color: 'var(--charcoal-soft)', marginLeft: 16 }}>
                  {u.productName} → {u.stage}
                </div>
              ))}
            </div>
          )}
          {saveResult.research > 0 && (
            <div style={{ fontSize: '0.85rem' }}>✓ {saveResult.research} research session{saveResult.research !== 1 ? 's' : ''} created</div>
          )}
          {saveResult.concepts > 0 && (
            <div style={{ fontSize: '0.85rem' }}>✓ {saveResult.concepts} Concept{saveResult.concepts !== 1 ? 's' : ''} created</div>
          )}
          {saveResult.decisions > 0 && (
            <div style={{ fontSize: '0.85rem' }}>✓ {saveResult.decisions} decision{saveResult.decisions !== 1 ? 's' : ''} flagged for Codex review</div>
          )}
          {saveResult.notesResult && (
            <div style={{ fontSize: '0.85rem' }}>
              ✓ {saveResult.notesResult.count} note{saveResult.notesResult.count !== 1 ? 's' : ''} {
                saveResult.notesResult.type === 'product' ? `appended to product: ${saveResult.notesResult.target}` :
                saveResult.notesResult.type === 'spark' ? `appended to spark: ${saveResult.notesResult.target}…` :
                'saved to Workshop'
              }
            </div>
          )}
          {saveResult.filed > 0 && (
            <div style={{ fontSize: '0.85rem' }}>✓ {saveResult.filed} item{saveResult.filed !== 1 ? 's' : ''} filed to Workshop for review</div>
          )}
          {total === 0 && (
            <div style={{ fontSize: '0.85rem', color: 'var(--charcoal-soft)' }}>Nothing was checked — nothing saved.</div>
          )}
        </div>

        {saveResult.errors.length > 0 && (
          <div style={{
            background: 'rgba(201,123,123,0.12)', border: '1px solid var(--alert)',
            borderRadius: 2, padding: '12px 14px', marginBottom: 16,
          }}>
            <div className="eyebrow" style={{ marginBottom: 8 }}>Some items didn't save</div>
            {saveResult.errors.map((e, i) => (
              <div key={i} style={{ fontSize: '0.75rem', color: 'var(--charcoal-soft)', marginBottom: 4 }}>{e}</div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary btn-sm" onClick={onDone}>View imported items →</button>
          <button className="btn btn-ghost btn-sm" onClick={() => { setText(''); setParsed(null); setChecked({}); setSaveResult(null); }}>
            Parse another
          </button>
        </div>
      </div>
    );
  }

  if (parsed) {
    return (
      <PreviewChecklist
        parsed={parsed}
        checked={checked}
        toggle={toggle}
        products={products}
        saving={saving}
        onSave={handleSaveApproved}
        onBack={() => setParsed(null)}
      />
    );
  }

  return (
    <div>
      <div className="section-label" style={{ marginBottom: 8 }}>Paste Session Summary</div>
      <div style={{ fontSize: '0.78rem', color: 'var(--charcoal-soft)', marginBottom: 12, lineHeight: 1.6 }}>
        Paste a structured summary from Claude or ChatGPT. You'll get a preview before anything saves — sparks, stage changes, research, decisions, and concepts each route to the right place, and anything that doesn't parse cleanly (or uses a section type not modeled yet) gets filed to Workshop instead of lost.
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

CONCEPTS
- Concept Name: ...
  Collection: Mom Chapter
  Design Direction: ...
  Source Spark: ... (optional)
  Related Research: ... (optional)

DECISIONS (for Codex)
- Decision that needs to go into TCC OS

NOTES
- Anything else worth capturing
--- END SUMMARY ---`}
        rows={16}
        style={{ marginBottom: 12, fontFamily: 'monospace', fontSize: '0.75rem' }}
      />
      <button className="btn btn-primary" onClick={handleParse} disabled={!text.trim()}>
        Preview →
      </button>
    </div>
  );
}

function PreviewChecklist({ parsed, checked, toggle, products, saving, onSave, onBack }) {
  const checkedMatchedStageUpdate = parsed.stageUpdates.find(u => u.matched && checked[u.id]);
  const matchedProduct = checkedMatchedStageUpdate
    ? products?.find(p => p.id === checkedMatchedStageUpdate.productId)
    : null;
  const checkedSparks = parsed.sparks.filter(s => checked[s.id]);
  const checkedNoteTexts = parsed.notes.filter(n => checked[n.id]).map(n => n.content);
  const notePrediction = checkedNoteTexts.length > 0
    ? pickNoteTarget({ matchedProduct, sparksInPriorityOrder: checkedSparks, notesTexts: checkedNoteTexts })
    : null;

  const totalChecked = Object.values(checked).filter(Boolean).length;

  return (
    <div>
      <div className="section-label" style={{ marginBottom: 4 }}>Review before saving</div>
      <div style={{ fontSize: '0.78rem', color: 'var(--charcoal-soft)', marginBottom: 16 }}>
        Nothing below is saved yet. Uncheck anything you don't want, then save the rest.
      </div>

      {parsed.sparks.length > 0 && (
        <PreviewSection title={`Sparks (${parsed.sparks.length})`}>
          {parsed.sparks.map(s => (
            <PreviewRow key={s.id} checked={!!checked[s.id]} onToggle={() => toggle(s.id)}>
              {s.content}
            </PreviewRow>
          ))}
        </PreviewSection>
      )}

      {parsed.stageUpdates.length > 0 && (
        <PreviewSection title={`Stage Updates (${parsed.stageUpdates.length})`}>
          {parsed.stageUpdates.map(u => (
            <PreviewRow
              key={u.id}
              checked={!!checked[u.id]}
              onToggle={() => toggle(u.id)}
              annotation={
                <>
                  {u.matched ? (
                    <span style={{ color: '#2d6b3c' }}>→ matched: "{products?.find(p => p.id === u.productId)?.name}"</span>
                  ) : (
                    <span style={{ color: '#7a4a1e' }}>no product match — will file to Workshop instead</span>
                  )}
                  {!u.stageRecognized && (
                    <span style={{ color: '#7a4a1e', marginLeft: 8 }}>⚠ "{u.stage}" isn't a recognized stage — check the wording</span>
                  )}
                </>
              }
            >
              {u.productName} → {u.stage}
            </PreviewRow>
          ))}
        </PreviewSection>
      )}

      {parsed.research.length > 0 && (
        <PreviewSection title={`Research (${parsed.research.length})`}>
          {parsed.research.map(r => (
            <PreviewRow key={r.id} checked={!!checked[r.id]} onToggle={() => toggle(r.id)}>
              {r.collection}{r.niche ? ` / ${r.niche}` : ''} — {r.keywords.length} keyword{r.keywords.length !== 1 ? 's' : ''} ({r.source})
            </PreviewRow>
          ))}
        </PreviewSection>
      )}

      {parsed.concepts.length > 0 && (
        <PreviewSection title={`Concepts (${parsed.concepts.length})`}>
          {parsed.concepts.map(c => (
            <PreviewRow
              key={c.id}
              checked={!!checked[c.id]}
              onToggle={() => toggle(c.id)}
              annotation={
                <>
                  <span style={{ color: '#2d6b3c' }}>→ collection: "{c.collection_name}"</span>
                  {c.source_spark_text && (
                    <div style={{ color: c.sourceSparkMatched ? '#2d6b3c' : '#7a4a1e' }}>
                      {c.sourceSparkMatched
                        ? `🔗 Source Spark matched: "${c.source_spark_text}"`
                        : `⚠ Source Spark "${c.source_spark_text}" not found yet — re-checked against this batch's sparks at save time`}
                    </div>
                  )}
                  {c.related_research_text && (
                    <div style={{ color: c.relatedResearchMatched ? '#2d6b3c' : '#7a4a1e' }}>
                      {c.relatedResearchMatched
                        ? `📊 Related Research matched: "${c.related_research_text}"`
                        : `⚠ Related Research "${c.related_research_text}" not found for "${c.collection_name}" — will save without a research link`}
                    </div>
                  )}
                </>
              }
            >
              {c.name}
            </PreviewRow>
          ))}
        </PreviewSection>
      )}

      {parsed.decisions.length > 0 && (
        <PreviewSection title={`Decisions (${parsed.decisions.length})`}>
          {parsed.decisions.map(d => (
            <PreviewRow key={d.id} checked={!!checked[d.id]} onToggle={() => toggle(d.id)}>
              {d.content}
            </PreviewRow>
          ))}
        </PreviewSection>
      )}

      {parsed.notes.length > 0 && (
        <PreviewSection
          title={`Notes (${parsed.notes.length})`}
          hint={
            !notePrediction ? 'Uncheck all to skip' :
            notePrediction.type === 'product' ? `Will attach to product: "${notePrediction.target.name}"` :
            notePrediction.type === 'spark' ? `Will attach to spark: "${(notePrediction.target.content || '').slice(0, 40)}"` :
            'No product or spark match — will file to Workshop'
          }
        >
          {parsed.notes.map(n => (
            <PreviewRow key={n.id} checked={!!checked[n.id]} onToggle={() => toggle(n.id)}>
              {n.content}
            </PreviewRow>
          ))}
        </PreviewSection>
      )}

      {parsed.filed.length > 0 && (
        <PreviewSection
          title={`Filed for review (${parsed.filed.length})`}
          hint="Didn't parse cleanly, or the section type isn't modeled yet — goes to Workshop Triage either way, nothing is lost."
        >
          {parsed.filed.map(f => (
            <PreviewRow key={f.id} checked={!!checked[f.id]} onToggle={() => toggle(f.id)}>
              <span style={{ fontWeight: 500 }}>{f.section}:</span> {f.line}
            </PreviewRow>
          ))}
        </PreviewSection>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button className="btn btn-primary" onClick={onSave} disabled={saving || totalChecked === 0}>
          {saving ? 'Saving…' : `Save approved (${totalChecked}) →`}
        </button>
        <button className="btn btn-ghost" onClick={onBack} disabled={saving}>← Edit paste</button>
      </div>
    </div>
  );
}

function PreviewSection({ title, hint, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div className="eyebrow" style={{ marginBottom: 6 }}>{title}</div>
      {hint && <div style={{ fontSize: '0.72rem', color: 'var(--charcoal-soft)', marginBottom: 8 }}>{hint}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{children}</div>
    </div>
  );
}

function PreviewRow({ checked, onToggle, annotation, children }) {
  return (
    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: '0.82rem', cursor: 'pointer' }}>
      <input type="checkbox" checked={checked} onChange={onToggle} style={{ width: 'auto', margin: '3px 0 0', flexShrink: 0 }} />
      <span>
        {children}
        {annotation && <div style={{ fontSize: '0.72rem', marginTop: 2 }}>{annotation}</div>}
      </span>
    </label>
  );
}
