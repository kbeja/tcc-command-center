// Milestone C1 — Product Template Library. Scoped to productTemplates.js's
// pure matching/diffing/apply logic, same house convention as
// productTruth.test.js et al.
import { describe, it, expect } from 'vitest';
import { matchTemplates, diffTemplate, buildApplyPayload, TEMPLATE_OWNED_FIELDS } from './productTemplates.js';

function pt(overrides) {
  return {
    product_format: 't-shirt', blank_brand: null, blank_model: null, garment_color: null,
    available_colors: [], size_range: null, material: null,
    production_time: null, fulfillment_provider: null,
    ...overrides,
  };
}

function template(overrides) {
  return {
    id: 't1', name: 'Comfort Colors 1717 — T-Shirt', status: 'active',
    product_format: 't-shirt', blank_brand: 'comfort_colors', blank_model: 'Comfort Colors 1717',
    material: '100% ring-spun cotton', size_range: 'S-3XL', available_colors: ['Black', 'White', 'Pepper'],
    production_time: '2-3 business days', fulfillment_provider: 'Printify',
    last_verified: '2026-08-01', created_at: '2026-08-01T00:00:00Z',
    ...overrides,
  };
}

describe('matchTemplates', () => {
  it('no product_format means no matches at all, even against an otherwise-identical template', () => {
    const results = matchTemplates(pt({ product_format: null }), [template({})]);
    expect(results).toEqual([]);
  });

  it('mismatched format excludes the template', () => {
    const results = matchTemplates(pt({ product_format: 'sweatshirt' }), [template({})]);
    expect(results).toEqual([]);
  });

  it('archived templates are never matched', () => {
    const results = matchTemplates(pt({}), [template({ status: 'archived' })]);
    expect(results).toEqual([]);
  });

  it('matching format + brand + model produces a match with specificity 2', () => {
    const results = matchTemplates(pt({ blank_brand: 'comfort_colors', blank_model: 'Comfort Colors 1717' }), [template({})]);
    expect(results).toHaveLength(1);
    expect(results[0].specificity).toBe(2);
    expect(results[0].matchedOn).toEqual(['blank_brand', 'blank_model']);
  });

  it('a conflicting brand excludes the template entirely, does not just down-rank it', () => {
    const results = matchTemplates(pt({ blank_brand: 'gildan' }), [template({ blank_brand: 'comfort_colors' })]);
    expect(results).toEqual([]);
  });

  it('a conflicting model excludes the template entirely', () => {
    const results = matchTemplates(
      pt({ blank_brand: 'comfort_colors', blank_model: 'Comfort Colors 3000' }),
      [template({ blank_brand: 'comfort_colors', blank_model: 'Comfort Colors 1717' })]
    );
    expect(results).toEqual([]);
  });

  it('a brand-level template (no blank_model) matches a product with only brand set, specificity 1', () => {
    const results = matchTemplates(
      pt({ blank_brand: 'comfort_colors' }),
      [template({ blank_model: null })]
    );
    expect(results).toHaveLength(1);
    expect(results[0].specificity).toBe(1);
  });

  it('a format-only template (no brand/model set) still matches, at specificity 0 — never conflicts, just less specific', () => {
    const results = matchTemplates(
      pt({ blank_brand: 'comfort_colors', blank_model: 'Comfort Colors 1717' }),
      [template({ blank_brand: null, blank_model: null })]
    );
    expect(results).toHaveLength(1);
    expect(results[0].specificity).toBe(0);
  });

  it('blank_model matches through case/punctuation normalization, not exact string equality', () => {
    const results = matchTemplates(
      pt({ blank_model: 'comfort colors 1717' }),
      [template({ blank_model: 'Comfort Colors 1717' })]
    );
    expect(results).toHaveLength(1);
  });

  it('blank_model normalization does not bridge an abbreviation to the canonical name', () => {
    const results = matchTemplates(
      pt({ blank_model: 'CC1717' }),
      [template({ blank_model: 'Comfort Colors 1717' })]
    );
    expect(results).toEqual([]);
  });

  it('ranks higher specificity first', () => {
    const results = matchTemplates(
      pt({ blank_brand: 'comfort_colors', blank_model: 'Comfort Colors 1717' }),
      [
        template({ id: 'generic', name: 'Generic T-Shirt', blank_brand: null, blank_model: null }),
        template({ id: 'specific', name: 'Comfort Colors 1717' }),
      ]
    );
    expect(results.map(r => r.template.id)).toEqual(['specific', 'generic']);
  });

  it('ties in specificity break on most-recently-verified', () => {
    const results = matchTemplates(pt({ blank_brand: 'comfort_colors' }), [
      template({ id: 'old', name: 'A', blank_model: null, last_verified: '2026-01-01' }),
      template({ id: 'new', name: 'B', blank_model: null, last_verified: '2026-08-01' }),
    ]);
    expect(results.map(r => r.template.id)).toEqual(['new', 'old']);
  });
});

describe('diffTemplate', () => {
  it('only emits rows for fields the template actually owns', () => {
    const rows = diffTemplate(pt({}), template({ fulfillment_provider: null }));
    expect(rows.some(r => r.field === 'fulfillment_provider')).toBe(false);
  });

  it('empty product field + template has a value -> fill', () => {
    const rows = diffTemplate(pt({ material: null }), template({}));
    const row = rows.find(r => r.field === 'material');
    expect(row.state).toBe('fill');
  });

  it('both set and equal -> same', () => {
    const rows = diffTemplate(pt({ material: '100% ring-spun cotton' }), template({}));
    const row = rows.find(r => r.field === 'material');
    expect(row.state).toBe('same');
  });

  it('both set and unequal -> differs, never silently resolved', () => {
    const rows = diffTemplate(pt({ size_range: 'S-2XL' }), template({ size_range: 'S-3XL' }));
    const row = rows.find(r => r.field === 'size_range');
    expect(row.state).toBe('differs');
    expect(row.productValue).toBe('S-2XL');
    expect(row.templateValue).toBe('S-3XL');
  });

  it('array fields (available_colors) compare by content, not reference', () => {
    const rows = diffTemplate(pt({ available_colors: ['Black', 'White', 'Pepper'] }), template({}));
    const row = rows.find(r => r.field === 'available_colors');
    expect(row.state).toBe('same');
  });

  it('an empty array on the product counts as unset -> fill', () => {
    const rows = diffTemplate(pt({ available_colors: [] }), template({}));
    const row = rows.find(r => r.field === 'available_colors');
    expect(row.state).toBe('fill');
  });

  it('every TEMPLATE_OWNED_FIELDS entry is checked when the template owns all of them', () => {
    const rows = diffTemplate(pt({}), template({}));
    expect(rows.map(r => r.field).sort()).toEqual([...TEMPLATE_OWNED_FIELDS].sort());
  });
});

describe('buildApplyPayload', () => {
  it('maps snake_case template fields to camelCase form fields for only the selected fields', () => {
    const payload = buildApplyPayload(template({}), ['material', 'size_range']);
    expect(payload).toEqual({ material: '100% ring-spun cotton', sizeRange: 'S-3XL' });
    expect(payload.blankBrand).toBeUndefined();
  });

  it('an empty selection produces an empty payload', () => {
    expect(buildApplyPayload(template({}), [])).toEqual({});
  });
});
