import { useMemo } from 'react';
import { BucketBadge, BUCKET_STYLE } from '../../lib/keywords.jsx';
import { matchKeywordPhrases } from '../../lib/textMatch';

// Shows which RESEARCHED keywords a title or tag set actually contains, and
// which bucket each one is in — Kristen's request: see the bucket mix of what
// a title is really using, not just the finished string.
//
// Matching reuses phraseAppearsIn() from textMatch.js (Phase 21) rather than
// a naive indexOf: it tokenizes both sides, so "hockey shirt" does not match
// inside "hockey sweatshirt", and a phrase only counts when its words appear
// as a real subsequence. That is the same primitive the Product Compatibility
// Gate and the SEO gap analysis already use, so all three agree about what
// "the title contains this keyword" means.
//
// Read-only. It never edits the title, never reorders anything, and never
// suggests a keyword — it reports what is already there.

function Chip({ kw }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontSize: '0.72rem', padding: '2px 7px', borderRadius: 10,
      background: 'rgba(43,41,38,0.05)', color: 'var(--charcoal)',
    }}>
      {kw.keyword}
      <BucketBadge bucket={kw.bucket} />
      {!kw.bucket && (
        <span style={{ fontSize: '0.6rem', color: 'var(--charcoal-soft)', fontStyle: 'italic' }}>no bucket</span>
      )}
    </span>
  );
}

function Mix({ matches }) {
  const counts = [1, 2, 3].map(b => [b, matches.filter(m => m.bucket === b).length]).filter(([, n]) => n);
  const unbucketed = matches.filter(m => !m.bucket).length;
  if (!counts.length && !unbucketed) return null;
  return (
    <span style={{ fontSize: '0.7rem', color: 'var(--charcoal-soft)' }}>
      {counts.map(([b, n]) => `${n} × ${BUCKET_STYLE[b].label}`).join(' · ')}
      {unbucketed ? `${counts.length ? ' · ' : ''}${unbucketed} unbucketed` : ''}
    </span>
  );
}

export default function KeywordBucketReadout({ title, tags = [], pool = [], label = 'Researched keywords in this title' }) {
  const titleMatches = useMemo(() => matchKeywordPhrases(title, pool), [title, pool]);

  // Tags are independent ≤20-char phrases, never one stream — checking them
  // as a single joined string would let a phrase match across a tag boundary
  // and report a keyword that is not really there. Same correction Phase 21
  // made to the SEO gap analysis for exactly this reason.
  const tagMatches = useMemo(() => {
    if (!tags?.length || !pool?.length) return [];
    const seen = new Set();
    const out = [];
    for (const tag of tags) {
      for (const m of matchKeywordPhrases(tag, pool)) {
        const key = m.keyword.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(m);
      }
    }
    return out;
  }, [tags, pool]);

  if (!pool?.length) return null;

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
        <span style={{
          fontSize: '0.62rem', fontWeight: 600, letterSpacing: '0.08em',
          textTransform: 'uppercase', color: 'var(--charcoal-soft)',
        }}>{label}</span>
        <Mix matches={titleMatches} />
      </div>

      {titleMatches.length ? (
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {titleMatches.map(k => <Chip key={k.keyword} kw={k} />)}
        </div>
      ) : (
        // Stated plainly rather than left blank — a title using no researched
        // keyword at all is a real signal, not an empty state.
        <div style={{ fontSize: '0.74rem', color: 'var(--charcoal-soft)', fontStyle: 'italic' }}>
          No researched keyword from this collection appears in the title yet.
        </div>
      )}

      {tags?.length ? (
        <div style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
            <span style={{
              fontSize: '0.62rem', fontWeight: 600, letterSpacing: '0.08em',
              textTransform: 'uppercase', color: 'var(--charcoal-soft)',
            }}>Researched keywords in tags</span>
            <Mix matches={tagMatches} />
          </div>
          {tagMatches.length ? (
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {tagMatches.map(k => <Chip key={k.keyword} kw={k} />)}
            </div>
          ) : (
            <div style={{ fontSize: '0.74rem', color: 'var(--charcoal-soft)', fontStyle: 'italic' }}>
              No researched keyword appears in the tags yet.
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
