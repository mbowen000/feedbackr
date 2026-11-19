const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const { Tunnel, bin: cloudflaredBin } = require('cloudflared');
const { DEFAULT_COLLAB_PORT, DEFAULT_TARGET_PORT } = require('../shared/schema');
const { createProxyServer } = require('./proxyServer');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.cjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8'
};

const LIVE_RELOAD_SCRIPT = `<script>
(() => {
  try {
    const es = new EventSource('/__aifl_livereload');
    es.onmessage = (ev) => {
      if (ev.data === 'reload') window.location.reload();
    };
  } catch {}
})();
</script>`;

function parseArgs(argv = process.argv.slice(2)) {
  const opts = {
    port: DEFAULT_COLLAB_PORT,
    target: `http://127.0.0.1:${DEFAULT_TARGET_PORT}`,
    passphrase: undefined,
    workspace: process.cwd(),
    agent: 'agy',
    noTunnel: false,
    help: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--no-tunnel') {
      opts.noTunnel = true;
    } else if (arg === '-h' || arg === '--help') {
      opts.help = true;
    } else if (arg === '--port' && argv[i + 1]) {
      opts.port = Number(argv[++i]);
    } else if (arg.startsWith('--port=')) {
      opts.port = Number(arg.slice('--port='.length));
    } else if (arg === '--target' && argv[i + 1]) {
      opts.target = argv[++i];
    } else if (arg.startsWith('--target=')) {
      opts.target = arg.slice('--target='.length);
    } else if (arg === '--passphrase' && argv[i + 1]) {
      opts.passphrase = argv[++i];
    } else if (arg.startsWith('--passphrase=')) {
      opts.passphrase = arg.slice('--passphrase='.length);
    } else if ((arg === '--workspace' || arg === '--project' || arg === '--dir' || arg === '--cwd') && argv[i + 1]) {
      opts.workspace = path.resolve(argv[++i]);
    } else if (arg.startsWith('--workspace=')) {
      opts.workspace = path.resolve(arg.slice('--workspace='.length));
    } else if (arg.startsWith('--project=')) {
      opts.workspace = path.resolve(arg.slice('--project='.length));
    } else if (arg.startsWith('--dir=')) {
      opts.workspace = path.resolve(arg.slice('--dir='.length));
    } else if (arg.startsWith('--cwd=')) {
      opts.workspace = path.resolve(arg.slice('--cwd='.length));
    } else if (arg === '--agent' && argv[i + 1]) {
      opts.agent = argv[++i];
    } else if (arg.startsWith('--agent=')) {
      opts.agent = arg.slice('--agent='.length);
    }
  }

  if (!Number.isFinite(opts.port) || opts.port < 0) {
    opts.port = DEFAULT_COLLAB_PORT;
  }

  return opts;
}

function isPortListening(host, port, timeoutMs = 600) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      try {
        socket.destroy();
      } catch {
        // Ignore
      }
      resolve(result);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

