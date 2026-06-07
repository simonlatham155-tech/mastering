import type { ProcessingSettings } from './audio-processor';
import { audioProcessor } from './audio-processor';
import {
  clampOutputTrimDB,
  computeStagingTrimStep,
  DEFAULT_MAX_STAGING_ITERATIONS,
  DEFAULT_STAGING_TOLERANCE_LU,
  isOnLufsTarget,
} from '../utils/auto-staging';
import {
  buildExportQualityReport,
  measureBufferLoudness,
  type ExportQualityReport,
} from '../utils/measure-buffer-loudness';
import { measureBufferTruePeak } from '../utils/measure-buffer-true-peak';

export interface AutoStageExportOptions {
  limiterCeilingOverride?: number;
  sslGlue?: 'auto' | 'gentle' | 'firm';
  initialOutputTrimDB?: number;
  targetLUFS: number;
  ceilingDBTP: number;
  autoStage?: boolean;
  toleranceLU?: number;
  maxIterations?: number;
}

export interface AutoStageExportResult {
  buffer: AudioBuffer;
  outputTrimDB: number;
  report: ExportQualityReport;
  iterations: number;
  /** True if trim was adjusted from initial */
  staged: boolean;
}

/**
 * Render export with iterative output-trim staging until integrated LUFS
 * meets target (or ceiling/trim limits stop further correction).
 */
export async function renderExportWithAutoStaging(
  settings: ProcessingSettings,
  inputTrimDB: number | undefined,
  options: AutoStageExportOptions
): Promise<AutoStageExportResult> {
  const {
    limiterCeilingOverride,
    sslGlue,
    initialOutputTrimDB = 0,
    targetLUFS,
    ceilingDBTP,
    autoStage = true,
    toleranceLU = DEFAULT_STAGING_TOLERANCE_LU,
    maxIterations = DEFAULT_MAX_STAGING_ITERATIONS,
  } = options;

  let outputTrimDB = clampOutputTrimDB(initialOutputTrimDB);
  let buffer: AudioBuffer | null = null;
  let report: ExportQualityReport | null = null;
  let iterations = 0;

  const maxPasses = autoStage ? maxIterations : 1;

  for (let pass = 0; pass < maxPasses; pass++) {
    iterations = pass + 1;

    buffer = await audioProcessor.renderExport(settings, inputTrimDB, {
      limiterCeilingOverride,
      outputTrimDB,
      sslGlue,
    });

    const lufs = await measureBufferLoudness(buffer);
    const peaks = await measureBufferTruePeak(buffer, ceilingDBTP);
    report = buildExportQualityReport(
      lufs,
      peaks,
      targetLUFS,
      ceilingDBTP,
      toleranceLU
    );

    if (!autoStage || report.onTarget) {
      break;
    }

    const nextTrim = computeStagingTrimStep({
      integratedLUFS: report.integratedLUFS,
      targetLUFS,
      currentOutputTrimDB: outputTrimDB,
      peakDB: report.truePeakDBTP,
      ceilingDBTP,
      toleranceLU,
    });

    if (nextTrim == null || nextTrim === outputTrimDB) {
      break;
    }

    console.log(
      `🎚️ Auto-stage pass ${pass + 1}: ${report.integratedLUFS.toFixed(1)} → target ${targetLUFS} LUFS, trim ${outputTrimDB.toFixed(1)} → ${nextTrim.toFixed(1)} dB`
    );
    outputTrimDB = nextTrim;
  }

  if (!buffer || !report) {
    throw new Error('Export auto-staging failed to produce a buffer');
  }

  return {
    buffer,
    outputTrimDB,
    report,
    iterations,
    staged: Math.abs(outputTrimDB - initialOutputTrimDB) >= 0.05,
  };
}

export { isOnLufsTarget };
