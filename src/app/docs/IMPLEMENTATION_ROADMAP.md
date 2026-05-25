# LATHAM AUDIO IMPLEMENTATION ROADMAP

**Last Updated**: Current Session  
**Status**: Phase 1 Complete ✅ | Phase 2-3 Pending 🚧

---

## Executive Summary

We've established a **coherent mastering product** with:
- ✅ Intentional preset design (house family progression)
- ✅ Rational multiband strategy (protective, not default crutch)
- ✅ Honest width hierarchy (no micro-optimization lies)
- ✅ Critical invariants enforced (HPF before width scaling)
- ✅ **No-regressions test suite** (locks down all design decisions)

**Next**: Deliver on loudnessStyle promise, then add controlled user flexibility.

---

## Three-Phase Plan

### ✅ Phase 1: Lock Down Intent (COMPLETE)

**Goal**: Protect design decisions from future regressions  
**Status**: ✅ **SHIPPED**

#### Deliverables
1. ✅ **No-Regressions Test Suite** (`/src/app/data/genre-presets.test.ts`)
   - Validates preset intent, not sound output
   - Prevents accidental multiband re-enabling
   - Enforces width limits and mono-bass rules
   - Locks Progressive House identity
   - Snapshots critical presets

2. ✅ **Critical Invariant Documented** (`/src/app/services/audio-processor.ts`)
   - HPF applied BEFORE width scaling
   - Prevents low-mid collapse with width < 1.0
   - Comment guards against future breakage

3. ✅ **Multiband Escape Hatch Documented**
   - Trance family presets annotated with conditional enablement
   - Prevents "fix" PRs that re-enable multiband
   - Clear reasoning for defaults

#### Test Suite Coverage
```bash
npm test
```

**Tests**:
- ✅ Trance family never defaults to multiband ON
- ✅ Width never exceeds engine limits (0.9–1.15)
- ✅ Progressive House stays MB OFF + clipper ON
- ✅ Clean genres stay clean (no clipper/multiband)
- ✅ Bass genres require mono-bass
- ✅ House family width progression validated
- ✅ Multiband strategy enforced
- ✅ Complete preset snapshots

#### Why This Came First

Without this test suite, one future refactor will:
- Re-enable multiband for Trance
- Widen something past engine limits
- Disable mono-bass on bass genres
- Reintroduce fantasy values

**And you won't notice until users complain.**

---

### 🚧 Phase 2: Limiter Style Audit (NEXT)

**Goal**: Make `loudnessStyle` promise match reality  
**Status**: 🚧 **SPECIFIED** (not yet implemented)  
**Priority**: Quality polish (post no-regressions)

#### Current State
Genre presets define `loudnessStyle: 'aggressive' | 'balanced' | 'clean'`, but this is **not yet wired** into limiter/compressor behavior.

**All genres currently use the same limiter settings.**

#### Required Implementation

**File**: `/src/app/services/audio-processor.ts`  
**Method**: `createWeissLimiterStage()`

**Add loudnessStyle-specific parameters**:

```typescript
const genrePreset = getGenrePreset(settings.genreId);
const loudnessStyle = genrePreset?.loudnessStyle ?? 'balanced';

switch (loudnessStyle) {
  case 'aggressive':
    limiter.attack.value = 0.001;  // 1ms - catch transients fast
    limiter.release.value = 0.05;  // 50ms - pump energy
    maxAllowedGR = 8;              // Allow heavy limiting
    break;
    
  case 'balanced':
    limiter.attack.value = 0.002;  // 2ms - natural
    limiter.release.value = 0.1;   // 100ms - SSL Auto range
    maxAllowedGR = 6;              // Moderate GR
    break;
    
  case 'clean':
    limiter.attack.value = 0.008;  // 8ms - preserve transients
    limiter.release.value = 0.3;   // 300ms - slow, transparent
    maxAllowedGR = 3;              // Minimal GR
    break;
}
```

#### Validation Matrix

| Genre | Style | Target LUFS | Expected GR | Attack | Release |
|-------|-------|-------------|-------------|--------|---------|
| DnB | Aggressive | -8 | 6-8dB | 1ms | 50ms |
| Techno | Aggressive | -8 | 6-8dB | 1ms | 50ms |
| Progressive House | Balanced | -14 | 3-5dB | 2ms | 100ms |
| Trance | Balanced | -14 | 3-5dB | 2ms | 100ms |
| Deep House | Clean | -14 | 1-3dB | 8ms | 300ms |
| RNB | Clean | -14 | 1-3dB | 8ms | 300ms |

