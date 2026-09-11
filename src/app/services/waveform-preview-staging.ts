import type { ProcessingSettings } from './audio-processor';
import { audioProcessor } from './audio-processor';
import { runOutputTrimStagingLoop } from './output-trim-staging-loop';
import { resolveWaveformPreviewSeconds } from '../utils/waveform-preview-duration';
import { resolveLoudnessDrive } from './loudness-drive';
import { getMasteringSourceAnalysis } from './mastering-source-analysis';
import { getGenrePreset } from '../data/genre-presets';

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
  loudnessDriveDB: number;
}

function clampMasteringInputDB(value: number): number {
  return Math.max(-12, Math.min(8, value));
}

/**
 * Render the short waveform preview with the same loudness-development policy
 * as export: guarded pre-limiter drive first, then small post-chain calibration.
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

  const sourceLUFS = getMasteringSourceAnalysis()?.lufs;
  const style = getGenrePreset(settings.genreId)?.loudnessStyle ?? 'balanced';
  const drivePlan = resolveLoudnessDrive({
    inputLUFS: sourceLUFS,
    targetLUFS,
    style,
    logicMode: settings.logicMode,
  });
  const drivenInputTrimDB = clampMasteringInputDB(
    (inputTrimDB ?? 0) + drivePlan.preLimiterDriveDB
  );

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
        drivenInputTrimDB,
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
    loudnessDriveDB: drivePlan.preLimiterDriveDB,
  };
}
