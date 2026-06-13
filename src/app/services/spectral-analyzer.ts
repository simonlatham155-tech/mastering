/**
 * SPECTRAL ANALYSIS ENGINE
 * FFT-based frequency profiling for reference matching
 * 
 * This service analyzes audio buffers and generates spectral profiles
 * that can be compared against reference curves for "AI mastering"
 */

import { analysisFeatureBuffer } from '../utils/analysis-buffer-slice';

export interface SpectralProfile {
  bands: {
    sub: number;        // 40Hz (20-60Hz average)
    low: number;        // 100Hz (60-150Hz average)
    lowMid: number;     // 250Hz (150-400Hz average)
    mid: number;        // 600Hz (400-800Hz average)
    upperMid: number;   // 1.2kHz (800-2kHz average)
    presence: number;   // 3kHz (2k-4kHz average)
    brilliance: number; // 6kHz (4k-8kHz average)
    air: number;        // 10kHz (8k-12kHz average)
    ultraHigh: number;  // 14kHz (12k-16kHz average)
    top: number;        // 18kHz (16k-20kHz average)
  };
  rmsLevel: number; // Overall RMS in dB
  peakLevel: number; // Peak level in dB
}

export interface MatchingDelta {
  bands: {
    sub: number;
    low: number;
    lowMid: number;
    mid: number;
    upperMid: number;
    presence: number;
    brilliance: number;
    air: number;
    ultraHigh: number;
    top: number;
  };
  autoGain: number; // Overall gain compensation in dB
}

export class SpectralAnalyzer {
  private audioContext: AudioContext;
  private fftSize: number = 8192; // High resolution for accuracy
  
  constructor(audioContext: AudioContext) {
    this.audioContext = audioContext;
  }
  
  /**
   * Analyze an audio buffer and generate spectral profile
   */
  async analyzeBuffer(buffer: AudioBuffer): Promise<SpectralProfile> {
    const featureBuffer = analysisFeatureBuffer(buffer);
    return this.analyzeBufferManually(featureBuffer);
  }
  
  /**
   * Manual FFT analysis of buffer
   * (In production, use a proper FFT library like fft.js or WASM implementation)
   */
  private analyzeBufferManually(buffer: AudioBuffer): SpectralProfile {
    // Long tracks: analyze only the first ~90s and cap windows so upload stays responsive.
    const maxAnalysisSeconds = 90;
    const maxSamples = Math.min(
      buffer.length,
      Math.floor(buffer.sampleRate * maxAnalysisSeconds)
    );
    const monoData = buffer.getChannelData(0).subarray(0, maxSamples);

    const windowSize = 8192;
    const hopSize = windowSize / 2;
    const maxWindows = 40;
    const numWindows = Math.min(
      Math.max(0, Math.floor((monoData.length - windowSize) / hopSize)),
      maxWindows
    );
    
    // Frequency bins (simplified, assumes 48kHz sample rate)
    const sampleRate = buffer.sampleRate;
    const binSize = sampleRate / windowSize;
    
    // Initialize band accumulators
    const bandAccumulators = {
      sub: 0,
      low: 0,
      lowMid: 0,
      mid: 0,
      upperMid: 0,
      presence: 0,
      brilliance: 0,
      air: 0,
      ultraHigh: 0,
      top: 0
    };
    
    if (numWindows === 0) {
      return {
        bands: {
          sub: -40,
          low: -40,
          lowMid: -40,
          mid: -40,
          upperMid: -40,
          presence: -40,
          brilliance: -40,
          air: -40,
          ultraHigh: -40,
          top: -40,
        },
        rmsLevel: -60,
        peakLevel: -60,
      };
    }

    for (let w = 0; w < numWindows; w++) {
      const offset = w * hopSize;
      const window = monoData.slice(offset, offset + windowSize);
      
      // Apply Hann window
      const windowed = this.applyHannWindow(window);
      
      // Compute magnitude spectrum (simplified - just use energy in bands)
      const bandEnergies = this.computeBandEnergies(windowed, sampleRate);
      
      // Accumulate
      bandAccumulators.sub += bandEnergies.sub;
      bandAccumulators.low += bandEnergies.low;
      bandAccumulators.lowMid += bandEnergies.lowMid;
      bandAccumulators.mid += bandEnergies.mid;
      bandAccumulators.upperMid += bandEnergies.upperMid;
      bandAccumulators.presence += bandEnergies.presence;
      bandAccumulators.brilliance += bandEnergies.brilliance;
      bandAccumulators.air += bandEnergies.air;
      bandAccumulators.ultraHigh += bandEnergies.ultraHigh;
      bandAccumulators.top += bandEnergies.top;
    }
    
    // Average and convert to dB
    const toBandDb = (energy: number) => {
      const avg = energy / numWindows;
      const db = 10 * Math.log10(Math.max(avg, 1e-10));
      return Number.isFinite(db) ? db : -40;
    };

    const bands = {
      sub: toBandDb(bandAccumulators.sub),
      low: toBandDb(bandAccumulators.low),
      lowMid: toBandDb(bandAccumulators.lowMid),
      mid: toBandDb(bandAccumulators.mid),
      upperMid: toBandDb(bandAccumulators.upperMid),
      presence: toBandDb(bandAccumulators.presence),
      brilliance: toBandDb(bandAccumulators.brilliance),
      air: toBandDb(bandAccumulators.air),
      ultraHigh: toBandDb(bandAccumulators.ultraHigh),
      top: toBandDb(bandAccumulators.top),
    };
    
    // Compute RMS and peak
    let sumSquares = 0;
    let peak = 0;
    
    for (let i = 0; i < monoData.length; i++) {
      const sample = monoData[i];
      sumSquares += sample * sample;
      peak = Math.max(peak, Math.abs(sample));
    }
    
    const rms = Math.sqrt(sumSquares / monoData.length);
    const rmsDB = 20 * Math.log10(rms + 1e-10);
    const peakDB = 20 * Math.log10(peak + 1e-10);
    
    return {
      bands,
      rmsLevel: rmsDB,
      peakLevel: peakDB
    };
  }
  
