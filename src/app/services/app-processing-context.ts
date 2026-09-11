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
import { calculateGenreCorrection } from '../data/genre-target-space';
import { resolveProcessingPlan, type ProcessingPlan, type UserOverrides } from '../data/preset-resolution';
import { finiteDB } from '../utils/finite-audio';
import {
  clampCombinedAirTilt,
  clampCombinedBassTilt,
  clampCombinedMudCut,
} from '../utils/genre-eq-clamp';
import type { ProcessingSettings } from '../services/audio-processor';
import type { AIMasteringRecommendation } from '../services/ai-mastering-engine';
import type { RealtimeAudioPlayer } from '../services/realtime-audio-player';
import { getSuggestedProDynamics } from '../utils/suggested-settings';
import { getMasteringSourceAnalysis } from './mastering-source-analysis';

export type LogicMode = 'brickwall' | 'dynamics';

export { DEFAULT_PRO_DYNAMICS };
export type { ProDynamicsSettings, SSLGlueMode };

/** Default tonal balance match — conservative with EQ clamps so genre + match stack safely. */
export const DEFAULT_TONAL_MATCH_STRENGTH = 20;

export interface RackStageOverrides {
  transformer: boolean | null;
  tape: boolean | null;
  multiband: boolean | null;
  midSide: boolean | null;
  clipper: boolean | null;
}

export const DEFAULT_RACK_STAGE_OVERRIDES: RackStageOverrides = {
  transformer: null,
  tape: null,
  multiband: null,
  midSide: null,
  clipper: null,
};

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

function resolveAutomaticGenreCorrection(gearProfile: GearProfileId) {
  const source = getMasteringSourceAnalysis();
  return source ? calculateGenreCorrection(gearProfile, source) : null;
}

/**
 * Profile sliders are engineer offsets on top of the calculated source -> genre correction.
 *
 * The legacy ProcessingPlan resolver still adds the old genre bias internally, so this
 * adapter subtracts that legacy baseline. The final DSP therefore receives:
 *
 *   calculated genre correction + engineer offset
 *
 * rather than:
 *
 *   fixed genre EQ + engineer offset
 *
 * Harmonic colour remains controlled separately by the THD/rack stages.
 */
export function profileAdjustmentsToUserOverrides(
  profileAdjustments: ProfileAdjustments,
  gearProfile: GearProfileId,
  proDynamics?: ProDynamicsSettings,
  rackStages?: RackStageOverrides
): UserOverrides {
  const genre = getGenrePreset(gearProfile);
  const correction = resolveAutomaticGenreCorrection(gearProfile);

  const autoBass = correction?.bassTiltDB ?? 0;
  const autoMud = correction?.mudCutDB ?? 0;
  const autoAir = correction?.airTiltDB ?? 0;
  const autoWidth = correction?.widthOffset ?? 0;
  const manualWidth = (profileAdjustments.stereoWidth - 50) / 100 * 0.6;

  const legacyBass = genre?.biases.bassTilt ?? 0;
  const legacyMud = genre?.biases.mudCut ?? 0;
  const legacyAir = genre?.biases.airTilt ?? 0;
  const legacyWidth = genre?.biases.width ?? 1;

  const overrides: UserOverrides = {
    // Subtract the legacy preset baseline because resolveProcessingPlan currently
    // adds it. This keeps the resulting DSP value source-relative and neutral by default.
    bassTilt: autoBass + profileAdjustments.lowShelfBoost - legacyBass,
    mudCut: autoMud + profileAdjustments.midRangeAdjust - legacyMud,
    airTilt: autoAir + profileAdjustments.highShelfBoost - legacyAir,
    width: (1 + autoWidth + manualWidth) - legacyWidth,
  };

  if (rackStages?.transformer != null) {
    overrides.useTransformer = rackStages.transformer;
  }
  if (rackStages?.tape != null) {
    overrides.useTape = rackStages.tape;
  }
  if (rackStages?.multiband != null) {
    overrides.useMultiband = rackStages.multiband;
  }
  if (rackStages?.midSide != null) {
    overrides.useMidSide = rackStages.midSide;
  }
  if (rackStages?.clipper != null) {
    overrides.useClipper = rackStages.clipper;
  }

  if (proDynamics?.forceMonoBass != null) {
    overrides.forceMonoBass = proDynamics.forceMonoBass;
  }
  // Hz applies whenever mono bass is not explicitly off (genre default or user on).
  if (proDynamics?.forceMonoBass !== false && proDynamics?.monoBassHz != null) {
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

/** Push the exact same source-relative tonal result into live AudioParams. */
export function applyProfileAdjustmentsToPlayer(
  player: RealtimeAudioPlayer,
  gearProfile: GearProfileId,
  profileAdjustments: ProfileAdjustments
): void {
  const correction = resolveAutomaticGenreCorrection(gearProfile);
  const bass = (correction?.bassTiltDB ?? 0) + profileAdjustments.lowShelfBoost;
  const mud = (correction?.mudCutDB ?? 0) + profileAdjustments.midRangeAdjust;
  const air = (correction?.airTiltDB ?? 0) + profileAdjustments.highShelfBoost;
  const widthOffset = (finiteDB(profileAdjustments.stereoWidth, 50) - 50) / 100 * 0.6;
  const width = Math.max(0.9, Math.min(1.15, 1 + (correction?.widthOffset ?? 0) + widthOffset));

  player.updateParameter('lowShelfGain', clampCombinedBassTilt(0, bass));
  player.updateParameter('midRangeGain', clampCombinedMudCut(0, mud));
  player.updateParameter('highShelfGain', clampCombinedAirTilt(0, air));
  player.updateParameter('stereoWidth', width);
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
  rackStages?: RackStageOverrides;
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
      context.proDynamics,
      context.rackStages
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
      context.proDynamics,
      context.rackStages
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
