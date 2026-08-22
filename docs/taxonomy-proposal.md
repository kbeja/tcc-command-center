# Taxonomy Proposal — Broad Niches, Terminology Rework, and the 54-Collection Triage

**Date:** 2026-08-21
**Follows:** [taxonomy-architecture-audit.md](taxonomy-architecture-audit.md) (Phase 1)
**Status:** Proposal for review. Nothing applied. No migration written yet.
**Live data:** read from Supabase 2026-08-21 via `scripts/supabase-read.js`.

---

## 1. The nine broad niches (fixed seed)

From Taylor's 90-Day Challenge, confirmed by Kristen:

`Wedding` · `Funny` · `Birthday` · `Relationships` · `Christian` · `Hobbies` · `Professions` · `Pets` · `Social Justice`

These are the only Level-1 nodes. Everything else hangs beneath them, or is not taxonomy at all.

**Two tensions worth naming before we build on this** (neither blocks anything — flagging, not
objecting):

- **`Funny` and `Birthday` are not customer identities**, which is what §3 says a niche level
  should be. `Funny` is closer to a message/voice and `Birthday` to an occasion. They are in the
  source framework, so they stay — but it means the "is this an identity?" test can't be the only
  rule we use when deciding where something goes.
- **There is no home for seasonal work** in the nine. Halloween, Christmas, Back to School and
  4th of July are all live collections today. They must **not** become taxonomy nodes (§6 says
  seasonal is an overlay). They belong in the Seasonal Overlay layer — and TCC already has the
  right home for this: Phase 22's `timing_niches` + `timing_guidance` calendar.

---

## 2. Terminology rework

Kristen's ask: *"the collections/chapters terminology needs to be revised throughout the whole
command center."*

| Today | Becomes | Notes |
|---|---|---|
| **Chapter** (`collections.chapter`) | **Broad Niche** | Fixed set of 9. The term "Chapter" disappears from the app entirely. |
| `collections.parent_chapter` | — | Redundant second copy of the same idea, and it *disagrees* with `chapter` (Mom Chapter has `chapter='Mom'`, `parent_chapter='Mom Chapter'`). Retire. |
| — (does not exist) | **Sub-Niche** | New Level 2. e.g. Reading, Sports, Sports Moms, Teachers. |
| — (does not exist) | **Specific Niche** | New Level 3. e.g. Hockey Mom, Romantasy Reader, Kindergarten Teacher. |
| **Collection** (most of the 54 rows) | **Sub-Niche or Specific Niche** | The majority of today's "collections" are markets, not curated groups. |
| **Collection** (a handful of rows) | **Collection** — unchanged | §5 is explicit: don't replace or remove Collections. They survive as a *curated* layer, just far smaller. |
| `research_sessions.niche` | **Specific Niche** | Free-text today; becomes a real FK. |
| `research_sessions.parent_niche` | **Broad Niche** | Same. |

**Naming note:** "Chapter" is also TCC's brand voice ("The Current Chapter", "New Chapter Same
Chaos"). Retiring it as a *structural* term does not retire it as a *brand* term — product names
and collection names can keep it. This proposal only removes it as a taxonomy level.

---

## 3. The five destinations

Every one of the 54 existing collections goes to exactly one of these:

| Destination | What it means | Where it lives |
|---|---|---|
| **Niche node** | A real market/buyer identity | new `niches` table |
| **Collection** | A curated creative grouping | `collections`, kept |
| **Aesthetic / Design Style** | A visual language | `visual_tags` (exists) |
| **Seasonal Overlay** | An occasion or season | `timing_niches` (exists, Phase 22) |
| **Product Type** | A format, not a market | `products.product_format` (exists, 17 values) |
| **Retire** | Duplicate, catch-all, or a research bucket that was never a market | archived, records reassigned |

---

## 4. The triage — all 54 collections

Row counts are live as of 2026-08-21. `P` = products, `R` = research sessions, `S` = sparks.

