# Preset Test Architecture

## Philosophy

**One source of truth for policy. Tests verify invariants around that source.**

Without this separation, you create a second policy system inside tests. Then you have two implementations that can drift apart.

---

## File Structure

### `/src/app/data/preset-policy.ts`
**Single source of truth for preset classification.**

- Defines `PresetClass` taxonomy: `tranceFamily | clean | bassHeavy | clubTight`
- `classifyPreset(preset)` → explicit, boring classification logic
- `getPresetsByClass(class)` → query presets by family
- `allPresetIds()` → registry coverage helper

**Why separate from tests?**
- "Clean vs bass-heavy" is product policy, not test logic
- Policy belongs in product code, not scattered across test files
- Tests should assert "all classified presets follow policy X", not "here's policy X again"

---

### `/src/app/data/__tests__/preset-invariants.test.ts`
**Primary regression protection. Behavioral invariants, not JSON snapshots.**

#### What it protects:

1. **Registry Integrity**
   - Registry keys match `preset.id`
   - All IDs unique
   - `getGenrePreset()` reaches every preset
   - Would have caught Progressive Trance ID mismatch instantly

2. **Preset Value Invariants**
   - `monoBassHz ∈ {100, 120, undefined}` (not "80-150Hz hand-waving")
   - Width within absolute bounds
   - ColorAmount ∈ [0, 1]
   - loudnessStyle valid

3. **Effective Width After Guardrails** (behavior, not JSON)
   - Trance 1.12 → clamps to 1.05 in live, allowed in studio
   - Future Bass 1.10 → clamps to 1.05 in live, allowed in studio
   - Progressive House 1.04 → no clamping (fits under 1.05)
   - Uses `effectiveWidth()` helper that actually clamps

4. **Guardrails Are Stricter-Only**
   - Deep House `maxLimiterGR: 3` ≤ engine defaults (both modes)
   - EQ boost/cut limits enforced
   - Tests the actual guardrail application logic
   - Catches bugs where guardrails become less strict than defaults

5. **Policy Coverage**
   - Every preset classified (no orphans)
   - Trance family → multiband OFF
   - Clean presets → multiband OFF, clipper OFF
   - Bass-heavy → mono-bass ON
   - Club-tight → mono-bass ON, multiband ON

6. **M/S Processing Dependency**
   - If `forceMonoBass` true, `useMidSide` must also be true

#### What it catches:

- ID mismatch bugs
- Guardrail logic regressions
- Someone "helpfully" changing `maxWidth_live`
- `monoBassHz` drifting into nonsense values (e.g., 137Hz)
- Adding new preset without classifying it
- Width clamping bugs (requested vs effective)

---

### `/src/app/data/__tests__/export-separation.test.ts`
**Architecture guard: Export presets ONLY affect delivery targets.**

This test is a guard dog for your clean separation.

#### What can go wrong without this:
- Someone "helpfully" ties export presets into genre toggles
- "Let's turn multiband ON for extreme mode"
- "Let's widen stereo for club mode"  
- "Let's disable M/S for spotify"
- Your clean separation rots quietly → toggle soup

#### What it protects:

1. **Genre behavior identical across export presets**
   - Progressive House: biases/toggles same for Spotify, Club, Extreme
   - Only targetLUFS and ceiling differ

2. **Clean genres stay clean**
   - Deep House: clipper OFF, multiband OFF across all export presets
   - Export preset cannot "helpfully" enable aggression

3. **Bass-heavy genres stay bass-heavy**
   - DnB: mono-bass ON across all export presets
   - monoBassHz identical (120Hz)

4. **Trance family stays wide**
   - Width 1.12, multiband OFF across all export presets
   - Export preset cannot narrow or enable multiband

5. **Export presets contain ONLY delivery targets**
   - No `biases`, `toggles`, `width`, `useMultiband`, etc.
   - Only `lufs` and `ceiling`

#### What it catches:
- Export presets leaking into genre behavior
- Someone adding genre fields to export presets
- Architectural rot from "helpful" refactors

---

### `/src/app/data/__tests__/preset-taste-pins.test.ts`
**Secondary protection. Specific taste decisions made during audits.**

These are **allowed to be brittle JSON snapshots**.

If they break, it means someone changed a taste decision - that's worth reviewing.

#### What it contains:

1. **Audit Fixes (Feb 2026)**
   - Future Bass: MB OFF + clipper ON (Trance DNA)
   - Breakbeat: mono bass @ 100Hz
   - UK Garage: width 1.0
   - Trap vs Dubstep differentiation
   - Hardcore: colorAmount 0.65 (brutal not vintage)

2. **Critical Preset Snapshots**
   - Progressive House complete identity
   - Trance complete identity
   - Deep House complete identity

3. **Width Hierarchy (House Family)**
   - Tech House < Classic House < Progressive House < Melodic Techno < Deep House

#### Why separate from invariants?

- Invariants protect systemic behavior (all trance = MB OFF)
- Taste pins protect specific decisions (Trap width 0.92 > Dubstep 0.9)

---

## Running Tests

```bash
# Run all tests
npm test

# Run with UI
npm run test:ui

# Run specific suite
npm test preset-invariants
npm test preset-taste-pins

# Clean cache and run
rm -rf node_modules/.cache
npm test
```

---

## Adding a New Preset: Checklist

1. ✅ Add preset to `/src/app/data/genre-presets.ts`
2. ✅ Add ID to `GENRE_PRESETS` registry
3. ✅ Classify in `/src/app/data/preset-policy.ts` → `classifyPreset()`
4. ✅ Run tests → will fail if not classified
5. ✅ Verify policy coverage tests pass

**The tests will force you to classify it. No orphans allowed.**

---

## What Changed from Old Tests?

### Before (genre-presets.test.ts):
- ❌ Policy defined in hardcoded arrays inside tests
- ❌ Testing JSON values, not behavior
- ❌ No effective width testing (missed live mode clamping)
- ❌ Range hand-waving for `monoBassHz` (80-150Hz)
- ❌ No ID registry sanity checks

### After (preset-policy.ts + invariants + taste-pins):
- ✅ Policy in product code, tests verify coverage
- ✅ Tests behavior after guardrails (what engine actually uses)
- ✅ Allowed value sets, not ranges (`monoBassHz ∈ {100, 120, undefined}`)
- ✅ Registry integrity catches ID bugs instantly
- ✅ Separate taste pins from invariants (clarity of intent)

---

## One Rule

**If you're about to add "classification logic" to a test file, STOP.**

Ask: "Is this policy or verification?"

- **Policy** → goes in `preset-policy.ts`
- **Verification** → test asserts all presets follow policy

**Never create a second source of truth in tests.**