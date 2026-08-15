import { useState } from 'react';
import { appendProductNote } from '../../lib/hooks';
import { hasUnsavedEdits } from './generation';

// "New Keyword Evidence" (Listing Intelligence Milestone A) — replaces the
// old "apply to title & tags" patch flow. Deliberately never proposes a
// title/tag rewrite at all anymore: it compares new evidence against the
// CURRENT Primary Search Intent and returns a recommendation only
// (no_change / consider_at_next_review / notable_shift). If the evidence
// genuinely changes the strategy, that's a real regenerate through the
// Generate button, not a quiet patch — this stops new research from
// encouraging immediate, unreviewed listing edits outside any cadence.
//
// Renamed from KeywordPatchPanel (Milestone B). Accept/Save wiring
// (Milestone B): the result screen's Record/Dismiss/Regenerate actions.
export default function KeywordEvidencePanel({
  currentPrimaryIntent, currentPrimaryIntentStatus,
  productId, isLive,
  editTitle, editTags, editDesc, editPrompts, output, onRegenerate,
}) {
  const [open, setOpen]                   = useState(false);
  const [manualText, setManualText]       = useState('');
  const [extracted, setExtracted]         = useState([]);
  const [extracting, setExtracting]       = useState(false);
  const [evaluating, setEvaluating]       = useState(false);
  const [result, setResult]               = useState(null);
  const [error, setError]                 = useState('');
  const [recordState, setRecordState]     = useState('idle'); // idle | saving | saved | copied
  const [confirmRegen, setConfirmRegen]   = useState(false);

  async function handleScreenshot(file) {
    setExtracting(true);
    setError('');
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target.result.split(',')[1];
      try {
        const res = await fetch('/.netlify/functions/claude-process', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'extract_keywords_image', payload: { imageBase64: base64, mediaType: file.type || 'image/png' } }),
        });
        const data = await res.json();
        setExtracted(data.keywords || []);
      } catch { setError('Screenshot extraction failed'); }
      setExtracting(false);
    };
    reader.readAsDataURL(file);
  }

  function parseManual() {
    return manualText.trim().split('\n').filter(Boolean).map(line => {
      const [keyword, volume, competition, score] = line.split('|').map(p => p.trim());
      return { keyword, volume: volume ? parseInt(volume) : null, competition: competition ? parseInt(competition) : null, score: score ? parseInt(score) : null };
    }).filter(k => k.keyword);
  }

  const keywords = extracted.length > 0 ? extracted : parseManual();
  const hasInput = extracted.length > 0 || manualText.trim().length > 0;

  async function handleEvaluate() {
    setEvaluating(true);
    setError('');
    try {
      const res = await fetch('/.netlify/functions/claude-process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'evaluate_keyword_evidence', payload: { currentPrimaryIntent, currentPrimaryIntentStatus, newKeywords: keywords } }),
      });
      const raw = await res.text();
      let data;
      try { data = JSON.parse(raw); } catch { setError(`Server error: ${raw.slice(0, 150)}`); setEvaluating(false); return; }
      if (!data.parsed) { setError(data.error || 'No output returned'); setEvaluating(false); return; }
      setResult(data.parsed);
    } catch (err) { setError(err.message); }
    setEvaluating(false);
  }

  function reset() { setOpen(false); setManualText(''); setExtracted([]); setResult(null); setError(''); setRecordState('idle'); setConfirmRegen(false); }

  if (!open) {
    return (
      <button className="btn btn-ghost btn-sm" style={{ marginTop: 8, fontSize: '0.75rem' }} onClick={() => setOpen(true)}>
        + Found new keyword evidence?
      </button>
    );
  }

  const RECOMMENDATION_LABEL = { no_change: 'No change recommended', consider_at_next_review: 'Consider at next scheduled review', notable_shift: 'Notable shift — worth a real regeneration' };
  const RECOMMENDATION_COLOR = { no_change: '#2d6b3c', consider_at_next_review: '#7a4a1e', notable_shift: '#8b3a3a' };

  if (result) {
    // Same shape as SaveFlagsButton's note block — dated, explicit that the
    // listing itself was NOT changed by this review.
    const recordText = [
      `--- New Keyword Evidence Review (${new Date().toISOString().slice(0, 10)}) ---`,
      `Recommendation: ${RECOMMENDATION_LABEL[result.recommendation] || result.recommendation}`,
      result.reasoning,
      ...(result.notable_keywords || []).map(k => `- ${k.keyword}: ${k.note}`),
      '(Listing not changed.)',
    ].join('\n');

    async function handleRecord() {
      if (!productId) {
        navigator.clipboard.writeText(recordText);
        setRecordState('copied');
        setTimeout(() => setRecordState('idle'), 2000);
        return;
      }
      setRecordState('saving');
      await appendProductNote(productId, recordText);
      setRecordState('saved');
      setTimeout(() => setRecordState('idle'), 3000);
    }

    const unsavedEdits = hasUnsavedEdits({ editTitle, editTags, editDesc, editPrompts, output });
    function handleRegenerateClick() {
      if (unsavedEdits && !confirmRegen) { setConfirmRegen(true); return; }
      onRegenerate();
      reset();
    }

    return (
      <div style={{ marginTop: 12, background: 'var(--warm-white)', border: '1px solid rgba(43,41,38,0.1)', borderRadius: 4, padding: '12px 14px' }}>
        <div style={{ fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: RECOMMENDATION_COLOR[result.recommendation] || 'var(--charcoal-soft)', marginBottom: 6 }}>
          {RECOMMENDATION_LABEL[result.recommendation] || result.recommendation}
        </div>
        <div style={{ fontSize: '0.82rem', color: 'var(--charcoal-soft)', lineHeight: 1.6, marginBottom: result.notable_keywords?.length ? 10 : 0 }}>{result.reasoning}</div>
        {result.notable_keywords?.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
            {result.notable_keywords.map((k, i) => (
              <div key={i} style={{ fontSize: '0.75rem' }}><strong>{k.keyword}</strong> — {k.note}</div>
            ))}
          </div>
        )}
        {isLive && (
          <div style={{ fontSize: '0.72rem', color: 'var(--charcoal-soft)', opacity: 0.8, marginBottom: 8 }}>
            This listing is live — recording for your next scheduled review is usually safer than changing SEO now.
          </div>
        )}
        {confirmRegen ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.82rem' }}>
            <span>Discard edits &amp; regenerate?</span>
            <button onClick={handleRegenerateClick} style={{ color: 'var(--alert)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer' }}>
              Yes, regenerate
            </button>
            <button onClick={() => setConfirmRegen(false)} style={{ color: 'var(--charcoal-soft)', background: 'none', border: 'none', cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-primary btn-sm" onClick={handleRecord} disabled={recordState === 'saving'}>
              {recordState === 'saved' ? '✓ Recorded in product notes' : recordState === 'copied' ? '✓ Copied' : recordState === 'saving' ? 'Saving…' : productId ? 'Record for next review' : 'Copy for next review'}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={reset}>Dismiss</button>
            {result.recommendation === 'notable_shift' && (
              <button className="btn btn-ghost btn-sm" onClick={handleRegenerateClick}>Regenerate listing →</button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ marginTop: 12, background: 'var(--warm-white)', border: '1px solid rgba(43,41,38,0.1)', borderRadius: 4, padding: '12px 14px' }}>
      <div style={{ fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--charcoal-soft)', marginBottom: 10 }}>New Keyword Evidence</div>
      {extracted.length > 0 ? (
        <div style={{ fontSize: '0.78rem', color: '#2d6b3c', marginBottom: 10 }}>✓ {extracted.length} keywords extracted — ready to evaluate</div>
      ) : (
        <>
          <div style={{ fontSize: '0.72rem', color: 'var(--charcoal-soft)', marginBottom: 6 }}>Upload an Everbee screenshot or enter keywords manually (keyword | volume | competition | score):</div>
          <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer', marginBottom: 8, display: 'inline-block' }}>
            {extracting ? 'Extracting…' : 'Upload screenshot'}
            <input type="file" accept="image/*" style={{ display: 'none' }} disabled={extracting} onChange={e => { if (e.target.files[0]) handleScreenshot(e.target.files[0]); }} />
          </label>
          <textarea
            value={manualText}
            onChange={e => setManualText(e.target.value)}
            placeholder={'beach reads shirt | 2400 | 180 | 52000\nspicy book shirt | 1800 | 95 | 38000'}
            rows={3}
            style={{ width: '100%', fontSize: '0.78rem', fontFamily: 'monospace' }}
          />
        </>
      )}
      {error && <div style={{ fontSize: '0.75rem', color: '#c97b7b', marginBottom: 8 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button className="btn btn-primary btn-sm" onClick={handleEvaluate} disabled={evaluating || !hasInput}>
          {evaluating ? 'Evaluating…' : 'Compare against current strategy →'}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={reset}>Cancel</button>
      </div>
    </div>
  );
}
