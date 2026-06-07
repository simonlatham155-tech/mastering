import type { ProcessingSettings } from './audio-processor';
import {
  clampOutputTrimDB,
  computeStagingTrimStep,
  DEFAULT_MAX_STAGING_ITERATIONS,
  DEFAULT_STAGING_TOLERANCE_LU,
} from '../utils/auto-staging';
import {
  buildExportQualityReport,
  measureBufferLoudness,
  type ExportQualityReport,
} from '../utils/measure-buffer-loudness';
import { measureBufferTruePeak } from '../utils/measure-buffer-true-peak';

export interface OutputTrimStagingLoopOptions {
  initialOutputTrimDB?: number;
  targetLUFS: number;
  ceilingDBTP: number;
  autoStage?: boolean;
  toleranceLU?: number;
  maxIterations?: number;
  renderWithTrim: (outputTrimDB: number) => Promise<AudioBuffer>;
  logPrefix?: string;
}

export interface OutputTrimStagingLoopResult {
  buffer: AudioBuffer;
  outputTrimDB: number;
  report: ExportQualityReport;
  iterations: number;
  staged: boolean;
}

/**
 * Iteratively adjust post-chain output trim until integrated LUFS meets target.
 * Shared by full export and short waveform preview renders.
 */
export async function runOutputTrimStagingLoop(
  options: OutputTrimStagingLoopOptions
): Promise<OutputTrimStagingLoopResult> {
  const {
    initialOutputTrimDB = 0,
    targetLUFS,
    ceilingDBTP,
    autoStage = true,
    toleranceLU = DEFAULT_STAGING_TOLERANCE_LU,
    maxIterations = DEFAULT_MAX_STAGING_ITERATIONS,
    renderWithTrim,
    logPrefix = 'Auto-stage',
  } = options;

  let outputTrimDB = clampOutputTrimDB(initialOutputTrimDB);
  let buffer: AudioBuffer | null = null;
  let report: ExportQualityReport | null = null;
  let iterations = 0;

  const maxPasses = autoStage ? maxIterations : 1;

  for (let pass = 0; pass < maxPasses; pass++) {
    iterations = pass + 1;

    buffer = await renderWithTrim(outputTrimDB);

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
      `🎚️ ${logPrefix} pass ${pass + 1}: ${report.integratedLUFS.toFixed(1)} → target ${targetLUFS} LUFS, trim ${outputTrimDB.toFixed(1)} → ${nextTrim.toFixed(1)} dB`
    );
    outputTrimDB = nextTrim;
  }

  if (!buffer || !report) {
    throw new Error('Output trim staging failed to produce a buffer');
  }

  return {
    buffer,
    outputTrimDB,
    report,
    iterations,
    staged: Math.abs(outputTrimDB - initialOutputTrimDB) >= 0.05,
  };
}

/** Type-only re-export for callers building settings objects. */
export type { ProcessingSettings };
