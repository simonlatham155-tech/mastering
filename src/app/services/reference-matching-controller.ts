/**
 * REFERENCE MATCHING CONTROLLER
 * Bridges FFT analysis → Delta calculation → WASM filter bank
 * 
 * This is the "brain" that makes reference matching work:
 * 1. Analyze user's track (offline FFT)
 * 2. Compare to reference profile
 * 3. Calculate delta (corrections needed)
 * 4. Apply strength multiplier
 * 5. Send to WASM EQ with auto-gain compensation
 */

import { finiteDB, sanitizeGainArray } from '../utils/finite-audio';
import { ReferenceCurve } from '../data/reference-curves';
import { SpectralAnalyzer, SpectralProfile, MatchingDelta } from './spectral-analyzer';
import { isoBandsToArray, profileToIsoBands, profileToRelativeIsoShape, referenceCurveToRelativeShape } from '../utils/spectral-profile-iso';

/**
 * Safety limits for matching
 */
const SAFETY_LIMITS = {
  maxDelta: 12,        // Maximum boost/cut per band (dB)
  smoothing: 6,        // Clamp to ±6dB to prevent extreme jumps
  warningThreshold: 8  // Show warning if delta > 8dB
};

/**
 * ISO-standard band mapping
 */
const ISO_BANDS = [
  { freq: 31, key: 'hz31' },
  { freq: 63, key: 'hz63' },
  { freq: 125, key: 'hz125' },
  { freq: 250, key: 'hz250' },
  { freq: 500, key: 'hz500' },
  { freq: 1000, key: 'hz1k' },
  { freq: 2000, key: 'hz2k' },
  { freq: 4000, key: 'hz4k' },
  { freq: 8000, key: 'hz8k' },
  { freq: 16000, key: 'hz16k' }
] as const;

export interface MatchingGains {
  bands: number[];          // Array of 10 gain values (dB)
  autoGain: number;         // Overall gain compensation (dB)
  warnings: string[];       // Safety warnings
  deltaVisualization: {     // For UI feedback
    muddy: boolean;         // Too much low-mid
    dark: boolean;          // Not enough high-end
    boomy: boolean;         // Too much sub
    harsh: boolean;         // Too much 4kHz
  };
}

export class ReferenceMatchingController {
  private analyzer: SpectralAnalyzer;
  
  constructor(audioContext: AudioContext) {
    this.analyzer = new SpectralAnalyzer(audioContext);
  }
  
  /**
   * STEP A & B: Analyze user's track (offline FFT on entire file)
   */
  async analyzeTrack(audioBuffer: AudioBuffer): Promise<SpectralProfile> {
    console.log('🔬 Analyzing track with offline FFT...');
    const startTime = performance.now();
    
    const profile = await this.analyzer.analyzeBuffer(audioBuffer);
    
    const elapsedTime = performance.now() - startTime;
    console.log(`✅ Analysis complete in ${elapsedTime.toFixed(1)}ms`);
    
    return profile;
  }
  
  /**
   * STEP C: Calculate matching gains with strength multiplier
   * 
   * @param userProfile - Spectral profile from user's track
   * @param referenceCurve - Target reference curve
   * @param strength - Matching strength (0.0 to 1.0)
   * @param smoothing - Maximum allowed delta per band (dB)
   * @returns Matching gains to apply to WASM EQ
   */
  calculateMatchingGains(
    userProfile: SpectralProfile,
    referenceCurve: ReferenceCurve,
    strength: number = 0.5,  // Default: 50% (balanced)
    smoothing: number = SAFETY_LIMITS.smoothing
  ): MatchingGains {
    
    const gains: number[] = [];
    const warnings: string[] = [];
    let totalBoost = 0;
    let totalCut = 0;
    
    // Initialize delta visualization flags
    const deltaViz = {
      muddy: false,
      dark: false,
      boomy: false,
      harsh: false
    };
    
    // Compare spectral shape (tilt), not absolute log-energy vs relative genre offsets.
    const referenceProfile = referenceCurveToRelativeShape(referenceCurve.bands);
    const userProfileArray = profileToRelativeIsoShape(userProfile);
    
    // Calculate gain for each band
    ISO_BANDS.forEach((band, index) => {
      const refDb = finiteDB(referenceProfile[index]);
      const userDb = finiteDB(userProfileArray[index]);
      
      // 1. Find the raw difference
      let delta = refDb - userDb;
      
      // 2. Clamp the delta to avoid "blown out" speakers
      const clampedDelta = Math.max(Math.min(delta, smoothing), -smoothing);
      
      // 3. Check if clamping occurred (safety warning)
      if (Math.abs(delta) > smoothing) {
        warnings.push(
          `⚠️ ${band.freq}Hz: Requested ${delta.toFixed(1)}dB, clamped to ${clampedDelta.toFixed(1)}dB`
        );
      }
      
      // 4. Apply the "Strength" multiplier from UI
      const finalGain = finiteDB(clampedDelta * strength);
      
      gains.push(finalGain);
      
      // Track total boost/cut for auto-gain compensation
      if (finalGain > 0) {
        totalBoost += finalGain;
      } else {
        totalCut += Math.abs(finalGain);
      }
      
      // 5. Check for specific issues (delta visualization)
      if (band.freq === 250 && clampedDelta < -3) {
        deltaViz.muddy = true; // Too much low-mid = muddy
      }
      if (band.freq === 8000 && clampedDelta > 3) {
        deltaViz.dark = true; // Not enough high-end = dark
      }
      if (band.freq === 31 && clampedDelta > 4) {
        deltaViz.boomy = true; // Too much sub = boomy
      }
      if (band.freq === 4000 && clampedDelta > 4) {
        deltaViz.harsh = true; // Too much 4kHz = harsh
      }
      
      // 6. Safety warning for extreme deltas
      if (Math.abs(finalGain) > SAFETY_LIMITS.warningThreshold) {
        warnings.push(
          `🚨 ${band.freq}Hz: Large correction (${finalGain.toFixed(1)}dB) - Check your mix balance`
        );
      }
    });
    
    // AUTO-GAIN COMPENSATION
    // If EQ adds 3dB total boost, output volume drops by 3dB
    // This prevents the user from being tricked by "louder = better"
    const netGain = finiteDB(totalBoost - totalCut);
    const autoGain = finiteDB(-netGain * 0.3);
    
    // Clamp auto-gain to reasonable range
    const clampedAutoGain = Math.max(-6, Math.min(6, autoGain));
    
    const safeGains = sanitizeGainArray(gains);
    
    console.log('📊 Matching Gains Calculated:');
    console.log(`   Total Boost: +${finiteDB(totalBoost).toFixed(1)}dB`);
    console.log(`   Total Cut: -${finiteDB(totalCut).toFixed(1)}dB`);
    console.log(`   Net Gain: ${netGain > 0 ? '+' : ''}${netGain.toFixed(1)}dB`);
    console.log(`   Auto-Gain Compensation: ${autoGain.toFixed(1)}dB`);
    console.log(`   Strength Applied: ${(strength * 100).toFixed(0)}%`);
    
    return {
      bands: safeGains,
      autoGain: clampedAutoGain,
      warnings,
      deltaVisualization: deltaViz
    };
  }
  
