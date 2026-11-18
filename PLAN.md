# AI Feedback Loop v2.0.0 — Live-First Collaborative Product Plan

> **Stable Rollback Baseline**: `v1.1.0` (git tag `v1.1.0`, commit `ec08af8`) — Standalone Manifest V3 Chrome Extension (Shadow DOM overlay, DevTools-style element picker, `Ctrl`-hold dangling free-drop pins, movable 3-dot gripper popovers/pins, Page Content Landscape prompt generator, and right-hand slide-out drawer).

---

## 0. Git & Versioning Rules (Read First!)

- **Major New Version (`2.0.0`)**: This plan builds **v2.0.0** on top of the `v1.1.0` baseline. Update `manifest.json` `"version"` to `"2.0.0"` when starting implementation.
- **Preserve `v1.1.0` for Instant Rollback**:
  - **Do NOT delete, move, or force-update the `v1.1.0` git tag** (`ec08af8`).
  - **Do ALL v2.0.0 development on a dedicated branch** (e.g., `git checkout -b feat/v2-live-collab`), committing cleanly at each completed milestone.
  - The user can roll back to the standalone v1.1.0 extension at any time via `git checkout v1.1.0` and clicking **Reload (`↻`)** in `chrome://extensions/` or `edge://extensions/`.

---

## 1. Vision & Scope Shift (Live-First)

