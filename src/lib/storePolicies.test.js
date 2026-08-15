// Milestone C1 — Approved Store Policy Library. Scoped to storePolicies.js's
// one safety-critical function, same house convention as productTruth.test.js
// et al: unit tests for the deterministic module, not a general push to test
// everything. The trap-regression tests import computeDiscussionPermissions
// directly from productTruth.js — proof this file's resolution keeps that
// function's own 17 tests meaningful, not just that resolveEffectiveProductTruth
// looks right in isolation.
import { describe, it, expect } from 'vitest';
import { resolveEffectiveProductTruth, isPolicyGenerationEligible, POLICY_FIELD_MAP } from './storePolicies.js';
import { computeDiscussionPermissions } from './productTruth.js';

function pt(overrides) {
  return {
    product_format: 't-shirt', blank_brand: null, blank_model: null, garment_color: null,
    available_colors: null, size_range: null, material: null,
    personalization_available: null, customization_available: null, gift_wrap_available: null,
    production_time: null, shipping_policy: null, fulfillment_provider: null,
    ...overrides,
  };
}

function policy(overrides) {
  return {
    id: 'p1', policy_type: 'shipping', title: 'Standard Shipping',
    approved_text: 'Ships via USPS within 5-7 business days.',
    status: 'active', last_verified: '2026-08-01', created_at: '2026-08-01T00:00:00Z',
    ...overrides,
  };
}

describe('the trap: permission and fact must travel together', () => {
  it('no policy, no product value: stays forbidden with no fact, exactly like today', () => {
    const { effective } = resolveEffectiveProductTruth(pt({}), []);
    const permissions = computeDiscussionPermissions(effective);
    expect(permissions.shipping).toBe(false);
    expect(effective.shipping_policy).toBeFalsy();
  });

  it('a shipping policy present makes permission true AND the effective text non-null — never one without the other', () => {
    const { effective } = resolveEffectiveProductTruth(pt({}), [policy({})]);
    const permissions = computeDiscussionPermissions(effective);
    expect(permissions.shipping).toBe(true);
    expect(effective.shipping_policy).toBe('Ships via USPS within 5-7 business days.');
  });
});

describe('precedence: product value always wins', () => {
  it('a product-specific shipping_policy is never overridden by a policy', () => {
    const { effective, sources } = resolveEffectiveProductTruth(
      pt({ shipping_policy: 'This exact product ships free.' }),
      [policy({ approved_text: 'Generic store shipping text.' })]
    );
    expect(effective.shipping_policy).toBe('This exact product ships free.');
    expect(sources.shipping_policy).toEqual({ source: 'product' });
  });

  it('an empty string on the product is treated as unset, not as a set value', () => {
    const { effective, sources } = resolveEffectiveProductTruth(pt({ shipping_policy: '' }), [policy({})]);
    expect(effective.shipping_policy).toBe('Ships via USPS within 5-7 business days.');
    expect(sources.shipping_policy.source).toBe('store_policy');
  });
});

describe('booleans are never policy-resolved', () => {
  it('a gift_wrap policy never flips gift_wrap_available, and is not even mapped', () => {
    expect(POLICY_FIELD_MAP.gift_wrap_available).toBeUndefined();
    const { effective, sources } = resolveEffectiveProductTruth(
      pt({ gift_wrap_available: null }),
      [policy({ id: 'gw1', policy_type: 'gift_wrap', approved_text: 'We offer gift wrap for $3.' })]
    );
    expect(effective.gift_wrap_available).toBeNull();
    expect(sources.gift_wrap_available).toBeUndefined();
  });

  it('personalization_available and customization_available are likewise untouched', () => {
    const { effective } = resolveEffectiveProductTruth(
      pt({ personalization_available: null, customization_available: false }),
      [policy({ id: 'p1', policy_type: 'personalization', approved_text: 'We personalize on request.' })]
    );
    expect(effective.personalization_available).toBeNull();
    expect(effective.customization_available).toBe(false);
  });
});

describe('archived policies are ignored', () => {
  it('an archived shipping policy does not resolve, topic stays forbidden', () => {
    const { effective } = resolveEffectiveProductTruth(pt({}), [policy({ status: 'archived' })]);
    const permissions = computeDiscussionPermissions(effective);
    expect(permissions.shipping).toBe(false);
    expect(effective.shipping_policy).toBeFalsy();
  });
});

