import { useState, useMemo } from 'react';
import {
  useProducts, useAllListingGenerations, useAllListingReviews,
  useProductTemplates, useStorePolicies, useConceptTagsAll,
} from '../../lib/hooks';
import {
  PORTFOLIO_DIMENSIONS, UNSPECIFIED,
  groupByCollection, groupByFormat, groupByTitleStrategy, groupBySearchIntent, groupByVisualAesthetic,
  computeTemplateUsage, computePolicyUsage,
} from '../../lib/portfolioAnalysis';
import GroupedDimensionView from './GroupedDimensionView';
import CheckpointDimensionView from './CheckpointDimensionView';

// Milestone C4 — compares listings against each other across 8 dimensions.
// Deliberately never shows a revenue/sales/views number on any card here —
// that's Analytics.jsx's own Collection Performance section (explicitly
// revenue-ranked); this page must never look like a ranking/leaderboard,
// per Kristen's own "never calculate a winner from tiny samples" instruction
// — a separate page, not an Analytics tab, makes that distinction structural
// rather than a matter of remembering not to sort a shared list.
export default function Portfolio() {
  const { products, loading: productsLoading } = useProducts();
  const { generations, loading: generationsLoading } = useAllListingGenerations();
  const { reviews, loading: reviewsLoading } = useAllListingReviews();
  const { templates } = useProductTemplates('all');
  const { policies } = useStorePolicies('all');
  const { tagsByConceptId } = useConceptTagsAll();
  const [dimension, setDimension] = useState('collection');

  const activeProducts = useMemo(() => products.filter(p => p.stage !== 'Killed'), [products]);
  const loading = productsLoading || generationsLoading || reviewsLoading;

  // Normalizes each dimension's own most-useful native shape (some carry a
  // real template/policy object alongside products; visual-aesthetic
  // carries a noData list instead of a baked-in Unspecified bucket) into
  // one common { key, label, products }[] before handing off to
  // GroupedDimensionView, which stays agnostic to which grouping function
  // produced the data.
  const dimensionData = useMemo(() => {
    switch (dimension) {
      case 'collection':
        return { groups: groupByCollection(activeProducts), noun: 'collection', explanation: "Grouped by each product's Collection." };
      case 'format':
        return { groups: groupByFormat(activeProducts), noun: 'format', explanation: "Grouped by each product's Product Format. Most pre-Milestone-A products have no format set yet." };
      case 'title_strategy':
        return { groups: groupByTitleStrategy(activeProducts), noun: 'title strategy', explanation: "Grouped by each product's current Title Strategy." };
      case 'search_intent':
        return {
          groups: groupBySearchIntent(activeProducts, generations), noun: 'search intent',
          explanation: "Grouped by exact matching text on each listing's Primary Search Intent (from its most recent generation). No fuzzy phrase clustering — a reworded phrase won't group with the original.",
        };
      case 'visual_aesthetic': {
        const { groups, noData } = groupByVisualAesthetic(activeProducts, tagsByConceptId);
        const allGroups = noData.length ? [...groups, { key: UNSPECIFIED, label: UNSPECIFIED, products: noData }] : groups;
        return {
          groups: allGroups, noun: 'visual aesthetic',
          explanation: "Grouped by the visual tags on each product's linked Concept. Most products won't have this yet — it needs both a linked concept and applied tags.",
        };
      }
      case 'template_usage': {
        const usage = computeTemplateUsage(activeProducts, templates);
        return {
          groups: usage.map(u => ({ key: u.template?.id || UNSPECIFIED, label: u.template?.name || 'No template applied', products: u.products })),
          noun: 'template',
          explanation: 'Every active/archived Product Template, and which products use it — including templates nobody uses yet.',
        };
      }
      case 'policy_usage': {
        const usage = computePolicyUsage(activeProducts, generations, policies);
        return {
          groups: usage.map(u => ({ key: u.policy?.id || UNSPECIFIED, label: u.policy?.title || 'No policy resolved', products: u.products })),
          noun: 'policy',
          explanation: "Every active/archived Store Policy, and which products' generations resolved it — including policies nobody uses yet.",
        };
      }
      default:
        return { groups: [], noun: dimension, explanation: '' };
    }
  }, [dimension, activeProducts, generations, templates, policies, tagsByConceptId]);

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title">Portfolio</div>
        <div style={{ fontSize: '0.8rem', color: 'var(--charcoal-soft)', marginTop: 4, maxWidth: 640 }}>
          Compares listings against each other by strategy and process — never by sales. Grows more useful as more listings go through generation and checkpoint reviews.
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
          {PORTFOLIO_DIMENSIONS.map(({ key, label }) => (
            <button
              key={key} className={`btn btn-sm ${dimension === key ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setDimension(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ color: 'var(--charcoal-soft)' }}>Loading…</div>
      ) : dimension === 'checkpoint' ? (
        <CheckpointDimensionView products={activeProducts} reviews={reviews} />
      ) : (
        <GroupedDimensionView {...dimensionData} />
      )}
    </div>
  );
}
