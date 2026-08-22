import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { updateCollection, useSparks, useProducts, useResearchSessions, useTrendSignals, useConcepts, useVisualTags, useCollectionTags, createVisualTag, applyTagToCollection, removeTagFromCollection } from '../lib/hooks';
import { useCollectionsContext } from '../context/CollectionsContext';
import ConceptChatImport from '../components/ConceptChatImport';
import VisualTagPicker from '../components/VisualTagPicker';
import KeywordDetail from '../components/KeywordDetail';
import { ClassificationBadge, ConfidenceBadge, StatusBadge, TrendIndicator, DisagreementFlag } from '../lib/keywords';
import { buildContextHeader, field, section } from '../lib/context';
import CollectionTiming from '../components/CollectionTiming';

// Duplicated from Research.jsx/ResearchSessionForm.jsx (already-flagged drift,
// not fixed here — see this phase's Risks notes) rather than an odd
// page-importing-page dependency for one constant. This copy uses the more
// complete 9-item list (includes 4th of July).
const SEASONS = ['Halloween', 'Christmas', "Valentine's Day", "Mother's Day", 'Back to School', '4th of July', 'Summer', 'Spring', 'Fall'];

// Template-based sentence assembly from real classification counts — same
// house style as keywordIntelligence.js's explainKeyword(), not free-
// generation. Nothing here is invented; it only describes counts already
// computed by classifyKeyword() and stored on each keyword.
function buildOpportunitySummary(keywords) {
  const classified = keywords.filter(k => k.classification);
  if (!classified.length) {
    return keywords.length
      ? 'No classified keywords yet — run "Recompute Classifications" from the Research page’s Keywords tab.'
      : 'No keywords researched for this collection yet.';
  }
  const counts = {};
  for (const k of classified) counts[k.classification] = (counts[k.classification] || 0) + 1;
  const strong = counts['Strong Unicorn'] || 0;
  const emerging = counts['Emerging Unicorn'] || 0;
  const evergreen = counts['Evergreen'] || 0;
  const seasonal = counts['Seasonal'] || 0;
  const watchlist = counts['Watchlist'] || 0;
  const suspect = counts['Suspect / Low Confidence'] || 0;
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

  const sentences = [];
  if (strong || emerging) {
    const parts = [];
    if (strong) parts.push(`${plural(strong, 'strong unicorn')}`);
    if (emerging) parts.push(`${plural(emerging, 'emerging unicorn')}`);
    sentences.push(`This collection has ${parts.join(' and ')} worth prioritizing.`);
  } else {
    sentences.push('No unicorn-tier keywords identified yet in this collection.');
  }
  if (evergreen) sentences.push(`${plural(evergreen, 'evergreen keyword')} provide${evergreen === 1 ? 's' : ''} a stable foundation.`);
  if (seasonal) sentences.push(`${plural(seasonal, 'keyword')} ${seasonal === 1 ? 'is' : 'are'} seasonal — time listings around ${seasonal === 1 ? 'its' : 'their'} window.`);
  if (suspect) sentences.push(`${plural(suspect, 'keyword')} ${suspect === 1 ? 'is' : 'are'} flagged Suspect / Low Confidence and need${suspect === 1 ? 's' : ''} a closer look before relying on ${suspect === 1 ? 'it' : 'them'}.`);
  if (watchlist) sentences.push(`${plural(watchlist, 'keyword')} ${watchlist === 1 ? 'is' : 'are'} still on the Watchlist, pending more evidence.`);
  return sentences.join(' ');
}

const EVAL_FIELDS = [
  { key: 'evaluation_market_evidence',         label: 'Market evidence' },
  { key: 'evaluation_human_truth',             label: 'Human truth' },
  { key: 'evaluation_tcc_brand_fit',           label: 'TCC brand fit' },
  { key: 'evaluation_expandability',           label: 'Expandability' },
  { key: 'evaluation_long_term_opportunity',   label: 'Long-term opportunity vs competition' },
];

const PRIORITY_OPTIONS = [
  { value: 'flagship',   label: '⭐ Flagship' },
  { value: 'priority_1', label: 'Priority 1 — Build now' },
  { value: 'priority_2', label: 'Priority 2 — Build next' },
  { value: 'supporting', label: 'Supporting' },
  { value: 'archived',   label: 'Archived' },
];

const STATUS_OPTIONS = ['active', 'planned', 'archived'];

