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
  /** Cap offline render length (upload path). Default: full buffer. */
  maxDurationSec?: number;
  /** Abort offline render and fall back to RMS if exceeded. */
  renderTimeoutMs?: number;
  /** Abort worklet module load if exceeded. */
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

/** Offline loudness result — includes peak momentary over the full buffer. */
export interface BufferLoudnessResult extends LufsMeterData {
  maxMomentary: number;
}

const EMPTY_BUFFER_LUFS: BufferLoudnessResult = {
  ...EMPTY_LUFS,
  maxMomentary: -Infinity,
};

/**
 * Measure integrated / momentary LUFS on a rendered AudioBuffer using the same
 * BS.1770 worklet as live playback (parity guaranteed).
 */
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
    await ensureLufsMeterWorkletModule(offline, {
      moduleLoadTimeoutMs,
      retries: 1,
    });
  } catch (err) {
    console.warn('LUFS worklet unavailable for offline measure (using RMS estimate):', err);
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
    await Promise.race([
      offline.startRendering(),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('LUFS offline render timeout')), renderTimeoutMs);
      }),
    ]);
  } catch (err) {
    console.warn('LUFS offline measure failed:', err);
    meter.disconnect();
    source.disconnect();
    return { ...EMPTY_BUFFER_LUFS };
  }

  // Allow final port message to arrive
  await new Promise((r) => setTimeout(r, 0));

  meter.disconnect();
  source.disconnect();

  return {
    ...latest,
    maxMomentary: maxMomentary !== -Infinity ? maxMomentary : latest.momentary,
  };
}

/** Resolve integrated LUFS with RMS fallback when the worklet is unavailable. */
export function resolveIntegratedLUFS(
  loudness: BufferLoudnessResult,
  rmsFallbackLUFS: number
): number {
  if (Number.isFinite(loudness.integrated) && loudness.integrated !== -Infinity) {
    return loudness.integrated;
  }
  return rmsFallbackLUFS;
}

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
  };
}
