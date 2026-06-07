import type { GearProfileId } from '../components/gear-selector';
import type { ProfileAdjustments } from '../components/profile-adjustments';
import type { SSLGlueMode } from '../components/pro-dynamics-panel';
import { getGenrePreset } from '../data/genre-presets';

export interface SuggestedProDynamics {
  inputTrimDB: number;
  outputTrimDB: number;
  limiterCeilingDBTP: number;
  sslGlue: SSLGlueMode;
  forceMonoBass: boolean;
  monoBassHz: number;
}

export function getSuggestedProfileAdjustments(
  gearProfileId: GearProfileId
): ProfileAdjustments | null {
  const genre = getGenrePreset(gearProfileId);
  if (!genre) return null;

  return {
    lowShelfBoost: genre.biases.bassTilt,
    midRangeAdjust: genre.biases.mudCut,
    highShelfBoost: genre.biases.airTilt,
    stereoWidth: Math.round(genre.biases.width * 100),
  };
}

export function getSuggestedProDynamics(
  gearProfileId: GearProfileId,
  presetCeilingDBTP: number,
  autoInputTrimDB?: number
): SuggestedProDynamics {
  const genre = getGenrePreset(gearProfileId);
  const loudnessStyle = genre?.loudnessStyle ?? 'balanced';

  let sslGlue: SSLGlueMode = 'auto';
  if (loudnessStyle === 'aggressive') sslGlue = 'firm';
  else if (loudnessStyle === 'clean') sslGlue = 'gentle';

  return {
    inputTrimDB: autoInputTrimDB ?? 0,
    outputTrimDB: 0,
    limiterCeilingDBTP: presetCeilingDBTP,
    sslGlue,
    forceMonoBass: genre?.toggles.forceMonoBass ?? false,
    monoBassHz: genre?.biases.monoBassHz ?? 120,
  };
}