// ── Context Bundle — "Copy Context for AI" ──────────────────────────────────
// Same pattern as ProductWorkspace.jsx's ContextBundle: assemble a labeled
// plain-text block, copy it to the clipboard for pasting into an external
// Claude/ChatGPT conversation. field()/section() omit anything empty rather
// than printing blank labels or dangling headings.
function CollectionContextBundle({ collection, concepts, collectionProducts, liveProducts, inProgressProducts, collectionSparks, sessions, collSignals, evalScore }) {
  const [copied, setCopied] = useState(null);

  function buildBundle() {
    const identityBlock = [
      field('What this collection stands for', collection.identity),
      field('Expansion opportunities', collection.expansion_opportunities),
    ].filter(Boolean).join('\n');

    const evalLine = evalScore > 0
      ? `EVALUATION (${evalScore}/5 confirmed): ${EVAL_FIELDS.filter(f => collection[f.key]).map(f => f.label).join(', ')}`
      : '';

    // Same bucket data the on-screen Keyword Coverage block uses, but Top B1
    // is genuinely the highest-scored keyword here — the on-screen version
    // takes whichever is first in array order. On-screen display untouched.
    let keywordBlock = '';
    if (sessions && sessions.length > 0) {
      const allKws = sessions.flatMap(s => s.keywords || []);
      const b1 = allKws.filter(k => k.bucket === 1).sort((a, b) => (b.score || 0) - (a.score || 0));
      const b2 = allKws.filter(k => k.bucket === 2);
      const b3 = allKws.filter(k => k.bucket === 3);
      const topB1 = b1[0];
      if (b1.length || b2.length || b3.length) {
        keywordBlock = `B1: ${b1.length} · B2: ${b2.length} · B3: ${b3.length} (${sessions.length} session${sessions.length !== 1 ? 's' : ''})${topB1 ? `\nTop B1: ${topB1.keyword}${topB1.volume ? ` (vol ${topB1.volume.toLocaleString()})` : ''}` : ''}`;
      } else {
        keywordBlock = `${allKws.length} keywords logged across ${sessions.length} session${sessions.length !== 1 ? 's' : ''} — not yet bucketed into B1/B2/B3.`;
      }
    }

    const conceptsBlock = concepts.map(c => `${c.name}${c.concept_code ? ` (${c.concept_code})` : ''}`).join('\n');
    const productsBlock = collectionProducts.map(p => `${p.name} — ${p.stage}`).join('\n');

    const visibleSparks = collectionSparks.slice(0, 6);
    const sparksBlock = [
      ...visibleSparks.map(s => s.content.length > 80 ? s.content.slice(0, 80) + '…' : s.content),
      collectionSparks.length > 6 ? `+${collectionSparks.length - 6} more (see Collection page for full list)` : '',
    ].filter(Boolean).join('\n');

    return `${buildContextHeader('Collection', [`Collection: ${collection.name}`])}
Priority: ${PRIORITY_OPTIONS.find(p => p.value === (collection.priority || 'supporting'))?.label || 'Supporting'}
Status: ${collection.status.charAt(0).toUpperCase() + collection.status.slice(1)}
${field('Chapter', collection.chapter)}

${section('IDENTITY', identityBlock)}

${evalLine}

${section('KEYWORD COVERAGE', keywordBlock)}

${section(`TREND SIGNALS (${collSignals.length})`, collSignals.map(s => `${s.name} — ${s.status}`).join('\n'))}

${section(`CONCEPTS (${concepts.length})`, conceptsBlock)}

${section(`PRODUCTS (${liveProducts.length} live · ${inProgressProducts.length} in progress)`, productsBlock)}

${section(`SPARKS (${collectionSparks.length})`, sparksBlock)}

${section('NOTES', collection.notes)}
--- END CONTEXT ---`.replace(/\n{3,}/g, '\n\n');
  }

  function handleCopy(variant) {
    navigator.clipboard.writeText(buildBundle());
    setCopied(variant);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div style={{ marginBottom: 24 }}>
      <div className="section-label" style={{ marginBottom: 10 }}>Context Bundle</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="btn btn-ghost btn-sm" onClick={() => handleCopy('claude')}>📋 Copy Context for Claude</button>
        <button className="btn btn-ghost btn-sm" onClick={() => handleCopy('chatgpt')}>📋 Copy Context for ChatGPT</button>
        {copied && <span className="inline-confirm">Copied to clipboard ✓</span>}
      </div>
    </div>
  );
}

