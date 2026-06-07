import type { SpectralProfile } from '../services/spectral-analyzer';

/** ISO 266-style 10-band keys used by reference curves and matching controller. */
export interface IsoSpectralBands {
  hz31: number;
  hz63: number;
  hz125: number;
  hz250: number;
  hz500: number;
  hz1k: number;
  hz2k: number;
  hz4k: number;
  hz8k: number;
  hz16k: number;
}

function blend(a: number, b: number, w = 0.5): number {
  return a * w + b * (1 - w);
}

/**
 * Map analyzer semantic bands → ISO bands for reference matching.
 * Approximate mapping until FFT outputs ISO bins directly.
 */
export function profileToIsoBands(profile: SpectralProfile): IsoSpectralBands {
  const b = profile.bands;
  return {
    hz31: b.sub,
    hz63: blend(b.sub, b.low, 0.35),
    hz125: b.low,
    hz250: b.lowMid,
    hz500: b.mid,
    hz1k: blend(b.mid, b.upperMid, 0.45),
    hz2k: b.upperMid,
    hz4k: b.presence,
    hz8k: b.brilliance,
    hz16k: blend(b.air, b.ultraHigh, 0.55),
  };
}

export function isoBandsToArray(bands: IsoSpectralBands): number[] {
  return [
    bands.hz31,
    bands.hz63,
    bands.hz125,
    bands.hz250,
    bands.hz500,
    bands.hz1k,
    bands.hz2k,
    bands.hz4k,
    bands.hz8k,
    bands.hz16k,
  ];
}
