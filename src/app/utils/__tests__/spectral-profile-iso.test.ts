import { describe, expect, it } from 'vitest';
import { profileToIsoBands, isoBandsToArray } from '../spectral-profile-iso';
import type { SpectralProfile } from '../../services/spectral-analyzer';

const sampleProfile: SpectralProfile = {
  bands: {
    sub: -20,
    low: -18,
    lowMid: -16,
    mid: -14,
    upperMid: -12,
    presence: -10,
    brilliance: -8,
    air: -6,
    ultraHigh: -5,
    top: -4,
  },
  rmsLevel: -14,
  peakLevel: -1,
};

describe('spectral-profile-iso', () => {
  it('maps semantic bands to ISO keys', () => {
    const iso = profileToIsoBands(sampleProfile);
    expect(iso.hz31).toBe(-20);
    expect(iso.hz250).toBe(-16);
    expect(iso.hz4k).toBe(-10);
    expect(isoBandsToArray(iso)).toHaveLength(10);
  });
});
