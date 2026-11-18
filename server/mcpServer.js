/**
 * Local MCP Server Bridge (strictly stdio) for AI Feedback Loop v2.0.0.
 *
 * Exposes approved spatial pins, active session metadata, and DOM snapshot
 * resources, plus tools and prompts for local AI coding agents.
 *
 * Prefers the live Collab HTTP API (/ __collab/mcp/*) so mutations update the
 * live Y.Doc and broadcast immediately over WebSocket, and falls back to
 * opening the local SQLite PinStore when the Collab Server is unreachable.
 */

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const https = require('node:https');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');

const {
  DEFAULT_COLLAB_PORT,
  normalizePin,
  compileSpatialFeedbackBatch
} = require('../shared/schema');

const execFileAsync = promisify(execFile);
const REPO_ROOT = path.resolve(__dirname, '..');
const DEFAULT_HTTP_TIMEOUT_MS = 3000;

function readRuntimeFile(runtimeFilePath) {
  try {
    if (!runtimeFilePath || !fs.existsSync(runtimeFilePath)) {
      return {};
    }
    const raw = fs.readFileSync(runtimeFilePath, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function getRuntimeConfig() {
  const runtimeFile =
    process.env.AIFL_RUNTIME_FILE ||
    path.join(process.cwd(), '.aifl-session', 'runtime.json');
  const runtime = readRuntimeFile(runtimeFile);

  const fallbackCollabUrl = runtime.collabPort
    ? `http://127.0.0.1:${runtime.collabPort}`
    : `http://127.0.0.1:${DEFAULT_COLLAB_PORT}`;

  const rawCollabUrl =
    process.env.AIFL_COLLAB_URL || runtime.collabUrl || fallbackCollabUrl;

  return {
    runtimeFile,
    collabUrl: String(rawCollabUrl).replace(/\/+$/, ''),
    hostToken: process.env.AIFL_HOST_TOKEN || runtime.hostToken || '',
    targetUrl: process.env.AIFL_TARGET_URL || runtime.targetUrl || null,
    dbPath:
      process.env.AIFL_DB_PATH ||
      runtime.dbPath ||
      path.join(process.cwd(), '.aifl-session', 'session.db')
  };
}

/**
 * Performs an HTTP request against the local Collab Server MCP endpoints.
 * Explicitly omits any `Origin` header and attaches `x-aifl-host-token` when available.
 */
async function callCollabMcp(method, apiPath, body, configOverride = null) {
  const cfg = configOverride || getRuntimeConfig();
  let target;
  try {
    target = new URL(apiPath, `${cfg.collabUrl}/`);
  } catch (err) {
    return { reachable: false, ok: false, error: err.message };
  }

  const transport = target.protocol === 'https:' ? https : http;
  const payload = body !== undefined ? JSON.stringify(body) : null;

  const headers = {
    Accept: 'application/json'
  };
  if (cfg.hostToken) {
    headers['x-aifl-host-token'] = cfg.hostToken;
  }
  if (payload !== null) {
    headers['Content-Type'] = 'application/json';
    headers['Content-Length'] = Buffer.byteLength(payload);
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (!settled) {
        settled = true;
        resolve(result);
      }
    };

    const req = transport.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || (target.protocol === 'https:' ? 443 : 80),
        path: `${target.pathname}${target.search}`,
        method,
        headers,
        timeout: DEFAULT_HTTP_TIMEOUT_MS
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const rawBody = Buffer.concat(chunks).toString('utf8');
          let data = null;
          if (rawBody) {
            try {
              data = JSON.parse(rawBody);
            } catch {
              data = { raw: rawBody };
            }
          }

          if (res.statusCode >= 502 && res.statusCode <= 504) {
            finish({
              reachable: false,
              ok: false,
              status: res.statusCode,
              error: data?.error || `Upstream unavailable (${res.statusCode})`
            });
            return;
          }

          const ok = res.statusCode >= 200 && res.statusCode < 300 && data?.ok !== false;
          finish({
            reachable: true,
            ok,
            status: res.statusCode,
            data,
            error: ok ? undefined : data?.error || `HTTP ${res.statusCode}`
          });
        });
      }
    );

    req.on('timeout', () => {
      req.destroy(new Error('Request timeout'));
    });

    req.on('error', (err) => {
      finish({
        reachable: false,
        ok: false,
        error: err.message
      });
    });

    if (payload !== null) {
      req.write(payload);
    }
    req.end();
  });
}

function withFallbackStore(dbPath, fn) {
  if (!dbPath || !fs.existsSync(dbPath)) {
    return { exists: false, result: null };
  }
  const { createPinStore } = require('./store');
  const store = createPinStore({ dbPath });
  try {
    return { exists: true, result: fn(store) };
  } finally {
    store.close();
  }
}

