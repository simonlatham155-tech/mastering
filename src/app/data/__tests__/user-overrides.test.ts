/**
 * USER OVERRIDE TESTS
 *
 * User overrides are ADDITIVE offsets from genre defaults (width, EQ biases).
 * Toggle overrides replace preset defaults.
 */

import { describe, test, expect } from 'vitest';
import { resolveProcessingPlan } from '../preset-resolution';
import { ENGINE_DEFAULTS } from '../genre-presets';

describe('User Overrides Survive to Engine', () => {
  test('User width offset survives (within bounds)', () => {
    const plan = resolveProcessingPlan({
      genreId: 'deephouse',
      exportPresetId: 'spotify',
      performanceMode: 'studio',
      logicMode: 'dynamics',
      userOverrides: {
        width: 0.02, // 1.06 + 0.02 = 1.08
      },
    });

    expect(plan.genreBehavior.width).toBe(1.08);
    expect(plan.source.requestedWidth).toBeCloseTo(1.08, 5);
    expect(plan.source.widthClamped).toBe(false);
  });

  test('User width offset gets clamped by guardrails (live mode)', () => {
    const plan = resolveProcessingPlan({
      genreId: 'trance',
      exportPresetId: 'club',
      performanceMode: 'live',
      logicMode: 'dynamics',
      userOverrides: {
        width: 0.03, // 1.12 + 0.03 = 1.15, exceeds live max
      },
    });

    expect(plan.genreBehavior.width).toBe(ENGINE_DEFAULTS.maxWidth_live);
    expect(plan.source.requestedWidth).toBeCloseTo(1.15, 5);
    expect(plan.source.widthClamped).toBe(true);
  });

  test('User width offset allowed in studio mode', () => {
    const plan = resolveProcessingPlan({
      genreId: 'trance',
      exportPresetId: 'club',
      performanceMode: 'studio',
      logicMode: 'dynamics',
      userOverrides: {
        width: 0.02, // 1.12 + 0.02 = 1.14
      },
    });

    expect(plan.genreBehavior.width).toBeCloseTo(1.14, 5);
    expect(plan.source.widthClamped).toBe(false);
  });

  test('User enables multiband on clean preset (Deep House)', () => {
    const plan = resolveProcessingPlan({
      genreId: 'deephouse',
      exportPresetId: 'club',
      performanceMode: 'studio',
      logicMode: 'dynamics',
      userOverrides: {
        useMultiband: true,
      },
    });

    expect(plan.genreBehavior.useMultiband).toBe(true);
  });

  test('User disables multiband on bass-heavy preset (DnB)', () => {
    const plan = resolveProcessingPlan({
      genreId: 'dnb',
      exportPresetId: 'spotify',
      performanceMode: 'studio',
      logicMode: 'dynamics',
      userOverrides: {
        useMultiband: false,
      },
    });

    expect(plan.genreBehavior.useMultiband).toBe(false);
  });

  test('User enables clipper on clean preset (RnB)', () => {
    const plan = resolveProcessingPlan({
      genreId: 'rnb',
      exportPresetId: 'extreme',
      performanceMode: 'studio',
      logicMode: 'brickwall',
      userOverrides: {
        useClipper: true,
      },
    });

    expect(plan.genreBehavior.useClipper).toBe(true);
  });

  test('User disables mono-bass on bass-heavy preset (Dubstep)', () => {
    const plan = resolveProcessingPlan({
      genreId: 'dubstep',
      exportPresetId: 'spotify',
      performanceMode: 'studio',
      logicMode: 'dynamics',
      userOverrides: {
        forceMonoBass: false,
      },
    });

    expect(plan.genreBehavior.forceMonoBass).toBe(false);
  });

  test('User tweaks EQ bias offsets (bassTilt, airTilt, mudCut)', () => {
    const plan = resolveProcessingPlan({
      genreId: 'progressivehouse',
      exportPresetId: 'club',
      performanceMode: 'studio',
      logicMode: 'dynamics',
      userOverrides: {
        bassTilt: 1.5, // +2 + 1.5 = 3.5
        airTilt: -1.5, // +2 - 1.5 = 0.5
        mudCut: 0, // -2 + 0 = -2
      },
    });

    expect(plan.genreBehavior.bassTilt).toBe(3.5);
    expect(plan.genreBehavior.airTilt).toBe(0.5);
    expect(plan.genreBehavior.mudCut).toBe(-2);
  });

  test('User tweaks colorAmount offset', () => {
    const plan = resolveProcessingPlan({
      genreId: 'tape',
      exportPresetId: 'spotify',
      performanceMode: 'studio',
      logicMode: 'dynamics',
      userOverrides: {
        colorAmount: -0.75, // 0.9 - 0.75 = 0.15
      },
    });

    expect(plan.genreBehavior.colorAmount).toBeCloseTo(0.15, 5);
  });

  test('User tweaks mono-bass crossover frequency', () => {
    const plan = resolveProcessingPlan({
      genreId: 'techno',
      exportPresetId: 'club',
      performanceMode: 'studio',
      logicMode: 'dynamics',
      userOverrides: {
        monoBassHz: 100,
      },
    });

    expect(plan.genreBehavior.monoBassHz).toBe(100);
  });

  test('Multiple user overrides at once', () => {
    const plan = resolveProcessingPlan({
      genreId: 'techhouse',
      exportPresetId: 'club',
      performanceMode: 'studio',
      logicMode: 'brickwall',
      userOverrides: {
        width: 0.12, // 0.9 + 0.12 = 1.02
        useMultiband: false,
        bassTilt: -0.5, // 2 - 0.5 = 1.5
        airTilt: -0.5, // 1.5 - 0.5 = 1.0
        colorAmount: -0.3, // 0.5 - 0.3 = 0.2
      },
    });

    expect(plan.genreBehavior.width).toBe(1.02);
    expect(plan.genreBehavior.useMultiband).toBe(false);
    expect(plan.genreBehavior.bassTilt).toBe(1.5);
    expect(plan.genreBehavior.airTilt).toBe(1);
    expect(plan.genreBehavior.colorAmount).toBe(0.2);
  });

  test('User overrides do NOT affect export preset (delivery targets)', () => {
    const plan = resolveProcessingPlan({
      genreId: 'trance',
      exportPresetId: 'spotify',
      performanceMode: 'studio',
      logicMode: 'dynamics',
      userOverrides: {
        width: -0.04, // 1.12 - 0.04 = 1.08
        useMultiband: true,
      },
    });

    expect(plan.genreBehavior.width).toBe(1.08);
    expect(plan.genreBehavior.useMultiband).toBe(true);
    expect(plan.deliveryTargets.targetLUFS).toBe(-14);
    expect(plan.deliveryTargets.ceiling).toBe(-1.0);
  });

  test('Export preset change does NOT revert user overrides', () => {
    const spotifyPlan = resolveProcessingPlan({
      genreId: 'progressivehouse',
      exportPresetId: 'spotify',
      performanceMode: 'studio',
      logicMode: 'dynamics',
      userOverrides: {
        width: 0.04,
      },
    });

    const clubPlan = resolveProcessingPlan({
      genreId: 'progressivehouse',
      exportPresetId: 'club',
      performanceMode: 'studio',
      logicMode: 'dynamics',
      userOverrides: {
        width: 0.04,
      },
    });

    expect(spotifyPlan.genreBehavior.width).toBe(1.08);
    expect(clubPlan.genreBehavior.width).toBe(1.08);
    expect(spotifyPlan.deliveryTargets.targetLUFS).toBe(-14);
    expect(clubPlan.deliveryTargets.targetLUFS).toBe(-8);
  });
});

