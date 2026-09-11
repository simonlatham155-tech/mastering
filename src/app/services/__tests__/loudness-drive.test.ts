import { describe, expect, it } from 'vitest';
import { resolveLoudnessDrive } from '../loudness-drive';

describe('pre-limiter loudness drive', () => {
  it('lets a normal quiet premaster reach a streaming target in Flow without double-counting limiter makeup', () => {
    const plan = resolveLoudnessDrive({
      inputLUFS: -18,
      targetLUFS: -14,
      style: 'balanced',
      logicMode: 'dynamics',
    });

    expect(plan.preLimiterDriveDB).toBe(3);
    expect(plan.limiterMakeupAllowanceDB).toBe(1);
    expect(plan.totalPlannedDriveDB).toBe(4);
    expect(plan.targetReachableByDrive).toBe(true);
    expect(plan.remainingLU).toBe(0);
  });

  it('does not duplicate attenuation when source is already louder than target', () => {
    const plan = resolveLoudnessDrive({
      inputLUFS: -10,
      targetLUFS: -14,
      style: 'balanced',
      logicMode: 'dynamics',
    });

    expect(plan.preLimiterDriveDB).toBe(0);
    expect(plan.limiterMakeupAllowanceDB).toBe(-4);
    expect(plan.totalPlannedDriveDB).toBe(-4);
    expect(plan.remainingLU).toBe(0);
  });

  it('stops Flow before chasing an extreme loudness target', () => {
    const plan = resolveLoudnessDrive({
      inputLUFS: -16,
      targetLUFS: -8,
      style: 'balanced',
      logicMode: 'dynamics',
    });

    expect(plan.preLimiterDriveDB).toBe(3.5);
    expect(plan.limiterMakeupAllowanceDB).toBe(1);
    expect(plan.totalPlannedDriveDB).toBe(4.5);
    expect(plan.targetReachableByDrive).toBe(false);
    expect(plan.remainingLU).toBeCloseTo(3.5, 5);
  });

  it('does not double-drive Pressure because Stage 6 already owns its club makeup allowance', () => {
    const plan = resolveLoudnessDrive({
      inputLUFS: -16,
      targetLUFS: -8,
      style: 'balanced',
      logicMode: 'brickwall',
    });

    expect(plan.preLimiterDriveDB).toBe(0);
    expect(plan.limiterMakeupAllowanceDB).toBe(8);
    expect(plan.totalPlannedDriveDB).toBe(8);
    expect(plan.targetReachableByDrive).toBe(true);
  });

  it('keeps clean Flow more conservative than balanced Flow', () => {
    const clean = resolveLoudnessDrive({
      inputLUFS: -18,
      targetLUFS: -12,
      style: 'clean',
      logicMode: 'dynamics',
    });
    const balanced = resolveLoudnessDrive({
      inputLUFS: -18,
      targetLUFS: -12,
      style: 'balanced',
      logicMode: 'dynamics',
    });

    expect(clean.preLimiterDriveDB).toBe(2);
    expect(clean.totalPlannedDriveDB).toBe(3);
    expect(balanced.preLimiterDriveDB).toBe(3.5);
    expect(balanced.totalPlannedDriveDB).toBe(4.5);
  });
});
