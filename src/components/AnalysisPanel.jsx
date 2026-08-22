import { useState } from 'react';
import {
  useAnalysisRecords, createAnalysisRecord, updateAnalysisRecord,
  approveAnalysisRecord, supersedeAnalysisRecord,
} from '../lib/hooks';
import { ANALYSIS_LAYERS, sortFindings } from '../lib/analysis';

// ─── Analysis panel (Phase 9 / §4, §26) ────────────────────────────────────
// Two halves, and keeping them visibly apart is the entire point.
//
// ABOVE: deterministic findings — what the stored numbers say, computed fresh
// every render by src/lib/analysis.js. Never editable, never saved on their
// own, never a conclusion.
//
// BELOW: the written analysis — Evidence / Interpretation / Decision /
// Hypothesis / Learning as five separate fields, because this project's
// standing rule is that those five are never collapsed into one. A single
// notes box would have been far less work and would have made "what did we
// DECIDE about this" permanently unanswerable.
//
// The findings visible at the time are frozen onto the record when it is
// saved, so a later reader can tell whether a judgment was made against a
// signal that has since changed.

const SEVERITY_STYLE = {
  flag:  { background: 'rgba(201,123,123,0.15)', color: '#7a2b2b' },
  watch: { background: 'rgba(232,168,124,0.2)',  color: '#7a4a1e' },
  note:  { background: 'rgba(43,41,38,0.06)',    color: 'var(--charcoal-soft)' },
};

const STATUS_STYLE = {
  draft:      { background: 'rgba(43,41,38,0.08)',    color: 'var(--charcoal-soft)' },
  proposed:   { background: 'rgba(232,168,124,0.2)',  color: '#7a4a1e' },
  approved:   { background: 'rgba(124,175,138,0.18)', color: '#2d6b3c' },
  superseded: { background: 'rgba(43,41,38,0.06)',    color: 'var(--charcoal-soft)' },
};

function blankDraft() {
  return { interpretation: '', decision: '', hypothesis: '', learning: '' };
}

