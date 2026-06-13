import { finiteDB } from './finite-audio';

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/** Engine-safe combined genre bias + user offset (tonal match / sliders). */
export function clampCombinedBassTilt(genreBassTilt: number, userOffset = 0): number {
  return clamp(finiteDB(genreBassTilt + userOffset, genreBassTilt), -3, 3);
}

export function clampCombinedAirTilt(genreAirTilt: number, userOffset = 0): number {
  return clamp(finiteDB(genreAirTilt + userOffset, genreAirTilt), -3, 3);
}

/** mudCut is a peaking cut at 250 Hz — stacking beyond -6 dB hollows the mix. */
export function clampCombinedMudCut(genreMudCut: number, userOffset = 0): number {
  return clamp(finiteDB(genreMudCut + userOffset, genreMudCut), -6, 0);
}
