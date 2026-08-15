// ─── Approved Store Policy Library — Milestone C1 ──────────────────────────
// Centralizes store-level facts (shipping, production time, ...) that
// should never be invented per listing. The one safety-critical function
// here, resolveEffectiveProductTruth(), is what a policy is actually
// allowed to do to a generation: fill a *text* fact the product itself
// left unset. It can never grant permission to discuss a topic without
// also supplying the fact that topic is about, and it can never answer a
// per-product capability question (personalization/customization/gift-wrap
// availability) a human must individually confirm.
//
// Why that second rule matters, concretely: src/lib/productTruth.js's
// computeDiscussionPermissions() treats its inputs as two different kinds
// of claim. The 4 text fields (shipping_policy, production_time, material,
// size_range) ask "is there a fact to state" — a policy's approved_text IS
// such a fact, substituting it is not a new claim type. The 3 booleans
// (personalization/customization/gift_wrap_available) ask "did THIS
// PRODUCT individually confirm it offers this" — a store having a
// gift-wrap policy on file says nothing about whether this specific
// listing does. Letting a policy flip an unconfirmed boolean to true would
// be exactly "the Policy Library became a permission for AI to fill
// missing facts," which the brief explicitly forbids. Structurally
// enforced here by POLICY_FIELD_MAP only ever mapping text fields — the
// booleans never appear as a map value, so they're never touched by
// resolution at all, not excluded by a special case that could be forgotten.
//
// computeDiscussionPermissions() itself never changes — callers resolve
// the effective Product Truth object *before* handing it to that function,
// so its own logic and its 17 existing tests stay completely untouched.

export const POLICY_TYPES = [
  'shipping', 'international_shipping', 'production_time',
  'returns_exchanges', 'personalization', 'gift_wrap', 'care_instructions',
];

// Advisory only — same freshness-badge treatment as products.last_keyword_audit
// (src/lib/listingSEO.js's FRESHNESS_DUE_DAYS). Never changes generation
// behavior; a stale policy still resolves normally. Silently dropping a
// stale policy would make a listing quietly stop mentioning shipping.
export const POLICY_VERIFY_DUE_DAYS = 90;

// The ONLY policy types that reach generation, and the Product Truth field
// each fills. Single point of extension — a future milestone widening this
// must also add a permission topic in productTruth.js's TOPIC_LABELS and an
// output section in generate-listing-v2.js's schema; until then, injecting
// approved text for e.g. returns_exchanges would land in a field nothing
// validates (product_details), a new leak class, not a feature. Deliberately
// narrow in C1 — see this file's header and the migration's own comment.
export const POLICY_FIELD_MAP = {
  shipping_policy: ['shipping', 'international_shipping'],
  production_time: ['production_time'],
};

export function isPolicyGenerationEligible(policyType) {
  return Object.values(POLICY_FIELD_MAP).some(types => types.includes(policyType));
}

function isUnset(value) {
  return value == null || value === '';
}

// Deterministic winner among active policies of the SAME type mapped to the
// same field — most recently verified first (never-verified sorts last,
// not first: an unverified policy is weaker evidence than a verified one,
// regardless of when it was created), then most recently created. The
// library UI separately warns when more than one active policy shares a
// type; this only decides which one generation actually uses.
function pickBestPolicy(candidates) {
  return [...candidates].sort((a, b) => {
    if (a.last_verified !== b.last_verified) {
      if (a.last_verified == null) return 1;
      if (b.last_verified == null) return -1;
      return a.last_verified < b.last_verified ? 1 : -1;
    }
    return new Date(b.created_at) - new Date(a.created_at);
  })[0];
}

// productTruth: the product-only object from buildProductTruth(form) —
// never mutated. policies: the full active+archived list from
// useStorePolicies(); only status === 'active' rows are ever considered
// (filtered here too, not just by the caller — defense in depth).
//
// Returns { effective, sources }. `effective` is productTruth with each
// POLICY_FIELD_MAP field filled from an approved policy when the product
// itself left it unset — pass THIS object (never the raw productTruth) to
// computeDiscussionPermissions and into the generation prompt. Permission
// and fact must travel together, always, as one resolved unit — never one
// without the other. `sources` records, per mapped field, which layer the
// effective value actually came from, for the ledger's product_truth_sources
// column (a later version-history view explains itself from this, without
// ever reading a live table again).
export function resolveEffectiveProductTruth(productTruth, policies) {
  const effective = { ...productTruth };
  const sources = {};
  const active = (policies || []).filter(p => p.status === 'active');

  for (const [field, policyTypes] of Object.entries(POLICY_FIELD_MAP)) {
    if (!isUnset(productTruth[field])) {
      sources[field] = { source: 'product' };
      continue;
    }

    const used = [];
    const parts = [];
    for (const type of policyTypes) {
      const candidates = active.filter(p => p.policy_type === type);
      if (!candidates.length) continue;
      const winner = pickBestPolicy(candidates);
      used.push({ id: winner.id, policy_type: winner.policy_type, title: winner.title || null, last_verified: winner.last_verified || null });
      parts.push(winner.approved_text);
    }

    if (parts.length) {
      effective[field] = parts.join('\n\n');
      sources[field] = { source: 'store_policy', policies: used };
    } else {
      sources[field] = { source: 'unset' };
    }
  }

  return { effective, sources };
}
