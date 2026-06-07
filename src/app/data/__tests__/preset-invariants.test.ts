/**
 * PRESET INVARIANT TESTS
 * 
 * These tests verify behavioral invariants, not JSON snapshots.
 * They protect against regressions by asserting:
 * - Registry integrity (ID matching, uniqueness)
 * - Value invariants (allowed sets, not ranges)
 * - Effective behavior after guardrails (what the engine actually uses)
 * - Policy coverage (all presets classified, all classifications follow rules)
 * 
 * WHAT THIS IS NOT:
 * - Not "taste intent pins" (those are separate)
 * - Not testing the audio engine (that's integration tests)
 * - Not testing JSON structure (that's type checking)
 */

import { describe, test, expect } from 'vitest';
import {
  GENRE_PRESETS,
  ENGINE_DEFAULTS,
  getGenrePreset,
  getEffectiveGuardrail,
  type GenrePreset
} from '../genre-presets';
import { requireClassification, allPresetIds, getPresetsByClass } from '../preset-policy';
import { resolveWidth } from '../preset-resolution';

// ==================== TEST HELPERS ====================

/**
 * Effective width after guardrails.
 * This is what the audio engine actually uses, not the requested width.
 * 
 * CRITICAL: Uses resolveWidth() from preset-resolution.ts
 * This ensures tests verify the SAME logic the engine uses.
 */
function effectiveWidth(
  preset: GenrePreset,
  mode: 'dynamics' | 'brickwall',
  perf: 'live' | 'studio'
): number {
  return resolveWidth(preset.id, perf);
}

// ==================== ENGINE INVARIANTS ====================

describe('Engine Invariants', () => {
  test('Width bounds are sane and ordered', () => {
    expect(ENGINE_DEFAULTS.minWidth).toBeGreaterThanOrEqual(0.5);
    expect(ENGINE_DEFAULTS.minWidth).toBeLessThanOrEqual(ENGINE_DEFAULTS.maxWidth_live);
    expect(ENGINE_DEFAULTS.maxWidth_live).toBeLessThanOrEqual(ENGINE_DEFAULTS.maxWidth_export);
  });

  test('Limiter GR bounds are sane', () => {
    expect(ENGINE_DEFAULTS.maxLimiterGR_dynamics).toBeGreaterThan(0);
    expect(ENGINE_DEFAULTS.maxLimiterGR_brickwall).toBeGreaterThanOrEqual(ENGINE_DEFAULTS.maxLimiterGR_dynamics);
  });

  test('EQ bounds are sane', () => {
    expect(ENGINE_DEFAULTS.maxEQBoost).toBeGreaterThan(0);
    expect(ENGINE_DEFAULTS.maxEQCut).toBeLessThan(0);
    expect(Math.abs(ENGINE_DEFAULTS.maxEQCut)).toBeLessThanOrEqual(Math.abs(ENGINE_DEFAULTS.maxEQBoost));
  });
});

// ==================== REGISTRY INTEGRITY ====================

