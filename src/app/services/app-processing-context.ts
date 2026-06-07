/**
 * Shared helpers for building processing plans and settings from App UI state.
 */

import type { ProfileAdjustments } from '../components/profile-adjustments';
import type { GearProfileId } from '../components/gear-selector';
import type { ExportPresetId } from '../data/export-presets';
import { getExportPreset } from '../data/export-presets';
import { getGenrePreset } from '../data/genre-presets';
import { resolveProcessingPlan, type ProcessingPlan, type UserOverrides } from '../data/preset-resolution';
import type { ProcessingSettings } from '../services/audio-processor';
import type { AIMasteringRecommendation } from '../services/ai-mastering-engine';
import type { RealtimeAudioPlayer } from '../services/realtime-audio-player';

export type LogicMode = 'brickwall' | 'dynamics';

/**
 * Sliders store absolute EQ dB targets; preset resolution expects offsets from genre defaults.
 */
export function profileAdjustmentsToUserOverrides(
  profileAdjustments: ProfileAdjustments,
  gearProfile: GearProfileId
): UserOverrides {
  const genre = getGenrePreset(gearProfile);
  const base = genre?.biases ?? {
    bassTilt: 0,
    mudCut: 0,
    airTilt: 0,
    width: 1,
    colorAmount: 0.5,
  };

  return {
    width: (profileAdjustments.stereoWidth - 50) / 100 * 0.6,
    bassTilt: profileAdjustments.lowShelfBoost - base.bassTilt,
    mudCut: profileAdjustments.midRangeAdjust - base.mudCut,
    airTilt: profileAdjustments.highShelfBoost - base.airTilt,
    colorAmount: (profileAdjustments.saturationAmount - 50) / 100,
  };
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

export interface AppProcessingContext {
  gearProfile: GearProfileId;
  exportPreset: ExportPresetId;
  logicMode: LogicMode;
  circuitDrive: number;
  profileAdjustments: ProfileAdjustments;
}

export function buildAppProcessingPlan(context: AppProcessingContext): ProcessingPlan {
  return resolveProcessingPlan({
    genreId: context.gearProfile,
    exportPresetId: context.exportPreset,
    performanceMode: 'studio',
    logicMode: context.logicMode,
    userOverrides: profileAdjustmentsToUserOverrides(
      context.profileAdjustments,
      context.gearProfile
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
      context.gearProfile
    ),
  };
}

export function targetLufsToExportPreset(targetLUFS: number): ExportPresetId {
  if (targetLUFS <= -12) return 'spotify';
  if (targetLUFS <= -7) return 'club';
  return 'extreme';
}

export function recommendationToProfileAdjustments(
  gearProfile: GearProfileId,
  circuitDrive: number
): Partial<ProfileAdjustments> {
  return {
    saturationAmount: circuitDrive,
  };
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
