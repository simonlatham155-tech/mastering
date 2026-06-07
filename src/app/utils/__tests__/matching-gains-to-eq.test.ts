import { describe, expect, it } from 'vitest';
import {
  matchingAutoGainToOutputTrimDelta,
  matchingGainsToProfileAdjustments,
} from '../matching-gains-to-eq';

describe('matching-gains-to-eq', () => {
  it('folds 10-band gains into 3-band profile sliders', () => {
    const next = matchingGainsToProfileAdjustments(
      {
        bands: [2, 2, 2, -1, -1, -1, -1, 1, 1, 1],
        autoGain: 0,
        warnings: [],
        deltaVisualization: {
          muddy: false,
          dark: false,
          boomy: false,
          harsh: false,
        },
      },
      {
        lowShelfBoost: 0,
        midRangeAdjust: 0,
        highShelfBoost: 0,
        stereoWidth: 85,
      }
    );

    expect(next.lowShelfBoost).toBeCloseTo(2, 1);
    expect(next.midRangeAdjust).toBeCloseTo(-1, 1);
    expect(next.highShelfBoost).toBeCloseTo(1, 1);
  });

  it('clamps auto-gain trim delta', () => {
    expect(matchingAutoGainToOutputTrimDelta(10)).toBe(2);
    expect(matchingAutoGainToOutputTrimDelta(-10)).toBe(-2);
  });
});