describe('Preset Registry Integrity', () => {
  test('Registry keys match preset.id', () => {
    for (const [key, preset] of Object.entries(GENRE_PRESETS)) {
      expect(preset.id).toBe(key);
    }
  });

  test('All preset IDs are unique', () => {
    const ids = Object.values(GENRE_PRESETS).map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('getGenrePreset() reaches every preset', () => {
    for (const id of Object.keys(GENRE_PRESETS)) {
      expect(getGenrePreset(id)?.id).toBe(id);
    }
  });

  test('getGenrePreset() returns null for unknown IDs', () => {
    expect(getGenrePreset('unknown')).toBeNull();
    expect(getGenrePreset('')).toBeNull();
    expect(getGenrePreset('not-a-real-preset')).toBeNull();
  });
});

// ==================== PRESET VALUE INVARIANTS ====================

describe('Preset Value Invariants', () => {
  test('monoBassHz ∈ {100, 120, undefined}', () => {
    const allowed = new Set([100, 120]);
    for (const preset of Object.values(GENRE_PRESETS)) {
      const hz = preset.biases.monoBassHz;
      if (hz !== undefined) {
        expect(allowed.has(hz), `${preset.id} has invalid monoBassHz: ${hz}`).toBe(true);
      }
    }
  });

  test('width is within absolute engine bounds', () => {
    for (const preset of Object.values(GENRE_PRESETS)) {
      expect(preset.biases.width).toBeGreaterThanOrEqual(ENGINE_DEFAULTS.minWidth);
      expect(preset.biases.width).toBeLessThanOrEqual(ENGINE_DEFAULTS.maxWidth_export);
    }
  });

  test('colorAmount ∈ [0, 1]', () => {
    for (const preset of Object.values(GENRE_PRESETS)) {
      const c = preset.biases.colorAmount;
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(1);
    }
  });

  test('loudnessStyle is valid', () => {
    const allowed = new Set(['clean', 'balanced', 'aggressive']);
    for (const preset of Object.values(GENRE_PRESETS)) {
      expect(allowed.has(preset.loudnessStyle)).toBe(true);
    }
  });

  test('bassTilt ∈ [-3, +3]', () => {
    for (const preset of Object.values(GENRE_PRESETS)) {
      expect(preset.biases.bassTilt).toBeGreaterThanOrEqual(-3);
      expect(preset.biases.bassTilt).toBeLessThanOrEqual(3);
    }
  });

  test('airTilt ∈ [-3, +3]', () => {
    for (const preset of Object.values(GENRE_PRESETS)) {
      expect(preset.biases.airTilt).toBeGreaterThanOrEqual(-3);
      expect(preset.biases.airTilt).toBeLessThanOrEqual(3);
    }
  });

  test('mudCut ∈ [-6, 0]', () => {
    for (const preset of Object.values(GENRE_PRESETS)) {
      expect(preset.biases.mudCut).toBeGreaterThanOrEqual(-6);
      expect(preset.biases.mudCut).toBeLessThanOrEqual(0);
    }
  });

  test('monoBassHz is only defined when forceMonoBass is true', () => {
    for (const preset of Object.values(GENRE_PRESETS)) {
      if (preset.biases.monoBassHz !== undefined) {
        expect(preset.toggles.forceMonoBass, `${preset.id} has monoBassHz but forceMonoBass is false`).toBe(true);
      }
    }
  });
});

// ==================== EFFECTIVE WIDTH AFTER GUARDRAILS ====================

describe('Effective Width After Guardrails', () => {
  test('Trance: 1.12 clamps to 1.05 in live, passes through in studio', () => {
    const trance = GENRE_PRESETS['trance'];
    expect(trance.biases.width).toBe(1.12);

    // Live mode clamps to maxWidth_live
    expect(effectiveWidth(trance, 'dynamics', 'live')).toBeCloseTo(ENGINE_DEFAULTS.maxWidth_live, 6);
    expect(effectiveWidth(trance, 'brickwall', 'live')).toBeCloseTo(ENGINE_DEFAULTS.maxWidth_live, 6);

    // Studio mode allows full width (1.12 < 1.15)
    expect(effectiveWidth(trance, 'dynamics', 'studio')).toBeCloseTo(1.12, 6);
    expect(effectiveWidth(trance, 'brickwall', 'studio')).toBeCloseTo(1.12, 6);
  });

  test('Future Bass: 1.10 clamps to 1.05 in live, passes through in studio', () => {
    const fb = GENRE_PRESETS['futurebass'];
    expect(fb.biases.width).toBe(1.10);

    expect(effectiveWidth(fb, 'dynamics', 'live')).toBeCloseTo(ENGINE_DEFAULTS.maxWidth_live, 6);
    expect(effectiveWidth(fb, 'dynamics', 'studio')).toBeCloseTo(1.10, 6);
  });

  test('Progressive Trance: 1.12 same behavior as Trance', () => {
    const pt = GENRE_PRESETS['uplifting']; // Progressive Trance ID
    expect(pt.biases.width).toBe(1.12);

    expect(effectiveWidth(pt, 'dynamics', 'live')).toBeCloseTo(ENGINE_DEFAULTS.maxWidth_live, 6);
    expect(effectiveWidth(pt, 'dynamics', 'studio')).toBeCloseTo(1.12, 6);
  });

  test('Progressive House: 1.04 should not clamp in live', () => {
    const ph = GENRE_PRESETS['progressivehouse'];
    expect(ph.biases.width).toBe(1.04);

    // 1.04 < 1.05, so no clamping
    expect(effectiveWidth(ph, 'dynamics', 'live')).toBeCloseTo(1.04, 6);
    expect(effectiveWidth(ph, 'dynamics', 'studio')).toBeCloseTo(1.04, 6);
  });

  test('Deep House: 1.06 clamps to 1.05 in live, passes through in studio', () => {
    const dh = GENRE_PRESETS['deephouse'];
    expect(dh.biases.width).toBe(1.06);

    expect(effectiveWidth(dh, 'dynamics', 'live')).toBeCloseTo(ENGINE_DEFAULTS.maxWidth_live, 6);
    expect(effectiveWidth(dh, 'dynamics', 'studio')).toBeCloseTo(1.06, 6);
  });

  test('Narrow genres never clamp below minWidth', () => {
    for (const preset of Object.values(GENRE_PRESETS)) {
      const effLive = effectiveWidth(preset, 'dynamics', 'live');
      const effStudio = effectiveWidth(preset, 'dynamics', 'studio');

      expect(effLive).toBeGreaterThanOrEqual(ENGINE_DEFAULTS.minWidth);
      expect(effStudio).toBeGreaterThanOrEqual(ENGINE_DEFAULTS.minWidth);
    }
  });
});

// ==================== GUARDRAILS ARE STRICTER-ONLY ====================

describe('Guardrails Are Stricter-Only', () => {
  test('Deep House maxLimiterGR stays <= engine defaults in both modes', () => {
    const dh = GENRE_PRESETS['deephouse'];
    expect(dh.guardrails?.maxLimiterGR).toBe(3);

    const dyn = getEffectiveGuardrail(dh, 'maxLimiterGR', 'dynamics', 'studio');
    expect(dyn).toBeLessThanOrEqual(ENGINE_DEFAULTS.maxLimiterGR_dynamics);
    expect(dyn).toBe(3);

    const brick = getEffectiveGuardrail(dh, 'maxLimiterGR', 'brickwall', 'studio');
    expect(brick).toBeLessThanOrEqual(ENGINE_DEFAULTS.maxLimiterGR_brickwall);
    expect(brick).toBe(3);
  });

  test('RNB maxLimiterGR stays <= engine defaults', () => {
    const rnb = GENRE_PRESETS['rnb'];
    expect(rnb.guardrails?.maxLimiterGR).toBe(3);

    const dyn = getEffectiveGuardrail(rnb, 'maxLimiterGR', 'dynamics', 'studio');
    expect(dyn).toBeLessThanOrEqual(ENGINE_DEFAULTS.maxLimiterGR_dynamics);
  });

  test('Tape maxLimiterGR stays <= engine defaults (strictest)', () => {
    const tape = GENRE_PRESETS['tape'];
    expect(tape.guardrails?.maxLimiterGR).toBe(2);

    const dyn = getEffectiveGuardrail(tape, 'maxLimiterGR', 'dynamics', 'studio');
    expect(dyn).toBeLessThanOrEqual(ENGINE_DEFAULTS.maxLimiterGR_dynamics);
    expect(dyn).toBe(2); // Strictest limiter GR
  });

  test('maxEQBoost never exceeds engine default', () => {
    for (const preset of Object.values(GENRE_PRESETS)) {
      const boost = getEffectiveGuardrail(preset, 'maxEQBoost', 'dynamics', 'studio');
      expect(boost).toBeLessThanOrEqual(ENGINE_DEFAULTS.maxEQBoost);
    }
  });

  test('maxEQCut never becomes less strict than engine default', () => {
    for (const preset of Object.values(GENRE_PRESETS)) {
      const cut = getEffectiveGuardrail(preset, 'maxEQCut', 'dynamics', 'studio');
      // cut is negative. "Stricter" means more negative (closer to -6).
      // Preset override can't move it toward 0 (less strict).
      expect(cut).toBeGreaterThanOrEqual(ENGINE_DEFAULTS.maxEQCut);
    }
  });

  test('maxWidth never exceeds engine maximums', () => {
    for (const preset of Object.values(GENRE_PRESETS)) {
      const widthLive = getEffectiveGuardrail(preset, 'maxWidth', 'dynamics', 'live');
      const widthStudio = getEffectiveGuardrail(preset, 'maxWidth', 'dynamics', 'studio');

      expect(widthLive).toBeLessThanOrEqual(ENGINE_DEFAULTS.maxWidth_live);
      expect(widthStudio).toBeLessThanOrEqual(ENGINE_DEFAULTS.maxWidth_export);
    }
  });
});

// ==================== POLICY COVERAGE ====================

describe('Policy Coverage', () => {
  test('Every preset is classified (no orphans)', () => {
    for (const id of allPresetIds()) {
      const preset = GENRE_PRESETS[id];
      // requireClassification() throws if preset is not classified
      expect(() => requireClassification(preset)).not.toThrow();
    }
  });

  test('Trance family defaults multiband OFF', () => {
    const trancePresets = getPresetsByClass('tranceFamily');
    expect(trancePresets.length).toBeGreaterThan(0); // Sanity check

    for (const preset of trancePresets) {
      expect(preset.toggles.useMultiband, `${preset.id} (tranceFamily) should have multiband OFF`).toBe(false);
    }
  });

  test('Clean presets default multiband OFF and clipper OFF', () => {
    const cleanPresets = getPresetsByClass('clean');
    expect(cleanPresets.length).toBeGreaterThan(0);

    for (const preset of cleanPresets) {
      expect(preset.toggles.useMultiband, `${preset.id} (clean) should have multiband OFF`).toBe(false);
      expect(preset.toggles.useClipper, `${preset.id} (clean) should have clipper OFF`).toBe(false);
    }
  });

  test('Balanced presets default multiband OFF', () => {
    const balancedPresets = getPresetsByClass('balanced');
    expect(balancedPresets.length).toBeGreaterThan(0);

    for (const preset of balancedPresets) {
      expect(preset.toggles.useMultiband, `${preset.id} (balanced) should have multiband OFF`).toBe(false);
    }
  });

  test('Bass-heavy presets default mono-bass ON', () => {
    const bassPresets = getPresetsByClass('bassHeavy');
    expect(bassPresets.length).toBeGreaterThan(0);

    for (const preset of bassPresets) {
      expect(preset.toggles.forceMonoBass, `${preset.id} (bassHeavy) should have mono-bass ON`).toBe(true);
    }
  });

  test('Club-tight presets default multiband ON', () => {
    const clubPresets = getPresetsByClass('clubTight');
    expect(clubPresets.length).toBeGreaterThan(0);

    for (const preset of clubPresets) {
      expect(preset.toggles.useMultiband, `${preset.id} (clubTight) should have multiband ON`).toBe(true);
    }
  });

  test('Club-tight presets with mono-bass enabled also enable M/S', () => {
    const clubPresets = getPresetsByClass('clubTight');

    for (const preset of clubPresets) {
      if (preset.toggles.forceMonoBass) {
        expect(preset.toggles.useMidSide, `${preset.id} mono-bass requires M/S`).toBe(true);
      }
    }
  });
});

// ==================== M/S PROCESSING DEPENDENCY ====================

describe('M/S Processing Dependency', () => {
  test('If forceMonoBass is true, useMidSide must also be true', () => {
    for (const preset of Object.values(GENRE_PRESETS)) {
      if (preset.id === 'generic') continue;
      if (preset.toggles.forceMonoBass) {
        expect(preset.toggles.useMidSide, `${preset.id} has mono-bass but M/S is disabled`).toBe(true);
      }
    }
  });

  test('If useMidSide is false, forceMonoBass must also be false (bidirectional)', () => {
    for (const preset of Object.values(GENRE_PRESETS)) {
      if (preset.id === 'generic') continue;
      if (!preset.toggles.useMidSide) {
        expect(preset.toggles.forceMonoBass, `${preset.id} has M/S disabled but mono-bass enabled`).toBe(false);
      }
    }
  });
});

// ==================== STRUCTURAL VALIDATION ====================

describe('Structural Validation', () => {
  test('All presets have required fields', () => {
    for (const preset of Object.values(GENRE_PRESETS)) {
      expect(preset.id).toBeDefined();
      expect(preset.name).toBeDefined();
      expect(preset.category).toBeDefined();
      expect(preset.description).toBeDefined();
      expect(preset.biases).toBeDefined();
      expect(preset.loudnessStyle).toBeDefined();
      expect(preset.toggles).toBeDefined();
    }
  });

  test('All preset names are unique', () => {
    const names = Object.values(GENRE_PRESETS).map(p => p.name);
    expect(new Set(names).size).toBe(names.length);
  });
});