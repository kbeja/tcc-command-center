import { useState } from 'react';
import { supabase } from '../lib/supabase';

function parseStats(text) {
  const result = { visits: null, views: null, orders: null, revenue: null, conversion: null };

  const patterns = [
    { key: 'visits',     re: /(\d[\d,]*)\s*visits?/i },
    { key: 'views',      re: /(\d[\d,]*)\s*views?/i },
    { key: 'orders',     re: /(\d[\d,]*)\s*orders?/i },
    { key: 'revenue',    re: /\$\s*([\d,]+(?:\.\d+)?)/i },
    { key: 'conversion', re: /([\d.]+)\s*%\s*conversion/i },
  ];

  for (const { key, re } of patterns) {
    const m = text.match(re);
    if (m) result[key] = parseFloat(m[1].replace(/,/g, ''));
  }

  // Second pass for revenue without $ sign
  if (!result.revenue) {
    const m = text.match(/revenue[:\s]+\$?([\d,]+(?:\.\d+)?)/i);
    if (m) result.revenue = parseFloat(m[1].replace(/,/g, ''));
  }

  return result;
}

export default function WeeklyReview({ onApplied }) {
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState(null);
  const [edited, setEdited] = useState({});
  const [applying, setApplying] = useState(false);
  const [done, setDone] = useState(false);

  function handleParse() {
    const stats = parseStats(text);
    setParsed(stats);
    setEdited({ ...stats });
  }

  async function handleApply() {
    setApplying(true);
    const now = new Date().toISOString();
    // Store as shop-level stats — update all live products proportionally
    // For now, log to import_history and surface in overview
    await supabase.from('import_history').insert({
      import_type: 'weekly_review',
      imported_at: now,
      records_updated: 1,
      notes: JSON.stringify(edited),
    });
    setApplying(false);
    setDone(true);
    onApplied?.();
  }

  const hasData = parsed && Object.values(parsed).some(v => v !== null);
  const LABELS = { visits: 'Visits', views: 'Views', orders: 'Orders', revenue: 'Revenue ($)', conversion: 'Conversion (%)' };

  if (done) {
    return (
      <div>
        <div className="section-label" style={{ marginBottom: 10 }}>Weekly Review</div>
        <div style={{ background: 'rgba(124,175,138,0.1)', border: '1px solid var(--success)', borderRadius: 2, padding: '12px 14px' }}>
          <div style={{ fontSize: '0.82rem', fontWeight: 500, marginBottom: 4 }}>Stats logged ✓</div>
          <div style={{ fontSize: '0.78rem', color: 'var(--charcoal-soft)' }}>
            {Object.entries(edited).filter(([, v]) => v !== null).map(([k, v]) => `${LABELS[k]}: ${k === 'revenue' ? '$' : ''}${v}${k === 'conversion' ? '%' : ''}`).join(' · ')}
          </div>
          <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => { setDone(false); setText(''); setParsed(null); }}>
            Log another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="section-label" style={{ marginBottom: 10 }}>Weekly Review</div>
      <div style={{ fontSize: '0.78rem', color: 'var(--charcoal-soft)', marginBottom: 12, lineHeight: 1.6 }}>
        Paste your Etsy Stats summary below. The system will extract the numbers automatically.
      </div>

      {!parsed && (
        <div>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={"Paste your Etsy Stats page text here —\ncopy the numbers directly from Etsy Studio...\n\nExample: '142 visits · 89 views · 2 orders · $51.98 revenue · 1.4% conversion'"}
            rows={8}
            style={{ marginBottom: 12, fontSize: '0.8rem' }}
          />
          <button className="btn btn-primary" onClick={handleParse} disabled={!text.trim()}>
            Parse Stats →
          </button>
        </div>
      )}

      {parsed && (
        <div>
          <div style={{ border: 'var(--border)', borderRadius: 2, padding: '14px 16px', background: 'var(--warm-white)', marginBottom: 16 }}>
            <div className="eyebrow" style={{ marginBottom: 12 }}>Extracted from your stats</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {Object.entries(LABELS).map(([key, label]) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <label style={{ fontSize: '0.78rem', color: 'var(--charcoal-soft)', width: 120, flexShrink: 0 }}>{label}</label>
                  <input
                    type="number"
                    value={edited[key] ?? ''}
                    onChange={e => setEdited(prev => ({ ...prev, [key]: e.target.value ? parseFloat(e.target.value) : null }))}
                    placeholder={parsed[key] !== null ? String(parsed[key]) : 'not found'}
                    style={{ flex: 1, fontSize: '0.82rem' }}
                  />
                  {parsed[key] === null && (
                    <span style={{ fontSize: '0.65rem', color: 'var(--warning)', whiteSpace: 'nowrap' }}>not found</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {!hasData && (
            <div style={{ background: 'rgba(232,168,124,0.1)', border: '1px solid var(--warning)', borderRadius: 2, padding: '10px 14px', marginBottom: 14, fontSize: '0.78rem' }}>
              Could not extract numbers confidently. Edit the fields above manually before applying.
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" onClick={handleApply} disabled={applying}>
              {applying ? 'Applying…' : 'Apply to shop overview →'}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setParsed(null)}>Edit paste</button>
            <button className="btn btn-ghost btn-sm" onClick={() => { setParsed(null); setText(''); }}>Start over</button>
          </div>
        </div>
      )}
    </div>
  );
}
