/**
 * Shared helpers for building processing plans and settings from App UI state.
 */

import type { ProfileAdjustments } from '../components/profile-adjustments';
import {
  DEFAULT_PRO_DYNAMICS,
  type ProDynamicsSettings,
  type SSLGlueMode,
} from '../components/pro-dynamics-panel';
import type { GearProfileId } from '../components/gear-selector';
import type { ExportPresetId } from '../data/export-presets';
import { getExportPreset } from '../data/export-presets';
import { getGenrePreset } from '../data/genre-presets';
import { resolveProcessingPlan, type ProcessingPlan, type UserOverrides } from '../data/preset-resolution';
import { finiteDB } from '../utils/finite-audio';
import type { ProcessingSettings } from '../services/audio-processor';
import type { AIMasteringRecommendation } from '../services/ai-mastering-engine';
import type { RealtimeAudioPlayer } from '../services/realtime-audio-player';
import { getSuggestedProDynamics } from '../utils/suggested-settings';

export type LogicMode = 'brickwall' | 'dynamics';

export { DEFAULT_PRO_DYNAMICS };
export type { ProDynamicsSettings, SSLGlueMode };

/** Default tonal balance match — applied automatically; pros adjust in expert rack. */
export const DEFAULT_TONAL_MATCH_STRENGTH = 35;

const SSL_GLUE_PRESETS: Record<Exclude<SSLGlueMode, 'auto'>, { threshold: number; ratio: number }> = {
  gentle: { threshold: -14, ratio: 2 },
  firm: { threshold: -6, ratio: 4 },
};

const NEUTRAL_PROFILE_ADJUSTMENTS: ProfileAdjustments = {
  lowShelfBoost: 0,
  midRangeAdjust: 0,
  highShelfBoost: 0,
  stereoWidth: 50,
};

export { NEUTRAL_PROFILE_ADJUSTMENTS };

/**
 * Sliders store user offsets from the active genre preset (0 = genre default).
 * Harmonic color comes from the THD knob — not duplicated here.
 */
export function profileAdjustmentsToUserOverrides(
  profileAdjustments: ProfileAdjustments,
  gearProfile: GearProfileId,
  proDynamics?: ProDynamicsSettings
): UserOverrides {
  const overrides: UserOverrides = {
    width: (profileAdjustments.stereoWidth - 50) / 100 * 0.6,
    bassTilt: profileAdjustments.lowShelfBoost,
    mudCut: profileAdjustments.midRangeAdjust,
    airTilt: profileAdjustments.highShelfBoost,
  };

  if (proDynamics?.forceMonoBass != null) {
    overrides.forceMonoBass = proDynamics.forceMonoBass;
    overrides.monoBassHz = proDynamics.monoBassHz;
  }

  return overrides;
}

/** Genre-aware pro dynamics defaults (staging, glue, mono bass) — applied on upload. */
export function buildProDynamicsForGear(
  gearProfile: GearProfileId,
  exportPresetId: ExportPresetId,
  autoInputTrimDB?: number
): ProDynamicsSettings {
  const ceiling = getExportPreset(exportPresetId).ceiling;
  const suggested = getSuggestedProDynamics(gearProfile, ceiling, autoInputTrimDB);
  return {
    ...DEFAULT_PRO_DYNAMICS,
    sslGlue: suggested.sslGlue,
    forceMonoBass: suggested.forceMonoBass,
    monoBassHz: suggested.monoBassHz,
    autoStageOnExport: true,
    autoStageLive: false,
  };
}

export function resolveEffectiveInputTrimDB(
  proDynamics: ProDynamicsSettings,
  autoInputTrimDB?: number
): number | undefined {
  const manual = proDynamics.inputTrimDB;
  if (manual != null) return manual;
  return autoInputTrimDB;
}

export function resolveLimiterCeilingOverride(
  proDynamics: ProDynamicsSettings
): number | undefined {
  return proDynamics.limiterCeilingDBTP ?? undefined;
}

