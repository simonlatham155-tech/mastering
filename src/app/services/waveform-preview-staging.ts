import type { ProcessingSettings } from './audio-processor';
import { audioProcessor } from './audio-processor';
import { runOutputTrimStagingLoop } from './output-trim-staging-loop';
import { resolveWaveformPreviewSeconds } from '../utils/waveform-preview-duration';

/** Fewer passes than export — preview window is capped for render time. */
export const WAVEFORM_PREVIEW_MAX_STAGING_ITERATIONS = 3;
/** @deprecated Use resolveWaveformPreviewSeconds(trackDuration) */
export const WAVEFORM_PREVIEW_SECONDS = 180;

export interface WaveformPreviewStagingOptions {
  limiterCeilingOverride?: number;
  sslGlue?: 'auto' | 'gentle' | 'firm';
  initialOutputTrimDB?: number;
  targetLUFS: number;
  ceilingDBTP: number;
  autoStage?: boolean;
  maxSeconds?: number;
  quality?: 'preview' | 'export';
  preserveMultiband?: boolean;
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
    maxSeconds,
    quality = 'preview',
    preserveMultiband = false,
  } = options;

  const previewSeconds =
    maxSeconds ??
    resolveWaveformPreviewSeconds(audioProcessor.getOriginalBuffer()?.duration ?? 0);

  const result = await runOutputTrimStagingLoop({
    initialOutputTrimDB,
    targetLUFS,
    ceilingDBTP,
    autoStage,
    maxIterations: WAVEFORM_PREVIEW_MAX_STAGING_ITERATIONS,
    logPrefix: quality === 'export' ? 'HQ waveform stage' : 'Waveform preview stage',
    renderWithTrim: (outputTrimDB) =>
      audioProcessor.renderWaveformPreview(
        settings,
        inputTrimDB,
        previewSeconds,
        limiterCeilingOverride,
        outputTrimDB,
        sslGlue,
        { quality, preserveMultiband }
      ),
  });

  return {
    buffer: result.buffer,
    outputTrimDB: result.outputTrimDB,
    staged: result.staged,
    iterations: result.iterations,
  };
}
