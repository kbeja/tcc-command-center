import { useState, useMemo } from 'react';
import {
  useNiches, useKeywordNiches,
  linkKeywordToNiche, unlinkKeywordFromNiche, setPrimaryKeywordNiche,
} from '../lib/hooks';
import { flattenForPicker, nichePath } from '../lib/niches';

// ─── Keyword ↔ Niche links (Phase 8a / §29) ────────────────────────────────
// The one place in this app where an object links to MANY niches rather than
// carrying a single primary path.
//
// Sparks, concepts and products each got one primary_niche_id, because §4 says
// an object you make has one primary path. A keyword is different in kind: it
// is something you OBSERVE shoppers doing, and shoppers do not respect the
// tree. §29's own example is "bookish sweatshirt", which genuinely serves
// General Reader, Romance Reader, Romantasy Reader and Fantasy Reader at once.
// Forcing it into one branch would either lose three real markets or duplicate
// the keyword four times — and duplicates cannot share an evidence ledger,
// which would quietly break the multi-source comparison keyword_history exists
// for.
//
// is_primary is a preference, not an integrity rule: it marks the niche a term
// most belongs to when one is clearly dominant, and a keyword may have none.
// Enforced in the hook rather than by a partial unique index, so a UI bug can
// never leave a keyword unsaveable.
export default function KeywordNicheLinks({ keywordId }) {
  const { niches } = useNiches();
  const ids = useMemo(() => (keywordId ? [keywordId] : []), [keywordId]);
  const { byKeywordId, refetch } = useKeywordNiches(ids);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);

  const links = byKeywordId[keywordId] || [];
  const linkedIds = new Set(links.map(l => l.niche_id));

  const options = useMemo(
    () => flattenForPicker(niches).filter(o => !linkedIds.has(o.id)),
    [niches, links] // eslint-disable-line react-hooks/exhaustive-deps
  );

  async function add(nicheId) {
    if (!nicheId) return;
    setBusy(true);
    await linkKeywordToNiche(keywordId, nicheId);
    await refetch();
    setBusy(false);
    setAdding(false);
  }

  async function remove(nicheId) {
    setBusy(true);
    await unlinkKeywordFromNiche(keywordId, nicheId);
    await refetch();
    setBusy(false);
  }

  async function togglePrimary(nicheId, currentlyPrimary) {
    setBusy(true);
    await setPrimaryKeywordNiche(keywordId, currentlyPrimary ? null : nicheId);
    await refetch();
    setBusy(false);
  }

  return (
    <div>
      {links.length === 0 && !adding && (
        <div style={{ fontSize: '0.72rem', color: 'var(--charcoal-soft)', marginBottom: 6 }}>
          Not linked to a niche yet.
        </div>
      )}

      {links.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 6 }}>
          {links.map(l => {
            const niche = niches.find(n => n.id === l.niche_id);
            return (
              <div key={l.niche_id} style={{
                display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.74rem',
                background: l.is_primary ? 'rgba(124,175,138,0.14)' : 'var(--charcoal-faint)',
                borderRadius: 3, padding: '3px 8px',
              }}>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {niche ? nichePath(niche, niches) : '(niche removed)'}
                </span>
                <button
                  type="button"
                  onClick={() => togglePrimary(l.niche_id, l.is_primary)}
                  disabled={busy}
                  title={l.is_primary ? 'Primary niche for this keyword — click to clear' : 'Mark as the primary niche'}
                  style={{
                    fontSize: '0.6rem', border: 'none', cursor: 'pointer', borderRadius: 20,
                    padding: '1px 7px',
                    background: l.is_primary ? 'rgba(124,175,138,0.9)' : 'transparent',
                    color: l.is_primary ? '#fff' : 'var(--charcoal-soft)',
                    fontWeight: l.is_primary ? 600 : 400,
                  }}>
                  primary
                </button>
                <button type="button" onClick={() => remove(l.niche_id)} disabled={busy}
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--charcoal-soft)', fontSize: '0.85rem', lineHeight: 1 }}>
                  &times;
                </button>
              </div>
            );
          })}
        </div>
      )}

      {adding ? (
        <select
          autoFocus
          defaultValue=""
          onChange={e => add(e.target.value)}
          onBlur={() => setAdding(false)}
          style={{ fontSize: '0.74rem', padding: '3px 6px', width: '100%' }}
        >
          <option value="">Choose a niche…</option>
          {options.map(o => (
            <option key={o.id} value={o.id}>{'—'.repeat(o.depth)} {o.path}</option>
          ))}
        </select>
      ) : (
        <button type="button" className="btn btn-ghost btn-sm"
          style={{ fontSize: '0.65rem', padding: '2px 8px' }}
          onClick={() => setAdding(true)} disabled={busy}>
          + Link a niche
        </button>
      )}
    </div>
  );
}