async function fetchPins(filter = {}) {
  const cfg = getRuntimeConfig();
  const params = new URLSearchParams();
  if (filter.status) params.set('status', filter.status);
  if (filter.routeKey) params.set('routeKey', filter.routeKey);
  const query = params.toString();
  const apiPath = `/__collab/mcp/pins${query ? `?${query}` : ''}`;

  const res = await callCollabMcp('GET', apiPath, undefined, cfg);
  if (res.reachable) {
    if (!res.ok) {
      throw new Error(res.error || 'Failed to query Collab Server pins');
    }
    const pins = Array.isArray(res.data?.pins)
      ? res.data.pins.map((p, i) => normalizePin(p, i))
      : [];
    return { source: 'collab', cfg, pins };
  }

  const fb = withFallbackStore(cfg.dbPath, (store) => store.getAllPins(filter));
  const pins = Array.isArray(fb.result)
    ? fb.result.map((p, i) => normalizePin(p, i))
    : [];
  return { source: fb.exists ? 'sqlite' : 'empty', cfg, pins };
}

async function fetchPinById(pinId) {
  const cfg = getRuntimeConfig();
  const res = await callCollabMcp(
    'GET',
    `/__collab/mcp/pins/${encodeURIComponent(pinId)}`,
    undefined,
    cfg
  );

  if (res.reachable) {
    if (!res.ok || !res.data?.pin) {
      return {
        found: false,
        source: 'collab',
        error: res.error || `Pin "${pinId}" not found`
      };
    }
    return {
      found: true,
      source: 'collab',
      pin: normalizePin(res.data.pin)
    };
  }

  const fb = withFallbackStore(cfg.dbPath, (store) => store.getPin(pinId));
  if (!fb.exists || !fb.result) {
    return {
      found: false,
      source: fb.exists ? 'sqlite' : 'empty',
      error: `Pin "${pinId}" not found`
    };
  }
  return {
    found: true,
    source: 'sqlite',
    pin: normalizePin(fb.result)
  };
}

async function batchUpdatePinStatus(pinIds, status) {
  const cfg = getRuntimeConfig();
  const res = await callCollabMcp(
    'POST',
    '/__collab/mcp/pins/batch-status',
    { pinIds, status },
    cfg
  );

  if (res.reachable) {
    if (!res.ok) {
      throw new Error(res.error || 'Failed to batch update pin statuses');
    }
    const pins = Array.isArray(res.data?.pins)
      ? res.data.pins.map((p, i) => normalizePin(p, i))
      : [];
    return { source: 'collab', pins };
  }

  const fb = withFallbackStore(cfg.dbPath, (store) =>
    store.batchUpdateStatus(pinIds, status, { actorRole: 'mcp' })
  );
  if (!fb.exists) {
    throw new Error('Collab Server unreachable and session database does not exist');
  }
  const pins = Array.isArray(fb.result?.pins)
    ? fb.result.pins.map((p, i) => normalizePin(p, i))
    : [];
  return { source: 'sqlite', pins };
}

async function resolvePin(pinId, summary) {
  const cfg = getRuntimeConfig();
  const body = summary && String(summary).trim() ? { summary: String(summary).trim() } : {};
  const res = await callCollabMcp(
    'POST',
    `/__collab/mcp/pins/${encodeURIComponent(pinId)}/resolve`,
    body,
    cfg
  );

  if (res.reachable) {
    if (!res.ok || !res.data?.pin) {
      return {
        ok: false,
        source: 'collab',
        error: res.error || `Pin "${pinId}" not found`
      };
    }
    return {
      ok: true,
      source: 'collab',
      pin: normalizePin(res.data.pin)
    };
  }

  try {
    const fb = withFallbackStore(cfg.dbPath, (store) =>
      store.updatePinStatus(pinId, 'resolved', {
        summary: body.summary,
        actorRole: 'mcp'
      })
    );
    if (!fb.exists || !fb.result?.pin) {
      return {
        ok: false,
        source: fb.exists ? 'sqlite' : 'empty',
        error: `Pin "${pinId}" not found`
      };
    }
    return {
      ok: true,
      source: 'sqlite',
      pin: normalizePin(fb.result.pin)
    };
  } catch (err) {
    return {
      ok: false,
      source: 'sqlite',
      error: err.message
    };
  }
}

