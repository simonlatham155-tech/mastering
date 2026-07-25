import { describe, expect, it } from 'vitest';
import {
  limiterBackendLatencySamples,
  resolveLiveLimiterTopology,
  shouldUseTruePeakWorkletOffline,
} from '../../services/mastering-chain-builder';

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

describe('limiter latency contract', () => {
  it('reports deterministic Faust and FIR latency for export compensation', () => {
    expect(limiterBackendLatencySamples('faust', 44_100)).toBe(220);
    expect(limiterBackendLatencySamples('fir', 44_100)).toBe(226);
    expect(limiterBackendLatencySamples('faust-fir', 44_100)).toBe(446);

    expect(limiterBackendLatencySamples('faust', 48_000)).toBe(240);
    expect(limiterBackendLatencySamples('fir', 48_000)).toBe(245);
    expect(limiterBackendLatencySamples('faust-fir', 48_000)).toBe(485);

    expect(limiterBackendLatencySamples('faust', 96_000)).toBe(480);
    expect(limiterBackendLatencySamples('fir', 96_000)).toBe(485);
    expect(limiterBackendLatencySamples('faust-fir', 96_000)).toBe(965);
    expect(limiterBackendLatencySamples('waveshaper', 96_000)).toBe(0);
  });
});

describe('live/export limiter parity', () => {
  it('requests Faust into FIR for HQ playback', () => {
    expect(resolveLiveLimiterTopology(true, false)).toEqual({
      quality: 'export',
      premium: true,
      useFaustLimiter: true,
      useTruePeakWorklet: true,
    });
  });

  it('keeps dry A/B and low-cost preview out of the premium path', () => {
    expect(resolveLiveLimiterTopology(true, true).premium).toBe(false);
    expect(resolveLiveLimiterTopology(false, false).premium).toBe(false);
  });
});
