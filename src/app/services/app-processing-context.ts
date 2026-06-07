/**
 * Shared helpers for building processing plans and settings from App UI state.
 */

import type { ProfileAdjustments } from '../components/profile-adjustments';
import type { ProDynamicsSettings, SSLGlueMode } from '../components/pro-dynamics-panel';
import type { GearProfileId } from '../components/gear-selector';
import type { ExportPresetId } from '../data/export-presets';
import { getExportPreset } from '../data/export-presets';
import { getGenrePreset } from '../data/genre-presets';
import { resolveProcessingPlan, type ProcessingPlan, type UserOverrides } from '../data/preset-resolution';
import type { ProcessingSettings } from '../services/audio-processor';
import type { AIMasteringRecommendation } from '../services/ai-mastering-engine';
import type { RealtimeAudioPlayer } from '../services/realtime-audio-player';

export type LogicMode = 'brickwall' | 'dynamics';

export { DEFAULT_PRO_DYNAMICS } from '../components/pro-dynamics-panel';
export type { ProDynamicsSettings, SSLGlueMode };

const SSL_GLUE_PRESETS: Record<Exclude<SSLGlueMode, 'auto'>, { threshold: number; ratio: number }> = {
  gentle: { threshold: -14, ratio: 2 },
  firm: { threshold: -6, ratio: 4 },
};

/**
 * Sliders store absolute EQ dB targets; preset resolution expects offsets from genre defaults.
 * Harmonic color comes from the THD knob — not duplicated here.
 */
export function profileAdjustmentsToUserOverrides(
  profileAdjustments: ProfileAdjustments,
  gearProfile: GearProfileId,
  proDynamics?: ProDynamicsSettings
): UserOverrides {
  const genre = getGenrePreset(gearProfile);
  const base = genre?.biases ?? {
    bassTilt: 0,
    mudCut: 0,
    airTilt: 0,
    width: 1,
    colorAmount: 0.5,
  };

  const overrides: UserOverrides = {
    width: (profileAdjustments.stereoWidth - 50) / 100 * 0.6,
    bassTilt: profileAdjustments.lowShelfBoost - base.bassTilt,
    mudCut: profileAdjustments.midRangeAdjust - base.mudCut,
    airTilt: profileAdjustments.highShelfBoost - base.airTilt,
  };

  if (proDynamics?.forceMonoBass != null) {
    overrides.forceMonoBass = proDynamics.forceMonoBass;
    overrides.monoBassHz = proDynamics.monoBassHz;
  }

  return overrides;
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

  player.updateParameter('lowShelfGain', profileAdjustments.lowShelfBoost);
  player.updateParameter('midRangeGain', profileAdjustments.midRangeAdjust);
  player.updateParameter('highShelfGain', profileAdjustments.highShelfBoost);

  const widthOffset = (profileAdjustments.stereoWidth - 50) / 100 * 0.6;
  player.updateParameter('stereoWidth', genre.biases.width + widthOffset);
}

export function applyProDynamicsToPlayer(
  player: RealtimeAudioPlayer,
  proDynamics: ProDynamicsSettings,
  autoInputTrimDB?: number
): void {
  const inputTrim = proDynamics.inputTrimDB ?? autoInputTrimDB ?? 0;
  player.updateParameter('inputTrim', inputTrim);
  player.updateParameter('outputTrim', proDynamics.outputTrimDB);

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