#### Success Criteria

**Aggressive** passes if:
- ✅ Limiter GR reaches 6-8dB on club exports (-8 LUFS)
- ✅ Attack < 2ms (catches transients fast)
- ✅ Release < 80ms (pumping club energy)
- ✅ Hits target LUFS even if distortion occurs

**Balanced** passes if:
- ✅ Limiter GR stays 3-6dB on studio exports (-14 LUFS)
- ✅ Attack 2-3ms (natural transient preservation)
- ✅ Release 80-150ms (SSL Auto range)
- ✅ Preserves emotional build/release dynamics

**Clean** passes if:
- ✅ Limiter GR stays < 3dB on all exports
- ✅ Attack 5-10ms (preserves transient character)
- ✅ Release 200-600ms (SSL Auto adaptive)
- ✅ Backs off if ceiling would be violated

#### Documentation
**See**: `/src/app/docs/LIMITER_STYLE_AUDIT.md`

---

### 📋 Phase 3: Advanced Adjustments Layer (FUTURE)

**Goal**: Let users tweak without blaming us  
**Status**: 📋 **SPECIFIED** (not yet implemented)  
**Priority**: Post limiter style audit

#### The Problem

Users want to experiment, but if we expose everything:
- They'll break mono compatibility
- They'll create phase nightmares
- They'll exceed safe GR limits
- Then they'll email: *"Your mastering made my track sound small"*

#### The Solution

**Controlled flexibility** with **clear ownership boundaries**.

#### UI Design (Collapsed by Default)

```
┌─────────────────────────────────────┐
│ ▾ Advanced Adjustments              │
│                                     │
│   ⚠️ Changes override genre defaults│
│                                     │
│   Stereo Width       [====|===] 1.04│
│   Mono Bass Cutoff   [===|====] 100Hz│
│                                     │
│   Toggles:                          │
│   ☑ Mid-Side Processing             │
│   ☑ Clipper Stage                   │
│   ☐ Multiband Compression           │
│                                     │
│   Modified from preset ●            │
└─────────────────────────────────────┘
```

#### Ownership Model

**Preset loads clean**:
- `isPresetModified: false`
- We own the sound
- User picked a preset, we deliver

**User changes width**:
- `isPresetModified: true`
- User owns width behavior
- Indicator dot appears: `Modified from preset ●`

**User resets**:
- `[Reset to Preset Defaults]` button
- Clears all overrides
- Back to `isPresetModified: false`

#### Guardrails (Non-Negotiable)

Users **cannot**:
- ❌ Exceed width limits (0.9–1.15)
- ❌ Disable safety rails (limiter, true peak, DC filter)
- ❌ Exceed limiter GR caps from preset guardrails
- ❌ Access raw attack/release/ratio directly

Users **can**:
- ✅ Adjust width within clamps
- ✅ Change mono-bass cutoff (80-150Hz) or disable
- ✅ Toggle multiband/clipper/M/S on/off
- ✅ Reset to preset defaults instantly

#### What NOT to Expose

❌ Don't expose:
- Attack/release times (DSP soup)
- Compression ratios (confusing)
- Threshold values (user will fight limiter logic)
- Per-band multiband settings (too complex)
- Raw EQ frequency/Q/gain

**Why**: User breaks mix → User emails support → We waste time debugging user error.

#### Documentation
**See**: `/src/app/docs/ADVANCED_LAYER_SPEC.md`

---

## Implementation Priority

### Must Do (In Order)

1. ✅ **No-Regressions Test** (Phase 1)
   - Insurance against future breakage
   - **Status**: COMPLETE

2. 🚧 **Limiter Style Audit** (Phase 2)
   - Deliver on loudnessStyle promise
   - **Status**: SPECIFIED

3. 📋 **Advanced Layer** (Phase 3)
   - User flexibility with clear ownership
   - **Status**: SPECIFIED

### Don't Do (Yet)

❌ Don't add more presets until this is locked down  
❌ Don't expose raw DSP controls  
❌ Don't create "Expert Mode"  
❌ Don't add features before locking intent  

---

## Current Preset Quality

### House Family (Coherent Ladder)

