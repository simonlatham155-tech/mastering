import type { ProcessingSettings } from './audio-processor';
import { audioProcessor } from './audio-processor';
import { isOnLufsTarget } from '../utils/auto-staging';
import type { ExportQualityReport } from '../utils/measure-buffer-loudness';
import { runOutputTrimStagingLoop } from './output-trim-staging-loop';
import type { LimiterBackend } from './mastering-chain-builder';

export interface AutoStageExportOptions {
  limiterCeilingOverride?: number;
  sslGlue?: 'auto' | 'gentle' | 'firm';
  initialOutputTrimDB?: number;
  targetLUFS: number;
  ceilingDBTP: number;
  autoStage?: boolean;
  toleranceLU?: number;
  maxIterations?: number;
  onLimiterBackend?: (
    backend: Exclude<LimiterBackend, 'bypass'>,
    latencySamples: number
  ) => void;
}

export interface AutoStageExportResult {
  buffer: AudioBuffer;
  outputTrimDB: number;
  report: ExportQualityReport;
  iterations: number;
  /** True if trim was adjusted from initial */
  staged: boolean;
  limiterBackend: Exclude<LimiterBackend, 'bypass'>;
  latencySamples: number;
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
    onLimiterBackend,
  } = options;
  let limiterBackend: Exclude<LimiterBackend, 'bypass'> | null = null;
  let latencySamples = 0;

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
        onLimiterBackend: (backend, samples) => {
          limiterBackend = backend;
          latencySamples = samples;
          onLimiterBackend?.(backend, samples);
        },
      }),
  });

  if (!limiterBackend) {
    throw new Error('Export render completed without a limiter backend');
  }

  return {
    buffer: result.buffer,
    outputTrimDB: result.outputTrimDB,
    report: result.report,
    iterations: result.iterations,
    staged: result.staged,
    limiterBackend,
    latencySamples,
  };
}

export { isOnLufsTarget };
