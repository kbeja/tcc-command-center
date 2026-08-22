# Taxonomy Proposal — Broad Niches, Terminology Rework, and the 54-Collection Triage

**Date:** 2026-08-21
**Follows:** [taxonomy-architecture-audit.md](taxonomy-architecture-audit.md) (Phase 1)
**Status:** Decisions resolved 2026-08-22 (§9). Phase 2a migration written — see `supabase/migrations/20260822_niche_taxonomy_phase2a.sql`. Not yet run.
**Live data:** read from Supabase 2026-08-21 via `scripts/supabase-read.js`.

---

## 1. The ten broad niches (fixed seed)

From Taylor's 90-Day Challenge, confirmed by Kristen:

`Wedding` · `Funny` · `Birthday` · `Relationships` · `Christian` · `Hobbies` · `Professions` · `Pets` · `Social Justice`

Everything else hangs beneath these, or is not taxonomy at all.

Plus a tenth, added by Kristen 2026-08-22 and marked as a TCC Extension (§38):

`Seasonal` — with Halloween, Christmas, Valentines etc. as its sub-niches.

**One tension worth naming** (flagging, not objecting): **`Funny` and `Birthday` are not customer
identities**, which is what §3 says a niche level should be. `Funny` is closer to a message/voice
and `Birthday` to an occasion. They are in the source framework, so they stay — but it means "is
this an identity?" can't be the only rule we use when deciding where something goes.

### 1.1 Seasonal is a branch *and* a crossover — one vocabulary, two uses

Kristen's decision: Seasonal gets its own branch, **and** the other nine can carry a seasonal
crossover. Those are two *uses* of one vocabulary, not two vocabularies:

| Case | Primary path | Seasonal overlay |
|---|---|---|
| A generic Halloween tee | `Seasonal → Halloween` | — |
| A Hockey Mom Christmas gift | `Hobbies → Hockey → Hockey Mom` | `Seasonal → Christmas` |

Both point at the **same** `Seasonal → Christmas` row. That is what keeps §36's "one canonical
taxonomy source" true — a separate seasons table would mean two Christmas records free to drift
apart, which is the exact failure this whole rework exists to end.

This also supersedes my earlier recommendation to route seasonal collections into `timing_niches`
instead of the taxonomy. Kristen's version is better: the seasonal *nodes* live in the taxonomy
where they can be a primary path, and `niche_timing_niches` links them to the Phase 22 calendar so
they inherit real sourced launch-window guidance rather than a guessed date. The calendar already
carries the full vocabulary — Christmas, Halloween, Valentines Day, Easter, Thanksgiving,
St. Patrick's Day, Mother's/Father's Day, Hanukkah, Back to School, 4th of July, Galentines,
Oktoberfest, Christmas in July and more — so Phase 2c derives the sub-niches from there rather
than inventing a list.

---

## 2. Terminology rework

Kristen's ask: *"the collections/chapters terminology needs to be revised throughout the whole
command center."*

| Today | Becomes | Notes |
|---|---|---|
| **Chapter** (`collections.chapter`) | **Broad Niche** | Fixed set of 10. The term "Chapter" disappears from the app entirely. |
| `collections.parent_chapter` | — | Redundant second copy of the same idea, and it *disagrees* with `chapter` (Mom Chapter has `chapter='Mom'`, `parent_chapter='Mom Chapter'`). Retire. |
| — (does not exist) | **Sub-Niche** | New Level 2. e.g. Reading, Hockey, Teachers, Christmas. |
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
| **Seasonal node** | An occasion or season | `niches`, under the `Seasonal` branch — linked to `timing_niches` for launch windows (§1.1) |
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
| Library & Academic | R1 | → **`Professions → Librarian`** (leaves the Reading branch) |

### 4.2 → HOBBIES · Sports

The live products prove this needs all three levels. The `Hockey` collection currently holds four
listings aimed at **three different buyers**: a Hockey Mom, a Hockey Girlfriend, and a general
Hockey Fan.

| Collection | Counts | Proposed |
|---|---|---|
| Hockey | P4 R7 | **Sub-Niche: Hockey**, with specifics **Hockey Mom** · **Hockey Girlfriend** · **Hockey Fan** |
| Field Hockey Niche | R1 | **Sub-Niche: Field Hockey** (its own sport, siblings with Hockey) |

