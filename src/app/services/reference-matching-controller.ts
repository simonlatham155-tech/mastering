/**
 * REFERENCE MATCHING CONTROLLER
 * Bridges FFT analysis → delta calculation → conservative mastering correction.
 *
 * Reference matching is guidance/correction, not a licence for large mix-EQ moves.
 */

import { finiteDB, sanitizeGainArray } from '../utils/finite-audio';
import { ReferenceCurve } from '../data/reference-curves';
import { SpectralAnalyzer, SpectralProfile } from './spectral-analyzer';
import {
  isoBandsToArray,
  profileToIsoBands,
  profileToRelativeIsoShape,
  referenceCurveToRelativeShape,
  type IsoSpectralBands,
} from '../utils/spectral-profile-iso';

const SAFETY_LIMITS = {
  /** Maximum automatic correction requested in any one ISO band before strength. */
  smoothing: 3,
  /** Warn once the final correction is large enough to deserve engineer attention. */
  warningThreshold: 2.5,
  /** Auto level compensation is calibration, not loudness generation. */
  maxAutoGain: 2,
};

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
  { freq: 16000, key: 'hz16k' },
] as const;

export interface MatchingGains {
  bands: number[];
  autoGain: number;
  warnings: string[];
  deltaVisualization: {
    muddy: boolean;
    dark: boolean;
    boomy: boolean;
    harsh: boolean;
  };
}

export interface IsoMatchingDelta {
  bands: IsoSpectralBands;
  autoGain: number;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

export class ReferenceMatchingController {
  private analyzer: SpectralAnalyzer;

  constructor(audioContext: AudioContext) {
    this.analyzer = new SpectralAnalyzer(audioContext);
  }

  async analyzeTrack(audioBuffer: AudioBuffer): Promise<SpectralProfile> {
    console.log('🔬 Analyzing track with offline FFT...');
    const startTime = performance.now();
    const profile = await this.analyzer.analyzeBuffer(audioBuffer);
    const elapsedTime = performance.now() - startTime;
    console.log(`✅ Analysis complete in ${elapsedTime.toFixed(1)}ms`);
    return profile;
  }

  /**
   * Calculate source→reference correction.
   *
   * The comparison uses relative spectral shape, not absolute level. Automatic
   * correction is deliberately bounded to mastering-scale moves.
   */
  calculateMatchingGains(
    userProfile: SpectralProfile,
    referenceCurve: ReferenceCurve,
    strength: number = 0.5,
    smoothing: number = SAFETY_LIMITS.smoothing
  ): MatchingGains {
    const gains: number[] = [];
    const warnings: string[] = [];
    let totalBoost = 0;
    let totalCut = 0;

    const deltaViz = {
      muddy: false,
      dark: false,
      boomy: false,
      harsh: false,
    };

    const referenceProfile = referenceCurveToRelativeShape(referenceCurve.bands);
    const userProfileArray = profileToRelativeIsoShape(userProfile);

    const safeStrength = clamp01(strength);
    const safeSmoothing = Math.max(0.5, Math.min(SAFETY_LIMITS.smoothing, Math.abs(finiteDB(smoothing, SAFETY_LIMITS.smoothing))));

    ISO_BANDS.forEach((band, index) => {
      const refDb = finiteDB(referenceProfile[index]);
      const userDb = finiteDB(userProfileArray[index]);
      const delta = refDb - userDb;
      const clampedDelta = Math.max(Math.min(delta, safeSmoothing), -safeSmoothing);

      if (Math.abs(delta) > safeSmoothing) {
        warnings.push(
          `⚠️ ${band.freq}Hz: Requested ${delta.toFixed(1)}dB, mastering guardrail limited it to ${clampedDelta.toFixed(1)}dB`
        );
      }

      const finalGain = finiteDB(clampedDelta * safeStrength);
      gains.push(finalGain);

      if (finalGain > 0) totalBoost += finalGain;
      else totalCut += Math.abs(finalGain);

      // Sign convention: delta = reference - user.
      // Positive means the user track needs MORE of that band.
      // Negative means the user track has TOO MUCH of that band and needs a cut.
      if (band.freq === 250 && clampedDelta < -1.5) {
        deltaViz.muddy = true;
      }
      if (band.freq === 8000 && clampedDelta > 1.5) {
        deltaViz.dark = true;
      }
      if (band.freq === 31 && clampedDelta < -2) {
        deltaViz.boomy = true;
      }
      if (band.freq === 4000 && clampedDelta < -2) {
        deltaViz.harsh = true;
      }

      if (Math.abs(finalGain) > SAFETY_LIMITS.warningThreshold) {
        warnings.push(
          `🚨 ${band.freq}Hz: Large mastering correction (${finalGain.toFixed(1)}dB) — inspect the mix before committing`
        );
      }
    });

    const netGain = finiteDB(totalBoost - totalCut);
    const autoGain = finiteDB(-netGain * 0.3);
    const clampedAutoGain = Math.max(
      -SAFETY_LIMITS.maxAutoGain,
      Math.min(SAFETY_LIMITS.maxAutoGain, autoGain)
    );

    const safeGains = sanitizeGainArray(gains);

    console.log('📊 Matching Gains Calculated:');
    console.log(`   Total Boost: +${finiteDB(totalBoost).toFixed(1)}dB`);
    console.log(`   Total Cut: -${finiteDB(totalCut).toFixed(1)}dB`);
    console.log(`   Net Gain: ${netGain > 0 ? '+' : ''}${netGain.toFixed(1)}dB`);
    console.log(`   Auto-Gain Compensation: ${clampedAutoGain.toFixed(1)}dB`);
    console.log(`   Strength Applied: ${(safeStrength * 100).toFixed(0)}%`);

    return {
      bands: safeGains,
      autoGain: clampedAutoGain,
      warnings,
      deltaVisualization: deltaViz,
    };
  }

