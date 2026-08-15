// ─── Product Template Library — Milestone C1 ───────────────────────────────
// Verified reusable blank/brand facts ("Comfort Colors 1717 T-Shirt"),
// applied into a product's own Product Truth fields via an explicit,
// human-confirmed action in Listing Builder — never read directly by
// generation, which continues reading the product row exactly as it
// always has. See the migration's own header for the full rationale.

import { tokenize } from './textMatch.js';

// Fields a template can own and "apply" can fill. Deliberately excludes
// garment_color and the 3 tri-state booleans — Kristen's own do-not-
// template list (they vary per listing, or ask a per-product capability
// question a blank-level row can't answer).
export const TEMPLATE_OWNED_FIELDS = [
  'blank_brand', 'blank_model', 'material', 'size_range',
  'available_colors', 'production_time', 'fulfillment_provider',
];

// snake_case template/DB field -> camelCase ListingBuilder form field.
export const TEMPLATE_TO_FORM_FIELD = {
  blank_brand: 'blankBrand',
  blank_model: 'blankModel',
  material: 'material',
  size_range: 'sizeRange',
  available_colors: 'availableColors',
  production_time: 'productionTime',
  fulfillment_provider: 'fulfillmentProvider',
};

// Advisory only, same freshness-badge treatment as products.last_keyword_audit —
// material/size facts drift slower than keyword research, hence the longer
// window than POLICY_VERIFY_DUE_DAYS.
export const TEMPLATE_VERIFY_DUE_DAYS = 180;

function normalizedEquals(a, b) {
  return tokenize(a).join(' ') === tokenize(b).join(' ');
}

function isUnset(value) {
  if (Array.isArray(value)) return value.length === 0;
  return value == null || value === '';
}

// No product_format means no safe matching at all — mirrors
// checkFormatCompatibility's own fail-safe in productTruth.js: a guess is
// worse than no answer. A candidate template must share the product's
// exact format. Beyond that, any identity field (blank_brand, blank_model)
// where BOTH sides are set and disagree excludes that template entirely —
// a match may be less specific than the product (the product has more
// confirmed than the template asks about), never in conflict with it.
// blank_model compares via the existing token normalizer, not exact string
// match, but still won't bridge e.g. "CC1717" to "Comfort Colors 1717" —
// deliberate; this app already refuses to guess at product identity, and
// the template holds the canonical spelling.
//
// Returns matches ranked by specificity (how many identity fields actually
// agreed) descending, then most-recently-verified, then name — deterministic,
// no fuzzy "best guess" ordering.
export function matchTemplates(productTruth, templates) {
  if (!productTruth?.product_format) return [];

  const results = [];
  for (const template of (templates || [])) {
    if (template.status !== 'active') continue;
    if (template.product_format !== productTruth.product_format) continue;

    let specificity = 0;
    let excluded = false;
    const matchedOn = [];

    if (template.blank_brand != null && productTruth.blank_brand != null) {
      if (template.blank_brand === productTruth.blank_brand) { specificity++; matchedOn.push('blank_brand'); }
      else excluded = true;
    }
    if (excluded) continue;

    if (template.blank_model != null && productTruth.blank_model != null) {
      if (normalizedEquals(template.blank_model, productTruth.blank_model)) { specificity++; matchedOn.push('blank_model'); }
      else excluded = true;
    }
    if (excluded) continue;

    results.push({ template, specificity, matchedOn });
  }

  results.sort((a, b) => {
    if (b.specificity !== a.specificity) return b.specificity - a.specificity;
    const av = a.template.last_verified, bv = b.template.last_verified;
    if (av !== bv) {
      if (av == null) return 1;
      if (bv == null) return -1;
      if (av < bv) return 1;
      if (av > bv) return -1;
    }
    return a.template.name.localeCompare(b.template.name);
  });

  return results;
}

// One row per field the template actually owns (non-null on the template) —
// fields the template doesn't specify are simply absent, never shown as a
// false "fill" or "same". `fill`: product is empty, template has a value.
// `differs`: both set and unequal — the UI's job is to flag this, never
// silently resolve it. `same`: both set and equal, nothing to do.
export function diffTemplate(productTruth, template) {
  const rows = [];
  for (const field of TEMPLATE_OWNED_FIELDS) {
    const templateValue = template[field];
    if (isUnset(templateValue)) continue;
    const productValue = productTruth[field];
    let state;
    if (isUnset(productValue)) state = 'fill';
    else if (fieldsEqual(productValue, templateValue)) state = 'same';
    else state = 'differs';
    rows.push({ field, productValue, templateValue, state });
  }
  return rows;
}

function fieldsEqual(a, b) {
  if (Array.isArray(a) || Array.isArray(b)) {
    const aa = Array.isArray(a) ? a : [];
    const bb = Array.isArray(b) ? b : [];
    return aa.length === bb.length && aa.every((v, i) => v === bb[i]);
  }
  return a === b;
}

// selectedFields: array of snake_case TEMPLATE_OWNED_FIELDS entries the user
// checked in the diff table. Returns a { formKey: value } object the caller
// applies via the existing setField(k, v) — writes to form state only, never
// to the database directly; the existing draft autosave and save paths pick
// it up from there, same as any other form edit.
export function buildApplyPayload(template, selectedFields) {
  const payload = {};
  for (const field of selectedFields) {
    const formKey = TEMPLATE_TO_FORM_FIELD[field];
    if (formKey) payload[formKey] = template[field];
  }
  return payload;
}
