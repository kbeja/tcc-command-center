import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useNiches, setKeywordSearchIntent, linkKeywordToNiche, useKeywordClusters, addKeywordToCluster, removeKeywordFromCluster } from '../lib/hooks';
import { flattenForPicker, nichePath } from '../lib/niches';
import { SEARCH_INTENTS, SEARCH_INTENT_HINTS } from '../data/searchIntents';

// ─── Classification workspace (post-Phase-10) ──────────────────────────────
// The taxonomy is built and empty. Nothing in it is populated because §40
// forbids automatic assignment, so every one of these is a human judgment —
// but making someone open 82 research sessions and 660 keywords one at a time
// would guarantee it never happens, which has the same practical outcome as
// getting it wrong.
//
// So: the backlogs in one place, grouped so one decision covers many records.
//
// WHAT IS DELIBERATELY NOT HERE: sparks. 369 of 382 are unclassified and §10 is
// explicit that Cold means "safely captured, not currently active" and that the
// system must never make cold sparks feel like overdue tasks. Putting them in a
// backlog queue with a progress bar would do exactly that. They get classified
// when they resurface, not because a counter says 369.
//
// Ordered by leverage, not by size. Products first: 28 records, and each one
// unlocks niche-level performance analysis for a listing that already has
// sales data attached. Keywords last: 660 records, and their value only lands
// once the Listing Builder is actually filtering on intent.

function Bar({ done, total }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.7rem', color: 'var(--charcoal-soft)' }}>
      <div style={{ flex: 1, height: 5, background: 'rgba(43,41,38,0.08)', borderRadius: 3, overflow: 'hidden', maxWidth: 160 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: 'rgba(124,175,138,0.8)' }} />
      </div>
      <span>{done} of {total}</span>
    </div>
  );
}

function Section({ title, hint, done, total, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const complete = total > 0 && done === total;
  return (
    <div style={{ border: '1px solid rgba(43,41,38,0.1)', borderRadius: 3, marginBottom: 12 }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%', textAlign: 'left', border: 'none', background: 'transparent',
          padding: '10px 12px', cursor: 'pointer', display: 'flex', gap: 10,
          alignItems: 'center', flexWrap: 'wrap',
        }}>
        <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>
          {complete ? '✓ ' : ''}{title}
        </span>
        <span style={{ flex: 1, minWidth: 120 }}><Bar done={done} total={total} /></span>
        <span style={{ fontSize: '0.7rem', color: 'var(--charcoal-soft)' }}>{open ? '▾' : '▸'}</span>
      </button>
      {hint && <div style={{ fontSize: '0.68rem', color: 'var(--charcoal-soft)', padding: '0 12px 8px', lineHeight: 1.5 }}>{hint}</div>}
      {open && <div style={{ padding: '0 12px 12px' }}>{children}</div>}
    </div>
  );
}

// Run one-row-at-a-time writes a handful at a time instead of strictly
// sequentially. The largest session here holds 88 keywords; end to end that
// was around twelve seconds of a button reading "Adding…" with nothing else
// moving, which is indistinguishable from a hang. Small batches rather than
// all at once so a big session cannot open 88 simultaneous connections.
async function inBatches(items, fn, size = 8) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...await Promise.all(items.slice(i, i + size).map(fn)));
  }
  return out;
}

// Finished rows leave the working list rather than sitting in it recoloured —
// a queue that visibly drains is the feedback that a write landed. They are
// hidden, never removed, so a mistake is always one click from being seen and
// undone.
function DoneToggle({ showing, onToggle, count, noun }) {
  if (!count) return null;
  return (
    <button
      onClick={onToggle}
      className="btn btn-ghost btn-sm"
      style={{ fontSize: '0.65rem', padding: '1px 7px', marginBottom: 8 }}
    >
      {showing ? `Hide ${count} ${noun}` : `Show ${count} ${noun}`}
    </button>
  );
}

// One reusable niche <select>. Not the full NichePicker: this renders dozens of
// times in a list and NichePicker opens a realtime channel per instance.
function NicheSelect({ value, onChange, options, disabled }) {
  return (
    <select
      value={value || ''}
      disabled={disabled}
      onChange={e => onChange(e.target.value || null)}
      style={{ fontSize: '0.72rem', padding: '2px 6px', maxWidth: 260 }}
    >
      <option value="">— Unclassified —</option>
      {options.map(o => <option key={o.id} value={o.id}>{o.path}</option>)}
    </select>
  );
}

