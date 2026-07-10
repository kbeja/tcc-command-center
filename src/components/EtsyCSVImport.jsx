import { useState, useRef } from 'react';
import { supabase } from '../lib/supabase';

function fuzzyMatch(csvTitle, products) {
  const t = csvTitle.toLowerCase().trim();
  // Exact match first
  let match = products.find(p => p.name.toLowerCase().trim() === t);
  if (match) return { product: match, confidence: 'exact' };
  // Contains match
  match = products.find(p => t.includes(p.name.toLowerCase().trim().slice(0, 20)));
  if (match) return { product: match, confidence: 'fuzzy' };
  // Word overlap
  const csvWords = new Set(t.split(/\s+/).filter(w => w.length > 3));
  let best = null, bestScore = 0;
  for (const p of products) {
    const pWords = p.name.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const overlap = pWords.filter(w => csvWords.has(w)).length;
    const score = overlap / Math.max(pWords.length, 1);
    if (score > bestScore && score >= 0.5) { bestScore = score; best = p; }
  }
  if (best) return { product: best, confidence: 'fuzzy' };
  return { product: null, confidence: 'none' };
}

function parseEtsyCSV(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim().toLowerCase());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(',').map(v => v.replace(/"/g, '').trim());
    if (vals.length < 2) continue;
    const row = {};
    headers.forEach((h, idx) => { row[h] = vals[idx] || ''; });
    rows.push(row);
  }
  return rows;
}

function extractField(row, candidates) {
  for (const c of candidates) {
    const key = Object.keys(row).find(k => k.includes(c));
    if (key && row[key] !== '' && row[key] !== undefined) return row[key];
  }
  return null;
}

