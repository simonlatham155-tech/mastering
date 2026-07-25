#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FaustMonoOfflineProcessor,
  FaustMonoWebAudioDsp,
  FaustWasmInstantiator,
} from '../node_modules/@grame/faustwasm/dist/esm/index.js';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(scriptDir, '..');
const wasmPath = path.join(root, 'public/faust/compiled/limiter/dsp-module.wasm');
const metadataPath = path.join(root, 'public/faust/compiled/limiter/dsp-meta.json');
const sampleRate = 48_000;
const frameCount = 4_096;
const ceilingDB = -6;
const ceilingLinear = 10 ** (ceilingDB / 20);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const wasmBytes = fs.readFileSync(wasmPath);
const json = fs.readFileSync(metadataPath, 'utf8');
const metadata = JSON.parse(json);

assert(metadata.name === 'Latham Master Limiter', `Unexpected DSP name: ${metadata.name}`);
assert(metadata.inputs === 2 && metadata.outputs === 2, 'Limiter must be stereo in/stereo out');

const module = await WebAssembly.compile(wasmBytes);
const instance = FaustWasmInstantiator.createSyncMonoDSPInstance({ module, json });
const dsp = new FaustMonoWebAudioDsp(instance, sampleRate, 4, 128, {});
const processor = new FaustMonoOfflineProcessor(dsp, 128);

processor.setParamValue('/Limiter/Threshold', 0);
processor.setParamValue('/Limiter/Ratio', 1);
processor.setParamValue('/Limiter/Ceiling', ceilingDB);
processor.setParamValue('/Limiter/Mix', 1);

const left = new Float32Array(frameCount).fill(1);
const right = new Float32Array(frameCount).fill(0.25);
const output = processor.render([left, right], frameCount);
const leftPeak = Math.max(...output[0].map(Math.abs));
const rightPeak = Math.max(...output[1].map(Math.abs));
const stereoRatio = leftPeak / rightPeak;
const allowedCeiling = ceilingLinear * 10 ** (0.05 / 20);

assert(
  leftPeak <= allowedCeiling,
  `Ceiling exceeded tolerance: ${leftPeak.toFixed(6)} > ${allowedCeiling.toFixed(6)}`
);
assert(
  Math.abs(stereoRatio - 4) < 0.01,
  `Stereo link changed channel balance: ratio ${stereoRatio.toFixed(4)}`
);
assert(
  output[0].slice(0, 240).every((sample) => sample === 0),
  'Expected 5 ms look-ahead latency at 48 kHz'
);

console.log('Faust DSP verification passed');
console.log(`  Stereo I/O: ${metadata.inputs} → ${metadata.outputs}`);
console.log(`  Left peak: ${leftPeak.toFixed(6)} (${ceilingDB} dBFS target)`);
console.log(`  Stereo ratio: ${stereoRatio.toFixed(4)}:1`);
console.log('  Look-ahead: 240 samples (5 ms @ 48 kHz)');
