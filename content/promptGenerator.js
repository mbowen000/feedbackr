/**
 * Context extractor, DOM element locator, and AI Agent Prompt Generator
 * for AI Feedback Loop.
 */
(() => {
  if (window.AIFLPromptGenerator) return;

  const IGNORED_CLASSES = new Set([
    'active', 'hover', 'focus', 'focused', 'selected', 'open', 'opened',
    'closed', 'visible', 'hidden', 'show', 'showing', 'fade', 'in', 'out',
    'disabled', 'enabled', 'current'
  ]);

  function cleanText(str, maxLen = 140) {
    if (!str) return '';
    const normalized = String(str).replace(/\s+/g, ' ').trim();
    if (!normalized) return '';
    return normalized.length > maxLen
      ? `${normalized.slice(0, maxLen - 1).trim()}…`
      : normalized;
  }

  function isStableId(id) {
    if (!id || typeof id !== 'string') return false;
    if (id.startsWith('aifl-')) return false;
    // Avoid React/Radix/Ember generated ephemeral IDs like :r1:, radix-123, ember45
    if (/^(:r|radix-|headlessui-|ember\d|mui-\d|react-select-)/i.test(id)) return false;
    if (/^[0-9a-f]{16,}$/i.test(id)) return false;
    return true;
  }

  function getSemanticClasses(el, limit = 2) {
    if (!el || !el.classList) return [];
    const classes = [];
    for (const cls of el.classList) {
      if (!cls || cls.startsWith('aifl-')) continue;
      if (IGNORED_CLASSES.has(cls.toLowerCase())) continue;
      // Skip hashed CSS-in-JS classes like css-1a2b3c or sc-bdVaJa
      if (/^(css|sc|emotion|tw)-[a-z0-9]{5,}$/i.test(cls)) continue;
      if (/^[a-zA-Z0-9_-]{2,40}$/.test(cls)) {
        classes.push(cls);
      }
      if (classes.length >= limit) break;
    }
    return classes;
  }

  function getTestId(el) {
    if (!el || !el.getAttribute) return null;
    const attrs = ['data-testid', 'data-test-id', 'data-cy', 'data-qa', 'data-id', 'data-component'];
    for (const attr of attrs) {
      const val = el.getAttribute(attr);
      if (val) return `${attr}="${CSS.escape(val)}"`;
    }
    return null;
  }

  /**
   * Builds a readable, unambiguous CSS selector for an element.
   */
  function buildRobustSelector(el) {
    if (!el || el.nodeType !== 1) return 'body';

    if (isStableId(el.id)) {
      return `#${CSS.escape(el.id)}`;
    }

    const testId = getTestId(el);
    if (testId) {
      return `${el.tagName.toLowerCase()}[${testId}]`;
    }

    const parts = [];
    let current = el;
    let depth = 0;

    while (current && current.nodeType === 1 && current !== document.body && depth < 5) {
      const tag = current.tagName.toLowerCase();

      if (isStableId(current.id)) {
        parts.unshift(`#${CSS.escape(current.id)}`);
        break;
      }

      const currTestId = getTestId(current);
      if (currTestId) {
        parts.unshift(`${tag}[${currTestId}]`);
        break;
      }

      const classes = getSemanticClasses(current, 2);
      let segment = tag;
      if (classes.length > 0) {
        segment += `.${classes.map((c) => CSS.escape(c)).join('.')}`;
      }

      const parent = current.parentElement;
      if (parent) {
        const sameTagSiblings = Array.from(parent.children).filter(
          (child) => child.tagName === current.tagName
        );
        if (sameTagSiblings.length > 1) {
          const idx = sameTagSiblings.indexOf(current) + 1;
          segment += `:nth-of-type(${idx})`;
        }
      }

      parts.unshift(segment);

      // Check if current path is already unique in the document
      const candidate = parts.join(' > ');
      try {
        if (document.querySelectorAll(candidate).length === 1) {
          return candidate;
        }
      } catch {
        // Ignore invalid selector edge cases and continue walking up
      }

      current = parent;
      depth++;
    }

    return parts.join(' > ') || el.tagName.toLowerCase();
  }

  /**
   * Builds a short human-friendly label for the target element, e.g. `button.cta-primary#signup`
   */
  function buildShortElementLabel(el) {
    if (!el || el.nodeType !== 1) return 'element';
    const tag = el.tagName.toLowerCase();
    const idPart = isStableId(el.id) ? `#${el.id}` : '';
    const classes = getSemanticClasses(el, 2);
    const classPart = classes.length ? `.${classes.join('.')}` : '';
    return `${tag}${idPart}${classPart}`;
  }

  /**
   * Extracts own text or meaningful attribute value from an element.
   */
  function extractElementText(el) {
    if (!el || el.nodeType !== 1) return '';
    const tag = el.tagName.toLowerCase();

    if (tag === 'input' || tag === 'textarea') {
      const val = el.value || el.getAttribute('placeholder') || el.getAttribute('aria-label') || '';
      return cleanText(val, 120);
    }
    if (tag === 'img') {
      const srcFile = el.getAttribute('src')?.split('/').pop()?.split('?')[0] || '';
      const alt = el.getAttribute('alt') || srcFile || 'image';
      return cleanText(`[Image: "${alt}"${srcFile && srcFile !== alt ? ` (${srcFile})` : ''}]`, 120);
    }
    if (tag === 'svg' || el.closest('svg')) {
      const svgEl = tag === 'svg' ? el : el.closest('svg');
      const label =
        svgEl.getAttribute('aria-label') ||
        svgEl.querySelector('title')?.textContent ||
        svgEl.parentElement?.getAttribute('aria-label') ||
        svgEl.parentElement?.textContent ||
        'SVG graphic';
      return cleanText(`[Icon/SVG: "${label}"]`, 120);
    }

    // Check if element directly wraps an image with no text
    const directImg = el.querySelector?.(':scope > img');
    const raw = el.innerText || el.textContent || el.getAttribute('aria-label') || el.getAttribute('title') || '';
    if (!raw.trim() && directImg) {
      const srcFile = directImg.getAttribute('src')?.split('/').pop()?.split('?')[0] || '';
      const alt = directImg.getAttribute('alt') || srcFile || 'image';
      return cleanText(`[Image: "${alt}"${srcFile && srcFile !== alt ? ` (${srcFile})` : ''}]`, 120);
    }
    return cleanText(raw, 140);
  }

  /**
   * Uses caretRangeFromPoint / caretPositionFromPoint to detect the exact word/phrase
   * under the cursor when clicking inside a larger paragraph or text block.
   */
  function extractClickedPhrase(clientX, clientY, el) {
    if (!el || typeof clientX !== 'number' || typeof clientY !== 'number') return null;
    try {
      let textNode = null;
      let offset = 0;
      if (document.caretRangeFromPoint) {
        const range = document.caretRangeFromPoint(clientX, clientY);
        if (range && range.startContainer && range.startContainer.nodeType === 3) {
          textNode = range.startContainer;
          offset = range.startOffset || 0;
        }
      } else if (document.caretPositionFromPoint) {
        const pos = document.caretPositionFromPoint(clientX, clientY);
        if (pos && pos.offsetNode && pos.offsetNode.nodeType === 3) {
          textNode = pos.offsetNode;
          offset = pos.offset || 0;
        }
      }
      if (!textNode || !el.contains(textNode)) return null;
      const full = textNode.nodeValue || '';
      if (full.trim().length < 45) return null;
      const start = Math.max(0, offset - 22);
      const end = Math.min(full.length, offset + 28);
      const slice = cleanText(full.slice(start, end), 55);
      if (!slice) return null;
      return `${start > 0 ? '…' : ''}${slice}${end < full.length ? '…' : ''}`;
    } catch {
      return null;
    }
  }

  /**
   * Finds meaningful preceding and following sibling elements (ignoring empty/boilerplate wrappers)
   * and describes their tag and human-authored content.
   */
  function extractContentSiblings(el, ownText) {
    if (!el || el.nodeType !== 1) return { prevDesc: null, nextDesc: null };

    function describeSibling(node) {
      if (!node || node.nodeType !== 1) return null;
      if (node.id === 'ai-feedback-loop-host') return null;
      const tag = node.tagName.toLowerCase();
      if (tag === 'script' || tag === 'style' || tag === 'noscript') return null;

      // If node is a wrapper containing a heading or distinct first element, describe its primary content
      const text = extractElementText(node);
      if (!text || text === ownText) return null;
      const shortTag = buildShortElementLabel(node);
      return `\`<${shortTag}>\` ("${cleanText(text, 75)}")`;
    }

    let prevDesc = null;
    let nextDesc = null;

    // Search direct siblings first; if none have content, step up 1 wrapper level
    let scopeEl = el;
    for (let level = 0; level < 2 && scopeEl && scopeEl !== document.body; level++) {
      if (!prevDesc) {
        let p = scopeEl.previousElementSibling;
        while (p) {
          const d = describeSibling(p);
          if (d) {
            prevDesc = d;
            break;
          }
          p = p.previousElementSibling;
        }
      }
      if (!nextDesc) {
        let n = scopeEl.nextElementSibling;
        while (n) {
          const d = describeSibling(n);
          if (d) {
            nextDesc = d;
            break;
          }
          n = n.nextElementSibling;
        }
      }
      if (prevDesc || nextDesc) break;
      scopeEl = scopeEl.parentElement;
    }

    return { prevDesc, nextDesc };
  }

  /**
   * Builds a fast, compact "Page Content Landscape" of visible human-authored content
   * (headings, copy, images, interactive controls — skipping boilerplate HTML/JS)
   * and identifies which Landmark [L1..Ln] owns or is nearest to `targetEl`.
   */
  function capturePageContentLandscape(targetEl, fallbackCoords = null) {
    const candidateSelectors = [
      'header',
      'nav',
      'main > section',
      'main > article',
      'main > div',
      'section',
      'article',
      'details',
      'form',
      'dialog[open]',
      '[role="dialog"]',
      '[data-screen]',
      '[data-slide]',
      '[class*="hero"]',
      '[class*="card"]',
      'footer'
    ].join(', ');

    const rawRegions = Array.from(document.querySelectorAll(candidateSelectors)).filter((node) => {
      if (!node || node.id === 'ai-feedback-loop-host' || node.closest('#ai-feedback-loop-host')) return false;
      if (!isElementCurrentlyVisible(node)) return false;
      const rect = node.getBoundingClientRect();
      return rect.width >= 60 && rect.height >= 24;
    });

    // Deduplicate nested regions: keep distinct content blocks without redundant outer wrappers
    const selectedNodes = [];
    for (const node of rawRegions) {
      // If an already-selected node is a close wrapper with identical text, skip
      const nodeText = cleanText(node.innerText || node.textContent, 160);
      const hasImg = Boolean(node.querySelector('img'));
      if (!nodeText && !hasImg) continue;

      const duplicate = selectedNodes.some((existing) => {
        if (existing === node) return true;
        const existingText = cleanText(existing.innerText || existing.textContent, 160);
        return existingText && existingText === nodeText && (existing.contains(node) || node.contains(existing));
      });
      if (!duplicate) {
        selectedNodes.push(node);
      }
    }

    // Sort in visual reading order (top-to-bottom, left-to-right)
    selectedNodes.sort((a, b) => {
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      if (Math.abs(ra.top - rb.top) > 16) return ra.top - rb.top;
      return ra.left - rb.left;
    });

    const capped = selectedNodes.slice(0, 12);
    const landscape = [];
    let matchedLandmark = null;
    let bestMatchDepth = -1;
    let bestDist = Infinity;

    capped.forEach((node, idx) => {
      const id = `L${idx + 1}`;
      const containerTag = `<${buildShortElementLabel(node)}>`;

      // Extract custom content inside this landmark (headings, copy, images, controls)
      const headingEl = node.querySelector('h1, h2, h3, h4, summary, legend, [role="heading"]');
      const headingText = headingEl
        ? cleanText(headingEl.innerText || headingEl.textContent, 65)
        : /^H[1-6]$/.test(node.tagName)
        ? cleanText(node.innerText || node.textContent, 65)
        : null;

      const copyEls = Array.from(node.querySelectorAll('p, li, blockquote')).slice(0, 2);
      const copySnippets = copyEls
        .map((p) => cleanText(p.innerText || p.textContent, 60))
        .filter((t) => t && t !== headingText);

      const imgEls = Array.from(node.querySelectorAll('img')).slice(0, 2);
      const imgSnippets = imgEls.map((img) => {
        const alt = cleanText(img.getAttribute('alt') || '', 35);
        const src = img.getAttribute('src')?.split('/').pop()?.split('?')[0] || 'img';
        return alt ? `"${alt}" (${src})` : src;
      });

      const ctrlEls = Array.from(
        node.querySelectorAll('button, a, [role="tab"], input[type="submit"], input[placeholder]')
      ).slice(0, 4);
      const ctrlSnippets = ctrlEls
        .map((c) => {
          const t = cleanText(c.innerText || c.textContent || c.getAttribute('placeholder') || c.getAttribute('aria-label'), 30);
          if (!t) return null;
          const isActive =
            c.classList.contains('active') ||
            c.getAttribute('aria-selected') === 'true' ||
            c.getAttribute('aria-expanded') === 'true';
          return `"${t}"${isActive ? ' (active)' : ''}`;
        })
        .filter(Boolean);

      const parts = [];
      if (headingText) {
        const hTag = headingEl ? headingEl.tagName.toLowerCase() : 'heading';
        parts.push(`${hTag}: "${headingText}"`);
      }
      if (copySnippets.length > 0) {
        parts.push(`Copy: ${copySnippets.map((s) => `"${s}"`).join(' / ')}`);
      }
      if (imgSnippets.length > 0) {
        parts.push(`Images: [${imgSnippets.join(', ')}]`);
      }
      if (ctrlSnippets.length > 0) {
        parts.push(`Controls: [${ Array.from(new Set(ctrlSnippets)).join(', ') }]`);
      }
      if (parts.length === 0) {
        const fallback = cleanText(node.innerText || node.textContent, 75);
        if (fallback) parts.push(`Text: "${fallback}"`);
      }

      const title = headingText || copySnippets[0] || containerTag;
      const item = {
        id,
        container: containerTag,
        title,
        summary: parts.join(' • ')
      };
      landscape.push(item);

      // Check if `targetEl` is inside this landmark (preferring most specific nested landmark)
      if (targetEl && (node === targetEl || node.contains(targetEl))) {
        let depth = 0;
        let p = node;
        while (p && p !== document.body) {
          depth++;
          p = p.parentElement;
        }
        if (depth >= bestMatchDepth) {
          bestMatchDepth = depth;
          matchedLandmark = item;
        }
      } else if (!matchedLandmark && fallbackCoords) {
        const rect = node.getBoundingClientRect();
        const dx =
          fallbackCoords.clientX < rect.left
            ? rect.left - fallbackCoords.clientX
            : fallbackCoords.clientX > rect.right
            ? fallbackCoords.clientX - rect.right
            : 0;
        const dy =
          fallbackCoords.clientY < rect.top
            ? rect.top - fallbackCoords.clientY
            : fallbackCoords.clientY > rect.bottom
            ? fallbackCoords.clientY - rect.bottom
            : 0;
        const dist = Math.hypot(dx, dy);
        if (dist < bestDist) {
          bestDist = dist;
          matchedLandmark = item;
        }
      }
    });

    return { landscape, matchedLandmark };
  }

  /**
   * Synthesizes a natural-language placement summary describing what content the pin is on,
   * which landmark it belongs to, and what sibling content precedes/follows it.
   */
  function buildPlacementNarrative({
    isFreePin,
    shortLabel,
    textSnippet,
    clickedPhrase,
    prevDesc,
    nextDesc,
    matchedLandmark,
    sectionHeading,
    pageCoords,
    viewportPct,
    region,
    spatialLandmarks
  }) {
    const landmarkPrefix = matchedLandmark
      ? `Inside landmark [${matchedLandmark.id}] (${matchedLandmark.container}${matchedLandmark.title && matchedLandmark.title !== matchedLandmark.container ? ` — "${matchedLandmark.title}"` : ''})`
      : sectionHeading
      ? `Under section "${sectionHeading}"`
      : 'On this screen';

    if (isFreePin) {
      const coordPart = `at page coordinate (${pageCoords.x}, ${pageCoords.y}) (${region || 'Viewport'}, ${viewportPct.x}% X, ${viewportPct.y}% Y)`;
      const nearPart =
        Array.isArray(spatialLandmarks) && spatialLandmarks.length > 0
          ? `, positioned ${spatialLandmarks.join(' and ')}`
          : '';
      return `${landmarkPrefix} ${coordPart}${nearPart}.`;
    }

    const contentPart = textSnippet
      ? `containing the content "${textSnippet}"${clickedPhrase ? ` (specifically clicked near "${clickedPhrase}")` : ''}`
      : 'with no inner text';

    const siblingClauses = [];
    if (prevDesc) siblingClauses.push(`immediately follows sibling ${prevDesc}`);
    if (nextDesc) siblingClauses.push(`immediately precedes sibling ${nextDesc}`);
    const siblingPart = siblingClauses.length > 0 ? `, which ${siblingClauses.join(' and ')}` : '';

    return `${landmarkPrefix}, targeting \`<${shortLabel}>\` ${contentPart}${siblingPart}.`;
  }

  /**
   * Finds the nearest heading (`h1`-`h6`, `[role="heading"]`, `legend`, etc.) that contextualizes this element.
   */
  function findNearestHeading(el) {
    if (!el || el.nodeType !== 1) return null;

    // 1. Check if element itself is a heading
    if (/^H[1-6]$/.test(el.tagName) || el.getAttribute('role') === 'heading') {
      return cleanText(el.innerText || el.textContent, 90);
    }

    // 2. Walk up ancestors and search for preceding sibling headings or first heading child
    let curr = el;
    let depth = 0;
    while (curr && curr !== document.body && depth < 7) {
      let prev = curr.previousElementSibling;
      while (prev) {
        if (/^H[1-6]$/.test(prev.tagName) || prev.getAttribute('role') === 'heading') {
          const text = cleanText(prev.innerText || prev.textContent, 90);
          if (text) return text;
        }
        const nestedHeading = prev.querySelector?.('h1, h2, h3, h4, [role="heading"]');
        if (nestedHeading) {
          const text = cleanText(nestedHeading.innerText || nestedHeading.textContent, 90);
          if (text) return text;
        }
        prev = prev.previousElementSibling;
      }

      const parent = curr.parentElement;
      if (parent) {
        const directHeading = parent.querySelector(
          ':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > header h1, :scope > header h2, :scope > header h3, :scope > legend, :scope > summary'
        );
        if (directHeading && directHeading !== el) {
          const text = cleanText(directHeading.innerText || directHeading.textContent, 90);
          if (text) return text;
        }
      }
      curr = parent;
      depth++;
    }

    // Fallback to top visible H1/H2 on page
    const pageHeading = document.querySelector('h1, h2');
    return pageHeading ? cleanText(pageHeading.innerText || pageHeading.textContent, 90) : null;
  }

  /**
   * Finds nearby sibling/parent text to help an AI agent disambiguate similar elements.
   */
  function extractNearbyContext(el, ownText) {
    if (!el || el.nodeType !== 1) return { landmark: null, nearbyText: '' };

    // Nearest semantic landmark
    const landmarkEl = el.closest(
      'section, article, nav, header, footer, aside, main, form, dialog, [role="dialog"], [role="region"], [role="navigation"], [role="tabpanel"], details, tr, li, [class*="card"], [class*="slide"], [class*="panel"]'
    );
    let landmark = null;
    if (landmarkEl && landmarkEl !== document.body) {
      const label =
        landmarkEl.getAttribute('aria-label') ||
        (isStableId(landmarkEl.id) ? `#${landmarkEl.id}` : '') ||
        getSemanticClasses(landmarkEl, 1)[0] ||
        '';
      landmark = `<${landmarkEl.tagName.toLowerCase()}${label ? (label.startsWith('#') ? label : `.${label}`) : ''}>`;
    }

    // Gather sibling or parent text snippets that differ from `ownText`
    const snippets = [];
    const prev = el.previousElementSibling;
    const next = el.nextElementSibling;

    if (prev) {
      const t = cleanText(prev.innerText || prev.textContent || prev.getAttribute('aria-label'), 60);
      if (t && t !== ownText) snippets.push(`Prev: "${t}"`);
    }
    if (next) {
      const t = cleanText(next.innerText || next.textContent || next.getAttribute('aria-label'), 60);
      if (t && t !== ownText) snippets.push(`Next: "${t}"`);
    }

    if (snippets.length === 0 && el.parentElement && el.parentElement !== document.body) {
      const parentText = cleanText(el.parentElement.innerText || el.parentElement.textContent, 110);
      if (parentText && parentText !== ownText) {
        snippets.push(`Container text: "${parentText}"`);
      }
    }

    return {
      landmark,
      nearbyText: snippets.join(' | ')
    };
  }

  /**
   * Detects interactive containers (accordions, menus, dropdowns, modals, tabs, slides)
   * so we know both the active "screen/view" and any open accordions/menus wrapping the element.
   */
  function extractInteractiveAndScreenContext(el) {
    const uiStates = [];
    const interactiveAncestors = [];
    let activeScreenLabel = null;

    // 1. Walk up the ancestor chain of `el` to detect accordions, menus, modals, tabs, slides
    let curr = el;
    while (curr && curr.nodeType === 1 && curr !== document.body) {
      const tag = curr.tagName.toLowerCase();
      const role = curr.getAttribute('role');
      const cls = (typeof curr.className === 'string' ? curr.className : '').toLowerCase();

      // HTML <details> accordion
      if (tag === 'details') {
        const summary = cleanText(curr.querySelector('summary')?.textContent || 'Details', 60);
        uiStates.push(`Accordion <details>: "${summary}" (open)`);
        interactiveAncestors.push({
          type: 'details',
          selector: buildRobustSelector(curr),
          label: summary
        });
      }

      // ARIA / custom accordion or collapsible panel
      if (curr.id) {
        const controller = document.querySelector(`[aria-controls="${CSS.escape(curr.id)}"]`);
        if (controller) {
          const ctrlLabel = cleanText(controller.innerText || controller.getAttribute('aria-label') || curr.id, 60);
          uiStates.push(`Expanded panel: "${ctrlLabel}"`);
          interactiveAncestors.push({
            type: 'aria-controls',
            selector: buildRobustSelector(curr),
            triggerSelector: buildRobustSelector(controller),
            label: ctrlLabel
          });
        }
      }

      if (curr.getAttribute('aria-expanded') === 'true' && curr !== el) {
        const label = cleanText(curr.getAttribute('aria-label') || curr.innerText?.split('\n')[0] || tag, 50);
        uiStates.push(`Expanded container: "${label}"`);
      }

      // Custom class-based accordion / dropdown / menu detection
      if (
        role === 'menu' ||
        role === 'listbox' ||
        /\b(dropdown-menu|popover|menu-list|submenu|context-menu)\b/.test(cls)
      ) {
        const menuLabel = cleanText(
          curr.getAttribute('aria-label') ||
            curr.previousElementSibling?.textContent ||
            'Menu / Dropdown',
          50
        );
        uiStates.push(`Open menu: "${menuLabel}"`);
        interactiveAncestors.push({
          type: 'menu',
          selector: buildRobustSelector(curr),
          label: menuLabel
        });
      } else if (/\b(accordion-content|accordion-body|accordion-panel|collapse)\b/.test(cls)) {
        const accHeader =
          curr.previousElementSibling ||
          curr.parentElement?.querySelector('[class*="header"], [class*="trigger"], button, summary');
        const accLabel = cleanText(accHeader?.textContent || 'Accordion item', 60);
        if (!uiStates.some((s) => s.includes(accLabel))) {
          uiStates.push(`Open accordion: "${accLabel}"`);
          interactiveAncestors.push({
            type: 'custom-accordion',
            selector: buildRobustSelector(curr),
            triggerSelector: accHeader ? buildRobustSelector(accHeader) : null,
            label: accLabel
          });
        }
      }

      // Modal / Dialog / Drawer
      if (tag === 'dialog' || role === 'dialog' || curr.getAttribute('aria-modal') === 'true' || /\b(modal|drawer)\b/.test(cls)) {
        const modalHeading = curr.querySelector('h1, h2, h3, h4, [class*="title"]');
        const modalTitle = cleanText(
          curr.getAttribute('aria-label') || modalHeading?.textContent || 'Modal Dialog',
          60
        );
        uiStates.push(`Modal/Dialog: "${modalTitle}"`);
        if (!activeScreenLabel) activeScreenLabel = `Modal: ${modalTitle}`;
      }

      // Tabpanel
      if (role === 'tabpanel' || /\btab-pane|tab-content|tab-panel\b/.test(cls)) {
        let tabName = curr.getAttribute('aria-label') || '';
        const labelledBy = curr.getAttribute('aria-labelledby');
        if (!tabName && labelledBy) {
          const tabTrigger = document.getElementById(labelledBy);
          if (tabTrigger) tabName = cleanText(tabTrigger.textContent, 50);
        }
        if (tabName) {
          uiStates.push(`Tab panel: "${tabName}"`);
          if (!activeScreenLabel) activeScreenLabel = `Tab: ${tabName}`;
        }
      }

      // Presentation slide / step screen
      if (
        curr.hasAttribute('data-slide') ||
        curr.hasAttribute('data-screen') ||
        curr.hasAttribute('data-step') ||
        /\b(slide|screen|step-view)\b/.test(cls)
      ) {
        const slideHeading = curr.querySelector('h1, h2, h3');
        const slideAttr =
          curr.getAttribute('data-slide') ||
          curr.getAttribute('data-screen') ||
          curr.getAttribute('data-step') ||
          '';
        const slideTitle = cleanText(slideHeading?.textContent || slideAttr || 'Slide', 50);
        if (slideTitle) {
          uiStates.push(`Screen/Slide: "${slideTitle}"`);
          if (!activeScreenLabel) activeScreenLabel = `Screen: ${slideTitle}`;
        }
      }

      curr = curr.parentElement;
    }

    // 2. Check page-level active tab if not already found on ancestor
    if (!activeScreenLabel) {
      const activeTab = document.querySelector(
        '[role="tab"][aria-selected="true"], .tab.active, .nav-link.active, [data-state="active"][role="tab"]'
      );
      if (activeTab) {
        const t = cleanText(activeTab.textContent, 45);
        if (t) {
          activeScreenLabel = `Tab: ${t}`;
          if (!uiStates.some((s) => s.includes(t))) {
            uiStates.push(`Active tab: "${t}"`);
          }
        }
      }
    }

    return {
      uiState: Array.from(new Set(uiStates)),
      interactiveAncestors,
      activeScreenLabel
    };
  }

  /**
   * Captures key computed styles so AI agents have immediate CSS context
   * (e.g. font size, weight, color, padding).
   */
  function captureComputedStyleSummary(el) {
    try {
      const cs = window.getComputedStyle(el);
      const fontSize = cs.fontSize;
      const fontWeight = cs.fontWeight;
      const color = cs.color;
      const bg = cs.backgroundColor;
      const padding = cs.padding !== '0px' ? cs.padding : null;

      const parts = [];
      if (fontSize) parts.push(`font: ${fontSize}/${fontWeight}`);
      if (color) parts.push(`color: ${color}`);
      if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
        parts.push(`bg: ${bg}`);
      }
      if (padding) parts.push(`padding: ${padding}`);
      return parts.join(', ');
    } catch {
      return '';
    }
  }

  /**
   * Captures complete screen + element context when a user drops a pin.
   */
  function capturePinContext(el, clickEvent) {
    const rect = el.getBoundingClientRect();
    const scrollX = window.scrollX || window.pageXOffset || 0;
    const scrollY = window.scrollY || window.pageYOffset || 0;
    const vw = window.innerWidth || document.documentElement.clientWidth || 1;
    const vh = window.innerHeight || document.documentElement.clientHeight || 1;

    const clientX = clickEvent ? clickEvent.clientX : rect.left + rect.width / 2;
    const clientY = clickEvent ? clickEvent.clientY : rect.top + rect.height / 2;

    const pageX = Math.round(clientX + scrollX);
    const pageY = Math.round(clientY + scrollY);

    const offsetXRatio = rect.width > 0
      ? Math.min(0.95, Math.max(0.05, (clientX - rect.left) / rect.width))
      : 0.5;
    const offsetYRatio = rect.height > 0
      ? Math.min(0.95, Math.max(0.05, (clientY - rect.top) / rect.height))
      : 0.5;

    const selector = buildRobustSelector(el);
    const shortLabel = buildShortElementLabel(el);
    const textSnippet = extractElementText(el);
    const clickedPhrase = extractClickedPhrase(clientX, clientY, el);
    const sectionHeading = findNearestHeading(el);
    const { landmark, nearbyText } = extractNearbyContext(el, textSnippet);
    const { prevDesc, nextDesc } = extractContentSiblings(el, textSnippet);
    const { landscape, matchedLandmark } = capturePageContentLandscape(el, { clientX, clientY });
    const { uiState, interactiveAncestors, activeScreenLabel } = extractInteractiveAndScreenContext(el);
    const styleSummary = captureComputedStyleSummary(el);
    const viewportPct = {
      x: Math.round((clientX / vw) * 100),
      y: Math.round((clientY / vh) * 100)
    };
    const region = describeViewportRegion(viewportPct.x, viewportPct.y);

    const placementNarrative = buildPlacementNarrative({
      isFreePin: false,
      shortLabel,
      textSnippet,
      clickedPhrase,
      prevDesc,
      nextDesc,
      matchedLandmark,
      sectionHeading,
      pageCoords: { x: pageX, y: pageY },
      viewportPct,
      region,
      spatialLandmarks: []
    });

    const routeKey = window.AIFLStorage
      ? window.AIFLStorage.getRouteKey()
      : `${window.location.pathname}${window.location.search}${window.location.hash}`;

    const screenLabel = activeScreenLabel
      ? `${routeKey} (${activeScreenLabel})`
      : sectionHeading
      ? `${routeKey} — ${sectionHeading}`
      : routeKey;

    return {
      screen: {
        url: window.location.href,
        routeKey,
        screenLabel,
        activeScreenLabel: activeScreenLabel || null,
        title: document.title || routeKey,
        viewport: { width: vw, height: vh },
        landscape
      },
      target: {
        isFreePin: false,
        pinType: 'element',
        selector,
        shortLabel,
        tagName: el.tagName.toLowerCase(),
        id: isStableId(el.id) ? el.id : null,
        classes: getSemanticClasses(el, 3),
        role: el.getAttribute('role') || null,
        ariaLabel: el.getAttribute('aria-label') || null,
        testId: getTestId(el),
        href: el.getAttribute('href') || null,
        textSnippet,
        clickedPhrase,
        prevSiblingDesc: prevDesc,
        nextSiblingDesc: nextDesc,
        landmarkRef: matchedLandmark || null,
        placementNarrative,
        sectionHeading,
        landmark,
        nearbyText,
        region,
        uiState,
        interactiveAncestors,
        styleSummary,
        pageCoords: { x: pageX, y: pageY },
        viewportPct,
        elementRect: {
          left: Math.round(rect.left + scrollX),
          top: Math.round(rect.top + scrollY),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        },
        offsetRatio: {
          x: Number(offsetXRatio.toFixed(3)),
          y: Number(offsetYRatio.toFixed(3))
        }
      }
    };
  }

  /**
   * Returns a human-readable viewport region label (e.g. "Top-Right", "Center", "Bottom-Left").
   */
  function describeViewportRegion(pctX, pctY) {
    const v = pctY < 33 ? 'Top' : pctY > 66 ? 'Bottom' : 'Middle';
    const h = pctX < 33 ? 'Left' : pctX > 66 ? 'Right' : 'Center';
    if (v === 'Middle' && h === 'Center') return 'Center of viewport';
    if (v === 'Middle') return `${h} side of viewport`;
    return `${v}-${h} of viewport`;
  }

  /**
   * Finds the nearest meaningful visible DOM elements around an arbitrary (clientX, clientY) point
   * so an AI agent knows what visual landmarks surround a free-dropped pin.
   */
  function findSpatialLandmarks(clientX, clientY) {
    const candidates = document.querySelectorAll(
      'h1, h2, h3, h4, h5, h6, button, a, input, select, textarea, img, label, summary, [role="button"], [role="tab"], [data-testid], p, li'
    );
    const scored = [];

    for (const el of candidates) {
      if (el.id === 'ai-feedback-loop-host' || el.closest('#ai-feedback-loop-host')) continue;
      if (!isElementCurrentlyVisible(el)) continue;

      const rect = el.getBoundingClientRect();
      if (rect.width < 4 || rect.height < 4) continue;

      // Distance from point (clientX, clientY) to the element's bounding box
      const dx = clientX < rect.left ? rect.left - clientX : clientX > rect.right ? clientX - rect.right : 0;
      const dy = clientY < rect.top ? rect.top - clientY : clientY > rect.bottom ? clientY - rect.bottom : 0;
      const dist = Math.round(Math.hypot(dx, dy));

      if (dist > 360) continue;

      const text = extractElementText(el);
      const label = buildShortElementLabel(el);
      if (!text && label === 'div') continue;

      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      let relation = 'Inside/Over';
      if (dist > 0) {
        const vecX = clientX - cx;
        const vecY = clientY - cy;
        if (Math.abs(vecY) >= Math.abs(vecX)) {
          relation = vecY < 0 ? `${dist}px above` : `${dist}px below`;
        } else {
          relation = vecX < 0 ? `${dist}px left of` : `${dist}px right of`;
        }
      }

      scored.push({
        dist,
        summary: `${relation} \`${label}\`${text ? ` ("${cleanText(text, 45)}")` : ''}`
      });
    }

    scored.sort((a, b) => a.dist - b.dist);
    const unique = [];
    for (const item of scored) {
      if (!unique.includes(item.summary)) {
        unique.push(item.summary);
      }
      if (unique.length >= 3) break;
    }
    return unique;
  }

  /**
   * Captures context for an arbitrary Free-Drop Pin at (clientX, clientY) without binding to an HTML element.
   */
  function captureFreePinContext(clickEvent) {
    const scrollX = window.scrollX || window.pageXOffset || 0;
    const scrollY = window.scrollY || window.pageYOffset || 0;
    const vw = window.innerWidth || document.documentElement.clientWidth || 1;
    const vh = window.innerHeight || document.documentElement.clientHeight || 1;

    const clientX = clickEvent ? clickEvent.clientX : Math.round(vw / 2);
    const clientY = clickEvent ? clickEvent.clientY : Math.round(vh / 2);
    const pageX = Math.round(clientX + scrollX);
    const pageY = Math.round(clientY + scrollY);
    const pctX = Math.round((clientX / vw) * 100);
    const pctY = Math.round((clientY / vh) * 100);
    const region = describeViewportRegion(pctX, pctY);

    // Check what container/area is underneath the point for spatial awareness
    const underlyingEl = document.elementFromPoint(clientX, clientY) || document.body;
    const sectionHeading = findNearestHeading(underlyingEl);
    const { landmark } = extractNearbyContext(underlyingEl, '');
    const { landscape, matchedLandmark } = capturePageContentLandscape(underlyingEl, { clientX, clientY });
    const { uiState, activeScreenLabel } = extractInteractiveAndScreenContext(underlyingEl);
    const spatialLandmarks = findSpatialLandmarks(clientX, clientY);

    const underlyingContainer =
      landmark ||
      (underlyingEl && underlyingEl !== document.body && underlyingEl !== document.documentElement
        ? buildRobustSelector(underlyingEl)
        : 'page canvas');

    const placementNarrative = buildPlacementNarrative({
      isFreePin: true,
      shortLabel: `📍 Point (${pageX}, ${pageY})`,
      textSnippet: '',
      clickedPhrase: null,
      prevDesc: null,
      nextDesc: null,
      matchedLandmark,
      sectionHeading,
      pageCoords: { x: pageX, y: pageY },
      viewportPct: { x: pctX, y: pctY },
      region,
      spatialLandmarks
    });

    const routeKey = window.AIFLStorage
      ? window.AIFLStorage.getRouteKey()
      : `${window.location.pathname}${window.location.search}${window.location.hash}`;

    const screenLabel = activeScreenLabel
      ? `${routeKey} (${activeScreenLabel})`
      : sectionHeading
      ? `${routeKey} — ${sectionHeading}`
      : routeKey;

    return {
      screen: {
        url: window.location.href,
        routeKey,
        screenLabel,
        activeScreenLabel: activeScreenLabel || null,
        title: document.title || routeKey,
        viewport: { width: vw, height: vh },
        landscape
      },
      target: {
        isFreePin: true,
        pinType: 'free',
        selector: `Free Coordinate (${pageX}, ${pageY})`,
        shortLabel: `📍 Point (${pageX}, ${pageY})`,
        tagName: 'coordinate',
        region,
        underlyingContainer,
        landmarkRef: matchedLandmark || null,
        placementNarrative,
        sectionHeading,
        landmark: landmark || null,
        nearbyText: spatialLandmarks.join(' • '),
        spatialLandmarks,
        uiState,
        interactiveAncestors: [],
        styleSummary: '',
        pageCoords: { x: pageX, y: pageY },
        viewportPct: { x: pctX, y: pctY }
      }
    };
  }

  /**
   * Checks if a DOM element is currently visible in the layout (not display:none,
   * visibility:hidden, closed <details>, or 0x0 collapsed accordion).
   */
  function isElementCurrentlyVisible(el) {
    if (!el || !el.isConnected) return false;
    if (el.closest('details:not([open])')) return false;

    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) === 0) {
      return false;
    }

    const rect = el.getBoundingClientRect();
    if (rect.width < 2 && rect.height < 2) return false;
    return true;
  }

  /**
   * Resolves a saved comment's target back to its live DOM element on the page,
   * using CSS selector first and falling back to tag + text + heading matching.
   */
  function resolveTargetElement(comment) {
    if (!comment || !comment.target) return null;
    const t = comment.target;
    if (t.isFreePin || t.pinType === 'free') return null;

    // 1. Primary CSS selector
    if (t.selector) {
      try {
        const matches = Array.from(document.querySelectorAll(t.selector));
        if (matches.length === 1) return matches[0];
        if (matches.length > 1 && t.textSnippet) {
          const exact = matches.find((m) => extractElementText(m) === t.textSnippet);
          if (exact) return exact;
          return matches[0];
        }
      } catch {
        // Fallback below
      }
    }

    // 2. Fallback by ID
    if (t.id) {
      const byId = document.getElementById(t.id);
      if (byId) return byId;
    }

    // 3. Fallback by tagName + exact textSnippet
    if (t.tagName && t.textSnippet) {
      try {
        const candidates = Array.from(document.getElementsByTagName(t.tagName));
        const matched = candidates.find((c) => extractElementText(c) === t.textSnippet);
        if (matched) return matched;
      } catch {
        // Ignore
      }
    }

    return null;
  }

  /**
   * Attempts to reveal a hidden target element (e.g., inside a closed <details> or accordion)
   * when the user explicitly clicks "Focus on Page" in the drawer.
   */
  function tryRevealTargetElement(comment) {
    const ancestors = comment?.target?.interactiveAncestors || [];
    for (const anc of ancestors) {
      try {
        if (anc.type === 'details' && anc.selector) {
          const detailsEl = document.querySelector(anc.selector);
          if (detailsEl && !detailsEl.open) {
            detailsEl.open = true;
          }
        } else if (anc.triggerSelector) {
          const trigger = document.querySelector(anc.triggerSelector);
          const panel = anc.selector ? document.querySelector(anc.selector) : null;
          if (trigger && (!panel || !isElementCurrentlyVisible(panel))) {
            trigger.click();
          }
        }
      } catch {
        // Ignore reveal errors
      }
    }
    return resolveTargetElement(comment);
  }

  /**
   * Generates a clean, high-signal Markdown prompt ready to paste into any AI coding agent.
   *
   * @param {Array} comments - List of saved comments
   * @param {Object} options - { mode: 'standard' | 'compact', filterRoute: string | null }
   */
  function generateAIPrompt(comments, options = {}) {
    const mode = options.mode || 'standard';
    const list = Array.isArray(comments) ? comments : [];

    if (list.length === 0) {
      return 'No comments recorded yet.';
    }

    // Group comments by Screen / View so multi-screen feedback is clearly organized
    const currentRoute = window.AIFLStorage ? window.AIFLStorage.getRouteKey() : window.location.pathname;
    const liveLandscapeResult = capturePageContentLandscape(null);

    const groups = new Map();
    for (const c of list) {
      const screenKey =
        c.screen?.activeScreenLabel
          ? `${c.screen.routeKey} (${c.screen.activeScreenLabel})`
          : c.screen?.routeKey || '/';
      if (!groups.has(screenKey)) {
        const isCurrentRoute = c.screen?.routeKey === currentRoute;
        const savedLandscape = Array.isArray(c.screen?.landscape) && c.screen.landscape.length > 0
          ? c.screen.landscape
          : isCurrentRoute
          ? liveLandscapeResult.landscape
          : [];
        groups.set(screenKey, {
          screenKey,
          url: c.screen?.url || window.location.href,
          title: c.screen?.title || document.title,
          viewport: c.screen?.viewport,
          landscape: savedLandscape,
          items: []
        });
      }
      groups.get(screenKey).items.push(c);
    }

    const lines = [];
    const pageTitle = document.title || window.location.hostname || 'Web Page';
    lines.push(`# UI & Content Feedback — ${pageTitle}`);
    lines.push(
      `Please implement the following ${list.length} requested change${list.length === 1 ? '' : 's'}. Below is the page content landscape (landmarks \`[L1]\`..\`[Ln]\` of visible custom writing, headings, images, and controls) followed by each pin's placement narrative and DOM locator.`
    );
    lines.push('');

    for (const [, group] of groups) {
      const vp = group.viewport ? ` (Viewport: ${group.viewport.width}×${group.viewport.height})` : '';
      lines.push(`## Screen: \`${group.screenKey}\`${vp}`);

      // Emit the compact Page Content Landscape so the AI agent understands the visual/content layout
      if (Array.isArray(group.landscape) && group.landscape.length > 0) {
        lines.push('### Page Content Landscape (Top-to-Bottom Visual Map)');
        for (const lm of group.landscape) {
          lines.push(`- **[${lm.id}] \`${lm.container}\`**: ${lm.summary}`);
        }
        lines.push('');
      } else {
        lines.push('');
      }

      for (const item of group.items) {
        const t = item.target || {};
        const commentText = item.text || '(No comment text provided)';
        const isFree = Boolean(t.isFreePin || t.pinType === 'free');
        const lmBadge = t.landmarkRef?.id ? ` (Ref: [${t.landmarkRef.id}] \`${t.landmarkRef.container}\`)` : '';

        lines.push(`### Pin #${item.number}${lmBadge}: ${commentText}`);

        // Natural-language placement narrative
        if (t.placementNarrative) {
          lines.push(`- **Placement Summary**: User wants "${commentText}". ${t.placementNarrative}`);
        }

        if (isFree) {
          const regionStr = t.region ? ` — ${t.region}` : '';
          const pctStr = t.viewportPct ? ` (~${t.viewportPct.x}% X, ${t.viewportPct.y}% Y of viewport${regionStr})` : '';
          lines.push(
            `- **Coordinates**: Arbitrary / Free-Drop Pin at \`(${t.pageCoords?.x ?? 0}, ${t.pageCoords?.y ?? 0})\`${pctStr}`
          );
          if (t.underlyingContainer || t.sectionHeading) {
            const areaParts = [];
            if (t.sectionHeading) areaParts.push(`Section: "${t.sectionHeading}"`);
            if (t.underlyingContainer) areaParts.push(`Underlying Container: \`${t.underlyingContainer}\``);
            lines.push(`- **Page Area**: ${areaParts.join(' • ')}`);
          }
          if (Array.isArray(t.spatialLandmarks) && t.spatialLandmarks.length > 0) {
            lines.push(`- **Nearest Visual Landmarks**: ${t.spatialLandmarks.join(' • ')}`);
          } else if (t.nearbyText) {
            lines.push(`- **Nearest Visual Landmarks**: ${t.nearbyText}`);
          }
          if (Array.isArray(t.uiState) && t.uiState.length > 0) {
            lines.push(`- **Interactive State**: ${t.uiState.join(' → ')}`);
          }
        } else {
          lines.push(`- **DOM Target**: \`<${t.shortLabel || t.tagName || 'element'}>\` — Selector: \`${t.selector || 'unknown'}\``);

          if (t.textSnippet) {
            const clickedPart = t.clickedPhrase ? ` (Clicked near phrase: "${t.clickedPhrase}")` : '';
            lines.push(`- **Content at Target**: "${t.textSnippet}"${clickedPart}`);
          }

          // Sibling & Section Relationships
          const siblingParts = [];
          if (t.prevSiblingDesc) siblingParts.push(`Follows sibling: ${t.prevSiblingDesc}`);
          if (t.nextSiblingDesc) siblingParts.push(`Precedes sibling: ${t.nextSiblingDesc}`);
          if (siblingParts.length > 0) {
            lines.push(`- **Adjacent Siblings**: ${siblingParts.join(' • ')}`);
          } else {
            const contextParts = [];
            if (t.sectionHeading) contextParts.push(`Section: "${t.sectionHeading}"`);
            if (t.landmark) contextParts.push(`Container: \`${t.landmark}\``);
            if (t.nearbyText) contextParts.push(t.nearbyText);
            if (contextParts.length > 0) {
              lines.push(`- **Nearby Context**: ${contextParts.join(' • ')}`);
            }
          }

          // Interactive state (accordions, menus, tabs, modals)
          if (Array.isArray(t.uiState) && t.uiState.length > 0) {
            lines.push(`- **Interactive State**: ${t.uiState.join(' → ')}`);
          }

          // Coordinates & dimensions
          if (t.pageCoords) {
            const box = t.elementRect ? `, box \`${t.elementRect.width}×${t.elementRect.height}px\`` : '';
            const pct = t.viewportPct ? ` (~${t.viewportPct.x}% X, ${t.viewportPct.y}% Y of viewport${t.region ? `, ${t.region}` : ''})` : '';
            lines.push(`- **Location**: \`(${t.pageCoords.x}, ${t.pageCoords.y})\`${pct}${box}`);
          }

          // Computed style snapshot in standard mode
          if (mode === 'standard' && t.styleSummary) {
            lines.push(`- **Computed Styles**: \`${t.styleSummary}\``);
          }
        }

        lines.push('');
      }
    }

    return lines.join('\n').trim();
  }

  window.AIFLPromptGenerator = {
    cleanText,
    buildRobustSelector,
    buildShortElementLabel,
    extractElementText,
    capturePinContext,
    captureFreePinContext,
    capturePageContentLandscape,
    buildPlacementNarrative,
    describeViewportRegion,
    findSpatialLandmarks,
    isElementCurrentlyVisible,
    resolveTargetElement,
    tryRevealTargetElement,
    generateAIPrompt
  };
})();

