import { useRef, useState } from 'react';
import { parseEtsyAdsCSV } from '../lib/tccIntelligence';
import { useShopAdsDaily, importShopAdsDaily } from '../lib/hooks';

// Phase 23A — Etsy Ads daily importer.
//
// This is the ONLY real performance export Etsy offers. There is no stats or
// traffic CSV: visits, favourites and conversion exist on screen only. The
// importer this replaces was written for a per-listing stats CSV Etsy has
// never produced — its instructions still pointed at Etsy Studio, shut down in
// 2018, and import_history was empty because it had never once run.
//
// Shop-level, so it needs no product matching and works before any listing
// linkage exists. That is why it ships first.
//
// "Views" in Etsy's export means ad IMPRESSIONS. It is renamed on the way in
// and the ambiguous word never reaches the database — on the Stats screen the
// same word means something ~50x different.
//
// Parse -> preview -> approve -> save, like every other importer in this app.
// Nothing is written until she clicks.

function fmtDate(iso) {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

function Stat({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: '0.62rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--charcoal-soft)' }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem' }}>{value}</div>
    </div>
  );
}

export default function EtsyAdsCSVImport({ onImported }) {
  const fileRef = useRef(null);
  const { days, refetch } = useShopAdsDaily(1);
  const [parsed, setParsed] = useState(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(''); setResult(null); setParsed(null);
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = ev => {
      const { rows, problems, hourly } = parseEtsyAdsCSV(ev.target.result);
      if (!rows.length) {
        // A file that produced nothing is reported loudly rather than as an
        // empty success — silently importing zero rows is how a broken
        // importer stays broken for months.
        setError(problems[0] || 'No usable rows found in that file.');
        return;
      }
      setParsed({ rows, problems, hourly });
    };
    reader.onerror = () => setError('Could not read that file.');
    reader.readAsText(file);
  }

  async function handleImport() {
    setImporting(true);
    const { inserted, updated, error: err } = await importShopAdsDaily(parsed.rows);
    setImporting(false);
    if (err) { setError(err.message); return; }
    setResult({ inserted, updated });
    setParsed(null);
    await refetch();
    onImported?.();
  }

  const totals = parsed?.rows.reduce((a, r) => ({
    impressions: a.impressions + (r.impressions || 0),
    clicks: a.clicks + (r.clicks || 0),
    orders: a.orders + (r.orders || 0),
    spend: a.spend + (r.spend || 0),
    revenue: a.revenue + (r.revenue || 0),
  }), { impressions: 0, clicks: 0, orders: 0, spend: 0, revenue: 0 });

  return (
    <div style={{ border: 'var(--border)', borderRadius: 2, padding: 16, background: 'var(--warm-white)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <div className="eyebrow">Etsy Ads — daily performance</div>
        {days[0] ? (
          <span style={{ fontSize: '0.72rem', color: 'var(--charcoal-soft)' }}>
            latest day on record: {fmtDate(days[0].date)}
          </span>
        ) : null}
      </div>

      <div style={{ fontSize: '0.78rem', color: 'var(--charcoal-soft)', margin: '8px 0 12px', lineHeight: 1.55 }}>
        In Etsy: <strong>Marketing → Etsy Ads</strong>, set the date range (Last 30 days works well), then click the
        download icon above the chart. Re-importing an overlapping range corrects those days rather than duplicating
        them, so it is safe to run often.
      </div>

      <input ref={fileRef} type="file" accept=".csv" onChange={handleFile} style={{ display: 'none' }} />
      <button className="btn btn-sm btn-ghost" onClick={() => fileRef.current?.click()}>
        Choose Etsy Ads CSV…
      </button>
      {fileName ? <span style={{ fontSize: '0.74rem', color: 'var(--charcoal-soft)', marginLeft: 8 }}>{fileName}</span> : null}

      {error && (
        <div style={{ marginTop: 10, fontSize: '0.78rem', color: '#8b3a3a' }}>⚠ {error}</div>
      )}

      {parsed && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(43,41,38,0.1)' }}>
          <div style={{ fontSize: '0.78rem', marginBottom: 10 }}>
            <strong>{parsed.rows.length}</strong> day{parsed.rows.length === 1 ? '' : 's'} ready to import
            {' · '}{fmtDate(parsed.rows[0].date)} – {fmtDate(parsed.rows[parsed.rows.length - 1].date)}
            {parsed.hourly ? (
              <div style={{ color: 'var(--charcoal-soft)', marginTop: 3 }}>
                This was a single-day export, so its hourly rows were combined into one day. Click rate was
                recalculated from the totals rather than summed.
              </div>
            ) : null}
          </div>

          <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', marginBottom: 12 }}>
            <Stat label="Impressions" value={totals.impressions.toLocaleString()} />
            <Stat label="Clicks" value={totals.clicks.toLocaleString()} />
            <Stat label="Orders" value={totals.orders.toLocaleString()} />
            <Stat label="Spend" value={`$${totals.spend.toFixed(2)}`} />
            <Stat label="Revenue" value={`$${totals.revenue.toFixed(2)}`} />
          </div>

          {/* Etsy's own screen shows these same totals for the same range —
              a mismatch means the parse is wrong, so they're shown before
              anything is written rather than after. */}
          <div style={{ fontSize: '0.72rem', color: 'var(--charcoal-soft)', marginBottom: 10 }}>
            These should match the totals on Etsy&rsquo;s own Ads page for the same date range. If they don&rsquo;t,
            don&rsquo;t import — tell me and I&rsquo;ll look at the file.
          </div>

          {parsed.problems.length > 0 && (
            <div style={{ fontSize: '0.75rem', color: '#7a4a1e', marginBottom: 10 }}>
              ⚠ {parsed.problems.length} row{parsed.problems.length === 1 ? '' : 's'} could not be read and will be skipped:
              <ul style={{ margin: '4px 0 0 16px' }}>
                {parsed.problems.slice(0, 4).map((p, i) => <li key={i}>{p}</li>)}
              </ul>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={handleImport} disabled={importing}>
              {importing ? 'Importing…' : `Import ${parsed.rows.length} day${parsed.rows.length === 1 ? '' : 's'}`}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => { setParsed(null); setFileName(''); }}>Cancel</button>
          </div>
        </div>
      )}

      {result && (
        <div style={{ marginTop: 12, fontSize: '0.8rem', color: '#2d6b3c' }}>
          ✓ {result.inserted} new day{result.inserted === 1 ? '' : 's'} added
          {result.updated ? ` · ${result.updated} existing day${result.updated === 1 ? '' : 's'} corrected` : ''}
        </div>
      )}
    </div>
  );
}
