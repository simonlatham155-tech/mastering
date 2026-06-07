/**
 * Single entry for delivery-quality export — used by single-file and batch/album export.
 * Always runs full export chain + auto-staging (same as the Export panel).
 */

import { getExportPreset, type ExportPresetId } from '../data/export-presets';
import type { ProDynamicsSettings } from '../components/pro-dynamics-panel';
import type { ProcessingSettings } from './audio-processor';
import { audioProcessor } from './audio-processor';
import { renderExportWithAutoStaging } from './export-auto-staging';
import type { ExportQualityReport } from '../utils/measure-buffer-loudness';
import {
  resolveEffectiveInputTrimDB,
  resolveLimiterCeilingOverride,
} from './app-processing-context';

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
  /** Override input trim (manual pro dynamics) */
  inputTrimDB?: number;
}

export interface MasterExportResult {
  buffer: AudioBuffer;
  wavBlob: Blob;
  report: ExportQualityReport;
  outputTrimDB: number;
  iterations: number;
  staged: boolean;
  inputTrimDB: number | undefined;
}

/**
 * Full delivery render: export-quality chain → auto-staging → WAV blob.
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
  } = input;

  const preset = getExportPreset(exportPresetId);
  const limiterCeilingOverride = resolveLimiterCeilingOverride(proDynamics);
  const inputTrimDB =
    inputTrimOverride ??
    resolveEffectiveInputTrimDB(proDynamics, autoInputTrimDB);

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
  };
}
