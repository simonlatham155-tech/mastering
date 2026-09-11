/**
 * Single entry for delivery-quality export — used by single-file and batch/album export.
 * Always runs full export chain + auto-staging (same as the Export panel).
 */

import { getExportPreset, type ExportPresetId } from '../data/export-presets';
import { getGenrePreset } from '../data/genre-presets';
import type { ProDynamicsSettings } from '../components/pro-dynamics-panel';
import type { ProcessingSettings } from './audio-processor';
import { audioProcessor } from './audio-processor';
import { renderExportWithAutoStaging } from './export-auto-staging';
import type { ExportQualityReport } from '../utils/measure-buffer-loudness';
import {
  resolveEffectiveInputTrimDB,
  resolveLimiterCeilingOverride,
} from './app-processing-context';
import type { LimiterBackend } from './mastering-chain-builder';
import { resolveLoudnessDrive } from './loudness-drive';
import { getMasteringSourceAnalysis } from './mastering-source-analysis';

export type { ExportQualityReport };
export {
  computeAutoInputTrimDB,
  masterExportFilename,
  batchZipFilename,
} from '../utils/master-export-utils';

export interface MasterExportInput {
  settings: ProcessingSettings;
  exportPresetId: ExportPresetId;
  proDynamics: ProDynamicsSettings;
  /** Per-file analysis peak for auto input trim; omit if already baked into inputTrimDB */
  autoInputTrimDB?: number;
  /** Override/engineer input trim before automatic loudness drive. */
  inputTrimDB?: number;
  /** Per-file integrated LUFS. Preferred for batch and explicit export parity. */
  inputLUFS?: number;
}

export interface MasterExportResult {
  buffer: AudioBuffer;
  wavBlob: Blob;
  report: ExportQualityReport;
  outputTrimDB: number;
  iterations: number;
  staged: boolean;
  inputTrimDB: number | undefined;
  /** Automatic pre-limiter loudness drive included in inputTrimDB. */
  loudnessDriveDB: number;
  limiterBackend: Exclude<LimiterBackend, 'bypass'>;
  latencySamples: number;
}

function clampMasteringInputDB(value: number): number {
  return Math.max(-12, Math.min(8, value));
}

/**
 * Full delivery render: guarded pre-limiter drive → export-quality chain →
 * fine output calibration → WAV blob.
 */
export async function runMasterExport(
  input: MasterExportInput
): Promise<MasterExportResult> {
  const {
    settings,
    exportPresetId,
    proDynamics,
    autoInputTrimDB,
    inputTrimDB: inputTrimOverride,
    inputLUFS,
  } = input;

  const preset = getExportPreset(exportPresetId);
  const limiterCeilingOverride = resolveLimiterCeilingOverride(proDynamics);
  const baseInputTrimDB =
    inputTrimOverride ??
    resolveEffectiveInputTrimDB(proDynamics, autoInputTrimDB) ??
    0;

  const sourceLUFS =
    Number.isFinite(inputLUFS) ? inputLUFS : getMasteringSourceAnalysis()?.lufs;
  const genreStyle = getGenrePreset(settings.genreId)?.loudnessStyle ?? 'balanced';
  const drivePlan = resolveLoudnessDrive({
    inputLUFS: sourceLUFS,
    targetLUFS: preset.lufs,
    style: genreStyle,
    logicMode: settings.logicMode,
  });

  // Traditional gain staging: source/headroom trim remains the engineer offset;
  // automatic loudness drive is added before the final limiter rather than
  // asking post-limiter output trim to manufacture the master.
  const inputTrimDB = clampMasteringInputDB(
    baseInputTrimDB + drivePlan.preLimiterDriveDB
  );

  console.log(
    `🎚️ Master drive: source=${drivePlan.inputLUFS.toFixed(1)} LUFS, ` +
      `target=${drivePlan.targetLUFS.toFixed(1)}, pre-limiter=${drivePlan.preLimiterDriveDB.toFixed(1)} dB, ` +
      `baseTrim=${baseInputTrimDB.toFixed(1)} dB, effectiveInput=${inputTrimDB.toFixed(1)} dB` +
      (drivePlan.targetReachableByDrive ? '' : `, guardrail leaves ${drivePlan.remainingLU.toFixed(1)} LU`)
  );

  const exportResult = await renderExportWithAutoStaging(
    settings,
    inputTrimDB,
    {
      limiterCeilingOverride,
      sslGlue: proDynamics.sslGlue,
      initialOutputTrimDB: proDynamics.outputTrimDB,
      targetLUFS: preset.lufs,
      ceilingDBTP: limiterCeilingOverride ?? preset.ceiling,
      autoStage: proDynamics.autoStageOnExport,
    }
  );

  const wavBlob = await audioProcessor.exportAsWAV(exportResult.buffer);

  return {
    buffer: exportResult.buffer,
    wavBlob,
    report: exportResult.report,
    outputTrimDB: exportResult.outputTrimDB,
    iterations: exportResult.iterations,
    staged: exportResult.staged,
    inputTrimDB,
    loudnessDriveDB: drivePlan.preLimiterDriveDB,
    limiterBackend: exportResult.limiterBackend,
    latencySamples: exportResult.latencySamples,
  };
}
