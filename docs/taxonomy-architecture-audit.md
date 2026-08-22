# Taxonomy / SEO Architecture — Phase 1 Audit

**Date:** 2026-08-21
**Scope:** §39 of the architecture brief — inspect schema, Sparks, Concepts, Products, Research,
Keywords, Collections, Analytics, Listing Builder, migrations/hooks. Report before coding.
**Status:** No code written. No migrations authored. This document is the deliverable.

---

## 0. Headline findings

1. **There is no canonical taxonomy anywhere.** Instead there are *nine* separate free-text
   "niche-ish" labels spread across six tables, none of which reference each other.
2. **`collections` is doing four jobs at once** — curated collection, market segment, style-guide
   holder, and the join key for all keyword research. §5 says the first two must be separated.
   This is the single biggest structural problem, and the one with the most existing data on it.
3. **Roughly half of what the brief asks for already exists and is reusable as-is**, especially
   the multi-source evidence ledger (§14–17), the product-intent filter (§19), and the
   listing-specific SEO strategy object (§22). Those should not be rebuilt.
4. **§19's own worked example is already shipped.** The brief's "hockey mom sweatshirt vs hockey
   mom shirt" case is the documented bug Listing Intelligence Milestone A fixed, and the fix is a
   hard deterministic gate that runs *before* the AI ever sees the keyword pool.
5. **The genuinely new work is:** the taxonomy tree itself, search-intent classification (§18),
   persistent keyword clusters (§28), many-to-many keyword↔niche (§29), expanded Spark types (§9),
   Etsy Marketplace Insights capture fields (§16), and analysis above the product level (§27).

---

## 1. Inventory — what a "niche" is today

Nine independent labels. All free text except the two real tables at the bottom.

| # | Field / table | Table | Type | Who reads it |
|---|---|---|---|---|
| 1 | `chapter` | `collections` | text | Sparks filter, Research form, Listing Builder picker |
| 2 | `name` (a uuid PK does exist) | `collections` | text | everything — the de-facto niche key |
| 3 | `parent_niche` | `research_sessions` | text (copy of chapter) | Research session card only |
| 4 | `niche` | `research_sessions` | text ("90s Nostalgia") | Research card, Keyword detail, style-guide lookup |
| 5 | `parent_niche` | `trend_signals` | text | Trends page only |
| 6 | `collection` | `trend_signals` | text | Trends page only |
| 7 | `collection_tag` | `sparks` | text | Idea Vault |
| 8 | `collection_name` | `concepts` | text | Designs |
| 9 | `collection` | `products` | text | Products, Analytics, Listing Builder |
| — | `timing_niches` + `timing_niche_collections` | real tables | uuid PK, ci-unique, m2m | Phase 22 timing only |
| — | `visual_tags` + `concept_tags` / `collection_tags` | real tables | uuid PK, ci-unique, m2m | Phase 18 aesthetics |

**Consequence:** the app already has an accidental two-level tree (`chapter → collection`) and an
accidental third level (`research_sessions.niche`), but only Research sessions carry all three, and
none of it is a controlled vocabulary. A rename anywhere silently orphans rows in the other eight
places, because all nine are matched by string.

**`src/data/collections.js`** additionally hardcodes `nicheStyleGuides` keyed by lowercase name
(`'90s nostalgia'`, `'elder millennial'`, `'mom humor'`). Listing Builder prefers these over the
collection's own DB style guide. These are aesthetic-level concepts sitting in a niche-shaped slot.

---

## 2. Reusable as-is — do not rebuild

### 2.1 Multi-source evidence ledger — §14, §15, §17 (already done)
`keyword_history` (Phase 19) is already the append-only, per-source evidence ledger the brief
describes. One row per source reading; a second source never overwrites the first.

Columns present: `keyword`, `source` (free text), `volume`, `competition`, `score`, `source_score`
(the source's *own* score, kept separate from TCC's), `clicks`, `ctr`, `data_date` (as-of date,
distinct from capture date), `data_window` (`30d`/`90d`/…), `trend_data` (jsonb series),
`research_session_id` (provenance), `recorded_at`.

`'Etsy Marketplace Insights'` is already a valid `source` value in the Research form dropdown.
Adding a source is a string, never a schema change — deliberate, and it holds for Etsy MI.