async function clarifyPin(pinId, question) {
  const cleanQuestion = String(question || '').trim();
  if (!cleanQuestion) {
    return { ok: false, source: 'validation', error: 'Question must not be empty.' };
  }

  const cfg = getRuntimeConfig();
  const res = await callCollabMcp(
    'POST',
    `/__collab/mcp/pins/${encodeURIComponent(pinId)}/clarify`,
    { question: cleanQuestion },
    cfg
  );

  if (res.reachable) {
    if (!res.ok || !res.data?.pin) {
      return {
        ok: false,
        source: 'collab',
        error: res.error || `Pin "${pinId}" not found`
      };
    }
    return {
      ok: true,
      source: 'collab',
      pin: normalizePin(res.data.pin),
      reply: res.data.reply || null
    };
  }

  try {
    const fb = withFallbackStore(cfg.dbPath, (store) =>
      store.addReply(
        pinId,
        {
          authorName: 'AI Coding Agent',
          role: 'agent',
          text: cleanQuestion
        },
        'mcp'
      )
    );
    if (!fb.exists || !fb.result?.pin) {
      return {
        ok: false,
        source: fb.exists ? 'sqlite' : 'empty',
        error: `Pin "${pinId}" not found`
      };
    }
    return {
      ok: true,
      source: 'sqlite',
      pin: normalizePin(fb.result.pin),
      reply: fb.result.reply || null
    };
  } catch (err) {
    return {
      ok: false,
      source: 'sqlite',
      error: err.message
    };
  }
}

function countPinsByStatus(pins) {
  const counts = {
    total: 0,
    pending: 0,
    approved: 0,
    in_progress: 0,
    resolved: 0
  };
  for (const pin of pins) {
    counts.total += 1;
    if (pin.status && Object.prototype.hasOwnProperty.call(counts, pin.status)) {
      counts[pin.status] += 1;
    }
  }
  return counts;
}

async function getGitInfo() {
  const runGit = async (args) => {
    try {
      const { stdout } = await execFileAsync('git', args, {
        cwd: REPO_ROOT,
        timeout: 2000
      });
      return String(stdout || '').trim() || null;
    } catch {
      return null;
    }
  };

  const [branch, commitSha] = await Promise.all([
    runGit(['rev-parse', '--abbrev-ref', 'HEAD']),
    runGit(['rev-parse', 'HEAD'])
  ]);

  return { branch, commitSha };
}

async function fetchSessionStatus() {
  const cfg = getRuntimeConfig();
  const [gitInfo, sessionRes] = await Promise.all([
    getGitInfo(),
    callCollabMcp('GET', '/__collab/mcp/session', undefined, cfg)
  ]);

  let targetUrl = cfg.targetUrl;
  let collabUrl = cfg.collabUrl;
  let liveServerConnected = false;
  let counts = null;

  if (sessionRes.reachable && sessionRes.ok && sessionRes.data) {
    liveServerConnected = true;
    targetUrl = sessionRes.data.targetUrl || targetUrl;
    if (sessionRes.data.collabPort) {
      collabUrl = `http://127.0.0.1:${sessionRes.data.collabPort}`;
    }
    if (sessionRes.data.counts && typeof sessionRes.data.counts === 'object') {
      const c = sessionRes.data.counts;
      const pending = Number(c.pending) || 0;
      const approved = Number(c.approved) || 0;
      const inProgress = Number(c.in_progress) || 0;
      const resolved = Number(c.resolved) || 0;
      const total =
        Number.isFinite(Number(c.total))
          ? Number(c.total)
          : pending + approved + inProgress + resolved;
      counts = {
        total,
        pending,
        approved,
        in_progress: inProgress,
        resolved
      };
    }
  }

  if (!counts) {
    const { pins } = await fetchPins();
    counts = countPinsByStatus(pins);
  }

  return {
    branch: gitInfo.branch,
    commitSha: gitInfo.commitSha,
    targetUrl,
    collabUrl,
    liveServerConnected,
    counts
  };
}

