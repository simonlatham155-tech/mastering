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

  it('keeps automatic reference matching inside ±3 dB mastering guardrails', () => {
    const controller = testController();
    const gains = controller.calculateMatchingGains(
      flatAbsoluteProfile(-35),
      referenceCurves.techno,
      1
    );

    expect(gains.bands.every((g) => Math.abs(g) <= 3)).toBe(true);
    expect(Math.abs(gains.autoGain)).toBeLessThanOrEqual(2);
  });

  it('detects bass-heavy tilt vs techno reference and cuts rather than boosts the excess', () => {
    const bassHeavy: SpectralProfile = {
      ...flatAbsoluteProfile(-35),
      bands: {
        ...flatAbsoluteProfile(-35).bands,
        sub: -20,
        low: -24,
        brilliance: -42,
        air: -44,
      },
    };

    const controller = testController();
    const gains = controller.calculateMatchingGains(bassHeavy, referenceCurves.techno, 1);

    expect(gains.bands[0]).toBeLessThan(0);
    expect(gains.deltaVisualization.boomy).toBe(true);
    expect(gains.bands[8]).toBeGreaterThan(0);
    expect(Math.max(...gains.bands.map(Math.abs))).toBeLessThanOrEqual(3);
  });

  it('does not call a sub-deficient track boomy', () => {
    const bassLight: SpectralProfile = {
      ...flatAbsoluteProfile(-35),
      bands: {
        ...flatAbsoluteProfile(-35).bands,
        sub: -50,
        low: -46,
      },
    };

    const controller = testController();
    const gains = controller.calculateMatchingGains(bassLight, referenceCurves.techno, 1);

    expect(gains.bands[0]).toBeGreaterThan(0);
    expect(gains.deltaVisualization.boomy).toBe(false);
  });

  it('marks excess presence as harsh only when the correction direction is downward', () => {
    const harsh: SpectralProfile = {
      ...flatAbsoluteProfile(-35),
      bands: {
        ...flatAbsoluteProfile(-35).bands,
        presence: -18,
        brilliance: -20,
      },
    };

    const controller = testController();
    const gains = controller.calculateMatchingGains(harsh, referenceCurves.trance, 1);

    // 4 kHz is ISO band index 7.
    expect(gains.bands[7]).toBeLessThan(0);
    expect(gains.deltaVisualization.harsh).toBe(true);
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
