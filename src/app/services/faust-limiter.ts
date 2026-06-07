/**
 * Precompiled Faust WASM true-peak limiter (export / offline render).
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

let factoryPromise: Promise<LooseFaustDspFactory> | null = null;

function faustLimiterBaseUrl(): string {
  const base = import.meta.env.BASE_URL || '/';
  return `${base}faust/compiled/limiter/`;
}

/** Warm WASM factory cache on app load (speeds first HQ play/export). */
export function preloadFaustLimiterFactory(): Promise<LooseFaustDspFactory> {
  return loadFaustLimiterFactory();
}

export async function loadFaustLimiterFactory(): Promise<LooseFaustDspFactory> {
  if (!factoryPromise) {
    factoryPromise = (async () => {
      const { FaustWasmInstantiator } = await import('@grame/faustwasm');
      const base = faustLimiterBaseUrl();
      return FaustWasmInstantiator.loadDSPFactory(
        `${base}dsp-module.wasm`,
        `${base}dsp-meta.json`
      );
    })();
  }
  return factoryPromise;
}

/** Reset cached factory (tests). */
export function resetFaustLimiterCache(): void {
  factoryPromise = null;
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
  const { FaustMonoDspGenerator } = await import('@grame/faustwasm');
  const factory = await loadFaustLimiterFactory();
  const generator = new FaustMonoDspGenerator();
  generator.factory = factory;

  const node = await generator.createNode(
    context,
    'Latham True Peak Limiter',
    factory,
    false,
    1024,
    'latham-faust-limiter'
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
