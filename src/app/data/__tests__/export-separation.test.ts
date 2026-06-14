/**
 * EXPORT PRESET SEPARATION TESTS
 * 
 * Critical architecture protection:
 * Export presets (Spotify, Club, Extreme) ONLY affect delivery targets.
 * They MUST NOT affect genre behavior (toggles, biases, width, mono-bass, etc.).
 * 
 * WHY THIS MATTERS:
 * Without this test, someone will "helpfully" tie export presets into genre toggles:
 * - "Let's turn multiband ON for extreme mode"
 * - "Let's widen stereo for club mode"
 * - "Let's disable M/S for spotify"
 * 
 * Your clean separation rots quietly and you end up back in toggle soup.
 * This test is a guard dog for your architecture.
 * 
 * CRITICAL: This test uses resolveProcessingPlan() - the ACTUAL runtime merge point.
 * It's not testing intermediate objects. It's testing what the engine receives.
 */

import { describe, test, expect } from 'vitest';
import { resolveProcessingPlan, type ResolutionInput } from '../preset-resolution';
import { getExportPreset, type ExportPresetId } from '../export-presets';

describe('Export Preset Separation (Architecture Guard)', () => {
  test('Progressive House: genre behavior identical across all export presets', () => {
    const spotify = resolveProcessingPlan({
      genreId: 'progressivehouse',
      exportPresetId: 'spotify',
      performanceMode: 'studio',
      logicMode: 'dynamics'
    });
    
    const club = resolveProcessingPlan({
      genreId: 'progressivehouse',
      exportPresetId: 'club',
      performanceMode: 'studio',
      logicMode: 'dynamics'
    });
    
    const extreme = resolveProcessingPlan({
      genreId: 'progressivehouse',
      exportPresetId: 'extreme',
      performanceMode: 'studio',
      logicMode: 'dynamics'
    });
    
    // Delivery targets differ (expected)
    expect(spotify.deliveryTargets.targetLUFS).toBe(-14);
    expect(club.deliveryTargets.targetLUFS).toBe(-8);
    expect(extreme.deliveryTargets.targetLUFS).toBe(-6);
    expect(spotify.deliveryTargets.targetLUFS).not.toBe(club.deliveryTargets.targetLUFS);
    expect(club.deliveryTargets.targetLUFS).not.toBe(extreme.deliveryTargets.targetLUFS);
    
    // Genre behavior IDENTICAL (critical - this is what the engine uses)
    expect(spotify.genreBehavior).toEqual(club.genreBehavior);
    expect(club.genreBehavior).toEqual(extreme.genreBehavior);
    
    // Source info should reflect different export presets
    expect(spotify.source.exportPresetId).toBe('spotify');
    expect(club.source.exportPresetId).toBe('club');
    expect(extreme.source.exportPresetId).toBe('extreme');
  });
  
  test('Deep House (clean): export preset cannot enable clipper or multiband', () => {
    const spotify = resolveProcessingPlan({
      genreId: 'deephouse',
      exportPresetId: 'spotify',
      performanceMode: 'studio',
      logicMode: 'dynamics'
    });
    
    const club = resolveProcessingPlan({
      genreId: 'deephouse',
      exportPresetId: 'club',
      performanceMode: 'studio',
      logicMode: 'dynamics'
    });
    
    const extreme = resolveProcessingPlan({
      genreId: 'deephouse',
      exportPresetId: 'extreme',
      performanceMode: 'studio',
      logicMode: 'dynamics'
    });
    
    // Deep House is "clean" - no clipper, no multiband
    expect(spotify.genreBehavior.useClipper).toBe(false);
    expect(spotify.genreBehavior.useMultiband).toBe(false);
    
    // Must be identical across export presets (engine receives same values)
    expect(club.genreBehavior.useClipper).toBe(false);
    expect(extreme.genreBehavior.useClipper).toBe(false);
    
    expect(club.genreBehavior.useMultiband).toBe(false);
    expect(extreme.genreBehavior.useMultiband).toBe(false);
    
    // Full behavior match
    expect(spotify.genreBehavior).toEqual(club.genreBehavior);
    expect(club.genreBehavior).toEqual(extreme.genreBehavior);
  });
  
  test('DnB (bass-heavy): mono-bass stays ON across all export presets', () => {
    const spotify = resolveProcessingPlan({
      genreId: 'dnb',
      exportPresetId: 'spotify',
      performanceMode: 'studio',
      logicMode: 'dynamics'
    });
    
    const club = resolveProcessingPlan({
      genreId: 'dnb',
      exportPresetId: 'club',
      performanceMode: 'studio',
      logicMode: 'dynamics'
    });
    
    const extreme = resolveProcessingPlan({
      genreId: 'dnb',
      exportPresetId: 'extreme',
      performanceMode: 'studio',
      logicMode: 'dynamics'
    });
    
    // Mono-bass follows genre preset across export presets (not delivery-driven)
    expect(spotify.genreBehavior.forceMonoBass).toBe(true);
    expect(spotify.genreBehavior.useMidSide).toBe(true);
    
    expect(club.genreBehavior.forceMonoBass).toBe(true);
    expect(extreme.genreBehavior.forceMonoBass).toBe(true);
    
    expect(spotify.genreBehavior.monoBassHz).toBe(club.genreBehavior.monoBassHz);
    expect(club.genreBehavior.monoBassHz).toBe(extreme.genreBehavior.monoBassHz);
    
    // Full behavior match
    expect(spotify.genreBehavior).toEqual(club.genreBehavior);
    expect(club.genreBehavior).toEqual(extreme.genreBehavior);
  });
  
  test('Trance (trance-family): width and multiband behavior identical', () => {
    const spotify = resolveProcessingPlan({
      genreId: 'trance',
      exportPresetId: 'spotify',
      performanceMode: 'studio',
      logicMode: 'dynamics'
    });
    
    const club = resolveProcessingPlan({
      genreId: 'trance',
      exportPresetId: 'club',
      performanceMode: 'studio',
      logicMode: 'dynamics'
    });
    
    const extreme = resolveProcessingPlan({
      genreId: 'trance',
      exportPresetId: 'extreme',
      performanceMode: 'studio',
      logicMode: 'dynamics'
    });
    
    // Trance is "trance-family" - multiband OFF, wide stereo (1.12)
    expect(spotify.genreBehavior.useMultiband).toBe(false);
    expect(spotify.genreBehavior.width).toBe(1.12);
    
    // Must be identical across export presets
    expect(club.genreBehavior.useMultiband).toBe(false);
    expect(extreme.genreBehavior.useMultiband).toBe(false);
    
    expect(club.genreBehavior.width).toBe(1.12);
    expect(extreme.genreBehavior.width).toBe(1.12);
    
    // Full behavior match
    expect(spotify.genreBehavior).toEqual(club.genreBehavior);
    expect(club.genreBehavior).toEqual(extreme.genreBehavior);
  });
  
  test('All export presets have different LUFS targets', () => {
    const spotify = getExportPreset('spotify');
    const club = getExportPreset('club');
    const extreme = getExportPreset('extreme');
    
    expect(spotify.lufs).toBe(-14);
    expect(club.lufs).toBe(-8);
    expect(extreme.lufs).toBe(-6);
    
    // All different
    expect(spotify.lufs).not.toBe(club.lufs);
    expect(club.lufs).not.toBe(extreme.lufs);
    expect(spotify.lufs).not.toBe(extreme.lufs);
  });
  
  test('Export presets only contain delivery targets (no genre fields)', () => {
    const spotify = getExportPreset('spotify');
    const club = getExportPreset('club');
    const extreme = getExportPreset('extreme');
    
    for (const preset of [spotify, club, extreme]) {
      // Should have delivery targets
      expect(preset.lufs).toBeDefined();
      expect(preset.ceiling).toBeDefined();
      
      // Should NOT have genre behavior fields
      expect((preset as any).biases).toBeUndefined();
      expect((preset as any).toggles).toBeUndefined();
      expect((preset as any).loudnessStyle).toBeUndefined();
      expect((preset as any).width).toBeUndefined();
      expect((preset as any).useMultiband).toBeUndefined();
      expect((preset as any).forceMonoBass).toBeUndefined();
    }
  });
});

describe('Export Preset Coverage', () => {
  test('All genres work with all export presets (no crashes)', () => {
    const exportPresets: ExportPresetId[] = ['spotify', 'club', 'extreme'];
    const genreIds = [
      'dnb', 'dubstep', 'trap', 'futurebass',
      'deephouse', 'techhouse', 'progressivehouse', 'house',
      'techno', 'melodictechno', 'hardtechno',
      'trance', 'psytrance', 'uplifting',
      'hardstyle', 'hardcore',
      'ukgarage', 'breakbeat',
      'rnb', 'tape'
    ];
    
    for (const genreId of genreIds) {
      for (const exportId of exportPresets) {
        // Should not throw
        expect(() => resolveProcessingPlan({
          genreId: genreId,
          exportPresetId: exportId,
          performanceMode: 'studio',
          logicMode: 'dynamics'
        })).not.toThrow();
        
        // Should return valid structure
        const result = resolveProcessingPlan({
          genreId: genreId,
          exportPresetId: exportId,
          performanceMode: 'studio',
          logicMode: 'dynamics'
        });
        expect(result.genreBehavior).toBeDefined();
        expect(result.deliveryTargets).toBeDefined();
      }
    }
  });
});