// Audio Analysis Utility for LATHAM AUDIO AI MASTERING SUITE
// ITU-R BS.1770-4 compliant LUFS measurement + spectral analysis

import {
  measureBufferLoudness,
  resolveIntegratedLUFS,
  INPUT_ANALYSIS_MAX_SECONDS,
} from './measure-buffer-loudness';
import { measureTruePeakLinearDBTP, measureSamplePeakDBFS } from './measure-buffer-true-peak';
import type { AudioAnalysis } from '../services/audio-processor';

export interface AudioAnalysisResult {
  lufs: number;          // Integrated LUFS (BS.1770 when async path used)
  truePeak: number;      // True peak in dBTP
  digitalPeakDB: number; // Sample peak in dBFS
  dynamicRange: number;  // DR value (crest factor based)
  rms: number;           // RMS level in dB
  spectralBalance: {
    bass: number;        // <200Hz energy
    mids: number;        // 200Hz-4kHz energy
    highs: number;       // >4kHz energy
  };
  suggestedGenre: string; // Auto-detected genre based on spectral content
  isHeritage: boolean;    // True if DR > 12dB (high dynamic range)
  tempo?: number;          // BPM detection (optional)
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
  const channelData = audioBuffer.getChannelData(0);
  const numSamples = channelData.length;

  let sumSquares = 0;
  let truePeak = 0;

  for (let i = 0; i < numSamples; i++) {
    const sample = channelData[i];
    sumSquares += sample * sample;
    truePeak = Math.max(truePeak, Math.abs(sample));
  }

  const rms = Math.sqrt(sumSquares / numSamples);
  const rmsDb = 20 * Math.log10(Math.max(rms, 1e-12));
  const samplePeakDB = 20 * Math.log10(Math.max(truePeak, 1e-12));
  const rmsFallbackLUFS = -0.691 + 10 * Math.log10(rms * rms);

  const dynamicRange = calculateDynamicRange(channelData);
  const spectralBalance = analyzeSpectralContent(audioBuffer);
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

/**
 * Analyze an already-decoded buffer with BS.1770 integrated LUFS and true peak.
 * Preferred path for upload / mix setup.
 */
export async function analyzeAudioBufferAsync(
  audioBuffer: AudioBuffer
): Promise<AudioAnalysisResult> {
  const features = analyzeAudioFeatures(audioBuffer);

  const loudness = await measureBufferLoudness(audioBuffer, {
    maxDurationSec: INPUT_ANALYSIS_MAX_SECONDS,
  });

  const integratedLUFS = resolveIntegratedLUFS(loudness, features.rmsFallbackLUFS);
  const digitalPeakDB = measureSamplePeakDBFS(audioBuffer);
  const truePeakDBTP = measureTruePeakLinearDBTP(audioBuffer);

  return featuresToResult(features, integratedLUFS, truePeakDBTP, digitalPeakDB);
}

/** Mix-setup UI result from a single AudioProcessor analysis pass (no duplicate worklet renders). */
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

/** Rough ISP headroom estimate when worklet is unavailable (sync path only). */
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

  const peakValues: number[] = [];
  const rmsValues: number[] = [];

  for (let w = 0; w < numWindows; w++) {
    const start = w * windowSize;
    const end = start + windowSize;

    let peak = 0;
    let sumSquares = 0;

    for (let i = start; i < end; i++) {
      const sample = Math.abs(samples[i]);
      peak = Math.max(peak, sample);
      sumSquares += samples[i] * samples[i];
    }

    peakValues.push(peak);
    rmsValues.push(Math.sqrt(sumSquares / windowSize));
  }

  peakValues.sort((a, b) => b - a);
  rmsValues.sort((a, b) => b - a);

  const percentile20Index = Math.floor(peakValues.length * 0.2);
  const peak20 = peakValues[percentile20Index];
  const rms20 = rmsValues[percentile20Index];

