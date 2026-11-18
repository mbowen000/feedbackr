/**
 * Build script for AI Feedback Loop v2.0.0.
 * Generates:
 *   1. `dist/guest/overlay.js` — Standalone Guest IIFE bundle (with inline styles + Yjs).
 *   2. `dist/extension/` — Complete MV3 unpacked extension build (with Yjs bundled in storage.js).
 */
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const GUEST_OUT = path.join(DIST_DIR, 'guest', 'overlay.js');
const EXT_DIR = path.join(DIST_DIR, 'extension');

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function copyFile(srcRel, destDir) {
  const src = path.join(ROOT_DIR, srcRel);
  const dest = path.join(destDir, path.basename(srcRel));
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function copyDir(srcRel, destRel) {
  const src = path.join(ROOT_DIR, srcRel);
  const dest = path.join(EXT_DIR, destRel);
  ensureDir(dest);
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      ensureDir(destPath);
      fs.cpSync(srcPath, destPath, { recursive: true });
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

async function build() {
  ensureDir(path.dirname(GUEST_OUT));
  ensureDir(path.join(EXT_DIR, 'content'));

  // 1. Standalone Guest Overlay Bundle
  await esbuild.build({
    entryPoints: [path.join(ROOT_DIR, 'content', 'guestEntry.js')],
    bundle: true,
    platform: 'browser',
    format: 'iife',
    target: ['chrome105', 'firefox105', 'safari15'],
    loader: { '.css': 'text' },
    outfile: GUEST_OUT,
    minify: false,
    logLevel: 'silent'
  });

  // 2. MV3 Chrome Extension Build (bundling Yjs locally for CSP compliance)
  copyFile('manifest.json', EXT_DIR);
  copyFile('background.js', EXT_DIR);
  copyDir('icons', 'icons');
  copyFile(path.join('content', 'styles.css'), path.join(EXT_DIR, 'content'));
  copyFile(path.join('content', 'promptGenerator.js'), path.join(EXT_DIR, 'content'));
  copyFile(path.join('content', 'content.js'), path.join(EXT_DIR, 'content'));

  const extStorageEntry = `
import * as Y from 'yjs';
if (typeof window !== 'undefined') {
  window.__AIFL_YJS__ = Y;
}
require('./content/storage.js');
`;

  await esbuild.build({
    stdin: {
      contents: extStorageEntry,
      resolveDir: ROOT_DIR,
      loader: 'js'
    },
    bundle: true,
    platform: 'browser',
    format: 'iife',
    target: ['chrome105'],
    outfile: path.join(EXT_DIR, 'content', 'storage.js'),
    minify: false,
    logLevel: 'silent'
  });

  const guestSizeKb = (fs.statSync(GUEST_OUT).size / 1024).toFixed(1);
  const extStorageKb = (fs.statSync(path.join(EXT_DIR, 'content', 'storage.js')).size / 1024).toFixed(1);
  console.log(`Built dist/guest/overlay.js (${guestSizeKb} KB)`);
  console.log(`Built dist/extension/ (storage.js ${extStorageKb} KB with bundled Yjs)`);
}

if (require.main === module) {
  build().catch((err) => {
    console.error('Build failed:', err);
    process.exit(1);
  });
}

module.exports = { build };
