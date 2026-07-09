// Mom Chapter keyword bank
const momKeywords = {
  topKeywords: [
    'mom life svg', 'girl mom svg', 'boy mom svg', 'baseball mom svg', 'soccer mom svg',
    'tired but blessed', 'mama bear svg', 'football mom', 'cheer mom', 'dance mom',
    'cool mom svg', 'boy mom shirt', 'girl mom shirt', 'mom era', 'hot mess mom',
    'retro mom', '90s mom', 'rad mom', 'vintage mom', 'groovy mom',
    'mom mode svg', 'blessed mama', 'mama needs coffee', 'mom fuel',
    'raising good humans', 'motherhood svg', 'mama svg', 'mommy and me',
    'mothers day gift', 'birthday gift for mom',
  ],
  titleKeywords: [
    'mom life', 'mama bear', 'girl mom', 'boy mom', 'cool mom',
    'retro mom', '90s mom', 'mom era', 'rad mom', 'vintage mom',
  ],
  tagKeywords: [
    'mom svg', 'mama svg', 'mothers day svg', 'mom shirt svg', 'mom gift svg',
    'funny mom svg', 'mom life svg', 'blessed mama svg', 'tired mom svg',
  ],
};

// Reader Chapter keyword bank
const readerKeywords = {
  topKeywords: [
    'book lover svg', 'bookish svg', 'dark academia svg', 'reader svg', 'book nerd svg',
    'bibliophile svg', 'book club svg', 'reading svg', 'book aesthetic', 'booktok svg',
    'she reads books', 'read more books', 'book dragon', 'book worm svg',
    'dark academia aesthetic', 'cottage core reader', 'library svg', 'book shelf svg',
    'literary svg', 'fiction lover', 'romance reader svg', 'fantasy reader',
    'bookish gift', 'reader gift', 'book lover gift', 'librarian gift',
    'grey reading', 'cozy reader', 'autumn reading',
  ],
  titleKeywords: [
    'book lover', 'dark academia', 'bibliophile', 'reader aesthetic', 'bookish',
    'booktok', 'book dragon', 'literary', 'cozy reader', 'romance reader',
  ],
  tagKeywords: [
    'book lover svg', 'reader svg', 'bookish svg', 'dark academia svg', 'bibliophile svg',
    'book nerd svg', 'book club svg', 'book gift svg', 'reading svg',
  ],
};

// Style guides
const momStyleGuide = `90s DOPAMINE — MOM CHAPTER STYLE GUIDE

Aesthetic: Bold, retro, saturated. Think Lisa Frank meets vintage sportswear.
Colors: Electric brights on soft grounds — coral, teal, purple, yellow.
Typography: Bold rounded fonts, outlined text, varsity lettering.
Motifs: Stars, lightning bolts, smiley faces, sunbursts, cassette tapes, scrunchies.
Vibe: Nostalgic but modern. The mom who still knows how to party.

ALSO WORKS: Warm editorial style for heartfelt mom pieces (watercolor, script, neutral tones).
Match the aesthetic to the emotional trigger — fun vs. sentimental.`;

const readerStyleGuide = `DARK ACADEMIA — READER CHAPTER STYLE GUIDE

Aesthetic: Moody, intellectual, literary. Oxford library meets Tumblr 2013.
Colors: Deep navy, forest green, burgundy, warm cream, aged sepia.
Typography: Serif, editorial, slightly condensed. Old book vibes.
Motifs: Books, candles, quill pens, astronomical charts, botanical illustrations, arched windows.
Vibe: The reader who buys a new journal every month and has strong opinions about coffee.

NOTE: Test both "gray" and "grey" spellings in SEO — UK spelling "grey" outperforms in bookish niche.`;

// Listing prompts
const momPrompts = `MOM CHAPTER — LISTING PROMPTS

Title formula: [Emotional Hook] + [Product Type] + [Key Keyword]
Example: "Retro Cool Mom SVG | Girl Mom PNG | 90s Mom Shirt Design"

Description opening options:
- "Because moms who were cool in the 90s deserve a shirt that says so."
- "For the mom who still has the playlist, just needs the outfit."
- "This one's for the baseball moms who have seen every single game."

Tags strategy: Lead with 3 high-volume exact matches, then 6 supporting variants, then 4 long-tail.`;

const readerPrompts = `READER CHAPTER — LISTING PROMPTS

Title formula: [Aesthetic Tag] + [Product Type] + [Reader Identifier]
Example: "Dark Academia Book Lover SVG | Bibliophile PNG | Reader Shirt Design"

Description opening options:
- "For the reader who needs the whole library, the candle, and the sweater."
- "Dark academia aesthetic meets your Kindle wishlist."
- "She reads more than she sleeps. This is her shirt."

Tags strategy: Mix "book lover" + "reader" + "dark academia" + specific genre (romance reader, fantasy reader).`;

// Niche-specific style guides (keyed by lowercase niche name)
export const nicheStyleGuides = {
  '90s nostalgia': `90s NOSTALGIA — MOM CHAPTER STYLE GUIDE

Aesthetic: Warm, nostalgic, lived-in. Think butter yellows, faded denim, oversized comfort.
Colors: Buttermilk, warm white, washed denim, soft terracotta.
Typography: Retro serif, slightly worn, reminiscent of 90s brand lettering.
Motifs: Cassette tapes, butterfly clips, crimped hair, Saturday morning cartoons, after-school snacks.
Vibe: The mom who grew up in the 90s and is raising her kids the same way — intentionally, warmly, with a little chaos.`,
};

export const collectionKnowledge = {
  'Mom Chapter': {
    keywords: momKeywords,
    styleGuide: momStyleGuide,
    prompts: momPrompts,
    stageTips: {
      'SEO Ready': 'Check keyword-bank.md Mom Chapter section first. Everbee the top 5 title keywords.',
      'Assets Ready': 'Use 90s Dopamine or editorial warm style depending on emotional trigger.',
      'Design Phase': 'Consider whether this calls for bold/retro or warm/heartfelt aesthetic.',
    },
  },
  'Reader Chapter': {
    keywords: readerKeywords,
    styleGuide: readerStyleGuide,
    prompts: readerPrompts,
    stageTips: {
      'SEO Ready': 'Test British "grey" spelling. Check bookish keyword bank. Everbee "dark academia" cluster.',
      'Assets Ready': 'Use dark academia palette. Deep navy, cream, burgundy.',
      'Design Phase': 'Serif fonts, moody palette, literary motifs.',
    },
  },
};

export const COLLECTIONS = ['Mom Chapter', 'Reader Chapter', 'Kids Chapter', 'Tween Chapter', 'Dad Collection', 'Other'];
export const PORTFOLIO_LEVELS = ['Core', 'Growth', 'Seasonal', 'Experimental'];
