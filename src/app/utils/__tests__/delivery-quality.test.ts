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

  test('boosts only a small calibration step when quiet with headroom', () => {
    const next = computeStagingTrimStep({
      integratedLUFS: -16,
      targetLUFS: -14,
      currentOutputTrimDB: 0,
      peakDB: -4,
      ceilingDBTP: -1,
    });
    expect(next).toBe(0.5);
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

  test('clamps automatic output trim to fine-calibration ±1.5 dB', () => {
    expect(clampOutputTrimDB(8)).toBe(1.5);
    expect(clampOutputTrimDB(-9)).toBe(-1.5);
  });
});

describe('delivery quality report', () => {
  test('reports a verified pass when loudness and true peak are valid', () => {
    const report = buildExportQualityReport(
      { momentary: -10, shortTerm: -10, integrated: -14, totalBlocks: 100 },
      { truePeakDBTP: -1.1, digitalPeakDB: -1.2, ispDifference: 0.1, source: 'linear' },
      -14,
      -1.0
    );
    expect(report.peakOk).toBe(true);
    expect(report.onTarget).toBe(true);
    expect(report.deliveryStatus).toBe('pass');
    expect(report.deliveryMessage).toContain('Delivery verified');
  });

  test('flags true peak above ceiling as a delivery failure', () => {
    const report = buildExportQualityReport(
      { momentary: -8, shortTerm: -8, integrated: -8, totalBlocks: 100 },
      { truePeakDBTP: 0.2, digitalPeakDB: -0.5, ispDifference: 0.7, source: 'worklet' },
      -8,
      -0.5
    );
    expect(report.peakOk).toBe(false);
    expect(report.deliveryStatus).toBe('peak-fail');
  });

  test('reports a transparent loudness miss instead of pretending target success', () => {
    const report = buildExportQualityReport(
      { momentary: -10, shortTerm: -10, integrated: -10.2, totalBlocks: 100 },
      { truePeakDBTP: -0.6, digitalPeakDB: -0.8, ispDifference: 0.2, source: 'linear' },
      -8,
      -0.5
    );

    expect(report.onTarget).toBe(false);
    expect(report.peakOk).toBe(true);
    expect(report.deliveryStatus).toBe('loudness-limited');
    expect(report.deliveryMessage).toContain('Best verified result');
  });
});

describe('genre × delivery matrix (plan resolution)', () => {
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
