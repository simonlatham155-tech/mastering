import type { LimiterMeterData } from '../services/oversampling-limiter-manager';

function workletUrl(): string {
  const base = import.meta.env.BASE_URL || '/';
  return `${base}worklets/oversampling-limiter.js`;
}

export interface TruePeakMeasurement {
  truePeakDBTP: number;
  digitalPeakDB: number;
  ispDifference: number;
  /** worklet = same path as live preview; linear = 4× interp fallback */
  source: 'worklet' | 'linear';
}

/**
 * ITU-style true peak via 4× linear interpolation (runs in Node + browser).
 */
export function measureTruePeakLinearDBTP(
  buffer: AudioBuffer,
  oversampleFactor = 4
): number {
  if (buffer.length === 0) return -60;

  let maxPeak = 0;

  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length - 1; i++) {
      for (let k = 0; k <= oversampleFactor; k++) {
        const frac = k / oversampleFactor;
        const sample = data[i] * (1 - frac) + data[i + 1] * frac;
        maxPeak = Math.max(maxPeak, Math.abs(sample));
      }
    }
    maxPeak = Math.max(maxPeak, Math.abs(data[data.length - 1]));
  }

  if (maxPeak <= 1e-12) return -60;
  return 20 * Math.log10(maxPeak);
}

async function measureBufferTruePeakWorklet(
  buffer: AudioBuffer,
  ceilingDBTP = -1.0
): Promise<TruePeakMeasurement> {
  const channels = Math.min(2, buffer.numberOfChannels);
  const sampleRate = buffer.sampleRate;
  const length = buffer.length;

  const offline = new OfflineAudioContext(channels, length, sampleRate);
  await offline.audioWorklet.addModule(workletUrl());

  let maxTruePeak = -Infinity;
  let maxDigital = -Infinity;

  const meter = new AudioWorkletNode(offline, 'oversampling-limiter', {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [channels],
  });

  meter.port.onmessage = (event) => {
    if (event.data?.type !== 'meter-update') return;
    const data = event.data.data as LimiterMeterData;
    if (Number.isFinite(data.truePeakDBTP)) {
      maxTruePeak = Math.max(maxTruePeak, data.truePeakDBTP);
    }
    if (Number.isFinite(data.digitalPeakDB)) {
      maxDigital = Math.max(maxDigital, data.digitalPeakDB);
    }
  };

  meter.port.postMessage({
    type: 'setParameters',
    data: { monitorOnly: true, hqMode: true, ceiling: ceilingDBTP, threshold: ceilingDBTP - 3 },
  });

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
  await new Promise((r) => setTimeout(r, 0));

  meter.disconnect();
  source.disconnect();

  const digitalPeakDB =
    maxDigital !== -Infinity ? maxDigital : measureSamplePeakDBFS(buffer);
  const truePeakDBTP =
    maxTruePeak !== -Infinity ? maxTruePeak : measureTruePeakLinearDBTP(buffer);

  return {
    truePeakDBTP,
    digitalPeakDB,
    ispDifference: truePeakDBTP - digitalPeakDB,
    source: 'worklet',
  };
}

/** Sample-peak dBFS on buffer (fast export sanity check). */
export function measureSamplePeakDBFS(buffer: AudioBuffer): number {
  let peak = 0;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      peak = Math.max(peak, Math.abs(data[i]));
    }
  }
  if (peak <= 1e-12) return -60;
  return 20 * Math.log10(peak);
}

/**
 * True peak + digital peak for export QA.
 * Prefers oversampling worklet (live parity); falls back to linear 4× interp.
 */
export async function measureBufferTruePeak(
  buffer: AudioBuffer,
  ceilingDBTP = -1.0
): Promise<TruePeakMeasurement> {
  if (typeof OfflineAudioContext === 'undefined') {
    const digitalPeakDB = measureSamplePeakDBFS(buffer);
    const truePeakDBTP = measureTruePeakLinearDBTP(buffer);
    return {
      truePeakDBTP,
      digitalPeakDB,
      ispDifference: truePeakDBTP - digitalPeakDB,
      source: 'linear',
    };
  }

  try {
    return await measureBufferTruePeakWorklet(buffer, ceilingDBTP);
  } catch (err) {
    console.warn('True-peak worklet measure failed, using linear fallback:', err);
    const digitalPeakDB = measureSamplePeakDBFS(buffer);
    const truePeakDBTP = measureTruePeakLinearDBTP(buffer);
    return {
      truePeakDBTP,
      digitalPeakDB,
      ispDifference: truePeakDBTP - digitalPeakDB,
      source: 'linear',
    };
  }
}