describe('international_shipping maps into the same shipping_policy field', () => {
  it('an international_shipping policy alone fills shipping_policy', () => {
    const { effective, sources } = resolveEffectiveProductTruth(
      pt({}),
      [policy({ id: 'intl1', policy_type: 'international_shipping', approved_text: 'We ship internationally via DHL.' })]
    );
    expect(effective.shipping_policy).toBe('We ship internationally via DHL.');
    expect(sources.shipping_policy.policies).toEqual([
      { id: 'intl1', policy_type: 'international_shipping', title: 'Standard Shipping', last_verified: '2026-08-01' },
    ]);
  });

  it('both a shipping and an international_shipping policy join together', () => {
    const { effective } = resolveEffectiveProductTruth(pt({}), [
      policy({ id: 'ship1', policy_type: 'shipping', approved_text: 'Domestic: USPS 5-7 days.' }),
      policy({ id: 'intl1', policy_type: 'international_shipping', approved_text: 'International: DHL 10-14 days.' }),
    ]);
    expect(effective.shipping_policy).toBe('Domestic: USPS 5-7 days.\n\nInternational: DHL 10-14 days.');
  });
});

describe('two active policies of the same type resolve deterministically', () => {
  it('prefers the more recently verified one', () => {
    const { effective, sources } = resolveEffectiveProductTruth(pt({}), [
      policy({ id: 'old', approved_text: 'Old text.', last_verified: '2026-01-01', created_at: '2026-01-01T00:00:00Z' }),
      policy({ id: 'new', approved_text: 'New text.', last_verified: '2026-08-01', created_at: '2026-02-01T00:00:00Z' }),
    ]);
    expect(effective.shipping_policy).toBe('New text.');
    expect(sources.shipping_policy.policies[0].id).toBe('new');
  });

  it('falls back to most recently created when neither is verified', () => {
    const { effective } = resolveEffectiveProductTruth(pt({}), [
      policy({ id: 'older', approved_text: 'Older.', last_verified: null, created_at: '2026-01-01T00:00:00Z' }),
      policy({ id: 'newer', approved_text: 'Newer.', last_verified: null, created_at: '2026-06-01T00:00:00Z' }),
    ]);
    expect(effective.shipping_policy).toBe('Newer.');
  });

  it('a verified policy beats an unverified one regardless of creation date', () => {
    const { effective } = resolveEffectiveProductTruth(pt({}), [
      policy({ id: 'unverified-but-newer', approved_text: 'Unverified.', last_verified: null, created_at: '2026-08-01T00:00:00Z' }),
      policy({ id: 'verified-but-older', approved_text: 'Verified.', last_verified: '2026-03-01', created_at: '2026-01-01T00:00:00Z' }),
    ]);
    expect(effective.shipping_policy).toBe('Verified.');
  });
});

describe('production_time', () => {
  it('resolves the same way as shipping_policy', () => {
    const { effective, sources } = resolveEffectiveProductTruth(
      pt({}),
      [policy({ id: 'pt1', policy_type: 'production_time', title: 'Standard Production', approved_text: '2-3 business days.', last_verified: '2026-07-15' })]
    );
    expect(effective.production_time).toBe('2-3 business days.');
    expect(sources.production_time).toEqual({
      source: 'store_policy',
      policies: [{ id: 'pt1', policy_type: 'production_time', title: 'Standard Production', last_verified: '2026-07-15' }],
    });
  });
});

describe('isPolicyGenerationEligible', () => {
  it('true for the 3 mapped types, false for the 4 reference-only types', () => {
    expect(isPolicyGenerationEligible('shipping')).toBe(true);
    expect(isPolicyGenerationEligible('international_shipping')).toBe(true);
    expect(isPolicyGenerationEligible('production_time')).toBe(true);
    expect(isPolicyGenerationEligible('returns_exchanges')).toBe(false);
    expect(isPolicyGenerationEligible('personalization')).toBe(false);
    expect(isPolicyGenerationEligible('gift_wrap')).toBe(false);
    expect(isPolicyGenerationEligible('care_instructions')).toBe(false);
  });
});

describe('fields outside POLICY_FIELD_MAP pass through untouched', () => {
  it('material, size_range, and every other field are copied as-is regardless of policies present', () => {
    const { effective } = resolveEffectiveProductTruth(
      pt({ material: null, size_range: 'S-3XL', blank_brand: 'comfort_colors' }),
      [policy({ id: 'x', policy_type: 'shipping', approved_text: 'irrelevant here' })]
    );
    expect(effective.material).toBeNull();
    expect(effective.size_range).toBe('S-3XL');
    expect(effective.blank_brand).toBe('comfort_colors');
  });
});