| Genre | Width | MonoBass @ Hz | Multiband | Clipper | Loudness | Character |
|-------|-------|---------------|-----------|---------|----------|-----------|
| **Tech House** | 0.90 | ✅ 100 | ✅ ON | ❌ OFF | Balanced | Tight club tool |
| **Classic House** | 1.01 | ❌ OFF | ❌ OFF | ❌ OFF | Balanced | Warm groove |
| **Progressive House** | **1.04** | **✅ 100** | **❌ OFF** | **✅ ON** | **Balanced** | **Open + stable with lift** |
| **Melodic Techno** | 1.05 | ✅ 100 | ❌ OFF | ❌ OFF | Balanced | Atmospheric depth |
| **Deep House** | 1.06 | ❌ OFF | ❌ OFF | ❌ OFF | Clean | Vintage lush |

### Trance Family (Quality Preservation)

| Genre | Width | MonoBass @ Hz | Multiband | Clipper | Loudness |
|-------|-------|---------------|-----------|---------|----------|
| **Uplifting Trance** | 1.12 | ✅ 100 | **❌ OFF** | ❌ OFF | Balanced |
| **Progressive Trance** | 1.12 | ✅ 100 | **❌ OFF** | ❌ OFF | Balanced |
| **Psytrance** | 0.90 | ❌ OFF | **❌ OFF** | ✅ ON | Aggressive |

**Why multiband OFF**: Preserves bright supersaws, stereo motion, and emotional dynamics.

### Multiband Strategy

**OFF** (clean/mastering-ready):
- All Trance family
- All clean house (Classic, Progressive, Melodic Techno, Deep House)
- All legacy (RNB, Tape)

**ON** (protective work):
- Bass-heavy: DnB, Dubstep, Trap, Future Bass
- Aggressive: Techno, Hard Techno, Hardstyle, Hardcore
- Transient-focused: UK Garage, Breakbeat
- Club-tight: Tech House

---

## Files Reference

### Implementation Files
- `/src/app/data/genre-presets.ts` - All 18 genre presets
- `/src/app/services/audio-processor.ts` - Audio processing pipeline
- `/src/app/data/genre-presets.test.ts` - No-regressions test suite ✅

### Documentation Files
- `/src/app/docs/IMPLEMENTATION_ROADMAP.md` - This file
- `/src/app/docs/LIMITER_STYLE_AUDIT.md` - Phase 2 specification
- `/src/app/docs/ADVANCED_LAYER_SPEC.md` - Phase 3 specification

### Package Configuration
- `/package.json` - Scripts: `npm test`, `npm run test:ui`
- `/vitest.config.ts` - Test configuration

---

## Running Tests

```bash
# Run all tests
npm test

# Run tests with UI
npm run test:ui

# Run tests in watch mode
npm test -- --watch
```

**All tests should pass** before implementing Phase 2 or 3.

---

## Success Metrics

### Phase 1 Success ✅
- ✅ Tests lock down preset intent
- ✅ Critical invariants documented
- ✅ Multiband escape hatch clear
- ✅ Progressive House identity protected

### Phase 2 Success (Pending)
- ⏳ Aggressive genres pump and hit target
- ⏳ Balanced genres preserve dynamics
- ⏳ Clean genres stay transparent
- ⏳ loudnessStyle promise delivered

### Phase 3 Success (Pending)
- ⏳ Users can experiment safely
- ⏳ Modified state is obvious
- ⏳ Reset is one click
- ⏳ Guardrails prevent disasters
- ⏳ Support can triage instantly

---

## Final Principle

> **Presets are safe defaults.  
> User tweaks are user responsibility.  
> Guardrails never unlock.**

This three-phase plan:
1. **Protects what works** (no-regressions)
2. **Delivers on promises** (limiter style)
3. **Enables flexibility** (advanced layer)

Without breaking anything or exposing DSP soup.

---

## Next Actions

1. **Verify Phase 1**: Run `npm test` - All tests should pass ✅
2. **Implement Phase 2**: Wire loudnessStyle into limiter behavior
3. **Test Phase 2**: Run validation matrix on aggressive/balanced/clean genres
4. **Implement Phase 3**: Add Advanced Adjustments UI layer
5. **Ship**: Product survives real users and future changes

**Current Status**: Phase 1 complete. Ready for Phase 2 implementation.
