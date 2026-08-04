// Assign a bucket (1/2/3) to a single keyword using Taylor's bucket theory:
// Primary driver is competition count (# of listings on Etsy).
// B1 Visibility: low competition — gets you found fast
// B2 Reach: medium competition — builds your audience
// B3 Bestseller: high competition — big pond, scales you to the top
export function assignBucket(vol, comp) {
  if (vol == null || comp == null || vol < 200) return null;
  if (comp >= 100000) return 3;              // Big pond — Bestseller
  if (comp < 10000 && vol >= 500) return 1; // Low comp, rankable fast — Visibility
  if (vol >= 200) return 2;                 // Mid-range — Reach
  return null;
}

// Assign buckets to a whole list of keywords.
// Misspelling variants (tags_only) are skipped — they never get a bucket.
export function assignBucketsToList(keywords) {
  return keywords.map(k => {
    if (k.tags_only) return k;
    const vol  = k.volume      != null ? parseInt(k.volume)      : null;
    const comp = k.competition != null ? parseInt(k.competition) : null;
    const bucket = assignBucket(vol, comp);
    if (bucket == null) return k;
    return { ...k, bucket, bucket_source: k.bucket_source || 'everbee_score' };
  });
}

export const BUCKET_STYLE = {
  1: { bg: 'rgba(124,175,138,0.18)', color: '#2d6b3c', border: 'rgba(124,175,138,0.35)', label: 'B1' },
  2: { bg: 'rgba(220,190,100,0.18)', color: '#6b4a10', border: 'rgba(220,190,100,0.35)', label: 'B2' },
  3: { bg: 'rgba(120,140,200,0.18)', color: '#1e306b', border: 'rgba(120,140,200,0.35)', label: 'B3' },
};

export function BucketBadge({ bucket, style }) {
  if (!bucket) return null;
  const s = BUCKET_STYLE[bucket];
  return (
    <span style={{
      fontSize: '0.6rem', fontWeight: 700, padding: '1px 6px', borderRadius: 10,
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
      whiteSpace: 'nowrap', letterSpacing: '0.04em', ...style,
    }}>
      {s.label}
    </span>
  );
}