export default function EtsyCSVImport({ products, onImported }) {
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
      const text = ev.target.result;
      const rows = parseEtsyCSV(text);
      const liveProducts = products.filter(p => p.stage === 'Live' || p.stage === 'Reviewing');

      const matched = [], unmatched = [];
      for (const row of rows) {
        const title = extractField(row, ['listing title', 'title', 'listing name', 'name']);
        if (!title) continue;
        const views = parseInt(extractField(row, ['visits', 'views']) || '0') || 0;
        const orders = parseInt(extractField(row, ['orders', 'sales']) || '0') || 0;
        const revenue = parseFloat((extractField(row, ['revenue', 'total revenue']) || '0').replace('$', '')) || 0;
        const conv = parseFloat((extractField(row, ['conversion', 'conv']) || '0').replace('%', '')) || 0;
        const favs = parseInt(extractField(row, ['favorites', 'favs']) || '0') || 0;

        const { product, confidence } = fuzzyMatch(title, liveProducts);
        const entry = { csvTitle: title, views, orders, revenue, conv, favs };
        if (product) matched.push({ ...entry, product, confidence });
        else unmatched.push(entry);
      }
      setParsed({ matched, unmatched });
    };
    reader.readAsText(file);
  }

  function setManualMatch(csvTitle, productId) {
    setManualMatches(prev => ({ ...prev, [csvTitle]: productId }));
  }

  async function handleImport() {
    if (!parsed) return;
    setImporting(true);
    const now = new Date().toISOString();
    let updated = 0;

    // Check for manually entered data that would be overwritten
    const toUpdate = [...parsed.matched];
    for (const u of parsed.unmatched) {
      const productId = manualMatches[u.csvTitle];
      if (productId) {
        const product = products.find(p => p.id === productId);
        if (product) toUpdate.push({ ...u, product, confidence: 'manual' });
      }
    }

    for (const item of toUpdate) {
      const updates = {
        views: item.views || null,
        mo_sales: item.orders || null,
        mo_revenue: item.revenue || null,
        conversion_rate: item.conv || null,
        favorites: item.favs || null,
        updated_at: now,
      };
      await supabase.from('products').update(updates).eq('id', item.product.id);
      updated++;
    }

    // Log import
    await supabase.from('import_history').insert({
      import_type: 'etsy',
      imported_at: now,
      records_updated: updated,
      notes: `${parsed.unmatched.length - Object.keys(manualMatches).length} unmatched`,
    });

    setResult({ updated, unmatched: parsed.unmatched.filter(u => !manualMatches[u.csvTitle]).length });
    setLastImported(new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }));
    setImporting(false);
    setParsed(null);
    setManualMatches({});
    onImported?.();
    if (fileRef.current) fileRef.current.value = '';
  }

  return (
    <div>
      <div className="section-label" style={{ marginBottom: 10 }}>Import Etsy Data</div>
      <div style={{ fontSize: '0.78rem', color: 'var(--charcoal-soft)', marginBottom: 12, lineHeight: 1.6 }}>
        Download your stats CSV from Etsy Studio → Stats → Export
      </div>

      {result && (
        <div style={{ background: 'rgba(124,175,138,0.1)', border: '1px solid var(--success)', borderRadius: 2, padding: '12px 14px', marginBottom: 16 }}>
          <div style={{ fontSize: '0.82rem', fontWeight: 500, marginBottom: 4 }}>Import complete</div>
          <div style={{ fontSize: '0.78rem', color: 'var(--charcoal-soft)' }}>✓ {result.updated} listings updated</div>
          {result.unmatched > 0 && <div style={{ fontSize: '0.78rem', color: 'var(--warning)' }}>⚠ {result.unmatched} could not be matched</div>}
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
            <span style={{ fontSize: '1.5rem', marginBottom: 8 }}>📄</span>
            <span style={{ fontSize: '0.82rem', fontWeight: 500 }}>Upload Etsy CSV file</span>
            <span style={{ fontSize: '0.72rem', color: 'var(--charcoal-soft)', marginTop: 4 }}>Tap to select</span>
            <input ref={fileRef} type="file" accept=".csv" onChange={handleFile} style={{ display: 'none' }} />
          </label>
          {lastImported && (
            <div style={{ fontSize: '0.7rem', color: 'var(--charcoal-soft)' }}>Last imported: {lastImported}</div>
          )}
          {!lastImported && (
            <div style={{ fontSize: '0.7rem', color: 'var(--charcoal-soft)' }}>Last imported: never</div>
          )}
        </div>
      )}

      {parsed && (
        <div>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: '0.82rem', fontWeight: 500, marginBottom: 8 }}>
              Preview — {parsed.matched.length} matched · {parsed.unmatched.length} unmatched
            </div>
            {parsed.matched.map((item, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', borderBottom: '1px solid rgba(43,41,38,0.06)', fontSize: '0.75rem' }}>
                <div>
                  <span style={{ color: 'var(--charcoal-soft)' }}>{item.csvTitle.slice(0, 40)}{item.csvTitle.length > 40 ? '…' : ''}</span>
                  <span style={{ margin: '0 6px', color: 'var(--charcoal-soft)' }}>→</span>
                  <span>{item.product.name.slice(0, 30)}</span>
                  {item.confidence === 'fuzzy' && <span style={{ marginLeft: 6, fontSize: '0.65rem', color: 'var(--warning)' }}>fuzzy</span>}
                </div>
                <div style={{ color: 'var(--charcoal-soft)', whiteSpace: 'nowrap', marginLeft: 8 }}>
                  {item.orders} orders · ${item.revenue.toFixed(2)}
                </div>
              </div>
            ))}
          </div>

          {parsed.unmatched.length > 0 && (
            <div style={{ background: 'rgba(232,168,124,0.1)', border: '1px solid var(--warning)', borderRadius: 2, padding: '12px 14px', marginBottom: 14 }}>
              <div className="eyebrow" style={{ marginBottom: 10 }}>Could not match</div>
              {parsed.unmatched.map((item, i) => (
                <div key={i} style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: '0.78rem', marginBottom: 6, color: 'var(--charcoal-soft)' }}>
                    "{item.csvTitle.slice(0, 60)}"
                  </div>
                  <select
                    value={manualMatches[item.csvTitle] || ''}
                    onChange={e => setManualMatch(item.csvTitle, e.target.value)}
                    style={{ width: '100%', fontSize: '0.75rem', marginBottom: 4 }}
                  >
                    <option value="">— Skip this listing —</option>
                    {products.filter(p => p.stage === 'Live' || p.stage === 'Reviewing').map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" onClick={handleImport} disabled={importing}>
              {importing ? 'Importing…' : `Import ${parsed.matched.length + Object.keys(manualMatches).length} listings →`}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => { setParsed(null); if (fileRef.current) fileRef.current.value = ''; }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
