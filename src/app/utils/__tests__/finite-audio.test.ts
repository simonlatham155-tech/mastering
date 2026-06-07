import { describe, expect, test } from 'vitest';
import { ReferenceMatchingController } from '../../services/reference-matching-controller';
import { referenceCurves } from '../../data/reference-curves';
import type { SpectralProfile } from '../../services/spectral-analyzer';
import { finiteDB, finiteLinearGainFromDB } from '../finite-audio';

function testController(): ReferenceMatchingController {
  return new ReferenceMatchingController({} as AudioContext);
}

describe('finite-audio', () => {
  test('finiteLinearGainFromDB rejects NaN', () => {
    expect(finiteLinearGainFromDB(NaN)).toBe(1);
    expect(finiteLinearGainFromDB(-6)).toBeCloseTo(0.501, 2);
  });

  test('finiteDB fallback', () => {
    expect(finiteDB(NaN, -3)).toBe(-3);
  });
});

describe('matching gains NaN safety', () => {
  test('NaN spectral bands produce finite matching gains', () => {
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
    const gains = controller.calculateMatchingGains(
      broken,
      referenceCurves.progressiveHouse,
      0.35
    );

    expect(gains.bands.every(Number.isFinite)).toBe(true);
    expect(Number.isFinite(gains.autoGain)).toBe(true);
  });
});
