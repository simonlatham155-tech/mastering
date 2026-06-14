import type { ProfileAdjustments } from '../components/profile-adjustments';
import type { MatchingGains } from '../services/reference-matching-controller';
import { finiteDB } from './finite-audio';

function clamp(v: number, min: number, max: number): number {
  const x = finiteDB(v, 0);
  return Math.max(min, Math.min(max, x));
}

/**
 * Fold 10-band ISO corrections into user EQ offsets (added on top of genre defaults).
 * Cuts are capped conservatively — large mid/high cuts cause muffled / "cave" tone.
 */
export function matchingGainsToProfileAdjustments(
  matching: MatchingGains,
  current: ProfileAdjustments
): ProfileAdjustments {
  const g = matching.bands.map((v) => finiteDB(v, 0));
  const lowDelta = (g[0] + g[1] + g[2]) / 3;
  const midDelta = (g[3] + g[4] + g[5] + g[6]) / 4;
  const highDelta = (g[7] + g[8] + g[9]) / 3;

  return {
    ...current,
    lowShelfBoost: clamp(current.lowShelfBoost + lowDelta, -3, 3),
    midRangeAdjust: clamp(current.midRangeAdjust + midDelta, -3, 3),
    highShelfBoost: clamp(current.highShelfBoost + highDelta, -3, 3),
  };
}

/** Optional small output trim nudge from auto-gain compensation (evaluation-safe). */
export function matchingAutoGainToOutputTrimDelta(autoGainDB: number): number {
  return clamp(autoGainDB * 0.5, -2, 2);
}
