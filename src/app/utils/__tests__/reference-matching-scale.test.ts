import { describe, expect, it } from 'vitest';
import { ReferenceMatchingController } from '../../services/reference-matching-controller';
import { referenceCurves } from '../../data/reference-curves';
import type { SpectralProfile } from '../../services/spectral-analyzer';
import {
  profileToRelativeIsoShape,
  referenceCurveToRelativeShape,
  toRelativeShape,
} from '../spectral-profile-iso';

function testController(): ReferenceMatchingController {
  return new ReferenceMatchingController({} as AudioContext);
}

/** Flat absolute log-energy profile (typical analyzer output scale). */
function flatAbsoluteProfile(levelDb: number): SpectralProfile {
  return {
    bands: {
      sub: levelDb,
      low: levelDb,
      lowMid: levelDb,
      mid: levelDb,
      upperMid: levelDb,
      presence: levelDb,
      brilliance: levelDb,
      air: levelDb,
      ultraHigh: levelDb,
      top: levelDb,
    },
    rmsLevel: levelDb,
    peakLevel: levelDb + 6,
  };
}

describe('reference matching scale', () => {
  it('zero-centers flat absolute profiles', () => {
    const shape = profileToRelativeIsoShape(flatAbsoluteProfile(-35));
    expect(shape.every((v) => Math.abs(v) < 1e-9)).toBe(true);
  });

  it('does not request ~30 dB boosts when comparing absolute user vs relative reference', () => {
    const controller = testController();
    const gains = controller.calculateMatchingGains(
      flatAbsoluteProfile(-35),
      referenceCurves.techno,
      1
    );

    expect(gains.warnings.some((w) => w.includes('clamped to'))).toBe(false);
    expect(gains.bands.every((g) => Math.abs(g) <= 6)).toBe(true);
    expect(Math.max(...gains.bands.map(Math.abs))).toBeLessThan(8);
  });

  it('detects bass-heavy tilt vs techno reference', () => {
    const bassHeavy: SpectralProfile = {
      ...flatAbsoluteProfile(-35),
      bands: {
        ...flatAbsoluteProfile(-35).bands,
        sub: -28,
        low: -30,
        brilliance: -42,
        air: -44,
      },
    };

    const controller = testController();
    const gains = controller.calculateMatchingGains(bassHeavy, referenceCurves.techno, 1);

    // Less high-end than techno wants → positive correction on upper bands
    expect(gains.bands[8]).toBeGreaterThan(0);
    expect(Math.max(...gains.bands.map(Math.abs))).toBeLessThanOrEqual(6);
  });

  it('reference relative shape is zero-mean', () => {
    const shape = referenceCurveToRelativeShape(referenceCurves.house.bands);
    const mean = shape.reduce((s, v) => s + v, 0) / shape.length;
    expect(Math.abs(mean)).toBeLessThan(1e-9);
  });

  it('toRelativeShape is zero-mean', () => {
    const shape = toRelativeShape([1, 2, 3, 4, 5]);
    const mean = shape.reduce((s, v) => s + v, 0) / shape.length;
    expect(Math.abs(mean)).toBeLessThan(1e-9);
  });
});