function buildDomSnapshot(pins) {
  const screenMap = new Map();
  const landscape = [];
  const seenLandscapeKeys = new Set();
  const targets = [];

  for (const rawPin of pins) {
    const pin = normalizePin(rawPin);
    const routeKey = pin.screen?.routeKey || '/';
    const screenLabel = pin.screen?.screenLabel || routeKey;

    if (!screenMap.has(screenLabel)) {
      screenMap.set(screenLabel, {
        routeKey,
        screenLabel,
        activeScreenLabel: pin.screen?.activeScreenLabel || null,
        url: pin.screen?.url || '',
        title: pin.screen?.title || 'Web Page',
        viewport: pin.screen?.viewport || null,
        pinCount: 0,
        landscape: Array.isArray(pin.screen?.landscape) ? pin.screen.landscape : []
      });
    }

    const screenEntry = screenMap.get(screenLabel);
    screenEntry.pinCount += 1;
    if (
      screenEntry.landscape.length === 0 &&
      Array.isArray(pin.screen?.landscape) &&
      pin.screen.landscape.length > 0
    ) {
      screenEntry.landscape = pin.screen.landscape;
    }

    if (Array.isArray(pin.screen?.landscape)) {
      for (const lm of pin.screen.landscape) {
        const key = `${screenLabel}::${lm.id || ''}::${lm.container || ''}`;
        if (!seenLandscapeKeys.has(key)) {
          seenLandscapeKeys.add(key);
          landscape.push({
            id: lm.id,
            container: lm.container,
            title: lm.title,
            summary: lm.summary,
            routeKey,
            screenLabel
          });
        }
      }
    }

    targets.push({
      pinId: pin.id,
      number: pin.number,
      status: pin.status,
      text: pin.text,
      routeKey,
      screenLabel,
      target: pin.target
    });
  }

  const screens = Array.from(screenMap.values());
  const activeRoutes = Array.from(new Set(screens.map((s) => s.routeKey)));

  return {
    totalPins: pins.length,
    activeRoutes,
    screens,
    landscape,
    targets
  };
}