  const dr = 20 * Math.log10(peak20 / rms20);

  return Math.max(0, Math.min(20, dr));
}

function analyzeSpectralContent(audioBuffer: AudioBuffer): { bass: number; mids: number; highs: number } {
  const channelData = audioBuffer.getChannelData(0);
  const segmentSize = 4096;
  const numSegments = Math.floor(channelData.length / segmentSize);

  let bassEnergy = 0;
  let midsEnergy = 0;
  let highsEnergy = 0;

  for (let s = 0; s < Math.min(numSegments, 10); s++) {
    const start = s * segmentSize;

    let lowFreqEnergy = 0;
    for (let i = start; i < start + segmentSize / 4; i += 8) {
      lowFreqEnergy += Math.abs(channelData[i]);
    }

    let midFreqEnergy = 0;
    for (let i = start; i < start + segmentSize / 2; i += 4) {
      midFreqEnergy += Math.abs(channelData[i]);
    }

    let highFreqEnergy = 0;
    for (let i = start; i < start + segmentSize - 1; i++) {
      highFreqEnergy += Math.abs(channelData[i + 1] - channelData[i]);
    }

    bassEnergy += lowFreqEnergy;
    midsEnergy += midFreqEnergy;
    highsEnergy += highFreqEnergy;
  }

  const total = bassEnergy + midsEnergy + highsEnergy;

  return {
    bass: (bassEnergy / total) * 100,
    mids: (midsEnergy / total) * 100,
    highs: (highsEnergy / total) * 100,
  };
}

function detectGenre(spectral: { bass: number; mids: number; highs: number }, dr: number): string {
  if (dr > 12 && spectral.mids > 35) {
    return spectral.highs > 25 ? 'Jazz' : 'Classical';
  }

  if (dr > 14) {
    return 'Cinematic';
  }

  if (spectral.mids > 45 && spectral.bass < 25) {
    return 'Podcast';
  }

  if (spectral.bass > 50 && dr < 5) {
    return spectral.bass > 55 ? 'Hardcore' : 'Hardstyle';
  }

  if (spectral.bass > 45 && spectral.mids > 35 && dr < 7) {
    return 'Dubstep';
  }

  if (spectral.bass > 42 && spectral.highs > 25 && dr < 7) {
    return 'Drum & Bass';
  }

  if (spectral.bass > 40 && spectral.mids < 35 && dr < 9) {
    return 'Trap';
  }

  if (spectral.bass > 38 && spectral.highs > 30 && dr >= 7 && dr <= 10) {
    return 'Future Bass';
  }

  if (spectral.bass > 45 && spectral.highs < 20 && dr < 6) {
    return 'Hard Techno';
  }

  if (spectral.bass > 40 && spectral.highs < 25 && dr < 8) {
    return spectral.highs > 20 ? 'Melodic Techno' : 'Techno';
  }

  if (spectral.bass > 38 && spectral.highs > 28 && dr < 7) {
    return 'Psytrance';
  }

  if (spectral.highs > 30 && spectral.bass >= 32 && spectral.bass <= 40 && dr >= 7 && dr <= 10) {
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

  if (spectral.bass >= 32 && spectral.bass < 40 && dr >= 8 && dr <= 10) {
    return 'House';
  }

  if (spectral.bass >= 30 && spectral.bass < 38 && spectral.mids > 32 && dr >= 9) {
    return 'UK Garage';
  }

  if (spectral.mids > 35 && spectral.bass >= 32 && spectral.bass < 40 && dr >= 8 && dr <= 11) {
    return 'Breakbeat';
  }

  if (spectral.mids > 35 && spectral.bass < 35 && dr > 10) {
    return 'R&B / Soul';
  }

  if (spectral.mids > 35 && dr >= 8 && dr <= 12) {
    return 'Rock';
  }

  if (spectral.bass > 35 && dr < 9) {
    return 'EDM';
  }

  return 'Progressive House';
}
