/**
 * Transformer Stage (Neve 1073 / API 2500)
 * 
 * PURPOSE: Harmonic enhancement with frequency-dependent saturation
 * OUTPUT: UNITY GAIN (with auto-gain compensation)
 * 
 * ARCHITECTURE:
 * - Low-frequency emphasis (+1.5dB @ 200Hz)
 * - High-frequency roll-off (-0.8dB @ 12kHz)
 * - Asymmetric saturation (60% positive, 40% negative bias)
 * - Subtle even harmonics (0.02% below threshold, 0.08% above)
 * - Auto-gain compensation (prevents drive from becoming loudness knob)
 * 
 * PATTERN: Self-contained stage factory
 * - Returns: { input, output, params, setDrive }
 * - No internal makeup gain (compensation is negative trim)
 * - Quality controls oversampling only
 * - Genre multipliers baked into config
 */

import type { QualityMode } from '../quality-profiles';
import { transformerCompFromPreGainDB, dbToLinear, linearToDb, getCompProfile, smoothParam } from './stage-utils';

export type TransformerConfig = {
  baseDrive: number;          // 0..1 normalized (base saturation amount)
  genreMultiplier: number;    // Genre-specific character (0.8 - 1.5)
  saturationAmount: number;   // Genre saturation intensity (0.7 - 1.5)
};

export type TransformerStage = {
  input: AudioNode;
  output: AudioNode;
  params: {
    drive: AudioParam;  // Live-updateable drive (GainNode.gain)
    comp: AudioParam;   // Auto-gain compensation trim
  };
  setDrive: (ctx: BaseAudioContext, drive: number, satAmount: number, genreId: string) => void;
  dispose: () => void;
};

/**
 * Build Transformer stage with Neve 1073-style character
 * 
 * @param context - AudioContext or OfflineAudioContext
 * @param quality - 'draft' (none oversample) or 'export' (2x oversample)
 * @param config - Genre-specific transformer configuration
 */