function createMcpServer() {
  const server = new McpServer({
    name: 'ai-feedback-loop',
    version: '2.0.0'
  });

  // --- Resources ---

  server.registerResource(
    'approved_pins',
    'canvas://pins/approved',
    {
      title: 'Approved Canvas Pins',
      description:
        'JSON list of all pins with status "approved" or "in_progress", including 3-tier DOM anchors, placementNarrative, landscape, and replies.',
      mimeType: 'application/json'
    },
    async (uri) => {
      const { pins } = await fetchPins();
      const activePins = pins.filter(
        (p) => p.status === 'approved' || p.status === 'in_progress'
      );
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(activePins, null, 2)
          }
        ]
      };
    }
  );

  server.registerResource(
    'active_branch_session',
    'canvas://session/active-branch',
    {
      title: 'Active Branch & Session Stats',
      description:
        'Current Git branch, commit SHA, target dev URL, Collab Server URL, and pin counts by status.',
      mimeType: 'application/json'
    },
    async (uri) => {
      const session = await fetchSessionStatus();
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(session, null, 2)
          }
        ]
      };
    }
  );

  server.registerResource(
    'dom_snapshot',
    'canvas://dom/snapshot',
    {
      title: 'Session DOM Snapshot & Landscape',
      description:
        'Aggregated Page Content Landscape ([L1]..[Ln]), active routes/screens, and element targets collected from current session pins.',
      mimeType: 'application/json'
    },
    async (uri) => {
      const { pins } = await fetchPins();
      const snapshot = buildDomSnapshot(pins);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(snapshot, null, 2)
          }
        ]
      };
    }
  );

  // --- Tools ---

  server.registerTool(
    'get_approved_pins',
    {
      title: 'Get Approved Pins',
      description:
        'Fetch all approved feedback pins (optionally filtered by routeKey) with structured JSON and compiled spatial Markdown. Optionally transitions fetched pins to "in_progress".',
      inputSchema: {
        routeKey: z
          .string()
          .optional()
          .describe('Optional routeKey filter (e.g. "/#screen-overview").'),
        markInProgress: z
          .boolean()
          .optional()
          .describe('If true, updates fetched approved pins to "in_progress" in the live session.')
      }
    },
    async ({ routeKey, markInProgress }) => {
      const cleanRoute =
        typeof routeKey === 'string' && routeKey.trim() ? routeKey.trim() : undefined;

      const fetched = await fetchPins({
        status: 'approved',
        routeKey: cleanRoute
      });
      let pins = fetched.pins.filter((p) => {
        if (p.status !== 'approved') return false;
        if (cleanRoute && p.screen?.routeKey !== cleanRoute) return false;
        return true;
      });
      let source = fetched.source;

      if (markInProgress && pins.length > 0) {
        const targetIds = pins.map((p) => p.id);
        const targetIdSet = new Set(targetIds);
        const updated = await batchUpdatePinStatus(targetIds, 'in_progress');
        source = updated.source;
        const matchedUpdated = updated.pins.filter((p) => targetIdSet.has(p.id));
        pins =
          matchedUpdated.length > 0
            ? matchedUpdated
            : pins.map((p) => ({ ...p, status: 'in_progress' }));
      }

      const markdown = compileSpatialFeedbackBatch(pins);
      const payload = {
        count: pins.length,
        source,
        pins
      };

      return {
        content: [
          { type: 'text', text: markdown },
          { type: 'text', text: JSON.stringify(payload, null, 2) }
        ],
        structuredContent: {
          ...payload,
          markdown
        }
      };
    }
  );

  server.registerTool(
    'get_pin_dom_context',
    {
      title: 'Get Pin DOM Context',
      description:
        'Fetch full 3-tier DOM anchor context, placement narrative, landscape, replies, and compiled Markdown prompt for a single pin.',
      inputSchema: {
        pinId: z.string().min(1).describe('ID of the pin to inspect.')
      }
    },
    async ({ pinId }) => {
      const res = await fetchPinById(pinId);
      if (!res.found || !res.pin) {
        return {
          content: [
            {
              type: 'text',
              text: res.error || `Pin "${pinId}" was not found.`
            }
          ],
          isError: true
        };
      }

      const markdown = compileSpatialFeedbackBatch([res.pin]);
      const payload = {
        source: res.source,
        pin: res.pin
      };

      return {
        content: [
          { type: 'text', text: markdown },
          { type: 'text', text: JSON.stringify(payload, null, 2) }
        ],
        structuredContent: {
          ...payload,
          markdown
        }
      };
    }
  );

  server.registerTool(
    'mark_pin_resolved',
    {
      title: 'Mark Pin Resolved',
      description:
        'Mark a pin as "resolved" in SQLite and live Y.Doc so all connected Host and Guest browsers immediately reflect the resolved state.',
      inputSchema: {
        pinId: z.string().min(1).describe('ID of the pin to mark as resolved.'),
        summary: z
          .string()
          .optional()
          .describe('Optional summary of the implemented fix posted to the pin thread.')
      }
    },
    async ({ pinId, summary }) => {
      const res = await resolvePin(pinId, summary);
      if (!res.ok) {
        return {
          content: [
            {
              type: 'text',
              text: res.error || `Failed to resolve pin "${pinId}".`
            }
          ],
          isError: true
        };
      }

      const summaryNote = summary ? ` Summary: ${summary}` : '';
      const payload = {
        ok: true,
        source: res.source,
        pin: res.pin
      };

      return {
        content: [
          {
            type: 'text',
            text: `Pin #${res.pin.number} (${res.pin.id}) marked as resolved.${summaryNote}`
          },
          {
            type: 'text',
            text: JSON.stringify(payload, null, 2)
          }
        ],
        structuredContent: payload
      };
    }
  );

  server.registerTool(
    'request_pin_clarification',
    {
      title: 'Request Pin Clarification',
      description:
        'Append an AI Coding Agent clarification question to a pin discussion thread in SQLite and live Y.Doc so connected browsers see it immediately.',
      inputSchema: {
        pinId: z.string().min(1).describe('ID of the pin needing clarification.'),
        question: z.string().min(1).describe('Clarification question to post to the thread.')
      }
    },
    async ({ pinId, question }) => {
      const res = await clarifyPin(pinId, question);
      if (!res.ok) {
        return {
          content: [
            {
              type: 'text',
              text: res.error || `Failed to post clarification on pin "${pinId}".`
            }
          ],
          isError: true
        };
      }

      const payload = {
        ok: true,
        source: res.source,
        pin: res.pin,
        reply: res.reply
      };

      return {
        content: [
          {
            type: 'text',
            text: `Posted clarification on Pin #${res.pin.number} (${res.pin.id}): "${question}"`
          },
          {
            type: 'text',
            text: JSON.stringify(payload, null, 2)
          }
        ],
        structuredContent: payload
      };
    }
  );

  // --- Prompts ---

  server.registerPrompt(
    'compile_spatial_feedback_batch',
    {
      title: 'Compile Spatial Feedback Batch',
      description:
        'Generates a structured spatial Markdown prompt from all currently approved pins.',
      argsSchema: {
        mode: z
          .enum(['standard', 'compact'])
          .optional()
          .describe('Formatting detail level: "standard" (default) or "compact".')
      }
    },
    async ({ mode } = {}) => {
      const { pins } = await fetchPins({ status: 'approved' });
      const approved = pins.filter((p) => p.status === 'approved');
      const compiled = compileSpatialFeedbackBatch(approved, {
        mode: mode === 'compact' ? 'compact' : 'standard'
      });

      return {
        description:
          'Compiled spatial UI & content feedback batch from currently approved canvas pins.',
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: compiled
            }
          }
        ]
      };
    }
  );

  return server;
}

async function main() {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[aifl-mcp] Fatal error:', err);
    process.exit(1);
  });
}

module.exports = {
  createMcpServer,
  getRuntimeConfig,
  callCollabMcp
};
