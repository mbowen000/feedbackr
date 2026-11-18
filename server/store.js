const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const Y = require('yjs');
const {
  isValidStatus,
  normalizeAuthor,
  normalizeReply,
  normalizePin
} = require('../shared/schema');

const DEFAULT_DB_PATH = path.join(process.cwd(), '.aifl-session', 'session.db');

function makeHttpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function cloneValue(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function isPrivilegedRole(actorRole) {
  return actorRole === 'host' || actorRole === 'mcp';
}

function comparePins(a, b) {
  const numDiff = (Number(a?.number) || 0) - (Number(b?.number) || 0);
  if (numDiff !== 0) return numDiff;
  return (Number(a?.createdAt) || 0) - (Number(b?.createdAt) || 0);
}

class PinStore {
  constructor(options = {}) {
    this.dbPath = options.dbPath || process.env.AIFL_DB_PATH || DEFAULT_DB_PATH;
    if (this.dbPath !== ':memory:') {
      fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
    }

    this.db = new DatabaseSync(this.dbPath);
    this.db.exec('PRAGMA busy_timeout = 5000;');
    if (this.dbPath !== ':memory:') {
      this.db.exec('PRAGMA journal_mode = WAL;');
    }

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS pins (
        id TEXT PRIMARY KEY,
        number INTEGER,
        status TEXT,
        route_key TEXT,
        json TEXT NOT NULL,
        updated_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS session_meta (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `);

    this._upsertPinStmt = this.db.prepare(`
      INSERT OR REPLACE INTO pins (id, number, status, route_key, json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    this._deletePinStmt = this.db.prepare('DELETE FROM pins WHERE id = ?');
    this._deleteAllPinsStmt = this.db.prepare('DELETE FROM pins');
    this._selectAllPinsStmt = this.db.prepare('SELECT json FROM pins ORDER BY number ASC, updated_at ASC');
    this._getMetaStmt = this.db.prepare('SELECT value FROM session_meta WHERE key = ?');
    this._setMetaStmt = this.db.prepare('INSERT OR REPLACE INTO session_meta (key, value) VALUES (?, ?)');

    this.ydoc = new Y.Doc();
    this.yPins = this.ydoc.getMap('pins');
    this._closed = false;

    this._seedYDocFromSqlite();

    // Keep SQLite synced if any Yjs binary client mutates yPins directly
    this.yPins.observe((event, transaction) => {
      if (transaction.origin === 'sqlite-seed' || transaction.origin === 'store' || this._closed) {
        return;
      }
      for (const key of event.keysChanged) {
        if (this.yPins.has(key)) {
          const raw = this.yPins.get(key);
          const normalized = normalizePin(raw);
          this._upsertSqlitePin(normalized);
        } else {
          this._deletePinStmt.run(key);
        }
      }
    });
  }

  _seedYDocFromSqlite() {
    const rows = this._selectAllPinsStmt.all();
    this.ydoc.transact(() => {
      for (let i = 0; i < rows.length; i += 1) {
        try {
          const parsed = JSON.parse(rows[i].json);
          const normalized = normalizePin(parsed, i);
          this.yPins.set(normalized.id, normalized);
        } catch {
          // Ignore malformed persisted row
        }
      }
    }, 'sqlite-seed');
  }

  _upsertSqlitePin(pin) {
    this._upsertPinStmt.run(
      pin.id,
      pin.number,
      pin.status,
      pin.screen?.routeKey || '/',
      JSON.stringify(pin),
      pin.updatedAt || Date.now()
    );
  }

  _persistPin(pin) {
    this._upsertSqlitePin(pin);
    this.ydoc.transact(() => {
      this.yPins.set(pin.id, cloneValue(pin));
    }, 'store');
  }

  getAllPins({ status, routeKey } = {}) {
    const list = [];
    for (const rawPin of this.yPins.values()) {
      if (!rawPin || typeof rawPin !== 'object') continue;
      if (status) {
        if (Array.isArray(status)) {
          if (!status.includes(rawPin.status)) continue;
        } else if (rawPin.status !== status) {
          continue;
        }
      }
      if (routeKey && rawPin.screen?.routeKey !== routeKey) {
        continue;
      }
      list.push(cloneValue(rawPin));
    }
    list.sort(comparePins);
    return list;
  }

  getPin(id) {
    if (!id || !this.yPins.has(id)) return null;
    return cloneValue(this.yPins.get(id));
  }

  getCounts() {
    const counts = {
      total: 0,
      pending: 0,
      approved: 0,
      in_progress: 0,
      resolved: 0
    };
    for (const pin of this.yPins.values()) {
      if (!pin || typeof pin !== 'object') continue;
      counts.total += 1;
      if (Object.prototype.hasOwnProperty.call(counts, pin.status)) {
        counts[pin.status] += 1;
      }
    }
    return counts;
  }

  createPin(rawPin = {}, actorRole = 'guest') {
    const privileged = isPrivilegedRole(actorRole);
    const existing = this.getAllPins();
    const maxNum = existing.reduce((max, item) => Math.max(max, Number(item.number) || 0), 0);
    const requestedNum = Number(rawPin?.number);
    const number = Number.isFinite(requestedNum) && requestedNum > 0 ? requestedNum : maxNum + 1;

    const fallbackAuthorRole = actorRole === 'mcp' ? 'agent' : privileged ? 'host' : 'guest';
    const rawAuthor = rawPin?.author && typeof rawPin.author === 'object' ? { ...rawPin.author } : {};
    if (!privileged) {
      rawAuthor.role = 'guest';
    }

    const candidate = {
      ...rawPin,
      number,
      status: privileged ? (isValidStatus(rawPin?.status) ? rawPin.status : 'pending') : 'pending',
      author: normalizeAuthor(rawAuthor, fallbackAuthorRole)
    };

    const pin = normalizePin(candidate, number - 1);
    if (this.yPins.has(pin.id)) {
      if (rawPin?.id) {
        throw makeHttpError(409, `Pin already exists: ${pin.id}`);
      }
      pin.id = `aifl_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    }

    this._persistPin(pin);
    return {
      pin: cloneValue(pin),
      pins: this.getAllPins()
    };
  }

  updatePin(id, patch = {}, actorRole = 'guest', actorId = null) {
    const existing = this.getPin(id);
    if (!existing) {
      throw makeHttpError(404, `Pin not found: ${id}`);
    }

    const privileged = isPrivilegedRole(actorRole);
    if (!privileged) {
      if (existing.status !== 'pending') {
        throw makeHttpError(403, 'Guests may only edit pending pins');
      }
      if (!actorId || existing.author?.id !== actorId) {
        throw makeHttpError(403, 'Guests may only edit their own pins');
      }
      if (
        patch &&
        Object.prototype.hasOwnProperty.call(patch, 'status') &&
        patch.status !== undefined &&
        patch.status !== existing.status
      ) {
        throw makeHttpError(403, 'Guests cannot change pin status');
      }
    }

    if (
      privileged &&
      patch &&
      Object.prototype.hasOwnProperty.call(patch, 'status') &&
      patch.status !== undefined &&
      !isValidStatus(patch.status)
    ) {
      throw makeHttpError(400, `Invalid pin status: ${patch.status}`);
    }

    const mergedScreen =
      patch?.screen && typeof patch.screen === 'object'
        ? { ...existing.screen, ...patch.screen }
        : existing.screen;
    const mergedTarget =
      patch?.target && typeof patch.target === 'object'
        ? { ...existing.target, ...patch.target }
        : existing.target;

    const merged = {
      ...existing,
      ...patch,
      id: existing.id,
      number: privileged && patch?.number !== undefined ? patch.number : existing.number,
      createdAt: existing.createdAt,
      updatedAt: Date.now(),
      screen: mergedScreen,
      target: mergedTarget,
      author: privileged && patch?.author ? normalizeAuthor(patch.author, existing.author?.role || 'host') : existing.author,
      status: privileged && patch?.status !== undefined ? patch.status : existing.status
    };

    const pin = normalizePin(merged, (existing.number || 1) - 1);
    this._persistPin(pin);
    return {
      pin: cloneValue(pin),
      pins: this.getAllPins()
    };
  }

  updatePinStatus(id, status, { summary, actorRole = 'host' } = {}) {
    if (!isPrivilegedRole(actorRole)) {
      throw makeHttpError(403, 'Only host or MCP agent can change pin status');
    }
    if (!isValidStatus(status)) {
      throw makeHttpError(400, `Invalid pin status: ${status}`);
    }

    const existing = this.getPin(id);
    if (!existing) {
      throw makeHttpError(404, `Pin not found: ${id}`);
    }

    const now = Date.now();
    const replies = Array.isArray(existing.replies) ? [...existing.replies] : [];
    let resolutionSummary = existing.resolutionSummary;

    if (typeof summary === 'string' && summary.trim()) {
      const trimmed = summary.trim();
      resolutionSummary = trimmed;
      replies.push(
        normalizeReply(
          {
            authorName: actorRole === 'mcp' ? 'AI Coding Agent' : 'Host',
            role: actorRole === 'mcp' ? 'agent' : 'host',
            text: trimmed,
            createdAt: now
          },
          replies.length
        )
      );
    }

    const pin = normalizePin(
      {
        ...existing,
        status,
        resolutionSummary,
        replies,
        updatedAt: now
      },
      (existing.number || 1) - 1
    );

    this._persistPin(pin);
    return {
      pin: cloneValue(pin),
      pins: this.getAllPins()
    };
  }

  batchUpdateStatus(pinIds, status, { summary, actorRole = 'host' } = {}) {
    if (!isPrivilegedRole(actorRole)) {
      throw makeHttpError(403, 'Only host or MCP agent can batch update pin status');
    }
    if (!isValidStatus(status)) {
      throw makeHttpError(400, `Invalid pin status: ${status}`);
    }

    const ids = Array.isArray(pinIds) ? pinIds : [];
    const updatedPins = [];
    const now = Date.now();

    this.ydoc.transact(() => {
      for (const id of ids) {
        const existing = this.getPin(id);
        if (!existing) continue;

        const replies = Array.isArray(existing.replies) ? [...existing.replies] : [];
        let resolutionSummary = existing.resolutionSummary;

        if (typeof summary === 'string' && summary.trim()) {
          const trimmed = summary.trim();
          resolutionSummary = trimmed;
          replies.push(
            normalizeReply(
              {
                authorName: actorRole === 'mcp' ? 'AI Coding Agent' : 'Host',
                role: actorRole === 'mcp' ? 'agent' : 'host',
                text: trimmed,
                createdAt: now
              },
              replies.length
            )
          );
        }

        const pin = normalizePin(
          {
            ...existing,
            status,
            resolutionSummary,
            replies,
            updatedAt: now
          },
          (existing.number || 1) - 1
        );

        this._upsertSqlitePin(pin);
        this.yPins.set(pin.id, cloneValue(pin));
        updatedPins.push(cloneValue(pin));
      }
    }, 'store');

    return {
      updatedPins,
      pins: this.getAllPins()
    };
  }

  addReply(pinId, rawReply = {}, actorRole = 'guest') {
    const existing = this.getPin(pinId);
    if (!existing) {
      throw makeHttpError(404, `Pin not found: ${pinId}`);
    }

    const effectiveRole =
      actorRole === 'mcp'
        ? 'agent'
        : actorRole === 'host'
          ? (rawReply?.role === 'agent' ? 'agent' : 'host')
          : 'guest';

    const replies = Array.isArray(existing.replies) ? [...existing.replies] : [];
    const reply = normalizeReply(
      {
        ...rawReply,
        role: effectiveRole
      },
      replies.length
    );

    if (!reply.text) {
      throw makeHttpError(400, 'Reply text cannot be empty');
    }

    replies.push(reply);
    const pin = normalizePin(
      {
        ...existing,
        replies,
        updatedAt: Date.now()
      },
      (existing.number || 1) - 1
    );

    this._persistPin(pin);
    return {
      pin: cloneValue(pin),
      reply: cloneValue(reply),
      pins: this.getAllPins()
    };
  }

  deletePin(id, actorRole = 'guest', actorId = null) {
    const existing = this.getPin(id);
    if (!existing) {
      throw makeHttpError(404, `Pin not found: ${id}`);
    }

    if (!isPrivilegedRole(actorRole)) {
      if (existing.status !== 'pending') {
        throw makeHttpError(403, 'Guests may only delete pending pins');
      }
      if (!actorId || existing.author?.id !== actorId) {
        throw makeHttpError(403, 'Guests may only delete their own pins');
      }
    }

    this._deletePinStmt.run(id);
    this.ydoc.transact(() => {
      this.yPins.delete(id);
    }, 'store');

    return this.getAllPins();
  }

  clearPins({ scope = 'all', routeKey = null, actorRole = 'host' } = {}) {
    if (!isPrivilegedRole(actorRole)) {
      throw makeHttpError(403, 'Only host can clear pins');
    }

    if (scope === 'screen') {
      if (!routeKey) {
        return this.getAllPins();
      }
      const toDelete = [];
      for (const pin of this.yPins.values()) {
        if (pin?.screen?.routeKey === routeKey) {
          toDelete.push(pin.id);
        }
      }
      this.ydoc.transact(() => {
        for (const id of toDelete) {
          this._deletePinStmt.run(id);
          this.yPins.delete(id);
        }
      }, 'store');
    } else {
      this._deleteAllPinsStmt.run();
      this.ydoc.transact(() => {
        for (const key of Array.from(this.yPins.keys())) {
          this.yPins.delete(key);
        }
      }, 'store');
    }

    return this.getAllPins();
  }

  getSessionMeta(key) {
    const row = this._getMetaStmt.get(key);
    return row ? row.value : null;
  }

  setSessionMeta(key, value) {
    this._setMetaStmt.run(key, String(value));
  }

  close() {
    if (this._closed) return;
    this._closed = true;
    try {
      this.db.close();
    } catch {
      // Ignore double close
    }
  }
}

function createPinStore(options = {}) {
  return new PinStore(options);
}

module.exports = {
  PinStore,
  createPinStore,
  DEFAULT_DB_PATH
};
