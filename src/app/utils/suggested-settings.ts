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
  _gearProfileId: GearProfileId
): ProfileAdjustments {
  // Sliders are offsets from the active genre preset; 0 / 50% = no extra tweak.
  return {
    lowShelfBoost: 0,
    midRangeAdjust: 0,
    highShelfBoost: 0,
    stereoWidth: 50,
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
