// The concept paste format is now a CONTRACT, not an implementation detail:
// ChatGPT is instructed to emit exactly this, so a silent parser change breaks
// design capture at the source with no error anywhere. Same house convention
// as the other lib tests — cover the deterministic function a real decision
// rests on, and pin the boundaries it must not cross.
import { describe, it, expect } from 'vitest';
import { parseConceptFields, looseTextMatch } from './ConceptChatImport.jsx';

const FULL = `--- TCC CONCEPT ---
Concept Name: Coquette Skeleton
Collection: Halloween 2026
Design Direction: Feminine Halloween skeleton artwork with coquette styling.
Target Customer: Women and teen shoppers who like feminine Halloween apparel.
Visual Style: Modern coquette Halloween; oversized bows.
Color Palette: Soft blush pink, dusty rose, cream.
Typography Notes: Elegant serif used sparingly.
Mood Keywords: coquette, feminine, spooky cute
Product Types: Comfort Colors 1717 tees, sweatshirts
Seasonal: Halloween 2026 — BUILD NOW
Emotional Trigger: Halloween, but make it pretty.
Source Spark: skeleton bow idea
Related Research: Halloween apparel
Kittl Prompt: Create a feminine Halloween apparel graphic
featuring a stylish illustrated skeleton with oversized bows.`;

describe('parseConceptFields — the documented format', () => {
  const p = parseConceptFields(FULL);

  it('reads every documented field', () => {
    expect(p.name).toBe('Coquette Skeleton');
    expect(p.collection_name).toBe('Halloween 2026');
    expect(p.design_direction).toMatch(/^Feminine Halloween skeleton/);
    expect(p.target_customer).toMatch(/^Women and teen/);
    expect(p.visual_style).toMatch(/^Modern coquette/);
    expect(p.color_palette).toBe('Soft blush pink, dusty rose, cream.');
    expect(p.typography_notes).toBe('Elegant serif used sparingly.');
    expect(p.seasonal_flag).toBe('Halloween 2026 — BUILD NOW');
    expect(p.emotional_trigger).toBe('Halloween, but make it pretty.');
    expect(p.source_spark_text).toBe('skeleton bow idea');
    expect(p.related_research_text).toBe('Halloween apparel');
  });

  it('splits the comma-separated lists', () => {
    expect(p.mood_keywords).toEqual(['coquette', 'feminine', 'spooky cute']);
    expect(p.product_types).toEqual(['Comfort Colors 1717 tees', 'sweatshirts']);
  });

  it('joins a Kittl Prompt that wraps across lines', () => {
    expect(p.kittl_prompt).toBe(
      'Create a feminine Halloween apparel graphic featuring a stylish illustrated skeleton with oversized bows.'
    );
  });

  it('keeps the original paste verbatim', () => {
    expect(p.raw_import).toBe(FULL);
  });
});

// ─── Regression: the alias fallback never fired ────────────────────────────
// mood_keywords was `getArray('Mood Keywords') || getArray('Mood')`. getArray
// returns [] when the label is absent and [] is TRUTHY, so the second form was
// unreachable: "Mood:" parsed to nothing at all, with no error. That is the
// worst possible failure for a format someone is told to write by hand.
describe('accepted aliases actually work', () => {
  it('accepts Mood: as an alias for Mood Keywords:', () => {
    const p = parseConceptFields('--- TCC CONCEPT ---\nConcept Name: X\nMood: cozy, warm');
    expect(p.mood_keywords).toEqual(['cozy', 'warm']);
  });

  it('accepts Products: as an alias for Product Types:', () => {
    const p = parseConceptFields('--- TCC CONCEPT ---\nConcept Name: X\nProducts: tee, mug');
    expect(p.product_types).toEqual(['tee', 'mug']);
  });

  it('prefers the primary label when both are present', () => {
    const p = parseConceptFields('--- TCC CONCEPT ---\nMood Keywords: a, b\nMood: c');
    expect(p.mood_keywords).toEqual(['a', 'b']);
  });

  it('accepts Name: and Typography: as aliases', () => {
    const p = parseConceptFields('--- TCC CONCEPT ---\nName: Y\nTypography: serif');
    expect(p.name).toBe('Y');
    expect(p.typography_notes).toBe('serif');
  });
});

describe('tolerances the format relies on', () => {
  it('is case-insensitive on labels', () => {
    expect(parseConceptFields('concept name: lower').name).toBe('lower');
  });

  it('strips a leading bullet, so a bulleted list still parses', () => {
    // The session-summary CONCEPTS section uses "- " bullets.
    expect(parseConceptFields('- Concept Name: Bulleted').name).toBe('Bulleted');
    expect(parseConceptFields('* Collection: Starred').collection_name).toBe('Starred');
  });

  it('returns empty values rather than throwing on an unrelated blob', () => {
    const p = parseConceptFields('just some prose with no labels at all');
    expect(p.name).toBe('');
    expect(p.mood_keywords).toEqual([]);
  });

  it('drops empty entries from a trailing comma', () => {
    expect(parseConceptFields('Mood Keywords: a, b,').mood_keywords).toEqual(['a', 'b']);
  });
});

// The Kittl Prompt terminator is any line shaped like "Capitalised Label:".
// Worth pinning because it decides where the prompt must sit in the block.
describe('Kittl Prompt boundaries', () => {
  it('stops at the next capitalised label', () => {
    const p = parseConceptFields(
      'Kittl Prompt: first part\nsecond part\nEmotional Trigger: not part of the prompt'
    );
    expect(p.kittl_prompt).toBe('first part second part');
    expect(p.emotional_trigger).toBe('not part of the prompt');
  });

  it('runs to the end of the block when it is last', () => {
    const p = parseConceptFields('Kittl Prompt: line one\nline two\nline three');
    expect(p.kittl_prompt).toBe('line one line two line three');
  });
});

describe('looseTextMatch', () => {
  it('matches in either direction', () => {
    expect(looseTextMatch('skeleton bow idea', 'skeleton bow')).toBe(true);
    expect(looseTextMatch('skeleton bow', 'skeleton bow idea')).toBe(true);
  });

  it('is safe on empty input', () => {
    expect(looseTextMatch('', 'x')).toBe(false);
    expect(looseTextMatch(null, null)).toBe(false);
  });
});
