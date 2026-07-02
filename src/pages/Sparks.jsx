import { useState } from 'react';
import { useSparks } from '../lib/hooks';
import { daysBetween, today } from '../data/seasons';
import { COLLECTIONS } from '../data/collections';
import SparkCard from '../components/SparkCard';

function calcHotReason(spark) {
  const days = daysBetween(spark.created_at, today());
  if (days >= 14) return `${days} days without moving`;
  return null;
}

export default function Sparks() {
  const { sparks, loading, refetch } = useSparks();
  const [search, setSearch] = useState('');
  const [collectionFilter, setCollectionFilter] = useState('');

  const hot = sparks.filter(s => s.temperature === 'hot');
  const cold = sparks.filter(s => s.temperature === 'cold').filter(s => {
    const matchSearch = !search || s.content.toLowerCase().includes(search.toLowerCase());
    const matchColl = !collectionFilter || s.collection_tag === collectionFilter;
    return matchSearch && matchColl;
  });

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title">Sparks</div>
        <div style={{ fontSize: '0.78rem', color: 'var(--charcoal-soft)', marginTop: 4 }}>
          {hot.length} hot · {sparks.filter(s => s.temperature === 'cold').length} cold
        </div>
      </div>

      {hot.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div className="section-label">Hot Sparks</div>
          {hot.map(s => <SparkCard key={s.id} spark={s} onAction={refetch} />)}
        </div>
      )}

      <div>
        <div className="section-label" style={{ marginBottom: 10 }}>Cold Sparks</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <input
            placeholder="Search sparks…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ flex: 1, minWidth: 160 }}
          />
          <select value={collectionFilter} onChange={e => setCollectionFilter(e.target.value)} style={{ width: 'auto' }}>
            <option value="">All collections</option>
            {COLLECTIONS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {loading && <div style={{ color: 'var(--charcoal-soft)', fontSize: '0.85rem' }}>Loading…</div>}

        {!loading && cold.length === 0 && (
          <div className="empty-state">
            <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>💡</div>
            <p>{search || collectionFilter ? 'No sparks match your search.' : 'No cold sparks. Use + to capture one.'}</p>
          </div>
        )}

        {cold.map(s => <SparkCard key={s.id} spark={s} onAction={refetch} />)}
      </div>
    </div>
  );
}
