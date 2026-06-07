/**
 * Shared helpers for building processing plans and settings from App UI state.
 */

import type { ProfileAdjustments } from '../components/profile-adjustments';
import type { GearProfileId } from '../components/gear-selector';
import type { ExportPresetId } from '../data/export-presets';
import { getExportPreset } from '../data/export-presets';
import { resolveProcessingPlan, type ProcessingPlan, type UserOverrides } from '../data/preset-resolution';
import type { ProcessingSettings } from '../services/audio-processor';
import type { AIMasteringRecommendation } from '../services/ai-mastering-engine';

export type LogicMode = 'brickwall' | 'dynamics';

export function profileAdjustmentsToUserOverrides(
  profileAdjustments: ProfileAdjustments
): UserOverrides {
  return {
    width: (profileAdjustments.stereoWidth - 50) / 100 * 0.6,
    bassTilt: profileAdjustments.lowShelfBoost,
    mudCut: profileAdjustments.midRangeAdjust,
    airTilt: profileAdjustments.highShelfBoost,
    colorAmount: (profileAdjustments.saturationAmount - 50) / 100,
  };
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
    userOverrides: profileAdjustmentsToUserOverrides(context.profileAdjustments),
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
    userOverrides: profileAdjustmentsToUserOverrides(context.profileAdjustments),
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
