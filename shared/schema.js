/**
 * Shared pin schema, constants, normalization, and spatial Markdown compiler
 * for AI Feedback Loop v2.0.0 (Server, Extension/Guest Overlay, and MCP Bridge).
 */

const DEFAULT_COLLAB_PORT = 4173;
const DEFAULT_TARGET_PORT = 5173;
const DEFAULT_MCP_PORT = 4174;

const VALID_STATUSES = ['pending', 'approved', 'in_progress', 'resolved'];
const VALID_ROLES = ['host', 'guest', 'agent'];

const PEER_COLORS = [
  '#10b981',
  '#f59e0b',
  '#ec4899',
  '#06b6d4',
  '#8b5cf6',
  '#f97316'
];

function isValidStatus(status) {
  return VALID_STATUSES.includes(status);
}

function normalizeAuthor(rawAuthor, fallbackRole = 'host') {
  const role = VALID_ROLES.includes(rawAuthor?.role) ? rawAuthor.role : fallbackRole;
  const defaultName =
    role === 'host' ? 'Host' : role === 'agent' ? 'AI Coding Agent' : 'Guest Reviewer';
  const defaultColor = role === 'host' ? '#6366f1' : role === 'agent' ? '#a855f7' : '#10b981';

  return {
    id:
      typeof rawAuthor?.id === 'string' && rawAuthor.id.trim()
        ? rawAuthor.id.trim()
        : `${role}_local`,
    name:
      typeof rawAuthor?.name === 'string' && rawAuthor.name.trim()
        ? rawAuthor.name.trim()
        : defaultName,
    role,
    color:
      typeof rawAuthor?.color === 'string' && rawAuthor.color.trim()
        ? rawAuthor.color.trim()
        : defaultColor
  };
}

function normalizeReply(rawReply, index = 0) {
  const now = Date.now();
  const role = VALID_ROLES.includes(rawReply?.role) ? rawReply.role : 'guest';
  const defaultName =
    role === 'host' ? 'Host' : role === 'agent' ? 'AI Coding Agent' : 'Guest Reviewer';

  return {
    id:
      typeof rawReply?.id === 'string' && rawReply.id.trim()
        ? rawReply.id.trim()
        : `rep_${now}_${index}_${Math.random().toString(36).slice(2, 6)}`,
    authorName:
      typeof rawReply?.authorName === 'string' && rawReply.authorName.trim()
        ? rawReply.authorName.trim()
        : defaultName,
    role,
    text: String(rawReply?.text || '').trim(),
    createdAt: Number(rawReply?.createdAt) || now
  };
}

function normalizePin(raw, index = 0) {
  const now = Date.now();
  const status = isValidStatus(raw?.status) ? raw.status : 'pending';
  const number = Number.isFinite(Number(raw?.number)) && Number(raw.number) > 0
    ? Number(raw.number)
    : index + 1;

  const replies = Array.isArray(raw?.replies)
    ? raw.replies.map((r, i) => normalizeReply(r, i)).filter((r) => r.text.length > 0)
    : [];

  const screen = raw?.screen && typeof raw.screen === 'object'
    ? {
        url: raw.screen.url || '',
        routeKey: raw.screen.routeKey || '/',
        screenLabel: raw.screen.screenLabel || raw.screen.routeKey || '/',
        activeScreenLabel: raw.screen.activeScreenLabel || null,
        title: raw.screen.title || 'Web Page',
        viewport: raw.screen.viewport || null,
        landscape: Array.isArray(raw.screen.landscape) ? raw.screen.landscape : []
      }
    : {
        url: '',
        routeKey: '/',
        screenLabel: '/',
        activeScreenLabel: null,
        title: 'Web Page',
        viewport: null,
        landscape: []
      };

  const target = raw?.target && typeof raw.target === 'object' ? { ...raw.target } : {};

  return {
    id:
      typeof raw?.id === 'string' && raw.id.trim()
        ? raw.id.trim()
        : `aifl_${now}_${Math.random().toString(36).slice(2, 8)}`,
    number,
    status,
    author: normalizeAuthor(raw?.author, 'host'),
    text: String(raw?.text || '').trim(),
    category: raw?.category || 'general',
    replies,
    resolutionSummary: raw?.resolutionSummary ? String(raw.resolutionSummary).trim() : undefined,
    screen,
    target,
    createdAt: Number(raw?.createdAt) || now,
    updatedAt: Number(raw?.updatedAt) || now
  };
}