export default function ClassifyWorkspace() {
  const { niches } = useNiches();
  const nicheOptions = useMemo(() => flattenForPicker(niches), [niches]);

  const [products, setProducts] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState('');

  // The universal cluster — terms that belong to no market and pool into every
  // listing. Deliberately not a niche: giving "gift for her" one would claim it
  // belongs to a single market and hide it from every other listing.
  //
  // Declared up here rather than beside its own section because the SESSIONS
  // list needs it too: a session whose keywords are all universal has been
  // dealt with, and without this it rendered as untouched — no tint, no
  // progress, button unchanged — which made a write that had actually
  // succeeded look like it had done nothing.
  const { clusters, refetch: refetchClusters } = useKeywordClusters();
  const universalCluster = clusters.find(c => c.is_universal) || null;
  const universalIds = new Set(universalCluster?.keywordIds || []);
  const [uniSearch, setUniSearch] = useState('');

  const load = useCallback(async () => {
    const [{ data: p }, { data: s }] = await Promise.all([
      supabase.from('products').select('id, name, collection, stage, primary_niche_id').order('name'),
      supabase.from('research_sessions')
        // keyword_niches comes along because a session is only finished once
        // its niche has actually been APPLIED to the keywords. Without it the
        // row would drop out of the queue the moment a niche was picked, and
        // take the "Apply niche to N keywords" button — the step that does the
        // real work — with it.
        .select('id, collection, niche, source, date, niche_id, keywords(id, keyword, search_intent, volume, keyword_niches(niche_id))')
        .order('date', { ascending: false }),
    ]);
    setProducts(p || []);
    setSessions(s || []);
  }, []);

  useEffect(() => { load(); }, [load]);

  const productsDone = products.filter(p => p.primary_niche_id).length;

  // How much of a session has been pooled as universal. 'all' is a terminal
  // state for that session — there is no niche left to assign, because the
  // whole point of a universal term is that it belongs to no market.
  // 'partial' is a real and legitimate state too (a mostly-niche session with
  // a few cross-niche terms picked out by hand), so it is shown rather than
  // rounded to one of the two ends.
  function universalState(s) {
    const kws = s.keywords || [];
    if (!kws.length || !universalIds.size) return 'none';
    const inPool = kws.filter(k => universalIds.has(k.id)).length;
    if (inPool === 0) return 'none';
    return inPool === kws.length ? 'all' : 'partial';
  }

  // How many of a session's keywords are already linked to the session's own
  // niche. Picking a niche is half the job; applying it is the half the
  // Listing Builder actually reads.
  function linkedCount(s) {
    if (!s.niche_id) return 0;
    return (s.keywords || []).filter(
      k => (k.keyword_niches || []).some(kn => kn.niche_id === s.niche_id)
    ).length;
  }

  // Finished means finished: niche applied to every keyword, or the whole
  // session pooled as universal. A fully-universal session counts as handled —
  // without that the bar sat at the same number no matter how many sessions
  // were resolved that way, which read as "the click did nothing".
  function sessionDone(s) {
    if (universalState(s) === 'all') return true;
    const kws = s.keywords || [];
    if (!s.niche_id) return false;
    return kws.length === 0 || linkedCount(s) === kws.length;
  }

  const sessionsDone = sessions.filter(sessionDone).length;

  const allKeywords = sessions.flatMap(s => s.keywords || []);
  const keywordsDone = allKeywords.filter(k => k.search_intent).length;

  async function setProductNiche(id, nicheId) {
    setBusy(`p-${id}`);
    await supabase.from('products').update({ primary_niche_id: nicheId, updated_at: new Date().toISOString() }).eq('id', id);
    setBusy(null);
    load();
  }

  async function setSessionNiche(id, nicheId) {
    setBusy(`s-${id}`);
    await supabase.from('research_sessions').update({ niche_id: nicheId }).eq('id', id);
    setBusy(null);
    load();
  }

  // Links every keyword in a session to the session's niche. This is the
  // leverage: a session is already a coherent research scope, so one decision
  // legitimately covers all its keywords — unlike intent, which genuinely
  // differs term by term ("hockey mom" vs "hockey mom gift") and is therefore
  // never offered in bulk.
  async function linkSessionKeywords(session) {
    if (!session.niche_id) return;
    const kws = session.keywords || [];
    if (!kws.length) return;
    setBusy(`sk-${session.id}`);
    const results = await inBatches(kws, k => linkKeywordToNiche(k.id, session.niche_id));
    const linked = results.filter(r => !r.error).length;
    // Reload before clearing busy: without this the row kept showing "Apply
    // niche to 88 keywords" after the links were written, so the one action
    // that feeds the Listing Builder looked like it had failed.
    await load();
    setBusy(null);
    setMsg(`Linked ${linked} keyword${linked !== 1 ? 's' : ''} to ${nichePath(niches.find(n => n.id === session.niche_id), niches)}.`);
    setTimeout(() => setMsg(''), 4000);
  }

  // A whole session of cross-niche terms — "General" holds 101 of them. This
  // is deliberately a separate action from the niche dropdown rather than an
  // option inside it: that dropdown answers "which market does this belong
  // to", and a universal term belongs to none. Offering "Universal" there
  // would collapse the exact distinction the cluster exists to keep.
  async function markSessionUniversal(session) {
    if (!universalCluster) return;
    const kws = session.keywords || [];
    if (!kws.length) return;
    setBusy(`su-${session.id}`);
    const results = await inBatches(kws, k => addKeywordToCluster(universalCluster.id, k.id));
    const added = results.filter(r => !r.error).length;
    await refetchClusters();
    setBusy(null);
    setMsg(`Added ${added} keyword${added !== 1 ? 's' : ''} to the universal pool — they'll now appear in every listing.`);
    setTimeout(() => setMsg(''), 5000);
  }

  async function setIntent(keywordId, intent) {
    setBusy(`k-${keywordId}`);
    await setKeywordSearchIntent(keywordId, intent);
    setBusy(null);
    load();
  }

  async function toggleUniversal(keywordId, isIn) {
    if (!universalCluster) return;
    setBusy(`u-${keywordId}`);
    if (isIn) await removeKeywordFromCluster(universalCluster.id, keywordId);
    else await addKeywordToCluster(universalCluster.id, keywordId);
    setBusy(null);
    refetchClusters();
  }

  // These lists are queues, and a queue that never drains does not look like
  // progress — it looks like the click failed. Classifying a session used to
  // only change its background tint while it stayed in place among 82 rows,
  // which is why a write that genuinely succeeded read as doing nothing.
  // Done rows drop out by default and stay one toggle away, never deleted.
  const [showDoneProducts, setShowDoneProducts] = useState(false);
  const [showDoneSessions, setShowDoneSessions] = useState(false);

  const visibleProducts = showDoneProducts ? products : products.filter(p => !p.primary_niche_id);
  const visibleSessions = showDoneSessions ? sessions : sessions.filter(s => !sessionDone(s));

  const unclassifiedSessions = sessions.filter(s => !sessionDone(s));

  // ── Intent scoping ──────────────────────────────────────────────────────
  // 660 keywords in one flat list capped at "the first 100" is unworkable:
  // there is no reason to classify terms belonging to a market you are not
  // building for, and no way to tell which those are. Scoping to a session —
  // the unit research is actually collected in — turns a 660-item chore into
  // a 20-item step you can finish before building one listing.
  const [intentScope, setIntentScope] = useState('all');
  const [intentSearch, setIntentSearch] = useState('');
  const [showDoneIntent, setShowDoneIntent] = useState(false);
  const [showIntentKey, setShowIntentKey] = useState(false);

  const scopedSessions = intentScope === 'all' ? sessions : sessions.filter(s => s.id === intentScope);
  const scopedKeywords = scopedSessions.flatMap(s => (s.keywords || []).map(k => ({ ...k, _session: s })));

  const q = intentSearch.trim().toLowerCase();
  const intentRows = scopedKeywords
    .filter(k => showDoneIntent || !k.search_intent)
    .filter(k => !q || k.keyword.toLowerCase().includes(q))
    // Highest volume first. Intent is set by hand one term at a time, so
    // whatever gets done first should be the terms most likely to end up in a
    // title — not whichever session happens to sort first by date.
    .sort((a, b) => (b.volume ?? -1) - (a.volume ?? -1));

  const scopedDone = scopedKeywords.filter(k => k.search_intent).length;

  // ── Bulk intent ─────────────────────────────────────────────────────────
  // This section originally refused bulk apply outright, on the grounds that
  // "hockey mom" and "hockey mom gift" share a niche and differ in intent.
  // The observation is right; the conclusion was not. What §40 rules out is
  // assignment WITHOUT human approval — a rule or a model deciding for you.
  // Ticking rows you can see and applying one intent to them is that approval,
  // exercised on every row, and 660 terms one dropdown at a time is how a
  // classification never gets done at all.
  //
  // Two properties keep it honest, and both are load-bearing:
  //   - Nothing is ever preselected. The selection starts empty every time,
  //     so no keyword can be written without having been ticked.
  //   - "Select all shown" selects exactly the rows on screen, and the button
  //     names the count it will write. A filter you can read is the review.
  const [selectedIntentIds, setSelectedIntentIds] = useState(() => new Set());
  const [bulkIntent, setBulkIntent] = useState('');

  const visibleIntentRows = intentRows.slice(0, 150);
  const selectedVisible = visibleIntentRows.filter(k => selectedIntentIds.has(k.id));

  function toggleIntentSelected(id) {
    setSelectedIntentIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function applyBulkIntent() {
    if (!bulkIntent || !selectedVisible.length) return;
    setBusy('bulk-intent');
    const results = await inBatches(selectedVisible, k => setKeywordSearchIntent(k.id, bulkIntent));
    const failed = results.filter(r => r?.error).length;
    await load();
    setSelectedIntentIds(new Set());
    setBusy(null);
    setMsg(
      `Set ${selectedVisible.length - failed} keyword${selectedVisible.length - failed !== 1 ? 's' : ''} to ${bulkIntent}.`
      + (failed ? ` ${failed} failed.` : '')
    );
    setTimeout(() => setMsg(''), 4000);
  }
  const keywordsNeedingIntent = allKeywords.filter(k => !k.search_intent);

  return (
    <div>
      <div style={{ fontSize: '0.75rem', color: 'var(--charcoal-soft)', marginBottom: 14, lineHeight: 1.55, maxWidth: 640 }}>
        The taxonomy is built but empty &mdash; nothing was auto-assigned, because what a record
        belongs to is a judgment call. Work through as much or as little as you like; everything
        below degrades gracefully when left blank.
      </div>

      {msg && (
        <div style={{ fontSize: '0.75rem', color: '#2d6b3c', marginBottom: 10 }}>{msg}</div>
      )}

      {/* ── Products ── */}
      <Section
        title="Products"
        done={productsDone}
        total={products.length}
        defaultOpen
        hint="Highest leverage — each classified product makes its performance answerable by niche, and there are only 28."
      >
        <DoneToggle showing={showDoneProducts} onToggle={() => setShowDoneProducts(v => !v)} count={productsDone} noun="classified" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {!visibleProducts.length && (
            <div style={{ fontSize: '0.72rem', color: '#2d6b3c' }}>All products classified.</div>
          )}
          {visibleProducts.map(p => (
            <div key={p.id} style={{
              display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
              padding: '4px 6px', borderRadius: 3,
              background: p.primary_niche_id ? 'rgba(124,175,138,0.08)' : 'transparent',
            }}>
              <span style={{ flex: '1 1 220px', minWidth: 0, fontSize: '0.76rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {p.name}
                <span style={{ color: 'var(--charcoal-soft)', fontSize: '0.66rem' }}> · {p.collection || 'no collection'}</span>
              </span>
              <NicheSelect
                value={p.primary_niche_id}
                options={nicheOptions}
                disabled={busy === `p-${p.id}`}
                onChange={v => setProductNiche(p.id, v)}
              />
            </div>
          ))}
        </div>
      </Section>

      {/* ── Research sessions ── */}
      <Section
        title="Research sessions"
        done={sessionsDone}
        total={sessions.length}
        hint="Set a session's niche, then use the button that appears to apply it to every keyword in that session — that connection is what lets the Listing Builder find keywords by niche rather than by matching collection names. For a session of cross-niche terms like General, use Mark universal instead: those stay niche-less and pool into every listing."
      >
        <DoneToggle showing={showDoneSessions} onToggle={() => setShowDoneSessions(v => !v)} count={sessionsDone} noun="finished" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {!visibleSessions.length && sessions.length > 0 && (
            <div style={{ fontSize: '0.72rem', color: '#2d6b3c' }}>Every session is either classified or pooled as universal.</div>
          )}
          {visibleSessions.map(s => {
            const kws = s.keywords || [];
            const uni = universalState(s);
            const linked = linkedCount(s);
            const done = sessionDone(s);
            const unlinked = kws.length - linked;
            return (
              <div key={s.id} style={{
                display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
                padding: '5px 6px', borderRadius: 3,
                background: done ? 'rgba(124,175,138,0.14)' : s.niche_id ? 'rgba(124,175,138,0.06)' : 'transparent',
              }}>
                <span style={{ flex: '1 1 200px', minWidth: 0, fontSize: '0.76rem' }}>
                  {done && <span style={{ color: '#2d6b3c' }}>✓ </span>}
                  {s.collection || 'No collection'}
                  {s.niche && <span style={{ color: 'var(--charcoal-soft)' }}> · {s.niche}</span>}
                  <span style={{ color: 'var(--charcoal-soft)', fontSize: '0.66rem' }}>
                    {' '}· {s.source} · {s.date} · {kws.length} keyword{kws.length !== 1 ? 's' : ''}
                  </span>
                  {/* What actually happened to this session, in words. The
                      previous version showed only a faint tint for "has a
                      niche", so applying a niche to its keywords or pooling it
                      as universal both left the row looking untouched. */}
                  {uni !== 'none' && (
                    <span style={{ fontSize: '0.64rem', fontWeight: 600, color: '#2d6b3c', background: 'rgba(124,175,138,0.22)', padding: '1px 7px', borderRadius: 10, marginLeft: 6 }}>
                      {uni === 'all' ? 'universal' : `${kws.filter(k => universalIds.has(k.id)).length} universal`}
                    </span>
                  )}
                  {linked > 0 && (
                    <span style={{ fontSize: '0.64rem', fontWeight: 600, color: '#2d6b3c', background: 'rgba(124,175,138,0.22)', padding: '1px 7px', borderRadius: 10, marginLeft: 6 }}>
                      {linked === kws.length ? 'niche applied' : `${linked} of ${kws.length} linked`}
                    </span>
                  )}
                </span>
                <NicheSelect
                  value={s.niche_id}
                  options={nicheOptions}
                  disabled={busy === `s-${s.id}`}
                  onChange={v => setSessionNiche(s.id, v)}
                />
                {universalCluster && kws.length > 0 && uni !== 'all' && (
                  <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.62rem', padding: '2px 7px' }}
                    disabled={busy === `su-${s.id}`}
                    title="These terms apply to any listing regardless of market — custom, gift for her, plus sized. They get pooled into every generation and stay niche-less."
                    onClick={() => markSessionUniversal(s)}>
                    {busy === `su-${s.id}` ? 'Adding…' : 'Mark universal'}
                  </button>
                )}
                {s.niche_id && unlinked > 0 && (
                  <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.62rem', padding: '2px 7px' }}
                    disabled={busy === `sk-${s.id}`}
                    title="Connect every keyword in this session to the niche above, so the Listing Builder can find them by niche instead of by collection name"
                    onClick={() => linkSessionKeywords(s)}>
                    {busy === `sk-${s.id}`
                      ? 'Linking…'
                      : `Apply niche to ${unlinked} keyword${unlinked !== 1 ? 's' : ''}`}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </Section>

      {/* ── Universal keywords ── */}
      <Section
        title="Universal keywords"
        done={universalIds.size}
        total={universalIds.size || 1}
        hint="Terms that apply to any listing regardless of market — custom, personalized, gift for her, plus sized. These get pooled into every generation and deliberately have NO niche, because claiming one would hide them from every other listing."
      >
        {!universalCluster ? (
          <div style={{ fontSize: '0.74rem', color: '#7a2b2b' }}>
            The Universal / Cross-Niche cluster doesn&rsquo;t exist yet — run the migration for it first.
          </div>
        ) : (
          <>
            <div style={{ fontSize: '0.7rem', color: 'var(--charcoal-soft)', marginBottom: 8 }}>
              {universalIds.size} keyword{universalIds.size !== 1 ? 's' : ''} in the pool.
              Search your research to add more — check the box to include a term.
            </div>
            <input
              value={uniSearch}
              onChange={e => setUniSearch(e.target.value)}
              placeholder="Search keywords, e.g. gift for her"
              style={{ marginBottom: 8, maxWidth: 320 }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 320, overflowY: 'auto' }}>
              {allKeywords
                .filter(k => universalIds.has(k.id) || (uniSearch.trim() && k.keyword.toLowerCase().includes(uniSearch.trim().toLowerCase())))
                // Same text can appear in several sessions; show it once.
                .filter((k, i, arr) => arr.findIndex(x => x.keyword.toLowerCase() === k.keyword.toLowerCase()) === i)
                .slice(0, 120)
                .map(k => {
                  const isIn = universalIds.has(k.id);
                  return (
                    <label key={k.id} style={{
                      display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.76rem',
                      padding: '3px 6px', borderRadius: 3, cursor: 'pointer',
                      background: isIn ? 'rgba(124,175,138,0.1)' : 'transparent',
                    }}>
                      <input type="checkbox" checked={isIn} disabled={busy === `u-${k.id}`}
                        onChange={() => toggleUniversal(k.id, isIn)} style={{ width: 'auto', margin: 0 }} />
                      <span>{k.keyword}</span>
                    </label>
                  );
                })}
              {!uniSearch.trim() && universalIds.size === 0 && (
                <div style={{ fontSize: '0.72rem', color: 'var(--charcoal-soft)' }}>
                  Nothing added yet. Search above to find terms like &ldquo;gift for her&rdquo; or &ldquo;custom&rdquo;.
                </div>
              )}
            </div>
          </>
        )}
      </Section>

      {/* ── Keyword intent ── */}
      <Section
        title="Keyword search intent"
        done={keywordsDone}
        total={allKeywords.length}
        hint="'hockey mom' and 'hockey mom gift' share a niche but mean different things, which is the whole reason §7 filters on intent — so nothing here is ever assigned for you. Bulk apply works on rows you tick: filter to a shape you recognise ('gift for'), read what came back, then apply one intent to the lot."
      >
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
          {/* Pick the market you are about to build for and classify only its
              terms. Working the full 660 top-to-bottom means spending most of
              the effort on markets you have no listing planned for. */}
          <select
            value={intentScope}
            onChange={e => { setIntentScope(e.target.value); setIntentSearch(''); }}
            style={{ fontSize: '0.72rem', padding: '2px 6px', maxWidth: 320 }}
          >
            <option value="all">All sessions ({keywordsNeedingIntent.length} left)</option>
            {sessions.filter(s => (s.keywords || []).length > 0).map(s => {
              const left = (s.keywords || []).filter(k => !k.search_intent).length;
              return (
                <option key={s.id} value={s.id}>
                  {s.collection || 'No collection'} · {s.date} · {left} left
                </option>
              );
            })}
          </select>
          <input
            value={intentSearch}
            onChange={e => setIntentSearch(e.target.value)}
            placeholder="Filter terms…"
            style={{ fontSize: '0.72rem', padding: '2px 6px', maxWidth: 200 }}
          />
          <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.65rem', padding: '1px 7px' }}
            onClick={() => setShowIntentKey(v => !v)}>
            {showIntentKey ? 'Hide key' : 'What do these mean?'}
          </button>
          <DoneToggle showing={showDoneIntent} onToggle={() => setShowDoneIntent(v => !v)} count={scopedDone} noun="set" />
        </div>

        {/* The distinction only stays consistent if the difference is visible
            at the moment of choosing — Gift ("hockey mom gift") versus
            Recipient ("gift for hockey mom") is otherwise a coin flip. */}
        {showIntentKey && (
          <div style={{ fontSize: '0.68rem', color: 'var(--charcoal-soft)', lineHeight: 1.6, marginBottom: 10, padding: '8px 10px', background: 'var(--charcoal-faint)', borderRadius: 3 }}>
            {SEARCH_INTENTS.map(i => (
              <div key={i}>
                <strong style={{ color: 'var(--charcoal)' }}>{i}</strong> — {SEARCH_INTENT_HINTS[i]}
              </div>
            ))}
          </div>
        )}

        <div style={{ fontSize: '0.7rem', color: 'var(--charcoal-soft)', marginBottom: 8 }}>
          {intentRows.length
            ? `Showing ${Math.min(intentRows.length, 150)} of ${intentRows.length}, highest search volume first.`
            : 'Nothing left to classify in this scope.'}
        </div>

        {/* Selection bar. The button always names the exact number it will
            write, and the selection is only ever what you ticked — filtering
            or rescoping does not silently drag rows along with it. */}
        {visibleIntentRows.length > 0 && (
          <div style={{
            display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8,
            padding: '6px 8px', borderRadius: 3,
            background: selectedVisible.length ? 'rgba(124,175,138,0.12)' : 'var(--charcoal-faint)',
          }}>
            <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.65rem', padding: '1px 7px' }}
              onClick={() => setSelectedIntentIds(
                selectedVisible.length === visibleIntentRows.length
                  ? new Set()
                  : new Set(visibleIntentRows.map(k => k.id))
              )}>
              {selectedVisible.length === visibleIntentRows.length ? 'Clear selection' : `Select all ${visibleIntentRows.length} shown`}
            </button>
            <span style={{ fontSize: '0.7rem', color: 'var(--charcoal-soft)' }}>
              {selectedVisible.length} selected
            </span>
            <select
              value={bulkIntent}
              onChange={e => setBulkIntent(e.target.value)}
              disabled={!selectedVisible.length}
              style={{ fontSize: '0.72rem', padding: '2px 6px', maxWidth: 190 }}
            >
              <option value="">Intent to apply…</option>
              {SEARCH_INTENTS.map(i => <option key={i} value={i}>{i}</option>)}
            </select>
            <button className="btn btn-sm" style={{ fontSize: '0.65rem', padding: '2px 9px' }}
              disabled={!bulkIntent || !selectedVisible.length || busy === 'bulk-intent'}
              onClick={applyBulkIntent}>
              {busy === 'bulk-intent'
                ? 'Applying…'
                : `Apply to ${selectedVisible.length} keyword${selectedVisible.length !== 1 ? 's' : ''}`}
            </button>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 460, overflowY: 'auto' }}>
          {visibleIntentRows.map(k => (
            <div key={k.id} style={{
              display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '3px 6px',
              borderRadius: 3,
              background: selectedIntentIds.has(k.id) ? 'rgba(124,175,138,0.18)'
                : k.search_intent ? 'rgba(124,175,138,0.08)' : 'transparent',
            }}>
              <input
                type="checkbox"
                checked={selectedIntentIds.has(k.id)}
                onChange={() => toggleIntentSelected(k.id)}
                style={{ width: 'auto', margin: 0, flex: '0 0 auto' }}
              />
              <span style={{ flex: '1 1 200px', minWidth: 0, fontSize: '0.76rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {k.keyword}
                {k.volume != null && (
                  <span style={{ color: 'var(--charcoal-soft)', fontSize: '0.66rem' }}> · {k.volume.toLocaleString()}</span>
                )}
                {intentScope === 'all' && (
                  <span style={{ color: 'var(--charcoal-soft)', fontSize: '0.66rem' }}> · {k._session.collection || 'No collection'}</span>
                )}
              </span>
              {/* Bound to the current value rather than always blank, so a
                  wrong call is corrected in place instead of requiring a trip
                  to the keyword's own page. */}
              <select
                value={k.search_intent || ''}
                disabled={busy === `k-${k.id}`}
                onChange={e => setIntent(k.id, e.target.value || null)}
                style={{ fontSize: '0.72rem', padding: '2px 6px', maxWidth: 190 }}
              >
                <option value="">Set intent…</option>
                {SEARCH_INTENTS.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
          ))}
        </div>
      </Section>

      <div style={{ fontSize: '0.66rem', color: 'var(--charcoal-soft)', marginTop: 10, lineHeight: 1.5, maxWidth: 620 }}>
        Sparks are deliberately absent. 369 of 382 are unclassified and that is the correct resting
        state &mdash; Cold means safely captured, not overdue. They get classified when an idea
        resurfaces, not because a counter says so.
      </div>
    </div>
  );
}
