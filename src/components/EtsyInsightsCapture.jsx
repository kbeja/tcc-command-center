import { useState, useRef } from 'react';
import { createResearchSession, uploadResearchEvidence } from '../lib/hooks';
import { nowISO } from '../lib/utils';
import NichePicker from './NichePicker';
import { extractEtsyInsights } from '../lib/claude';
// Screenshots off a retina display run several MB; Claude downscales past
// ~1568px anyway, so resize before sending rather than pushing a huge base64
// payload through the function.
import { resizeImageForUpload } from '../lib/image';

// ─── Etsy Marketplace Insights capture (Phase 8b / §16) ────────────────────
// §16 is unambiguous about what NOT to build: no automatic Etsy scraping, no
// fake CSV importer, no OCR that writes without review. Etsy Marketplace
// Insights has no export in this workflow, so the honest path is manual entry
// alongside the screenshot it came from:
//
//     Screenshot -> extraction suggestion -> HUMAN REVIEW -> data
//
// All four steps now exist. "Read terms from screenshot" fills the form from
// an image and stops there: nothing is saved, every value stays editable, and
// fields the model flagged as hard to read are marked so they get looked at
// first. A transcription you cannot distinguish from a confident reading is
// worse than none, because it looks already checked.
//
// The screenshot is also stored as evidence next to the numbers, so a reading
// can be traced back to what the screen actually said — which matters more
// here than for eRank or EverBee, because there is no file to re-import if a
// number is questioned later.
//
// Rows land in keyword_history through createResearchSession, one reading per
// keyword per capture, appended and never overwriting another source. The
// Etsy-only columns stay null for every other source, which is what keeps §3's
// "never combine sources into a mystery score" structurally true rather than
// merely intended.

const SOURCE = 'Etsy Marketplace Insights';

// Etsy's own wording, kept verbatim rather than paraphrased — §14 asks that
// the sampling caveat be preserved as source context, not restated as if TCC
// had verified it.
const ETSY_CAVEAT = 'Based on a sample of aggregated Etsy marketplace activity — not a complete census.';

const CONVERSION_CLASSES = ['Very high', 'High', 'Typical', 'Low', 'Very low'];

function blankRow() {
  return {
    keyword: '', volume: '', competition: '', trend_pct: '',
    conversion_class: '', price_range: '', similar_terms: '',
  };
}

