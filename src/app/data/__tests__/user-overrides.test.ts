/**
 * USER OVERRIDE TESTS
 * 
 * Critical policy boundary:
 * Policy defines DEFAULT preset values.
 * Guardrails clamp user tweaks to safe bounds.
 * Policy should NEVER override user choices at render-time.
 * 
 * WHY THIS MATTERS:
 * If you accidentally wire user controls through the "policy enforcer" code path:
 * - User turns multiband ON
 * - Export runs
 * - Policy reverts it silently to OFF
 * - "Your app ruined my mix" emails begin
 * 
 * This test ensures user overrides survive to the engine.
 */

import { describe, test, expect } from 'vitest';
import { resolveProcessingPlan } from '../preset-resolution';
import { ENGINE_DEFAULTS } from '../genre-presets';

describe('User Overrides Survive to Engine', () => {
  test('User width override survives (within bounds)', () => {
    // Deep House default: 0.92
    // User wants: 1.08
    const plan = resolveProcessingPlan({
      genreId: 'deephouse',
      exportPresetId: 'spotify',
      performanceMode: 'studio',
      logicMode: 'dynamics',
      userOverrides: {
        width: 1.08
      }
    });
    
    // Engine should receive user value, not preset default
    expect(plan.genreBehavior.width).toBe(1.08);
    expect(plan.source.requestedWidth).toBe(1.08);
    expect(plan.source.widthClamped).toBe(false);
  });
  
  test('User width override gets clamped by guardrails (live mode)', () => {
    // User wants: 1.15 (too wide for live mode)
    // Live max: 1.05
    const plan = resolveProcessingPlan({
      genreId: 'trance',
      exportPresetId: 'club',
      performanceMode: 'live',  // Stricter clamping
      logicMode: 'dynamics',
      userOverrides: {
        width: 1.15  // Exceeds live limit
      }
    });
    
    // Should clamp to live max, not reject or use preset default
    expect(plan.genreBehavior.width).toBe(ENGINE_DEFAULTS.maxWidth_live);
    expect(plan.source.requestedWidth).toBe(1.15);
    expect(plan.source.widthClamped).toBe(true);
  });
  
  test('User width override allowed in studio mode', () => {
    // Same scenario, but studio mode allows wider
    const plan = resolveProcessingPlan({
      genreId: 'trance',
      exportPresetId: 'club',
      performanceMode: 'studio',  // More permissive
      logicMode: 'dynamics',
      userOverrides: {
        width: 1.15
      }
    });
    
    // Studio mode allows up to 1.15, so 1.15 is fine
    expect(plan.genreBehavior.width).toBe(1.15);
    expect(plan.source.widthClamped).toBe(false);
  });
  
  test('User enables multiband on clean preset (Deep House)', () => {
    // Deep House default: multiband OFF (clean preset)
    // User wants: multiband ON (maybe they know what they're doing)
    const plan = resolveProcessingPlan({
      genreId: 'deephouse',
      exportPresetId: 'club',
      performanceMode: 'studio',
      logicMode: 'dynamics',
      userOverrides: {
        useMultiband: true  // Override clean preset default
      }
    });
    
    // User override should survive, not get reverted by "clean" policy
    expect(plan.genreBehavior.useMultiband).toBe(true);
  });
  
  test('User disables multiband on bass-heavy preset (DnB)', () => {
    // DnB default: multiband ON (bass-heavy preset)
    // User wants: multiband OFF (trusts their mix)
    const plan = resolveProcessingPlan({
      genreId: 'dnb',
      exportPresetId: 'spotify',
      performanceMode: 'studio',
      logicMode: 'dynamics',
      userOverrides: {
        useMultiband: false  // Override bass-heavy default
      }
    });
    
    // User override should survive
    expect(plan.genreBehavior.useMultiband).toBe(false);
  });
  
  test('User enables clipper on clean preset (RnB)', () => {
    // RnB default: clipper OFF (clean preset)
    // User wants: clipper ON (going for modern loudness)
    const plan = resolveProcessingPlan({
      genreId: 'rnb',
      exportPresetId: 'extreme',
      performanceMode: 'studio',
      logicMode: 'brickwall',
      userOverrides: {
        useClipper: true  // Override clean preset default
      }
    });
    
    // User override should survive
    expect(plan.genreBehavior.useClipper).toBe(true);
  });
  
  test('User disables mono-bass on bass-heavy preset (Dubstep)', () => {
    // Dubstep default: mono-bass ON (bass-heavy preset)
    // User wants: mono-bass OFF (stereo sub for headphone mix)
    const plan = resolveProcessingPlan({
      genreId: 'dubstep',
      exportPresetId: 'spotify',
      performanceMode: 'studio',
      logicMode: 'dynamics',
      userOverrides: {
        forceMonoBass: false  // Override bass-heavy default
      }
    });
    
    // User override should survive
    expect(plan.genreBehavior.forceMonoBass).toBe(false);
  });
  
  test('User tweaks EQ biases (bassTilt, airTilt, mudCut)', () => {
    // Progressive House defaults: bassTilt +2.0, airTilt +1.5, mudCut -1.0
    // User wants custom EQ curve
    const plan = resolveProcessingPlan({
      genreId: 'progressivehouse',
      exportPresetId: 'club',
      performanceMode: 'studio',
      logicMode: 'dynamics',
      userOverrides: {
        bassTilt: 3.5,
        airTilt: 0.5,
        mudCut: -2.0
      }
    });
    
    // User overrides should survive
    expect(plan.genreBehavior.bassTilt).toBe(3.5);
    expect(plan.genreBehavior.airTilt).toBe(0.5);
    expect(plan.genreBehavior.mudCut).toBe(-2.0);
  });
  
  test('User tweaks colorAmount (saturation/harmonics)', () => {
    // Tape default: colorAmount 0.40 (40% warm saturation)
    // User wants: colorAmount 0.15 (lighter touch)
    const plan = resolveProcessingPlan({
      genreId: 'tape',
      exportPresetId: 'spotify',
      performanceMode: 'studio',
      logicMode: 'dynamics',
      userOverrides: {
        colorAmount: 0.15
      }
    });
    
    // User override should survive
    expect(plan.genreBehavior.colorAmount).toBe(0.15);
  });
  
  test('User tweaks mono-bass crossover frequency', () => {
    // Techno default: monoBassHz 120
    // User wants: monoBassHz 100 (lower crossover)
    const plan = resolveProcessingPlan({
      genreId: 'techno',
      exportPresetId: 'club',
      performanceMode: 'studio',
      logicMode: 'dynamics',
      userOverrides: {
        monoBassHz: 100
      }
    });
    
    // User override should survive
    expect(plan.genreBehavior.monoBassHz).toBe(100);
  });
  
  test('Multiple user overrides at once', () => {
    // User tweaks multiple parameters simultaneously
    const plan = resolveProcessingPlan({
      genreId: 'techhouse',
      exportPresetId: 'club',
      performanceMode: 'studio',
      logicMode: 'brickwall',
      userOverrides: {
        width: 1.02,
        useMultiband: false,
        bassTilt: 1.5,
        airTilt: 1.0,
        colorAmount: 0.20
      }
    });
    
    // All user overrides should survive
    expect(plan.genreBehavior.width).toBe(1.02);
    expect(plan.genreBehavior.useMultiband).toBe(false);
    expect(plan.genreBehavior.bassTilt).toBe(1.5);
    expect(plan.genreBehavior.airTilt).toBe(1.0);
    expect(plan.genreBehavior.colorAmount).toBe(0.20);
  });
  
  test('User overrides do NOT affect export preset (delivery targets)', () => {
    // User can override genre behavior, but NOT delivery targets
    const plan = resolveProcessingPlan({
      genreId: 'trance',
      exportPresetId: 'spotify',
      performanceMode: 'studio',
      logicMode: 'dynamics',
      userOverrides: {
        width: 1.08,
        useMultiband: true  // Heresy for trance, but user's choice
      }
    });
    
    // Genre behavior overridden
    expect(plan.genreBehavior.width).toBe(1.08);
    expect(plan.genreBehavior.useMultiband).toBe(true);
    
    // Delivery targets unchanged (from export preset)
    expect(plan.deliveryTargets.targetLUFS).toBe(-14);
    expect(plan.deliveryTargets.ceiling).toBe(-1.0);
  });
  
  test('Export preset change does NOT revert user overrides', () => {
    // User tweaks width, then changes export preset
    // User overrides should survive export preset change
    
    const spotifyPlan = resolveProcessingPlan({
      genreId: 'progressivehouse',
      exportPresetId: 'spotify',
      performanceMode: 'studio',
      logicMode: 'dynamics',
      userOverrides: {
        width: 1.08
      }
    });
    
    const clubPlan = resolveProcessingPlan({
      genreId: 'progressivehouse',
      exportPresetId: 'club',
      performanceMode: 'studio',
      logicMode: 'dynamics',
      userOverrides: {
        width: 1.08  // Same user override
      }
    });
    
    // User width should be identical, only LUFS differs
    expect(spotifyPlan.genreBehavior.width).toBe(1.08);
    expect(clubPlan.genreBehavior.width).toBe(1.08);
    expect(spotifyPlan.deliveryTargets.targetLUFS).toBe(-14);
    expect(clubPlan.deliveryTargets.targetLUFS).toBe(-8);
  });
});