Transform **AI Feedback Loop** from a single-user feedback extension into a **local-first, multiplayer AI canvas** built primarily for **live synchronous reviews** (screen-shares, client calls, and architecture walkthroughs while the host's machine is awake).

- **IP & InfoSec Protection**: All source code, DOM metadata, and feedback stay on the host's local machine. Guests connect over an ephemeral, password-protected tunnel (`ngrok` / Cloudflare Tunnel) with zero extension installs or third-party accounts.
- **Deferred (Lower Priority)**: Always-on async reviews while the host machine is asleep/off, multi-timezone offline queuing, and cloud-hosted team infrastructure (Phase 2).

---

## 2. Core Actors & Capabilities

| Actor | Capabilities |
| :--- | :--- |
| **Host / Developer** | Launches local server + tunnel in one command; shares password-protected link; views live guest cursors & pins via Chrome Extension; triages `Pending` → `Approved` in the **Host Review Inbox**; dispatches approved pins to the local AI agent via MCP and watches Vite HMR update everyone's screen live. |
| **External Guest / Client** | Opens tunnel URL in any standard browser with a session passphrase (no extension, no login); drops element or free-form pins; adds replies; sees live cursors and real-time HMR updates as changes ship. |
| **Local AI Coding Agent** *(Antigravity, Claude Code, Cursor)* | Connects to the local MCP server (`stdio` / `127.0.0.1`); reads `canvas://pins/approved` (3-tier DOM anchors, Page Content Landscape, computed styles, coordinates, and thread context); edits local HTML/CSS/JS files; calls `mark_pin_resolved` to clear resolved pins across all connected browsers. |

---

## 3. System Architecture (Phase 1: Live-First Local Stack)

```text
+-----------------------------------+         +-----------------------------------+
|         GUEST BROWSER             |         |           HOST BROWSER            |
|  (Any Browser — Zero Install)     |         |       (Chrome / Edge Local)       |
|  [Microsite + /__collab/ Script]  |         |  [Microsite + Chrome Extension]   |
+-----------------+-----------------+         +-----------------+-----------------+
                  |                                             |
                  | 1. HTTPS + Basic Auth + WSS (/ws)           | 1. localhost HTTP/WS
                  v                                             |
+-----------------------------------+                           |
|   SECURE TUNNEL (ngrok / CF)      |                           |
+-----------------+-----------------+                           |
                  |                                             |
                  +----------------------+----------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------+
|                            HOST LOCAL MACHINE (localhost)                         |
|                                                                                   |
|  +-----------------------------------------------------------------------------+  |
|  |  SINGLE-PORT REVERSE PROXY & COLLAB SERVER                                  |  |
|  |  - Proxies target Vite/Node microsite + HMR                                 |  |
|  |  - Serves /__collab/ guest overlay bundle                                   |  |
|  |  - Runs y-websocket (/ws) for CRDT cursors, pins & inbox triage             |  |
|  |  - Persists session state locally (SQLite / JSON) across refreshes          |  |
|  +-------------------------------------+---------------------------------------+  |
|                                        |                                          |
|                                        | Approved Pin Queue (Loopback Only)       |
|                                        v                                          |
|  +-----------------------------------------------------------------------------+  |
|  |  LOCAL MCP SERVER BRIDGE (stdio / 127.0.0.1 SSE)                            |  |
|  |  - Resources: canvas://pins/approved, canvas://session/active-branch        |  |
|  |  - Tools: get_approved_pins, get_pin_dom_context, mark_pin_resolved         |  |
|  |  - Prompts: compile_spatial_feedback_batch                                  |  |
|  +-------------------------------------+---------------------------------------+  |
|                                        |                                          |
|                                        v                                          |
|  +-----------------------------------------------------------------------------+  |
|  |  LOCAL AI CODING AGENT (Antigravity / Claude Code / Cursor)                 |  |
|  |  - Edits local repo files -> triggers Vite HMR -> resolves pins             |  |
|  +-----------------------------------------------------------------------------+  |
+-----------------------------------------------------------------------------------+
```

---

## 4. Prioritized Implementation Roadmap (~3 to 5 Hours via Prompting)

### Priority 1: Local Single-Port Proxy + Live Sync Server (~1 – 1.5 hrs)
- Build a Node.js server that:
  - Proxies the target local dev server (preserving Vite HMR).
  - Exposes `/ws` (`y-websocket`) for real-time CRDT sync of cursors, pins, and threads.
  - Serves `/__collab/overlay.js` so guests receive the spatial overlay without installing the extension.
  - Enforces configurable HTTP Basic Auth on external/tunnel traffic.
  - Persists session state locally (SQLite/JSON) so page refreshes during a call never lose pins.

### Priority 2: Multiplayer Extension & Host Review Inbox (~1 – 1.5 hrs)
- Add a lightweight `esbuild`/`vite` build step for the MV3 extension (bundling `yjs` + `y-websocket` locally to satisfy MV3 CSP).
- Upgrade the `v1.1.0` overlay to support:
  - Live multiplayer cursors & real-time pin placement.
  - Threaded replies on pins.
  - **Host Review Inbox** inside the right-hand drawer: `Pending` / `Approved` / `Resolved` status pills, multi-select checkboxes, and **"Run Agent on Selected"** / **"Copy Selected"** actions.
  - Debounced 3-tier DOM re-anchoring (Selector → Text-Quote → Relative Coordinates) so pins stay put after Vite HMR reloads.

### Priority 3: Local MCP Server Bridge (~1 hr)
- Implement an MCP server (`@modelcontextprotocol/sdk`) over `stdio` / `127.0.0.1` SSE wired to the local pin store:
  - **Resources**: `canvas://pins/approved`, `canvas://session/active-branch`, `canvas://dom/snapshot`
  - **Tools**: `get_approved_pins`, `get_pin_dom_context`, `mark_pin_resolved`, `request_pin_clarification`
  - **Prompts**: `compile_spatial_feedback_batch`
- Verify the full loop: Guest drops pin → Host approves → Agent pulls via MCP → Agent edits local file → Vite HMR updates all browsers + pin marks `Resolved`.

### Priority 4: One-Command Call Launcher & Tunnel (~0.5 – 1 hr)
- Add a single CLI/npm script to start the target dev server, sync proxy, MCP bridge, and `cloudflared` / `ngrok` tunnel, printing the shareable guest URL and session passphrase.

---

## 5. Deferred Backlog (Phase 2 / Later)
- **Async / Sleep-Resilient Reviews**: Keeping sessions online when the host laptop is asleep or shut down (via an always-on local node or lightweight encrypted pin relay).
- **Automated PR Branch Previews**: GitHub/GitLab integration and multi-tenant cloud auth (SSO/OAuth/RBAC).
- **Always-On Cloud Infrastructure**: Managed Postgres + edge realtime sync.

---

## 6. Technical Guardrails (What to Watch Out For)
1. **Single-Tunnel Routing (`wss://`)**: Route the microsite, `/__collab/`, and `/ws` through **one** reverse-proxy port so guest browsers on `https://` never hit mixed-content blocks trying to reach `ws://localhost`.
2. **Distinguish `/ws` vs. Vite HMR WebSocket Upgrades**: The reverse proxy's `upgrade` handler must route `/ws` to `y-websocket` and forward all other WebSocket upgrades (e.g., Vite HMR) to the target dev server.
3. **Strict Loopback Isolation for MCP**: Bind MCP strictly to `stdio` / `127.0.0.1`; never expose MCP endpoints through the public tunnel.
4. **Host vs. Guest Authority**: Guests may only create `pending` pins and replies; only the authenticated host (using a local host token in the extension) can transition pins to `approved` or trigger MCP execution.
5. **MV3 CSP Compliance**: Bundle `yjs` and WebSocket dependencies locally—never load remote scripts in the extension.
6. **HMR Re-Anchor Debounce**: Debounce `MutationObserver` re-anchoring (~150ms) during Vite HMR DOM swaps so pins re-attach smoothly without flickering.

---

## 7. Technical Handoff Specification (For Orchestrators & Agents)

### A. Current Codebase Map (`v1.1.0`, No Build Step Yet)
- `manifest.json` — MV3 manifest (`activeTab`, `storage`, `scripting`), shortcut `Alt+Shift+F`, injects `content/storage.js` → `content/promptGenerator.js` → `content/content.js`, exposes `content/styles.css`.
- `background.js` — Service worker toggling UI on toolbar click / command + fallback `chrome.scripting.executeScript`.
- `content/storage.js` (`window.AIFLStorage`) — `chrome.storage.local` persistence keyed by `aifl_site_<origin>`. **Refactor target**: introduce a storage/sync adapter so `content.js` seamlessly uses `chrome.storage.local` standalone OR `Y.Doc` (`y-websocket`) when connected to a live session.
- `content/promptGenerator.js` (`window.AIFLPromptGenerator`) — Already implements:
  - `capturePinContext(el, clickEvent)` and `captureFreePinContext(clickEvent)`
  - `capturePageContentLandscape()` (`[L1]`..`[Ln]` visual map of headings, copy, images, controls)
  - `buildPlacementNarrative()`, `extractContentSiblings()`, `extractClickedPhrase()`
  - `resolveTargetElement()`, `tryRevealTargetElement()`, `generateAIPrompt()`
- `content/content.js` & `content/styles.css` — Shadow DOM (`#ai-feedback-loop-host`, `mode: 'open'`), draggable toolbar/popovers/pins (3-dot grippers), `Ctrl`-hold dangling free-drop pin, and right-hand slide-out drawer.

### B. Build & Bundling Strategy
- `v1.1.0` currently has no `package.json`. Add `package.json` with `esbuild` (fast, minimal) to produce:
  1. **Chrome Extension bundle** (e.g., `content/bundle.js` or `dist/extension/`) bundling `yjs` + `y-websocket` + existing content modules for MV3 CSP compliance. Keep `chrome://extensions` **Load unpacked** working cleanly.
  2. **Standalone Guest Overlay bundle** (`dist/guest/overlay.js`) sharing the exact same Shadow DOM UI, `promptGenerator.js`, and Yjs client—using an in-memory/Yjs storage adapter instead of `chrome.storage.local` and `chrome.runtime.getURL`.
  3. **Local Server & MCP package** (`server/`) running Node.js (`http-proxy` / `http`, `ws`, `yjs`, `y-websocket`, `better-sqlite3` or `sql.js`, `@modelcontextprotocol/sdk`).

### C. Shared Pin & Thread Schema (Extension ↔ Guest ↔ Yjs ↔ SQLite ↔ MCP)
```json
{
  "id": "aifl_1731900000_ab12cd",
  "number": 1,
  "status": "pending",
  "author": {
    "id": "guest_9f2a",
    "name": "Client Reviewer",
    "role": "guest",
    "color": "#10b981"
  },
  "text": "Increase subtitle font size to 18px",
  "replies": [
    {
      "id": "rep_1",
      "authorName": "Mike (Host)",
      "role": "host",
      "text": "Good call, updating to 18px.",
      "createdAt": 1731900050000
    }
  ],
  "screen": {
    "url": "http://localhost:5173/#screen-overview",
    "routeKey": "/#screen-overview",
    "screenLabel": "/#screen-overview (Tab: 1. Overview)",
    "title": "Acme Cloud Deck",
    "viewport": { "width": 1440, "height": 900 },
    "landscape": [
      { "id": "L1", "container": "<div#hero-banner.hero>", "title": "...", "summary": "..." }
    ]
  },
  "target": {
    "isFreePin": false,
    "pinType": "element",
    "selector": "#hero-banner > p.hero-subtitle",
    "shortLabel": "p.hero-subtitle",
    "textSnippet": "...",
    "placementNarrative": "...",
    "landmarkRef": { "id": "L1", "container": "<div#hero-banner.hero>", "title": "..." },
    "pageCoords": { "x": 482, "y": 214 },
    "viewportPct": { "x": 33, "y": 24 },
    "offsetRatio": { "x": 0.42, "y": 0.51 },
    "uiState": [],
    "styleSummary": "font: 13px/400, color: rgb(148, 163, 184)"
  },
  "createdAt": 1731900000000,
  "updatedAt": 1731900050000
}
```
- Valid `status` values: `"pending" | "approved" | "in_progress" | "resolved"`.

### D. Proxy Injection & Guest Auth Details
- The reverse proxy intercepts `text/html` responses from the target dev server and injects `<script src="/__collab/overlay.js" defer></script>` right before `</body>` (never modifying source files on disk).
- External requests (non-loopback or via tunnel) require HTTP Basic Auth against a per-session passphrase generated at startup.
- Host extension authenticates to the local server with a host secret token (e.g., passed via `ws://localhost:<port>/ws?hostToken=...` or HTTP header) to unlock `approve`, `reject/delete`, and `dispatch` actions.

### E. MCP Server Contract (`stdio` / `127.0.0.1` SSE)
- **Resources**:
  - `canvas://pins/approved` — JSON list of all `approved` pins with full DOM anchors, `placementNarrative`, `landscape`, and `replies`.
  - `canvas://session/active-branch` — Current Git branch + target dev URL + session stats.
- **Tools**:
  - `get_approved_pins({ routeKey? })` — Returns approved pins ready for code execution (and optionally transitions them to `in_progress`).
  - `get_pin_dom_context({ pinId })` — Returns full context + compiled prompt for a single pin.
  - `mark_pin_resolved({ pinId, summary? })` — Updates pin status to `resolved` in SQLite **and** mutates the live `Y.Doc` so all connected browsers immediately reflect the resolved state.
  - `request_pin_clarification({ pinId, question })` — Appends an agent reply to `pin.replies` in `Y.Doc` + SQLite so the host/guest see it live in the browser.
- **Prompts**:
  - `compile_spatial_feedback_batch` — Generates the structured Markdown feedback prompt from all currently `approved` pins.


