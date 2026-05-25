/**
 * PRESET POLICY CLASSIFICATION
 * 
 * Single source of truth for preset classification.
 * Tests verify invariants around this policy, they don't define it.
 * 
 * Why this exists:
 * - "clean vs bass-heavy vs trance-family" is product policy, not test logic
 * - Policy belongs in product code, not scattered across test files
 * - Tests should assert "all classified presets follow policy X", not "here's policy X again"
 */

import { GENRE_PRESETS, type GenrePreset } from './genre-presets';

/**
 * Preset classification families.
 * 
 * THESE ARE LAWS, NOT VIBES.
 * Each class enforces specific technical policies to preserve sonic intent.
 * 
 * @tranceFamily
 *   RULE: Preserve wide, bright supersaws and stereo motion.
 *   TECHNICAL: Multiband OFF (no smearing), wide stereo allowed (>1.1), mono-bass optional.
 *   WHY: Trance/Future Bass/Psytrance rely on bright supersaws and stereo width for energy.
 *   INCLUDES: Genres with bright synth layers that need stereo preservation.
 * 
 * @clean
 *   RULE: Gentle dynamics, warm character, minimal aggression.
 *   TECHNICAL: Multiband OFF, clipper OFF, limiter GR caps (≤3dB), low colorAmount.
 *   WHY: Deep House/RNB/Tape prioritize warmth over loudness, dynamics over control.
 *   INCLUDES: Genres where dynamics ARE the musicality.
 * 
 * @bassHeavy
 *   RULE: Aggressive sub control for club/festival safety.
 *   TECHNICAL: Multiband ON, mono-bass ON, clipper ON, tight stereo (≤1.0).
 *   WHY: DnB/Dubstep/Trap need mono sub for club systems, multiband to control variance.
 *   INCLUDES: Genres with powerful sub-bass that must translate to mono.
 * 
 * @clubTight
 *   RULE: Club-safe bass + controlled dynamics for pro DJ use.
 *   TECHNICAL: Multiband ON, mono-bass ON, moderate width (0.9-1.0).
 *   WHY: Techno/Breakbeat need mono sub for club safety + multiband for protective work.
 *   INCLUDES: Four-on-the-floor or breakbeat genres played in clubs.
 */
export type PresetClass =
  | 'tranceFamily'   // Wide bright synths, multiband OFF
  | 'clean'          // Gentle dynamics, minimal aggression
  | 'bassHeavy'      // Aggressive sub control, tight stereo
  | 'clubTight';     // Club-safe bass, controlled dynamics

/**
 * Classify a preset into a family.
 * 
 * Returns null if preset is not classified (safe for product code).
 * Use requireClassification() in tests/dev tooling to enforce coverage.
 * 
 * Explicit and boring by design.
 * Rep is on the line - no clever derivation.
 */
export function classifyPreset(preset: GenrePreset): PresetClass | null {
  const id = preset.id;

  // tranceFamily: Wide bright synths, multiband OFF
  // (Future Bass included: same sonic DNA - bright supersaws, wide stereo)
  if (id === 'trance') return 'tranceFamily';
  if (id === 'uplifting') return 'tranceFamily'; // Progressive Trance
  if (id === 'psytrance') return 'tranceFamily';
  if (id === 'futurebass') return 'tranceFamily';

  // clean: Gentle dynamics, minimal aggression
  if (id === 'deephouse') return 'clean';
  if (id === 'progressivehouse') return 'clean';
  if (id === 'realprog') return 'clean';
  if (id === 'house') return 'clean'; // Classic House
  if (id === 'melodictechno') return 'clean';
  if (id === 'rnb') return 'clean';
  if (id === 'tape') return 'clean';

  // bassHeavy: Aggressive sub control, tight stereo
  if (id === 'dnb') return 'bassHeavy';
  if (id === 'dubstep') return 'bassHeavy';
  if (id === 'trap') return 'bassHeavy';
  if (id === 'hardstyle') return 'bassHeavy';
  if (id === 'hardcore') return 'bassHeavy';

  // clubTight: Club-safe bass, controlled dynamics
  if (id === 'techno') return 'clubTight';
  if (id === 'hardtechno') return 'clubTight';
  if (id === 'techhouse') return 'clubTight';
  if (id === 'ukgarage') return 'clubTight';
  if (id === 'breakbeat') return 'clubTight';

  // Not classified - return null (safe for product code)
  return null;
}

/**
 * Require classification (throws if not classified).
 * 
 * USE THIS IN:
 * - Tests (to enforce all presets are classified)
 * - Dev tooling (to catch missing classifications early)
 * 
 * DO NOT USE IN:
 * - Product code (use classifyPreset() which returns null safely)
 * - Runtime code paths (can crash the app)
 */
export function requireClassification(preset: GenrePreset): PresetClass {
  const cls = classifyPreset(preset);
  if (!cls) {
    throw new Error(
      `Preset "${preset.id}" (${preset.name}) is not classified in preset-policy.ts. ` +
      `Add it to one of: tranceFamily, clean, bassHeavy, clubTight.`
    );
  }
  return cls;
}

/**
 * Get all preset IDs from the registry.
 */
export function allPresetIds(): string[] {
  return Object.keys(GENRE_PRESETS);
}

/**
 * Get all presets in a classification family.
 */
export function getPresetsByClass(classification: PresetClass): GenrePreset[] {
  return Object.values(GENRE_PRESETS).filter(
    preset => classifyPreset(preset) === classification
  );
}