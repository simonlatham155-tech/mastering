#!/usr/bin/env node
/** Copy unminified faustwasm bundle for AudioWorklet .toString() injection (Vite minify breaks it). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const src = path.join(root, 'node_modules/@grame/faustwasm/dist/esm-bundle/index.js');
const destDir = path.join(root, 'public/vendor');
const dest = path.join(destDir, 'faustwasm.js');

if (!fs.existsSync(src)) {
  console.error('Missing @grame/faustwasm esm-bundle — run npm ci');
  process.exit(1);
}

fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(src, dest);
console.log(`✅ Copied faustwasm vendor bundle (${(fs.statSync(dest).size / 1024).toFixed(0)} KB)`);
