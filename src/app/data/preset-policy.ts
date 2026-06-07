/**
 * PRESET POLICY CLASSIFICATION
 *
 * Single source of truth for preset classification.
 * Tests verify invariants around this policy, they don't define it.
 */

import { GENRE_PRESETS, type GenrePreset } from './genre-presets';

/**
 * Preset classification families.
 *
 * @demo — Non-production presets (A/B comparison only)
 * @tranceFamily — Wide bright synths, multiband OFF
 * @clean — Gentle dynamics, multiband OFF, clipper OFF
 * @balanced — Multiband OFF, clipper optional (modern prog house)
 * @bassHeavy — Aggressive sub control, tight stereo
 * @clubTight — Club multiband ON; mono-bass optional per genre
 */
export type PresetClass =
  | 'demo'
  | 'tranceFamily'
  | 'clean'
  | 'balanced'
  | 'bassHeavy'
  | 'clubTight';

export function classifyPreset(preset: GenrePreset): PresetClass | null {
  const id = preset.id;

  if (id === 'generic') return 'demo';

  if (id === 'trance') return 'tranceFamily';
  if (id === 'uplifting') return 'tranceFamily';
  if (id === 'psytrance') return 'tranceFamily';
  if (id === 'futurebass') return 'tranceFamily';

  if (id === 'progressivehouse') return 'balanced';

  if (id === 'deephouse') return 'clean';
  if (id === 'realprog') return 'clean';
  if (id === 'house') return 'clean';
  if (id === 'melodictechno') return 'clean';
  if (id === 'rnb') return 'clean';
  if (id === 'tape') return 'clean';

  if (id === 'dnb') return 'bassHeavy';
  if (id === 'dubstep') return 'bassHeavy';
  if (id === 'trap') return 'bassHeavy';
  if (id === 'hardstyle') return 'bassHeavy';
  if (id === 'hardcore') return 'bassHeavy';

  if (id === 'techno') return 'clubTight';
  if (id === 'hardtechno') return 'clubTight';
  if (id === 'techhouse') return 'clubTight';
  if (id === 'ukgarage') return 'clubTight';
  if (id === 'breakbeat') return 'clubTight';

  return null;
}

export function requireClassification(preset: GenrePreset): PresetClass {
  const cls = classifyPreset(preset);
  if (!cls) {
    throw new Error(
      `Preset "${preset.id}" (${preset.name}) is not classified in preset-policy.ts. ` +
        `Add it to one of: demo, tranceFamily, clean, balanced, bassHeavy, clubTight.`
    );
  }
  return cls;
}

export function allPresetIds(): string[] {
  return Object.keys(GENRE_PRESETS);
}

export function getPresetsByClass(classification: PresetClass): GenrePreset[] {
  return Object.values(GENRE_PRESETS).filter(
    (preset) => classifyPreset(preset) === classification
  );
}

/** Production presets only — excludes demo/generic. */
export function productionPresetIds(): string[] {
  return allPresetIds().filter((id) => classifyPreset(GENRE_PRESETS[id]) !== 'demo');
}