export function buildTransformerStage(
  context: BaseAudioContext,
  quality: QualityMode,
  config: TransformerConfig
): TransformerStage {
  // === NODES ===
  const input = context.createGain();
  input.channelCountMode = 'max';
  input.channelInterpretation = 'speakers';
  
  const driveGain = context.createGain();
  
  // Low-frequency emphasis (transformer inductance)
  const lowShelf = context.createBiquadFilter();
  lowShelf.type = 'lowshelf';
  lowShelf.frequency.value = 200;
  lowShelf.gain.value = 1.5; // +1.5dB @ 200Hz (transformer bump)
  lowShelf.Q.value = 0.7;
  
  // High-frequency roll-off (transformer capacitance)
  const highShelf = context.createBiquadFilter();
  highShelf.type = 'highshelf';
  highShelf.frequency.value = 12000;
  highShelf.gain.value = -0.8; // -0.8dB @ 12kHz (natural transformer loss)
  highShelf.Q.value = 0.7;
  
  // Asymmetric transformer saturation
  const transformerSat = context.createWaveShaper();
  
  // DC blocker (prevents DC offset from waveshaper)
  const dcBlocker = context.createBiquadFilter();
  dcBlocker.type = 'highpass';
  dcBlocker.frequency.value = 5; // Block below 5Hz
  dcBlocker.Q.value = 0.7071; // Butterworth response
  
  // Auto-gain compensation (negative trim to prevent loudness increase)
  const compTrim = context.createGain();
  
  const output = context.createGain();
  output.channelCountMode = 'max';
  output.channelInterpretation = 'speakers';
  
  // === WAVESHAPER CURVE (Neve 1073 Asymmetric Saturation) ===
  const curve = new Float32Array(65536);
  
  for (let i = 0; i < 65536; i++) {
    const x = (i * 2 - 65536) / 65536;
    
    // Asymmetric saturation (60% positive, 40% negative bias)
    const asymmetry = 0.1;
    const biased = x + asymmetry * x * x;
    
    // Drive amount (subtle - character, not distortion)
    // PATCH v2: Was 0.15 (inaudible), then 0.8 (too hot). Now 0.4 (max 1.4x)
    const drive = 1.0 + config.saturationAmount * 0.4; // Max 1.4x drive
    const driven = biased * drive;
    const threshold = 0.5; // Only saturate peaks
    
    let saturated;
    let evenHarmonic;
    
    if (Math.abs(driven) < threshold) {
      // Below threshold: Clean with subtle even harmonics
      // Neve 1073 spec: 0.01% THD @ +4dBu (~1% even harmonics)
      saturated = driven;
      evenHarmonic = 0.02 * driven * Math.abs(driven); // Subtle warmth
    } else {
      // Above threshold: HARD transformer core saturation
      // Neve 1073 spec: 0.5% THD @ +20dBu (~5% even harmonics)
      const excess = Math.abs(driven) - threshold;
      const hardSat = threshold + Math.tanh(excess * 2) * 0.5;
      saturated = driven > 0 ? hardSat : -hardSat;
      
      // Strong even harmonics when saturated
      evenHarmonic = 0.08 * driven * Math.abs(driven); // Punchy character
    }
    
    curve[i] = saturated + evenHarmonic;
  }
  
  transformerSat.curve = curve;
  
  // === OVERSAMPLING (Quality-Dependent) ===
  // Oversampling prevents aliasing that destroys analogue emulation character
  // 4x export, 2x preview — keeps hardware emulation honest in both modes
  transformerSat.oversample = quality === 'export' ? '4x' : '2x';
  
  // === SIGNAL CHAIN (with compensation) ===
  input.connect(driveGain);
  driveGain.connect(lowShelf);
  lowShelf.connect(highShelf);
  highShelf.connect(transformerSat);
  transformerSat.connect(dcBlocker);
  dcBlocker.connect(compTrim);     // Compensation trim
  compTrim.connect(output);
  
  // === UNITY GAIN OUTPUT (Critical) ===
  // Base unity, compensation is negative trim
  output.gain.value = 1.0;
  compTrim.gain.value = 1.0; // Will be updated based on drive
  
  // === INITIAL DRIVE + COMPENSATION ===
  // Initial drive + preGain
  const initialDrive = config.baseDrive * config.genreMultiplier;
  const preGain = Math.max(0.1, 1.0 + initialDrive * 0.15); // PreGain multiplier (physical signal)
  
  // Apply preGain
  driveGain.gain.value = preGain;
  
  // Compensation from preGain dB (NEW)
  const preGainDB = linearToDb(preGain);
  
  const compProfile = getCompProfile('default');
  const compDB = transformerCompFromPreGainDB(preGainDB, config.saturationAmount);
  const scaledCompDB = compDB * compProfile.transformerCompScale;
  
  compTrim.gain.value = dbToLinear(scaledCompDB);
  
  console.log(`🎛️  Transformer: drive=${initialDrive.toFixed(2)}, preGain=${preGain.toFixed(3)}x (${preGainDB.toFixed(2)}dB), sat=${config.saturationAmount.toFixed(2)}, comp=${scaledCompDB.toFixed(2)}dB`);
  
  // === RETURN STAGE ===
  return {
    input,
    output,
    params: {
      drive: driveGain.gain, // Expose for live updates
      comp: compTrim.gain,   // Expose for live updates
    },
    setDrive(ctx: BaseAudioContext, drive: number, satAmount: number, genreId: string) {
      const compProfile = getCompProfile(genreId);
      
      // Compute physical preGain from control signal
      const preGain = Math.max(0.1, 1.0 + drive * 0.4);
      const preGainDB = linearToDb(preGain);
      
      // Compute compensation from physical signal
      const compDB = transformerCompFromPreGainDB(preGainDB, satAmount);
      const scaledCompDB = compDB * compProfile.transformerCompScale;
      
      // Smooth both preGain and compensation
      smoothParam(ctx, driveGain.gain, preGain, 0.05);
      smoothParam(ctx, compTrim.gain, dbToLinear(scaledCompDB), 0.05);
    },
    dispose: () => {
      try { input.disconnect(); } catch {}
      try { driveGain.disconnect(); } catch {}
      try { lowShelf.disconnect(); } catch {}
      try { highShelf.disconnect(); } catch {}
      try { transformerSat.disconnect(); } catch {}
      try { dcBlocker.disconnect(); } catch {}
      try { compTrim.disconnect(); } catch {}
      try { output.disconnect(); } catch {}
    },
  };
}

/**
 * Get genre-specific transformer configuration
 */
export function getTransformerConfig(genreId: string): TransformerConfig {
  switch (genreId) {
    case 'realprog':
      return {
        baseDrive: 0.8,
        genreMultiplier: 1.05,
        saturationAmount: 0.8, // Clean, emotional
      };
    case 'modernprog':
      return {
        baseDrive: 0.9,
        genreMultiplier: 1.12,
        saturationAmount: 1.1, // Aggressive, punchy
      };
    case 'trance':
      return {
        baseDrive: 0.85,
        genreMultiplier: 1.08,
        saturationAmount: 0.9, // Bright, clear
      };
    case 'house':
      return {
        baseDrive: 1.0,
        genreMultiplier: 1.0,
        saturationAmount: 1.0, // Balanced warmth
      };
    case 'techno':
      return {
        baseDrive: 1.1,
        genreMultiplier: 0.98,
        saturationAmount: 1.2, // Dark, heavy
      };
    case 'rnb':
      return {
        baseDrive: 0.7,
        genreMultiplier: 0.95,
        saturationAmount: 0.7, // Smooth, minimal
      };
    case 'tape':
      return {
        baseDrive: 1.2,
        genreMultiplier: 1.15,
        saturationAmount: 1.5, // Maximum vintage color
      };
    default:
      return {
        baseDrive: 1.0,
        genreMultiplier: 1.0,
        saturationAmount: 1.0,
      };
  }
}