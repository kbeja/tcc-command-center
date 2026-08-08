// Purely reactive — does nothing until the popup explicitly asks. No data is
// read or sent anywhere on its own; it only replies to messages with
// whatever's currently on the page (selected text, or — on an Etsy listing —
// the page's own structured product data).

// Etsy listing pages carry a stable schema.org JSON-LD Product block (SEO
// metadata, far less likely to break on a redesign than scraping CSS
// classes). Tags aren't in it — Etsy stopped exposing the seller's actual
// tags publicly — so those stay unavailable here on purpose, not a bug.
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
    title: product?.name || document.title || '',
    lowPrice: product?.offers?.lowPrice != null ? Number(product.offers.lowPrice) : null,
    highPrice: product?.offers?.highPrice != null ? Number(product.offers.highPrice) : null,
    shopName: product?.brand?.name || null,
    shopLink,
    category: product?.category || null,
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
