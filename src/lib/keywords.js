// Assign a bucket (1/2/3) to a single keyword using relative ranking within a context set.
// Returns null if volume or competition is missing, or if volume is very low.
export function assignBucket(vol, comp, contextKeywords) {
  if (vol == null || comp == null) return null;

  const withData = contextKeywords.filter(k => k.volume != null && k.competition != null);

  if (withData.length < 3) {
    // Not enough context for relative ranking — absolute fallback
    if (vol >= 1000 && comp <= 500)  return 1;
    if (vol >= 500  && comp >= 2000) return 3;
    if (vol >= 200)                  return 2;
    return null;
  }

  // Percentile position (0–1) within the context set
  const volRank  = withData.filter(k => k.volume      <= vol).length  / withData.length;
  const compRank = withData.filter(k => k.competition <= comp).length / withData.length;

  // B1: top 40% by volume + bottom 33% by competition → high vol, low comp
  if (volRank >= 0.60 && compRank <= 0.33) return 1;
  // B3: top 50% by volume + top 33% by competition → high vol, high comp
  if (volRank >= 0.50 && compRank >= 0.67) return 3;
  // B2: anything with meaningful volume — this is where the bulk lands
  if (volRank >= 0.25) return 2;
  return null; // very low volume — flag for manual review
}

// Assign buckets to a whole list of keywords relative to each other.
// Misspelling variants (tags_only) are skipped — they never get a bucket.
export function assignBucketsToList(keywords) {
  const context = keywords
    .filter(k => !k.tags_only)
    .map(k => ({
      volume:      k.volume      != null ? parseInt(k.volume)      : null,
      competition: k.competition != null ? parseInt(k.competition) : null,
    }));

  return keywords.map(k => {
    if (k.tags_only) return k;
    const vol  = k.volume      != null ? parseInt(k.volume)      : null;
    const comp = k.competition != null ? parseInt(k.competition) : null;
    const bucket = assignBucket(vol, comp, context);
    if (bucket == null) return k; // leave existing bucket intact if we can't assign
    return {
      ...k,
      bucket,
      bucket_source: k.bucket_source || 'everbee_score',
    };
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
