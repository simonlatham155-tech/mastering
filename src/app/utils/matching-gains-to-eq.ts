import type { ProfileAdjustments } from '../components/profile-adjustments';
import type { MatchingGains } from '../services/reference-matching-controller';

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * Fold 10-band ISO corrections into user EQ offsets (added on top of genre defaults).
 */
export function matchingGainsToProfileAdjustments(
  matching: MatchingGains,
  current: ProfileAdjustments
): ProfileAdjustments {
  const g = matching.bands;
  const lowDelta = (g[0] + g[1] + g[2]) / 3;
  const midDelta = (g[3] + g[4] + g[5] + g[6]) / 4;
  const highDelta = (g[7] + g[8] + g[9]) / 3;

  return {
    ...current,
    lowShelfBoost: clamp(current.lowShelfBoost + lowDelta, -12, 12),
    midRangeAdjust: clamp(current.midRangeAdjust + midDelta, -12, 12),
    highShelfBoost: clamp(current.highShelfBoost + highDelta, -12, 12),
  };
}

/** Optional small output trim nudge from auto-gain compensation (evaluation-safe). */
export function matchingAutoGainToOutputTrimDelta(autoGainDB: number): number {
  return clamp(autoGainDB * 0.5, -2, 2);
}
