/** Max offline waveform preview length (UI cyan region). Full track uses live Play. */
export const WAVEFORM_PREVIEW_MAX_SECONDS = 180;

/** Minimum preview window for very short clips. */
export const WAVEFORM_PREVIEW_MIN_SECONDS = 30;

/**
 * How many seconds of processed waveform to offline-render for the timeline.
 * Short tracks: full length. Long tracks: cap at 3 minutes (balance vs render cost).
 */
export function resolveWaveformPreviewSeconds(trackDurationSec: number): number {
  if (!Number.isFinite(trackDurationSec) || trackDurationSec <= 0) {
    return WAVEFORM_PREVIEW_MIN_SECONDS;
  }
  if (trackDurationSec <= WAVEFORM_PREVIEW_MAX_SECONDS) {
    return trackDurationSec;
  }
  return WAVEFORM_PREVIEW_MAX_SECONDS;
}

export function formatWaveformPreviewDuration(seconds: number): string {
  const rounded = Math.round(seconds);
  if (rounded < 60) return `${rounded}s`;
  const mins = Math.floor(rounded / 60);
  const secs = rounded % 60;
  return secs > 0 ? `${mins}m ${secs}s` : `${mins} min`;
}
