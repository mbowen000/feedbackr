/**
 * Storage & Live Collaboration Adapter for AI Feedback Loop v2.0.0.
 * Seamlessly supports standalone `chrome.storage.local` persistence AND
 * real-time WebSocket (+ optional Yjs CRDT mirror) collaboration sessions.
 */
(() => {
  if (window.AIFLStorage) return;

  const VALID_STATUSES = ['pending', 'approved', 'in_progress', 'resolved'];
  const VALID_ROLES = ['host', 'guest', 'agent'];
  const PEER_COLORS = ['#10b981', '#f59e0b', '#ec4899', '#06b6d4', '#8b5cf6', '#f97316'];

  const GUEST_IDENTITY_KEY = 'aifl_guest_identity';
  const HOST_NAME_KEY = 'aifl_host_name';
  const DEFAULT_LOCAL_COLLAB_URL = 'http://127.0.0.1:4173';

  function isValidStatus(status) {
    return VALID_STATUSES.includes(status);
  }

  function pickRandomPeerColor() {
    return PEER_COLORS[Math.floor(Math.random() * PEER_COLORS.length)];
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
    const number =
      Number.isFinite(Number(raw?.number)) && Number(raw.number) > 0 ? Number(raw.number) : index + 1;

    const replies = Array.isArray(raw?.replies)
      ? raw.replies.map((r, i) => normalizeReply(r, i)).filter((r) => r.text.length > 0)
      : [];

    const screen =
      raw?.screen && typeof raw.screen === 'object'
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

  function normalizePins(list) {
    if (!Array.isArray(list)) return [];
    return list
      .map((p, i) => normalizePin(p, i))
      .sort((a, b) => a.number - b.number || a.createdAt - b.createdAt);
  }

  function hasChromeStorage() {
    return typeof chrome !== 'undefined' && Boolean(chrome.storage?.local);
  }

  function readSessionStorage(key) {
    try {
      return window.sessionStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function writeSessionStorage(key, value) {
    try {
      window.sessionStorage.setItem(key, value);
    } catch {
      // Ignore restricted sessionStorage
    }
  }

  function getOrCreateGuestIdentity(overrideName = null) {
    let stored = null;
    const raw = readSessionStorage(GUEST_IDENTITY_KEY);
    if (raw) {
      try {
        stored = JSON.parse(raw);
      } catch {
        stored = null;
      }
    }

    const identity = {
      id:
        typeof stored?.id === 'string' && stored.id.trim()
          ? stored.id.trim()
          : `guest_${Math.random().toString(36).slice(2, 8)}`,
      name:
        typeof overrideName === 'string' && overrideName.trim()
          ? overrideName.trim()
          : typeof stored?.name === 'string' && stored.name.trim()
          ? stored.name.trim()
          : 'Guest Reviewer',
      role: 'guest',
      color:
        typeof stored?.color === 'string' && stored.color.trim()
          ? stored.color.trim()
          : pickRandomPeerColor()
    };

    writeSessionStorage(GUEST_IDENTITY_KEY, JSON.stringify(identity));
    return identity;
  }

  function getHostIdentity(overrideName = null) {
    const saved = readSessionStorage(HOST_NAME_KEY);
    const name =
      typeof overrideName === 'string' && overrideName.trim()
        ? overrideName.trim()
        : saved && saved.trim()
        ? saved.trim()
        : 'Host';
    if (overrideName && overrideName.trim()) {
      writeSessionStorage(HOST_NAME_KEY, name);
    }
    return {
      id: 'host_local',
      name,
      role: 'host',
      color: '#6366f1'
    };
  }

  // Optional local Y.Doc mirror when Yjs is provided by guestEntry or extension bundle
  let localYDoc = null;
  let localYPins = null;

  function ensureYDoc() {
    if (localYDoc) return localYDoc;
    const Y = window.__AIFL_YJS__;
    if (Y && typeof Y.Doc === 'function') {
      localYDoc = new Y.Doc();
      localYPins = localYDoc.getMap('pins');
    }
    return localYDoc;
  }

  function syncPinsToYDoc(pins) {
    const ydoc = ensureYDoc();
    if (!ydoc || !localYPins) return;
    ydoc.transact(() => {
      const nextIds = new Set(pins.map((p) => p.id));
      for (const existingKey of Array.from(localYPins.keys())) {
        if (!nextIds.has(existingKey)) {
          localYPins.delete(existingKey);
        }
      }
      for (const pin of pins) {
        localYPins.set(pin.id, pin);
      }
    });
  }

  const isGuestMode = Boolean(window.__AIFL_GUEST_MODE__);
  const initialAuthor = isGuestMode ? getOrCreateGuestIdentity() : getHostIdentity();

  const session = {
    connected: false,
    connecting: false,
    mode: isGuestMode ? 'live' : 'standalone',
    role: isGuestMode ? 'guest' : 'standalone',
    author: initialAuthor,
    peers: [],
    serverUrl: '',
    hostToken: '',
    lastError: null,
    manualDisconnect: false
  };

  let livePins = [];
  let memoryPins = [];
  let activeWs = null;
  let reconnectTimer = null;
  let reconnectDelayMs = 1000;
  let initPromise = null;
  let lastConnectArgs = null;

  // Cursor throttling state (~40ms)
  let lastCursorSentAt = 0;
  let cursorThrottleTimer = null;
  let queuedCursor = null;

  const syncListeners = new Set();
  const peersListeners = new Set();
  const errorListeners = new Set();
  const stateListeners = new Set();

  function emitSync(pins, event = null) {
    const snapshot = [...pins];
    syncListeners.forEach((fn) => {
      try {
        fn(snapshot, event);
      } catch (err) {
        console.warn('AI Feedback Loop: sync listener error', err);
      }
    });
  }

  function emitPeers(peers, event = null) {
    const snapshot = [...peers];
    peersListeners.forEach((fn) => {
      try {
        fn(snapshot, event);
      } catch (err) {
        console.warn('AI Feedback Loop: peer listener error', err);
      }
    });
  }

  function emitError(errPayload) {
    session.lastError = errPayload?.message || 'Session error';
    errorListeners.forEach((fn) => {
      try {
        fn(errPayload);
      } catch (err) {
        console.warn('AI Feedback Loop: error listener failure', err);
      }
    });
    emitStateChange();
  }

  function emitStateChange() {
    const state = getSessionState();
    stateListeners.forEach((fn) => {
      try {
        fn(state);
      } catch (err) {
        console.warn('AI Feedback Loop: state listener failure', err);
      }
    });
  }

  function normalizePeersList(rawPeers) {
    if (Array.isArray(rawPeers)) {
      return rawPeers.map((p) => ({
        clientId: p.clientId || p.id || '',
        name: p.name || p.author?.name || 'Peer',
        role: p.role || p.author?.role || 'guest',
        color: p.color || p.author?.color || '#10b981'
      }));
    }
    if (rawPeers && typeof rawPeers === 'object') {
      return Object.values(rawPeers).map((p) => ({
        clientId: p.clientId || p.id || '',
        name: p.name || p.author?.name || 'Peer',
        role: p.role || p.author?.role || 'guest',
        color: p.color || p.author?.color || '#10b981'
      }));
    }
    return [];
  }

  function getSessionState() {
    return {
      connected: session.connected,
      connecting: session.connecting,
      mode: session.mode,
      role: session.role,
      author: { ...session.author },
      peers: [...session.peers],
      serverUrl: session.serverUrl,
      guestName: session.author.role === 'guest' ? session.author.name : '',
      hasHostToken: Boolean(session.hostToken),
      lastError: session.lastError
    };
  }

  function getSiteKey() {
    const origin = window.location.origin;
    if (!origin || origin === 'null' || window.location.protocol === 'file:') {
      return `aifl_site_file_${window.location.pathname}`;
    }
    return `aifl_site_${origin}`;
  }

  function getRouteKey(href = window.location.href) {
    try {
      const u = new URL(href);
      if (u.protocol === 'file:') {
        return `${u.pathname.split('/').pop() || 'index.html'}${u.search}${u.hash}`;
      }
      return `${u.pathname}${u.search}${u.hash}` || '/';
    } catch {
      return window.location.pathname || '/';
    }
  }

  function normalizeServerUrls(rawServerUrl) {
    const input = String(rawServerUrl || window.location.origin || DEFAULT_LOCAL_COLLAB_URL).trim();
    const cleaned = input.replace(/\/+$/, '');
    let httpBase = cleaned;
    if (/^wss?:\/\//i.test(cleaned)) {
      httpBase = cleaned.replace(/^ws:/i, 'http:').replace(/^wss:/i, 'https:');
    } else if (!/^https?:\/\//i.test(cleaned)) {
      httpBase = `http://${cleaned}`;
    }
    const wsBase = httpBase.replace(/^http:/i, 'ws:').replace(/^https:/i, 'wss:');
    return { httpBase, wsBase };
  }

  async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 900) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        cache: 'no-store',
        ...options,
        signal: controller.signal
      });
      const contentType = res.headers.get('content-type') || '';
      if (!res.ok || !contentType.includes('application/json')) {
        return { ok: false, status: res.status, data: null };
      }
      const data = await res.json();
      return { ok: true, status: res.status, data };
    } catch {
      return { ok: false, status: 0, data: null };
    } finally {
      clearTimeout(timer);
    }
  }

  function clearReconnectTimer() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }

  function closeActiveSocket() {
    clearReconnectTimer();
    if (activeWs) {
      const ws = activeWs;
      activeWs = null;
      ws.onopen = null;
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;
      try {
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close(1000, 'Switching or closing session');
        }
      } catch {
        // Ignore close error
      }
    }
  }

  function scheduleReconnect() {
    if (session.manualDisconnect || !lastConnectArgs) return;
    clearReconnectTimer();
    const delay = reconnectDelayMs;
    reconnectDelayMs = Math.min(8000, reconnectDelayMs * 2);
    reconnectTimer = setTimeout(() => {
      if (!session.manualDisconnect && lastConnectArgs) {
        connectLiveSession(lastConnectArgs).catch(() => {});
      }
    }, delay);
  }

  function sendWs(payload) {
    if (!activeWs || activeWs.readyState !== WebSocket.OPEN) {
      return false;
    }
    try {
      activeWs.send(JSON.stringify(payload));
      return true;
    } catch (err) {
      console.warn('AI Feedback Loop: WebSocket send failed', err);
      return false;
    }
  }

  function connectLiveSession(options = {}) {
    const {
      serverUrl = window.location.origin,
      hostToken = '',
      authorName = null
    } = options;

    closeActiveSocket();
    session.manualDisconnect = false;
    session.lastError = null;

    const { httpBase, wsBase } = normalizeServerUrls(serverUrl);
    const trimmedToken = typeof hostToken === 'string' ? hostToken.trim() : '';

    if (trimmedToken) {
      session.hostToken = trimmedToken;
      session.author = getHostIdentity(authorName);
      session.role = 'host';
    } else {
      session.hostToken = '';
      session.author = getOrCreateGuestIdentity(authorName);
      session.role = 'guest';
    }

    session.serverUrl = httpBase;
    session.mode = 'live';
    session.connecting = true;
    session.connected = false;
    lastConnectArgs = {
      serverUrl: httpBase,
      hostToken: session.hostToken,
      authorName: session.author.name
    };
    emitStateChange();

    const params = new URLSearchParams({
      clientId: session.author.id,
      name: session.author.name,
      color: session.author.color
    });
    if (session.hostToken) {
      params.set('hostToken', session.hostToken);
    }

    const wsUrl = `${wsBase}/ws?${params.toString()}`;

    return new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (!settled) {
          settled = true;
          clearTimeout(connectTimeout);
          resolve(getSessionState());
        }
      };

      const connectTimeout = setTimeout(() => {
        finish();
      }, 2500);

      let ws;
      try {
        ws = new WebSocket(wsUrl);
      } catch (err) {
        session.connecting = false;
        session.connected = false;
        emitError({ code: 0, message: err?.message || 'Failed to open WebSocket' });
        finish();
        return;
      }

      activeWs = ws;

      ws.onopen = () => {
        if (activeWs !== ws) return;
        session.lastError = null;
      };

      ws.onmessage = (event) => {
        if (activeWs !== ws) return;
        if (typeof event.data !== 'string') {
          return;
        }
        let msg;
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }
        if (!msg || typeof msg.type !== 'string') return;

        switch (msg.type) {
          case 'init': {
            reconnectDelayMs = 1000;
            session.connected = true;
            session.connecting = false;
            session.mode = 'live';
            session.role = msg.role || (session.hostToken ? 'host' : 'guest');
            if (msg.author) {
              session.author = normalizeAuthor(msg.author, session.role);
            }
            livePins = normalizePins(msg.pins);
            syncPinsToYDoc(livePins);
            session.peers = normalizePeersList(msg.peers);
            emitStateChange();
            emitSync(livePins, msg);
            emitPeers(session.peers, msg);
            finish();
            break;
          }
          case 'pins_updated':
          case 'agent_dispatch_requested': {
            if (Array.isArray(msg.pins)) {
              livePins = normalizePins(msg.pins);
              syncPinsToYDoc(livePins);
              emitSync(livePins, msg);
            }
            break;
          }
          case 'peers_updated': {
            session.peers = normalizePeersList(msg.peers);
            emitStateChange();
            emitPeers(session.peers, msg);
            break;
          }
          case 'cursor_move': {
            emitPeers(session.peers, msg);
            break;
          }
          case 'error': {
            emitError(msg);
            break;
          }
          default:
            break;
        }
      };

      ws.onerror = () => {
        if (activeWs !== ws) return;
        session.lastError = 'WebSocket connection failed';
      };

      ws.onclose = () => {
        if (activeWs !== ws) return;
        activeWs = null;
        session.connected = false;
        session.connecting = false;
        emitStateChange();
        finish();
        if (!session.manualDisconnect) {
          scheduleReconnect();
        }
      };
    });
  }

  function disconnectLiveSession() {
    session.manualDisconnect = true;
    lastConnectArgs = null;
    closeActiveSocket();
    session.connected = false;
    session.connecting = false;
    session.peers = [];
    session.hostToken = '';
    session.serverUrl = '';
    if (window.__AIFL_GUEST_MODE__) {
      session.mode = 'live';
      session.role = 'guest';
    } else {
      session.mode = 'standalone';
      session.role = 'standalone';
      session.author = getHostIdentity();
    }
    emitStateChange();
    emitPeers([], { type: 'peers_updated', peers: [] });
  }

  async function initLiveSession() {
    if (initPromise) return initPromise;

    initPromise = (async () => {
      if (window.__AIFL_GUEST_MODE__) {
        const identity = getOrCreateGuestIdentity();
        return connectLiveSession({
          serverUrl: window.location.origin,
          authorName: identity.name
        });
      }

      if (!window.location.protocol.startsWith('http')) {
        return getSessionState();
      }

      const candidates = [window.location.origin];
      const host = window.location.hostname;
      if (
        (host === 'localhost' || host === '127.0.0.1' || host === '[::1]') &&
        window.location.origin !== DEFAULT_LOCAL_COLLAB_URL
      ) {
        candidates.push(DEFAULT_LOCAL_COLLAB_URL);
      }

      let foundServerBase = null;
      for (const base of candidates) {
        const statusRes = await fetchJsonWithTimeout(`${base}/__collab/status`, {}, 800);
        if (statusRes.ok && statusRes.data?.ok === true && typeof statusRes.data?.wsPath === 'string') {
          foundServerBase = base;
          break;
        }
      }

      if (!foundServerBase) {
        return getSessionState();
      }

      const hostRes = await fetchJsonWithTimeout(`${foundServerBase}/__collab/host-session`, {}, 1000);
      if (hostRes.ok && hostRes.data?.ok === true && hostRes.data?.hostToken) {
        const hostIdentity = getHostIdentity();
        return connectLiveSession({
          serverUrl: foundServerBase,
          hostToken: hostRes.data.hostToken,
          authorName: hostIdentity.name
        });
      }

      return getSessionState();
    })();

    return initPromise;
  }

  function setAuthorName(name) {
    const trimmed = typeof name === 'string' ? name.trim() : '';
    if (!trimmed) return getSessionState();

    if (session.role === 'host' || (!window.__AIFL_GUEST_MODE__ && session.hostToken)) {
      session.author = getHostIdentity(trimmed);
    } else {
      session.author = getOrCreateGuestIdentity(trimmed);
    }

    if (lastConnectArgs) {
      lastConnectArgs.authorName = session.author.name;
    }
    emitStateChange();
    if (session.connected && activeWs && activeWs.readyState === WebSocket.OPEN) {
      sendWs({ type: 'author_update', name: session.author.name });
    } else if (session.mode === 'live' && session.serverUrl) {
      connectLiveSession({
        serverUrl: session.serverUrl,
        hostToken: session.hostToken,
        authorName: session.author.name
      }).catch(() => {});
    }
    return getSessionState();
  }

  function sendCursor(cursor) {
    if (!session.connected || !activeWs || activeWs.readyState !== WebSocket.OPEN) return;
    const now = Date.now();
    const elapsed = now - lastCursorSentAt;

    if (elapsed >= 40) {
      lastCursorSentAt = now;
      queuedCursor = null;
      if (cursorThrottleTimer) {
        clearTimeout(cursorThrottleTimer);
        cursorThrottleTimer = null;
      }
      sendWs({ type: 'cursor_move', cursor });
      return;
    }

    queuedCursor = cursor;
    if (!cursorThrottleTimer) {
      cursorThrottleTimer = setTimeout(() => {
        cursorThrottleTimer = null;
        if (queuedCursor && session.connected) {
          lastCursorSentAt = Date.now();
          const toSend = queuedCursor;
          queuedCursor = null;
          sendWs({ type: 'cursor_move', cursor: toSend });
        }
      }, Math.max(8, 40 - elapsed));
    }
  }

  async function loadComments() {
    if (session.mode === 'live') {
      return [...livePins];
    }
    if (hasChromeStorage()) {
      try {
        const key = getSiteKey();
        const result = await chrome.storage.local.get(key);
        const list = Array.isArray(result[key]) ? result[key] : [];
        return normalizePins(list);
      } catch (err) {
        console.warn('AI Feedback Loop: Failed to load comments from storage.', err);
        return [];
      }
    }
    return [...memoryPins];
  }

  async function saveComments(comments) {
    const normalized = normalizePins(comments);
    if (session.mode === 'live') {
      livePins = normalized;
      syncPinsToYDoc(livePins);
      return [...livePins];
    }
    if (hasChromeStorage()) {
      try {
        const key = getSiteKey();
        await chrome.storage.local.set({ [key]: normalized });
        return normalized;
      } catch (err) {
        console.warn('AI Feedback Loop: Failed to save comments.', err);
        return normalized;
      }
    }
    memoryPins = normalized;
    return [...memoryPins];
  }

  async function addComment(payload) {
    const comments = await loadComments();
    const maxNum = comments.reduce((max, c) => Math.max(max, Number(c.number) || 0), 0);
    const now = Date.now();

    const author =
      session.mode === 'live'
        ? { ...session.author }
        : normalizeAuthor(payload.author, 'host');

    const newComment = normalizePin(
      {
        id: `aifl_${now}_${Math.random().toString(36).slice(2, 8)}`,
        number: maxNum + 1,
        status: session.role === 'guest' ? 'pending' : payload.status || 'pending',
        author,
        text: (payload.text || '').trim(),
        category: payload.category || 'general',
        replies: [],
        createdAt: now,
        updatedAt: now,
        screen: payload.screen,
        target: payload.target
      },
      comments.length
    );

    if (session.mode === 'live') {
      sendWs({ type: 'pin_create', pin: newComment });
      livePins = normalizePins([...livePins, newComment]);
      syncPinsToYDoc(livePins);
      return { comment: newComment, comments: [...livePins] };
    }

    comments.push(newComment);
    await saveComments(comments);
    return { comment: newComment, comments };
  }

  async function updateComment(id, patch) {
    const comments = await loadComments();
    const idx = comments.findIndex((c) => c.id === id);
    if (idx === -1) return { comment: null, comments };

    if (session.mode === 'live') {
      const existing = comments[idx];
      sendWs({ type: 'pin_update', pinId: id, patch });

      const canMutateOptimistically =
        session.role === 'host' ||
        (session.role === 'guest' &&
          existing.author?.id === session.author.id &&
          existing.status === 'pending' &&
          patch.status === undefined);

      if (!canMutateOptimistically) {
        return { comment: existing, comments: [...livePins] };
      }

      const nextPin = normalizePin(
        {
          ...existing,
          ...patch,
          status: session.role === 'guest' ? existing.status : patch.status || existing.status,
          updatedAt: Date.now()
        },
        idx
      );
      livePins = livePins.map((p) => (p.id === id ? nextPin : p));
      syncPinsToYDoc(livePins);
      return { comment: nextPin, comments: [...livePins] };
    }

    comments[idx] = normalizePin(
      {
        ...comments[idx],
        ...patch,
        updatedAt: Date.now()
      },
      idx
    );
    await saveComments(comments);
    return { comment: comments[idx], comments };
  }

  async function deleteComment(id) {
    const comments = await loadComments();
    const existing = comments.find((c) => c.id === id);

    if (session.mode === 'live') {
      sendWs({ type: 'pin_delete', pinId: id });
      const canDeleteOptimistically =
        session.role === 'host' ||
        (session.role === 'guest' &&
          existing &&
          existing.author?.id === session.author.id &&
          existing.status === 'pending');
      if (canDeleteOptimistically) {
        livePins = livePins
          .filter((c) => c.id !== id)
          .map((c, index) => ({ ...c, number: index + 1 }));
        syncPinsToYDoc(livePins);
      }
      return [...livePins];
    }

    const filtered = comments
      .filter((c) => c.id !== id)
      .map((c, index) => ({ ...c, number: index + 1 }));
    await saveComments(filtered);
    return filtered;
  }

  async function clearComments(scope = 'all', currentRouteKey = null) {
    if (session.mode === 'live') {
      sendWs({ type: 'pins_clear', scope, routeKey: currentRouteKey });
      if (session.role === 'host') {
        if (scope === 'screen' && currentRouteKey) {
          livePins = livePins
            .filter((c) => c.screen?.routeKey !== currentRouteKey)
            .map((c, index) => ({ ...c, number: index + 1 }));
        } else {
          livePins = [];
        }
        syncPinsToYDoc(livePins);
      }
      return [...livePins];
    }

    if (scope === 'screen' && currentRouteKey) {
      const comments = await loadComments();
      const remaining = comments
        .filter((c) => c.screen?.routeKey !== currentRouteKey)
        .map((c, index) => ({ ...c, number: index + 1 }));
      await saveComments(remaining);
      return remaining;
    }

    if (hasChromeStorage()) {
      const key = getSiteKey();
      await chrome.storage.local.remove(key);
      return [];
    }
    memoryPins = [];
    return [];
  }

  async function addReply(pinId, text) {
    const trimmed = String(text || '').trim();
    const comments = await loadComments();
    if (!trimmed) return { comment: null, comments };

    const idx = comments.findIndex((c) => c.id === pinId);
    if (idx === -1) return { comment: null, comments };

    const reply = normalizeReply({
      authorName: session.author.name,
      role: session.role === 'guest' ? 'guest' : 'host',
      text: trimmed,
      createdAt: Date.now()
    });

    if (session.mode === 'live') {
      sendWs({
        type: 'pin_reply',
        pinId,
        text: trimmed,
        authorName: session.author.name
      });
      const updated = {
        ...livePins[idx],
        replies: [...(livePins[idx].replies || []), reply],
        updatedAt: Date.now()
      };
      livePins = livePins.map((p) => (p.id === pinId ? updated : p));
      syncPinsToYDoc(livePins);
      return { comment: updated, comments: [...livePins] };
    }

    comments[idx] = {
      ...comments[idx],
      replies: [...(comments[idx].replies || []), reply],
      updatedAt: Date.now()
    };
    await saveComments(comments);
    return { comment: comments[idx], comments };
  }

  async function updatePinStatus(pinId, status) {
    const comments = await loadComments();
    if (!isValidStatus(status)) return { comment: null, comments };

    const idx = comments.findIndex((c) => c.id === pinId);
    if (idx === -1) return { comment: null, comments };

    if (session.mode === 'live') {
      sendWs({ type: 'pin_status', pinId, status });
      if (session.role !== 'host') {
        return { comment: comments[idx], comments: [...livePins] };
      }
      const updated = { ...livePins[idx], status, updatedAt: Date.now() };
      livePins = livePins.map((p) => (p.id === pinId ? updated : p));
      syncPinsToYDoc(livePins);
      return { comment: updated, comments: [...livePins] };
    }

    comments[idx] = { ...comments[idx], status, updatedAt: Date.now() };
    await saveComments(comments);
    return { comment: comments[idx], comments };
  }

  async function batchUpdateStatus(pinIds, status) {
    const comments = await loadComments();
    if (!isValidStatus(status) || !Array.isArray(pinIds) || pinIds.length === 0) {
      return { comments };
    }

    const idSet = new Set(pinIds);
    const now = Date.now();

    if (session.mode === 'live') {
      sendWs({ type: 'pin_batch_status', pinIds: Array.from(idSet), status });
      if (session.role !== 'host') {
        return { comments: [...livePins] };
      }
      livePins = livePins.map((p) => (idSet.has(p.id) ? { ...p, status, updatedAt: now } : p));
      syncPinsToYDoc(livePins);
      return { comments: [...livePins] };
    }

    const updated = comments.map((p) => (idSet.has(p.id) ? { ...p, status, updatedAt: now } : p));
    await saveComments(updated);
    return { comments: updated };
  }

  function onSyncUpdate(fn) {
    if (typeof fn !== 'function') return () => {};
    syncListeners.add(fn);
    return () => syncListeners.delete(fn);
  }

  function onPeersUpdate(fn) {
    if (typeof fn !== 'function') return () => {};
    peersListeners.add(fn);
    return () => peersListeners.delete(fn);
  }

  function onSessionError(fn) {
    if (typeof fn !== 'function') return () => {};
    errorListeners.add(fn);
    return () => errorListeners.delete(fn);
  }

  function onSessionStateChange(fn) {
    if (typeof fn !== 'function') return () => {};
    stateListeners.add(fn);
    return () => stateListeners.delete(fn);
  }

  window.AIFLStorage = {
    VALID_STATUSES,
    VALID_ROLES,
    isValidStatus,
    normalizeAuthor,
    normalizeReply,
    normalizePin,
    getSiteKey,
    getRouteKey,
    loadComments,
    saveComments,
    addComment,
    updateComment,
    deleteComment,
    clearComments,
    initLiveSession,
    connectLiveSession,
    disconnectLiveSession,
    getSessionState,
    setAuthorName,
    sendCursor,
    addReply,
    updatePinStatus,
    batchUpdateStatus,
    onSyncUpdate,
    onPeersUpdate,
    onSessionError,
    onSessionStateChange,
    getYDoc: ensureYDoc
  };
})();