  applyToWASM(
    faustProcessor: AudioWorkletNode,
    matchingGains: MatchingGains
  ): void {
    console.log('🎛️ Applying matching gains to WASM EQ...');

    faustProcessor.port.postMessage({
      type: 'updateParams',
      data: {
        Band1_31Hz: matchingGains.bands[0],
        Band2_63Hz: matchingGains.bands[1],
        Band3_125Hz: matchingGains.bands[2],
        Band4_250Hz: matchingGains.bands[3],
        Band5_500Hz: matchingGains.bands[4],
        Band6_1kHz: matchingGains.bands[5],
        Band7_2kHz: matchingGains.bands[6],
        Band8_4kHz: matchingGains.bands[7],
        Band9_8kHz: matchingGains.bands[8],
        Band10_16kHz: matchingGains.bands[9],
        AutoGain: matchingGains.autoGain,
        Bypass: 0,
      },
    });

    console.log('✅ Gains applied to WASM processor');

    if (matchingGains.warnings.length > 0) {
      console.warn('⚠️ Matching Warnings:');
      matchingGains.warnings.forEach((warning) => console.warn(`   ${warning}`));
    }
  }

  async performMatching(
    audioBuffer: AudioBuffer,
    referenceCurve: ReferenceCurve,
    faustProcessor: AudioWorkletNode,
    strength: number = 0.5
  ): Promise<MatchingGains> {
    console.log('🚀 Starting reference matching workflow...');
    const userProfile = await this.analyzeTrack(audioBuffer);
    const matchingGains = this.calculateMatchingGains(
      userProfile,
      referenceCurve,
      strength
    );
    this.applyToWASM(faustProcessor, matchingGains);
    console.log('✅ Reference matching complete!');
    return matchingGains;
  }

  getAverageBands(profile: SpectralProfile): number[] {
    return isoBandsToArray(profileToIsoBands(profile));
  }

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
      curve.bands.hz16k,
    ];
  }

  calculateDelta(
    userProfile: SpectralProfile,
    referenceCurve: ReferenceCurve
  ): IsoMatchingDelta {
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
        hz16k: deltas[9],
      },
      autoGain: 0,
    };
  }
}

let controllerInstance: ReferenceMatchingController | null = null;

export function getReferenceMatchingController(
  audioContext: AudioContext
): ReferenceMatchingController {
  if (!controllerInstance) {
    controllerInstance = new ReferenceMatchingController(audioContext);
  }
  return controllerInstance;
}