export default function AnalysisPanel({ scopeType, scopeId, scopeLabel, findings = [], evidenceSnapshot = null }) {
  const { records, refetch } = useAnalysisRecords({ scopeType, scopeId });
  const [draft, setDraft] = useState(blankDraft());
  const [writing, setWriting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState(blankDraft());

  const sorted = sortFindings(findings);
  const hasDraftContent = Object.values(draft).some(v => v.trim());

  async function save() {
    if (!hasDraftContent) return;
    setSaving(true);
    await createAnalysisRecord({
      scopeType, scopeId, scopeLabel,
      interpretation: draft.interpretation.trim() || null,
      decision: draft.decision.trim() || null,
      hypothesis: draft.hypothesis.trim() || null,
      learning: draft.learning.trim() || null,
      // Frozen, not queried later — an interpretation written today has to
      // stay readable against today's numbers or it becomes unfalsifiable.
      evidenceSnapshot,
      findings: sorted.length ? sorted : null,
      authoredBy: 'human',
      status: 'draft',
    });
    setSaving(false);
    setDraft(blankDraft());
    setWriting(false);
    refetch();
  }

  async function saveEdit(id) {
    setSaving(true);
    await updateAnalysisRecord(id, {
      interpretation: editDraft.interpretation.trim() || null,
      decision: editDraft.decision.trim() || null,
      hypothesis: editDraft.hypothesis.trim() || null,
      learning: editDraft.learning.trim() || null,
    });
    setSaving(false);
    setEditingId(null);
    refetch();
  }

  function beginEdit(r) {
    setEditingId(r.id);
    setEditDraft({
      interpretation: r.interpretation || '',
      decision: r.decision || '',
      hypothesis: r.hypothesis || '',
      learning: r.learning || '',
    });
  }

  const writableLayers = ANALYSIS_LAYERS.filter(l => l.key !== 'evidence_snapshot');

  return (
    <div>
      {/* ── Findings: measured, not concluded ── */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--charcoal-soft)', marginBottom: 6 }}>
          What the numbers show
        </div>
        {sorted.length === 0 ? (
          <div style={{ fontSize: '0.74rem', color: 'var(--charcoal-soft)' }}>Nothing stands out in the stored evidence.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {sorted.map((f, i) => (
              <div key={`${f.type}-${i}`} style={{
                fontSize: '0.74rem', padding: '5px 9px', borderRadius: 3,
                ...(SEVERITY_STYLE[f.severity] || SEVERITY_STYLE.note),
              }}>
                {f.summary}
              </div>
            ))}
          </div>
        )}
        <div style={{ fontSize: '0.64rem', color: 'var(--charcoal-soft)', marginTop: 5, fontStyle: 'italic' }}>
          Observations only &mdash; what they mean is yours to write.
        </div>
      </div>

      {/* ── Written analysis ── */}
      <div style={{ fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--charcoal-soft)', marginBottom: 6 }}>
        Analysis
      </div>

      {records.length === 0 && !writing && (
        <div style={{ fontSize: '0.74rem', color: 'var(--charcoal-soft)', marginBottom: 8 }}>
          Nothing written yet.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
        {records.map(r => (
          <div key={r.id} style={{
            border: '1px solid rgba(43,41,38,0.1)', borderRadius: 3, padding: 10,
            opacity: r.status === 'superseded' ? 0.55 : 1,
          }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
              <span style={{ fontSize: '0.6rem', fontWeight: 700, padding: '1px 7px', borderRadius: 10, ...(STATUS_STYLE[r.status] || STATUS_STYLE.draft) }}>
                {r.status}
              </span>
              {r.authored_by === 'ai' && (
                <span style={{ fontSize: '0.6rem', color: 'var(--charcoal-soft)' }} title="AI-proposed — not settled until approved">
                  AI proposal
                </span>
              )}
              <span style={{ fontSize: '0.62rem', color: 'var(--charcoal-soft)' }}>
                {(r.created_at || '').slice(0, 10)}
                {r.approved_at && ` · approved ${r.approved_at.slice(0, 10)}`}
              </span>
              <span style={{ flex: 1 }} />
              {editingId !== r.id && r.status !== 'superseded' && (
                <>
                  <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.62rem', padding: '1px 7px' }} onClick={() => beginEdit(r)}>Edit</button>
                  {r.status !== 'approved' && (
                    <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.62rem', padding: '1px 7px' }}
                      onClick={async () => { await approveAnalysisRecord(r.id); refetch(); }}>Approve</button>
                  )}
                  <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.62rem', padding: '1px 7px' }}
                    title="Keep it on the record but mark it no longer current — an analysis that turned out wrong is still evidence about how we reason"
                    onClick={async () => { await supersedeAnalysisRecord(r.id); refetch(); }}>Supersede</button>
                </>
              )}
            </div>

            {editingId === r.id ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {writableLayers.map(l => (
                  <div key={l.key}>
                    <div style={{ fontSize: '0.62rem', fontWeight: 600, color: 'var(--charcoal-soft)' }}>{l.label}</div>
                    <textarea rows={2} value={editDraft[l.key]}
                      onChange={e => setEditDraft(d => ({ ...d, [l.key]: e.target.value }))} />
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-primary btn-sm" style={{ fontSize: '0.65rem' }} onClick={() => saveEdit(r.id)} disabled={saving}>Save</button>
                  <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.65rem' }} onClick={() => setEditingId(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              writableLayers.filter(l => r[l.key]).map(l => (
                <div key={l.key} style={{ marginBottom: 5 }}>
                  <div style={{ fontSize: '0.62rem', fontWeight: 600, color: 'var(--charcoal-soft)' }}>{l.label}</div>
                  <div style={{ fontSize: '0.76rem', whiteSpace: 'pre-wrap' }}>{r[l.key]}</div>
                </div>
              ))
            )}
          </div>
        ))}
      </div>

      {writing ? (
        <div style={{ border: '1px solid rgba(43,41,38,0.12)', borderRadius: 3, padding: 10 }}>
          {writableLayers.map(l => (
            <div key={l.key} style={{ marginBottom: 8 }}>
              <div style={{ fontSize: '0.65rem', fontWeight: 600 }}>{l.label}</div>
              <div style={{ fontSize: '0.62rem', color: 'var(--charcoal-soft)', marginBottom: 2 }}>{l.hint}</div>
              <textarea rows={2} value={draft[l.key]}
                onChange={e => setDraft(d => ({ ...d, [l.key]: e.target.value }))} />
            </div>
          ))}
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-primary btn-sm" style={{ fontSize: '0.68rem' }} onClick={save} disabled={saving || !hasDraftContent}>
              {saving ? 'Saving…' : 'Save analysis'}
            </button>
            <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.68rem' }} onClick={() => { setWriting(false); setDraft(blankDraft()); }}>Cancel</button>
          </div>
        </div>
      ) : (
        <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.68rem' }} onClick={() => setWriting(true)}>
          + Write analysis
        </button>
      )}
    </div>
  );
}