async function startBuiltinTargetServer({ port, host = '127.0.0.1', rootDir }) {
  const repoRoot = path.resolve(rootDir || path.join(__dirname, '..'));
  const sseClients = new Set();

  const server = http.createServer(async (req, res) => {
    const reqUrl = new URL(req.url || '/', 'http://127.0.0.1');
    const pathname = reqUrl.pathname;

    if (pathname === '/__aifl_livereload') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive'
      });
      res.write(': connected\n\n');
      sseClients.add(res);
      req.on('close', () => {
        sseClients.delete(res);
      });
      return;
    }

    let decodedPath;
    try {
      decodedPath = decodeURIComponent(pathname);
    } catch {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Bad Request');
      return;
    }

    const relPath = decodedPath === '/' ? 'demo.html' : decodedPath.replace(/^\/+/, '');
    const targetFile = path.resolve(repoRoot, relPath);
    const blockedTopDirs = ['.git', '.aifl-session', 'node_modules'];
    const firstSegment = relPath.split(/[\\/]/)[0];

    if (
      (targetFile !== repoRoot && !targetFile.startsWith(repoRoot + path.sep)) ||
      blockedTopDirs.includes(firstSegment)
    ) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }

    try {
      const stat = await fs.promises.stat(targetFile);
      const finalFile = stat.isDirectory() ? path.join(targetFile, 'index.html') : targetFile;
      const ext = path.extname(finalFile).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      if (ext === '.html' || ext === '.htm') {
        let html = await fs.promises.readFile(finalFile, 'utf8');
        if (!html.includes('/__aifl_livereload')) {
          if (/<\/body>/i.test(html)) {
            html = html.replace(/<\/body>/i, `${LIVE_RELOAD_SCRIPT}\n</body>`);
          } else {
            html = `${html}\n${LIVE_RELOAD_SCRIPT}`;
          }
        }
        const buf = Buffer.from(html, 'utf8');
        res.writeHead(200, {
          'Content-Type': contentType,
          'Content-Length': String(buf.length),
          'Cache-Control': 'no-store'
        });
        res.end(buf);
        return;
      }

      const data = await fs.promises.readFile(finalFile);
      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Length': String(data.length),
        'Cache-Control': 'no-store'
      });
      res.end(data);
    } catch (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(`Not Found: ${pathname}`);
        return;
      }
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(err.message);
    }
  });

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
    server.listen(port, host);
  });

  const demoPath = path.join(repoRoot, 'demo.html');
  let watchDebounce = null;
  let watcher = null;
  if (fs.existsSync(demoPath)) {
    try {
      watcher = fs.watch(demoPath, () => {
        clearTimeout(watchDebounce);
        watchDebounce = setTimeout(() => {
          for (const client of sseClients) {
            try {
              client.write('data: reload\n\n');
            } catch {
              sseClients.delete(client);
            }
          }
        }, 120);
      });
    } catch {
      watcher = null;
    }
  }

  const address = server.address();
  const actualPort = typeof address === 'object' && address ? address.port : port;

  async function stop() {
    clearTimeout(watchDebounce);
    if (watcher) {
      try {
        watcher.close();
      } catch {
        // Ignore
      }
    }
    for (const client of sseClients) {
      try {
        client.end();
      } catch {
        // Ignore
      }
    }
    sseClients.clear();
    if (server.listening) {
      await new Promise((resolve) => {
        server.close(() => resolve());
        if (typeof server.closeAllConnections === 'function') {
          server.closeAllConnections();
        }
      });
    }
  }

  return {
    port: actualPort,
    url: `http://${host}:${actualPort}`,
    stop
  };
}

async function startQuickTunnel(localUrl, timeoutMs = 10000) {
  if (!fs.existsSync(cloudflaredBin)) {
    return {
      tunnel: null,
      url: null,
      error: `cloudflared binary not found at ${cloudflaredBin}`
    };
  }

  return new Promise((resolve) => {
    let settled = false;
    let cfTunnel;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    try {
      cfTunnel = Tunnel.quick(localUrl);
    } catch (err) {
      finish({ tunnel: null, url: null, error: err.message });
      return;
    }

    const timer = setTimeout(() => {
      try {
        cfTunnel.stop();
      } catch {
        // Ignore
      }
      finish({
        tunnel: null,
        url: null,
        error: `Timed out after ${Math.round(timeoutMs / 1000)}s waiting for Cloudflare Quick Tunnel URL`
      });
    }, timeoutMs);

    cfTunnel.on('error', (err) => {
      try {
        cfTunnel.stop();
      } catch {
        // Ignore
      }
      finish({ tunnel: null, url: null, error: err.message });
    });

    cfTunnel.once('exit', (code) => {
      finish({
        tunnel: null,
        url: null,
        error: `cloudflared exited early with code ${code}`
      });
    });

    cfTunnel.once('url', (url) => {
      finish({ tunnel: cfTunnel, url, error: null });
    });
  });
}

function printBanner({
  hostUrl,
  loopbackUrl,
  targetUrl,
  startedBuiltinTarget,
  guestUrl,
  tunnelError,
  passphrase,
  workspaceRoot,
  defaultAgent,
  runtimeFile,
  dbPath
}) {
  const lines = [
    '',
    '====================================================================',
    '  AI Feedback Loop v2.0.0 — Live Collaborative Canvas Ready',
    '====================================================================',
    `  Host URL       : ${hostUrl}  (or ${loopbackUrl})`,
    `  Target App     : ${targetUrl} ${startedBuiltinTarget ? '(built-in demo.html + live reload)' : '(external dev server)'}`,
    `  Workspace      : ${workspaceRoot}`,
    `  CLI Agent      : ${defaultAgent} (headless: agy | gemini | codex | claude)`,
    `  Guest URL      : ${guestUrl || 'Local-only (no public tunnel)'}`,
    `  Passphrase     : ${passphrase}  (Basic Auth password; any username)`,
    `  MCP Command    : npm run mcp`,
    `  Runtime File   : ${runtimeFile}`,
    `  SQLite DB      : ${dbPath}`
  ];
  if (tunnelError) {
    lines.push(`  Tunnel Notice  : ${tunnelError}`);
  }
  lines.push('====================================================================');
  lines.push('  Press Ctrl+C to stop.');
  lines.push('');
  console.log(lines.join('\n'));
}

