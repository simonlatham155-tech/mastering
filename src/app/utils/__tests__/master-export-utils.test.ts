import { describe, expect, it } from 'vitest';
import {
  batchZipFilename,
  computeAutoInputTrimDB,
  masterExportFilename,
} from '../master-export-utils';

describe('master-export-utils', () => {
  it('computeAutoInputTrimDB trims hot peaks', () => {
    expect(computeAutoInputTrimDB(-0.5)).toBeCloseTo(-5.5, 1);
    expect(computeAutoInputTrimDB(-6)).toBeUndefined();
  });

  it('masterExportFilename strips extension', () => {
    expect(masterExportFilename('My Track.wav', 'spotify')).toBe(
      'My Track_spotify_master.wav'
    );
  });

  it('batchZipFilename includes preset', () => {
    expect(batchZipFilename('club')).toMatch(/^latham_album_club_/);
  });
});