**Confirmed by Kristen 2026-08-22:** nest by **sport first**. `Hobbies → Hockey → Hockey Mom`,
`Hobbies → Football → Football Mom`. A hockey mom and a football mom are different customers with
different keyword universes, so they need to be different specific niches — which only works if the
sport is the sub-niche. This is a deliberate departure from §37's `Sports Moms → Hockey Mom`;
"Sports" survives as a secondary tag for cross-sport questions, not as a level.

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
| Kids Chapter | P4 | **Dissolve** → `Hobbies → Reading → Kid Reader` |

**On Kids Chapter (confirmed):** all four products are *kids' book-lover tees* (Dinosaur Bookworm,
Kids Bookworm Shirt, Funny Book Lover Kids Tee, Coquette Book Lover Tee). It was never a market —
it's **Reading, with a child recipient**. It dissolves into `Hobbies → Reading → Kid Reader`, and
"kids" lives as recipient intent + product sizing rather than as its own branch.

### 4.5 → PETS

| Collection | Counts | Proposed |
|---|---|---|
| Animal Lover Gifts | R2 | **Sub-Niche: Pet Owners** (drop "Gifts") |
| Dog Humor Apparel | R1 | **Specific: Dog Owner** + secondary tag `Funny` |
| Animal Meme | R3 | **Pets × Funny crossover** — primary `Pets → Dog Owner`, secondary tag `Funny` (per §9.1) |

### 4.6 → PROFESSIONS · CHRISTIAN · FUNNY

| Collection | Counts | Proposed |
|---|---|---|
| Teacher Gifts & Apparel | R1 | **Sub-Niche: Teachers** (Professions) |
| Religious & Faith Apparel | R1 | **Broad: Christian** — no sub-niche yet |
| Funny & Meme Graphic Tees | R2 | **Broad: Funny** — no sub-niche yet |
| Unhinged Apparel | R1 | **`Funny → Unhinged`** |

### 4.7 → AESTHETIC (`visual_tags`)

Coastal & Niche Aesthetic · Vintage & Retro Apparel · Vintage Apparel *(duplicate — merge)* ·
Comfort Colors & Casual Wear

### 4.8 → SEASONAL (its own branch, per §1.1)

| Collection | Proposed |
|---|---|
| Christmas & Holiday Gifts | **`Seasonal → Christmas`** |
| Halloween Apparel | **`Seasonal → Halloween`** |
| Back to School | **`Seasonal → Back to School`** |
| 4th of July & American Patriotic | **`Seasonal → 4th of July`** |
| Seasonal | **Retire** — catch-all, superseded by the branch itself |
| Summer Printables *(planned)* | **Product Type** (printable) + `Seasonal → Summer` overlay |

All of these already have matching rows in the Phase 22 Taylor calendar, so each new seasonal
sub-niche gets a `niche_timing_niches` link rather than a new vocabulary.

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

Recounted after the 2026-08-22 decisions. All 54 accounted for:

| Destination | Collections | Notes |
|---|---|---|
| Niche node | **29** | including 6 pairs that merge into one node each |
| Collection (kept, curated) | 5 | Morally Gray Society, Annotation Club, Spicy Books Social Club, Bookstore Weekend, Reading Rituals |
| Aesthetic (`visual_tags`) | 7 | Dark Academia, Cottage Library, Literary Minimalist, Coastal, Vintage & Retro (+dup), Comfort Colors |
| Product Type | 7 | Graphic Tees, Comfort & Fit, Digital, Passive Income Guides, Scavenger Hunt, Party & Activity, Summer Printables |
| Retire | 6 | General, Seasonal, Color & Design Attributes, Gift for Her, Core Trendy Book Shirts, Book Lover Demographic Shirts |
| **Total** | **54** | |

Those 29 collections produce roughly **25 taxonomy nodes** across sub and specific levels — fewer
than 29 because of merges (two Mahjong rows, three Romance/Reader rows), and more in places because
one collection can yield several specifics (`Hockey` alone becomes Hockey + Hockey Mom + Hockey
Girlfriend + Hockey Fan).

**The shape of the problem:** only 29 of 54 were ever markets. Nearly half of what is currently
called a "collection" is an aesthetic, a product type, a season, or a catch-all.

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

## 9. Decisions — resolved 2026-08-22