describe('User Override Edge Cases', () => {
  test('Width clamped to minWidth (negative offset)', () => {
    const plan = resolveProcessingPlan({
      genreId: 'techno',
      exportPresetId: 'spotify',
      performanceMode: 'studio',
      logicMode: 'dynamics',
      userOverrides: {
        width: -0.62, // 0.92 - 0.62 = 0.30
      },
    });

    expect(plan.genreBehavior.width).toBe(ENGINE_DEFAULTS.minWidth);
    expect(plan.source.widthClamped).toBe(true);
  });

  test('Width clamped to maxWidth_export (studio mode)', () => {
    const plan = resolveProcessingPlan({
      genreId: 'trance',
      exportPresetId: 'club',
      performanceMode: 'studio',
      logicMode: 'dynamics',
      userOverrides: {
        width: 0.88, // 1.12 + 0.88 = 2.00
      },
    });

    expect(plan.genreBehavior.width).toBe(ENGINE_DEFAULTS.maxWidth_export);
    expect(plan.source.widthClamped).toBe(true);
  });

  test('No user overrides returns preset defaults', () => {
    const plan = resolveProcessingPlan({
      genreId: 'deephouse',
      exportPresetId: 'spotify',
      performanceMode: 'studio',
      logicMode: 'dynamics',
    });

    expect(plan.genreBehavior.width).toBe(1.06);
    expect(plan.genreBehavior.useMultiband).toBe(false);
    expect(plan.genreBehavior.useClipper).toBe(false);
  });
});