### 4.1 → HOBBIES · Reading

| Collection | Counts | Proposed |
|---|---|---|
| Reader Chapter | P6 R6 | **Sub-Niche: Reading** |
| Book Lover Apparel | R6 | **Specific: General Reader / Book Lover** |
| Bibliophile & Literary Enthusiast | R1 | merge → **General Reader / Book Lover** |
| Reading Niche & Literary Interest | R1 | merge → **Sub-Niche: Reading** (duplicate) |
| BookTok & Modern Reader Culture | R1 | **Specific: BookTok Reader** |
| Cozy Romance | — | **Specific: Romance Reader** |
| Spicy & Dark Romance Readers | R1 | merge → **Romance Reader** + secondary tag `Spicy` |
| Fantasy Reader | — | **Specific: Fantasy Reader** |
| Core Trendy Book Shirts | R1 | **Retire** — product type + trend, never a market |
| Book Lover Demographic Shirts | R2 | **Retire** — a research bucket, not a market |
| Morally Gray Society | — | **Collection** (curated — the §5 "Club" case exactly) |
| Annotation Club | — | **Collection** |
| Spicy Books Social Club | — | **Collection** |
| Bookstore Weekend | — | **Collection** |
| Reading Rituals | — | **Collection** |
| **Dark Academia** | — | **Aesthetic** — §32 names this explicitly |
| Cottage Library *(planned)* | — | **Aesthetic** |
| Literary Minimalist *(planned)* | — | **Aesthetic** |
| Library & Academic | R1 | ⚠️ **needs your call** — Professions → Librarian, or an aesthetic? |

### 4.2 → HOBBIES · Sports

The live products prove this needs all three levels. The `Hockey` collection currently holds four
listings aimed at **three different buyers**: a Hockey Mom, a Hockey Girlfriend, and a general
Hockey Fan.

| Collection | Counts | Proposed |
|---|---|---|
| Hockey | P4 R7 | **Sub-Niche: Hockey**, with specifics **Hockey Mom** · **Hockey Girlfriend** · **Hockey Fan** |
| Field Hockey Niche | R1 | **Specific: Field Hockey** (under Sub-Niche: Sports) |

Note §37 separates `Sports` from `Sports Moms`. Given the live data, I'd nest by **sport first**
(Hockey → Hockey Mom / Hockey Girlfriend / Hockey Fan) rather than by role (Sports Moms → Hockey
Mom). Reason: the shop's research, keywords and design language all cluster by sport, and role
nests cleanly underneath. Flagging because it's a deliberate departure from §37 — easy to flip.

### 4.3 → HOBBIES · Other

| Collection | Counts | Proposed |
|---|---|---|
| Mahjong Apparel & Gifts | R1 | **Specific: Mahjong Player** |
| Mahjong Products | R1 | merge → **Mahjong Player** (duplicate) |
| Coffee & Caffeine Themed | R1 | **Specific: Coffee Lover** |
| Scavenger Hunt Activities | R1 | **Product Type** — an activity printable, not a market |
| Party & Activity Games | R1 | **Product Type** |

### 4.4 → RELATIONSHIPS

| Collection | Counts | Proposed |
|---|---|---|
| Mom Chapter | P12 R11 | **Sub-Niche: Motherhood** *(TCC Extension per §38)* |
| Elder Millennial Chapter | R1 S1 | **Specific: Elder Millennial Mom** + Aesthetic `90s Nostalgia` |
| Dad Gifts & Apparel | R1 | **Sub-Niche: Fatherhood** (drop "Gifts" — that's intent, §18) |
| Gift for Her & Girlfriend | R1 | **Retire** → becomes Gift *intent* on keywords (§18) |
| Kids Chapter | P4 | ⚠️ **needs your call** — see below |

**On Kids Chapter:** all four products are *kids' book-lover tees* (Dinosaur Bookworm, Kids
Bookworm Shirt, Funny Book Lover Kids Tee, Coquette Book Lover Tee). So it isn't a market — it's
**Reading, with a child recipient**. Recommend: dissolve into `Hobbies → Reading → Kid Reader`,
and let "kids" live as recipient intent + product sizing rather than as its own branch.

