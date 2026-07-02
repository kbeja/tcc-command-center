export const STAGES = [
  'Idea',
  'Research',
  'Validated',
  'Design Phase',
  'SEO Ready',
  'Assets Ready',
  'Ready to Publish',
  'Live',
  'Reviewing',
  'Paused',
  'Killed',
];

export const STAGE_NEXT_ACTIONS = {
  'Idea': 'Run Amanda filter — evaluate market fit and customer alignment',
  'Research': 'Complete research session — Everbee, Etsy search, Pinterest',
  'Validated': 'Move to Design Phase — open Kittl and start artwork',
  'Design Phase': 'Complete design, export PNG from Kittl',
  'SEO Ready': 'Run Everbee research — see keyword gaps above',
  'Assets Ready': 'Generate listing images — see prompts above',
  'Ready to Publish': 'Publish listing on Etsy, add to sale',
  'Live': 'Monitor for 30 days — check views, favorites, sales',
  'Reviewing': 'Review stats, decide: optimize, pause, or kill',
  'Paused': '—',
  'Killed': '—',
};

export const STAGE_DESCRIPTIONS = {
  'Idea': 'Captured, not evaluated',
  'Research': 'Being researched — Everbee, Etsy, Pinterest',
  'Validated': 'Passed Amanda lens + market evidence',
  'Design Phase': 'In Kittl, artwork in progress',
  'SEO Ready': 'Design done, keyword research needed',
  'Assets Ready': 'SEO done, listing images needed',
  'Ready to Publish': 'Everything done, not yet live',
  'Live': 'Published on Etsy',
  'Reviewing': 'Review due or active',
  'Paused': 'Intentionally stopped',
  'Killed': 'Rejected',
};

export const STAGE_PILL_CLASS = {
  'Idea': 'pill-idea',
  'Research': 'pill-research',
  'Validated': 'pill-validated',
  'Design Phase': 'pill-design',
  'SEO Ready': 'pill-seo',
  'Assets Ready': 'pill-assets',
  'Ready to Publish': 'pill-ready',
  'Live': 'pill-live',
  'Reviewing': 'pill-reviewing',
  'Paused': 'pill-paused',
  'Killed': 'pill-killed',
};

export const STAGE_ORDER = {
  'Idea': 0,
  'Research': 1,
  'Validated': 2,
  'Design Phase': 3,
  'SEO Ready': 4,
  'Assets Ready': 5,
  'Ready to Publish': 6,
  'Live': 7,
  'Reviewing': 8,
  'Paused': 9,
  'Killed': 10,
};
