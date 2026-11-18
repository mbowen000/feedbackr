/**
 * End-to-end verification suite for AI Feedback Loop v2.0.0.
 *
 * Tests:
 * 1. Build output (`dist/guest/overlay.js`) exists and parses cleanly.
 * 2. Ephemeral target HTTP + HMR WebSocket server.
 * 3. Reverse proxy, external tunnel Basic Auth, and HTML script injection.
 * 4. Loopback isolation (`/ __collab/host-session`, `/__collab/mcp/*`) & non-`/ws` WS upgrade proxying.
 * 5. Multiplayer WebSocket cursor sync & Host vs Guest authority enforcement.
 * 6. Local MCP `stdio` loop (`resources`, `tools`, `prompts`) + live WS broadcast on mutations.
 */

const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const { WebSocket, WebSocketServer } = require('ws');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

const REPO_ROOT = path.resolve(__dirname, '..');

function httpRequest({ port, reqPath, method = 'GET', headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const payload = body !== null ? (typeof body === 'string' ? body : JSON.stringify(body)) : null;
    const reqHeaders = { ...headers };
    if (payload !== null) {
      reqHeaders['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: reqPath,
        method,
        headers: reqHeaders,
        timeout: 5000
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf8')
          });
        });
      }
    );

    req.on('timeout', () => req.destroy(new Error(`HTTP timeout: ${method} ${reqPath}`)));
    req.on('error', reject);
    if (payload !== null) req.write(payload);
    req.end();
  });
}

function createWsClient(url, wsOptions = {}) {
  const ws = new WebSocket(url, wsOptions);
  const messages = [];
  const waiters = [];

  const openPromise = new Promise((resolve, reject) => {
    const onOpen = () => {
      cleanup();
      resolve();
    };
    const onErr = (err) => {
      cleanup();
      reject(err);
    };
    function cleanup() {
      ws.off('open', onOpen);
      ws.off('error', onErr);
    }
    ws.on('open', onOpen);
    ws.on('error', onErr);
  });

  ws.on('message', (data, isBinary) => {
    const raw = Buffer.isBuffer(data) ? data.toString('utf8') : String(data);
    let parsed = null;
    if (!isBinary) {
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = null;
      }
    }
    const entry = { raw, parsed, isBinary, index: messages.length };
    messages.push(entry);

    for (let i = waiters.length - 1; i >= 0; i -= 1) {
      const waiter = waiters[i];
      if (entry.index >= waiter.afterIndex && waiter.predicate(entry)) {
        waiters.splice(i, 1);
        clearTimeout(waiter.timer);
        waiter.resolve(entry);
      }
    }
  });

  function checkpoint() {
    return messages.length;
  }

  function waitFor(predicate, label, { afterIndex = 0, timeoutMs = 5000 } = {}) {
    for (let i = afterIndex; i < messages.length; i += 1) {
      if (predicate(messages[i])) {
        return Promise.resolve(messages[i]);
      }
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = waiters.findIndex((w) => w.timer === timer);
        if (idx !== -1) waiters.splice(idx, 1);
        reject(new Error(`Timed out waiting for WS message (${label})`));
      }, timeoutMs);

      waiters.push({ predicate, afterIndex, timer, resolve });
    });
  }

  function waitForJson(predicate, label, opts) {
    return waitFor((entry) => entry.parsed !== null && predicate(entry.parsed), label, opts)
      .then((entry) => entry.parsed);
  }

  function sendJson(obj) {
    ws.send(JSON.stringify(obj));
  }

  async function close() {
    if (ws.readyState === WebSocket.CLOSED) return;
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        ws.terminate();
        resolve();
      }, 1000);
      ws.once('close', () => {
        clearTimeout(timer);
        resolve();
      });
      if (ws.readyState === WebSocket.CONNECTING) {
        ws.terminate();
      } else {
        ws.close();
      }
    });
  }

  return {
    ws,
    openPromise,
    checkpoint,
    waitFor,
    waitForJson,
    sendJson,
    close
  };
}

async function runStep(results, name, fn) {
  const start = Date.now();
  try {
    await fn();
    const elapsed = Date.now() - start;
    console.log(`PASS [${elapsed}ms] ${name}`);
    results.push({ name, ok: true, elapsed });
  } catch (err) {
    const elapsed = Date.now() - start;
    console.error(`FAIL [${elapsed}ms] ${name}: ${err.stack || err.message}`);
    results.push({ name, ok: false, elapsed, error: err });
    throw err;
  }
}

