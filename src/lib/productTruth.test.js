// This project's first automated test file — scoped narrowly to
// productTruth.js's deterministic matching logic, per Kristen's explicit
// request that this specific safety-critical function ship with unit/
// regression tests. Not a general "add tests everywhere" push.
import { describe, it, expect } from 'vitest';
import {
  detectImpliedFormat,
  checkFormatCompatibility,
  checkBrandMention,
  computeDiscussionPermissions,
  describeDiscussionPermissions,
} from './productTruth.js';

describe('detectImpliedFormat / checkFormatCompatibility', () => {
  it('the exact reported bug: "hockey mom sweatshirt" resolves to sweatshirt, never t-shirt', () => {
    expect(detectImpliedFormat('hockey mom sweatshirt')).toEqual({ format: 'sweatshirt', ambiguous: false });
    expect(checkFormatCompatibility('hockey mom sweatshirt', 't-shirt')).toBe('incompatible');
    expect(checkFormatCompatibility('hockey mom sweatshirt', 'sweatshirt')).toBe('compatible');
  });

  it('naive substring matching would wrongly match "shirt" inside "sweatshirt" — confirm it does not', () => {
    const { format } = detectImpliedFormat('womens sweatshirt gift');
    expect(format).not.toBe('t-shirt');
    expect(format).toBe('sweatshirt');
  });

  it('a real live-generation regression: plural "hockey sweatshirts" resolves to sweatshirt, not unknown', () => {
    // Found via an actual end-to-end generation run against real Hockey
    // collection research: FORMAT_GROUPS originally registered only
    // singular phrases, so "sweatshirts" (plural) tokenized to a word that
    // matched no phrase at all, fell through as format 'unknown', was
    // never excluded, and reached the AI as a safe-looking pool entry — it
    // used it as a tag. Plural forms are now explicit entries, not a
    // stemmer (see FORMAT_GROUPS' own comment for why).
    expect(detectImpliedFormat('hockey sweatshirts').format).toBe('sweatshirt');
    expect(checkFormatCompatibility('hockey sweatshirts', 't-shirt')).toBe('incompatible');
    expect(checkFormatCompatibility('hockey sweatshirts', 'sweatshirt')).toBe('compatible');
    // The plural must not accidentally start matching the t-shirt group —
    // "sweatshirts" stays one atomic token, distinct from "shirts".
    expect(detectImpliedFormat('hockey shirts').format).toBe('t-shirt');
  });

  it('synonyms within the same group resolve identically ("tote" and "tote bag")', () => {
    expect(detectImpliedFormat('canvas tote').format).toBe('tote');
    expect(detectImpliedFormat('canvas tote bag').format).toBe('tote');
  });

  it('a longer same-group phrase and its shorter components all resolve to the same format', () => {
    expect(detectImpliedFormat('crewneck sweatshirt for mom').format).toBe('sweatshirt');
    expect(detectImpliedFormat('cozy crewneck').format).toBe('sweatshirt');
    expect(detectImpliedFormat('plain sweatshirt').format).toBe('sweatshirt');
  });

  it('a genuine cross-group tie (equal specificity, different formats) resolves ambiguous, never an arbitrary pick', () => {
    // "hat" (hat group) and "beanie" (beanie group) both match as single
    // tokens here — same length, different canonical formats.
    const result = detectImpliedFormat('winter hat beanie combo');
    expect(result.ambiguous).toBe(true);
    expect(result.format).toBeNull();
    // checkFormatCompatibility must fail safe: exclude rather than guess.
    expect(checkFormatCompatibility('winter hat beanie combo', 'hat')).toBe('incompatible');
    expect(checkFormatCompatibility('winter hat beanie combo', 'beanie')).toBe('incompatible');
  });

  it('a keyword naming no format at all resolves unknown, not a false positive either direction', () => {
    expect(detectImpliedFormat('hockey mom gift')).toEqual({ format: null, ambiguous: false });
    expect(checkFormatCompatibility('hockey mom gift', 't-shirt')).toBe('unknown');
    expect(checkFormatCompatibility('hockey mom gift', 'sweatshirt')).toBe('unknown');
  });

  it('an unset product format returns unknown regardless of the keyword — a Product Truth gap, not a keyword problem', () => {
    expect(checkFormatCompatibility('hockey mom sweatshirt', null)).toBe('unknown');
    expect(checkFormatCompatibility('hockey mom sweatshirt', undefined)).toBe('unknown');
  });

  it('is case-insensitive and punctuation-tolerant', () => {
    expect(detectImpliedFormat('HOCKEY MOM SWEATSHIRT!!').format).toBe('sweatshirt');
    expect(detectImpliedFormat("Women's T-Shirt").format).toBe('t-shirt');
  });
});

describe('checkBrandMention', () => {
  it('flags a conflicting brand mention', () => {
    expect(checkBrandMention('Printed on a soft Gildan tee', 'comfort_colors')).toContain('gildan');
  });

  it('does not flag the expected brand itself', () => {
    expect(checkBrandMention('Printed on Comfort Colors 1717', 'comfort_colors')).toEqual([]);
  });

  it('canonicalizes "bella+canvas" and "bella canvas" to the same brand', () => {
    expect(checkBrandMention('A Bella+Canvas tee', 'gildan')).toContain('bella_canvas');
    expect(checkBrandMention('A Bella Canvas tee', 'gildan')).toContain('bella_canvas');
  });

  it('returns nothing when no known brand is mentioned', () => {
    expect(checkBrandMention('A soft, comfortable everyday tee', 'comfort_colors')).toEqual([]);
  });
});

describe('computeDiscussionPermissions', () => {
  it('everything unset or null is forbidden — no inference', () => {
    const perms = computeDiscussionPermissions({});
    expect(Object.values(perms).every(v => v === false)).toBe(true);
  });

  it('a confirmed false is treated the same as unknown for the 3 boolean topics — not an offer, not a denial claim', () => {
    const perms = computeDiscussionPermissions({
      personalization_available: false,
      customization_available: null,
      gift_wrap_available: false,
    });
    expect(perms.personalization).toBe(false);
    expect(perms.customization).toBe(false);
    expect(perms.gift_wrap).toBe(false);
  });

  it('a populated text field is permitted; a null one is not', () => {
    const perms = computeDiscussionPermissions({ shipping_policy: 'Ships in 3-5 business days', production_time: null });
    expect(perms.shipping).toBe(true);
    expect(perms.production_time).toBe(false);
  });

  it('describeDiscussionPermissions splits into permitted/forbidden label lists', () => {
    const { permitted, forbidden } = describeDiscussionPermissions({ shipping: true, material: false, gift_wrap: true });
    expect(permitted.length).toBe(2);
    expect(forbidden.length).toBe(1);
  });
});
