// Audio Analysis Utility for LATHAM AUDIO AI MASTERING SUITE
// ITU-R BS.1770-4 compliant LUFS measurement + FFT spectral analysis

import {
  measureBufferLoudness,
  resolveIntegratedLUFS,
  INPUT_ANALYSIS_MAX_SECONDS,
} from './measure-buffer-loudness';
import { analysisFeatureBuffer } from './analysis-buffer-slice';
import { analyzeFFTSpectralBalance } from './fft-spectral-balance';
import type { AudioAnalysis } from '../services/audio-processor';

export interface AudioAnalysisResult {
  lufs: number;
  truePeak: number;
  digitalPeakDB: number;
  dynamicRange: number;
  rms: number;
  spectralBalance: {
    bass: number;        // <200 Hz frequency-bin energy
    mids: number;        // 200 Hz–4 kHz frequency-bin energy
    highs: number;       // >4 kHz frequency-bin energy up to 20 kHz/Nyquist
  };
  suggestedGenre: string;
  isHeritage: boolean;
  tempo?: number;
}

interface AudioFeatures {
  dynamicRange: number;
  rms: number;
  spectralBalance: { bass: number; mids: number; highs: number };
  suggestedGenre: string;
  isHeritage: boolean;
  rmsFallbackLUFS: number;
  samplePeakDB: number;
}

/** Sync feature extraction (spectral, DR, genre) — no BS.1770 worklet. */
function analyzeAudioFeatures(audioBuffer: AudioBuffer): AudioFeatures {
  const featureBuffer = analysisFeatureBuffer(audioBuffer);
  const channelData = featureBuffer.getChannelData(0);
  const numSamples = channelData.length;

  let sumSquares = 0;
  let truePeak = 0;

  for (let i = 0; i < numSamples; i++) {
    const sample = channelData[i];
    sumSquares += sample * sample;
    truePeak = Math.max(truePeak, Math.abs(sample));
  }

  const rms = Math.sqrt(sumSquares / Math.max(1, numSamples));
  const rmsDb = 20 * Math.log10(Math.max(rms, 1e-12));
  const samplePeakDB = 20 * Math.log10(Math.max(truePeak, 1e-12));
  const rmsFallbackLUFS = -0.691 + 10 * Math.log10(Math.max(rms * rms, 1e-12));

  const dynamicRange = calculateDynamicRange(channelData);
  const spectralBalance = analyzeFFTSpectralBalance(featureBuffer).broad;
  const suggestedGenre = detectGenre(spectralBalance, dynamicRange);
  const isHeritage = dynamicRange > 12;

  return {
    dynamicRange,
    rms: rmsDb,
    spectralBalance,
    suggestedGenre,
    isHeritage,
    rmsFallbackLUFS,
    samplePeakDB,
  };
}

function featuresToResult(
  features: AudioFeatures,
  integratedLUFS: number,
  truePeakDBTP: number,
  digitalPeakDB: number
): AudioAnalysisResult {
  return {
    lufs: integratedLUFS,
    truePeak: truePeakDBTP,
    digitalPeakDB,
    dynamicRange: features.dynamicRange,
    rms: features.rms,
    spectralBalance: features.spectralBalance,
    suggestedGenre: features.suggestedGenre,
    isHeritage: features.isHeritage,
  };
}

export async function analyzeAudioBufferAsync(
  audioBuffer: AudioBuffer
): Promise<AudioAnalysisResult> {
  const features = analyzeAudioFeatures(audioBuffer);

  const loudness = await measureBufferLoudness(audioBuffer, {
    maxDurationSec: INPUT_ANALYSIS_MAX_SECONDS,
    renderTimeoutMs: 8_000,
    moduleLoadTimeoutMs: 15_000,
  });

  const integratedLUFS = resolveIntegratedLUFS(loudness, features.rmsFallbackLUFS);

  return featuresToResult(
    features,
    integratedLUFS,
    features.samplePeakDB + peaksApproxDB(features.samplePeakDB),
    features.samplePeakDB
  );
}

/** Mix-setup UI result from a single AudioProcessor analysis pass. */
export function buildInputAnalysisFromProcessor(
  audioBuffer: AudioBuffer,
  analysis: AudioAnalysis
): AudioAnalysisResult {
  const features = analyzeAudioFeatures(audioBuffer);
  return featuresToResult(
    features,
    analysis.lufs,
    analysis.truePeakDBTP,
    analysis.peakLevel
  );
}

/** @deprecated Prefer analyzeAudioBufferAsync for BS.1770 input LUFS. */
export function analyzeAudioBuffer(audioBuffer: AudioBuffer): AudioAnalysisResult {
  const features = analyzeAudioFeatures(audioBuffer);
  const simplifiedTruePeakDBTP =
    features.samplePeakDB + peaksApproxDB(features.samplePeakDB);

  return featuresToResult(
    features,
    features.rmsFallbackLUFS,
    simplifiedTruePeakDBTP,
    features.samplePeakDB
  );
}

