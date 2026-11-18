/**
 * Standalone Guest Overlay Entry Point for AI Feedback Loop v2.0.0.
 * Bundled into `dist/guest/overlay.js` by `scripts/build.js` with inline CSS and Yjs.
 */
import cssText from './styles.css';
import * as Y from 'yjs';

(() => {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return;
  }

  // Yield to Host Chrome Extension if already active on this page.
  if (
    document.documentElement?.dataset?.aiflExtensionActive === '1' ||
    document.querySelector('#ai-feedback-loop-host[data-aifl-mode="host"]')
  ) {
    return;
  }

  if (window.__AIFL_GUEST_BOOTSTRAPPED__) {
    return;
  }
  window.__AIFL_GUEST_BOOTSTRAPPED__ = true;

  window.__AIFL_INLINE_CSS__ = cssText;
  window.__AIFL_GUEST_MODE__ = true;
  window.__AIFL_YJS__ = Y;

  require('./storage.js');
  require('./promptGenerator.js');
  require('./content.js');
})();
