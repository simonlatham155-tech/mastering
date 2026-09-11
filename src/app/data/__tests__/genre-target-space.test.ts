import { describe, expect, it } from 'vitest';
import { calculateGenreCorrection, GENRE_TARGET_SPACES } from '../genre-target-space';

describe('genre target-space methodology', () => {
  it('makes no tonal move when a trance source is already inside the target envelope', () => {
    const result = calculateGenreCorrection('trance', {
      spectralBalance: { bass: 34, mids: 36, highs: 30 },
      dynamicRange: 8.5,
    });

    expect(result.bassTiltDB).toBe(0);
    expect(result.airTiltDB).toBe(0);
    expect(result.withinTarget.bass).toBe(true);
    expect(result.withinTarget.highs).toBe(true);
  });

  it('can cut bass for trance when the source already overshoots the genre target', () => {
    const result = calculateGenreCorrection('trance', {
      spectralBalance: { bass: 50, mids: 30, highs: 20 },
      dynamicRange: 8,
    });

    expect(result.bassTiltDB).toBeLessThan(0);
  });

  it('can add air for trance when the source is below the target high-frequency envelope', () => {
    const result = calculateGenreCorrection('trance', {
      spectralBalance: { bass: 35, mids: 45, highs: 20 },
      dynamicRange: 9,
    });

    expect(result.airTiltDB).toBeGreaterThan(0);
  });

  it('never invents a 250 Hz correction from the current three-band analyser', () => {
    const result = calculateGenreCorrection('techno', {
      spectralBalance: { bass: 55, mids: 30, highs: 15 },
      dynamicRange: 5,
    });

    expect(result.mudCutDB).toBe(0);
    expect(result.limitations.some((item) => item.includes('250 Hz'))).toBe(true);
  });

  it('keeps automatic broad-band steering inside mastering-scale guardrails', () => {
    const result = calculateGenreCorrection('deephouse', {
      spectralBalance: { bass: 5, mids: 20, highs: 75 },
      dynamicRange: 15,
    });

    expect(Math.abs(result.bassTiltDB)).toBeLessThanOrEqual(3);
    expect(Math.abs(result.airTiltDB)).toBeLessThanOrEqual(3);
  });

  it('contains a target model for every current genre strategy', () => {
    const expected = [
      'trance', 'uplifting', 'psytrance',
      'progressivehouse', 'house', 'deephouse', 'techhouse',
      'techno', 'melodictechno', 'hardtechno',
      'dnb', 'dubstep', 'trap', 'futurebass',
      'hardstyle', 'hardcore', 'ukgarage', 'breakbeat', 'rnb', 'tape', 'generic',
    ];

    for (const id of expected) {
      expect(GENRE_TARGET_SPACES[id], `missing ${id}`).toBeDefined();
    }
  });
});
