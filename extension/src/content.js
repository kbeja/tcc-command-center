// Purely reactive — does nothing until the popup explicitly asks. No data is
// read or sent anywhere on its own; it only replies to messages with
// whatever's currently on the page (selected text, or — on an Etsy listing —
// the page's own structured product data).

// Etsy listing pages carry a stable schema.org JSON-LD Product block (SEO
// metadata, far less likely to break on a redesign than scraping CSS
// classes). Tags aren't in it — Etsy stopped exposing the seller's actual
// tags publicly — so those stay unavailable here on purpose, not a bug.
// Etsy's JSON-LD text fields come HTML-entity-escaped (e.g. "Women&#39;s") —
// decode via a <textarea> roundtrip, which the browser's own HTML parser
// handles correctly and which (unlike a div) never executes the content as
// markup, so this stays safe for arbitrary third-party page text.
function decodeHtmlEntities(str) {
  if (!str) return str;
  const el = document.createElement('textarea');
  el.innerHTML = str;
  return el.value;
}

function extractProductJsonLd() {
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const parsed = JSON.parse(script.textContent);
      if (parsed?.['@type'] === 'Product') return parsed;
    } catch {
      // Malformed block — skip it, not our problem to fix.
    }
  }
  return null;
}

// Best-effort read of the Everbee extension's own injected stat bar, when
// that extension happens to be installed and active on this page. Everbee
// renders each stat as a ".item" div whose full text is "{Label} {Value}"
// concatenated with no separator — verified directly against a live listing.
// Absent entirely (empty object) when Everbee isn't running here, which is
// expected and fine, not an error.
function extractEverbeeStats() {
  const LABELS = ['Mo. Sales', 'Total Sales', 'Views', 'Conv. rate', 'List. Age', 'Favorites'];
  const stats = {};
  try {
    for (const item of document.querySelectorAll('.item')) {
      const text = item.textContent.replace(/\s+/g, ' ').trim();
      const label = LABELS.find(l => text.startsWith(l));
      if (label) stats[label] = text.slice(label.length).trim();
    }
  } catch {
    // Everbee changed something — fine, we just return whatever we got.
  }
  return stats;
}

// schema.org Product.image can be a bare URL string, an array of URL
// strings, or an ImageObject (or array of those) — take the first entry
// either way. Returns null rather than guessing when nothing usable is
// there; a missing image is a normal, expected case downstream (Phase 20
// analysis just stays unavailable for that listing), not an error.
//
// contentURL (capital URL) is what Etsy's own ImageObject markup actually
// uses, confirmed live against a real listing — schema.org's own spec
// defines the lowercase-r contentUrl, so checking both rather than trusting
// the spec's casing is deliberate, not redundant: a version that only
// checked `url`/`contentUrl` silently extracted null from every real Etsy
// page tested against.
function extractImageUrl(image) {
  const first = Array.isArray(image) ? image[0] : image;
  if (!first) return null;
  if (typeof first === 'string') return first;
  return first.url || first.contentUrl || first.contentURL || null;
}

function extractEtsyListing() {
  if (!/\/listing\/\d+/.test(location.pathname)) return { isEtsyListing: false };

  const product = extractProductJsonLd();

  let shopLink = null;
  try {
    const shopLinkEl = document.querySelector('a[href*="/shop/"]');
    if (shopLinkEl) {
      const u = new URL(shopLinkEl.href);
      shopLink = u.origin + u.pathname;
    }
  } catch {
    // Fine without it.
  }

  return {
    isEtsyListing: true,
    // origin+pathname only, no query string — the same listing reached via a
    // search click-through vs. a direct/shared link can carry different
    // tracking params, and product_link is what dedup is keyed on downstream.
    url: location.origin + location.pathname,
    title: decodeHtmlEntities(product?.name) || document.title || '',
    lowPrice: product?.offers?.lowPrice != null ? Number(product.offers.lowPrice) : null,
    highPrice: product?.offers?.highPrice != null ? Number(product.offers.highPrice) : null,
    shopName: decodeHtmlEntities(product?.brand?.name) || null,
    shopLink,
    category: decodeHtmlEntities(product?.category) || null,
    imageUrl: extractImageUrl(product?.image),
    ratingValue: product?.aggregateRating?.ratingValue != null ? Number(product.aggregateRating.ratingValue) : null,
    reviewCount: product?.aggregateRating?.reviewCount != null ? Number(product.aggregateRating.reviewCount) : null,
    everbeeStats: extractEverbeeStats(),
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'GET_SELECTION') {
    sendResponse({ selection: window.getSelection()?.toString() || '' });
  }
  if (message?.type === 'GET_ETSY_LISTING') {
    sendResponse(extractEtsyListing());
  }
  return true;
});
