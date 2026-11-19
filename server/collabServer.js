const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { WebSocketServer, WebSocket } = require('ws');
const syncProtocol = require('y-protocols/sync');
const awarenessProtocol = require('y-protocols/awareness');
const encoding = require('lib0/encoding');
const decoding = require('lib0/decoding');
const {
  DEFAULT_COLLAB_PORT,
  DEFAULT_TARGET_PORT,
  PEER_COLORS,
  normalizeAuthor
} = require('../shared/schema');
const { createAgentRunner } = require('./agentRunner');

const DEFAULT_RUNTIME_FILE = path.join(process.cwd(), '.aifl-session', 'runtime.json');
const LOOPBACK_ADDRS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const PROXY_HEADERS = [
  'x-forwarded-for',
  'cf-connecting-ip',
  'x-forwarded-host',
  'x-real-ip',
  'via',
  'x-aifl-force-guest'
];
const LOCAL_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

const YJS_MESSAGE_SYNC = 0;
const YJS_MESSAGE_AWARENESS = 1;

function generateHostToken() {
  return crypto.randomBytes(16).toString('hex');
}

function generateSessionPassphrase(length = 8) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

function isStrictLoopback(req) {
  const remote = req?.socket?.remoteAddress || '';
  if (!LOOPBACK_ADDRS.has(remote)) {
    return false;
  }
  const headers = req?.headers || {};
  for (const headerName of PROXY_HEADERS) {
    if (Object.prototype.hasOwnProperty.call(headers, headerName) && headers[headerName] !== undefined) {
      return false;
    }
  }
  return true;
}

function isAllowedLocalOrigin(origin) {
  if (!origin) return true;
  return LOCAL_ORIGIN_RE.test(String(origin));
}

function sendJson(res, statusCode, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders
  });
  res.end(body);
}

function readJsonBody(req, maxBytes = 5 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        const err = new Error('Request body too large');
        err.statusCode = 413;
        reject(err);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        const err = new Error('Invalid JSON request body');
        err.statusCode = 400;
        reject(err);
      }
    });
    req.on('error', (err) => reject(err));
  });
}

class CollabServer {
  constructor(options = {}) {
    if (!options.store) {
      throw new Error('CollabServer requires a store instance');
    }
    this.store = options.store;
    this.hostToken = options.hostToken || generateHostToken();
    this.sessionPassphrase = options.sessionPassphrase || generateSessionPassphrase();
    this.targetUrl = options.targetUrl || `http://127.0.0.1:${DEFAULT_TARGET_PORT}`;
    this.collabPort = options.collabPort ?? DEFAULT_COLLAB_PORT;
    this.runtimeFile = options.runtimeFile || process.env.AIFL_RUNTIME_FILE || DEFAULT_RUNTIME_FILE;
    this.repoRoot = path.resolve(__dirname, '..');
    this.workspaceRoot = path.resolve(options.workspaceRoot || process.cwd());
    this.defaultAgent = options.defaultAgent || 'agy';

    this.clients = new Map();
    this._colorSeq = 0;

    this.agentRunner = createAgentRunner({
      store: this.store,
      workspaceRoot: this.workspaceRoot,
      defaultProvider: this.defaultAgent,
      onEvent: (payload) => this.broadcastJson(payload),
      spawnImpl: options.spawnImpl
    });

    this.awareness = new awarenessProtocol.Awareness(this.store.ydoc);
    this.awareness.setLocalState(null);

    this.wss = new WebSocketServer({ noServer: true });
    this._setupWebSocketServer();
    this._setupYjsListeners();

    if (Number(this.collabPort) > 0) {
      this._writeRuntimeFile();
    }
  }

  isStrictLoopback(req) {
    return isStrictLoopback(req);
  }

  isAllowedLocalOrigin(origin) {
    return isAllowedLocalOrigin(origin);
  }

  setRuntimeInfo({ collabPort, targetUrl } = {}) {
    if (collabPort !== undefined) {
      this.collabPort = collabPort;
    }
    if (targetUrl !== undefined) {
      this.targetUrl = targetUrl;
    }
    this._writeRuntimeFile();
  }