  /**
   * Compute energy in each frequency band
   */
  private computeBandEnergies(samples: Float32Array, sampleRate: number) {
    // Band definitions (Hz)
    const bands = [
      { name: 'sub', low: 20, high: 60 },
      { name: 'low', low: 60, high: 150 },
      { name: 'lowMid', low: 150, high: 400 },
      { name: 'mid', low: 400, high: 800 },
      { name: 'upperMid', low: 800, high: 2000 },
      { name: 'presence', low: 2000, high: 4000 },
      { name: 'brilliance', low: 4000, high: 8000 },
      { name: 'air', low: 8000, high: 12000 },
      { name: 'ultraHigh', low: 12000, high: 16000 },
      { name: 'top', low: 16000, high: 20000 }
    ];
    
    const energies: Record<string, number> = {};
    
    // Simple bandpass filtering and energy calculation
    bands.forEach(band => {
      const filtered = this.bandpassFilter(samples, band.low, band.high, sampleRate);
      let energy = 0;
      
      for (let i = 0; i < filtered.length; i++) {
        energy += filtered[i] * filtered[i];
      }
      
      energies[band.name] = energy / filtered.length;
    });
    
    return energies as any;
  }
  
  /**
   * Simple bandpass filter (butterworth 2nd order approximation)
   */
  private bandpassFilter(
    input: Float32Array,
    lowFreq: number,
    highFreq: number,
    sampleRate: number
  ): Float32Array {
    const output = new Float32Array(input.length);
    
    // Simplified digital filter (in production, use proper IIR coefficients)
    const lowCutoff = (2 * Math.PI * lowFreq) / sampleRate;
    const highCutoff = (2 * Math.PI * highFreq) / sampleRate;
    
    // Apply simple RC filter approximation
    let lowState = 0;
    let highState = 0;
    
    for (let i = 0; i < input.length; i++) {
      // High-pass
      const hp = input[i] - lowState;
      lowState += lowCutoff * hp;
      
      // Low-pass
      highState += highCutoff * (hp - highState);
      
      output[i] = highState;
    }
    
    return output;
  }
  
  /**
   * Apply Hann window function
   */
  private applyHannWindow(samples: Float32Array): Float32Array {
    const windowed = new Float32Array(samples.length);
    
    for (let i = 0; i < samples.length; i++) {
      const window = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (samples.length - 1)));
      windowed[i] = samples[i] * window;
    }
    
    return windowed;
  }
  
  /**
   * Convert buffer to mono
   */
  private convertToMono(buffer: AudioBuffer): AudioBuffer {
    if (buffer.numberOfChannels === 1) {
      return buffer;
    }
    
    const monoBuffer = this.audioContext.createBuffer(
      1,
      buffer.length,
      buffer.sampleRate
    );
    
    const monoData = monoBuffer.getChannelData(0);
    
    // Average all channels
    for (let i = 0; i < buffer.length; i++) {
      let sum = 0;
      for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
        sum += buffer.getChannelData(channel)[i];
      }
      monoData[i] = sum / buffer.numberOfChannels;
    }
    
    return monoBuffer;
  }
  
  /**
   * Get mono data from buffer
   */
  private getMonoData(buffer: AudioBuffer): Float32Array {
    if (buffer.numberOfChannels === 1) {
      return buffer.getChannelData(0);
    }
    
    const monoData = new Float32Array(buffer.length);
    
    for (let i = 0; i < buffer.length; i++) {
      let sum = 0;
      for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
        sum += buffer.getChannelData(channel)[i];
      }
      monoData[i] = sum / buffer.numberOfChannels;
    }
    
    return monoData;
  }
  
  /**
   * Compare spectral profile against reference curve
   * Returns the delta (correction needed) for each band
   */
  compareToReference(
    sourceProfile: SpectralProfile,
    referenceProfile: SpectralProfile
  ): MatchingDelta {
    // Calculate delta for each band
    const bands = {
      sub: referenceProfile.bands.sub - sourceProfile.bands.sub,
      low: referenceProfile.bands.low - sourceProfile.bands.low,
      lowMid: referenceProfile.bands.lowMid - sourceProfile.bands.lowMid,
      mid: referenceProfile.bands.mid - sourceProfile.bands.mid,
      upperMid: referenceProfile.bands.upperMid - sourceProfile.bands.upperMid,
      presence: referenceProfile.bands.presence - sourceProfile.bands.presence,
      brilliance: referenceProfile.bands.brilliance - sourceProfile.bands.brilliance,
      air: referenceProfile.bands.air - sourceProfile.bands.air,
      ultraHigh: referenceProfile.bands.ultraHigh - sourceProfile.bands.ultraHigh,
      top: referenceProfile.bands.top - sourceProfile.bands.top
    };
    
    // Calculate auto gain compensation
    // (Prevent overall level from changing too much)
    const totalBoost = Object.values(bands).reduce((sum, val) => sum + Math.max(0, val), 0);
    const autoGain = -totalBoost * 0.1; // Compensate 10% of total boost
    
    return {
      bands,
      autoGain: Math.max(-6, Math.min(6, autoGain)) // Limit to ±6dB
    };
  }
}