async function startLauncher(cliOptions = {}) {
  const opts = { ...parseArgs([]), ...cliOptions };
  const targetParsed = new URL(opts.target);
  const targetHost = targetParsed.hostname || '127.0.0.1';
  const targetPort = Number(targetParsed.port) || (targetParsed.protocol === 'https:' ? 443 : 80);

  let builtinTarget = null;
  const alreadyListening = await isPortListening(
    targetHost === 'localhost' ? '127.0.0.1' : targetHost,
    targetPort
  );

  if (!alreadyListening) {
    const isLocalHost = ['127.0.0.1', 'localhost', '::1'].includes(targetHost);
    if (!isLocalHost) {
      throw new Error(`Target server ${opts.target} is not reachable`);
    }
    builtinTarget = await startBuiltinTargetServer({
      port: targetPort,
      host: '127.0.0.1'
    });
  }

  const effectiveTargetUrl = builtinTarget ? builtinTarget.url : opts.target;

  const proxyServer = createProxyServer({
    targetUrl: effectiveTargetUrl,
    collabPort: opts.port,
    sessionPassphrase: opts.passphrase,
    workspaceRoot: opts.workspace,
    defaultAgent: opts.agent
  });

  const info = await proxyServer.start();

  let tunnelUrl = null;
  let tunnelError = null;
  let cfTunnel = null;

  if (!opts.noTunnel) {
    console.log('Opening Cloudflare Quick Tunnel...');
    const tunnelResult = await startQuickTunnel(info.url, 10000);
    tunnelUrl = tunnelResult.url;
    tunnelError = tunnelResult.error;
    cfTunnel = tunnelResult.tunnel;
    if (cfTunnel) {
      cfTunnel.on('error', (err) => {
        console.error('[cloudflared]', err.message);
      });
    }
  }

  printBanner({
    hostUrl: `http://localhost:${info.port}`,
    loopbackUrl: info.url,
    targetUrl: info.targetUrl,
    startedBuiltinTarget: Boolean(builtinTarget),
    guestUrl: tunnelUrl,
    tunnelError,
    passphrase: info.sessionPassphrase,
    workspaceRoot: info.collabServer.workspaceRoot,
    defaultAgent: info.collabServer.defaultAgent,
    runtimeFile: info.runtimeFile,
    dbPath: info.dbPath
  });

  async function shutdown() {
    if (cfTunnel) {
      try {
        cfTunnel.stop();
      } catch {
        // Ignore
      }
    }
    await proxyServer.stop();
    if (builtinTarget) {
      await builtinTarget.stop();
    }
  }

  return {
    ...info,
    tunnelUrl,
    shutdown
  };
}

async function main() {
  const opts = parseArgs();
  if (opts.help) {
    console.log([
      'Usage: node server/launcher.js [options]',
      '',
      'Options:',
      `  --port <port>          Collab proxy port (default: ${DEFAULT_COLLAB_PORT})`,
      `  --target <url>         Target dev server URL (default: http://127.0.0.1:${DEFAULT_TARGET_PORT})`,
      '  --project <path>       Target project workspace root (default: current directory)',
      '  --agent <provider>     Default headless CLI: agy | gemini | codex | claude (default: agy)',
      '  --passphrase <secret>  Custom guest Basic Auth passphrase',
      '  --no-tunnel            Skip Cloudflare Quick Tunnel (local-only mode)',
      '  -h, --help             Show this help message'
    ].join('\n'));
    return;
  }

  const session = await startLauncher(opts);

  let stopping = false;
  const handleSignal = async (signal) => {
    if (stopping) return;
    stopping = true;
    console.log(`\nShutting down (${signal})...`);
    try {
      await session.shutdown();
    } finally {
      process.exit(0);
    }
  };

  process.on('SIGINT', () => handleSignal('SIGINT'));
  process.on('SIGTERM', () => handleSignal('SIGTERM'));
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[launcher] Fatal error:', err);
    process.exit(1);
  });
}

module.exports = {
  parseArgs,
  isPortListening,
  startBuiltinTargetServer,
  startQuickTunnel,
  startLauncher
};
