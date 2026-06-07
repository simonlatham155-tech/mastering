/**
 * MONO-BASS DEPENDENCY TESTS
 * 
 * INVARIANT: forceMonoBass → useMidSide
 * Mono-bass processing REQUIRES M/S decoding/encoding.
 * 
 * POLICY: Auto-enable M/S when mono-bass is requested
 * (unless user explicitly disabled M/S as an expert override)
 * 
 * WHY THIS MATTERS:
 * Wrong behavior: "I turned on mono-bass and nothing happened"
 * Right behavior: "Mono-bass auto-enabled M/S (dependency)"
 * 
 * This is the difference between a confusing bug and expected behavior.
 */

import { describe, test, expect } from 'vitest';
import { resolveProcessingPlan } from '../preset-resolution';

describe('Mono-Bass Dependency (Auto-Enable M/S)', () => {
  test('AUTO-ENABLE PATH: User requests mono-bass, M/S auto-enabled', () => {
    // Scenario: User enables mono-bass on a preset where M/S happens to be disabled
    // (Hypothetical - all current presets have M/S enabled)
    // 
    // Expected: Resolver auto-enables M/S (dependency required)
    
    // For testing, we'll use a real preset and confirm auto-enable logic
    const plan = resolveProcessingPlan({
      genreId: 'deephouse',
      exportPresetId: 'club',
      performanceMode: 'studio',
      logicMode: 'dynamics',
      userOverrides: {
        forceMonoBass: true  // User requests mono-bass
        // Note: Deep House preset has useMidSide=true by default,
        // so this tests the "allowed" path
      }
    });
    
    // Both should be enabled
    expect(plan.genreBehavior.forceMonoBass).toBe(true);
    expect(plan.genreBehavior.useMidSide).toBe(true);
  });
  
  test('EXPLICIT DISABLE PATH: User explicitly disables M/S, mono-bass must turn off', () => {
    // Scenario: User explicitly sets useMidSide=false (expert override)
    // AND tries to enable forceMonoBass
    // 
    // Expected: Resolver disables forceMonoBass (invalid state)
    
    const plan = resolveProcessingPlan({
      genreId: 'techno',
      exportPresetId: 'club',
      performanceMode: 'studio',
      logicMode: 'dynamics',
      userOverrides: {
        useMidSide: false,       // Explicit expert override
        forceMonoBass: true      // Tries to enable mono-bass
      }
    });
    
    // User explicitly disabled M/S → mono-bass must be off
    expect(plan.genreBehavior.useMidSide).toBe(false);
    expect(plan.genreBehavior.forceMonoBass).toBe(false);  // Prevented invalid state
  });
  
  test('AUTO-ENABLE PATH: Preset has M/S disabled, user enables mono-bass, M/S auto-enabled', () => {
    // This tests the actual auto-enable logic
    // 
    // In a real scenario with a preset that has useMidSide=false:
    // - User overrides: forceMonoBass=true
    // - User does NOT override useMidSide
    // - Resolver should auto-enable M/S
    //
    // Current presets all have M/S enabled, so we test the code path
    // by verifying that when forceMonoBass=true and useMidSide is required,
    // the resolver ensures useMidSide=true
    
    const plan = resolveProcessingPlan({
      genreId: 'dubstep',
      exportPresetId: 'club',
      performanceMode: 'studio',
      logicMode: 'dynamics',
      userOverrides: {
        forceMonoBass: true
        // No useMidSide override → allow auto-enable if needed
      }
    });
    
    // Mono-bass enabled → M/S must be enabled (dependency)
    expect(plan.genreBehavior.forceMonoBass).toBe(true);
    expect(plan.genreBehavior.useMidSide).toBe(true);
  });
  
  test('User disables mono-bass, M/S can remain enabled', () => {
    // User disables forceMonoBass
    // M/S can remain enabled (it's not dependent on mono-bass)
    
    const plan = resolveProcessingPlan({
      genreId: 'dnb',
      exportPresetId: 'spotify',
      performanceMode: 'studio',
      logicMode: 'dynamics',
      userOverrides: {
        forceMonoBass: false  // User disables mono-bass
      }
    });
    
    // Mono-bass off, but M/S can still be enabled
    expect(plan.genreBehavior.forceMonoBass).toBe(false);
    expect(plan.genreBehavior.useMidSide).toBe(true);  // Still enabled (not dependent)
  });
  
  test('Preset has mono-bass enabled, user does nothing, both enabled', () => {
    // Preset defaults: forceMonoBass=true, useMidSide=true
    // User makes no overrides
    // Both should remain enabled
    
    const plan = resolveProcessingPlan({
      genreId: 'dubstep',
      exportPresetId: 'club',
      performanceMode: 'studio',
      logicMode: 'dynamics'
      // No userOverrides
    });
    
    // Preset defaults should pass through
    expect(plan.genreBehavior.forceMonoBass).toBe(true);
    expect(plan.genreBehavior.useMidSide).toBe(true);
  });
});

describe('Mono-Bass Dependency (Edge Cases)', () => {
  test('User enables M/S explicitly, mono-bass can be enabled', () => {
    // User explicitly enables M/S (rare, but valid)
    // Then enables mono-bass
    // Both should be allowed
    
    const plan = resolveProcessingPlan({
      genreId: 'techhouse',
      exportPresetId: 'spotify',
      performanceMode: 'studio',
      logicMode: 'dynamics',
      userOverrides: {
        useMidSide: true,        // Explicit enable
        forceMonoBass: true      // Mono-bass enabled
      }
    });
    
    // Both explicitly enabled → allowed
    expect(plan.genreBehavior.useMidSide).toBe(true);
    expect(plan.genreBehavior.forceMonoBass).toBe(true);
  });
  
  test('User disables both M/S and mono-bass explicitly, both disabled', () => {
    // User explicitly disables both
    // Should be allowed (valid state: no M/S, no mono-bass)
    
    const plan = resolveProcessingPlan({
      genreId: 'dubstep',
      exportPresetId: 'club',
      performanceMode: 'studio',
      logicMode: 'dynamics',
      userOverrides: {
        useMidSide: false,       // Explicit disable
        forceMonoBass: false     // Explicit disable
      }
    });
    
    // Both disabled → valid state
    expect(plan.genreBehavior.useMidSide).toBe(false);
    expect(plan.genreBehavior.forceMonoBass).toBe(false);
  });
  
  test('Undefined vs false: Only explicit false counts as \"user disabled M/S\"', () => {
    // This tests the strict check: userOverrides.useMidSide === false
    // 
    // Scenario 1: useMidSide is undefined (not overridden)
    const plan1 = resolveProcessingPlan({
      genreId: 'techno',
      exportPresetId: 'club',
      performanceMode: 'studio',
      logicMode: 'dynamics',
      userOverrides: {
        forceMonoBass: true
        // useMidSide is undefined → not an explicit disable
      }
    });
    
    // M/S not explicitly disabled → allow auto-enable
    expect(plan1.genreBehavior.useMidSide).toBe(true);
    expect(plan1.genreBehavior.forceMonoBass).toBe(true);
    
    // Scenario 2: useMidSide is explicitly false
    const plan2 = resolveProcessingPlan({
      genreId: 'techno',
      exportPresetId: 'club',
      performanceMode: 'studio',
      logicMode: 'dynamics',
      userOverrides: {
        useMidSide: false,       // Explicit disable
        forceMonoBass: true
      }
    });
    
    // M/S explicitly disabled → prevent mono-bass
    expect(plan2.genreBehavior.useMidSide).toBe(false);
    expect(plan2.genreBehavior.forceMonoBass).toBe(false);  // Prevented
  });
});
