/**
 * True-peak limiter AudioWorklet factory (shared by realtime + offline render).
 */

import type { LimiterMeterData, LimiterMeterParams } from './oversampling-limiter-manager';

const moduleLoadedForContext = new WeakMap<BaseAudioContext, Promise<void>>();

export function limiterWorkletUrl(): string {
  const base = import.meta.env.BASE_URL || '/';
  return `${base}worklets/oversampling-limiter.js`;
}

export async function ensureLimiterWorkletModule(context: BaseAudioContext): Promise<void> {
  let loadPromise = moduleLoadedForContext.get(context);
  if (!loadPromise) {
    loadPromise = context.audioWorklet.addModule(limiterWorkletUrl()).then(() => undefined);
    moduleLoadedForContext.set(context, loadPromise);
  }
  await loadPromise;
}

export interface TruePeakLimiterOptions extends LimiterMeterParams {
  onMeterUpdate?: (data: LimiterMeterData) => void;
}

export async function createTruePeakLimiterNode(
  context: BaseAudioContext,
  options: TruePeakLimiterOptions
): Promise<AudioWorkletNode> {
  await ensureLimiterWorkletModule(context);

  const node = new AudioWorkletNode(context, 'oversampling-limiter', {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [2],
  });

  if (options.onMeterUpdate) {
    node.port.onmessage = (event) => {
      if (event.data?.type === 'meter-update') {
        options.onMeterUpdate!(event.data.data as LimiterMeterData);
      }
    };
  }

  applyTruePeakLimiterParams(node, {
    monitorOnly: false,
    hqMode: options.hqMode ?? true,
    ceiling: options.ceiling ?? -1.0,
    threshold: options.threshold ?? -3.0,
    attack: options.attack ?? 0.001,
    release: options.release ?? 0.1,
  });

  return node;
}

export function applyTruePeakLimiterParams(
  node: AudioWorkletNode,
  params: LimiterMeterParams
): void {
  node.port.postMessage({ type: 'setParameters', data: params });
}

export function disposeTruePeakLimiterNode(node: AudioWorkletNode | null): void {
  if (!node) return;
  node.port.onmessage = null;
  try {
    node.disconnect();
  } catch {
    /* ignore */
  }
}