export default function EtsyInsightsCapture({ onSaved }) {
  const [nicheId, setNicheId] = useState(null);
  const [collection, setCollection] = useState('');
  const [capturedAt, setCapturedAt] = useState(nowISO().slice(0, 10));
  const [rows, setRows] = useState([blankRow()]);
  const [file, setFile] = useState(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [extractNote, setExtractNote] = useState('');
  // Field names the model flagged as hard to read, keyed by row index. These
  // get a visible marker — a transcription you cannot tell apart from a
  // confident reading is worse than no transcription, because it looks checked.
  const [uncertain, setUncertain] = useState({});
  const fileRef = useRef();

  const filled = rows.filter(r => r.keyword.trim());

  function update(i, patch) {
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  }

  // §16's middle step. Fills the form and stops — nothing is saved, nothing
  // touches the database, and every value stays editable. §29 rules out OCR
  // that writes without review, so this deliberately cannot.
  async function handleExtract() {
    if (!file) return;
    setExtracting(true);
    setExtractNote('');
    setResult('');
    try {
      const { base64, mediaType } = await resizeImageForUpload(file);
      const { ok, data, error } = await extractEtsyInsights(base64, mediaType);
      if (!ok) { setExtractNote(error || 'Extraction failed.'); setExtracting(false); return; }

      const ex = data.extraction || {};
      if (!ex.readable || !(ex.rows || []).length) {
        setExtractNote(ex.notes || 'Could not read this as an Etsy Marketplace Insights screen. Type the values in instead.');
        setExtracting(false);
        return;
      }

      const flags = {};
      const rowsFromImage = ex.rows.map((r, i) => {
        if (r.uncertain_fields?.length) flags[i] = r.uncertain_fields;
        return {
          keyword: r.keyword || '',
          // Null means the model could not read it, and it must arrive as an
          // empty field rather than a zero — a 0 would save as real evidence.
          volume: r.volume ?? '',
          competition: r.competition ?? '',
          trend_pct: r.trend_pct ?? '',
          conversion_class: r.conversion_class || '',
          price_range: r.price_range || '',
          similar_terms: (r.similar_terms || []).join(', '),
        };
      });

      setRows(rowsFromImage);
      setUncertain(flags);
      if (ex.capture_date) setCapturedAt(ex.capture_date);
      const flagged = Object.keys(flags).length;
      setExtractNote(
        `Read ${rowsFromImage.length} term${rowsFromImage.length !== 1 ? 's' : ''}. Check everything before saving`
        + (flagged ? ` — ${flagged} row${flagged !== 1 ? 's have' : ' has'} a value it wasn't sure about.` : '.')
        + (ex.notes ? ` ${ex.notes}` : '')
      );
    } catch (err) {
      setExtractNote(err.message || 'Could not read that image.');
    }
    setExtracting(false);
  }

  async function handleSave() {
    if (!filled.length) return;
    setSaving(true);
    setResult('');

    const keywords = filled.map(r => ({
      keyword: r.keyword.trim(),
      // "Searches, last 30 days" and "Search results" map onto the ledger's
      // existing volume/competition, so Etsy readings sit directly beside
      // eRank and EverBee ones for the same term rather than in a parallel
      // structure that could never be compared.
      volume: r.volume === '' ? null : parseInt(r.volume, 10),
      competition: r.competition === '' ? null : parseInt(r.competition, 10),
      trend_pct: r.trend_pct === '' ? null : parseFloat(r.trend_pct),
      conversion_class: r.conversion_class || null,
      price_range: r.price_range.trim() || null,
      similar_terms: r.similar_terms.trim()
        ? r.similar_terms.split(',').map(t => t.trim()).filter(Boolean)
        : null,
      source_caveat: ETSY_CAVEAT,
      data_window: '30d',
      tag_type: 'watch',
      tags_only: false,
    }));

    const { data: session, error } = await createResearchSession(
      {
        collection: collection || null,
        niche_id: nicheId || null,
        date: capturedAt,
        source: SOURCE,
        status: 'Complete',
        notes: notes.trim() || null,
      },
      keywords,
    );

    if (error) {
      setSaving(false);
      setResult(`Could not save: ${error.message}`);
      return;
    }

    // Evidence is attached AFTER the session exists so it can point at it.
    // A failed upload does not undo the reading — the numbers are the record;
    // the screenshot corroborates it. Reported plainly rather than swallowed.
    let evidenceNote = '';
    if (file) {
      const { error: upErr } = await uploadResearchEvidence(file, {
        sessionId: session?.id || null,
        nicheId: nicheId || null,
        source: SOURCE,
        capturedAt,
        label: `Etsy Marketplace Insights — ${capturedAt}`,
      });
      evidenceNote = upErr
        ? ` Screenshot failed to upload (${upErr.message}) — the readings saved.`
        : ' Screenshot attached.';
    }

    setSaving(false);
    setResult(`Saved ${filled.length} reading${filled.length !== 1 ? 's' : ''}.${evidenceNote}`);
    setRows([blankRow()]);
    setFile(null);
    if (fileRef.current) fileRef.current.value = '';
    onSaved?.();
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="eyebrow" style={{ marginBottom: 4 }}>Etsy Marketplace Insights</div>
      <div style={{ fontSize: '0.7rem', color: 'var(--charcoal-soft)', marginBottom: 12, lineHeight: 1.5 }}>
        Etsy has no export for this, so readings are typed in by hand next to the screenshot they came from.
        Each one is appended to the keyword&rsquo;s evidence ledger &mdash; it never overwrites what eRank or EverBee said.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10, marginBottom: 12 }}>
        <NichePicker value={nicheId} onChange={setNicheId} label="Niche" allowCreate />
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Collection <span style={{ fontWeight: 400, opacity: 0.5 }}>(optional)</span></label>
          <input value={collection} onChange={e => setCollection(e.target.value)} placeholder="Leave blank if none" />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Date captured</label>
          <input type="date" value={capturedAt} onChange={e => setCapturedAt(e.target.value)} />
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
        {rows.map((r, i) => (
          <div key={i} style={{
            border: uncertain[i] ? '1px solid rgba(232,168,124,0.6)' : '1px solid rgba(43,41,38,0.1)',
            borderRadius: 3, padding: 8,
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 6,
          }}>
            {uncertain[i] && (
              <div style={{ gridColumn: '1 / -1', fontSize: '0.64rem', color: '#7a4a1e' }}>
                Hard to read: {uncertain[i].join(', ')} — check against your screenshot.
              </div>
            )}
            <input value={r.keyword} onChange={e => update(i, { keyword: e.target.value })}
              placeholder="Search term" style={{ gridColumn: '1 / -1' }} />
            <input value={r.volume} onChange={e => update(i, { volume: e.target.value })}
              placeholder="Searches (30d)" inputMode="numeric" />
            <input value={r.competition} onChange={e => update(i, { competition: e.target.value })}
              placeholder="Search results" inputMode="numeric" />
            <input value={r.trend_pct} onChange={e => update(i, { trend_pct: e.target.value })}
              placeholder="Trend % vs prior" inputMode="decimal" />
            <select value={r.conversion_class} onChange={e => update(i, { conversion_class: e.target.value })}>
              <option value="">Conversion…</option>
              {CONVERSION_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <input value={r.price_range} onChange={e => update(i, { price_range: e.target.value })}
              placeholder="Price range, e.g. $18–$32" />
            <input value={r.similar_terms} onChange={e => update(i, { similar_terms: e.target.value })}
              placeholder="Similar terms, comma-separated" style={{ gridColumn: '1 / -1' }} />
          </div>
        ))}
      </div>

      <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.68rem', marginBottom: 12 }}
        onClick={() => setRows(prev => [...prev, blankRow()])}>
        + Another term
      </button>

      <div className="form-group">
        <label className="form-label">Screenshot <span style={{ fontWeight: 400, opacity: 0.5 }}>(optional but recommended)</span></label>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input ref={fileRef} type="file" accept="image/*"
            onChange={e => { setFile(e.target.files?.[0] || null); setExtractNote(''); }} />
          {file && (
            <button className="btn btn-primary btn-sm" style={{ fontSize: '0.68rem' }}
              onClick={handleExtract} disabled={extracting}>
              {extracting ? 'Reading…' : 'Read terms from screenshot'}
            </button>
          )}
        </div>
        {extractNote && (
          <div style={{ fontSize: '0.7rem', marginTop: 5, color: /Read \d/.test(extractNote) ? '#7a4a1e' : '#7a2b2b', lineHeight: 1.5 }}>
            {extractNote}
          </div>
        )}
        <div style={{ fontSize: '0.66rem', color: 'var(--charcoal-soft)', marginTop: 3 }}>
          Kept so a reading can be traced back to what the screen actually said &mdash; there&rsquo;s no file to re-import if a number is questioned later.
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Notes <span style={{ fontWeight: 400, opacity: 0.5 }}>(optional)</span></label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
          placeholder="What were you looking into, and why?" />
      </div>

      <div style={{ fontSize: '0.64rem', color: 'var(--charcoal-soft)', marginBottom: 10, fontStyle: 'italic' }}>
        {ETSY_CAVEAT} Stored with every reading.
      </div>

      {result && (
        <div style={{ fontSize: '0.75rem', marginBottom: 8, color: result.startsWith('Saved') ? '#2d6b3c' : '#7a2b2b' }}>
          {result}
        </div>
      )}

      <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving || !filled.length}>
        {saving ? 'Saving…' : `Save ${filled.length || ''} reading${filled.length !== 1 ? 's' : ''}`}
      </button>
    </div>
  );
}