| # | Question | Kristen's call |
|---|---|---|
| 1 | Sports nesting | **By sport.** `Hobbies → Hockey → Hockey Mom`, `Hobbies → Football → Football Mom`. Rationale: a hockey mom and a football mom are different customers with different keyword universes. This overrides §37's `Sports Moms → Hockey Mom` shape; "Sports" survives as a secondary tag for cross-sport queries, not as a level. |
| 2 | Kids Chapter | **Dissolve** → `Hobbies → Reading → Kid Reader`. |
| 3 | Library & Academic | **`Professions → Librarian`.** |
| 4 | Animal Meme | **Pets × Funny crossover** — primary `Pets → Dog Owner`, secondary tag `Funny`, per the rule in §9.1. |
| 5 | Unhinged Apparel | **`Funny → Unhinged`.** |
| 6 | Design styles | **Secondary tags**, not a taxonomy level and not their own field. |
| 7 | Seasonal | **Its own broad niche** with Halloween/Christmas/etc. as sub-niches, *plus* a crossover overlay on the other nine. See §1.1. |
| 8 | Crossover rule | **Accepted** — primary path = buyer identity, everything else = secondary tag. See §9.1. |
| 9 | Seasonal crossover scope | **All nine** other broad niches can carry a seasonal overlay — no subset. |

### 9.1 The crossover rule (generalising #4) — ACCEPTED 2026-08-22

"Whichever is dominant" works, but it's a coin-flip on close calls and wouldn't be applied
consistently six months from now. One rule instead, which resolves every crossover the same way:

> **The primary path is always the buyer identity. Everything else becomes a secondary tag.**

So Animal Meme → primary `Pets → Dog Owner`, secondary tag `Funny`. The person buying it is a dog
owner; funny is *how* it's expressed, not *who* they are. Same rule gives Dog Humor Apparel the
same shape, and it matches §3's own definition of what a Specific Niche represents.

This is now the standing rule for every future crossover, not just Animal Meme.

### 9.2 On #6 — where design styles landed

Design Style, Aesthetic and Secondary Tag are all **tags**, distinguished by a `kind` column on the
existing `visual_tags` table (`'aesthetic' | 'design_style' | 'secondary'`). No new tagging system,
and §6's Design-Style-separate-from-Aesthetic split still holds — they're separate *kinds*, not
separate tables.

I'm leaving the table **named** `visual_tags` rather than renaming it to `tags`. It now holds
slightly more than visual language, so the name is imperfect, but renaming costs updates to three
junction tables and every hook that reads them, for zero functional gain. Easy to revisit; say the
word if the name will bother you.

**Still open, and I'd like more info when you have it:** the actual design-style vocabulary. §6
lists crest, collegiate, varsity, line drawing, bootleg, vintage character, patchwork, minimal
typography. If there are others you use regularly, they're worth seeding together in Phase 4 rather
than accumulating one at a time.

---

## 10. Phase 2c build list — FOR REVIEW, nothing created yet

28 new nodes. Derived from the §4 triage with the §9 decisions applied. The 10 broad
niches already exist; everything below hangs off them.

### 10.1 The consistency rule I applied

Kristen's decision #1 was "hockey then hockey mom" — the *sport* is the sub-niche and the
*person* is the specific. Applied uniformly, that generalises to:

> **Sub-niche = the domain or activity. Specific niche = the buyer identity within it.**

So Reading → Romance Reader, Hockey → Hockey Mom, Mahjong → Mahjong Player, Coffee →
Coffee Lover. Flagging it because it is an extrapolation from one answer, and it is what
makes Mahjong/Coffee two nodes each instead of one.

### 10.2 HOBBIES — 15 nodes

