/**
 * Tape Saturation Stage (Studer A800 / Ampex ATR-102)
 * 
 * PURPOSE: Magnetic hysteresis modeling with harmonic coloration
 * OUTPUT: UNITY GAIN (with auto-gain compensation)
 * 
 * ARCHITECTURE:
 * - Tape head bump (subtle bass resonance @ 40-80Hz)
 * - Bias control (high-frequency response)
 * - Tape compression (soft limiting, -6dB threshold)
 * - Hysteresis saturation (arctangent + tanh blend)
 * - Tape harmonics: 3rd (1.5%), 5th (0.8%), 7th (0.3%)
 * - Auto-gain compensation (prevents drive from becoming loudness knob)
 * 
 * PATTERN: Self-contained stage factory
 * - Returns: { input, output, params, setDrive }
 * - No internal makeup gain (compensation is negative trim)
 * - Quality controls oversampling only
 * - Genre multipliers baked into config
 */

import type { QualityMode } from '../quality-profiles';
import { tapeCompFromPreGainDB, dbToLinear, linearToDb, getCompProfile, smoothParam } from './stage-utils';

export type TapeConfig = {
  baseDrive: number;      // 0..1 normalized (base saturation amount)
  genreMultiplier: number; // Genre-specific character (0.7 - 1.2)
  biasAmount: number;     // Tape bias (0.3 - 0.7, affects HF response)
  tapeSpeed: 7.5 | 15 | 30; // IPS (affects head bump & rolloff)
};

export type TapeStage = {
  input: AudioNode;
  output: AudioNode;
  params: {
    drive: AudioParam;  // Live-updateable drive (GainNode.gain)
    comp: AudioParam;   // Auto-gain compensation trim
  };
  setDrive: (ctx: BaseAudioContext, drive: number, genreMult: number, genreId: string) => void;
  dispose: () => void;
};

/**
 * Build Tape saturation stage with Studer A800-style character
 * 
 * @param context - AudioContext or OfflineAudioContext
 * @param quality - 'draft' (no oversample) or 'export' (2x oversample)
 * @param config - Genre-specific tape configuration
 */
