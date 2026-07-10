import { useState, useRef } from 'react';
import { supabase } from '../lib/supabase';

function parseCSV(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim().toLowerCase());
  return lines.slice(1).map(line => {
    const vals = line.split(',').map(v => v.replace(/"/g, '').trim());
    const row = {};
    headers.forEach((h, i) => { row[h] = vals[i] || ''; });
    return row;
  }).filter(r => Object.values(r).some(v => v));
}

function extractField(row, candidates) {
  for (const c of candidates) {
    const key = Object.keys(row).find(k => k.includes(c));
    if (key && row[key]) return row[key];
  }
  return null;
}

function fuzzyMatchUrl(url, products) {
  if (!url) return null;
  for (const p of products) {
    if (p.etsy_listing_id && url.includes(p.etsy_listing_id)) return p;
    if (url.toLowerCase().includes(p.name.toLowerCase().slice(0, 15))) return p;
  }
  return null;
}

export default function PinterestCSVImport({ products, onImported }) {
  const fileRef = useRef(null);
  const [parsed, setParsed] = useState(null);
  const [manualMatches, setManualMatches] = useState({});
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [lastImported, setLastImported] = useState(null);

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const rows = parseCSV(ev.target.result);
      const liveProducts = products.filter(p => p.stage === 'Live' || p.stage === 'Reviewing');
      const matched = [], unmatched = [];

      for (const row of rows) {
        const title = extractField(row, ['pin title', 'title', 'name']);
        const url = extractField(row, ['link', 'url', 'outbound url']);
        const impressions = parseInt(extractField(row, ['impression', 'views']) || '0') || 0;
        const saves = parseInt(extractField(row, ['save', 'repin']) || '0') || 0;
        const clicks = parseInt(extractField(row, ['link click', 'click', 'outbound']) || '0') || 0;

        if (!title && !url) continue;
        const product = fuzzyMatchUrl(url, liveProducts);
        const entry = { title: title || url || '(untitled)', url, impressions, saves, clicks };
        if (product) matched.push({ ...entry, product });
        else unmatched.push(entry);
      }
      setParsed({ matched, unmatched });
    };
    reader.readAsText(file);
  }

  async function handleImport() {
    if (!parsed) return;
    setImporting(true);
    const now = new Date().toISOString();
    let updated = 0;

    const toUpdate = [...parsed.matched];
    for (const u of parsed.unmatched) {
      const productId = manualMatches[u.title];
      if (productId) {
        const product = products.find(p => p.id === productId);
        if (product) toUpdate.push({ ...u, product });
      }
    }

    for (const item of toUpdate) {
      await supabase.from('products').update({
        pinterest_impressions: item.impressions || null,
        pinterest_saves: item.saves || null,
        pinterest_clicks: item.clicks || null,
        updated_at: now,
      }).eq('id', item.product.id);
      updated++;
    }

    await supabase.from('import_history').insert({
      import_type: 'pinterest',
      imported_at: now,
      records_updated: updated,
      notes: `${parsed.unmatched.length} unmatched`,
    });

    setResult({ updated });
    setLastImported(new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }));
    setImporting(false);
    setParsed(null);
    setManualMatches({});
    onImported?.();
    if (fileRef.current) fileRef.current.value = '';
  }

  return (
    <div>
      <div className="section-label" style={{ marginBottom: 10 }}>Import Pinterest Data</div>
      <div style={{ fontSize: '0.78rem', color: 'var(--charcoal-soft)', marginBottom: 12, lineHeight: 1.6 }}>
        Download your analytics CSV from Pinterest → Pinterest Analytics → Export
      </div>

      {result && (
        <div style={{ background: 'rgba(124,175,138,0.1)', border: '1px solid var(--success)', borderRadius: 2, padding: '12px 14px', marginBottom: 16 }}>
          <div style={{ fontSize: '0.82rem', fontWeight: 500, marginBottom: 4 }}>Import complete</div>
          <div style={{ fontSize: '0.78rem', color: 'var(--charcoal-soft)' }}>✓ {result.updated} listings updated with Pinterest data</div>
          <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => setResult(null)}>Import another</button>
        </div>
      )}

      {!parsed && !result && (
        <div>
          <label style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            border: '1px dashed rgba(43,41,38,0.25)', borderRadius: 2, padding: '24px 16px',
            cursor: 'pointer', background: 'var(--warm-white)', marginBottom: 8,
          }}>
            <span style={{ fontSize: '1.5rem', marginBottom: 8 }}>📌</span>
            <span style={{ fontSize: '0.82rem', fontWeight: 500 }}>Upload Pinterest CSV file</span>
            <span style={{ fontSize: '0.72rem', color: 'var(--charcoal-soft)', marginTop: 4 }}>Tap to select</span>
            <input ref={fileRef} type="file" accept=".csv" onChange={handleFile} style={{ display: 'none' }} />
          </label>
          <div style={{ fontSize: '0.7rem', color: 'var(--charcoal-soft)' }}>
            Last imported: {lastImported || 'never'}
          </div>
        </div>
      )}

      {parsed && (
        <div>
          <div style={{ fontSize: '0.82rem', fontWeight: 500, marginBottom: 10 }}>
            {parsed.matched.length} pins matched · {parsed.unmatched.length} unmatched
          </div>

          {parsed.matched.map((item, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(43,41,38,0.06)', fontSize: '0.75rem' }}>
              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                <span style={{ color: 'var(--charcoal-soft)' }}>{item.title.slice(0, 30)}</span>
                <span style={{ margin: '0 6px' }}>→</span>
                <span>{item.product.name.slice(0, 25)}</span>
              </div>
              <div style={{ color: 'var(--charcoal-soft)', whiteSpace: 'nowrap', marginLeft: 8 }}>
                {item.impressions.toLocaleString()} imp · {item.clicks} clicks
              </div>
            </div>
          ))}

          {parsed.unmatched.length > 0 && (
            <div style={{ background: 'rgba(232,168,124,0.1)', border: '1px solid var(--warning)', borderRadius: 2, padding: '12px 14px', marginTop: 12, marginBottom: 14 }}>
              <div className="eyebrow" style={{ marginBottom: 10 }}>Could not match</div>
              {parsed.unmatched.map((item, i) => (
                <div key={i} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--charcoal-soft)', marginBottom: 6 }}>
                    "{item.title.slice(0, 50)}"
                  </div>
                  <select
                    value={manualMatches[item.title] || ''}
                    onChange={e => setManualMatches(prev => ({ ...prev, [item.title]: e.target.value }))}
                    style={{ width: '100%', fontSize: '0.75rem' }}
                  >
                    <option value="">— Skip —</option>
                    {products.filter(p => p.stage === 'Live' || p.stage === 'Reviewing').map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn btn-primary" onClick={handleImport} disabled={importing}>
              {importing ? 'Importing…' : `Import ${parsed.matched.length + Object.keys(manualMatches).length} pins →`}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => { setParsed(null); if (fileRef.current) fileRef.current.value = ''; }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