### 4.5 → PETS

| Collection | Counts | Proposed |
|---|---|---|
| Animal Lover Gifts | R2 | **Sub-Niche: Pet Owners** (drop "Gifts") |
| Dog Humor Apparel | R1 | **Specific: Dog Owner** + secondary tag `Funny` |
| Animal Meme | R3 | **Specific: Dog Owner** or Pets×Funny crossover — ⚠️ **needs your call** |

### 4.6 → PROFESSIONS · CHRISTIAN · FUNNY

| Collection | Counts | Proposed |
|---|---|---|
| Teacher Gifts & Apparel | R1 | **Sub-Niche: Teachers** (Professions) |
| Religious & Faith Apparel | R1 | **Broad: Christian** — no sub-niche yet |
| Funny & Meme Graphic Tees | R2 | **Broad: Funny** — no sub-niche yet |
| Unhinged Apparel | R1 | ⚠️ **needs your call** — Funny sub-niche, or a brand voice/aesthetic? |

### 4.7 → AESTHETIC (`visual_tags`)

Coastal & Niche Aesthetic · Vintage & Retro Apparel · Vintage Apparel *(duplicate — merge)* ·
Comfort Colors & Casual Wear

### 4.8 → SEASONAL OVERLAY (`timing_niches`)

Christmas & Holiday Gifts · Halloween Apparel · Back to School · 4th of July & American Patriotic ·
Seasonal · Summer Printables *(planned)*

All six already have matching rows in the Phase 22 Taylor calendar seed. No new vocabulary needed —
just the link.

### 4.9 → PRODUCT TYPE / RETIRE

| Collection | Counts | Proposed |
|---|---|---|
| Graphic Tees & General Apparel | R4 | **Product Type** |
| Comfort & Fit-Specific Apparel | R1 | **Product Type** |
| Color & Design Attributes | R1 | **Retire** — an attribute axis, not a market |
| Digital | — | **Product Type** |
| Passive Income Guides | R2 | **Product Type** |
| General | R4 | **Retire** — catch-all |

### 4.10 Triage summary

| Destination | Count |
|---|---|
| Niche node (new taxonomy) | 22 → **17 after merges** |
| Collection (kept, curated) | 5 |
| Aesthetic | 8 |
| Seasonal Overlay | 6 |
| Product Type | 7 |
| Retire | 8 |

**54 collections collapse to ~17 real niche nodes.** That is the shape of the problem: two thirds
of what's currently called a "collection" was never a market.

---

## 5. How much migration this actually needs

Far less than the 54 rows suggest, because almost nothing is attached to most of them:

| Table | Rows | Classified today |
|---|---|---|
| `products` | 26 | **4 collections only** — Mom Chapter 12, Reader Chapter 6, Kids Chapter 4, Hockey 4 |
| `sparks` | 382 | **369 have no collection at all** (Reader 12, Elder Millennial 1) |
| `research_sessions` | 82 | spread across 42 collections |
| `concepts` | 2 | one points at `Halloween 2026`, which **isn't in the collections table at all** |
| `keywords` | 660 | inherit from their session |

This is exactly the §35 "progressive migration" case, and it's small. Classifying all 26 products
and the ~12 active research collections covers the entire live surface. The 369 unclassified
sparks stay unclassified until they resurface — which §10 says is correct behaviour, not debt.

---

## 6. Proposed schema (Phase 2)

One self-referencing table, not three — §36 requires rename / archive / reassign / reparent, and
an adjacency list does reparenting for free. Depth is enforced in JS, matching this codebase's
convention of zero CHECK constraints.

