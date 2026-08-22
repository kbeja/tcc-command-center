import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useNiches, setKeywordSearchIntent, linkKeywordToNiche } from '../lib/hooks';
import { flattenForPicker, nichePath } from '../lib/niches';
import { SEARCH_INTENTS } from '../data/searchIntents';

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

  const load = useCallback(async () => {
    const [{ data: p }, { data: s }] = await Promise.all([
      supabase.from('products').select('id, name, collection, stage, primary_niche_id').order('name'),
      supabase.from('research_sessions')
        .select('id, collection, niche, source, date, niche_id, keywords(id, keyword, search_intent)')
        .order('date', { ascending: false }),
    ]);
    setProducts(p || []);
    setSessions(s || []);
  }, []);

  useEffect(() => { load(); }, [load]);

  const productsDone = products.filter(p => p.primary_niche_id).length;
  const sessionsDone = sessions.filter(s => s.niche_id).length;

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
    let linked = 0;
    for (const k of kws) {
      const { error } = await linkKeywordToNiche(k.id, session.niche_id);
      if (!error) linked++;
    }
    setBusy(null);
    setMsg(`Linked ${linked} keyword${linked !== 1 ? 's' : ''} to ${nichePath(niches.find(n => n.id === session.niche_id), niches)}.`);
    setTimeout(() => setMsg(''), 4000);
  }

  async function setIntent(keywordId, intent) {
    setBusy(`k-${keywordId}`);
    await setKeywordSearchIntent(keywordId, intent);
    setBusy(null);
    load();
  }

  const unclassifiedSessions = sessions.filter(s => !s.niche_id);
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {products.map(p => (
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
        hint="Set a session's niche, then use the button that appears to apply it to every keyword in that session. That connection is what lets the Listing Builder find keywords by niche rather than by matching collection names."
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {sessions.map(s => (
            <div key={s.id} style={{
              display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
              padding: '5px 6px', borderRadius: 3,
              background: s.niche_id ? 'rgba(124,175,138,0.08)' : 'transparent',
            }}>
              <span style={{ flex: '1 1 200px', minWidth: 0, fontSize: '0.76rem' }}>
                {s.collection || 'No collection'}
                {s.niche && <span style={{ color: 'var(--charcoal-soft)' }}> · {s.niche}</span>}
                <span style={{ color: 'var(--charcoal-soft)', fontSize: '0.66rem' }}>
                  {' '}· {s.source} · {s.date} · {(s.keywords || []).length} keyword{(s.keywords || []).length !== 1 ? 's' : ''}
                </span>
              </span>
              <NicheSelect
                value={s.niche_id}
                options={nicheOptions}
                disabled={busy === `s-${s.id}`}
                onChange={v => setSessionNiche(s.id, v)}
              />
              {s.niche_id && (s.keywords || []).length > 0 && (
                <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.62rem', padding: '2px 7px' }}
                  disabled={busy === `sk-${s.id}`}
                  title="Connect every keyword in this session to the niche above, so the Listing Builder can find them by niche instead of by collection name"
                  onClick={() => linkSessionKeywords(s)}>
                  {busy === `sk-${s.id}`
                    ? 'Linking…'
                    : `Apply niche to ${(s.keywords || []).length} keyword${(s.keywords || []).length !== 1 ? 's' : ''}`}
                </button>
              )}
            </div>
          ))}
          {!unclassifiedSessions.length && sessions.length > 0 && (
            <div style={{ fontSize: '0.72rem', color: '#2d6b3c' }}>All sessions classified.</div>
          )}
        </div>
      </Section>

      {/* ── Keyword intent ── */}
      <Section
        title="Keyword search intent"
        done={keywordsDone}
        total={allKeywords.length}
        hint="Set term by term on purpose — 'hockey mom' and 'hockey mom gift' share a niche but mean different things, which is the whole reason §7 filters on intent. No bulk apply here."
      >
        <div style={{ fontSize: '0.7rem', color: 'var(--charcoal-soft)', marginBottom: 8 }}>
          Showing the first 100 unclassified of {keywordsNeedingIntent.length}.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {keywordsNeedingIntent.slice(0, 100).map(k => (
            <div key={k.id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '3px 6px' }}>
              <span style={{ flex: '1 1 200px', minWidth: 0, fontSize: '0.76rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {k.keyword}
              </span>
              <select
                value=""
                disabled={busy === `k-${k.id}`}
                onChange={e => e.target.value && setIntent(k.id, e.target.value)}
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