function peaksApproxDB(samplePeakDB: number): number {
  if (samplePeakDB > -0.1) return 0.3;
  if (samplePeakDB > -3) return 0.15;
  return 0;
}

export async function analyzeAudioFile(file: File): Promise<AudioAnalysisResult> {
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

  try {
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    return analyzeAudioBufferAsync(audioBuffer);
  } finally {
    await audioContext.close();
  }
}

function calculateDynamicRange(samples: Float32Array): number {
  const windowSize = 4096;
  const numWindows = Math.floor(samples.length / windowSize);
  if (numWindows === 0) return 0;

  const peakValues: number[] = [];
  const rmsValues: number[] = [];

  for (let w = 0; w < numWindows; w++) {
    const start = w * windowSize;
    const end = start + windowSize;

    let peak = 0;
    let sumSquares = 0;

    for (let i = start; i < end; i++) {
      const absSample = Math.abs(samples[i]);
      peak = Math.max(peak, absSample);
      sumSquares += samples[i] * samples[i];
    }

    peakValues.push(peak);
    rmsValues.push(Math.sqrt(sumSquares / windowSize));
  }

  peakValues.sort((a, b) => b - a);
  rmsValues.sort((a, b) => b - a);

  const percentile20Index = Math.min(
    peakValues.length - 1,
    Math.floor(peakValues.length * 0.2)
  );
  const peak20 = Math.max(peakValues[percentile20Index], 1e-12);
  const rms20 = Math.max(rmsValues[percentile20Index], 1e-12);
  const dr = 20 * Math.log10(peak20 / rms20);

  return Number.isFinite(dr) ? Math.max(0, Math.min(20, dr)) : 0;
}

function detectGenre(
  spectral: { bass: number; mids: number; highs: number },
  dr: number
): string {
  if (dr > 12 && spectral.mids > 35) {
    return spectral.highs > 25 ? 'Jazz' : 'Classical';
  }
  if (dr > 14) return 'Cinematic';
  if (spectral.mids > 45 && spectral.bass < 25) return 'Podcast';

  if (spectral.bass > 50 && dr < 5) {
    return spectral.bass > 55 ? 'Hardcore' : 'Hardstyle';
  }
  if (spectral.bass > 45 && spectral.mids > 35 && dr < 7) return 'Dubstep';
  if (spectral.bass > 42 && spectral.highs > 25 && dr < 7) return 'Drum & Bass';
  if (spectral.bass > 40 && spectral.mids < 35 && dr < 9) return 'Trap';
  if (spectral.bass > 38 && spectral.highs > 30 && dr >= 7 && dr <= 10) return 'Future Bass';
  if (spectral.bass > 45 && spectral.highs < 20 && dr < 6) return 'Hard Techno';
  if (spectral.bass > 40 && spectral.highs < 25 && dr < 8) {
    return spectral.highs > 20 ? 'Melodic Techno' : 'Techno';
  }
  if (spectral.bass > 38 && spectral.highs > 28 && dr < 7) return 'Psytrance';

  if (
    spectral.highs > 30 &&
    spectral.bass >= 32 &&
    spectral.bass <= 40 &&
    dr >= 7 &&
    dr <= 10
  ) {
    return spectral.mids > 35 ? 'Uplifting Trance' : 'Progressive Trance';
  }

  if (spectral.bass > 38 && spectral.bass < 45 && spectral.mids < 32 && dr >= 9) {
    return 'Deep House';
  }
  if (spectral.bass >= 35 && spectral.bass < 42 && spectral.mids > 32 && dr >= 7 && dr <= 9) {
    return 'Tech House';
  }
  if (spectral.bass >= 35 && spectral.bass < 42 && spectral.highs > 25 && dr >= 8 && dr <= 11) {
    return 'Progressive House';
  }
  if (spectral.bass >= 32 && spectral.bass < 40 && dr >= 8 && dr <= 10) return 'House';
  if (spectral.bass >= 30 && spectral.bass < 38 && spectral.mids > 32 && dr >= 9) return 'UK Garage';
  if (spectral.mids > 35 && spectral.bass >= 32 && spectral.bass < 40 && dr >= 8 && dr <= 11) {
    return 'Breakbeat';
  }
  if (spectral.mids > 35 && spectral.bass < 35 && dr > 10) return 'R&B / Soul';
  if (spectral.mids > 35 && dr >= 8 && dr <= 12) return 'Rock';
  if (spectral.bass > 35 && dr < 9) return 'EDM';

  return 'Progressive House';
}