  _writeRuntimeFile() {
    if (!this.runtimeFile) return;
    try {
      fs.mkdirSync(path.dirname(this.runtimeFile), { recursive: true });
      const data = {
        collabPort: this.collabPort,
        collabUrl: `http://127.0.0.1:${this.collabPort}`,
        targetUrl: this.targetUrl,
        hostToken: this.hostToken,
        dbPath: this.store.dbPath,
        pid: process.pid,
        updatedAt: Date.now()
      };
      fs.writeFileSync(this.runtimeFile, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
      console.error('[collabServer] Failed to write runtime file:', err.message);
    }
  }

  _setupYjsListeners() {
    this._onYDocUpdate = (update, origin) => {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, YJS_MESSAGE_SYNC);
      syncProtocol.writeUpdate(encoder, update);
      const message = encoding.toUint8Array(encoder);

      for (const [ws, client] of this.clients.entries()) {
        if (ws.readyState === WebSocket.OPEN && client.usesYjsBinary && ws !== origin) {
          ws.send(message, { binary: true });
        }
      }

      if (origin && this.clients.has(origin)) {
        const sender = this.clients.get(origin);
        this.broadcastJson({
          type: 'pins_updated',
          action: 'yjs_sync',
          actorRole: sender.role,
          pins: this.store.getAllPins()
        });
      }
    };

    this._onAwarenessUpdate = ({ added, updated, removed }, origin) => {
      const changedClients = added.concat(updated, removed);
      if (origin && this.clients.has(origin)) {
        const client = this.clients.get(origin);
        for (const id of added) client.controlledAwarenessIds.add(id);
        for (const id of updated) client.controlledAwarenessIds.add(id);
        for (const id of removed) client.controlledAwarenessIds.delete(id);
      }

      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, YJS_MESSAGE_AWARENESS);
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(this.awareness, changedClients)
      );
      const buff = encoding.toUint8Array(encoder);

