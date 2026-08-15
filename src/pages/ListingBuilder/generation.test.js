// Milestone C2 — generation.js had no dedicated test file through
// Milestones A/B/C1 despite being pure. Scoped narrowly to the two new
// functions added for version-history restore, same house convention as
// every other *.test.js in this codebase: unit tests for a deterministic
// module, not a mandate to backfill coverage for the rest of the file's
// existing untested functions.
import { describe, it, expect } from 'vitest';
import { buildOutputFromGeneration, extractHistoryDisplay } from './generation.js';

function generationRow(overrides) {
  return {
    title: 'Dancing Skeleton Sweatshirt',
    tags: ['skeleton', 'sweatshirt'],
    description: { opener: 'You didn\'t need a reason to love skeletons.', shipping: '' },
    image_prompts: [{ slot: '1', prompt: 'A skeleton dancing.' }],
    primary_search_intent: 'skeleton sweatshirt',
    primary_intent_status: 'supported',
    research_gaps: [{ severity: 'optional_test', message: 'Test tag ordering.' }],
    validation_status: 'ready_with_caution',
    validation_warnings: ['Shipping section uses only provided policy facts.'],
    research_sources_used: ['Everbee', 'Keyword Explore'],
    listing_generation_keywords: [
      { role: 'supporting', keyword_text: 'dancing skeleton sweatshirt', relevance_category: 'exact_product_intent' },
      { role: 'supporting', keyword_text: 'spooky skeleton dance', relevance_category: 'close_product_intent' },
      { role: 'excluded', keyword_text: 'chaos creator tee', exclusion_reason: 'Conflicts with product format (sweatshirt)' },
    ],
    ...overrides,
  };
}

describe('buildOutputFromGeneration', () => {
  it('reconstructs the full output shape from a complete row', () => {
    const output = buildOutputFromGeneration(generationRow({}));
    expect(output.title).toBe('Dancing Skeleton Sweatshirt');
    expect(output.tags).toEqual(['skeleton', 'sweatshirt']);
    expect(output.description).toEqual({ opener: 'You didn\'t need a reason to love skeletons.', shipping: '' });
    expect(output.image_prompts).toEqual([{ slot: '1', prompt: 'A skeleton dancing.' }]);
    expect(output.primary_search_intent).toBe('skeleton sweatshirt');
    expect(output.primary_intent_status).toBe('supported');
    expect(output.research_gaps).toEqual([{ severity: 'optional_test', message: 'Test tag ordering.' }]);
  });

  it('nests the two flat validation columns into validation.status/validation.warnings', () => {
    const output = buildOutputFromGeneration(generationRow({}));
    expect(output.validation).toEqual({
      status: 'ready_with_caution',
      warnings: ['Shipping section uses only provided policy facts.'],
    });
  });

  it('supporting_keywords: filters to role=supporting only, maps keyword_text to keyword, carries relevance_category', () => {
    const output = buildOutputFromGeneration(generationRow({}));
    expect(output.supporting_keywords).toEqual([
      { keyword: 'dancing skeleton sweatshirt', relevance_category: 'exact_product_intent' },
      { keyword: 'spooky skeleton dance', relevance_category: 'close_product_intent' },
    ]);
  });

  it('supporting_keywords entries never carry .confidence — an accepted gap, not an error', () => {
    const output = buildOutputFromGeneration(generationRow({}));
    expect(output.supporting_keywords[0].confidence).toBeUndefined();
  });

  it('excluded rows never leak into supporting_keywords', () => {
    const output = buildOutputFromGeneration(generationRow({}));
    expect(output.supporting_keywords.some(k => k.keyword === 'chaos creator tee')).toBe(false);
  });

  it('handles a row with no listing_generation_keywords at all', () => {
    const output = buildOutputFromGeneration(generationRow({ listing_generation_keywords: undefined }));
    expect(output.supporting_keywords).toEqual([]);
  });

  it('handles null/missing array-shaped fields without throwing', () => {
    const output = buildOutputFromGeneration(generationRow({ tags: null, image_prompts: null, research_gaps: null, validation_warnings: null }));
    expect(output.tags).toEqual([]);
    expect(output.image_prompts).toEqual([]);
    expect(output.research_gaps).toEqual([]);
    expect(output.validation.warnings).toEqual([]);
  });

  it('handles a null validation_status as null, not a fabricated default', () => {
    const output = buildOutputFromGeneration(generationRow({ validation_status: null }));
    expect(output.validation.status).toBeNull();
  });

  it('handles a null title/intent as empty string, matching a fresh generation\'s own sanitize step', () => {
    const output = buildOutputFromGeneration(generationRow({ title: null, primary_search_intent: null, primary_intent_status: null }));
    expect(output.title).toBe('');
    expect(output.primary_search_intent).toBe('');
    expect(output.primary_intent_status).toBe('');
  });
});

describe('extractHistoryDisplay', () => {
  it('extracts the three fields correctly from a complete row', () => {
    const history = extractHistoryDisplay(generationRow({}));
    expect(history.validationWarnings).toEqual(['Shipping section uses only provided policy facts.']);
    expect(history.researchSourcesUsed).toEqual(['Everbee', 'Keyword Explore']);
  });

  it('excludedKeywordsDisplay: filters to role=excluded only, maps keyword_text/exclusion_reason to keyword/reason', () => {
    const history = extractHistoryDisplay(generationRow({}));
    expect(history.excludedKeywordsDisplay).toEqual([
      { keyword: 'chaos creator tee', reason: 'Conflicts with product format (sweatshirt)' },
    ]);
  });

  it('supporting rows never leak into excludedKeywordsDisplay', () => {
    const history = extractHistoryDisplay(generationRow({}));
    expect(history.excludedKeywordsDisplay.some(k => k.keyword === 'dancing skeleton sweatshirt')).toBe(false);
  });

  it('does not touch primary_search_intent/primary_intent_status/research_gaps — those flow through buildOutputFromGeneration instead', () => {
    const history = extractHistoryDisplay(generationRow({}));
    expect(history.primarySearchIntent).toBeUndefined();
    expect(history.primaryIntentStatus).toBeUndefined();
    expect(history.researchGaps).toBeUndefined();
  });

  it('handles a row with no listing_generation_keywords at all', () => {
    const history = extractHistoryDisplay(generationRow({ listing_generation_keywords: undefined }));
    expect(history.excludedKeywordsDisplay).toEqual([]);
  });

  it('handles null/missing array-shaped fields without throwing', () => {
    const history = extractHistoryDisplay(generationRow({ validation_warnings: null, research_sources_used: null }));
    expect(history.validationWarnings).toEqual([]);
    expect(history.researchSourcesUsed).toEqual([]);
  });

  it('handles a completely null/undefined generation without throwing', () => {
    expect(extractHistoryDisplay(null)).toEqual({ validationWarnings: [], researchSourcesUsed: [], excludedKeywordsDisplay: [] });
    expect(extractHistoryDisplay(undefined)).toEqual({ validationWarnings: [], researchSourcesUsed: [], excludedKeywordsDisplay: [] });
  });
});
