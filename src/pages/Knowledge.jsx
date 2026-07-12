import { useState, useEffect } from 'react';
import {
  useKnowledgeInbox, createInboxItem, updateInboxItem,
  usePlaybooks, updatePlaybookSection,
  usePendingUpdates, createPendingUpdate, approvePendingUpdate, rejectPendingUpdate,
  useExperiments, createExperiment, updateExperiment, closeExperiment,
  runCodexMigrationIfNeeded,
} from '../lib/hooks';
import { processWithClaude } from '../lib/claude';

const TABS = ['Inbox', 'Updates', 'Playbooks', 'Experiments', 'Proven Results'];

const INPUT_TYPES = [
  { key: 'session_summary', label: 'Session Summary', placeholder: 'Paste Claude/ChatGPT session summary…' },
  { key: 'research_note', label: 'Research Note', placeholder: 'Paste Everbee data, keyword research, or market findings…' },
  { key: 'cowork_paste', label: 'Cowork Paste', placeholder: 'Paste Cowork output…' },
  { key: 'manual_note', label: 'Manual Note', placeholder: 'Type a note, decision, or observation…' },
];

const PLAYBOOK_ORDER = [
  'product-research', 'design-standards', 'listing-photos',
  'seo-standards', 'pinterest-standards', 'etsy-ads', 'ai-workflows',
];

// ─── Inbox Tab ────────────────────────────────────────────────────────────────

