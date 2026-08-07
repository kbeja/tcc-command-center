// Purely reactive — does nothing until the popup explicitly asks. No data is
// read or sent anywhere on its own; it only replies to a single message with
// whatever text is currently selected on the page.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'GET_SELECTION') {
    sendResponse({ selection: window.getSelection()?.toString() || '' });
  }
  return true;
});
