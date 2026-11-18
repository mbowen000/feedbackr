/**
 * Main Content Script for AI Feedback Loop.
 * Manages the Shadow DOM UI, element inspector, pin rendering/anchoring,
 * right-hand comment drawer, and clipboard/markdown export.
 */
(() => {
  if (window.__AIFeedbackLoopLoaded) return;
  window.__AIFeedbackLoopLoaded = true;

  const state = {
    mounted: false,
    toolbarVisible: false,
    inspecting: false,
    pinDropMode: 'element', // 'element' | 'free'
    ctrlHeld: false,
    lastMousePos: { x: 0, y: 0 },
    drawerOpen: false,
    comments: [],
    focusedCommentId: null,
    pendingPin: null, // { element, context, clientX, clientY }
    filterScope: 'all', // 'all' | 'screen'
    promptMode: 'standard', // 'standard' | 'compact'
    confirmingClearToolbar: false,
    confirmingClearDrawer: false,
    hoveredElement: null
  };

  let hostEl = null;
  let shadowRoot = null;
  let ui = {};
  let rafId = null;
  let clearConfirmTimer = null;
  let focusHighlightTimer = null;
  let toastTimer = null;

  // Map of comment.id -> live DOM element cache
  const elementCache = new Map();

  /**
   * Mounts the isolated Shadow DOM container and loads styles.
   */
  async function ensureMounted() {
    if (state.mounted && hostEl && document.documentElement.contains(hostEl)) {
      return;
    }

    hostEl = document.createElement('div');
    hostEl.id = 'ai-feedback-loop-host';
    hostEl.style.cssText =
      'all: initial !important; position: fixed !important; inset: 0 !important; pointer-events: none !important; z-index: 2147483640 !important;';
    shadowRoot = hostEl.attachShadow({ mode: 'open' });

    // Load CSS into Shadow DOM
    let cssText = '';
    try {
      const cssUrl = chrome.runtime.getURL('content/styles.css');
      const res = await fetch(cssUrl);
      cssText = await res.text();
    } catch (err) {
      console.warn('AI Feedback Loop: Could not fetch styles.css', err);
    }

    const styleEl = document.createElement('style');
    styleEl.textContent = cssText;
    shadowRoot.appendChild(styleEl);

    // Build Shadow DOM structure
    const container = document.createElement('div');
    container.className = 'aifl-layer';
    container.innerHTML = `
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

      <!-- Floating Control Bar -->
      <div class="aifl-toolbar hidden" id="aifl-toolbar">
        <div class="aifl-drag-handle" id="aifl-drag-handle" title="Drag to reposition">
          <span class="aifl-brand-dot"></span>
          <span>AI Feedback Loop</span>
        </div>

        <button class="aifl-btn aifl-btn-primary" id="aifl-btn-add" title="Hover elements to highlight (hold Ctrl for free-drop pin)">
          <span id="aifl-btn-add-label">+ Add Comment</span>
        </button>

        <button class="aifl-btn" id="aifl-btn-drawer" title="Open comments drawer">
          <span>Comments</span>
          <span class="aifl-badge" id="aifl-toolbar-count">0</span>
        </button>

        <button class="aifl-btn" id="aifl-btn-copy" title="Copy all comments as an AI prompt">
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

      <!-- Right-Hand Slide-Out Drawer -->
      <aside class="aifl-drawer" id="aifl-drawer">
        <div class="aifl-drawer-header">
          <div class="aifl-drawer-title-row">
            <h2 class="aifl-drawer-title">
              <span class="aifl-brand-dot"></span>
              <span>AI Feedback Loop</span>
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
      toolbar: shadowRoot.getElementById('aifl-toolbar'),
      dragHandle: shadowRoot.getElementById('aifl-drag-handle'),
      toolbarGripper: shadowRoot.getElementById('aifl-toolbar-gripper'),
      btnAdd: shadowRoot.getElementById('aifl-btn-add'),
      btnAddLabel: shadowRoot.getElementById('aifl-btn-add-label'),
      btnDrawer: shadowRoot.getElementById('aifl-btn-drawer'),
      toolbarCount: shadowRoot.getElementById('aifl-toolbar-count'),
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
      drawerBody: shadowRoot.getElementById('aifl-drawer-body'),
      previewPre: shadowRoot.getElementById('aifl-preview-pre'),
      drawerCopy: shadowRoot.getElementById('aifl-drawer-copy'),
      drawerExportMd: shadowRoot.getElementById('aifl-drawer-export-md'),
      drawerClear: shadowRoot.getElementById('aifl-drawer-clear'),
      toast: shadowRoot.getElementById('aifl-toast')
    };

    bindUIEvents();
    state.mounted = true;
  }

  /**
   * Binds event listeners inside the Shadow DOM and page-level listeners.
   */
  function bindUIEvents() {
    // Toolbar & Popover draggable support (header/handle + bottom-right 3-dot gripper)
    setupFloatingDrag([ui.dragHandle, ui.toolbarGripper], ui.toolbar);
    setupFloatingDrag([ui.popoverGripper, ui.popoverHeader], ui.popover);

    // Add Comment button
    ui.btnAdd.addEventListener('click', () => {
      setInspecting(!state.inspecting);
    });

    // Toggle Drawer button
    ui.btnDrawer.addEventListener('click', () => {
      setDrawerOpen(!state.drawerOpen);
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

    // Page-level mousemove, click & key events for Inspect Mode (including holding Ctrl to toggle Free Pin mode)
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

    // Reposition pins on scroll, resize, hash/history change, and DOM mutations (accordions/menus/tabs)
    window.addEventListener('scroll', schedulePinPositionUpdate, true);
    window.addEventListener('resize', schedulePinPositionUpdate, true);
    window.addEventListener('hashchange', onRouteOrDomChange);
    window.addEventListener('popstate', onRouteOrDomChange);

    const observer = new MutationObserver(() => {
      schedulePinPositionUpdate();
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['open', 'class', 'style', 'aria-expanded', 'aria-selected', 'hidden', 'data-state']
    });

    // Sync across tabs or storage updates
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local') {
        const key = window.AIFLStorage.getSiteKey();
        if (changes[key]) {
          state.comments = Array.isArray(changes[key].newValue) ? changes[key].newValue : [];
          elementCache.clear();
          renderAll();
        }
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
    elementCache.clear();
    ui.focusBox.classList.remove('visible');
    renderAll();
    showToast('Cleared all comments');
  }

  /**
   * Makes any floating element (toolbar, prompt popover) draggable via one or more handles
   * (e.g. header bar and bottom-right 3-dot gripper).
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
        // Ignore clicks on close buttons inside a header handle
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

  /**
   * Returns true when holding Ctrl while in drop-a-pin mode (Free-Drop dangling pin).
   * Default is always the DevTools-style DOM element highlighter.
   */
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
    }
  }

  function setDrawerOpen(open) {
    state.drawerOpen = open;
    if (!ui.drawer) return;
    ui.drawer.classList.toggle('open', open);
    if (open) {
      renderDrawer();
    } else {
      ui.focusBox.classList.remove('visible');
    }
  }

  /**
   * Updates the visual inspect overlay (either Element Picker box or Free-Drop Coordinate reticle)
   * at the current cursor position.
   */
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

      // Keep label inside viewport near right edge
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

    // Flip label inside box if near top of viewport
    ui.hoverLabel.style.top = rect.top < 32 ? '4px' : '-28px';
  }

  /**
   * Handles mouse hover while in "Add Comment" inspect mode.
   */
  function onPageMouseMove(e) {
    state.lastMousePos = { x: e.clientX, y: e.clientY };
    if (e.ctrlKey !== state.ctrlHeld) {
      state.ctrlHeld = Boolean(e.ctrlKey);
      updateModeIndicator();
    }
    if (!state.inspecting || state.pendingPin) return;

    // Ignore events originating inside our own Shadow DOM host
    if (e.composedPath().includes(hostEl)) {
      ui.hoverBox.classList.remove('visible');
      ui.freeCursor?.classList.remove('visible');
      state.hoveredElement = null;
      return;
    }

    refreshInspectOverlay();
  }

  /**
   * Handles page click when dropping a pin in "Add Comment" mode
   * (supports both Element Picker and Free-Drop Coordinate Pin).
   */
  function onPageClick(e) {
    if (!state.inspecting) return;

    // Allow clicks inside our own UI
    if (e.composedPath().includes(hostEl)) return;

    // Sync Ctrl key state on click
    if (e.ctrlKey !== state.ctrlHeld) {
      state.ctrlHeld = Boolean(e.ctrlKey);
      updateModeIndicator();
    }

    // Allow Shift+Click to pass through so user can open accordions, dropdowns, tabs, or modals!
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
    // Fallback shortcut Alt+Shift+F directly in page
    if (e.altKey && e.shiftKey && (e.key === 'F' || e.key === 'f')) {
      e.preventDefault();
      toggleToolbar();
      return;
    }

    if ((e.key === 'Control' || e.ctrlKey) && !state.ctrlHeld) {
      state.ctrlHeld = true;
      updateModeIndicator();
      if (state.inspecting) refreshInspectOverlay();
    }

    if (e.key === 'Escape') {
      if (state.pendingPin) {
        closePopover();
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

  /**
   * Opens the floating Prompt popover where the user can create a new pin comment
   * (or edit an existing pin) and drag the prompt around via the bottom-right 3-dot gripper.
   */
  function openQuickAddPopover(element, context, clientX, clientY) {
    const isFree = Boolean(context?.target?.isFreePin);
    state.pendingPin = { mode: 'create', element, context, clientX, clientY };
    ui.popoverBadge.textContent = `Pin #${state.comments.length + 1}${isFree ? ' • Free' : ''}`;
    ui.popoverTarget.textContent = context.target.shortLabel || context.target.tagName;
    ui.popoverSave.textContent = 'Save Pin';
    ui.popoverTextarea.value = '';

    positionPopoverNear(clientX, clientY);
    ui.popover.classList.add('visible');

    // Highlight target element or coordinate spot while typing comment
    if (isFree) {
      positionCoordinateFocusRing(clientX, clientY);
    } else if (element) {
      positionFocusBox(element);
    }

    setTimeout(() => {
      ui.popoverTextarea.focus();
    }, 20);
  }

  /**
   * Opens the floating Prompt popover for an existing saved pin so you can edit & save it
   * directly in the floating box (and move it around with the 3-dot gripper).
   */
  function openEditPinPopover(comment, anchorX, anchorY) {
    const isFree = Boolean(comment.target?.isFreePin);
    const el = isFree ? null : (elementCache.get(comment.id) || window.AIFLPromptGenerator.resolveTargetElement(comment));
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
    // Leave room for the right-hand drawer if it's open
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
    elementCache.clear();
    renderAll();
  }

  function getVisibleScopeComments() {
    return state.comments;
  }

  function getFilteredComments() {
    if (state.filterScope === 'screen') {
      const currentRoute = window.AIFLStorage.getRouteKey();
      return state.comments.filter((c) => c.screen?.routeKey === currentRoute);
    }
    return state.comments;
  }

  /**
   * Renders toolbar badges, floating pin bubbles on the page, and the drawer list.
   */
  function renderAll() {
    if (!state.mounted) return;
    const count = state.comments.length;
    ui.toolbarCount.textContent = String(count);
    ui.drawerCount.textContent = String(count);

    renderPins();
    if (state.drawerOpen) {
      renderDrawer();
    }
  }

  /**
   * Renders the numbered pin chat bubbles on the current screen,
   * each with a bottom-right 3-dot gripper so the user can drag & move it around.
   */
  function renderPins() {
    if (!ui.pinsContainer) return;
    if (!state.toolbarVisible) {
      ui.pinsContainer.innerHTML = '';
      ui.pinsContainer.style.display = 'none';
      return;
    }
    ui.pinsContainer.style.display = 'block';
    const currentRoute = window.AIFLStorage.getRouteKey();
    const routeComments = state.comments.filter((c) => c.screen?.routeKey === currentRoute);

    ui.pinsContainer.innerHTML = '';

    for (const comment of routeComments) {
      const isFree = Boolean(comment.target?.isFreePin || comment.target?.pinType === 'free');
      const pinEl = document.createElement('div');
      pinEl.className = `aifl-pin${isFree ? ' free-pin' : ''}${state.focusedCommentId === comment.id ? ' active' : ''}`;
      pinEl.dataset.commentId = comment.id;
      pinEl.title = isFree
        ? 'Free Coordinate Pin • Click to edit / view • Drag to move pin'
        : 'Element Pin • Click to edit / view • Drag to move pin';

      const numSpan = document.createElement('span');
      numSpan.className = 'aifl-pin-num';
      numSpan.textContent = String(comment.number);
      pinEl.appendChild(numSpan);

      // Bottom-right 3-dot gripper on the chat bubble
      const pinGripper = document.createElement('div');
      pinGripper.className = 'aifl-pin-gripper';
      pinGripper.title = 'Drag to reposition pin';
      pinGripper.innerHTML = '<i></i><i></i><i></i>';
      pinEl.appendChild(pinGripper);

      const tooltip = document.createElement('div');
      tooltip.className = 'aifl-pin-tooltip';
      tooltip.textContent = comment.text || `Pin #${comment.number}`;
      pinEl.appendChild(tooltip);

      setupPinDragAndClick(pinEl, comment);

      ui.pinsContainer.appendChild(pinEl);
    }

    updatePinPositions();
  }

  /**
   * Enables dragging a pin bubble around the viewport (via the bubble or its 3-dot gripper)
   * and persists its new position on drop. Clicking without dragging opens both the floating
   * edit prompt and focuses the comment in the right-hand drawer.
   */
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

      if (didDrag && comment._draggingPos) {
        const finalX = comment._draggingPos.x;
        const finalY = comment._draggingPos.y;
        delete comment._draggingPos;

        // Calculate updated offset relative to the target element (if connected) + page coords
        const isFree = Boolean(comment.target?.isFreePin || comment.target?.pinType === 'free');
        const el = isFree ? null : (elementCache.get(comment.id) || window.AIFLPromptGenerator.resolveTargetElement(comment));
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
      // Normal click on the pin bubble: open floating edit prompt AND focus in drawer
      const clickX = parseFloat(pinEl.style.left) || e.clientX;
      const clickY = parseFloat(pinEl.style.top) || e.clientY;
      focusComment(comment.id, { openDrawer: true, scrollCardIntoView: true });
      openEditPinPopover(comment, clickX, clickY);
    };
  }

  function schedulePinPositionUpdate() {
    if (!state.mounted) return;
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      updatePinPositions();
    });
  }

  /**
   * Updates the (x, y) viewport coordinates of every pin on the current screen.
   * Dynamically hides pins whose target elements are inside collapsed accordions/menus/tabs
   * and shows them again as soon as the container opens.
   */
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

      // Free-Drop arbitrary coordinate pins stay locked to their page (x, y) coordinates
      if (comment.target?.isFreePin || comment.target?.pinType === 'free') {
        const pageX = comment.target?.pageCoords?.x ?? 100;
        const pageY = comment.target?.pageCoords?.y ?? 100;
        pinNode.style.display = 'flex';
        pinNode.style.left = `${Math.round(pageX - window.scrollX)}px`;
        pinNode.style.top = `${Math.round(pageY - window.scrollY)}px`;
        return;
      }

      let el = elementCache.get(id);
      if (!el || !el.isConnected) {
        el = window.AIFLPromptGenerator.resolveTargetElement(comment);
        if (el) elementCache.set(id, el);
      }

      if (el) {
        const visible = window.AIFLPromptGenerator.isElementCurrentlyVisible(el);
        if (!visible) {
          pinNode.style.display = 'none';
          return;
        }
        const rect = el.getBoundingClientRect();
        const ratioX = comment.target?.offsetRatio?.x ?? 0.5;
        const ratioY = comment.target?.offsetRatio?.y ?? 0.5;
        const customDx = comment.target?.pinOffset?.dx ?? 0;
        const customDy = comment.target?.pinOffset?.dy ?? 0;
        const x = rect.left + rect.width * ratioX + customDx;
        const y = rect.top + rect.height * ratioY + customDy;

        pinNode.style.display = 'flex';
        pinNode.style.left = `${Math.round(x)}px`;
        pinNode.style.top = `${Math.round(y)}px`;
      } else {
        // Fallback to page coordinates if no interactive ancestors were required
        const hasInteractiveAncestors =
          Array.isArray(comment.target?.interactiveAncestors) &&
          comment.target.interactiveAncestors.length > 0;
        if (hasInteractiveAncestors) {
          pinNode.style.display = 'none';
          return;
        }
        const pageX = comment.target?.pageCoords?.x ?? 100;
        const pageY = comment.target?.pageCoords?.y ?? 100;
        pinNode.style.display = 'flex';
        pinNode.style.left = `${Math.round(pageX - window.scrollX)}px`;
        pinNode.style.top = `${Math.round(pageY - window.scrollY)}px`;
      }
    });

    // Update focus highlight box if active
    if (state.focusedCommentId && (state.drawerOpen || state.pendingPin)) {
      const focusedComment = state.comments.find((c) => c.id === state.focusedCommentId);
      if (focusedComment) {
        if (focusedComment.target?.isFreePin || focusedComment.target?.pinType === 'free') {
          const pageX = focusedComment.target?.pageCoords?.x ?? 100;
          const pageY = focusedComment.target?.pageCoords?.y ?? 100;
          positionCoordinateFocusRing(pageX - window.scrollX, pageY - window.scrollY);
        } else {
          const el = elementCache.get(focusedComment.id) || window.AIFLPromptGenerator.resolveTargetElement(focusedComment);
          if (el && window.AIFLPromptGenerator.isElementCurrentlyVisible(el)) {
            positionFocusBox(el);
          } else {
            ui.focusBox.classList.remove('visible');
          }
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

  /**
   * Focuses a specific comment (from clicking a pin bubble or a card in the drawer).
   */
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
    const isFree = Boolean(comment.target?.isFreePin || comment.target?.pinType === 'free');

    if (isSameRoute) {
      if (isFree) {
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
      } else {
        let el = elementCache.get(commentId) || window.AIFLPromptGenerator.resolveTargetElement(comment);

        // If user clicked "Locate" in drawer and element is inside a closed accordion/details, try revealing it!
        if (options.revealIfHidden && (!el || !window.AIFLPromptGenerator.isElementCurrentlyVisible(el))) {
          el = window.AIFLPromptGenerator.tryRevealTargetElement(comment);
          if (el) elementCache.set(commentId, el);
        }

        if (el && window.AIFLPromptGenerator.isElementCurrentlyVisible(el)) {
          if (options.scrollElementIntoView) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
          }
          positionFocusBox(el);
          clearTimeout(focusHighlightTimer);
          focusHighlightTimer = setTimeout(() => {
            if (!state.drawerOpen) ui.focusBox.classList.remove('visible');
          }, 3500);
        }
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
   * Renders the right-hand slide-out drawer contents and live AI prompt preview.
   */
  function renderDrawer() {
    if (!ui.drawerBody) return;

    const currentRoute = window.AIFLStorage.getRouteKey();
    const allCount = state.comments.length;
    const screenCount = state.comments.filter((c) => c.screen?.routeKey === currentRoute).length;

    ui.tabAll.textContent = `All Screens (${allCount})`;
    ui.tabScreen.textContent = `This Screen (${screenCount})`;
    ui.tabAll.classList.toggle('active', state.filterScope === 'all');
    ui.tabScreen.classList.toggle('active', state.filterScope === 'screen');

    ui.modeStandard.classList.toggle('active', state.promptMode === 'standard');
    ui.modeCompact.classList.toggle('active', state.promptMode === 'compact');

    const filtered = getFilteredComments();
    ui.drawerBody.innerHTML = '';

    if (filtered.length === 0) {
      const emptyEl = document.createElement('div');
      emptyEl.className = 'aifl-empty-state';
      emptyEl.innerHTML = `
        <div class="aifl-empty-icon">📌</div>
        <div class="aifl-empty-title">No comments ${state.filterScope === 'screen' ? 'on this screen' : 'yet'}</div>
        <div class="aifl-empty-desc">
          Click <strong>+ Add Comment</strong> and select any element on the page to leave feedback for your AI agent.
        </div>
      `;
      const startBtn = document.createElement('button');
      startBtn.className = 'aifl-btn aifl-btn-primary';
      startBtn.textContent = '+ Add First Comment';
      startBtn.addEventListener('click', () => {
        setDrawerOpen(false);
        setToolbarVisible(true);
        setInspecting(true);
      });
      emptyEl.appendChild(startBtn);
      ui.drawerBody.appendChild(emptyEl);
    } else {
      for (const comment of filtered) {
        const card = createCommentCard(comment, currentRoute);
        ui.drawerBody.appendChild(card);
      }
    }

    // Update live prompt preview & copy button label
    const promptText = window.AIFLPromptGenerator.generateAIPrompt(filtered, {
      mode: state.promptMode
    });
    ui.previewPre.textContent = promptText;
    ui.drawerCopy.textContent = `Copy ${filtered.length} Comment${filtered.length === 1 ? '' : 's'} as AI Prompt`;
  }

  /**
   * Creates an individual comment card inside the Drawer.
   */
  function createCommentCard(comment, currentRoute) {
    const t = comment.target || {};
    const isFree = Boolean(t.isFreePin || t.pinType === 'free');
    const isSameRoute = comment.screen?.routeKey === currentRoute;
    const liveEl = isSameRoute && !isFree
      ? elementCache.get(comment.id) || window.AIFLPromptGenerator.resolveTargetElement(comment)
      : null;
    const isVisibleNow = isSameRoute && (isFree || (liveEl && window.AIFLPromptGenerator.isElementCurrentlyVisible(liveEl)));

    const card = document.createElement('div');
    card.className = `aifl-card${state.focusedCommentId === comment.id ? ' focused' : ''}`;
    card.dataset.cardId = comment.id;

    let statusBadgeHtml = '';
    if (!isSameRoute) {
      statusBadgeHtml = `<span class="aifl-status-pill other-screen" title="Dropped on ${escapeHtml(comment.screen?.routeKey || '')}">Other Screen</span>`;
    } else if (isFree) {
      statusBadgeHtml = `<span class="aifl-status-pill" style="background: rgba(16, 185, 129, 0.16); color: #6ee7b7; border: 1px solid rgba(16, 185, 129, 0.35);" title="Arbitrary coordinate pin">📍 Free Pin</span>`;
    } else if (!isVisibleNow) {
      statusBadgeHtml = `<span class="aifl-status-pill hidden-el" title="Target is currently hidden (e.g. inside a closed accordion, menu, or tab)">Collapsed/Hidden</span>`;
    }

    const screenDisplay = comment.screen?.activeScreenLabel
      ? `${comment.screen.routeKey} • ${comment.screen.activeScreenLabel}`
      : comment.screen?.routeKey || '/';

    const coordsSummary = t.pageCoords
      ? isFree
        ? `(${t.pageCoords.x}, ${t.pageCoords.y}) • ${t.viewportPct?.x ?? 0}% X, ${t.viewportPct?.y ?? 0}% Y${t.region ? ` • ${t.region}` : ''}`
        : `(${t.pageCoords.x}, ${t.pageCoords.y}) • ${t.viewportPct?.x ?? 0}% X, ${t.viewportPct?.y ?? 0}% Y • ${t.elementRect?.width ?? 0}×${t.elementRect?.height ?? 0}px`
      : '';

    card.innerHTML = `
      <div class="aifl-card-header">
        <div class="aifl-card-left">
          <span class="aifl-pin-badge" style="${isFree && state.focusedCommentId !== comment.id ? 'background: #059669;' : ''}">${comment.number}</span>
          <span class="aifl-screen-pill" title="${escapeHtml(screenDisplay)}">${escapeHtml(screenDisplay)}</span>
          ${statusBadgeHtml}
        </div>
        <div class="aifl-card-actions">
          <button class="aifl-icon-btn locate" title="${isSameRoute ? 'Scroll to & highlight pin location' : 'Navigate to screen'}">
            ${isSameRoute ? '🎯 Locate' : '↗ Go'}
          </button>
          <button class="aifl-icon-btn copy-one" title="Copy prompt for just this comment">📋</button>
          <button class="aifl-icon-btn delete" title="Delete comment">🗑</button>
        </div>
      </div>

      <textarea class="aifl-card-textarea" placeholder="Describe the change for the AI agent...">${escapeHtml(comment.text)}</textarea>

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
    `;

    // Focus card on click
    card.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      state.focusedCommentId = comment.id;
      card.parentElement?.querySelectorAll('.aifl-card').forEach((c) => c.classList.remove('focused'));
      card.classList.add('focused');
      renderPins();
      if (isSameRoute) {
        if (isFree && t.pageCoords) {
          positionCoordinateFocusRing(t.pageCoords.x - window.scrollX, t.pageCoords.y - window.scrollY);
        } else if (liveEl && window.AIFLPromptGenerator.isElementCurrentlyVisible(liveEl)) {
          positionFocusBox(liveEl);
        }
      }
    });

    // Live edit comment text
    const textarea = card.querySelector('.aifl-card-textarea');
    let saveTimer = null;
    textarea.addEventListener('keydown', (e) => e.stopPropagation());
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
    deleteBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      state.comments = await window.AIFLStorage.deleteComment(comment.id);
      elementCache.delete(comment.id);
      if (state.focusedCommentId === comment.id) {
        state.focusedCommentId = null;
        ui.focusBox.classList.remove('visible');
      }
      renderAll();
      showToast('Deleted comment');
    });

    return card;
  }

  /**
   * Copies generated AI prompt markdown to the user's clipboard.
   */
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
      // Fallback textarea copy
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
        ui.btnCopyLabel.textContent = orig;
      }, 1800);
    }
  }

  /**
   * Exports the generated AI prompt as a downloadable `.md` file.
   */
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
    }, 2400);
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
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.type === 'TOGGLE_FEEDBACK_LOOP') {
      toggleToolbar();
      sendResponse({ ok: true });
    }
    return true;
  });

  // Auto-restore pins (and toolbar if previously active or if pins exist and were not explicitly hidden) on page load
  (async function initOnLoad() {
    const existing = await window.AIFLStorage.loadComments();
    let sessionState = null;
    try {
      sessionState = sessionStorage.getItem('aifl_toolbar_open');
    } catch {
      // Ignore
    }

    const shouldShow = sessionState === '1' || (existing.length > 0 && sessionState !== '0');
    if (existing.length > 0 || shouldShow) {
      await ensureMounted();
      state.comments = existing;
      if (shouldShow) {
        setToolbarVisible(true);
      }
      renderAll();
    }
  })();
})();

