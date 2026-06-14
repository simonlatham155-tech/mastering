import { describe, expect, it } from 'vitest';
import {
  formatWaveformPreviewDuration,
  resolveWaveformPreviewSeconds,
  WAVEFORM_PREVIEW_MAX_SECONDS,
} from '../waveform-preview-duration';

describe('resolveWaveformPreviewSeconds', () => {
  it('uses full track when shorter than cap', () => {
    expect(resolveWaveformPreviewSeconds(52)).toBe(52);
    expect(resolveWaveformPreviewSeconds(WAVEFORM_PREVIEW_MAX_SECONDS)).toBe(
      WAVEFORM_PREVIEW_MAX_SECONDS
    );
  });

  it('caps long tracks at 3 minutes', () => {
    expect(resolveWaveformPreviewSeconds(540)).toBe(180);
  });

  it('formats duration for UI copy', () => {
    expect(formatWaveformPreviewDuration(180)).toBe('3 min');
    expect(formatWaveformPreviewDuration(90)).toBe('1m 30s');
  });
});
