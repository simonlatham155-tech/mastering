# Genre Presets & Test Suite

## Overview

This directory contains the **genre preset definitions** and **no-regressions test suite** that lock down design intent for LATHAM AUDIO AI MASTERING SUITE.

---

## Files

### `genre-presets.ts`
**18 genre presets** covering:
- **House Family**: Tech House, Classic House, Progressive House, Melodic Techno, Deep House
- **Trance Family**: Uplifting Trance, Progressive Trance, Psytrance
- **Bass Music**: DnB, Dubstep, Trap, Future Bass
- **Hard Dance**: Hardstyle, Hardcore
- **Techno**: Techno, Hard Techno
- **UK Styles**: UK Garage, Breakbeat
- **Legacy**: RNB, Tape

Each preset defines:
- **Biases**: bassTilt, airTilt, mudCut, width, colorAmount, monoBassHz
- **Loudness Style**: aggressive | balanced | clean
- **Toggles**: useMultiband, useClipper, useMidSide, forceMonoBass
- **Guardrails** (optional): maxLimiterGR, maxEQBoost, maxWidth, etc.

---

### `genre-presets.test.ts`
**No-regressions test suite** that validates **design intent**, not audio output.

#### What It Tests

**Critical Invariants**:
- ✅ Trance family never defaults to multiband ON
- ✅ Width never exceeds engine limits (0.9–1.15)
- ✅ Progressive House stays MB OFF + clipper ON
- ✅ Clean genres stay clean (no clipper/multiband)
- ✅ Bass-heavy genres require mono-bass

**Structural Validation**:
- ✅ All presets have required fields
- ✅ All biases within reasonable ranges
- ✅ monoBassHz only defined when forceMonoBass is true
- ✅ Guardrails stricter than engine defaults

**Specific Preset Snapshots**:
- ✅ Progressive House complete identity
- ✅ Trance preserve bright supersaws
- ✅ Deep House vintage lush

**Width Hierarchy**:
- ✅ House family progression (0.90 → 1.01 → 1.04 → 1.05 → 1.06)

**Multiband Strategy**:
- ✅ Clean genres have multiband OFF
- ✅ Bass-heavy/aggressive genres have multiband ON

---

## Running Tests

```bash
# Run all tests once
npm test

# Run tests with UI
npm run test:ui

# Run tests in watch mode
npm test -- --watch
```

**All tests must pass** before implementing new features or refactoring presets.

---

## Why This Test Suite Exists

Without it, one future change will:
- Re-enable multiband for Trance (kills bright supersaws)
- Widen something past 1.15 (phase nightmares)
- Disable mono-bass on bass genres (club flab)
- Reintroduce fantasy values via refactor

**And you won't notice until users complain.**

This test suite is **insurance**, not bureaucracy.

---

## Making Changes to Presets

### ✅ Safe Changes (Won't Break Tests)

1. **Adjust bias values within ranges**:
   ```typescript
   bassTilt: +2 → +2.5  // Still within -3 to +3
   ```

2. **Add new optional fields**:
   ```typescript
   guardrails: {
     maxLimiterGR: 4  // Stricter than default
   }
   ```

3. **Create new genre presets** (add to registry + add tests)

---

### ❌ Changes That WILL Break Tests (Intentionally)

1. **Enabling multiband for Trance**:
   ```typescript
   TRANCE.toggles.useMultiband = true  // ❌ Test will fail
   ```
   **Why**: We decided multiband OFF to preserve bright supersaws.

2. **Exceeding width limits**:
   ```typescript
   width: 1.20  // ❌ Test will fail (max 1.15)
   ```
   **Why**: Phase issues and mono collapse beyond 1.15.

3. **Changing Progressive House identity**:
   ```typescript
   PROGRESSIVE_HOUSE.toggles.useMultiband = true  // ❌ Test will fail
   PROGRESSIVE_HOUSE.toggles.useClipper = false   // ❌ Test will fail
   ```
   **Why**: Snapshot test locks complete preset shape.

4. **Removing mono-bass from bass genres**:
   ```typescript
   DNB.toggles.forceMonoBass = false  // ❌ Test will fail
   ```
   **Why**: Club compatibility rule.

---

## If Tests Fail

### Intentional Change?

If you **meant** to change the behavior:
1. Update the test to reflect new intent
2. Document **why** the change was made
3. Verify no other tests break

**Example**:
```typescript
// OLD: Trance multiband OFF (preserve supersaws)
// NEW: Trance multiband ON for club exports only
// Reasoning: User feedback showed club systems need bass control
test('Trance multiband conditional on export preset', () => {
  // Update test logic
});
```

### Accidental Change?

If the failure caught a **regression**:
1. Revert the change that broke the test
2. Understand why the test exists (check comments)
3. Fix the actual issue

**Example**:
```typescript
// Oops, refactor accidentally enabled multiband for all presets
// Test caught it → revert → fix properly
```

---

## Test Philosophy

> **We test INTENT, not sound.**

**Good test**:
```typescript
test('Trance must never default to multiband ON', () => {
  expect(TRANCE.toggles.useMultiband).toBe(false);
});
```
**Why**: Locks design decision with clear reasoning.

**Bad test**:
```typescript
test('Trance output must have 3% THD at 1kHz', () => {
  // Don't test audio output - too brittle
});
```
**Why**: Audio output depends on too many variables.

---

## Adding New Presets

1. **Define preset** in `genre-presets.ts`:
   ```typescript
   export const FUTURE_GARAGE: GenrePreset = {
     id: 'futuregarage',
     name: 'Future Garage',
     category: 'UK Styles',
     // ... biases, loudnessStyle, toggles
   };
   ```

2. **Add to registry**:
   ```typescript
   export const GENRE_PRESETS: Record<string, GenrePreset> = {
     // ...
     'futuregarage': FUTURE_GARAGE,
   };
   ```

3. **Add tests** in `genre-presets.test.ts`:
   ```typescript
   describe('Future Garage', () => {
     test('has required structure', () => {
       expect(FUTURE_GARAGE.id).toBe('futuregarage');
       // ...
     });
   });
   ```

4. **Run tests**:
   ```bash
   npm test
   ```

---

## Integration with Audio Processor

**File**: `/src/app/services/audio-processor.ts`

Presets are loaded via:
```typescript
import { getGenrePreset } from '../data/genre-presets';

const genrePreset = getGenrePreset(settings.genreId);
const width = genrePreset?.biases.width ?? 1.0;
const loudnessStyle = genrePreset?.loudnessStyle ?? 'balanced';
// ...
```

**Critical invariant** (enforced in audio-processor.ts:1269-1279):
```typescript
// HPF applied BEFORE width scaling
sideDiff → [HPF @ monoBassHz] → sideCompressor → sideWidth gain
```

**Why this matters**: Prevents width < 1.0 from collapsing low-mids.

---

## Documentation

**Full specs**:
- `/src/app/docs/IMPLEMENTATION_ROADMAP.md` - Three-phase plan
- `/src/app/docs/LIMITER_STYLE_AUDIT.md` - Phase 2: Limiter behavior
- `/src/app/docs/ADVANCED_LAYER_SPEC.md` - Phase 3: User tweaks

---

## Summary

- **18 genre presets** = style/feel only, no delivery targets
- **Test suite** = locks down design intent, prevents regressions
- **Run tests before shipping** = `npm test`
- **Tests fail** = either intentional change (update test) or caught regression (revert)

This is the foundation that lets us ship with confidence.
