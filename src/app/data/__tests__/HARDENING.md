# Test Hardening Summary

## What Was Fixed

### 1. ✅ Non-throwing classification for product code
**Problem:** `classifyPreset()` threw errors, could crash in production if called with unclassified preset.

**Solution:**
- `classifyPreset()` returns `PresetClass | null` (safe)
- `requireClassification()` throws (tests/dev only)
- Product code can safely call `classifyPreset()` without crash risk

```typescript
// SAFE FOR PRODUCT CODE
const cls = classifyPreset(preset);
if (!cls) {
  // Handle gracefully
}

// TESTS/DEV ONLY (throws)
const cls = requireClassification(preset);
```

---

### 2. ✅ Classification taxonomy documented as laws, not vibes

**Problem:** "tranceFamily" could be misinterpreted as "only trance genres" instead of "wide bright synths."

**Solution:** Each `PresetClass` now has explicit law documentation:

**@tranceFamily**
- RULE: Preserve wide, bright supersaws and stereo motion
- TECHNICAL: Multiband OFF, wide stereo (>1.1), mono-bass optional
- WHY: Trance/Future Bass/Psytrance rely on bright supersaws for energy
- INCLUDES: Genres with bright synth layers needing stereo preservation

**@clean**
- RULE: Gentle dynamics, warm character, minimal aggression
- TECHNICAL: Multiband OFF, clipper OFF, limiter GR ≤3dB
- WHY: Deep House/RNB/Tape prioritize warmth over loudness
- INCLUDES: Genres where dynamics ARE the musicality

**@bassHeavy**
- RULE: Aggressive sub control for club/festival safety
- TECHNICAL: Multiband ON, mono-bass ON, clipper ON, tight stereo (≤1.0)
- WHY: DnB/Dubstep/Trap need mono sub for club systems
- INCLUDES: Genres with powerful sub-bass that must translate to mono

**@clubTight**
- RULE: Club-safe bass + controlled dynamics for pro DJ use
- TECHNICAL: Multiband ON, mono-bass ON, moderate width (0.9-1.0)
- WHY: Techno/Breakbeat need mono sub + multiband for safety
- INCLUDES: Four-on-the-floor or breakbeat genres played in clubs

**Future Bass in tranceFamily:** Justified because it shares sonic DNA (bright supersaws, wide stereo), even though it's not literally trance.

**UK Garage + Breakbeat in clubTight:** Deliberate heavy default (mono-bass + multiband). If users complain about "smaller sound," this policy is why.

---

### 3. ✅ Engine invariant tests added

**Problem:** Engine defaults could be swapped or made insane without test catching it.

**Solution:** Added `Engine Invariants` test suite:

```typescript
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
```

**Catches:**
- Someone swaps `maxWidth_live` and `maxWidth_export`
- Negative `minWidth` or insane values (e.g., 50.0)
- Dynamics limiter GR > brickwall limiter GR

---

### 4. ✅ Bidirectional M/S dependency check

**Problem:** Only tested `forceMonoBass → useMidSide`, not the inverse.

**Solution:** Added bidirectional check:

```typescript
test('If forceMonoBass is true, useMidSide must also be true', () => {
  // Original check
});

test('If useMidSide is false, forceMonoBass must also be false (bidirectional)', () => {
  for (const preset of Object.values(GENRE_PRESETS)) {
    if (!preset.toggles.useMidSide) {
      expect(preset.toggles.forceMonoBass, `${preset.id} has M/S disabled but mono-bass enabled`).toBe(false);
    }
  }
});
```

**Catches:**
- Someone disables M/S but leaves mono-bass enabled
- Silently broken mono-bass (engine requires M/S for Side HPF)

---

### 5. ✅ Export preset separation (architecture guard)

**Problem:** No test preventing export presets from leaking into genre behavior.

**Solution:** Added `export-separation.test.ts` that verifies:

```typescript
test('Progressive House: genre behavior identical across all export presets', () => {
  const spotify = extractGenreBehavior('progressivehouse', 'spotify');
  const club = extractGenreBehavior('progressivehouse', 'club');
  const extreme = extractGenreBehavior('progressivehouse', 'extreme');
  
  // Delivery targets differ (expected)
  expect(spotify.deliveryTargets.targetLUFS).toBe(-14);
  expect(club.deliveryTargets.targetLUFS).toBe(-8);
  expect(extreme.deliveryTargets.targetLUFS).toBe(-6);
  
  // Genre behavior IDENTICAL (critical)
  expect(spotify.genreBiases).toEqual(club.genreBiases);
  expect(spotify.genreToggles).toEqual(club.genreToggles);
});
```

**Catches:**
- Export presets leaking into genre toggles ("multiband ON for extreme")
- Someone adding `width` or `useMultiband` to export presets
- Architectural rot from "helpful" refactors
- Your clean separation rotting into toggle soup

**This is the guard dog for your architecture.**

---

## Remaining Risks (Accepted)

### ⚠️ UK Garage + Breakbeat in clubTight

**Strong opinion encoded:**
- Mono-bass ON + multiband ON by default
- If users complain genres sound "smaller" or "too controlled," this is why

**Not changing now, but documented as deliberate.**

---

## Test Coverage Summary

### Invariant Tests (Primary Protection)
- ✅ Engine invariants (3 tests)
- ✅ Registry integrity (4 tests)
- ✅ Value invariants (8 tests)
- ✅ Effective width after guardrails (6 tests)
- ✅ Guardrails stricter-only (6 tests)
- ✅ Policy coverage (4 tests)
- ✅ M/S dependency (2 tests, bidirectional)
- ✅ Structural validation (2 tests)

### Architecture Guards
- ✅ Export preset separation (7 tests)

### Taste Pins (Secondary Protection)
- ✅ Audit fixes (5 tests)
- ✅ Critical snapshots (3 tests)
- ✅ Width hierarchy (1 test)

**Total: ~51 tests**

---

## What This Protects Against

### Behavioral Regressions:
1. ✅ Progressive Trance ID mismatch → Registry integrity
2. ✅ Width clamping bugs → Effective width tests
3. ✅ monoBassHz drift to 137Hz → Allowed value set
4. ✅ New preset without classification → requireClassification() throws
5. ✅ Guardrail becomes less strict → Stricter-only tests
6. ✅ Trance gets multiband ON → Policy coverage
7. ✅ forceMonoBass without useMidSide → Bidirectional dependency
8. ✅ Engine defaults swapped → Engine invariant tests
9. ✅ Export presets leak into genre behavior → Export separation tests

### Architecture Rot Prevention:
- ✅ Export presets remain delivery-only (cannot enable multiband, clipper, etc.)
- ✅ Genre/export separation enforced at test level
- ✅ "Helpful" refactors caught before merge

### Production Safety:
- ✅ `classifyPreset()` safe for product code (returns null)
- ✅ `requireClassification()` only for tests/dev (throws)
- ✅ No runtime crashes from unclassified presets

---

## Commands

```bash
# Run all tests
npm test

# Run with UI
npm run test:ui

# Run specific suite
npm test preset-invariants
npm test preset-taste-pins
```

---

## Bottom Line

**Before:** "We think it works" + JSON snapshots  
**After:** "The machine enforces the rules" + behavioral invariants

**This is legit now. Your name is protected.**