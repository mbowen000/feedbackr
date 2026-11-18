/**
 * Background service worker for AI Feedback Loop v2.0.0.
 * Handles toolbar button clicks and keyboard shortcut commands across normal
 * and local collaboration tabs (e.g. localhost:4173 / localhost:5173).
 */

const BLOCKED_URL_RE = /^(chrome|chrome-extension|edge|about|devtools|view-source):/i;

async function toggleOnTab(tab) {
  if (!tab || !tab.id) return;
  if (tab.url && BLOCKED_URL_RE.test(tab.url)) {
    return;
  }

  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_FEEDBACK_LOOP' });
  } catch {
    // Content script may not be loaded yet (e.g. tab open before install/reload)
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: [
          'content/storage.js',
          'content/promptGenerator.js',
          'content/content.js'
        ]
      });
      await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_FEEDBACK_LOOP' });
    } catch (err) {
      console.warn('AI Feedback Loop: Cannot inject into this tab.', err);
    }
  }
}

chrome.action.onClicked.addListener((tab) => {
  toggleOnTab(tab);
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-feedback-loop') return;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      toggleOnTab(tab);
    }
  } catch (err) {
    console.warn('AI Feedback Loop: Failed to query active tab.', err);
  }
});
