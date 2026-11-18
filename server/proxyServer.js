const crypto = require('node:crypto');
const http = require('node:http');
const zlib = require('node:zlib');
const httpProxy = require('http-proxy');
const { DEFAULT_COLLAB_PORT, DEFAULT_TARGET_PORT } = require('../shared/schema');
const { createPinStore } = require('./store');
const { createCollabServer } = require('./collabServer');

const INJECT_SNIPPET = '<script src="/__collab/overlay.js" defer></script>';

function safeEqual(a, b) {
  const bufA = Buffer.from(String(a), 'utf8');
  const bufB = Buffer.from(String(b), 'utf8');
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

function maybeDecompressHtml(buf, contentEncoding) {
  const enc = String(contentEncoding || '').toLowerCase().trim();
  if (!enc || enc === 'identity') {
    return buf;
  }
  try {
    if (enc === 'gzip' || enc === 'x-gzip') {
      return zlib.gunzipSync(buf);
    }
    if (enc === 'deflate') {
      return zlib.inflateSync(buf);
    }
    if (enc === 'br') {
      return zlib.brotliDecompressSync(buf);
    }
  } catch {
    return buf;
  }
  return buf;
}

function injectOverlayScript(html) {
  if (html.includes('/__collab/overlay.js')) {
    return html;
  }
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${INJECT_SNIPPET}\n</body>`);
  }
  return `${html}\n${INJECT_SNIPPET}`;
}

function createProxyServer(options = {}) {
  const targetUrl = (options.targetUrl || `http://127.0.0.1:${DEFAULT_TARGET_PORT}`).replace(/\/$/, '');
  const requestedPort = options.collabPort !== undefined ? Number(options.collabPort) : DEFAULT_COLLAB_PORT;

  const store = createPinStore({ dbPath: options.dbPath });
  const collabServer = createCollabServer({
    store,
    hostToken: options.hostToken,
    sessionPassphrase: options.sessionPassphrase,
    targetUrl,
    collabPort: requestedPort,
    runtimeFile: options.runtimeFile
  });

  const proxy = httpProxy.createProxyServer({
    target: targetUrl,
    ws: true,
    changeOrigin: true
  });

  function isAuthorizedRequest(req) {
    if (collabServer.isStrictLoopback(req) && req.headers['x-aifl-guest-auth'] !== '1') {
      return true;
    }
    const authHeader = req.headers.authorization;
    if (typeof authHeader !== 'string') {
      return false;
    }
    const match = authHeader.match(/^Basic\s+(.+)$/i);
    if (!match) {
      return false;
    }
    let decoded;
    try {
      decoded = Buffer.from(match[1].trim(), 'base64').toString('utf8');
    } catch {
      return false;
    }
    const colonIdx = decoded.indexOf(':');
    if (colonIdx === -1) {
      return false;
    }
    const password = decoded.slice(colonIdx + 1);
    return safeEqual(password, collabServer.sessionPassphrase);
  }

  function checkGuestBasicAuth(req, res) {
    if (isAuthorizedRequest(req)) {
      return true;
    }
    res.writeHead(401, {
      'WWW-Authenticate': 'Basic realm="AI Feedback Loop Live Review"',
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store'
    });
    res.end('Authentication required');
    return false;
  }

  proxy.on('proxyReq', (proxyReq, req) => {
    const method = (req.method || 'GET').toUpperCase();
    if (method === 'GET' || method === 'HEAD') {
      proxyReq.setHeader('accept-encoding', 'identity');
    }
  });

  proxy.on('proxyRes', (proxyRes, req, res) => {
    const method = (req.method || 'GET').toUpperCase();
    const contentType = String(proxyRes.headers['content-type'] || '').toLowerCase();
    const isHtml = contentType.includes('text/html');

    if (!isHtml || method === 'HEAD') {
      res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
      if (method === 'HEAD') {
        proxyRes.resume();
        res.end();
      } else {
        proxyRes.pipe(res);
      }
      return;
    }

    const chunks = [];
    proxyRes.on('data', (chunk) => chunks.push(chunk));
    proxyRes.on('error', (err) => {
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: `Upstream response error: ${err.message}` }));
      } else {
        res.end();
      }
    });
    proxyRes.on('end', () => {
      if (res.writableEnded || res.destroyed) return;
      const rawBuf = maybeDecompressHtml(
        Buffer.concat(chunks),
        proxyRes.headers['content-encoding']
      );
      const modifiedHtml = injectOverlayScript(rawBuf.toString('utf8'));
      const outBuf = Buffer.from(modifiedHtml, 'utf8');

      const headers = { ...proxyRes.headers };
      delete headers['content-length'];
      delete headers['content-encoding'];
      delete headers['transfer-encoding'];
      headers['content-length'] = String(outBuf.length);

      if (!res.headersSent) {
        res.writeHead(proxyRes.statusCode || 200, headers);
      }
      res.end(outBuf);
    });
  });

  proxy.on('error', (err, _req, resOrSocket) => {
    if (!resOrSocket) return;
    if (typeof resOrSocket.writeHead === 'function') {
      if (!resOrSocket.headersSent) {
        resOrSocket.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
        resOrSocket.end(JSON.stringify({ ok: false, error: `Upstream target unreachable: ${err.message}` }));
      } else {
        resOrSocket.end();
      }
      return;
    }
    if (typeof resOrSocket.write === 'function') {
      try {
        resOrSocket.write('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n');
        resOrSocket.destroy();
      } catch {
        // Ignore socket teardown error
      }
    }
  });

  const server = http.createServer((req, res) => {
    const reqUrl = new URL(req.url || '/', 'http://127.0.0.1');
    const pathname = reqUrl.pathname;
    const method = (req.method || 'GET').toUpperCase();

    // Loopback-only endpoints and CORS preflights handle their own strict 403/CORS checks
    if (
      (method === 'OPTIONS' && pathname.startsWith('/__collab/')) ||
      pathname === '/__collab/host-session' ||
      pathname === '/__collab/mcp' ||
      pathname.startsWith('/__collab/mcp/')
    ) {
      collabServer.handleHttp(req, res).catch((err) => {
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false, error: err.message }));
        }
      });
      return;
    }

    if (!checkGuestBasicAuth(req, res)) {
      return;
    }

    if (pathname.startsWith('/__collab/')) {
      collabServer.handleHttp(req, res).catch((err) => {
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false, error: err.message }));
        }
      });
      return;
    }

    proxy.web(req, res, { selfHandleResponse: true });
  });

  server.on('upgrade', (req, socket, head) => {
    if (!isAuthorizedRequest(req)) {
      try {
        socket.write(
          'HTTP/1.1 401 Unauthorized\r\n' +
          'WWW-Authenticate: Basic realm="AI Feedback Loop Live Review"\r\n' +
          'Connection: close\r\n\r\n'
        );
        socket.destroy();
      } catch {
        // Ignore socket write error
      }
      return;
    }

    const reqUrl = new URL(req.url || '/', 'http://127.0.0.1');
    if (reqUrl.pathname === '/ws') {
      collabServer.handleUpgrade(req, socket, head);
    } else {
      proxy.ws(req, socket, head);
    }
  });

  let startResult = null;
  let stopped = false;

  async function start() {
    if (startResult) return startResult;

    await new Promise((resolve, reject) => {
      const onError = (err) => {
        server.off('listening', onListening);
        reject(err);
      };
      const onListening = () => {
        server.off('error', onError);
        resolve();
      };
      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(requestedPort, '127.0.0.1');
    });

    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : requestedPort;
    collabServer.setRuntimeInfo({ collabPort: port, targetUrl });

    startResult = {
      port,
      url: `http://127.0.0.1:${port}`,
      targetUrl,
      hostToken: collabServer.hostToken,
      sessionPassphrase: collabServer.sessionPassphrase,
      runtimeFile: collabServer.runtimeFile,
      dbPath: store.dbPath,
      collabServer,
      store,
      server
    };
    return startResult;
  }

  async function stop() {
    if (stopped) return;
    stopped = true;
    collabServer.close();
    try {
      proxy.close();
    } catch {
      // Ignore proxy close error
    }
    if (server.listening) {
      await new Promise((resolve) => {
        server.close(() => resolve());
        if (typeof server.closeAllConnections === 'function') {
          server.closeAllConnections();
        }
      });
    }
    store.close();
  }

  return {
    start,
    stop,
    checkGuestBasicAuth,
    isAuthorizedRequest,
    collabServer,
    store,
    server,
    proxy
  };
}

module.exports = {
  createProxyServer,
  injectOverlayScript
};
