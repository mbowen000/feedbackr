/**
 * Main Content Script for AI Feedback Loop v2.0.0.
 * Manages the Shadow DOM UI, element inspector, 3-tier pin anchoring,
 * live multiplayer cursors, Host Review Inbox drawer, threaded replies,
 * and clipboard/markdown export.
 */
(() => {
  const isGuestMode = Boolean(window.__AIFL_GUEST_MODE__);
  const hasExtensionRuntime = typeof chrome !== 'undefined' && Boolean(chrome.runtime?.id);

  // If Chrome Extension Host runs on a proxied localhost page, yield the DOM to Host Extension.
  if (!isGuestMode && hasExtensionRuntime) {
    document.documentElement.dataset.aiflExtensionActive = '1';
    document.dispatchEvent(new CustomEvent('aifl:extension-active'));
    const staleGuestHost = document.querySelector('#ai-feedback-loop-host[data-aifl-mode="guest"]');
    if (staleGuestHost) {
      staleGuestHost.remove();
    }
  } else if (isGuestMode && document.documentElement?.dataset?.aiflExtensionActive === '1') {
    return;
  }

  if (window.__AIFeedbackLoopLoaded) return;
  window.__AIFeedbackLoopLoaded = true;

  const state = {
    mounted: false,
    tornDown: false,
    toolbarVisible: false,
    inspecting: false,
    pinDropMode: 'element', // 'element' | 'free'
    ctrlHeld: false,
    lastMousePos: { x: 0, y: 0 },
    drawerOpen: false,
    connectPopoverOpen: false,
    comments: [],
    focusedCommentId: null,
    pendingPin: null, // { mode, element, context, clientX, clientY, commentId }
    filterScope: 'all', // 'all' | 'screen'
    statusFilter: 'all', // 'all' | 'pending' | 'approved' | 'resolved'
    showResolvedPins: false,
    promptMode: 'standard', // 'standard' | 'compact'
    selectedPinIds: new Set(),
    confirmingClearToolbar: false,
    confirmingClearDrawer: false,
    hoveredElement: null,
    lastRouteKey: window.AIFLStorage ? window.AIFLStorage.getRouteKey() : '/'
  };

  let hostEl = null;
  let shadowRoot = null;
  let ui = {};
  let rafId = null;
  let hmrReanchorTimer = null;
  let clearConfirmTimer = null;
  let focusHighlightTimer = null;
  let toastTimer = null;
  let cursorCleanupTimer = null;
  let mutationObserver = null;

  // Map of comment.id -> live DOM element cache
  const elementCache = new Map();
  // Map of clientId -> { clientId, author, cursor, updatedAt }
  const peerCursors = new Map();
  // Unsent reply drafts keyed by comment.id so live sync re-renders never wipe typing
  const replyDrafts = new Map();
  // Storage listener unsubscribes
  const unsubscribes = [];

  function getSession() {
    return window.AIFLStorage
      ? window.AIFLStorage.getSessionState()
      : {
          connected: false,
          connecting: false,
          mode: 'standalone',
          role: 'standalone',
          author: { id: 'host_local', name: 'Host', role: 'host', color: '#6366f1' },
          peers: [],
          serverUrl: '',
          guestName: '',
          hasHostToken: false,
          lastError: null
        };
  }

  /**
   * Tears down guest overlay cleanly if Chrome Extension Host takes over the page.
   */
  function teardownGuestOverlay() {
    if (!isGuestMode || state.tornDown) return;
    state.tornDown = true;
    try {
      window.AIFLStorage?.disconnectLiveSession();
    } catch {
      // Ignore
    }
    if (mutationObserver) {
      mutationObserver.disconnect();
      mutationObserver = null;
    }
    clearInterval(cursorCleanupTimer);
    clearTimeout(hmrReanchorTimer);
    unsubscribes.forEach((fn) => fn());
    unsubscribes.length = 0;

    window.removeEventListener('mousemove', onPageMouseMove, true);
    window.removeEventListener('click', onPageClick, true);
    window.removeEventListener('keydown', onPageKeyDown, true);
    window.removeEventListener('keyup', onPageKeyUp, true);
    window.removeEventListener('scroll', schedulePinPositionUpdate, true);
    window.removeEventListener('resize', schedulePinPositionUpdate, true);
    window.removeEventListener('hashchange', onRouteOrDomChange);
    window.removeEventListener('popstate', onRouteOrDomChange);

    if (hostEl && hostEl.parentNode) {
      hostEl.remove();
    }
    state.mounted = false;
  }

  if (isGuestMode) {
    document.addEventListener('aifl:extension-active', teardownGuestOverlay, { once: true });
  }

  /**
   * Loads CSS for Shadow DOM from inline bundle, chrome extension URL, or /__collab/styles.css.
   */
  async function loadStylesText() {
    if (typeof window.__AIFL_INLINE_CSS__ === 'string' && window.__AIFL_INLINE_CSS__.length > 0) {
      return window.__AIFL_INLINE_CSS__;
    }
    if (typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.getURL === 'function') {
      try {
        const cssUrl = chrome.runtime.getURL('content/styles.css');
        const res = await fetch(cssUrl);
        if (res.ok) return await res.text();
      } catch (err) {
        console.warn('AI Feedback Loop: Could not fetch extension styles.css', err);
      }
    }
    try {
      const res = await fetch('/__collab/styles.css');
      if (res.ok) return await res.text();
    } catch (err) {
      console.warn('AI Feedback Loop: Could not fetch /__collab/styles.css', err);
    }
    return '';
  }

  /**
   * Mounts the isolated Shadow DOM container and loads styles.
   */
  async function ensureMounted() {
    if (state.tornDown) return;
    if (state.mounted && hostEl && document.documentElement.contains(hostEl)) {
      return;
    }

    hostEl = document.createElement('div');
    hostEl.id = 'ai-feedback-loop-host';
    hostEl.dataset.aiflMode = isGuestMode ? 'guest' : 'host';
    hostEl.style.cssText =
      'all: initial !important; position: fixed !important; inset: 0 !important; pointer-events: none !important; z-index: 2147483640 !important;';
    shadowRoot = hostEl.attachShadow({ mode: 'open' });

    if (document.head && !document.getElementById('aifl-font-inter')) {
      const fontLink = document.createElement('link');
      fontLink.id = 'aifl-font-inter';
      fontLink.rel = 'stylesheet';
      fontLink.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap';
      document.head.appendChild(fontLink);
    }

    const cssText = await loadStylesText();
    if (state.tornDown) return;

    const styleEl = document.createElement('style');
    styleEl.textContent = cssText;
    shadowRoot.appendChild(styleEl);

    const container = document.createElement('div');
    container.className = 'aifl-layer';
    container.innerHTML = `
      <!-- Live Multiplayer Cursors -->
      <div class="aifl-cursors-container" id="aifl-cursors-container"></div>

      <!-- Hover Inspector Box -->
      <div class="aifl-hover-box" id="aifl-hover-box">
        <div class="aifl-hover-label" id="aifl-hover-label"></div>
      </div>

      <!-- Free-Drop Dangling Pin Cursor (Hold Ctrl while picking) -->
      <div class="aifl-free-cursor" id="aifl-free-cursor">
        <div class="aifl-dangling-shadow"></div>
        <div class="aifl-dangling-pin"><span id="aifl-dangling-num">1</span></div>
        <div class="aifl-free-label" id="aifl-free-label"></div>
      </div>

      <!-- Focused Element Pulse Highlight -->
      <div class="aifl-focus-box" id="aifl-focus-box"></div>

      <!-- Pin Bubbles Container -->
      <div class="aifl-pins-container" id="aifl-pins-container"></div>

      <!-- Floating Comment Prompt Popover (Create / Edit Pin, Draggable) -->
      <div class="aifl-popover" id="aifl-popover">
        <div class="aifl-popover-header" id="aifl-popover-header" title="Drag to move prompt">
          <div class="aifl-popover-header-left">
            <span class="aifl-popover-badge" id="aifl-popover-badge">New Pin</span>
            <span class="aifl-popover-target" id="aifl-popover-target">element</span>
          </div>
          <button class="aifl-popover-close" id="aifl-popover-close" title="Close (ESC)">×</button>
        </div>
        <textarea
          class="aifl-popover-textarea"
          id="aifl-popover-textarea"
          placeholder="What should the AI agent change here? (e.g. 'Increase font size to 20px', 'Add Spanish translation')"
        ></textarea>
        <div class="aifl-popover-footer">
          <span class="aifl-popover-hint">Ctrl/⌘ + Enter to save</span>
          <div class="aifl-popover-actions">
            <button class="aifl-btn" id="aifl-popover-cancel">Cancel</button>
            <button class="aifl-btn aifl-btn-primary" id="aifl-popover-save">Save Pin</button>
          </div>
        </div>
        <div class="aifl-gripper-br" id="aifl-popover-gripper" title="Drag to move prompt">
          <svg viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
            <circle cx="9.5" cy="3.5" r="1.3"></circle>
            <circle cx="9.5" cy="9.5" r="1.3"></circle>
            <circle cx="3.5" cy="9.5" r="1.3"></circle>
          </svg>
        </div>
      </div>

      <!-- Live Session / Identity Popover -->
      <div class="aifl-connect-popover" id="aifl-connect-popover">
        <div class="aifl-connect-header">
          <span>Live Collaboration</span>
          <button class="aifl-popover-close" id="aifl-connect-close" title="Close">×</button>
        </div>
        <div class="aifl-connect-sub" id="aifl-connect-status-text">Local standalone mode</div>
        <div class="aifl-peers-list" id="aifl-peers-list"></div>

        <div class="aifl-field-group">
          <label class="aifl-field-label" for="aifl-name-input">Your Display Name</label>
          <div class="aifl-input-row">
            <input class="aifl-input" id="aifl-name-input" type="text" placeholder="Display name" />
            <button class="aifl-btn aifl-btn-sm" id="aifl-name-save">Save</button>
          </div>
        </div>

        <div id="aifl-manual-connect-group" style="display: flex; flex-direction: column; gap: 8px;">
          <div class="aifl-field-group">
            <label class="aifl-field-label" for="aifl-server-url-input">Collab Server URL</label>
            <input class="aifl-input" id="aifl-server-url-input" type="text" placeholder="http://127.0.0.1:4173" />
          </div>
          <div class="aifl-field-group">
            <label class="aifl-field-label" for="aifl-host-token-input">Host Token (optional)</label>
            <input class="aifl-input" id="aifl-host-token-input" type="password" placeholder="Paste hostToken for Host controls" />
          </div>
          <div class="aifl-input-row" style="justify-content: flex-end;">
            <button class="aifl-btn aifl-btn-sm aifl-btn-danger" id="aifl-disconnect-btn" style="display: none;">Disconnect</button>
            <button class="aifl-btn aifl-btn-sm aifl-btn-primary" id="aifl-connect-btn">Connect</button>
          </div>
        </div>
      </div>

      <!-- Floating Control Bar -->
      <div class="aifl-toolbar hidden" id="aifl-toolbar">
        <div class="aifl-drag-handle" id="aifl-drag-handle" title="Drag to reposition">
          <span class="aifl-brand-dot"></span>
          <span>AI Feedback Loop</span>
        </div>

        <button class="aifl-btn aifl-live-pill" id="aifl-live-pill" title="Live session status, display name, and connection">
          <span class="aifl-live-dot"></span>
          <span id="aifl-live-pill-label">Local</span>
        </button>

        <button class="aifl-btn aifl-btn-primary" id="aifl-btn-add" title="Hover elements to highlight (hold Ctrl for free-drop pin)">
          <span id="aifl-btn-add-label">+ Add Comment</span>
        </button>

        <button class="aifl-btn" id="aifl-btn-drawer" title="Open comments drawer">
          <span>Inbox</span>
          <span class="aifl-badge" id="aifl-toolbar-count">0</span>
        </button>

        <button class="aifl-btn aifl-btn-toggle" id="aifl-btn-show-resolved" title="Show or hide resolved pins on the page" aria-pressed="false">
          <span class="aifl-toggle-dot"></span>
          <span>Show Resolved Pins</span>
        </button>

        <button class="aifl-btn" id="aifl-btn-copy" title="Copy visible comments as an AI prompt">
          <span id="aifl-btn-copy-label">Copy Prompt</span>
        </button>

        <button class="aifl-btn aifl-btn-danger" id="aifl-btn-clear" title="Clear all saved comments">
          <span id="aifl-btn-clear-label">Clear</span>
        </button>

        <button class="aifl-btn aifl-btn-icon" id="aifl-btn-close" title="Hide floating controls (Alt+Shift+F)">✕</button>

        <div class="aifl-gripper-br" id="aifl-toolbar-gripper" title="Drag to move controls" style="right: 3px; bottom: 2px; width: 16px; height: 16px; padding: 2px;">
          <svg viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
            <circle cx="9.5" cy="3.5" r="1.3"></circle>
            <circle cx="9.5" cy="9.5" r="1.3"></circle>
            <circle cx="3.5" cy="9.5" r="1.3"></circle>
          </svg>
        </div>
      </div>

      <!-- Right-Hand Slide-Out Drawer (Host Review Inbox / Guest Feed) -->
      <aside class="aifl-drawer" id="aifl-drawer">
        <div class="aifl-drawer-header">
          <div class="aifl-drawer-title-row">
            <h2 class="aifl-drawer-title">
              <span class="aifl-brand-dot"></span>
              <span>Review Inbox</span>
              <span class="aifl-badge" id="aifl-drawer-count">0</span>
            </h2>
            <button class="aifl-btn aifl-btn-icon" id="aifl-drawer-close" title="Close drawer">✕</button>
          </div>

          <div class="aifl-drawer-controls-row">
            <div class="aifl-tabs">
              <button class="aifl-tab active" id="aifl-tab-all">All Screens</button>
              <button class="aifl-tab" id="aifl-tab-screen">This Screen</button>
            </div>

            <div class="aifl-tabs">
              <button class="aifl-tab active" id="aifl-mode-standard" title="Includes computed styles and full context">Full Context</button>
              <button class="aifl-tab" id="aifl-mode-compact" title="Compact token-efficient prompt">Compact</button>
            </div>
          </div>

          <div class="aifl-status-filters" id="aifl-status-filters">
            <button class="aifl-status-tab active" data-status="all" id="aifl-status-all">All (0)</button>
            <button class="aifl-status-tab" data-status="pending" id="aifl-status-pending">Pending (0)</button>
            <button class="aifl-status-tab" data-status="approved" id="aifl-status-approved">Approved (0)</button>
            <button class="aifl-status-tab" data-status="resolved" id="aifl-status-resolved">Resolved (0)</button>
          </div>
        </div>

        <div class="aifl-batch-bar" id="aifl-batch-bar">
          <div class="aifl-batch-left">
            <button class="aifl-btn aifl-btn-sm" id="aifl-select-pending">Select Pending</button>
            <span id="aifl-selected-count" style="font-size: 11px; color: #94a3b8;">0 selected</span>
          </div>
          <div class="aifl-batch-actions">
            <select class="aifl-agent-select" id="aifl-agent-select" title="Headless CLI agent provider">
              <option value="agy">Antigravity (agy)</option>
              <option value="gemini">Gemini CLI</option>
              <option value="codex">Codex CLI</option>
              <option value="claude">Claude CLI</option>
            </select>
            <button class="aifl-btn aifl-btn-sm" id="aifl-batch-copy">Copy Selected</button>
            <button class="aifl-btn aifl-btn-primary aifl-btn-sm" id="aifl-batch-run">Run Agent on Selected</button>
          </div>
        </div>

        <div class="aifl-drawer-body" id="aifl-drawer-body"></div>

        <div class="aifl-drawer-footer">
          <details class="aifl-preview-details" id="aifl-preview-details">
            <summary class="aifl-preview-summary">
              <span>Preview Generated AI Agent Prompt</span>
              <span style="font-size: 10px; color: #818cf8;">Markdown ▾</span>
            </summary>
            <pre class="aifl-preview-pre" id="aifl-preview-pre"></pre>
          </details>

          <div class="aifl-footer-primary-row">
            <button class="aifl-btn aifl-btn-primary" id="aifl-drawer-copy">
              Copy All as AI Prompt
            </button>
          </div>

          <div class="aifl-footer-secondary-row">
            <button class="aifl-btn" id="aifl-drawer-export-md" title="Download prompt as a .md file">
              Download .md
            </button>
            <button class="aifl-btn aifl-btn-danger" id="aifl-drawer-clear">
              Clear All Comments
            </button>
          </div>
        </div>
      </aside>

      <!-- Toast Notification -->
      <div class="aifl-toast" id="aifl-toast"></div>
    `;

    shadowRoot.appendChild(container);
    document.documentElement.appendChild(hostEl);

    ui = {
      cursorsContainer: shadowRoot.getElementById('aifl-cursors-container'),
      hoverBox: shadowRoot.getElementById('aifl-hover-box'),
      hoverLabel: shadowRoot.getElementById('aifl-hover-label'),
      freeCursor: shadowRoot.getElementById('aifl-free-cursor'),
      danglingNum: shadowRoot.getElementById('aifl-dangling-num'),
      freeLabel: shadowRoot.getElementById('aifl-free-label'),
      focusBox: shadowRoot.getElementById('aifl-focus-box'),
      pinsContainer: shadowRoot.getElementById('aifl-pins-container'),
      popover: shadowRoot.getElementById('aifl-popover'),
      popoverHeader: shadowRoot.getElementById('aifl-popover-header'),
      popoverBadge: shadowRoot.getElementById('aifl-popover-badge'),
      popoverTarget: shadowRoot.getElementById('aifl-popover-target'),
      popoverClose: shadowRoot.getElementById('aifl-popover-close'),
      popoverTextarea: shadowRoot.getElementById('aifl-popover-textarea'),
      popoverCancel: shadowRoot.getElementById('aifl-popover-cancel'),
      popoverSave: shadowRoot.getElementById('aifl-popover-save'),
      popoverGripper: shadowRoot.getElementById('aifl-popover-gripper'),
      connectPopover: shadowRoot.getElementById('aifl-connect-popover'),
      connectClose: shadowRoot.getElementById('aifl-connect-close'),
      connectStatusText: shadowRoot.getElementById('aifl-connect-status-text'),
      peersList: shadowRoot.getElementById('aifl-peers-list'),
      nameInput: shadowRoot.getElementById('aifl-name-input'),
      nameSave: shadowRoot.getElementById('aifl-name-save'),
      manualConnectGroup: shadowRoot.getElementById('aifl-manual-connect-group'),
      serverUrlInput: shadowRoot.getElementById('aifl-server-url-input'),
      hostTokenInput: shadowRoot.getElementById('aifl-host-token-input'),
      connectBtn: shadowRoot.getElementById('aifl-connect-btn'),
      disconnectBtn: shadowRoot.getElementById('aifl-disconnect-btn'),
      toolbar: shadowRoot.getElementById('aifl-toolbar'),
      dragHandle: shadowRoot.getElementById('aifl-drag-handle'),
      toolbarGripper: shadowRoot.getElementById('aifl-toolbar-gripper'),
      livePill: shadowRoot.getElementById('aifl-live-pill'),
      livePillLabel: shadowRoot.getElementById('aifl-live-pill-label'),
      btnAdd: shadowRoot.getElementById('aifl-btn-add'),
      btnAddLabel: shadowRoot.getElementById('aifl-btn-add-label'),
      btnDrawer: shadowRoot.getElementById('aifl-btn-drawer'),
      toolbarCount: shadowRoot.getElementById('aifl-toolbar-count'),
      btnShowResolved: shadowRoot.getElementById('aifl-btn-show-resolved'),
      btnCopy: shadowRoot.getElementById('aifl-btn-copy'),
      btnCopyLabel: shadowRoot.getElementById('aifl-btn-copy-label'),
      btnClear: shadowRoot.getElementById('aifl-btn-clear'),
      btnClearLabel: shadowRoot.getElementById('aifl-btn-clear-label'),
      btnClose: shadowRoot.getElementById('aifl-btn-close'),
      drawer: shadowRoot.getElementById('aifl-drawer'),
      drawerCount: shadowRoot.getElementById('aifl-drawer-count'),
      drawerClose: shadowRoot.getElementById('aifl-drawer-close'),
      tabAll: shadowRoot.getElementById('aifl-tab-all'),
      tabScreen: shadowRoot.getElementById('aifl-tab-screen'),
      modeStandard: shadowRoot.getElementById('aifl-mode-standard'),
      modeCompact: shadowRoot.getElementById('aifl-mode-compact'),
      statusAll: shadowRoot.getElementById('aifl-status-all'),
      statusPending: shadowRoot.getElementById('aifl-status-pending'),
      statusApproved: shadowRoot.getElementById('aifl-status-approved'),
      statusResolved: shadowRoot.getElementById('aifl-status-resolved'),
      batchBar: shadowRoot.getElementById('aifl-batch-bar'),
      selectPendingBtn: shadowRoot.getElementById('aifl-select-pending'),
      selectedCountEl: shadowRoot.getElementById('aifl-selected-count'),
      agentSelect: shadowRoot.getElementById('aifl-agent-select'),
      batchCopyBtn: shadowRoot.getElementById('aifl-batch-copy'),
      batchRunBtn: shadowRoot.getElementById('aifl-batch-run'),
      drawerBody: shadowRoot.getElementById('aifl-drawer-body'),
      previewPre: shadowRoot.getElementById('aifl-preview-pre'),
      drawerCopy: shadowRoot.getElementById('aifl-drawer-copy'),
      drawerExportMd: shadowRoot.getElementById('aifl-drawer-export-md'),
      drawerClear: shadowRoot.getElementById('aifl-drawer-clear'),
      toast: shadowRoot.getElementById('aifl-toast')
    };

    bindUIEvents();
    state.mounted = true;
    renderLiveStatus();
  }

  function scheduleHmrReanchor() {
    if (!state.mounted || state.tornDown) return;
    clearTimeout(hmrReanchorTimer);
    hmrReanchorTimer = setTimeout(() => {
      hmrReanchorTimer = null;
      if (state.tornDown) return;
      const currentRoute = window.AIFLStorage.getRouteKey();
      elementCache.clear();
      if (currentRoute !== state.lastRouteKey) {
        state.lastRouteKey = currentRoute;
        renderAll();
        return;
      }
      updatePinPositions();
      if (state.drawerOpen) {
        renderDrawer();
      }
    }, 150);
  }

  /**
   * Binds event listeners inside the Shadow DOM and page-level listeners.
   */
  function bindUIEvents() {
    setupFloatingDrag([ui.dragHandle, ui.toolbarGripper], ui.toolbar);
    setupFloatingDrag([ui.popoverGripper, ui.popoverHeader], ui.popover);

    // Live session / identity popover controls
    ui.livePill.addEventListener('click', () => {
      setConnectPopoverOpen(!state.connectPopoverOpen);
    });
    ui.connectClose.addEventListener('click', () => setConnectPopoverOpen(false));

    [ui.nameInput, ui.serverUrlInput, ui.hostTokenInput].forEach((input) => {
      input.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Escape') {
          setConnectPopoverOpen(false);
        } else if (e.key === 'Enter' && input === ui.nameInput) {
          saveDisplayName();
        }
      });
    });

    ui.nameSave.addEventListener('click', saveDisplayName);

    ui.connectBtn.addEventListener('click', async () => {
      const serverUrl = ui.serverUrlInput.value.trim() || 'http://127.0.0.1:4173';
      const hostToken = ui.hostTokenInput.value.trim();
      const authorName = ui.nameInput.value.trim();
      const result = await window.AIFLStorage.connectLiveSession({
        serverUrl,
        hostToken,
        authorName
      });
      renderLiveStatus();
      if (result.connected) {
        showToast(`Connected as ${result.role}`);
      } else {
        showToast('Could not connect to collab server');
      }
    });

    ui.disconnectBtn.addEventListener('click', async () => {
      window.AIFLStorage.disconnectLiveSession();
      state.comments = await window.AIFLStorage.loadComments();
      peerCursors.clear();
      renderPeerCursors();
      renderAll();
      showToast('Switched to local mode');
    });

    // Add Comment button
    ui.btnAdd.addEventListener('click', () => {
      setInspecting(!state.inspecting);
    });

    // Toggle Drawer button
    ui.btnDrawer.addEventListener('click', () => {
      setDrawerOpen(!state.drawerOpen);
    });

    // Toggle Show Resolved Pins button
    ui.btnShowResolved.addEventListener('click', () => {
      state.showResolvedPins = !state.showResolvedPins;
      ui.btnShowResolved.classList.toggle('active', state.showResolvedPins);
      ui.btnShowResolved.setAttribute('aria-pressed', String(state.showResolvedPins));
      renderPins();
    });

    // Copy Prompt button in toolbar
    ui.btnCopy.addEventListener('click', () => {
      copyPromptToClipboard(getVisibleScopeComments());
    });

    // Clear All button in toolbar (with inline confirm)
    ui.btnClear.addEventListener('click', async () => {
      if (state.comments.length === 0) {
        showToast('No comments to clear');
        return;
      }
      if (!state.confirmingClearToolbar) {
        state.confirmingClearToolbar = true;
        ui.btnClear.classList.add('aifl-btn-confirm');
        ui.btnClearLabel.textContent = `Confirm Clear (${state.comments.length})?`;
        clearTimeout(clearConfirmTimer);
        clearConfirmTimer = setTimeout(() => {
          resetClearConfirmState();
        }, 3500);
        return;
      }
      resetClearConfirmState();
      await handleClearAll();
    });

    // Close toolbar button
    ui.btnClose.addEventListener('click', () => {
      setInspecting(false);
      closePopover();
      setConnectPopoverOpen(false);
      setDrawerOpen(false);
      setToolbarVisible(false);
    });

    // Quick-Add Popover events
    ui.popoverClose.addEventListener('click', closePopover);
    ui.popoverCancel.addEventListener('click', closePopover);
    ui.popoverSave.addEventListener('click', savePendingPin);
    ui.popoverTextarea.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        savePendingPin();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closePopover();
      }
    });

    // Drawer events
    ui.drawerClose.addEventListener('click', () => setDrawerOpen(false));

    ui.tabAll.addEventListener('click', () => {
      state.filterScope = 'all';
      renderDrawer();
    });

    ui.tabScreen.addEventListener('click', () => {
      state.filterScope = 'screen';
      renderDrawer();
    });

    ui.modeStandard.addEventListener('click', () => {
      state.promptMode = 'standard';
      renderDrawer();
    });

    ui.modeCompact.addEventListener('click', () => {
      state.promptMode = 'compact';
      renderDrawer();
    });

    [ui.statusAll, ui.statusPending, ui.statusApproved, ui.statusResolved].forEach((btn) => {
      btn.addEventListener('click', () => {
        state.statusFilter = btn.dataset.status || 'all';
        renderDrawer();
      });
    });

    // Batch triage events
    ui.selectPendingBtn.addEventListener('click', () => {
      const visiblePending = getFilteredComments().filter((c) => (c.status || 'pending') === 'pending');
      if (visiblePending.length === 0) {
        showToast('No pending pins in current view');
        return;
      }
      const allAlreadySelected = visiblePending.every((c) => state.selectedPinIds.has(c.id));
      if (allAlreadySelected) {
        visiblePending.forEach((c) => state.selectedPinIds.delete(c.id));
      } else {
        visiblePending.forEach((c) => state.selectedPinIds.add(c.id));
      }
      renderDrawer();
    });

    ui.batchCopyBtn.addEventListener('click', () => {
      const filtered = getFilteredComments();
      const checked = filtered.filter((c) => state.selectedPinIds.has(c.id));
      const targets = checked.length > 0 ? checked : filtered;
      copyPromptToClipboard(targets);
    });

    ui.batchRunBtn.addEventListener('click', handleRunAgentOnSelected);

    if (ui.agentSelect) {
      ui.agentSelect.addEventListener('change', () => {
        ui.agentSelect.dataset.userChanged = '1';
      });
    }

    ui.drawerCopy.addEventListener('click', () => {
      copyPromptToClipboard(getFilteredComments());
    });

    ui.drawerExportMd.addEventListener('click', () => {
      downloadPromptMarkdown(getFilteredComments());
    });

    ui.drawerClear.addEventListener('click', async () => {
      if (state.comments.length === 0) {
        showToast('No comments to clear');
        return;
      }
      if (!state.confirmingClearDrawer) {
        state.confirmingClearDrawer = true;
        ui.drawerClear.classList.add('aifl-btn-confirm');
        ui.drawerClear.textContent = `Confirm Clear All (${state.comments.length})?`;
        clearTimeout(clearConfirmTimer);
        clearConfirmTimer = setTimeout(() => {
          resetClearConfirmState();
        }, 3500);
        return;
      }
      resetClearConfirmState();
      await handleClearAll();
    });

    // Page-level mousemove, click & key events
    window.addEventListener('mousemove', onPageMouseMove, true);
    window.addEventListener('click', onPageClick, true);
    window.addEventListener('keydown', onPageKeyDown, true);
    window.addEventListener('keyup', onPageKeyUp, true);
    window.addEventListener('blur', () => {
      if (state.ctrlHeld) {
        state.ctrlHeld = false;
        updateModeIndicator();
        if (state.inspecting) refreshInspectOverlay();
      }
    });

    // Fast rAF repositioning on scroll/resize, 150ms debounced re-anchor on DOM/HMR mutations
    window.addEventListener('scroll', schedulePinPositionUpdate, true);
    window.addEventListener('resize', schedulePinPositionUpdate, true);
    window.addEventListener('hashchange', onRouteOrDomChange);
    window.addEventListener('popstate', onRouteOrDomChange);

    mutationObserver = new MutationObserver((mutations) => {
      if (hostEl && mutations.every((m) => m.target === hostEl || hostEl.contains(m.target))) {
        return;
      }
      scheduleHmrReanchor();
    });
    mutationObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['open', 'class', 'style', 'aria-expanded', 'aria-selected', 'hidden', 'data-state']
    });

    // Periodic cleanup to fade stale multiplayer cursors (~5s)
    cursorCleanupTimer = setInterval(() => {
      if (peerCursors.size > 0) {
        renderPeerCursors();
      }
    }, 1000);

    // Sync across tabs in standalone chrome.storage mode
    if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && getSession().mode === 'standalone') {
          const key = window.AIFLStorage.getSiteKey();
          if (changes[key]) {
            state.comments = window.AIFLStorage.normalizePins
              ? changes[key].newValue || []
              : Array.isArray(changes[key].newValue)
              ? changes[key].newValue
              : [];
            elementCache.clear();
            renderAll();
          }
        }
      });
    }

    // Live WebSocket sync listeners
    if (window.AIFLStorage) {
      unsubscribes.push(
        window.AIFLStorage.onSyncUpdate((pins) => {
          state.comments = pins;
          elementCache.clear();
          renderAll();
        }),
        window.AIFLStorage.onPeersUpdate((peers, event) => {
          const activeIds = new Set(peers.map((p) => p.clientId));
          for (const cid of Array.from(peerCursors.keys())) {
            if (activeIds.size > 0 && !activeIds.has(cid)) {
              peerCursors.delete(cid);
            }
          }
          if (event?.type === 'cursor_move' && event.clientId) {
            const selfId = getSession().author?.id;
            if (event.clientId !== selfId) {
              peerCursors.set(event.clientId, {
                clientId: event.clientId,
                author: event.author || { name: 'Peer', color: '#10b981', role: 'guest' },
                cursor: event.cursor || {},
                updatedAt: Date.now()
              });
            }
          }
          renderPeerCursors();
          renderLiveStatus();
        }),
        window.AIFLStorage.onSessionError((err) => {
          showToast(err?.message || 'Action denied by server');
        }),
        window.AIFLStorage.onSessionStateChange(() => {
          renderLiveStatus();
          if (state.drawerOpen) {
            renderDrawer();
          }
        }),
        window.AIFLStorage.onAgentEvent
          ? window.AIFLStorage.onAgentEvent((evt) => {
              if (evt.type === 'agent_run_started') {
                showToast(`Running ${evt.label || evt.provider} on ${evt.pinIds?.length || 0} pin(s)...`);
              } else if (evt.type === 'agent_run_finished') {
                if (evt.ok) {
                  showToast(`✓ ${evt.label || evt.provider} resolved ${evt.pinIds?.length || 0} pin(s)`);
                } else {
                  showToast(evt.error || `${evt.label || evt.provider} failed`);
                }
              }
              if (state.drawerOpen) {
                renderDrawer();
              }
            })
          : () => {}
      );
    }
  }

  function saveDisplayName() {
    const nextName = ui.nameInput.value.trim();
    if (!nextName) {
      showToast('Enter a display name');
      return;
    }
    window.AIFLStorage.setAuthorName(nextName);
    renderLiveStatus();
    showToast(`Display name set to "${nextName}"`);
  }

  function setConnectPopoverOpen(open) {
    state.connectPopoverOpen = open;
    if (!ui.connectPopover) return;
    ui.connectPopover.classList.toggle('visible', open);
    if (open) {
      const session = getSession();
      ui.nameInput.value = session.author?.name || '';
      if (!ui.serverUrlInput.value) {
        ui.serverUrlInput.value = session.serverUrl || 'http://127.0.0.1:4173';
      }
      renderLiveStatus();
    }
  }

  function renderLiveStatus() {
    if (!state.mounted || !ui.livePill) return;
    const session = getSession();
    const isGuest = session.role === 'guest';

    // Role-based UI visibility
    if (ui.btnClear) ui.btnClear.style.display = isGuest ? 'none' : '';
    if (ui.drawerClear) ui.drawerClear.style.display = isGuest ? 'none' : '';
    if (ui.batchBar) ui.batchBar.classList.toggle('hidden', isGuest);
    if (ui.manualConnectGroup) ui.manualConnectGroup.style.display = isGuestMode ? 'none' : 'flex';
    if (ui.disconnectBtn) {
      ui.disconnectBtn.style.display = !isGuestMode && session.mode === 'live' ? '' : 'none';
    }

    const peerCount = session.peers.length;
    if (session.connected) {
      ui.livePill.classList.add('is-live');
      ui.livePill.classList.remove('is-connecting');
      if (session.role === 'host') {
        ui.livePillLabel.textContent = peerCount > 1 ? `Host • ${peerCount} live` : 'Host • Live';
      } else {
        ui.livePillLabel.textContent =
          peerCount > 1 ? `${session.author.name} • ${peerCount} live` : `${session.author.name} • Live`;
      }
      if (ui.connectStatusText) {
        ui.connectStatusText.textContent = `Connected as ${session.role.toUpperCase()} (${session.author.name}) • ${peerCount} active`;
      }
    } else if (session.connecting) {
      ui.livePill.classList.remove('is-live');
      ui.livePill.classList.add('is-connecting');
      ui.livePillLabel.textContent = 'Connecting…';
      if (ui.connectStatusText) {
        ui.connectStatusText.textContent = `Connecting to ${session.serverUrl || 'collab server'}…`;
      }
    } else {
      ui.livePill.classList.remove('is-live', 'is-connecting');
      ui.livePillLabel.textContent = isGuest ? 'Guest (Offline)' : 'Local';
      if (ui.connectStatusText) {
        ui.connectStatusText.textContent = isGuest
          ? 'Waiting to reconnect to live collab session…'
          : 'Standalone local storage mode';
      }
    }

    if (ui.peersList) {
      ui.peersList.innerHTML = '';
      for (const peer of session.peers) {
        const chip = document.createElement('span');
        chip.className = 'aifl-peer-chip';
        chip.innerHTML = `<span class="aifl-peer-dot" style="background: ${escapeHtml(peer.color || '#10b981')};"></span><span>${escapeHtml(peer.name || 'Peer')} (${escapeHtml(peer.role || 'guest')})</span>`;
        ui.peersList.appendChild(chip);
      }
    }
  }

  function renderPeerCursors() {
    if (!ui.cursorsContainer) return;
    if (!state.toolbarVisible && !getSession().connected) {
      ui.cursorsContainer.innerHTML = '';
      return;
    }

    const currentRoute = window.AIFLStorage.getRouteKey();
    const now = Date.now();
    const scrollX = window.scrollX || window.pageXOffset || 0;
    const scrollY = window.scrollY || window.pageYOffset || 0;

    // Remove cursors older than 12s
    for (const [cid, entry] of peerCursors.entries()) {
      if (now - entry.updatedAt > 12000) {
        peerCursors.delete(cid);
      }
    }

    const activeIds = new Set();
    for (const [cid, entry] of peerCursors.entries()) {
      const c = entry.cursor || {};
      if (c.routeKey && c.routeKey !== currentRoute) continue;

      const left = Number.isFinite(c.pageX) ? c.pageX - scrollX : c.clientX;
      const top = Number.isFinite(c.pageY) ? c.pageY - scrollY : c.clientY;
      if (!Number.isFinite(left) || !Number.isFinite(top)) continue;

      activeIds.add(cid);
      let cursorEl = ui.cursorsContainer.querySelector(`[data-peer-id="${CSS.escape(cid)}"]`);
      if (!cursorEl) {
        cursorEl = document.createElement('div');
        cursorEl.className = 'aifl-peer-cursor';
        cursorEl.dataset.peerId = cid;
        const color = entry.author?.color || '#10b981';
        const name = entry.author?.name || 'Guest';
        cursorEl.innerHTML = `
          <svg class="aifl-peer-cursor-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M5 3L19 12L12 14L9 21L5 3Z" fill="${escapeHtml(color)}" stroke="#ffffff" stroke-width="1.6" stroke-linejoin="round"/>
          </svg>
          <span class="aifl-peer-cursor-pill" style="background: ${escapeHtml(color)};">${escapeHtml(name)}</span>
        `;
        ui.cursorsContainer.appendChild(cursorEl);
      } else {
        const pill = cursorEl.querySelector('.aifl-peer-cursor-pill');
        if (pill && entry.author?.name) {
          pill.textContent = entry.author.name;
        }
      }

      cursorEl.style.left = `${Math.round(left)}px`;
      cursorEl.style.top = `${Math.round(top)}px`;
      cursorEl.classList.toggle('stale', now - entry.updatedAt > 5000);
    }

    // Remove DOM cursor elements not in activeIds
    ui.cursorsContainer.querySelectorAll('.aifl-peer-cursor').forEach((el) => {
      if (!activeIds.has(el.dataset.peerId)) {
        el.remove();
      }
    });
  }

  function resetClearConfirmState() {
    state.confirmingClearToolbar = false;
    state.confirmingClearDrawer = false;
    if (ui.btnClear) {
      ui.btnClear.classList.remove('aifl-btn-confirm');
      ui.btnClearLabel.textContent = 'Clear';
    }
    if (ui.drawerClear) {
      ui.drawerClear.classList.remove('aifl-btn-confirm');
      ui.drawerClear.textContent = 'Clear All Comments';
    }
  }

  async function handleClearAll() {
    state.comments = await window.AIFLStorage.clearComments('all');
    state.focusedCommentId = null;
    state.selectedPinIds.clear();
    elementCache.clear();
    ui.focusBox.classList.remove('visible');
    renderAll();
    showToast('Cleared all comments');
  }

  async function handleRunAgentOnSelected() {
    const session = getSession();
    if (session.role === 'guest') return;

    const filtered = getFilteredComments();
    const checked = filtered.filter((c) => state.selectedPinIds.has(c.id));
    const targets =
      checked.length > 0
        ? checked
        : filtered.filter((c) => {
            const st = c.status || 'pending';
            return st === 'pending' || st === 'approved';
          });

    if (targets.length === 0) {
      showToast('No pending or approved pins to dispatch');
      return;
    }

    const ids = targets.map((c) => c.id);
    const res = await window.AIFLStorage.batchUpdateStatus(ids, 'approved');
    state.comments = res.comments;
    ids.forEach((id) => state.selectedPinIds.delete(id));

    const updatedTargets = state.comments.filter((c) => ids.includes(c.id));
    const provider = ui.agentSelect ? ui.agentSelect.value : session.defaultAgent || 'agy';

    if (session.connected && session.role === 'host' && window.AIFLStorage.runAgent) {
      const runRes = window.AIFLStorage.runAgent(ids, provider);
      await copyPromptToClipboard(
        updatedTargets,
        runRes.ok
          ? `Approved ${ids.length} pin${ids.length === 1 ? '' : 's'} — starting ${provider} CLI & copied prompt`
          : runRes.error || `Approved ${ids.length} pin(s) & copied prompt`
      );
    } else {
      await copyPromptToClipboard(
        updatedTargets,
        `Marked ${ids.length} pin${ids.length === 1 ? '' : 's'} approved & copied prompt!`
      );
    }
    renderAll();
  }

  /**
   * Makes any floating element (toolbar, prompt popover) draggable via one or more handles.
   */
  function setupFloatingDrag(handleEls, targetEl) {
    const handles = Array.isArray(handleEls) ? handleEls.filter(Boolean) : [handleEls].filter(Boolean);
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let origLeft = 0;
    let origTop = 0;

    handles.forEach((handleEl) => {
      handleEl.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        if (e.target.closest('button')) return;
        dragging = true;
        const rect = targetEl.getBoundingClientRect();
        startX = e.clientX;
        startY = e.clientY;
        origLeft = rect.left;
        origTop = rect.top;

        targetEl.style.left = `${origLeft}px`;
        targetEl.style.top = `${origTop}px`;
        targetEl.style.bottom = 'auto';
        targetEl.style.right = 'auto';
        targetEl.style.transform = 'none';
        targetEl.classList.add('dragging');
        e.preventDefault();
        e.stopPropagation();
      });
    });

    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const newLeft = Math.max(8, Math.min(window.innerWidth - targetEl.offsetWidth - 8, origLeft + dx));
      const newTop = Math.max(8, Math.min(window.innerHeight - targetEl.offsetHeight - 8, origTop + dy));
      targetEl.style.left = `${newLeft}px`;
      targetEl.style.top = `${newTop}px`;
    });

    window.addEventListener('mouseup', () => {
      if (!dragging) return;
      dragging = false;
      targetEl.classList.remove('dragging');
    });
  }

  /**
   * Toggles the extension UI (floating control bar, pins, drawer, and popovers).
   */
  async function toggleToolbar() {
    await ensureMounted();
    state.comments = await window.AIFLStorage.loadComments();
    const nextVisible = !state.toolbarVisible;
    setToolbarVisible(nextVisible);
    if (!nextVisible) {
      setInspecting(false);
      closePopover();
      setConnectPopoverOpen(false);
      setDrawerOpen(false);
      ui.focusBox?.classList.remove('visible');
    }
    renderAll();
  }

  function setToolbarVisible(visible) {
    state.toolbarVisible = visible;
    if (!ui.toolbar) return;
    ui.toolbar.classList.toggle('hidden', !visible);
    if (ui.pinsContainer) {
      ui.pinsContainer.style.display = visible ? 'block' : 'none';
    }
    try {
      sessionStorage.setItem('aifl_toolbar_open', visible ? '1' : '0');
    } catch {
      // Ignore restricted sessionStorage
    }
  }

  function isFreeDropActive() {
    return Boolean(state.ctrlHeld);
  }

  function updateModeIndicator() {
    if (!state.inspecting || !ui.btnAddLabel) return;
    ui.btnAddLabel.textContent = isFreeDropActive() ? 'Drop Free Pin (Release Ctrl)' : 'Click Element (ESC)';
  }

  function setInspecting(active) {
    state.inspecting = active;
    if (!ui.toolbar) return;

    ui.toolbar.classList.toggle('inspecting', active);
    ui.btnAdd.classList.toggle('active', active);
    updateModeIndicator();
    if (!active && ui.btnAddLabel) {
      ui.btnAddLabel.textContent = '+ Add Comment';
    }

    if (!active) {
      state.hoveredElement = null;
      ui.hoverBox.classList.remove('visible');
      ui.freeCursor?.classList.remove('visible');
    } else {
      closePopover();
      setConnectPopoverOpen(false);
    }
  }

  function setDrawerOpen(open) {
    state.drawerOpen = open;
    if (!ui.drawer) return;
    ui.drawer.classList.toggle('open', open);
    if (open) {
      setConnectPopoverOpen(false);
      renderDrawer();
    } else {
      ui.focusBox.classList.remove('visible');
    }
  }

  function refreshInspectOverlay() {
    if (!state.inspecting || state.pendingPin) return;
    const { x: clientX, y: clientY } = state.lastMousePos;
    if (!clientX && !clientY) return;

    if (isFreeDropActive()) {
      ui.hoverBox.classList.remove('visible');
      state.hoveredElement = null;

      const scrollX = window.scrollX || window.pageXOffset || 0;
      const scrollY = window.scrollY || window.pageYOffset || 0;
      const vw = window.innerWidth || 1;
      const vh = window.innerHeight || 1;
      const pageX = Math.round(clientX + scrollX);
      const pageY = Math.round(clientY + scrollY);
      const pctX = Math.round((clientX / vw) * 100);
      const pctY = Math.round((clientY / vh) * 100);

      ui.freeCursor.style.left = `${clientX}px`;
      ui.freeCursor.style.top = `${clientY}px`;
      if (ui.danglingNum) {
        ui.danglingNum.textContent = String(state.comments.length + 1);
      }
      ui.freeCursor.classList.add('visible');

      ui.freeLabel.innerHTML = `<span>📍 (${pageX}, ${pageY}) • ${pctX}% X, ${pctY}% Y</span><span class="aifl-hover-hint">Click to drop • Release Ctrl for Element Picker</span>`;
      ui.freeLabel.style.left = clientX > vw - 310 ? '-295px' : '20px';
      return;
    }

    ui.freeCursor?.classList.remove('visible');

    const target = document.elementFromPoint(clientX, clientY);
    if (!target || target === document.documentElement || target === document.body || target === hostEl) {
      ui.hoverBox.classList.remove('visible');
      state.hoveredElement = null;
      return;
    }

    state.hoveredElement = target;
    const rect = target.getBoundingClientRect();
    ui.hoverBox.style.left = `${rect.left}px`;
    ui.hoverBox.style.top = `${rect.top}px`;
    ui.hoverBox.style.width = `${rect.width}px`;
    ui.hoverBox.style.height = `${rect.height}px`;
    ui.hoverBox.classList.add('visible');

    const label = window.AIFLPromptGenerator.buildShortElementLabel(target);
    const dims = `${Math.round(rect.width)}×${Math.round(rect.height)}`;
    ui.hoverLabel.innerHTML = `<span>${escapeHtml(label)}</span><span class="aifl-hover-hint">${dims} • Hold Ctrl for Free Pin • Shift+Click to interact</span>`;
    ui.hoverLabel.style.top = rect.top < 32 ? '4px' : '-28px';
  }

  function onPageMouseMove(e) {
    state.lastMousePos = { x: e.clientX, y: e.clientY };

    // Stream throttled multiplayer cursor position when connected
    if (window.AIFLStorage && getSession().connected) {
      window.AIFLStorage.sendCursor({
        pageX: Math.round(e.clientX + (window.scrollX || window.pageXOffset || 0)),
        pageY: Math.round(e.clientY + (window.scrollY || window.pageYOffset || 0)),
        clientX: Math.round(e.clientX),
        clientY: Math.round(e.clientY),
        routeKey: window.AIFLStorage.getRouteKey()
      });
    }

    if (e.ctrlKey !== state.ctrlHeld) {
      state.ctrlHeld = Boolean(e.ctrlKey);
      updateModeIndicator();
    }
    if (!state.inspecting || state.pendingPin) return;

    if (hostEl && e.composedPath().includes(hostEl)) {
      ui.hoverBox.classList.remove('visible');
      ui.freeCursor?.classList.remove('visible');
      state.hoveredElement = null;
      return;
    }

    refreshInspectOverlay();
  }

  function onPageClick(e) {
    if (!state.inspecting) return;
    if (hostEl && e.composedPath().includes(hostEl)) return;

    if (e.ctrlKey !== state.ctrlHeld) {
      state.ctrlHeld = Boolean(e.ctrlKey);
      updateModeIndicator();
    }

    if (e.shiftKey) {
      schedulePinPositionUpdate();
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    if (isFreeDropActive()) {
      const context = window.AIFLPromptGenerator.captureFreePinContext(e);
      state.ctrlHeld = false;
      setInspecting(false);
      openQuickAddPopover(null, context, e.clientX, e.clientY);
      return;
    }

    const target = document.elementFromPoint(e.clientX, e.clientY);
    if (!target || target === hostEl) return;

    const context = window.AIFLPromptGenerator.capturePinContext(target, e);
    setInspecting(false);
    openQuickAddPopover(target, context, e.clientX, e.clientY);
  }

  function onPageKeyDown(e) {
    const path = typeof e.composedPath === 'function' ? e.composedPath() : [];
    const targetTag = (path[0]?.tagName || e.target?.tagName || '').toLowerCase();
    const isTypingInInput = targetTag === 'input' || targetTag === 'textarea' || path[0]?.isContentEditable;

    if (e.altKey && e.shiftKey && (e.key === 'F' || e.key === 'f')) {
      e.preventDefault();
      toggleToolbar();
      return;
    }

    if (isTypingInInput) return;

    if ((e.key === 'Control' || e.ctrlKey) && !state.ctrlHeld) {
      state.ctrlHeld = true;
      updateModeIndicator();
      if (state.inspecting) refreshInspectOverlay();
    }

    if (e.key === 'Escape') {
      if (state.pendingPin) {
        closePopover();
      } else if (state.connectPopoverOpen) {
        setConnectPopoverOpen(false);
      } else if (state.inspecting) {
        setInspecting(false);
      } else if (state.drawerOpen) {
        setDrawerOpen(false);
      }
    }
  }

  function onPageKeyUp(e) {
    if (e.key === 'Control' || (!e.ctrlKey && state.ctrlHeld)) {
      state.ctrlHeld = false;
      updateModeIndicator();
      if (state.inspecting) refreshInspectOverlay();
    }
  }

  function openQuickAddPopover(element, context, clientX, clientY) {
    const isFree = Boolean(context?.target?.isFreePin);
    state.pendingPin = { mode: 'create', element, context, clientX, clientY };
    const nextNum =
      state.comments.reduce((max, c) => Math.max(max, Number(c.number) || 0), 0) + 1;
    ui.popoverBadge.textContent = `Pin #${nextNum}${isFree ? ' • Free' : ''}`;
    ui.popoverTarget.textContent = context.target.shortLabel || context.target.tagName;
    ui.popoverSave.textContent = 'Save Pin';
    ui.popoverTextarea.value = '';

    positionPopoverNear(clientX, clientY);
    ui.popover.classList.add('visible');

    if (isFree) {
      positionCoordinateFocusRing(clientX, clientY);
    } else if (element) {
      positionFocusBox(element);
    }

    setTimeout(() => {
      ui.popoverTextarea.focus();
    }, 20);
  }

  function openEditPinPopover(comment, anchorX, anchorY) {
    const isFree = Boolean(comment.target?.isFreePin);
    const anchor = window.AIFLPromptGenerator.resolvePinAnchor(comment);
    const el = isFree ? null : anchor.element;

    state.pendingPin = {
      mode: 'edit',
      commentId: comment.id,
      element: el
    };
    ui.popoverBadge.textContent = `Pin #${comment.number}${isFree ? ' • Free' : ''}`;
    ui.popoverTarget.textContent = comment.target?.shortLabel || comment.target?.tagName || 'element';
    ui.popoverSave.textContent = 'Save Pin';
    ui.popoverTextarea.value = comment.text || '';

    positionPopoverNear(anchorX, anchorY);
    ui.popover.classList.add('visible');

    if (isFree) {
      positionCoordinateFocusRing(anchorX, anchorY);
    } else if (el && window.AIFLPromptGenerator.isElementCurrentlyVisible(el)) {
      positionFocusBox(el);
    }

    setTimeout(() => {
      ui.popoverTextarea.focus();
      ui.popoverTextarea.setSelectionRange(ui.popoverTextarea.value.length, ui.popoverTextarea.value.length);
    }, 20);
  }

  function positionPopoverNear(clientX, clientY) {
    const popWidth = 340;
    const popHeight = 185;
    const maxRight = state.drawerOpen ? Math.max(360, window.innerWidth - 425) : window.innerWidth - 12;
    const left = Math.max(12, Math.min(maxRight - popWidth, clientX + 18));
    const top = Math.max(12, Math.min(window.innerHeight - popHeight - 12, clientY - 24));

    ui.popover.style.left = `${left}px`;
    ui.popover.style.top = `${top}px`;
  }

  function closePopover() {
    state.pendingPin = null;
    if (ui.popover) {
      ui.popover.classList.remove('visible');
      ui.popoverTextarea.value = '';
    }
    if (!state.drawerOpen) {
      ui.focusBox?.classList.remove('visible');
    }
  }

  async function savePendingPin() {
    if (!state.pendingPin) return;
    const text = ui.popoverTextarea.value.trim();
    if (!text) {
      ui.popoverTextarea.focus();
      showToast('Please enter a comment first');
      return;
    }

    if (state.pendingPin.mode === 'edit' && state.pendingPin.commentId) {
      const { comment, comments } = await window.AIFLStorage.updateComment(state.pendingPin.commentId, {
        text
      });
      state.comments = comments;
      state.focusedCommentId = comment ? comment.id : state.pendingPin.commentId;
      closePopover();
      renderAll();
      showToast(`Updated Pin #${comment ? comment.number : ''}`);
      return;
    }

    const { element, context } = state.pendingPin;
    const { comment, comments } = await window.AIFLStorage.addComment({
      text,
      screen: context.screen,
      target: context.target
    });

    if (comment && element) {
      elementCache.set(comment.id, element);
    }

    state.comments = comments;
    state.focusedCommentId = comment ? comment.id : null;
    closePopover();
    renderAll();
    showToast(`Saved Pin #${comment.number}`);
  }

  function onRouteOrDomChange() {
    state.lastRouteKey = window.AIFLStorage.getRouteKey();
    elementCache.clear();
    renderAll();
  }

  function getVisibleScopeComments() {
    return state.comments;
  }

  function getScopedComments() {
    if (state.filterScope === 'screen') {
      const currentRoute = window.AIFLStorage.getRouteKey();
      return state.comments.filter((c) => c.screen?.routeKey === currentRoute);
    }
    return state.comments;
  }

  function getFilteredComments() {
    const scoped = getScopedComments();
    if (state.statusFilter === 'pending') {
      return scoped.filter((c) => (c.status || 'pending') === 'pending');
    }
    if (state.statusFilter === 'approved') {
      return scoped.filter((c) => c.status === 'approved' || c.status === 'in_progress');
    }
    if (state.statusFilter === 'resolved') {
      return scoped.filter((c) => c.status === 'resolved');
    }
    return scoped;
  }

  function canModifyPin(comment, session) {
    if (session.role !== 'guest') return true;
    return comment.author?.id === session.author?.id && (comment.status || 'pending') === 'pending';
  }

  /**
   * Renders toolbar badges, live status pill, floating pin bubbles, and the drawer list.
   */
  function renderAll() {
    if (!state.mounted || state.tornDown) return;
    const count = state.comments.length;
    ui.toolbarCount.textContent = String(count);
    ui.drawerCount.textContent = String(count);

    renderLiveStatus();
    renderPins();
    renderPeerCursors();
    if (state.drawerOpen) {
      renderDrawer();
    }
  }

  function renderPins() {
    if (!ui.pinsContainer) return;
    if (!state.toolbarVisible) {
      ui.pinsContainer.innerHTML = '';
      ui.pinsContainer.style.display = 'none';
      return;
    }
    ui.pinsContainer.style.display = 'block';
    const currentRoute = window.AIFLStorage.getRouteKey();
    const routeComments = state.comments.filter((c) => {
      if (c.screen?.routeKey !== currentRoute) return false;
      if (!state.showResolvedPins && (c.status || 'pending') === 'resolved') return false;
      return true;
    });

    ui.pinsContainer.innerHTML = '';

    for (const comment of routeComments) {
      const isFree = Boolean(comment.target?.isFreePin || comment.target?.pinType === 'free');
      const pinStatus = comment.status || 'pending';
      const pinEl = document.createElement('div');
      pinEl.className = `aifl-pin status-${pinStatus}${isFree ? ' free-pin' : ''}${
        state.focusedCommentId === comment.id ? ' active' : ''
      }`;
      pinEl.dataset.commentId = comment.id;
      pinEl.title = isFree
        ? 'Free Coordinate Pin • Click to view/edit • Drag to move pin'
        : 'Element Pin • Click to view/edit • Drag to move pin';

      const numSpan = document.createElement('span');
      numSpan.className = 'aifl-pin-num';
      numSpan.textContent = String(comment.number);
      pinEl.appendChild(numSpan);

      if (pinStatus === 'resolved') {
        const checkBadge = document.createElement('span');
        checkBadge.className = 'aifl-pin-check';
        checkBadge.textContent = '✓';
        pinEl.appendChild(checkBadge);
      }

      const pinGripper = document.createElement('div');
      pinGripper.className = 'aifl-pin-gripper';
      pinGripper.title = 'Drag to reposition pin';
      pinGripper.innerHTML = '<i></i><i></i><i></i>';
      pinEl.appendChild(pinGripper);

      const tooltip = document.createElement('div');
      tooltip.className = 'aifl-pin-tooltip';
      const authorPrefix = comment.author?.name ? `[${comment.author.name}] ` : '';
      tooltip.textContent = `${authorPrefix}${comment.text || `Pin #${comment.number}`}`;
      pinEl.appendChild(tooltip);

      setupPinDragAndClick(pinEl, comment);

      ui.pinsContainer.appendChild(pinEl);
    }

    updatePinPositions();
  }

  function setupPinDragAndClick(pinEl, comment) {
    let isDown = false;
    let didDrag = false;
    let startX = 0;
    let startY = 0;
    let origPinX = 0;
    let origPinY = 0;

    pinEl.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      isDown = true;
      didDrag = false;
      startX = e.clientX;
      startY = e.clientY;
      origPinX = parseFloat(pinEl.style.left) || e.clientX;
      origPinY = parseFloat(pinEl.style.top) || e.clientY;
      window.addEventListener('mousemove', onMouseMove, true);
      window.addEventListener('mouseup', onMouseUp, true);
      e.preventDefault();
      e.stopPropagation();
    });

    const onMouseMove = (e) => {
      if (!isDown) return;
      const session = getSession();
      if (!canModifyPin(comment, session)) return;

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (!didDrag && Math.hypot(dx, dy) > 4) {
        didDrag = true;
        pinEl.classList.add('dragging');
      }
      if (!didDrag) return;

      const nextX = Math.max(16, Math.min(window.innerWidth - 16, origPinX + dx));
      const nextY = Math.max(16, Math.min(window.innerHeight - 16, origPinY + dy));
      comment._draggingPos = { x: nextX, y: nextY };
      pinEl.style.left = `${Math.round(nextX)}px`;
      pinEl.style.top = `${Math.round(nextY)}px`;
    };

    const onMouseUp = async (e) => {
      if (!isDown) return;
      isDown = false;
      window.removeEventListener('mousemove', onMouseMove, true);
      window.removeEventListener('mouseup', onMouseUp, true);
      pinEl.classList.remove('dragging');

      const session = getSession();

      if (didDrag && comment._draggingPos && canModifyPin(comment, session)) {
        const finalX = comment._draggingPos.x;
        const finalY = comment._draggingPos.y;
        delete comment._draggingPos;

        const isFree = Boolean(comment.target?.isFreePin || comment.target?.pinType === 'free');
        const el = isFree
          ? null
          : elementCache.get(comment.id) || window.AIFLPromptGenerator.resolveTargetElement(comment);
        const scrollX = window.scrollX || window.pageXOffset || 0;
        const scrollY = window.scrollY || window.pageYOffset || 0;
        const vw = window.innerWidth || 1;
        const vh = window.innerHeight || 1;
        const newPageX = Math.round(finalX + scrollX);
        const newPageY = Math.round(finalY + scrollY);
        const newPctX = Math.round((finalX / vw) * 100);
        const newPctY = Math.round((finalY / vh) * 100);

        const updatedTarget = {
          ...(comment.target || {}),
          pageCoords: { x: newPageX, y: newPageY },
          viewportPct: { x: newPctX, y: newPctY }
        };

        if (isFree) {
          updatedTarget.selector = `Free Coordinate (${newPageX}, ${newPageY})`;
          updatedTarget.shortLabel = `📍 Point (${newPageX}, ${newPageY})`;
          updatedTarget.region = window.AIFLPromptGenerator.describeViewportRegion(newPctX, newPctY);
          const landmarks = window.AIFLPromptGenerator.findSpatialLandmarks(finalX, finalY);
          updatedTarget.spatialLandmarks = landmarks;
          updatedTarget.nearbyText = landmarks.join(' • ');
          const underlyingEl = document.elementFromPoint(finalX, finalY) || document.body;
          const { matchedLandmark } = window.AIFLPromptGenerator.capturePageContentLandscape(underlyingEl, {
            clientX: finalX,
            clientY: finalY
          });
          updatedTarget.landmarkRef = matchedLandmark || null;
          updatedTarget.placementNarrative = window.AIFLPromptGenerator.buildPlacementNarrative({
            isFreePin: true,
            shortLabel: updatedTarget.shortLabel,
            textSnippet: '',
            clickedPhrase: null,
            prevDesc: null,
            nextDesc: null,
            matchedLandmark,
            sectionHeading: updatedTarget.sectionHeading,
            pageCoords: { x: newPageX, y: newPageY },
            viewportPct: { x: newPctX, y: newPctY },
            region: updatedTarget.region,
            spatialLandmarks: landmarks
          });
        } else if (el && window.AIFLPromptGenerator.isElementCurrentlyVisible(el)) {
          const rect = el.getBoundingClientRect();
          const baseX = rect.left + rect.width * (comment.target?.offsetRatio?.x ?? 0.5);
          const baseY = rect.top + rect.height * (comment.target?.offsetRatio?.y ?? 0.5);
          updatedTarget.pinOffset = {
            dx: Math.round(finalX - baseX),
            dy: Math.round(finalY - baseY)
          };
        }

        const { comments } = await window.AIFLStorage.updateComment(comment.id, {
          target: updatedTarget
        });
        state.comments = comments;
        renderAll();
        return;
      }

      delete comment._draggingPos;
      const clickX = parseFloat(pinEl.style.left) || e.clientX;
      const clickY = parseFloat(pinEl.style.top) || e.clientY;
      focusComment(comment.id, { openDrawer: true, scrollCardIntoView: true });
      if (canModifyPin(comment, session)) {
        openEditPinPopover(comment, clickX, clickY);
      }
    };
  }

  function schedulePinPositionUpdate() {
    if (!state.mounted || state.tornDown) return;
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      updatePinPositions();
      renderPeerCursors();
    });
  }

  function updatePinPositions() {
    if (!ui.pinsContainer) return;
    const pinNodes = ui.pinsContainer.querySelectorAll('.aifl-pin');

    pinNodes.forEach((pinNode) => {
      const id = pinNode.dataset.commentId;
      const comment = state.comments.find((c) => c.id === id);
      if (!comment) return;

      if (comment._draggingPos) {
        pinNode.style.display = 'flex';
        pinNode.style.left = `${Math.round(comment._draggingPos.x)}px`;
        pinNode.style.top = `${Math.round(comment._draggingPos.y)}px`;
        return;
      }

      const anchor = window.AIFLPromptGenerator.resolvePinAnchor(comment);
      if (anchor.element) {
        elementCache.set(id, anchor.element);
      }

      if (anchor.hiddenByAncestor || !Number.isFinite(anchor.x) || !Number.isFinite(anchor.y)) {
        pinNode.style.display = 'none';
        return;
      }

      pinNode.style.display = 'flex';
      pinNode.style.left = `${Math.round(anchor.x)}px`;
      pinNode.style.top = `${Math.round(anchor.y)}px`;
    });

    if (state.focusedCommentId && (state.drawerOpen || state.pendingPin)) {
      const focusedComment = state.comments.find((c) => c.id === state.focusedCommentId);
      if (focusedComment) {
        const anchor = window.AIFLPromptGenerator.resolvePinAnchor(focusedComment);
        if (anchor.tier === 'free') {
          positionCoordinateFocusRing(anchor.x, anchor.y);
        } else if (anchor.element && !anchor.hiddenByAncestor) {
          positionFocusBox(anchor.element);
        } else if (anchor.containerElement && !anchor.hiddenByAncestor) {
          positionFocusBox(anchor.containerElement);
        } else if (!anchor.hiddenByAncestor && Number.isFinite(anchor.x) && Number.isFinite(anchor.y)) {
          positionCoordinateFocusRing(anchor.x, anchor.y);
        } else {
          ui.focusBox.classList.remove('visible');
        }
      }
    }
  }

  function positionFocusBox(el) {
    if (!el || !ui.focusBox) return;
    const rect = el.getBoundingClientRect();
    ui.focusBox.style.borderRadius = '6px';
    ui.focusBox.style.left = `${rect.left - 3}px`;
    ui.focusBox.style.top = `${rect.top - 3}px`;
    ui.focusBox.style.width = `${rect.width + 6}px`;
    ui.focusBox.style.height = `${rect.height + 6}px`;
    ui.focusBox.classList.add('visible');
  }

  function positionCoordinateFocusRing(clientX, clientY) {
    if (!ui.focusBox) return;
    ui.focusBox.style.borderRadius = '50%';
    ui.focusBox.style.left = `${Math.round(clientX - 18)}px`;
    ui.focusBox.style.top = `${Math.round(clientY - 18)}px`;
    ui.focusBox.style.width = '36px';
    ui.focusBox.style.height = '36px';
    ui.focusBox.classList.add('visible');
  }

  function focusComment(commentId, options = {}) {
    state.focusedCommentId = commentId;
    setToolbarVisible(true);

    if (options.openDrawer) {
      setDrawerOpen(true);
    }

    const comment = state.comments.find((c) => c.id === commentId);
    if (!comment) return;

    const currentRoute = window.AIFLStorage.getRouteKey();
    const isSameRoute = comment.screen?.routeKey === currentRoute;

    if (isSameRoute) {
      let anchor = window.AIFLPromptGenerator.resolvePinAnchor(comment);

      if (options.revealIfHidden && anchor.hiddenByAncestor) {
        const revealedEl = window.AIFLPromptGenerator.tryRevealTargetElement(comment);
        if (revealedEl) elementCache.set(commentId, revealedEl);
        anchor = window.AIFLPromptGenerator.resolvePinAnchor(comment);
      }

      const highlightTarget = anchor.element || anchor.containerElement;
      if (anchor.tier === 'free' || (!highlightTarget && !anchor.hiddenByAncestor)) {
        const pageX = comment.target?.pageCoords?.x ?? 100;
        const pageY = comment.target?.pageCoords?.y ?? 100;
        if (options.scrollElementIntoView) {
          window.scrollTo({
            left: Math.max(0, pageX - window.innerWidth / 2),
            top: Math.max(0, pageY - window.innerHeight / 2),
            behavior: 'smooth'
          });
        }
        positionCoordinateFocusRing(pageX - window.scrollX, pageY - window.scrollY);
      } else if (highlightTarget && window.AIFLPromptGenerator.isElementCurrentlyVisible(highlightTarget)) {
        if (options.scrollElementIntoView) {
          highlightTarget.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
        }
        positionFocusBox(highlightTarget);
        clearTimeout(focusHighlightTimer);
        focusHighlightTimer = setTimeout(() => {
          if (!state.drawerOpen) ui.focusBox.classList.remove('visible');
        }, 3500);
      }
    }

    renderPins();
    if (state.drawerOpen) {
      renderDrawer();
      if (options.scrollCardIntoView) {
        requestAnimationFrame(() => {
          const card = ui.drawerBody.querySelector(`[data-card-id="${CSS.escape(commentId)}"]`);
          if (card) {
            card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        });
      }
    }
  }

  /**
   * Renders the right-hand slide-out Review Inbox drawer contents and live AI prompt preview.
   */
  function renderDrawer() {
    if (!ui.drawerBody) return;
    const session = getSession();
    const isGuest = session.role === 'guest';
    const currentRoute = window.AIFLStorage.getRouteKey();
    const allCount = state.comments.length;
    const screenCount = state.comments.filter((c) => c.screen?.routeKey === currentRoute).length;

    ui.tabAll.textContent = `All Screens (${allCount})`;
    ui.tabScreen.textContent = `This Screen (${screenCount})`;
    ui.tabAll.classList.toggle('active', state.filterScope === 'all');
    ui.tabScreen.classList.toggle('active', state.filterScope === 'screen');

    ui.modeStandard.classList.toggle('active', state.promptMode === 'standard');
    ui.modeCompact.classList.toggle('active', state.promptMode === 'compact');

    // Update status filter counts within current scope
    const scoped = getScopedComments();
    const pendingCount = scoped.filter((c) => (c.status || 'pending') === 'pending').length;
    const approvedCount = scoped.filter((c) => c.status === 'approved' || c.status === 'in_progress').length;
    const resolvedCount = scoped.filter((c) => c.status === 'resolved').length;

    ui.statusAll.textContent = `All (${scoped.length})`;
    ui.statusPending.textContent = `Pending (${pendingCount})`;
    ui.statusApproved.textContent = `Approved (${approvedCount})`;
    ui.statusResolved.textContent = `Resolved (${resolvedCount})`;

    [ui.statusAll, ui.statusPending, ui.statusApproved, ui.statusResolved].forEach((btn) => {
      btn.classList.toggle('active', (btn.dataset.status || 'all') === state.statusFilter);
    });

    // Prune stale selections
    const validIds = new Set(state.comments.map((c) => c.id));
    for (const id of Array.from(state.selectedPinIds)) {
      if (!validIds.has(id)) state.selectedPinIds.delete(id);
    }

    const filtered = getFilteredComments();
    const checkedVisibleCount = filtered.filter((c) => state.selectedPinIds.has(c.id)).length;
    if (ui.selectedCountEl) {
      ui.selectedCountEl.textContent = `${checkedVisibleCount} selected`;
    }
    if (ui.batchBar) {
      ui.batchBar.classList.toggle('hidden', isGuest);
    }
    if (ui.agentSelect && !ui.agentSelect.dataset.userChanged && session.defaultAgent) {
      ui.agentSelect.value = session.defaultAgent;
    }
    if (ui.batchRunBtn) {
      ui.batchRunBtn.disabled = Boolean(session.agentRunning);
      ui.batchRunBtn.textContent = session.agentRunning ? 'Running CLI...' : 'Run Agent on Selected';
    }

    // Preserve active focus and draft reply input values across live WS re-renders
    let activeFocusMeta = null;
    const activeEl = shadowRoot?.activeElement;
    if (activeEl && ui.drawerBody.contains(activeEl)) {
      const cardEl = activeEl.closest('[data-card-id]');
      if (cardEl) {
        const cls = activeEl.classList.contains('aifl-reply-input')
          ? 'aifl-reply-input'
          : activeEl.classList.contains('aifl-card-textarea')
          ? 'aifl-card-textarea'
          : null;
        if (cls) {
          activeFocusMeta = {
            cardId: cardEl.dataset.cardId,
            cls,
            value: activeEl.value,
            selectionStart: activeEl.selectionStart,
            selectionEnd: activeEl.selectionEnd
          };
        }
      }
    }

    ui.drawerBody.querySelectorAll('.aifl-reply-input').forEach((inp) => {
      const cid = inp.dataset.pinId;
      if (cid) {
        if (inp.value) replyDrafts.set(cid, inp.value);
        else replyDrafts.delete(cid);
      }
    });

    ui.drawerBody.innerHTML = '';

    if (filtered.length === 0) {
      const emptyEl = document.createElement('div');
      emptyEl.className = 'aifl-empty-state';
      emptyEl.innerHTML = `
        <div class="aifl-empty-icon">📌</div>
        <div class="aifl-empty-title">No ${state.statusFilter !== 'all' ? escapeHtml(state.statusFilter) + ' ' : ''}comments ${state.filterScope === 'screen' ? 'on this screen' : 'yet'}</div>
        <div class="aifl-empty-desc">
          Click <strong>+ Add Comment</strong> and select any element on the page to leave feedback.
        </div>
      `;
      const startBtn = document.createElement('button');
      startBtn.className = 'aifl-btn aifl-btn-primary';
      startBtn.textContent = '+ Add Comment';
      startBtn.addEventListener('click', () => {
        setDrawerOpen(false);
        setToolbarVisible(true);
        setInspecting(true);
      });
      emptyEl.appendChild(startBtn);
      ui.drawerBody.appendChild(emptyEl);
    } else {
      for (const comment of filtered) {
        const card = createCommentCard(comment, currentRoute, session);
        ui.drawerBody.appendChild(card);
      }
    }

    // Restore unsent reply drafts and active focus
    ui.drawerBody.querySelectorAll('.aifl-reply-input').forEach((inp) => {
      const cid = inp.dataset.pinId;
      if (cid && replyDrafts.has(cid)) {
        inp.value = replyDrafts.get(cid);
      }
    });

    if (activeFocusMeta) {
      const targetCard = ui.drawerBody.querySelector(
        `[data-card-id="${CSS.escape(activeFocusMeta.cardId)}"]`
      );
      const targetInput = targetCard?.querySelector(`.${activeFocusMeta.cls}`);
      if (targetInput) {
        if (activeFocusMeta.cls === 'aifl-card-textarea' && activeFocusMeta.value !== undefined) {
          targetInput.value = activeFocusMeta.value;
        }
        targetInput.focus();
        if (typeof activeFocusMeta.selectionStart === 'number') {
          try {
            targetInput.setSelectionRange(activeFocusMeta.selectionStart, activeFocusMeta.selectionEnd);
          } catch {
            // Ignore
          }
        }
      }
    }

    const promptText = window.AIFLPromptGenerator.generateAIPrompt(filtered, {
      mode: state.promptMode
    });
    ui.previewPre.textContent = promptText;
    ui.drawerCopy.textContent = `Copy ${filtered.length} Comment${filtered.length === 1 ? '' : 's'} as AI Prompt`;
  }

  function formatStatusLabel(status) {
    switch (status) {
      case 'approved':
        return 'Approved';
      case 'in_progress':
        return 'In Progress';
      case 'resolved':
        return '✓ Resolved';
      default:
        return 'Pending';
    }
  }

  function createCommentCard(comment, currentRoute, session) {
    const t = comment.target || {};
    const isGuest = session.role === 'guest';
    const editable = canModifyPin(comment, session);
    const pinStatus = comment.status || 'pending';
    const isFree = Boolean(t.isFreePin || t.pinType === 'free');
    const isSameRoute = comment.screen?.routeKey === currentRoute;
    const anchor = isSameRoute ? window.AIFLPromptGenerator.resolvePinAnchor(comment) : null;
    const liveEl = anchor?.element || null;
    const isVisibleNow = Boolean(isSameRoute && anchor && !anchor.hiddenByAncestor);

    const card = document.createElement('div');
    card.className = `aifl-card status-${pinStatus}${state.focusedCommentId === comment.id ? ' focused' : ''}`;
    card.dataset.cardId = comment.id;

    let locationBadgeHtml = '';
    if (!isSameRoute) {
      locationBadgeHtml = `<span class="aifl-status-pill other-screen" title="Dropped on ${escapeHtml(comment.screen?.routeKey || '')}">Other Screen</span>`;
    } else if (isFree) {
      locationBadgeHtml = `<span class="aifl-status-pill" style="background: rgba(16, 185, 129, 0.16); color: #6ee7b7; border: 1px solid rgba(16, 185, 129, 0.35);" title="Arbitrary coordinate pin">📍 Free Pin</span>`;
    } else if (!isVisibleNow) {
      locationBadgeHtml = `<span class="aifl-status-pill hidden-el" title="Target is currently hidden (e.g. inside a closed accordion, menu, or tab)">Collapsed/Hidden</span>`;
    } else if (anchor?.tier === 2) {
      locationBadgeHtml = `<span class="aifl-status-pill other-screen" title="Re-anchored via text-quote + landmark">Text Match</span>`;
    } else if (anchor?.tier === 3) {
      locationBadgeHtml = `<span class="aifl-status-pill hidden-el" title="Element refactored; anchored via last coordinates">Coords Fallback</span>`;
    }

    const screenDisplay = comment.screen?.activeScreenLabel
      ? `${comment.screen.routeKey} • ${comment.screen.activeScreenLabel}`
      : comment.screen?.routeKey || '/';

    const coordsSummary = t.pageCoords
      ? isFree
        ? `(${t.pageCoords.x}, ${t.pageCoords.y}) • ${t.viewportPct?.x ?? 0}% X, ${t.viewportPct?.y ?? 0}% Y${t.region ? ` • ${t.region}` : ''}`
        : `(${t.pageCoords.x}, ${t.pageCoords.y}) • ${t.viewportPct?.x ?? 0}% X, ${t.viewportPct?.y ?? 0}% Y • ${t.elementRect?.width ?? 0}×${t.elementRect?.height ?? 0}px`
      : '';

    const authorName = comment.author?.name || 'Host';
    const authorRole = comment.author?.role || 'host';
    const authorColor = comment.author?.color || (authorRole === 'host' ? '#6366f1' : '#10b981');

    let triageButtonsHtml = '';
    if (!isGuest) {
      if (pinStatus === 'pending') {
        triageButtonsHtml = `<button class="aifl-triage-btn approve" data-triage="approved" title="Approve for AI agent execution">Approve</button>`;
      } else if (pinStatus === 'approved' || pinStatus === 'in_progress') {
        triageButtonsHtml = `<button class="aifl-triage-btn resolve" data-triage="resolved" title="Mark resolved">Resolve</button>`;
      } else if (pinStatus === 'resolved') {
        triageButtonsHtml = `<button class="aifl-triage-btn reopen" data-triage="pending" title="Reopen to pending">Reopen</button>`;
      }
    }

    const replies = Array.isArray(comment.replies) ? comment.replies : [];
    const repliesHtml = replies
      .map((r) => {
        const rRole = r.role || 'guest';
        const roleLabel = rRole === 'agent' ? '🤖 Agent' : rRole === 'host' ? 'Host' : 'Guest';
        return `
          <div class="aifl-reply-item role-${escapeHtml(rRole)}">
            <div class="aifl-reply-header">
              <span class="aifl-reply-author">${escapeHtml(r.authorName || roleLabel)}</span>
              <span class="aifl-reply-role ${escapeHtml(rRole)}">${escapeHtml(roleLabel)}</span>
            </div>
            <div class="aifl-reply-text">${escapeHtml(r.text)}</div>
          </div>
        `;
      })
      .join('');

    card.innerHTML = `
      <div class="aifl-card-header">
        <div class="aifl-card-left">
          ${
            !isGuest
              ? `<input type="checkbox" class="aifl-checkbox card-select" ${state.selectedPinIds.has(comment.id) ? 'checked' : ''} title="Select pin for batch action" />`
              : ''
          }
          <span class="aifl-pin-badge" style="${isFree && state.focusedCommentId !== comment.id ? 'background: #059669;' : ''}">${comment.number}</span>
          <span class="aifl-screen-pill" title="${escapeHtml(screenDisplay)}">${escapeHtml(screenDisplay)}</span>
        </div>
        <div class="aifl-card-actions">
          <button class="aifl-icon-btn locate" title="${isSameRoute ? 'Scroll to & highlight pin location' : 'Navigate to screen'}">
            ${isSameRoute ? '🎯 Locate' : '↗ Go'}
          </button>
          <button class="aifl-icon-btn copy-one" title="Copy prompt for just this comment">📋</button>
          ${editable ? '<button class="aifl-icon-btn delete" title="Delete comment">🗑</button>' : ''}
        </div>
      </div>

      <div class="aifl-card-subrow">
        <div class="aifl-card-badges">
          <span class="aifl-status-pill status-${escapeHtml(pinStatus)}">${escapeHtml(formatStatusLabel(pinStatus))}</span>
          <span class="aifl-author-pill" title="Author (${escapeHtml(authorRole)})">
            <span class="aifl-peer-dot" style="background: ${escapeHtml(authorColor)};"></span>
            <span>${escapeHtml(authorName)}</span>
          </span>
          ${locationBadgeHtml}
        </div>
        <div class="aifl-triage-actions">
          ${triageButtonsHtml}
        </div>
      </div>

      <textarea class="aifl-card-textarea" ${editable ? '' : 'readonly'} placeholder="Describe the change for the AI agent...">${escapeHtml(comment.text)}</textarea>

      <div class="aifl-meta-box">
        ${
          t.landmarkRef?.id
            ? `<div class="aifl-meta-row">
                 <span class="aifl-meta-key">Landmark</span>
                 <span class="aifl-meta-val aifl-meta-code" title="${escapeHtml(`${t.landmarkRef.id}: ${t.landmarkRef.container} — ${t.landmarkRef.title || ''}`)}">[${escapeHtml(t.landmarkRef.id)}] ${escapeHtml(t.landmarkRef.container)}${t.landmarkRef.title && t.landmarkRef.title !== t.landmarkRef.container ? ` • "${escapeHtml(t.landmarkRef.title)}"` : ''}</span>
               </div>`
            : ''
        }
        ${
          t.placementNarrative
            ? `<div class="aifl-meta-row" style="white-space: normal;">
                 <span class="aifl-meta-key">Placement</span>
                 <span class="aifl-meta-val" style="white-space: normal; line-height: 1.35;" title="${escapeHtml(t.placementNarrative)}">${escapeHtml(t.placementNarrative)}</span>
               </div>`
            : ''
        }
        <div class="aifl-meta-row">
          <span class="aifl-meta-key">${isFree ? 'Location' : 'Target'}</span>
          <span class="aifl-meta-val aifl-meta-code" title="${escapeHtml(t.selector || '')}">${escapeHtml(t.selector || t.shortLabel || t.tagName || 'element')}</span>
        </div>
        ${
          t.textSnippet
            ? `<div class="aifl-meta-row">
                 <span class="aifl-meta-key">Text</span>
                 <span class="aifl-meta-val" title="${escapeHtml(t.textSnippet)}">"${escapeHtml(t.textSnippet)}"</span>
               </div>`
            : ''
        }
        ${
          t.sectionHeading || t.nearbyText || t.underlyingContainer
            ? `<div class="aifl-meta-row">
                 <span class="aifl-meta-key">${isFree ? 'Landmarks' : 'Context'}</span>
                 <span class="aifl-meta-val" title="${escapeHtml([t.sectionHeading ? `Section: ${t.sectionHeading}` : '', t.underlyingContainer ? `Area: ${t.underlyingContainer}` : '', t.nearbyText].filter(Boolean).join(' • '))}">
                   ${escapeHtml([t.sectionHeading ? `Section: "${t.sectionHeading}"` : '', t.underlyingContainer ? `Area: ${t.underlyingContainer}` : '', t.nearbyText].filter(Boolean).join(' • '))}
                 </span>
               </div>`
            : ''
        }
        ${
          Array.isArray(t.uiState) && t.uiState.length > 0
            ? `<div class="aifl-meta-row">
                 <span class="aifl-meta-key">UI State</span>
                 <span class="aifl-meta-val" title="${escapeHtml(t.uiState.join(' → '))}">${escapeHtml(t.uiState.join(' → '))}</span>
               </div>`
            : ''
        }
        ${
          coordsSummary
            ? `<div class="aifl-meta-row">
                 <span class="aifl-meta-key">Coords</span>
                 <span class="aifl-meta-val aifl-meta-code">${escapeHtml(coordsSummary)}</span>
               </div>`
            : ''
        }
      </div>

      <div class="aifl-replies-section">
        ${replies.length > 0 ? `<div class="aifl-replies-list">${repliesHtml}</div>` : ''}
        <div class="aifl-reply-form">
          <input type="text" class="aifl-reply-input" data-pin-id="${escapeHtml(comment.id)}" placeholder="Reply to thread..." />
          <button type="button" class="aifl-reply-send">Send</button>
        </div>
      </div>
    `;

    // Focus card on click
    card.addEventListener('click', (e) => {
      if (e.target.closest('button, input, textarea')) return;
      state.focusedCommentId = comment.id;
      card.parentElement?.querySelectorAll('.aifl-card').forEach((c) => c.classList.remove('focused'));
      card.classList.add('focused');
      renderPins();
      if (isSameRoute && anchor && !anchor.hiddenByAncestor) {
        if (anchor.tier === 'free') {
          positionCoordinateFocusRing(anchor.x, anchor.y);
        } else if (liveEl && window.AIFLPromptGenerator.isElementCurrentlyVisible(liveEl)) {
          positionFocusBox(liveEl);
        } else if (anchor.containerElement) {
          positionFocusBox(anchor.containerElement);
        }
      }
    });

    // Multi-select checkbox
    const checkbox = card.querySelector('.card-select');
    if (checkbox) {
      checkbox.addEventListener('click', (e) => e.stopPropagation());
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) state.selectedPinIds.add(comment.id);
        else state.selectedPinIds.delete(comment.id);
        if (ui.selectedCountEl) {
          const checkedVisibleCount = getFilteredComments().filter((c) =>
            state.selectedPinIds.has(c.id)
          ).length;
          ui.selectedCountEl.textContent = `${checkedVisibleCount} selected`;
        }
      });
    }

    // Host triage status buttons (Approve / Resolve / Reopen)
    card.querySelectorAll('.aifl-triage-btn').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const nextStatus = btn.dataset.triage;
        if (!nextStatus) return;
        const { comments } = await window.AIFLStorage.updatePinStatus(comment.id, nextStatus);
        state.comments = comments;
        renderAll();
        showToast(`Pin #${comment.number} marked ${nextStatus}`);
      });
    });

    // Live edit comment text
    const textarea = card.querySelector('.aifl-card-textarea');
    let saveTimer = null;
    textarea.addEventListener('keydown', (e) => e.stopPropagation());
    if (editable) {
      textarea.addEventListener('input', () => {
        const newText = textarea.value;
        comment.text = newText;
        clearTimeout(saveTimer);
        saveTimer = setTimeout(async () => {
          const { comments } = await window.AIFLStorage.updateComment(comment.id, { text: newText.trim() });
          state.comments = comments;
          renderPins();
          const updatedPrompt = window.AIFLPromptGenerator.generateAIPrompt(getFilteredComments(), {
            mode: state.promptMode
          });
          if (ui.previewPre) ui.previewPre.textContent = updatedPrompt;
        }, 250);
      });
    }

    // Threaded reply submission
    const replyInput = card.querySelector('.aifl-reply-input');
    const replySendBtn = card.querySelector('.aifl-reply-send');

    const submitReply = async () => {
      const replyText = replyInput.value.trim();
      if (!replyText) return;
      replyInput.value = '';
      replyDrafts.delete(comment.id);
      const { comments } = await window.AIFLStorage.addReply(comment.id, replyText);
      state.comments = comments;
      renderAll();
    };

    replyInput.addEventListener('click', (e) => e.stopPropagation());
    replyInput.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        submitReply();
      }
    });
    replyInput.addEventListener('input', () => {
      if (replyInput.value) replyDrafts.set(comment.id, replyInput.value);
      else replyDrafts.delete(comment.id);
    });
    replySendBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      submitReply();
    });

    // Locate / Go button
    const locateBtn = card.querySelector('.aifl-icon-btn.locate');
    locateBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!isSameRoute && comment.screen?.url) {
        window.location.href = comment.screen.url;
        return;
      }
      focusComment(comment.id, {
        openDrawer: true,
        scrollElementIntoView: true,
        revealIfHidden: true
      });
    });

    // Copy Single Comment button
    const copyOneBtn = card.querySelector('.aifl-icon-btn.copy-one');
    copyOneBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      copyPromptToClipboard([comment], `Copied Pin #${comment.number} prompt!`);
    });

    // Delete Comment button
    const deleteBtn = card.querySelector('.aifl-icon-btn.delete');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        state.comments = await window.AIFLStorage.deleteComment(comment.id);
        elementCache.delete(comment.id);
        state.selectedPinIds.delete(comment.id);
        if (state.focusedCommentId === comment.id) {
          state.focusedCommentId = null;
          ui.focusBox.classList.remove('visible');
        }
        renderAll();
        showToast('Deleted comment');
      });
    }

    return card;
  }

  async function copyPromptToClipboard(commentsList, customMessage = null) {
    if (!commentsList || commentsList.length === 0) {
      showToast('No comments to copy yet');
      return;
    }

    const promptText = window.AIFLPromptGenerator.generateAIPrompt(commentsList, {
      mode: state.promptMode
    });

    try {
      await navigator.clipboard.writeText(promptText);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = promptText;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }

    const msg =
      customMessage ||
      `Copied ${commentsList.length} comment${commentsList.length === 1 ? '' : 's'} as AI prompt!`;
    showToast(msg);

    if (ui.btnCopyLabel) {
      const orig = ui.btnCopyLabel.textContent;
      ui.btnCopyLabel.textContent = '✓ Copied!';
      setTimeout(() => {
        if (ui.btnCopyLabel) ui.btnCopyLabel.textContent = orig;
      }, 1800);
    }
  }

  function downloadPromptMarkdown(commentsList) {
    if (!commentsList || commentsList.length === 0) {
      showToast('No comments to export yet');
      return;
    }

    const promptText = window.AIFLPromptGenerator.generateAIPrompt(commentsList, {
      mode: state.promptMode
    });

    const blob = new Blob([promptText], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const hostSlug = (window.location.hostname || 'local-page').replace(/[^a-z0-9_-]/gi, '-');
    a.href = url;
    a.download = `ai-feedback-${hostSlug}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast('Downloaded AI Feedback Markdown');
  }

  function showToast(message) {
    if (!ui.toast) return;
    ui.toast.textContent = message;
    ui.toast.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      ui.toast.classList.remove('visible');
    }, 2600);
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Listen for toggle message from background service worker
  if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg && msg.type === 'TOGGLE_FEEDBACK_LOOP') {
        toggleToolbar();
        sendResponse({ ok: true });
      }
      return true;
    });
  }

  // Auto-discover live collab session and restore UI on load
  (async function initOnLoad() {
    let sessionState = null;
    try {
      sessionState = sessionStorage.getItem('aifl_toolbar_open');
    } catch {
      // Ignore
    }

    if (isGuestMode) {
      await ensureMounted();
      if (state.tornDown) return;
      if (sessionState !== '0') {
        setToolbarVisible(true);
      }
      renderAll();
    }

    if (window.AIFLStorage?.initLiveSession) {
      await window.AIFLStorage.initLiveSession();
    }
    if (state.tornDown) return;

    const existing = await window.AIFLStorage.loadComments();
    const session = getSession();

    const shouldShow =
      isGuestMode
        ? sessionState !== '0'
        : sessionState === '1' ||
          (session.connected && sessionState !== '0') ||
          (existing.length > 0 && sessionState !== '0');

    if (existing.length > 0 || shouldShow || session.connected) {
      await ensureMounted();
      if (state.tornDown) return;
      state.comments = existing;
      if (shouldShow) {
        setToolbarVisible(true);
      }
      renderAll();
    }
  })();
})();