```
niches
  id          uuid PK
  name        text NOT NULL
  level       text NOT NULL          -- 'broad' | 'sub' | 'specific'
  parent_id   uuid REFERENCES niches(id)   -- null only for the 9 broad
  status      text NOT NULL DEFAULT 'active'
  source      text                   -- 'taylor_90day' | 'tcc_extension'  (§38)
  notes       text
  created_at / updated_at

  UNIQUE INDEX on (parent_id, lower(name))   -- same ci technique as visual_tags / timing_niches
```

Junctions, all following the existing composite-PK + cascade pattern:

- `niche_collections` — niche ↔ collection, m2m (a Collection can span niches)
- `niche_timing_niches` — niche ↔ Phase 22 calendar niche, **human-linked only** (§4.2 of the audit)
- `keyword_niches` — keyword ↔ specific niche, **m2m** (§29)

Single primary FK (not m2m) per §4's "one primary path + secondary tags":

- `sparks.primary_niche_id`, `concepts.primary_niche_id`, `products.primary_niche_id`

Secondary tags: add `kind` to `visual_tags` (`'aesthetic' | 'design_style' | 'secondary'`),
defaulting existing rows to `'aesthetic'`. This gives §6's Design-Style-separate-from-Aesthetic
split *and* §4's secondary tags without inventing a second tagging system. Downside: the table name
`visual_tags` becomes slightly inaccurate. Rename or live with it — your call, low stakes either way.

---

## 7. Scope of the terminology rename

Measured, not estimated: **62 files** reference collection/chapter, **1,134** identifier
occurrences, **109** user-visible "Chapter" strings.

**Recommendation: do not rename the `collections` table or its columns.** The rename is almost
entirely a *labelling and data* exercise, not a column-rename exercise:

- The taxonomy tables are **brand new** — nothing to rename there.
- `collections` **keeps its name** because Collections legitimately survive (§5). It just loses
  ~49 of its 54 rows to other layers.
- `collections.chapter` / `.parent_chapter` get **retired** once their data moves into `niches` —
  a data migration, not a schema rename.
- What actually changes in the UI is labels, filters and pickers.

That turns a 1,134-reference refactor into roughly a 109-string relabel plus new niche pickers.
Much lower risk, and it can ship incrementally.

---

## 8. Revised phase plan

| Phase | Work | Risk |
|---|---|---|
| **2a** | `niches` table + junctions; seed the 9 broad niches. Zero reads changed. | low |
| **2b** | Taxonomy admin UI — add / rename / archive / reparent (§36). | low |
| **2c** | Apply the §4 triage to the ~17 niche nodes. **Human-approved, one at a time.** | low |
| **2d** | Terminology relabel: "Chapter" → "Broad Niche" across 109 strings; new niche pickers. | medium |
| 3 | Sparks — taxonomy + the 6 Spark types (§9) | low |
| 4 | Concepts — taxonomy + creative fields + inheritance | low |
| 5 | SEO Research — `keyword_niches`, intent, clusters, Etsy MI fields | **high** |
| 6 | Analysis layer | medium |
| 7 | Products — taxonomy + inheritance | low |
| 8 | Listing Builder cutover | **high** |
| 9 | Active-data migration (26 products, ~12 research collections) | manual |
| 10 | Verify | — |

---

## 9. Decisions needed before Phase 2a

1. **Sports nesting** — by sport (`Hockey → Hockey Mom`) as proposed, or by role per §37
   (`Sports Moms → Hockey Mom`)?
2. **Kids Chapter** — dissolve into `Reading → Kid Reader` as proposed, or keep as its own branch?
3. **Library & Academic** — Professions → Librarian, or an aesthetic?
4. **Animal Meme** — a Pets specific niche, or a Pets × Funny crossover (primary Pets + secondary tag `Funny`)?
5. **Unhinged Apparel** — a Funny sub-niche, or TCC brand voice (which would make it an aesthetic/voice tag, not taxonomy)?
6. **`visual_tags` rename** — leave the name, or rename to `tags` now that it holds three kinds?

Everything else in this document I'm confident enough to proceed on without a check-in.
