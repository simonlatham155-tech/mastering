import { describe, test, expect } from 'vitest';
import {
  computeStagingTrimStep,
  clampOutputTrimDB,
  isOnLufsTarget,
} from '../auto-staging';
import { buildExportQualityReport } from '../measure-buffer-loudness';
import { EXPORT_PRESETS } from '../../data/export-presets';
import { resolveProcessingPlan } from '../../data/preset-resolution';

describe('auto-staging trim correction', () => {
  test('returns null when on target', () => {
    expect(
      computeStagingTrimStep({
        integratedLUFS: -14.1,
        targetLUFS: -14,
        currentOutputTrimDB: 0,
        peakDB: -2,
        ceilingDBTP: -1,
      })
    ).toBeNull();
  });

  test('boosts when quiet with headroom', () => {
    const next = computeStagingTrimStep({
      integratedLUFS: -16,
      targetLUFS: -14,
      currentOutputTrimDB: 0,
      peakDB: -4,
      ceilingDBTP: -1,
    });
    expect(next).toBeGreaterThan(0);
  });

  test('blocks boost when at ceiling', () => {
    const next = computeStagingTrimStep({
      integratedLUFS: -16,
      targetLUFS: -14,
      currentOutputTrimDB: 0,
      peakDB: -0.95,
      ceilingDBTP: -1,
    });
    expect(next).toBeNull();
  });

  test('clamps output trim to ±6 dB', () => {
    expect(clampOutputTrimDB(8)).toBe(6);
    expect(clampOutputTrimDB(-9)).toBe(-6);
  });
});

describe('delivery quality report', () => {
  test('peakOk uses true peak vs ceiling', () => {
    const report = buildExportQualityReport(
      { momentary: -10, shortTerm: -10, integrated: -14, totalBlocks: 100 },
      { truePeakDBTP: -1.1, digitalPeakDB: -1.2, ispDifference: 0.1, source: 'linear' },
      -14,
      -1.0
    );
    expect(report.peakOk).toBe(true);
    expect(report.onTarget).toBe(true);
  });

  test('flags true peak above ceiling', () => {
    const report = buildExportQualityReport(
      { momentary: -8, shortTerm: -8, integrated: -8, totalBlocks: 100 },
      { truePeakDBTP: 0.2, digitalPeakDB: -0.5, ispDifference: 0.7, source: 'worklet' },
      -8,
      -0.5
    );
    expect(report.peakOk).toBe(false);
  });
});

describe('genre × delivery matrix (plan resolution)', () => {
  /** Hero genres for listen QA — cover club, house, trance, bass */
  const heroGenres = [
    'dnb',
    'techno',
    'progressivehouse',
    'deephouse',
    'trance',
    'techhouse',
    'dubstep',
  ] as const;
  const presets = Object.keys(EXPORT_PRESETS) as Array<keyof typeof EXPORT_PRESETS>;

  for (const presetId of presets) {
    const preset = EXPORT_PRESETS[presetId];

    test(`${presetId} preset targets are sane`, () => {
      expect(preset.lufs).toBeLessThan(0);
      expect(preset.ceiling).toBeLessThanOrEqual(0);
      expect(preset.ceiling).toBeGreaterThan(-3);
    });

    for (const genreId of heroGenres) {
      test(`${genreId} + ${presetId} resolves delivery targets`, () => {
        const plan = resolveProcessingPlan({
          genreId,
          exportPresetId: presetId,
          performanceMode: 'studio',
          logicMode: 'dynamics',
        });

        expect(plan.deliveryTargets.targetLUFS).toBe(preset.lufs);
        expect(plan.deliveryTargets.ceiling).toBe(preset.ceiling);
        expect(plan.genreBehavior.loudnessStyle).toMatch(/aggressive|balanced|clean/);
      });

      test(`${genreId} + ${presetId} width stays within engine bounds`, () => {
        const plan = resolveProcessingPlan({
          genreId,
          exportPresetId: presetId,
          performanceMode: 'studio',
          logicMode: 'dynamics',
        });

        expect(plan.genreBehavior.width).toBeGreaterThanOrEqual(0.9);
        expect(plan.genreBehavior.width).toBeLessThanOrEqual(1.15);
      });
    }
  }

  test('isOnLufsTarget tolerance', () => {
    expect(isOnLufsTarget(-14.4, -14)).toBe(true);
    expect(isOnLufsTarget(-15, -14)).toBe(false);
  });
});