      for (const [ws, client] of this.clients.entries()) {
        if (ws.readyState === WebSocket.OPEN && client.usesYjsBinary && ws !== origin) {
          ws.send(buff, { binary: true });
        }
      }
    };

    this.store.ydoc.on('update', this._onYDocUpdate);
    this.awareness.on('update', this._onAwarenessUpdate);
  }

  _setupWebSocketServer() {
    this.wss.on('connection', (ws, req) => {
      const reqUrl = new URL(req.url || '/ws', 'http://127.0.0.1');
      const hostTokenQuery = reqUrl.searchParams.get('hostToken') || '';
      const role = hostTokenQuery && hostTokenQuery === this.hostToken ? 'host' : 'guest';

      const requestedId = (reqUrl.searchParams.get('clientId') || '').trim();
      const clientId = requestedId || `${role}_${crypto.randomBytes(4).toString('hex')}`;
      const requestedName = (reqUrl.searchParams.get('name') || '').trim();
      const requestedColor = (reqUrl.searchParams.get('color') || '').trim();
      const fallbackColor =
        role === 'host'
          ? '#6366f1'
          : PEER_COLORS[this._colorSeq++ % PEER_COLORS.length];

      const author = normalizeAuthor(
        {
          id: clientId,
          name: requestedName || (role === 'host' ? 'Host' : 'Guest Reviewer'),
          role,
          color: requestedColor || fallbackColor
        },
        role
      );

      const clientState = {
        ws,
        clientId,
        role,
        author,
        usesYjsBinary: false,
        sentYjsInit: false,
        controlledAwarenessIds: new Set()
      };
      this.clients.set(ws, clientState);

      const peers = this.getPeers();
      this.sendJsonWs(ws, {
        type: 'init',
        clientId,
        role,
        author,
        pins: this.store.getAllPins(),
        peers
      });
      this.broadcastJson({ type: 'peers_updated', peers });

      ws.on('message', (data, isBinary) => {
        if (isBinary) {
          this._handleYjsBinaryMessage(ws, clientState, data);
          return;
        }
        this._handleJsonWsMessage(ws, clientState, data);
      });

      ws.on('close', () => {
        this.clients.delete(ws);
        if (clientState.controlledAwarenessIds.size > 0) {
          awarenessProtocol.removeAwarenessStates(
            this.awareness,
            Array.from(clientState.controlledAwarenessIds),
            null
          );
        }
        this.broadcastJson({
          type: 'peers_updated',
          peers: this.getPeers()
        });
      });

      ws.on('error', () => {
        // Handled via close cleanup
      });
    });
  }

  _handleYjsBinaryMessage(ws, client, rawData) {
    try {
      client.usesYjsBinary = true;
      const buf = rawData instanceof Uint8Array ? rawData : new Uint8Array(rawData);
      const decoder = decoding.createDecoder(buf);
      const messageType = decoding.readVarUint(decoder);

      if (messageType === YJS_MESSAGE_SYNC) {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, YJS_MESSAGE_SYNC);
        syncProtocol.readSyncMessage(decoder, encoder, this.store.ydoc, ws);
        if (encoding.length(encoder) > 1 && ws.readyState === WebSocket.OPEN) {
          ws.send(encoding.toUint8Array(encoder), { binary: true });
        }

        if (!client.sentYjsInit && ws.readyState === WebSocket.OPEN) {
          client.sentYjsInit = true;
          const syncEnc = encoding.createEncoder();
          encoding.writeVarUint(syncEnc, YJS_MESSAGE_SYNC);
          syncProtocol.writeSyncStep1(syncEnc, this.store.ydoc);
          ws.send(encoding.toUint8Array(syncEnc), { binary: true });

          const awarenessStates = this.awareness.getStates();
          if (awarenessStates.size > 0) {
            const awEnc = encoding.createEncoder();
            encoding.writeVarUint(awEnc, YJS_MESSAGE_AWARENESS);
            encoding.writeVarUint8Array(
              awEnc,
              awarenessProtocol.encodeAwarenessUpdate(
                this.awareness,
                Array.from(awarenessStates.keys())
              )
            );
            ws.send(encoding.toUint8Array(awEnc), { binary: true });
          }
        }
      } else if (messageType === YJS_MESSAGE_AWARENESS) {
        awarenessProtocol.applyAwarenessUpdate(
          this.awareness,
          decoding.readVarUint8Array(decoder),
          ws
        );
      }
    } catch (err) {
      this.sendJsonWs(ws, {
        type: 'error',
        code: 400,
        message: `Yjs protocol error: ${err.message}`
      });
    }
  }

  _handleJsonWsMessage(ws, client, rawData) {
    let msg;
    try {
      msg = JSON.parse(typeof rawData === 'string' ? rawData : rawData.toString('utf8'));
    } catch {
      this.sendJsonWs(ws, { type: 'error', code: 400, message: 'Invalid JSON frame' });
      return;
    }

    if (!msg || typeof msg !== 'object') {
      this.sendJsonWs(ws, { type: 'error', code: 400, message: 'Expected JSON object frame' });
      return;
    }

    const { role, author } = client;

    try {
      switch (msg.type) {
        case 'ping': {
          this.sendJsonWs(ws, { type: 'pong', ts: Date.now() });
          break;
        }
        case 'cursor_move': {
          this.broadcastJson(
            {
              type: 'cursor_move',
              clientId: client.clientId,
              author,
              cursor: msg.cursor || null
            },
            ws
          );
          break;
        }
        case 'author_update': {
          const nextName = typeof msg.name === 'string' ? msg.name.trim().slice(0, 48) : '';
          if (nextName) {
            client.author = normalizeAuthor({ ...author, name: nextName }, role);
            this.broadcastJson({ type: 'peers_updated', peers: this.getPeers() });
          }
          break;
        }
        case 'pin_create': {
          const rawPin = msg.pin && typeof msg.pin === 'object' ? { ...msg.pin } : {};
          const pinAuthor = rawPin.author && typeof rawPin.author === 'object' ? { ...rawPin.author } : {};
          rawPin.author = {
            ...author,
            ...pinAuthor,
            id: role === 'host' ? (pinAuthor.id || author.id) : author.id,
            role: role === 'host' ? (pinAuthor.role || 'host') : 'guest'
          };
          const { pin, pins } = this.store.createPin(rawPin, role);
          this.broadcastJson({
            type: 'pins_updated',
            action: 'create',
            pinId: pin.id,
            actorRole: role,
            pins
          });
          break;
        }
        case 'pin_update': {
          const { pin, pins } = this.store.updatePin(msg.pinId, msg.patch || {}, role, author.id);
          this.broadcastJson({
            type: 'pins_updated',
            action: 'update',
            pinId: pin.id,
            actorRole: role,
            pins
          });
          break;
        }
        case 'pin_status': {
          const { pin, pins } = this.store.updatePinStatus(msg.pinId, msg.status, {
            summary: msg.summary,
            actorRole: role
          });
          this.broadcastJson({
            type: 'pins_updated',
            action: 'status',
            pinId: pin.id,
            status: pin.status,
            actorRole: role,
            pins
          });
          break;
        }
        case 'pin_batch_status': {
          const { pins } = this.store.batchUpdateStatus(msg.pinIds, msg.status, {
            summary: msg.summary,
            actorRole: role
          });
          this.broadcastJson({
            type: 'pins_updated',
            action: 'batch_status',
            pinIds: Array.isArray(msg.pinIds) ? msg.pinIds : [],
            status: msg.status,
            actorRole: role,
            pins
          });
          if (msg.status === 'approved') {
            this.broadcastJson({
              type: 'agent_dispatch_requested',
              pinIds: Array.isArray(msg.pinIds) ? msg.pinIds : [],
              pins
            });
          }
          break;
        }
        case 'pin_reply': {
          const { pin, reply, pins } = this.store.addReply(
            msg.pinId,
            {
              authorName: msg.authorName || author.name,
              role,
              text: msg.text
            },
            role
          );
          this.broadcastJson({
            type: 'pins_updated',
            action: 'reply',
            pinId: pin.id,
            reply,
            actorRole: role,
            pins
          });
          break;
        }
        case 'pin_delete': {
          const pins = this.store.deletePin(msg.pinId, role, author.id);
          this.broadcastJson({
            type: 'pins_updated',
            action: 'delete',
            pinId: msg.pinId,
            actorRole: role,
            pins
          });
          break;
        }
        case 'pins_clear': {
          const pins = this.store.clearPins({
            scope: msg.scope,
            routeKey: msg.routeKey,
            actorRole: role
          });
          this.broadcastJson({
            type: 'pins_updated',
            action: 'clear',
            scope: msg.scope || 'all',
            routeKey: msg.routeKey || null,
            actorRole: role,
            pins
          });
          break;
        }
        case 'agent_run': {
          if (role !== 'host') {
            const err = new Error('Host authority required to run headless CLI agent');
            err.statusCode = 403;
            throw err;
          }
          Promise.resolve(
            this.agentRunner.run({
              pinIds: Array.isArray(msg.pinIds) ? msg.pinIds : undefined,
              provider: msg.provider
            })
          ).catch((err) => {
            this.sendJsonWs(ws, {
              type: 'error',
              code: err.statusCode || 400,
              message: err.message || 'Agent run failed'
            });
          });
          break;
        }
        default: {
          this.sendJsonWs(ws, {
            type: 'error',
            code: 400,
            message: `Unknown message type: ${msg.type}`
          });
        }
      }
    } catch (err) {
      this.sendJsonWs(ws, {
        type: 'error',
        code: err.statusCode || 400,
        message: err.message || 'Operation failed'
      });
    }
  }

  getPeers() {
    const peers = [];
    for (const [ws, client] of this.clients.entries()) {
      if (ws.readyState === WebSocket.OPEN) {
        peers.push({
          clientId: client.clientId,
          role: client.role,
          author: client.author
        });
      }
    }
    return peers;
  }

  sendJsonWs(ws, payload) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }

  broadcastJson(payload, excludeWs = null) {
    const serialized = JSON.stringify(payload);
    for (const [ws] of this.clients.entries()) {
      if (ws !== excludeWs && ws.readyState === WebSocket.OPEN) {
        ws.send(serialized);
      }
    }
  }

  handleUpgrade(req, socket, head) {
    this.wss.handleUpgrade(req, socket, head, (ws) => {
      this.wss.emit('connection', ws, req);
    });
  }

  async handleHttp(req, res) {
    const reqUrl = new URL(req.url || '/', 'http://127.0.0.1');
    const pathname = reqUrl.pathname;
    const method = (req.method || 'GET').toUpperCase();
    const origin = req.headers.origin;

    if (method === 'OPTIONS') {
      if (pathname.startsWith('/__collab/mcp')) {
        sendJson(res, 403, { ok: false, error: 'MCP endpoints do not allow CORS preflight' });
        return;
      }
      if (pathname === '/__collab/status') {
        res.writeHead(204, {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Cache-Control': 'no-store'
        });
        res.end();
        return;
      }
      if (!isAllowedLocalOrigin(origin)) {
        sendJson(res, 403, { ok: false, error: 'Origin not allowed' });
        return;
      }
      const corsHeaders = {
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-AIFL-Host-Token',
        'Cache-Control': 'no-store'
      };
      if (origin) {
        corsHeaders['Access-Control-Allow-Origin'] = origin;
        corsHeaders.Vary = 'Origin';
      }
      res.writeHead(204, corsHeaders);
      res.end();
      return;
    }

    if (method === 'GET' && pathname === '/__collab/status') {
      sendJson(
        res,
        200,
        {
          ok: true,
          version: '2.0.0',
          wsPath: '/ws',
          isLoopback: isStrictLoopback(req)
        },
        { 'Access-Control-Allow-Origin': '*' }
      );
      return;
    }

    if (method === 'GET' && pathname === '/__collab/host-session') {
      if (!isStrictLoopback(req) || !isAllowedLocalOrigin(origin)) {
        sendJson(res, 403, { ok: false, error: 'Loopback host access only' });
        return;
      }
      const headers = {};
      if (origin) {
        headers['Access-Control-Allow-Origin'] = origin;
        headers.Vary = 'Origin';
      }
      sendJson(
        res,
        200,
        {
          ok: true,
          role: 'host',
          hostToken: this.hostToken,
          sessionPassphrase: this.sessionPassphrase,
          agent: this.agentRunner.getStatus()
        },
        headers
      );
      return;
    }

    if (method === 'GET' && pathname === '/__collab/overlay.js') {
      const overlayPath = path.join(this.repoRoot, 'dist', 'guest', 'overlay.js');
      try {
        const content = await fs.promises.readFile(overlayPath, 'utf8');
        res.writeHead(200, {
          'Content-Type': 'application/javascript; charset=utf-8',
          'Cache-Control': 'no-store'
        });
        res.end(content);
      } catch (err) {
        if (err.code === 'ENOENT') {
          res.writeHead(503, {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'no-store'
          });
          res.end("Guest overlay bundle missing (dist/guest/overlay.js). Run 'npm run build' first.");
          return;
        }
        sendJson(res, 500, { ok: false, error: err.message });
      }
      return;
    }

    if (method === 'GET' && pathname === '/__collab/styles.css') {
      const stylesPath = path.join(this.repoRoot, 'content', 'styles.css');
      try {
        const content = await fs.promises.readFile(stylesPath, 'utf8');
        res.writeHead(200, {
          'Content-Type': 'text/css; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-store'
        });
        res.end(content);
      } catch (err) {
        sendJson(res, err.code === 'ENOENT' ? 404 : 500, { ok: false, error: err.message });
      }
      return;
    }

    if (pathname === '/__collab/mcp' || pathname.startsWith('/__collab/mcp/')) {
      await this._handleMcpHttp(req, res, pathname, reqUrl, method);
      return;
    }

    sendJson(res, 404, { ok: false, error: `Unknown collab endpoint: ${pathname}` });
  }

  async _handleMcpHttp(req, res, pathname, reqUrl, method) {
    const providedToken = req.headers['x-aifl-host-token'];
    const tokenMismatch = providedToken !== undefined && providedToken !== this.hostToken;
    if (!isStrictLoopback(req) || Boolean(req.headers.origin) || tokenMismatch) {
      sendJson(res, 403, { ok: false, error: 'Loopback MCP access only' });
      return;
    }

    try {
      if (method === 'GET' && pathname === '/__collab/mcp/pins') {
        const status = reqUrl.searchParams.get('status') || undefined;
        const routeKey = reqUrl.searchParams.get('routeKey') || undefined;
        const pins = this.store.getAllPins({ status, routeKey });
        sendJson(res, 200, { ok: true, pins });
        return;
      }

      if (method === 'GET' && pathname === '/__collab/mcp/session') {
        sendJson(res, 200, {
          ok: true,
          targetUrl: this.targetUrl,
          collabPort: this.collabPort,
          workspaceRoot: this.workspaceRoot,
          agent: this.agentRunner.getStatus(),
          counts: this.store.getCounts()
        });
        return;
      }

      if (method === 'GET' && pathname === '/__collab/mcp/agent-status') {
        sendJson(res, 200, {
          ok: true,
          ...this.agentRunner.getStatus()
        });
        return;
      }

      if (method === 'POST' && pathname === '/__collab/mcp/run-agent') {
        const body = await readJsonBody(req);
        const started = await this.agentRunner.run({
          pinIds: Array.isArray(body.pinIds) ? body.pinIds : undefined,
          provider: body.provider
        });
        sendJson(res, 202, {
          ok: true,
          runId: started.runId,
          provider: started.provider,
          label: started.label,
          workspaceRoot: started.workspaceRoot,
          pinIds: started.pinIds
        });
        return;
      }

      if (method === 'POST' && pathname === '/__collab/mcp/pins/batch-status') {
        const body = await readJsonBody(req);
        const { updatedPins, pins } = this.store.batchUpdateStatus(body.pinIds, body.status, {
          summary: body.summary,
          actorRole: 'mcp'
        });
        this.broadcastJson({
          type: 'pins_updated',
          action: 'batch_status',
          pinIds: Array.isArray(body.pinIds) ? body.pinIds : [],
          status: body.status,
          actorRole: 'mcp',
          pins
        });
        sendJson(res, 200, { ok: true, updatedPins, pins });
        return;
      }

      const resolveMatch = pathname.match(/^\/__collab\/mcp\/pins\/([^/]+)\/resolve$/);
      if (method === 'POST' && resolveMatch) {
        const pinId = decodeURIComponent(resolveMatch[1]);
        const body = await readJsonBody(req);
        const { pin, pins } = this.store.updatePinStatus(pinId, 'resolved', {
          summary: body.summary,
          actorRole: 'mcp'
        });
        this.broadcastJson({
          type: 'pins_updated',
          action: 'status',
          pinId: pin.id,
          status: pin.status,
          actorRole: 'mcp',
          pins
        });
        sendJson(res, 200, { ok: true, pin });
        return;
      }

      const clarifyMatch = pathname.match(/^\/__collab\/mcp\/pins\/([^/]+)\/clarify$/);
      if (method === 'POST' && clarifyMatch) {
        const pinId = decodeURIComponent(clarifyMatch[1]);
        const body = await readJsonBody(req);
        const { pin, reply, pins } = this.store.addReply(
          pinId,
          {
            authorName: 'AI Coding Agent',
            role: 'agent',
            text: body.question
          },
          'mcp'
        );
        this.broadcastJson({
          type: 'pins_updated',
          action: 'reply',
          pinId: pin.id,
          reply,
          actorRole: 'mcp',
          pins
        });
        sendJson(res, 200, { ok: true, pin, reply });
        return;
      }

      const pinMatch = pathname.match(/^\/__collab\/mcp\/pins\/([^/]+)$/);
      if (method === 'GET' && pinMatch) {
        const pinId = decodeURIComponent(pinMatch[1]);
        const pin = this.store.getPin(pinId);
        if (!pin) {
          sendJson(res, 404, { ok: false, error: `Pin not found: ${pinId}` });
          return;
        }
        sendJson(res, 200, { ok: true, pin });
        return;
      }

      sendJson(res, 404, { ok: false, error: `Unknown MCP endpoint: ${pathname}` });
    } catch (err) {
      sendJson(res, err.statusCode || 400, {
        ok: false,
        error: err.message || 'MCP request failed'
      });
    }
  }

  close() {
    this.store.ydoc.off('update', this._onYDocUpdate);
    this.awareness.off('update', this._onAwarenessUpdate);
    for (const [ws] of this.clients.entries()) {
      try {
        ws.terminate();
      } catch {
        // Ignore termination failure
      }
    }
    this.clients.clear();
    try {
      this.awareness.destroy();
    } catch {
      // Ignore
    }
    try {
      this.wss.close();
    } catch {
      // Ignore
    }
  }
}

function createCollabServer(options = {}) {
  return new CollabServer(options);
}

module.exports = {
  CollabServer,
  createCollabServer,
  isStrictLoopback,
  isAllowedLocalOrigin,
  generateHostToken,
  generateSessionPassphrase,
  DEFAULT_RUNTIME_FILE
};
