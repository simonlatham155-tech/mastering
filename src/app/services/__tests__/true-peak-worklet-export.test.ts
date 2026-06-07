import { describe, expect, it } from 'vitest';
import { shouldUseTruePeakWorkletOffline } from '../../services/mastering-chain-builder';

describe('shouldUseTruePeakWorkletOffline', () => {
  it('enables worklet for export quality', () => {
    expect(shouldUseTruePeakWorkletOffline('export')).toBe(true);
  });

  it('skips worklet for preview quality', () => {
    expect(shouldUseTruePeakWorkletOffline('preview')).toBe(false);
  });

  it('respects explicit override', () => {
    expect(shouldUseTruePeakWorkletOffline('preview', false, true)).toBe(true);
    expect(shouldUseTruePeakWorkletOffline('export', false, false)).toBe(false);
  });

  it('skips when dry bypass', () => {
    expect(shouldUseTruePeakWorkletOffline('export', true)).toBe(false);
  });
});
