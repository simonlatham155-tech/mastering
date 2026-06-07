import { describe, expect, it } from 'vitest';
import {
  getReferenceCurveForGear,
  referenceKeyForGear,
} from '../gear-reference-map';

describe('gear-reference-map', () => {
  it('maps dnb gear to dnb reference curve', () => {
    expect(referenceKeyForGear('dnb')).toBe('dnb');
    expect(getReferenceCurveForGear('dnb')?.name).toBeTruthy();
  });

  it('maps progressivehouse to progressiveHouse curve key', () => {
    expect(referenceKeyForGear('progressivehouse')).toBe('progressiveHouse');
  });

  it('falls back to pop for unknown profiles', () => {
    expect(referenceKeyForGear('trap')).toBe('dubstep');
    expect(getReferenceCurveForGear('generic')?.name).toBeTruthy();
  });
});