describe('User Override Edge Cases', () => {
  test('Width clamped to minWidth (negative or zero not allowed)', () => {
    const plan = resolveProcessingPlan({
      genreId: 'techno',
      exportPresetId: 'spotify',
      performanceMode: 'studio',
      logicMode: 'dynamics',
      userOverrides: {
        width: 0.3  // Below minWidth (0.5)
      }
    });
    
    // Should clamp to minWidth, not crash or allow invalid value
    expect(plan.genreBehavior.width).toBe(ENGINE_DEFAULTS.minWidth);
    expect(plan.source.widthClamped).toBe(true);
  });
  
  test('Width clamped to maxWidth_export (studio mode)', () => {
    const plan = resolveProcessingPlan({
      genreId: 'trance',
      exportPresetId: 'club',
      performanceMode: 'studio',
      logicMode: 'dynamics',
      userOverrides: {
        width: 2.0  // Way beyond maxWidth_export (1.15)
      }
    });
    
    // Should clamp to maxWidth_export
    expect(plan.genreBehavior.width).toBe(ENGINE_DEFAULTS.maxWidth_export);
    expect(plan.source.widthClamped).toBe(true);
  });
  
  test('No user overrides returns preset defaults', () => {
    const plan = resolveProcessingPlan({
      genreId: 'deephouse',
      exportPresetId: 'spotify',
      performanceMode: 'studio',
      logicMode: 'dynamics'
      // No userOverrides
    });
    
    // Should return preset defaults
    expect(plan.genreBehavior.width).toBe(0.92);  // Deep House default
    expect(plan.genreBehavior.useMultiband).toBe(false);
    expect(plan.genreBehavior.useClipper).toBe(false);
  });
});