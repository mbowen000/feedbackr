(() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __commonJS = (cb, mod) => function __require() {
    try {
      return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
    } catch (e) {
      throw mod = 0, e;
    }
  };
  var __export = (target, all2) => {
    for (var name in all2)
      __defProp(target, name, { get: all2[name], enumerable: true });
  };

  // content/storage.js
  var require_storage = __commonJS({
    "content/storage.js"() {
      (() => {
        if (window.AIFLStorage) return;
        const VALID_STATUSES = ["pending", "approved", "in_progress", "resolved"];
        const VALID_ROLES = ["host", "guest", "agent"];
        const PEER_COLORS = ["#10b981", "#f59e0b", "#ec4899", "#06b6d4", "#8b5cf6", "#f97316"];
        const GUEST_IDENTITY_KEY = "aifl_guest_identity";
        const HOST_NAME_KEY = "aifl_host_name";
        const DEFAULT_LOCAL_COLLAB_URL = "http://127.0.0.1:4173";
        function isValidStatus(status) {
          return VALID_STATUSES.includes(status);
        }
        function pickRandomPeerColor() {
          return PEER_COLORS[Math.floor(Math.random() * PEER_COLORS.length)];
        }
        function normalizeAuthor(rawAuthor, fallbackRole = "host") {
          const role = VALID_ROLES.includes(rawAuthor?.role) ? rawAuthor.role : fallbackRole;
          const defaultName = role === "host" ? "Host" : role === "agent" ? "AI Coding Agent" : "Guest Reviewer";
          const defaultColor = role === "host" ? "#6366f1" : role === "agent" ? "#a855f7" : "#10b981";
          return {
            id: typeof rawAuthor?.id === "string" && rawAuthor.id.trim() ? rawAuthor.id.trim() : `${role}_local`,
            name: typeof rawAuthor?.name === "string" && rawAuthor.name.trim() ? rawAuthor.name.trim() : defaultName,
            role,
            color: typeof rawAuthor?.color === "string" && rawAuthor.color.trim() ? rawAuthor.color.trim() : defaultColor
          };
        }
        function normalizeReply(rawReply, index = 0) {
          const now = Date.now();
          const role = VALID_ROLES.includes(rawReply?.role) ? rawReply.role : "guest";
          const defaultName = role === "host" ? "Host" : role === "agent" ? "AI Coding Agent" : "Guest Reviewer";
          return {
            id: typeof rawReply?.id === "string" && rawReply.id.trim() ? rawReply.id.trim() : `rep_${now}_${index}_${Math.random().toString(36).slice(2, 6)}`,
            authorName: typeof rawReply?.authorName === "string" && rawReply.authorName.trim() ? rawReply.authorName.trim() : defaultName,
            role,
            text: String(rawReply?.text || "").trim(),
            createdAt: Number(rawReply?.createdAt) || now
          };
        }
        function normalizePin(raw, index = 0) {
          const now = Date.now();
          const status = isValidStatus(raw?.status) ? raw.status : "pending";
          const number = Number.isFinite(Number(raw?.number)) && Number(raw.number) > 0 ? Number(raw.number) : index + 1;
          const replies = Array.isArray(raw?.replies) ? raw.replies.map((r, i) => normalizeReply(r, i)).filter((r) => r.text.length > 0) : [];
          const screen = raw?.screen && typeof raw.screen === "object" ? {
            url: raw.screen.url || "",
            routeKey: raw.screen.routeKey || "/",
            screenLabel: raw.screen.screenLabel || raw.screen.routeKey || "/",
            activeScreenLabel: raw.screen.activeScreenLabel || null,
            title: raw.screen.title || "Web Page",
            viewport: raw.screen.viewport || null,
            landscape: Array.isArray(raw.screen.landscape) ? raw.screen.landscape : []
          } : {
            url: "",
            routeKey: "/",
            screenLabel: "/",
            activeScreenLabel: null,
            title: "Web Page",
            viewport: null,
            landscape: []
          };
          const target = raw?.target && typeof raw.target === "object" ? { ...raw.target } : {};
          return {
            id: typeof raw?.id === "string" && raw.id.trim() ? raw.id.trim() : `aifl_${now}_${Math.random().toString(36).slice(2, 8)}`,
            number,
            status,
            author: normalizeAuthor(raw?.author, "host"),
            text: String(raw?.text || "").trim(),
            category: raw?.category || "general",
            replies,
            resolutionSummary: raw?.resolutionSummary ? String(raw.resolutionSummary).trim() : void 0,
            screen,
            target,
            createdAt: Number(raw?.createdAt) || now,
            updatedAt: Number(raw?.updatedAt) || now
          };
        }
        function normalizePins(list) {
          if (!Array.isArray(list)) return [];
          return list.map((p, i) => normalizePin(p, i)).sort((a, b) => a.number - b.number || a.createdAt - b.createdAt);
        }
        function hasChromeStorage() {
          return typeof chrome !== "undefined" && Boolean(chrome.storage?.local);
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
            id: typeof stored?.id === "string" && stored.id.trim() ? stored.id.trim() : `guest_${Math.random().toString(36).slice(2, 8)}`,
            name: typeof overrideName === "string" && overrideName.trim() ? overrideName.trim() : typeof stored?.name === "string" && stored.name.trim() ? stored.name.trim() : "Guest Reviewer",
            role: "guest",
            color: typeof stored?.color === "string" && stored.color.trim() ? stored.color.trim() : pickRandomPeerColor()
          };
          writeSessionStorage(GUEST_IDENTITY_KEY, JSON.stringify(identity));
          return identity;
        }
        function getHostIdentity(overrideName = null) {
          const saved = readSessionStorage(HOST_NAME_KEY);
          const name = typeof overrideName === "string" && overrideName.trim() ? overrideName.trim() : saved && saved.trim() ? saved.trim() : "Host";
          if (overrideName && overrideName.trim()) {
            writeSessionStorage(HOST_NAME_KEY, name);
          }
          return {
            id: "host_local",
            name,
            role: "host",
            color: "#6366f1"
          };
        }
        let localYDoc = null;
        let localYPins = null;
        function ensureYDoc() {
          if (localYDoc) return localYDoc;
          const Y = window.__AIFL_YJS__;
          if (Y && typeof Y.Doc === "function") {
            localYDoc = new Y.Doc();
            localYPins = localYDoc.getMap("pins");
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
          mode: isGuestMode ? "live" : "standalone",
          role: isGuestMode ? "guest" : "standalone",
          author: initialAuthor,
          peers: [],
          serverUrl: "",
          hostToken: "",
          lastError: null,
          manualDisconnect: false
        };
        let livePins = [];
        let memoryPins = [];
        let activeWs = null;
        let reconnectTimer = null;
        let reconnectDelayMs = 1e3;
        let initPromise = null;
        let lastConnectArgs = null;
        let lastCursorSentAt = 0;
        let cursorThrottleTimer = null;
        let queuedCursor = null;
        const syncListeners = /* @__PURE__ */ new Set();
        const peersListeners = /* @__PURE__ */ new Set();
        const errorListeners = /* @__PURE__ */ new Set();
        const stateListeners = /* @__PURE__ */ new Set();
        function emitSync(pins, event = null) {
          const snapshot2 = [...pins];
          syncListeners.forEach((fn) => {
            try {
              fn(snapshot2, event);
            } catch (err) {
              console.warn("AI Feedback Loop: sync listener error", err);
            }
          });
        }
        function emitPeers(peers, event = null) {
          const snapshot2 = [...peers];
          peersListeners.forEach((fn) => {
            try {
              fn(snapshot2, event);
            } catch (err) {
              console.warn("AI Feedback Loop: peer listener error", err);
            }
          });
        }
        function emitError(errPayload) {
          session.lastError = errPayload?.message || "Session error";
          errorListeners.forEach((fn) => {
            try {
              fn(errPayload);
            } catch (err) {
              console.warn("AI Feedback Loop: error listener failure", err);
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
              console.warn("AI Feedback Loop: state listener failure", err);
            }
          });
        }
        function normalizePeersList(rawPeers) {
          if (Array.isArray(rawPeers)) {
            return rawPeers.map((p) => ({
              clientId: p.clientId || p.id || "",
              name: p.name || p.author?.name || "Peer",
              role: p.role || p.author?.role || "guest",
              color: p.color || p.author?.color || "#10b981"
            }));
          }
          if (rawPeers && typeof rawPeers === "object") {
            return Object.values(rawPeers).map((p) => ({
              clientId: p.clientId || p.id || "",
              name: p.name || p.author?.name || "Peer",
              role: p.role || p.author?.role || "guest",
              color: p.color || p.author?.color || "#10b981"
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
            guestName: session.author.role === "guest" ? session.author.name : "",
            hasHostToken: Boolean(session.hostToken),
            lastError: session.lastError
          };
        }
        function getSiteKey() {
          const origin = window.location.origin;
          if (!origin || origin === "null" || window.location.protocol === "file:") {
            return `aifl_site_file_${window.location.pathname}`;
          }
          return `aifl_site_${origin}`;
        }
        function getRouteKey(href = window.location.href) {
          try {
            const u = new URL(href);
            if (u.protocol === "file:") {
              return `${u.pathname.split("/").pop() || "index.html"}${u.search}${u.hash}`;
            }
            return `${u.pathname}${u.search}${u.hash}` || "/";
          } catch {
            return window.location.pathname || "/";
          }
        }
        function normalizeServerUrls(rawServerUrl) {
          const input = String(rawServerUrl || window.location.origin || DEFAULT_LOCAL_COLLAB_URL).trim();
          const cleaned = input.replace(/\/+$/, "");
          let httpBase = cleaned;
          if (/^wss?:\/\//i.test(cleaned)) {
            httpBase = cleaned.replace(/^ws:/i, "http:").replace(/^wss:/i, "https:");
          } else if (!/^https?:\/\//i.test(cleaned)) {
            httpBase = `http://${cleaned}`;
          }
          const wsBase = httpBase.replace(/^http:/i, "ws:").replace(/^https:/i, "wss:");
          return { httpBase, wsBase };
        }
        async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 900) {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), timeoutMs);
          try {
            const res = await fetch(url, {
              cache: "no-store",
              ...options,
              signal: controller.signal
            });
            const contentType = res.headers.get("content-type") || "";
            if (!res.ok || !contentType.includes("application/json")) {
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
                ws.close(1e3, "Switching or closing session");
              }
            } catch {
            }
          }
        }
        function scheduleReconnect() {
          if (session.manualDisconnect || !lastConnectArgs) return;
          clearReconnectTimer();
          const delay = reconnectDelayMs;
          reconnectDelayMs = Math.min(8e3, reconnectDelayMs * 2);
          reconnectTimer = setTimeout(() => {
            if (!session.manualDisconnect && lastConnectArgs) {
              connectLiveSession(lastConnectArgs).catch(() => {
              });
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
            console.warn("AI Feedback Loop: WebSocket send failed", err);
            return false;
          }
        }
        function connectLiveSession(options = {}) {
          const {
            serverUrl = window.location.origin,
            hostToken = "",
            authorName = null
          } = options;
          closeActiveSocket();
          session.manualDisconnect = false;
          session.lastError = null;
          const { httpBase, wsBase } = normalizeServerUrls(serverUrl);
          const trimmedToken = typeof hostToken === "string" ? hostToken.trim() : "";
          if (trimmedToken) {
            session.hostToken = trimmedToken;
            session.author = getHostIdentity(authorName);
            session.role = "host";
          } else {
            session.hostToken = "";
            session.author = getOrCreateGuestIdentity(authorName);
            session.role = "guest";
          }
          session.serverUrl = httpBase;
          session.mode = "live";
          session.connecting = true;
          session.connected = false;
          lastConnectArgs = {
            serverUrl: httpBase,
            hostToken: session.hostToken,
            authorName: session.author.name
          };
          emitStateChange();
          const params2 = new URLSearchParams({
            clientId: session.author.id,
            name: session.author.name,
            color: session.author.color
          });
          if (session.hostToken) {
            params2.set("hostToken", session.hostToken);
          }
          const wsUrl = `${wsBase}/ws?${params2.toString()}`;
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
              emitError({ code: 0, message: err?.message || "Failed to open WebSocket" });
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
              if (typeof event.data !== "string") {
                return;
              }
              let msg;
              try {
                msg = JSON.parse(event.data);
              } catch {
                return;
              }
              if (!msg || typeof msg.type !== "string") return;
              switch (msg.type) {
                case "init": {
                  reconnectDelayMs = 1e3;
                  session.connected = true;
                  session.connecting = false;
                  session.mode = "live";
                  session.role = msg.role || (session.hostToken ? "host" : "guest");
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
                case "pins_updated":
                case "agent_dispatch_requested": {
                  if (Array.isArray(msg.pins)) {
                    livePins = normalizePins(msg.pins);
                    syncPinsToYDoc(livePins);
                    emitSync(livePins, msg);
                  }
                  break;
                }
                case "peers_updated": {
                  session.peers = normalizePeersList(msg.peers);
                  emitStateChange();
                  emitPeers(session.peers, msg);
                  break;
                }
                case "cursor_move": {
                  emitPeers(session.peers, msg);
                  break;
                }
                case "error": {
                  emitError(msg);
                  break;
                }
                default:
                  break;
              }
            };
            ws.onerror = () => {
              if (activeWs !== ws) return;
              session.lastError = "WebSocket connection failed";
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
          session.hostToken = "";
          session.serverUrl = "";
          if (window.__AIFL_GUEST_MODE__) {
            session.mode = "live";
            session.role = "guest";
          } else {
            session.mode = "standalone";
            session.role = "standalone";
            session.author = getHostIdentity();
          }
          emitStateChange();
          emitPeers([], { type: "peers_updated", peers: [] });
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
            if (!window.location.protocol.startsWith("http")) {
              return getSessionState();
            }
            const candidates = [window.location.origin];
            const host = window.location.hostname;
            if ((host === "localhost" || host === "127.0.0.1" || host === "[::1]") && window.location.origin !== DEFAULT_LOCAL_COLLAB_URL) {
              candidates.push(DEFAULT_LOCAL_COLLAB_URL);
            }
            let foundServerBase = null;
            for (const base of candidates) {
              const statusRes = await fetchJsonWithTimeout(`${base}/__collab/status`, {}, 800);
              if (statusRes.ok && statusRes.data?.ok === true && typeof statusRes.data?.wsPath === "string") {
                foundServerBase = base;
                break;
              }
            }
            if (!foundServerBase) {
              return getSessionState();
            }
            const hostRes = await fetchJsonWithTimeout(`${foundServerBase}/__collab/host-session`, {}, 1e3);
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
          const trimmed = typeof name === "string" ? name.trim() : "";
          if (!trimmed) return getSessionState();
          if (session.role === "host" || !window.__AIFL_GUEST_MODE__ && session.hostToken) {
            session.author = getHostIdentity(trimmed);
          } else {
            session.author = getOrCreateGuestIdentity(trimmed);
          }
          if (lastConnectArgs) {
            lastConnectArgs.authorName = session.author.name;
          }
          emitStateChange();
          if (session.connected && activeWs && activeWs.readyState === WebSocket.OPEN) {
            sendWs({ type: "author_update", name: session.author.name });
          } else if (session.mode === "live" && session.serverUrl) {
            connectLiveSession({
              serverUrl: session.serverUrl,
              hostToken: session.hostToken,
              authorName: session.author.name
            }).catch(() => {
            });
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
            sendWs({ type: "cursor_move", cursor });
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
                sendWs({ type: "cursor_move", cursor: toSend });
              }
            }, Math.max(8, 40 - elapsed));
          }
        }
        async function loadComments() {
          if (session.mode === "live") {
            return [...livePins];
          }
          if (hasChromeStorage()) {
            try {
              const key = getSiteKey();
              const result = await chrome.storage.local.get(key);
              const list = Array.isArray(result[key]) ? result[key] : [];
              return normalizePins(list);
            } catch (err) {
              console.warn("AI Feedback Loop: Failed to load comments from storage.", err);
              return [];
            }
          }
          return [...memoryPins];
        }
        async function saveComments(comments) {
          const normalized = normalizePins(comments);
          if (session.mode === "live") {
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
              console.warn("AI Feedback Loop: Failed to save comments.", err);
              return normalized;
            }
          }
          memoryPins = normalized;
          return [...memoryPins];
        }
        async function addComment(payload) {
          const comments = await loadComments();
          const maxNum = comments.reduce((max2, c) => Math.max(max2, Number(c.number) || 0), 0);
          const now = Date.now();
          const author = session.mode === "live" ? { ...session.author } : normalizeAuthor(payload.author, "host");
          const newComment = normalizePin(
            {
              id: `aifl_${now}_${Math.random().toString(36).slice(2, 8)}`,
              number: maxNum + 1,
              status: session.role === "guest" ? "pending" : payload.status || "pending",
              author,
              text: (payload.text || "").trim(),
              category: payload.category || "general",
              replies: [],
              createdAt: now,
              updatedAt: now,
              screen: payload.screen,
              target: payload.target
            },
            comments.length
          );
          if (session.mode === "live") {
            sendWs({ type: "pin_create", pin: newComment });
            livePins = normalizePins([...livePins, newComment]);
            syncPinsToYDoc(livePins);
            return { comment: newComment, comments: [...livePins] };
          }
          comments.push(newComment);
          await saveComments(comments);
          return { comment: newComment, comments };
        }
        async function updateComment(id2, patch) {
          const comments = await loadComments();
          const idx = comments.findIndex((c) => c.id === id2);
          if (idx === -1) return { comment: null, comments };
          if (session.mode === "live") {
            const existing = comments[idx];
            sendWs({ type: "pin_update", pinId: id2, patch });
            const canMutateOptimistically = session.role === "host" || session.role === "guest" && existing.author?.id === session.author.id && existing.status === "pending" && patch.status === void 0;
            if (!canMutateOptimistically) {
              return { comment: existing, comments: [...livePins] };
            }
            const nextPin = normalizePin(
              {
                ...existing,
                ...patch,
                status: session.role === "guest" ? existing.status : patch.status || existing.status,
                updatedAt: Date.now()
              },
              idx
            );
            livePins = livePins.map((p) => p.id === id2 ? nextPin : p);
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
        async function deleteComment(id2) {
          const comments = await loadComments();
          const existing = comments.find((c) => c.id === id2);
          if (session.mode === "live") {
            sendWs({ type: "pin_delete", pinId: id2 });
            const canDeleteOptimistically = session.role === "host" || session.role === "guest" && existing && existing.author?.id === session.author.id && existing.status === "pending";
            if (canDeleteOptimistically) {
              livePins = livePins.filter((c) => c.id !== id2).map((c, index) => ({ ...c, number: index + 1 }));
              syncPinsToYDoc(livePins);
            }
            return [...livePins];
          }
          const filtered = comments.filter((c) => c.id !== id2).map((c, index) => ({ ...c, number: index + 1 }));
          await saveComments(filtered);
          return filtered;
        }
        async function clearComments(scope = "all", currentRouteKey = null) {
          if (session.mode === "live") {
            sendWs({ type: "pins_clear", scope, routeKey: currentRouteKey });
            if (session.role === "host") {
              if (scope === "screen" && currentRouteKey) {
                livePins = livePins.filter((c) => c.screen?.routeKey !== currentRouteKey).map((c, index) => ({ ...c, number: index + 1 }));
              } else {
                livePins = [];
              }
              syncPinsToYDoc(livePins);
            }
            return [...livePins];
          }
          if (scope === "screen" && currentRouteKey) {
            const comments = await loadComments();
            const remaining = comments.filter((c) => c.screen?.routeKey !== currentRouteKey).map((c, index) => ({ ...c, number: index + 1 }));
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
        async function addReply(pinId, text2) {
          const trimmed = String(text2 || "").trim();
          const comments = await loadComments();
          if (!trimmed) return { comment: null, comments };
          const idx = comments.findIndex((c) => c.id === pinId);
          if (idx === -1) return { comment: null, comments };
          const reply = normalizeReply({
            authorName: session.author.name,
            role: session.role === "guest" ? "guest" : "host",
            text: trimmed,
            createdAt: Date.now()
          });
          if (session.mode === "live") {
            sendWs({
              type: "pin_reply",
              pinId,
              text: trimmed,
              authorName: session.author.name
            });
            const updated = {
              ...livePins[idx],
              replies: [...livePins[idx].replies || [], reply],
              updatedAt: Date.now()
            };
            livePins = livePins.map((p) => p.id === pinId ? updated : p);
            syncPinsToYDoc(livePins);
            return { comment: updated, comments: [...livePins] };
          }
          comments[idx] = {
            ...comments[idx],
            replies: [...comments[idx].replies || [], reply],
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
          if (session.mode === "live") {
            sendWs({ type: "pin_status", pinId, status });
            if (session.role !== "host") {
              return { comment: comments[idx], comments: [...livePins] };
            }
            const updated = { ...livePins[idx], status, updatedAt: Date.now() };
            livePins = livePins.map((p) => p.id === pinId ? updated : p);
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
          if (session.mode === "live") {
            sendWs({ type: "pin_batch_status", pinIds: Array.from(idSet), status });
            if (session.role !== "host") {
              return { comments: [...livePins] };
            }
            livePins = livePins.map((p) => idSet.has(p.id) ? { ...p, status, updatedAt: now } : p);
            syncPinsToYDoc(livePins);
            return { comments: [...livePins] };
          }
          const updated = comments.map((p) => idSet.has(p.id) ? { ...p, status, updatedAt: now } : p);
          await saveComments(updated);
          return { comments: updated };
        }
        function onSyncUpdate(fn) {
          if (typeof fn !== "function") return () => {
          };
          syncListeners.add(fn);
          return () => syncListeners.delete(fn);
        }
        function onPeersUpdate(fn) {
          if (typeof fn !== "function") return () => {
          };
          peersListeners.add(fn);
          return () => peersListeners.delete(fn);
        }
        function onSessionError(fn) {
          if (typeof fn !== "function") return () => {
          };
          errorListeners.add(fn);
          return () => errorListeners.delete(fn);
        }
        function onSessionStateChange(fn) {
          if (typeof fn !== "function") return () => {
          };
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
    }
  });

  // content/promptGenerator.js
  var require_promptGenerator = __commonJS({
    "content/promptGenerator.js"() {
      (() => {
        if (window.AIFLPromptGenerator) return;
        const IGNORED_CLASSES = /* @__PURE__ */ new Set([
          "active",
          "hover",
          "focus",
          "focused",
          "selected",
          "open",
          "opened",
          "closed",
          "visible",
          "hidden",
          "show",
          "showing",
          "fade",
          "in",
          "out",
          "disabled",
          "enabled",
          "current"
        ]);
        function cleanText(str, maxLen = 140) {
          if (!str) return "";
          const normalized = String(str).replace(/\s+/g, " ").trim();
          if (!normalized) return "";
          return normalized.length > maxLen ? `${normalized.slice(0, maxLen - 1).trim()}\u2026` : normalized;
        }
        function isStableId(id2) {
          if (!id2 || typeof id2 !== "string") return false;
          if (id2.startsWith("aifl-")) return false;
          if (/^(:r|radix-|headlessui-|ember\d|mui-\d|react-select-)/i.test(id2)) return false;
          if (/^[0-9a-f]{16,}$/i.test(id2)) return false;
          return true;
        }
        function getSemanticClasses(el, limit = 2) {
          if (!el || !el.classList) return [];
          const classes = [];
          for (const cls of el.classList) {
            if (!cls || cls.startsWith("aifl-")) continue;
            if (IGNORED_CLASSES.has(cls.toLowerCase())) continue;
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
          const attrs = ["data-testid", "data-test-id", "data-cy", "data-qa", "data-id", "data-component"];
          for (const attr of attrs) {
            const val = el.getAttribute(attr);
            if (val) return `${attr}="${CSS.escape(val)}"`;
          }
          return null;
        }
        function buildRobustSelector(el) {
          if (!el || el.nodeType !== 1) return "body";
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
              segment += `.${classes.map((c) => CSS.escape(c)).join(".")}`;
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
            const candidate = parts.join(" > ");
            try {
              if (document.querySelectorAll(candidate).length === 1) {
                return candidate;
              }
            } catch {
            }
            current = parent;
            depth++;
          }
          return parts.join(" > ") || el.tagName.toLowerCase();
        }
        function buildShortElementLabel(el) {
          if (!el || el.nodeType !== 1) return "element";
          const tag = el.tagName.toLowerCase();
          const idPart = isStableId(el.id) ? `#${el.id}` : "";
          const classes = getSemanticClasses(el, 2);
          const classPart = classes.length ? `.${classes.join(".")}` : "";
          return `${tag}${idPart}${classPart}`;
        }
        function extractElementText(el) {
          if (!el || el.nodeType !== 1) return "";
          const tag = el.tagName.toLowerCase();
          if (tag === "input" || tag === "textarea") {
            const val = el.value || el.getAttribute("placeholder") || el.getAttribute("aria-label") || "";
            return cleanText(val, 120);
          }
          if (tag === "img") {
            const srcFile = el.getAttribute("src")?.split("/").pop()?.split("?")[0] || "";
            const alt = el.getAttribute("alt") || srcFile || "image";
            return cleanText(`[Image: "${alt}"${srcFile && srcFile !== alt ? ` (${srcFile})` : ""}]`, 120);
          }
          if (tag === "svg" || el.closest("svg")) {
            const svgEl = tag === "svg" ? el : el.closest("svg");
            const label = svgEl.getAttribute("aria-label") || svgEl.querySelector("title")?.textContent || svgEl.parentElement?.getAttribute("aria-label") || svgEl.parentElement?.textContent || "SVG graphic";
            return cleanText(`[Icon/SVG: "${label}"]`, 120);
          }
          const directImg = el.querySelector?.(":scope > img");
          const raw = el.innerText || el.textContent || el.getAttribute("aria-label") || el.getAttribute("title") || "";
          if (!raw.trim() && directImg) {
            const srcFile = directImg.getAttribute("src")?.split("/").pop()?.split("?")[0] || "";
            const alt = directImg.getAttribute("alt") || srcFile || "image";
            return cleanText(`[Image: "${alt}"${srcFile && srcFile !== alt ? ` (${srcFile})` : ""}]`, 120);
          }
          return cleanText(raw, 140);
        }
        function extractClickedPhrase(clientX, clientY, el) {
          if (!el || typeof clientX !== "number" || typeof clientY !== "number") return null;
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
            const full = textNode.nodeValue || "";
            if (full.trim().length < 45) return null;
            const start = Math.max(0, offset - 22);
            const end = Math.min(full.length, offset + 28);
            const slice = cleanText(full.slice(start, end), 55);
            if (!slice) return null;
            return `${start > 0 ? "\u2026" : ""}${slice}${end < full.length ? "\u2026" : ""}`;
          } catch {
            return null;
          }
        }
        function extractContentSiblings(el, ownText) {
          if (!el || el.nodeType !== 1) return { prevDesc: null, nextDesc: null };
          function describeSibling(node) {
            if (!node || node.nodeType !== 1) return null;
            if (node.id === "ai-feedback-loop-host") return null;
            const tag = node.tagName.toLowerCase();
            if (tag === "script" || tag === "style" || tag === "noscript") return null;
            const text2 = extractElementText(node);
            if (!text2 || text2 === ownText) return null;
            const shortTag = buildShortElementLabel(node);
            return `\`<${shortTag}>\` ("${cleanText(text2, 75)}")`;
          }
          let prevDesc = null;
          let nextDesc = null;
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
        function capturePageContentLandscape(targetEl, fallbackCoords = null) {
          const candidateSelectors = [
            "header",
            "nav",
            "main > section",
            "main > article",
            "main > div",
            "section",
            "article",
            "details",
            "form",
            "dialog[open]",
            '[role="dialog"]',
            "[data-screen]",
            "[data-slide]",
            '[class*="hero"]',
            '[class*="card"]',
            "footer"
          ].join(", ");
          const rawRegions = Array.from(document.querySelectorAll(candidateSelectors)).filter((node) => {
            if (!node || node.id === "ai-feedback-loop-host" || node.closest("#ai-feedback-loop-host")) return false;
            if (!isElementCurrentlyVisible(node)) return false;
            const rect = node.getBoundingClientRect();
            return rect.width >= 60 && rect.height >= 24;
          });
          const selectedNodes = [];
          for (const node of rawRegions) {
            const nodeText = cleanText(node.innerText || node.textContent, 160);
            const hasImg = Boolean(node.querySelector("img"));
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
            const id2 = `L${idx + 1}`;
            const containerTag = `<${buildShortElementLabel(node)}>`;
            const headingEl = node.querySelector('h1, h2, h3, h4, summary, legend, [role="heading"]');
            const headingText = headingEl ? cleanText(headingEl.innerText || headingEl.textContent, 65) : /^H[1-6]$/.test(node.tagName) ? cleanText(node.innerText || node.textContent, 65) : null;
            const copyEls = Array.from(node.querySelectorAll("p, li, blockquote")).slice(0, 2);
            const copySnippets = copyEls.map((p) => cleanText(p.innerText || p.textContent, 60)).filter((t) => t && t !== headingText);
            const imgEls = Array.from(node.querySelectorAll("img")).slice(0, 2);
            const imgSnippets = imgEls.map((img) => {
              const alt = cleanText(img.getAttribute("alt") || "", 35);
              const src = img.getAttribute("src")?.split("/").pop()?.split("?")[0] || "img";
              return alt ? `"${alt}" (${src})` : src;
            });
            const ctrlEls = Array.from(
              node.querySelectorAll('button, a, [role="tab"], input[type="submit"], input[placeholder]')
            ).slice(0, 4);
            const ctrlSnippets = ctrlEls.map((c) => {
              const t = cleanText(c.innerText || c.textContent || c.getAttribute("placeholder") || c.getAttribute("aria-label"), 30);
              if (!t) return null;
              const isActive = c.classList.contains("active") || c.getAttribute("aria-selected") === "true" || c.getAttribute("aria-expanded") === "true";
              return `"${t}"${isActive ? " (active)" : ""}`;
            }).filter(Boolean);
            const parts = [];
            if (headingText) {
              const hTag = headingEl ? headingEl.tagName.toLowerCase() : "heading";
              parts.push(`${hTag}: "${headingText}"`);
            }
            if (copySnippets.length > 0) {
              parts.push(`Copy: ${copySnippets.map((s) => `"${s}"`).join(" / ")}`);
            }
            if (imgSnippets.length > 0) {
              parts.push(`Images: [${imgSnippets.join(", ")}]`);
            }
            if (ctrlSnippets.length > 0) {
              parts.push(`Controls: [${Array.from(new Set(ctrlSnippets)).join(", ")}]`);
            }
            if (parts.length === 0) {
              const fallback = cleanText(node.innerText || node.textContent, 75);
              if (fallback) parts.push(`Text: "${fallback}"`);
            }
            const title = headingText || copySnippets[0] || containerTag;
            const item = {
              id: id2,
              container: containerTag,
              title,
              summary: parts.join(" \u2022 ")
            };
            landscape.push(item);
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
              const dx = fallbackCoords.clientX < rect.left ? rect.left - fallbackCoords.clientX : fallbackCoords.clientX > rect.right ? fallbackCoords.clientX - rect.right : 0;
              const dy = fallbackCoords.clientY < rect.top ? rect.top - fallbackCoords.clientY : fallbackCoords.clientY > rect.bottom ? fallbackCoords.clientY - rect.bottom : 0;
              const dist = Math.hypot(dx, dy);
              if (dist < bestDist) {
                bestDist = dist;
                matchedLandmark = item;
              }
            }
          });
          return { landscape, matchedLandmark };
        }
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
          const landmarkPrefix = matchedLandmark ? `Inside landmark [${matchedLandmark.id}] (${matchedLandmark.container}${matchedLandmark.title && matchedLandmark.title !== matchedLandmark.container ? ` \u2014 "${matchedLandmark.title}"` : ""})` : sectionHeading ? `Under section "${sectionHeading}"` : "On this screen";
          if (isFreePin) {
            const coordPart = `at page coordinate (${pageCoords.x}, ${pageCoords.y}) (${region || "Viewport"}, ${viewportPct.x}% X, ${viewportPct.y}% Y)`;
            const nearPart = Array.isArray(spatialLandmarks) && spatialLandmarks.length > 0 ? `, positioned ${spatialLandmarks.join(" and ")}` : "";
            return `${landmarkPrefix} ${coordPart}${nearPart}.`;
          }
          const contentPart = textSnippet ? `containing the content "${textSnippet}"${clickedPhrase ? ` (specifically clicked near "${clickedPhrase}")` : ""}` : "with no inner text";
          const siblingClauses = [];
          if (prevDesc) siblingClauses.push(`immediately follows sibling ${prevDesc}`);
          if (nextDesc) siblingClauses.push(`immediately precedes sibling ${nextDesc}`);
          const siblingPart = siblingClauses.length > 0 ? `, which ${siblingClauses.join(" and ")}` : "";
          return `${landmarkPrefix}, targeting \`<${shortLabel}>\` ${contentPart}${siblingPart}.`;
        }
        function findNearestHeading(el) {
          if (!el || el.nodeType !== 1) return null;
          if (/^H[1-6]$/.test(el.tagName) || el.getAttribute("role") === "heading") {
            return cleanText(el.innerText || el.textContent, 90);
          }
          let curr = el;
          let depth = 0;
          while (curr && curr !== document.body && depth < 7) {
            let prev = curr.previousElementSibling;
            while (prev) {
              if (/^H[1-6]$/.test(prev.tagName) || prev.getAttribute("role") === "heading") {
                const text2 = cleanText(prev.innerText || prev.textContent, 90);
                if (text2) return text2;
              }
              const nestedHeading = prev.querySelector?.('h1, h2, h3, h4, [role="heading"]');
              if (nestedHeading) {
                const text2 = cleanText(nestedHeading.innerText || nestedHeading.textContent, 90);
                if (text2) return text2;
              }
              prev = prev.previousElementSibling;
            }
            const parent = curr.parentElement;
            if (parent) {
              const directHeading = parent.querySelector(
                ":scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > header h1, :scope > header h2, :scope > header h3, :scope > legend, :scope > summary"
              );
              if (directHeading && directHeading !== el) {
                const text2 = cleanText(directHeading.innerText || directHeading.textContent, 90);
                if (text2) return text2;
              }
            }
            curr = parent;
            depth++;
          }
          const pageHeading = document.querySelector("h1, h2");
          return pageHeading ? cleanText(pageHeading.innerText || pageHeading.textContent, 90) : null;
        }
        function extractNearbyContext(el, ownText) {
          if (!el || el.nodeType !== 1) return { landmark: null, nearbyText: "" };
          const landmarkEl = el.closest(
            'section, article, nav, header, footer, aside, main, form, dialog, [role="dialog"], [role="region"], [role="navigation"], [role="tabpanel"], details, tr, li, [class*="card"], [class*="slide"], [class*="panel"]'
          );
          let landmark = null;
          if (landmarkEl && landmarkEl !== document.body) {
            const label = landmarkEl.getAttribute("aria-label") || (isStableId(landmarkEl.id) ? `#${landmarkEl.id}` : "") || getSemanticClasses(landmarkEl, 1)[0] || "";
            landmark = `<${landmarkEl.tagName.toLowerCase()}${label ? label.startsWith("#") ? label : `.${label}` : ""}>`;
          }
          const snippets = [];
          const prev = el.previousElementSibling;
          const next = el.nextElementSibling;
          if (prev) {
            const t = cleanText(prev.innerText || prev.textContent || prev.getAttribute("aria-label"), 60);
            if (t && t !== ownText) snippets.push(`Prev: "${t}"`);
          }
          if (next) {
            const t = cleanText(next.innerText || next.textContent || next.getAttribute("aria-label"), 60);
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
            nearbyText: snippets.join(" | ")
          };
        }
        function extractInteractiveAndScreenContext(el) {
          const uiStates = [];
          const interactiveAncestors = [];
          let activeScreenLabel = null;
          let curr = el;
          while (curr && curr.nodeType === 1 && curr !== document.body) {
            const tag = curr.tagName.toLowerCase();
            const role = curr.getAttribute("role");
            const cls = (typeof curr.className === "string" ? curr.className : "").toLowerCase();
            if (tag === "details") {
              const summary = cleanText(curr.querySelector("summary")?.textContent || "Details", 60);
              uiStates.push(`Accordion <details>: "${summary}" (open)`);
              interactiveAncestors.push({
                type: "details",
                selector: buildRobustSelector(curr),
                label: summary
              });
            }
            if (curr.id) {
              const controller = document.querySelector(`[aria-controls="${CSS.escape(curr.id)}"]`);
              if (controller) {
                const ctrlLabel = cleanText(controller.innerText || controller.getAttribute("aria-label") || curr.id, 60);
                uiStates.push(`Expanded panel: "${ctrlLabel}"`);
                interactiveAncestors.push({
                  type: "aria-controls",
                  selector: buildRobustSelector(curr),
                  triggerSelector: buildRobustSelector(controller),
                  label: ctrlLabel
                });
              }
            }
            if (curr.getAttribute("aria-expanded") === "true" && curr !== el) {
              const label = cleanText(curr.getAttribute("aria-label") || curr.innerText?.split("\n")[0] || tag, 50);
              uiStates.push(`Expanded container: "${label}"`);
            }
            if (role === "menu" || role === "listbox" || /\b(dropdown-menu|popover|menu-list|submenu|context-menu)\b/.test(cls)) {
              const menuLabel = cleanText(
                curr.getAttribute("aria-label") || curr.previousElementSibling?.textContent || "Menu / Dropdown",
                50
              );
              uiStates.push(`Open menu: "${menuLabel}"`);
              interactiveAncestors.push({
                type: "menu",
                selector: buildRobustSelector(curr),
                label: menuLabel
              });
            } else if (/\b(accordion-content|accordion-body|accordion-panel|collapse)\b/.test(cls)) {
              const accHeader = curr.previousElementSibling || curr.parentElement?.querySelector('[class*="header"], [class*="trigger"], button, summary');
              const accLabel = cleanText(accHeader?.textContent || "Accordion item", 60);
              if (!uiStates.some((s) => s.includes(accLabel))) {
                uiStates.push(`Open accordion: "${accLabel}"`);
                interactiveAncestors.push({
                  type: "custom-accordion",
                  selector: buildRobustSelector(curr),
                  triggerSelector: accHeader ? buildRobustSelector(accHeader) : null,
                  label: accLabel
                });
              }
            }
            if (tag === "dialog" || role === "dialog" || curr.getAttribute("aria-modal") === "true" || /\b(modal|drawer)\b/.test(cls)) {
              const modalHeading = curr.querySelector('h1, h2, h3, h4, [class*="title"]');
              const modalTitle = cleanText(
                curr.getAttribute("aria-label") || modalHeading?.textContent || "Modal Dialog",
                60
              );
              uiStates.push(`Modal/Dialog: "${modalTitle}"`);
              if (!activeScreenLabel) activeScreenLabel = `Modal: ${modalTitle}`;
            }
            if (role === "tabpanel" || /\btab-pane|tab-content|tab-panel\b/.test(cls)) {
              let tabName = curr.getAttribute("aria-label") || "";
              const labelledBy = curr.getAttribute("aria-labelledby");
              if (!tabName && labelledBy) {
                const tabTrigger = document.getElementById(labelledBy);
                if (tabTrigger) tabName = cleanText(tabTrigger.textContent, 50);
              }
              if (tabName) {
                uiStates.push(`Tab panel: "${tabName}"`);
                if (!activeScreenLabel) activeScreenLabel = `Tab: ${tabName}`;
              }
            }
            if (curr.hasAttribute("data-slide") || curr.hasAttribute("data-screen") || curr.hasAttribute("data-step") || /\b(slide|screen|step-view)\b/.test(cls)) {
              const slideHeading = curr.querySelector("h1, h2, h3");
              const slideAttr = curr.getAttribute("data-slide") || curr.getAttribute("data-screen") || curr.getAttribute("data-step") || "";
              const slideTitle = cleanText(slideHeading?.textContent || slideAttr || "Slide", 50);
              if (slideTitle) {
                uiStates.push(`Screen/Slide: "${slideTitle}"`);
                if (!activeScreenLabel) activeScreenLabel = `Screen: ${slideTitle}`;
              }
            }
            curr = curr.parentElement;
          }
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
        function captureComputedStyleSummary(el) {
          try {
            const cs = window.getComputedStyle(el);
            const fontSize = cs.fontSize;
            const fontWeight = cs.fontWeight;
            const color = cs.color;
            const bg = cs.backgroundColor;
            const padding = cs.padding !== "0px" ? cs.padding : null;
            const parts = [];
            if (fontSize) parts.push(`font: ${fontSize}/${fontWeight}`);
            if (color) parts.push(`color: ${color}`);
            if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") {
              parts.push(`bg: ${bg}`);
            }
            if (padding) parts.push(`padding: ${padding}`);
            return parts.join(", ");
          } catch {
            return "";
          }
        }
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
          const offsetXRatio = rect.width > 0 ? Math.min(0.95, Math.max(0.05, (clientX - rect.left) / rect.width)) : 0.5;
          const offsetYRatio = rect.height > 0 ? Math.min(0.95, Math.max(0.05, (clientY - rect.top) / rect.height)) : 0.5;
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
            x: Math.round(clientX / vw * 100),
            y: Math.round(clientY / vh * 100)
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
          const routeKey = window.AIFLStorage ? window.AIFLStorage.getRouteKey() : `${window.location.pathname}${window.location.search}${window.location.hash}`;
          const screenLabel = activeScreenLabel ? `${routeKey} (${activeScreenLabel})` : sectionHeading ? `${routeKey} \u2014 ${sectionHeading}` : routeKey;
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
              pinType: "element",
              selector,
              shortLabel,
              tagName: el.tagName.toLowerCase(),
              id: isStableId(el.id) ? el.id : null,
              classes: getSemanticClasses(el, 3),
              role: el.getAttribute("role") || null,
              ariaLabel: el.getAttribute("aria-label") || null,
              testId: getTestId(el),
              href: el.getAttribute("href") || null,
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
        function describeViewportRegion(pctX, pctY) {
          const v = pctY < 33 ? "Top" : pctY > 66 ? "Bottom" : "Middle";
          const h = pctX < 33 ? "Left" : pctX > 66 ? "Right" : "Center";
          if (v === "Middle" && h === "Center") return "Center of viewport";
          if (v === "Middle") return `${h} side of viewport`;
          return `${v}-${h} of viewport`;
        }
        function findSpatialLandmarks(clientX, clientY) {
          const candidates = document.querySelectorAll(
            'h1, h2, h3, h4, h5, h6, button, a, input, select, textarea, img, label, summary, [role="button"], [role="tab"], [data-testid], p, li'
          );
          const scored = [];
          for (const el of candidates) {
            if (el.id === "ai-feedback-loop-host" || el.closest("#ai-feedback-loop-host")) continue;
            if (!isElementCurrentlyVisible(el)) continue;
            const rect = el.getBoundingClientRect();
            if (rect.width < 4 || rect.height < 4) continue;
            const dx = clientX < rect.left ? rect.left - clientX : clientX > rect.right ? clientX - rect.right : 0;
            const dy = clientY < rect.top ? rect.top - clientY : clientY > rect.bottom ? clientY - rect.bottom : 0;
            const dist = Math.round(Math.hypot(dx, dy));
            if (dist > 360) continue;
            const text2 = extractElementText(el);
            const label = buildShortElementLabel(el);
            if (!text2 && label === "div") continue;
            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;
            let relation = "Inside/Over";
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
              summary: `${relation} \`${label}\`${text2 ? ` ("${cleanText(text2, 45)}")` : ""}`
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
        function captureFreePinContext(clickEvent) {
          const scrollX = window.scrollX || window.pageXOffset || 0;
          const scrollY = window.scrollY || window.pageYOffset || 0;
          const vw = window.innerWidth || document.documentElement.clientWidth || 1;
          const vh = window.innerHeight || document.documentElement.clientHeight || 1;
          const clientX = clickEvent ? clickEvent.clientX : Math.round(vw / 2);
          const clientY = clickEvent ? clickEvent.clientY : Math.round(vh / 2);
          const pageX = Math.round(clientX + scrollX);
          const pageY = Math.round(clientY + scrollY);
          const pctX = Math.round(clientX / vw * 100);
          const pctY = Math.round(clientY / vh * 100);
          const region = describeViewportRegion(pctX, pctY);
          const underlyingEl = document.elementFromPoint(clientX, clientY) || document.body;
          const sectionHeading = findNearestHeading(underlyingEl);
          const { landmark } = extractNearbyContext(underlyingEl, "");
          const { landscape, matchedLandmark } = capturePageContentLandscape(underlyingEl, { clientX, clientY });
          const { uiState, activeScreenLabel } = extractInteractiveAndScreenContext(underlyingEl);
          const spatialLandmarks = findSpatialLandmarks(clientX, clientY);
          const underlyingContainer = landmark || (underlyingEl && underlyingEl !== document.body && underlyingEl !== document.documentElement ? buildRobustSelector(underlyingEl) : "page canvas");
          const placementNarrative = buildPlacementNarrative({
            isFreePin: true,
            shortLabel: `\u{1F4CD} Point (${pageX}, ${pageY})`,
            textSnippet: "",
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
          const routeKey = window.AIFLStorage ? window.AIFLStorage.getRouteKey() : `${window.location.pathname}${window.location.search}${window.location.hash}`;
          const screenLabel = activeScreenLabel ? `${routeKey} (${activeScreenLabel})` : sectionHeading ? `${routeKey} \u2014 ${sectionHeading}` : routeKey;
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
              pinType: "free",
              selector: `Free Coordinate (${pageX}, ${pageY})`,
              shortLabel: `\u{1F4CD} Point (${pageX}, ${pageY})`,
              tagName: "coordinate",
              region,
              underlyingContainer,
              landmarkRef: matchedLandmark || null,
              placementNarrative,
              sectionHeading,
              landmark: landmark || null,
              nearbyText: spatialLandmarks.join(" \u2022 "),
              spatialLandmarks,
              uiState,
              interactiveAncestors: [],
              styleSummary: "",
              pageCoords: { x: pageX, y: pageY },
              viewportPct: { x: pctX, y: pctY }
            }
          };
        }
        function isElementCurrentlyVisible(el) {
          if (!el || !el.isConnected) return false;
          if (el.closest("details:not([open])")) return false;
          const style = window.getComputedStyle(el);
          if (style.display === "none" || style.visibility === "hidden" || parseFloat(style.opacity) === 0) {
            return false;
          }
          const rect = el.getBoundingClientRect();
          if (rect.width < 2 && rect.height < 2) return false;
          return true;
        }
        function normalizeWhitespace(str) {
          return String(str || "").replace(/\s+/g, " ").trim().toLowerCase();
        }
        function queryContainerElements(containerStr) {
          if (!containerStr || typeof containerStr !== "string") return [];
          let raw = containerStr.trim();
          if (raw.startsWith("<") && raw.endsWith(">")) {
            raw = raw.slice(1, -1).trim();
          }
          if (!raw || raw === "page canvas") return [];
          const tryQuery = (sel) => {
            try {
              return Array.from(document.querySelectorAll(sel)).filter(
                (el) => el.id !== "ai-feedback-loop-host" && !el.closest("#ai-feedback-loop-host")
              );
            } catch {
              return [];
            }
          };
          let matches = tryQuery(raw);
          if (matches.length > 0) return matches;
          const hashIdx = raw.indexOf("#");
          const dotIdx = raw.indexOf(".");
          const tagEnd = Math.min(
            hashIdx === -1 ? raw.length : hashIdx,
            dotIdx === -1 ? raw.length : dotIdx
          );
          const tag = raw.slice(0, tagEnd).trim();
          const rest = raw.slice(tagEnd);
          let built = tag && /^[a-zA-Z0-9-]+$/.test(tag) ? tag : "";
          const tokens = rest.match(/[#.][^#.]+/g) || [];
          for (const tok of tokens) {
            const prefix = tok[0];
            const name = tok.slice(1).trim();
            if (!name) continue;
            if (prefix === "#") {
              built = `#${CSS.escape(name)}`;
              matches = tryQuery(built);
              if (matches.length > 0) return matches;
            } else {
              built += `.${CSS.escape(name)}`;
            }
          }
          return built ? tryQuery(built) : [];
        }
        function resolveLandmarkContainer(t) {
          if (!t) return null;
          const candidates = [t.landmarkRef?.container, t.landmark, t.underlyingContainer].filter(Boolean);
          for (const desc of candidates) {
            const els = queryContainerElements(desc);
            if (els.length === 1) return els[0];
            if (els.length > 1 && t.landmarkRef?.title) {
              const normTitle = normalizeWhitespace(t.landmarkRef.title);
              const titled = els.find(
                (el) => normalizeWhitespace(el.innerText || el.textContent).includes(normTitle)
              );
              if (titled) return titled;
              return els[0];
            }
            if (els.length > 0) return els[0];
          }
          return null;
        }
        function resolveTargetWithTier(comment) {
          if (!comment || !comment.target) return { tier: null, element: null };
          const t = comment.target;
          if (t.isFreePin || t.pinType === "free") return { tier: null, element: null };
          const notOwnUi = (el) => el && el.id !== "ai-feedback-loop-host" && !el.closest("#ai-feedback-loop-host");
          if (t.selector) {
            try {
              const matches = Array.from(document.querySelectorAll(t.selector)).filter(notOwnUi);
              if (matches.length === 1) return { tier: 1, element: matches[0] };
              if (matches.length > 1) {
                if (t.textSnippet) {
                  const normTarget = normalizeWhitespace(t.textSnippet);
                  const exact = matches.find((m) => normalizeWhitespace(extractElementText(m)) === normTarget);
                  if (exact) return { tier: 1, element: exact };
                }
                return { tier: 1, element: matches[0] };
              }
            } catch {
            }
          }
          if (t.id) {
            const byId = document.getElementById(t.id);
            if (notOwnUi(byId)) return { tier: 1, element: byId };
          }
          if (t.testId) {
            try {
              const attrSelector = t.tagName ? `${t.tagName}[${t.testId}]` : `[${t.testId}]`;
              const matches = Array.from(document.querySelectorAll(attrSelector)).filter(notOwnUi);
              if (matches.length > 0) return { tier: 1, element: matches[0] };
              const anyTagMatches = Array.from(document.querySelectorAll(`[${t.testId}]`)).filter(notOwnUi);
              if (anyTagMatches.length > 0) return { tier: 1, element: anyTagMatches[0] };
            } catch {
            }
          }
          const rawSnippet = t.textSnippet ? String(t.textSnippet).replace(/…$/, "") : "";
          const normSnippet = normalizeWhitespace(rawSnippet);
          const rawClicked = t.clickedPhrase ? String(t.clickedPhrase).replace(/^…|…$/g, "") : "";
          const normClicked = normalizeWhitespace(rawClicked);
          if (normSnippet || normClicked) {
            const landmarkRoot = resolveLandmarkContainer(t);
            const searchRoots = landmarkRoot ? [landmarkRoot, document] : [document];
            const tagSelector = t.tagName && /^[a-zA-Z0-9-]+$/.test(t.tagName) ? t.tagName : "*";
            for (const root of searchRoots) {
              let candidates = [];
              try {
                candidates = Array.from(root.querySelectorAll(tagSelector)).filter(notOwnUi);
              } catch {
                candidates = [];
              }
              if (normSnippet) {
                const exactMatch = candidates.find((c) => {
                  const cNorm = normalizeWhitespace(extractElementText(c));
                  if (!cNorm) return false;
                  return cNorm === normSnippet || t.textSnippet.endsWith("\u2026") && normSnippet.length >= 10 && cNorm.startsWith(normSnippet);
                });
                if (exactMatch) return { tier: 2, element: exactMatch };
              }
              if (normClicked && normClicked.length >= 4) {
                const phraseMatch = candidates.find((c) => {
                  const cNorm = normalizeWhitespace(extractElementText(c));
                  return cNorm && cNorm.includes(normClicked);
                });
                if (phraseMatch) return { tier: 2, element: phraseMatch };
              }
            }
          }
          return { tier: null, element: null };
        }
        function resolveTargetElement(comment) {
          return resolveTargetWithTier(comment).element;
        }
        function resolvePinAnchor(comment) {
          if (!comment || !comment.target) {
            return { tier: 3, element: null, containerElement: null, x: 100, y: 100, hiddenByAncestor: false };
          }
          const t = comment.target;
          const scrollX = window.scrollX || window.pageXOffset || 0;
          const scrollY = window.scrollY || window.pageYOffset || 0;
          if (t.isFreePin || t.pinType === "free") {
            const pageX = t.pageCoords?.x ?? 100;
            const pageY = t.pageCoords?.y ?? 100;
            return {
              tier: "free",
              element: null,
              containerElement: resolveLandmarkContainer(t),
              x: pageX - scrollX,
              y: pageY - scrollY,
              hiddenByAncestor: false
            };
          }
          const { tier, element: element2 } = resolveTargetWithTier(comment);
          if (element2) {
            if (!isElementCurrentlyVisible(element2)) {
              return {
                tier,
                element: element2,
                containerElement: null,
                x: null,
                y: null,
                hiddenByAncestor: true
              };
            }
            const rect = element2.getBoundingClientRect();
            const ratioX = t.offsetRatio?.x ?? 0.5;
            const ratioY = t.offsetRatio?.y ?? 0.5;
            const customDx = t.pinOffset?.dx ?? 0;
            const customDy = t.pinOffset?.dy ?? 0;
            return {
              tier,
              element: element2,
              containerElement: null,
              x: rect.left + rect.width * ratioX + customDx,
              y: rect.top + rect.height * ratioY + customDy,
              hiddenByAncestor: false
            };
          }
          const hasInteractiveAncestors = Array.isArray(t.interactiveAncestors) && t.interactiveAncestors.length > 0;
          if (hasInteractiveAncestors) {
            return {
              tier: 3,
              element: null,
              containerElement: null,
              x: null,
              y: null,
              hiddenByAncestor: true
            };
          }
          const containerElement = resolveLandmarkContainer(t);
          if (t.pageCoords && Number.isFinite(t.pageCoords.x) && Number.isFinite(t.pageCoords.y)) {
            return {
              tier: 3,
              element: null,
              containerElement: containerElement && isElementCurrentlyVisible(containerElement) ? containerElement : null,
              x: t.pageCoords.x - scrollX,
              y: t.pageCoords.y - scrollY,
              hiddenByAncestor: false
            };
          }
          if (containerElement && isElementCurrentlyVisible(containerElement)) {
            const rect = containerElement.getBoundingClientRect();
            return {
              tier: 3,
              element: null,
              containerElement,
              x: rect.left + rect.width * (t.offsetRatio?.x ?? 0.5),
              y: rect.top + rect.height * (t.offsetRatio?.y ?? 0.5),
              hiddenByAncestor: false
            };
          }
          return {
            tier: 3,
            element: null,
            containerElement: null,
            x: 100 - scrollX,
            y: 100 - scrollY,
            hiddenByAncestor: false
          };
        }
        function tryRevealTargetElement(comment) {
          const ancestors = comment?.target?.interactiveAncestors || [];
          for (const anc of ancestors) {
            try {
              if (anc.type === "details" && anc.selector) {
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
            }
          }
          return resolveTargetElement(comment);
        }
        function generateAIPrompt(comments, options = {}) {
          const mode = options.mode || "standard";
          const list = Array.isArray(comments) ? comments : [];
          if (list.length === 0) {
            return "No comments recorded yet.";
          }
          const currentRoute = window.AIFLStorage ? window.AIFLStorage.getRouteKey() : window.location.pathname;
          const liveLandscapeResult = capturePageContentLandscape(null);
          const groups = /* @__PURE__ */ new Map();
          for (const c of list) {
            const screenKey = c.screen?.activeScreenLabel ? `${c.screen.routeKey} (${c.screen.activeScreenLabel})` : c.screen?.routeKey || "/";
            if (!groups.has(screenKey)) {
              const isCurrentRoute = c.screen?.routeKey === currentRoute;
              const savedLandscape = Array.isArray(c.screen?.landscape) && c.screen.landscape.length > 0 ? c.screen.landscape : isCurrentRoute ? liveLandscapeResult.landscape : [];
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
          const pageTitle = document.title || window.location.hostname || "Web Page";
          lines.push(`# UI & Content Feedback \u2014 ${pageTitle}`);
          lines.push(
            `Please implement the following ${list.length} requested change${list.length === 1 ? "" : "s"}. Below is the page content landscape (landmarks \`[L1]\`..\`[Ln]\` of visible custom writing, headings, images, and controls) followed by each pin's placement narrative and DOM locator.`
          );
          lines.push("");
          for (const [, group] of groups) {
            const vp = group.viewport ? ` (Viewport: ${group.viewport.width}\xD7${group.viewport.height})` : "";
            lines.push(`## Screen: \`${group.screenKey}\`${vp}`);
            if (Array.isArray(group.landscape) && group.landscape.length > 0) {
              lines.push("### Page Content Landscape (Top-to-Bottom Visual Map)");
              for (const lm of group.landscape) {
                lines.push(`- **[${lm.id}] \`${lm.container}\`**: ${lm.summary}`);
              }
              lines.push("");
            } else {
              lines.push("");
            }
            for (const item of group.items) {
              const t = item.target || {};
              const commentText = item.text || "(No comment text provided)";
              const isFree = Boolean(t.isFreePin || t.pinType === "free");
              const lmBadge = t.landmarkRef?.id ? ` (Ref: [${t.landmarkRef.id}] \`${t.landmarkRef.container}\`)` : "";
              const statusTag = item.status ? `[${String(item.status).toUpperCase()}] ` : "";
              const authorObj = item.author || { name: "Host", role: "host" };
              lines.push(`### Pin #${item.number} ${statusTag}${lmBadge}: ${commentText}`);
              lines.push(`- **Author**: ${authorObj.name} (${authorObj.role}) \u2022 **Pin ID**: \`${item.id}\``);
              if (t.placementNarrative) {
                lines.push(`- **Placement Summary**: User wants "${commentText}". ${t.placementNarrative}`);
              }
              if (isFree) {
                const regionStr = t.region ? ` \u2014 ${t.region}` : "";
                const pctStr = t.viewportPct ? ` (~${t.viewportPct.x}% X, ${t.viewportPct.y}% Y of viewport${regionStr})` : "";
                lines.push(
                  `- **Coordinates**: Arbitrary / Free-Drop Pin at \`(${t.pageCoords?.x ?? 0}, ${t.pageCoords?.y ?? 0})\`${pctStr}`
                );
                if (t.underlyingContainer || t.sectionHeading) {
                  const areaParts = [];
                  if (t.sectionHeading) areaParts.push(`Section: "${t.sectionHeading}"`);
                  if (t.underlyingContainer) areaParts.push(`Underlying Container: \`${t.underlyingContainer}\``);
                  lines.push(`- **Page Area**: ${areaParts.join(" \u2022 ")}`);
                }
                if (Array.isArray(t.spatialLandmarks) && t.spatialLandmarks.length > 0) {
                  lines.push(`- **Nearest Visual Landmarks**: ${t.spatialLandmarks.join(" \u2022 ")}`);
                } else if (t.nearbyText) {
                  lines.push(`- **Nearest Visual Landmarks**: ${t.nearbyText}`);
                }
                if (Array.isArray(t.uiState) && t.uiState.length > 0) {
                  lines.push(`- **Interactive State**: ${t.uiState.join(" \u2192 ")}`);
                }
              } else {
                lines.push(`- **DOM Target**: \`<${t.shortLabel || t.tagName || "element"}>\` \u2014 Selector: \`${t.selector || "unknown"}\``);
                if (t.textSnippet) {
                  const clickedPart = t.clickedPhrase ? ` (Clicked near phrase: "${t.clickedPhrase}")` : "";
                  lines.push(`- **Content at Target**: "${t.textSnippet}"${clickedPart}`);
                }
                const siblingParts = [];
                if (t.prevSiblingDesc) siblingParts.push(`Follows sibling: ${t.prevSiblingDesc}`);
                if (t.nextSiblingDesc) siblingParts.push(`Precedes sibling: ${t.nextSiblingDesc}`);
                if (siblingParts.length > 0) {
                  lines.push(`- **Adjacent Siblings**: ${siblingParts.join(" \u2022 ")}`);
                } else {
                  const contextParts = [];
                  if (t.sectionHeading) contextParts.push(`Section: "${t.sectionHeading}"`);
                  if (t.landmark) contextParts.push(`Container: \`${t.landmark}\``);
                  if (t.nearbyText) contextParts.push(t.nearbyText);
                  if (contextParts.length > 0) {
                    lines.push(`- **Nearby Context**: ${contextParts.join(" \u2022 ")}`);
                  }
                }
                if (Array.isArray(t.uiState) && t.uiState.length > 0) {
                  lines.push(`- **Interactive State**: ${t.uiState.join(" \u2192 ")}`);
                }
                if (t.pageCoords) {
                  const box = t.elementRect ? `, box \`${t.elementRect.width}\xD7${t.elementRect.height}px\`` : "";
                  const pct = t.viewportPct ? ` (~${t.viewportPct.x}% X, ${t.viewportPct.y}% Y of viewport${t.region ? `, ${t.region}` : ""})` : "";
                  lines.push(`- **Location**: \`(${t.pageCoords.x}, ${t.pageCoords.y})\`${pct}${box}`);
                }
                if (mode === "standard" && t.styleSummary) {
                  lines.push(`- **Computed Styles**: \`${t.styleSummary}\``);
                }
              }
              if (Array.isArray(item.replies) && item.replies.length > 0) {
                lines.push("- **Discussion Thread**:");
                for (const r of item.replies) {
                  lines.push(`  - **${r.authorName}** (${r.role}): ${r.text}`);
                }
              }
              lines.push("");
            }
          }
          return lines.join("\n").trim();
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
          resolveTargetWithTier,
          resolveTargetElement,
          resolvePinAnchor,
          tryRevealTargetElement,
          generateAIPrompt
        };
      })();
    }
  });

  // content/content.js
  var require_content = __commonJS({
    "content/content.js"() {
      (() => {
        const isGuestMode = Boolean(window.__AIFL_GUEST_MODE__);
        const hasExtensionRuntime = typeof chrome !== "undefined" && Boolean(chrome.runtime?.id);
        if (!isGuestMode && hasExtensionRuntime) {
          document.documentElement.dataset.aiflExtensionActive = "1";
          document.dispatchEvent(new CustomEvent("aifl:extension-active"));
          const staleGuestHost = document.querySelector('#ai-feedback-loop-host[data-aifl-mode="guest"]');
          if (staleGuestHost) {
            staleGuestHost.remove();
          }
        } else if (isGuestMode && document.documentElement?.dataset?.aiflExtensionActive === "1") {
          return;
        }
        if (window.__AIFeedbackLoopLoaded) return;
        window.__AIFeedbackLoopLoaded = true;
        const state = {
          mounted: false,
          tornDown: false,
          toolbarVisible: false,
          inspecting: false,
          pinDropMode: "element",
          // 'element' | 'free'
          ctrlHeld: false,
          lastMousePos: { x: 0, y: 0 },
          drawerOpen: false,
          connectPopoverOpen: false,
          comments: [],
          focusedCommentId: null,
          pendingPin: null,
          // { mode, element, context, clientX, clientY, commentId }
          filterScope: "all",
          // 'all' | 'screen'
          statusFilter: "all",
          // 'all' | 'pending' | 'approved' | 'resolved'
          showResolvedPins: false,
          promptMode: "standard",
          // 'standard' | 'compact'
          selectedPinIds: /* @__PURE__ */ new Set(),
          confirmingClearToolbar: false,
          confirmingClearDrawer: false,
          hoveredElement: null,
          lastRouteKey: window.AIFLStorage ? window.AIFLStorage.getRouteKey() : "/"
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
        const elementCache = /* @__PURE__ */ new Map();
        const peerCursors = /* @__PURE__ */ new Map();
        const replyDrafts = /* @__PURE__ */ new Map();
        const unsubscribes = [];
        function getSession() {
          return window.AIFLStorage ? window.AIFLStorage.getSessionState() : {
            connected: false,
            connecting: false,
            mode: "standalone",
            role: "standalone",
            author: { id: "host_local", name: "Host", role: "host", color: "#6366f1" },
            peers: [],
            serverUrl: "",
            guestName: "",
            hasHostToken: false,
            lastError: null
          };
        }
        function teardownGuestOverlay() {
          if (!isGuestMode || state.tornDown) return;
          state.tornDown = true;
          try {
            window.AIFLStorage?.disconnectLiveSession();
          } catch {
          }
          if (mutationObserver) {
            mutationObserver.disconnect();
            mutationObserver = null;
          }
          clearInterval(cursorCleanupTimer);
          clearTimeout(hmrReanchorTimer);
          unsubscribes.forEach((fn) => fn());
          unsubscribes.length = 0;
          window.removeEventListener("mousemove", onPageMouseMove, true);
          window.removeEventListener("click", onPageClick, true);
          window.removeEventListener("keydown", onPageKeyDown, true);
          window.removeEventListener("keyup", onPageKeyUp, true);
          window.removeEventListener("scroll", schedulePinPositionUpdate, true);
          window.removeEventListener("resize", schedulePinPositionUpdate, true);
          window.removeEventListener("hashchange", onRouteOrDomChange);
          window.removeEventListener("popstate", onRouteOrDomChange);
          if (hostEl && hostEl.parentNode) {
            hostEl.remove();
          }
          state.mounted = false;
        }
        if (isGuestMode) {
          document.addEventListener("aifl:extension-active", teardownGuestOverlay, { once: true });
        }
        async function loadStylesText() {
          if (typeof window.__AIFL_INLINE_CSS__ === "string" && window.__AIFL_INLINE_CSS__.length > 0) {
            return window.__AIFL_INLINE_CSS__;
          }
          if (typeof chrome !== "undefined" && chrome.runtime && typeof chrome.runtime.getURL === "function") {
            try {
              const cssUrl = chrome.runtime.getURL("content/styles.css");
              const res = await fetch(cssUrl);
              if (res.ok) return await res.text();
            } catch (err) {
              console.warn("AI Feedback Loop: Could not fetch extension styles.css", err);
            }
          }
          try {
            const res = await fetch("/__collab/styles.css");
            if (res.ok) return await res.text();
          } catch (err) {
            console.warn("AI Feedback Loop: Could not fetch /__collab/styles.css", err);
          }
          return "";
        }
        async function ensureMounted() {
          if (state.tornDown) return;
          if (state.mounted && hostEl && document.documentElement.contains(hostEl)) {
            return;
          }
          hostEl = document.createElement("div");
          hostEl.id = "ai-feedback-loop-host";
          hostEl.dataset.aiflMode = isGuestMode ? "guest" : "host";
          hostEl.style.cssText = "all: initial !important; position: fixed !important; inset: 0 !important; pointer-events: none !important; z-index: 2147483640 !important;";
          shadowRoot = hostEl.attachShadow({ mode: "open" });
          if (document.head && !document.getElementById("aifl-font-inter")) {
            const fontLink = document.createElement("link");
            fontLink.id = "aifl-font-inter";
            fontLink.rel = "stylesheet";
            fontLink.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap";
            document.head.appendChild(fontLink);
          }
          const cssText = await loadStylesText();
          if (state.tornDown) return;
          const styleEl = document.createElement("style");
          styleEl.textContent = cssText;
          shadowRoot.appendChild(styleEl);
          const container = document.createElement("div");
          container.className = "aifl-layer";
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
          <button class="aifl-popover-close" id="aifl-popover-close" title="Close (ESC)">\xD7</button>
        </div>
        <textarea
          class="aifl-popover-textarea"
          id="aifl-popover-textarea"
          placeholder="What should the AI agent change here? (e.g. 'Increase font size to 20px', 'Add Spanish translation')"
        ></textarea>
        <div class="aifl-popover-footer">
          <span class="aifl-popover-hint">Ctrl/\u2318 + Enter to save</span>
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
          <button class="aifl-popover-close" id="aifl-connect-close" title="Close">\xD7</button>
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

        <button class="aifl-btn aifl-btn-icon" id="aifl-btn-close" title="Hide floating controls (Alt+Shift+F)">\u2715</button>

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
            <button class="aifl-btn aifl-btn-icon" id="aifl-drawer-close" title="Close drawer">\u2715</button>
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
            <button class="aifl-btn aifl-btn-sm" id="aifl-batch-copy">Copy Selected</button>
            <button class="aifl-btn aifl-btn-primary aifl-btn-sm" id="aifl-batch-run">Run Agent on Selected</button>
          </div>
        </div>

        <div class="aifl-drawer-body" id="aifl-drawer-body"></div>

        <div class="aifl-drawer-footer">
          <details class="aifl-preview-details" id="aifl-preview-details">
            <summary class="aifl-preview-summary">
              <span>Preview Generated AI Agent Prompt</span>
              <span style="font-size: 10px; color: #818cf8;">Markdown \u25BE</span>
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
            cursorsContainer: shadowRoot.getElementById("aifl-cursors-container"),
            hoverBox: shadowRoot.getElementById("aifl-hover-box"),
            hoverLabel: shadowRoot.getElementById("aifl-hover-label"),
            freeCursor: shadowRoot.getElementById("aifl-free-cursor"),
            danglingNum: shadowRoot.getElementById("aifl-dangling-num"),
            freeLabel: shadowRoot.getElementById("aifl-free-label"),
            focusBox: shadowRoot.getElementById("aifl-focus-box"),
            pinsContainer: shadowRoot.getElementById("aifl-pins-container"),
            popover: shadowRoot.getElementById("aifl-popover"),
            popoverHeader: shadowRoot.getElementById("aifl-popover-header"),
            popoverBadge: shadowRoot.getElementById("aifl-popover-badge"),
            popoverTarget: shadowRoot.getElementById("aifl-popover-target"),
            popoverClose: shadowRoot.getElementById("aifl-popover-close"),
            popoverTextarea: shadowRoot.getElementById("aifl-popover-textarea"),
            popoverCancel: shadowRoot.getElementById("aifl-popover-cancel"),
            popoverSave: shadowRoot.getElementById("aifl-popover-save"),
            popoverGripper: shadowRoot.getElementById("aifl-popover-gripper"),
            connectPopover: shadowRoot.getElementById("aifl-connect-popover"),
            connectClose: shadowRoot.getElementById("aifl-connect-close"),
            connectStatusText: shadowRoot.getElementById("aifl-connect-status-text"),
            peersList: shadowRoot.getElementById("aifl-peers-list"),
            nameInput: shadowRoot.getElementById("aifl-name-input"),
            nameSave: shadowRoot.getElementById("aifl-name-save"),
            manualConnectGroup: shadowRoot.getElementById("aifl-manual-connect-group"),
            serverUrlInput: shadowRoot.getElementById("aifl-server-url-input"),
            hostTokenInput: shadowRoot.getElementById("aifl-host-token-input"),
            connectBtn: shadowRoot.getElementById("aifl-connect-btn"),
            disconnectBtn: shadowRoot.getElementById("aifl-disconnect-btn"),
            toolbar: shadowRoot.getElementById("aifl-toolbar"),
            dragHandle: shadowRoot.getElementById("aifl-drag-handle"),
            toolbarGripper: shadowRoot.getElementById("aifl-toolbar-gripper"),
            livePill: shadowRoot.getElementById("aifl-live-pill"),
            livePillLabel: shadowRoot.getElementById("aifl-live-pill-label"),
            btnAdd: shadowRoot.getElementById("aifl-btn-add"),
            btnAddLabel: shadowRoot.getElementById("aifl-btn-add-label"),
            btnDrawer: shadowRoot.getElementById("aifl-btn-drawer"),
            toolbarCount: shadowRoot.getElementById("aifl-toolbar-count"),
            btnShowResolved: shadowRoot.getElementById("aifl-btn-show-resolved"),
            btnCopy: shadowRoot.getElementById("aifl-btn-copy"),
            btnCopyLabel: shadowRoot.getElementById("aifl-btn-copy-label"),
            btnClear: shadowRoot.getElementById("aifl-btn-clear"),
            btnClearLabel: shadowRoot.getElementById("aifl-btn-clear-label"),
            btnClose: shadowRoot.getElementById("aifl-btn-close"),
            drawer: shadowRoot.getElementById("aifl-drawer"),
            drawerCount: shadowRoot.getElementById("aifl-drawer-count"),
            drawerClose: shadowRoot.getElementById("aifl-drawer-close"),
            tabAll: shadowRoot.getElementById("aifl-tab-all"),
            tabScreen: shadowRoot.getElementById("aifl-tab-screen"),
            modeStandard: shadowRoot.getElementById("aifl-mode-standard"),
            modeCompact: shadowRoot.getElementById("aifl-mode-compact"),
            statusAll: shadowRoot.getElementById("aifl-status-all"),
            statusPending: shadowRoot.getElementById("aifl-status-pending"),
            statusApproved: shadowRoot.getElementById("aifl-status-approved"),
            statusResolved: shadowRoot.getElementById("aifl-status-resolved"),
            batchBar: shadowRoot.getElementById("aifl-batch-bar"),
            selectPendingBtn: shadowRoot.getElementById("aifl-select-pending"),
            selectedCountEl: shadowRoot.getElementById("aifl-selected-count"),
            batchCopyBtn: shadowRoot.getElementById("aifl-batch-copy"),
            batchRunBtn: shadowRoot.getElementById("aifl-batch-run"),
            drawerBody: shadowRoot.getElementById("aifl-drawer-body"),
            previewPre: shadowRoot.getElementById("aifl-preview-pre"),
            drawerCopy: shadowRoot.getElementById("aifl-drawer-copy"),
            drawerExportMd: shadowRoot.getElementById("aifl-drawer-export-md"),
            drawerClear: shadowRoot.getElementById("aifl-drawer-clear"),
            toast: shadowRoot.getElementById("aifl-toast")
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
        function bindUIEvents() {
          setupFloatingDrag([ui.dragHandle, ui.toolbarGripper], ui.toolbar);
          setupFloatingDrag([ui.popoverGripper, ui.popoverHeader], ui.popover);
          ui.livePill.addEventListener("click", () => {
            setConnectPopoverOpen(!state.connectPopoverOpen);
          });
          ui.connectClose.addEventListener("click", () => setConnectPopoverOpen(false));
          [ui.nameInput, ui.serverUrlInput, ui.hostTokenInput].forEach((input) => {
            input.addEventListener("keydown", (e) => {
              e.stopPropagation();
              if (e.key === "Escape") {
                setConnectPopoverOpen(false);
              } else if (e.key === "Enter" && input === ui.nameInput) {
                saveDisplayName();
              }
            });
          });
          ui.nameSave.addEventListener("click", saveDisplayName);
          ui.connectBtn.addEventListener("click", async () => {
            const serverUrl = ui.serverUrlInput.value.trim() || "http://127.0.0.1:4173";
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
              showToast("Could not connect to collab server");
            }
          });
          ui.disconnectBtn.addEventListener("click", async () => {
            window.AIFLStorage.disconnectLiveSession();
            state.comments = await window.AIFLStorage.loadComments();
            peerCursors.clear();
            renderPeerCursors();
            renderAll();
            showToast("Switched to local mode");
          });
          ui.btnAdd.addEventListener("click", () => {
            setInspecting(!state.inspecting);
          });
          ui.btnDrawer.addEventListener("click", () => {
            setDrawerOpen(!state.drawerOpen);
          });
          ui.btnShowResolved.addEventListener("click", () => {
            state.showResolvedPins = !state.showResolvedPins;
            ui.btnShowResolved.classList.toggle("active", state.showResolvedPins);
            ui.btnShowResolved.setAttribute("aria-pressed", String(state.showResolvedPins));
            renderPins();
          });
          ui.btnCopy.addEventListener("click", () => {
            copyPromptToClipboard(getVisibleScopeComments());
          });
          ui.btnClear.addEventListener("click", async () => {
            if (state.comments.length === 0) {
              showToast("No comments to clear");
              return;
            }
            if (!state.confirmingClearToolbar) {
              state.confirmingClearToolbar = true;
              ui.btnClear.classList.add("aifl-btn-confirm");
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
          ui.btnClose.addEventListener("click", () => {
            setInspecting(false);
            closePopover();
            setConnectPopoverOpen(false);
            setDrawerOpen(false);
            setToolbarVisible(false);
          });
          ui.popoverClose.addEventListener("click", closePopover);
          ui.popoverCancel.addEventListener("click", closePopover);
          ui.popoverSave.addEventListener("click", savePendingPin);
          ui.popoverTextarea.addEventListener("keydown", (e) => {
            e.stopPropagation();
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              savePendingPin();
            } else if (e.key === "Escape") {
              e.preventDefault();
              closePopover();
            }
          });
          ui.drawerClose.addEventListener("click", () => setDrawerOpen(false));
          ui.tabAll.addEventListener("click", () => {
            state.filterScope = "all";
            renderDrawer();
          });
          ui.tabScreen.addEventListener("click", () => {
            state.filterScope = "screen";
            renderDrawer();
          });
          ui.modeStandard.addEventListener("click", () => {
            state.promptMode = "standard";
            renderDrawer();
          });
          ui.modeCompact.addEventListener("click", () => {
            state.promptMode = "compact";
            renderDrawer();
          });
          [ui.statusAll, ui.statusPending, ui.statusApproved, ui.statusResolved].forEach((btn) => {
            btn.addEventListener("click", () => {
              state.statusFilter = btn.dataset.status || "all";
              renderDrawer();
            });
          });
          ui.selectPendingBtn.addEventListener("click", () => {
            const visiblePending = getFilteredComments().filter((c) => (c.status || "pending") === "pending");
            if (visiblePending.length === 0) {
              showToast("No pending pins in current view");
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
          ui.batchCopyBtn.addEventListener("click", () => {
            const filtered = getFilteredComments();
            const checked = filtered.filter((c) => state.selectedPinIds.has(c.id));
            const targets = checked.length > 0 ? checked : filtered;
            copyPromptToClipboard(targets);
          });
          ui.batchRunBtn.addEventListener("click", handleRunAgentOnSelected);
          ui.drawerCopy.addEventListener("click", () => {
            copyPromptToClipboard(getFilteredComments());
          });
          ui.drawerExportMd.addEventListener("click", () => {
            downloadPromptMarkdown(getFilteredComments());
          });
          ui.drawerClear.addEventListener("click", async () => {
            if (state.comments.length === 0) {
              showToast("No comments to clear");
              return;
            }
            if (!state.confirmingClearDrawer) {
              state.confirmingClearDrawer = true;
              ui.drawerClear.classList.add("aifl-btn-confirm");
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
          window.addEventListener("mousemove", onPageMouseMove, true);
          window.addEventListener("click", onPageClick, true);
          window.addEventListener("keydown", onPageKeyDown, true);
          window.addEventListener("keyup", onPageKeyUp, true);
          window.addEventListener("blur", () => {
            if (state.ctrlHeld) {
              state.ctrlHeld = false;
              updateModeIndicator();
              if (state.inspecting) refreshInspectOverlay();
            }
          });
          window.addEventListener("scroll", schedulePinPositionUpdate, true);
          window.addEventListener("resize", schedulePinPositionUpdate, true);
          window.addEventListener("hashchange", onRouteOrDomChange);
          window.addEventListener("popstate", onRouteOrDomChange);
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
            attributeFilter: ["open", "class", "style", "aria-expanded", "aria-selected", "hidden", "data-state"]
          });
          cursorCleanupTimer = setInterval(() => {
            if (peerCursors.size > 0) {
              renderPeerCursors();
            }
          }, 1e3);
          if (typeof chrome !== "undefined" && chrome.storage?.onChanged) {
            chrome.storage.onChanged.addListener((changes, area) => {
              if (area === "local" && getSession().mode === "standalone") {
                const key = window.AIFLStorage.getSiteKey();
                if (changes[key]) {
                  state.comments = window.AIFLStorage.normalizePins ? changes[key].newValue || [] : Array.isArray(changes[key].newValue) ? changes[key].newValue : [];
                  elementCache.clear();
                  renderAll();
                }
              }
            });
          }
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
                if (event?.type === "cursor_move" && event.clientId) {
                  const selfId = getSession().author?.id;
                  if (event.clientId !== selfId) {
                    peerCursors.set(event.clientId, {
                      clientId: event.clientId,
                      author: event.author || { name: "Peer", color: "#10b981", role: "guest" },
                      cursor: event.cursor || {},
                      updatedAt: Date.now()
                    });
                  }
                }
                renderPeerCursors();
                renderLiveStatus();
              }),
              window.AIFLStorage.onSessionError((err) => {
                showToast(err?.message || "Action denied by server");
              }),
              window.AIFLStorage.onSessionStateChange(() => {
                renderLiveStatus();
                if (state.drawerOpen) {
                  renderDrawer();
                }
              })
            );
          }
        }
        function saveDisplayName() {
          const nextName = ui.nameInput.value.trim();
          if (!nextName) {
            showToast("Enter a display name");
            return;
          }
          window.AIFLStorage.setAuthorName(nextName);
          renderLiveStatus();
          showToast(`Display name set to "${nextName}"`);
        }
        function setConnectPopoverOpen(open) {
          state.connectPopoverOpen = open;
          if (!ui.connectPopover) return;
          ui.connectPopover.classList.toggle("visible", open);
          if (open) {
            const session = getSession();
            ui.nameInput.value = session.author?.name || "";
            if (!ui.serverUrlInput.value) {
              ui.serverUrlInput.value = session.serverUrl || "http://127.0.0.1:4173";
            }
            renderLiveStatus();
          }
        }
        function renderLiveStatus() {
          if (!state.mounted || !ui.livePill) return;
          const session = getSession();
          const isGuest = session.role === "guest";
          if (ui.btnClear) ui.btnClear.style.display = isGuest ? "none" : "";
          if (ui.drawerClear) ui.drawerClear.style.display = isGuest ? "none" : "";
          if (ui.batchBar) ui.batchBar.classList.toggle("hidden", isGuest);
          if (ui.manualConnectGroup) ui.manualConnectGroup.style.display = isGuestMode ? "none" : "flex";
          if (ui.disconnectBtn) {
            ui.disconnectBtn.style.display = !isGuestMode && session.mode === "live" ? "" : "none";
          }
          const peerCount = session.peers.length;
          if (session.connected) {
            ui.livePill.classList.add("is-live");
            ui.livePill.classList.remove("is-connecting");
            if (session.role === "host") {
              ui.livePillLabel.textContent = peerCount > 1 ? `Host \u2022 ${peerCount} live` : "Host \u2022 Live";
            } else {
              ui.livePillLabel.textContent = peerCount > 1 ? `${session.author.name} \u2022 ${peerCount} live` : `${session.author.name} \u2022 Live`;
            }
            if (ui.connectStatusText) {
              ui.connectStatusText.textContent = `Connected as ${session.role.toUpperCase()} (${session.author.name}) \u2022 ${peerCount} active`;
            }
          } else if (session.connecting) {
            ui.livePill.classList.remove("is-live");
            ui.livePill.classList.add("is-connecting");
            ui.livePillLabel.textContent = "Connecting\u2026";
            if (ui.connectStatusText) {
              ui.connectStatusText.textContent = `Connecting to ${session.serverUrl || "collab server"}\u2026`;
            }
          } else {
            ui.livePill.classList.remove("is-live", "is-connecting");
            ui.livePillLabel.textContent = isGuest ? "Guest (Offline)" : "Local";
            if (ui.connectStatusText) {
              ui.connectStatusText.textContent = isGuest ? "Waiting to reconnect to live collab session\u2026" : "Standalone local storage mode";
            }
          }
          if (ui.peersList) {
            ui.peersList.innerHTML = "";
            for (const peer of session.peers) {
              const chip = document.createElement("span");
              chip.className = "aifl-peer-chip";
              chip.innerHTML = `<span class="aifl-peer-dot" style="background: ${escapeHtml(peer.color || "#10b981")};"></span><span>${escapeHtml(peer.name || "Peer")} (${escapeHtml(peer.role || "guest")})</span>`;
              ui.peersList.appendChild(chip);
            }
          }
        }
        function renderPeerCursors() {
          if (!ui.cursorsContainer) return;
          if (!state.toolbarVisible && !getSession().connected) {
            ui.cursorsContainer.innerHTML = "";
            return;
          }
          const currentRoute = window.AIFLStorage.getRouteKey();
          const now = Date.now();
          const scrollX = window.scrollX || window.pageXOffset || 0;
          const scrollY = window.scrollY || window.pageYOffset || 0;
          for (const [cid, entry] of peerCursors.entries()) {
            if (now - entry.updatedAt > 12e3) {
              peerCursors.delete(cid);
            }
          }
          const activeIds = /* @__PURE__ */ new Set();
          for (const [cid, entry] of peerCursors.entries()) {
            const c = entry.cursor || {};
            if (c.routeKey && c.routeKey !== currentRoute) continue;
            const left = Number.isFinite(c.pageX) ? c.pageX - scrollX : c.clientX;
            const top = Number.isFinite(c.pageY) ? c.pageY - scrollY : c.clientY;
            if (!Number.isFinite(left) || !Number.isFinite(top)) continue;
            activeIds.add(cid);
            let cursorEl = ui.cursorsContainer.querySelector(`[data-peer-id="${CSS.escape(cid)}"]`);
            if (!cursorEl) {
              cursorEl = document.createElement("div");
              cursorEl.className = "aifl-peer-cursor";
              cursorEl.dataset.peerId = cid;
              const color = entry.author?.color || "#10b981";
              const name = entry.author?.name || "Guest";
              cursorEl.innerHTML = `
          <svg class="aifl-peer-cursor-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M5 3L19 12L12 14L9 21L5 3Z" fill="${escapeHtml(color)}" stroke="#ffffff" stroke-width="1.6" stroke-linejoin="round"/>
          </svg>
          <span class="aifl-peer-cursor-pill" style="background: ${escapeHtml(color)};">${escapeHtml(name)}</span>
        `;
              ui.cursorsContainer.appendChild(cursorEl);
            } else {
              const pill = cursorEl.querySelector(".aifl-peer-cursor-pill");
              if (pill && entry.author?.name) {
                pill.textContent = entry.author.name;
              }
            }
            cursorEl.style.left = `${Math.round(left)}px`;
            cursorEl.style.top = `${Math.round(top)}px`;
            cursorEl.classList.toggle("stale", now - entry.updatedAt > 5e3);
          }
          ui.cursorsContainer.querySelectorAll(".aifl-peer-cursor").forEach((el) => {
            if (!activeIds.has(el.dataset.peerId)) {
              el.remove();
            }
          });
        }
        function resetClearConfirmState() {
          state.confirmingClearToolbar = false;
          state.confirmingClearDrawer = false;
          if (ui.btnClear) {
            ui.btnClear.classList.remove("aifl-btn-confirm");
            ui.btnClearLabel.textContent = "Clear";
          }
          if (ui.drawerClear) {
            ui.drawerClear.classList.remove("aifl-btn-confirm");
            ui.drawerClear.textContent = "Clear All Comments";
          }
        }
        async function handleClearAll() {
          state.comments = await window.AIFLStorage.clearComments("all");
          state.focusedCommentId = null;
          state.selectedPinIds.clear();
          elementCache.clear();
          ui.focusBox.classList.remove("visible");
          renderAll();
          showToast("Cleared all comments");
        }
        async function handleRunAgentOnSelected() {
          const session = getSession();
          if (session.role === "guest") return;
          const filtered = getFilteredComments();
          const checked = filtered.filter((c) => state.selectedPinIds.has(c.id));
          const targets = checked.length > 0 ? checked : filtered.filter((c) => {
            const st = c.status || "pending";
            return st === "pending" || st === "approved";
          });
          if (targets.length === 0) {
            showToast("No pending or approved pins to dispatch");
            return;
          }
          const ids = targets.map((c) => c.id);
          const res = await window.AIFLStorage.batchUpdateStatus(ids, "approved");
          state.comments = res.comments;
          ids.forEach((id2) => state.selectedPinIds.delete(id2));
          const updatedTargets = state.comments.filter((c) => ids.includes(c.id));
          const msg = session.connected && session.role === "host" ? `Approved ${ids.length} pin${ids.length === 1 ? "" : "s"} for MCP & copied prompt!` : `Marked ${ids.length} pin${ids.length === 1 ? "" : "s"} approved & copied prompt!`;
          await copyPromptToClipboard(updatedTargets, msg);
          renderAll();
        }
        function setupFloatingDrag(handleEls, targetEl) {
          const handles = Array.isArray(handleEls) ? handleEls.filter(Boolean) : [handleEls].filter(Boolean);
          let dragging = false;
          let startX = 0;
          let startY = 0;
          let origLeft = 0;
          let origTop = 0;
          handles.forEach((handleEl) => {
            handleEl.addEventListener("mousedown", (e) => {
              if (e.button !== 0) return;
              if (e.target.closest("button")) return;
              dragging = true;
              const rect = targetEl.getBoundingClientRect();
              startX = e.clientX;
              startY = e.clientY;
              origLeft = rect.left;
              origTop = rect.top;
              targetEl.style.left = `${origLeft}px`;
              targetEl.style.top = `${origTop}px`;
              targetEl.style.bottom = "auto";
              targetEl.style.right = "auto";
              targetEl.style.transform = "none";
              targetEl.classList.add("dragging");
              e.preventDefault();
              e.stopPropagation();
            });
          });
          window.addEventListener("mousemove", (e) => {
            if (!dragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            const newLeft = Math.max(8, Math.min(window.innerWidth - targetEl.offsetWidth - 8, origLeft + dx));
            const newTop = Math.max(8, Math.min(window.innerHeight - targetEl.offsetHeight - 8, origTop + dy));
            targetEl.style.left = `${newLeft}px`;
            targetEl.style.top = `${newTop}px`;
          });
          window.addEventListener("mouseup", () => {
            if (!dragging) return;
            dragging = false;
            targetEl.classList.remove("dragging");
          });
        }
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
            ui.focusBox?.classList.remove("visible");
          }
          renderAll();
        }
        function setToolbarVisible(visible) {
          state.toolbarVisible = visible;
          if (!ui.toolbar) return;
          ui.toolbar.classList.toggle("hidden", !visible);
          if (ui.pinsContainer) {
            ui.pinsContainer.style.display = visible ? "block" : "none";
          }
          try {
            sessionStorage.setItem("aifl_toolbar_open", visible ? "1" : "0");
          } catch {
          }
        }
        function isFreeDropActive() {
          return Boolean(state.ctrlHeld);
        }
        function updateModeIndicator() {
          if (!state.inspecting || !ui.btnAddLabel) return;
          ui.btnAddLabel.textContent = isFreeDropActive() ? "Drop Free Pin (Release Ctrl)" : "Click Element (ESC)";
        }
        function setInspecting(active) {
          state.inspecting = active;
          if (!ui.toolbar) return;
          ui.toolbar.classList.toggle("inspecting", active);
          ui.btnAdd.classList.toggle("active", active);
          updateModeIndicator();
          if (!active && ui.btnAddLabel) {
            ui.btnAddLabel.textContent = "+ Add Comment";
          }
          if (!active) {
            state.hoveredElement = null;
            ui.hoverBox.classList.remove("visible");
            ui.freeCursor?.classList.remove("visible");
          } else {
            closePopover();
            setConnectPopoverOpen(false);
          }
        }
        function setDrawerOpen(open) {
          state.drawerOpen = open;
          if (!ui.drawer) return;
          ui.drawer.classList.toggle("open", open);
          if (open) {
            setConnectPopoverOpen(false);
            renderDrawer();
          } else {
            ui.focusBox.classList.remove("visible");
          }
        }
        function refreshInspectOverlay() {
          if (!state.inspecting || state.pendingPin) return;
          const { x: clientX, y: clientY } = state.lastMousePos;
          if (!clientX && !clientY) return;
          if (isFreeDropActive()) {
            ui.hoverBox.classList.remove("visible");
            state.hoveredElement = null;
            const scrollX = window.scrollX || window.pageXOffset || 0;
            const scrollY = window.scrollY || window.pageYOffset || 0;
            const vw = window.innerWidth || 1;
            const vh = window.innerHeight || 1;
            const pageX = Math.round(clientX + scrollX);
            const pageY = Math.round(clientY + scrollY);
            const pctX = Math.round(clientX / vw * 100);
            const pctY = Math.round(clientY / vh * 100);
            ui.freeCursor.style.left = `${clientX}px`;
            ui.freeCursor.style.top = `${clientY}px`;
            if (ui.danglingNum) {
              ui.danglingNum.textContent = String(state.comments.length + 1);
            }
            ui.freeCursor.classList.add("visible");
            ui.freeLabel.innerHTML = `<span>\u{1F4CD} (${pageX}, ${pageY}) \u2022 ${pctX}% X, ${pctY}% Y</span><span class="aifl-hover-hint">Click to drop \u2022 Release Ctrl for Element Picker</span>`;
            ui.freeLabel.style.left = clientX > vw - 310 ? "-295px" : "20px";
            return;
          }
          ui.freeCursor?.classList.remove("visible");
          const target = document.elementFromPoint(clientX, clientY);
          if (!target || target === document.documentElement || target === document.body || target === hostEl) {
            ui.hoverBox.classList.remove("visible");
            state.hoveredElement = null;
            return;
          }
          state.hoveredElement = target;
          const rect = target.getBoundingClientRect();
          ui.hoverBox.style.left = `${rect.left}px`;
          ui.hoverBox.style.top = `${rect.top}px`;
          ui.hoverBox.style.width = `${rect.width}px`;
          ui.hoverBox.style.height = `${rect.height}px`;
          ui.hoverBox.classList.add("visible");
          const label = window.AIFLPromptGenerator.buildShortElementLabel(target);
          const dims = `${Math.round(rect.width)}\xD7${Math.round(rect.height)}`;
          ui.hoverLabel.innerHTML = `<span>${escapeHtml(label)}</span><span class="aifl-hover-hint">${dims} \u2022 Hold Ctrl for Free Pin \u2022 Shift+Click to interact</span>`;
          ui.hoverLabel.style.top = rect.top < 32 ? "4px" : "-28px";
        }
        function onPageMouseMove(e) {
          state.lastMousePos = { x: e.clientX, y: e.clientY };
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
            ui.hoverBox.classList.remove("visible");
            ui.freeCursor?.classList.remove("visible");
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
            const context2 = window.AIFLPromptGenerator.captureFreePinContext(e);
            state.ctrlHeld = false;
            setInspecting(false);
            openQuickAddPopover(null, context2, e.clientX, e.clientY);
            return;
          }
          const target = document.elementFromPoint(e.clientX, e.clientY);
          if (!target || target === hostEl) return;
          const context = window.AIFLPromptGenerator.capturePinContext(target, e);
          setInspecting(false);
          openQuickAddPopover(target, context, e.clientX, e.clientY);
        }
        function onPageKeyDown(e) {
          const path = typeof e.composedPath === "function" ? e.composedPath() : [];
          const targetTag = (path[0]?.tagName || e.target?.tagName || "").toLowerCase();
          const isTypingInInput = targetTag === "input" || targetTag === "textarea" || path[0]?.isContentEditable;
          if (e.altKey && e.shiftKey && (e.key === "F" || e.key === "f")) {
            e.preventDefault();
            toggleToolbar();
            return;
          }
          if (isTypingInInput) return;
          if ((e.key === "Control" || e.ctrlKey) && !state.ctrlHeld) {
            state.ctrlHeld = true;
            updateModeIndicator();
            if (state.inspecting) refreshInspectOverlay();
          }
          if (e.key === "Escape") {
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
          if (e.key === "Control" || !e.ctrlKey && state.ctrlHeld) {
            state.ctrlHeld = false;
            updateModeIndicator();
            if (state.inspecting) refreshInspectOverlay();
          }
        }
        function openQuickAddPopover(element2, context, clientX, clientY) {
          const isFree = Boolean(context?.target?.isFreePin);
          state.pendingPin = { mode: "create", element: element2, context, clientX, clientY };
          const nextNum = state.comments.reduce((max2, c) => Math.max(max2, Number(c.number) || 0), 0) + 1;
          ui.popoverBadge.textContent = `Pin #${nextNum}${isFree ? " \u2022 Free" : ""}`;
          ui.popoverTarget.textContent = context.target.shortLabel || context.target.tagName;
          ui.popoverSave.textContent = "Save Pin";
          ui.popoverTextarea.value = "";
          positionPopoverNear(clientX, clientY);
          ui.popover.classList.add("visible");
          if (isFree) {
            positionCoordinateFocusRing(clientX, clientY);
          } else if (element2) {
            positionFocusBox(element2);
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
            mode: "edit",
            commentId: comment.id,
            element: el
          };
          ui.popoverBadge.textContent = `Pin #${comment.number}${isFree ? " \u2022 Free" : ""}`;
          ui.popoverTarget.textContent = comment.target?.shortLabel || comment.target?.tagName || "element";
          ui.popoverSave.textContent = "Save Pin";
          ui.popoverTextarea.value = comment.text || "";
          positionPopoverNear(anchorX, anchorY);
          ui.popover.classList.add("visible");
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
            ui.popover.classList.remove("visible");
            ui.popoverTextarea.value = "";
          }
          if (!state.drawerOpen) {
            ui.focusBox?.classList.remove("visible");
          }
        }
        async function savePendingPin() {
          if (!state.pendingPin) return;
          const text2 = ui.popoverTextarea.value.trim();
          if (!text2) {
            ui.popoverTextarea.focus();
            showToast("Please enter a comment first");
            return;
          }
          if (state.pendingPin.mode === "edit" && state.pendingPin.commentId) {
            const { comment: comment2, comments: comments2 } = await window.AIFLStorage.updateComment(state.pendingPin.commentId, {
              text: text2
            });
            state.comments = comments2;
            state.focusedCommentId = comment2 ? comment2.id : state.pendingPin.commentId;
            closePopover();
            renderAll();
            showToast(`Updated Pin #${comment2 ? comment2.number : ""}`);
            return;
          }
          const { element: element2, context } = state.pendingPin;
          const { comment, comments } = await window.AIFLStorage.addComment({
            text: text2,
            screen: context.screen,
            target: context.target
          });
          if (comment && element2) {
            elementCache.set(comment.id, element2);
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
          if (state.filterScope === "screen") {
            const currentRoute = window.AIFLStorage.getRouteKey();
            return state.comments.filter((c) => c.screen?.routeKey === currentRoute);
          }
          return state.comments;
        }
        function getFilteredComments() {
          const scoped = getScopedComments();
          if (state.statusFilter === "pending") {
            return scoped.filter((c) => (c.status || "pending") === "pending");
          }
          if (state.statusFilter === "approved") {
            return scoped.filter((c) => c.status === "approved" || c.status === "in_progress");
          }
          if (state.statusFilter === "resolved") {
            return scoped.filter((c) => c.status === "resolved");
          }
          return scoped;
        }
        function canModifyPin(comment, session) {
          if (session.role !== "guest") return true;
          return comment.author?.id === session.author?.id && (comment.status || "pending") === "pending";
        }
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
            ui.pinsContainer.innerHTML = "";
            ui.pinsContainer.style.display = "none";
            return;
          }
          ui.pinsContainer.style.display = "block";
          const currentRoute = window.AIFLStorage.getRouteKey();
          const routeComments = state.comments.filter((c) => {
            if (c.screen?.routeKey !== currentRoute) return false;
            if (!state.showResolvedPins && (c.status || "pending") === "resolved") return false;
            return true;
          });
          ui.pinsContainer.innerHTML = "";
          for (const comment of routeComments) {
            const isFree = Boolean(comment.target?.isFreePin || comment.target?.pinType === "free");
            const pinStatus = comment.status || "pending";
            const pinEl = document.createElement("div");
            pinEl.className = `aifl-pin status-${pinStatus}${isFree ? " free-pin" : ""}${state.focusedCommentId === comment.id ? " active" : ""}`;
            pinEl.dataset.commentId = comment.id;
            pinEl.title = isFree ? "Free Coordinate Pin \u2022 Click to view/edit \u2022 Drag to move pin" : "Element Pin \u2022 Click to view/edit \u2022 Drag to move pin";
            const numSpan = document.createElement("span");
            numSpan.className = "aifl-pin-num";
            numSpan.textContent = String(comment.number);
            pinEl.appendChild(numSpan);
            if (pinStatus === "resolved") {
              const checkBadge = document.createElement("span");
              checkBadge.className = "aifl-pin-check";
              checkBadge.textContent = "\u2713";
              pinEl.appendChild(checkBadge);
            }
            const pinGripper = document.createElement("div");
            pinGripper.className = "aifl-pin-gripper";
            pinGripper.title = "Drag to reposition pin";
            pinGripper.innerHTML = "<i></i><i></i><i></i>";
            pinEl.appendChild(pinGripper);
            const tooltip = document.createElement("div");
            tooltip.className = "aifl-pin-tooltip";
            const authorPrefix = comment.author?.name ? `[${comment.author.name}] ` : "";
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
          pinEl.addEventListener("mousedown", (e) => {
            if (e.button !== 0) return;
            isDown = true;
            didDrag = false;
            startX = e.clientX;
            startY = e.clientY;
            origPinX = parseFloat(pinEl.style.left) || e.clientX;
            origPinY = parseFloat(pinEl.style.top) || e.clientY;
            window.addEventListener("mousemove", onMouseMove, true);
            window.addEventListener("mouseup", onMouseUp, true);
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
              pinEl.classList.add("dragging");
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
            window.removeEventListener("mousemove", onMouseMove, true);
            window.removeEventListener("mouseup", onMouseUp, true);
            pinEl.classList.remove("dragging");
            const session = getSession();
            if (didDrag && comment._draggingPos && canModifyPin(comment, session)) {
              const finalX = comment._draggingPos.x;
              const finalY = comment._draggingPos.y;
              delete comment._draggingPos;
              const isFree = Boolean(comment.target?.isFreePin || comment.target?.pinType === "free");
              const el = isFree ? null : elementCache.get(comment.id) || window.AIFLPromptGenerator.resolveTargetElement(comment);
              const scrollX = window.scrollX || window.pageXOffset || 0;
              const scrollY = window.scrollY || window.pageYOffset || 0;
              const vw = window.innerWidth || 1;
              const vh = window.innerHeight || 1;
              const newPageX = Math.round(finalX + scrollX);
              const newPageY = Math.round(finalY + scrollY);
              const newPctX = Math.round(finalX / vw * 100);
              const newPctY = Math.round(finalY / vh * 100);
              const updatedTarget = {
                ...comment.target || {},
                pageCoords: { x: newPageX, y: newPageY },
                viewportPct: { x: newPctX, y: newPctY }
              };
              if (isFree) {
                updatedTarget.selector = `Free Coordinate (${newPageX}, ${newPageY})`;
                updatedTarget.shortLabel = `\u{1F4CD} Point (${newPageX}, ${newPageY})`;
                updatedTarget.region = window.AIFLPromptGenerator.describeViewportRegion(newPctX, newPctY);
                const landmarks = window.AIFLPromptGenerator.findSpatialLandmarks(finalX, finalY);
                updatedTarget.spatialLandmarks = landmarks;
                updatedTarget.nearbyText = landmarks.join(" \u2022 ");
                const underlyingEl = document.elementFromPoint(finalX, finalY) || document.body;
                const { matchedLandmark } = window.AIFLPromptGenerator.capturePageContentLandscape(underlyingEl, {
                  clientX: finalX,
                  clientY: finalY
                });
                updatedTarget.landmarkRef = matchedLandmark || null;
                updatedTarget.placementNarrative = window.AIFLPromptGenerator.buildPlacementNarrative({
                  isFreePin: true,
                  shortLabel: updatedTarget.shortLabel,
                  textSnippet: "",
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
          const pinNodes = ui.pinsContainer.querySelectorAll(".aifl-pin");
          pinNodes.forEach((pinNode) => {
            const id2 = pinNode.dataset.commentId;
            const comment = state.comments.find((c) => c.id === id2);
            if (!comment) return;
            if (comment._draggingPos) {
              pinNode.style.display = "flex";
              pinNode.style.left = `${Math.round(comment._draggingPos.x)}px`;
              pinNode.style.top = `${Math.round(comment._draggingPos.y)}px`;
              return;
            }
            const anchor = window.AIFLPromptGenerator.resolvePinAnchor(comment);
            if (anchor.element) {
              elementCache.set(id2, anchor.element);
            }
            if (anchor.hiddenByAncestor || !Number.isFinite(anchor.x) || !Number.isFinite(anchor.y)) {
              pinNode.style.display = "none";
              return;
            }
            pinNode.style.display = "flex";
            pinNode.style.left = `${Math.round(anchor.x)}px`;
            pinNode.style.top = `${Math.round(anchor.y)}px`;
          });
          if (state.focusedCommentId && (state.drawerOpen || state.pendingPin)) {
            const focusedComment = state.comments.find((c) => c.id === state.focusedCommentId);
            if (focusedComment) {
              const anchor = window.AIFLPromptGenerator.resolvePinAnchor(focusedComment);
              if (anchor.tier === "free") {
                positionCoordinateFocusRing(anchor.x, anchor.y);
              } else if (anchor.element && !anchor.hiddenByAncestor) {
                positionFocusBox(anchor.element);
              } else if (anchor.containerElement && !anchor.hiddenByAncestor) {
                positionFocusBox(anchor.containerElement);
              } else if (!anchor.hiddenByAncestor && Number.isFinite(anchor.x) && Number.isFinite(anchor.y)) {
                positionCoordinateFocusRing(anchor.x, anchor.y);
              } else {
                ui.focusBox.classList.remove("visible");
              }
            }
          }
        }
        function positionFocusBox(el) {
          if (!el || !ui.focusBox) return;
          const rect = el.getBoundingClientRect();
          ui.focusBox.style.borderRadius = "6px";
          ui.focusBox.style.left = `${rect.left - 3}px`;
          ui.focusBox.style.top = `${rect.top - 3}px`;
          ui.focusBox.style.width = `${rect.width + 6}px`;
          ui.focusBox.style.height = `${rect.height + 6}px`;
          ui.focusBox.classList.add("visible");
        }
        function positionCoordinateFocusRing(clientX, clientY) {
          if (!ui.focusBox) return;
          ui.focusBox.style.borderRadius = "50%";
          ui.focusBox.style.left = `${Math.round(clientX - 18)}px`;
          ui.focusBox.style.top = `${Math.round(clientY - 18)}px`;
          ui.focusBox.style.width = "36px";
          ui.focusBox.style.height = "36px";
          ui.focusBox.classList.add("visible");
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
            if (anchor.tier === "free" || !highlightTarget && !anchor.hiddenByAncestor) {
              const pageX = comment.target?.pageCoords?.x ?? 100;
              const pageY = comment.target?.pageCoords?.y ?? 100;
              if (options.scrollElementIntoView) {
                window.scrollTo({
                  left: Math.max(0, pageX - window.innerWidth / 2),
                  top: Math.max(0, pageY - window.innerHeight / 2),
                  behavior: "smooth"
                });
              }
              positionCoordinateFocusRing(pageX - window.scrollX, pageY - window.scrollY);
            } else if (highlightTarget && window.AIFLPromptGenerator.isElementCurrentlyVisible(highlightTarget)) {
              if (options.scrollElementIntoView) {
                highlightTarget.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
              }
              positionFocusBox(highlightTarget);
              clearTimeout(focusHighlightTimer);
              focusHighlightTimer = setTimeout(() => {
                if (!state.drawerOpen) ui.focusBox.classList.remove("visible");
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
                  card.scrollIntoView({ behavior: "smooth", block: "nearest" });
                }
              });
            }
          }
        }
        function renderDrawer() {
          if (!ui.drawerBody) return;
          const session = getSession();
          const isGuest = session.role === "guest";
          const currentRoute = window.AIFLStorage.getRouteKey();
          const allCount = state.comments.length;
          const screenCount = state.comments.filter((c) => c.screen?.routeKey === currentRoute).length;
          ui.tabAll.textContent = `All Screens (${allCount})`;
          ui.tabScreen.textContent = `This Screen (${screenCount})`;
          ui.tabAll.classList.toggle("active", state.filterScope === "all");
          ui.tabScreen.classList.toggle("active", state.filterScope === "screen");
          ui.modeStandard.classList.toggle("active", state.promptMode === "standard");
          ui.modeCompact.classList.toggle("active", state.promptMode === "compact");
          const scoped = getScopedComments();
          const pendingCount = scoped.filter((c) => (c.status || "pending") === "pending").length;
          const approvedCount = scoped.filter((c) => c.status === "approved" || c.status === "in_progress").length;
          const resolvedCount = scoped.filter((c) => c.status === "resolved").length;
          ui.statusAll.textContent = `All (${scoped.length})`;
          ui.statusPending.textContent = `Pending (${pendingCount})`;
          ui.statusApproved.textContent = `Approved (${approvedCount})`;
          ui.statusResolved.textContent = `Resolved (${resolvedCount})`;
          [ui.statusAll, ui.statusPending, ui.statusApproved, ui.statusResolved].forEach((btn) => {
            btn.classList.toggle("active", (btn.dataset.status || "all") === state.statusFilter);
          });
          const validIds = new Set(state.comments.map((c) => c.id));
          for (const id2 of Array.from(state.selectedPinIds)) {
            if (!validIds.has(id2)) state.selectedPinIds.delete(id2);
          }
          const filtered = getFilteredComments();
          const checkedVisibleCount = filtered.filter((c) => state.selectedPinIds.has(c.id)).length;
          if (ui.selectedCountEl) {
            ui.selectedCountEl.textContent = `${checkedVisibleCount} selected`;
          }
          if (ui.batchBar) {
            ui.batchBar.classList.toggle("hidden", isGuest);
          }
          let activeFocusMeta = null;
          const activeEl = shadowRoot?.activeElement;
          if (activeEl && ui.drawerBody.contains(activeEl)) {
            const cardEl = activeEl.closest("[data-card-id]");
            if (cardEl) {
              const cls = activeEl.classList.contains("aifl-reply-input") ? "aifl-reply-input" : activeEl.classList.contains("aifl-card-textarea") ? "aifl-card-textarea" : null;
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
          ui.drawerBody.querySelectorAll(".aifl-reply-input").forEach((inp) => {
            const cid = inp.dataset.pinId;
            if (cid) {
              if (inp.value) replyDrafts.set(cid, inp.value);
              else replyDrafts.delete(cid);
            }
          });
          ui.drawerBody.innerHTML = "";
          if (filtered.length === 0) {
            const emptyEl = document.createElement("div");
            emptyEl.className = "aifl-empty-state";
            emptyEl.innerHTML = `
        <div class="aifl-empty-icon">\u{1F4CC}</div>
        <div class="aifl-empty-title">No ${state.statusFilter !== "all" ? escapeHtml(state.statusFilter) + " " : ""}comments ${state.filterScope === "screen" ? "on this screen" : "yet"}</div>
        <div class="aifl-empty-desc">
          Click <strong>+ Add Comment</strong> and select any element on the page to leave feedback.
        </div>
      `;
            const startBtn = document.createElement("button");
            startBtn.className = "aifl-btn aifl-btn-primary";
            startBtn.textContent = "+ Add Comment";
            startBtn.addEventListener("click", () => {
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
          ui.drawerBody.querySelectorAll(".aifl-reply-input").forEach((inp) => {
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
              if (activeFocusMeta.cls === "aifl-card-textarea" && activeFocusMeta.value !== void 0) {
                targetInput.value = activeFocusMeta.value;
              }
              targetInput.focus();
              if (typeof activeFocusMeta.selectionStart === "number") {
                try {
                  targetInput.setSelectionRange(activeFocusMeta.selectionStart, activeFocusMeta.selectionEnd);
                } catch {
                }
              }
            }
          }
          const promptText = window.AIFLPromptGenerator.generateAIPrompt(filtered, {
            mode: state.promptMode
          });
          ui.previewPre.textContent = promptText;
          ui.drawerCopy.textContent = `Copy ${filtered.length} Comment${filtered.length === 1 ? "" : "s"} as AI Prompt`;
        }
        function formatStatusLabel(status) {
          switch (status) {
            case "approved":
              return "Approved";
            case "in_progress":
              return "In Progress";
            case "resolved":
              return "\u2713 Resolved";
            default:
              return "Pending";
          }
        }
        function createCommentCard(comment, currentRoute, session) {
          const t = comment.target || {};
          const isGuest = session.role === "guest";
          const editable = canModifyPin(comment, session);
          const pinStatus = comment.status || "pending";
          const isFree = Boolean(t.isFreePin || t.pinType === "free");
          const isSameRoute = comment.screen?.routeKey === currentRoute;
          const anchor = isSameRoute ? window.AIFLPromptGenerator.resolvePinAnchor(comment) : null;
          const liveEl = anchor?.element || null;
          const isVisibleNow = Boolean(isSameRoute && anchor && !anchor.hiddenByAncestor);
          const card = document.createElement("div");
          card.className = `aifl-card status-${pinStatus}${state.focusedCommentId === comment.id ? " focused" : ""}`;
          card.dataset.cardId = comment.id;
          let locationBadgeHtml = "";
          if (!isSameRoute) {
            locationBadgeHtml = `<span class="aifl-status-pill other-screen" title="Dropped on ${escapeHtml(comment.screen?.routeKey || "")}">Other Screen</span>`;
          } else if (isFree) {
            locationBadgeHtml = `<span class="aifl-status-pill" style="background: rgba(16, 185, 129, 0.16); color: #6ee7b7; border: 1px solid rgba(16, 185, 129, 0.35);" title="Arbitrary coordinate pin">\u{1F4CD} Free Pin</span>`;
          } else if (!isVisibleNow) {
            locationBadgeHtml = `<span class="aifl-status-pill hidden-el" title="Target is currently hidden (e.g. inside a closed accordion, menu, or tab)">Collapsed/Hidden</span>`;
          } else if (anchor?.tier === 2) {
            locationBadgeHtml = `<span class="aifl-status-pill other-screen" title="Re-anchored via text-quote + landmark">Text Match</span>`;
          } else if (anchor?.tier === 3) {
            locationBadgeHtml = `<span class="aifl-status-pill hidden-el" title="Element refactored; anchored via last coordinates">Coords Fallback</span>`;
          }
          const screenDisplay = comment.screen?.activeScreenLabel ? `${comment.screen.routeKey} \u2022 ${comment.screen.activeScreenLabel}` : comment.screen?.routeKey || "/";
          const coordsSummary = t.pageCoords ? isFree ? `(${t.pageCoords.x}, ${t.pageCoords.y}) \u2022 ${t.viewportPct?.x ?? 0}% X, ${t.viewportPct?.y ?? 0}% Y${t.region ? ` \u2022 ${t.region}` : ""}` : `(${t.pageCoords.x}, ${t.pageCoords.y}) \u2022 ${t.viewportPct?.x ?? 0}% X, ${t.viewportPct?.y ?? 0}% Y \u2022 ${t.elementRect?.width ?? 0}\xD7${t.elementRect?.height ?? 0}px` : "";
          const authorName = comment.author?.name || "Host";
          const authorRole = comment.author?.role || "host";
          const authorColor = comment.author?.color || (authorRole === "host" ? "#6366f1" : "#10b981");
          let triageButtonsHtml = "";
          if (!isGuest) {
            if (pinStatus === "pending") {
              triageButtonsHtml = `<button class="aifl-triage-btn approve" data-triage="approved" title="Approve for AI agent execution">Approve</button>`;
            } else if (pinStatus === "approved" || pinStatus === "in_progress") {
              triageButtonsHtml = `<button class="aifl-triage-btn resolve" data-triage="resolved" title="Mark resolved">Resolve</button>`;
            } else if (pinStatus === "resolved") {
              triageButtonsHtml = `<button class="aifl-triage-btn reopen" data-triage="pending" title="Reopen to pending">Reopen</button>`;
            }
          }
          const replies = Array.isArray(comment.replies) ? comment.replies : [];
          const repliesHtml = replies.map((r) => {
            const rRole = r.role || "guest";
            const roleLabel = rRole === "agent" ? "\u{1F916} Agent" : rRole === "host" ? "Host" : "Guest";
            return `
          <div class="aifl-reply-item role-${escapeHtml(rRole)}">
            <div class="aifl-reply-header">
              <span class="aifl-reply-author">${escapeHtml(r.authorName || roleLabel)}</span>
              <span class="aifl-reply-role ${escapeHtml(rRole)}">${escapeHtml(roleLabel)}</span>
            </div>
            <div class="aifl-reply-text">${escapeHtml(r.text)}</div>
          </div>
        `;
          }).join("");
          card.innerHTML = `
      <div class="aifl-card-header">
        <div class="aifl-card-left">
          ${!isGuest ? `<input type="checkbox" class="aifl-checkbox card-select" ${state.selectedPinIds.has(comment.id) ? "checked" : ""} title="Select pin for batch action" />` : ""}
          <span class="aifl-pin-badge" style="${isFree && state.focusedCommentId !== comment.id ? "background: #059669;" : ""}">${comment.number}</span>
          <span class="aifl-screen-pill" title="${escapeHtml(screenDisplay)}">${escapeHtml(screenDisplay)}</span>
        </div>
        <div class="aifl-card-actions">
          <button class="aifl-icon-btn locate" title="${isSameRoute ? "Scroll to & highlight pin location" : "Navigate to screen"}">
            ${isSameRoute ? "\u{1F3AF} Locate" : "\u2197 Go"}
          </button>
          <button class="aifl-icon-btn copy-one" title="Copy prompt for just this comment">\u{1F4CB}</button>
          ${editable ? '<button class="aifl-icon-btn delete" title="Delete comment">\u{1F5D1}</button>' : ""}
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

      <textarea class="aifl-card-textarea" ${editable ? "" : "readonly"} placeholder="Describe the change for the AI agent...">${escapeHtml(comment.text)}</textarea>

      <div class="aifl-meta-box">
        ${t.landmarkRef?.id ? `<div class="aifl-meta-row">
                 <span class="aifl-meta-key">Landmark</span>
                 <span class="aifl-meta-val aifl-meta-code" title="${escapeHtml(`${t.landmarkRef.id}: ${t.landmarkRef.container} \u2014 ${t.landmarkRef.title || ""}`)}">[${escapeHtml(t.landmarkRef.id)}] ${escapeHtml(t.landmarkRef.container)}${t.landmarkRef.title && t.landmarkRef.title !== t.landmarkRef.container ? ` \u2022 "${escapeHtml(t.landmarkRef.title)}"` : ""}</span>
               </div>` : ""}
        ${t.placementNarrative ? `<div class="aifl-meta-row" style="white-space: normal;">
                 <span class="aifl-meta-key">Placement</span>
                 <span class="aifl-meta-val" style="white-space: normal; line-height: 1.35;" title="${escapeHtml(t.placementNarrative)}">${escapeHtml(t.placementNarrative)}</span>
               </div>` : ""}
        <div class="aifl-meta-row">
          <span class="aifl-meta-key">${isFree ? "Location" : "Target"}</span>
          <span class="aifl-meta-val aifl-meta-code" title="${escapeHtml(t.selector || "")}">${escapeHtml(t.selector || t.shortLabel || t.tagName || "element")}</span>
        </div>
        ${t.textSnippet ? `<div class="aifl-meta-row">
                 <span class="aifl-meta-key">Text</span>
                 <span class="aifl-meta-val" title="${escapeHtml(t.textSnippet)}">"${escapeHtml(t.textSnippet)}"</span>
               </div>` : ""}
        ${t.sectionHeading || t.nearbyText || t.underlyingContainer ? `<div class="aifl-meta-row">
                 <span class="aifl-meta-key">${isFree ? "Landmarks" : "Context"}</span>
                 <span class="aifl-meta-val" title="${escapeHtml([t.sectionHeading ? `Section: ${t.sectionHeading}` : "", t.underlyingContainer ? `Area: ${t.underlyingContainer}` : "", t.nearbyText].filter(Boolean).join(" \u2022 "))}">
                   ${escapeHtml([t.sectionHeading ? `Section: "${t.sectionHeading}"` : "", t.underlyingContainer ? `Area: ${t.underlyingContainer}` : "", t.nearbyText].filter(Boolean).join(" \u2022 "))}
                 </span>
               </div>` : ""}
        ${Array.isArray(t.uiState) && t.uiState.length > 0 ? `<div class="aifl-meta-row">
                 <span class="aifl-meta-key">UI State</span>
                 <span class="aifl-meta-val" title="${escapeHtml(t.uiState.join(" \u2192 "))}">${escapeHtml(t.uiState.join(" \u2192 "))}</span>
               </div>` : ""}
        ${coordsSummary ? `<div class="aifl-meta-row">
                 <span class="aifl-meta-key">Coords</span>
                 <span class="aifl-meta-val aifl-meta-code">${escapeHtml(coordsSummary)}</span>
               </div>` : ""}
      </div>

      <div class="aifl-replies-section">
        ${replies.length > 0 ? `<div class="aifl-replies-list">${repliesHtml}</div>` : ""}
        <div class="aifl-reply-form">
          <input type="text" class="aifl-reply-input" data-pin-id="${escapeHtml(comment.id)}" placeholder="Reply to thread..." />
          <button type="button" class="aifl-reply-send">Send</button>
        </div>
      </div>
    `;
          card.addEventListener("click", (e) => {
            if (e.target.closest("button, input, textarea")) return;
            state.focusedCommentId = comment.id;
            card.parentElement?.querySelectorAll(".aifl-card").forEach((c) => c.classList.remove("focused"));
            card.classList.add("focused");
            renderPins();
            if (isSameRoute && anchor && !anchor.hiddenByAncestor) {
              if (anchor.tier === "free") {
                positionCoordinateFocusRing(anchor.x, anchor.y);
              } else if (liveEl && window.AIFLPromptGenerator.isElementCurrentlyVisible(liveEl)) {
                positionFocusBox(liveEl);
              } else if (anchor.containerElement) {
                positionFocusBox(anchor.containerElement);
              }
            }
          });
          const checkbox = card.querySelector(".card-select");
          if (checkbox) {
            checkbox.addEventListener("click", (e) => e.stopPropagation());
            checkbox.addEventListener("change", () => {
              if (checkbox.checked) state.selectedPinIds.add(comment.id);
              else state.selectedPinIds.delete(comment.id);
              if (ui.selectedCountEl) {
                const checkedVisibleCount = getFilteredComments().filter(
                  (c) => state.selectedPinIds.has(c.id)
                ).length;
                ui.selectedCountEl.textContent = `${checkedVisibleCount} selected`;
              }
            });
          }
          card.querySelectorAll(".aifl-triage-btn").forEach((btn) => {
            btn.addEventListener("click", async (e) => {
              e.stopPropagation();
              const nextStatus = btn.dataset.triage;
              if (!nextStatus) return;
              const { comments } = await window.AIFLStorage.updatePinStatus(comment.id, nextStatus);
              state.comments = comments;
              renderAll();
              showToast(`Pin #${comment.number} marked ${nextStatus}`);
            });
          });
          const textarea = card.querySelector(".aifl-card-textarea");
          let saveTimer = null;
          textarea.addEventListener("keydown", (e) => e.stopPropagation());
          if (editable) {
            textarea.addEventListener("input", () => {
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
          const replyInput = card.querySelector(".aifl-reply-input");
          const replySendBtn = card.querySelector(".aifl-reply-send");
          const submitReply = async () => {
            const replyText = replyInput.value.trim();
            if (!replyText) return;
            replyInput.value = "";
            replyDrafts.delete(comment.id);
            const { comments } = await window.AIFLStorage.addReply(comment.id, replyText);
            state.comments = comments;
            renderAll();
          };
          replyInput.addEventListener("click", (e) => e.stopPropagation());
          replyInput.addEventListener("keydown", (e) => {
            e.stopPropagation();
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submitReply();
            }
          });
          replyInput.addEventListener("input", () => {
            if (replyInput.value) replyDrafts.set(comment.id, replyInput.value);
            else replyDrafts.delete(comment.id);
          });
          replySendBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            submitReply();
          });
          const locateBtn = card.querySelector(".aifl-icon-btn.locate");
          locateBtn.addEventListener("click", (e) => {
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
          const copyOneBtn = card.querySelector(".aifl-icon-btn.copy-one");
          copyOneBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            copyPromptToClipboard([comment], `Copied Pin #${comment.number} prompt!`);
          });
          const deleteBtn = card.querySelector(".aifl-icon-btn.delete");
          if (deleteBtn) {
            deleteBtn.addEventListener("click", async (e) => {
              e.stopPropagation();
              state.comments = await window.AIFLStorage.deleteComment(comment.id);
              elementCache.delete(comment.id);
              state.selectedPinIds.delete(comment.id);
              if (state.focusedCommentId === comment.id) {
                state.focusedCommentId = null;
                ui.focusBox.classList.remove("visible");
              }
              renderAll();
              showToast("Deleted comment");
            });
          }
          return card;
        }
        async function copyPromptToClipboard(commentsList, customMessage = null) {
          if (!commentsList || commentsList.length === 0) {
            showToast("No comments to copy yet");
            return;
          }
          const promptText = window.AIFLPromptGenerator.generateAIPrompt(commentsList, {
            mode: state.promptMode
          });
          try {
            await navigator.clipboard.writeText(promptText);
          } catch {
            const ta = document.createElement("textarea");
            ta.value = promptText;
            ta.style.position = "fixed";
            ta.style.opacity = "0";
            document.body.appendChild(ta);
            ta.select();
            document.execCommand("copy");
            ta.remove();
          }
          const msg = customMessage || `Copied ${commentsList.length} comment${commentsList.length === 1 ? "" : "s"} as AI prompt!`;
          showToast(msg);
          if (ui.btnCopyLabel) {
            const orig = ui.btnCopyLabel.textContent;
            ui.btnCopyLabel.textContent = "\u2713 Copied!";
            setTimeout(() => {
              if (ui.btnCopyLabel) ui.btnCopyLabel.textContent = orig;
            }, 1800);
          }
        }
        function downloadPromptMarkdown(commentsList) {
          if (!commentsList || commentsList.length === 0) {
            showToast("No comments to export yet");
            return;
          }
          const promptText = window.AIFLPromptGenerator.generateAIPrompt(commentsList, {
            mode: state.promptMode
          });
          const blob = new Blob([promptText], { type: "text/markdown;charset=utf-8" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          const hostSlug = (window.location.hostname || "local-page").replace(/[^a-z0-9_-]/gi, "-");
          a.href = url;
          a.download = `ai-feedback-${hostSlug}.md`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
          showToast("Downloaded AI Feedback Markdown");
        }
        function showToast(message) {
          if (!ui.toast) return;
          ui.toast.textContent = message;
          ui.toast.classList.add("visible");
          clearTimeout(toastTimer);
          toastTimer = setTimeout(() => {
            ui.toast.classList.remove("visible");
          }, 2600);
        }
        function escapeHtml(str) {
          return String(str ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
        }
        if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
          chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
            if (msg && msg.type === "TOGGLE_FEEDBACK_LOOP") {
              toggleToolbar();
              sendResponse({ ok: true });
            }
            return true;
          });
        }
        (async function initOnLoad() {
          let sessionState = null;
          try {
            sessionState = sessionStorage.getItem("aifl_toolbar_open");
          } catch {
          }
          if (isGuestMode) {
            await ensureMounted();
            if (state.tornDown) return;
            if (sessionState !== "0") {
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
          const shouldShow = isGuestMode ? sessionState !== "0" : sessionState === "1" || session.connected && sessionState !== "0" || existing.length > 0 && sessionState !== "0";
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
    }
  });

  // content/styles.css
  var styles_default = '/* AI Feedback Loop \u2014 Shadow DOM Styles */\n:host {\n  all: initial;\n  font-family: "Inter", "Segoe UI Variable Text", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;\n  color: #f8fafc;\n  line-height: 1.45;\n  font-size: 13px;\n  -webkit-font-smoothing: antialiased;\n  -moz-osx-font-smoothing: grayscale;\n}\n\n*, *::before, *::after {\n  box-sizing: border-box;\n  font-family: inherit;\n}\n\n/* Overlay Layer */\n.aifl-layer {\n  position: fixed;\n  inset: 0;\n  pointer-events: none;\n  z-index: 2147483640;\n  overflow: visible;\n}\n\n/* Hover Inspector Box when in Add Comment Mode */\n.aifl-hover-box {\n  position: fixed;\n  pointer-events: none;\n  border: 2px solid #6366f1;\n  background: rgba(99, 102, 241, 0.10);\n  border-radius: 6px;\n  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.25), 0 8px 24px rgba(99, 102, 241, 0.22);\n  transition: top 0.04s linear, left 0.04s linear, width 0.04s linear, height 0.04s linear;\n  z-index: 2147483641;\n  display: none;\n}\n\n.aifl-hover-box.visible {\n  display: block;\n}\n\n.aifl-hover-label {\n  position: absolute;\n  top: -28px;\n  left: -2px;\n  background: #4f46e5;\n  color: #ffffff;\n  font-size: 11px;\n  font-weight: 600;\n  padding: 3px 8px;\n  border-radius: 5px;\n  white-space: nowrap;\n  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.28);\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  letter-spacing: 0.01em;\n}\n\n.aifl-hover-label .aifl-hover-hint {\n  opacity: 0.8;\n  font-weight: 400;\n}\n\n/* Free-Drop Dangling Pin Cursor (when holding Ctrl in drop-pin mode) */\n.aifl-free-cursor {\n  position: fixed;\n  pointer-events: none;\n  z-index: 2147483645;\n  display: none;\n  transform: translate(0, 0);\n}\n\n.aifl-free-cursor.visible {\n  display: block;\n}\n\n.aifl-dangling-pin {\n  position: absolute;\n  left: 0;\n  top: 0;\n  width: 32px;\n  height: 32px;\n  margin-left: -16px;\n  margin-top: -36px;\n  border-radius: 50% 50% 50% 5px;\n  transform: rotate(-45deg);\n  background: linear-gradient(135deg, #10b981 0%, #059669 100%);\n  border: 2px solid #ffffff;\n  box-shadow: 0 10px 22px rgba(2, 6, 23, 0.55), 0 0 0 2px rgba(16, 185, 129, 0.4);\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  animation: aifl-dangle-sway 1.4s ease-in-out infinite;\n}\n\n.aifl-dangling-pin span {\n  transform: rotate(45deg);\n  color: #ffffff;\n  font-weight: 700;\n  font-size: 12px;\n  line-height: 1;\n}\n\n.aifl-dangling-shadow {\n  position: absolute;\n  left: 0;\n  top: 0;\n  width: 12px;\n  height: 5px;\n  margin-left: -6px;\n  margin-top: -2px;\n  border-radius: 50%;\n  background: rgba(16, 185, 129, 0.75);\n  box-shadow: 0 0 8px rgba(16, 185, 129, 0.9);\n}\n\n@keyframes aifl-dangle-sway {\n  0%, 100% {\n    transform: rotate(-48deg) translateY(-2px);\n  }\n  50% {\n    transform: rotate(-42deg) translateY(0px);\n  }\n}\n\n.aifl-free-label {\n  position: absolute;\n  left: 20px;\n  top: -30px;\n  background: rgba(15, 23, 42, 0.94);\n  border: 1px solid rgba(16, 185, 129, 0.55);\n  color: #ecfdf5;\n  font-size: 11px;\n  font-weight: 600;\n  padding: 4px 9px;\n  border-radius: 6px;\n  white-space: nowrap;\n  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.38);\n  display: flex;\n  align-items: center;\n  gap: 6px;\n}\n\n.aifl-free-label .aifl-hover-hint {\n  color: #6ee7b7;\n  font-weight: 400;\n}\n\n/* Active Target Highlight Box (when focusing a comment from drawer/pin) */\n.aifl-focus-box {\n  position: fixed;\n  pointer-events: none;\n  border: 2px solid #f59e0b;\n  background: rgba(245, 158, 11, 0.14);\n  border-radius: 6px;\n  box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.28);\n  z-index: 2147483641;\n  display: none;\n  transition: all 0.15s ease-out;\n}\n\n.aifl-focus-box.visible {\n  display: block;\n  animation: aifl-pulse-ring 1.4s ease-out infinite;\n}\n\n@keyframes aifl-pulse-ring {\n  0% {\n    box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.55);\n  }\n  70% {\n    box-shadow: 0 0 0 10px rgba(245, 158, 11, 0);\n  }\n  100% {\n    box-shadow: 0 0 0 0 rgba(245, 158, 11, 0);\n  }\n}\n\n/* Pin Bubbles on Page */\n.aifl-pins-container {\n  position: fixed;\n  inset: 0;\n  pointer-events: none;\n  z-index: 2147483642;\n}\n\n.aifl-pin {\n  position: fixed;\n  width: 32px;\n  height: 32px;\n  margin-left: -16px;\n  margin-top: -16px;\n  border-radius: 50% 50% 50% 5px;\n  transform: rotate(-45deg);\n  background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);\n  border: 2px solid #ffffff;\n  box-shadow: 0 4px 14px rgba(15, 23, 42, 0.45), 0 0 0 1px rgba(99, 102, 241, 0.4);\n  cursor: grab;\n  pointer-events: auto;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  transition: transform 0.15s cubic-bezier(0.16, 1, 0.3, 1), background 0.15s ease, box-shadow 0.15s ease;\n  user-select: none;\n}\n\n.aifl-pin.free-pin {\n  background: linear-gradient(135deg, #10b981 0%, #059669 100%);\n  box-shadow: 0 4px 14px rgba(15, 23, 42, 0.45), 0 0 0 1px rgba(16, 185, 129, 0.45);\n}\n\n.aifl-pin.dragging {\n  cursor: grabbing;\n  transition: none;\n  transform: rotate(-45deg) scale(1.22);\n  z-index: 2147483647;\n  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.65), 0 0 0 3px rgba(99, 102, 241, 0.55);\n}\n\n.aifl-pin span.aifl-pin-num {\n  transform: rotate(45deg);\n  color: #ffffff;\n  font-weight: 700;\n  font-size: 12px;\n  line-height: 1;\n  pointer-events: none;\n}\n\n/* Mini 3-dot gripper on bottom-right of the chat bubble */\n.aifl-pin-gripper {\n  position: absolute;\n  right: -5px;\n  bottom: 5px;\n  transform: rotate(45deg);\n  background: rgba(15, 23, 42, 0.92);\n  border: 1px solid rgba(255, 255, 255, 0.45);\n  border-radius: 999px;\n  padding: 1.5px 3.5px;\n  display: flex;\n  align-items: center;\n   gap: 1.5px;\n  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);\n  pointer-events: auto;\n  cursor: grab;\n  opacity: 0.88;\n  transition: opacity 0.15s ease, transform 0.15s ease, background 0.15s ease;\n}\n\n.aifl-pin:hover .aifl-pin-gripper {\n  opacity: 1;\n  background: #312e81;\n  border-color: #a5b4fc;\n  transform: rotate(45deg) scale(1.1);\n}\n\n.aifl-pin-gripper i {\n  display: block;\n  width: 2.5px;\n  height: 2.5px;\n  border-radius: 50%;\n  background: #e2e8f0;\n}\n\n.aifl-pin:hover {\n  transform: rotate(-45deg) scale(1.14);\n  z-index: 2147483645;\n  box-shadow: 0 6px 20px rgba(79, 70, 229, 0.65), 0 0 0 2px rgba(255, 255, 255, 0.9);\n}\n\n.aifl-pin.active {\n  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);\n  transform: rotate(-45deg) scale(1.18);\n  z-index: 2147483645;\n  box-shadow: 0 0 0 4px rgba(245, 158, 11, 0.35), 0 8px 20px rgba(0, 0, 0, 0.4);\n}\n\n/* Pin Hover Tooltip */\n.aifl-pin-tooltip {\n  position: absolute;\n  left: 36px;\n  top: -6px;\n  transform: rotate(45deg);\n  transform-origin: top left;\n  background: rgba(15, 23, 42, 0.96);\n  backdrop-filter: blur(10px);\n  border: 1px solid rgba(148, 163, 184, 0.25);\n  color: #f8fafc;\n  padding: 6px 10px;\n  border-radius: 8px;\n  font-size: 12px;\n  font-weight: 500;\n  white-space: nowrap;\n  max-width: 240px;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  pointer-events: none;\n  opacity: 0;\n  transition: opacity 0.15s ease;\n  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);\n}\n\n.aifl-pin:hover .aifl-pin-tooltip {\n  opacity: 1;\n}\n\n.aifl-pin.dragging .aifl-pin-tooltip {\n  opacity: 0;\n}\n\n/* Floating Comment Prompt Popover (create or edit a pin, freely movable) */\n.aifl-popover {\n  position: fixed;\n  width: 340px;\n  background: rgba(15, 23, 42, 0.97);\n  backdrop-filter: blur(16px);\n  border: 1px solid rgba(148, 163, 184, 0.32);\n  border-radius: 14px;\n  padding: 12px 14px 14px 12px;\n  box-shadow: 0 20px 44px rgba(2, 6, 23, 0.7), 0 0 0 1px rgba(99, 102, 241, 0.28);\n  pointer-events: auto;\n  z-index: 2147483646;\n  display: none;\n  animation: aifl-pop-in 0.14s cubic-bezier(0.16, 1, 0.3, 1);\n  user-select: none;\n}\n\n.aifl-popover.visible {\n  display: block;\n}\n\n.aifl-popover.dragging {\n  box-shadow: 0 26px 56px rgba(2, 6, 23, 0.85), 0 0 0 2px rgba(99, 102, 241, 0.55);\n}\n\n@keyframes aifl-pop-in {\n  from {\n    opacity: 0;\n    transform: translateY(6px) scale(0.97);\n  }\n  to {\n    opacity: 1;\n    transform: translateY(0) scale(1);\n  }\n}\n\n.aifl-popover-header {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  margin-bottom: 8px;\n  gap: 8px;\n  cursor: grab;\n  padding: 2px 0;\n}\n\n.aifl-popover-header:active {\n  cursor: grabbing;\n}\n\n.aifl-popover-header-left {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  min-width: 0;\n}\n\n.aifl-popover-badge {\n  font-size: 11px;\n  font-weight: 700;\n  color: #ffffff;\n  background: #4f46e5;\n  padding: 1px 7px;\n  border-radius: 999px;\n  flex-shrink: 0;\n}\n\n.aifl-popover-target {\n  font-family: inherit;\n  font-size: 11px;\n  color: #a5b4fc;\n  background: rgba(99, 102, 241, 0.16);\n  padding: 2px 7px;\n  border-radius: 5px;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  max-width: 210px;\n}\n\n.aifl-popover-close {\n  background: transparent;\n  border: none;\n  color: #94a3b8;\n  cursor: pointer;\n  padding: 2px 5px;\n  border-radius: 4px;\n  font-size: 15px;\n  line-height: 1;\n}\n\n.aifl-popover-close:hover {\n  color: #ffffff;\n  background: rgba(255, 255, 255, 0.1);\n}\n\n.aifl-popover-textarea {\n  width: 100%;\n  min-height: 76px;\n  background: rgba(30, 41, 59, 0.85);\n  border: 1px solid rgba(148, 163, 184, 0.3);\n  border-radius: 8px;\n  color: #f8fafc;\n  font-family: inherit;\n  font-size: 13px;\n  padding: 8px 10px;\n  resize: none;\n  outline: none;\n  margin-bottom: 10px;\n  user-select: text;\n}\n\n.aifl-popover-textarea:focus {\n  border-color: #6366f1;\n  box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.25);\n}\n\n.aifl-popover-footer {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 8px;\n  padding-right: 18px;\n}\n\n.aifl-popover-hint {\n  font-size: 11px;\n  color: #64748b;\n}\n\n.aifl-popover-actions {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n}\n\n/* Bottom-Right 3-Dot Gripper Grabhandle */\n.aifl-gripper-br {\n  position: absolute;\n  right: 5px;\n  bottom: 5px;\n  width: 22px;\n  height: 22px;\n  display: flex;\n  align-items: flex-end;\n  justify-content: flex-end;\n  padding: 3px;\n  cursor: grab;\n  border-radius: 6px;\n  color: #94a3b8;\n  transition: color 0.14s ease, background 0.14s ease, transform 0.14s ease;\n  user-select: none;\n}\n\n.aifl-gripper-br:hover {\n  color: #f8fafc;\n  background: rgba(99, 102, 241, 0.22);\n  transform: scale(1.08);\n}\n\n.aifl-gripper-br:active {\n  cursor: grabbing;\n  color: #a5b4fc;\n}\n\n.aifl-gripper-br svg {\n  width: 13px;\n  height: 13px;\n  display: block;\n  pointer-events: none;\n}\n\n/* Floating Navigation Control Bar */\n.aifl-toolbar {\n  position: fixed;\n  bottom: 24px;\n  left: 50%;\n  transform: translateX(-50%);\n  background: rgba(15, 23, 42, 0.94);\n  backdrop-filter: blur(16px);\n  border: 1px solid rgba(148, 163, 184, 0.25);\n  border-radius: 999px;\n  padding: 6px 8px 6px 12px;\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  box-shadow: 0 16px 40px rgba(2, 6, 23, 0.55), 0 0 0 1px rgba(255, 255, 255, 0.06);\n  pointer-events: auto;\n  z-index: 2147483646;\n  user-select: none;\n  transition: opacity 0.18s ease, transform 0.18s ease;\n}\n\n.aifl-toolbar.hidden {\n  display: none;\n}\n\n.aifl-drag-handle {\n  cursor: grab;\n  display: flex;\n  align-items: center;\n  gap: 7px;\n  padding-right: 6px;\n  border-right: 1px solid rgba(148, 163, 184, 0.2);\n  color: #cbd5e1;\n  font-weight: 600;\n  font-size: 12px;\n  letter-spacing: -0.01em;\n}\n\n.aifl-drag-handle:active {\n  cursor: grabbing;\n}\n\n.aifl-brand-dot {\n  width: 8px;\n  height: 8px;\n  border-radius: 50%;\n  background: #6366f1;\n  box-shadow: 0 0 8px #6366f1;\n}\n\n.aifl-toolbar.inspecting .aifl-brand-dot {\n  background: #22c55e;\n  box-shadow: 0 0 10px #22c55e;\n}\n\n/* Toolbar Buttons */\n.aifl-btn {\n  appearance: none;\n  border: 1px solid transparent;\n  background: rgba(30, 41, 59, 0.85);\n  color: #e2e8f0;\n  font-family: inherit;\n  font-size: 12px;\n  font-weight: 500;\n  padding: 6px 11px;\n  border-radius: 999px;\n  cursor: pointer;\n  display: inline-flex;\n  align-items: center;\n  gap: 6px;\n  transition: all 0.14s ease;\n  white-space: nowrap;\n}\n\n.aifl-btn:hover {\n  background: rgba(51, 65, 85, 0.95);\n  color: #ffffff;\n}\n\n.aifl-btn-primary {\n  background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);\n  color: #ffffff;\n  font-weight: 600;\n  box-shadow: 0 2px 10px rgba(99, 102, 241, 0.35);\n}\n\n.aifl-btn-primary:hover {\n  background: linear-gradient(135deg, #818cf8 0%, #6366f1 100%);\n}\n\n.aifl-btn-primary.active {\n  background: linear-gradient(135deg, #10b981 0%, #059669 100%);\n  box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.35), 0 4px 12px rgba(16, 185, 129, 0.4);\n}\n\n.aifl-btn-danger {\n  background: rgba(239, 68, 68, 0.16);\n  color: #fca5a5;\n  border-color: rgba(239, 68, 68, 0.3);\n}\n\n.aifl-btn-danger:hover {\n  background: rgba(239, 68, 68, 0.28);\n  color: #ffffff;\n}\n\n.aifl-btn-confirm {\n  background: #ef4444;\n  color: #ffffff;\n  font-weight: 600;\n}\n\n.aifl-btn-confirm:hover {\n  background: #dc2626;\n}\n\n.aifl-btn-icon {\n  padding: 6px 8px;\n  color: #94a3b8;\n  background: transparent;\n}\n\n.aifl-btn-icon:hover {\n  color: #ffffff;\n  background: rgba(255, 255, 255, 0.08);\n}\n\n.aifl-btn-toggle {\n  border-color: rgba(148, 163, 184, 0.2);\n  color: #cbd5e1;\n}\n\n.aifl-btn-toggle .aifl-toggle-dot {\n  width: 7px;\n  height: 7px;\n  border-radius: 50%;\n  background: #64748b;\n  transition: background 0.14s ease, box-shadow 0.14s ease;\n}\n\n.aifl-btn-toggle.active {\n  background: rgba(16, 185, 129, 0.2);\n  border-color: rgba(16, 185, 129, 0.45);\n  color: #6ee7b7;\n}\n\n.aifl-btn-toggle.active:hover {\n  background: rgba(16, 185, 129, 0.28);\n  color: #a7f3d0;\n}\n\n.aifl-btn-toggle.active .aifl-toggle-dot {\n  background: #10b981;\n  box-shadow: 0 0 8px rgba(16, 185, 129, 0.75);\n}\n\n.aifl-badge {\n  background: rgba(99, 102, 241, 0.28);\n  color: #c7d2fe;\n  font-size: 11px;\n  font-weight: 700;\n  padding: 1px 6px;\n  border-radius: 999px;\n  min-width: 18px;\n  text-align: center;\n}\n\n/* Right-Hand Slide-Out Drawer */\n.aifl-drawer {\n  position: fixed;\n  top: 0;\n  right: 0;\n  width: 410px;\n  max-width: 92vw;\n  height: 100vh;\n  background: rgba(15, 23, 42, 0.97);\n  backdrop-filter: blur(20px);\n  border-left: 1px solid rgba(148, 163, 184, 0.22);\n  box-shadow: -16px 0 48px rgba(2, 6, 23, 0.65);\n  display: flex;\n  flex-direction: column;\n  pointer-events: auto;\n  z-index: 2147483647;\n  transform: translateX(104%);\n  transition: transform 0.26s cubic-bezier(0.16, 1, 0.3, 1);\n}\n\n.aifl-drawer.open {\n  transform: translateX(0);\n}\n\n.aifl-drawer-header {\n  padding: 16px 18px 12px;\n  border-bottom: 1px solid rgba(148, 163, 184, 0.16);\n  display: flex;\n  flex-direction: column;\n  gap: 12px;\n  background: rgba(2, 6, 23, 0.35);\n}\n\n.aifl-drawer-title-row {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n}\n\n.aifl-drawer-title {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  font-size: 15px;\n  font-weight: 700;\n  color: #f8fafc;\n  margin: 0;\n}\n\n.aifl-drawer-controls-row {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 8px;\n}\n\n/* Scope Filter Tabs (All Screens vs Current Screen) */\n.aifl-tabs {\n  display: inline-flex;\n  background: rgba(30, 41, 59, 0.9);\n  padding: 3px;\n  border-radius: 8px;\n  border: 1px solid rgba(148, 163, 184, 0.16);\n}\n\n.aifl-tab {\n  border: none;\n  background: transparent;\n  color: #94a3b8;\n  font-family: inherit;\n  font-size: 11.5px;\n  font-weight: 600;\n  padding: 4px 10px;\n  border-radius: 6px;\n  cursor: pointer;\n  transition: all 0.12s ease;\n}\n\n.aifl-tab.active {\n  background: #4f46e5;\n  color: #ffffff;\n  box-shadow: 0 2px 6px rgba(79, 70, 229, 0.35);\n}\n\n/* Drawer Body / Comment Cards */\n.aifl-drawer-body {\n  flex: 1;\n  overflow-y: auto;\n  padding: 14px 16px;\n  display: flex;\n  flex-direction: column;\n  gap: 12px;\n}\n\n.aifl-empty-state {\n  text-align: center;\n  padding: 48px 20px;\n  color: #94a3b8;\n}\n\n.aifl-empty-icon {\n  font-size: 28px;\n  margin-bottom: 10px;\n  opacity: 0.7;\n}\n\n.aifl-empty-title {\n  font-size: 14px;\n  font-weight: 600;\n  color: #e2e8f0;\n  margin-bottom: 6px;\n}\n\n.aifl-empty-desc {\n  font-size: 12px;\n  color: #64748b;\n  max-width: 260px;\n  margin: 0 auto 16px;\n}\n\n/* Comment Card */\n.aifl-card {\n  background: rgba(30, 41, 59, 0.65);\n  border: 1px solid rgba(148, 163, 184, 0.18);\n  border-radius: 12px;\n  padding: 12px;\n  transition: border-color 0.16s ease, box-shadow 0.16s ease, background 0.16s ease;\n}\n\n.aifl-card:hover {\n  border-color: rgba(148, 163, 184, 0.35);\n}\n\n.aifl-card.focused {\n  border-color: #f59e0b;\n  background: rgba(30, 41, 59, 0.92);\n  box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.25), 0 8px 24px rgba(0, 0, 0, 0.35);\n}\n\n.aifl-card-header {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 8px;\n  margin-bottom: 8px;\n}\n\n.aifl-card-left {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  min-width: 0;\n}\n\n.aifl-pin-badge {\n  width: 22px;\n  height: 22px;\n  border-radius: 50%;\n  background: #4f46e5;\n  color: #ffffff;\n  font-weight: 700;\n  font-size: 11px;\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  flex-shrink: 0;\n}\n\n.aifl-card.focused .aifl-pin-badge {\n  background: #f59e0b;\n  color: #0f172a;\n}\n\n.aifl-screen-pill {\n  font-size: 11px;\n  color: #cbd5e1;\n  background: rgba(15, 23, 42, 0.7);\n  border: 1px solid rgba(148, 163, 184, 0.2);\n  padding: 2px 7px;\n  border-radius: 5px;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.aifl-status-pill {\n  font-size: 10.5px;\n  font-weight: 600;\n  padding: 2px 6px;\n  border-radius: 4px;\n  white-space: nowrap;\n}\n\n.aifl-status-pill.hidden-el {\n  background: rgba(245, 158, 11, 0.16);\n  color: #fcd34d;\n  border: 1px solid rgba(245, 158, 11, 0.3);\n}\n\n.aifl-status-pill.other-screen {\n  background: rgba(56, 189, 248, 0.15);\n  color: #7dd3fc;\n  border: 1px solid rgba(56, 189, 248, 0.3);\n}\n\n.aifl-card-actions {\n  display: flex;\n  align-items: center;\n  gap: 4px;\n  flex-shrink: 0;\n}\n\n.aifl-icon-btn {\n  border: none;\n  background: rgba(15, 23, 42, 0.55);\n  color: #94a3b8;\n  font-size: 11px;\n  padding: 4px 7px;\n  border-radius: 6px;\n  cursor: pointer;\n  transition: all 0.12s ease;\n}\n\n.aifl-icon-btn:hover {\n  background: rgba(99, 102, 241, 0.25);\n  color: #ffffff;\n}\n\n.aifl-icon-btn.delete:hover {\n  background: rgba(239, 68, 68, 0.25);\n  color: #fca5a5;\n}\n\n.aifl-card-textarea {\n  width: 100%;\n  min-height: 54px;\n  background: rgba(15, 23, 42, 0.7);\n  border: 1px solid rgba(148, 163, 184, 0.22);\n  border-radius: 8px;\n  color: #f8fafc;\n  font-family: inherit;\n  font-size: 12.5px;\n  padding: 7px 9px;\n  resize: vertical;\n  outline: none;\n  margin-bottom: 8px;\n}\n\n.aifl-card-textarea:focus {\n  border-color: #6366f1;\n  background: rgba(15, 23, 42, 0.95);\n}\n\n/* Target Details Box inside Card */\n.aifl-meta-box {\n  background: rgba(15, 23, 42, 0.55);\n  border: 1px solid rgba(148, 163, 184, 0.13);\n  border-radius: 8px;\n  padding: 8px 10px;\n  font-size: 11.5px;\n  color: #94a3b8;\n  display: flex;\n  flex-direction: column;\n  gap: 4px;\n}\n\n.aifl-meta-row {\n  display: flex;\n  align-items: baseline;\n  gap: 6px;\n  overflow: hidden;\n}\n\n.aifl-meta-key {\n  color: #64748b;\n  font-weight: 600;\n  font-size: 10.5px;\n  text-transform: uppercase;\n  letter-spacing: 0.03em;\n  flex-shrink: 0;\n  min-width: 58px;\n}\n\n.aifl-meta-val {\n  color: #cbd5e1;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.aifl-meta-code {\n  font-family: inherit;\n  font-size: 11px;\n  color: #a5b4fc;\n}\n\n/* Prompt Preview Accordion in Drawer Footer */\n.aifl-drawer-footer {\n  padding: 12px 16px 16px;\n  border-top: 1px solid rgba(148, 163, 184, 0.18);\n  background: rgba(2, 6, 23, 0.6);\n  display: flex;\n  flex-direction: column;\n  gap: 10px;\n}\n\n.aifl-preview-details {\n  background: rgba(15, 23, 42, 0.8);\n  border: 1px solid rgba(148, 163, 184, 0.2);\n  border-radius: 8px;\n  overflow: hidden;\n}\n\n.aifl-preview-summary {\n  padding: 7px 10px;\n  font-size: 11.5px;\n  font-weight: 600;\n  color: #cbd5e1;\n  cursor: pointer;\n  user-select: none;\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n}\n\n.aifl-preview-summary:hover {\n  color: #ffffff;\n}\n\n.aifl-preview-pre {\n  margin: 0;\n  padding: 8px 10px;\n  border-top: 1px solid rgba(148, 163, 184, 0.15);\n  font-family: inherit;\n  font-size: 11px;\n  color: #cbd5e1;\n  max-height: 170px;\n  overflow-y: auto;\n  white-space: pre-wrap;\n  word-break: break-word;\n  background: rgba(2, 6, 23, 0.65);\n}\n\n.aifl-footer-primary-row {\n  display: flex;\n  gap: 8px;\n}\n\n.aifl-footer-primary-row .aifl-btn-primary {\n  flex: 1;\n  justify-content: center;\n  padding: 9px 14px;\n  font-size: 13px;\n  border-radius: 9px;\n}\n\n.aifl-footer-secondary-row {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 8px;\n}\n\n/* Toast Notification */\n.aifl-toast {\n  position: fixed;\n  bottom: 80px;\n  left: 50%;\n  transform: translateX(-50%) translateY(10px);\n  background: rgba(15, 23, 42, 0.96);\n  border: 1px solid rgba(99, 102, 241, 0.45);\n  color: #f8fafc;\n  padding: 8px 16px;\n  border-radius: 999px;\n  font-size: 12.5px;\n  font-weight: 600;\n  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);\n  pointer-events: none;\n  opacity: 0;\n  transition: opacity 0.18s ease, transform 0.18s ease;\n  z-index: 2147483647;\n}\n\n.aifl-toast.visible {\n  opacity: 1;\n  transform: translateX(-50%) translateY(0);\n}\n\n/* ============================================================\n * Live Collaboration v2.0.0 \u2014 Cursors, Statuses, Inbox & Threads\n * ============================================================ */\n\n/* Live Multiplayer Cursors */\n.aifl-cursors-container {\n  position: fixed;\n  inset: 0;\n  pointer-events: none;\n  z-index: 2147483643;\n  overflow: hidden;\n}\n\n.aifl-peer-cursor {\n  position: fixed;\n  left: 0;\n  top: 0;\n  pointer-events: none;\n  display: flex;\n  align-items: flex-start;\n  gap: 4px;\n  transform: translate(-2px, -2px);\n  transition: left 0.06s linear, top 0.06s linear, opacity 0.35s ease;\n  will-change: left, top, opacity;\n  opacity: 1;\n}\n\n.aifl-peer-cursor.stale {\n  opacity: 0.25;\n}\n\n.aifl-peer-cursor-arrow {\n  width: 18px;\n  height: 18px;\n  filter: drop-shadow(0 2px 4px rgba(2, 6, 23, 0.55));\n  flex-shrink: 0;\n}\n\n.aifl-peer-cursor-pill {\n  margin-top: 12px;\n  margin-left: -4px;\n  padding: 2px 8px;\n  border-radius: 999px;\n  font-size: 11px;\n  font-weight: 700;\n  color: #ffffff;\n  white-space: nowrap;\n  box-shadow: 0 4px 12px rgba(2, 6, 23, 0.45);\n  border: 1px solid rgba(255, 255, 255, 0.35);\n}\n\n/* Visual Pin Status Variants */\n.aifl-pin.status-approved {\n  background: linear-gradient(135deg, #6366f1 0%, #4338ca 100%);\n  border-color: #a5b4fc;\n  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.45), 0 6px 18px rgba(79, 70, 229, 0.55);\n}\n\n.aifl-pin.free-pin.status-approved {\n  background: linear-gradient(135deg, #10b981 0%, #047857 100%);\n  border-color: #6ee7b7;\n  box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.45), 0 6px 18px rgba(5, 150, 105, 0.55);\n}\n\n.aifl-pin.status-in_progress {\n  background: linear-gradient(135deg, #06b6d4 0%, #0284c7 100%);\n  border-color: #cffafe;\n  box-shadow: 0 0 0 3px rgba(6, 182, 212, 0.45), 0 6px 18px rgba(6, 182, 212, 0.5);\n}\n\n.aifl-pin.status-resolved {\n  background: linear-gradient(135deg, #10b981 0%, #059669 100%);\n  border-color: rgba(255, 255, 255, 0.75);\n  opacity: 0.62;\n  box-shadow: 0 2px 10px rgba(16, 185, 129, 0.3);\n}\n\n.aifl-pin.status-resolved:hover {\n  opacity: 0.95;\n}\n\n.aifl-pin-check {\n  position: absolute;\n  top: -6px;\n  right: -5px;\n  transform: rotate(45deg);\n  width: 15px;\n  height: 15px;\n  border-radius: 50%;\n  background: #059669;\n  border: 1.5px solid #ffffff;\n  color: #ffffff;\n  font-size: 9px;\n  font-weight: 800;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);\n  pointer-events: none;\n}\n\n/* Toolbar Live Status Pill & Connect Popover */\n.aifl-live-pill {\n  background: rgba(30, 41, 59, 0.95);\n  border: 1px solid rgba(148, 163, 184, 0.25);\n  padding: 5px 10px;\n  font-size: 11.5px;\n  font-weight: 600;\n  color: #e2e8f0;\n}\n\n.aifl-live-pill.is-live {\n  border-color: rgba(16, 185, 129, 0.45);\n  background: rgba(16, 185, 129, 0.14);\n  color: #d1fae5;\n}\n\n.aifl-live-pill.is-connecting {\n  border-color: rgba(245, 158, 11, 0.45);\n  background: rgba(245, 158, 11, 0.14);\n  color: #fef3c7;\n}\n\n.aifl-live-dot {\n  width: 7px;\n  height: 7px;\n  border-radius: 50%;\n  background: #94a3b8;\n  flex-shrink: 0;\n}\n\n.aifl-live-pill.is-live .aifl-live-dot {\n  background: #10b981;\n  box-shadow: 0 0 8px #10b981;\n}\n\n.aifl-live-pill.is-connecting .aifl-live-dot {\n  background: #f59e0b;\n  box-shadow: 0 0 8px #f59e0b;\n}\n\n.aifl-connect-popover {\n  position: fixed;\n  bottom: 78px;\n  left: 50%;\n  transform: translateX(-50%);\n  width: 336px;\n  max-width: calc(100vw - 24px);\n  background: rgba(15, 23, 42, 0.98);\n  backdrop-filter: blur(18px);\n  border: 1px solid rgba(148, 163, 184, 0.28);\n  border-radius: 14px;\n  padding: 14px;\n  box-shadow: 0 20px 44px rgba(2, 6, 23, 0.72), 0 0 0 1px rgba(99, 102, 241, 0.22);\n  pointer-events: auto;\n  z-index: 2147483647;\n  display: none;\n  flex-direction: column;\n  gap: 10px;\n}\n\n.aifl-connect-popover.visible {\n  display: flex;\n}\n\n.aifl-connect-header {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 8px;\n  font-size: 13px;\n  font-weight: 700;\n  color: #f8fafc;\n}\n\n.aifl-connect-sub {\n  font-size: 11.5px;\n  color: #94a3b8;\n}\n\n.aifl-field-group {\n  display: flex;\n  flex-direction: column;\n  gap: 4px;\n}\n\n.aifl-field-label {\n  font-size: 10.5px;\n  font-weight: 600;\n  text-transform: uppercase;\n  letter-spacing: 0.04em;\n  color: #94a3b8;\n}\n\n.aifl-input-row {\n  display: flex;\n  gap: 6px;\n  align-items: center;\n}\n\n.aifl-input {\n  flex: 1;\n  min-width: 0;\n  background: rgba(30, 41, 59, 0.9);\n  border: 1px solid rgba(148, 163, 184, 0.28);\n  border-radius: 8px;\n  color: #f8fafc;\n  font-family: inherit;\n  font-size: 12px;\n  padding: 6px 9px;\n  outline: none;\n}\n\n.aifl-input:focus {\n  border-color: #6366f1;\n  box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.22);\n}\n\n.aifl-peers-list {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 6px;\n}\n\n.aifl-peer-chip {\n  display: inline-flex;\n  align-items: center;\n  gap: 5px;\n  padding: 3px 8px;\n  border-radius: 999px;\n  background: rgba(30, 41, 59, 0.9);\n  border: 1px solid rgba(148, 163, 184, 0.2);\n  font-size: 11px;\n  color: #e2e8f0;\n}\n\n.aifl-peer-dot {\n  width: 7px;\n  height: 7px;\n  border-radius: 50%;\n  flex-shrink: 0;\n}\n\n/* Host Review Inbox \u2014 Status Filters & Batch Triage */\n.aifl-status-filters {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 4px;\n}\n\n.aifl-status-tab {\n  border: 1px solid rgba(148, 163, 184, 0.16);\n  background: rgba(30, 41, 59, 0.72);\n  color: #94a3b8;\n  font-family: inherit;\n  font-size: 11px;\n  font-weight: 600;\n  padding: 4px 8px;\n  border-radius: 999px;\n  cursor: pointer;\n  transition: all 0.12s ease;\n}\n\n.aifl-status-tab:hover {\n  color: #f8fafc;\n  border-color: rgba(148, 163, 184, 0.32);\n}\n\n.aifl-status-tab.active {\n  background: rgba(99, 102, 241, 0.24);\n  border-color: rgba(99, 102, 241, 0.55);\n  color: #e0e7ff;\n}\n\n.aifl-batch-bar {\n  padding: 8px 14px;\n  background: rgba(15, 23, 42, 0.85);\n  border-bottom: 1px solid rgba(148, 163, 184, 0.16);\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  justify-content: space-between;\n  gap: 6px;\n}\n\n.aifl-batch-bar.hidden {\n  display: none;\n}\n\n.aifl-batch-left,\n.aifl-batch-actions {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n}\n\n.aifl-btn-sm {\n  padding: 4px 9px;\n  font-size: 11px;\n  border-radius: 7px;\n}\n\n.aifl-checkbox {\n  width: 15px;\n  height: 15px;\n  accent-color: #6366f1;\n  cursor: pointer;\n  flex-shrink: 0;\n  margin: 0;\n}\n\n/* Card Status, Author & Triage Controls */\n.aifl-card.status-resolved {\n  opacity: 0.78;\n  border-color: rgba(16, 185, 129, 0.28);\n}\n\n.aifl-card-subrow {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  flex-wrap: wrap;\n  gap: 6px;\n  margin-bottom: 8px;\n}\n\n.aifl-card-badges {\n  display: flex;\n  align-items: center;\n  flex-wrap: wrap;\n  gap: 5px;\n}\n\n.aifl-status-pill.status-pending {\n  background: rgba(245, 158, 11, 0.16);\n  color: #fcd34d;\n  border: 1px solid rgba(245, 158, 11, 0.35);\n}\n\n.aifl-status-pill.status-approved {\n  background: rgba(99, 102, 241, 0.22);\n  color: #c7d2fe;\n  border: 1px solid rgba(99, 102, 241, 0.45);\n}\n\n.aifl-status-pill.status-in_progress {\n  background: rgba(6, 182, 212, 0.18);\n  color: #67e8f9;\n  border: 1px solid rgba(6, 182, 212, 0.4);\n}\n\n.aifl-status-pill.status-resolved {\n  background: rgba(16, 185, 129, 0.18);\n  color: #6ee7b7;\n  border: 1px solid rgba(16, 185, 129, 0.4);\n}\n\n.aifl-author-pill {\n  display: inline-flex;\n  align-items: center;\n  gap: 5px;\n  font-size: 10.5px;\n  font-weight: 600;\n  padding: 2px 7px;\n  border-radius: 999px;\n  background: rgba(15, 23, 42, 0.75);\n  border: 1px solid rgba(148, 163, 184, 0.2);\n  color: #cbd5e1;\n}\n\n.aifl-triage-actions {\n  display: flex;\n  align-items: center;\n  gap: 4px;\n}\n\n.aifl-triage-btn {\n  border: 1px solid rgba(148, 163, 184, 0.22);\n  background: rgba(15, 23, 42, 0.7);\n  color: #cbd5e1;\n  font-family: inherit;\n  font-size: 10.5px;\n  font-weight: 600;\n  padding: 3px 8px;\n  border-radius: 6px;\n  cursor: pointer;\n  transition: all 0.12s ease;\n}\n\n.aifl-triage-btn.approve {\n  background: rgba(99, 102, 241, 0.2);\n  border-color: rgba(99, 102, 241, 0.45);\n  color: #c7d2fe;\n}\n\n.aifl-triage-btn.approve:hover {\n  background: rgba(99, 102, 241, 0.36);\n  color: #ffffff;\n}\n\n.aifl-triage-btn.resolve {\n  background: rgba(16, 185, 129, 0.18);\n  border-color: rgba(16, 185, 129, 0.4);\n  color: #6ee7b7;\n}\n\n.aifl-triage-btn.resolve:hover {\n  background: rgba(16, 185, 129, 0.34);\n  color: #ffffff;\n}\n\n.aifl-triage-btn.reopen:hover {\n  background: rgba(245, 158, 11, 0.2);\n  border-color: rgba(245, 158, 11, 0.4);\n  color: #fcd34d;\n}\n\n.aifl-card-textarea[readonly] {\n  opacity: 0.85;\n  cursor: default;\n}\n\n/* Threaded Replies Section */\n.aifl-replies-section {\n  margin-top: 8px;\n  padding-top: 8px;\n  border-top: 1px solid rgba(148, 163, 184, 0.14);\n  display: flex;\n  flex-direction: column;\n  gap: 6px;\n}\n\n.aifl-replies-list {\n  display: flex;\n  flex-direction: column;\n  gap: 5px;\n}\n\n.aifl-reply-item {\n  background: rgba(15, 23, 42, 0.65);\n  border: 1px solid rgba(148, 163, 184, 0.14);\n  border-radius: 7px;\n  padding: 6px 8px;\n  font-size: 11.5px;\n}\n\n.aifl-reply-item.role-agent {\n  border-color: rgba(168, 85, 247, 0.35);\n  background: rgba(88, 28, 135, 0.18);\n}\n\n.aifl-reply-header {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 6px;\n  margin-bottom: 2px;\n}\n\n.aifl-reply-author {\n  font-weight: 700;\n  font-size: 11px;\n  color: #e2e8f0;\n}\n\n.aifl-reply-role {\n  font-size: 9.5px;\n  font-weight: 700;\n  text-transform: uppercase;\n  padding: 1px 5px;\n  border-radius: 4px;\n  background: rgba(148, 163, 184, 0.16);\n  color: #cbd5e1;\n}\n\n.aifl-reply-role.host {\n  background: rgba(99, 102, 241, 0.22);\n  color: #c7d2fe;\n}\n\n.aifl-reply-role.guest {\n  background: rgba(16, 185, 129, 0.18);\n  color: #6ee7b7;\n}\n\n.aifl-reply-role.agent {\n  background: rgba(168, 85, 247, 0.25);\n  color: #e9d5ff;\n}\n\n.aifl-reply-text {\n  color: #cbd5e1;\n  line-height: 1.4;\n  word-break: break-word;\n}\n\n.aifl-reply-form {\n  display: flex;\n  gap: 6px;\n  align-items: center;\n}\n\n.aifl-reply-input {\n  flex: 1;\n  min-width: 0;\n  background: rgba(15, 23, 42, 0.78);\n  border: 1px solid rgba(148, 163, 184, 0.22);\n  border-radius: 7px;\n  color: #f8fafc;\n  font-family: inherit;\n  font-size: 11.5px;\n  padding: 5px 8px;\n  outline: none;\n}\n\n.aifl-reply-input:focus {\n  border-color: #6366f1;\n}\n\n.aifl-reply-send {\n  border: 1px solid rgba(99, 102, 241, 0.45);\n  background: rgba(99, 102, 241, 0.24);\n  color: #e0e7ff;\n  font-family: inherit;\n  font-size: 11px;\n  font-weight: 600;\n  padding: 5px 9px;\n  border-radius: 7px;\n  cursor: pointer;\n}\n\n.aifl-reply-send:hover {\n  background: rgba(99, 102, 241, 0.42);\n  color: #ffffff;\n}\n\n\n';

  // node_modules/yjs/dist/yjs.mjs
  var yjs_exports = {};
  __export(yjs_exports, {
    AbsolutePosition: () => AbsolutePosition,
    AbstractConnector: () => AbstractConnector,
    AbstractStruct: () => AbstractStruct,
    AbstractType: () => AbstractType,
    Array: () => YArray,
    ContentAny: () => ContentAny,
    ContentBinary: () => ContentBinary,
    ContentDeleted: () => ContentDeleted,
    ContentDoc: () => ContentDoc,
    ContentEmbed: () => ContentEmbed,
    ContentFormat: () => ContentFormat,
    ContentJSON: () => ContentJSON,
    ContentString: () => ContentString,
    ContentType: () => ContentType,
    Doc: () => Doc,
    GC: () => GC,
    ID: () => ID,
    Item: () => Item,
    Map: () => YMap,
    PermanentUserData: () => PermanentUserData,
    RelativePosition: () => RelativePosition,
    Skip: () => Skip,
    Snapshot: () => Snapshot,
    Text: () => YText,
    Transaction: () => Transaction,
    UndoManager: () => UndoManager,
    UpdateDecoderV1: () => UpdateDecoderV1,
    UpdateDecoderV2: () => UpdateDecoderV2,
    UpdateEncoderV1: () => UpdateEncoderV1,
    UpdateEncoderV2: () => UpdateEncoderV2,
    XmlElement: () => YXmlElement,
    XmlFragment: () => YXmlFragment,
    XmlHook: () => YXmlHook,
    XmlText: () => YXmlText,
    YArrayEvent: () => YArrayEvent,
    YEvent: () => YEvent,
    YMapEvent: () => YMapEvent,
    YTextEvent: () => YTextEvent,
    YXmlEvent: () => YXmlEvent,
    applyUpdate: () => applyUpdate,
    applyUpdateV2: () => applyUpdateV2,
    cleanupYTextFormatting: () => cleanupYTextFormatting,
    compareIDs: () => compareIDs,
    compareRelativePositions: () => compareRelativePositions,
    convertUpdateFormatV1ToV2: () => convertUpdateFormatV1ToV2,
    convertUpdateFormatV2ToV1: () => convertUpdateFormatV2ToV1,
    createAbsolutePositionFromRelativePosition: () => createAbsolutePositionFromRelativePosition,
    createDeleteSet: () => createDeleteSet,
    createDeleteSetFromStructStore: () => createDeleteSetFromStructStore,
    createDocFromSnapshot: () => createDocFromSnapshot,
    createID: () => createID,
    createRelativePositionFromJSON: () => createRelativePositionFromJSON,
    createRelativePositionFromTypeIndex: () => createRelativePositionFromTypeIndex,
    createSnapshot: () => createSnapshot,
    decodeRelativePosition: () => decodeRelativePosition,
    decodeSnapshot: () => decodeSnapshot,
    decodeSnapshotV2: () => decodeSnapshotV2,
    decodeStateVector: () => decodeStateVector,
    decodeUpdate: () => decodeUpdate,
    decodeUpdateV2: () => decodeUpdateV2,
    diffUpdate: () => diffUpdate,
    diffUpdateV2: () => diffUpdateV2,
    emptySnapshot: () => emptySnapshot,
    encodeRelativePosition: () => encodeRelativePosition,
    encodeSnapshot: () => encodeSnapshot,
    encodeSnapshotV2: () => encodeSnapshotV2,
    encodeStateAsUpdate: () => encodeStateAsUpdate,
    encodeStateAsUpdateV2: () => encodeStateAsUpdateV2,
    encodeStateVector: () => encodeStateVector,
    encodeStateVectorFromUpdate: () => encodeStateVectorFromUpdate,
    encodeStateVectorFromUpdateV2: () => encodeStateVectorFromUpdateV2,
    equalDeleteSets: () => equalDeleteSets,
    equalSnapshots: () => equalSnapshots,
    findIndexSS: () => findIndexSS,
    findRootTypeKey: () => findRootTypeKey,
    getItem: () => getItem,
    getItemCleanEnd: () => getItemCleanEnd,
    getItemCleanStart: () => getItemCleanStart,
    getState: () => getState,
    getTypeChildren: () => getTypeChildren,
    isDeleted: () => isDeleted,
    isParentOf: () => isParentOf,
    iterateDeletedStructs: () => iterateDeletedStructs,
    logType: () => logType,
    logUpdate: () => logUpdate,
    logUpdateV2: () => logUpdateV2,
    mergeDeleteSets: () => mergeDeleteSets,
    mergeUpdates: () => mergeUpdates,
    mergeUpdatesV2: () => mergeUpdatesV2,
    obfuscateUpdate: () => obfuscateUpdate,
    obfuscateUpdateV2: () => obfuscateUpdateV2,
    parseUpdateMeta: () => parseUpdateMeta,
    parseUpdateMetaV2: () => parseUpdateMetaV2,
    readUpdate: () => readUpdate,
    readUpdateV2: () => readUpdateV2,
    relativePositionToJSON: () => relativePositionToJSON,
    snapshot: () => snapshot,
    snapshotContainsUpdate: () => snapshotContainsUpdate,
    transact: () => transact,
    tryGc: () => tryGc,
    typeListToArraySnapshot: () => typeListToArraySnapshot,
    typeMapGetAllSnapshot: () => typeMapGetAllSnapshot,
    typeMapGetSnapshot: () => typeMapGetSnapshot
  });

  // node_modules/lib0/map.js
  var create = () => /* @__PURE__ */ new Map();
  var copy = (m) => {
    const r = create();
    m.forEach((v, k) => {
      r.set(k, v);
    });
    return r;
  };
  var setIfUndefined = (map2, key, createT) => {
    let set = map2.get(key);
    if (set === void 0) {
      map2.set(key, set = createT());
    }
    return set;
  };
  var map = (m, f) => {
    const res = [];
    for (const [key, value] of m) {
      res.push(f(value, key));
    }
    return res;
  };
  var any = (m, f) => {
    for (const [key, value] of m) {
      if (f(value, key)) {
        return true;
      }
    }
    return false;
  };

  // node_modules/lib0/set.js
  var create2 = () => /* @__PURE__ */ new Set();

  // node_modules/lib0/array.js
  var last = (arr) => arr[arr.length - 1];
  var appendTo = (dest, src) => {
    for (let i = 0; i < src.length; i++) {
      dest.push(src[i]);
    }
  };
  var from = Array.from;
  var every = (arr, f) => {
    for (let i = 0; i < arr.length; i++) {
      if (!f(arr[i], i, arr)) {
        return false;
      }
    }
    return true;
  };
  var some = (arr, f) => {
    for (let i = 0; i < arr.length; i++) {
      if (f(arr[i], i, arr)) {
        return true;
      }
    }
    return false;
  };
  var unfold = (len, f) => {
    const array = new Array(len);
    for (let i = 0; i < len; i++) {
      array[i] = f(i, array);
    }
    return array;
  };
  var isArray = Array.isArray;

  // node_modules/lib0/observable.js
  var ObservableV2 = class {
    constructor() {
      this._observers = create();
    }
    /**
     * @template {keyof EVENTS & string} NAME
     * @param {NAME} name
     * @param {EVENTS[NAME]} f
     */
    on(name, f) {
      setIfUndefined(
        this._observers,
        /** @type {string} */
        name,
        create2
      ).add(f);
      return f;
    }
    /**
     * @template {keyof EVENTS & string} NAME
     * @param {NAME} name
     * @param {EVENTS[NAME]} f
     */
    once(name, f) {
      const _f = (...args2) => {
        this.off(
          name,
          /** @type {any} */
          _f
        );
        f(...args2);
      };
      this.on(
        name,
        /** @type {any} */
        _f
      );
    }
    /**
     * @template {keyof EVENTS & string} NAME
     * @param {NAME} name
     * @param {EVENTS[NAME]} f
     */
    off(name, f) {
      const observers = this._observers.get(name);
      if (observers !== void 0) {
        observers.delete(f);
        if (observers.size === 0) {
          this._observers.delete(name);
        }
      }
    }
    /**
     * Emit a named event. All registered event listeners that listen to the
     * specified name will receive the event.
     *
     * @todo This should catch exceptions
     *
     * @template {keyof EVENTS & string} NAME
     * @param {NAME} name The event name.
     * @param {Parameters<EVENTS[NAME]>} args The arguments that are applied to the event listener.
     */
    emit(name, args2) {
      return from((this._observers.get(name) || create()).values()).forEach((f) => f(...args2));
    }
    destroy() {
      this._observers = create();
    }
  };

  // node_modules/lib0/math.js
  var floor = Math.floor;
  var abs = Math.abs;
  var min = (a, b) => a < b ? a : b;
  var max = (a, b) => a > b ? a : b;
  var isNaN = Number.isNaN;
  var isNegativeZero = (n) => n !== 0 ? n < 0 : 1 / n < 0;

  // node_modules/lib0/binary.js
  var BIT1 = 1;
  var BIT2 = 2;
  var BIT3 = 4;
  var BIT4 = 8;
  var BIT6 = 32;
  var BIT7 = 64;
  var BIT8 = 128;
  var BIT18 = 1 << 17;
  var BIT19 = 1 << 18;
  var BIT20 = 1 << 19;
  var BIT21 = 1 << 20;
  var BIT22 = 1 << 21;
  var BIT23 = 1 << 22;
  var BIT24 = 1 << 23;
  var BIT25 = 1 << 24;
  var BIT26 = 1 << 25;
  var BIT27 = 1 << 26;
  var BIT28 = 1 << 27;
  var BIT29 = 1 << 28;
  var BIT30 = 1 << 29;
  var BIT31 = 1 << 30;
  var BIT32 = 1 << 31;
  var BITS5 = 31;
  var BITS6 = 63;
  var BITS7 = 127;
  var BITS17 = BIT18 - 1;
  var BITS18 = BIT19 - 1;
  var BITS19 = BIT20 - 1;
  var BITS20 = BIT21 - 1;
  var BITS21 = BIT22 - 1;
  var BITS22 = BIT23 - 1;
  var BITS23 = BIT24 - 1;
  var BITS24 = BIT25 - 1;
  var BITS25 = BIT26 - 1;
  var BITS26 = BIT27 - 1;
  var BITS27 = BIT28 - 1;
  var BITS28 = BIT29 - 1;
  var BITS29 = BIT30 - 1;
  var BITS30 = BIT31 - 1;
  var BITS31 = 2147483647;

  // node_modules/lib0/number.js
  var MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER;
  var MIN_SAFE_INTEGER = Number.MIN_SAFE_INTEGER;
  var LOWEST_INT32 = 1 << 31;
  var isInteger = Number.isInteger || ((num) => typeof num === "number" && isFinite(num) && floor(num) === num);
  var isNaN2 = Number.isNaN;
  var parseInt = Number.parseInt;

  // node_modules/lib0/string.js
  var fromCharCode = String.fromCharCode;
  var fromCodePoint = String.fromCodePoint;
  var MAX_UTF16_CHARACTER = fromCharCode(65535);
  var toLowerCase = (s) => s.toLowerCase();
  var trimLeftRegex = /^\s*/g;
  var trimLeft = (s) => s.replace(trimLeftRegex, "");
  var fromCamelCaseRegex = /([A-Z])/g;
  var fromCamelCase = (s, separator) => trimLeft(s.replace(fromCamelCaseRegex, (match2) => `${separator}${toLowerCase(match2)}`));
  var _encodeUtf8Polyfill = (str) => {
    const encodedString = unescape(encodeURIComponent(str));
    const len = encodedString.length;
    const buf = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      buf[i] = /** @type {number} */
      encodedString.codePointAt(i);
    }
    return buf;
  };
  var utf8TextEncoder = (
    /** @type {TextEncoder} */
    typeof TextEncoder !== "undefined" ? new TextEncoder() : null
  );
  var _encodeUtf8Native = (str) => utf8TextEncoder.encode(str);
  var encodeUtf8 = utf8TextEncoder ? _encodeUtf8Native : _encodeUtf8Polyfill;
  var utf8TextDecoder = typeof TextDecoder === "undefined" ? null : new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
  if (utf8TextDecoder && utf8TextDecoder.decode(new Uint8Array()).length === 1) {
    utf8TextDecoder = null;
  }
  var repeat = (source, n) => unfold(n, () => source).join("");

  // node_modules/lib0/encoding.js
  var Encoder = class {
    constructor() {
      this.cpos = 0;
      this.cbuf = new Uint8Array(100);
      this.bufs = [];
    }
  };
  var createEncoder = () => new Encoder();
  var length = (encoder) => {
    let len = encoder.cpos;
    for (let i = 0; i < encoder.bufs.length; i++) {
      len += encoder.bufs[i].length;
    }
    return len;
  };
  var toUint8Array = (encoder) => {
    const uint8arr = new Uint8Array(length(encoder));
    let curPos = 0;
    for (let i = 0; i < encoder.bufs.length; i++) {
      const d = encoder.bufs[i];
      uint8arr.set(d, curPos);
      curPos += d.length;
    }
    uint8arr.set(new Uint8Array(encoder.cbuf.buffer, 0, encoder.cpos), curPos);
    return uint8arr;
  };
  var verifyLen = (encoder, len) => {
    const bufferLen = encoder.cbuf.length;
    if (bufferLen - encoder.cpos < len) {
      encoder.bufs.push(new Uint8Array(encoder.cbuf.buffer, 0, encoder.cpos));
      encoder.cbuf = new Uint8Array(max(bufferLen, len) * 2);
      encoder.cpos = 0;
    }
  };
  var write = (encoder, num) => {
    const bufferLen = encoder.cbuf.length;
    if (encoder.cpos === bufferLen) {
      encoder.bufs.push(encoder.cbuf);
      encoder.cbuf = new Uint8Array(bufferLen * 2);
      encoder.cpos = 0;
    }
    encoder.cbuf[encoder.cpos++] = num;
  };
  var writeUint8 = write;
  var writeVarUint = (encoder, num) => {
    while (num > BITS7) {
      write(encoder, BIT8 | BITS7 & num);
      num = floor(num / 128);
    }
    write(encoder, BITS7 & num);
  };
  var writeVarInt = (encoder, num) => {
    const isNegative = isNegativeZero(num);
    if (isNegative) {
      num = -num;
    }
    write(encoder, (num > BITS6 ? BIT8 : 0) | (isNegative ? BIT7 : 0) | BITS6 & num);
    num = floor(num / 64);
    while (num > 0) {
      write(encoder, (num > BITS7 ? BIT8 : 0) | BITS7 & num);
      num = floor(num / 128);
    }
  };
  var _strBuffer = new Uint8Array(3e4);
  var _maxStrBSize = _strBuffer.length / 3;
  var _writeVarStringNative = (encoder, str) => {
    if (str.length < _maxStrBSize) {
      const written = utf8TextEncoder.encodeInto(str, _strBuffer).written || 0;
      writeVarUint(encoder, written);
      for (let i = 0; i < written; i++) {
        write(encoder, _strBuffer[i]);
      }
    } else {
      writeVarUint8Array(encoder, encodeUtf8(str));
    }
  };
  var _writeVarStringPolyfill = (encoder, str) => {
    const encodedString = unescape(encodeURIComponent(str));
    const len = encodedString.length;
    writeVarUint(encoder, len);
    for (let i = 0; i < len; i++) {
      write(
        encoder,
        /** @type {number} */
        encodedString.codePointAt(i)
      );
    }
  };
  var writeVarString = utf8TextEncoder && /** @type {any} */
  utf8TextEncoder.encodeInto ? _writeVarStringNative : _writeVarStringPolyfill;
  var writeBinaryEncoder = (encoder, append2) => writeUint8Array(encoder, toUint8Array(append2));
  var writeUint8Array = (encoder, uint8Array) => {
    const bufferLen = encoder.cbuf.length;
    const cpos = encoder.cpos;
    const leftCopyLen = min(bufferLen - cpos, uint8Array.length);
    const rightCopyLen = uint8Array.length - leftCopyLen;
    encoder.cbuf.set(uint8Array.subarray(0, leftCopyLen), cpos);
    encoder.cpos += leftCopyLen;
    if (rightCopyLen > 0) {
      encoder.bufs.push(encoder.cbuf);
      encoder.cbuf = new Uint8Array(max(bufferLen * 2, rightCopyLen));
      encoder.cbuf.set(uint8Array.subarray(leftCopyLen));
      encoder.cpos = rightCopyLen;
    }
  };
  var writeVarUint8Array = (encoder, uint8Array) => {
    writeVarUint(encoder, uint8Array.byteLength);
    writeUint8Array(encoder, uint8Array);
  };
  var writeOnDataView = (encoder, len) => {
    verifyLen(encoder, len);
    const dview = new DataView(encoder.cbuf.buffer, encoder.cpos, len);
    encoder.cpos += len;
    return dview;
  };
  var writeFloat32 = (encoder, num) => writeOnDataView(encoder, 4).setFloat32(0, num, false);
  var writeFloat64 = (encoder, num) => writeOnDataView(encoder, 8).setFloat64(0, num, false);
  var writeBigInt64 = (encoder, num) => (
    /** @type {any} */
    writeOnDataView(encoder, 8).setBigInt64(0, num, false)
  );
  var floatTestBed = new DataView(new ArrayBuffer(4));
  var isFloat32 = (num) => {
    floatTestBed.setFloat32(0, num);
    return floatTestBed.getFloat32(0) === num;
  };
  var writeAny = (encoder, data) => {
    switch (typeof data) {
      case "string":
        write(encoder, 119);
        writeVarString(encoder, data);
        break;
      case "number":
        if (isInteger(data) && abs(data) <= BITS31) {
          write(encoder, 125);
          writeVarInt(encoder, data);
        } else if (isFloat32(data)) {
          write(encoder, 124);
          writeFloat32(encoder, data);
        } else {
          write(encoder, 123);
          writeFloat64(encoder, data);
        }
        break;
      case "bigint":
        write(encoder, 122);
        writeBigInt64(encoder, data);
        break;
      case "object":
        if (data === null) {
          write(encoder, 126);
        } else if (isArray(data)) {
          write(encoder, 117);
          writeVarUint(encoder, data.length);
          for (let i = 0; i < data.length; i++) {
            writeAny(encoder, data[i]);
          }
        } else if (data instanceof Uint8Array) {
          write(encoder, 116);
          writeVarUint8Array(encoder, data);
        } else {
          write(encoder, 118);
          const keys2 = Object.keys(data);
          writeVarUint(encoder, keys2.length);
          for (let i = 0; i < keys2.length; i++) {
            const key = keys2[i];
            writeVarString(encoder, key);
            writeAny(encoder, data[key]);
          }
        }
        break;
      case "boolean":
        write(encoder, data ? 120 : 121);
        break;
      default:
        write(encoder, 127);
    }
  };
  var RleEncoder = class extends Encoder {
    /**
     * @param {function(Encoder, T):void} writer
     */
    constructor(writer) {
      super();
      this.w = writer;
      this.s = null;
      this.count = 0;
    }
    /**
     * @param {T} v
     */
    write(v) {
      if (this.s === v) {
        this.count++;
      } else {
        if (this.count > 0) {
          writeVarUint(this, this.count - 1);
        }
        this.count = 1;
        this.w(this, v);
        this.s = v;
      }
    }
  };
  var flushUintOptRleEncoder = (encoder) => {
    if (encoder.count > 0) {
      writeVarInt(encoder.encoder, encoder.count === 1 ? encoder.s : -encoder.s);
      if (encoder.count > 1) {
        writeVarUint(encoder.encoder, encoder.count - 2);
      }
    }
  };
  var UintOptRleEncoder = class {
    constructor() {
      this.encoder = new Encoder();
      this.s = 0;
      this.count = 0;
    }
    /**
     * @param {number} v
     */
    write(v) {
      if (this.s === v) {
        this.count++;
      } else {
        flushUintOptRleEncoder(this);
        this.count = 1;
        this.s = v;
      }
    }
    /**
     * Flush the encoded state and transform this to a Uint8Array.
     *
     * Note that this should only be called once.
     */
    toUint8Array() {
      flushUintOptRleEncoder(this);
      return toUint8Array(this.encoder);
    }
  };
  var flushIntDiffOptRleEncoder = (encoder) => {
    if (encoder.count > 0) {
      const encodedDiff = encoder.diff * 2 + (encoder.count === 1 ? 0 : 1);
      writeVarInt(encoder.encoder, encodedDiff);
      if (encoder.count > 1) {
        writeVarUint(encoder.encoder, encoder.count - 2);
      }
    }
  };
  var IntDiffOptRleEncoder = class {
    constructor() {
      this.encoder = new Encoder();
      this.s = 0;
      this.count = 0;
      this.diff = 0;
    }
    /**
     * @param {number} v
     */
    write(v) {
      if (this.diff === v - this.s) {
        this.s = v;
        this.count++;
      } else {
        flushIntDiffOptRleEncoder(this);
        this.count = 1;
        this.diff = v - this.s;
        this.s = v;
      }
    }
    /**
     * Flush the encoded state and transform this to a Uint8Array.
     *
     * Note that this should only be called once.
     */
    toUint8Array() {
      flushIntDiffOptRleEncoder(this);
      return toUint8Array(this.encoder);
    }
  };
  var StringEncoder = class {
    constructor() {
      this.sarr = [];
      this.s = "";
      this.lensE = new UintOptRleEncoder();
    }
    /**
     * @param {string} string
     */
    write(string) {
      this.s += string;
      if (this.s.length > 19) {
        this.sarr.push(this.s);
        this.s = "";
      }
      this.lensE.write(string.length);
    }
    toUint8Array() {
      const encoder = new Encoder();
      this.sarr.push(this.s);
      this.s = "";
      writeVarString(encoder, this.sarr.join(""));
      writeUint8Array(encoder, this.lensE.toUint8Array());
      return toUint8Array(encoder);
    }
  };

  // node_modules/lib0/error.js
  var create3 = (s) => new Error(s);
  var methodUnimplemented = () => {
    throw create3("Method unimplemented");
  };
  var unexpectedCase = () => {
    throw create3("Unexpected case");
  };

  // node_modules/lib0/decoding.js
  var errorUnexpectedEndOfArray = create3("Unexpected end of array");
  var errorIntegerOutOfRange = create3("Integer out of Range");
  var subarray = (arr, begin, len) => {
    if (begin < 0 || len < 0 || begin + len > arr.length) {
      throw errorUnexpectedEndOfArray;
    }
    return new Uint8Array(arr.buffer, arr.byteOffset + begin, len);
  };
  var subdataview = (arr, begin, len) => {
    if (begin < 0 || len < 0 || begin + len > arr.length) {
      throw errorUnexpectedEndOfArray;
    }
    return new DataView(arr.buffer, arr.byteOffset + begin, len);
  };
  var Decoder = class {
    /**
     * @param {Uint8Array<Buf>} uint8Array Binary data to decode
     */
    constructor(uint8Array) {
      this.arr = uint8Array;
      this.pos = 0;
    }
  };
  var createDecoder = (uint8Array) => new Decoder(uint8Array);
  var hasContent = (decoder) => decoder.pos !== decoder.arr.length;
  var readUint8Array = (decoder, len) => {
    const view = subarray(decoder.arr, decoder.pos, len);
    decoder.pos += len;
    return view;
  };
  var readVarUint8Array = (decoder) => readUint8Array(decoder, readVarUint(decoder));
  var readUint8 = (decoder) => decoder.arr[decoder.pos++];
  var readVarUint = (decoder) => {
    let num = 0;
    let mult = 1;
    const len = decoder.arr.length;
    while (decoder.pos < len) {
      const r = decoder.arr[decoder.pos++];
      num = num + (r & BITS7) * mult;
      mult *= 128;
      if (r < BIT8) {
        return num;
      }
      if (num > MAX_SAFE_INTEGER) {
        throw errorIntegerOutOfRange;
      }
    }
    throw errorUnexpectedEndOfArray;
  };
  var readVarInt = (decoder) => {
    let r = decoder.arr[decoder.pos++];
    let num = r & BITS6;
    let mult = 64;
    const sign = (r & BIT7) > 0 ? -1 : 1;
    if ((r & BIT8) === 0) {
      return sign * num;
    }
    const len = decoder.arr.length;
    while (decoder.pos < len) {
      r = decoder.arr[decoder.pos++];
      num = num + (r & BITS7) * mult;
      mult *= 128;
      if (r < BIT8) {
        return sign * num;
      }
      if (num > MAX_SAFE_INTEGER) {
        throw errorIntegerOutOfRange;
      }
    }
    throw errorUnexpectedEndOfArray;
  };
  var _readVarStringPolyfill = (decoder) => {
    let remainingLen = readVarUint(decoder);
    if (remainingLen === 0) {
      return "";
    } else {
      let encodedString = String.fromCodePoint(readUint8(decoder));
      if (--remainingLen < 100) {
        while (remainingLen--) {
          encodedString += String.fromCodePoint(readUint8(decoder));
        }
      } else {
        while (remainingLen > 0) {
          const nextLen = remainingLen < 1e4 ? remainingLen : 1e4;
          const bytes = decoder.arr.subarray(decoder.pos, decoder.pos + nextLen);
          decoder.pos += nextLen;
          encodedString += String.fromCodePoint.apply(
            null,
            /** @type {any} */
            bytes
          );
          remainingLen -= nextLen;
        }
      }
      return decodeURIComponent(escape(encodedString));
    }
  };
  var _readVarStringNative = (decoder) => (
    /** @type any */
    utf8TextDecoder.decode(readVarUint8Array(decoder))
  );
  var readVarString = utf8TextDecoder ? _readVarStringNative : _readVarStringPolyfill;
  var readFromDataView = (decoder, len) => {
    const dv = subdataview(decoder.arr, decoder.pos, len);
    decoder.pos += len;
    return dv;
  };
  var readFloat32 = (decoder) => readFromDataView(decoder, 4).getFloat32(0, false);
  var readFloat64 = (decoder) => readFromDataView(decoder, 8).getFloat64(0, false);
  var readBigInt64 = (decoder) => (
    /** @type {any} */
    readFromDataView(decoder, 8).getBigInt64(0, false)
  );
  var readAnyLookupTable = [
    (decoder) => void 0,
    // CASE 127: undefined
    (decoder) => null,
    // CASE 126: null
    readVarInt,
    // CASE 125: integer
    readFloat32,
    // CASE 124: float32
    readFloat64,
    // CASE 123: float64
    readBigInt64,
    // CASE 122: bigint
    (decoder) => false,
    // CASE 121: boolean (false)
    (decoder) => true,
    // CASE 120: boolean (true)
    readVarString,
    // CASE 119: string
    (decoder) => {
      const len = readVarUint(decoder);
      const obj = {};
      for (let i = 0; i < len; i++) {
        const key = readVarString(decoder);
        obj[key] = readAny(decoder);
      }
      return obj;
    },
    (decoder) => {
      const len = readVarUint(decoder);
      const arr = [];
      for (let i = 0; i < len; i++) {
        arr.push(readAny(decoder));
      }
      return arr;
    },
    readVarUint8Array
    // CASE 116: Uint8Array
  ];
  var readAny = (decoder) => readAnyLookupTable[127 - readUint8(decoder)](decoder);
  var RleDecoder = class extends Decoder {
    /**
     * @param {Uint8Array} uint8Array
     * @param {function(Decoder):T} reader
     */
    constructor(uint8Array, reader) {
      super(uint8Array);
      this.reader = reader;
      this.s = null;
      this.count = 0;
    }
    read() {
      if (this.count === 0) {
        this.s = this.reader(this);
        if (hasContent(this)) {
          this.count = readVarUint(this) + 1;
        } else {
          this.count = -1;
        }
      }
      this.count--;
      return (
        /** @type {T} */
        this.s
      );
    }
  };
  var UintOptRleDecoder = class extends Decoder {
    /**
     * @param {Uint8Array} uint8Array
     */
    constructor(uint8Array) {
      super(uint8Array);
      this.s = 0;
      this.count = 0;
    }
    read() {
      if (this.count === 0) {
        this.s = readVarInt(this);
        const isNegative = isNegativeZero(this.s);
        this.count = 1;
        if (isNegative) {
          this.s = -this.s;
          this.count = readVarUint(this) + 2;
        }
      }
      this.count--;
      return (
        /** @type {number} */
        this.s
      );
    }
  };
  var IntDiffOptRleDecoder = class extends Decoder {
    /**
     * @param {Uint8Array} uint8Array
     */
    constructor(uint8Array) {
      super(uint8Array);
      this.s = 0;
      this.count = 0;
      this.diff = 0;
    }
    /**
     * @return {number}
     */
    read() {
      if (this.count === 0) {
        const diff = readVarInt(this);
        const hasCount = diff & 1;
        this.diff = floor(diff / 2);
        this.count = 1;
        if (hasCount) {
          this.count = readVarUint(this) + 2;
        }
      }
      this.s += this.diff;
      this.count--;
      return this.s;
    }
  };
  var StringDecoder = class {
    /**
     * @param {Uint8Array} uint8Array
     */
    constructor(uint8Array) {
      this.decoder = new UintOptRleDecoder(uint8Array);
      this.str = readVarString(this.decoder);
      this.spos = 0;
    }
    /**
     * @return {string}
     */
    read() {
      const end = this.spos + this.decoder.read();
      const res = this.str.slice(this.spos, end);
      this.spos = end;
      return res;
    }
  };

  // node_modules/lib0/webcrypto.js
  var subtle = crypto.subtle;
  var getRandomValues = crypto.getRandomValues.bind(crypto);

  // node_modules/lib0/random.js
  var uint32 = () => getRandomValues(new Uint32Array(1))[0];
  var uuidv4Template = "10000000-1000-4000-8000" + -1e11;
  var uuidv4 = () => uuidv4Template.replace(
    /[018]/g,
    /** @param {number} c */
    (c) => (c ^ uint32() & 15 >> c / 4).toString(16)
  );

  // node_modules/lib0/time.js
  var getUnixTime = Date.now;

  // node_modules/lib0/promise.js
  var create4 = (f) => (
    /** @type {Promise<T>} */
    new Promise(f)
  );
  var all = Promise.all.bind(Promise);

  // node_modules/lib0/conditions.js
  var undefinedToNull = (v) => v === void 0 ? null : v;

  // node_modules/lib0/storage.js
  var VarStoragePolyfill = class {
    constructor() {
      this.map = /* @__PURE__ */ new Map();
    }
    /**
     * @param {string} key
     * @param {any} newValue
     */
    setItem(key, newValue) {
      this.map.set(key, newValue);
    }
    /**
     * @param {string} key
     */
    getItem(key) {
      return this.map.get(key);
    }
  };
  var _localStorage = new VarStoragePolyfill();
  var usePolyfill = true;
  try {
    if (typeof window !== "undefined" && typeof localStorage !== "undefined" && localStorage) {
      _localStorage = localStorage;
      usePolyfill = false;
    }
  } catch (e) {
  }
  var varStorage = _localStorage;

  // node_modules/lib0/trait/equality.js
  var EqualityTraitSymbol = /* @__PURE__ */ Symbol("Equality");
  var equals = (a, b) => a === b || !!a?.[EqualityTraitSymbol]?.(b) || false;

  // node_modules/lib0/object.js
  var isObject = (o) => typeof o === "object";
  var assign = Object.assign;
  var keys = Object.keys;
  var forEach = (obj, f) => {
    for (const key in obj) {
      f(obj[key], key);
    }
  };
  var size = (obj) => keys(obj).length;
  var isEmpty = (obj) => {
    for (const _k in obj) {
      return false;
    }
    return true;
  };
  var every2 = (obj, f) => {
    for (const key in obj) {
      if (!f(obj[key], key)) {
        return false;
      }
    }
    return true;
  };
  var hasProperty = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
  var equalFlat = (a, b) => a === b || size(a) === size(b) && every2(a, (val, key) => (val !== void 0 || hasProperty(b, key)) && equals(b[key], val));
  var freeze = Object.freeze;
  var deepFreeze = (o) => {
    for (const key in o) {
      const c = o[key];
      if (typeof c === "object" || typeof c === "function") {
        deepFreeze(o[key]);
      }
    }
    return freeze(o);
  };

  // node_modules/lib0/function.js
  var callAll = (fs, args2, i = 0) => {
    try {
      for (; i < fs.length; i++) {
        fs[i](...args2);
      }
    } finally {
      if (i < fs.length) {
        callAll(fs, args2, i + 1);
      }
    }
  };
  var id = (a) => a;
  var equalityDeep = (a, b) => {
    if (a === b) {
      return true;
    }
    if (a == null || b == null || a.constructor !== b.constructor && (a.constructor || Object) !== (b.constructor || Object)) {
      return false;
    }
    if (a[EqualityTraitSymbol] != null) {
      return a[EqualityTraitSymbol](b);
    }
    switch (a.constructor) {
      case ArrayBuffer:
        a = new Uint8Array(a);
        b = new Uint8Array(b);
      // eslint-disable-next-line no-fallthrough
      case Uint8Array: {
        if (a.byteLength !== b.byteLength) {
          return false;
        }
        for (let i = 0; i < a.length; i++) {
          if (a[i] !== b[i]) {
            return false;
          }
        }
        break;
      }
      case Set: {
        if (a.size !== b.size) {
          return false;
        }
        for (const value of a) {
          if (!b.has(value)) {
            return false;
          }
        }
        break;
      }
      case Map: {
        if (a.size !== b.size) {
          return false;
        }
        for (const key of a.keys()) {
          if (!b.has(key) || !equalityDeep(a.get(key), b.get(key))) {
            return false;
          }
        }
        break;
      }
      case void 0:
      case Object:
        if (size(a) !== size(b)) {
          return false;
        }
        for (const key in a) {
          if (!hasProperty(a, key) || !equalityDeep(a[key], b[key])) {
            return false;
          }
        }
        break;
      case Array:
        if (a.length !== b.length) {
          return false;
        }
        for (let i = 0; i < a.length; i++) {
          if (!equalityDeep(a[i], b[i])) {
            return false;
          }
        }
        break;
      default:
        return false;
    }
    return true;
  };
  var isOneOf = (value, options) => options.includes(value);

  // node_modules/lib0/environment.js
  var isNode = typeof process !== "undefined" && process.release && /node|io\.js/.test(process.release.name) && Object.prototype.toString.call(typeof process !== "undefined" ? process : 0) === "[object process]";
  var isMac = typeof navigator !== "undefined" ? /Mac/.test(navigator.platform) : false;
  var params;
  var args = [];
  var computeParams = () => {
    if (params === void 0) {
      if (isNode) {
        params = create();
        const pargs = process.argv;
        let currParamName = null;
        for (let i = 0; i < pargs.length; i++) {
          const parg = pargs[i];
          if (parg[0] === "-") {
            if (currParamName !== null) {
              params.set(currParamName, "");
            }
            currParamName = parg;
          } else {
            if (currParamName !== null) {
              params.set(currParamName, parg);
              currParamName = null;
            } else {
              args.push(parg);
            }
          }
        }
        if (currParamName !== null) {
          params.set(currParamName, "");
        }
      } else if (typeof location === "object") {
        params = create();
        (location.search || "?").slice(1).split("&").forEach((kv) => {
          if (kv.length !== 0) {
            const [key, value] = kv.split("=");
            params.set(`--${fromCamelCase(key, "-")}`, value);
            params.set(`-${fromCamelCase(key, "-")}`, value);
          }
        });
      } else {
        params = create();
      }
    }
    return params;
  };
  var hasParam = (name) => computeParams().has(name);
  var getVariable = (name) => isNode ? undefinedToNull(process.env[name.toUpperCase().replaceAll("-", "_")]) : undefinedToNull(varStorage.getItem(name));
  var hasConf = (name) => hasParam("--" + name) || getVariable(name) !== null;
  var production = hasConf("production");
  var forceColor = isNode && isOneOf(process.env.FORCE_COLOR, ["true", "1", "2"]);
  var supportsColor = forceColor || !hasParam("--no-colors") && // @todo deprecate --no-colors
  !hasConf("no-color") && (!isNode || process.stdout.isTTY) && (!isNode || hasParam("--color") || getVariable("COLORTERM") !== null || (getVariable("TERM") || "").includes("color"));

  // node_modules/lib0/buffer.js
  var createUint8ArrayFromLen = (len) => new Uint8Array(len);
  var copyUint8Array = (uint8Array) => {
    const newBuf = createUint8ArrayFromLen(uint8Array.byteLength);
    newBuf.set(uint8Array);
    return newBuf;
  };

  // node_modules/lib0/pair.js
  var Pair = class {
    /**
     * @param {L} left
     * @param {R} right
     */
    constructor(left, right) {
      this.left = left;
      this.right = right;
    }
  };
  var create5 = (left, right) => new Pair(left, right);

  // node_modules/lib0/prng.js
  var bool = (gen) => gen.next() >= 0.5;
  var int53 = (gen, min2, max2) => floor(gen.next() * (max2 + 1 - min2) + min2);
  var int32 = (gen, min2, max2) => floor(gen.next() * (max2 + 1 - min2) + min2);
  var int31 = (gen, min2, max2) => int32(gen, min2, max2);
  var letter = (gen) => fromCharCode(int31(gen, 97, 122));
  var word = (gen, minLen = 0, maxLen = 20) => {
    const len = int31(gen, minLen, maxLen);
    let str = "";
    for (let i = 0; i < len; i++) {
      str += letter(gen);
    }
    return str;
  };
  var oneOf = (gen, array) => array[int31(gen, 0, array.length - 1)];

  // node_modules/lib0/schema.js
  var schemaSymbol = /* @__PURE__ */ Symbol("0schema");
  var ValidationError = class {
    constructor() {
      this._rerrs = [];
    }
    /**
     * @param {string?} path
     * @param {string} expected
     * @param {string} has
     * @param {string?} message
     */
    extend(path, expected, has, message = null) {
      this._rerrs.push({ path, expected, has, message });
    }
    toString() {
      const s = [];
      for (let i = this._rerrs.length - 1; i > 0; i--) {
        const r = this._rerrs[i];
        s.push(repeat(" ", (this._rerrs.length - i) * 2) + `${r.path != null ? `[${r.path}] ` : ""}${r.has} doesn't match ${r.expected}. ${r.message}`);
      }
      return s.join("\n");
    }
  };
  var shapeExtends = (a, b) => {
    if (a === b) return true;
    if (a == null || b == null || a.constructor !== b.constructor) return false;
    if (a[EqualityTraitSymbol]) return equals(a, b);
    if (isArray(a)) {
      return every(
        a,
        (aitem) => some(b, (bitem) => shapeExtends(aitem, bitem))
      );
    } else if (isObject(a)) {
      return every2(
        a,
        (aitem, akey) => shapeExtends(aitem, b[akey])
      );
    }
    return false;
  };
  var Schema = class {
    // this.shape must not be defined on Schema. Otherwise typecheck on metatypes (e.g. $$object) won't work as expected anymore
    /**
     * If true, the more things are added to the shape the more objects this schema will accept (e.g.
     * union). By default, the more objects are added, the the fewer objects this schema will accept.
     * @protected
     */
    static _dilutes = false;
    /**
     * @param {Schema<any>} other
     */
    extends(other) {
      let [a, b] = [
        /** @type {any} */
        this.shape,
        /** @type {any} */
        other.shape
      ];
      if (
        /** @type {typeof Schema<any>} */
        this.constructor._dilutes
      ) [b, a] = [a, b];
      return shapeExtends(a, b);
    }
    /**
     * Overwrite this when necessary. By default, we only check the `shape` property which every shape
     * should have.
     * @param {Schema<any>} other
     */
    equals(other) {
      return this.constructor === other.constructor && equalityDeep(this.shape, other.shape);
    }
    [schemaSymbol]() {
      return true;
    }
    /**
     * @param {object} other
     */
    [EqualityTraitSymbol](other) {
      return this.equals(
        /** @type {any} */
        other
      );
    }
    /**
     * Use `schema.validate(obj)` with a typed parameter that is already of typed to be an instance of
     * Schema. Validate will check the structure of the parameter and return true iff the instance
     * really is an instance of Schema.
     *
     * @param {T} o
     * @return {boolean}
     */
    validate(o) {
      return this.check(o);
    }
    /* c8 ignore start */
    /**
     * Similar to validate, but this method accepts untyped parameters.
     *
     * @param {any} _o
     * @param {ValidationError} [_err]
     * @return {_o is T}
     */
    check(_o, _err) {
      methodUnimplemented();
    }
    /* c8 ignore stop */
    /**
     * @type {Schema<T?>}
     */
    get nullable() {
      return $union(this, $null);
    }
    /**
     * @type {$Optional<Schema<T>>}
     */
    get optional() {
      return new $Optional(
        /** @type {Schema<T>} */
        this
      );
    }
    /**
     * Cast a variable to a specific type. Returns the casted value, or throws an exception otherwise.
     * Use this if you know that the type is of a specific type and you just want to convince the type
     * system.
     *
     * **Do not rely on these error messages!**
     * Performs an assertion check only if not in a production environment.
     *
     * @template OO
     * @param {OO} o
     * @return {Extract<OO, T> extends never ? T : (OO extends Array<never> ? T : Extract<OO,T>)}
     */
    cast(o) {
      assert(o, this);
      return (
        /** @type {any} */
        o
      );
    }
    /**
     * EXPECTO PATRONUM!! 🪄
     * This function protects against type errors. Though it may not work in the real world.
     *
     * "After all this time?"
     * "Always." - Snape, talking about type safety
     *
     * Ensures that a variable is a a specific type. Returns the value, or throws an exception if the assertion check failed.
     * Use this if you know that the type is of a specific type and you just want to convince the type
     * system.
     *
     * Can be useful when defining lambdas: `s.lambda(s.$number, s.$void).expect((n) => n + 1)`
     *
     * **Do not rely on these error messages!**
     * Performs an assertion check if not in a production environment.
     *
     * @param {T} o
     * @return {o extends T ? T : never}
     */
    expect(o) {
      assert(o, this);
      return o;
    }
  };
  var $ConstructedBy = class extends Schema {
    /**
     * @param {C} c
     * @param {((o:Instance<C>)=>boolean)|null} check
     */
    constructor(c, check) {
      super();
      this.shape = c;
      this._c = check;
    }
    /**
     * @param {any} o
     * @param {ValidationError} [err]
     * @return {o is C extends ((...args:any[]) => infer T) ? T : (C extends (new (...args:any[]) => any) ? InstanceType<C> : never)} o
     */
    check(o, err = void 0) {
      const c = o?.constructor === this.shape && (this._c == null || this._c(o));
      !c && err?.extend(null, this.shape.name, o?.constructor.name, o?.constructor !== this.shape ? "Constructor match failed" : "Check failed");
      return c;
    }
  };
  var $constructedBy = (c, check = null) => new $ConstructedBy(c, check);
  var $$constructedBy = $constructedBy($ConstructedBy);
  var $Custom = class extends Schema {
    /**
     * @param {(o:any) => boolean} check
     */
    constructor(check) {
      super();
      this.shape = check;
    }
    /**
     * @param {any} o
     * @param {ValidationError} err
     * @return {o is any}
     */
    check(o, err) {
      const c = this.shape(o);
      !c && err?.extend(null, "custom prop", o?.constructor.name, "failed to check custom prop");
      return c;
    }
  };
  var $custom = (check) => new $Custom(check);
  var $$custom = $constructedBy($Custom);
  var $Literal = class extends Schema {
    /**
     * @param {Array<T>} literals
     */
    constructor(literals) {
      super();
      this.shape = literals;
    }
    /**
     *
     * @param {any} o
     * @param {ValidationError} [err]
     * @return {o is T}
     */
    check(o, err) {
      const c = this.shape.some((a) => a === o);
      !c && err?.extend(null, this.shape.join(" | "), o.toString());
      return c;
    }
  };
  var $literal = (...literals) => new $Literal(literals);
  var $$literal = $constructedBy($Literal);
  var _regexEscape = (
    /** @type {any} */
    RegExp.escape || /** @type {(str:string) => string} */
    ((str) => str.replace(/[().|&,$^[\]]/g, (s) => "\\" + s))
  );
  var _schemaStringTemplateToRegex = (s) => {
    if ($string.check(s)) {
      return [_regexEscape(s)];
    }
    if ($$literal.check(s)) {
      return (
        /** @type {Array<string|number>} */
        s.shape.map((v) => v + "")
      );
    }
    if ($$number.check(s)) {
      return ["[+-]?\\d+.?\\d*"];
    }
    if ($$string.check(s)) {
      return [".*"];
    }
    if ($$union.check(s)) {
      return s.shape.map(_schemaStringTemplateToRegex).flat(1);
    }
    unexpectedCase();
  };
  var $StringTemplate = class extends Schema {
    /**
     * @param {T} shape
     */
    constructor(shape) {
      super();
      this.shape = shape;
      this._r = new RegExp("^" + shape.map(_schemaStringTemplateToRegex).map((opts) => `(${opts.join("|")})`).join("") + "$");
    }
    /**
     * @param {any} o
     * @param {ValidationError} [err]
     * @return {o is CastStringTemplateArgsToTemplate<T>}
     */
    check(o, err) {
      const c = this._r.exec(o) != null;
      !c && err?.extend(null, this._r.toString(), o.toString(), "String doesn't match string template.");
      return c;
    }
  };
  var $$stringTemplate = $constructedBy($StringTemplate);
  var isOptionalSymbol = /* @__PURE__ */ Symbol("optional");
  var $Optional = class extends Schema {
    /**
     * @param {S} shape
     */
    constructor(shape) {
      super();
      this.shape = shape;
    }
    /**
     * @param {any} o
     * @param {ValidationError} [err]
     * @return {o is (Unwrap<S>|undefined)}
     */
    check(o, err) {
      const c = o === void 0 || this.shape.check(o);
      !c && err?.extend(null, "undefined (optional)", "()");
      return c;
    }
    get [isOptionalSymbol]() {
      return true;
    }
  };
  var $$optional = $constructedBy($Optional);
  var $Never = class extends Schema {
    /**
     * @param {any} _o
     * @param {ValidationError} [err]
     * @return {_o is never}
     */
    check(_o, err) {
      err?.extend(null, "never", typeof _o);
      return false;
    }
  };
  var $never = new $Never();
  var $$never = $constructedBy($Never);
  var $Object = class _$Object extends Schema {
    /**
     * @param {S} shape
     * @param {boolean} partial
     */
    constructor(shape, partial = false) {
      super();
      this.shape = shape;
      this._isPartial = partial;
    }
    static _dilutes = true;
    /**
     * @type {Schema<Partial<$ObjectToType<S>>>}
     */
    get partial() {
      return new _$Object(this.shape, true);
    }
    /**
     * @param {any} o
     * @param {ValidationError} err
     * @return {o is $ObjectToType<S>}
     */
    check(o, err) {
      if (o == null) {
        err?.extend(null, "object", "null");
        return false;
      }
      return every2(this.shape, (vv, vk) => {
        const c = this._isPartial && !hasProperty(o, vk) || vv.check(o[vk], err);
        !c && err?.extend(vk.toString(), vv.toString(), typeof o[vk], "Object property does not match");
        return c;
      });
    }
  };
  var $object = (def) => (
    /** @type {any} */
    new $Object(def)
  );
  var $$object = $constructedBy($Object);
  var $objectAny = $custom((o) => o != null && (o.constructor === Object || o.constructor == null));
  var $Record = class extends Schema {
    /**
     * @param {Keys} keys
     * @param {Values} values
     */
    constructor(keys2, values) {
      super();
      this.shape = {
        keys: keys2,
        values
      };
    }
    /**
     * @param {any} o
     * @param {ValidationError} err
     * @return {o is { [key in Unwrap<Keys>]: Unwrap<Values> }}
     */
    check(o, err) {
      return o != null && every2(o, (vv, vk) => {
        const ck = this.shape.keys.check(vk, err);
        !ck && err?.extend(vk + "", "Record", typeof o, ck ? "Key doesn't match schema" : "Value doesn't match value");
        return ck && this.shape.values.check(vv, err);
      });
    }
  };
  var $record = (keys2, values) => new $Record(keys2, values);
  var $$record = $constructedBy($Record);
  var $Tuple = class extends Schema {
    /**
     * @param {S} shape
     */
    constructor(shape) {
      super();
      this.shape = shape;
    }
    /**
     * @param {any} o
     * @param {ValidationError} err
     * @return {o is { [K in keyof S]: S[K] extends Schema<infer Type> ? Type : never }}
     */
    check(o, err) {
      return o != null && every2(this.shape, (vv, vk) => {
        const c = (
          /** @type {Schema<any>} */
          vv.check(o[vk], err)
        );
        !c && err?.extend(vk.toString(), "Tuple", typeof vv);
        return c;
      });
    }
  };
  var $tuple = (...def) => new $Tuple(def);
  var $$tuple = $constructedBy($Tuple);
  var $Array = class extends Schema {
    /**
     * @param {Array<S>} v
     */
    constructor(v) {
      super();
      this.shape = v.length === 1 ? v[0] : new $Union(v);
    }
    /**
     * @param {any} o
     * @param {ValidationError} [err]
     * @return {o is Array<S extends Schema<infer T> ? T : never>} o
     */
    check(o, err) {
      const c = isArray(o) && every(o, (oi) => this.shape.check(oi));
      !c && err?.extend(null, "Array", "");
      return c;
    }
  };
  var $array = (...def) => new $Array(def);
  var $$array = $constructedBy($Array);
  var $arrayAny = $custom((o) => isArray(o));
  var $InstanceOf = class extends Schema {
    /**
     * @param {new (...args:any) => T} constructor
     * @param {((o:T) => boolean)|null} check
     */
    constructor(constructor, check) {
      super();
      this.shape = constructor;
      this._c = check;
    }
    /**
     * @param {any} o
     * @param {ValidationError} err
     * @return {o is T}
     */
    check(o, err) {
      const c = o instanceof this.shape && (this._c == null || this._c(o));
      !c && err?.extend(null, this.shape.name, o?.constructor.name);
      return c;
    }
  };
  var $instanceOf = (c, check = null) => new $InstanceOf(c, check);
  var $$instanceOf = $constructedBy($InstanceOf);
  var $$schema = $instanceOf(Schema);
  var $Lambda = class extends Schema {
    /**
     * @param {Args} args
     */
    constructor(args2) {
      super();
      this.len = args2.length - 1;
      this.args = $tuple(...args2.slice(-1));
      this.res = args2[this.len];
    }
    /**
     * @param {any} f
     * @param {ValidationError} err
     * @return {f is _LArgsToLambdaDef<Args>}
     */
    check(f, err) {
      const c = f.constructor === Function && f.length <= this.len;
      !c && err?.extend(null, "function", typeof f);
      return c;
    }
  };
  var $$lambda = $constructedBy($Lambda);
  var $function = $custom((o) => typeof o === "function");
  var $Intersection = class extends Schema {
    /**
     * @param {T} v
     */
    constructor(v) {
      super();
      this.shape = v;
    }
    /**
     * @param {any} o
     * @param {ValidationError} [err]
     * @return {o is Intersect<UnwrapArray<T>>}
     */
    check(o, err) {
      const c = every(this.shape, (check) => check.check(o, err));
      !c && err?.extend(null, "Intersectinon", typeof o);
      return c;
    }
  };
  var $$intersect = $constructedBy($Intersection, (o) => o.shape.length > 0);
  var $Union = class extends Schema {
    static _dilutes = true;
    /**
     * @param {Array<Schema<S>>} v
     */
    constructor(v) {
      super();
      this.shape = v;
    }
    /**
     * @param {any} o
     * @param {ValidationError} [err]
     * @return {o is S}
     */
    check(o, err) {
      const c = some(this.shape, (vv) => vv.check(o, err));
      err?.extend(null, "Union", typeof o);
      return c;
    }
  };
  var $union = (...schemas) => schemas.findIndex(($s) => $$union.check($s)) >= 0 ? $union(...schemas.map(($s) => $($s)).map(($s) => $$union.check($s) ? $s.shape : [$s]).flat(1)) : schemas.length === 1 ? schemas[0] : new $Union(schemas);
  var $$union = (
    /** @type {Schema<$Union<any>>} */
    $constructedBy($Union)
  );
  var _t = () => true;
  var $any = $custom(_t);
  var $$any = (
    /** @type {Schema<Schema<any>>} */
    $constructedBy($Custom, (o) => o.shape === _t)
  );
  var $bigint = $custom((o) => typeof o === "bigint");
  var $$bigint = (
    /** @type {Schema<Schema<BigInt>>} */
    $custom((o) => o === $bigint)
  );
  var $symbol = $custom((o) => typeof o === "symbol");
  var $$symbol = (
    /** @type {Schema<Schema<Symbol>>} */
    $custom((o) => o === $symbol)
  );
  var $number = $custom((o) => typeof o === "number");
  var $$number = (
    /** @type {Schema<Schema<number>>} */
    $custom((o) => o === $number)
  );
  var $string = $custom((o) => typeof o === "string");
  var $$string = (
    /** @type {Schema<Schema<string>>} */
    $custom((o) => o === $string)
  );
  var $boolean = $custom((o) => typeof o === "boolean");
  var $$boolean = (
    /** @type {Schema<Schema<Boolean>>} */
    $custom((o) => o === $boolean)
  );
  var $undefined = $literal(void 0);
  var $$undefined = (
    /** @type {Schema<Schema<undefined>>} */
    $constructedBy($Literal, (o) => o.shape.length === 1 && o.shape[0] === void 0)
  );
  var $void = $literal(void 0);
  var $null = $literal(null);
  var $$null = (
    /** @type {Schema<Schema<null>>} */
    $constructedBy($Literal, (o) => o.shape.length === 1 && o.shape[0] === null)
  );
  var $uint8Array = $constructedBy(Uint8Array);
  var $$uint8Array = (
    /** @type {Schema<Schema<Uint8Array>>} */
    $constructedBy($ConstructedBy, (o) => o.shape === Uint8Array)
  );
  var $primitive = $union($number, $string, $null, $undefined, $bigint, $boolean, $symbol);
  var $json = (() => {
    const $jsonArr = (
      /** @type {$Array<$any>} */
      $array($any)
    );
    const $jsonRecord = (
      /** @type {$Record<$string,$any>} */
      $record($string, $any)
    );
    const $json2 = $union($number, $string, $null, $boolean, $jsonArr, $jsonRecord);
    $jsonArr.shape = $json2;
    $jsonRecord.shape.values = $json2;
    return $json2;
  })();
  var $ = (o) => {
    if ($$schema.check(o)) {
      return (
        /** @type {any} */
        o
      );
    } else if ($objectAny.check(o)) {
      const o2 = {};
      for (const k in o) {
        o2[k] = $(o[k]);
      }
      return (
        /** @type {any} */
        $object(o2)
      );
    } else if ($arrayAny.check(o)) {
      return (
        /** @type {any} */
        $union(...o.map($))
      );
    } else if ($primitive.check(o)) {
      return (
        /** @type {any} */
        $literal(o)
      );
    } else if ($function.check(o)) {
      return (
        /** @type {any} */
        $constructedBy(
          /** @type {any} */
          o
        )
      );
    }
    unexpectedCase();
  };
  var assert = production ? () => {
  } : (o, schema) => {
    const err = new ValidationError();
    if (!schema.check(o, err)) {
      throw create3(`Expected value to be of type ${schema.constructor.name}.
${err.toString()}`);
    }
  };
  var PatternMatcher = class {
    /**
     * @param {Schema<State>} [$state]
     */
    constructor($state) {
      this.patterns = [];
      this.$state = $state;
    }
    /**
     * @template P
     * @template R
     * @param {P} pattern
     * @param {(o:NoInfer<Unwrap<ReadSchema<P>>>,s:State)=>R} handler
     * @return {PatternMatcher<State,Patterns|Pattern<Unwrap<ReadSchema<P>>,R>>}
     */
    if(pattern, handler) {
      this.patterns.push({ if: $(pattern), h: handler });
      return this;
    }
    /**
     * @template R
     * @param {(o:any,s:State)=>R} h
     */
    else(h) {
      return this.if($any, h);
    }
    /**
     * @return {State extends undefined
     *   ? <In extends Unwrap<Patterns['if']>>(o:In,state?:undefined)=>PatternMatchResult<Patterns,In>
     *   : <In extends Unwrap<Patterns['if']>>(o:In,state:State)=>PatternMatchResult<Patterns,In>}
     */
    done() {
      return (
        /** @type {any} */
        (o, s) => {
          for (let i = 0; i < this.patterns.length; i++) {
            const p = this.patterns[i];
            if (p.if.check(o)) {
              return p.h(o, s);
            }
          }
          throw create3("Unhandled pattern");
        }
      );
    }
  };
  var match = (state) => new PatternMatcher(
    /** @type {any} */
    state
  );
  var _random = (
    /** @type {any} */
    match(
      /** @type {Schema<prng.PRNG>} */
      $any
    ).if($$number, (_o, gen) => int53(gen, MIN_SAFE_INTEGER, MAX_SAFE_INTEGER)).if($$string, (_o, gen) => word(gen)).if($$boolean, (_o, gen) => bool(gen)).if($$bigint, (_o, gen) => BigInt(int53(gen, MIN_SAFE_INTEGER, MAX_SAFE_INTEGER))).if($$union, (o, gen) => random(gen, oneOf(gen, o.shape))).if($$object, (o, gen) => {
      const res = {};
      for (const k in o.shape) {
        let prop = o.shape[k];
        if ($$optional.check(prop)) {
          if (bool(gen)) {
            continue;
          }
          prop = prop.shape;
        }
        res[k] = _random(prop, gen);
      }
      return res;
    }).if($$array, (o, gen) => {
      const arr = [];
      const n = int32(gen, 0, 42);
      for (let i = 0; i < n; i++) {
        arr.push(random(gen, o.shape));
      }
      return arr;
    }).if($$literal, (o, gen) => {
      return oneOf(gen, o.shape);
    }).if($$null, (o, gen) => {
      return null;
    }).if($$lambda, (o, gen) => {
      const res = random(gen, o.res);
      return () => res;
    }).if($$any, (o, gen) => random(gen, oneOf(gen, [
      $number,
      $string,
      $null,
      $undefined,
      $bigint,
      $boolean,
      $array($number),
      $record($union("a", "b", "c"), $number)
    ]))).if($$record, (o, gen) => {
      const res = {};
      const keysN = int53(gen, 0, 3);
      for (let i = 0; i < keysN; i++) {
        const key = random(gen, o.shape.keys);
        const val = random(gen, o.shape.values);
        res[key] = val;
      }
      return res;
    }).done()
  );
  var random = (gen, schema) => (
    /** @type {any} */
    _random($(schema), gen)
  );

  // node_modules/lib0/dom.js
  var doc = (
    /** @type {Document} */
    typeof document !== "undefined" ? document : {}
  );
  var $fragment = $custom((el) => el.nodeType === DOCUMENT_FRAGMENT_NODE);
  var domParser = (
    /** @type {DOMParser} */
    typeof DOMParser !== "undefined" ? new DOMParser() : null
  );
  var $element = $custom((el) => el.nodeType === ELEMENT_NODE);
  var $text = $custom((el) => el.nodeType === TEXT_NODE);
  var mapToStyleString = (m) => map(m, (value, key) => `${key}:${value};`).join("");
  var ELEMENT_NODE = doc.ELEMENT_NODE;
  var TEXT_NODE = doc.TEXT_NODE;
  var CDATA_SECTION_NODE = doc.CDATA_SECTION_NODE;
  var COMMENT_NODE = doc.COMMENT_NODE;
  var DOCUMENT_NODE = doc.DOCUMENT_NODE;
  var DOCUMENT_TYPE_NODE = doc.DOCUMENT_TYPE_NODE;
  var DOCUMENT_FRAGMENT_NODE = doc.DOCUMENT_FRAGMENT_NODE;
  var $node = $custom((el) => el.nodeType === DOCUMENT_NODE);

  // node_modules/lib0/symbol.js
  var create6 = Symbol;

  // node_modules/lib0/logging.common.js
  var BOLD = create6();
  var UNBOLD = create6();
  var BLUE = create6();
  var GREY = create6();
  var GREEN = create6();
  var RED = create6();
  var PURPLE = create6();
  var ORANGE = create6();
  var UNCOLOR = create6();
  var computeNoColorLoggingArgs = (args2) => {
    if (args2.length === 1 && args2[0]?.constructor === Function) {
      args2 = /** @type {Array<string|Symbol|Object|number>} */
      /** @type {[function]} */
      args2[0]();
    }
    const strBuilder = [];
    const logArgs = [];
    let i = 0;
    for (; i < args2.length; i++) {
      const arg = args2[i];
      if (arg === void 0) {
        break;
      } else if (arg.constructor === String || arg.constructor === Number) {
        strBuilder.push(arg);
      } else if (arg.constructor === Object) {
        break;
      }
    }
    if (i > 0) {
      logArgs.push(strBuilder.join(""));
    }
    for (; i < args2.length; i++) {
      const arg = args2[i];
      if (!(arg instanceof Symbol)) {
        logArgs.push(arg);
      }
    }
    return logArgs;
  };
  var lastLoggingTime = getUnixTime();

  // node_modules/lib0/logging.js
  var _browserStyleMap = {
    [BOLD]: create5("font-weight", "bold"),
    [UNBOLD]: create5("font-weight", "normal"),
    [BLUE]: create5("color", "blue"),
    [GREEN]: create5("color", "green"),
    [GREY]: create5("color", "grey"),
    [RED]: create5("color", "red"),
    [PURPLE]: create5("color", "purple"),
    [ORANGE]: create5("color", "orange"),
    // not well supported in chrome when debugging node with inspector - TODO: deprecate
    [UNCOLOR]: create5("color", "black")
  };
  var computeBrowserLoggingArgs = (args2) => {
    if (args2.length === 1 && args2[0]?.constructor === Function) {
      args2 = /** @type {Array<string|Symbol|Object|number>} */
      /** @type {[function]} */
      args2[0]();
    }
    const strBuilder = [];
    const styles = [];
    const currentStyle = create();
    let logArgs = [];
    let i = 0;
    for (; i < args2.length; i++) {
      const arg = args2[i];
      const style = _browserStyleMap[arg];
      if (style !== void 0) {
        currentStyle.set(style.left, style.right);
      } else {
        if (arg === void 0) {
          break;
        }
        if (arg.constructor === String || arg.constructor === Number) {
          const style2 = mapToStyleString(currentStyle);
          if (i > 0 || style2.length > 0) {
            strBuilder.push("%c" + arg);
            styles.push(style2);
          } else {
            strBuilder.push(arg);
          }
        } else {
          break;
        }
      }
    }
    if (i > 0) {
      logArgs = styles;
      logArgs.unshift(strBuilder.join(""));
    }
    for (; i < args2.length; i++) {
      const arg = args2[i];
      if (!(arg instanceof Symbol)) {
        logArgs.push(arg);
      }
    }
    return logArgs;
  };
  var computeLoggingArgs = supportsColor ? computeBrowserLoggingArgs : computeNoColorLoggingArgs;
  var print = (...args2) => {
    console.log(...computeLoggingArgs(args2));
    vconsoles.forEach((vc) => vc.print(args2));
  };
  var warn = (...args2) => {
    console.warn(...computeLoggingArgs(args2));
    args2.unshift(ORANGE);
    vconsoles.forEach((vc) => vc.print(args2));
  };
  var vconsoles = create2();

  // node_modules/lib0/iterator.js
  var createIterator = (next) => ({
    /**
     * @return {IterableIterator<T>}
     */
    [Symbol.iterator]() {
      return this;
    },
    // @ts-ignore
    next
  });
  var iteratorFilter = (iterator, filter) => createIterator(() => {
    let res;
    do {
      res = iterator.next();
    } while (!res.done && !filter(res.value));
    return res;
  });
  var iteratorMap = (iterator, fmap) => createIterator(() => {
    const { done, value } = iterator.next();
    return { done, value: done ? void 0 : fmap(value) };
  });

  // node_modules/yjs/dist/yjs.mjs
  var AbstractConnector = class extends ObservableV2 {
    /**
     * @param {Doc} ydoc
     * @param {any} awareness
     */
    constructor(ydoc, awareness) {
      super();
      this.doc = ydoc;
      this.awareness = awareness;
    }
  };
  var DeleteItem = class {
    /**
     * @param {number} clock
     * @param {number} len
     */
    constructor(clock, len) {
      this.clock = clock;
      this.len = len;
    }
  };
  var DeleteSet = class {
    constructor() {
      this.clients = /* @__PURE__ */ new Map();
    }
  };
  var iterateDeletedStructs = (transaction, ds, f) => ds.clients.forEach((deletes, clientid) => {
    const structs = (
      /** @type {Array<GC|Item>} */
      transaction.doc.store.clients.get(clientid)
    );
    if (structs != null) {
      const lastStruct = structs[structs.length - 1];
      const clockState = lastStruct.id.clock + lastStruct.length;
      for (let i = 0, del = deletes[i]; i < deletes.length && del.clock < clockState; del = deletes[++i]) {
        iterateStructs(transaction, structs, del.clock, del.len, f);
      }
    }
  });
  var findIndexDS = (dis, clock) => {
    let left = 0;
    let right = dis.length - 1;
    while (left <= right) {
      const midindex = floor((left + right) / 2);
      const mid = dis[midindex];
      const midclock = mid.clock;
      if (midclock <= clock) {
        if (clock < midclock + mid.len) {
          return midindex;
        }
        left = midindex + 1;
      } else {
        right = midindex - 1;
      }
    }
    return null;
  };
  var isDeleted = (ds, id2) => {
    const dis = ds.clients.get(id2.client);
    return dis !== void 0 && findIndexDS(dis, id2.clock) !== null;
  };
  var sortAndMergeDeleteSet = (ds) => {
    ds.clients.forEach((dels) => {
      dels.sort((a, b) => a.clock - b.clock);
      let i, j;
      for (i = 1, j = 1; i < dels.length; i++) {
        const left = dels[j - 1];
        const right = dels[i];
        if (left.clock + left.len >= right.clock) {
          dels[j - 1] = new DeleteItem(left.clock, max(left.len, right.clock + right.len - left.clock));
        } else {
          if (j < i) {
            dels[j] = right;
          }
          j++;
        }
      }
      dels.length = j;
    });
  };
  var mergeDeleteSets = (dss) => {
    const merged = new DeleteSet();
    for (let dssI = 0; dssI < dss.length; dssI++) {
      dss[dssI].clients.forEach((delsLeft, client) => {
        if (!merged.clients.has(client)) {
          const dels = delsLeft.slice();
          for (let i = dssI + 1; i < dss.length; i++) {
            appendTo(dels, dss[i].clients.get(client) || []);
          }
          merged.clients.set(client, dels);
        }
      });
    }
    sortAndMergeDeleteSet(merged);
    return merged;
  };
  var addToDeleteSet = (ds, client, clock, length2) => {
    setIfUndefined(ds.clients, client, () => (
      /** @type {Array<DeleteItem>} */
      []
    )).push(new DeleteItem(clock, length2));
  };
  var createDeleteSet = () => new DeleteSet();
  var createDeleteSetFromStructStore = (ss) => {
    const ds = createDeleteSet();
    ss.clients.forEach((structs, client) => {
      const dsitems = [];
      for (let i = 0; i < structs.length; i++) {
        const struct = structs[i];
        if (struct.deleted) {
          const clock = struct.id.clock;
          let len = struct.length;
          if (i + 1 < structs.length) {
            for (let next = structs[i + 1]; i + 1 < structs.length && next.deleted; next = structs[++i + 1]) {
              len += next.length;
            }
          }
          dsitems.push(new DeleteItem(clock, len));
        }
      }
      if (dsitems.length > 0) {
        ds.clients.set(client, dsitems);
      }
    });
    return ds;
  };
  var writeDeleteSet = (encoder, ds) => {
    writeVarUint(encoder.restEncoder, ds.clients.size);
    from(ds.clients.entries()).sort((a, b) => b[0] - a[0]).forEach(([client, dsitems]) => {
      encoder.resetDsCurVal();
      writeVarUint(encoder.restEncoder, client);
      const len = dsitems.length;
      writeVarUint(encoder.restEncoder, len);
      for (let i = 0; i < len; i++) {
        const item = dsitems[i];
        encoder.writeDsClock(item.clock);
        encoder.writeDsLen(item.len);
      }
    });
  };
  var readDeleteSet = (decoder) => {
    const ds = new DeleteSet();
    const numClients = readVarUint(decoder.restDecoder);
    for (let i = 0; i < numClients; i++) {
      decoder.resetDsCurVal();
      const client = readVarUint(decoder.restDecoder);
      const numberOfDeletes = readVarUint(decoder.restDecoder);
      if (numberOfDeletes > 0) {
        const dsField = setIfUndefined(ds.clients, client, () => (
          /** @type {Array<DeleteItem>} */
          []
        ));
        for (let i2 = 0; i2 < numberOfDeletes; i2++) {
          dsField.push(new DeleteItem(decoder.readDsClock(), decoder.readDsLen()));
        }
      }
    }
    return ds;
  };
  var readAndApplyDeleteSet = (decoder, transaction, store) => {
    const unappliedDS = new DeleteSet();
    const numClients = readVarUint(decoder.restDecoder);
    for (let i = 0; i < numClients; i++) {
      decoder.resetDsCurVal();
      const client = readVarUint(decoder.restDecoder);
      const numberOfDeletes = readVarUint(decoder.restDecoder);
      const structs = store.clients.get(client) || [];
      const state = getState(store, client);
      for (let i2 = 0; i2 < numberOfDeletes; i2++) {
        const clock = decoder.readDsClock();
        const clockEnd = clock + decoder.readDsLen();
        if (clock < state) {
          if (state < clockEnd) {
            addToDeleteSet(unappliedDS, client, state, clockEnd - state);
          }
          let index = findIndexSS(structs, clock);
          let struct = structs[index];
          if (!struct.deleted && struct.id.clock < clock) {
            structs.splice(index + 1, 0, splitItem(transaction, struct, clock - struct.id.clock));
            index++;
          }
          while (index < structs.length) {
            struct = structs[index++];
            if (struct.id.clock < clockEnd) {
              if (!struct.deleted) {
                if (clockEnd < struct.id.clock + struct.length) {
                  structs.splice(index, 0, splitItem(transaction, struct, clockEnd - struct.id.clock));
                }
                struct.delete(transaction);
              }
            } else {
              break;
            }
          }
        } else {
          addToDeleteSet(unappliedDS, client, clock, clockEnd - clock);
        }
      }
    }
    if (unappliedDS.clients.size > 0) {
      const ds = new UpdateEncoderV2();
      writeVarUint(ds.restEncoder, 0);
      writeDeleteSet(ds, unappliedDS);
      return ds.toUint8Array();
    }
    return null;
  };
  var equalDeleteSets = (ds1, ds2) => {
    if (ds1.clients.size !== ds2.clients.size) return false;
    for (const [client, deleteItems1] of ds1.clients.entries()) {
      const deleteItems2 = (
        /** @type {Array<import('../internals.js').DeleteItem>} */
        ds2.clients.get(client)
      );
      if (deleteItems2 === void 0 || deleteItems1.length !== deleteItems2.length) return false;
      for (let i = 0; i < deleteItems1.length; i++) {
        const di1 = deleteItems1[i];
        const di2 = deleteItems2[i];
        if (di1.clock !== di2.clock || di1.len !== di2.len) {
          return false;
        }
      }
    }
    return true;
  };
  var generateNewClientId = uint32;
  var Doc = class _Doc extends ObservableV2 {
    /**
     * @param {DocOpts} opts configuration
     */
    constructor({ guid = uuidv4(), collectionid = null, gc = true, gcFilter = () => true, meta = null, autoLoad = false, shouldLoad = true } = {}) {
      super();
      this.gc = gc;
      this.gcFilter = gcFilter;
      this.clientID = generateNewClientId();
      this.guid = guid;
      this.collectionid = collectionid;
      this.share = /* @__PURE__ */ new Map();
      this.store = new StructStore();
      this._transaction = null;
      this._transactionCleanups = [];
      this.subdocs = /* @__PURE__ */ new Set();
      this._item = null;
      this.shouldLoad = shouldLoad;
      this.autoLoad = autoLoad;
      this.meta = meta;
      this.isLoaded = false;
      this.isSynced = false;
      this.isDestroyed = false;
      this.whenLoaded = create4((resolve) => {
        this.on("load", () => {
          this.isLoaded = true;
          resolve(this);
        });
      });
      const provideSyncedPromise = () => create4((resolve) => {
        const eventHandler = (isSynced) => {
          if (isSynced === void 0 || isSynced === true) {
            this.off("sync", eventHandler);
            resolve();
          }
        };
        this.on("sync", eventHandler);
      });
      this.on("sync", (isSynced) => {
        if (isSynced === false && this.isSynced) {
          this.whenSynced = provideSyncedPromise();
        }
        this.isSynced = isSynced === void 0 || isSynced === true;
        if (this.isSynced && !this.isLoaded) {
          this.emit("load", [this]);
        }
      });
      this.whenSynced = provideSyncedPromise();
    }
    /**
     * Notify the parent document that you request to load data into this subdocument (if it is a subdocument).
     *
     * `load()` might be used in the future to request any provider to load the most current data.
     *
     * It is safe to call `load()` multiple times.
     */
    load() {
      const item = this._item;
      if (item !== null && !this.shouldLoad) {
        transact(
          /** @type {any} */
          item.parent.doc,
          (transaction) => {
            transaction.subdocsLoaded.add(this);
          },
          null,
          true
        );
      }
      this.shouldLoad = true;
    }
    getSubdocs() {
      return this.subdocs;
    }
    getSubdocGuids() {
      return new Set(from(this.subdocs).map((doc2) => doc2.guid));
    }
    /**
     * Changes that happen inside of a transaction are bundled. This means that
     * the observer fires _after_ the transaction is finished and that all changes
     * that happened inside of the transaction are sent as one message to the
     * other peers.
     *
     * @template T
     * @param {function(Transaction):T} f The function that should be executed as a transaction
     * @param {any} [origin] Origin of who started the transaction. Will be stored on transaction.origin
     * @return T
     *
     * @public
     */
    transact(f, origin = null) {
      return transact(this, f, origin);
    }
    /**
     * Define a shared data type.
     *
     * Multiple calls of `ydoc.get(name, TypeConstructor)` yield the same result
     * and do not overwrite each other. I.e.
     * `ydoc.get(name, Y.Array) === ydoc.get(name, Y.Array)`
     *
     * After this method is called, the type is also available on `ydoc.share.get(name)`.
     *
     * *Best Practices:*
     * Define all types right after the Y.Doc instance is created and store them in a separate object.
     * Also use the typed methods `getText(name)`, `getArray(name)`, ..
     *
     * @template {typeof AbstractType<any>} Type
     * @example
     *   const ydoc = new Y.Doc(..)
     *   const appState = {
     *     document: ydoc.getText('document')
     *     comments: ydoc.getArray('comments')
     *   }
     *
     * @param {string} name
     * @param {Type} TypeConstructor The constructor of the type definition. E.g. Y.Text, Y.Array, Y.Map, ...
     * @return {InstanceType<Type>} The created type. Constructed with TypeConstructor
     *
     * @public
     */
    get(name, TypeConstructor = (
      /** @type {any} */
      AbstractType
    )) {
      const type = setIfUndefined(this.share, name, () => {
        const t = new TypeConstructor();
        t._integrate(this, null);
        return t;
      });
      const Constr = type.constructor;
      if (TypeConstructor !== AbstractType && Constr !== TypeConstructor) {
        if (Constr === AbstractType) {
          const t = new TypeConstructor();
          t._map = type._map;
          type._map.forEach(
            /** @param {Item?} n */
            (n) => {
              for (; n !== null; n = n.left) {
                n.parent = t;
              }
            }
          );
          t._start = type._start;
          for (let n = t._start; n !== null; n = n.right) {
            n.parent = t;
          }
          t._length = type._length;
          this.share.set(name, t);
          t._integrate(this, null);
          return (
            /** @type {InstanceType<Type>} */
            t
          );
        } else {
          throw new Error(`Type with the name ${name} has already been defined with a different constructor`);
        }
      }
      return (
        /** @type {InstanceType<Type>} */
        type
      );
    }
    /**
     * @template T
     * @param {string} [name]
     * @return {YArray<T>}
     *
     * @public
     */
    getArray(name = "") {
      return (
        /** @type {YArray<T>} */
        this.get(name, YArray)
      );
    }
    /**
     * @param {string} [name]
     * @return {YText}
     *
     * @public
     */
    getText(name = "") {
      return this.get(name, YText);
    }
    /**
     * @template T
     * @param {string} [name]
     * @return {YMap<T>}
     *
     * @public
     */
    getMap(name = "") {
      return (
        /** @type {YMap<T>} */
        this.get(name, YMap)
      );
    }
    /**
     * @param {string} [name]
     * @return {YXmlElement}
     *
     * @public
     */
    getXmlElement(name = "") {
      return (
        /** @type {YXmlElement<{[key:string]:string}>} */
        this.get(name, YXmlElement)
      );
    }
    /**
     * @param {string} [name]
     * @return {YXmlFragment}
     *
     * @public
     */
    getXmlFragment(name = "") {
      return this.get(name, YXmlFragment);
    }
    /**
     * Converts the entire document into a js object, recursively traversing each yjs type
     * Doesn't log types that have not been defined (using ydoc.getType(..)).
     *
     * @deprecated Do not use this method and rather call toJSON directly on the shared types.
     *
     * @return {Object<string, any>}
     */
    toJSON() {
      const doc2 = {};
      this.share.forEach((value, key) => {
        doc2[key] = value.toJSON();
      });
      return doc2;
    }
    /**
     * Emit `destroy` event and unregister all event handlers.
     */
    destroy() {
      this.isDestroyed = true;
      from(this.subdocs).forEach((subdoc) => subdoc.destroy());
      const item = this._item;
      if (item !== null) {
        this._item = null;
        const content = (
          /** @type {ContentDoc} */
          item.content
        );
        content.doc = new _Doc({ guid: this.guid, ...content.opts, shouldLoad: false });
        content.doc._item = item;
        transact(
          /** @type {any} */
          item.parent.doc,
          (transaction) => {
            const doc2 = content.doc;
            if (!item.deleted) {
              transaction.subdocsAdded.add(doc2);
            }
            transaction.subdocsRemoved.add(this);
          },
          null,
          true
        );
      }
      this.emit("destroyed", [true]);
      this.emit("destroy", [this]);
      super.destroy();
    }
  };
  var DSDecoderV1 = class {
    /**
     * @param {decoding.Decoder} decoder
     */
    constructor(decoder) {
      this.restDecoder = decoder;
    }
    resetDsCurVal() {
    }
    /**
     * @return {number}
     */
    readDsClock() {
      return readVarUint(this.restDecoder);
    }
    /**
     * @return {number}
     */
    readDsLen() {
      return readVarUint(this.restDecoder);
    }
  };
  var UpdateDecoderV1 = class extends DSDecoderV1 {
    /**
     * @return {ID}
     */
    readLeftID() {
      return createID(readVarUint(this.restDecoder), readVarUint(this.restDecoder));
    }
    /**
     * @return {ID}
     */
    readRightID() {
      return createID(readVarUint(this.restDecoder), readVarUint(this.restDecoder));
    }
    /**
     * Read the next client id.
     * Use this in favor of readID whenever possible to reduce the number of objects created.
     */
    readClient() {
      return readVarUint(this.restDecoder);
    }
    /**
     * @return {number} info An unsigned 8-bit integer
     */
    readInfo() {
      return readUint8(this.restDecoder);
    }
    /**
     * @return {string}
     */
    readString() {
      return readVarString(this.restDecoder);
    }
    /**
     * @return {boolean} isKey
     */
    readParentInfo() {
      return readVarUint(this.restDecoder) === 1;
    }
    /**
     * @return {number} info An unsigned 8-bit integer
     */
    readTypeRef() {
      return readVarUint(this.restDecoder);
    }
    /**
     * Write len of a struct - well suited for Opt RLE encoder.
     *
     * @return {number} len
     */
    readLen() {
      return readVarUint(this.restDecoder);
    }
    /**
     * @return {any}
     */
    readAny() {
      return readAny(this.restDecoder);
    }
    /**
     * @return {Uint8Array}
     */
    readBuf() {
      return copyUint8Array(readVarUint8Array(this.restDecoder));
    }
    /**
     * Legacy implementation uses JSON parse. We use any-decoding in v2.
     *
     * @return {any}
     */
    readJSON() {
      return JSON.parse(readVarString(this.restDecoder));
    }
    /**
     * @return {string}
     */
    readKey() {
      return readVarString(this.restDecoder);
    }
  };
  var DSDecoderV2 = class {
    /**
     * @param {decoding.Decoder} decoder
     */
    constructor(decoder) {
      this.dsCurrVal = 0;
      this.restDecoder = decoder;
    }
    resetDsCurVal() {
      this.dsCurrVal = 0;
    }
    /**
     * @return {number}
     */
    readDsClock() {
      this.dsCurrVal += readVarUint(this.restDecoder);
      return this.dsCurrVal;
    }
    /**
     * @return {number}
     */
    readDsLen() {
      const diff = readVarUint(this.restDecoder) + 1;
      this.dsCurrVal += diff;
      return diff;
    }
  };
  var UpdateDecoderV2 = class extends DSDecoderV2 {
    /**
     * @param {decoding.Decoder} decoder
     */
    constructor(decoder) {
      super(decoder);
      this.keys = [];
      readVarUint(decoder);
      this.keyClockDecoder = new IntDiffOptRleDecoder(readVarUint8Array(decoder));
      this.clientDecoder = new UintOptRleDecoder(readVarUint8Array(decoder));
      this.leftClockDecoder = new IntDiffOptRleDecoder(readVarUint8Array(decoder));
      this.rightClockDecoder = new IntDiffOptRleDecoder(readVarUint8Array(decoder));
      this.infoDecoder = new RleDecoder(readVarUint8Array(decoder), readUint8);
      this.stringDecoder = new StringDecoder(readVarUint8Array(decoder));
      this.parentInfoDecoder = new RleDecoder(readVarUint8Array(decoder), readUint8);
      this.typeRefDecoder = new UintOptRleDecoder(readVarUint8Array(decoder));
      this.lenDecoder = new UintOptRleDecoder(readVarUint8Array(decoder));
    }
    /**
     * @return {ID}
     */
    readLeftID() {
      return new ID(this.clientDecoder.read(), this.leftClockDecoder.read());
    }
    /**
     * @return {ID}
     */
    readRightID() {
      return new ID(this.clientDecoder.read(), this.rightClockDecoder.read());
    }
    /**
     * Read the next client id.
     * Use this in favor of readID whenever possible to reduce the number of objects created.
     */
    readClient() {
      return this.clientDecoder.read();
    }
    /**
     * @return {number} info An unsigned 8-bit integer
     */
    readInfo() {
      return (
        /** @type {number} */
        this.infoDecoder.read()
      );
    }
    /**
     * @return {string}
     */
    readString() {
      return this.stringDecoder.read();
    }
    /**
     * @return {boolean}
     */
    readParentInfo() {
      return this.parentInfoDecoder.read() === 1;
    }
    /**
     * @return {number} An unsigned 8-bit integer
     */
    readTypeRef() {
      return this.typeRefDecoder.read();
    }
    /**
     * Write len of a struct - well suited for Opt RLE encoder.
     *
     * @return {number}
     */
    readLen() {
      return this.lenDecoder.read();
    }
    /**
     * @return {any}
     */
    readAny() {
      return readAny(this.restDecoder);
    }
    /**
     * @return {Uint8Array}
     */
    readBuf() {
      return readVarUint8Array(this.restDecoder);
    }
    /**
     * This is mainly here for legacy purposes.
     *
     * Initial we incoded objects using JSON. Now we use the much faster lib0/any-encoder. This method mainly exists for legacy purposes for the v1 encoder.
     *
     * @return {any}
     */
    readJSON() {
      return readAny(this.restDecoder);
    }
    /**
     * @return {string}
     */
    readKey() {
      const keyClock = this.keyClockDecoder.read();
      if (keyClock < this.keys.length) {
        return this.keys[keyClock];
      } else {
        const key = this.stringDecoder.read();
        this.keys.push(key);
        return key;
      }
    }
  };
  var DSEncoderV1 = class {
    constructor() {
      this.restEncoder = createEncoder();
    }
    toUint8Array() {
      return toUint8Array(this.restEncoder);
    }
    resetDsCurVal() {
    }
    /**
     * @param {number} clock
     */
    writeDsClock(clock) {
      writeVarUint(this.restEncoder, clock);
    }
    /**
     * @param {number} len
     */
    writeDsLen(len) {
      writeVarUint(this.restEncoder, len);
    }
  };
  var UpdateEncoderV1 = class extends DSEncoderV1 {
    /**
     * @param {ID} id
     */
    writeLeftID(id2) {
      writeVarUint(this.restEncoder, id2.client);
      writeVarUint(this.restEncoder, id2.clock);
    }
    /**
     * @param {ID} id
     */
    writeRightID(id2) {
      writeVarUint(this.restEncoder, id2.client);
      writeVarUint(this.restEncoder, id2.clock);
    }
    /**
     * Use writeClient and writeClock instead of writeID if possible.
     * @param {number} client
     */
    writeClient(client) {
      writeVarUint(this.restEncoder, client);
    }
    /**
     * @param {number} info An unsigned 8-bit integer
     */
    writeInfo(info) {
      writeUint8(this.restEncoder, info);
    }
    /**
     * @param {string} s
     */
    writeString(s) {
      writeVarString(this.restEncoder, s);
    }
    /**
     * @param {boolean} isYKey
     */
    writeParentInfo(isYKey) {
      writeVarUint(this.restEncoder, isYKey ? 1 : 0);
    }
    /**
     * @param {number} info An unsigned 8-bit integer
     */
    writeTypeRef(info) {
      writeVarUint(this.restEncoder, info);
    }
    /**
     * Write len of a struct - well suited for Opt RLE encoder.
     *
     * @param {number} len
     */
    writeLen(len) {
      writeVarUint(this.restEncoder, len);
    }
    /**
     * @param {any} any
     */
    writeAny(any2) {
      writeAny(this.restEncoder, any2);
    }
    /**
     * @param {Uint8Array} buf
     */
    writeBuf(buf) {
      writeVarUint8Array(this.restEncoder, buf);
    }
    /**
     * @param {any} embed
     */
    writeJSON(embed) {
      writeVarString(this.restEncoder, JSON.stringify(embed));
    }
    /**
     * @param {string} key
     */
    writeKey(key) {
      writeVarString(this.restEncoder, key);
    }
  };
  var DSEncoderV2 = class {
    constructor() {
      this.restEncoder = createEncoder();
      this.dsCurrVal = 0;
    }
    toUint8Array() {
      return toUint8Array(this.restEncoder);
    }
    resetDsCurVal() {
      this.dsCurrVal = 0;
    }
    /**
     * @param {number} clock
     */
    writeDsClock(clock) {
      const diff = clock - this.dsCurrVal;
      this.dsCurrVal = clock;
      writeVarUint(this.restEncoder, diff);
    }
    /**
     * @param {number} len
     */
    writeDsLen(len) {
      if (len === 0) {
        unexpectedCase();
      }
      writeVarUint(this.restEncoder, len - 1);
      this.dsCurrVal += len;
    }
  };
  var UpdateEncoderV2 = class extends DSEncoderV2 {
    constructor() {
      super();
      this.keyMap = /* @__PURE__ */ new Map();
      this.keyClock = 0;
      this.keyClockEncoder = new IntDiffOptRleEncoder();
      this.clientEncoder = new UintOptRleEncoder();
      this.leftClockEncoder = new IntDiffOptRleEncoder();
      this.rightClockEncoder = new IntDiffOptRleEncoder();
      this.infoEncoder = new RleEncoder(writeUint8);
      this.stringEncoder = new StringEncoder();
      this.parentInfoEncoder = new RleEncoder(writeUint8);
      this.typeRefEncoder = new UintOptRleEncoder();
      this.lenEncoder = new UintOptRleEncoder();
    }
    toUint8Array() {
      const encoder = createEncoder();
      writeVarUint(encoder, 0);
      writeVarUint8Array(encoder, this.keyClockEncoder.toUint8Array());
      writeVarUint8Array(encoder, this.clientEncoder.toUint8Array());
      writeVarUint8Array(encoder, this.leftClockEncoder.toUint8Array());
      writeVarUint8Array(encoder, this.rightClockEncoder.toUint8Array());
      writeVarUint8Array(encoder, toUint8Array(this.infoEncoder));
      writeVarUint8Array(encoder, this.stringEncoder.toUint8Array());
      writeVarUint8Array(encoder, toUint8Array(this.parentInfoEncoder));
      writeVarUint8Array(encoder, this.typeRefEncoder.toUint8Array());
      writeVarUint8Array(encoder, this.lenEncoder.toUint8Array());
      writeUint8Array(encoder, toUint8Array(this.restEncoder));
      return toUint8Array(encoder);
    }
    /**
     * @param {ID} id
     */
    writeLeftID(id2) {
      this.clientEncoder.write(id2.client);
      this.leftClockEncoder.write(id2.clock);
    }
    /**
     * @param {ID} id
     */
    writeRightID(id2) {
      this.clientEncoder.write(id2.client);
      this.rightClockEncoder.write(id2.clock);
    }
    /**
     * @param {number} client
     */
    writeClient(client) {
      this.clientEncoder.write(client);
    }
    /**
     * @param {number} info An unsigned 8-bit integer
     */
    writeInfo(info) {
      this.infoEncoder.write(info);
    }
    /**
     * @param {string} s
     */
    writeString(s) {
      this.stringEncoder.write(s);
    }
    /**
     * @param {boolean} isYKey
     */
    writeParentInfo(isYKey) {
      this.parentInfoEncoder.write(isYKey ? 1 : 0);
    }
    /**
     * @param {number} info An unsigned 8-bit integer
     */
    writeTypeRef(info) {
      this.typeRefEncoder.write(info);
    }
    /**
     * Write len of a struct - well suited for Opt RLE encoder.
     *
     * @param {number} len
     */
    writeLen(len) {
      this.lenEncoder.write(len);
    }
    /**
     * @param {any} any
     */
    writeAny(any2) {
      writeAny(this.restEncoder, any2);
    }
    /**
     * @param {Uint8Array} buf
     */
    writeBuf(buf) {
      writeVarUint8Array(this.restEncoder, buf);
    }
    /**
     * This is mainly here for legacy purposes.
     *
     * Initial we incoded objects using JSON. Now we use the much faster lib0/any-encoder. This method mainly exists for legacy purposes for the v1 encoder.
     *
     * @param {any} embed
     */
    writeJSON(embed) {
      writeAny(this.restEncoder, embed);
    }
    /**
     * Property keys are often reused. For example, in y-prosemirror the key `bold` might
     * occur very often. For a 3d application, the key `position` might occur very often.
     *
     * We cache these keys in a Map and refer to them via a unique number.
     *
     * @param {string} key
     */
    writeKey(key) {
      const clock = this.keyMap.get(key);
      if (clock === void 0) {
        this.keyClockEncoder.write(this.keyClock++);
        this.stringEncoder.write(key);
      } else {
        this.keyClockEncoder.write(clock);
      }
    }
  };
  var writeStructs = (encoder, structs, client, clock) => {
    clock = max(clock, structs[0].id.clock);
    const startNewStructs = findIndexSS(structs, clock);
    writeVarUint(encoder.restEncoder, structs.length - startNewStructs);
    encoder.writeClient(client);
    writeVarUint(encoder.restEncoder, clock);
    const firstStruct = structs[startNewStructs];
    firstStruct.write(encoder, clock - firstStruct.id.clock);
    for (let i = startNewStructs + 1; i < structs.length; i++) {
      structs[i].write(encoder, 0);
    }
  };
  var writeClientsStructs = (encoder, store, _sm) => {
    const sm = /* @__PURE__ */ new Map();
    _sm.forEach((clock, client) => {
      if (getState(store, client) > clock) {
        sm.set(client, clock);
      }
    });
    getStateVector(store).forEach((_clock, client) => {
      if (!_sm.has(client)) {
        sm.set(client, 0);
      }
    });
    writeVarUint(encoder.restEncoder, sm.size);
    from(sm.entries()).sort((a, b) => b[0] - a[0]).forEach(([client, clock]) => {
      writeStructs(
        encoder,
        /** @type {Array<GC|Item>} */
        store.clients.get(client),
        client,
        clock
      );
    });
  };
  var readClientsStructRefs = (decoder, doc2) => {
    const clientRefs = create();
    const numOfStateUpdates = readVarUint(decoder.restDecoder);
    for (let i = 0; i < numOfStateUpdates; i++) {
      const numberOfStructs = readVarUint(decoder.restDecoder);
      const refs = new Array(numberOfStructs);
      const client = decoder.readClient();
      let clock = readVarUint(decoder.restDecoder);
      clientRefs.set(client, { i: 0, refs });
      for (let i2 = 0; i2 < numberOfStructs; i2++) {
        const info = decoder.readInfo();
        switch (BITS5 & info) {
          case 0: {
            const len = decoder.readLen();
            refs[i2] = new GC(createID(client, clock), len);
            clock += len;
            break;
          }
          case 10: {
            const len = readVarUint(decoder.restDecoder);
            refs[i2] = new Skip(createID(client, clock), len);
            clock += len;
            break;
          }
          default: {
            const cantCopyParentInfo = (info & (BIT7 | BIT8)) === 0;
            const struct = new Item(
              createID(client, clock),
              null,
              // left
              (info & BIT8) === BIT8 ? decoder.readLeftID() : null,
              // origin
              null,
              // right
              (info & BIT7) === BIT7 ? decoder.readRightID() : null,
              // right origin
              cantCopyParentInfo ? decoder.readParentInfo() ? doc2.get(decoder.readString()) : decoder.readLeftID() : null,
              // parent
              cantCopyParentInfo && (info & BIT6) === BIT6 ? decoder.readString() : null,
              // parentSub
              readItemContent(decoder, info)
              // item content
            );
            refs[i2] = struct;
            clock += struct.length;
          }
        }
      }
    }
    return clientRefs;
  };
  var integrateStructs = (transaction, store, clientsStructRefs) => {
    const stack = [];
    let clientsStructRefsIds = from(clientsStructRefs.keys()).sort((a, b) => a - b);
    if (clientsStructRefsIds.length === 0) {
      return null;
    }
    const getNextStructTarget = () => {
      if (clientsStructRefsIds.length === 0) {
        return null;
      }
      let nextStructsTarget = (
        /** @type {{i:number,refs:Array<GC|Item>}} */
        clientsStructRefs.get(clientsStructRefsIds[clientsStructRefsIds.length - 1])
      );
      while (nextStructsTarget.refs.length === nextStructsTarget.i) {
        clientsStructRefsIds.pop();
        if (clientsStructRefsIds.length > 0) {
          nextStructsTarget = /** @type {{i:number,refs:Array<GC|Item>}} */
          clientsStructRefs.get(clientsStructRefsIds[clientsStructRefsIds.length - 1]);
        } else {
          return null;
        }
      }
      return nextStructsTarget;
    };
    let curStructsTarget = getNextStructTarget();
    if (curStructsTarget === null) {
      return null;
    }
    const restStructs = new StructStore();
    const missingSV = /* @__PURE__ */ new Map();
    const updateMissingSv = (client, clock) => {
      const mclock = missingSV.get(client);
      if (mclock == null || mclock > clock) {
        missingSV.set(client, clock);
      }
    };
    let stackHead = (
      /** @type {any} */
      curStructsTarget.refs[
        /** @type {any} */
        curStructsTarget.i++
      ]
    );
    const state = /* @__PURE__ */ new Map();
    const addStackToRestSS = () => {
      for (const item of stack) {
        const client = item.id.client;
        const inapplicableItems = clientsStructRefs.get(client);
        if (inapplicableItems) {
          inapplicableItems.i--;
          restStructs.clients.set(client, inapplicableItems.refs.slice(inapplicableItems.i));
          clientsStructRefs.delete(client);
          inapplicableItems.i = 0;
          inapplicableItems.refs = [];
        } else {
          restStructs.clients.set(client, [item]);
        }
        clientsStructRefsIds = clientsStructRefsIds.filter((c) => c !== client);
      }
      stack.length = 0;
    };
    while (true) {
      if (stackHead.constructor !== Skip) {
        const localClock = setIfUndefined(state, stackHead.id.client, () => getState(store, stackHead.id.client));
        const offset = localClock - stackHead.id.clock;
        if (offset < 0) {
          stack.push(stackHead);
          updateMissingSv(stackHead.id.client, stackHead.id.clock - 1);
          addStackToRestSS();
        } else {
          const missing = stackHead.getMissing(transaction, store);
          if (missing !== null) {
            stack.push(stackHead);
            const structRefs = clientsStructRefs.get(
              /** @type {number} */
              missing
            ) || { refs: [], i: 0 };
            if (structRefs.refs.length === structRefs.i) {
              updateMissingSv(
                /** @type {number} */
                missing,
                getState(store, missing)
              );
              addStackToRestSS();
            } else {
              stackHead = structRefs.refs[structRefs.i++];
              continue;
            }
          } else if (offset === 0 || offset < stackHead.length) {
            stackHead.integrate(transaction, offset);
            state.set(stackHead.id.client, stackHead.id.clock + stackHead.length);
          }
        }
      }
      if (stack.length > 0) {
        stackHead = /** @type {GC|Item} */
        stack.pop();
      } else if (curStructsTarget !== null && curStructsTarget.i < curStructsTarget.refs.length) {
        stackHead = /** @type {GC|Item} */
        curStructsTarget.refs[curStructsTarget.i++];
      } else {
        curStructsTarget = getNextStructTarget();
        if (curStructsTarget === null) {
          break;
        } else {
          stackHead = /** @type {GC|Item} */
          curStructsTarget.refs[curStructsTarget.i++];
        }
      }
    }
    if (restStructs.clients.size > 0) {
      const encoder = new UpdateEncoderV2();
      writeClientsStructs(encoder, restStructs, /* @__PURE__ */ new Map());
      writeVarUint(encoder.restEncoder, 0);
      return { missing: missingSV, update: encoder.toUint8Array() };
    }
    return null;
  };
  var writeStructsFromTransaction = (encoder, transaction) => writeClientsStructs(encoder, transaction.doc.store, transaction.beforeState);
  var readUpdateV2 = (decoder, ydoc, transactionOrigin, structDecoder = new UpdateDecoderV2(decoder)) => transact(ydoc, (transaction) => {
    transaction.local = false;
    let retry = false;
    const doc2 = transaction.doc;
    const store = doc2.store;
    const ss = readClientsStructRefs(structDecoder, doc2);
    const restStructs = integrateStructs(transaction, store, ss);
    const pending = store.pendingStructs;
    if (pending) {
      for (const [client, clock] of pending.missing) {
        if (clock < getState(store, client)) {
          retry = true;
          break;
        }
      }
      if (restStructs) {
        for (const [client, clock] of restStructs.missing) {
          const mclock = pending.missing.get(client);
          if (mclock == null || mclock > clock) {
            pending.missing.set(client, clock);
          }
        }
        pending.update = mergeUpdatesV2([pending.update, restStructs.update]);
      }
    } else {
      store.pendingStructs = restStructs;
    }
    const dsRest = readAndApplyDeleteSet(structDecoder, transaction, store);
    if (store.pendingDs) {
      const pendingDSUpdate = new UpdateDecoderV2(createDecoder(store.pendingDs));
      readVarUint(pendingDSUpdate.restDecoder);
      const dsRest2 = readAndApplyDeleteSet(pendingDSUpdate, transaction, store);
      if (dsRest && dsRest2) {
        store.pendingDs = mergeUpdatesV2([dsRest, dsRest2]);
      } else {
        store.pendingDs = dsRest || dsRest2;
      }
    } else {
      store.pendingDs = dsRest;
    }
    if (retry) {
      const update = (
        /** @type {{update: Uint8Array}} */
        store.pendingStructs.update
      );
      store.pendingStructs = null;
      applyUpdateV2(transaction.doc, update);
    }
  }, transactionOrigin, false);
  var readUpdate = (decoder, ydoc, transactionOrigin) => readUpdateV2(decoder, ydoc, transactionOrigin, new UpdateDecoderV1(decoder));
  var applyUpdateV2 = (ydoc, update, transactionOrigin, YDecoder = UpdateDecoderV2) => {
    const decoder = createDecoder(update);
    readUpdateV2(decoder, ydoc, transactionOrigin, new YDecoder(decoder));
  };
  var applyUpdate = (ydoc, update, transactionOrigin) => applyUpdateV2(ydoc, update, transactionOrigin, UpdateDecoderV1);
  var writeStateAsUpdate = (encoder, doc2, targetStateVector = /* @__PURE__ */ new Map()) => {
    writeClientsStructs(encoder, doc2.store, targetStateVector);
    writeDeleteSet(encoder, createDeleteSetFromStructStore(doc2.store));
  };
  var encodeStateAsUpdateV2 = (doc2, encodedTargetStateVector = new Uint8Array([0]), encoder = new UpdateEncoderV2()) => {
    const targetStateVector = decodeStateVector(encodedTargetStateVector);
    writeStateAsUpdate(encoder, doc2, targetStateVector);
    const updates = [encoder.toUint8Array()];
    if (doc2.store.pendingDs) {
      updates.push(doc2.store.pendingDs);
    }
    if (doc2.store.pendingStructs) {
      updates.push(diffUpdateV2(doc2.store.pendingStructs.update, encodedTargetStateVector));
    }
    if (updates.length > 1) {
      if (encoder.constructor === UpdateEncoderV1) {
        return mergeUpdates(updates.map((update, i) => i === 0 ? update : convertUpdateFormatV2ToV1(update)));
      } else if (encoder.constructor === UpdateEncoderV2) {
        return mergeUpdatesV2(updates);
      }
    }
    return updates[0];
  };
  var encodeStateAsUpdate = (doc2, encodedTargetStateVector) => encodeStateAsUpdateV2(doc2, encodedTargetStateVector, new UpdateEncoderV1());
  var readStateVector = (decoder) => {
    const ss = /* @__PURE__ */ new Map();
    const ssLength = readVarUint(decoder.restDecoder);
    for (let i = 0; i < ssLength; i++) {
      const client = readVarUint(decoder.restDecoder);
      const clock = readVarUint(decoder.restDecoder);
      ss.set(client, clock);
    }
    return ss;
  };
  var decodeStateVector = (decodedState) => readStateVector(new DSDecoderV1(createDecoder(decodedState)));
  var writeStateVector = (encoder, sv) => {
    writeVarUint(encoder.restEncoder, sv.size);
    from(sv.entries()).sort((a, b) => b[0] - a[0]).forEach(([client, clock]) => {
      writeVarUint(encoder.restEncoder, client);
      writeVarUint(encoder.restEncoder, clock);
    });
    return encoder;
  };
  var writeDocumentStateVector = (encoder, doc2) => writeStateVector(encoder, getStateVector(doc2.store));
  var encodeStateVectorV2 = (doc2, encoder = new DSEncoderV2()) => {
    if (doc2 instanceof Map) {
      writeStateVector(encoder, doc2);
    } else {
      writeDocumentStateVector(encoder, doc2);
    }
    return encoder.toUint8Array();
  };
  var encodeStateVector = (doc2) => encodeStateVectorV2(doc2, new DSEncoderV1());
  var EventHandler = class {
    constructor() {
      this.l = [];
    }
  };
  var createEventHandler = () => new EventHandler();
  var addEventHandlerListener = (eventHandler, f) => eventHandler.l.push(f);
  var removeEventHandlerListener = (eventHandler, f) => {
    const l = eventHandler.l;
    const len = l.length;
    eventHandler.l = l.filter((g) => f !== g);
    if (len === eventHandler.l.length) {
      console.error("[yjs] Tried to remove event handler that doesn't exist.");
    }
  };
  var callEventHandlerListeners = (eventHandler, arg0, arg1) => callAll(eventHandler.l, [arg0, arg1]);
  var ID = class {
    /**
     * @param {number} client client id
     * @param {number} clock unique per client id, continuous number
     */
    constructor(client, clock) {
      this.client = client;
      this.clock = clock;
    }
  };
  var compareIDs = (a, b) => a === b || a !== null && b !== null && a.client === b.client && a.clock === b.clock;
  var createID = (client, clock) => new ID(client, clock);
  var writeID = (encoder, id2) => {
    writeVarUint(encoder, id2.client);
    writeVarUint(encoder, id2.clock);
  };
  var readID = (decoder) => createID(readVarUint(decoder), readVarUint(decoder));
  var findRootTypeKey = (type) => {
    for (const [key, value] of type.doc.share.entries()) {
      if (value === type) {
        return key;
      }
    }
    throw unexpectedCase();
  };
  var isParentOf = (parent, child) => {
    while (child !== null) {
      if (child.parent === parent) {
        return true;
      }
      child = /** @type {AbstractType<any>} */
      child.parent._item;
    }
    return false;
  };
  var logType = (type) => {
    const res = [];
    let n = type._start;
    while (n) {
      res.push(n);
      n = n.right;
    }
    console.log("Children: ", res);
    console.log("Children content: ", res.filter((m) => !m.deleted).map((m) => m.content));
  };
  var PermanentUserData = class {
    /**
     * @param {Doc} doc
     * @param {YMap<any>} [storeType]
     */
    constructor(doc2, storeType = doc2.getMap("users")) {
      const dss = /* @__PURE__ */ new Map();
      this.yusers = storeType;
      this.doc = doc2;
      this.clients = /* @__PURE__ */ new Map();
      this.dss = dss;
      const initUser = (user, userDescription) => {
        const ds = user.get("ds");
        const ids = user.get("ids");
        const addClientId = (
          /** @param {number} clientid */
          (clientid) => this.clients.set(clientid, userDescription)
        );
        ds.observe(
          /** @param {YArrayEvent<any>} event */
          (event) => {
            event.changes.added.forEach((item) => {
              item.content.getContent().forEach((encodedDs) => {
                if (encodedDs instanceof Uint8Array) {
                  this.dss.set(userDescription, mergeDeleteSets([this.dss.get(userDescription) || createDeleteSet(), readDeleteSet(new DSDecoderV1(createDecoder(encodedDs)))]));
                }
              });
            });
          }
        );
        this.dss.set(userDescription, mergeDeleteSets(ds.map((encodedDs) => readDeleteSet(new DSDecoderV1(createDecoder(encodedDs))))));
        ids.observe(
          /** @param {YArrayEvent<any>} event */
          (event) => event.changes.added.forEach((item) => item.content.getContent().forEach(addClientId))
        );
        ids.forEach(addClientId);
      };
      storeType.observe((event) => {
        event.keysChanged.forEach(
          (userDescription) => initUser(storeType.get(userDescription), userDescription)
        );
      });
      storeType.forEach(initUser);
    }
    /**
     * @param {Doc} doc
     * @param {number} clientid
     * @param {string} userDescription
     * @param {Object} conf
     * @param {function(Transaction, DeleteSet):boolean} [conf.filter]
     */
    setUserMapping(doc2, clientid, userDescription, { filter = () => true } = {}) {
      const users = this.yusers;
      let user = users.get(userDescription);
      if (!user) {
        user = new YMap();
        user.set("ids", new YArray());
        user.set("ds", new YArray());
        users.set(userDescription, user);
      }
      user.get("ids").push([clientid]);
      users.observe((_event) => {
        setTimeout(() => {
          const userOverwrite = users.get(userDescription);
          if (userOverwrite !== user) {
            user = userOverwrite;
            this.clients.forEach((_userDescription, clientid2) => {
              if (userDescription === _userDescription) {
                user.get("ids").push([clientid2]);
              }
            });
            const encoder = new DSEncoderV1();
            const ds = this.dss.get(userDescription);
            if (ds) {
              writeDeleteSet(encoder, ds);
              user.get("ds").push([encoder.toUint8Array()]);
            }
          }
        }, 0);
      });
      doc2.on(
        "afterTransaction",
        /** @param {Transaction} transaction */
        (transaction) => {
          setTimeout(() => {
            const yds = user.get("ds");
            const ds = transaction.deleteSet;
            if (transaction.local && ds.clients.size > 0 && filter(transaction, ds)) {
              const encoder = new DSEncoderV1();
              writeDeleteSet(encoder, ds);
              yds.push([encoder.toUint8Array()]);
            }
          });
        }
      );
    }
    /**
     * @param {number} clientid
     * @return {any}
     */
    getUserByClientId(clientid) {
      return this.clients.get(clientid) || null;
    }
    /**
     * @param {ID} id
     * @return {string | null}
     */
    getUserByDeletedId(id2) {
      for (const [userDescription, ds] of this.dss.entries()) {
        if (isDeleted(ds, id2)) {
          return userDescription;
        }
      }
      return null;
    }
  };
  var RelativePosition = class {
    /**
     * @param {ID|null} type
     * @param {string|null} tname
     * @param {ID|null} item
     * @param {number} assoc
     */
    constructor(type, tname, item, assoc = 0) {
      this.type = type;
      this.tname = tname;
      this.item = item;
      this.assoc = assoc;
    }
  };
  var relativePositionToJSON = (rpos) => {
    const json = {};
    if (rpos.type) {
      json.type = rpos.type;
    }
    if (rpos.tname) {
      json.tname = rpos.tname;
    }
    if (rpos.item) {
      json.item = rpos.item;
    }
    if (rpos.assoc != null) {
      json.assoc = rpos.assoc;
    }
    return json;
  };
  var createRelativePositionFromJSON = (json) => new RelativePosition(json.type == null ? null : createID(json.type.client, json.type.clock), json.tname ?? null, json.item == null ? null : createID(json.item.client, json.item.clock), json.assoc == null ? 0 : json.assoc);
  var AbsolutePosition = class {
    /**
     * @param {AbstractType<any>} type
     * @param {number} index
     * @param {number} [assoc]
     */
    constructor(type, index, assoc = 0) {
      this.type = type;
      this.index = index;
      this.assoc = assoc;
    }
  };
  var createAbsolutePosition = (type, index, assoc = 0) => new AbsolutePosition(type, index, assoc);
  var createRelativePosition = (type, item, assoc) => {
    let typeid = null;
    let tname = null;
    if (type._item === null) {
      tname = findRootTypeKey(type);
    } else {
      typeid = createID(type._item.id.client, type._item.id.clock);
    }
    return new RelativePosition(typeid, tname, item, assoc);
  };
  var createRelativePositionFromTypeIndex = (type, index, assoc = 0) => {
    let t = type._start;
    if (assoc < 0) {
      if (index === 0) {
        return createRelativePosition(type, null, assoc);
      }
      index--;
    }
    while (t !== null) {
      if (!t.deleted && t.countable) {
        if (t.length > index) {
          return createRelativePosition(type, createID(t.id.client, t.id.clock + index), assoc);
        }
        index -= t.length;
      }
      if (t.right === null && assoc < 0) {
        return createRelativePosition(type, t.lastId, assoc);
      }
      t = t.right;
    }
    return createRelativePosition(type, null, assoc);
  };
  var writeRelativePosition = (encoder, rpos) => {
    const { type, tname, item, assoc } = rpos;
    if (item !== null) {
      writeVarUint(encoder, 0);
      writeID(encoder, item);
    } else if (tname !== null) {
      writeUint8(encoder, 1);
      writeVarString(encoder, tname);
    } else if (type !== null) {
      writeUint8(encoder, 2);
      writeID(encoder, type);
    } else {
      throw unexpectedCase();
    }
    writeVarInt(encoder, assoc);
    return encoder;
  };
  var encodeRelativePosition = (rpos) => {
    const encoder = createEncoder();
    writeRelativePosition(encoder, rpos);
    return toUint8Array(encoder);
  };
  var readRelativePosition = (decoder) => {
    let type = null;
    let tname = null;
    let itemID = null;
    switch (readVarUint(decoder)) {
      case 0:
        itemID = readID(decoder);
        break;
      case 1:
        tname = readVarString(decoder);
        break;
      case 2: {
        type = readID(decoder);
      }
    }
    const assoc = hasContent(decoder) ? readVarInt(decoder) : 0;
    return new RelativePosition(type, tname, itemID, assoc);
  };
  var decodeRelativePosition = (uint8Array) => readRelativePosition(createDecoder(uint8Array));
  var getItemWithOffset = (store, id2) => {
    const item = getItem(store, id2);
    const diff = id2.clock - item.id.clock;
    return {
      item,
      diff
    };
  };
  var createAbsolutePositionFromRelativePosition = (rpos, doc2, followUndoneDeletions = true) => {
    const store = doc2.store;
    const rightID = rpos.item;
    const typeID = rpos.type;
    const tname = rpos.tname;
    const assoc = rpos.assoc;
    let type = null;
    let index = 0;
    if (rightID !== null) {
      if (getState(store, rightID.client) <= rightID.clock) {
        return null;
      }
      const res = followUndoneDeletions ? followRedone(store, rightID) : getItemWithOffset(store, rightID);
      const right = res.item;
      if (!(right instanceof Item)) {
        return null;
      }
      type = /** @type {AbstractType<any>} */
      right.parent;
      if (type._item === null || !type._item.deleted) {
        index = right.deleted || !right.countable ? 0 : res.diff + (assoc >= 0 ? 0 : 1);
        let n = right.left;
        while (n !== null) {
          if (!n.deleted && n.countable) {
            index += n.length;
          }
          n = n.left;
        }
      }
    } else {
      if (tname !== null) {
        type = doc2.get(tname);
      } else if (typeID !== null) {
        if (getState(store, typeID.client) <= typeID.clock) {
          return null;
        }
        const { item } = followUndoneDeletions ? followRedone(store, typeID) : { item: getItem(store, typeID) };
        if (item instanceof Item && item.content instanceof ContentType) {
          type = item.content.type;
        } else {
          return null;
        }
      } else {
        throw unexpectedCase();
      }
      if (assoc >= 0) {
        index = type._length;
      } else {
        index = 0;
      }
    }
    return createAbsolutePosition(type, index, rpos.assoc);
  };
  var compareRelativePositions = (a, b) => a === b || a !== null && b !== null && a.tname === b.tname && compareIDs(a.item, b.item) && compareIDs(a.type, b.type) && a.assoc === b.assoc;
  var Snapshot = class {
    /**
     * @param {DeleteSet} ds
     * @param {Map<number,number>} sv state map
     */
    constructor(ds, sv) {
      this.ds = ds;
      this.sv = sv;
    }
  };
  var equalSnapshots = (snap1, snap2) => {
    const ds1 = snap1.ds.clients;
    const ds2 = snap2.ds.clients;
    const sv1 = snap1.sv;
    const sv2 = snap2.sv;
    if (sv1.size !== sv2.size || ds1.size !== ds2.size) {
      return false;
    }
    for (const [key, value] of sv1.entries()) {
      if (sv2.get(key) !== value) {
        return false;
      }
    }
    for (const [client, dsitems1] of ds1.entries()) {
      const dsitems2 = ds2.get(client) || [];
      if (dsitems1.length !== dsitems2.length) {
        return false;
      }
      for (let i = 0; i < dsitems1.length; i++) {
        const dsitem1 = dsitems1[i];
        const dsitem2 = dsitems2[i];
        if (dsitem1.clock !== dsitem2.clock || dsitem1.len !== dsitem2.len) {
          return false;
        }
      }
    }
    return true;
  };
  var encodeSnapshotV2 = (snapshot2, encoder = new DSEncoderV2()) => {
    writeDeleteSet(encoder, snapshot2.ds);
    writeStateVector(encoder, snapshot2.sv);
    return encoder.toUint8Array();
  };
  var encodeSnapshot = (snapshot2) => encodeSnapshotV2(snapshot2, new DSEncoderV1());
  var decodeSnapshotV2 = (buf, decoder = new DSDecoderV2(createDecoder(buf))) => {
    return new Snapshot(readDeleteSet(decoder), readStateVector(decoder));
  };
  var decodeSnapshot = (buf) => decodeSnapshotV2(buf, new DSDecoderV1(createDecoder(buf)));
  var createSnapshot = (ds, sm) => new Snapshot(ds, sm);
  var emptySnapshot = createSnapshot(createDeleteSet(), /* @__PURE__ */ new Map());
  var snapshot = (doc2) => createSnapshot(createDeleteSetFromStructStore(doc2.store), getStateVector(doc2.store));
  var isVisible = (item, snapshot2) => snapshot2 === void 0 ? !item.deleted : snapshot2.sv.has(item.id.client) && (snapshot2.sv.get(item.id.client) || 0) > item.id.clock && !isDeleted(snapshot2.ds, item.id);
  var splitSnapshotAffectedStructs = (transaction, snapshot2) => {
    const meta = setIfUndefined(transaction.meta, splitSnapshotAffectedStructs, create2);
    const store = transaction.doc.store;
    if (!meta.has(snapshot2)) {
      snapshot2.sv.forEach((clock, client) => {
        if (clock < getState(store, client)) {
          getItemCleanStart(transaction, createID(client, clock));
        }
      });
      iterateDeletedStructs(transaction, snapshot2.ds, (_item) => {
      });
      meta.add(snapshot2);
    }
  };
  var createDocFromSnapshot = (originDoc, snapshot2, newDoc = new Doc()) => {
    if (originDoc.gc) {
      throw new Error("Garbage-collection must be disabled in `originDoc`!");
    }
    const { sv, ds } = snapshot2;
    const encoder = new UpdateEncoderV2();
    originDoc.transact((transaction) => {
      let size2 = 0;
      sv.forEach((clock) => {
        if (clock > 0) {
          size2++;
        }
      });
      writeVarUint(encoder.restEncoder, size2);
      for (const [client, clock] of sv) {
        if (clock === 0) {
          continue;
        }
        if (clock < getState(originDoc.store, client)) {
          getItemCleanStart(transaction, createID(client, clock));
        }
        const structs = originDoc.store.clients.get(client) || [];
        const lastStructIndex = findIndexSS(structs, clock - 1);
        writeVarUint(encoder.restEncoder, lastStructIndex + 1);
        encoder.writeClient(client);
        writeVarUint(encoder.restEncoder, 0);
        for (let i = 0; i <= lastStructIndex; i++) {
          structs[i].write(encoder, 0);
        }
      }
      writeDeleteSet(encoder, ds);
    });
    applyUpdateV2(newDoc, encoder.toUint8Array(), "snapshot");
    return newDoc;
  };
  var snapshotContainsUpdateV2 = (snapshot2, update, YDecoder = UpdateDecoderV2) => {
    const updateDecoder = new YDecoder(createDecoder(update));
    const lazyDecoder = new LazyStructReader(updateDecoder, false);
    for (let curr = lazyDecoder.curr; curr !== null; curr = lazyDecoder.next()) {
      if ((snapshot2.sv.get(curr.id.client) || 0) < curr.id.clock + curr.length) {
        return false;
      }
    }
    const mergedDS = mergeDeleteSets([snapshot2.ds, readDeleteSet(updateDecoder)]);
    return equalDeleteSets(snapshot2.ds, mergedDS);
  };
  var snapshotContainsUpdate = (snapshot2, update) => snapshotContainsUpdateV2(snapshot2, update, UpdateDecoderV1);
  var StructStore = class {
    constructor() {
      this.clients = /* @__PURE__ */ new Map();
      this.pendingStructs = null;
      this.pendingDs = null;
    }
  };
  var getStateVector = (store) => {
    const sm = /* @__PURE__ */ new Map();
    store.clients.forEach((structs, client) => {
      const struct = structs[structs.length - 1];
      sm.set(client, struct.id.clock + struct.length);
    });
    return sm;
  };
  var getState = (store, client) => {
    const structs = store.clients.get(client);
    if (structs === void 0) {
      return 0;
    }
    const lastStruct = structs[structs.length - 1];
    return lastStruct.id.clock + lastStruct.length;
  };
  var addStruct = (store, struct) => {
    let structs = store.clients.get(struct.id.client);
    if (structs === void 0) {
      structs = [];
      store.clients.set(struct.id.client, structs);
    } else {
      const lastStruct = structs[structs.length - 1];
      if (lastStruct.id.clock + lastStruct.length !== struct.id.clock) {
        throw unexpectedCase();
      }
    }
    structs.push(struct);
  };
  var findIndexSS = (structs, clock) => {
    let left = 0;
    let right = structs.length - 1;
    let mid = structs[right];
    let midclock = mid.id.clock;
    if (midclock === clock) {
      return right;
    }
    let midindex = floor(clock / (midclock + mid.length - 1) * right);
    while (left <= right) {
      mid = structs[midindex];
      midclock = mid.id.clock;
      if (midclock <= clock) {
        if (clock < midclock + mid.length) {
          return midindex;
        }
        left = midindex + 1;
      } else {
        right = midindex - 1;
      }
      midindex = floor((left + right) / 2);
    }
    throw unexpectedCase();
  };
  var find = (store, id2) => {
    const structs = store.clients.get(id2.client);
    return structs[findIndexSS(structs, id2.clock)];
  };
  var getItem = (
    /** @type {function(StructStore,ID):Item} */
    find
  );
  var findIndexCleanStart = (transaction, structs, clock) => {
    const index = findIndexSS(structs, clock);
    const struct = structs[index];
    if (struct.id.clock < clock && struct instanceof Item) {
      structs.splice(index + 1, 0, splitItem(transaction, struct, clock - struct.id.clock));
      return index + 1;
    }
    return index;
  };
  var getItemCleanStart = (transaction, id2) => {
    const structs = (
      /** @type {Array<Item>} */
      transaction.doc.store.clients.get(id2.client)
    );
    return structs[findIndexCleanStart(transaction, structs, id2.clock)];
  };
  var getItemCleanEnd = (transaction, store, id2) => {
    const structs = store.clients.get(id2.client);
    const index = findIndexSS(structs, id2.clock);
    const struct = structs[index];
    if (id2.clock !== struct.id.clock + struct.length - 1 && struct.constructor !== GC) {
      structs.splice(index + 1, 0, splitItem(transaction, struct, id2.clock - struct.id.clock + 1));
    }
    return struct;
  };
  var replaceStruct = (store, struct, newStruct) => {
    const structs = (
      /** @type {Array<GC|Item>} */
      store.clients.get(struct.id.client)
    );
    structs[findIndexSS(structs, struct.id.clock)] = newStruct;
  };
  var iterateStructs = (transaction, structs, clockStart, len, f) => {
    if (len === 0) {
      return;
    }
    const clockEnd = clockStart + len;
    let index = findIndexCleanStart(transaction, structs, clockStart);
    let struct;
    do {
      struct = structs[index++];
      if (clockEnd < struct.id.clock + struct.length) {
        findIndexCleanStart(transaction, structs, clockEnd);
      }
      f(struct);
    } while (index < structs.length && structs[index].id.clock < clockEnd);
  };
  var Transaction = class {
    /**
     * @param {Doc} doc
     * @param {any} origin
     * @param {boolean} local
     */
    constructor(doc2, origin, local) {
      this.doc = doc2;
      this.deleteSet = new DeleteSet();
      this.beforeState = getStateVector(doc2.store);
      this.afterState = /* @__PURE__ */ new Map();
      this.changed = /* @__PURE__ */ new Map();
      this.changedParentTypes = /* @__PURE__ */ new Map();
      this._mergeStructs = [];
      this.origin = origin;
      this.meta = /* @__PURE__ */ new Map();
      this.local = local;
      this.subdocsAdded = /* @__PURE__ */ new Set();
      this.subdocsRemoved = /* @__PURE__ */ new Set();
      this.subdocsLoaded = /* @__PURE__ */ new Set();
      this._needFormattingCleanup = false;
    }
  };
  var writeUpdateMessageFromTransaction = (encoder, transaction) => {
    if (transaction.deleteSet.clients.size === 0 && !any(transaction.afterState, (clock, client) => transaction.beforeState.get(client) !== clock)) {
      return false;
    }
    sortAndMergeDeleteSet(transaction.deleteSet);
    writeStructsFromTransaction(encoder, transaction);
    writeDeleteSet(encoder, transaction.deleteSet);
    return true;
  };
  var addChangedTypeToTransaction = (transaction, type, parentSub) => {
    const item = type._item;
    if (item === null || item.id.clock < (transaction.beforeState.get(item.id.client) || 0) && !item.deleted) {
      setIfUndefined(transaction.changed, type, create2).add(parentSub);
    }
  };
  var tryToMergeWithLefts = (structs, pos) => {
    let right = structs[pos];
    let left = structs[pos - 1];
    let i = pos;
    for (; i > 0; right = left, left = structs[--i - 1]) {
      if (left.deleted === right.deleted && left.constructor === right.constructor) {
        if (left.mergeWith(right)) {
          if (right instanceof Item && right.parentSub !== null && /** @type {AbstractType<any>} */
          right.parent._map.get(right.parentSub) === right) {
            right.parent._map.set(
              right.parentSub,
              /** @type {Item} */
              left
            );
          }
          continue;
        }
      }
      break;
    }
    const merged = pos - i;
    if (merged) {
      structs.splice(pos + 1 - merged, merged);
    }
    return merged;
  };
  var tryGcDeleteSet = (ds, store, gcFilter) => {
    for (const [client, deleteItems] of ds.clients.entries()) {
      const structs = (
        /** @type {Array<GC|Item>} */
        store.clients.get(client)
      );
      for (let di = deleteItems.length - 1; di >= 0; di--) {
        const deleteItem = deleteItems[di];
        const endDeleteItemClock = deleteItem.clock + deleteItem.len;
        for (let si = findIndexSS(structs, deleteItem.clock), struct = structs[si]; si < structs.length && struct.id.clock < endDeleteItemClock; struct = structs[++si]) {
          const struct2 = structs[si];
          if (deleteItem.clock + deleteItem.len <= struct2.id.clock) {
            break;
          }
          if (struct2 instanceof Item && struct2.deleted && !struct2.keep && gcFilter(struct2)) {
            struct2.gc(store, false);
          }
        }
      }
    }
  };
  var tryMergeDeleteSet = (ds, store) => {
    ds.clients.forEach((deleteItems, client) => {
      const structs = (
        /** @type {Array<GC|Item>} */
        store.clients.get(client)
      );
      for (let di = deleteItems.length - 1; di >= 0; di--) {
        const deleteItem = deleteItems[di];
        const mostRightIndexToCheck = min(structs.length - 1, 1 + findIndexSS(structs, deleteItem.clock + deleteItem.len - 1));
        for (let si = mostRightIndexToCheck, struct = structs[si]; si > 0 && struct.id.clock >= deleteItem.clock; struct = structs[si]) {
          si -= 1 + tryToMergeWithLefts(structs, si);
        }
      }
    });
  };
  var tryGc = (ds, store, gcFilter) => {
    tryGcDeleteSet(ds, store, gcFilter);
    tryMergeDeleteSet(ds, store);
  };
  var cleanupTransactions = (transactionCleanups, i) => {
    if (i < transactionCleanups.length) {
      const transaction = transactionCleanups[i];
      const doc2 = transaction.doc;
      const store = doc2.store;
      const ds = transaction.deleteSet;
      const mergeStructs = transaction._mergeStructs;
      try {
        sortAndMergeDeleteSet(ds);
        transaction.afterState = getStateVector(transaction.doc.store);
        doc2.emit("beforeObserverCalls", [transaction, doc2]);
        const fs = [];
        transaction.changed.forEach(
          (subs, itemtype) => fs.push(() => {
            if (itemtype._item === null || !itemtype._item.deleted) {
              itemtype._callObserver(transaction, subs);
            }
          })
        );
        fs.push(() => {
          transaction.changedParentTypes.forEach((events, type) => {
            if (type._dEH.l.length > 0 && (type._item === null || !type._item.deleted)) {
              fs.push(() => {
                events = events.filter(
                  (event) => event.target._item === null || !event.target._item.deleted
                );
                events.forEach((event) => {
                  event.currentTarget = type;
                  event._path = null;
                });
                events.sort((event1, event2) => event1.path.length - event2.path.length);
                callEventHandlerListeners(type._dEH, events, transaction);
              });
            }
          });
          fs.push(() => doc2.emit("afterTransaction", [transaction, doc2]));
          fs.push(() => {
            if (transaction._needFormattingCleanup) {
              cleanupYTextAfterTransaction(transaction);
            }
          });
        });
        callAll(fs, []);
      } finally {
        if (doc2.gc) {
          tryGcDeleteSet(ds, store, doc2.gcFilter);
        }
        tryMergeDeleteSet(ds, store);
        transaction.afterState.forEach((clock, client) => {
          const beforeClock = transaction.beforeState.get(client) || 0;
          if (beforeClock !== clock) {
            const structs = (
              /** @type {Array<GC|Item>} */
              store.clients.get(client)
            );
            const firstChangePos = max(findIndexSS(structs, beforeClock), 1);
            for (let i2 = structs.length - 1; i2 >= firstChangePos; ) {
              i2 -= 1 + tryToMergeWithLefts(structs, i2);
            }
          }
        });
        for (let i2 = mergeStructs.length - 1; i2 >= 0; i2--) {
          const { client, clock } = mergeStructs[i2].id;
          const structs = (
            /** @type {Array<GC|Item>} */
            store.clients.get(client)
          );
          const replacedStructPos = findIndexSS(structs, clock);
          if (replacedStructPos + 1 < structs.length) {
            if (tryToMergeWithLefts(structs, replacedStructPos + 1) > 1) {
              continue;
            }
          }
          if (replacedStructPos > 0) {
            tryToMergeWithLefts(structs, replacedStructPos);
          }
        }
        if (!transaction.local && transaction.afterState.get(doc2.clientID) !== transaction.beforeState.get(doc2.clientID)) {
          print(ORANGE, BOLD, "[yjs] ", UNBOLD, RED, "Changed the client-id because another client seems to be using it.");
          doc2.clientID = generateNewClientId();
        }
        doc2.emit("afterTransactionCleanup", [transaction, doc2]);
        if (doc2._observers.has("update")) {
          const encoder = new UpdateEncoderV1();
          const hasContent2 = writeUpdateMessageFromTransaction(encoder, transaction);
          if (hasContent2) {
            doc2.emit("update", [encoder.toUint8Array(), transaction.origin, doc2, transaction]);
          }
        }
        if (doc2._observers.has("updateV2")) {
          const encoder = new UpdateEncoderV2();
          const hasContent2 = writeUpdateMessageFromTransaction(encoder, transaction);
          if (hasContent2) {
            doc2.emit("updateV2", [encoder.toUint8Array(), transaction.origin, doc2, transaction]);
          }
        }
        const { subdocsAdded, subdocsLoaded, subdocsRemoved } = transaction;
        if (subdocsAdded.size > 0 || subdocsRemoved.size > 0 || subdocsLoaded.size > 0) {
          subdocsAdded.forEach((subdoc) => {
            subdoc.clientID = doc2.clientID;
            if (subdoc.collectionid == null) {
              subdoc.collectionid = doc2.collectionid;
            }
            doc2.subdocs.add(subdoc);
          });
          subdocsRemoved.forEach((subdoc) => doc2.subdocs.delete(subdoc));
          doc2.emit("subdocs", [{ loaded: subdocsLoaded, added: subdocsAdded, removed: subdocsRemoved }, doc2, transaction]);
          subdocsRemoved.forEach((subdoc) => subdoc.destroy());
        }
        if (transactionCleanups.length <= i + 1) {
          doc2._transactionCleanups = [];
          doc2.emit("afterAllTransactions", [doc2, transactionCleanups]);
        } else {
          cleanupTransactions(transactionCleanups, i + 1);
        }
      }
    }
  };
  var transact = (doc2, f, origin = null, local = true) => {
    const transactionCleanups = doc2._transactionCleanups;
    let initialCall = false;
    let result = null;
    if (doc2._transaction === null) {
      initialCall = true;
      doc2._transaction = new Transaction(doc2, origin, local);
      transactionCleanups.push(doc2._transaction);
      if (transactionCleanups.length === 1) {
        doc2.emit("beforeAllTransactions", [doc2]);
      }
      doc2.emit("beforeTransaction", [doc2._transaction, doc2]);
    }
    try {
      result = f(doc2._transaction);
    } finally {
      if (initialCall) {
        const finishCleanup = doc2._transaction === transactionCleanups[0];
        doc2._transaction = null;
        if (finishCleanup) {
          cleanupTransactions(transactionCleanups, 0);
        }
      }
    }
    return result;
  };
  var StackItem = class {
    /**
     * @param {DeleteSet} deletions
     * @param {DeleteSet} insertions
     */
    constructor(deletions, insertions) {
      this.insertions = insertions;
      this.deletions = deletions;
      this.meta = /* @__PURE__ */ new Map();
    }
  };
  var clearUndoManagerStackItem = (tr, um, stackItem) => {
    iterateDeletedStructs(tr, stackItem.deletions, (item) => {
      if (item instanceof Item && um.scope.some((type) => type === tr.doc || isParentOf(
        /** @type {AbstractType<any>} */
        type,
        item
      ))) {
        keepItem(item, false);
      }
    });
  };
  var popStackItem = (undoManager, stack, eventType) => {
    let _tr = null;
    const doc2 = undoManager.doc;
    const scope = undoManager.scope;
    transact(doc2, (transaction) => {
      while (stack.length > 0 && undoManager.currStackItem === null) {
        const store = doc2.store;
        const stackItem = (
          /** @type {StackItem} */
          stack.pop()
        );
        const itemsToRedo = /* @__PURE__ */ new Set();
        const itemsToDelete = [];
        let performedChange = false;
        iterateDeletedStructs(transaction, stackItem.insertions, (struct) => {
          if (struct instanceof Item) {
            if (struct.redone !== null) {
              let { item, diff } = followRedone(store, struct.id);
              if (diff > 0) {
                item = getItemCleanStart(transaction, createID(item.id.client, item.id.clock + diff));
              }
              struct = item;
            }
            if (!struct.deleted && scope.some((type) => type === transaction.doc || isParentOf(
              /** @type {AbstractType<any>} */
              type,
              /** @type {Item} */
              struct
            ))) {
              itemsToDelete.push(struct);
            }
          }
        });
        iterateDeletedStructs(transaction, stackItem.deletions, (struct) => {
          if (struct instanceof Item && scope.some((type) => type === transaction.doc || isParentOf(
            /** @type {AbstractType<any>} */
            type,
            struct
          )) && // Never redo structs in stackItem.insertions because they were created and deleted in the same capture interval.
          !isDeleted(stackItem.insertions, struct.id)) {
            itemsToRedo.add(struct);
          }
        });
        itemsToRedo.forEach((struct) => {
          performedChange = redoItem(transaction, struct, itemsToRedo, stackItem.insertions, undoManager.ignoreRemoteMapChanges, undoManager) !== null || performedChange;
        });
        for (let i = itemsToDelete.length - 1; i >= 0; i--) {
          const item = itemsToDelete[i];
          if (undoManager.deleteFilter(item)) {
            item.delete(transaction);
            performedChange = true;
          }
        }
        undoManager.currStackItem = performedChange ? stackItem : null;
      }
      transaction.changed.forEach((subProps, type) => {
        if (subProps.has(null) && type._searchMarker) {
          type._searchMarker.length = 0;
        }
      });
      _tr = transaction;
    }, undoManager);
    const res = undoManager.currStackItem;
    if (res != null) {
      const changedParentTypes = _tr.changedParentTypes;
      undoManager.emit("stack-item-popped", [{ stackItem: res, type: eventType, changedParentTypes, origin: undoManager }, undoManager]);
      undoManager.currStackItem = null;
    }
    return res;
  };
  var UndoManager = class extends ObservableV2 {
    /**
     * @param {Doc|AbstractType<any>|Array<AbstractType<any>>} typeScope Limits the scope of the UndoManager. If this is set to a ydoc instance, all changes on that ydoc will be undone. If set to a specific type, only changes on that type or its children will be undone. Also accepts an array of types.
     * @param {UndoManagerOptions} options
     */
    constructor(typeScope, {
      captureTimeout = 500,
      captureTransaction = (_tr) => true,
      deleteFilter = () => true,
      trackedOrigins = /* @__PURE__ */ new Set([null]),
      ignoreRemoteMapChanges = false,
      doc: doc2 = (
        /** @type {Doc} */
        isArray(typeScope) ? typeScope[0].doc : typeScope instanceof Doc ? typeScope : typeScope.doc
      )
    } = {}) {
      super();
      this.scope = [];
      this.doc = doc2;
      this.addToScope(typeScope);
      this.deleteFilter = deleteFilter;
      trackedOrigins.add(this);
      this.trackedOrigins = trackedOrigins;
      this.captureTransaction = captureTransaction;
      this.undoStack = [];
      this.redoStack = [];
      this.undoing = false;
      this.redoing = false;
      this.currStackItem = null;
      this.lastChange = 0;
      this.ignoreRemoteMapChanges = ignoreRemoteMapChanges;
      this.captureTimeout = captureTimeout;
      this.afterTransactionHandler = (transaction) => {
        if (!this.captureTransaction(transaction) || !this.scope.some((type) => transaction.changedParentTypes.has(
          /** @type {AbstractType<any>} */
          type
        ) || type === this.doc) || !this.trackedOrigins.has(transaction.origin) && (!transaction.origin || !this.trackedOrigins.has(transaction.origin.constructor))) {
          return;
        }
        const undoing = this.undoing;
        const redoing = this.redoing;
        const stack = undoing ? this.redoStack : this.undoStack;
        if (undoing) {
          this.stopCapturing();
        } else if (!redoing) {
          this.clear(false, true);
        }
        const insertions = new DeleteSet();
        transaction.afterState.forEach((endClock, client) => {
          const startClock = transaction.beforeState.get(client) || 0;
          const len = endClock - startClock;
          if (len > 0) {
            addToDeleteSet(insertions, client, startClock, len);
          }
        });
        const now = getUnixTime();
        let didAdd = false;
        if (this.lastChange > 0 && now - this.lastChange < this.captureTimeout && stack.length > 0 && !undoing && !redoing) {
          const lastOp = stack[stack.length - 1];
          lastOp.deletions = mergeDeleteSets([lastOp.deletions, transaction.deleteSet]);
          lastOp.insertions = mergeDeleteSets([lastOp.insertions, insertions]);
        } else {
          stack.push(new StackItem(transaction.deleteSet, insertions));
          didAdd = true;
        }
        if (!undoing && !redoing) {
          this.lastChange = now;
        }
        iterateDeletedStructs(
          transaction,
          transaction.deleteSet,
          /** @param {Item|GC} item */
          (item) => {
            if (item instanceof Item && this.scope.some((type) => type === transaction.doc || isParentOf(
              /** @type {AbstractType<any>} */
              type,
              item
            ))) {
              keepItem(item, true);
            }
          }
        );
        const changeEvent = [{ stackItem: stack[stack.length - 1], origin: transaction.origin, type: undoing ? "redo" : "undo", changedParentTypes: transaction.changedParentTypes }, this];
        if (didAdd) {
          this.emit("stack-item-added", changeEvent);
        } else {
          this.emit("stack-item-updated", changeEvent);
        }
      };
      this.destroy = this.destroy.bind(this);
      this.doc.on("afterTransaction", this.afterTransactionHandler);
      this.doc.on("destroy", this.destroy);
    }
    /**
     * Extend the scope.
     *
     * @param {Array<AbstractType<any> | Doc> | AbstractType<any> | Doc} ytypes
     */
    addToScope(ytypes) {
      const tmpSet = new Set(this.scope);
      ytypes = isArray(ytypes) ? ytypes : [ytypes];
      ytypes.forEach((ytype) => {
        if (!tmpSet.has(ytype)) {
          tmpSet.add(ytype);
          if (ytype instanceof AbstractType ? ytype.doc !== this.doc : ytype !== this.doc) warn("[yjs#509] Not same Y.Doc");
          this.scope.push(ytype);
        }
      });
    }
    /**
     * @param {any} origin
     */
    addTrackedOrigin(origin) {
      this.trackedOrigins.add(origin);
    }
    /**
     * @param {any} origin
     */
    removeTrackedOrigin(origin) {
      this.trackedOrigins.delete(origin);
    }
    clear(clearUndoStack = true, clearRedoStack = true) {
      if (clearUndoStack && this.canUndo() || clearRedoStack && this.canRedo()) {
        this.doc.transact((tr) => {
          if (clearUndoStack) {
            this.undoStack.forEach((item) => clearUndoManagerStackItem(tr, this, item));
            this.undoStack = [];
          }
          if (clearRedoStack) {
            this.redoStack.forEach((item) => clearUndoManagerStackItem(tr, this, item));
            this.redoStack = [];
          }
          this.emit("stack-cleared", [{ undoStackCleared: clearUndoStack, redoStackCleared: clearRedoStack }]);
        });
      }
    }
    /**
     * UndoManager merges Undo-StackItem if they are created within time-gap
     * smaller than `options.captureTimeout`. Call `um.stopCapturing()` so that the next
     * StackItem won't be merged.
     *
     *
     * @example
     *     // without stopCapturing
     *     ytext.insert(0, 'a')
     *     ytext.insert(1, 'b')
     *     um.undo()
     *     ytext.toString() // => '' (note that 'ab' was removed)
     *     // with stopCapturing
     *     ytext.insert(0, 'a')
     *     um.stopCapturing()
     *     ytext.insert(0, 'b')
     *     um.undo()
     *     ytext.toString() // => 'a' (note that only 'b' was removed)
     *
     */
    stopCapturing() {
      this.lastChange = 0;
    }
    /**
     * Undo last changes on type.
     *
     * @return {StackItem?} Returns StackItem if a change was applied
     */
    undo() {
      this.undoing = true;
      let res;
      try {
        res = popStackItem(this, this.undoStack, "undo");
      } finally {
        this.undoing = false;
      }
      return res;
    }
    /**
     * Redo last undo operation.
     *
     * @return {StackItem?} Returns StackItem if a change was applied
     */
    redo() {
      this.redoing = true;
      let res;
      try {
        res = popStackItem(this, this.redoStack, "redo");
      } finally {
        this.redoing = false;
      }
      return res;
    }
    /**
     * Are undo steps available?
     *
     * @return {boolean} `true` if undo is possible
     */
    canUndo() {
      return this.undoStack.length > 0;
    }
    /**
     * Are redo steps available?
     *
     * @return {boolean} `true` if redo is possible
     */
    canRedo() {
      return this.redoStack.length > 0;
    }
    destroy() {
      this.trackedOrigins.delete(this);
      this.doc.off("afterTransaction", this.afterTransactionHandler);
      this.doc.off("destroy", this.destroy);
      super.destroy();
    }
  };
  function* lazyStructReaderGenerator(decoder) {
    const numOfStateUpdates = readVarUint(decoder.restDecoder);
    for (let i = 0; i < numOfStateUpdates; i++) {
      const numberOfStructs = readVarUint(decoder.restDecoder);
      const client = decoder.readClient();
      let clock = readVarUint(decoder.restDecoder);
      for (let i2 = 0; i2 < numberOfStructs; i2++) {
        const info = decoder.readInfo();
        if (info === 10) {
          const len = readVarUint(decoder.restDecoder);
          yield new Skip(createID(client, clock), len);
          clock += len;
        } else if ((BITS5 & info) !== 0) {
          const cantCopyParentInfo = (info & (BIT7 | BIT8)) === 0;
          const struct = new Item(
            createID(client, clock),
            null,
            // left
            (info & BIT8) === BIT8 ? decoder.readLeftID() : null,
            // origin
            null,
            // right
            (info & BIT7) === BIT7 ? decoder.readRightID() : null,
            // right origin
            // @ts-ignore Force writing a string here.
            cantCopyParentInfo ? decoder.readParentInfo() ? decoder.readString() : decoder.readLeftID() : null,
            // parent
            cantCopyParentInfo && (info & BIT6) === BIT6 ? decoder.readString() : null,
            // parentSub
            readItemContent(decoder, info)
            // item content
          );
          yield struct;
          clock += struct.length;
        } else {
          const len = decoder.readLen();
          yield new GC(createID(client, clock), len);
          clock += len;
        }
      }
    }
  }
  var LazyStructReader = class {
    /**
     * @param {UpdateDecoderV1 | UpdateDecoderV2} decoder
     * @param {boolean} filterSkips
     */
    constructor(decoder, filterSkips) {
      this.gen = lazyStructReaderGenerator(decoder);
      this.curr = null;
      this.done = false;
      this.filterSkips = filterSkips;
      this.next();
    }
    /**
     * @return {Item | GC | Skip |null}
     */
    next() {
      do {
        this.curr = this.gen.next().value || null;
      } while (this.filterSkips && this.curr !== null && this.curr.constructor === Skip);
      return this.curr;
    }
  };
  var logUpdate = (update) => logUpdateV2(update, UpdateDecoderV1);
  var logUpdateV2 = (update, YDecoder = UpdateDecoderV2) => {
    const structs = [];
    const updateDecoder = new YDecoder(createDecoder(update));
    const lazyDecoder = new LazyStructReader(updateDecoder, false);
    for (let curr = lazyDecoder.curr; curr !== null; curr = lazyDecoder.next()) {
      structs.push(curr);
    }
    print("Structs: ", structs);
    const ds = readDeleteSet(updateDecoder);
    print("DeleteSet: ", ds);
  };
  var decodeUpdate = (update) => decodeUpdateV2(update, UpdateDecoderV1);
  var decodeUpdateV2 = (update, YDecoder = UpdateDecoderV2) => {
    const structs = [];
    const updateDecoder = new YDecoder(createDecoder(update));
    const lazyDecoder = new LazyStructReader(updateDecoder, false);
    for (let curr = lazyDecoder.curr; curr !== null; curr = lazyDecoder.next()) {
      structs.push(curr);
    }
    return {
      structs,
      ds: readDeleteSet(updateDecoder)
    };
  };
  var LazyStructWriter = class {
    /**
     * @param {UpdateEncoderV1 | UpdateEncoderV2} encoder
     */
    constructor(encoder) {
      this.currClient = 0;
      this.startClock = 0;
      this.written = 0;
      this.encoder = encoder;
      this.clientStructs = [];
    }
  };
  var mergeUpdates = (updates) => mergeUpdatesV2(updates, UpdateDecoderV1, UpdateEncoderV1);
  var encodeStateVectorFromUpdateV2 = (update, YEncoder = DSEncoderV2, YDecoder = UpdateDecoderV2) => {
    const encoder = new YEncoder();
    const updateDecoder = new LazyStructReader(new YDecoder(createDecoder(update)), false);
    let curr = updateDecoder.curr;
    if (curr !== null) {
      let size2 = 0;
      let currClient = curr.id.client;
      let stopCounting = curr.id.clock !== 0;
      let currClock = stopCounting ? 0 : curr.id.clock + curr.length;
      for (; curr !== null; curr = updateDecoder.next()) {
        if (currClient !== curr.id.client) {
          if (currClock !== 0) {
            size2++;
            writeVarUint(encoder.restEncoder, currClient);
            writeVarUint(encoder.restEncoder, currClock);
          }
          currClient = curr.id.client;
          currClock = 0;
          stopCounting = curr.id.clock !== 0;
        }
        if (curr.constructor === Skip) {
          stopCounting = true;
        }
        if (!stopCounting) {
          currClock = curr.id.clock + curr.length;
        }
      }
      if (currClock !== 0) {
        size2++;
        writeVarUint(encoder.restEncoder, currClient);
        writeVarUint(encoder.restEncoder, currClock);
      }
      const enc = createEncoder();
      writeVarUint(enc, size2);
      writeBinaryEncoder(enc, encoder.restEncoder);
      encoder.restEncoder = enc;
      return encoder.toUint8Array();
    } else {
      writeVarUint(encoder.restEncoder, 0);
      return encoder.toUint8Array();
    }
  };
  var encodeStateVectorFromUpdate = (update) => encodeStateVectorFromUpdateV2(update, DSEncoderV1, UpdateDecoderV1);
  var parseUpdateMetaV2 = (update, YDecoder = UpdateDecoderV2) => {
    const from2 = /* @__PURE__ */ new Map();
    const to = /* @__PURE__ */ new Map();
    const updateDecoder = new LazyStructReader(new YDecoder(createDecoder(update)), false);
    let curr = updateDecoder.curr;
    if (curr !== null) {
      let currClient = curr.id.client;
      let currClock = curr.id.clock;
      from2.set(currClient, currClock);
      for (; curr !== null; curr = updateDecoder.next()) {
        if (currClient !== curr.id.client) {
          to.set(currClient, currClock);
          from2.set(curr.id.client, curr.id.clock);
          currClient = curr.id.client;
        }
        currClock = curr.id.clock + curr.length;
      }
      to.set(currClient, currClock);
    }
    return { from: from2, to };
  };
  var parseUpdateMeta = (update) => parseUpdateMetaV2(update, UpdateDecoderV1);
  var sliceStruct = (left, diff) => {
    if (left.constructor === GC) {
      const { client, clock } = left.id;
      return new GC(createID(client, clock + diff), left.length - diff);
    } else if (left.constructor === Skip) {
      const { client, clock } = left.id;
      return new Skip(createID(client, clock + diff), left.length - diff);
    } else {
      const leftItem = (
        /** @type {Item} */
        left
      );
      const { client, clock } = leftItem.id;
      return new Item(
        createID(client, clock + diff),
        null,
        createID(client, clock + diff - 1),
        null,
        leftItem.rightOrigin,
        leftItem.parent,
        leftItem.parentSub,
        leftItem.content.splice(diff)
      );
    }
  };
  var mergeUpdatesV2 = (updates, YDecoder = UpdateDecoderV2, YEncoder = UpdateEncoderV2) => {
    if (updates.length === 1) {
      return updates[0];
    }
    const updateDecoders = updates.map((update) => new YDecoder(createDecoder(update)));
    let lazyStructDecoders = updateDecoders.map((decoder) => new LazyStructReader(decoder, true));
    let currWrite = null;
    const updateEncoder = new YEncoder();
    const lazyStructEncoder = new LazyStructWriter(updateEncoder);
    while (true) {
      lazyStructDecoders = lazyStructDecoders.filter((dec) => dec.curr !== null);
      lazyStructDecoders.sort(
        /** @type {function(any,any):number} */
        (dec1, dec2) => {
          if (dec1.curr.id.client === dec2.curr.id.client) {
            const clockDiff = dec1.curr.id.clock - dec2.curr.id.clock;
            if (clockDiff === 0) {
              return dec1.curr.constructor === dec2.curr.constructor ? 0 : dec1.curr.constructor === Skip ? 1 : -1;
            } else {
              return clockDiff;
            }
          } else {
            return dec2.curr.id.client - dec1.curr.id.client;
          }
        }
      );
      if (lazyStructDecoders.length === 0) {
        break;
      }
      const currDecoder = lazyStructDecoders[0];
      const firstClient = (
        /** @type {Item | GC} */
        currDecoder.curr.id.client
      );
      if (currWrite !== null) {
        let curr = (
          /** @type {Item | GC | null} */
          currDecoder.curr
        );
        let iterated = false;
        while (curr !== null && curr.id.clock + curr.length <= currWrite.struct.id.clock + currWrite.struct.length && curr.id.client >= currWrite.struct.id.client) {
          curr = currDecoder.next();
          iterated = true;
        }
        if (curr === null || // current decoder is empty
        curr.id.client !== firstClient || // check whether there is another decoder that has has updates from `firstClient`
        iterated && curr.id.clock > currWrite.struct.id.clock + currWrite.struct.length) {
          continue;
        }
        if (firstClient !== currWrite.struct.id.client) {
          writeStructToLazyStructWriter(lazyStructEncoder, currWrite.struct, currWrite.offset);
          currWrite = { struct: curr, offset: 0 };
          currDecoder.next();
        } else {
          if (currWrite.struct.id.clock + currWrite.struct.length < curr.id.clock) {
            if (currWrite.struct.constructor === Skip) {
              currWrite.struct.length = curr.id.clock + curr.length - currWrite.struct.id.clock;
            } else {
              writeStructToLazyStructWriter(lazyStructEncoder, currWrite.struct, currWrite.offset);
              const diff = curr.id.clock - currWrite.struct.id.clock - currWrite.struct.length;
              const struct = new Skip(createID(firstClient, currWrite.struct.id.clock + currWrite.struct.length), diff);
              currWrite = { struct, offset: 0 };
            }
          } else {
            const diff = currWrite.struct.id.clock + currWrite.struct.length - curr.id.clock;
            if (diff > 0) {
              if (currWrite.struct.constructor === Skip) {
                currWrite.struct.length -= diff;
              } else {
                curr = sliceStruct(curr, diff);
              }
            }
            if (!currWrite.struct.mergeWith(
              /** @type {any} */
              curr
            )) {
              writeStructToLazyStructWriter(lazyStructEncoder, currWrite.struct, currWrite.offset);
              currWrite = { struct: curr, offset: 0 };
              currDecoder.next();
            }
          }
        }
      } else {
        currWrite = { struct: (
          /** @type {Item | GC} */
          currDecoder.curr
        ), offset: 0 };
        currDecoder.next();
      }
      for (let next = currDecoder.curr; next !== null && next.id.client === firstClient && next.id.clock === currWrite.struct.id.clock + currWrite.struct.length && next.constructor !== Skip; next = currDecoder.next()) {
        writeStructToLazyStructWriter(lazyStructEncoder, currWrite.struct, currWrite.offset);
        currWrite = { struct: next, offset: 0 };
      }
    }
    if (currWrite !== null) {
      writeStructToLazyStructWriter(lazyStructEncoder, currWrite.struct, currWrite.offset);
      currWrite = null;
    }
    finishLazyStructWriting(lazyStructEncoder);
    const dss = updateDecoders.map((decoder) => readDeleteSet(decoder));
    const ds = mergeDeleteSets(dss);
    writeDeleteSet(updateEncoder, ds);
    return updateEncoder.toUint8Array();
  };
  var diffUpdateV2 = (update, sv, YDecoder = UpdateDecoderV2, YEncoder = UpdateEncoderV2) => {
    const state = decodeStateVector(sv);
    const encoder = new YEncoder();
    const lazyStructWriter = new LazyStructWriter(encoder);
    const decoder = new YDecoder(createDecoder(update));
    const reader = new LazyStructReader(decoder, false);
    while (reader.curr) {
      const curr = reader.curr;
      const currClient = curr.id.client;
      const svClock = state.get(currClient) || 0;
      if (reader.curr.constructor === Skip) {
        reader.next();
        continue;
      }
      if (curr.id.clock + curr.length > svClock) {
        writeStructToLazyStructWriter(lazyStructWriter, curr, max(svClock - curr.id.clock, 0));
        reader.next();
        while (reader.curr && reader.curr.id.client === currClient) {
          writeStructToLazyStructWriter(lazyStructWriter, reader.curr, 0);
          reader.next();
        }
      } else {
        while (reader.curr && reader.curr.id.client === currClient && reader.curr.id.clock + reader.curr.length <= svClock) {
          reader.next();
        }
      }
    }
    finishLazyStructWriting(lazyStructWriter);
    const ds = readDeleteSet(decoder);
    writeDeleteSet(encoder, ds);
    return encoder.toUint8Array();
  };
  var diffUpdate = (update, sv) => diffUpdateV2(update, sv, UpdateDecoderV1, UpdateEncoderV1);
  var flushLazyStructWriter = (lazyWriter) => {
    if (lazyWriter.written > 0) {
      lazyWriter.clientStructs.push({ written: lazyWriter.written, restEncoder: toUint8Array(lazyWriter.encoder.restEncoder) });
      lazyWriter.encoder.restEncoder = createEncoder();
      lazyWriter.written = 0;
    }
  };
  var writeStructToLazyStructWriter = (lazyWriter, struct, offset) => {
    if (lazyWriter.written > 0 && lazyWriter.currClient !== struct.id.client) {
      flushLazyStructWriter(lazyWriter);
    }
    if (lazyWriter.written === 0) {
      lazyWriter.currClient = struct.id.client;
      lazyWriter.encoder.writeClient(struct.id.client);
      writeVarUint(lazyWriter.encoder.restEncoder, struct.id.clock + offset);
    }
    struct.write(lazyWriter.encoder, offset);
    lazyWriter.written++;
  };
  var finishLazyStructWriting = (lazyWriter) => {
    flushLazyStructWriter(lazyWriter);
    const restEncoder = lazyWriter.encoder.restEncoder;
    writeVarUint(restEncoder, lazyWriter.clientStructs.length);
    for (let i = 0; i < lazyWriter.clientStructs.length; i++) {
      const partStructs = lazyWriter.clientStructs[i];
      writeVarUint(restEncoder, partStructs.written);
      writeUint8Array(restEncoder, partStructs.restEncoder);
    }
  };
  var convertUpdateFormat = (update, blockTransformer, YDecoder, YEncoder) => {
    const updateDecoder = new YDecoder(createDecoder(update));
    const lazyDecoder = new LazyStructReader(updateDecoder, false);
    const updateEncoder = new YEncoder();
    const lazyWriter = new LazyStructWriter(updateEncoder);
    for (let curr = lazyDecoder.curr; curr !== null; curr = lazyDecoder.next()) {
      writeStructToLazyStructWriter(lazyWriter, blockTransformer(curr), 0);
    }
    finishLazyStructWriting(lazyWriter);
    const ds = readDeleteSet(updateDecoder);
    writeDeleteSet(updateEncoder, ds);
    return updateEncoder.toUint8Array();
  };
  var createObfuscator = ({ formatting = true, subdocs = true, yxml = true } = {}) => {
    let i = 0;
    const mapKeyCache = create();
    const nodeNameCache = create();
    const formattingKeyCache = create();
    const formattingValueCache = create();
    formattingValueCache.set(null, null);
    return (block) => {
      switch (block.constructor) {
        case GC:
        case Skip:
          return block;
        case Item: {
          const item = (
            /** @type {Item} */
            block
          );
          const content = item.content;
          switch (content.constructor) {
            case ContentDeleted:
              break;
            case ContentType: {
              if (yxml) {
                const type = (
                  /** @type {ContentType} */
                  content.type
                );
                if (type instanceof YXmlElement) {
                  type.nodeName = setIfUndefined(nodeNameCache, type.nodeName, () => "node-" + i);
                }
                if (type instanceof YXmlHook) {
                  type.hookName = setIfUndefined(nodeNameCache, type.hookName, () => "hook-" + i);
                }
              }
              break;
            }
            case ContentAny: {
              const c = (
                /** @type {ContentAny} */
                content
              );
              c.arr = c.arr.map(() => i);
              break;
            }
            case ContentBinary: {
              const c = (
                /** @type {ContentBinary} */
                content
              );
              c.content = new Uint8Array([i]);
              break;
            }
            case ContentDoc: {
              const c = (
                /** @type {ContentDoc} */
                content
              );
              if (subdocs) {
                c.opts = {};
                c.doc.guid = i + "";
              }
              break;
            }
            case ContentEmbed: {
              const c = (
                /** @type {ContentEmbed} */
                content
              );
              c.embed = {};
              break;
            }
            case ContentFormat: {
              const c = (
                /** @type {ContentFormat} */
                content
              );
              if (formatting) {
                c.key = setIfUndefined(formattingKeyCache, c.key, () => i + "");
                c.value = setIfUndefined(formattingValueCache, c.value, () => ({ i }));
              }
              break;
            }
            case ContentJSON: {
              const c = (
                /** @type {ContentJSON} */
                content
              );
              c.arr = c.arr.map(() => i);
              break;
            }
            case ContentString: {
              const c = (
                /** @type {ContentString} */
                content
              );
              c.str = repeat(i % 10 + "", c.str.length);
              break;
            }
            default:
              unexpectedCase();
          }
          if (item.parentSub) {
            item.parentSub = setIfUndefined(mapKeyCache, item.parentSub, () => i + "");
          }
          i++;
          return block;
        }
        default:
          unexpectedCase();
      }
    };
  };
  var obfuscateUpdate = (update, opts) => convertUpdateFormat(update, createObfuscator(opts), UpdateDecoderV1, UpdateEncoderV1);
  var obfuscateUpdateV2 = (update, opts) => convertUpdateFormat(update, createObfuscator(opts), UpdateDecoderV2, UpdateEncoderV2);
  var convertUpdateFormatV1ToV2 = (update) => convertUpdateFormat(update, id, UpdateDecoderV1, UpdateEncoderV2);
  var convertUpdateFormatV2ToV1 = (update) => convertUpdateFormat(update, id, UpdateDecoderV2, UpdateEncoderV1);
  var errorComputeChanges = "You must not compute changes after the event-handler fired.";
  var YEvent = class {
    /**
     * @param {T} target The changed type.
     * @param {Transaction} transaction
     */
    constructor(target, transaction) {
      this.target = target;
      this.currentTarget = target;
      this.transaction = transaction;
      this._changes = null;
      this._keys = null;
      this._delta = null;
      this._path = null;
    }
    /**
     * Computes the path from `y` to the changed type.
     *
     * @todo v14 should standardize on path: Array<{parent, index}> because that is easier to work with.
     *
     * The following property holds:
     * @example
     *   let type = y
     *   event.path.forEach(dir => {
     *     type = type.get(dir)
     *   })
     *   type === event.target // => true
     */
    get path() {
      return this._path || (this._path = getPathTo(this.currentTarget, this.target));
    }
    /**
     * Check if a struct is deleted by this event.
     *
     * In contrast to change.deleted, this method also returns true if the struct was added and then deleted.
     *
     * @param {AbstractStruct} struct
     * @return {boolean}
     */
    deletes(struct) {
      return isDeleted(this.transaction.deleteSet, struct.id);
    }
    /**
     * @type {Map<string, { action: 'add' | 'update' | 'delete', oldValue: any }>}
     */
    get keys() {
      if (this._keys === null) {
        if (this.transaction.doc._transactionCleanups.length === 0) {
          throw create3(errorComputeChanges);
        }
        const keys2 = /* @__PURE__ */ new Map();
        const target = this.target;
        const changed = (
          /** @type Set<string|null> */
          this.transaction.changed.get(target)
        );
        changed.forEach((key) => {
          if (key !== null) {
            const item = (
              /** @type {Item} */
              target._map.get(key)
            );
            let action;
            let oldValue;
            if (this.adds(item)) {
              let prev = item.left;
              while (prev !== null && this.adds(prev)) {
                prev = prev.left;
              }
              if (this.deletes(item)) {
                if (prev !== null && this.deletes(prev)) {
                  action = "delete";
                  oldValue = last(prev.content.getContent());
                } else {
                  return;
                }
              } else {
                if (prev !== null && this.deletes(prev)) {
                  action = "update";
                  oldValue = last(prev.content.getContent());
                } else {
                  action = "add";
                  oldValue = void 0;
                }
              }
            } else {
              if (this.deletes(item)) {
                action = "delete";
                oldValue = last(
                  /** @type {Item} */
                  item.content.getContent()
                );
              } else {
                return;
              }
            }
            keys2.set(key, { action, oldValue });
          }
        });
        this._keys = keys2;
      }
      return this._keys;
    }
    /**
     * This is a computed property. Note that this can only be safely computed during the
     * event call. Computing this property after other changes happened might result in
     * unexpected behavior (incorrect computation of deltas). A safe way to collect changes
     * is to store the `changes` or the `delta` object. Avoid storing the `transaction` object.
     *
     * @type {Array<{insert?: string | Array<any> | object | AbstractType<any>, retain?: number, delete?: number, attributes?: Object<string, any>}>}
     */
    get delta() {
      return this.changes.delta;
    }
    /**
     * Check if a struct is added by this event.
     *
     * In contrast to change.deleted, this method also returns true if the struct was added and then deleted.
     *
     * @param {AbstractStruct} struct
     * @return {boolean}
     */
    adds(struct) {
      return struct.id.clock >= (this.transaction.beforeState.get(struct.id.client) || 0);
    }
    /**
     * This is a computed property. Note that this can only be safely computed during the
     * event call. Computing this property after other changes happened might result in
     * unexpected behavior (incorrect computation of deltas). A safe way to collect changes
     * is to store the `changes` or the `delta` object. Avoid storing the `transaction` object.
     *
     * @type {{added:Set<Item>,deleted:Set<Item>,keys:Map<string,{action:'add'|'update'|'delete',oldValue:any}>,delta:Array<{insert?:Array<any>|string, delete?:number, retain?:number}>}}
     */
    get changes() {
      let changes = this._changes;
      if (changes === null) {
        if (this.transaction.doc._transactionCleanups.length === 0) {
          throw create3(errorComputeChanges);
        }
        const target = this.target;
        const added = create2();
        const deleted = create2();
        const delta = [];
        changes = {
          added,
          deleted,
          delta,
          keys: this.keys
        };
        const changed = (
          /** @type Set<string|null> */
          this.transaction.changed.get(target)
        );
        if (changed.has(null)) {
          let lastOp = null;
          const packOp = () => {
            if (lastOp) {
              delta.push(lastOp);
            }
          };
          for (let item = target._start; item !== null; item = item.right) {
            if (item.deleted) {
              if (this.deletes(item) && !this.adds(item)) {
                if (lastOp === null || lastOp.delete === void 0) {
                  packOp();
                  lastOp = { delete: 0 };
                }
                lastOp.delete += item.length;
                deleted.add(item);
              }
            } else {
              if (this.adds(item)) {
                if (lastOp === null || lastOp.insert === void 0) {
                  packOp();
                  lastOp = { insert: [] };
                }
                lastOp.insert = lastOp.insert.concat(item.content.getContent());
                added.add(item);
              } else {
                if (lastOp === null || lastOp.retain === void 0) {
                  packOp();
                  lastOp = { retain: 0 };
                }
                lastOp.retain += item.length;
              }
            }
          }
          if (lastOp !== null && lastOp.retain === void 0) {
            packOp();
          }
        }
        this._changes = changes;
      }
      return (
        /** @type {any} */
        changes
      );
    }
  };
  var getPathTo = (parent, child) => {
    const path = [];
    while (child._item !== null && child !== parent) {
      if (child._item.parentSub !== null) {
        path.unshift(child._item.parentSub);
      } else {
        let i = 0;
        let c = (
          /** @type {AbstractType<any>} */
          child._item.parent._start
        );
        while (c !== child._item && c !== null) {
          if (!c.deleted && c.countable) {
            i += c.length;
          }
          c = c.right;
        }
        path.unshift(i);
      }
      child = /** @type {AbstractType<any>} */
      child._item.parent;
    }
    return path;
  };
  var warnPrematureAccess = () => {
    warn("Invalid access: Add Yjs type to a document before reading data.");
  };
  var maxSearchMarker = 80;
  var globalSearchMarkerTimestamp = 0;
  var ArraySearchMarker = class {
    /**
     * @param {Item} p
     * @param {number} index
     */
    constructor(p, index) {
      p.marker = true;
      this.p = p;
      this.index = index;
      this.timestamp = globalSearchMarkerTimestamp++;
    }
  };
  var refreshMarkerTimestamp = (marker) => {
    marker.timestamp = globalSearchMarkerTimestamp++;
  };
  var overwriteMarker = (marker, p, index) => {
    marker.p.marker = false;
    marker.p = p;
    p.marker = true;
    marker.index = index;
    marker.timestamp = globalSearchMarkerTimestamp++;
  };
  var markPosition = (searchMarker, p, index) => {
    if (searchMarker.length >= maxSearchMarker) {
      const marker = searchMarker.reduce((a, b) => a.timestamp < b.timestamp ? a : b);
      overwriteMarker(marker, p, index);
      return marker;
    } else {
      const pm = new ArraySearchMarker(p, index);
      searchMarker.push(pm);
      return pm;
    }
  };
  var findMarker = (yarray, index) => {
    if (yarray._start === null || index === 0 || yarray._searchMarker === null) {
      return null;
    }
    const marker = yarray._searchMarker.length === 0 ? null : yarray._searchMarker.reduce((a, b) => abs(index - a.index) < abs(index - b.index) ? a : b);
    let p = yarray._start;
    let pindex = 0;
    if (marker !== null) {
      p = marker.p;
      pindex = marker.index;
      refreshMarkerTimestamp(marker);
    }
    while (p.right !== null && pindex < index) {
      if (!p.deleted && p.countable) {
        if (index < pindex + p.length) {
          break;
        }
        pindex += p.length;
      }
      p = p.right;
    }
    while (p.left !== null && pindex > index) {
      p = p.left;
      if (!p.deleted && p.countable) {
        pindex -= p.length;
      }
    }
    while (p.left !== null && p.left.id.client === p.id.client && p.left.id.clock + p.left.length === p.id.clock) {
      p = p.left;
      if (!p.deleted && p.countable) {
        pindex -= p.length;
      }
    }
    if (marker !== null && abs(marker.index - pindex) < /** @type {YText|YArray<any>} */
    p.parent.length / maxSearchMarker) {
      overwriteMarker(marker, p, pindex);
      return marker;
    } else {
      return markPosition(yarray._searchMarker, p, pindex);
    }
  };
  var updateMarkerChanges = (searchMarker, index, len) => {
    for (let i = searchMarker.length - 1; i >= 0; i--) {
      const m = searchMarker[i];
      if (len > 0) {
        let p = m.p;
        p.marker = false;
        while (p && (p.deleted || !p.countable)) {
          p = p.left;
          if (p && !p.deleted && p.countable) {
            m.index -= p.length;
          }
        }
        if (p === null || p.marker === true) {
          searchMarker.splice(i, 1);
          continue;
        }
        m.p = p;
        p.marker = true;
      }
      if (index < m.index || len > 0 && index === m.index) {
        m.index = max(index, m.index + len);
      }
    }
  };
  var getTypeChildren = (t) => {
    t.doc ?? warnPrematureAccess();
    let s = t._start;
    const arr = [];
    while (s) {
      arr.push(s);
      s = s.right;
    }
    return arr;
  };
  var callTypeObservers = (type, transaction, event) => {
    const changedType = type;
    const changedParentTypes = transaction.changedParentTypes;
    while (true) {
      setIfUndefined(changedParentTypes, type, () => []).push(event);
      if (type._item === null) {
        break;
      }
      type = /** @type {AbstractType<any>} */
      type._item.parent;
    }
    callEventHandlerListeners(changedType._eH, event, transaction);
  };
  var AbstractType = class {
    constructor() {
      this._item = null;
      this._map = /* @__PURE__ */ new Map();
      this._start = null;
      this.doc = null;
      this._length = 0;
      this._eH = createEventHandler();
      this._dEH = createEventHandler();
      this._searchMarker = null;
    }
    /**
     * @return {AbstractType<any>|null}
     */
    get parent() {
      return this._item ? (
        /** @type {AbstractType<any>} */
        this._item.parent
      ) : null;
    }
    /**
     * Integrate this type into the Yjs instance.
     *
     * * Save this struct in the os
     * * This type is sent to other client
     * * Observer functions are fired
     *
     * @param {Doc} y The Yjs instance
     * @param {Item|null} item
     */
    _integrate(y, item) {
      this.doc = y;
      this._item = item;
    }
    /**
     * @return {AbstractType<EventType>}
     */
    _copy() {
      throw methodUnimplemented();
    }
    /**
     * Makes a copy of this data type that can be included somewhere else.
     *
     * Note that the content is only readable _after_ it has been included somewhere in the Ydoc.
     *
     * @return {AbstractType<EventType>}
     */
    clone() {
      throw methodUnimplemented();
    }
    /**
     * @param {UpdateEncoderV1 | UpdateEncoderV2} _encoder
     */
    _write(_encoder) {
    }
    /**
     * The first non-deleted item
     */
    get _first() {
      let n = this._start;
      while (n !== null && n.deleted) {
        n = n.right;
      }
      return n;
    }
    /**
     * Creates YEvent and calls all type observers.
     * Must be implemented by each type.
     *
     * @param {Transaction} transaction
     * @param {Set<null|string>} _parentSubs Keys changed on this type. `null` if list was modified.
     */
    _callObserver(transaction, _parentSubs) {
      if (!transaction.local && this._searchMarker) {
        this._searchMarker.length = 0;
      }
    }
    /**
     * Observe all events that are created on this type.
     *
     * @param {function(EventType, Transaction):void} f Observer function
     */
    observe(f) {
      addEventHandlerListener(this._eH, f);
    }
    /**
     * Observe all events that are created by this type and its children.
     *
     * @param {function(Array<YEvent<any>>,Transaction):void} f Observer function
     */
    observeDeep(f) {
      addEventHandlerListener(this._dEH, f);
    }
    /**
     * Unregister an observer function.
     *
     * @param {function(EventType,Transaction):void} f Observer function
     */
    unobserve(f) {
      removeEventHandlerListener(this._eH, f);
    }
    /**
     * Unregister an observer function.
     *
     * @param {function(Array<YEvent<any>>,Transaction):void} f Observer function
     */
    unobserveDeep(f) {
      removeEventHandlerListener(this._dEH, f);
    }
    /**
     * @abstract
     * @return {any}
     */
    toJSON() {
    }
  };
  var typeListSlice = (type, start, end) => {
    type.doc ?? warnPrematureAccess();
    if (start < 0) {
      start = type._length + start;
    }
    if (end < 0) {
      end = type._length + end;
    }
    let len = end - start;
    const cs = [];
    let n = type._start;
    while (n !== null && len > 0) {
      if (n.countable && !n.deleted) {
        const c = n.content.getContent();
        if (c.length <= start) {
          start -= c.length;
        } else {
          for (let i = start; i < c.length && len > 0; i++) {
            cs.push(c[i]);
            len--;
          }
          start = 0;
        }
      }
      n = n.right;
    }
    return cs;
  };
  var typeListToArray = (type) => {
    type.doc ?? warnPrematureAccess();
    const cs = [];
    let n = type._start;
    while (n !== null) {
      if (n.countable && !n.deleted) {
        const c = n.content.getContent();
        for (let i = 0; i < c.length; i++) {
          cs.push(c[i]);
        }
      }
      n = n.right;
    }
    return cs;
  };
  var typeListToArraySnapshot = (type, snapshot2) => {
    const cs = [];
    let n = type._start;
    while (n !== null) {
      if (n.countable && isVisible(n, snapshot2)) {
        const c = n.content.getContent();
        for (let i = 0; i < c.length; i++) {
          cs.push(c[i]);
        }
      }
      n = n.right;
    }
    return cs;
  };
  var typeListForEach = (type, f) => {
    let index = 0;
    let n = type._start;
    type.doc ?? warnPrematureAccess();
    while (n !== null) {
      if (n.countable && !n.deleted) {
        const c = n.content.getContent();
        for (let i = 0; i < c.length; i++) {
          f(c[i], index++, type);
        }
      }
      n = n.right;
    }
  };
  var typeListMap = (type, f) => {
    const result = [];
    typeListForEach(type, (c, i) => {
      result.push(f(c, i, type));
    });
    return result;
  };
  var typeListCreateIterator = (type) => {
    let n = type._start;
    let currentContent = null;
    let currentContentIndex = 0;
    return {
      [Symbol.iterator]() {
        return this;
      },
      next: () => {
        if (currentContent === null) {
          while (n !== null && n.deleted) {
            n = n.right;
          }
          if (n === null) {
            return {
              done: true,
              value: void 0
            };
          }
          currentContent = n.content.getContent();
          currentContentIndex = 0;
          n = n.right;
        }
        const value = currentContent[currentContentIndex++];
        if (currentContent.length <= currentContentIndex) {
          currentContent = null;
        }
        return {
          done: false,
          value
        };
      }
    };
  };
  var typeListGet = (type, index) => {
    type.doc ?? warnPrematureAccess();
    const marker = findMarker(type, index);
    let n = type._start;
    if (marker !== null) {
      n = marker.p;
      index -= marker.index;
    }
    for (; n !== null; n = n.right) {
      if (!n.deleted && n.countable) {
        if (index < n.length) {
          return n.content.getContent()[index];
        }
        index -= n.length;
      }
    }
  };
  var typeListInsertGenericsAfter = (transaction, parent, referenceItem, content) => {
    let left = referenceItem;
    const doc2 = transaction.doc;
    const ownClientId = doc2.clientID;
    const store = doc2.store;
    const right = referenceItem === null ? parent._start : referenceItem.right;
    let jsonContent = [];
    const packJsonContent = () => {
      if (jsonContent.length > 0) {
        left = new Item(createID(ownClientId, getState(store, ownClientId)), left, left && left.lastId, right, right && right.id, parent, null, new ContentAny(jsonContent));
        left.integrate(transaction, 0);
        jsonContent = [];
      }
    };
    content.forEach((c) => {
      if (c === null) {
        jsonContent.push(c);
      } else {
        switch (c.constructor) {
          case Number:
          case Object:
          case Boolean:
          case Array:
          case String:
            jsonContent.push(c);
            break;
          default:
            packJsonContent();
            switch (c.constructor) {
              case Uint8Array:
              case ArrayBuffer:
                left = new Item(createID(ownClientId, getState(store, ownClientId)), left, left && left.lastId, right, right && right.id, parent, null, new ContentBinary(new Uint8Array(
                  /** @type {Uint8Array} */
                  c
                )));
                left.integrate(transaction, 0);
                break;
              case Doc:
                left = new Item(createID(ownClientId, getState(store, ownClientId)), left, left && left.lastId, right, right && right.id, parent, null, new ContentDoc(
                  /** @type {Doc} */
                  c
                ));
                left.integrate(transaction, 0);
                break;
              default:
                if (c instanceof AbstractType) {
                  left = new Item(createID(ownClientId, getState(store, ownClientId)), left, left && left.lastId, right, right && right.id, parent, null, new ContentType(c));
                  left.integrate(transaction, 0);
                } else {
                  throw new Error("Unexpected content type in insert operation");
                }
            }
        }
      }
    });
    packJsonContent();
  };
  var lengthExceeded = () => create3("Length exceeded!");
  var typeListInsertGenerics = (transaction, parent, index, content) => {
    if (index > parent._length) {
      throw lengthExceeded();
    }
    if (index === 0) {
      if (parent._searchMarker) {
        updateMarkerChanges(parent._searchMarker, index, content.length);
      }
      return typeListInsertGenericsAfter(transaction, parent, null, content);
    }
    const startIndex = index;
    const marker = findMarker(parent, index);
    let n = parent._start;
    if (marker !== null) {
      n = marker.p;
      index -= marker.index;
      if (index === 0) {
        n = n.prev;
        index += n && n.countable && !n.deleted ? n.length : 0;
      }
    }
    for (; n !== null; n = n.right) {
      if (!n.deleted && n.countable) {
        if (index <= n.length) {
          if (index < n.length) {
            getItemCleanStart(transaction, createID(n.id.client, n.id.clock + index));
          }
          break;
        }
        index -= n.length;
      }
    }
    if (parent._searchMarker) {
      updateMarkerChanges(parent._searchMarker, startIndex, content.length);
    }
    return typeListInsertGenericsAfter(transaction, parent, n, content);
  };
  var typeListPushGenerics = (transaction, parent, content) => {
    const marker = (parent._searchMarker || []).reduce((maxMarker, currMarker) => currMarker.index > maxMarker.index ? currMarker : maxMarker, { index: 0, p: parent._start });
    let n = marker.p;
    if (n) {
      while (n.right) {
        n = n.right;
      }
    }
    return typeListInsertGenericsAfter(transaction, parent, n, content);
  };
  var typeListDelete = (transaction, parent, index, length2) => {
    if (length2 === 0) {
      return;
    }
    const startIndex = index;
    const startLength = length2;
    const marker = findMarker(parent, index);
    let n = parent._start;
    if (marker !== null) {
      n = marker.p;
      index -= marker.index;
    }
    for (; n !== null && index > 0; n = n.right) {
      if (!n.deleted && n.countable) {
        if (index < n.length) {
          getItemCleanStart(transaction, createID(n.id.client, n.id.clock + index));
        }
        index -= n.length;
      }
    }
    while (length2 > 0 && n !== null) {
      if (!n.deleted) {
        if (length2 < n.length) {
          getItemCleanStart(transaction, createID(n.id.client, n.id.clock + length2));
        }
        n.delete(transaction);
        length2 -= n.length;
      }
      n = n.right;
    }
    if (length2 > 0) {
      throw lengthExceeded();
    }
    if (parent._searchMarker) {
      updateMarkerChanges(
        parent._searchMarker,
        startIndex,
        -startLength + length2
        /* in case we remove the above exception */
      );
    }
  };
  var typeMapDelete = (transaction, parent, key) => {
    const c = parent._map.get(key);
    if (c !== void 0) {
      c.delete(transaction);
    }
  };
  var typeMapSet = (transaction, parent, key, value) => {
    const left = parent._map.get(key) || null;
    const doc2 = transaction.doc;
    const ownClientId = doc2.clientID;
    let content;
    if (value == null) {
      content = new ContentAny([value]);
    } else {
      switch (value.constructor) {
        case Number:
        case Object:
        case Boolean:
        case Array:
        case String:
        case Date:
        case BigInt:
          content = new ContentAny([value]);
          break;
        case Uint8Array:
          content = new ContentBinary(
            /** @type {Uint8Array} */
            value
          );
          break;
        case Doc:
          content = new ContentDoc(
            /** @type {Doc} */
            value
          );
          break;
        default:
          if (value instanceof AbstractType) {
            content = new ContentType(value);
          } else {
            throw new Error("Unexpected content type");
          }
      }
    }
    new Item(createID(ownClientId, getState(doc2.store, ownClientId)), left, left && left.lastId, null, null, parent, key, content).integrate(transaction, 0);
  };
  var typeMapGet = (parent, key) => {
    parent.doc ?? warnPrematureAccess();
    const val = parent._map.get(key);
    return val !== void 0 && !val.deleted ? val.content.getContent()[val.length - 1] : void 0;
  };
  var typeMapGetAll = (parent) => {
    const res = {};
    parent.doc ?? warnPrematureAccess();
    parent._map.forEach((value, key) => {
      if (!value.deleted) {
        res[key] = value.content.getContent()[value.length - 1];
      }
    });
    return res;
  };
  var typeMapHas = (parent, key) => {
    parent.doc ?? warnPrematureAccess();
    const val = parent._map.get(key);
    return val !== void 0 && !val.deleted;
  };
  var typeMapGetSnapshot = (parent, key, snapshot2) => {
    let v = parent._map.get(key) || null;
    while (v !== null && (!snapshot2.sv.has(v.id.client) || v.id.clock >= (snapshot2.sv.get(v.id.client) || 0))) {
      v = v.left;
    }
    return v !== null && isVisible(v, snapshot2) ? v.content.getContent()[v.length - 1] : void 0;
  };
  var typeMapGetAllSnapshot = (parent, snapshot2) => {
    const res = {};
    parent._map.forEach((value, key) => {
      let v = value;
      while (v !== null && (!snapshot2.sv.has(v.id.client) || v.id.clock >= (snapshot2.sv.get(v.id.client) || 0))) {
        v = v.left;
      }
      if (v !== null && isVisible(v, snapshot2)) {
        res[key] = v.content.getContent()[v.length - 1];
      }
    });
    return res;
  };
  var createMapIterator = (type) => {
    type.doc ?? warnPrematureAccess();
    return iteratorFilter(
      type._map.entries(),
      /** @param {any} entry */
      (entry) => !entry[1].deleted
    );
  };
  var YArrayEvent = class extends YEvent {
  };
  var YArray = class _YArray extends AbstractType {
    constructor() {
      super();
      this._prelimContent = [];
      this._searchMarker = [];
    }
    /**
     * Construct a new YArray containing the specified items.
     * @template {Object<string,any>|Array<any>|number|null|string|Uint8Array} T
     * @param {Array<T>} items
     * @return {YArray<T>}
     */
    static from(items) {
      const a = new _YArray();
      a.push(items);
      return a;
    }
    /**
     * Integrate this type into the Yjs instance.
     *
     * * Save this struct in the os
     * * This type is sent to other client
     * * Observer functions are fired
     *
     * @param {Doc} y The Yjs instance
     * @param {Item} item
     */
    _integrate(y, item) {
      super._integrate(y, item);
      this.insert(
        0,
        /** @type {Array<any>} */
        this._prelimContent
      );
      this._prelimContent = null;
    }
    /**
     * @return {YArray<T>}
     */
    _copy() {
      return new _YArray();
    }
    /**
     * Makes a copy of this data type that can be included somewhere else.
     *
     * Note that the content is only readable _after_ it has been included somewhere in the Ydoc.
     *
     * @return {YArray<T>}
     */
    clone() {
      const arr = new _YArray();
      arr.insert(0, this.toArray().map(
        (el) => el instanceof AbstractType ? (
          /** @type {typeof el} */
          el.clone()
        ) : el
      ));
      return arr;
    }
    get length() {
      this.doc ?? warnPrematureAccess();
      return this._length;
    }
    /**
     * Creates YArrayEvent and calls observers.
     *
     * @param {Transaction} transaction
     * @param {Set<null|string>} parentSubs Keys changed on this type. `null` if list was modified.
     */
    _callObserver(transaction, parentSubs) {
      super._callObserver(transaction, parentSubs);
      callTypeObservers(this, transaction, new YArrayEvent(this, transaction));
    }
    /**
     * Inserts new content at an index.
     *
     * Important: This function expects an array of content. Not just a content
     * object. The reason for this "weirdness" is that inserting several elements
     * is very efficient when it is done as a single operation.
     *
     * @example
     *  // Insert character 'a' at position 0
     *  yarray.insert(0, ['a'])
     *  // Insert numbers 1, 2 at position 1
     *  yarray.insert(1, [1, 2])
     *
     * @param {number} index The index to insert content at.
     * @param {Array<T>} content The array of content
     */
    insert(index, content) {
      if (this.doc !== null) {
        transact(this.doc, (transaction) => {
          typeListInsertGenerics(
            transaction,
            this,
            index,
            /** @type {any} */
            content
          );
        });
      } else {
        this._prelimContent.splice(index, 0, ...content);
      }
    }
    /**
     * Appends content to this YArray.
     *
     * @param {Array<T>} content Array of content to append.
     *
     * @todo Use the following implementation in all types.
     */
    push(content) {
      if (this.doc !== null) {
        transact(this.doc, (transaction) => {
          typeListPushGenerics(
            transaction,
            this,
            /** @type {any} */
            content
          );
        });
      } else {
        this._prelimContent.push(...content);
      }
    }
    /**
     * Prepends content to this YArray.
     *
     * @param {Array<T>} content Array of content to prepend.
     */
    unshift(content) {
      this.insert(0, content);
    }
    /**
     * Deletes elements starting from an index.
     *
     * @param {number} index Index at which to start deleting elements
     * @param {number} length The number of elements to remove. Defaults to 1.
     */
    delete(index, length2 = 1) {
      if (this.doc !== null) {
        transact(this.doc, (transaction) => {
          typeListDelete(transaction, this, index, length2);
        });
      } else {
        this._prelimContent.splice(index, length2);
      }
    }
    /**
     * Returns the i-th element from a YArray.
     *
     * @param {number} index The index of the element to return from the YArray
     * @return {T}
     */
    get(index) {
      return typeListGet(this, index);
    }
    /**
     * Transforms this YArray to a JavaScript Array.
     *
     * @return {Array<T>}
     */
    toArray() {
      return typeListToArray(this);
    }
    /**
     * Returns a portion of this YArray into a JavaScript Array selected
     * from start to end (end not included).
     *
     * @param {number} [start]
     * @param {number} [end]
     * @return {Array<T>}
     */
    slice(start = 0, end = this.length) {
      return typeListSlice(this, start, end);
    }
    /**
     * Transforms this Shared Type to a JSON object.
     *
     * @return {Array<any>}
     */
    toJSON() {
      return this.map((c) => c instanceof AbstractType ? c.toJSON() : c);
    }
    /**
     * Returns an Array with the result of calling a provided function on every
     * element of this YArray.
     *
     * @template M
     * @param {function(T,number,YArray<T>):M} f Function that produces an element of the new Array
     * @return {Array<M>} A new array with each element being the result of the
     *                 callback function
     */
    map(f) {
      return typeListMap(
        this,
        /** @type {any} */
        f
      );
    }
    /**
     * Executes a provided function once on every element of this YArray.
     *
     * @param {function(T,number,YArray<T>):void} f A function to execute on every element of this YArray.
     */
    forEach(f) {
      typeListForEach(this, f);
    }
    /**
     * @return {IterableIterator<T>}
     */
    [Symbol.iterator]() {
      return typeListCreateIterator(this);
    }
    /**
     * @param {UpdateEncoderV1 | UpdateEncoderV2} encoder
     */
    _write(encoder) {
      encoder.writeTypeRef(YArrayRefID);
    }
  };
  var readYArray = (_decoder) => new YArray();
  var YMapEvent = class extends YEvent {
    /**
     * @param {YMap<T>} ymap The YArray that changed.
     * @param {Transaction} transaction
     * @param {Set<any>} subs The keys that changed.
     */
    constructor(ymap, transaction, subs) {
      super(ymap, transaction);
      this.keysChanged = subs;
    }
  };
  var YMap = class _YMap extends AbstractType {
    /**
     *
     * @param {Iterable<readonly [string, any]>=} entries - an optional iterable to initialize the YMap
     */
    constructor(entries) {
      super();
      this._prelimContent = null;
      if (entries === void 0) {
        this._prelimContent = /* @__PURE__ */ new Map();
      } else {
        this._prelimContent = new Map(entries);
      }
    }
    /**
     * Integrate this type into the Yjs instance.
     *
     * * Save this struct in the os
     * * This type is sent to other client
     * * Observer functions are fired
     *
     * @param {Doc} y The Yjs instance
     * @param {Item} item
     */
    _integrate(y, item) {
      super._integrate(y, item);
      this._prelimContent.forEach((value, key) => {
        this.set(key, value);
      });
      this._prelimContent = null;
    }
    /**
     * @return {YMap<MapType>}
     */
    _copy() {
      return new _YMap();
    }
    /**
     * Makes a copy of this data type that can be included somewhere else.
     *
     * Note that the content is only readable _after_ it has been included somewhere in the Ydoc.
     *
     * @return {YMap<MapType>}
     */
    clone() {
      const map2 = new _YMap();
      this.forEach((value, key) => {
        map2.set(key, value instanceof AbstractType ? (
          /** @type {typeof value} */
          value.clone()
        ) : value);
      });
      return map2;
    }
    /**
     * Creates YMapEvent and calls observers.
     *
     * @param {Transaction} transaction
     * @param {Set<null|string>} parentSubs Keys changed on this type. `null` if list was modified.
     */
    _callObserver(transaction, parentSubs) {
      callTypeObservers(this, transaction, new YMapEvent(this, transaction, parentSubs));
    }
    /**
     * Transforms this Shared Type to a JSON object.
     *
     * @return {Object<string,any>}
     */
    toJSON() {
      this.doc ?? warnPrematureAccess();
      const map2 = {};
      this._map.forEach((item, key) => {
        if (!item.deleted) {
          const v = item.content.getContent()[item.length - 1];
          map2[key] = v instanceof AbstractType ? v.toJSON() : v;
        }
      });
      return map2;
    }
    /**
     * Returns the size of the YMap (count of key/value pairs)
     *
     * @return {number}
     */
    get size() {
      return [...createMapIterator(this)].length;
    }
    /**
     * Returns the keys for each element in the YMap Type.
     *
     * @return {IterableIterator<string>}
     */
    keys() {
      return iteratorMap(
        createMapIterator(this),
        /** @param {any} v */
        (v) => v[0]
      );
    }
    /**
     * Returns the values for each element in the YMap Type.
     *
     * @return {IterableIterator<MapType>}
     */
    values() {
      return iteratorMap(
        createMapIterator(this),
        /** @param {any} v */
        (v) => v[1].content.getContent()[v[1].length - 1]
      );
    }
    /**
     * Returns an Iterator of [key, value] pairs
     *
     * @return {IterableIterator<[string, MapType]>}
     */
    entries() {
      return iteratorMap(
        createMapIterator(this),
        /** @param {any} v */
        (v) => (
          /** @type {any} */
          [v[0], v[1].content.getContent()[v[1].length - 1]]
        )
      );
    }
    /**
     * Executes a provided function on once on every key-value pair.
     *
     * @param {function(MapType,string,YMap<MapType>):void} f A function to execute on every element of this YArray.
     */
    forEach(f) {
      this.doc ?? warnPrematureAccess();
      this._map.forEach((item, key) => {
        if (!item.deleted) {
          f(item.content.getContent()[item.length - 1], key, this);
        }
      });
    }
    /**
     * Returns an Iterator of [key, value] pairs
     *
     * @return {IterableIterator<[string, MapType]>}
     */
    [Symbol.iterator]() {
      return this.entries();
    }
    /**
     * Remove a specified element from this YMap.
     *
     * @param {string} key The key of the element to remove.
     */
    delete(key) {
      if (this.doc !== null) {
        transact(this.doc, (transaction) => {
          typeMapDelete(transaction, this, key);
        });
      } else {
        this._prelimContent.delete(key);
      }
    }
    /**
     * Adds or updates an element with a specified key and value.
     * @template {MapType} VAL
     *
     * @param {string} key The key of the element to add to this YMap
     * @param {VAL} value The value of the element to add
     * @return {VAL}
     */
    set(key, value) {
      if (this.doc !== null) {
        transact(this.doc, (transaction) => {
          typeMapSet(
            transaction,
            this,
            key,
            /** @type {any} */
            value
          );
        });
      } else {
        this._prelimContent.set(key, value);
      }
      return value;
    }
    /**
     * Returns a specified element from this YMap.
     *
     * @param {string} key
     * @return {MapType|undefined}
     */
    get(key) {
      return (
        /** @type {any} */
        typeMapGet(this, key)
      );
    }
    /**
     * Returns a boolean indicating whether the specified key exists or not.
     *
     * @param {string} key The key to test.
     * @return {boolean}
     */
    has(key) {
      return typeMapHas(this, key);
    }
    /**
     * Removes all elements from this YMap.
     */
    clear() {
      if (this.doc !== null) {
        transact(this.doc, (transaction) => {
          this.forEach(function(_value, key, map2) {
            typeMapDelete(transaction, map2, key);
          });
        });
      } else {
        this._prelimContent.clear();
      }
    }
    /**
     * @param {UpdateEncoderV1 | UpdateEncoderV2} encoder
     */
    _write(encoder) {
      encoder.writeTypeRef(YMapRefID);
    }
  };
  var readYMap = (_decoder) => new YMap();
  var equalAttrs = (a, b) => a === b || typeof a === "object" && typeof b === "object" && a && b && equalFlat(a, b);
  var ItemTextListPosition = class {
    /**
     * @param {Item|null} left
     * @param {Item|null} right
     * @param {number} index
     * @param {Map<string,any>} currentAttributes
     */
    constructor(left, right, index, currentAttributes) {
      this.left = left;
      this.right = right;
      this.index = index;
      this.currentAttributes = currentAttributes;
    }
    /**
     * Only call this if you know that this.right is defined
     */
    forward() {
      if (this.right === null) {
        unexpectedCase();
      }
      switch (this.right.content.constructor) {
        case ContentFormat:
          if (!this.right.deleted) {
            updateCurrentAttributes(
              this.currentAttributes,
              /** @type {ContentFormat} */
              this.right.content
            );
          }
          break;
        default:
          if (!this.right.deleted) {
            this.index += this.right.length;
          }
          break;
      }
      this.left = this.right;
      this.right = this.right.right;
    }
  };
  var findNextPosition = (transaction, pos, count) => {
    while (pos.right !== null && count > 0) {
      switch (pos.right.content.constructor) {
        case ContentFormat:
          if (!pos.right.deleted) {
            updateCurrentAttributes(
              pos.currentAttributes,
              /** @type {ContentFormat} */
              pos.right.content
            );
          }
          break;
        default:
          if (!pos.right.deleted) {
            if (count < pos.right.length) {
              getItemCleanStart(transaction, createID(pos.right.id.client, pos.right.id.clock + count));
            }
            pos.index += pos.right.length;
            count -= pos.right.length;
          }
          break;
      }
      pos.left = pos.right;
      pos.right = pos.right.right;
    }
    return pos;
  };
  var findPosition = (transaction, parent, index, useSearchMarker) => {
    const currentAttributes = /* @__PURE__ */ new Map();
    const marker = useSearchMarker ? findMarker(parent, index) : null;
    if (marker) {
      const pos = new ItemTextListPosition(marker.p.left, marker.p, marker.index, currentAttributes);
      return findNextPosition(transaction, pos, index - marker.index);
    } else {
      const pos = new ItemTextListPosition(null, parent._start, 0, currentAttributes);
      return findNextPosition(transaction, pos, index);
    }
  };
  var insertNegatedAttributes = (transaction, parent, currPos, negatedAttributes) => {
    while (currPos.right !== null && (currPos.right.deleted === true || currPos.right.content.constructor === ContentFormat && equalAttrs(
      negatedAttributes.get(
        /** @type {ContentFormat} */
        currPos.right.content.key
      ),
      /** @type {ContentFormat} */
      currPos.right.content.value
    ))) {
      if (!currPos.right.deleted) {
        negatedAttributes.delete(
          /** @type {ContentFormat} */
          currPos.right.content.key
        );
      }
      currPos.forward();
    }
    const doc2 = transaction.doc;
    const ownClientId = doc2.clientID;
    negatedAttributes.forEach((val, key) => {
      const left = currPos.left;
      const right = currPos.right;
      const nextFormat = new Item(createID(ownClientId, getState(doc2.store, ownClientId)), left, left && left.lastId, right, right && right.id, parent, null, new ContentFormat(key, val));
      nextFormat.integrate(transaction, 0);
      currPos.right = nextFormat;
      currPos.forward();
    });
  };
  var updateCurrentAttributes = (currentAttributes, format) => {
    const { key, value } = format;
    if (value === null) {
      currentAttributes.delete(key);
    } else {
      currentAttributes.set(key, value);
    }
  };
  var minimizeAttributeChanges = (currPos, attributes) => {
    while (true) {
      if (currPos.right === null) {
        break;
      } else if (currPos.right.deleted || currPos.right.content.constructor === ContentFormat && equalAttrs(
        attributes[
          /** @type {ContentFormat} */
          currPos.right.content.key
        ] ?? null,
        /** @type {ContentFormat} */
        currPos.right.content.value
      )) ;
      else {
        break;
      }
      currPos.forward();
    }
  };
  var insertAttributes = (transaction, parent, currPos, attributes) => {
    const doc2 = transaction.doc;
    const ownClientId = doc2.clientID;
    const negatedAttributes = /* @__PURE__ */ new Map();
    for (const key in attributes) {
      const val = attributes[key];
      const currentVal = currPos.currentAttributes.get(key) ?? null;
      if (!equalAttrs(currentVal, val)) {
        negatedAttributes.set(key, currentVal);
        const { left, right } = currPos;
        currPos.right = new Item(createID(ownClientId, getState(doc2.store, ownClientId)), left, left && left.lastId, right, right && right.id, parent, null, new ContentFormat(key, val));
        currPos.right.integrate(transaction, 0);
        currPos.forward();
      }
    }
    return negatedAttributes;
  };
  var insertText = (transaction, parent, currPos, text2, attributes) => {
    currPos.currentAttributes.forEach((_val, key) => {
      if (attributes[key] === void 0) {
        attributes[key] = null;
      }
    });
    const doc2 = transaction.doc;
    const ownClientId = doc2.clientID;
    minimizeAttributeChanges(currPos, attributes);
    const negatedAttributes = insertAttributes(transaction, parent, currPos, attributes);
    const content = text2.constructor === String ? new ContentString(
      /** @type {string} */
      text2
    ) : text2 instanceof AbstractType ? new ContentType(text2) : new ContentEmbed(text2);
    let { left, right, index } = currPos;
    if (parent._searchMarker) {
      updateMarkerChanges(parent._searchMarker, currPos.index, content.getLength());
    }
    right = new Item(createID(ownClientId, getState(doc2.store, ownClientId)), left, left && left.lastId, right, right && right.id, parent, null, content);
    right.integrate(transaction, 0);
    currPos.right = right;
    currPos.index = index;
    currPos.forward();
    insertNegatedAttributes(transaction, parent, currPos, negatedAttributes);
  };
  var formatText = (transaction, parent, currPos, length2, attributes) => {
    const doc2 = transaction.doc;
    const ownClientId = doc2.clientID;
    minimizeAttributeChanges(currPos, attributes);
    const negatedAttributes = insertAttributes(transaction, parent, currPos, attributes);
    iterationLoop: while (currPos.right !== null && (length2 > 0 || negatedAttributes.size > 0 && (currPos.right.deleted || currPos.right.content.constructor === ContentFormat))) {
      if (!currPos.right.deleted) {
        switch (currPos.right.content.constructor) {
          case ContentFormat: {
            const { key, value } = (
              /** @type {ContentFormat} */
              currPos.right.content
            );
            const attr = attributes[key];
            if (attr !== void 0) {
              if (equalAttrs(attr, value)) {
                negatedAttributes.delete(key);
              } else {
                if (length2 === 0) {
                  break iterationLoop;
                }
                negatedAttributes.set(key, value);
              }
              currPos.right.delete(transaction);
            } else {
              currPos.currentAttributes.set(key, value);
            }
            break;
          }
          default:
            if (length2 < currPos.right.length) {
              getItemCleanStart(transaction, createID(currPos.right.id.client, currPos.right.id.clock + length2));
            }
            length2 -= currPos.right.length;
            break;
        }
      }
      currPos.forward();
    }
    if (length2 > 0) {
      let newlines = "";
      for (; length2 > 0; length2--) {
        newlines += "\n";
      }
      currPos.right = new Item(createID(ownClientId, getState(doc2.store, ownClientId)), currPos.left, currPos.left && currPos.left.lastId, currPos.right, currPos.right && currPos.right.id, parent, null, new ContentString(newlines));
      currPos.right.integrate(transaction, 0);
      currPos.forward();
    }
    insertNegatedAttributes(transaction, parent, currPos, negatedAttributes);
  };
  var cleanupFormattingGap = (transaction, start, curr, startAttributes, currAttributes) => {
    let end = start;
    const endFormats = create();
    while (end && (!end.countable || end.deleted)) {
      if (!end.deleted && end.content.constructor === ContentFormat) {
        const cf = (
          /** @type {ContentFormat} */
          end.content
        );
        endFormats.set(cf.key, cf);
      }
      end = end.right;
    }
    let cleanups = 0;
    let reachedCurr = false;
    while (start !== end) {
      if (curr === start) {
        reachedCurr = true;
      }
      if (!start.deleted) {
        const content = start.content;
        switch (content.constructor) {
          case ContentFormat: {
            const { key, value } = (
              /** @type {ContentFormat} */
              content
            );
            const startAttrValue = startAttributes.get(key) ?? null;
            if (endFormats.get(key) !== content || startAttrValue === value) {
              start.delete(transaction);
              cleanups++;
              if (!reachedCurr && (currAttributes.get(key) ?? null) === value && startAttrValue !== value) {
                if (startAttrValue === null) {
                  currAttributes.delete(key);
                } else {
                  currAttributes.set(key, startAttrValue);
                }
              }
            }
            if (!reachedCurr && !start.deleted) {
              updateCurrentAttributes(
                currAttributes,
                /** @type {ContentFormat} */
                content
              );
            }
            break;
          }
        }
      }
      start = /** @type {Item} */
      start.right;
    }
    return cleanups;
  };
  var cleanupContextlessFormattingGap = (transaction, item) => {
    while (item && item.right && (item.right.deleted || !item.right.countable)) {
      item = item.right;
    }
    const attrs = /* @__PURE__ */ new Set();
    while (item && (item.deleted || !item.countable)) {
      if (!item.deleted && item.content.constructor === ContentFormat) {
        const key = (
          /** @type {ContentFormat} */
          item.content.key
        );
        if (attrs.has(key)) {
          item.delete(transaction);
        } else {
          attrs.add(key);
        }
      }
      item = item.left;
    }
  };
  var cleanupYTextFormatting = (type) => {
    let res = 0;
    transact(
      /** @type {Doc} */
      type.doc,
      (transaction) => {
        let start = (
          /** @type {Item} */
          type._start
        );
        let end = type._start;
        let startAttributes = create();
        const currentAttributes = copy(startAttributes);
        while (end) {
          if (end.deleted === false) {
            switch (end.content.constructor) {
              case ContentFormat:
                updateCurrentAttributes(
                  currentAttributes,
                  /** @type {ContentFormat} */
                  end.content
                );
                break;
              default:
                res += cleanupFormattingGap(transaction, start, end, startAttributes, currentAttributes);
                startAttributes = copy(currentAttributes);
                start = end;
                break;
            }
          }
          end = end.right;
        }
      }
    );
    return res;
  };
  var cleanupYTextAfterTransaction = (transaction) => {
    const needFullCleanup = /* @__PURE__ */ new Set();
    const doc2 = transaction.doc;
    for (const [client, afterClock] of transaction.afterState.entries()) {
      const clock = transaction.beforeState.get(client) || 0;
      if (afterClock === clock) {
        continue;
      }
      iterateStructs(
        transaction,
        /** @type {Array<Item|GC>} */
        doc2.store.clients.get(client),
        clock,
        afterClock,
        (item) => {
          if (!item.deleted && /** @type {Item} */
          item.content.constructor === ContentFormat && item.constructor !== GC) {
            needFullCleanup.add(
              /** @type {any} */
              item.parent
            );
          }
        }
      );
    }
    transact(doc2, (t) => {
      iterateDeletedStructs(transaction, transaction.deleteSet, (item) => {
        if (item instanceof GC || !/** @type {YText} */
        item.parent._hasFormatting || needFullCleanup.has(
          /** @type {YText} */
          item.parent
        )) {
          return;
        }
        const parent = (
          /** @type {YText} */
          item.parent
        );
        if (item.content.constructor === ContentFormat) {
          needFullCleanup.add(parent);
        } else {
          cleanupContextlessFormattingGap(t, item);
        }
      });
      for (const yText of needFullCleanup) {
        cleanupYTextFormatting(yText);
      }
    });
  };
  var deleteText = (transaction, currPos, length2) => {
    const startLength = length2;
    const startAttrs = copy(currPos.currentAttributes);
    const start = currPos.right;
    while (length2 > 0 && currPos.right !== null) {
      if (currPos.right.deleted === false) {
        switch (currPos.right.content.constructor) {
          case ContentType:
          case ContentEmbed:
          case ContentString:
            if (length2 < currPos.right.length) {
              getItemCleanStart(transaction, createID(currPos.right.id.client, currPos.right.id.clock + length2));
            }
            length2 -= currPos.right.length;
            currPos.right.delete(transaction);
            break;
        }
      }
      currPos.forward();
    }
    if (start) {
      cleanupFormattingGap(transaction, start, currPos.right, startAttrs, currPos.currentAttributes);
    }
    const parent = (
      /** @type {AbstractType<any>} */
      /** @type {Item} */
      (currPos.left || currPos.right).parent
    );
    if (parent._searchMarker) {
      updateMarkerChanges(parent._searchMarker, currPos.index, -startLength + length2);
    }
    return currPos;
  };
  var YTextEvent = class extends YEvent {
    /**
     * @param {YText} ytext
     * @param {Transaction} transaction
     * @param {Set<any>} subs The keys that changed
     */
    constructor(ytext, transaction, subs) {
      super(ytext, transaction);
      this.childListChanged = false;
      this.keysChanged = /* @__PURE__ */ new Set();
      subs.forEach((sub) => {
        if (sub === null) {
          this.childListChanged = true;
        } else {
          this.keysChanged.add(sub);
        }
      });
    }
    /**
     * @type {{added:Set<Item>,deleted:Set<Item>,keys:Map<string,{action:'add'|'update'|'delete',oldValue:any}>,delta:Array<{insert?:Array<any>|string, delete?:number, retain?:number}>}}
     */
    get changes() {
      if (this._changes === null) {
        const changes = {
          keys: this.keys,
          delta: this.delta,
          added: /* @__PURE__ */ new Set(),
          deleted: /* @__PURE__ */ new Set()
        };
        this._changes = changes;
      }
      return (
        /** @type {any} */
        this._changes
      );
    }
    /**
     * Compute the changes in the delta format.
     * A {@link https://quilljs.com/docs/delta/|Quill Delta}) that represents the changes on the document.
     *
     * @type {Array<{insert?:string|object|AbstractType<any>, delete?:number, retain?:number, attributes?: Object<string,any>}>}
     *
     * @public
     */
    get delta() {
      if (this._delta === null) {
        const y = (
          /** @type {Doc} */
          this.target.doc
        );
        const delta = [];
        transact(y, (transaction) => {
          const currentAttributes = /* @__PURE__ */ new Map();
          const oldAttributes = /* @__PURE__ */ new Map();
          let item = this.target._start;
          let action = null;
          const attributes = {};
          let insert = "";
          let retain = 0;
          let deleteLen = 0;
          const addOp = () => {
            if (action !== null) {
              let op = null;
              switch (action) {
                case "delete":
                  if (deleteLen > 0) {
                    op = { delete: deleteLen };
                  }
                  deleteLen = 0;
                  break;
                case "insert":
                  if (typeof insert === "object" || insert.length > 0) {
                    op = { insert };
                    if (currentAttributes.size > 0) {
                      op.attributes = {};
                      currentAttributes.forEach((value, key) => {
                        if (value !== null) {
                          op.attributes[key] = value;
                        }
                      });
                    }
                  }
                  insert = "";
                  break;
                case "retain":
                  if (retain > 0) {
                    op = { retain };
                    if (!isEmpty(attributes)) {
                      op.attributes = assign({}, attributes);
                    }
                  }
                  retain = 0;
                  break;
              }
              if (op) delta.push(op);
              action = null;
            }
          };
          while (item !== null) {
            switch (item.content.constructor) {
              case ContentType:
              case ContentEmbed:
                if (this.adds(item)) {
                  if (!this.deletes(item)) {
                    addOp();
                    action = "insert";
                    insert = item.content.getContent()[0];
                    addOp();
                  }
                } else if (this.deletes(item)) {
                  if (action !== "delete") {
                    addOp();
                    action = "delete";
                  }
                  deleteLen += 1;
                } else if (!item.deleted) {
                  if (action !== "retain") {
                    addOp();
                    action = "retain";
                  }
                  retain += 1;
                }
                break;
              case ContentString:
                if (this.adds(item)) {
                  if (!this.deletes(item)) {
                    if (action !== "insert") {
                      addOp();
                      action = "insert";
                    }
                    insert += /** @type {ContentString} */
                    item.content.str;
                  }
                } else if (this.deletes(item)) {
                  if (action !== "delete") {
                    addOp();
                    action = "delete";
                  }
                  deleteLen += item.length;
                } else if (!item.deleted) {
                  if (action !== "retain") {
                    addOp();
                    action = "retain";
                  }
                  retain += item.length;
                }
                break;
              case ContentFormat: {
                const { key, value } = (
                  /** @type {ContentFormat} */
                  item.content
                );
                if (this.adds(item)) {
                  if (!this.deletes(item)) {
                    const curVal = currentAttributes.get(key) ?? null;
                    if (!equalAttrs(curVal, value)) {
                      if (action === "retain") {
                        addOp();
                      }
                      if (equalAttrs(value, oldAttributes.get(key) ?? null)) {
                        delete attributes[key];
                      } else {
                        attributes[key] = value;
                      }
                    } else if (value !== null) {
                      item.delete(transaction);
                    }
                  }
                } else if (this.deletes(item)) {
                  oldAttributes.set(key, value);
                  const curVal = currentAttributes.get(key) ?? null;
                  if (!equalAttrs(curVal, value)) {
                    if (action === "retain") {
                      addOp();
                    }
                    attributes[key] = curVal;
                  }
                } else if (!item.deleted) {
                  oldAttributes.set(key, value);
                  const attr = attributes[key];
                  if (attr !== void 0) {
                    if (!equalAttrs(attr, value)) {
                      if (action === "retain") {
                        addOp();
                      }
                      if (value === null) {
                        delete attributes[key];
                      } else {
                        attributes[key] = value;
                      }
                    } else if (attr !== null) {
                      item.delete(transaction);
                    }
                  }
                }
                if (!item.deleted) {
                  if (action === "insert") {
                    addOp();
                  }
                  updateCurrentAttributes(
                    currentAttributes,
                    /** @type {ContentFormat} */
                    item.content
                  );
                }
                break;
              }
            }
            item = item.right;
          }
          addOp();
          while (delta.length > 0) {
            const lastOp = delta[delta.length - 1];
            if (lastOp.retain !== void 0 && lastOp.attributes === void 0) {
              delta.pop();
            } else {
              break;
            }
          }
        });
        this._delta = delta;
      }
      return (
        /** @type {any} */
        this._delta
      );
    }
  };
  var YText = class _YText extends AbstractType {
    /**
     * @param {String} [string] The initial value of the YText.
     */
    constructor(string) {
      super();
      this._pending = string !== void 0 ? [() => this.insert(0, string)] : [];
      this._searchMarker = [];
      this._hasFormatting = false;
    }
    /**
     * Number of characters of this text type.
     *
     * @type {number}
     */
    get length() {
      this.doc ?? warnPrematureAccess();
      return this._length;
    }
    /**
     * @param {Doc} y
     * @param {Item} item
     */
    _integrate(y, item) {
      super._integrate(y, item);
      try {
        this._pending.forEach((f) => f());
      } catch (e) {
        console.error(e);
      }
      this._pending = null;
    }
    _copy() {
      return new _YText();
    }
    /**
     * Makes a copy of this data type that can be included somewhere else.
     *
     * Note that the content is only readable _after_ it has been included somewhere in the Ydoc.
     *
     * @return {YText}
     */
    clone() {
      const text2 = new _YText();
      text2.applyDelta(this.toDelta());
      return text2;
    }
    /**
     * Creates YTextEvent and calls observers.
     *
     * @param {Transaction} transaction
     * @param {Set<null|string>} parentSubs Keys changed on this type. `null` if list was modified.
     */
    _callObserver(transaction, parentSubs) {
      super._callObserver(transaction, parentSubs);
      const event = new YTextEvent(this, transaction, parentSubs);
      callTypeObservers(this, transaction, event);
      if (!transaction.local && this._hasFormatting) {
        transaction._needFormattingCleanup = true;
      }
    }
    /**
     * Returns the unformatted string representation of this YText type.
     *
     * @public
     */
    toString() {
      this.doc ?? warnPrematureAccess();
      let str = "";
      let n = this._start;
      while (n !== null) {
        if (!n.deleted && n.countable && n.content.constructor === ContentString) {
          str += /** @type {ContentString} */
          n.content.str;
        }
        n = n.right;
      }
      return str;
    }
    /**
     * Returns the unformatted string representation of this YText type.
     *
     * @return {string}
     * @public
     */
    toJSON() {
      return this.toString();
    }
    /**
     * Apply a {@link Delta} on this shared YText type.
     *
     * @param {Array<any>} delta The changes to apply on this element.
     * @param {object}  opts
     * @param {boolean} [opts.sanitize] Sanitize input delta. Removes ending newlines if set to true.
     *
     *
     * @public
     */
    applyDelta(delta, { sanitize = true } = {}) {
      if (this.doc !== null) {
        transact(this.doc, (transaction) => {
          const currPos = new ItemTextListPosition(null, this._start, 0, /* @__PURE__ */ new Map());
          for (let i = 0; i < delta.length; i++) {
            const op = delta[i];
            if (op.insert !== void 0) {
              const ins = !sanitize && typeof op.insert === "string" && i === delta.length - 1 && currPos.right === null && op.insert.slice(-1) === "\n" ? op.insert.slice(0, -1) : op.insert;
              if (typeof ins !== "string" || ins.length > 0) {
                insertText(transaction, this, currPos, ins, op.attributes || {});
              }
            } else if (op.retain !== void 0) {
              formatText(transaction, this, currPos, op.retain, op.attributes || {});
            } else if (op.delete !== void 0) {
              deleteText(transaction, currPos, op.delete);
            }
          }
        });
      } else {
        this._pending.push(() => this.applyDelta(delta));
      }
    }
    /**
     * Returns the Delta representation of this YText type.
     *
     * @param {Snapshot} [snapshot]
     * @param {Snapshot} [prevSnapshot]
     * @param {function('removed' | 'added', ID):any} [computeYChange]
     * @return {any} The Delta representation of this type.
     *
     * @public
     */
    toDelta(snapshot2, prevSnapshot, computeYChange) {
      this.doc ?? warnPrematureAccess();
      const ops = [];
      const currentAttributes = /* @__PURE__ */ new Map();
      const doc2 = (
        /** @type {Doc} */
        this.doc
      );
      let str = "";
      let n = this._start;
      function packStr() {
        if (str.length > 0) {
          const attributes = {};
          let addAttributes = false;
          currentAttributes.forEach((value, key) => {
            addAttributes = true;
            attributes[key] = value;
          });
          const op = { insert: str };
          if (addAttributes) {
            op.attributes = attributes;
          }
          ops.push(op);
          str = "";
        }
      }
      const computeDelta = () => {
        while (n !== null) {
          if (isVisible(n, snapshot2) || prevSnapshot !== void 0 && isVisible(n, prevSnapshot)) {
            switch (n.content.constructor) {
              case ContentString: {
                const cur = currentAttributes.get("ychange");
                if (snapshot2 !== void 0 && !isVisible(n, snapshot2)) {
                  if (cur === void 0 || cur.user !== n.id.client || cur.type !== "removed") {
                    packStr();
                    currentAttributes.set("ychange", computeYChange ? computeYChange("removed", n.id) : { type: "removed" });
                  }
                } else if (prevSnapshot !== void 0 && !isVisible(n, prevSnapshot)) {
                  if (cur === void 0 || cur.user !== n.id.client || cur.type !== "added") {
                    packStr();
                    currentAttributes.set("ychange", computeYChange ? computeYChange("added", n.id) : { type: "added" });
                  }
                } else if (cur !== void 0) {
                  packStr();
                  currentAttributes.delete("ychange");
                }
                str += /** @type {ContentString} */
                n.content.str;
                break;
              }
              case ContentType:
              case ContentEmbed: {
                packStr();
                const op = {
                  insert: n.content.getContent()[0]
                };
                if (currentAttributes.size > 0) {
                  const attrs = (
                    /** @type {Object<string,any>} */
                    {}
                  );
                  op.attributes = attrs;
                  currentAttributes.forEach((value, key) => {
                    attrs[key] = value;
                  });
                }
                ops.push(op);
                break;
              }
              case ContentFormat:
                if (isVisible(n, snapshot2)) {
                  packStr();
                  updateCurrentAttributes(
                    currentAttributes,
                    /** @type {ContentFormat} */
                    n.content
                  );
                }
                break;
            }
          }
          n = n.right;
        }
        packStr();
      };
      if (snapshot2 || prevSnapshot) {
        transact(doc2, (transaction) => {
          if (snapshot2) {
            splitSnapshotAffectedStructs(transaction, snapshot2);
          }
          if (prevSnapshot) {
            splitSnapshotAffectedStructs(transaction, prevSnapshot);
          }
          computeDelta();
        }, "cleanup");
      } else {
        computeDelta();
      }
      return ops;
    }
    /**
     * Insert text at a given index.
     *
     * @param {number} index The index at which to start inserting.
     * @param {String} text The text to insert at the specified position.
     * @param {TextAttributes} [attributes] Optionally define some formatting
     *                                    information to apply on the inserted
     *                                    Text.
     * @public
     */
    insert(index, text2, attributes) {
      if (text2.length <= 0) {
        return;
      }
      const y = this.doc;
      if (y !== null) {
        transact(y, (transaction) => {
          const pos = findPosition(transaction, this, index, !attributes);
          if (!attributes) {
            attributes = {};
            pos.currentAttributes.forEach((v, k) => {
              attributes[k] = v;
            });
          }
          insertText(transaction, this, pos, text2, attributes);
        });
      } else {
        this._pending.push(() => this.insert(index, text2, attributes));
      }
    }
    /**
     * Inserts an embed at a index.
     *
     * @param {number} index The index to insert the embed at.
     * @param {Object | AbstractType<any>} embed The Object that represents the embed.
     * @param {TextAttributes} [attributes] Attribute information to apply on the
     *                                    embed
     *
     * @public
     */
    insertEmbed(index, embed, attributes) {
      const y = this.doc;
      if (y !== null) {
        transact(y, (transaction) => {
          const pos = findPosition(transaction, this, index, !attributes);
          insertText(transaction, this, pos, embed, attributes || {});
        });
      } else {
        this._pending.push(() => this.insertEmbed(index, embed, attributes || {}));
      }
    }
    /**
     * Deletes text starting from an index.
     *
     * @param {number} index Index at which to start deleting.
     * @param {number} length The number of characters to remove. Defaults to 1.
     *
     * @public
     */
    delete(index, length2) {
      if (length2 === 0) {
        return;
      }
      const y = this.doc;
      if (y !== null) {
        transact(y, (transaction) => {
          deleteText(transaction, findPosition(transaction, this, index, true), length2);
        });
      } else {
        this._pending.push(() => this.delete(index, length2));
      }
    }
    /**
     * Assigns properties to a range of text.
     *
     * @param {number} index The position where to start formatting.
     * @param {number} length The amount of characters to assign properties to.
     * @param {TextAttributes} attributes Attribute information to apply on the
     *                                    text.
     *
     * @public
     */
    format(index, length2, attributes) {
      if (length2 === 0) {
        return;
      }
      const y = this.doc;
      if (y !== null) {
        transact(y, (transaction) => {
          const pos = findPosition(transaction, this, index, false);
          if (pos.right === null) {
            return;
          }
          formatText(transaction, this, pos, length2, attributes);
        });
      } else {
        this._pending.push(() => this.format(index, length2, attributes));
      }
    }
    /**
     * Removes an attribute.
     *
     * @note Xml-Text nodes don't have attributes. You can use this feature to assign properties to complete text-blocks.
     *
     * @param {String} attributeName The attribute name that is to be removed.
     *
     * @public
     */
    removeAttribute(attributeName) {
      if (this.doc !== null) {
        transact(this.doc, (transaction) => {
          typeMapDelete(transaction, this, attributeName);
        });
      } else {
        this._pending.push(() => this.removeAttribute(attributeName));
      }
    }
    /**
     * Sets or updates an attribute.
     *
     * @note Xml-Text nodes don't have attributes. You can use this feature to assign properties to complete text-blocks.
     *
     * @param {String} attributeName The attribute name that is to be set.
     * @param {any} attributeValue The attribute value that is to be set.
     *
     * @public
     */
    setAttribute(attributeName, attributeValue) {
      if (this.doc !== null) {
        transact(this.doc, (transaction) => {
          typeMapSet(transaction, this, attributeName, attributeValue);
        });
      } else {
        this._pending.push(() => this.setAttribute(attributeName, attributeValue));
      }
    }
    /**
     * Returns an attribute value that belongs to the attribute name.
     *
     * @note Xml-Text nodes don't have attributes. You can use this feature to assign properties to complete text-blocks.
     *
     * @param {String} attributeName The attribute name that identifies the
     *                               queried value.
     * @return {any} The queried attribute value.
     *
     * @public
     */
    getAttribute(attributeName) {
      return (
        /** @type {any} */
        typeMapGet(this, attributeName)
      );
    }
    /**
     * Returns all attribute name/value pairs in a JSON Object.
     *
     * @note Xml-Text nodes don't have attributes. You can use this feature to assign properties to complete text-blocks.
     *
     * @return {Object<string, any>} A JSON Object that describes the attributes.
     *
     * @public
     */
    getAttributes() {
      return typeMapGetAll(this);
    }
    /**
     * @param {UpdateEncoderV1 | UpdateEncoderV2} encoder
     */
    _write(encoder) {
      encoder.writeTypeRef(YTextRefID);
    }
  };
  var readYText = (_decoder) => new YText();
  var YXmlTreeWalker = class {
    /**
     * @param {YXmlFragment | YXmlElement} root
     * @param {function(AbstractType<any>):boolean} [f]
     */
    constructor(root, f = () => true) {
      this._filter = f;
      this._root = root;
      this._currentNode = /** @type {Item} */
      root._start;
      this._firstCall = true;
      root.doc ?? warnPrematureAccess();
    }
    [Symbol.iterator]() {
      return this;
    }
    /**
     * Get the next node.
     *
     * @return {IteratorResult<YXmlElement|YXmlText|YXmlHook>} The next node.
     *
     * @public
     */
    next() {
      let n = this._currentNode;
      let type = n && n.content && /** @type {any} */
      n.content.type;
      if (n !== null && (!this._firstCall || n.deleted || !this._filter(type))) {
        do {
          type = /** @type {any} */
          n.content.type;
          if (!n.deleted && (type.constructor === YXmlElement || type.constructor === YXmlFragment) && type._start !== null) {
            n = type._start;
          } else {
            while (n !== null) {
              const nxt = n.next;
              if (nxt !== null) {
                n = nxt;
                break;
              } else if (n.parent === this._root) {
                n = null;
              } else {
                n = /** @type {AbstractType<any>} */
                n.parent._item;
              }
            }
          }
        } while (n !== null && (n.deleted || !this._filter(
          /** @type {ContentType} */
          n.content.type
        )));
      }
      this._firstCall = false;
      if (n === null) {
        return { value: void 0, done: true };
      }
      this._currentNode = n;
      return { value: (
        /** @type {any} */
        n.content.type
      ), done: false };
    }
  };
  var YXmlFragment = class _YXmlFragment extends AbstractType {
    constructor() {
      super();
      this._prelimContent = [];
    }
    /**
     * @type {YXmlElement|YXmlText|null}
     */
    get firstChild() {
      const first = this._first;
      return first ? first.content.getContent()[0] : null;
    }
    /**
     * Integrate this type into the Yjs instance.
     *
     * * Save this struct in the os
     * * This type is sent to other client
     * * Observer functions are fired
     *
     * @param {Doc} y The Yjs instance
     * @param {Item} item
     */
    _integrate(y, item) {
      super._integrate(y, item);
      this.insert(
        0,
        /** @type {Array<any>} */
        this._prelimContent
      );
      this._prelimContent = null;
    }
    _copy() {
      return new _YXmlFragment();
    }
    /**
     * Makes a copy of this data type that can be included somewhere else.
     *
     * Note that the content is only readable _after_ it has been included somewhere in the Ydoc.
     *
     * @return {YXmlFragment}
     */
    clone() {
      const el = new _YXmlFragment();
      el.insert(0, this.toArray().map((item) => item instanceof AbstractType ? item.clone() : item));
      return el;
    }
    get length() {
      this.doc ?? warnPrematureAccess();
      return this._prelimContent === null ? this._length : this._prelimContent.length;
    }
    /**
     * Create a subtree of childNodes.
     *
     * @example
     * const walker = elem.createTreeWalker(dom => dom.nodeName === 'div')
     * for (let node in walker) {
     *   // `node` is a div node
     *   nop(node)
     * }
     *
     * @param {function(AbstractType<any>):boolean} filter Function that is called on each child element and
     *                          returns a Boolean indicating whether the child
     *                          is to be included in the subtree.
     * @return {YXmlTreeWalker} A subtree and a position within it.
     *
     * @public
     */
    createTreeWalker(filter) {
      return new YXmlTreeWalker(this, filter);
    }
    /**
     * Returns the first YXmlElement that matches the query.
     * Similar to DOM's {@link querySelector}.
     *
     * Query support:
     *   - tagname
     * TODO:
     *   - id
     *   - attribute
     *
     * @param {CSS_Selector} query The query on the children.
     * @return {YXmlElement|YXmlText|YXmlHook|null} The first element that matches the query or null.
     *
     * @public
     */
    querySelector(query) {
      query = query.toUpperCase();
      const iterator = new YXmlTreeWalker(this, (element2) => element2.nodeName && element2.nodeName.toUpperCase() === query);
      const next = iterator.next();
      if (next.done) {
        return null;
      } else {
        return next.value;
      }
    }
    /**
     * Returns all YXmlElements that match the query.
     * Similar to Dom's {@link querySelectorAll}.
     *
     * @todo Does not yet support all queries. Currently only query by tagName.
     *
     * @param {CSS_Selector} query The query on the children
     * @return {Array<YXmlElement|YXmlText|YXmlHook|null>} The elements that match this query.
     *
     * @public
     */
    querySelectorAll(query) {
      query = query.toUpperCase();
      return from(new YXmlTreeWalker(this, (element2) => element2.nodeName && element2.nodeName.toUpperCase() === query));
    }
    /**
     * Creates YXmlEvent and calls observers.
     *
     * @param {Transaction} transaction
     * @param {Set<null|string>} parentSubs Keys changed on this type. `null` if list was modified.
     */
    _callObserver(transaction, parentSubs) {
      callTypeObservers(this, transaction, new YXmlEvent(this, parentSubs, transaction));
    }
    /**
     * Get the string representation of all the children of this YXmlFragment.
     *
     * @return {string} The string representation of all children.
     */
    toString() {
      return typeListMap(this, (xml) => xml.toString()).join("");
    }
    /**
     * @return {string}
     */
    toJSON() {
      return this.toString();
    }
    /**
     * Creates a Dom Element that mirrors this YXmlElement.
     *
     * @param {Document} [_document=document] The document object (you must define
     *                                        this when calling this method in
     *                                        nodejs)
     * @param {Object<string, any>} [hooks={}] Optional property to customize how hooks
     *                                             are presented in the DOM
     * @param {any} [binding] You should not set this property. This is
     *                               used if DomBinding wants to create a
     *                               association to the created DOM type.
     * @return {Node} The {@link https://developer.mozilla.org/en-US/docs/Web/API/Element|Dom Element}
     *
     * @public
     */
    toDOM(_document = document, hooks = {}, binding) {
      const fragment = _document.createDocumentFragment();
      if (binding !== void 0) {
        binding._createAssociation(fragment, this);
      }
      typeListForEach(this, (xmlType) => {
        fragment.insertBefore(xmlType.toDOM(_document, hooks, binding), null);
      });
      return fragment;
    }
    /**
     * Inserts new content at an index.
     *
     * @example
     *  // Insert character 'a' at position 0
     *  xml.insert(0, [new Y.XmlText('text')])
     *
     * @param {number} index The index to insert content at
     * @param {Array<YXmlElement|YXmlText>} content The array of content
     */
    insert(index, content) {
      if (this.doc !== null) {
        transact(this.doc, (transaction) => {
          typeListInsertGenerics(transaction, this, index, content);
        });
      } else {
        this._prelimContent.splice(index, 0, ...content);
      }
    }
    /**
     * Inserts new content at an index.
     *
     * @example
     *  // Insert character 'a' at position 0
     *  xml.insert(0, [new Y.XmlText('text')])
     *
     * @param {null|Item|YXmlElement|YXmlText} ref The index to insert content at
     * @param {Array<YXmlElement|YXmlText>} content The array of content
     */
    insertAfter(ref, content) {
      if (this.doc !== null) {
        transact(this.doc, (transaction) => {
          const refItem = ref && ref instanceof AbstractType ? ref._item : ref;
          typeListInsertGenericsAfter(transaction, this, refItem, content);
        });
      } else {
        const pc = (
          /** @type {Array<any>} */
          this._prelimContent
        );
        const index = ref === null ? 0 : pc.findIndex((el) => el === ref) + 1;
        if (index === 0 && ref !== null) {
          throw create3("Reference item not found");
        }
        pc.splice(index, 0, ...content);
      }
    }
    /**
     * Deletes elements starting from an index.
     *
     * @param {number} index Index at which to start deleting elements
     * @param {number} [length=1] The number of elements to remove. Defaults to 1.
     */
    delete(index, length2 = 1) {
      if (this.doc !== null) {
        transact(this.doc, (transaction) => {
          typeListDelete(transaction, this, index, length2);
        });
      } else {
        this._prelimContent.splice(index, length2);
      }
    }
    /**
     * Transforms this YArray to a JavaScript Array.
     *
     * @return {Array<YXmlElement|YXmlText|YXmlHook>}
     */
    toArray() {
      return typeListToArray(this);
    }
    /**
     * Appends content to this YArray.
     *
     * @param {Array<YXmlElement|YXmlText>} content Array of content to append.
     */
    push(content) {
      this.insert(this.length, content);
    }
    /**
     * Prepends content to this YArray.
     *
     * @param {Array<YXmlElement|YXmlText>} content Array of content to prepend.
     */
    unshift(content) {
      this.insert(0, content);
    }
    /**
     * Returns the i-th element from a YArray.
     *
     * @param {number} index The index of the element to return from the YArray
     * @return {YXmlElement|YXmlText}
     */
    get(index) {
      return typeListGet(this, index);
    }
    /**
     * Returns a portion of this YXmlFragment into a JavaScript Array selected
     * from start to end (end not included).
     *
     * @param {number} [start]
     * @param {number} [end]
     * @return {Array<YXmlElement|YXmlText>}
     */
    slice(start = 0, end = this.length) {
      return typeListSlice(this, start, end);
    }
    /**
     * Executes a provided function on once on every child element.
     *
     * @param {function(YXmlElement|YXmlText,number, typeof self):void} f A function to execute on every element of this YArray.
     */
    forEach(f) {
      typeListForEach(this, f);
    }
    /**
     * Transform the properties of this type to binary and write it to an
     * BinaryEncoder.
     *
     * This is called when this Item is sent to a remote peer.
     *
     * @param {UpdateEncoderV1 | UpdateEncoderV2} encoder The encoder to write data to.
     */
    _write(encoder) {
      encoder.writeTypeRef(YXmlFragmentRefID);
    }
  };
  var readYXmlFragment = (_decoder) => new YXmlFragment();
  var YXmlElement = class _YXmlElement extends YXmlFragment {
    constructor(nodeName = "UNDEFINED") {
      super();
      this.nodeName = nodeName;
      this._prelimAttrs = /* @__PURE__ */ new Map();
    }
    /**
     * @type {YXmlElement|YXmlText|null}
     */
    get nextSibling() {
      const n = this._item ? this._item.next : null;
      return n ? (
        /** @type {YXmlElement|YXmlText} */
        /** @type {ContentType} */
        n.content.type
      ) : null;
    }
    /**
     * @type {YXmlElement|YXmlText|null}
     */
    get prevSibling() {
      const n = this._item ? this._item.prev : null;
      return n ? (
        /** @type {YXmlElement|YXmlText} */
        /** @type {ContentType} */
        n.content.type
      ) : null;
    }
    /**
     * Integrate this type into the Yjs instance.
     *
     * * Save this struct in the os
     * * This type is sent to other client
     * * Observer functions are fired
     *
     * @param {Doc} y The Yjs instance
     * @param {Item} item
     */
    _integrate(y, item) {
      super._integrate(y, item);
      /** @type {Map<string, any>} */
      this._prelimAttrs.forEach((value, key) => {
        this.setAttribute(key, value);
      });
      this._prelimAttrs = null;
    }
    /**
     * Creates an Item with the same effect as this Item (without position effect)
     *
     * @return {YXmlElement}
     */
    _copy() {
      return new _YXmlElement(this.nodeName);
    }
    /**
     * Makes a copy of this data type that can be included somewhere else.
     *
     * Note that the content is only readable _after_ it has been included somewhere in the Ydoc.
     *
     * @return {YXmlElement<KV>}
     */
    clone() {
      const el = new _YXmlElement(this.nodeName);
      const attrs = this.getAttributes();
      forEach(attrs, (value, key) => {
        el.setAttribute(
          key,
          /** @type {any} */
          value
        );
      });
      el.insert(0, this.toArray().map((v) => v instanceof AbstractType ? v.clone() : v));
      return el;
    }
    /**
     * Returns the XML serialization of this YXmlElement.
     * The attributes are ordered by attribute-name, so you can easily use this
     * method to compare YXmlElements
     *
     * @return {string} The string representation of this type.
     *
     * @public
     */
    toString() {
      const attrs = this.getAttributes();
      const stringBuilder = [];
      const keys2 = [];
      for (const key in attrs) {
        keys2.push(key);
      }
      keys2.sort();
      const keysLen = keys2.length;
      for (let i = 0; i < keysLen; i++) {
        const key = keys2[i];
        stringBuilder.push(key + '="' + attrs[key] + '"');
      }
      const nodeName = this.nodeName.toLocaleLowerCase();
      const attrsString = stringBuilder.length > 0 ? " " + stringBuilder.join(" ") : "";
      return `<${nodeName}${attrsString}>${super.toString()}</${nodeName}>`;
    }
    /**
     * Removes an attribute from this YXmlElement.
     *
     * @param {string} attributeName The attribute name that is to be removed.
     *
     * @public
     */
    removeAttribute(attributeName) {
      if (this.doc !== null) {
        transact(this.doc, (transaction) => {
          typeMapDelete(transaction, this, attributeName);
        });
      } else {
        this._prelimAttrs.delete(attributeName);
      }
    }
    /**
     * Sets or updates an attribute.
     *
     * @template {keyof KV & string} KEY
     *
     * @param {KEY} attributeName The attribute name that is to be set.
     * @param {KV[KEY]} attributeValue The attribute value that is to be set.
     *
     * @public
     */
    setAttribute(attributeName, attributeValue) {
      if (this.doc !== null) {
        transact(this.doc, (transaction) => {
          typeMapSet(transaction, this, attributeName, attributeValue);
        });
      } else {
        this._prelimAttrs.set(attributeName, attributeValue);
      }
    }
    /**
     * Returns an attribute value that belongs to the attribute name.
     *
     * @template {keyof KV & string} KEY
     *
     * @param {KEY} attributeName The attribute name that identifies the
     *                               queried value.
     * @return {KV[KEY]|undefined} The queried attribute value.
     *
     * @public
     */
    getAttribute(attributeName) {
      return (
        /** @type {any} */
        typeMapGet(this, attributeName)
      );
    }
    /**
     * Returns whether an attribute exists
     *
     * @param {string} attributeName The attribute name to check for existence.
     * @return {boolean} whether the attribute exists.
     *
     * @public
     */
    hasAttribute(attributeName) {
      return (
        /** @type {any} */
        typeMapHas(this, attributeName)
      );
    }
    /**
     * Returns all attribute name/value pairs in a JSON Object.
     *
     * @param {Snapshot} [snapshot]
     * @return {{ [Key in Extract<keyof KV,string>]?: KV[Key]}} A JSON Object that describes the attributes.
     *
     * @public
     */
    getAttributes(snapshot2) {
      return (
        /** @type {any} */
        snapshot2 ? typeMapGetAllSnapshot(this, snapshot2) : typeMapGetAll(this)
      );
    }
    /**
     * Creates a Dom Element that mirrors this YXmlElement.
     *
     * @param {Document} [_document=document] The document object (you must define
     *                                        this when calling this method in
     *                                        nodejs)
     * @param {Object<string, any>} [hooks={}] Optional property to customize how hooks
     *                                             are presented in the DOM
     * @param {any} [binding] You should not set this property. This is
     *                               used if DomBinding wants to create a
     *                               association to the created DOM type.
     * @return {Node} The {@link https://developer.mozilla.org/en-US/docs/Web/API/Element|Dom Element}
     *
     * @public
     */
    toDOM(_document = document, hooks = {}, binding) {
      const dom = _document.createElement(this.nodeName);
      const attrs = this.getAttributes();
      for (const key in attrs) {
        const value = attrs[key];
        if (typeof value === "string") {
          dom.setAttribute(key, value);
        }
      }
      typeListForEach(this, (yxml) => {
        dom.appendChild(yxml.toDOM(_document, hooks, binding));
      });
      if (binding !== void 0) {
        binding._createAssociation(dom, this);
      }
      return dom;
    }
    /**
     * Transform the properties of this type to binary and write it to an
     * BinaryEncoder.
     *
     * This is called when this Item is sent to a remote peer.
     *
     * @param {UpdateEncoderV1 | UpdateEncoderV2} encoder The encoder to write data to.
     */
    _write(encoder) {
      encoder.writeTypeRef(YXmlElementRefID);
      encoder.writeKey(this.nodeName);
    }
  };
  var readYXmlElement = (decoder) => new YXmlElement(decoder.readKey());
  var YXmlEvent = class extends YEvent {
    /**
     * @param {YXmlElement|YXmlText|YXmlFragment} target The target on which the event is created.
     * @param {Set<string|null>} subs The set of changed attributes. `null` is included if the
     *                   child list changed.
     * @param {Transaction} transaction The transaction instance with which the
     *                                  change was created.
     */
    constructor(target, subs, transaction) {
      super(target, transaction);
      this.childListChanged = false;
      this.attributesChanged = /* @__PURE__ */ new Set();
      subs.forEach((sub) => {
        if (sub === null) {
          this.childListChanged = true;
        } else {
          this.attributesChanged.add(sub);
        }
      });
    }
  };
  var YXmlHook = class _YXmlHook extends YMap {
    /**
     * @param {string} hookName nodeName of the Dom Node.
     */
    constructor(hookName) {
      super();
      this.hookName = hookName;
    }
    /**
     * Creates an Item with the same effect as this Item (without position effect)
     */
    _copy() {
      return new _YXmlHook(this.hookName);
    }
    /**
     * Makes a copy of this data type that can be included somewhere else.
     *
     * Note that the content is only readable _after_ it has been included somewhere in the Ydoc.
     *
     * @return {YXmlHook}
     */
    clone() {
      const el = new _YXmlHook(this.hookName);
      this.forEach((value, key) => {
        el.set(key, value);
      });
      return el;
    }
    /**
     * Creates a Dom Element that mirrors this YXmlElement.
     *
     * @param {Document} [_document=document] The document object (you must define
     *                                        this when calling this method in
     *                                        nodejs)
     * @param {Object.<string, any>} [hooks] Optional property to customize how hooks
     *                                             are presented in the DOM
     * @param {any} [binding] You should not set this property. This is
     *                               used if DomBinding wants to create a
     *                               association to the created DOM type
     * @return {Element} The {@link https://developer.mozilla.org/en-US/docs/Web/API/Element|Dom Element}
     *
     * @public
     */
    toDOM(_document = document, hooks = {}, binding) {
      const hook = hooks[this.hookName];
      let dom;
      if (hook !== void 0) {
        dom = hook.createDom(this);
      } else {
        dom = document.createElement(this.hookName);
      }
      dom.setAttribute("data-yjs-hook", this.hookName);
      if (binding !== void 0) {
        binding._createAssociation(dom, this);
      }
      return dom;
    }
    /**
     * Transform the properties of this type to binary and write it to an
     * BinaryEncoder.
     *
     * This is called when this Item is sent to a remote peer.
     *
     * @param {UpdateEncoderV1 | UpdateEncoderV2} encoder The encoder to write data to.
     */
    _write(encoder) {
      encoder.writeTypeRef(YXmlHookRefID);
      encoder.writeKey(this.hookName);
    }
  };
  var readYXmlHook = (decoder) => new YXmlHook(decoder.readKey());
  var YXmlText = class _YXmlText extends YText {
    /**
     * @type {YXmlElement|YXmlText|null}
     */
    get nextSibling() {
      const n = this._item ? this._item.next : null;
      return n ? (
        /** @type {YXmlElement|YXmlText} */
        /** @type {ContentType} */
        n.content.type
      ) : null;
    }
    /**
     * @type {YXmlElement|YXmlText|null}
     */
    get prevSibling() {
      const n = this._item ? this._item.prev : null;
      return n ? (
        /** @type {YXmlElement|YXmlText} */
        /** @type {ContentType} */
        n.content.type
      ) : null;
    }
    _copy() {
      return new _YXmlText();
    }
    /**
     * Makes a copy of this data type that can be included somewhere else.
     *
     * Note that the content is only readable _after_ it has been included somewhere in the Ydoc.
     *
     * @return {YXmlText}
     */
    clone() {
      const text2 = new _YXmlText();
      text2.applyDelta(this.toDelta());
      return text2;
    }
    /**
     * Creates a Dom Element that mirrors this YXmlText.
     *
     * @param {Document} [_document=document] The document object (you must define
     *                                        this when calling this method in
     *                                        nodejs)
     * @param {Object<string, any>} [hooks] Optional property to customize how hooks
     *                                             are presented in the DOM
     * @param {any} [binding] You should not set this property. This is
     *                               used if DomBinding wants to create a
     *                               association to the created DOM type.
     * @return {Text} The {@link https://developer.mozilla.org/en-US/docs/Web/API/Element|Dom Element}
     *
     * @public
     */
    toDOM(_document = document, hooks, binding) {
      const dom = _document.createTextNode(this.toString());
      if (binding !== void 0) {
        binding._createAssociation(dom, this);
      }
      return dom;
    }
    toString() {
      return this.toDelta().map((delta) => {
        const nestedNodes = [];
        for (const nodeName in delta.attributes) {
          const attrs = [];
          for (const key in delta.attributes[nodeName]) {
            attrs.push({ key, value: delta.attributes[nodeName][key] });
          }
          attrs.sort((a, b) => a.key < b.key ? -1 : 1);
          nestedNodes.push({ nodeName, attrs });
        }
        nestedNodes.sort((a, b) => a.nodeName < b.nodeName ? -1 : 1);
        let str = "";
        for (let i = 0; i < nestedNodes.length; i++) {
          const node = nestedNodes[i];
          str += `<${node.nodeName}`;
          for (let j = 0; j < node.attrs.length; j++) {
            const attr = node.attrs[j];
            str += ` ${attr.key}="${attr.value}"`;
          }
          str += ">";
        }
        str += delta.insert;
        for (let i = nestedNodes.length - 1; i >= 0; i--) {
          str += `</${nestedNodes[i].nodeName}>`;
        }
        return str;
      }).join("");
    }
    /**
     * @return {string}
     */
    toJSON() {
      return this.toString();
    }
    /**
     * @param {UpdateEncoderV1 | UpdateEncoderV2} encoder
     */
    _write(encoder) {
      encoder.writeTypeRef(YXmlTextRefID);
    }
  };
  var readYXmlText = (decoder) => new YXmlText();
  var AbstractStruct = class {
    /**
     * @param {ID} id
     * @param {number} length
     */
    constructor(id2, length2) {
      this.id = id2;
      this.length = length2;
    }
    /**
     * @type {boolean}
     */
    get deleted() {
      throw methodUnimplemented();
    }
    /**
     * Merge this struct with the item to the right.
     * This method is already assuming that `this.id.clock + this.length === this.id.clock`.
     * Also this method does *not* remove right from StructStore!
     * @param {AbstractStruct} right
     * @return {boolean} whether this merged with right
     */
    mergeWith(right) {
      return false;
    }
    /**
     * @param {UpdateEncoderV1 | UpdateEncoderV2} encoder The encoder to write data to.
     * @param {number} offset
     * @param {number} encodingRef
     */
    write(encoder, offset, encodingRef) {
      throw methodUnimplemented();
    }
    /**
     * @param {Transaction} transaction
     * @param {number} offset
     */
    integrate(transaction, offset) {
      throw methodUnimplemented();
    }
  };
  var structGCRefNumber = 0;
  var GC = class extends AbstractStruct {
    get deleted() {
      return true;
    }
    delete() {
    }
    /**
     * @param {GC} right
     * @return {boolean}
     */
    mergeWith(right) {
      if (this.constructor !== right.constructor) {
        return false;
      }
      this.length += right.length;
      return true;
    }
    /**
     * @param {Transaction} transaction
     * @param {number} offset
     */
    integrate(transaction, offset) {
      if (offset > 0) {
        this.id.clock += offset;
        this.length -= offset;
      }
      addStruct(transaction.doc.store, this);
    }
    /**
     * @param {UpdateEncoderV1 | UpdateEncoderV2} encoder
     * @param {number} offset
     */
    write(encoder, offset) {
      encoder.writeInfo(structGCRefNumber);
      encoder.writeLen(this.length - offset);
    }
    /**
     * @param {Transaction} transaction
     * @param {StructStore} store
     * @return {null | number}
     */
    getMissing(transaction, store) {
      return null;
    }
  };
  var ContentBinary = class _ContentBinary {
    /**
     * @param {Uint8Array} content
     */
    constructor(content) {
      this.content = content;
    }
    /**
     * @return {number}
     */
    getLength() {
      return 1;
    }
    /**
     * @return {Array<any>}
     */
    getContent() {
      return [this.content];
    }
    /**
     * @return {boolean}
     */
    isCountable() {
      return true;
    }
    /**
     * @return {ContentBinary}
     */
    copy() {
      return new _ContentBinary(this.content);
    }
    /**
     * @param {number} offset
     * @return {ContentBinary}
     */
    splice(offset) {
      throw methodUnimplemented();
    }
    /**
     * @param {ContentBinary} right
     * @return {boolean}
     */
    mergeWith(right) {
      return false;
    }
    /**
     * @param {Transaction} transaction
     * @param {Item} item
     */
    integrate(transaction, item) {
    }
    /**
     * @param {Transaction} transaction
     */
    delete(transaction) {
    }
    /**
     * @param {StructStore} store
     */
    gc(store) {
    }
    /**
     * @param {UpdateEncoderV1 | UpdateEncoderV2} encoder
     * @param {number} offset
     */
    write(encoder, offset) {
      encoder.writeBuf(this.content);
    }
    /**
     * @return {number}
     */
    getRef() {
      return 3;
    }
  };
  var readContentBinary = (decoder) => new ContentBinary(decoder.readBuf());
  var ContentDeleted = class _ContentDeleted {
    /**
     * @param {number} len
     */
    constructor(len) {
      this.len = len;
    }
    /**
     * @return {number}
     */
    getLength() {
      return this.len;
    }
    /**
     * @return {Array<any>}
     */
    getContent() {
      return [];
    }
    /**
     * @return {boolean}
     */
    isCountable() {
      return false;
    }
    /**
     * @return {ContentDeleted}
     */
    copy() {
      return new _ContentDeleted(this.len);
    }
    /**
     * @param {number} offset
     * @return {ContentDeleted}
     */
    splice(offset) {
      const right = new _ContentDeleted(this.len - offset);
      this.len = offset;
      return right;
    }
    /**
     * @param {ContentDeleted} right
     * @return {boolean}
     */
    mergeWith(right) {
      this.len += right.len;
      return true;
    }
    /**
     * @param {Transaction} transaction
     * @param {Item} item
     */
    integrate(transaction, item) {
      addToDeleteSet(transaction.deleteSet, item.id.client, item.id.clock, this.len);
      item.markDeleted();
    }
    /**
     * @param {Transaction} transaction
     */
    delete(transaction) {
    }
    /**
     * @param {StructStore} store
     */
    gc(store) {
    }
    /**
     * @param {UpdateEncoderV1 | UpdateEncoderV2} encoder
     * @param {number} offset
     */
    write(encoder, offset) {
      encoder.writeLen(this.len - offset);
    }
    /**
     * @return {number}
     */
    getRef() {
      return 1;
    }
  };
  var readContentDeleted = (decoder) => new ContentDeleted(decoder.readLen());
  var createDocFromOpts = (guid, opts) => new Doc({ guid, ...opts, shouldLoad: opts.shouldLoad || opts.autoLoad || false });
  var ContentDoc = class _ContentDoc {
    /**
     * @param {Doc} doc
     */
    constructor(doc2) {
      if (doc2._item) {
        console.error("This document was already integrated as a sub-document. You should create a second instance instead with the same guid.");
      }
      this.doc = doc2;
      const opts = {};
      this.opts = opts;
      if (!doc2.gc) {
        opts.gc = false;
      }
      if (doc2.autoLoad) {
        opts.autoLoad = true;
      }
      if (doc2.meta !== null) {
        opts.meta = doc2.meta;
      }
    }
    /**
     * @return {number}
     */
    getLength() {
      return 1;
    }
    /**
     * @return {Array<any>}
     */
    getContent() {
      return [this.doc];
    }
    /**
     * @return {boolean}
     */
    isCountable() {
      return true;
    }
    /**
     * @return {ContentDoc}
     */
    copy() {
      return new _ContentDoc(createDocFromOpts(this.doc.guid, this.opts));
    }
    /**
     * @param {number} offset
     * @return {ContentDoc}
     */
    splice(offset) {
      throw methodUnimplemented();
    }
    /**
     * @param {ContentDoc} right
     * @return {boolean}
     */
    mergeWith(right) {
      return false;
    }
    /**
     * @param {Transaction} transaction
     * @param {Item} item
     */
    integrate(transaction, item) {
      this.doc._item = item;
      transaction.subdocsAdded.add(this.doc);
      if (this.doc.shouldLoad) {
        transaction.subdocsLoaded.add(this.doc);
      }
    }
    /**
     * @param {Transaction} transaction
     */
    delete(transaction) {
      if (transaction.subdocsAdded.has(this.doc)) {
        transaction.subdocsAdded.delete(this.doc);
      } else {
        transaction.subdocsRemoved.add(this.doc);
      }
    }
    /**
     * @param {StructStore} store
     */
    gc(store) {
    }
    /**
     * @param {UpdateEncoderV1 | UpdateEncoderV2} encoder
     * @param {number} offset
     */
    write(encoder, offset) {
      encoder.writeString(this.doc.guid);
      encoder.writeAny(this.opts);
    }
    /**
     * @return {number}
     */
    getRef() {
      return 9;
    }
  };
  var readContentDoc = (decoder) => new ContentDoc(createDocFromOpts(decoder.readString(), decoder.readAny()));
  var ContentEmbed = class _ContentEmbed {
    /**
     * @param {Object} embed
     */
    constructor(embed) {
      this.embed = embed;
    }
    /**
     * @return {number}
     */
    getLength() {
      return 1;
    }
    /**
     * @return {Array<any>}
     */
    getContent() {
      return [this.embed];
    }
    /**
     * @return {boolean}
     */
    isCountable() {
      return true;
    }
    /**
     * @return {ContentEmbed}
     */
    copy() {
      return new _ContentEmbed(this.embed);
    }
    /**
     * @param {number} offset
     * @return {ContentEmbed}
     */
    splice(offset) {
      throw methodUnimplemented();
    }
    /**
     * @param {ContentEmbed} right
     * @return {boolean}
     */
    mergeWith(right) {
      return false;
    }
    /**
     * @param {Transaction} transaction
     * @param {Item} item
     */
    integrate(transaction, item) {
    }
    /**
     * @param {Transaction} transaction
     */
    delete(transaction) {
    }
    /**
     * @param {StructStore} store
     */
    gc(store) {
    }
    /**
     * @param {UpdateEncoderV1 | UpdateEncoderV2} encoder
     * @param {number} offset
     */
    write(encoder, offset) {
      encoder.writeJSON(this.embed);
    }
    /**
     * @return {number}
     */
    getRef() {
      return 5;
    }
  };
  var readContentEmbed = (decoder) => new ContentEmbed(decoder.readJSON());
  var ContentFormat = class _ContentFormat {
    /**
     * @param {string} key
     * @param {Object} value
     */
    constructor(key, value) {
      this.key = key;
      this.value = value;
    }
    /**
     * @return {number}
     */
    getLength() {
      return 1;
    }
    /**
     * @return {Array<any>}
     */
    getContent() {
      return [];
    }
    /**
     * @return {boolean}
     */
    isCountable() {
      return false;
    }
    /**
     * @return {ContentFormat}
     */
    copy() {
      return new _ContentFormat(this.key, this.value);
    }
    /**
     * @param {number} _offset
     * @return {ContentFormat}
     */
    splice(_offset) {
      throw methodUnimplemented();
    }
    /**
     * @param {ContentFormat} _right
     * @return {boolean}
     */
    mergeWith(_right) {
      return false;
    }
    /**
     * @param {Transaction} _transaction
     * @param {Item} item
     */
    integrate(_transaction, item) {
      const p = (
        /** @type {YText} */
        item.parent
      );
      p._searchMarker = null;
      p._hasFormatting = true;
    }
    /**
     * @param {Transaction} transaction
     */
    delete(transaction) {
    }
    /**
     * @param {StructStore} store
     */
    gc(store) {
    }
    /**
     * @param {UpdateEncoderV1 | UpdateEncoderV2} encoder
     * @param {number} offset
     */
    write(encoder, offset) {
      encoder.writeKey(this.key);
      encoder.writeJSON(this.value);
    }
    /**
     * @return {number}
     */
    getRef() {
      return 6;
    }
  };
  var readContentFormat = (decoder) => new ContentFormat(decoder.readKey(), decoder.readJSON());
  var ContentJSON = class _ContentJSON {
    /**
     * @param {Array<any>} arr
     */
    constructor(arr) {
      this.arr = arr;
    }
    /**
     * @return {number}
     */
    getLength() {
      return this.arr.length;
    }
    /**
     * @return {Array<any>}
     */
    getContent() {
      return this.arr;
    }
    /**
     * @return {boolean}
     */
    isCountable() {
      return true;
    }
    /**
     * @return {ContentJSON}
     */
    copy() {
      return new _ContentJSON(this.arr);
    }
    /**
     * @param {number} offset
     * @return {ContentJSON}
     */
    splice(offset) {
      const right = new _ContentJSON(this.arr.slice(offset));
      this.arr = this.arr.slice(0, offset);
      return right;
    }
    /**
     * @param {ContentJSON} right
     * @return {boolean}
     */
    mergeWith(right) {
      this.arr = this.arr.concat(right.arr);
      return true;
    }
    /**
     * @param {Transaction} transaction
     * @param {Item} item
     */
    integrate(transaction, item) {
    }
    /**
     * @param {Transaction} transaction
     */
    delete(transaction) {
    }
    /**
     * @param {StructStore} store
     */
    gc(store) {
    }
    /**
     * @param {UpdateEncoderV1 | UpdateEncoderV2} encoder
     * @param {number} offset
     */
    write(encoder, offset) {
      const len = this.arr.length;
      encoder.writeLen(len - offset);
      for (let i = offset; i < len; i++) {
        const c = this.arr[i];
        encoder.writeString(c === void 0 ? "undefined" : JSON.stringify(c));
      }
    }
    /**
     * @return {number}
     */
    getRef() {
      return 2;
    }
  };
  var readContentJSON = (decoder) => {
    const len = decoder.readLen();
    const cs = [];
    for (let i = 0; i < len; i++) {
      const c = decoder.readString();
      if (c === "undefined") {
        cs.push(void 0);
      } else {
        cs.push(JSON.parse(c));
      }
    }
    return new ContentJSON(cs);
  };
  var isDevMode = getVariable("node_env") === "development";
  var ContentAny = class _ContentAny {
    /**
     * @param {Array<any>} arr
     */
    constructor(arr) {
      this.arr = arr;
      isDevMode && deepFreeze(arr);
    }
    /**
     * @return {number}
     */
    getLength() {
      return this.arr.length;
    }
    /**
     * @return {Array<any>}
     */
    getContent() {
      return this.arr;
    }
    /**
     * @return {boolean}
     */
    isCountable() {
      return true;
    }
    /**
     * @return {ContentAny}
     */
    copy() {
      return new _ContentAny(this.arr);
    }
    /**
     * @param {number} offset
     * @return {ContentAny}
     */
    splice(offset) {
      const right = new _ContentAny(this.arr.slice(offset));
      this.arr = this.arr.slice(0, offset);
      return right;
    }
    /**
     * @param {ContentAny} right
     * @return {boolean}
     */
    mergeWith(right) {
      this.arr = this.arr.concat(right.arr);
      return true;
    }
    /**
     * @param {Transaction} transaction
     * @param {Item} item
     */
    integrate(transaction, item) {
    }
    /**
     * @param {Transaction} transaction
     */
    delete(transaction) {
    }
    /**
     * @param {StructStore} store
     */
    gc(store) {
    }
    /**
     * @param {UpdateEncoderV1 | UpdateEncoderV2} encoder
     * @param {number} offset
     */
    write(encoder, offset) {
      const len = this.arr.length;
      encoder.writeLen(len - offset);
      for (let i = offset; i < len; i++) {
        const c = this.arr[i];
        encoder.writeAny(c);
      }
    }
    /**
     * @return {number}
     */
    getRef() {
      return 8;
    }
  };
  var readContentAny = (decoder) => {
    const len = decoder.readLen();
    const cs = [];
    for (let i = 0; i < len; i++) {
      cs.push(decoder.readAny());
    }
    return new ContentAny(cs);
  };
  var ContentString = class _ContentString {
    /**
     * @param {string} str
     */
    constructor(str) {
      this.str = str;
    }
    /**
     * @return {number}
     */
    getLength() {
      return this.str.length;
    }
    /**
     * @return {Array<any>}
     */
    getContent() {
      return this.str.split("");
    }
    /**
     * @return {boolean}
     */
    isCountable() {
      return true;
    }
    /**
     * @return {ContentString}
     */
    copy() {
      return new _ContentString(this.str);
    }
    /**
     * @param {number} offset
     * @return {ContentString}
     */
    splice(offset) {
      const right = new _ContentString(this.str.slice(offset));
      this.str = this.str.slice(0, offset);
      const firstCharCode = this.str.charCodeAt(offset - 1);
      if (firstCharCode >= 55296 && firstCharCode <= 56319) {
        this.str = this.str.slice(0, offset - 1) + "\uFFFD";
        right.str = "\uFFFD" + right.str.slice(1);
      }
      return right;
    }
    /**
     * @param {ContentString} right
     * @return {boolean}
     */
    mergeWith(right) {
      this.str += right.str;
      return true;
    }
    /**
     * @param {Transaction} transaction
     * @param {Item} item
     */
    integrate(transaction, item) {
    }
    /**
     * @param {Transaction} transaction
     */
    delete(transaction) {
    }
    /**
     * @param {StructStore} store
     */
    gc(store) {
    }
    /**
     * @param {UpdateEncoderV1 | UpdateEncoderV2} encoder
     * @param {number} offset
     */
    write(encoder, offset) {
      encoder.writeString(offset === 0 ? this.str : this.str.slice(offset));
    }
    /**
     * @return {number}
     */
    getRef() {
      return 4;
    }
  };
  var readContentString = (decoder) => new ContentString(decoder.readString());
  var typeRefs = [
    readYArray,
    readYMap,
    readYText,
    readYXmlElement,
    readYXmlFragment,
    readYXmlHook,
    readYXmlText
  ];
  var YArrayRefID = 0;
  var YMapRefID = 1;
  var YTextRefID = 2;
  var YXmlElementRefID = 3;
  var YXmlFragmentRefID = 4;
  var YXmlHookRefID = 5;
  var YXmlTextRefID = 6;
  var ContentType = class _ContentType {
    /**
     * @param {AbstractType<any>} type
     */
    constructor(type) {
      this.type = type;
    }
    /**
     * @return {number}
     */
    getLength() {
      return 1;
    }
    /**
     * @return {Array<any>}
     */
    getContent() {
      return [this.type];
    }
    /**
     * @return {boolean}
     */
    isCountable() {
      return true;
    }
    /**
     * @return {ContentType}
     */
    copy() {
      return new _ContentType(this.type._copy());
    }
    /**
     * @param {number} offset
     * @return {ContentType}
     */
    splice(offset) {
      throw methodUnimplemented();
    }
    /**
     * @param {ContentType} right
     * @return {boolean}
     */
    mergeWith(right) {
      return false;
    }
    /**
     * @param {Transaction} transaction
     * @param {Item} item
     */
    integrate(transaction, item) {
      this.type._integrate(transaction.doc, item);
    }
    /**
     * @param {Transaction} transaction
     */
    delete(transaction) {
      let item = this.type._start;
      while (item !== null) {
        if (!item.deleted) {
          item.delete(transaction);
        } else if (item.id.clock < (transaction.beforeState.get(item.id.client) || 0)) {
          transaction._mergeStructs.push(item);
        }
        item = item.right;
      }
      this.type._map.forEach((item2) => {
        if (!item2.deleted) {
          item2.delete(transaction);
        } else if (item2.id.clock < (transaction.beforeState.get(item2.id.client) || 0)) {
          transaction._mergeStructs.push(item2);
        }
      });
      transaction.changed.delete(this.type);
    }
    /**
     * @param {StructStore} store
     */
    gc(store) {
      let item = this.type._start;
      while (item !== null) {
        item.gc(store, true);
        item = item.right;
      }
      this.type._start = null;
      this.type._map.forEach(
        /** @param {Item | null} item */
        (item2) => {
          while (item2 !== null) {
            item2.gc(store, true);
            item2 = item2.left;
          }
        }
      );
      this.type._map = /* @__PURE__ */ new Map();
    }
    /**
     * @param {UpdateEncoderV1 | UpdateEncoderV2} encoder
     * @param {number} offset
     */
    write(encoder, offset) {
      this.type._write(encoder);
    }
    /**
     * @return {number}
     */
    getRef() {
      return 7;
    }
  };
  var readContentType = (decoder) => new ContentType(typeRefs[decoder.readTypeRef()](decoder));
  var followRedone = (store, id2) => {
    let nextID = id2;
    let diff = 0;
    let item;
    do {
      if (diff > 0) {
        nextID = createID(nextID.client, nextID.clock + diff);
      }
      item = getItem(store, nextID);
      diff = nextID.clock - item.id.clock;
      nextID = item.redone;
    } while (nextID !== null && item instanceof Item);
    return {
      item,
      diff
    };
  };
  var keepItem = (item, keep) => {
    while (item !== null && item.keep !== keep) {
      item.keep = keep;
      item = /** @type {AbstractType<any>} */
      item.parent._item;
    }
  };
  var splitItem = (transaction, leftItem, diff) => {
    const { client, clock } = leftItem.id;
    const rightItem = new Item(
      createID(client, clock + diff),
      leftItem,
      createID(client, clock + diff - 1),
      leftItem.right,
      leftItem.rightOrigin,
      leftItem.parent,
      leftItem.parentSub,
      leftItem.content.splice(diff)
    );
    if (leftItem.deleted) {
      rightItem.markDeleted();
    }
    if (leftItem.keep) {
      rightItem.keep = true;
    }
    if (leftItem.redone !== null) {
      rightItem.redone = createID(leftItem.redone.client, leftItem.redone.clock + diff);
    }
    leftItem.right = rightItem;
    if (rightItem.right !== null) {
      rightItem.right.left = rightItem;
    }
    transaction._mergeStructs.push(rightItem);
    if (rightItem.parentSub !== null && rightItem.right === null) {
      rightItem.parent._map.set(rightItem.parentSub, rightItem);
    }
    leftItem.length = diff;
    return rightItem;
  };
  var isDeletedByUndoStack = (stack, id2) => some(
    stack,
    /** @param {StackItem} s */
    (s) => isDeleted(s.deletions, id2)
  );
  var redoItem = (transaction, item, redoitems, itemsToDelete, ignoreRemoteMapChanges, um) => {
    const doc2 = transaction.doc;
    const store = doc2.store;
    const ownClientID = doc2.clientID;
    const redone = item.redone;
    if (redone !== null) {
      return getItemCleanStart(transaction, redone);
    }
    let parentItem = (
      /** @type {AbstractType<any>} */
      item.parent._item
    );
    let left = null;
    let right;
    if (parentItem !== null && parentItem.deleted === true) {
      if (parentItem.redone === null && (!redoitems.has(parentItem) || redoItem(transaction, parentItem, redoitems, itemsToDelete, ignoreRemoteMapChanges, um) === null)) {
        return null;
      }
      while (parentItem.redone !== null) {
        parentItem = getItemCleanStart(transaction, parentItem.redone);
      }
    }
    const parentType = parentItem === null ? (
      /** @type {AbstractType<any>} */
      item.parent
    ) : (
      /** @type {ContentType} */
      parentItem.content.type
    );
    if (item.parentSub === null) {
      left = item.left;
      right = item;
      while (left !== null) {
        let leftTrace = left;
        while (leftTrace !== null && /** @type {AbstractType<any>} */
        leftTrace.parent._item !== parentItem) {
          leftTrace = leftTrace.redone === null ? null : getItemCleanStart(transaction, leftTrace.redone);
        }
        if (leftTrace !== null && /** @type {AbstractType<any>} */
        leftTrace.parent._item === parentItem) {
          left = leftTrace;
          break;
        }
        left = left.left;
      }
      while (right !== null) {
        let rightTrace = right;
        while (rightTrace !== null && /** @type {AbstractType<any>} */
        rightTrace.parent._item !== parentItem) {
          rightTrace = rightTrace.redone === null ? null : getItemCleanStart(transaction, rightTrace.redone);
        }
        if (rightTrace !== null && /** @type {AbstractType<any>} */
        rightTrace.parent._item === parentItem) {
          right = rightTrace;
          break;
        }
        right = right.right;
      }
    } else {
      right = null;
      if (item.right && !ignoreRemoteMapChanges) {
        left = item;
        while (left !== null && left.right !== null && (left.right.redone || isDeleted(itemsToDelete, left.right.id) || isDeletedByUndoStack(um.undoStack, left.right.id) || isDeletedByUndoStack(um.redoStack, left.right.id))) {
          left = left.right;
          while (left.redone) left = getItemCleanStart(transaction, left.redone);
        }
        if (left && left.right !== null) {
          return null;
        }
      } else {
        left = parentType._map.get(item.parentSub) || null;
      }
      if (left !== null && /** @type {AbstractType<any>} */
      left.parent._item !== parentItem) {
        left = parentType._map.get(item.parentSub) || null;
      }
    }
    const nextClock = getState(store, ownClientID);
    const nextId = createID(ownClientID, nextClock);
    const redoneItem = new Item(
      nextId,
      left,
      left && left.lastId,
      right,
      right && right.id,
      parentType,
      item.parentSub,
      item.content.copy()
    );
    item.redone = nextId;
    keepItem(redoneItem, true);
    redoneItem.integrate(transaction, 0);
    return redoneItem;
  };
  var Item = class _Item extends AbstractStruct {
    /**
     * @param {ID} id
     * @param {Item | null} left
     * @param {ID | null} origin
     * @param {Item | null} right
     * @param {ID | null} rightOrigin
     * @param {AbstractType<any>|ID|null} parent Is a type if integrated, is null if it is possible to copy parent from left or right, is ID before integration to search for it.
     * @param {string | null} parentSub
     * @param {AbstractContent} content
     */
    constructor(id2, left, origin, right, rightOrigin, parent, parentSub, content) {
      super(id2, content.getLength());
      this.origin = origin;
      this.left = left;
      this.right = right;
      this.rightOrigin = rightOrigin;
      this.parent = parent;
      this.parentSub = parentSub;
      this.redone = null;
      this.content = content;
      this.info = this.content.isCountable() ? BIT2 : 0;
    }
    /**
     * This is used to mark the item as an indexed fast-search marker
     *
     * @type {boolean}
     */
    set marker(isMarked) {
      if ((this.info & BIT4) > 0 !== isMarked) {
        this.info ^= BIT4;
      }
    }
    get marker() {
      return (this.info & BIT4) > 0;
    }
    /**
     * If true, do not garbage collect this Item.
     */
    get keep() {
      return (this.info & BIT1) > 0;
    }
    set keep(doKeep) {
      if (this.keep !== doKeep) {
        this.info ^= BIT1;
      }
    }
    get countable() {
      return (this.info & BIT2) > 0;
    }
    /**
     * Whether this item was deleted or not.
     * @type {Boolean}
     */
    get deleted() {
      return (this.info & BIT3) > 0;
    }
    set deleted(doDelete) {
      if (this.deleted !== doDelete) {
        this.info ^= BIT3;
      }
    }
    markDeleted() {
      this.info |= BIT3;
    }
    /**
     * Return the creator clientID of the missing op or define missing items and return null.
     *
     * @param {Transaction} transaction
     * @param {StructStore} store
     * @return {null | number}
     */
    getMissing(transaction, store) {
      if (this.origin && this.origin.client !== this.id.client && this.origin.clock >= getState(store, this.origin.client)) {
        return this.origin.client;
      }
      if (this.rightOrigin && this.rightOrigin.client !== this.id.client && this.rightOrigin.clock >= getState(store, this.rightOrigin.client)) {
        return this.rightOrigin.client;
      }
      if (this.parent && this.parent.constructor === ID && this.id.client !== this.parent.client && this.parent.clock >= getState(store, this.parent.client)) {
        return this.parent.client;
      }
      if (this.origin) {
        this.left = getItemCleanEnd(transaction, store, this.origin);
        this.origin = this.left.lastId;
      }
      if (this.rightOrigin) {
        this.right = getItemCleanStart(transaction, this.rightOrigin);
        this.rightOrigin = this.right.id;
      }
      if (this.left && this.left.constructor === GC || this.right && this.right.constructor === GC) {
        this.parent = null;
      } else if (!this.parent) {
        if (this.left && this.left.constructor === _Item) {
          this.parent = this.left.parent;
          this.parentSub = this.left.parentSub;
        } else if (this.right && this.right.constructor === _Item) {
          this.parent = this.right.parent;
          this.parentSub = this.right.parentSub;
        }
      } else if (this.parent.constructor === ID) {
        const parentItem = getItem(store, this.parent);
        if (parentItem.constructor === GC) {
          this.parent = null;
        } else {
          this.parent = /** @type {ContentType} */
          parentItem.content.type;
        }
      }
      return null;
    }
    /**
     * @param {Transaction} transaction
     * @param {number} offset
     */
    integrate(transaction, offset) {
      if (offset > 0) {
        this.id.clock += offset;
        this.left = getItemCleanEnd(transaction, transaction.doc.store, createID(this.id.client, this.id.clock - 1));
        this.origin = this.left.lastId;
        this.content = this.content.splice(offset);
        this.length -= offset;
      }
      if (this.parent) {
        if (!this.left && (!this.right || this.right.left !== null) || this.left && this.left.right !== this.right) {
          let left = this.left;
          let o;
          if (left !== null) {
            o = left.right;
          } else if (this.parentSub !== null) {
            o = /** @type {AbstractType<any>} */
            this.parent._map.get(this.parentSub) || null;
            while (o !== null && o.left !== null) {
              o = o.left;
            }
          } else {
            o = /** @type {AbstractType<any>} */
            this.parent._start;
          }
          const conflictingItems = /* @__PURE__ */ new Set();
          const itemsBeforeOrigin = /* @__PURE__ */ new Set();
          while (o !== null && o !== this.right) {
            itemsBeforeOrigin.add(o);
            conflictingItems.add(o);
            if (compareIDs(this.origin, o.origin)) {
              if (o.id.client < this.id.client) {
                left = o;
                conflictingItems.clear();
              } else if (compareIDs(this.rightOrigin, o.rightOrigin)) {
                break;
              }
            } else if (o.origin !== null && itemsBeforeOrigin.has(getItem(transaction.doc.store, o.origin))) {
              if (!conflictingItems.has(getItem(transaction.doc.store, o.origin))) {
                left = o;
                conflictingItems.clear();
              }
            } else {
              break;
            }
            o = o.right;
          }
          this.left = left;
        }
        if (this.left !== null) {
          const right = this.left.right;
          this.right = right;
          this.left.right = this;
        } else {
          let r;
          if (this.parentSub !== null) {
            r = /** @type {AbstractType<any>} */
            this.parent._map.get(this.parentSub) || null;
            while (r !== null && r.left !== null) {
              r = r.left;
            }
          } else {
            r = /** @type {AbstractType<any>} */
            this.parent._start;
            this.parent._start = this;
          }
          this.right = r;
        }
        if (this.right !== null) {
          this.right.left = this;
        } else if (this.parentSub !== null) {
          this.parent._map.set(this.parentSub, this);
          if (this.left !== null) {
            this.left.delete(transaction);
          }
        }
        if (this.parentSub === null && this.countable && !this.deleted) {
          this.parent._length += this.length;
        }
        addStruct(transaction.doc.store, this);
        this.content.integrate(transaction, this);
        addChangedTypeToTransaction(
          transaction,
          /** @type {AbstractType<any>} */
          this.parent,
          this.parentSub
        );
        if (
          /** @type {AbstractType<any>} */
          this.parent._item !== null && /** @type {AbstractType<any>} */
          this.parent._item.deleted || this.parentSub !== null && this.right !== null
        ) {
          this.delete(transaction);
        }
      } else {
        new GC(this.id, this.length).integrate(transaction, 0);
      }
    }
    /**
     * Returns the next non-deleted item
     */
    get next() {
      let n = this.right;
      while (n !== null && n.deleted) {
        n = n.right;
      }
      return n;
    }
    /**
     * Returns the previous non-deleted item
     */
    get prev() {
      let n = this.left;
      while (n !== null && n.deleted) {
        n = n.left;
      }
      return n;
    }
    /**
     * Computes the last content address of this Item.
     */
    get lastId() {
      return this.length === 1 ? this.id : createID(this.id.client, this.id.clock + this.length - 1);
    }
    /**
     * Try to merge two items
     *
     * @param {Item} right
     * @return {boolean}
     */
    mergeWith(right) {
      if (this.constructor === right.constructor && compareIDs(right.origin, this.lastId) && this.right === right && compareIDs(this.rightOrigin, right.rightOrigin) && this.id.client === right.id.client && this.id.clock + this.length === right.id.clock && this.deleted === right.deleted && this.redone === null && right.redone === null && this.content.constructor === right.content.constructor && this.content.mergeWith(right.content)) {
        const searchMarker = (
          /** @type {AbstractType<any>} */
          this.parent._searchMarker
        );
        if (searchMarker) {
          searchMarker.forEach((marker) => {
            if (marker.p === right) {
              marker.p = this;
              if (!this.deleted && this.countable) {
                marker.index -= this.length;
              }
            }
          });
        }
        if (right.keep) {
          this.keep = true;
        }
        this.right = right.right;
        if (this.right !== null) {
          this.right.left = this;
        }
        this.length += right.length;
        return true;
      }
      return false;
    }
    /**
     * Mark this Item as deleted.
     *
     * @param {Transaction} transaction
     */
    delete(transaction) {
      if (!this.deleted) {
        const parent = (
          /** @type {AbstractType<any>} */
          this.parent
        );
        if (this.countable && this.parentSub === null) {
          parent._length -= this.length;
        }
        this.markDeleted();
        addToDeleteSet(transaction.deleteSet, this.id.client, this.id.clock, this.length);
        addChangedTypeToTransaction(transaction, parent, this.parentSub);
        this.content.delete(transaction);
      }
    }
    /**
     * @param {StructStore} store
     * @param {boolean} parentGCd
     */
    gc(store, parentGCd) {
      if (!this.deleted) {
        throw unexpectedCase();
      }
      this.content.gc(store);
      if (parentGCd) {
        replaceStruct(store, this, new GC(this.id, this.length));
      } else {
        this.content = new ContentDeleted(this.length);
      }
    }
    /**
     * Transform the properties of this type to binary and write it to an
     * BinaryEncoder.
     *
     * This is called when this Item is sent to a remote peer.
     *
     * @param {UpdateEncoderV1 | UpdateEncoderV2} encoder The encoder to write data to.
     * @param {number} offset
     */
    write(encoder, offset) {
      const origin = offset > 0 ? createID(this.id.client, this.id.clock + offset - 1) : this.origin;
      const rightOrigin = this.rightOrigin;
      const parentSub = this.parentSub;
      const info = this.content.getRef() & BITS5 | (origin === null ? 0 : BIT8) | // origin is defined
      (rightOrigin === null ? 0 : BIT7) | // right origin is defined
      (parentSub === null ? 0 : BIT6);
      encoder.writeInfo(info);
      if (origin !== null) {
        encoder.writeLeftID(origin);
      }
      if (rightOrigin !== null) {
        encoder.writeRightID(rightOrigin);
      }
      if (origin === null && rightOrigin === null) {
        const parent = (
          /** @type {AbstractType<any>} */
          this.parent
        );
        if (parent._item !== void 0) {
          const parentItem = parent._item;
          if (parentItem === null) {
            const ykey = findRootTypeKey(parent);
            encoder.writeParentInfo(true);
            encoder.writeString(ykey);
          } else {
            encoder.writeParentInfo(false);
            encoder.writeLeftID(parentItem.id);
          }
        } else if (parent.constructor === String) {
          encoder.writeParentInfo(true);
          encoder.writeString(parent);
        } else if (parent.constructor === ID) {
          encoder.writeParentInfo(false);
          encoder.writeLeftID(parent);
        } else {
          unexpectedCase();
        }
        if (parentSub !== null) {
          encoder.writeString(parentSub);
        }
      }
      this.content.write(encoder, offset);
    }
  };
  var readItemContent = (decoder, info) => contentRefs[info & BITS5](decoder);
  var contentRefs = [
    () => {
      unexpectedCase();
    },
    // GC is not ItemContent
    readContentDeleted,
    // 1
    readContentJSON,
    // 2
    readContentBinary,
    // 3
    readContentString,
    // 4
    readContentEmbed,
    // 5
    readContentFormat,
    // 6
    readContentType,
    // 7
    readContentAny,
    // 8
    readContentDoc,
    // 9
    () => {
      unexpectedCase();
    }
    // 10 - Skip is not ItemContent
  ];
  var structSkipRefNumber = 10;
  var Skip = class extends AbstractStruct {
    get deleted() {
      return true;
    }
    delete() {
    }
    /**
     * @param {Skip} right
     * @return {boolean}
     */
    mergeWith(right) {
      if (this.constructor !== right.constructor) {
        return false;
      }
      this.length += right.length;
      return true;
    }
    /**
     * @param {Transaction} transaction
     * @param {number} offset
     */
    integrate(transaction, offset) {
      unexpectedCase();
    }
    /**
     * @param {UpdateEncoderV1 | UpdateEncoderV2} encoder
     * @param {number} offset
     */
    write(encoder, offset) {
      encoder.writeInfo(structSkipRefNumber);
      writeVarUint(encoder.restEncoder, this.length - offset);
    }
    /**
     * @param {Transaction} transaction
     * @param {StructStore} store
     * @return {null | number}
     */
    getMissing(transaction, store) {
      return null;
    }
  };
  var glo = (
    /** @type {any} */
    typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : typeof global !== "undefined" ? global : {}
  );
  var importIdentifier = "__ $YJS$ __";
  if (glo[importIdentifier] === true) {
    console.error("Yjs was already imported. This breaks constructor checks and will lead to issues! - https://github.com/yjs/yjs/issues/438");
  }
  glo[importIdentifier] = true;

  // content/guestEntry.js
  (() => {
    if (typeof document === "undefined" || typeof window === "undefined") {
      return;
    }
    if (document.documentElement?.dataset?.aiflExtensionActive === "1" || document.querySelector('#ai-feedback-loop-host[data-aifl-mode="host"]')) {
      return;
    }
    if (window.__AIFL_GUEST_BOOTSTRAPPED__) {
      return;
    }
    window.__AIFL_GUEST_BOOTSTRAPPED__ = true;
    window.__AIFL_INLINE_CSS__ = styles_default;
    window.__AIFL_GUEST_MODE__ = true;
    window.__AIFL_YJS__ = yjs_exports;
    require_storage();
    require_promptGenerator();
    require_content();
  })();
})();
