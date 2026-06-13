import { describe, expect, it } from 'vitest';
import {
  clampCombinedAirTilt,
  clampCombinedBassTilt,
  clampCombinedMudCut,
} from '../genre-eq-clamp';

describe('genre-eq-clamp', () => {
  it('caps stacked mudCut so tonal match cannot hollow the mix', () => {
    expect(clampCombinedMudCut(-3, -8)).toBe(-6);
    expect(clampCombinedMudCut(-2, 1)).toBe(-1);
  });

  it('caps air and bass tilts to engine range', () => {
    expect(clampCombinedBassTilt(2, 2)).toBe(3);
    expect(clampCombinedAirTilt(2, -5)).toBe(-3);
  });
});
