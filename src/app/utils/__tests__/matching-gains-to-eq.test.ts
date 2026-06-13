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

  it('limits extreme mid/high cuts from tonal match', () => {
    const next = matchingGainsToProfileAdjustments(
      {
        bands: [-6, -6, -6, -6, -6, -6, -6, -6, -6, -6],
        autoGain: 0,
        warnings: [],
        deltaVisualization: {
          muddy: true,
          dark: false,
          boomy: false,
          harsh: false,
        },
      },
      {
        lowShelfBoost: 0,
        midRangeAdjust: 0,
        highShelfBoost: 0,
        stereoWidth: 50,
      }
    );

    expect(next.midRangeAdjust).toBe(-3);
    expect(next.highShelfBoost).toBe(-2);
  });

  it('maps auto-gain to output trim delta', () => {
    expect(matchingAutoGainToOutputTrimDelta(10)).toBe(2);
    expect(matchingAutoGainToOutputTrimDelta(-10)).toBe(-2);
  });
});
