/**
 * Phase 2 QA — spectral reference matching × genre presets.
 * Run after quality-chain parity is signed off (live = waveform = export).
 */
import { describe, expect, test } from 'vitest';
import { ReferenceMatchingController } from '../../services/reference-matching-controller';
import type { SpectralProfile } from '../../services/spectral-analyzer';
import { getReferenceCurveForGear } from '../../utils/gear-reference-map';
import { matchingGainsToProfileAdjustments } from '../../utils/matching-gains-to-eq';
import { NEUTRAL_PROFILE_ADJUSTMENTS } from '../../services/app-processing-context';
import type { GearProfileId } from '../../components/gear-selector';

/** Hero genres from LISTEN_QA.md */
const HERO_GEARS: GearProfileId[] = [
  'dnb',
  'techno',
  'progressivehouse',
  'deephouse',
  'trance',
  'techhouse',
  'dubstep',
];

function flatProfile(offsetDB = -35): SpectralProfile {
  return {
    bands: {
      sub: offsetDB,
      low: offsetDB,
      lowMid: offsetDB,
      mid: offsetDB,
      upperMid: offsetDB,
      presence: offsetDB,
      brilliance: offsetDB,
      air: offsetDB,
      ultraHigh: offsetDB,
      top: offsetDB,
    },
    rmsLevel: -20,
    peakLevel: -6,
  };
}

function testController(): ReferenceMatchingController {
  return new ReferenceMatchingController({} as AudioContext);
}

describe('spectral preset QA (automated gate before ears)', () => {
  for (const gear of HERO_GEARS) {
    test(`${gear}: reference curve exists`, () => {
      expect(getReferenceCurveForGear(gear)).not.toBeNull();
    });

    test(`${gear}: 35% tonal match produces finite profile EQ`, () => {
      const curve = getReferenceCurveForGear(gear);
      expect(curve).not.toBeNull();
      if (!curve) return;

      const controller = testController();
      const gains = controller.calculateMatchingGains(flatProfile(), curve, 0.35);

      expect(gains.bands.every(Number.isFinite)).toBe(true);
      expect(Number.isFinite(gains.autoGain)).toBe(true);

      const profile = matchingGainsToProfileAdjustments(
        gains,
        NEUTRAL_PROFILE_ADJUSTMENTS
      );

      expect(Number.isFinite(profile.lowShelfBoost)).toBe(true);
      expect(Number.isFinite(profile.midRangeAdjust)).toBe(true);
      expect(Number.isFinite(profile.highShelfBoost)).toBe(true);
      expect(profile.lowShelfBoost).toBeGreaterThanOrEqual(-12);
      expect(profile.lowShelfBoost).toBeLessThanOrEqual(12);
      expect(profile.midRangeAdjust).toBeGreaterThanOrEqual(-12);
      expect(profile.midRangeAdjust).toBeLessThanOrEqual(12);
      expect(profile.highShelfBoost).toBeGreaterThanOrEqual(-12);
      expect(profile.highShelfBoost).toBeLessThanOrEqual(12);
    });
  }

  test('broken spectral bands still yield finite hero-genre corrections', () => {
    const broken: SpectralProfile = {
      bands: {
        sub: NaN,
        low: NaN,
        lowMid: -35,
        mid: -35,
        upperMid: -35,
        presence: -35,
        brilliance: -35,
        air: -35,
        ultraHigh: -35,
        top: -35,
      },
      rmsLevel: -20,
      peakLevel: -6,
    };

    const controller = testController();
    for (const gear of HERO_GEARS) {
      const curve = getReferenceCurveForGear(gear);
      if (!curve) continue;
      const gains = controller.calculateMatchingGains(broken, curve, 0.35);
      expect(gains.bands.every(Number.isFinite)).toBe(true);
    }
  });
});
