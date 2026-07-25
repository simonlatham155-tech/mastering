import { describe, expect, it, vi } from 'vitest';
import { resolveLimiterFallbacks } from '../mastering-chain-builder';

function failing(name: string, calls: string[]) {
  return async () => {
    calls.push(name);
    throw new Error(`${name} unavailable`);
  };
}

describe('limiter fallback order', () => {
  it('uses Faust + FIR when the complete HQ chain is available', async () => {
    const calls: string[] = [];
    const result = await resolveLimiterFallbacks({
      faustFir: async () => {
        calls.push('faust-fir');
        return 'faust-fir';
      },
      fir: async () => 'fir',
      faust: async () => 'faust',
      waveshaper: () => 'waveshaper',
    });

    expect(result).toBe('faust-fir');
    expect(calls).toEqual(['faust-fir']);
  });

  it('degrades in the documented order and reports each failed backend', async () => {
    const calls: string[] = [];
    const failures = vi.fn();
    const result = await resolveLimiterFallbacks(
      {
        faustFir: failing('faust-fir', calls),
        fir: failing('fir', calls),
        faust: failing('faust', calls),
        waveshaper: () => {
          calls.push('waveshaper');
          return 'waveshaper';
        },
      },
      failures
    );

    expect(result).toBe('waveshaper');
    expect(calls).toEqual(['faust-fir', 'fir', 'faust', 'waveshaper']);
    expect(failures.mock.calls.map(([backend]) => backend)).toEqual([
      'faust-fir',
      'fir',
      'faust',
    ]);
  });

  it('stops at FIR-only when Faust fails but the true-peak guard loads', async () => {
    const calls: string[] = [];
    const result = await resolveLimiterFallbacks({
      faustFir: failing('faust-fir', calls),
      fir: async () => {
        calls.push('fir');
        return 'fir';
      },
      faust: async () => 'faust',
      waveshaper: () => 'waveshaper',
    });

    expect(result).toBe('fir');
    expect(calls).toEqual(['faust-fir', 'fir']);
  });
});
