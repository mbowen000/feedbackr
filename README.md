# AI Feedback Loop — Chrome Extension

Drop persistent, context-rich feedback pins on any web page, local HTML prototype, or slide presentation and export a concise, structured Markdown prompt for AI coding agents (Antigravity, Claude Code, Cursor, Windsurf, ChatGPT, etc.).

---

## Quick Start (Install in 30 Seconds)

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in the top-right corner).
3. Click **Load unpacked** and select this folder:
   `c:\Users\mikes\Projects\Chrome Extension - AI Feedback`
4. *(Optional — for local `file://` HTML decks like `demo.html`)*: Click **Details** on the **AI Feedback Loop** card in `chrome://extensions/` and turn on **"Allow access to file URLs"**.

---

## How to Use

1. **Toggle Floating Controls**:
   - Click the **AI Feedback Loop** icon in your Chrome toolbar, **or** press **`Alt + Shift + F`** (`Cmd + Shift + F` on Mac).
   - A draggable floating control bar appears at the bottom of the screen.
2. **Add a Comment Pin (`+ Add Comment`)**:
   - Click **`+ Add Comment`** to enter inspect mode.
   - Hover over any element to see its tag/selector and bounding box.
   - **Tip for Interactive Menus & Accordions**: Hold **`Shift + Click`** while in inspect mode to open/close accordions, dropdown menus, or tabs without leaving inspect mode!
   - Click the target element, type your instruction (e.g. *"Change this font size to 20px"*, *"Add Spanish language option"*), and press **`Ctrl/⌘ + Enter`** or click **Save Pin**.
3. **Click Any Pin Bubble (`1`, `2`, `3`...)**:
   - Clicking a numbered pin bubble on the page slides open the **Right-Hand Drawer** and focuses that specific comment card while pulsing a highlight ring around its target element.
4. **Right-Hand Slide-Out Drawer**:
   - Filter between **All Screens** (across routes/slides/tabs on the site) and **This Screen**.
   - Toggle between **Full Context** (includes computed CSS styles) and **Compact** prompt modes.
   - Click **`🎯 Locate`** on any card to scroll to the element — if it's inside a collapsed `<details>` or accordion, it will automatically expand it! If it's on another URL/screen, clicking **`↗ Go`** navigates there.
   - Expand **"Preview Generated AI Agent Prompt"** at the bottom of the drawer to inspect the exact Markdown output.
5. **Export / Copy to AI Agent**:
   - Click **Copy Prompt** on the floating bar or **Copy All as AI Prompt** in the drawer to copy the structured Markdown prompt to your clipboard, or click **Download .md**.
6. **Clear All Comments (with Confirmation)**:
   - Click **Clear** on the toolbar (or **Clear All Comments** in the drawer) and click **Confirm Clear** to wipe all pins for the current site.

