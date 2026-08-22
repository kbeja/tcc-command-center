# SEO / Listing Builder Amendment — Audit

**Date:** 2026-08-22
**Amends:** [taxonomy-architecture-audit.md](taxonomy-architecture-audit.md) · [taxonomy-proposal.md](taxonomy-proposal.md)
**Scope:** §28 of the follow-up brief — audit Research, keyword storage, eRank/EverBee imports,
competitor analysis, Listing Builder, title/tag generators, Product Workspace, Analytics and the
30/60/90/120 review, then report.
**Status:** No code changed. Phase 2c seed migration still pending Kristen running it.

---

## 0. Does this change the taxonomy plan?

**Almost entirely no.** §27 is explicit that Broad → Sub → Specific stands, and nothing in this
amendment contradicts the Phase 2a/2b/2c work. The 2c seed migration is unaffected and can be run
as written.

Three small ripples, none blocking:

1. §5's intent list has **nine** values (adds `Broad / Parent`); the earlier brief had eight.
2. §17 adds **competitor title pattern** as a research dimension — new scope inside Phase 5.
3. The amendment is heavily Listing-Builder-weighted, and Listing Builder is currently **last**
   (Phase 8) in the plan. That sequencing is now worth re-deciding — see §7 question 5.

---

## 1. What already exists

Considerably more than the amendment assumes. Several requirements are already shipped.

| Amendment § | Requirement | Status |
|---|---|---|
| §2, §3 | Multi-source evidence, never blended into one score | **Done.** `keyword_history` is an append-only per-source ledger; no composite score exists anywhere in the codebase. |
| §6 | Product intent as a **hard filter** | **Done, and already a hard gate.** `checkFormatCompatibility()` runs inside `buildGenerationContext()` *before* the AI call — token-boundary-safe, 17 canonical formats. |
| §11 | Excluded keywords must be explainable | **Done.** `listing_generation_keywords.exclusion_reason` is written per excluded term and rendered in the builder. |
| §10 | Listing-Specific SEO Strategy object | **Partially done.** `listing_generations` + `listing_generation_keywords` already store primary intent, supporting/excluded terms with roles, sources used, research gaps and a Product Truth snapshot. |
| §5 | Search intent classification | **Vocabulary exists**, wrong layer — see §3.4. |
| §22 | Funnel diagnosis (impressions / clicks / orders) | **Nearly done.** `diagnose()` in `tccIntelligence.js` returns `NO_EXPOSURE` / `LOW_CLICK` / `LOW_CONVERSION` / `PERFORMING` / `INSUFFICIENT`, with `minImpressions`/`minVisits` evidence gates and a do-not-touch guard. It deliberately returns *possibilities*, never causes. |
| §24 | Pre-publish completeness check | **Partially done.** `listingReadiness.js` has 5 dimensions: product_truth, search_intent, evidence, compatibility, generation_validation. |
| §17 | Competitor title patterns | **Raw material already stored.** `competitor_listings` has 48 columns including `product_name` (the actual title), `category`, `est_sales`, `conversion_rate`. Nothing classifies the titles yet. |
| §25 | TCC's own evidence stream | **Done.** Phase 23A: `listing_performance_snapshots`, `listing_traffic_sources`, `listing_search_terms`, `shop_ads_daily`. |
| §9 | Many-to-many keyword links | **Precedent exists** (`keyword_concepts`); the niche version is not built. |
| §7 | Buckets applied after relevance | **Done in the generation path** — the format gate runs before the pool ever reaches the model. |

---

## 2. What can be reused rather than rebuilt

- `keyword_history` — the §2 multi-source ledger, unchanged.
- `checkFormatCompatibility()` / `FORMAT_GROUPS` — the §6 hard filter, unchanged.
- `listing_generations` + `listing_generation_keywords` — extend into §10's strategy object rather
  than creating a parallel table. `role` / `relevance_category` / `exclusion_reason` already exist.
- `listingReadiness.js` — extend from 5 dimensions to §24's set. Its `ok` / `caution` / `pending`
  model and its "guidance, not blocking" behaviour already match §24's own wording.
- `diagnose()` / `computeFunnel()` — §22 is essentially done.
- `competitor_listings` — §17 needs one classification column, not a new table.
- `visual_tags` + a `kind` column — already planned for design style / aesthetic / secondary tags.

---

## 3. What conflicts with this architecture

### 3.1 The title instructions directly contradict §15/§16 — the one real conflict

`netlify/functions/generate-listing-v2.js` currently ships two strategies:

- **`buyer_clear`** (the default): *"Write a natural, scannable, product-forward title a real
  shopper would say out loud. Under 140 characters. **Do not pad with extra comma-separated phrases
  just to use more characters, and do not force any particular keyword to lead** — put whatever
  reads most naturally and clearly first."*
- **`expanded_keyword_test`**: framed explicitly as *"an experiment variant, not a return to rigid
  bucket-ordering rules."*

§16 asks for the opposite on both counts: **lead** with the strongest relevant buyer/product search
phrase, then **add** further relevant researched phrases (`Hockey Mom Sweatshirt, Hockey Mom Club
Crewneck, Rink Mom Gift`).

So today's default actively instructs the model *not* to do what §16 now asks for, and the strategy
that comes closest to §16 is labelled an experiment.

