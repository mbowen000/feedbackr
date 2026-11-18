/**
 * Background service worker for AI Feedback Loop.
 * Handles toolbar button clicks and keyboard shortcut commands.
 */

async function toggleOnTab(tab) {
  if (!tab || !tab.id) return;
  if (tab.url && /^(chrome|chrome-extension|edge|about):/i.test(tab.url)) {
    return;
  }

  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_FEEDBACK_LOOP' });
  } catch {
    // Content script may not be loaded yet (e.g. tab was open before install/reload)
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
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  toggleOnTab(tab);
});

