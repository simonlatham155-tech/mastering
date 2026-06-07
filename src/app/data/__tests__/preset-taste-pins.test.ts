/**
 * PRESET TASTE PINS
 * 
 * These are NOT the primary regression protection.
 * They exist to document and lock down specific taste decisions made during audits.
 * 
 * Primary protection = preset-invariants.test.ts (behavioral invariants)
 * Secondary protection = these taste pins (specific JSON values)
 * 
 * WHY SEPARATE:
 * - Invariants protect systemic behavior (all trance = MB OFF)
 * - Taste pins protect specific decisions (Trap width 0.92 > Dubstep 0.9)
 * 
 * These tests are allowed to be brittle JSON snapshots.
 * If they break, it means someone changed a taste decision - that's worth reviewing.
 */

import { describe, test, expect } from 'vitest';
import { GENRE_PRESETS } from '../genre-presets';

describe('Audit Fixes: Taste Intent Pins (Feb 2026)', () => {
  test('Future Bass: multiband OFF + clipper ON (Trance DNA)', () => {
    const futureBass = GENRE_PRESETS['futurebass'];
    expect(futureBass.toggles.useMultiband).toBe(false);
    expect(futureBass.toggles.useClipper).toBe(true);
    expect(futureBass.biases.width).toBe(1.1);
  });

  test('Breakbeat: mono bass enabled @ 100Hz (club genre)', () => {
    const breakbeat = GENRE_PRESETS['breakbeat'];
    expect(breakbeat.toggles.forceMonoBass).toBe(true);
    expect(breakbeat.biases.monoBassHz).toBe(100);
  });

  test('UK Garage: width 1.0 (vocal clarity needs openness)', () => {
    const ukGarage = GENRE_PRESETS['ukgarage'];
    expect(ukGarage.biases.width).toBe(1.0);
  });

  test('Trap differentiation: width 0.92 + airTilt +2.5', () => {
    const trap = GENRE_PRESETS['trap'];
    const dubstep = GENRE_PRESETS['dubstep'];

    // Trap is more open + brighter than Dubstep
    expect(trap.biases.width).toBe(0.92);
    expect(dubstep.biases.width).toBe(0.9);
    expect(trap.biases.airTilt).toBe(2.5);
    expect(dubstep.biases.airTilt).toBe(1.5);

    // Verify Trap is actually wider and brighter
    expect(trap.biases.width).toBeGreaterThan(dubstep.biases.width);
    expect(trap.biases.airTilt).toBeGreaterThan(dubstep.biases.airTilt);
  });

  test('Hardcore: colorAmount 0.65 (brutal not vintage)', () => {
    const hardcore = GENRE_PRESETS['hardcore'];
    expect(hardcore.biases.colorAmount).toBe(0.65);
  });
});

describe('Critical Preset Snapshots', () => {
  test('Progressive House snapshot (complete identity)', () => {
    const ph = GENRE_PRESETS['progressivehouse'];
    expect(ph).toEqual({
      id: 'progressivehouse',
      name: 'Progressive House',
      category: 'House',
      description: 'Emotional builds, open soundstage, club-safe bass',
      biases: {
        bassTilt: 2,
        airTilt: 2,
        mudCut: -2,
        width: 1.04,
        colorAmount: 0.45,
        monoBassHz: 100
      },
      loudnessStyle: 'balanced',
      thdMode: 'pressure',
      toggles: {
        useMultiband: false,
        useClipper: true,
        useMidSide: true,
        forceMonoBass: true
      }
    });
  });

  test('Trance snapshot (preserve bright supersaws)', () => {
    const trance = GENRE_PRESETS['trance'];
    expect(trance).toEqual({
      id: 'trance',
      name: 'Uplifting Trance',
      category: 'Trance',
      description: 'High energy, bright highs, punchy kicks',
      biases: {
        bassTilt: 1,
        airTilt: 3,
        mudCut: -2,
        width: 1.12,
        colorAmount: 0.3,
        monoBassHz: 100
      },
      loudnessStyle: 'balanced',
      thdMode: 'pressure',
      toggles: {
        useMultiband: false,
        useClipper: false,
        useMidSide: true,
        forceMonoBass: true
      }
    });
  });

  test('Deep House snapshot (vintage lush)', () => {
    const dh = GENRE_PRESETS['deephouse'];
    expect(dh).toEqual({
      id: 'deephouse',
      name: 'Deep House',
      category: 'House',
      description: 'Warm low-end, spacious mids, gentle compression',
      biases: {
        bassTilt: 1,
        airTilt: -2,
        mudCut: -1,
        width: 1.06,
        colorAmount: 0.8
      },
      loudnessStyle: 'clean',
      thdMode: 'flow',
      toggles: {
        useMultiband: false,
        useClipper: false,
        useMidSide: true,
        forceMonoBass: false
      },
      guardrails: {
        maxLimiterGR: 3,
        maxEQBoost: 3
      }
    });
  });
});

describe('Width Hierarchy (House Family)', () => {
  test('House family width progression is correct', () => {
    const techHouse = GENRE_PRESETS['techhouse'];
    const classicHouse = GENRE_PRESETS['house'];
    const progressiveHouse = GENRE_PRESETS['progressivehouse'];
    const melodicTechno = GENRE_PRESETS['melodictechno'];
    const deepHouse = GENRE_PRESETS['deephouse'];

    // Tech House (0.90) < Classic House (1.01) < Progressive House (1.04) < Melodic Techno (1.05) < Deep House (1.06)
    expect(techHouse.biases.width).toBe(0.9);
    expect(classicHouse.biases.width).toBe(1.01);
    expect(progressiveHouse.biases.width).toBe(1.04);
    expect(melodicTechno.biases.width).toBe(1.05);
    expect(deepHouse.biases.width).toBe(1.06);

    // Verify ordering
    expect(techHouse.biases.width).toBeLessThan(classicHouse.biases.width);
    expect(classicHouse.biases.width).toBeLessThan(progressiveHouse.biases.width);
    expect(progressiveHouse.biases.width).toBeLessThan(melodicTechno.biases.width);
    expect(melodicTechno.biases.width).toBeLessThan(deepHouse.biases.width);
  });
});
