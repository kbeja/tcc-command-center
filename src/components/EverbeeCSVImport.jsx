import { useState, useRef } from 'react';
import { supabase } from '../lib/supabase';

// ─── CSV Parser ───────────────────────────────────────────────────────────────

function parseCSV(text) {
  const lines = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === '\n' && !inQuotes) { lines.push(current); current = ''; continue; }
    current += ch;
  }
  if (current.trim()) lines.push(current);

  if (lines.length < 2) return { headers: [], rows: [] };

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const rows = lines.slice(1).map(line => {
    const vals = line.split(',').map(v => v.trim());
    const row = {};
    headers.forEach((h, i) => { row[h] = vals[i] || ''; });
    return row;
  }).filter(r => Object.values(r).some(v => v));

  return { headers, rows };
}

function detectShape(headers) {
  const has = k => headers.includes(k);
  if (has('keyword') && has('keyword score')) return 'keyword';
  if (has('product name') && has('shop name')) return 'listing';
  return null;
}

function col(row, ...candidates) {
  for (const c of candidates) {
    const key = Object.keys(row).find(k => k === c || k.includes(c));
    if (key !== undefined && row[key] !== '' && row[key] !== undefined) return row[key];
  }
  return null;
}

function num(val) {
  if (!val) return null;
  const n = parseFloat(String(val).replace(/[$%,]/g, ''));
  return isNaN(n) ? null : n;
}

function int(val) {
  if (!val) return null;
  const n = parseInt(String(val).replace(/[,]/g, ''));
  return isNaN(n) ? null : n;
}

// ─── Keyword scoring (per TCC keyword bank rules) ─────────────────────────────

function scoreKeyword(volume, competition) {
  if (!volume || !competition || competition === 0) return 0;
  return (volume / competition) * 1000;
}

function isGarbage(keyword, volume, competition, score) {
  if (/[-_]/.test(keyword) && keyword.split(/[-_]/).length > 3) return true;
  if (score > 50000 && competition <= 1) return true;
  return false;
}