async function main() {
  const results = [];
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aifl-e2e-'));
  const dbPath = path.join(tmpDir, 'session.db');
  const runtimeFile = path.join(tmpDir, 'runtime.json');

  let targetServer = null;
  let targetWss = null;
  let proxy = null;
  let hmrClient = null;
  let guestClient = null;
  let hostClient = null;
  let mcpClient = null;

  try {
    // 1. Build & guest bundle verification
    await runStep(results, '1. Build & dist/guest/overlay.js parse check', async () => {
      const buildScript = path.join(REPO_ROOT, 'scripts', 'build.js');
      assert.ok(fs.existsSync(buildScript), 'scripts/build.js must exist');
      execFileSync(process.execPath, [buildScript], { cwd: REPO_ROOT, stdio: 'pipe' });

      const overlayPath = path.join(REPO_ROOT, 'dist', 'guest', 'overlay.js');
      assert.ok(fs.existsSync(overlayPath), 'dist/guest/overlay.js must exist');
      const code = fs.readFileSync(overlayPath, 'utf8');
      assert.ok(code.length > 1000, 'dist/guest/overlay.js must be non-empty');
      new vm.Script(code, { filename: overlayPath });
    });

    // 2. Ephemeral target HTTP + HMR WebSocket server
    let targetUrl;
    await runStep(results, '2. Start ephemeral target HTTP + HMR WS server', async () => {
      const demoHtml = fs.readFileSync(path.join(REPO_ROOT, 'demo.html'), 'utf8');
      targetWss = new WebSocketServer({ noServer: true });
      targetWss.on('connection', (ws) => {
        ws.send(JSON.stringify({ type: 'connected', hmr: true }));
        ws.on('message', (data) => {
          ws.send(`echo:${data.toString()}`);
        });
      });

      targetServer = http.createServer((req, res) => {
        const reqUrl = new URL(req.url, 'http://127.0.0.1');
        if (req.method === 'GET' && reqUrl.pathname === '/') {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(demoHtml);
          return;
        }
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
      });

      targetServer.on('upgrade', (req, socket, head) => {
        const reqUrl = new URL(req.url, 'http://127.0.0.1');
        if (reqUrl.pathname === '/vite-hmr') {
          targetWss.handleUpgrade(req, socket, head, (ws) => {
            targetWss.emit('connection', ws, req);
          });
        } else {
          socket.destroy();
        }
      });

      await new Promise((resolve) => targetServer.listen(0, '127.0.0.1', resolve));
      const { port } = targetServer.address();
      targetUrl = `http://127.0.0.1:${port}`;
    });

    // 3. Start createProxyServer on port 0
    let proxyPort;
    let collabUrl;
    let hostToken;
    let sessionPassphrase;
    await runStep(results, '3. Start createProxyServer on ephemeral port', async () => {
      const { createProxyServer } = require(path.join(REPO_ROOT, 'server', 'proxyServer.js'));
      proxy = createProxyServer({
        targetUrl,
        collabPort: 0,
        dbPath,
        runtimeFile
      });
      const started = await proxy.start();
      proxyPort = started.port;
      hostToken = started.hostToken;
      sessionPassphrase = started.sessionPassphrase;
      collabUrl = `http://127.0.0.1:${proxyPort}`;

      assert.ok(Number.isInteger(proxyPort) && proxyPort > 0, 'Proxy port must be positive integer');
      assert.ok(hostToken && hostToken.length >= 16, 'hostToken must be generated');
      assert.ok(sessionPassphrase && sessionPassphrase.length >= 4, 'sessionPassphrase must be generated');
      assert.ok(fs.existsSync(runtimeFile), 'runtime.json must be written on start()');
    });

    // 4. Proxy, Tunnel Auth & HTML Injection
    const basicAuthHeader = `Basic ${Buffer.from(`guest:${sessionPassphrase}`).toString('base64')}`;
    await runStep(results, '4. Proxy tunnel Basic Auth & HTML overlay injection', async () => {
      const unauthed = await httpRequest({
        port: proxyPort,
        reqPath: '/',
        headers: { 'X-Forwarded-For': '203.0.113.5' }
      });
      assert.equal(unauthed.statusCode, 401, 'External unauthenticated request must return 401');
      assert.ok(
        String(unauthed.headers['www-authenticate'] || '').includes('Basic'),
        '401 must include Basic WWW-Authenticate header'
      );

      const authed = await httpRequest({
        port: proxyPort,
        reqPath: '/',
        headers: {
          'X-Forwarded-For': '203.0.113.5',
          Authorization: basicAuthHeader
        }
      });
      assert.equal(authed.statusCode, 200, 'External request with valid Basic Auth must return 200');
      assert.ok(
        String(authed.headers['content-type'] || '').includes('text/html'),
        'Response must be text/html'
      );
      assert.ok(
        authed.body.includes('<script src="/__collab/overlay.js" defer></script>'),
        'Injected HTML must include guest overlay script tag'
      );

      const overlayRes = await httpRequest({
        port: proxyPort,
        reqPath: '/__collab/overlay.js',
        headers: {
          'X-Forwarded-For': '203.0.113.5',
          Authorization: basicAuthHeader
        }
      });
      assert.equal(overlayRes.statusCode, 200, 'GET /__collab/overlay.js must return 200');
      assert.ok(overlayRes.body.length > 1000, 'Served overlay.js must be non-empty');
    });

    // 5. Loopback Isolation & HMR Upgrade Forwarding
    await runStep(results, '5. Loopback isolation & /vite-hmr WS proxy', async () => {
      const extHostSessionNoAuth = await httpRequest({
        port: proxyPort,
        reqPath: '/__collab/host-session',
        headers: {
          'X-Forwarded-For': '203.0.113.5'
        }
      });
      assert.equal(extHostSessionNoAuth.statusCode, 403, 'External request to /__collab/host-session (no auth) must return 403');

      const extHostSession = await httpRequest({
        port: proxyPort,
        reqPath: '/__collab/host-session',
        headers: {
          'X-Forwarded-For': '203.0.113.5',
          Authorization: basicAuthHeader
        }
      });
      assert.equal(extHostSession.statusCode, 403, 'External request to /__collab/host-session (authed) must return 403');

      const extMcp = await httpRequest({
        port: proxyPort,
        reqPath: '/__collab/mcp/pins',
        headers: {
          'X-Forwarded-For': '203.0.113.5'
        }
      });
      assert.equal(extMcp.statusCode, 403, 'External request to /__collab/mcp/pins must return 403');

      const localHostSession = await httpRequest({
        port: proxyPort,
        reqPath: '/__collab/host-session'
      });
      assert.equal(localHostSession.statusCode, 200, 'Loopback /__collab/host-session must return 200');
      const parsed = JSON.parse(localHostSession.body);
      assert.equal(parsed.ok, true);
      assert.equal(parsed.role, 'host');
      assert.equal(parsed.hostToken, hostToken);

      hmrClient = createWsClient(`ws://127.0.0.1:${proxyPort}/vite-hmr`);
      await hmrClient.openPromise;
      const connectedMsg = await hmrClient.waitForJson((m) => m.type === 'connected' && m.hmr === true, 'HMR connected');
      assert.equal(connectedMsg.hmr, true);

      const hmrCp = hmrClient.checkpoint();
      hmrClient.ws.send('hmr-ping');
      const echoMsg = await hmrClient.waitFor((e) => e.raw === 'echo:hmr-ping', 'HMR echo', { afterIndex: hmrCp });
      assert.equal(echoMsg.raw, 'echo:hmr-ping');
      await hmrClient.close();
      hmrClient = null;
    });

    // 6. Multiplayer WebSocket & Authority
    let createdPinId;
    await runStep(results, '6. Multiplayer WebSocket cursor sync & Host vs Guest authority', async () => {
      guestClient = createWsClient(
        `ws://127.0.0.1:${proxyPort}/ws?name=Alice&clientId=guest_alice`
      );
      await guestClient.openPromise;
      const guestInit = await guestClient.waitForJson((m) => m.type === 'init', 'guest init');
      assert.equal(guestInit.role, 'guest');

      hostClient = createWsClient(
        `ws://127.0.0.1:${proxyPort}/ws?hostToken=${encodeURIComponent(hostToken)}&name=Host&clientId=host_local`
      );
      await hostClient.openPromise;
      const hostInit = await hostClient.waitForJson((m) => m.type === 'init', 'host init');
      assert.equal(hostInit.role, 'host');

      // Cursor sync Guest -> Host
      const hostCursorCp = hostClient.checkpoint();
      guestClient.sendJson({
        type: 'cursor_move',
        cursor: { pageX: 215, pageY: 340, clientX: 215, clientY: 340, routeKey: '/' }
      });
      const cursorMsg = await hostClient.waitForJson(
        (m) => m.type === 'cursor_move' && m.author?.name === 'Alice',
        'Host receives cursor_move from Alice',
        { afterIndex: hostCursorCp }
      );
      assert.equal(cursorMsg.cursor.pageX, 215);

      // Guest creates pin (server must force status === 'pending' even if guest sends 'approved')
      const hostPinCreateCp = hostClient.checkpoint();
      guestClient.sendJson({
        type: 'pin_create',
        pin: {
          text: 'Increase CTA contrast to WCAG AA',
          status: 'approved',
          screen: {
            url: `${collabUrl}/`,
            routeKey: '/',
            screenLabel: '/',
            title: 'AI Feedback Loop — Interactive Test Playground',
            viewport: { width: 1280, height: 800 },
            landscape: [
              { id: 'L1', container: '<header>', title: 'Header', summary: 'Top navigation bar' }
            ]
          },
          target: {
            isFreePin: false,
            pinType: 'element',
            selector: '#cta-primary',
            shortLabel: 'button#cta-primary',
            tagName: 'button',
            textSnippet: 'Start Free Trial',
            placementNarrative: 'Primary CTA button inside hero banner',
            landmarkRef: { id: 'L1', container: '<header>', title: 'Header' },
            pageCoords: { x: 420, y: 260 },
            viewportPct: { x: 33, y: 32 }
          }
        }
      });

      const createdBroadcast = await hostClient.waitForJson(
        (m) => m.type === 'pins_updated' && Array.isArray(m.pins) && m.pins.length === 1,
        'Host receives pin_create broadcast',
        { afterIndex: hostPinCreateCp }
      );
      const createdPin = createdBroadcast.pins[0];
      assert.equal(createdPin.status, 'pending', 'Guest-created pin must start as pending');
      assert.equal(createdPin.author.role, 'guest');
      createdPinId = createdPin.id;

      // Guest tries to approve own pin -> 403 error, status stays 'pending'
      const guestErrCp = guestClient.checkpoint();
      guestClient.sendJson({
        type: 'pin_status',
        pinId: createdPinId,
        status: 'approved'
      });
      const errMsg = await guestClient.waitForJson(
        (m) => m.type === 'error' && m.code === 403,
        'Guest receives 403 error on pin_status',
        { afterIndex: guestErrCp }
      );
      assert.equal(errMsg.code, 403);

      const checkPendingRes = await httpRequest({
        port: proxyPort,
        reqPath: `/__collab/mcp/pins/${encodeURIComponent(createdPinId)}`,
        headers: { 'x-aifl-host-token': hostToken }
      });
      assert.equal(checkPendingRes.statusCode, 200);
      assert.equal(JSON.parse(checkPendingRes.body).pin.status, 'pending');

      // Host approves pin -> Guest receives pins_updated with status === 'approved'
      const guestApproveCp = guestClient.checkpoint();
      hostClient.sendJson({
        type: 'pin_status',
        pinId: createdPinId,
        status: 'approved'
      });
      const approvedBroadcast = await guestClient.waitForJson(
        (m) =>
          m.type === 'pins_updated' &&
          m.pins.some((p) => p.id === createdPinId && p.status === 'approved'),
        'Guest receives approved pins_updated',
        { afterIndex: guestApproveCp }
      );
      assert.equal(
        approvedBroadcast.pins.find((p) => p.id === createdPinId).status,
        'approved'
      );
    });

    // 7. MCP stdio Loop
    await runStep(results, '7. MCP stdio loop & live WS broadcasts on clarify/resolve', async () => {
      const transport = new StdioClientTransport({
        command: process.execPath,
        args: ['--no-warnings', path.join(REPO_ROOT, 'server', 'mcpServer.js')],
        env: {
          ...process.env,
          AIFL_COLLAB_URL: collabUrl,
          AIFL_RUNTIME_FILE: runtimeFile,
          AIFL_DB_PATH: dbPath
        }
      });

      mcpClient = new Client({ name: 'aifl-e2e-client', version: '2.0.0' });
      await mcpClient.connect(transport);

      // Resources
      const resourceList = await mcpClient.listResources();
      const uris = resourceList.resources.map((r) => r.uri);
      assert.ok(uris.includes('canvas://pins/approved'), 'Resource canvas://pins/approved missing');
      assert.ok(uris.includes('canvas://session/active-branch'), 'Resource canvas://session/active-branch missing');
      assert.ok(uris.includes('canvas://dom/snapshot'), 'Resource canvas://dom/snapshot missing');

      const approvedResource = await mcpClient.readResource({ uri: 'canvas://pins/approved' });
      const approvedPins = JSON.parse(approvedResource.contents[0].text);
      assert.ok(
        approvedPins.some((p) => p.id === createdPinId && p.status === 'approved'),
        'Approved pin must appear in canvas://pins/approved'
      );

      const sessionResource = await mcpClient.readResource({ uri: 'canvas://session/active-branch' });
      const sessionInfo = JSON.parse(sessionResource.contents[0].text);
      assert.ok(sessionInfo.counts.approved >= 1, 'Session resource must report approved count');

      const snapshotResource = await mcpClient.readResource({ uri: 'canvas://dom/snapshot' });
      const snapshotData = JSON.parse(snapshotResource.contents[0].text);
      assert.ok(snapshotData.landscape.length >= 1, 'DOM snapshot must aggregate landscape');
      assert.ok(
        snapshotData.targets.some((t) => t.pinId === createdPinId),
        'DOM snapshot must contain pin target'
      );

      // Prompt: compile_spatial_feedback_batch (called while pin is approved)
      const promptRes = await mcpClient.getPrompt({
        name: 'compile_spatial_feedback_batch',
        arguments: { mode: 'standard' }
      });
      assert.ok(Array.isArray(promptRes.messages) && promptRes.messages.length >= 1);
      assert.ok(
        promptRes.messages[0].content.text.includes('Increase CTA contrast to WCAG AA'),
        'Compiled prompt must include approved pin feedback'
      );

      // Tools: get_approved_pins (routeKey miss, then markInProgress), get_pin_dom_context
      const emptyRouteRes = await mcpClient.callTool({
        name: 'get_approved_pins',
        arguments: { routeKey: '/nonexistent-route' }
      });
      assert.ok(!emptyRouteRes.isError);
      assert.equal(emptyRouteRes.structuredContent.count, 0);

      const hostInProgressCp = hostClient.checkpoint();
      const approvedToolRes = await mcpClient.callTool({
        name: 'get_approved_pins',
        arguments: { routeKey: '/', markInProgress: true }
      });
      assert.ok(!approvedToolRes.isError);
      assert.equal(approvedToolRes.structuredContent.count, 1);
      assert.equal(approvedToolRes.structuredContent.pins[0].status, 'in_progress');
      assert.ok(approvedToolRes.content[0].text.includes('#cta-primary'));

      await hostClient.waitForJson(
        (m) =>
          m.type === 'pins_updated' &&
          m.pins.some((p) => p.id === createdPinId && p.status === 'in_progress'),
        'Host receives in_progress pins_updated',
        { afterIndex: hostInProgressCp }
      );

      const inProgressResource = await mcpClient.readResource({ uri: 'canvas://pins/approved' });
      const inProgressPins = JSON.parse(inProgressResource.contents[0].text);
      assert.ok(
        inProgressPins.some((p) => p.id === createdPinId && p.status === 'in_progress'),
        'in_progress pin must remain visible in canvas://pins/approved'
      );

      const missingContextRes = await mcpClient.callTool({
        name: 'get_pin_dom_context',
        arguments: { pinId: 'nonexistent_pin_id' }
      });
      assert.equal(missingContextRes.isError, true);

      const domContextRes = await mcpClient.callTool({
        name: 'get_pin_dom_context',
        arguments: { pinId: createdPinId }
      });
      assert.ok(!domContextRes.isError);
      assert.ok(domContextRes.content[0].text.includes('Primary CTA button inside hero banner'));
      assert.ok(domContextRes.content[0].text.includes('Start Free Trial'));

      // Tool: request_pin_clarification -> verifies Host & Guest WS receive pins_updated with agent reply
      const hostClarifyCp = hostClient.checkpoint();
      const guestClarifyCp = guestClient.checkpoint();
      const question = 'Should we target #4f46e5 for the primary button background?';
      const clarifyRes = await mcpClient.callTool({
        name: 'request_pin_clarification',
        arguments: { pinId: createdPinId, question }
      });
      assert.ok(!clarifyRes.isError);

      const hasClarifyReply = (m) =>
        m.type === 'pins_updated' &&
        m.pins.some(
          (p) =>
            p.id === createdPinId &&
            Array.isArray(p.replies) &&
            p.replies.some((r) => r.role === 'agent' && r.text === question)
        );

      const [hostClarifyMsg, guestClarifyMsg] = await Promise.all([
        hostClient.waitForJson(hasClarifyReply, 'Host receives clarification pins_updated', {
          afterIndex: hostClarifyCp
        }),
        guestClient.waitForJson(hasClarifyReply, 'Guest receives clarification pins_updated', {
          afterIndex: guestClarifyCp
        })
      ]);
      assert.ok(hostClarifyMsg && guestClarifyMsg);

      // Tool: mark_pin_resolved -> verifies Host & Guest WS receive pins_updated with status === 'resolved'
      const hostResolveCp = hostClient.checkpoint();
      const guestResolveCp = guestClient.checkpoint();
      const resolveRes = await mcpClient.callTool({
        name: 'mark_pin_resolved',
        arguments: {
          pinId: createdPinId,
          summary: 'Updated button background to #4f46e5 for WCAG AA contrast.'
        }
      });
      assert.ok(!resolveRes.isError);

      const isResolvedMsg = (m) =>
        m.type === 'pins_updated' &&
        m.pins.some((p) => p.id === createdPinId && p.status === 'resolved');

      const [hostResolveMsg, guestResolveMsg] = await Promise.all([
        hostClient.waitForJson(isResolvedMsg, 'Host receives resolved pins_updated', {
          afterIndex: hostResolveCp
        }),
        guestClient.waitForJson(isResolvedMsg, 'Guest receives resolved pins_updated', {
          afterIndex: guestResolveCp
        })
      ]);
      assert.ok(hostResolveMsg && guestResolveMsg);
    });

    // 8. MCP SQLite fallback when Collab Server stops
    await runStep(results, '8. MCP SQLite fallback when Collab HTTP server is offline', async () => {
      await guestClient.close();
      guestClient = null;
      await hostClient.close();
      hostClient = null;
      await proxy.stop();

      const offlinePinRes = await mcpClient.callTool({
        name: 'get_pin_dom_context',
        arguments: { pinId: createdPinId }
      });
      assert.ok(!offlinePinRes.isError);
      assert.equal(offlinePinRes.structuredContent.source, 'sqlite');
      assert.equal(offlinePinRes.structuredContent.pin.status, 'resolved');

      const offlineSession = await mcpClient.readResource({ uri: 'canvas://session/active-branch' });
      const offlineSessionData = JSON.parse(offlineSession.contents[0].text);
      assert.equal(offlineSessionData.liveServerConnected, false);
      assert.equal(offlineSessionData.counts.resolved, 1);
    });

    console.log(`\nAll ${results.length} E2E verification steps passed.`);
    process.exitCode = 0;
  } catch {
    console.error(`\nE2E verification failed (${results.filter((r) => r.ok).length}/${results.length} steps passed).`);
    process.exitCode = 1;
  } finally {
    if (mcpClient) {
      await mcpClient.close().catch(() => {});
    }
    if (hmrClient) {
      await hmrClient.close().catch(() => {});
    }
    if (guestClient) {
      await guestClient.close().catch(() => {});
    }
    if (hostClient) {
      await hostClient.close().catch(() => {});
    }
    if (proxy) {
      await proxy.stop().catch(() => {});
    }
    if (targetWss) {
      await new Promise((resolve) => targetWss.close(() => resolve())).catch(() => {});
    }
    if (targetServer) {
      await new Promise((resolve) => targetServer.close(() => resolve())).catch(() => {});
    }
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors on temp dir
    }
  }
}

main();

