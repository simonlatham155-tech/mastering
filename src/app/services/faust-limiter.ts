/**
 * Precompiled Faust WASM true-peak limiter (export / offline render).
 *
 * Runtime loads the unminified @grame/faustwasm esm-bundle from /vendor/faustwasm.js.
 * Vite production minification breaks Faust's AudioWorklet injection (.toString() → "V is not defined").
 */

import type { IFaustMonoWebAudioNode, LooseFaustDspFactory } from '@grame/faustwasm';

export interface FaustLimiterParams {
  thresholdDB: number;
  ratio: number;
  attackSec: number;
  releaseSec: number;
  ceilingDBTP: number;
  mix?: number;
}

type FaustWasmRuntime = {
  FaustWasmInstantiator: typeof import('@grame/faustwasm').FaustWasmInstantiator;
  FaustMonoDspGenerator: typeof import('@grame/faustwasm').FaustMonoDspGenerator;
};

let factoryPromise: Promise<LooseFaustDspFactory> | null = null;
let runtimePromise: Promise<FaustWasmRuntime> | null = null;

function faustLimiterBaseUrl(): string {
  const base = import.meta.env.BASE_URL || '/';
  return `${base}faust/compiled/limiter/`;
}

/** Absolute module URL — required for dynamic import on GitHub Pages subpaths. */
export function faustVendorModuleUrl(): string {
  const path = `${import.meta.env.BASE_URL || '/'}vendor/faustwasm.js`.replace(
    /([^:]\/)\/+/g,
    '$1'
  );
  if (typeof window !== 'undefined') {
    return new URL(path, window.location.href).href;
  }
  return path;
}

async function loadFaustRuntime(): Promise<FaustWasmRuntime> {
  if (!runtimePromise) {
    runtimePromise = (async () => {
      const url = faustVendorModuleUrl();
      try {
        const mod = (await import(/* @vite-ignore */ url)) as FaustWasmRuntime;
        if (!mod.FaustWasmInstantiator || !mod.FaustMonoDspGenerator) {
          throw new Error('Faust vendor bundle missing exports');
        }
        return mod;
      } catch (err) {
        runtimePromise = null;
        console.error(`[Faust] Vendor runtime failed to load from ${url}`, err);
        throw err;
      }
    })();
  }
  return runtimePromise;
}

/** Warm WASM factory cache on app load (speeds first HQ play/export). */
export function preloadFaustLimiterFactory(): Promise<LooseFaustDspFactory> {
  return loadFaustLimiterFactory();
}

export async function loadFaustLimiterFactory(): Promise<LooseFaustDspFactory> {
  if (!factoryPromise) {
    factoryPromise = (async () => {
      try {
        const { FaustWasmInstantiator } = await loadFaustRuntime();
        const base = faustLimiterBaseUrl();
        return FaustWasmInstantiator.loadDSPFactory(
          `${base}dsp-module.wasm`,
          `${base}dsp-meta.json`
        );
      } catch (err) {
        factoryPromise = null;
        throw err;
      }
    })();
  }
  return factoryPromise;
}

/** Reset cached factory (tests). */
export function resetFaustLimiterCache(): void {
  factoryPromise = null;
  runtimePromise = null;
}

export function applyFaustLimiterParams(
  node: IFaustMonoWebAudioNode,
  params: FaustLimiterParams
): void {
  node.setParamValue('/Limiter/Threshold', params.thresholdDB);
  node.setParamValue('/Limiter/Ratio', params.ratio);
  node.setParamValue('/Limiter/Attack', params.attackSec * 1000);
  node.setParamValue('/Limiter/Release', params.releaseSec * 1000);
  node.setParamValue('/Limiter/Ceiling', params.ceilingDBTP);
  node.setParamValue('/Limiter/Mix', params.mix ?? 1);
}

export async function createFaustLimiterNode(
  context: BaseAudioContext,
  params: FaustLimiterParams
): Promise<IFaustMonoWebAudioNode> {
  const { FaustMonoDspGenerator } = await loadFaustRuntime();
  const factory = await loadFaustLimiterFactory();
  const generator = new FaustMonoDspGenerator();
  generator.factory = factory;

  // OfflineAudioContext: ScriptProcessor avoids AudioWorklet registration failures.
  const offline =
    typeof OfflineAudioContext !== 'undefined' &&
    context instanceof OfflineAudioContext;
  const processorName = offline
    ? 'latham-faust-limiter-offline'
    : 'latham-faust-limiter';

  const node = await generator.createNode(
    context,
    'Latham True Peak Limiter',
    factory,
    offline,
    1024,
    processorName
  );

  if (!node) {
    throw new Error('Faust limiter node creation failed');
  }

  applyFaustLimiterParams(node, params);
  node.start();
  return node;
}

export function disposeFaustLimiterNode(node: IFaustMonoWebAudioNode | null): void {
  if (!node) return;
  try {
    node.stop();
    node.destroy();
  } catch {
    /* ignore */
  }
  try {
    node.disconnect();
  } catch {
    /* ignore */
  }
}