export function buildTapeStage(
  context: BaseAudioContext,
  quality: QualityMode,
  config: TapeConfig
): TapeStage {
  // === NODES ===
  const input = context.createGain();
  input.channelCountMode = 'max';
  input.channelInterpretation = 'speakers';
  
  const driveGain = context.createGain();
  
  // === TAPE HEAD BUMP (Low-frequency resonance) ===
  const headBumpFreq = config.tapeSpeed === 30 ? 80 : config.tapeSpeed === 15 ? 60 : 40;
  const headBump = context.createBiquadFilter();
  headBump.type = 'peaking';
  headBump.frequency.value = headBumpFreq;
  headBump.gain.value = 0.5; // Subtle character only (+0.5dB)
  headBump.Q.value = 1.2;
  
  // === HIGH-FREQUENCY BIAS CONTROL ===
  // Higher bias = extended high-frequency response
  const biasShelf = context.createBiquadFilter();
  biasShelf.type = 'highshelf';
  biasShelf.frequency.value = 8000;
  biasShelf.gain.value = (config.biasAmount - 0.5) * 2; // ±1dB range
  biasShelf.Q.value = 0.7;
  
  // === TAPE COMPRESSION (Soft limiting before saturation) ===
  // Tape naturally compresses extreme peaks only
  const tapeCompressor = context.createDynamicsCompressor();
  tapeCompressor.threshold.value = -6; // Only compress HOT peaks
  tapeCompressor.knee.value = 12; // Very soft knee
  tapeCompressor.ratio.value = 2.5; // Gentle ratio
  tapeCompressor.attack.value = 0.01; // Slow attack = preserve transients
  tapeCompressor.release.value = 0.2; // Slow release = natural
  
  // === MAGNETIC HYSTERESIS SATURATION ===
  const hysteresisSat = context.createWaveShaper();
  
  // DC blocker (prevents DC offset from waveshaper)
  const dcBlocker = context.createBiquadFilter();
  dcBlocker.type = 'highpass';
  dcBlocker.frequency.value = 5; // Block below 5Hz
  dcBlocker.Q.value = 0.7071; // Butterworth response
  
  // === HIGH-FREQUENCY ROLL-OFF (Tape losses) ===
  const tapeRolloff = context.createBiquadFilter();
  tapeRolloff.type = 'lowpass';
  tapeRolloff.frequency.value = config.tapeSpeed === 30 ? 22000 : config.tapeSpeed === 15 ? 18000 : 12000;
  tapeRolloff.Q.value = 0.5;
  
  // Auto-gain compensation (negative trim to prevent loudness increase)
  const compTrim = context.createGain();
  
  const output = context.createGain();
  output.channelCountMode = 'max';
  output.channelInterpretation = 'speakers';
  
  // === WAVESHAPER CURVE (Studer A800 Hysteresis) ===
  const satCurve = new Float32Array(65536);
  
  // Drive amount from config (will be modulated by user control)
  const driveAmount = config.baseDrive * config.genreMultiplier;
  
  for (let i = 0; i < 65536; i++) {
    const x = (i * 2 - 65536) / 65536;
    
    // Tape input gain staging — wider range for audible THD control
    // PATCH: Was 0.3 (1x-1.3x) — too subtle to hear. Now 1.5 (1x-2.5x)
    const drive = 1 + driveAmount * 1.5; // 1x to 2.5x drive
    const driven = x * drive;
    
    // === HYSTERESIS MODELING ===
    // Tape has different saturation curves for rising vs falling signals
    
    // Primary saturation (arctangent for smooth tape curve)
    const primarySat = (2 / Math.PI) * Math.atan(driven * 1.2);
    
    // Secondary saturation (tanh for hard limiting)
    const secondarySat = Math.tanh(driven * 1.0);
    
    // Blend based on signal level (more tanh at high levels)
    const blend = Math.min(1, Math.abs(driven) * 0.3);
    const saturated = primarySat * (1 - blend) + secondarySat * blend;
    
    // === TAPE HARMONIC COLORATION ===
    // Studer A800 spec: Harmonics scaled by drive for audible THD control
    // PATCH: Was fixed 1.5%/0.8%/0.3% — now scales with driveAmount so knob matters
    const harmonicScale = 1 + driveAmount * 3; // 1x at 0%, 4x at 100%
    const thirdHarmonic = 0.015 * harmonicScale * Math.sin(3 * Math.PI * saturated);
    const fifthHarmonic = 0.008 * harmonicScale * Math.sin(5 * Math.PI * saturated);
    const seventhHarmonic = 0.003 * harmonicScale * Math.sin(7 * Math.PI * saturated);
    
    // Asymmetric clipping (tape saturation is not perfectly symmetric)
    // Studer A800 spec: ~3% asymmetry
    const asymmetry = 0.03 * saturated * saturated;
    
    // Final output (UNITY - no makeup gain)
    const finalSat = saturated + thirdHarmonic + fifthHarmonic + seventhHarmonic + asymmetry;
    satCurve[i] = finalSat;
  }
  
  hysteresisSat.curve = satCurve;
  
  // === OVERSAMPLING (Quality-Dependent) ===
  // Oversampling prevents aliasing that destroys tape emulation character
  // 4x export, 2x preview — keeps Studer emulation honest in both modes
  hysteresisSat.oversample = quality === 'export' ? '4x' : '2x';
  
  // === SIGNAL CHAIN (with compensation) ===
  input.connect(driveGain);
  driveGain.connect(headBump);          // Tape head resonance
  headBump.connect(biasShelf);          // Bias EQ
  biasShelf.connect(tapeCompressor);    // Tape compression
  tapeCompressor.connect(hysteresisSat); // Magnetic saturation
  hysteresisSat.connect(dcBlocker);     // DC blocker
  dcBlocker.connect(tapeRolloff);       // High-frequency loss
  tapeRolloff.connect(compTrim);        // Compensation trim
  compTrim.connect(output);
  
  // === UNITY GAIN OUTPUT (Critical) ===
  // Base unity, compensation is negative trim
  output.gain.value = 1.0;
  compTrim.gain.value = 1.0; // Will be updated based on drive
  
  // === INITIAL DRIVE + COMPENSATION ===
  // Initial drive + preGain
  const preGain = Math.max(0.1, 1.0 + driveAmount * 1.5); // PATCH: Match wider drive range
  
  // Apply preGain
  driveGain.gain.value = preGain;
  
  // Compensation from preGain dB (NEW)
  const preGainDB = linearToDb(preGain);
  
  const compProfile = getCompProfile('default');
  const compDB = tapeCompFromPreGainDB(preGainDB, config.genreMultiplier);
  const scaledCompDB = compDB * compProfile.tapeCompScale;
  
  compTrim.gain.value = dbToLinear(scaledCompDB);
  
  console.log(`📼 Tape: drive=${driveAmount.toFixed(2)}, preGain=${preGain.toFixed(3)}x (${preGainDB.toFixed(2)}dB), genreMult=${config.genreMultiplier.toFixed(2)}, comp=${scaledCompDB.toFixed(2)}dB, speed=${config.tapeSpeed}IPS`);
  
  // === RETURN STAGE ===
  return {
    input,
    output,
    params: {
      drive: driveGain.gain, // Expose for live updates
      comp: compTrim.gain,   // Expose for live updates
    },
    setDrive(ctx: BaseAudioContext, drive: number, genreMult: number, genreId: string) {
      const compProfile = getCompProfile(genreId);
      
      // Physical preGain from control signal — PATCH: Match wider drive range
      const preGain = Math.max(0.1, 1.0 + drive * 1.5);
      const preGainDB = linearToDb(preGain);
      
      // Compensation from physical signal
      const compDB = tapeCompFromPreGainDB(preGainDB, genreMult);
      const scaledCompDB = compDB * compProfile.tapeCompScale;
      
      smoothParam(ctx, driveGain.gain, preGain, 0.05);
      smoothParam(ctx, compTrim.gain, dbToLinear(scaledCompDB), 0.05);
    },
    dispose: () => {
      try { input.disconnect(); } catch {}
      try { driveGain.disconnect(); } catch {}
      try { headBump.disconnect(); } catch {}
      try { biasShelf.disconnect(); } catch {}
      try { tapeCompressor.disconnect(); } catch {}
      try { hysteresisSat.disconnect(); } catch {}
      try { dcBlocker.disconnect(); } catch {}
      try { tapeRolloff.disconnect(); } catch {}
      try { compTrim.disconnect(); } catch {}
      try { output.disconnect(); } catch {}
    },
  };
}