### 2.2 Interpretation layer — §15, §26 (mostly done)
`src/lib/keywordIntelligence.js` is a pure deterministic engine that reads the full per-source
ledger and writes back to `keywords`: `classification`, `confidence`, `trend_classification`,
`disagreement_flag`, `interpretation_summary`, `research_status`. It detects cross-source
disagreement rather than averaging it away, and it has no single opaque score — §15's prohibition
is already satisfied by construction.

What it does *not* yet do: interpret at any level above the individual keyword (§27).

### 2.3 Product-intent filtering — §19 (already done, and hard-gated)
`src/lib/productTruth.js` → `checkFormatCompatibility()`. Token-boundary-safe (so "sweatshirt"
can never match "shirt"), 17 canonical `FORMAT_GROUPS`, plurals explicit. Ambiguous keywords are
treated as incompatible rather than guessed.

Critically it runs in `buildGenerationContext()` **before** the AI call, and excluded keywords are
written to `listing_generation_keywords` with `role='excluded'` and an `exclusion_reason`. The
brief's §19 requirement is met at the listing layer today.

### 2.4 Listing-specific SEO strategy — §22 (exists in ledger form)
`listing_generations` + `listing_generation_keywords` already record, per generation:
`primary_search_intent` (plus the keyword row it matched and a validation status),
`research_sources_used`, `research_gaps`, `product_truth_snapshot`, and per keyword `role`
(primary/supporting/excluded), `relevance_category`, `exclusion_reason`, plus a denormalized
snapshot of the numbers *as seen at generation time*.

This is §22's object, already append-only and already per-listing rather than per-niche. It needs
extending, not replacing.