/**
 * Compiles pins into structured Markdown suitable for AI coding agents & MCP prompts.
 */
function compileSpatialFeedbackBatch(pins, options = {}) {
  const mode = options.mode === 'compact' ? 'compact' : 'standard';
  const list = Array.isArray(pins) ? pins.map((p, i) => normalizePin(p, i)) : [];

  if (list.length === 0) {
    return 'No approved feedback pins in queue.';
  }

  const groups = new Map();
  for (const pin of list) {
    const screenKey = pin.screen?.screenLabel || pin.screen?.routeKey || '/';
    if (!groups.has(screenKey)) {
      groups.set(screenKey, {
        screenKey,
        url: pin.screen?.url || '',
        title: pin.screen?.title || 'Web Page',
        viewport: pin.screen?.viewport || null,
        landscape: Array.isArray(pin.screen?.landscape) ? pin.screen.landscape : [],
        items: []
      });
    }
    groups.get(screenKey).items.push(pin);
  }

  const pageTitle = options.title || list[0]?.screen?.title || 'Web Page';
  const lines = [];
  lines.push(`# UI & Content Feedback — ${pageTitle}`);
  lines.push(
    `Please implement the following ${list.length} requested change${list.length === 1 ? '' : 's'}. Below is the page content landscape followed by each pin's placement narrative, DOM locator, and discussion thread.`
  );
  lines.push('');

  for (const [, group] of groups) {
    const vp = group.viewport ? ` (Viewport: ${group.viewport.width}×${group.viewport.height})` : '';
    lines.push(`## Screen: \`${group.screenKey}\`${vp}`);

    if (group.landscape.length > 0) {
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
      const statusTag = item.status ? `[${item.status.toUpperCase()}] ` : '';

      lines.push(`### Pin #${item.number} ${statusTag}${lmBadge}: ${commentText}`);
      lines.push(`- **Author**: ${item.author.name} (${item.author.role}) • **Pin ID**: \`${item.id}\``);

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
      } else {
        lines.push(`- **DOM Target**: \`<${t.shortLabel || t.tagName || 'element'}>\` — Selector: \`${t.selector || 'unknown'}\``);
        if (t.textSnippet) {
          const clickedPart = t.clickedPhrase ? ` (Clicked near phrase: "${t.clickedPhrase}")` : '';
          lines.push(`- **Content at Target**: "${t.textSnippet}"${clickedPart}`);
        }
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
        if (Array.isArray(t.uiState) && t.uiState.length > 0) {
          lines.push(`- **Interactive State**: ${t.uiState.join(' → ')}`);
        }
        if (t.pageCoords) {
          const box = t.elementRect ? `, box \`${t.elementRect.width}×${t.elementRect.height}px\`` : '';
          const pct = t.viewportPct ? ` (~${t.viewportPct.x}% X, ${t.viewportPct.y}% Y of viewport${t.region ? `, ${t.region}` : ''})` : '';
          lines.push(`- **Location**: \`(${t.pageCoords.x}, ${t.pageCoords.y})\`${pct}${box}`);
        }
        if (mode === 'standard' && t.styleSummary) {
          lines.push(`- **Computed Styles**: \`${t.styleSummary}\``);
        }
      }

      if (Array.isArray(item.replies) && item.replies.length > 0) {
        lines.push('- **Discussion Thread**:');
        for (const r of item.replies) {
          lines.push(`  - **${r.authorName}** (${r.role}): ${r.text}`);
        }
      }

      lines.push('');
    }
  }

  return lines.join('\n').trim();
}

module.exports = {
  DEFAULT_COLLAB_PORT,
  DEFAULT_TARGET_PORT,
  DEFAULT_MCP_PORT,
  VALID_STATUSES,
  VALID_ROLES,
  PEER_COLORS,
  isValidStatus,
  normalizeAuthor,
  normalizeReply,
  normalizePin,
  compileSpatialFeedbackBatch
};

