import { describe, expect, it } from 'vitest';
import {
  buildAppProcessingPlan,
  profileAdjustmentsToUserOverrides,
} from '../app-processing-context';

const baseDynamics = {
  inputTrimDB: null,
  outputTrimDB: 0,
  sslGlue: 'auto' as const,
  autoStageOnExport: true,
  autoStageLive: false,
  limiterCeilingDBTP: null,
  forceMonoBass: false,
  monoBassHz: 120,
};

describe('profile adjustment offsets', () => {
  it('cancels legacy fixed genre EQ when the engineer requests zero offset', () => {
    const plan = buildAppProcessingPlan({
      gearProfile: 'deephouse',
      exportPreset: 'spotify',
      logicMode: 'dynamics',
      circuitDrive: 50,
      profileAdjustments: {
        lowShelfBoost: 0,
        midRangeAdjust: 0,
        highShelfBoost: 0,
        stereoWidth: 50,
      },
      proDynamics: baseDynamics,
    });

    expect(plan.genreBehavior.bassTilt).toBe(0);
    expect(plan.genreBehavior.mudCut).toBe(0);
    expect(plan.genreBehavior.airTilt).toBe(0);
  });

  it('keeps a no-analysis source tonally neutral instead of applying genre defaults', () => {
    const plan = buildAppProcessingPlan({
      gearProfile: 'deephouse',
      exportPreset: 'spotify',
      logicMode: 'dynamics',
      circuitDrive: 50,
      profileAdjustments: {
        lowShelfBoost: 0,
        midRangeAdjust: 0,
        highShelfBoost: 0,
        stereoWidth: 50,
      },
      proDynamics: baseDynamics,
    });

    expect(plan.genreBehavior.bassTilt).toBe(0);
    expect(plan.genreBehavior.mudCut).toBe(0);
    expect(plan.genreBehavior.airTilt).toBe(0);
  });

  it('applies engineer offsets directly on top of the source-relative correction', () => {
    const plan = buildAppProcessingPlan({
      gearProfile: 'deephouse',
      exportPreset: 'spotify',
      logicMode: 'dynamics',
      circuitDrive: 50,
      profileAdjustments: {
        lowShelfBoost: 2,
        midRangeAdjust: -1,
        highShelfBoost: 1.5,
        stereoWidth: 50,
      },
      proDynamics: baseDynamics,
    });

    expect(plan.genreBehavior.bassTilt).toBe(2);
    expect(plan.genreBehavior.mudCut).toBe(-1);
    expect(plan.genreBehavior.airTilt).toBe(1.5);
  });

  it('passes monoBassHz when forceMonoBass is null (genre default)', () => {
    const overrides = profileAdjustmentsToUserOverrides(
      { lowShelfBoost: 0, midRangeAdjust: 0, highShelfBoost: 0, stereoWidth: 50 },
      'dubstep',
      {
        ...baseDynamics,
        forceMonoBass: null,
        monoBassHz: 95,
      }
    );

    expect(overrides.forceMonoBass).toBeUndefined();
    expect(overrides.monoBassHz).toBe(95);
  });

  it('blocks monoBassHz when forceMonoBass is explicitly false', () => {
    const overrides = profileAdjustmentsToUserOverrides(
      { lowShelfBoost: 0, midRangeAdjust: 0, highShelfBoost: 0, stereoWidth: 50 },
      'dubstep',
      {
        ...baseDynamics,
        forceMonoBass: false,
        monoBassHz: 95,
      }
    );

    expect(overrides.forceMonoBass).toBe(false);
    expect(overrides.monoBassHz).toBeUndefined();
  });
});
