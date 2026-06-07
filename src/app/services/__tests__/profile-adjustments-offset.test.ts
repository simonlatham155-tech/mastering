import { describe, expect, it } from 'vitest';
import {
  buildAppProcessingPlan,
  profileAdjustmentsToUserOverrides,
} from '../app-processing-context';

describe('profile adjustment offsets', () => {
  it('passes slider values as genre offsets (0 = no extra EQ)', () => {
    const overrides = profileAdjustmentsToUserOverrides(
      { lowShelfBoost: 0, midRangeAdjust: 0, highShelfBoost: 0, stereoWidth: 50 },
      'deephouse'
    );
    expect(overrides.bassTilt).toBe(0);
    expect(overrides.mudCut).toBe(0);
    expect(overrides.airTilt).toBe(0);
  });

  it('applies genre defaults when offsets are zero', () => {
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
      proDynamics: {
        inputTrimDB: null,
        outputTrimDB: 0,
        sslGlue: 'auto',
        autoStageOnExport: true,
        autoStageLive: false,
        limiterCeilingDBTP: null,
        forceMonoBass: false,
        monoBassHz: 120,
      },
    });

    expect(plan.genreBehavior.bassTilt).toBe(1);
    expect(plan.genreBehavior.mudCut).toBe(-1);
    expect(plan.genreBehavior.airTilt).toBe(-2);
  });

  it('adds user offset on top of genre defaults', () => {
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
      proDynamics: {
        inputTrimDB: null,
        outputTrimDB: 0,
        sslGlue: 'auto',
        autoStageOnExport: true,
        autoStageLive: false,
        limiterCeilingDBTP: null,
        forceMonoBass: false,
        monoBassHz: 120,
      },
    });

    expect(plan.genreBehavior.bassTilt).toBe(3);
    expect(plan.genreBehavior.mudCut).toBe(-2);
    expect(plan.genreBehavior.airTilt).toBe(-0.5);
  });
});
