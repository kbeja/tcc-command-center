import { useState } from 'react';
import { createSpark, createWorkshopItem, createResearchSession, createConcept, createConceptOutput, createImportSession, setCurrentOutput, generateConceptCode, useSparks, useResearchSessions, useTrendSignals, createTrendSignal, useVisualTags, createVisualTag, applyTagToCollection, useTimingNiches, useTimingSources, createTimingNiche, createTimingSource, createTimingGuidance, createTimingGuidanceNote, linkTimingNicheToCollection } from '../lib/hooks';
import { useCollectionsContext } from '../context/CollectionsContext';
import { assignBucketsToList } from '../lib/keywords.jsx';
import { supabase } from '../lib/supabase';
import { STAGES } from '../data/stages';
import { nowISO } from '../lib/utils';
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

function parseSummary(text, products, collectionObjects, sparks, researchSessions, trendSignals, visualTags, timingNiches, timingSources) {
  const result = {
    sparks: [],
    stageUpdates: [],
    research: [],
    decisions: [],
    notes: [],
    concepts: [],
    trendSignals: [],
    visualLanguage: [],
    timing: [],
    filed: [],
    session: null,
  };

  // Normalize: strip ** from section headers so regex can find them
  const normalized = text.replace(/\*\*([A-Z][A-Z\s\(\)]+)\*\*/g, '$1');

  // PREAMBLE — optional "DATE:"/"SOURCE:" header between "--- SESSION SUMMARY ---"
  // and the first section header (see the placeholder text below the textarea).
  // Scoped strictly to the preamble — everything before the first real
  // section-header line — using the identical header-detection test the
  // catch-all filing loop uses further down, so the two can never disagree
  // about where the preamble ends. This scoping is what keeps this from ever
  // accidentally matching RESEARCH's own per-item "Source: Everbee" line or
  // CONCEPTS' "Source Spark:" line elsewhere in the same paste — a global
  // search for "SOURCE:" would collide with those; this doesn't, because it
  // never looks past the first section header.
  // Best-effort throughout: a missing or unparseable header just leaves
  // result.session's fields null, exactly like today's behavior — nothing
  // throws, nothing blocks the rest of the parse.
  const headerLineRe = /^[A-Z][A-Z \(\)]*$/;
  const normalizedLines = normalized.split('\n');
  const firstHeaderLineIdx = normalizedLines.findIndex(l => headerLineRe.test(l.trim()));
  const preamble = firstHeaderLineIdx === -1 ? normalized : normalizedLines.slice(0, firstHeaderLineIdx).join('\n');
  const dateLine = preamble.match(/DATE:\s*(.+)/i);
  const sourceLine = preamble.match(/SOURCE:\s*(.+)/i);
  const dateRaw = dateLine?.[1]?.trim() || null;
  const sourceRaw = sourceLine?.[1]?.trim() || null;
  const parsedDate = dateRaw ? new Date(dateRaw) : null;
  result.session = {
    date: parsedDate && !isNaN(parsedDate) ? parsedDate.toISOString().split('T')[0] : null,
    dateRaw,     // kept only so the preview can say *what* failed to parse; never sent to the DB
    source: sourceRaw,
  };

  // Extract section blocks — handles both "- bullet" and "* bullet" lines
  function extractBlock(label) {
    const re = new RegExp(
      `${label}[^\\n]*\\n([\\s\\S]*?)(?=\\n\\s*[A-Z][A-Z \\(\\)]*\\s*\\n|--- END|$)`
    );
    return normalized.match(re)?.[1]?.trim() || '';
  }

  const SECTION_HEADERS = new Set([
    'sparks', 'stage updates', 'research', 'decisions (for codex)', 'decisions', 'notes', 'concepts', 'trend signals', 'visual language', 'timing intelligence'
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

  // TREND SIGNALS — each item starts with "Signal Name:" or "Name:". Unlike
  // CONCEPTS, an unmatched Collection doesn't block the signal (trend_signals
  // .collection is plain free text, not a FK) — same warn-don't-block
  // treatment as an unmatched Source Spark/Related Research above; the raw
  // pasted text is stored as-is either way, matched only for the preview
  // annotation. Evidence/Notes support multi-line values, same technique
  // parseConceptFields uses for Kittl Prompt: capture everything up to the
  // next "Label:" line.
  const trendSignalsBlock = extractBlock('TREND SIGNALS');
  const trendSignalItems = trendSignalsBlock.split(/\n(?=[\*\-]?\s*(?:Signal Name|Name):)/i).filter(Boolean);
  let trendSignalIdx = 0;
  for (const item of trendSignalItems) {
    const itemLines = item.trim().split('\n').map(l => l.trim().replace(/^[\*\-]\s+/, ''));
    const get = (label) => {
      const line = itemLines.find(l => l.toLowerCase().startsWith(label.toLowerCase() + ':'));
      return line ? line.slice(label.length + 1).trim() : '';
    };
    const getMultiline = (label) => {
      const idx = itemLines.findIndex(l => l.toLowerCase().startsWith(label.toLowerCase() + ':'));
      if (idx === -1) return '';
      const firstLine = itemLines[idx].slice(label.length + 1).trim();
      const rest = [];
      for (let i = idx + 1; i < itemLines.length; i++) {
        if (itemLines[i].match(/^[A-Z][a-zA-Z ]+:/)) break;
        if (itemLines[i]) rest.push(itemLines[i]);
      }
      return [firstLine, ...rest].filter(Boolean).join(' ').trim();
    };

    const name = get('Signal Name') || get('Name');
    if (!name) {
      pushFiled('TREND SIGNALS', `Missing signal name — "${item.trim().slice(0, 60)}"`);
      continue;
    }

    const collection = get('Collection') || null;
    const collectionMatched = !!(collection && collectionObjects?.some(
      c => c.name.toLowerCase() === collection.toLowerCase()
    ));

    const rawStatus = get('Status').toLowerCase();
    const recognizedStatus = ['pursue', 'watch', 'timing', 'saturated', 'discarded'].find(s => rawStatus.includes(s));

    // Dedup — case-insensitive name match, scoped to the same collection when
    // one's given, unscoped otherwise. Checked only against signals already
    // saved in the database at parse time (not other items in this same
    // paste batch) — warn-don't-block, same as everything else here.
    const dupMatch = (trendSignals || []).find(s => {
      if (s.name?.toLowerCase() !== name.toLowerCase()) return false;
      if (collection) return (s.collection || '').toLowerCase() === collection.toLowerCase();
      return true;
    });

    result.trendSignals.push({
      id: `trend-signal-${trendSignalIdx++}`,
      name,
      collection,
      collectionMatched,
      parent_niche: get('Niche') || null,
      status: recognizedStatus || 'watch',
      evidence: getMultiline('Evidence'),
      notes: getMultiline('Notes'),
      dupWarning: !!dupMatch,
    });
  }

  // VISUAL LANGUAGE — each item starts with "Collection:" (same item-split
  // convention RESEARCH already uses, since both have "Collection:" as
  // their first field, unlike CONCEPTS/TREND SIGNALS' "Name:"-first shape).
  // Unlike Trend Signals' warn-don't-block collection handling, an
  // unmatched Collection here hard-blocks to Workshop — collection_tags
  // .collection_id is a real FK to collections.id, so unlike
  // trend_signals.collection (plain text) there's no way to "save it
  // anyway" without a resolvable collection, the same reasoning CONCEPTS
  // already uses for its own collection_name.
  const visualLanguageBlock = extractBlock('VISUAL LANGUAGE');
  const visualLanguageItems = visualLanguageBlock.split(/\n(?=[\*\-]?\s*Collection:)/i).filter(Boolean);
  let visualLanguageIdx = 0;
  for (const item of visualLanguageItems) {
    const itemLines = item.trim().split('\n').map(l => l.trim().replace(/^[\*\-]\s+/, ''));
    const get = (label) => {
      const line = itemLines.find(l => l.toLowerCase().startsWith(label.toLowerCase() + ':'));
      return line ? line.slice(label.length + 1).trim() : '';
    };
    const getMultiline = (label) => {
      const idx = itemLines.findIndex(l => l.toLowerCase().startsWith(label.toLowerCase() + ':'));
      if (idx === -1) return '';
      const firstLine = itemLines[idx].slice(label.length + 1).trim();
      const rest = [];
      for (let i = idx + 1; i < itemLines.length; i++) {
        if (itemLines[i].match(/^[A-Z][a-zA-Z ]+:/)) break;
        if (itemLines[i]) rest.push(itemLines[i]);
      }
      return [firstLine, ...rest].filter(Boolean).join(' ').trim();
    };

    const collectionText = get('Collection');
    const rawTagNames = (get('Tags') || '').split(',').map(t => t.trim()).filter(Boolean);
    // Dedup case-insensitively within one item (preserving first-seen
    // casing) so "Tags: cottagecore, Cottagecore" doesn't double-process
    // the same tag.
    const tagNames = [...new Map(rawTagNames.map(t => [t.toLowerCase(), t])).values()];

    if (!collectionText || tagNames.length === 0) {
      pushFiled('VISUAL LANGUAGE', `Missing Collection or Tags — "${item.trim().slice(0, 60)}"`);
      continue;
    }

    const collectionMatch = collectionObjects?.find(c => c.name.toLowerCase() === collectionText.toLowerCase());
    if (!collectionMatch) {
      pushFiled('VISUAL LANGUAGE', `"${tagNames.join(', ')}" — collection "${collectionText}" not found. Fix the collection name and re-paste, or add tags directly from the Collection page.`);
      continue;
    }

    // Split into "matches existing vocabulary" vs. "will be created" for
    // the preview only — informational, not a warning (unlike Trend
    // Signals' amber dedup warning, there's no risk here: minting a
    // genuinely new tag is the intended behavior, not a problem).
    const existingMatched = [];
    const willCreate = [];
    for (const t of tagNames) {
      const match = visualTags?.find(vt => vt.name.toLowerCase() === t.toLowerCase());
      if (match) existingMatched.push(match.name);
      else willCreate.push(t);
    }

    result.visualLanguage.push({
      id: `visual-language-${visualLanguageIdx++}`,
      collection: collectionMatch.name,
      collectionId: collectionMatch.id,
      tagNames,
      existingMatched,
      willCreate,
      notes: getMultiline('Notes'),
    });
  }

  // TIMING INTELLIGENCE — each item starts with "Niche:". Until this phase
  // these blocks fell through to the catch-all below and landed in Workshop
  // as untyped text; they now have a real structured destination.
  //
  // Two provenance concepts are deliberately kept apart here, because they
  // are routinely different and conflating them would quietly restate an
  // expert's claim as a fact observed by TCC:
  //   Source:  who is making the timing claim (e.g. a POD niche calendar)
  //   session: which paste carried it in (ChatGPT, threaded as session_id)
  //
  // Evidence type defaults to the WEAKEST value, 'hypothesis'. A ChatGPT
  // sentence like "Hockey may be worth starting earlier this year" is a
  // hypothesis; it is not the same kind of thing as "observed demand rose
  // July 20", and it must never be promoted to one by omission. Strengthening
  // it requires saying so explicitly in the paste.
  const TIMING_EVIDENCE = { 'expert guidance': 'expert_guidance', expert: 'expert_guidance',
    observation: 'observation', observed: 'observation', hypothesis: 'hypothesis' };
  const TIMING_CLASSIFICATIONS = {
    'low competition': 'low_competition', 'high competition': 'high_competition',
    evergreen: 'evergreen', 'fast mover': 'fast_mover', 'emotion-based': 'emotion_based',
    'emotion based': 'emotion_based',
  };
  const MONTH_LOOKUP = ['january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december'];

  const timingBlock = extractBlock('TIMING INTELLIGENCE');
  const timingItems = timingBlock.split(/\n(?=[*-]?\s*Niche:)/i).filter(Boolean);
  let timingIdx = 0;
  for (const item of timingItems) {
    const itemLines = item.trim().split('\n').map(l => l.trim().replace(/^[*-]\s+/, ''));
    const get = (label) => {
      const line = itemLines.find(l => l.toLowerCase().startsWith(label.toLowerCase() + ':'));
      return line ? line.slice(label.length + 1).trim() : '';
    };
    const getMultiline = (label) => {
      const idx = itemLines.findIndex(l => l.toLowerCase().startsWith(label.toLowerCase() + ':'));
      if (idx === -1) return '';
      const firstLine = itemLines[idx].slice(label.length + 1).trim();
      const rest = [];
      for (let i = idx + 1; i < itemLines.length; i++) {
        if (itemLines[i].match(/^[A-Z][a-zA-Z ]+:/)) break;
        if (itemLines[i]) rest.push(itemLines[i]);
      }
      return [firstLine, ...rest].filter(Boolean).join(' ').trim();
    };

    const nicheText = get('Niche');
    const timingText = get('Timing') || get('Guidance State');
    if (!nicheText || !timingText) {
      pushFiled('TIMING INTELLIGENCE', `Missing Niche or Timing — "${item.trim().slice(0, 60)}"`);
      continue;
    }

    const sourceText = get('Source');
    if (!sourceText) {
      // Unattributed timing evidence is the one thing this phase's whole
      // schema exists to prevent, so it hard-blocks rather than saving with a
      // null source — the same reasoning CONCEPTS uses for an unresolvable
      // collection.
      pushFiled('TIMING INTELLIGENCE', `"${nicheText}" — no Source given. Timing evidence must say who is claiming it; add a "Source:" line and re-paste.`);
      continue;
    }

    const monthText = get('Month');
    let month = null;
    if (monthText) {
      const asNum = parseInt(monthText, 10);
      if (Number.isFinite(asNum) && asNum >= 1 && asNum <= 12) month = asNum;
      else {
        const found = MONTH_LOOKUP.findIndex(m => m.startsWith(monthText.trim().toLowerCase().slice(0, 3)));
        if (found >= 0) month = found + 1;
      }
    }
    const dayRaw = parseInt(get('Day'), 10);
    const day = Number.isFinite(dayRaw) && dayRaw >= 1 && dayRaw <= 31 ? dayRaw : null;

    const nicheMatch = (timingNiches || []).find(n => n.name.toLowerCase() === nicheText.toLowerCase());
    const sourceMatch = (timingSources || []).find(s => s.name.toLowerCase() === sourceText.toLowerCase());

    // An unmatched Collection warns but does not block — the junction is
    // optional, so the guidance is still worth saving without it (the same
    // warn-don't-block treatment TREND SIGNALS gives its own collection).
    const collectionText = get('Collection');
    const collectionMatch = collectionText
      ? collectionObjects?.find(c => c.name.toLowerCase() === collectionText.toLowerCase())
      : null;

    const evidenceRaw = (get('Evidence') || get('Source Type') || '').trim().toLowerCase();
    const evidenceType = TIMING_EVIDENCE[evidenceRaw] || 'hypothesis';

    const classRaw = (get('Classification') || '').trim().toLowerCase();

    result.timing.push({
      id: `timing-${timingIdx++}`,
      nicheName: nicheText,
      nicheId: nicheMatch?.id || null,
      willCreateNiche: !nicheMatch,
      sourceName: sourceText,
      sourceId: sourceMatch?.id || null,
      willCreateSource: !sourceMatch,
      // The source's own word, stored verbatim and never translated into a
      // TCC state at import time.
      guidanceState: timingText.toUpperCase(),
      month, day,
      monthRaw: monthText,
      datePrecision: day ? 'day' : (month ? 'month' : null),
      classification: TIMING_CLASSIFICATIONS[classRaw] || null,
      evidenceType,
      evidenceWasExplicit: !!TIMING_EVIDENCE[evidenceRaw],
      guidanceText: getMultiline('Guidance'),
      collectionName: collectionMatch?.name || null,
      collectionId: collectionMatch?.id || null,
      collectionWarning: collectionText && !collectionMatch
        ? `Collection "${collectionText}" not found — the guidance will save without a collection link.`
        : null,
    });
  }

  // Any other all-caps section header — file its content for manual triage
  // rather than silently dropping or swallowing it into a neighboring
  // section. This is how object types with no schema yet (Trends, SEO
  // Opportunities, Timing Intelligence, Learnings, Open Questions, and
  // anything else a future summary uses) get captured without hardcoding
  // a header list that will inevitably go stale.
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
  const { collectionObjects } = useCollectionsContext();
  const { sparks: allSparks } = useSparks();
  // Unscoped — concepts within one paste can span different collections, so
  // this can't be pre-filtered the way a single-collection page would.
  const { sessions: allResearchSessions } = useResearchSessions();
  const { signals: allTrendSignals } = useTrendSignals();
  const { tags: allVisualTags } = useVisualTags();
  const { niches: allTimingNiches, refetch: refetchTimingNiches } = useTimingNiches();
  const { sources: allTimingSources, refetch: refetchTimingSources } = useTimingSources('all');
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState(null);
  const [checked, setChecked] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState(null);

  function handleParse() {
    if (!text.trim()) return;
    const result = parseSummary(text, products, collectionObjects, allSparks, allResearchSessions, allTrendSignals, allVisualTags, allTimingNiches, allTimingSources);
    setParsed(result);
    const nextChecked = {};
    for (const key of ['sparks', 'stageUpdates', 'research', 'decisions', 'notes', 'concepts', 'trendSignals', 'visualLanguage', 'timing', 'filed']) {
      for (const item of result[key]) nextChecked[item.id] = true;
    }
    setChecked(nextChecked);
  }

  function toggle(id) {
    setChecked(prev => ({ ...prev, [id]: !prev[id] }));
  }

  async function handleSaveApproved() {
    setSaving(true);
    const now = nowISO();
    const today = nowISO().split('T')[0];
    const counts = { sparks: 0, stages: 0, research: 0, decisions: 0, concepts: 0, trendSignals: 0, visualLanguage: 0, timing: 0, filed: 0 };
    const errors = [];
    const stageDetails = [];

    // Import session — one row per paste, created only when the header
    // actually yielded a date or source (never a junk all-null row). Every
    // create call below threads this id through as session_id; when null,
    // every record's session_id just stays null, exactly like before this
    // phase existed.
    let sessionId = null;
    if (parsed.session?.date || parsed.session?.source) {
      const { data: importSession, error: sessionError } = await createImportSession({
        date: parsed.session.date,
        source: parsed.session.source,
        raw_text: text,
      });
      if (sessionError) errors.push(`Session metadata: ${sessionError.message}`);
      else sessionId = importSession?.id || null;
    }

    const createdSparks = [];
    for (const spark of parsed.sparks) {
      if (!checked[spark.id]) continue;
      const { data, error } = await createSpark(spark.content, { session_id: sessionId });
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
          session_id: sessionId,
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
          session_id: sessionId,
        },
        session.keywords
      );
      if (error) errors.push(`Research "${session.collection}": ${error.message}`);
      else counts.research++;
    }

    for (const d of parsed.decisions) {
      if (!checked[d.id]) continue;
      const { error } = await createWorkshopItem({ type: 'decision', content: d.content, source: 'Session Import', session_id: sessionId });
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
      const { data, error } = await createConcept({ ...fields, concept_code, session_id: sessionId });
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

    for (const signal of parsed.trendSignals) {
      if (!checked[signal.id]) continue;
      const { id, dupWarning, collectionMatched, ...fields } = signal;
      const { error } = await createTrendSignal({
        ...fields,
        score: 0,
        score_breakdown: {},
        first_spotted: today,
        last_updated: today,
        source: parsed.session?.source || null,
        session_id: sessionId,
      });
      if (error) errors.push(`Trend signal "${signal.name}": ${error.message}`);
      else counts.trendSignals++;
    }

    // TIMING INTELLIGENCE — creates the niche and/or source when the preview
    // said it would, then one append-only guidance row. Both provenance
    // columns are written on every row and are never the same thing:
    // source_id is who made the claim, import_session_id is the paste that
    // carried it here.
    for (const t of parsed.timing) {
      if (!checked[t.id]) continue;

      let nicheId = t.nicheId;
      if (!nicheId) {
        const { data, error } = await createTimingNiche(t.nicheName);
        if (error || !data) { errors.push(`Timing "${t.nicheName}": ${error?.message || 'could not create niche'}`); continue; }
        nicheId = data.id;
      }

      let sourceId = t.sourceId;
      if (!sourceId) {
        const { data, error } = await createTimingSource({
          name: t.sourceName,
          // A source first seen inside a paste is recorded as expert guidance
          // only when the paste said so; otherwise it is what it actually is.
          source_type: t.evidenceType === 'expert_guidance' ? 'expert_guidance' : 'chatgpt_session',
        });
        if (error || !data) { errors.push(`Timing "${t.nicheName}": ${error?.message || 'could not create source'}`); continue; }
        sourceId = data.id;
      }

      const { data: guidanceRow, error: gErr } = await createTimingGuidance({
        source_id: sourceId,
        niche_id: nicheId,
        source_niche_label: t.nicheName,
        guidance_state: t.guidanceState,
        month: t.month,
        day: t.day,
        date_precision: t.datePrecision,
        classification: t.classification,
        evidence_type: t.evidenceType,
        guidance_text: t.guidanceText || null,
        import_session_id: sessionId,
      });
      if (gErr || !guidanceRow) { errors.push(`Timing "${t.nicheName}": ${gErr?.message || 'could not save guidance'}`); continue; }
      counts.timing++;

      // Filed unclassified: which of the five guidance types a sentence
      // belongs to is a human call, and a pasted note is no more
      // self-classifying than a printed one.
      if (t.guidanceText) {
        await createTimingGuidanceNote(guidanceRow.id, null, t.guidanceText);
      }

      // Only when the paste named a collection AND it resolved — and even
      // then it counts as deliberate because she approved this item in the
      // preview before saving.
      if (t.collectionId) {
        const { error: linkErr } = await linkTimingNicheToCollection(nicheId, t.collectionId);
        if (linkErr && !linkErr.message?.toLowerCase().includes('duplicate')) {
          errors.push(`Timing "${t.nicheName}" collection link: ${linkErr.message}`);
        }
      }
    }
    if (counts.timing) { await refetchTimingNiches(); await refetchTimingSources(); }

    for (const vl of parsed.visualLanguage) {
      if (!checked[vl.id]) continue;
      let itemError = null;
      for (const tagName of vl.tagNames) {
        const { data: tag, error: tagError } = await createVisualTag(tagName);
        if (tagError || !tag) { itemError = tagError; continue; }
        const { error: applyError } = await applyTagToCollection(vl.collectionId, tag.id);
        // A duplicate-key error here just means this tag's already applied
        // to this collection — treat as a no-op success, not an error.
        if (applyError && !applyError.message?.toLowerCase().includes('duplicate')) {
          itemError = applyError;
        }
      }
      if (itemError) errors.push(`Visual language "${vl.collection}": ${itemError.message}`);
      else counts.visualLanguage++;

      if (vl.notes) {
        const { error } = await createWorkshopItem({
          type: 'note',
          content: `[Visual Language — ${vl.collection}] ${vl.notes}`,
          source: 'Session Import',
          session_id: sessionId,
        });
        if (!error) counts.filed++;
      }
    }

    for (const item of parsed.filed) {
      if (!checked[item.id]) continue;
      const { error } = await createWorkshopItem({
        type: 'unparseable',
        content: `[${item.section}] ${item.line}`,
        source: 'Session Import',
        session_id: sessionId,
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
        const { error } = await createWorkshopItem({ type: 'note', content: `• ${combined}`, source: 'Session Import', session_id: sessionId });
        if (error) errors.push(`Notes: ${error.message}`);
        else notesResult = { count: checkedNoteTexts.length, target: null, type: 'workshop' };
      }
    }

    setSaveResult({ ...counts, stageDetails, notesResult, errors });
    setSaving(false);
  }

  if (saveResult) {
    const total = saveResult.sparks + saveResult.stages + saveResult.research + saveResult.decisions
      + saveResult.concepts + saveResult.trendSignals + saveResult.visualLanguage + saveResult.timing + saveResult.filed + (saveResult.notesResult?.count || 0);
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
          {saveResult.trendSignals > 0 && (
            <div style={{ fontSize: '0.85rem' }}>✓ {saveResult.trendSignals} trend signal{saveResult.trendSignals !== 1 ? 's' : ''} added</div>
          )}
          {saveResult.timing > 0 && (
            <div style={{ fontSize: '0.85rem' }}>✓ {saveResult.timing} timing guidance entr{saveResult.timing !== 1 ? 'ies' : 'y'} recorded</div>
          )}
          {saveResult.visualLanguage > 0 && (
            <div style={{ fontSize: '0.85rem' }}>✓ {saveResult.visualLanguage} visual language update{saveResult.visualLanguage !== 1 ? 's' : ''} applied</div>
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

TREND SIGNALS
- Signal Name: ...
  Collection: Mom Chapter (optional)
  Niche: ... (optional)
  Status: watch (optional — pursue/watch/timing/saturated/discarded)
  Evidence: ... (optional)

VISUAL LANGUAGE
- Collection: Mom Chapter
  Tags: cottagecore, retro, dopamine dressing
  Notes: ... (optional)

TIMING INTELLIGENCE
- Niche: Hockey Mom
  Source: Taylor POD Calendar
  Timing: START
  Month: September (optional)
  Day: 15 (optional)
  Evidence: expert guidance (optional — defaults to hypothesis)
  Classification: low competition (optional)
  Guidance: Begin research/design ahead of hockey season. (optional)
  Collection: Hockey (optional)

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

      <SessionBanner session={parsed.session} />

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

      {parsed.trendSignals.length > 0 && (
        <PreviewSection title={`Trend Signals (${parsed.trendSignals.length})`}>
          {parsed.trendSignals.map(s => (
            <PreviewRow
              key={s.id}
              checked={!!checked[s.id]}
              onToggle={() => toggle(s.id)}
              annotation={
                <>
                  {s.collection && (
                    <span style={{ color: s.collectionMatched ? '#2d6b3c' : '#7a4a1e' }}>
                      {s.collectionMatched
                        ? `→ collection matched: "${s.collection}"`
                        : `⚠ collection "${s.collection}" not found — will save as typed`}
                    </span>
                  )}
                  {s.dupWarning && (
                    <div style={{ color: '#7a4a1e' }}>
                      ⚠ A signal named "{s.name}" already exists{s.collection ? ` in ${s.collection}` : ''} — this will create a duplicate; uncheck if you meant to update the existing one instead.
                    </div>
                  )}
                </>
              }
            >
              {s.name}{s.parent_niche ? ` — ${s.parent_niche}` : ''}
            </PreviewRow>
          ))}
        </PreviewSection>
      )}

      {parsed.visualLanguage.length > 0 && (
        <PreviewSection title={`Visual Language (${parsed.visualLanguage.length})`}>
          {parsed.visualLanguage.map(vl => (
            <PreviewRow
              key={vl.id}
              checked={!!checked[vl.id]}
              onToggle={() => toggle(vl.id)}
              annotation={
                <>
                  <span style={{ color: '#2d6b3c' }}>→ collection: "{vl.collection}"</span>
                  {vl.existingMatched.length > 0 && (
                    <div style={{ color: '#2d6b3c' }}>✓ {vl.existingMatched.length} existing tag{vl.existingMatched.length !== 1 ? 's' : ''} matched: {vl.existingMatched.join(', ')}</div>
                  )}
                  {vl.willCreate.length > 0 && (
                    <div style={{ color: '#2d4270' }}>+ will create {vl.willCreate.length} new tag{vl.willCreate.length !== 1 ? 's' : ''}: {vl.willCreate.join(', ')}</div>
                  )}
                  {vl.notes && <div style={{ color: 'var(--charcoal-soft)' }}>📝 Notes will file to Workshop, referencing {vl.collection}</div>}
                </>
              }
            >
              {vl.tagNames.join(', ')}
            </PreviewRow>
          ))}
        </PreviewSection>
      )}

      {parsed.timing.length > 0 && (
        <PreviewSection title={`Timing Intelligence (${parsed.timing.length})`}>
          {parsed.timing.map(t => (
            <PreviewRow
              key={t.id}
              checked={!!checked[t.id]}
              onToggle={() => toggle(t.id)}
              annotation={
                <>
                  {/* Who is claiming it, always — the whole reason this
                      section exists rather than the catch-all. */}
                  <span style={{ color: '#2d6b3c' }}>→ source: &quot;{t.sourceName}&quot;</span>
                  {t.willCreateSource && <span style={{ color: '#2d4270' }}> (will be created)</span>}
                  <div style={{ color: t.willCreateNiche ? '#2d4270' : '#2d6b3c' }}>
                    {t.willCreateNiche ? '+ will create new niche' : '✓ matches existing niche'}: {t.nicheName}
                  </div>
                  {/* Evidence strength is stated in the preview every time,
                      because the default is the weakest value and that must be
                      visible before she approves rather than discovered after. */}
                  <div style={{ color: t.evidenceType === 'hypothesis' ? '#7a4a1e' : 'var(--charcoal-soft)' }}>
                    evidence: {t.evidenceType.replace('_', ' ')}
                    {!t.evidenceWasExplicit && ' (defaulted — add an "Evidence:" line to record this as an observation or expert guidance)'}
                  </div>
                  {t.monthRaw && !t.month && (
                    <div style={{ color: '#7a4a1e' }}>⚠ month &quot;{t.monthRaw}&quot; not recognised — will save without a month</div>
                  )}
                  {t.collectionName && <div style={{ color: '#2d6b3c' }}>✓ will link to collection: {t.collectionName}</div>}
                  {t.collectionWarning && <div style={{ color: '#7a4a1e' }}>⚠ {t.collectionWarning}</div>}
                  {t.guidanceText && (
                    <div style={{ color: 'var(--charcoal-soft)' }}>
                      📝 guidance saved verbatim, filed unclassified for you to type in Knowledge → Timing
                    </div>
                  )}
                </>
              }
            >
              {t.nicheName} — <strong>{t.guidanceState}</strong>
              {t.month ? ` · month ${t.month}${t.day ? ` day ${t.day}` : ''}` : ''}
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

// Session provenance banner — mirrors the matched/unmatched color language
// already used for Stage Updates / Source Spark / Related Research above
// (green = confirmed, amber = warn-not-block), just at document level
// instead of per-row since there's nothing here to individually check/
// uncheck — it's metadata for everything below, not an item of its own.
function SessionBanner({ session }) {
  if (!session) return null;
  const { date, dateRaw, source } = session;
  const willAttach = !!(date || source);
  const dateFoundButUnparseable = !!dateRaw && !date;

  return (
    <div style={{ marginBottom: 18 }}>
      <div className="eyebrow" style={{ marginBottom: 6 }}>Session</div>
      {willAttach ? (
        <>
          <div style={{ fontSize: '0.82rem', color: '#2d6b3c' }}>
            ✓ Will attach to everything saved below: {date || 'no date'}{source ? ` — ${source}` : ''}
          </div>
          {dateFoundButUnparseable && (
            <div style={{ fontSize: '0.72rem', color: '#7a4a1e', marginTop: 2 }}>
              ⚠ Found a DATE line ("{dateRaw}") but couldn't parse it as a date — saving without a session date.
            </div>
          )}
        </>
      ) : (
        <div style={{ fontSize: '0.78rem', color: '#7a4a1e' }}>
          ⚠ {dateFoundButUnparseable
            ? `Found a DATE line ("${dateRaw}") but couldn't parse it, and no SOURCE line — `
            : 'No DATE:/SOURCE: header found — '}
          items below will save without session provenance.
        </div>
      )}
    </div>
  );
}