/**
 * Get genre-specific tape configuration
 */
export function getTapeConfig(genreId: string, circuitDrive: number): TapeConfig {
  // Base drive from circuit drive control (0-100)
  const baseDrive = circuitDrive / 100;
  
  switch (genreId) {
    case 'trance':
      return {
        baseDrive,
        genreMultiplier: 0.9,
        biasAmount: 0.6, // Higher bias = brighter, less distortion
        tapeSpeed: 30, // High speed = extended highs
      };
    case 'house':
      return {
        baseDrive,
        genreMultiplier: 1.0,
        biasAmount: 0.5, // Balanced
        tapeSpeed: 15, // Standard speed
      };
    case 'techno':
      return {
        baseDrive,
        genreMultiplier: 1.15,
        biasAmount: 0.3, // Low bias = darker, more distortion
        tapeSpeed: 15,
      };
    case 'rnb':
      return {
        baseDrive,
        genreMultiplier: 0.7,
        biasAmount: 0.7, // Clean, minimal distortion
        tapeSpeed: 30, // High fidelity
      };
    case 'realprog':
      return {
        baseDrive,
        genreMultiplier: 0.95,
        biasAmount: 0.55,
        tapeSpeed: 15,
      };
    case 'modernprog':
      return {
        baseDrive,
        genreMultiplier: 1.05,
        biasAmount: 0.5,
        tapeSpeed: 15,
      };
    case 'tape':
      return {
        baseDrive,
        genreMultiplier: 1.2,
        biasAmount: 0.35, // Vintage = low bias, maximum color
        tapeSpeed: 7.5, // Slow speed = vintage character
      };
    default:
      return {
        baseDrive,
        genreMultiplier: 1.0,
        biasAmount: 0.5,
        tapeSpeed: 15,
      };
  }
}