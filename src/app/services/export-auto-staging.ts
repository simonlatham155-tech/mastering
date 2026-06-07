import type { ProcessingSettings } from './audio-processor';
import { audioProcessor } from './audio-processor';
import { isOnLufsTarget } from '../utils/auto-staging';
import type { ExportQualityReport } from '../utils/measure-buffer-loudness';
import { runOutputTrimStagingLoop } from './output-trim-staging-loop';

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
    toleranceLU,
    maxIterations,
  } = options;

  const result = await runOutputTrimStagingLoop({
    initialOutputTrimDB,
    targetLUFS,
    ceilingDBTP,
    autoStage,
    toleranceLU,
    maxIterations,
    logPrefix: 'Auto-stage',
    renderWithTrim: (outputTrimDB) =>
      audioProcessor.renderExport(settings, inputTrimDB, {
        limiterCeilingOverride,
        outputTrimDB,
        sslGlue,
      }),
  });

  return {
    buffer: result.buffer,
    outputTrimDB: result.outputTrimDB,
    report: result.report,
    iterations: result.iterations,
    staged: result.staged,
  };
}

export { isOnLufsTarget };
