import { describe, expect, it } from 'vitest';
import { resolveLoudnessDrive } from '../loudness-drive';

describe('pre-limiter loudness drive', () => {
  it('lets a normal quiet premaster reach a streaming target in Flow', () => {
    const plan = resolveLoudnessDrive({
      inputLUFS: -18,
      targetLUFS: -14,
      style: 'balanced',
      logicMode: 'dynamics',
    });

    expect(plan.preLimiterDriveDB).toBe(4);
    expect(plan.targetReachableByDrive).toBe(true);
    expect(plan.remainingLU).toBe(0);
  });

  it('does not add gain when source is already louder than target', () => {
    const plan = resolveLoudnessDrive({
      inputLUFS: -10,
      targetLUFS: -14,
      style: 'balanced',
      logicMode: 'dynamics',
    });

    expect(plan.preLimiterDriveDB).toBe(-4);
    expect(plan.remainingLU).toBe(0);
  });

  it('stops Flow before chasing an extreme loudness target', () => {
    const plan = resolveLoudnessDrive({
      inputLUFS: -16,
      targetLUFS: -8,
      style: 'balanced',
      logicMode: 'dynamics',
    });

    expect(plan.preLimiterDriveDB).toBe(4.5);
    expect(plan.targetReachableByDrive).toBe(false);
    expect(plan.remainingLU).toBeCloseTo(3.5, 5);
  });

  it('allows Pressure to drive harder for club delivery', () => {
    const plan = resolveLoudnessDrive({
      inputLUFS: -16,
      targetLUFS: -8,
      style: 'balanced',
      logicMode: 'brickwall',
    });

    expect(plan.preLimiterDriveDB).toBe(8);
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

    expect(clean.preLimiterDriveDB).toBe(3);
    expect(balanced.preLimiterDriveDB).toBe(4.5);
  });
});
