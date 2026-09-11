import { describe, expect, it } from 'vitest';
import { getTapeConfig } from '../tape-stage';
import { getTransformerConfig } from '../transformer-stage';

/**
 * These tests protect the mastering methodology rather than a particular
 * aesthetic value. Colour stages must not become hidden EQ/loudness stages.
 */
describe('mastering colour policy', () => {
  it('keeps normal tape genre multipliers in a mastering-safe range', () => {
    for (const genre of ['trance', 'house', 'techno', 'rnb', 'realprog', 'modernprog']) {
      const cfg = getTapeConfig(genre, 100);
      expect(cfg.baseDrive).toBeGreaterThanOrEqual(0);
      expect(cfg.baseDrive).toBeLessThanOrEqual(1);
      expect(cfg.genreMultiplier).toBeGreaterThanOrEqual(0.5);
      expect(cfg.genreMultiplier).toBeLessThanOrEqual(1.1);
    }
  });

  it('keeps transformer defaults below aggressive saturation territory', () => {
    for (const genre of ['trance', 'house', 'techno', 'rnb', 'realprog', 'modernprog']) {
      const cfg = getTransformerConfig(genre);
      expect(cfg.baseDrive).toBeLessThanOrEqual(0.6);
      expect(cfg.saturationAmount).toBeLessThanOrEqual(1.0);
    }
  });

  it('does not use a genre colour stage as a loudness target', () => {
    const tranceTape = getTapeConfig('trance', 50);
    const tranceTransformer = getTransformerConfig('trance');

    expect(tranceTape.baseDrive).toBeCloseTo(0.5, 5);
    expect(tranceTape.genreMultiplier).toBeLessThanOrEqual(1);
    expect(tranceTransformer.baseDrive).toBeLessThan(0.5);
  });
});
