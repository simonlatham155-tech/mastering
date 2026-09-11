import type { LufsMeterData } from '../services/lufs-meter-manager';
import {
  ensureLufsMeterWorkletModule,
  preloadLufsMeterWorkletScript,
} from '../services/lufs-meter-worklet';
import {
  measureBufferTruePeak,
  measureSamplePeakDBFS,
  type TruePeakMeasurement,
} from './measure-buffer-true-peak';
import { INPUT_ANALYSIS_MAX_SECONDS, sliceBufferHead } from './analysis-buffer-slice';

export { measureSamplePeakDBFS, measureBufferTruePeak };
export type { TruePeakMeasurement };
export { INPUT_ANALYSIS_MAX_SECONDS, sliceBufferHead };
export { preloadLufsMeterWorkletScript };

export interface MeasureBufferLoudnessOptions {
  maxDurationSec?: number;
  renderTimeoutMs?: number;
  moduleLoadTimeoutMs?: number;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms);
    }),
  ]);
}

const EMPTY_LUFS: LufsMeterData = {
  momentary: -Infinity,
  shortTerm: -Infinity,
  integrated: -Infinity,
  totalBlocks: 0,
};

export interface BufferLoudnessResult extends LufsMeterData {
  maxMomentary: number;
}

const EMPTY_BUFFER_LUFS: BufferLoudnessResult = {
  ...EMPTY_LUFS,
  maxMomentary: -Infinity,
};

export async function measureBufferLoudness(
  buffer: AudioBuffer,
  options: MeasureBufferLoudnessOptions = {}
): Promise<BufferLoudnessResult> {
  if (buffer.length === 0) return { ...EMPTY_BUFFER_LUFS };

  const measureTarget =
    options.maxDurationSec != null
      ? sliceBufferHead(buffer, options.maxDurationSec)
      : buffer;

  const channels = Math.min(2, measureTarget.numberOfChannels);
  const sampleRate = measureTarget.sampleRate;
  const length = measureTarget.length;

  const offline = new OfflineAudioContext(channels, length, sampleRate);
  const renderTimeoutMs = options.renderTimeoutMs ?? 30_000;
  const moduleLoadTimeoutMs = options.moduleLoadTimeoutMs ?? 15_000;

  try {
    await withTimeout(
      ensureLufsMeterWorkletModule(offline, {
        moduleLoadTimeoutMs,
        retries: 1,
      }),
      moduleLoadTimeoutMs + 1000,
      'LUFS worklet module load'
    );
  } catch (err) {
    console.warn('LUFS worklet unavailable for offline measure:', err);
    return { ...EMPTY_BUFFER_LUFS };
  }

  let latest: LufsMeterData = { ...EMPTY_LUFS };
  let maxMomentary = -Infinity;

  const meter = new AudioWorkletNode(offline, 'lufs-metering-processor', {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [channels],
  });

  meter.port.onmessage = (event) => {
    if (event.data?.type === 'lufs-update') {
      latest = event.data.data as LufsMeterData;
      if (Number.isFinite(latest.momentary)) {
        maxMomentary = Math.max(maxMomentary, latest.momentary);
      }
    }
  };

  meter.port.postMessage({ type: 'reset' });

  const measureBuffer = offline.createBuffer(channels, length, sampleRate);
  if (measureTarget.numberOfChannels === 1) {
    const mono = measureTarget.getChannelData(0);
    measureBuffer.copyToChannel(mono, 0);
    if (channels > 1) measureBuffer.copyToChannel(mono, 1);
  } else {
    measureBuffer.copyToChannel(measureTarget.getChannelData(0), 0);
    if (channels > 1) measureBuffer.copyToChannel(measureTarget.getChannelData(1), 1);
  }

  const source = offline.createBufferSource();
  source.buffer = measureBuffer;
  source.connect(meter);
  meter.connect(offline.destination);
  source.start(0);

  try {
    await withTimeout(offline.startRendering(), renderTimeoutMs, 'LUFS offline render');
  } catch (err) {
    console.warn('LUFS offline measure failed:', err);
    meter.disconnect();
    source.disconnect();
    return { ...EMPTY_BUFFER_LUFS };
  }

  await new Promise((r) => setTimeout(r, 0));

  meter.disconnect();
  source.disconnect();

  return {
    ...latest,
    maxMomentary: maxMomentary !== -Infinity ? maxMomentary : latest.momentary,
  };
}

