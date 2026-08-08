// No imports on purpose — this stays a plain script (not type:"module") for
// the simplest, most reliable service worker setup. Actual Supabase writes
// happen in the popup's own script (a normal page context); this file's job
// is just: register the two right-click menu items, and for images, do the
// one thing only a privileged extension context can do (a cross-origin fetch
// that ignores CORS) before handing off to the popup.

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'tcc-capture-selection',
    title: 'Capture "%s" to TCC',
    contexts: ['selection'],
  });
  chrome.contextMenus.create({
    id: 'tcc-capture-image',
    title: 'Save image to TCC Mood Board',
    contexts: ['image'],
  });
  chrome.contextMenus.create({
    id: 'tcc-capture-etsy-listing',
    title: 'Capture this Etsy listing to TCC',
    contexts: ['page'],
    documentUrlPatterns: ['*://*.etsy.com/listing/*'],
  });
});

function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000; // avoid call-stack limits on String.fromCharCode.apply for large images
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'tcc-capture-selection') {
    // info.selectionText is the text as of the click itself — more reliable
    // than having the popup re-query the page a moment later, since by then
    // the selection may no longer be readable the same way.
    await chrome.storage.local.set({
      pendingCapture: {
        type: 'text',
        text: info.selectionText || '',
        pageUrl: tab?.url || '',
        pageTitle: tab?.title || '',
      },
    });
    chrome.action.openPopup();
    return;
  }

  if (info.menuItemId === 'tcc-capture-image') {
    try {
      const response = await fetch(info.srcUrl);
      if (!response.ok) throw new Error(`Fetch failed (${response.status})`);
      const mediaType = response.headers.get('content-type') || 'image/png';
      const buffer = await response.arrayBuffer();
      await chrome.storage.local.set({
        pendingCapture: {
          type: 'image',
          base64: arrayBufferToBase64(buffer),
          mediaType,
          pageUrl: tab?.url || '',
          pageTitle: tab?.title || '',
        },
      });
    } catch (err) {
      await chrome.storage.local.set({
        pendingCapture: { type: 'image', error: err.message },
      });
    }
    chrome.action.openPopup();
    return;
  }

  if (info.menuItemId === 'tcc-capture-etsy-listing') {
    // No handoff needed — the popup queries the content script for the
    // listing data directly on mount, same as it does for text selection
    // when opened via the icon/shortcut.
    chrome.action.openPopup();
  }
});