export default function CollectionDetail() {
  const { name: encodedName } = useParams();
  const name = decodeURIComponent(encodedName);
  const navigate = useNavigate();

  const { collectionObjects: collections, collectionObjectsLoading: colLoading, refetchCollectionObjects: refetch } = useCollectionsContext();
  const { sparks } = useSparks();
  const { products } = useProducts();
  const { sessions, refetch: refetchSessions } = useResearchSessions(name);
  const { signals } = useTrendSignals();

  const collection = collections.find(c => c.name === name);

  const { concepts, loading: conceptsLoading, refetch: refetchConcepts } = useConcepts(name);
  const { tags: allVisualTags } = useVisualTags();
  const { tags: collectionTags, refetch: refetchCollectionTags } = useCollectionTags(collection?.id);

  const [activeTab, setActiveTab] = useState('overview');
  const [showImport, setShowImport] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [fieldSaved, setFieldSaved] = useState('');
  const [selectedKeywordId, setSelectedKeywordId] = useState(null);

  useEffect(() => {
    if (collection && !form) {
      setForm({ ...collection });
    }
  }, [collection]);

  if (colLoading) return <div className="page"><div style={{ color: 'var(--charcoal-soft)', padding: 24 }}>Loading…</div></div>;
  if (!collection) return <div className="page"><div style={{ color: 'var(--charcoal-soft)', padding: 24 }}>Collection not found.</div></div>;

  const collectionSparks = sparks.filter(s => s.collection_tag === name && !s.archived_at);
  const collectionProducts = products.filter(p => p.collection === name && !['Killed'].includes(p.stage));
  const liveProducts = collectionProducts.filter(p => p.stage === 'Live' || p.stage === 'Reviewing');
  const inProgressProducts = collectionProducts.filter(p => !['Live', 'Reviewing', 'Killed', 'Paused'].includes(p.stage));
  const collSignals = signals.filter(s => s.collection === name || s.parent_niche === name);

  const evalScore = EVAL_FIELDS.filter(f => collection[f.key]).length;
  const allChecked = evalScore === 5;

  async function handleSave() {
    if (!form) return;
    setSaving(true);
    await updateCollection(collection.id, form);
    setSaving(false);
    setSaved(true);
    setEditing(false);
    refetch();
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleEvalToggle(field) {
    const updated = { [field]: !collection[field] };
    await updateCollection(collection.id, updated);
    setFieldSaved(field);
    refetch();
    setTimeout(() => setFieldSaved(''), 1500);
  }

  async function handleFieldBlur(field, value) {
    await updateCollection(collection.id, { [field]: value || null });
    setFieldSaved(field);
    refetch();
    setTimeout(() => setFieldSaved(''), 1500);
  }

  async function handleAddCollectionTag(tag) {
    let tagId = tag.id;
    if (!tagId) {
      const { data, error } = await createVisualTag(tag.name, tag.kind || null);
      if (error || !data) return;
      tagId = data.id;
    }
    await applyTagToCollection(collection.id, tagId);
    refetchCollectionTags();
  }

  async function handleRemoveCollectionTag(tag) {
    await removeTagFromCollection(collection.id, tag.id);
    refetchCollectionTags();
  }

  async function handleArchive() {
    await updateCollection(collection.id, { status: 'archived', priority: 'archived' });
    refetch();
    navigate('/collections');
  }

  const priorityLabel = PRIORITY_OPTIONS.find(p => p.value === (collection.priority || 'supporting'))?.label || 'Supporting';

  return (
    <div className="page">
      <div className="page-header">
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => navigate('/collections')}
          style={{ marginBottom: 12, padding: '4px 0', fontSize: '0.75rem' }}
        >
          ← Collections
        </button>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div className="page-title">{collection.name}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--charcoal-soft)', marginTop: 4 }}>
              {collection.chapter && <span>{collection.chapter} · </span>}
              <span>{priorityLabel}</span>
              {collection.status === 'planned' && <span> · Planned</span>}
            </div>
          </div>
          {saved && <span className="inline-confirm">Saved ✓</span>}
        </div>
      </div>

      {/* ── Quick Actions ── */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <button className="btn btn-primary btn-sm" onClick={() => navigate(`/research?collection=${encodeURIComponent(name)}`)}>+ Research Session</button>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/listing-builder?collection=${encodeURIComponent(name)}`)}>Build Listing</button>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/sparks?collection=${encodeURIComponent(name)}`)}>Add Spark</button>
      </div>

      {/* ── Tab Bar ── */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid rgba(43,41,38,0.12)', marginBottom: 20 }}>
        {[['overview', 'Overview'], ['concepts', `Concepts${concepts.length ? ` (${concepts.length})` : ''}`], ['research', 'Research']].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            style={{
              padding: '8px 16px', background: 'none', border: 'none', cursor: 'pointer',
              fontSize: '0.8rem', fontWeight: activeTab === key ? 600 : 400,
              color: activeTab === key ? 'var(--warm-charcoal)' : 'var(--charcoal-soft)',
              borderBottom: activeTab === key ? '2px solid var(--warm-charcoal)' : '2px solid transparent',
              marginBottom: -1,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Concepts Tab ── */}
      {activeTab === 'concepts' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--charcoal-soft)' }}>
              Design concepts for {name}
            </div>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => setShowImport(true)}
            >
              + Import Concept
            </button>
          </div>

          {showImport && (
            <div style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200,
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
            }}>
              <div style={{ background: 'var(--warm-white)', borderRadius: 10, maxWidth: 700, width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
                <ConceptChatImport
                  onSaved={() => { refetchConcepts(); setShowImport(false); }}
                  onClose={() => setShowImport(false)}
                />
              </div>
            </div>
          )}

          {conceptsLoading ? (
            <div style={{ color: 'var(--charcoal-soft)', fontSize: '0.82rem' }}>Loading…</div>
          ) : concepts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--charcoal-soft)' }}>
              <div style={{ fontSize: '0.9rem', marginBottom: 8 }}>No concepts yet</div>
              <div style={{ fontSize: '0.75rem', marginBottom: 16 }}>Import a concept from ChatGPT to get started</div>
              <button className="btn btn-primary btn-sm" onClick={() => setShowImport(true)}>+ Import Concept</button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
              {concepts.map(c => <ConceptCard key={c.id} concept={c} />)}
            </div>
          )}
        </div>
      )}

      {/* ── Research Tab ── */}
      {activeTab === 'research' && (() => {
        // Dedup by keyword text — same convention as Research.jsx's Keywords
        // tab. Without this, a keyword imported across multiple sessions
        // (including legacy pre-Phase-19 duplicate rows, before
        // createResearchSession() merged on collection+text) shows as
        // repeated rows and inflates the Opportunity Summary's counts.
        const dedupMap = new Map();
        for (const s of sessions) {
          for (const k of (s.keywords || [])) {
            const key = (k.keyword || '').toLowerCase().trim();
            if (!key) continue;
            if (!dedupMap.has(key)) dedupMap.set(key, { primary: k, sources: [] });
            const entry = dedupMap.get(key);
            if (s.source && !entry.sources.includes(s.source)) entry.sources.push(s.source);
            if (k.bucket && !entry.primary.bucket) entry.primary = k;
          }
        }
        const allKws = [...dedupMap.values()].map(({ primary, sources }) => ({ ...primary, _sources: sources }));
        const summary = buildOpportunitySummary(allKws);
        return (
          <div>
            <p style={{ fontSize: '0.85rem', lineHeight: 1.6, color: 'var(--warm-charcoal)', marginBottom: 16, background: 'var(--charcoal-faint)', padding: '12px 14px', borderRadius: 4 }}>
              {summary}
            </p>

            {allKws.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--charcoal-soft)' }}>
                <div style={{ fontSize: '0.9rem', marginBottom: 12 }}>No research yet</div>
                <button className="btn btn-primary btn-sm" onClick={() => navigate(`/research?collection=${encodeURIComponent(name)}`)}>+ Research Session</button>
              </div>
            ) : (
              <>
                <div style={{ overflowX: 'auto', marginBottom: 12 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 640 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(160px, 1fr) 60px 70px 118px 62px 90px 110px', gap: 8, padding: '4px 8px', fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--charcoal-soft)' }}>
                      <span>Keyword</span><span>Vol</span><span>Comp</span><span>Classification</span><span>Conf.</span><span>Status</span><span>Source</span>
                    </div>
                    {[...allKws].sort((a, b) => (b.volume || 0) - (a.volume || 0)).map(k => (
                      <div
                        key={k.id}
                        onClick={() => setSelectedKeywordId(k.id)}
                        title="Click for classification, source comparison, and history"
                        style={{ display: 'grid', gridTemplateColumns: 'minmax(160px, 1fr) 60px 70px 118px 62px 90px 110px', gap: 8, padding: '6px 8px', background: 'var(--warm-white)', border: '1px solid rgba(43,41,38,0.07)', borderRadius: 3, alignItems: 'center', cursor: 'pointer', fontSize: '0.78rem' }}
                      >
                        <span style={{ fontWeight: 500 }}>{k.keyword}</span>
                        <span style={{ color: 'var(--charcoal-soft)', fontSize: '0.72rem' }}>{k.volume?.toLocaleString() ?? '—'}</span>
                        <span style={{ color: 'var(--charcoal-soft)', fontSize: '0.72rem' }}>{k.competition?.toLocaleString() ?? '—'}</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 3, overflow: 'hidden' }}>
                          <ClassificationBadge classification={k.classification} />
                          <TrendIndicator trend={k.trend_classification} />
                          <DisagreementFlag flag={k.disagreement_flag} />
                        </span>
                        <span><ConfidenceBadge confidence={k.confidence} /></span>
                        <span><StatusBadge status={k.research_status} /></span>
                        <span style={{ fontSize: '0.68rem', color: 'var(--charcoal-soft)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k._sources.join(', ') || '—'}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/research?collection=${encodeURIComponent(name)}`)}>
                  Open full Keywords tab →
                </button>
              </>
            )}

            {selectedKeywordId && (
              <KeywordDetail
                keywordId={selectedKeywordId}
                onClose={() => setSelectedKeywordId(null)}
                onUpdated={refetchSessions}
              />
            )}
          </div>
        );
      })()}

      {activeTab === 'overview' && <>

      <hr className="rule" />

      {/* ── Evaluation ── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div className="section-label" style={{ margin: 0 }}>Evaluation</div>
          <span style={{
            fontSize: '0.62rem', padding: '2px 8px', borderRadius: 20,
            background: allChecked ? 'rgba(124,175,138,0.15)' : 'rgba(232,168,124,0.2)',
            color: allChecked ? '#2d6b3c' : '#7a4a1e',
          }}>
            {evalScore}/5 {allChecked ? 'complete' : 'needs evaluation'}
          </span>
        </div>
        {EVAL_FIELDS.map(f => (
          <button
            key={f.key}
            onClick={() => handleEvalToggle(f.key)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, width: '100%',
              background: 'none', border: 'none', cursor: 'pointer', padding: '7px 0',
              borderBottom: '1px solid rgba(43,41,38,0.06)', textAlign: 'left',
            }}
          >
            <span style={{
              width: 18, height: 18, borderRadius: 3, flexShrink: 0,
              border: `2px solid ${collection[f.key] ? 'var(--success)' : 'rgba(43,41,38,0.2)'}`,
              background: collection[f.key] ? 'var(--success)' : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {collection[f.key] && <span style={{ color: 'white', fontSize: '0.6rem', fontWeight: 800 }}>✓</span>}
            </span>
            <span style={{ fontSize: '0.82rem', color: collection[f.key] ? 'var(--warm-charcoal)' : 'var(--charcoal-soft)' }}>
              {f.label}
            </span>
            {fieldSaved === f.key && <span className="inline-confirm" style={{ marginLeft: 'auto', fontSize: '0.65rem' }}>✓</span>}
          </button>
        ))}
      </div>

      <hr className="rule" />

      {/* ── Identity & Details ── */}
      <div style={{ marginBottom: 24 }}>
        <div className="section-label" style={{ marginBottom: 12 }}>Identity</div>
        <div className="form-group">
          <label className="form-label">
            What this collection stands for
            {fieldSaved === 'identity' && <span className="inline-confirm" style={{ marginLeft: 6 }}>✓</span>}
          </label>
          <textarea
            defaultValue={collection.identity || ''}
            onBlur={e => handleFieldBlur('identity', e.target.value)}
            rows={3}
            placeholder="What this collection stands for, who it's for, what feeling it captures…"
            style={{ fontSize: '0.82rem' }}
          />
        </div>
        <div className="form-group">
          <label className="form-label">
            Expansion opportunities
            {fieldSaved === 'expansion_opportunities' && <span className="inline-confirm" style={{ marginLeft: 6 }}>✓</span>}
          </label>
          <input
            defaultValue={collection.expansion_opportunities || ''}
            onBlur={e => handleFieldBlur('expansion_opportunities', e.target.value)}
            placeholder="e.g. Apparel, mugs, totes, bookmarks, journals, printables"
          />
        </div>
      </div>

      <hr className="rule" />

      {/* ── Visual Style ── */}
      <div style={{ marginBottom: 24 }}>
        <div className="section-label" style={{ marginBottom: 12 }}>Visual Style</div>
        <div className="form-group">
          <label className="form-label">Visual Tags</label>
          <VisualTagPicker allTags={allVisualTags} appliedTags={collectionTags} onAdd={handleAddCollectionTag} onRemove={handleRemoveCollectionTag} />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">
            Style Guide
            {fieldSaved === 'style_guide' && <span className="inline-confirm" style={{ marginLeft: 6 }}>✓</span>}
          </label>
          <textarea
            defaultValue={collection.style_guide || ''}
            onBlur={e => handleFieldBlur('style_guide', e.target.value)}
            rows={6}
            placeholder="Aesthetic, colors, typography, motifs, vibe…"
            style={{ fontSize: '0.82rem', fontFamily: 'inherit' }}
          />
        </div>
      </div>

      <hr className="rule" />

      {/* ── Priority & Status ── */}
      <div style={{ marginBottom: 24 }}>
        <div className="section-label" style={{ marginBottom: 12 }}>Priority & Status</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Priority</label>
            <select
              value={collection.priority || 'supporting'}
              onChange={e => updateCollection(collection.id, { priority: e.target.value }).then(() => refetch())}
            >
              {PRIORITY_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Status</label>
            <select
              value={collection.status || 'active'}
              onChange={e => updateCollection(collection.id, { status: e.target.value }).then(() => refetch())}
            >
              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
            </select>
          </div>
        </div>
        <div className="form-group" style={{ marginTop: 12, marginBottom: 0 }}>
          <label className="form-label">
            Chapter
            {fieldSaved === 'chapter' && <span className="inline-confirm" style={{ marginLeft: 6 }}>✓</span>}
          </label>
          <input
            defaultValue={collection.chapter || ''}
            onBlur={e => handleFieldBlur('chapter', e.target.value)}
            placeholder="e.g. Reader, Mom, Kids"
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: collection.season ? '1fr 1fr' : '1fr', gap: 12, marginTop: 12 }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Season</label>
            <select
              value={collection.season || ''}
              onChange={e => updateCollection(collection.id, { season: e.target.value || null }).then(() => refetch())}
            >
              <option value="">— Evergreen —</option>
              {SEASONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          {collection.season && (
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Target Launch</label>
              <input
                type="date"
                value={collection.launch_date || ''}
                onChange={e => updateCollection(collection.id, { launch_date: e.target.value || null }).then(() => refetch())}
              />
            </div>
          )}
        </div>
      </div>

      <hr className="rule" />

      <CollectionTiming collection={collection} products={products} collections={collections} />

      <hr className="rule" />

      <CollectionContextBundle
        collection={collection}
        concepts={concepts}
        collectionProducts={collectionProducts}
        liveProducts={liveProducts}
        inProgressProducts={inProgressProducts}
        collectionSparks={collectionSparks}
        sessions={sessions}
        collSignals={collSignals}
        evalScore={evalScore}
      />

      <hr className="rule" />

      {/* ── Products ── */}
      <div style={{ marginBottom: 24 }}>
        <div className="section-label" style={{ marginBottom: 10 }}>
          Products ({liveProducts.length} live · {inProgressProducts.length} in progress)
        </div>
        {collectionProducts.length === 0 ? (
          <div style={{ fontSize: '0.82rem', color: 'var(--charcoal-soft)', fontStyle: 'italic' }}>
            No products yet — activate a spark to start.
          </div>
        ) : (
          collectionProducts.map(p => (
            <button
              key={p.id}
              onClick={() => navigate(`/products/${p.id}`)}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                width: '100%', background: 'none', border: 'none', cursor: 'pointer',
                padding: '8px 0', borderBottom: '1px solid rgba(43,41,38,0.06)',
                textAlign: 'left',
              }}
            >
              <span style={{ fontSize: '0.82rem' }}>{p.name}</span>
              <span style={{ fontSize: '0.65rem', color: 'var(--charcoal-soft)' }}>{p.stage}</span>
            </button>
          ))
        )}
      </div>

      <hr className="rule" />

      {/* ── Sparks ── */}
      <div style={{ marginBottom: 24 }}>
        <div className="section-label" style={{ marginBottom: 10 }}>
          Sparks ({collectionSparks.length})
        </div>
        {collectionSparks.length === 0 ? (
          <div style={{ fontSize: '0.82rem', color: 'var(--charcoal-soft)', fontStyle: 'italic' }}>No sparks assigned to this collection.</div>
        ) : (
          <>
            {collectionSparks.slice(0, 6).map(s => (
              <div key={s.id} style={{ fontSize: '0.82rem', padding: '6px 0', borderBottom: '1px solid rgba(43,41,38,0.06)', color: 'var(--charcoal-soft)' }}>
                {s.temperature === 'hot' && <span style={{ color: 'var(--dusty-rose)', marginRight: 6 }}>🔥</span>}
                {s.content.length > 80 ? s.content.slice(0, 80) + '…' : s.content}
              </div>
            ))}
            {collectionSparks.length > 6 && (
              <button
                className="btn btn-ghost btn-sm"
                style={{ marginTop: 8 }}
                onClick={() => navigate(`/sparks?collection=${encodeURIComponent(name)}`)}
              >
                View all {collectionSparks.length} sparks →
              </button>
            )}
          </>
        )}
      </div>

      <hr className="rule" />

      {/* ── Keyword Coverage ── */}
      {sessions && sessions.length > 0 && (() => {
        const allKws = sessions.flatMap(s => s.keywords || []);
        const b1 = allKws.filter(k => k.bucket === 1);
        const b2 = allKws.filter(k => k.bucket === 2);
        const b3 = allKws.filter(k => k.bucket === 3);
        const topB1 = b1[0];
        const hasBuckets = b1.length || b2.length || b3.length;
        const lastDate = sessions[0]?.date || sessions[0]?.created_at;
        return (
          <div style={{ marginBottom: 24 }}>
            <div className="section-label" style={{ marginBottom: 10 }}>Keyword Coverage</div>
            {hasBuckets ? (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                {[['B1', b1.length, '#2d6b3c', 'rgba(124,175,138,0.2)'], ['B2', b2.length, b2.length >= 3 ? '#2d6b3c' : '#7a4a1e', b2.length >= 3 ? 'rgba(124,175,138,0.12)' : 'rgba(232,168,124,0.2)'], ['B3', b3.length, b3.length > 0 ? '#2d6b3c' : '#7a2b2b', b3.length > 0 ? 'rgba(124,175,138,0.12)' : 'rgba(201,123,123,0.15)']].map(([label, count, color, bg]) => (
                  <span key={label} style={{ fontSize: '0.72rem', fontWeight: 500, padding: '3px 10px', borderRadius: 20, color, background: bg }}>
                    {label}: {count}
                  </span>
                ))}
                {topB1 && <span style={{ fontSize: '0.68rem', color: 'var(--charcoal-soft)', alignSelf: 'center' }}>Top B1: {topB1.keyword}{topB1.volume ? ` (vol ${topB1.volume.toLocaleString()})` : ''}</span>}
              </div>
            ) : (
              <div style={{ fontSize: '0.75rem', color: 'var(--charcoal-soft)', marginBottom: 10 }}>
                {allKws.length} keywords · Run Re-bucket in Research to classify B1/B2/B3
              </div>
            )}
            <div style={{ fontSize: '0.72rem', color: 'var(--charcoal-soft)', marginBottom: 10 }}>
              {sessions.length} session{sessions.length !== 1 ? 's' : ''}{lastDate ? ` · Last: ${new Date(lastDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/research?collection=${encodeURIComponent(name)}`)}>
              View research →
            </button>
          </div>
        );
      })()}

      {sessions && sessions.length === 0 && (
        <div style={{ marginBottom: 24 }}>
          <div className="section-label" style={{ marginBottom: 10 }}>Keyword Coverage</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--charcoal-soft)', marginBottom: 10 }}>No research sessions yet.</div>
        </div>
      )}

      <hr className="rule" />

      {/* ── Trend Signals ── */}
      {collSignals.length > 0 && (
        <>
          <div style={{ marginBottom: 24 }}>
            <div className="section-label" style={{ marginBottom: 10 }}>Trend Signals ({collSignals.length})</div>
            {collSignals.map(s => {
              const statusColors = { pursue: { bg: 'rgba(124,175,138,0.15)', color: '#2d6b3c' }, watch: { bg: 'rgba(107,130,168,0.12)', color: '#2d4270' }, timing: { bg: 'rgba(232,168,124,0.15)', color: '#7a4a1e' }, saturated: { bg: 'rgba(201,123,123,0.15)', color: '#7a2b2b' } };
              const sc = statusColors[s.status] || statusColors.watch;
              return (
                <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid rgba(43,41,38,0.06)', fontSize: '0.82rem' }}>
                  <span>{s.name}</span>
                  <span style={{ fontSize: '0.65rem', fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: sc.bg, color: sc.color }}>{s.status}</span>
                </div>
              );
            })}
            <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => navigate('/trends')}>
              View all signals →
            </button>
          </div>
          <hr className="rule" />
        </>
      )}

      {/* ── Notes ── */}
      <div style={{ marginBottom: 24 }}>
        <div className="section-label" style={{ marginBottom: 10 }}>
          Notes
          {fieldSaved === 'notes' && <span className="inline-confirm" style={{ marginLeft: 8 }}>✓</span>}
        </div>
        <textarea
          defaultValue={collection.notes || ''}
          onBlur={e => handleFieldBlur('notes', e.target.value)}
          rows={4}
          placeholder="Strategy notes, decisions, context…"
          style={{ fontSize: '0.82rem' }}
        />
      </div>

      <hr className="rule" />

      {/* ── Archive ── */}
      <div style={{ marginBottom: 40 }}>
        {confirmArchive ? (
          <div style={{ fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ color: 'var(--charcoal-soft)' }}>Archive this collection?</span>
            <button onClick={handleArchive} style={{ color: 'var(--alert)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer' }}>Archive</button>
            <button onClick={() => setConfirmArchive(false)} style={{ color: 'var(--charcoal-soft)', background: 'none', border: 'none', cursor: 'pointer' }}>Cancel</button>
          </div>
        ) : (
          <button
            className="btn btn-ghost btn-sm"
            style={{ color: 'var(--charcoal-soft)', opacity: 0.5, fontSize: '0.75rem' }}
            onClick={() => setConfirmArchive(true)}
          >
            Archive collection
          </button>
        )}
      </div>
      </>}
    </div>
  );
}