function InboxTab({ onNewUpdate }) {
  // Fetch all non-dismissed items so processed items stay visible
  const { items, loading, refetch } = useKnowledgeInbox('all');
  const [inputType, setInputType] = useState('session_summary');
  const [content, setContent] = useState('');
  const [source, setSource] = useState('');
  const [adding, setAdding] = useState(false);
  const [processing, setProcessing] = useState(null);
  const [processResult, setProcessResult] = useState({});

  const typeInfo = INPUT_TYPES.find(t => t.key === inputType);

  const pendingItems = items.filter(i => i.status === 'pending');
  const processedItems = items.filter(i => i.status === 'processed');

  async function handleAdd() {
    if (!content.trim()) return;
    setAdding(true);
    const trimmedSource = source.trim();
    const urlInContent = !trimmedSource && content.match(/https?:\/\/\S+/)?.[0];
    const resolvedSource = trimmedSource || urlInContent || null;
    await createInboxItem({ input_type: inputType, content: content.trim(), url_type: resolvedSource, status: 'pending' });
    setContent('');
    setSource('');
    await refetch();
    setAdding(false);
  }

  async function handleProcess(item) {
    setProcessing(item.id);
    try {
      const { parsed, raw } = await processWithClaude(item.input_type, item.content);
      const result = parsed || { raw_only: true, raw };
      setProcessResult(prev => ({ ...prev, [item.id]: result }));
      await updateInboxItem(item.id, { status: 'processed', processed_at: new Date().toISOString() });

      // Create a pending update for every processed item so it appears in Updates tab
      const itemSource = item.url_type || item.input_type;
      const updates = parsed?.playbook_updates || [];
      if (updates.length) {
        for (const pu of updates) {
          await createPendingUpdate({
            source_type: item.input_type,
            source_id: item.id,
            source: itemSource,
            playbook_slug: pu.playbook_slug,
            section_key: pu.section_key,
            proposed_body: pu.proposed_change,
            reason: pu.reason,
            status: 'pending',
          });
        }
      } else {
        await createPendingUpdate({
          source_type: item.input_type,
          source_id: item.id,
          source: itemSource,
          playbook_slug: null,
          section_key: null,
          proposed_body: JSON.stringify(parsed || raw, null, 2),
          reason: 'No specific playbook update identified — review for manual action',
          status: 'pending',
        });
      }
      onNewUpdate?.();
      await refetch();
    } catch (err) {
      setProcessResult(prev => ({ ...prev, [item.id]: { error: err.message } }));
    }
    setProcessing(null);
  }

  async function handleDismiss(id) {
    await updateInboxItem(id, { status: 'dismissed' });
    await refetch();
  }

  return (
    <div>
      {/* Add new item */}
      <div style={{ background: 'var(--warm-white)', border: 'var(--border)', borderRadius: 2, padding: 16, marginBottom: 20 }}>
        <div className="section-label" style={{ marginBottom: 10 }}>Add to Inbox</div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
          {INPUT_TYPES.map(t => (
            <button
              key={t.key}
              onClick={() => setInputType(t.key)}
              style={{
                fontSize: '0.72rem', padding: '4px 10px', borderRadius: 20,
                border: '1px solid rgba(43,41,38,0.2)', cursor: 'pointer',
                background: inputType === t.key ? 'var(--dusty-rose)' : 'transparent',
                color: inputType === t.key ? 'white' : 'var(--charcoal)',
                fontWeight: inputType === t.key ? 600 : 400,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <input
          value={source}
          onChange={e => setSource(e.target.value)}
          placeholder="Source — URL, video title, filename, or where this came from (optional)"
          style={{ width: '100%', marginBottom: 8, fontSize: '0.8rem' }}
        />
        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder={typeInfo?.placeholder}
          rows={5}
          style={{ width: '100%', marginBottom: 10, fontFamily: 'var(--font-body)', fontSize: '0.82rem' }}
        />
        <button className="btn btn-primary btn-sm" onClick={handleAdd} disabled={adding || !content.trim()}>
          {adding ? 'Adding…' : 'Add to Inbox →'}
        </button>
      </div>

      {/* Pending items */}
      {loading && <div style={{ color: 'var(--charcoal-soft)', fontSize: '0.85rem' }}>Loading…</div>}
      {!loading && pendingItems.length === 0 && processedItems.length === 0 && (
        <div className="empty-state"><p>Inbox is empty.</p></div>
      )}

      {pendingItems.map(item => {
        const result = processResult[item.id];
        return (
          <div key={item.id} className="card" style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
              <span style={{ fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--charcoal-soft)' }}>
                {INPUT_TYPES.find(t => t.key === item.input_type)?.label || item.input_type}
              </span>
              <span style={{ fontSize: '0.65rem', color: 'var(--charcoal-soft)' }}>
                {new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            </div>
            {item.url_type && (
              <div style={{ fontSize: '0.72rem', color: 'var(--dusty-rose)', marginBottom: 6, wordBreak: 'break-all' }}>
                📎 {item.url_type}
              </div>
            )}
            <div style={{ fontSize: '0.8rem', color: 'var(--charcoal)', marginBottom: 10, whiteSpace: 'pre-wrap', maxHeight: 120, overflow: 'hidden' }}>
              {item.content.slice(0, 300)}{item.content.length > 300 ? '…' : ''}
            </div>
            {result?.error && (
              <div style={{ color: 'var(--alert)', fontSize: '0.75rem', marginBottom: 10 }}>Error: {result.error}</div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary btn-sm" onClick={() => handleProcess(item)} disabled={processing === item.id}>
                {processing === item.id ? 'Processing…' : 'Process with Claude →'}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => handleDismiss(item.id)} style={{ color: 'var(--charcoal-soft)' }}>
                Dismiss
              </button>
            </div>
          </div>
        );
      })}

      {/* Processed items */}
      {processedItems.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div className="section-label" style={{ marginBottom: 8 }}>Processed — results in Updates tab</div>
          {processedItems.map(item => (
            <div key={item.id} className="card" style={{ marginBottom: 8, opacity: 0.6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--charcoal-soft)' }}>
                  {INPUT_TYPES.find(t => t.key === item.input_type)?.label || item.input_type} · {item.content.slice(0, 60)}…
                </span>
                <span style={{ fontSize: '0.65rem', color: 'var(--success)', fontWeight: 600 }}>✓ Done</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Updates Tab helpers ──────────────────────────────────────────────────────

function renderUpdateBody(u, editing, setEditing) {
  const raw = editing[u.id] ?? u.text ?? '';

  // Try to parse as JSON and render nicely
  if (!u.playbook_slug) {
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return (
        <div style={{ fontSize: '0.8rem', marginBottom: 10 }}>
          {parsed.summary && (
            <div style={{ marginBottom: 8 }}>
              <div className="eyebrow" style={{ marginBottom: 4 }}>Summary</div>
              <div style={{ color: 'var(--charcoal)' }}>{parsed.summary}</div>
            </div>
          )}
          {parsed.key_findings?.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div className="eyebrow" style={{ marginBottom: 4 }}>Key Findings</div>
              <ul style={{ margin: 0, paddingLeft: 16 }}>
                {parsed.key_findings.map((f, i) => <li key={i} style={{ marginBottom: 4 }}>{f}</li>)}
              </ul>
            </div>
          )}
          {parsed.sparks?.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div className="eyebrow" style={{ marginBottom: 4 }}>Sparks Identified</div>
              <ul style={{ margin: 0, paddingLeft: 16 }}>
                {parsed.sparks.map((s, i) => <li key={i}>{s.content}{s.collection_tag ? ` — ${s.collection_tag}` : ''}</li>)}
              </ul>
            </div>
          )}
          {parsed.playbook_updates?.length > 0 && (
            <div>
              <div className="eyebrow" style={{ marginBottom: 4 }}>Playbook Updates Suggested</div>
              {parsed.playbook_updates.map((pu, i) => (
                <div key={i} style={{ background: 'var(--rose-faint)', borderRadius: 4, padding: '8px 10px', marginBottom: 6, fontSize: '0.75rem' }}>
                  <strong>{pu.playbook_slug} → {pu.section_key}</strong>: {pu.proposed_change}
                </div>
              ))}
            </div>
          )}
          {!parsed.summary && !parsed.key_findings?.length && (
            <div style={{ color: 'var(--charcoal-soft)', fontStyle: 'italic' }}>
              No findings extracted. The video may not have had accessible captions — try pasting the transcript text directly.
            </div>
          )}
        </div>
      );
    } catch {
      // Not JSON — show as plain text
    }
  }

  return (
    <textarea
      value={raw}
      onChange={e => setEditing(prev => ({ ...prev, [u.id]: e.target.value }))}
      rows={5}
      style={{ width: '100%', marginBottom: 10, fontSize: '0.8rem', fontFamily: 'var(--font-body)' }}
    />
  );
}

// ─── Updates Tab ─────────────────────────────────────────────────────────────

function buildDiscussPrompt(u, playbookName, playbookSections) {
  const section = playbookSections?.find(s => s.section_key === u.section_key);
  let body;
  try { body = JSON.parse(u.text); } catch { body = null; }

  const lines = ['TCC Knowledge Base — Review Finding', ''];
  if (u.source) lines.push(`Source: ${u.source}`, '');

  if (body && !u.playbook_slug) {
    if (body.summary) lines.push(`Finding: ${body.summary}`, '');
    if (body.key_findings?.length) {
      lines.push('Key findings:');
      body.key_findings.forEach(f => lines.push(`- ${f}`));
      lines.push('');
    }
  } else if (u.text) {
    lines.push(`Finding: ${u.text}`, '');
  }

  if (u.playbook_slug) {
    lines.push(`This may affect: ${playbookName} → ${u.section_key}`, '');
    if (section?.body) lines.push(`Current standard:`, section.body, '');
    lines.push(`Question: Should this update the "${u.section_key}" standard in the ${playbookName} playbook? If yes, propose the exact new wording to replace the current standard.`);
  } else {
    lines.push('Question: Based on these findings, are there any TCC standards that should be updated? If yes, identify which playbook and section, and propose the exact new wording.');
  }

  return lines.join('\n');
}

function UpdatesTab({ playbooks, updates = [], refetch }) {
  const { playbooks: fullPlaybooks } = usePlaybooks();
  const [editing, setEditing] = useState({});
  const [confirming, setConfirming] = useState({});
  const [copied, setCopied] = useState({});

  useEffect(() => { refetch?.(); }, []);

  function getPlaybookName(slug) {
    return playbooks.find(p => p.slug === slug)?.title || slug;
  }

  function getPlaybookId(slug) {
    return playbooks.find(p => p.slug === slug)?.id;
  }

  async function handleApprove(update) {
    if (update.playbook_slug) {
      const body = editing[update.id] ?? update.proposed_body;
      const pb = playbooks.find(p => p.slug === update.playbook_slug);
      await approvePendingUpdate({ ...update, playbook_id: pb?.id }, body);
    } else {
      // Review-only item — just mark approved
      await rejectPendingUpdate(update.id); // reuses the "close" logic without playbook write
    }
    setConfirming(prev => ({ ...prev, [update.id]: 'approved' }));
    setTimeout(() => { setConfirming(prev => { const n = { ...prev }; delete n[update.id]; return n; }); refetch(); }, 1500);
  }

  async function handleReject(id) {
    await rejectPendingUpdate(id);
    setConfirming(prev => ({ ...prev, [id]: 'rejected' }));
    setTimeout(() => { setConfirming(prev => { const n = { ...prev }; delete n[id]; return n; }); refetch(); }, 1500);
  }

  async function handleCopyPrompt(u) {
    const pb = fullPlaybooks.find(p => p.slug === u.playbook_slug);
    const prompt = buildDiscussPrompt(u, pb?.title || u.playbook_slug, pb?.playbook_sections);
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(prev => ({ ...prev, [u.id]: true }));
      setTimeout(() => setCopied(prev => { const n = { ...prev }; delete n[u.id]; return n; }), 2000);
    } catch {
      // Fallback for browsers that block clipboard
      const ta = document.createElement('textarea');
      ta.value = prompt;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(prev => ({ ...prev, [u.id]: true }));
      setTimeout(() => setCopied(prev => { const n = { ...prev }; delete n[u.id]; return n; }), 2000);
    }
  }

  if (updates.length === 0) return <div className="empty-state"><p>No pending updates.</p></div>;

  return (
    <div>
      {updates.map(u => (
        <div key={u.id} className="card" style={{ marginBottom: 12 }}>
          <div style={{ fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--charcoal-soft)', marginBottom: 6 }}>
            {u.playbook_slug ? `${getPlaybookName(u.playbook_slug)} → ${u.section_key}` : `Review — ${u.source_type || 'inbox item'}`}
          </div>
          {u.source && (
            <div style={{ fontSize: '0.72rem', color: 'var(--dusty-rose)', marginBottom: 6, wordBreak: 'break-all' }}>
              📎 {u.source}
            </div>
          )}
          {u.reason && (
            <div style={{ fontSize: '0.75rem', color: 'var(--charcoal-soft)', marginBottom: 8, fontStyle: 'italic' }}>
              "{u.reason}"
            </div>
          )}
          <div className="section-label" style={{ marginBottom: 4 }}>
            {u.playbook_slug ? 'Proposed update:' : 'Claude analysis:'}
          </div>
          {renderUpdateBody(u, editing, setEditing)}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => handleCopyPrompt(u)}
              style={{ color: 'var(--dusty-rose)' }}
            >
              {copied[u.id] ? '✓ Copied!' : '💬 Copy prompt →'}
            </button>
          </div>
          {confirming[u.id] ? (
            <span className="inline-confirm">✓ {confirming[u.id] === 'approved' ? 'Approved' : 'Rejected'}</span>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary btn-sm" onClick={() => handleApprove(u)}>Approve →</button>
              <button className="btn btn-ghost btn-sm" onClick={() => handleReject(u.id)} style={{ color: 'var(--charcoal-soft)' }}>Reject</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Playbooks Tab ────────────────────────────────────────────────────────────

function PlaybooksTab({ playbooks, refetch }) {
  const [expanded, setExpanded] = useState(null);
  const [expandedSection, setExpandedSection] = useState(null);
  const [editingBody, setEditingBody] = useState({});
  const [saving, setSaving] = useState({});
  const [saved, setSaved] = useState({});

  const sorted = [...playbooks].sort((a, b) => {
    const ai = PLAYBOOK_ORDER.indexOf(a.slug);
    const bi = PLAYBOOK_ORDER.indexOf(b.slug);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  async function handleSaveSection(section) {
    const body = editingBody[section.id];
    if (body === undefined) return;
    setSaving(prev => ({ ...prev, [section.id]: true }));
    await updatePlaybookSection(section.id, body);
    setSaved(prev => ({ ...prev, [section.id]: true }));
    setTimeout(() => setSaved(prev => { const n = { ...prev }; delete n[section.id]; return n; }), 2000);
    setSaving(prev => { const n = { ...prev }; delete n[section.id]; return n; });
    refetch();
  }

  if (playbooks.length === 0) {
    return (
      <div className="empty-state">
        <p>No playbooks yet. Run the Phase 3D seed SQL to populate them.</p>
      </div>
    );
  }

  return (
    <div>
      {sorted.map(pb => (
        <div key={pb.id} style={{ borderTop: '1px solid rgba(43,41,38,0.1)' }}>
          <button
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '14px 0', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
            onClick={() => setExpanded(expanded === pb.id ? null : pb.id)}
          >
            <div>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: '1rem' }}>{pb.title}</span>
              <span style={{ fontSize: '0.65rem', color: 'var(--charcoal-soft)', marginLeft: 8 }}>v{pb.current_version}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: '0.65rem', color: 'var(--charcoal-soft)' }}>{pb.playbook_sections?.length || 0} sections</span>
              <span style={{ fontSize: '0.65rem', color: 'var(--charcoal-soft)' }}>{expanded === pb.id ? '▲' : '▼'}</span>
            </div>
          </button>

          {expanded === pb.id && (
            <div style={{ paddingBottom: 16 }}>
              {(pb.playbook_sections || []).map(section => (
                <div key={section.id} style={{ marginBottom: 8, border: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                  <button
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '10px 12px', background: 'var(--charcoal-faint)', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                    onClick={() => setExpandedSection(expandedSection === section.id ? null : section.id)}
                  >
                    <span style={{ fontSize: '0.78rem', fontWeight: 500 }}>{section.section_title}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: '0.62rem', color: 'var(--charcoal-soft)' }}>v{section.version}</span>
                      <span style={{ fontSize: '0.62rem', color: 'var(--charcoal-soft)' }}>{expandedSection === section.id ? '▲' : '▼'}</span>
                    </div>
                  </button>

                  {expandedSection === section.id && (
                    <div style={{ padding: '12px 12px 10px' }}>
                      <textarea
                        value={editingBody[section.id] ?? section.body ?? ''}
                        onChange={e => setEditingBody(prev => ({ ...prev, [section.id]: e.target.value }))}
                        rows={6}
                        style={{ width: '100%', fontSize: '0.8rem', fontFamily: 'var(--font-body)', marginBottom: 8 }}
                      />
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        {saved[section.id] ? (
                          <span className="inline-confirm">✓ Saved</span>
                        ) : (
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => handleSaveSection(section)}
                            disabled={saving[section.id] || editingBody[section.id] === undefined}
                          >
                            {saving[section.id] ? 'Saving…' : 'Save'}
                          </button>
                        )}
                        <span style={{ fontSize: '0.65rem', color: 'var(--charcoal-soft)' }}>Key: {section.section_key}</span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Experiments Tab ──────────────────────────────────────────────────────────

const BLANK_FORM = {
  title: '', hypothesis: '', baseline: '', metric: '',
  collection: '', start_date: new Date().toISOString().split('T')[0],
  timeline_days: 14, reference_url: '',
};

function ExperimentsTab() {
  const { experiments, loading, refetch } = useExperiments('running');
  const { playbooks } = usePlaybooks();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ ...BLANK_FORM });
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState({});
  const [checkpointText, setCheckpointText] = useState({});
  const [savingCp, setSavingCp] = useState({});
  const [closing, setClosing] = useState({});
  const [closeForm, setCloseForm] = useState({});
  const [sendToKB, setSendToKB] = useState({});
  const [kbPlaybook, setKBPlaybook] = useState({});
  const [kbSection, setKBSection] = useState({});

  async function handleAdd() {
    if (!form.title.trim()) return;
    setSaving(true);
    await createExperiment({
      title: form.title,
      hypothesis: form.hypothesis,
      baseline: form.baseline,
      metric: form.metric,
      collection: form.collection,
      start_date: form.start_date,
      timeline_days: form.timeline_days,
      reference_url: form.reference_url || null,
      checkpoints: [],
    });
    setForm({ ...BLANK_FORM, start_date: new Date().toISOString().split('T')[0] });
    setAdding(false);
    setSaving(false);
    refetch();
  }

  async function handleLogCheckpoint(expId) {
    const note = (checkpointText[expId] || '').trim();
    if (!note) return;
    setSavingCp(prev => ({ ...prev, [expId]: true }));
    const exp = experiments.find(e => e.id === expId);
    const existing = Array.isArray(exp.checkpoints) ? exp.checkpoints : [];
    await updateExperiment(expId, {
      checkpoints: [...existing, { note, logged_at: new Date().toISOString().split('T')[0] }],
    });
    setCheckpointText(prev => ({ ...prev, [expId]: '' }));
    setSavingCp(prev => { const n = { ...prev }; delete n[expId]; return n; });
    refetch();
  }

  async function handleClose(exp, result) {
    const notes = closeForm[exp.id] || '';
    await closeExperiment(exp.id, result, notes);
    if (sendToKB[exp.id]) {
      await createPendingUpdate({
        source_type: 'experiment',
        source_id: exp.id,
        source: `Experiment: ${exp.title || exp.hypothesis}`,
        playbook_slug: kbPlaybook[exp.id] || null,
        section_key: kbSection[exp.id] || null,
        proposed_body: notes,
        reason: `Proven experiment — ${exp.hypothesis || exp.title}`,
        status: 'pending',
      });
    }
    setClosing(prev => { const n = { ...prev }; delete n[exp.id]; return n; });
    setCloseForm(prev => { const n = { ...prev }; delete n[exp.id]; return n; });
    setSendToKB(prev => { const n = { ...prev }; delete n[exp.id]; return n; });
    refetch();
  }

  return (
    <div>
      {!adding ? (
        <button className="btn btn-ghost btn-sm" onClick={() => setAdding(true)} style={{ marginBottom: 16 }}>
          + New Experiment
        </button>
      ) : (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="section-label" style={{ marginBottom: 12 }}>New Experiment</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input
              autoFocus
              placeholder="Title — short name (e.g. Hero image test — Cozy Romance)"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              style={{ fontSize: '0.9rem', fontWeight: 500 }}
            />
            <textarea
              placeholder="Hypothesis — what do you predict will happen? (e.g. lifestyle image will outperform flat-lay on CTR)"
              value={form.hypothesis}
              onChange={e => setForm(f => ({ ...f, hypothesis: e.target.value }))}
              rows={2}
              style={{ fontSize: '0.82rem', fontFamily: 'var(--font-body)' }}
            />
            <textarea
              placeholder="Baseline — what is true right now, before the change? (e.g. current CTR 0.8%, standard: flat-lay hero)"
              value={form.baseline}
              onChange={e => setForm(f => ({ ...f, baseline: e.target.value }))}
              rows={2}
              style={{ fontSize: '0.82rem', fontFamily: 'var(--font-body)' }}
            />
            <input
              placeholder="Success metric — pass/fail threshold (e.g. CTR > 1.2% at 30 days)"
              value={form.metric}
              onChange={e => setForm(f => ({ ...f, metric: e.target.value }))}
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <label style={{ fontSize: '0.7rem', color: 'var(--charcoal-soft)', display: 'block', marginBottom: 4 }}>
                  Start date <span style={{ opacity: 0.6 }}>(supports backdating)</span>
                </label>
                <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} />
              </div>
              <div>
                <label style={{ fontSize: '0.7rem', color: 'var(--charcoal-soft)', display: 'block', marginBottom: 4 }}>Duration</label>
                <select value={form.timeline_days} onChange={e => setForm(f => ({ ...f, timeline_days: Number(e.target.value) }))}>
                  <option value={7}>7 days</option>
                  <option value={14}>14 days</option>
                  <option value={30}>30 days</option>
                  <option value={60}>60 days</option>
                </select>
              </div>
            </div>
            <input
              placeholder="Collection (optional)"
              value={form.collection}
              onChange={e => setForm(f => ({ ...f, collection: e.target.value }))}
            />
            <div>
              <input
                placeholder="Reference image URL (optional) — paste a hosted image link for what's being tested"
                value={form.reference_url}
                onChange={e => setForm(f => ({ ...f, reference_url: e.target.value }))}
              />
              {form.reference_url && /\.(jpe?g|png|gif|webp)/i.test(form.reference_url) && (
                <img src={form.reference_url} alt="Reference preview" style={{ maxWidth: '100%', maxHeight: 160, objectFit: 'contain', borderRadius: 2, border: 'var(--border)', marginTop: 6 }} />
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button className="btn btn-primary btn-sm" onClick={handleAdd} disabled={saving || !form.title.trim()}>
              {saving ? 'Starting…' : 'Start Experiment →'}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </div>
      )}

      {loading && <div style={{ color: 'var(--charcoal-soft)', fontSize: '0.85rem' }}>Loading…</div>}
      {!loading && experiments.length === 0 && (
        <div className="empty-state"><p>No running experiments.</p></div>
      )}

      {experiments.map(exp => {
        const startDate = exp.start_date ? new Date(exp.start_date + 'T00:00:00') : new Date(exp.started_at);
        const daysRunning = Math.floor((Date.now() - startDate) / 86400000);
        const reviewDate = new Date(startDate);
        reviewDate.setDate(reviewDate.getDate() + (exp.timeline_days || 14));
        const isOverdue = daysRunning > (exp.timeline_days || 14);
        const isNearDue = !isOverdue && daysRunning >= (exp.timeline_days || 14) - 3;
        const isOpen = !!expanded[exp.id];
        const checkpoints = Array.isArray(exp.checkpoints) ? exp.checkpoints : [];

        return (
          <div key={exp.id} className="card" style={{ marginBottom: 10, borderLeft: isOverdue ? '3px solid var(--alert)' : isNearDue ? '3px solid var(--warning)' : undefined }}>
            {/* Collapsed header */}
            <button
              onClick={() => setExpanded(prev => ({ ...prev, [exp.id]: !prev[exp.id] }))}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}
            >
              <div style={{ flex: 1 }}>
                {exp.collection && (
                  <div style={{ fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--charcoal-soft)', marginBottom: 3 }}>
                    {exp.collection}
                  </div>
                )}
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.95rem', marginBottom: 4 }}>
                  {exp.title || exp.hypothesis}
                </div>
                <div style={{ fontSize: '0.72rem', color: isOverdue ? 'var(--alert)' : isNearDue ? '#7a4a1e' : 'var(--charcoal-soft)' }}>
                  {isOverdue
                    ? `⚠ Review overdue — day ${daysRunning} of ${exp.timeline_days}`
                    : `Day ${daysRunning} of ${exp.timeline_days} · review ${reviewDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                  {checkpoints.length > 0 && ` · ${checkpoints.length} checkpoint${checkpoints.length !== 1 ? 's' : ''}`}
                </div>
              </div>
              <span style={{ fontSize: '0.65rem', color: 'var(--charcoal-soft)', marginLeft: 8, flexShrink: 0 }}>{isOpen ? '▲' : '▼'}</span>
            </button>

            {/* Overdue CTA when collapsed */}
            {!isOpen && isOverdue && (
              <button
                className="btn btn-primary btn-sm"
                style={{ marginTop: 10 }}
                onClick={() => setExpanded(prev => ({ ...prev, [exp.id]: true }))}
              >
                ⚠ Log Final Result
              </button>
            )}

            {/* Expanded body */}
            {isOpen && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: 'var(--border)' }}>
                {exp.title && exp.hypothesis && (
                  <div style={{ marginBottom: 10 }}>
                    <div className="eyebrow" style={{ marginBottom: 4 }}>Hypothesis</div>
                    <div style={{ fontSize: '0.8rem' }}>{exp.hypothesis}</div>
                  </div>
                )}
                {exp.baseline && (
                  <div style={{ marginBottom: 10 }}>
                    <div className="eyebrow" style={{ marginBottom: 4 }}>Baseline</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--charcoal-soft)' }}>{exp.baseline}</div>
                  </div>
                )}
                {exp.metric && (
                  <div style={{ marginBottom: 10 }}>
                    <div className="eyebrow" style={{ marginBottom: 4 }}>Success metric</div>
                    <div style={{ fontSize: '0.8rem' }}>{exp.metric}</div>
                  </div>
                )}
                {exp.reference_url && (
                  <div style={{ marginBottom: 12 }}>
                    <div className="eyebrow" style={{ marginBottom: 6 }}>Reference</div>
                    {/\.(jpe?g|png|gif|webp)/i.test(exp.reference_url)
                      ? <img src={exp.reference_url} alt="Reference" style={{ maxWidth: '100%', maxHeight: 200, objectFit: 'contain', borderRadius: 2, border: 'var(--border)' }} />
                      : <a href={exp.reference_url} target="_blank" rel="noreferrer" style={{ fontSize: '0.78rem', color: 'var(--dusty-rose)' }}>{exp.reference_url}</a>
                    }
                  </div>
                )}

                {/* Checkpoint log */}
                <div style={{ marginBottom: 14 }}>
                  <div className="eyebrow" style={{ marginBottom: 8 }}>Checkpoint log</div>
                  {checkpoints.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
                      {checkpoints.map((cp, i) => (
                        <div key={i} style={{ borderLeft: '2px solid rgba(43,41,38,0.15)', paddingLeft: 10 }}>
                          <div style={{ fontSize: '0.65rem', color: 'var(--charcoal-soft)', marginBottom: 2 }}>{cp.logged_at}</div>
                          <div style={{ fontSize: '0.78rem' }}>{cp.note}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  {!closing[exp.id] && (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
                      <textarea
                        placeholder="Log interim checkpoint — early signal, too early to call, CTR trending X…"
                        value={checkpointText[exp.id] || ''}
                        onChange={e => setCheckpointText(prev => ({ ...prev, [exp.id]: e.target.value }))}
                        rows={2}
                        style={{ flex: 1, fontSize: '0.78rem', fontFamily: 'var(--font-body)' }}
                      />
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => handleLogCheckpoint(exp.id)}
                        disabled={!checkpointText[exp.id]?.trim() || savingCp[exp.id]}
                      >
                        {savingCp[exp.id] ? 'Saving…' : 'Log →'}
                      </button>
                    </div>
                  )}
                </div>

                {/* Final result */}
                {closing[exp.id] ? (
                  <div style={{ borderTop: 'var(--border)', paddingTop: 12 }}>
                    <div className="eyebrow" style={{ marginBottom: 8 }}>Log Final Result</div>
                    <textarea
                      placeholder="What did you find? What changes as a result?"
                      value={closeForm[exp.id] || ''}
                      onChange={e => setCloseForm(prev => ({ ...prev, [exp.id]: e.target.value }))}
                      rows={3}
                      style={{ width: '100%', marginBottom: 10, fontSize: '0.8rem', fontFamily: 'var(--font-body)' }}
                    />
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none', fontSize: '0.8rem', marginBottom: 10 }}>
                      <input
                        type="checkbox"
                        checked={!!sendToKB[exp.id]}
                        onChange={e => setSendToKB(prev => ({ ...prev, [exp.id]: e.target.checked }))}
                        style={{ width: 'auto', margin: 0 }}
                      />
                      Send result to Knowledge Base → Updates
                    </label>
                    {sendToKB[exp.id] && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                        <select value={kbPlaybook[exp.id] || ''} onChange={e => setKBPlaybook(prev => ({ ...prev, [exp.id]: e.target.value }))}>
                          <option value="">— Playbook (optional) —</option>
                          {playbooks.map(p => <option key={p.id} value={p.slug}>{p.title}</option>)}
                        </select>
                        <input
                          placeholder="Section key (optional)"
                          value={kbSection[exp.id] || ''}
                          onChange={e => setKBSection(prev => ({ ...prev, [exp.id]: e.target.value }))}
                        />
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button className="btn btn-primary btn-sm" onClick={() => handleClose(exp, 'proven')}>✓ Proven</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => handleClose(exp, 'inconclusive')}>Inconclusive</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => handleClose(exp, 'disproven')}>Disproven</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setClosing(prev => { const n = { ...prev }; delete n[exp.id]; return n; })}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <button
                    className={`btn btn-sm ${isOverdue ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setClosing(prev => ({ ...prev, [exp.id]: true }))}
                  >
                    {isOverdue ? '⚠ Log Final Result' : 'Close Experiment'}
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Proven Results Tab ────────────────────────────────────────────────────────

function ProvenResultsTab() {
  const { experiments, loading } = useExperiments('proven');
  const [expanded, setExpanded] = useState({});

  if (loading) return <div style={{ color: 'var(--charcoal-soft)', fontSize: '0.85rem' }}>Loading…</div>;
  if (experiments.length === 0) return <div className="empty-state"><p>No proven results yet.</p></div>;

  return (
    <div>
      {experiments.map(exp => {
        const isOpen = !!expanded[exp.id];
        const checkpoints = Array.isArray(exp.checkpoints) ? exp.checkpoints : [];
        return (
          <div key={exp.id} className="card" style={{ marginBottom: 10, borderLeft: '3px solid var(--success)' }}>
            <button
              onClick={() => setExpanded(prev => ({ ...prev, [exp.id]: !prev[exp.id] }))}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}
            >
              <div style={{ flex: 1 }}>
                {exp.collection && (
                  <div style={{ fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--charcoal-soft)', marginBottom: 3 }}>
                    {exp.collection}
                  </div>
                )}
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.95rem', marginBottom: 4 }}>
                  {exp.title || exp.hypothesis}
                </div>
                <div style={{ fontSize: '0.65rem', color: 'var(--charcoal-soft)' }}>
                  Proven {exp.closed_at ? new Date(exp.closed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
                  {exp.metric && ` · ${exp.metric}`}
                  {checkpoints.length > 0 && ` · ${checkpoints.length} checkpoint${checkpoints.length !== 1 ? 's' : ''}`}
                </div>
              </div>
              <span style={{ fontSize: '0.65rem', color: 'var(--charcoal-soft)', marginLeft: 8, flexShrink: 0 }}>{isOpen ? '▲' : '▼'}</span>
            </button>

            {exp.result_notes && !isOpen && (
              <div style={{ fontSize: '0.8rem', color: 'var(--charcoal)', marginTop: 8 }}>
                {exp.result_notes.slice(0, 120)}{exp.result_notes.length > 120 ? '…' : ''}
              </div>
            )}

            {isOpen && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: 'var(--border)' }}>
                {exp.title && exp.hypothesis && (
                  <div style={{ marginBottom: 10 }}>
                    <div className="eyebrow" style={{ marginBottom: 4 }}>Hypothesis</div>
                    <div style={{ fontSize: '0.8rem' }}>{exp.hypothesis}</div>
                  </div>
                )}
                {exp.baseline && (
                  <div style={{ marginBottom: 10 }}>
                    <div className="eyebrow" style={{ marginBottom: 4 }}>Baseline</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--charcoal-soft)' }}>{exp.baseline}</div>
                  </div>
                )}
                {exp.result_notes && (
                  <div style={{ marginBottom: 10 }}>
                    <div className="eyebrow" style={{ marginBottom: 4 }}>Result</div>
                    <div style={{ fontSize: '0.8rem' }}>{exp.result_notes}</div>
                  </div>
                )}
                {exp.reference_url && (
                  <div style={{ marginBottom: 10 }}>
                    <div className="eyebrow" style={{ marginBottom: 6 }}>Reference</div>
                    {/\.(jpe?g|png|gif|webp)/i.test(exp.reference_url)
                      ? <img src={exp.reference_url} alt="Reference" style={{ maxWidth: '100%', maxHeight: 200, objectFit: 'contain', borderRadius: 2, border: 'var(--border)' }} />
                      : <a href={exp.reference_url} target="_blank" rel="noreferrer" style={{ fontSize: '0.78rem', color: 'var(--dusty-rose)' }}>{exp.reference_url}</a>
                    }
                  </div>
                )}
                {checkpoints.length > 0 && (
                  <div>
                    <div className="eyebrow" style={{ marginBottom: 8 }}>Checkpoint log</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {checkpoints.map((cp, i) => (
                        <div key={i} style={{ borderLeft: '2px solid rgba(43,41,38,0.15)', paddingLeft: 10 }}>
                          <div style={{ fontSize: '0.65rem', color: 'var(--charcoal-soft)', marginBottom: 2 }}>{cp.logged_at}</div>
                          <div style={{ fontSize: '0.78rem' }}>{cp.note}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Knowledge() {
  const [activeTab, setActiveTab] = useState('Inbox');
  const { playbooks, loading: pbLoading, refetch: refetchPlaybooks } = usePlaybooks();
  const { updates, refetch: refetchUpdates } = usePendingUpdates();

  useEffect(() => { runCodexMigrationIfNeeded(); }, []);

  const pendingCount = updates.length;

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title">Knowledge Base</div>
        <div style={{ fontSize: '0.78rem', color: 'var(--charcoal-soft)', marginTop: 4 }}>
          {playbooks.length} playbooks · {pendingCount} pending update{pendingCount !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '1px solid rgba(43,41,38,0.1)', overflowX: 'auto' }}>
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer',
              fontSize: '0.75rem', fontWeight: activeTab === tab ? 600 : 400,
              color: activeTab === tab ? 'var(--charcoal)' : 'var(--charcoal-soft)',
              borderBottom: activeTab === tab ? '2px solid var(--dusty-rose)' : '2px solid transparent',
              whiteSpace: 'nowrap', position: 'relative',
            }}
          >
            {tab}
            {tab === 'Updates' && pendingCount > 0 && (
              <span style={{
                position: 'absolute', top: 6, right: 4,
                background: 'var(--dusty-rose)', color: 'white',
                borderRadius: 20, padding: '0 5px', fontSize: '0.6rem', fontWeight: 700,
              }}>
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'Inbox' && (
        <InboxTab onNewUpdate={refetchUpdates} />
      )}
      {activeTab === 'Updates' && (
        <UpdatesTab playbooks={playbooks} updates={updates} refetch={refetchUpdates} />
      )}
      {activeTab === 'Playbooks' && (
        pbLoading
          ? <div style={{ color: 'var(--charcoal-soft)', fontSize: '0.85rem' }}>Loading…</div>
          : <PlaybooksTab playbooks={playbooks} refetch={refetchPlaybooks} />
      )}
      {activeTab === 'Experiments' && <ExperimentsTab />}
      {activeTab === 'Proven Results' && <ProvenResultsTab />}
    </div>
  );
}
