# LIMITER STYLE AUDIT

**Status**: 🚧 PENDING IMPLEMENTATION  
**Priority**: Quality Polish (Post No-Regressions Test)

## Current State

Genre presets define `loudnessStyle: 'aggressive' | 'balanced' | 'clean'`, but this is **not yet wired into the limiter/compressor behavior**.

### What This Means Right Now

All genres currently use the **same limiter settings** regardless of loudnessStyle:
- Same attack/release times
- Same threshold calculations
- Same ratio behavior
- Same ceiling protection

**This is not wrong** (the limiter still works), but it means the loudnessStyle promise is **not yet delivered**.

---

## The Promise (What Users Expect)

### Aggressive Style
**Genres**: DnB, Dubstep, Techno, Hard Techno, Hardstyle, Hardcore, Psytrance

**Expected Behavior**:
- **Faster attack** (0.5-1ms) - Catches transients aggressively
- **Higher GR tolerance** (up to 8dB) - Squashes harder
- **More distortion allowed** - Clipper + limiter work together
- **Ceiling protection prioritized** - Hit target LUFS no matter what
- **Shorter release** (40-60ms) - Pumping energy for club/festival

**Current Reality**: Uses same settings as balanced genres

---

### Balanced Style  
**Genres**: Progressive House, Melodic Techno, Trance, Progressive Trance, Tech House, Trap, Future Bass, UK Garage, Breakbeat

**Expected Behavior**:
- **Moderate attack** (1-3ms) - Natural transient preservation
- **GR capped earlier** (4-6dB) - Preserves dynamics
- **Clipper does excitement** - Limiter mostly for safety + glue
- **Ceiling protected but dynamics respected** - Won't destroy build energy
- **Medium release** (80-120ms) - SSL Auto Release range

**Current Reality**: Uses same settings as aggressive genres

---

### Clean Style
**Genres**: Deep House, RNB, Tape

**Expected Behavior**:
- **Slow attack** (5-10ms) - Preserves transient character completely
- **Minimal GR** (2-3dB max) - Almost invisible
- **Slow time constants** - Follows natural material dynamics
- **Ceiling is sacred** - Will back off rather than distort
- **Long release** (200-600ms) - SSL Auto Release adaptive

**Current Reality**: Uses same settings as aggressive genres

---

## Implementation Plan

### 1. Audit Limiter Creation Code

**File**: `/src/app/services/audio-processor.ts`  
**Method**: `createWeissLimiterStage()`

**Current Parameters** (same for all genres):
```typescript
threshold: calculated from target LUFS
ratio: ∞:1 (brickwall)
attack: 0.003 (3ms)
release: 0.1 (100ms)
knee: 0 (hard knee)
```

**Required Changes**:
```typescript
// Get loudnessStyle from genre preset
const genrePreset = getGenrePreset(settings.genreId);
const loudnessStyle = genrePreset?.loudnessStyle ?? 'balanced';

// Apply style-specific parameters
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

### 2. Integrate with SSL Auto Release

The existing SSL Auto Release calculation (based on crest factor) should **modulate** the base release time:

```typescript
// Base release from loudnessStyle
let baseRelease: number;
switch (loudnessStyle) {
  case 'aggressive': baseRelease = 50; break;
  case 'balanced': baseRelease = 100; break;
  case 'clean': baseRelease = 300; break;
}

// Modulate with SSL Auto Release (already calculated)
const sslModulator = this.analysis.sslAutoReleaseTime / 100; // Normalize
const finalRelease = baseRelease * sslModulator;
```

### 3. Add Guardrail Enforcement

Respect genre preset `guardrails.maxLimiterGR`:

```typescript
const presetMaxGR = genrePreset?.guardrails?.maxLimiterGR;
if (presetMaxGR !== undefined) {
  maxAllowedGR = Math.min(maxAllowedGR, presetMaxGR);
}

// Later, during processing:
if (actualGR > maxAllowedGR) {
  // Back off threshold or disable multiband to compensate
  console.warn(`⚠️ Limiter GR (${actualGR}dB) exceeds max (${maxAllowedGR}dB) - backing off`);
}
```

### 4. Test Matrix

Run these combinations to verify behavior matches promise:

| Genre | Style | Target LUFS | Expected GR | Attack | Release |
|-------|-------|-------------|-------------|--------|---------|
| DnB | Aggressive | -8 | 6-8dB | 1ms | 50ms |
| Techno | Aggressive | -8 | 6-8dB | 1ms | 50ms |
| Progressive House | Balanced | -14 | 3-5dB | 2ms | 100ms |
| Trance | Balanced | -14 | 3-5dB | 2ms | 100ms |
| Deep House | Clean | -14 | 1-3dB | 8ms | 300ms |
| RNB | Clean | -14 | 1-3dB | 8ms | 300ms |

---

## Success Criteria

### Aggressive Passes If:
- Limiter GR reaches 6-8dB on club exports (-8 LUFS)
- Attack is < 2ms (catches transients fast)
- Release is < 80ms (pumping club energy)
- Hits target LUFS even if distortion occurs

### Balanced Passes If:
- Limiter GR stays 3-6dB on studio exports (-14 LUFS)
- Attack is 2-3ms (natural transient preservation)
- Release is 80-150ms (SSL Auto range)
- Preserves emotional build/release dynamics

### Clean Passes If:
- Limiter GR stays < 3dB on all exports
- Attack is 5-10ms (preserves transient character)
- Release is 200-600ms (SSL Auto adaptive)
- Backs off if ceiling would be violated with distortion

---

## Why This Wasn't Done Yet

**Correct prioritization**:
1. First: Lock down preset intent (no-regressions test) ✅
2. Second: Make loudness styles deliver on promise (this document) 🚧
3. Third: Add user flexibility (Advanced layer) 📋

This audit is **quality polish**, not architecture.  
The no-regressions test protects what we already built.  
This makes it actually sound like the presets claim.

---

## Next Steps

1. **Run no-regressions test first** - Protect current state
2. **Implement limiter style wiring** - Connect loudnessStyle to actual behavior
3. **Test with harness** - Verify GR, attack, release match promise
4. **Listen in context** - Aggressive should pump, clean should be invisible
5. **Document in UI** - Show users what each style does (optional)

---

## Notes

- **Don't expose attack/release/ratio directly to users** - That's DSP soup
- **Guardrails stay enforced** - maxLimiterGR from preset always wins
- **SSL Auto Release stays active** - Styles set base time, SSL modulates it
- **This is transparent to users** - They just pick a genre and it behaves correctly