| Node | Level | From |
|---|---|---|
| Reading | sub | Reader Chapter · Reading Niche & Literary Interest |
| — Book Lover | specific | Book Lover Apparel · Bibliophile & Literary Enthusiast |
| — BookTok Reader | specific | BookTok & Modern Reader Culture |
| — Romance Reader | specific | Cozy Romance · Spicy & Dark Romance Readers |
| — Fantasy Reader | specific | Fantasy Reader |
| — Kid Reader | specific | Kids Chapter (decision #2) |
| Hockey | sub | Hockey |
| — Hockey Mom | specific | Hockey (products) |
| — Hockey Girlfriend | specific | Hockey (products — "Dibs on the Hockey Player") |
| — Hockey Fan | specific | Hockey (products) |
| Field Hockey | sub | Field Hockey Niche |
| Mahjong | sub | Mahjong Apparel & Gifts · Mahjong Products |
| — Mahjong Player | specific | as above |
| Coffee | sub | Coffee & Caffeine Themed |
| — Coffee Lover | specific | as above |

### 10.3 RELATIONSHIPS — 3 nodes

| Node | Level | From |
|---|---|---|
| Motherhood | sub | Mom Chapter — **TCC Extension** (§38) |
| — Elder Millennial Mom | specific | Elder Millennial Chapter (+ aesthetic `90s Nostalgia`) |
| Fatherhood | sub | Dad Gifts & Apparel |

### 10.4 PETS — 2 nodes

| Node | Level | From |
|---|---|---|
| Pet Owners | sub | Animal Lover Gifts |
| — Dog Owner | specific | Dog Humor Apparel · Animal Meme (+ secondary tag `Funny`, §9.1) |

### 10.5 PROFESSIONS — 2 nodes

| Node | Level | From |
|---|---|---|
| Teachers | sub | Teacher Gifts & Apparel |
| Librarians | sub | Library & Academic (decision #3) |

### 10.6 FUNNY — 1 node

| Node | Level | From |
|---|---|---|
| Unhinged | sub | Unhinged Apparel (decision #5) |

`Funny & Meme Graphic Tees` and `Religious & Faith Apparel` map onto the existing **Funny**
and **Christian** broad niches directly — no new node for either.

### 10.7 SEASONAL — 5 nodes

| Node | Level | From |
|---|---|---|
| Christmas | sub | Christmas & Holiday Gifts |
| Halloween | sub | Halloween Apparel |
| Back to School | sub | Back to School |
| 4th of July | sub | 4th of July & American Patriotic |
| Summer | sub | Summer Printables (overlay only — the collection itself is a Product Type) |

Only the five with existing work. Each also gets a `niche_timing_niches` link to its Phase 22
calendar entry, so it inherits real sourced launch windows. The calendar has ~25 more seasonal
entries (Valentines, Easter, Thanksgiving, Mother's/Father's Day, St. Patrick's, Galentines,
Hanukkah…) — see open question 4 below.

### 10.8 The 5 surviving Collections and their niche links

This is where the many-to-many earns its place — `Morally Gray Society` is genuinely both.

| Collection | Linked niches |
|---|---|
| Morally Gray Society | Romance Reader **+** Fantasy Reader |
| Spicy Books Social Club | Romance Reader |
| Annotation Club | Reading |
| Bookstore Weekend | Reading |
| Reading Rituals | Reading |

### 10.9 Open questions on this list

1. **Romantasy Reader** — the brief names it repeatedly (§7, §31) as a distinct specific niche,
   but no current collection, product or research session maps to it. Create it now as an empty
   branch, or wait until there is work in it?
2. **Motherhood has only one specific niche.** The 12 Mom Chapter products (Camp Mom, Comfortable
   Mama, 90s mom, New Chapter Same Chaos, Late Bloomers…) do not split into obvious separate buyer
   identities to me — they read as one audience in different moods. Leave Motherhood as a sub-niche
   with just Elder Millennial Mom under it, or do you see distinct identities there?
3. **Field Hockey has no specific niche.** Fine as a bare sub-niche for now?
4. **Seasonal depth** — the five above, or seed the calendar's full seasonal set so the crossover
   overlay has every holiday available from day one?
5. **The §10.1 rule** — confirm sub = domain, specific = identity, which is what produces
   Mahjong → Mahjong Player rather than a single Mahjong node.

---

## 11. The Seasonal branch — FOR REVIEW

Kristen approved seeding "the calendar's full seasonal set" (§9 decision 7 / §10.9 q4). But the
Phase 22 calendar is **not** a seasonal set — it is 69 mixed entries, and most are life events or
evergreen niches, not calendar-anchored seasons. Splitting them is a judgment call, so it is here
for review rather than in the migration.

Note also that the calendar's months are *listing/launch* months, not event months (Christmas sits
at 8–11), so the months cannot be used to detect seasonality automatically.

### 11.1 Tier A — unambiguous, propose creating (25)

Fixed-date holidays and annually recurring observances.

**Holidays** — Christmas · Christmas in July · Halloween · Thanksgiving · Easter · Valentines Day ·
Galentines · St. Patrick's Day · 4th of July · Hanukkah · Cinco De Mayo · Mardis Gras · Oktoberfest ·
Earth Day

**Awareness observances** — Black History Month · Pride Month · Breast Cancer Awareness ·
Autism Awareness · International Women's Day

**School calendar** — Back to School · 100th Day of School · Spring Break · Graduation

**Dated gifting** — Mother's Day · Father's Day

Plus **Summer**, which is not in the calendar at all but is needed for the Summer Printables
overlay — so 26 nodes in total.

### 11.2 Tier B — RESOLVED 2026-08-22: "should fall under the correct broad niches"

Kristen's call: these do **not** become Seasonal nodes. Each goes to whichever broad niche is
actually correct, and its calendar entry attaches as *timing guidance* via `niche_timing_niches`
rather than as a taxonomy node.

This is the mechanism §1.1 was designed for, working as intended: **a season is not a place in the
tree, it is a window attached to a node.** `Hobbies → Football` is the market; "Football Season" is
when to launch into it.

| Calendar entry | Becomes | New node? |
|---|---|---|
| Football Season | `Hobbies → Football` | yes |
| Soccer Season | `Hobbies → Soccer` | yes |
| Baseball/Softball Season | `Hobbies → Baseball` **+** `Hobbies → Softball` | yes ×2 — see q1 |
| Winter Sports | `Hobbies → Winter Sports` | yes — see q2 |
| Summer Sports | `Hobbies → Summer Sports` | yes — see q2 |
| Teacher Events | `Professions → Teachers` | **no** — already created in Phase 2c; timing link only |
| Principal Month | `Professions → Principals` | yes |
| Midwifery Week | `Professions → Midwives` | yes |
| Company Holiday Parties | `Seasonal → Company Holiday Parties` | yes — Seasonal *is* its correct broad niche |
| White Elephant/Gag Gifts | `Seasonal → White Elephant / Gag Gifts` | yes — see q3 |

The two Seasonal ones stay in Seasonal because that genuinely is their correct broad niche, and
their calendar windows differ from Christmas's own (Christmas launches 8–11, both of these 10–11),
so folding them into Christmas would lose real timing guidance.

**Three questions before this is built:**

1. **Baseball/Softball** — Taylor tracks them as one entry. Split into two sub-niches (different
   buyers, different keywords, per the same reasoning that separated hockey from football), or keep
   as one `Baseball/Softball` node?
2. **Winter Sports / Summer Sports** — these are *groupings*, not sports. Under the sport-first rule
   they sit awkwardly beside Hockey and Football. Create them as sub-niches anyway, skip them, or
   treat them as secondary tags across the individual sports?
3. **White Elephant / Gag Gifts** — Seasonal as proposed, or `Funny`? The humor is the product; the
   Christmas window is the timing. The §9.1 rule points at Funny with a Seasonal overlay, but there
   is no buyer *identity* here at all, which is where that rule stops helping.

### 11.3 Tier C — not seasonal, do NOT create here (33)

These belong to other broad niches or to no taxonomy at all. Listing them so the decision is
explicit rather than silent.

| Group | Entries | Where they actually belong |
|---|---|---|
| Wedding lifecycle | Bachelor · Bachelorette · Bridal Shower · Bridesmaid/Maid of Honor Proposal · Best Man Proposal · Engagement/Getting Married · Honeymoon/Just Married · Officiant Gifts · Godparent Proposal | **Wedding** broad niche |
| Baby / family lifecycle | Baby Shower · Babymoon · Gender Reveal · Maternity · Baptism · Infertility/IVF | **Relationships** |
| Birthday | Birthday Themes · Birthday Theme *(two label variants of one niche)* | **Birthday** broad niche |
| Life events | Divorce/Breakup · New Homeowner · General Retirement · Teacher Retirement · Graduation Party | Relationships / Professions |
| Travel & gatherings | Family Reunion · Family Vacation · Girls Trip | not date-fixed |
| Evergreen interests | Book Reading · Camping & Outdoors · Fitness/Health · Running Events · Geography · Zodiac · Pet Related · Hobbies · Professions | **Hobbies / Pets / Professions** — several already exist |

Nothing in Tier C is deleted or changed; these stay exactly as they are in `timing_niches`. This
only says they do not become Seasonal taxonomy nodes.

### 11.4 What each created node also gets

A `niche_timing_niches` link to its calendar entry, so the Seasonal branch inherits real sourced
launch windows from Taylor's calendar rather than a guessed date. That link is the whole reason
§1.1 put seasonal in the taxonomy instead of a separate seasons table.
