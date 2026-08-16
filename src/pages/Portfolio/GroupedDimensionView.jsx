import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getGroupEvidenceState, describeGroupMembership, summarizeGroupedDimension, EVIDENCE_MESSAGES, UNSPECIFIED } from '../../lib/portfolioAnalysis';

const PRODUCTS_SHOWN = 6;

// One card per group — deliberately renders EVERY group passed in,
// including 0-member ones (real for template/policy usage: "nobody uses
// this yet" is itself the answer). Never sorts/highlights by size — the
// order groups arrive in (alphabetical, from portfolioAnalysis.js) is the
// only order used here.
function GroupCard({ group, noun }) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const state = getGroupEvidenceState(group.products.length);
  const shown = expanded ? group.products : group.products.slice(0, PRODUCTS_SHOWN);
  const remaining = group.products.length - shown.length;

  return (
    <div className="card" style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{group.label}</span>
        <span style={{ fontSize: '0.7rem', color: 'var(--charcoal-soft)' }}>{group.products.length}</span>
      </div>

      <div style={{ fontSize: '0.78rem', color: 'var(--charcoal-soft)', marginBottom: group.products.length ? 8 : 0 }}>
        {group.key === UNSPECIFIED
          ? `${group.products.length} listing${group.products.length === 1 ? '' : 's'} — no ${noun} set yet.`
          : <>
              {state === 'empty' && EVIDENCE_MESSAGES.noComparableListingsYet}
              {state === 'single' && EVIDENCE_MESSAGES.tooFewToCompare}
              {state === 'comparable' && describeGroupMembership(group.products.length, noun)}
            </>}
      </div>

      {group.products.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {shown.map(p => (
            <button
              key={p.id} className="btn btn-ghost btn-sm"
              style={{ justifyContent: 'flex-start', textAlign: 'left' }}
              onClick={() => navigate(`/products/${p.id}`)}
            >
              {p.name}
            </button>
          ))}
          {remaining > 0 && (
            <button className="btn btn-ghost btn-sm" onClick={() => setExpanded(true)}>+{remaining} more</button>
          )}
        </div>
      )}
    </div>
  );
}

// Generic renderer for 7 of the 8 Portfolio dimensions (everything except
// review-checkpoint, which has its own bespoke CheckpointDimensionView).
// `groups` is always the normalized { key, label, products }[] shape —
// index.jsx does the per-dimension normalization so this component stays
// agnostic to which underlying grouping function produced it.
export default function GroupedDimensionView({ groups, noun, explanation }) {
  const summary = summarizeGroupedDimension(groups, { noun });

  return (
    <div>
      {explanation && (
        <div style={{ fontSize: '0.76rem', color: 'var(--charcoal-soft)', opacity: 0.8, marginBottom: 10 }}>{explanation}</div>
      )}
      <div style={{ fontSize: '0.82rem', marginBottom: 16 }}>{summary}</div>
      {groups.length === 0 ? (
        <div style={{ color: 'var(--charcoal-soft)' }}>{EVIDENCE_MESSAGES.notEnoughDataYet}</div>
      ) : (
        groups.map(group => <GroupCard key={group.key} group={group} noun={noun} />)
      )}
    </div>
  );
}