/** Push profile slider values to live AudioParams (call after chain build / on slider move). */
export function applyProfileAdjustmentsToPlayer(
  player: RealtimeAudioPlayer,
  gearProfile: GearProfileId,
  profileAdjustments: ProfileAdjustments
): void {
  const genre = getGenrePreset(gearProfile);
  if (!genre) return;

  player.updateParameter(
    'lowShelfGain',
    finiteDB(genre.biases.bassTilt + profileAdjustments.lowShelfBoost)
  );
  player.updateParameter(
    'midRangeGain',
    finiteDB(genre.biases.mudCut + profileAdjustments.midRangeAdjust)
  );
  player.updateParameter(
    'highShelfGain',
    finiteDB(genre.biases.airTilt + profileAdjustments.highShelfBoost)
  );

  const widthOffset = (finiteDB(profileAdjustments.stereoWidth, 50) - 50) / 100 * 0.6;
  player.updateParameter('stereoWidth', finiteDB(genre.biases.width + widthOffset, 1));
}

export function applyProDynamicsToPlayer(
  player: RealtimeAudioPlayer,
  proDynamics: ProDynamicsSettings,
  autoInputTrimDB?: number
): void {
  const inputTrim = finiteDB(proDynamics.inputTrimDB ?? autoInputTrimDB ?? 0, 0);
  player.updateParameter('inputTrim', inputTrim);
  player.updateParameter('outputTrim', finiteDB(proDynamics.outputTrimDB, 0));

  if (proDynamics.sslGlue === 'gentle' || proDynamics.sslGlue === 'firm') {
    const preset = SSL_GLUE_PRESETS[proDynamics.sslGlue];
    player.updateParameter('sslThreshold', preset.threshold);
    player.updateParameter('sslRatio', preset.ratio);
  }
}

export interface AppProcessingContext {
  gearProfile: GearProfileId;
  exportPreset: ExportPresetId;
  logicMode: LogicMode;
  circuitDrive: number;
  profileAdjustments: ProfileAdjustments;
  proDynamics: ProDynamicsSettings;
}

export function buildAppProcessingPlan(context: AppProcessingContext): ProcessingPlan {
  return resolveProcessingPlan({
    genreId: context.gearProfile,
    exportPresetId: context.exportPreset,
    performanceMode: 'studio',
    logicMode: context.logicMode,
    userOverrides: profileAdjustmentsToUserOverrides(
      context.profileAdjustments,
      context.gearProfile,
      context.proDynamics
    ),
  });
}

export function buildAppProcessingSettings(
  context: AppProcessingContext
): ProcessingSettings {
  const preset = getExportPreset(context.exportPreset);

  return {
    circuitDrive: context.circuitDrive,
    logicMode: context.logicMode,
    targetLUFS: preset.lufs,
    exportPresetId: context.exportPreset,
    genreId: context.gearProfile,
    gearProfile: context.gearProfile,
    userOverrides: profileAdjustmentsToUserOverrides(
      context.profileAdjustments,
      context.gearProfile,
      context.proDynamics
    ),
  };
}

export function targetLufsToExportPreset(targetLUFS: number): ExportPresetId {
  if (targetLUFS <= -12) return 'spotify';
  if (targetLUFS <= -7) return 'club';
  return 'extreme';
}

export interface AppliedRecommendation {
  circuitDrive: number;
  logicMode: LogicMode;
  gearProfile: GearProfileId;
  exportPreset: ExportPresetId;
}

export function appliedRecommendationFromAI(
  recommendation: AIMasteringRecommendation
): AppliedRecommendation {
  return {
    circuitDrive: recommendation.circuitDrive,
    logicMode: recommendation.logicMode,
    gearProfile: recommendation.gearProfile,
    exportPreset: targetLufsToExportPreset(recommendation.targetLUFS),
  };
}

/** Generic black-box chain for A/B demo (Spotify -14, brickwall). */
export function buildGenericDemoContext(
  proDynamics: ProDynamicsSettings = DEFAULT_PRO_DYNAMICS
): AppProcessingContext {
  return {
    gearProfile: 'generic',
    exportPreset: 'spotify',
    logicMode: 'brickwall',
    circuitDrive: 35,
    profileAdjustments: NEUTRAL_PROFILE_ADJUSTMENTS,
    proDynamics,
  };
}

/** Genre-aware chain from AI recommendation for A/B demo. */
export function buildAIDemoContext(
  recommendation: AIMasteringRecommendation,
  profileAdjustments: ProfileAdjustments,
  proDynamics: ProDynamicsSettings = DEFAULT_PRO_DYNAMICS
): AppProcessingContext {
  const applied = appliedRecommendationFromAI(recommendation);
  return {
    gearProfile: applied.gearProfile,
    exportPreset: applied.exportPreset,
    logicMode: applied.logicMode,
    circuitDrive: applied.circuitDrive,
    profileAdjustments,
    proDynamics,
  };
}
