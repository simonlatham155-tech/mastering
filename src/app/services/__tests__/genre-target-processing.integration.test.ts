import { afterEach, describe, expect, it } from 'vitest';
import {
  buildAppProcessingPlan,
  DEFAULT_PRO_DYNAMICS,
  NEUTRAL_PROFILE_ADJUSTMENTS,
  type AppProcessingContext,
} from '../app-processing-context';
import {
  clearMasteringSourceAnalysis,
  setMasteringSourceAnalysis,
} from '../mastering-source-analysis';

function tranceContext(): AppProcessingContext {
  return {
    gearProfile: 'trance',
    exportPreset: 'spotify',
    logicMode: 'dynamics',
    circuitDrive: 30,
    profileAdjustments: { ...NEUTRAL_PROFILE_ADJUSTMENTS },
    proDynamics: { ...DEFAULT_PRO_DYNAMICS },
  };
}

afterEach(() => {
  clearMasteringSourceAnalysis();
});

describe('source-relative genre processing plan', () => {
  it('does not apply the old fixed Trance EQ when the source already fits the target envelope', () => {
    setMasteringSourceAnalysis({
      spectralBalance: { bass: 34, mids: 35, highs: 31 },
      dynamicRange: 8,
    });

    const plan = buildAppProcessingPlan(tranceContext());

    expect(plan.genreBehavior.bassTilt).toBeCloseTo(0, 6);
    expect(plan.genreBehavior.mudCut).toBeCloseTo(0, 6);
    expect(plan.genreBehavior.airTilt).toBeCloseTo(0, 6);
    expect(plan.genreBehavior.width).toBeCloseTo(1, 6);
  });

  it('can cut bass and add air for Trance instead of blindly applying the legacy Trance boosts', () => {
    setMasteringSourceAnalysis({
      spectralBalance: { bass: 50, mids: 30, highs: 20 },
      dynamicRange: 8,
    });

    const plan = buildAppProcessingPlan(tranceContext());

    // Trance target: bass max 39%, highs min 27%.
    // Source-relative correction is approximately -1.1 dB bass / +1.3 dB air.
    expect(plan.genreBehavior.bassTilt).toBeCloseTo(-1.1, 6);
    expect(plan.genreBehavior.airTilt).toBeCloseTo(1.3, 6);
    expect(plan.genreBehavior.mudCut).toBeCloseTo(0, 6);
    expect(plan.genreBehavior.width).toBeCloseTo(1, 6);
  });

  it('stacks engineer profile adjustments on top of the calculated correction', () => {
    setMasteringSourceAnalysis({
      spectralBalance: { bass: 50, mids: 30, highs: 20 },
      dynamicRange: 8,
    });

    const context = tranceContext();
    context.profileAdjustments = {
      lowShelfBoost: 0.5,
      midRangeAdjust: -0.5,
      highShelfBoost: -0.5,
      stereoWidth: 55,
    };

    const plan = buildAppProcessingPlan(context);

    expect(plan.genreBehavior.bassTilt).toBeCloseTo(-0.6, 6);
    expect(plan.genreBehavior.mudCut).toBeCloseTo(-0.5, 6);
    expect(plan.genreBehavior.airTilt).toBeCloseTo(0.8, 6);
    expect(plan.genreBehavior.width).toBeCloseTo(1.03, 6);
  });

  it('stays neutral before any source has been analysed rather than falling back to fixed genre EQ', () => {
    const plan = buildAppProcessingPlan(tranceContext());

    expect(plan.genreBehavior.bassTilt).toBeCloseTo(0, 6);
    expect(plan.genreBehavior.mudCut).toBeCloseTo(0, 6);
    expect(plan.genreBehavior.airTilt).toBeCloseTo(0, 6);
    expect(plan.genreBehavior.width).toBeCloseTo(1, 6);
  });
});