**Not a conflict:** the `Under 140 characters` limit. That is Etsy's platform maximum for the title
field, not a TCC short-title rule — §15 forbids inventing a short-title rule, not respecting the
field length.

### 3.2 Research flows straight into the Listing Builder — §4 says it must not

Today, `ListingBuilder/index.jsx` queries `research_sessions → keywords` by collection name, dedupes
inline, and hands the pool to `buildGenerationContext()`. There is no persisted, human-approved
object between research and generation.

`listing_generations` is written **after** generation, as a record of what happened. §4 and §10 want
a strategy approved **before** generation, which generation then consumes. Different object,
different lifecycle — even though it shares most of its fields.

### 3.3 Hard-coded niche knowledge — §8 rules this out

- `GLOBAL_COLLECTIONS` in `ListingBuilder/constants.js` — a fixed list of collections whose keywords
  pool into every listing.
- `nicheStyleGuides` in `src/data/collections.js` — style guides keyed by hard-coded lowercase niche
  names (`'90s nostalgia'`, `'elder millennial'`, `'mom humor'`), preferred over the collection's own
  DB style guide.

Both work today and neither is urgent, but both are exactly the hard-coded niche knowledge §8 rules
out, and both get stranded by the taxonomy migration.

### 3.4 Intent lives on the generation, not on the keyword

`RELEVANCE_CATEGORIES` (`exact_product_intent, close_product_intent, audience, style, occasion,
buyer_intent, adjacent`) is AI-assigned per generation and stored only on the generation row.
§5 wants intent classified on the keyword itself in Research, human-approved. Seven of the nine §5
values map onto the existing vocabulary; `Identity` and `Broad / Parent` are new.

### 3.5 §21's Query Matching vs Ranking split does not exist

`diagnose()`'s `NO_EXPOSURE` possibilities bundle both problems together: *"SEO / keyword targeting,
search demand, indexing time, competition, timing"*. §21 wants **matching** (did Etsy understand the
listing is relevant — title, tags, attributes, category, description) separated from **ranking**
(engagement, conversion, listing quality, personalisation). This is a refinement of an existing,
working function rather than new machinery.

---

## 4. Schema updates needed

| # | Change | For |
|---|---|---|
| 1 | `keywords.search_intent` (+ possible per-niche override) | §5 |
| 2 | `keyword_niches` junction (many-to-many) | §9 |
| 3 | `keyword_clusters` + `keyword_cluster_keywords` | §8 |
| 4 | Etsy MI fields on `keyword_history`: conversion classification, trend % vs prior period, similar terms, price range / median | §2 |
| 5 | Research evidence storage — a storage bucket plus an assets table on `research_sessions` for screenshots | §2 |
| 6 | `listing_seo_strategies`, **or** an approval lifecycle on `listing_generations` | §4, §10 — needs a decision |
| 7 | Analysis records — durable, human-editable, level-scoped | §4 |
| 8 | `competitor_listings.title_pattern` | §17 |
| 9 | Listing category + attributes storage on `products` | §13 — **nothing exists today** |
| 10 | Hero-image readiness fields | §23 |

---

## 5. UI changes needed

- **Research** — intent picker per keyword; cluster management; Etsy MI capture form with screenshot
  attach; many-to-many niche assignment.
- **Analysis** — an entirely new surface. There is currently nowhere to record "sources disagree,
  and here is what I think".
- **Listing Builder** — category and attribute fields (new); SEO-aware description opening; the
  title strategy rework; an approved-strategy step before generation; the expanded Search Setup
  panel (§24).
- **Product Workspace / Analytics** — split §21's Query Matching vs Ranking inside the existing
  `NO_EXPOSURE` diagnosis.
- **Collections / Niches** — retire `nicheStyleGuides` into the aesthetic layer.

---

## 6. What should be deferred

§29's own out-of-scope list holds. Beyond it:

- **Etsy category taxonomy import** — do not import or hard-code Etsy's category tree; it changes.
- **Automatic title-pattern reclassification** of existing competitor data (§29 says so explicitly).
- **§23 hero-image checks** — depend on the existing mockup/visual system, and are low value until
  category/attributes and the title rework land.
- **§20 de-duplication rules** — the brief itself says not to create rigid rules without testing.

---

## 7. Open questions

1. **Title strategy.** How should §3.1 be resolved — rewrite `buyer_clear` to the §16 hybrid, add a
   third strategy alongside it, or make it evidence-driven per niche from §17's competitor title
   patterns (which needs that data collected first)?
2. **The strategy object.** A new `listing_seo_strategies` table, or an approval lifecycle added to
   `listing_generations`? A new table is conceptually cleaner; extending avoids duplicating roughly
   fifteen fields plus the keyword child table.
3. **Etsy categories.** §13 says do not hard-code indefinitely. Options: free-text entry, a
   TCC-maintained reference table refreshed by hand, or just a "most specific category selected"
   confirmation with no stored vocabulary at all.
4. **Attributes.** These vary per category. Free-form key/value per listing, or a completion
   checkbox only?
5. **Sequencing.** This amendment is Listing-Builder-heavy, and Listing Builder is currently Phase 8
   of 10. Keep that order, or pull the search-readiness work (§13, §24) earlier?
