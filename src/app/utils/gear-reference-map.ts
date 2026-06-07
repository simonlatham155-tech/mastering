import type { GearProfileId } from '../components/gear-selector';
import { getReferenceCurve, type ReferenceCurve } from '../data/reference-curves';

/** Map mastering gear profile → reference-curves.ts key. */
const GEAR_TO_REFERENCE_KEY: Partial<Record<GearProfileId, string>> = {
  dnb: 'dnb',
  techno: 'techno',
  melodictechno: 'techno',
  hardtechno: 'techno',
  deephouse: 'deepHouse',
  techhouse: 'techHouse',
  progressivehouse: 'progressiveHouse',
  realprog: 'progressiveHouse',
  trance: 'trance',
  uplifting: 'trance',
  psytrance: 'trance',
  dubstep: 'dubstep',
  house: 'house',
  ukgarage: 'house',
  breakbeat: 'dnb',
  futurebass: 'trance',
  hardstyle: 'techno',
  hardcore: 'techno',
  trap: 'dubstep',
  rnb: 'pop',
  tape: 'lofi',
  generic: 'pop',
};

const DEFAULT_REFERENCE_KEY = 'pop';

export function referenceKeyForGear(gearProfile: GearProfileId): string {
  return GEAR_TO_REFERENCE_KEY[gearProfile] ?? DEFAULT_REFERENCE_KEY;
}

export function getReferenceCurveForGear(gearProfile: GearProfileId): ReferenceCurve | null {
  return getReferenceCurve(referenceKeyForGear(gearProfile));
}
