#!/usr/bin/env node
/**
 * Compile Faust .dsp sources to WebAssembly using @grame/faustwasm.
 * Outputs land in public/faust/compiled/<name>/ for browser fetch.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const faust2wasm = path.join(root, 'node_modules/@grame/faustwasm/scripts/faust2wasm.js');

const targets = [
  { dsp: path.join(root, 'src/dsp/limiter-v2.dsp'), out: path.join(root, 'public/faust/compiled/limiter') },
];

function compileTarget({ dsp, out }) {
  fs.mkdirSync(out, { recursive: true });
  console.log(`\n🔧 Faust: ${path.relative(root, dsp)} → ${path.relative(root, out)}`);
  const result = spawnSync(
    process.execPath,
    [faust2wasm, dsp, out, '-no-template'],
    { stdio: 'inherit', cwd: root }
  );
  if (result.status !== 0) {
    throw new Error(`Faust compile failed for ${dsp}`);
  }
  const wasm = path.join(out, 'dsp-module.wasm');
  const meta = path.join(out, 'dsp-meta.json');
  if (!fs.existsSync(wasm) || !fs.existsSync(meta)) {
    throw new Error(`Missing wasm output for ${dsp}`);
  }
  console.log(`   ✅ ${path.basename(wasm)} (${fs.statSync(wasm).size} bytes)`);
}

console.log('Building Faust DSP → WASM…');
for (const target of targets) {
  compileTarget(target);
}
console.log('\n✅ Faust WASM build complete');