  /**
   * STEP D: Apply gains to WASM EQ processor
   * 
   * This sends the calculated gains to the Faust AudioWorklet
   */
  applyToWASM(
    faustProcessor: AudioWorkletNode,
    matchingGains: MatchingGains
  ): void {
    console.log('🎛️ Applying matching gains to WASM EQ...');
    
    // Send message to AudioWorklet
    faustProcessor.port.postMessage({
      type: 'updateParams',
      data: {
        // Band gains (in dB)
        'Band1_31Hz': matchingGains.bands[0],
        'Band2_63Hz': matchingGains.bands[1],
        'Band3_125Hz': matchingGains.bands[2],
        'Band4_250Hz': matchingGains.bands[3],
        'Band5_500Hz': matchingGains.bands[4],
        'Band6_1kHz': matchingGains.bands[5],
        'Band7_2kHz': matchingGains.bands[6],
        'Band8_4kHz': matchingGains.bands[7],
        'Band9_8kHz': matchingGains.bands[8],
        'Band10_16kHz': matchingGains.bands[9],
        
        // Auto-gain compensation
        'AutoGain': matchingGains.autoGain,
        
        // Bypass off
        'Bypass': 0
      }
    });
    
    console.log('✅ Gains applied to WASM processor');
    
    // Log warnings
    if (matchingGains.warnings.length > 0) {
      console.warn('⚠️ Matching Warnings:');
      matchingGains.warnings.forEach(warning => console.warn(`   ${warning}`));
    }
  }
  
  /**
   * FEEDBACK LOOP: Complete workflow from upload to processing
   * 
   * This is the main entry point for the "Fix It" button
   */
  async performMatching(
    audioBuffer: AudioBuffer,
    referenceCurve: ReferenceCurve,
    faustProcessor: AudioWorkletNode,
    strength: number = 0.5
  ): Promise<MatchingGains> {
    
    console.log('🚀 Starting reference matching workflow...');
    
    // Step A & B: Analyze track
    const userProfile = await this.analyzeTrack(audioBuffer);
    
    // Step C: Calculate gains
    const matchingGains = this.calculateMatchingGains(
      userProfile,
      referenceCurve,
      strength
    );
    
    // Step D: Apply to WASM
    this.applyToWASM(faustProcessor, matchingGains);
    
    console.log('✅ Reference matching complete!');
    
    return matchingGains;
  }
  
  /**
   * Get average dB values for the 10 ISO bands
   * (This is what the pseudo-code calls "getAverageBands")
   */
  getAverageBands(profile: SpectralProfile): number[] {
    return isoBandsToArray(profileToIsoBands(profile));
  }
  
  /**
   * Convert reference curve to array format
   */
  getReferenceProfile(curve: ReferenceCurve): number[] {
    return [
      curve.bands.hz31,
      curve.bands.hz63,
      curve.bands.hz125,
      curve.bands.hz250,
      curve.bands.hz500,
      curve.bands.hz1k,
      curve.bands.hz2k,
      curve.bands.hz4k,
      curve.bands.hz8k,
      curve.bands.hz16k
    ];
  }
  
  /**
   * Calculate delta for visualization (before strength applied)
   */
  calculateDelta(
    userProfile: SpectralProfile,
    referenceCurve: ReferenceCurve
  ): MatchingDelta {
    
    const userArray = profileToRelativeIsoShape(userProfile);
    const refArray = referenceCurveToRelativeShape(referenceCurve.bands);
    
    const deltas = refArray.map((ref, i) => ref - userArray[i]);
    
    return {
      bands: {
        hz31: deltas[0],
        hz63: deltas[1],
        hz125: deltas[2],
        hz250: deltas[3],
        hz500: deltas[4],
        hz1k: deltas[5],
        hz2k: deltas[6],
        hz4k: deltas[7],
        hz8k: deltas[8],
        hz16k: deltas[9]
      },
      autoGain: 0 // Will be calculated when applying
    };
  }
}

/**
 * Singleton instance
 */
let controllerInstance: ReferenceMatchingController | null = null;

export function getReferenceMatchingController(audioContext: AudioContext): ReferenceMatchingController {
  if (!controllerInstance) {
    controllerInstance = new ReferenceMatchingController(audioContext);
  }
  return controllerInstance;
}