export function resolveIntegratedLUFS(
  loudness: BufferLoudnessResult,
  rmsFallbackLUFS: number
): number {
  if (Number.isFinite(loudness.integrated) && loudness.integrated !== -Infinity) {
    return loudness.integrated;
  }
  return rmsFallbackLUFS;
}

export type DeliveryQualityStatus =
  | 'pass'
  | 'loudness-limited'
  | 'peak-fail'
  | 'measurement-fail';

export interface ExportQualityReport {
  integratedLUFS: number;
  momentaryLUFS: number;
  shortTermLUFS: number;
  samplePeakDBFS: number;
  truePeakDBTP: number;
  digitalPeakDB: number;
  ispDifference: number;
  truePeakSource: 'worklet' | 'linear';
  targetLUFS: number;
  ceilingDBTP: number;
  lufsDelta: number;
  onTarget: boolean;
  peakOk: boolean;
  deliveryStatus: DeliveryQualityStatus;
  deliveryMessage: string;
}

function deliveryStatusFor(
  integratedLUFS: number,
  targetLUFS: number,
  truePeakDBTP: number,
  ceilingDBTP: number,
  toleranceLU: number
): { status: DeliveryQualityStatus; message: string } {
  if (!Number.isFinite(integratedLUFS) || integratedLUFS === -Infinity) {
    return {
      status: 'measurement-fail',
      message: 'Loudness measurement was unavailable; do not treat this export as delivery-verified.',
    };
  }

  if (truePeakDBTP > ceilingDBTP + 0.05) {
    return {
      status: 'peak-fail',
      message: `True peak ${truePeakDBTP.toFixed(1)} dBTP exceeds the ${ceilingDBTP.toFixed(1)} dBTP ceiling.`,
    };
  }

  const delta = integratedLUFS - targetLUFS;
  if (Math.abs(delta) <= toleranceLU) {
    return {
      status: 'pass',
      message: `Delivery verified at ${integratedLUFS.toFixed(1)} LUFS / ${truePeakDBTP.toFixed(1)} dBTP.`,
    };
  }

  const direction = delta < 0 ? 'below' : 'above';
  return {
    status: 'loudness-limited',
    message: `Best verified result is ${integratedLUFS.toFixed(1)} LUFS, ${Math.abs(delta).toFixed(1)} LU ${direction} the requested target, while respecting the true-peak ceiling.`,
  };
}

export function buildExportQualityReport(
  lufs: LufsMeterData,
  peaks: TruePeakMeasurement,
  targetLUFS: number,
  ceilingDBTP: number,
  toleranceLU = 0.5
): ExportQualityReport {
  const integratedLUFS = Number.isFinite(lufs.integrated) ? lufs.integrated : -Infinity;
  const lufsDelta =
    integratedLUFS === -Infinity ? NaN : integratedLUFS - targetLUFS;

  const truePeakDBTP = peaks.truePeakDBTP;
  const digitalPeakDB = peaks.digitalPeakDB;
  const delivery = deliveryStatusFor(
    integratedLUFS,
    targetLUFS,
    truePeakDBTP,
    ceilingDBTP,
    toleranceLU
  );

  return {
    integratedLUFS,
    momentaryLUFS: lufs.momentary,
    shortTermLUFS: lufs.shortTerm,
    samplePeakDBFS: digitalPeakDB,
    truePeakDBTP,
    digitalPeakDB,
    ispDifference: peaks.ispDifference,
    truePeakSource: peaks.source,
    targetLUFS,
    ceilingDBTP,
    lufsDelta,
    onTarget:
      integratedLUFS !== -Infinity &&
      Math.abs(integratedLUFS - targetLUFS) <= toleranceLU,
    peakOk: truePeakDBTP <= ceilingDBTP + 0.05,
    deliveryStatus: delivery.status,
    deliveryMessage: delivery.message,
  };
}