function isMisspelling(keyword) {
  return /[a-z]e\b/.test(keyword) && !/coffee|bee|free|see|tree|three/.test(keyword);
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function EverbeeCSVImport({ products, onImported }) {
  const fileRef = useRef(null);
  const [shape, setShape] = useState(null);
  const [preview, setPreview] = useState(null);
  const [importContext, setImportContext] = useState('');
  const [nicheTag, setNicheTag] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);

  function reset() {
    setShape(null);
    setPreview(null);
    setImportContext('');
    setNicheTag('');
    setResult(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const { headers, rows } = parseCSV(ev.target.result);
      const detected = detectShape(headers);
      if (!detected) {
        setPreview({ error: 'Could not detect shape. Expected Keyword Research or Listing export columns.' });
        return;
      }
      setShape(detected);

      if (detected === 'keyword') {
        const parsed = rows.map(r => {
          const keyword = col(r, 'keyword') || '';
          const volume = int(col(r, 'volume'));
          const competition = int(col(r, 'competition'));
          const score = scoreKeyword(volume, competition);
          const garbage = isGarbage(keyword, volume, competition, score);
          const misspelling = !garbage && isMisspelling(keyword);
          const keep = !garbage && score >= 50;
          return { keyword, volume, competition, score: Math.round(score), garbage, misspelling, keep };
        });
        const keep = parsed.filter(r => r.keep);
        const discard = parsed.filter(r => r.garbage);
        const misspellings = parsed.filter(r => r.misspelling);
        setPreview({ type: 'keyword', keep, discard, misspellings, total: parsed.length });

      } else {
        const ownShop = [], competitors = [], ambiguous = [];
        for (const r of rows) {
          const shopName = col(r, 'shop name') || '';
          const shopLink = col(r, 'shop link') || '';
          const productLink = col(r, 'product link') || '';
          if (!shopName && !shopLink) { ambiguous.push(r); continue; }
          const isOwn = shopName.toLowerCase().includes('thecurrentchapter') ||
            shopLink.toLowerCase().includes('thecurrentchapter');
          const entry = {
            product_name: col(r, 'product name'),
            shop_name: shopName,
            shop_link: shopLink,
            product_link: productLink,
            price: num(col(r, 'price')),
            growth_rate: num(col(r, 'growth rate')),
            total_reviews: int(col(r, 'total reviews')),
            listing_age: col(r, 'listing age'),
            category: col(r, 'category'),
            shop_age: col(r, 'shop age'),
            visibility_score: num(col(r, 'visibility score')),
            conversion_rate: num(col(r, 'conversion rate')),
            total_shop_sales: int(col(r, 'total shop sales')),
            est_sales: int(col(r, 'est. sales')),
            est_revenue: num(col(r, 'est. revenue')),
            est_total_sales: int(col(r, 'est. total sales')),
            total_favorites: int(col(r, 'total favorites')),
            avg_reviews: num(col(r, 'avg. reviews')),
            total_views: int(col(r, 'total views')),
            tags_used: col(r, 'tags used'),
            description_character_count: int(col(r, 'description character count')),
            minimum_processing: col(r, 'minimum processing'),
            placement_in_shop: int(col(r, 'placement of listing in shop')),
            shop_digital_listing: col(r, 'shop digital listing') === 'true',
            title_character_count: int(col(r, 'title character count')),
            listing_type: col(r, 'listing type'),
            tags: col(r, 'tags'),
            tag_1: col(r, 'tag 1'), tag_2: col(r, 'tag 2'), tag_3: col(r, 'tag 3'),
            tag_4: col(r, 'tag 4'), tag_5: col(r, 'tag 5'), tag_6: col(r, 'tag 6'),
            tag_7: col(r, 'tag 7'), tag_8: col(r, 'tag 8'), tag_9: col(r, 'tag 9'),
            tag_10: col(r, 'tag 10'), tag_11: col(r, 'tag 11'), tag_12: col(r, 'tag 12'),
            tag_13: col(r, 'tag 13'),
          };
          if (isOwn) ownShop.push(entry);
          else competitors.push(entry);
        }
        setPreview({ type: 'listing', ownShop, competitors, ambiguous, total: rows.length });
      }
    };
    reader.readAsText(file);
  }

  async function handleImport() {
    if (!preview || preview.error) return;
    setImporting(true);
    const now = new Date().toISOString();

    try {
      if (shape === 'keyword') {
        // Write to knowledge_inbox as research note
        const content = [
          `EVERBEE KEYWORD IMPORT — ${nicheTag || 'General/Unassigned'}`,
          `Imported: ${preview.keep.length} keywords (score ≥ 50)`,
          `Discarded: ${preview.discard.length} garbage rows`,
          `Misspellings (tags-only): ${preview.misspellings.length}`,
          '',
          '--- TOP KEYWORDS ---',
          ...preview.keep
            .sort((a, b) => b.score - a.score)
            .slice(0, 50)
            .map(k => `${k.keyword} | Vol: ${k.volume} | Comp: ${k.competition} | Score: ${k.score}${k.misspelling ? ' [misspelling]' : ''}`),
        ].join('\n');

        await supabase.from('knowledge_inbox').insert([{
          input_type: 'research_note',
          content,
          url_type: `Everbee keyword export — ${nicheTag || 'general'}`,
          status: 'pending',
        }]);

        await supabase.from('import_history').insert({
          import_type: 'everbee_keywords',
          imported_at: now,
          records_updated: preview.keep.length,
          notes: `${preview.discard.length} discarded, ${preview.misspellings.length} misspellings, niche: ${nicheTag || 'general'}`,
        });

        setResult({
          type: 'keyword',
          added: preview.keep.length,
          discarded: preview.discard.length,
          misspellings: preview.misspellings.length,
        });

      } else {
        // Own-shop: update products table
        let ownUpdated = 0;
        const liveProducts = products.filter(p => p.stage === 'Live' || p.stage === 'Reviewing');
        for (const row of preview.ownShop) {
          const match = liveProducts.find(p => {
            if (row.product_link && p.etsy_listing_url) {
              return row.product_link === p.etsy_listing_url;
            }
            const title = (row.product_name || '').toLowerCase();
            const name = (p.name || '').toLowerCase();
            return title.includes(name.slice(0, 20)) || name.includes(title.slice(0, 20));
          });
          if (match) {
            await supabase.from('products').update({
              views: row.total_views || null,
              mo_sales: row.est_sales || null,
              mo_revenue: row.est_revenue || null,
              conversion_rate: row.conversion_rate || null,
              favorites: row.total_favorites || null,
              updated_at: now,
            }).eq('id', match.id);
            ownUpdated++;
          }
        }

        // Competitors: upsert into competitor_listings
        let competitorAdded = 0, competitorUpdated = 0, whiteSpace = 0;
        for (const row of preview.competitors) {
          if (!row.product_link) continue;
          const { data: existing } = await supabase
            .from('competitor_listings')
            .select('id')
            .eq('product_link', row.product_link)
            .maybeSingle();

          const record = {
            ...row,
            import_context: importContext || null,
            last_updated_at: now,
            white_space_flag: true, // default — signal matching would clear this
          };

          if (existing) {
            await supabase.from('competitor_listings').update(record).eq('id', existing.id);
            competitorUpdated++;
          } else {
            await supabase.from('competitor_listings').insert([{ ...record, first_seen_at: now }]);
            competitorAdded++;
            whiteSpace++;
          }
        }

        await supabase.from('import_history').insert({
          import_type: 'everbee_listings',
          imported_at: now,
          records_updated: ownUpdated + competitorAdded + competitorUpdated,
          notes: `own: ${ownUpdated}, competitor new: ${competitorAdded}, updated: ${competitorUpdated}, ambiguous: ${preview.ambiguous.length}`,
        });

        setResult({
          type: 'listing',
          ownUpdated,
          competitorAdded,
          competitorUpdated,
          whiteSpace,
          ambiguous: preview.ambiguous.length,
        });
      }

      onImported?.();
    } catch (err) {
      setPreview(prev => ({ ...prev, error: err.message }));
    }
    setImporting(false);
  }

  return (
    <div>
      <div className="section-label" style={{ marginBottom: 10 }}>Import Everbee Data</div>
      <div style={{ fontSize: '0.78rem', color: 'var(--charcoal-soft)', marginBottom: 12, lineHeight: 1.6 }}>
        Supports Keyword Research, Trends: Keyword Analytics, New and Hot, Trends: Product Analytics, and Shop Analytics exports.
      </div>

      {/* Result */}
      {result && (
        <div style={{ background: 'rgba(124,175,138,0.1)', border: '1px solid var(--success)', borderRadius: 2, padding: '12px 14px', marginBottom: 16 }}>
          <div style={{ fontSize: '0.82rem', fontWeight: 500, marginBottom: 6 }}>Import complete</div>
          {result.type === 'keyword' ? (
            <div style={{ fontSize: '0.78rem', color: 'var(--charcoal-soft)', display: 'flex', flexDirection: 'column', gap: 3 }}>
              <div>✓ {result.added} keywords added to Knowledge Inbox (score ≥ 50)</div>
              <div>✗ {result.discarded} garbage rows discarded</div>
              {result.misspellings > 0 && <div>⚑ {result.misspellings} misspellings flagged (tags-only)</div>}
            </div>
          ) : (
            <div style={{ fontSize: '0.78rem', color: 'var(--charcoal-soft)', display: 'flex', flexDirection: 'column', gap: 3 }}>
              {result.ownUpdated > 0 && <div>✓ {result.ownUpdated} own listings updated</div>}
              <div>✓ {result.competitorAdded} new competitor listings added</div>
              {result.competitorUpdated > 0 && <div>↺ {result.competitorUpdated} existing competitor listings updated</div>}
              {result.whiteSpace > 0 && <div>⚑ {result.whiteSpace} flagged as white-space (unmatched to any signal)</div>}
              {result.ambiguous > 0 && <div style={{ color: 'var(--warning)' }}>⚠ {result.ambiguous} rows skipped — shop name blank or ambiguous</div>}
            </div>
          )}
          <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={reset}>Import another</button>
        </div>
      )}

      {/* Upload */}
      {!preview && !result && (
        <label style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          border: '1px dashed rgba(43,41,38,0.25)', borderRadius: 2, padding: '24px 16px',
          cursor: 'pointer', background: 'var(--warm-white)',
        }}>
          <span style={{ fontSize: '1.5rem', marginBottom: 8 }}>🐝</span>
          <span style={{ fontSize: '0.82rem', fontWeight: 500 }}>Upload Everbee CSV</span>
          <span style={{ fontSize: '0.72rem', color: 'var(--charcoal-soft)', marginTop: 4 }}>Tap to select</span>
          <input ref={fileRef} type="file" accept=".csv" onChange={handleFile} style={{ display: 'none' }} />
        </label>
      )}

      {/* Error */}
      {preview?.error && (
        <div style={{ background: 'rgba(201,123,123,0.1)', border: '1px solid var(--alert)', borderRadius: 2, padding: '12px 14px', marginBottom: 16 }}>
          <div style={{ fontSize: '0.82rem', color: 'var(--alert)' }}>{preview.error}</div>
          <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={reset}>Try again</button>
        </div>
      )}

      {/* Keyword preview */}
      {preview && !preview.error && shape === 'keyword' && (
        <div>
          <div style={{ fontSize: '0.82rem', fontWeight: 500, marginBottom: 12 }}>
            Keyword export detected — {preview.total} rows
          </div>

          <input
            value={nicheTag}
            onChange={e => setNicheTag(e.target.value)}
            placeholder="Niche / product tag — e.g. 'Mom Chapter mugs' or 'general'"
            style={{ width: '100%', marginBottom: 14, fontSize: '0.8rem' }}
          />

          <div style={{ display: 'flex', gap: 12, marginBottom: 14, fontSize: '0.78rem' }}>
            <div style={{ flex: 1, background: 'rgba(124,175,138,0.1)', border: '1px solid var(--success)', borderRadius: 2, padding: '10px 12px' }}>
              <div style={{ fontWeight: 500, marginBottom: 4 }}>✓ {preview.keep.length} keeping</div>
              <div style={{ color: 'var(--charcoal-soft)', fontSize: '0.72rem' }}>Score ≥ 50</div>
            </div>
            <div style={{ flex: 1, background: 'rgba(201,123,123,0.08)', border: '1px solid var(--alert)', borderRadius: 2, padding: '10px 12px' }}>
              <div style={{ fontWeight: 500, marginBottom: 4 }}>✗ {preview.discard.length} discarded</div>
              <div style={{ color: 'var(--charcoal-soft)', fontSize: '0.72rem' }}>Garbage rows</div>
            </div>
            {preview.misspellings.length > 0 && (
              <div style={{ flex: 1, background: 'rgba(232,168,124,0.1)', border: '1px solid var(--warning)', borderRadius: 2, padding: '10px 12px' }}>
                <div style={{ fontWeight: 500, marginBottom: 4 }}>⚑ {preview.misspellings.length} misspellings</div>
                <div style={{ color: 'var(--charcoal-soft)', fontSize: '0.72rem' }}>Tags-only</div>
              </div>
            )}
          </div>

          {preview.keep.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div className="eyebrow" style={{ marginBottom: 8 }}>Top keywords (score ≥ 50)</div>
              <div style={{ maxHeight: 200, overflowY: 'auto', fontSize: '0.75rem', border: 'var(--border)', borderRadius: 2 }}>
                {preview.keep.sort((a, b) => b.score - a.score).slice(0, 30).map((k, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 10px', borderBottom: '1px solid rgba(43,41,38,0.06)' }}>
                    <span>{k.keyword}{k.misspelling ? <span style={{ color: 'var(--warning)', marginLeft: 4 }}>⚑</span> : null}</span>
                    <span style={{ color: 'var(--charcoal-soft)', whiteSpace: 'nowrap', marginLeft: 8 }}>
                      vol {k.volume?.toLocaleString()} · score {k.score}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={handleImport} disabled={importing || preview.keep.length === 0}>
              {importing ? 'Importing…' : `Send ${preview.keep.length} keywords to Knowledge Inbox →`}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={reset}>Cancel</button>
          </div>
        </div>
      )}

      {/* Listing preview */}
      {preview && !preview.error && shape === 'listing' && (
        <div>
          <div style={{ fontSize: '0.82rem', fontWeight: 500, marginBottom: 12 }}>
            Listing export detected — {preview.total} rows
          </div>

          <div style={{ display: 'flex', gap: 10, marginBottom: 14, fontSize: '0.78rem', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 100, background: 'rgba(124,175,138,0.1)', border: '1px solid var(--success)', borderRadius: 2, padding: '10px 12px' }}>
              <div style={{ fontWeight: 500, marginBottom: 2 }}>🏠 {preview.ownShop.length}</div>
              <div style={{ color: 'var(--charcoal-soft)', fontSize: '0.72rem' }}>Own shop</div>
            </div>
            <div style={{ flex: 1, minWidth: 100, background: 'var(--warm-white)', border: 'var(--border)', borderRadius: 2, padding: '10px 12px' }}>
              <div style={{ fontWeight: 500, marginBottom: 2 }}>🔍 {preview.competitors.length}</div>
              <div style={{ color: 'var(--charcoal-soft)', fontSize: '0.72rem' }}>Competitors</div>
            </div>
            {preview.ambiguous.length > 0 && (
              <div style={{ flex: 1, minWidth: 100, background: 'rgba(232,168,124,0.1)', border: '1px solid var(--warning)', borderRadius: 2, padding: '10px 12px' }}>
                <div style={{ fontWeight: 500, marginBottom: 2 }}>⚠ {preview.ambiguous.length}</div>
                <div style={{ color: 'var(--charcoal-soft)', fontSize: '0.72rem' }}>Ambiguous — will skip</div>
              </div>
            )}
          </div>

          {preview.competitors.length > 0 && (
            <input
              value={importContext}
              onChange={e => setImportContext(e.target.value)}
              placeholder="Import context — e.g. 'weekly New and Hot sweep' or 'Mom mug research'"
              style={{ width: '100%', marginBottom: 14, fontSize: '0.8rem' }}
            />
          )}

          {preview.ownShop.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div className="eyebrow" style={{ marginBottom: 8 }}>Own shop — will update product records</div>
              <div style={{ fontSize: '0.75rem', border: 'var(--border)', borderRadius: 2, maxHeight: 160, overflowY: 'auto' }}>
                {preview.ownShop.slice(0, 10).map((r, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 10px', borderBottom: '1px solid rgba(43,41,38,0.06)' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>{r.product_name}</span>
                    <span style={{ color: 'var(--charcoal-soft)', whiteSpace: 'nowrap' }}>
                      {r.est_sales != null ? `${r.est_sales} sales` : ''}{r.est_revenue != null ? ` · $${r.est_revenue}` : ''}
                    </span>
                  </div>
                ))}
                {preview.ownShop.length > 10 && (
                  <div style={{ padding: '5px 10px', color: 'var(--charcoal-soft)', fontStyle: 'italic' }}>
                    +{preview.ownShop.length - 10} more
                  </div>
                )}
              </div>
            </div>
          )}

          {preview.competitors.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div className="eyebrow" style={{ marginBottom: 8 }}>Competitors — will add/update competitor_listings</div>
              <div style={{ fontSize: '0.75rem', border: 'var(--border)', borderRadius: 2, maxHeight: 160, overflowY: 'auto' }}>
                {preview.competitors.slice(0, 10).map((r, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 10px', borderBottom: '1px solid rgba(43,41,38,0.06)' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '55%' }}>{r.product_name}</span>
                    <span style={{ color: 'var(--charcoal-soft)', whiteSpace: 'nowrap', fontSize: '0.7rem' }}>
                      {r.shop_name} · {r.est_sales != null ? `${r.est_sales} est. sales` : ''}
                    </span>
                  </div>
                ))}
                {preview.competitors.length > 10 && (
                  <div style={{ padding: '5px 10px', color: 'var(--charcoal-soft)', fontStyle: 'italic' }}>
                    +{preview.competitors.length - 10} more
                  </div>
                )}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={handleImport} disabled={importing}>
              {importing ? 'Importing…' : `Import ${preview.ownShop.length + preview.competitors.length} rows →`}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={reset}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
