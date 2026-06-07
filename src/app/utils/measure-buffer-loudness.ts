import type { LufsMeterData } from '../services/lufs-meter-manager';
import {
  measureBufferTruePeak,
  measureSamplePeakDBFS,
  type TruePeakMeasurement,
} from './measure-buffer-true-peak';

export { measureSamplePeakDBFS, measureTruePeakLinearDBTP, measureBufferTruePeak };
export type { TruePeakMeasurement };

const EMPTY_LUFS: LufsMeterData = {
  momentary: -Infinity,
  shortTerm: -Infinity,
  integrated: -Infinity,
  totalBlocks: 0,
};

function workletUrl(): string {
  const base = import.meta.env.BASE_URL || '/';
  return `${base}worklets/lufs-metering-processor.js`;
}

/**
 * Measure integrated / momentary LUFS on a rendered AudioBuffer using the same
 * BS.1770 worklet as live playback (parity guaranteed).
 */
export async function measureBufferLoudness(buffer: AudioBuffer): Promise<LufsMeterData> {
  if (buffer.length === 0) return { ...EMPTY_LUFS };

  const channels = Math.min(2, buffer.numberOfChannels);
  const sampleRate = buffer.sampleRate;
  const length = buffer.length;

  const offline = new OfflineAudioContext(channels, length, sampleRate);

  try {
    await offline.audioWorklet.addModule(workletUrl());
  } catch (err) {
    console.warn('LUFS worklet unavailable for offline measure:', err);
    return { ...EMPTY_LUFS };
  }

  let latest: LufsMeterData = { ...EMPTY_LUFS };

  const meter = new AudioWorkletNode(offline, 'lufs-metering-processor', {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [channels],
  });

  meter.port.onmessage = (event) => {
    if (event.data?.type === 'lufs-update') {
      latest = event.data.data as LufsMeterData;
    }
  };

  meter.port.postMessage({ type: 'reset' });

  const measureBuffer = offline.createBuffer(channels, length, sampleRate);
  if (buffer.numberOfChannels === 1) {
    const mono = buffer.getChannelData(0);
    measureBuffer.copyToChannel(mono, 0);
    if (channels > 1) measureBuffer.copyToChannel(mono, 1);
  } else {
    measureBuffer.copyToChannel(buffer.getChannelData(0), 0);
    if (channels > 1) measureBuffer.copyToChannel(buffer.getChannelData(1), 1);
  }

  const source = offline.createBufferSource();
  source.buffer = measureBuffer;
  source.connect(meter);
  meter.connect(offline.destination);
  source.start(0);

  await offline.startRendering();

  // Allow final port message to arrive
  await new Promise((r) => setTimeout(r, 0));

  meter.disconnect();
  source.disconnect();

  return latest;
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
