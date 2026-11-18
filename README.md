# AI Feedback Loop (`v2.0.0`)

Drop persistent, context-rich feedback pins on any web page, local HTML prototype, or live dev server—collaborate in real time with external guests over a password-protected tunnel, triage pins in the Host Review Inbox, and dispatch approved feedback straight to your local AI coding agent via MCP (`stdio`) or Markdown prompt export.

---

## v2.0.0 Live Multiplayer & Local MCP Stack

### 1. Setup & Build
```bash
npm install
npm run build
```
- `npm run build` bundles:
  - `dist/guest/overlay.js` — standalone zero-install guest overlay served at `/__collab/overlay.js`
  - `dist/extension/` — packaged Manifest V3 extension build (while the repository root also stays valid for Chrome **Load unpacked**)

### 2. Start the Live Collab Proxy + Tunnel
```bash
# Start proxy (port 4173) + built-in demo target (port 5173, if none running) + Cloudflare Quick Tunnel
npm run collab

# Or point at your existing local Vite/dev server:
npm run collab -- --target http://127.0.0.1:5173

# Local-only mode without opening a public tunnel:
npm run collab:local
```
- **Host**: Open `http://localhost:4173` in Chrome/Edge with the extension installed. The extension auto-authenticates via loopback `/__collab/host-session` (`🟢 Host`), unlocks **Host Review Inbox** controls (`All` / `Pending` / `Approved` / `Resolved` filters, batch checkboxes, **Approve**, **Resolve**, **Run Agent on Selected**), and sees live guest cursors and pins.
- **External Guest / Client**: Open the printed `https://*.trycloudflare.com` tunnel URL in any browser and enter the printed session passphrase (HTTP Basic Auth). Guests receive the spatial overlay automatically—no extension or account required—and can drop `pending` pins, view live cursors, and post threaded replies.

### 3. Connect Your Local AI Coding Agent (MCP `stdio`)
```bash
npm run mcp
```
Runs `server/mcpServer.js` strictly over `stdio` (never exposed through the tunnel), wired to the live Collab Server (`Y.Doc` + `node:sqlite` in `.aifl-session/session.db`) with offline SQLite fallback:
- **Resources**: `canvas://pins/approved`, `canvas://session/active-branch`, `canvas://dom/snapshot`
- **Tools**: `get_approved_pins`, `get_pin_dom_context`, `mark_pin_resolved`, `request_pin_clarification`
- **Prompt**: `compile_spatial_feedback_batch`

### 4. End-to-End Verification
```bash
npm run verify
```
Runs `scripts/verify-e2e.js` across build parsing, proxy HTML injection & tunnel Basic Auth, strict loopback isolation (`403` on tunnel requests to `/__collab/host-session` and `/__collab/mcp/*`), HMR WebSocket forwarding, multiplayer WebSocket authority, and the full MCP `stdio` loop.

---

## Standalone Chrome Extension (`Load unpacked`)

1. Open Chrome/Edge and navigate to `chrome://extensions/`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select `dist/extension/` (or the repository root folder).
4. *(Optional — for local `file://` HTML decks like `demo.html`)*: Click **Details** on **AI Feedback Loop** and turn on **"Allow access to file URLs"**.

### Using the Overlay
1. **Toggle Controls**: Click the toolbar icon or press **`Alt + Shift + F`** (`Cmd + Shift + F` on Mac).
2. **Add a Pin (`+ Add Comment`)**: Hover any element to highlight it and click to attach feedback. Hold **`Ctrl`** to drop a free-coordinate dangling pin anywhere on the canvas, or **`Shift + Click`** to interact with menus/accordions/tabs while inspecting.
3. **Host Review Inbox & Export**: Click any pin or open the **Comments** drawer to filter by status/screen, reply in threads, click **`🎯 Locate`** / **`↗ Go`**, click **Run Agent on Selected** (approves selected pins for MCP and copies the batch prompt), or export **Copy Prompt** / **Download .md**.

---

## Instant Rollback to `v1.1.0`

The standalone v1.1.0 Chrome Extension baseline is preserved on `master` at tag `v1.1.0`:
```bash
git checkout v1.1.0
```
Then click **Reload (`↻`)** in `chrome://extensions/` or `edge://extensions/`.