### 2.5 Intent vocabulary — §18 (exists, but in the wrong place)
`netlify/functions/generate-listing-v2.js` defines:
`exact_product_intent, close_product_intent, audience, style, occasion, buyer_intent, adjacent`.
That is very close to the brief's `Identity, Product, Gift, Recipient, Occasion, Seasonal,
Style/Message, Adjacent`.

**But:** it is assigned by the AI, at generation time, per listing, and stored only on the
generation row. Nothing classifies intent on the keyword itself in Research. §18 wants the latter.

### 2.6 Aesthetic / Trend layer — §6, §32 (exists)
`visual_tags` is a shared, case-insensitively-unique controlled vocabulary with junctions to
`concepts` and `collections`. It was explicitly designed to take more junctions later. This is
exactly the "Dark Academia is an aesthetic, not a niche" layer — it just has no junction to
Sparks, Products or Keywords yet, and no distinction between **Design Style** and **Aesthetic**
(the brief separates them; `visual_tags` is one undifferentiated pool).

### 2.7 Many-to-many precedent — §29
`keyword_concepts` (composite PK, cascade both sides) is the exact shape needed for
keyword↔specific-niche. `timing_niche_collections` and `collection_tags` are the same pattern
against `collections.id`. Three precedents; no new design needed.

### 2.8 Source-vocabulary vs TCC-vocabulary precedent — §36
Phase 22 already faced this question and answered it: `timing_niches` holds *the names a source
printed* (Taylor's calendar: "Hockey", "Book Reading", "Birthday Themes"), linked to TCC
collections only by explicit human action, never auto-matched. That reasoning applies verbatim to
the new taxonomy.

### 2.9 First-party performance — §14 Source 4 (exists)
Phase 23A shipped `listing_performance_snapshots`, `listing_traffic_sources`,
`listing_search_terms`, `shop_ads_daily`. Real Etsy search terms per listing are already captured.

### 2.10 Cross-product analysis — §27 (partially exists)
`src/lib/portfolioAnalysis.js` → `PORTFOLIO_DIMENSIONS` already groups by `collection`, `format`,
`title_strategy`, `search_intent`, `visual_aesthetic`, `checkpoint`, `template_usage`,
`policy_usage`, with explicit "not enough data yet" discipline. Missing: broad/sub/specific niche,
keyword cluster, season.

### 2.11 Sparks behaviour — §8 (preserve)
Hot/Cold, search, collection assignment, Evaluate, Activate, Concept creation from Spark
(`concepts.spark_id`), archive, bulk actions, stale-Hot handling — all present in
`src/pages/Sparks.jsx` / `SparkCard.jsx`. The brief says don't rebuild; nothing here needs to be.

---

## 3. Genuinely missing

| # | Brief § | Gap |
|---|---|---|
| 1 | §2, §36 | **Canonical taxonomy table.** Broad → Sub → Specific, editable, renameable, archivable, one shared source. Does not exist in any form. |
| 2 | §4 | **Secondary tags** as a cross-cutting layer separate from aesthetics. Does not exist. |
| 3 | §8, §11, §12 | **Taxonomy on Sparks / Concepts / Products / Keywords / Research Sessions.** Nothing to attach to yet. |
| 4 | §9 | **Spark types.** Only 3 exist (`Product Idea`, `Strategy Idea`, `Tool/Resource`). Missing: Phrase, Niche/Market Idea, Visual Direction, Research Lead. |
| 5 | §18 | **Search intent stored on the keyword**, human-approved. Only exists AI-assigned per generation. |
| 6 | §28 | **Persistent keyword clusters.** `KeywordExplore` has AI clustering, but the cluster name is dissolved into a session `notes` string and the grouping itself is discarded on save. |
| 7 | §13, §29 | **Many-to-many keyword↔niche.** Today: keyword → `research_session` → `collection` (single parent, by name). A keyword cannot serve two niches. |
| 8 | §16 | **Etsy Marketplace Insights fields.** `volume`/`competition`/`trend_data` map cleanly; missing: Etsy conversion classification, trend % vs prior period, similar search terms, listing price range / median purchase price, and the sampling caveat as source context. |
| 9 | §16 | **Screenshot / source evidence capture.** Two storage buckets exist (`design-vault`, `competitor-visual-snapshots`); neither is for research evidence, and there is no assets table hanging off `research_sessions`. |
| 10 | §6 | **Design Style as its own field**, distinct from Aesthetic. `concepts.visual_style` is free text; `visual_tags` has no kind discriminator. |
| 11 | §6 | **Seasonal overlay is three unrelated mechanisms**: `collections.season`, `research_sessions.seasonal` (bool), `concepts.seasonal_flag`. |
| 12 | §27 | **Analysis above product level** — by niche, cluster, aesthetic, season. |
| 13 | §11, §12 | **Inheritance.** `concepts.spark_id` and `products.concept_id` FKs exist, but no code copies context down the chain. |
| 14 | §26 | **Editable, human-approved analysis records** at any level. Interpretation today is machine-derived and overwritten on recompute; there is no place for Kristen to write "sources conflict, I think X". |

---

## 4. Conflicts and risks to settle before building

### 4.1 `collections` is overloaded — the central decision
`collections` currently carries: `name`, `chapter`, `status`, `priority`, `season`, `launch_date`,
`identity`, `style_guide`, `notes`, `expansion_opportunities`, `last_verified`, and five
`evaluation_*` scoring fields. It is referenced by name from Sparks, Concepts, Products, Research
Sessions and Trend Signals, and by uuid from `collection_tags` and `timing_niche_collections`.

§5 says Collections must remain a *separate curated layer*. But today it is also the market
segment. Every existing collection has to be triaged into one of:

- a Collection only (curated group, e.g. "Hockey Mom Club Collection")
- a taxonomy node only (it was really a market, e.g. "Hockey Niche")
- both (needs a Collection row *and* a taxonomy node, cross-linked)

**This cannot be automated** and it determines the shape of everything downstream. It is the first
thing I need from you (see §6 below).

### 4.2 Two niche vocabularies will coexist
`timing_niches` (Taylor's calendar names) vs. the new canonical taxonomy. §36 says "one canonical
taxonomy source" — but Phase 22 deliberately kept source names separate from TCC belief, and that
reasoning still holds: Taylor's "Hockey" and TCC's Hockey Mom specific niche are not the same
object.

**Recommendation:** keep both, add an explicit human-linked junction (taxonomy node ↔ timing niche),
exactly like `timing_niche_collections` does for collections today. Merging them would destroy the
Phase 22 guarantee that a source's claim is never promoted to TCC fact.

### 4.3 The highest-risk change in the whole plan
`src/pages/ListingBuilder/index.jsx:287` — `research_sessions.select('*, keywords(*)').in('collection', cols)`.
That one query is the entire keyword universe for every listing generation. Moving keywords to a
many-to-many niche relationship changes it. Everything downstream (`buildGenerationContext`, the
format gate, the AI call, `listing_generation_keywords`) depends on its output shape.

**Recommendation:** in Phase 5, add the m2m relationship *alongside* the collection join and have
the Listing Builder read the union, so a keyword with no taxonomy assigned yet still behaves
exactly as it does today. Cut over only after Phase 9 classification is done.

### 4.4 `research_sessions.parent_niche` / `.niche` hold real data
These become redundant once the taxonomy exists, but they are the closest thing to it and contain
Kristen's actual sub-niche judgments. They must be migrated into the new structure or kept as a
legacy column — not dropped.

### 4.5 Interpretation is currently overwritten, not versioned
`recomputeKeywordInterpretation()` rewrites `keywords.classification` etc. in place. Evidence is
versioned (`keyword_history`); interpretation is not. §26's "analysis should be visible and
editable" implies interpretation needs its own durable, human-editable record rather than a
recomputed column. This is a real design change, not just a new field.

---

## 5. What would be redundant to build

| Do not build | Use instead |
|---|---|
| A new aesthetic/trend table | `visual_tags` + a `tag_kind` discriminator + new junctions |
| A new multi-source keyword evidence store | `keyword_history` |
| A per-source opaque opportunity score | Nothing — §15 forbids it, and it correctly does not exist |
| A new product-type relevance filter | `checkFormatCompatibility()` / `FORMAT_GROUPS` |
| A new listing SEO strategy object | `listing_generations` + `listing_generation_keywords` |
| A rebuilt Idea Vault | Extend `sparks` in place (§8) |
| A separate Phrase Bank / Visual Trends app | Spark types (§9) + `visual_tags` (§44 out-of-scope) |
| A new niche↔collection link for timing | `timing_niche_collections` already exists |

---

## 6. Open questions — needed before Phase 2 can be designed

1. **The live collection list.** I cannot query Supabase from this worktree. I need the current
   `collections` rows (name + chapter + status) to propose the taxonomy↔collection triage in §4.1.
2. **Chapter semantics.** Is "Mom Chapter" a Broad Niche, a Sub-Niche, or a Collection grouping?
   Under Taylor's framework it would be a TCC Extension (`Relationships → Motherhood`, §38), not
   one of the nine source-validated broad niches.
3. **Does Collection become optional** on Sparks/Concepts/Products once taxonomy exists, or does
   everything keep both?
4. **Product Type vocabulary.** `products.product_format` already has 17 canonical values driving
   the §19 filter. Recommend the taxonomy's Product Type reuse that exact vocabulary rather than
   introduce a second one. Confirm?
5. **Intent assignment.** Human-set per keyword, or AI-suggested and human-approved (§40)? And is
   intent a property of the keyword globally, or of the keyword *within a niche* (a keyword serving
   four niches per §29 could read as Identity in one and Adjacent in another)?
6. **Analysis records (§26 / §4.5).** Should interpretation become a durable, human-editable,
   append-only record per level — or stay a recomputed column with a separate notes field?

---

## 7. Proposed sequence (unchanged from §43, mapped to this codebase)

| Phase | Touches | Risk |
|---|---|---|
| 2 · Canonical taxonomy | new tables + junctions to `collections`, `timing_niches` | low — purely additive |
| 3 · Sparks | `sparks` columns, `SparkCard`, `CaptureField`, `mobile-capture.js`, Spark types | low |
| 4 · Concepts | `concepts` columns, `visual_tags.tag_kind`, inheritance from Spark | low |
| 5 · SEO Research | `keyword_niches` m2m, intent field, clusters, Etsy MI fields, evidence bucket | **high** — see §4.3 |
| 6 · Analysis | new analysis records, level-scoped | medium — see §4.5 |
| 7 · Products | `products` columns, inheritance from Concept | low |
| 8 · Listing Builder | the `.in('collection', cols)` cutover, intent filter added to the gate | **high** |
| 9 · Active migration | classify Hot Sparks / live Products / active Research only (§35) | manual |
| 10 · Verify | §43 checklist | — |

Every phase: hand-written SQL under `supabase/migrations/`, never auto-applied; no silent writes;
Evidence / Interpretation / Decision kept separate.

---

## 8. Recommendation

Answer the six questions in §6, then build **Phase 2 only** — the canonical taxonomy tables plus
their junctions to `collections` and `timing_niches`, with zero changes to any existing read path.
That is fully additive, reversible, and it unblocks Phases 3, 4 and 7 (Sparks / Concepts /
Products), which are all low-risk. Phases 5 and 8 are where the real risk is and should not be
designed until the taxonomy shape is settled and populated.
