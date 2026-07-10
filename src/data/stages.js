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
  'Idea': 'Ask three questions: Would Amanda buy this? Does it fit a TCC collection? Is there Everbee search volume? All yes → move to Research. Mixed → keep as Hot spark. All no → archive.',
  'Research': 'Open Everbee and search your product idea — note search volume, competition score, and top 5 keywords. Search Etsy to see what\'s selling and at what price. Check Pinterest for trend signals. Log your findings in a Research Session below.',
  'Validated': 'Open Kittl and start artwork using the collection\'s established color palette and typography. Export the final PNG at 4500×5400px, 300dpi when complete.',
  'Design Phase': 'Finalize artwork in Kittl. Export PNG at 4500×5400px. Upload to Printify, select product type and color variants, set your price, and save as a draft.',
  'SEO Ready': 'Open Everbee and search your primary keyword. Choose 1 primary keyword to lead your title (under 140 chars total) and 12 long-tail tags. Write a 3-paragraph Etsy description: what it is, who it\'s for, and product specs (material, fit, care). Add a Research Session below with your keyword list.',
  'Assets Ready': 'Generate listing images — open a fresh ChatGPT chat, upload your approved PNG, and generate one image at a time using the 90s Nostalgia style guide: warm butter yellows, faded denim, oversized comfort, retro serif typography. Follow the standard 10-slot listing order: Hero Lifestyle → Product Detail → Color Options → Product Benefits → Lifestyle Story → Flat Lay → Vibe → Gift → Size Guide → Care.',
  'Ready to Publish': 'Go to Printify, publish your draft to Etsy. Set the sale price, confirm the shipping profile, and add to the active sale. Check the live listing on Etsy to confirm images and title look correct.',
  'Live': 'Check Etsy Stats weekly: views, favorites, orders, conversion rate. Under 100 views at 30 days → update title and 2–3 tags. Conversion under 1% → swap the hero image. Flag for Reviewing once you have 30 days of data.',
  'Reviewing': 'Pull stats from Etsy Studio. 0 orders at 60 days → rewrite title and tags, or kill. Orders converting → consider a color variant or companion product. Consistent performer → duplicate and expand the line.',
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
