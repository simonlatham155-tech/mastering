import type { ProcessingSettings } from './audio-processor';
import { audioProcessor } from './audio-processor';
import { runOutputTrimStagingLoop } from './output-trim-staging-loop';

/** Fewer passes than export — preview is only ~45s and should stay snappy. */
export const WAVEFORM_PREVIEW_MAX_STAGING_ITERATIONS = 3;
export const WAVEFORM_PREVIEW_SECONDS = 45;

export interface WaveformPreviewStagingOptions {
  limiterCeilingOverride?: number;
  sslGlue?: 'auto' | 'gentle' | 'firm';
  initialOutputTrimDB?: number;
  targetLUFS: number;
  ceilingDBTP: number;
  autoStage?: boolean;
  maxSeconds?: number;
}

export interface WaveformPreviewStagingResult {
  buffer: AudioBuffer;
  outputTrimDB: number;
  staged: boolean;
  iterations: number;
}

/**
 * Render the short waveform preview with the same output-trim staging as export.
 * Input headroom trim stays in the chain; staging restores loudness to the delivery target
 * so the cyan waveform (and synced live trim) match what export will deliver.
 */
export async function renderWaveformPreviewWithAutoStaging(
  settings: ProcessingSettings,
  inputTrimDB: number | undefined,
  options: WaveformPreviewStagingOptions
): Promise<WaveformPreviewStagingResult> {
  const {
    limiterCeilingOverride,
    sslGlue,
    initialOutputTrimDB = 0,
    targetLUFS,
    ceilingDBTP,
    autoStage = true,
    maxSeconds = WAVEFORM_PREVIEW_SECONDS,
  } = options;

  const result = await runOutputTrimStagingLoop({
    initialOutputTrimDB,
    targetLUFS,
    ceilingDBTP,
    autoStage,
    maxIterations: WAVEFORM_PREVIEW_MAX_STAGING_ITERATIONS,
    logPrefix: 'Waveform preview stage',
    renderWithTrim: (outputTrimDB) =>
      audioProcessor.renderWaveformPreview(
        settings,
        inputTrimDB,
        maxSeconds,
        limiterCeilingOverride,
        outputTrimDB,
        sslGlue
      ),
  });

  return {
    buffer: result.buffer,
    outputTrimDB: result.outputTrimDB,
    staged: result.staged,
    iterations: result.iterations,
  };
}