// ── Concept card ──────────────────────────────────────────────────────────────

function ConceptCard({ concept }) {
  const navigate = useNavigate();
  const kittlOutput = concept.concept_outputs?.find(o => o.output_type === 'kittl_prompt' && o.is_current);
  const outputCount = concept.concept_outputs?.length || 0;

  return (
    <div
      onClick={() => navigate(`/concepts/${concept.id}`)}
      style={{
        border: '1px solid rgba(43,41,38,0.12)', borderRadius: 8, padding: '14px 16px',
        background: 'var(--warm-white)', cursor: 'pointer',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{concept.name}</div>
        {concept.concept_code && (
          <span style={{ fontSize: '0.65rem', color: 'var(--charcoal-soft)', fontFamily: 'monospace', background: 'rgba(43,41,38,0.06)', padding: '2px 6px', borderRadius: 4 }}>
            {concept.concept_code}
          </span>
        )}
      </div>

      {concept.visual_style && (
        <div style={{ fontSize: '0.75rem', color: 'var(--charcoal-soft)', marginBottom: 4 }}>{concept.visual_style}</div>
      )}
      {concept.design_direction && (
        <div style={{ fontSize: '0.78rem', color: 'var(--warm-charcoal)', marginBottom: 8, lineHeight: 1.4 }}>
          {concept.design_direction.length > 100 ? concept.design_direction.slice(0, 100) + '…' : concept.design_direction}
        </div>
      )}

      {concept.mood_keywords?.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
          {concept.mood_keywords.slice(0, 5).map(k => (
            <span key={k} style={{ fontSize: '0.65rem', padding: '2px 7px', borderRadius: 20, background: 'rgba(107,130,168,0.12)', color: '#2d4270' }}>
              {k}
            </span>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
        {kittlOutput ? (
          <span style={{ fontSize: '0.68rem', color: '#2d6b3c', background: 'rgba(124,175,138,0.15)', padding: '2px 8px', borderRadius: 20 }}>
            Kittl prompt · {kittlOutput.output_source === 'imported' ? 'imported' : `v${kittlOutput.version}`}
          </span>
        ) : (
          <span style={{ fontSize: '0.68rem', color: 'var(--charcoal-soft)' }}>No Kittl prompt yet</span>
        )}
        {outputCount > 1 && (
          <span style={{ fontSize: '0.65rem', color: 'var(--charcoal-soft)' }}>{outputCount} outputs</span>
        )}
      </div>
    </div>
  );
}
