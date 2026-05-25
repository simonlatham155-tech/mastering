# ADVANCED ADJUSTMENTS LAYER

**Status**: 📋 SPECIFICATION (Not Yet Implemented)  
**Priority**: Post Limiter Style Audit  
**Purpose**: Let users tweak without blaming us for bad results

---

## The Problem

Users want to experiment, but if we expose everything:
- They'll break mono compatibility
- They'll create phase nightmares
- They'll exceed safe GR limits
- Then they'll email: *"Your mastering made my track sound small"*

We need **controlled flexibility** with **clear ownership boundaries**.

---

## The Solution: Soft Advanced Layer

Not "Expert Mode" (scary).  
Not hidden dev toggles (confusing).  
**A gentle "Advanced Adjustments" section** that makes intent crystal clear.

---

## UI Design

### Main Preset Selector (Always Visible)

```
┌─────────────────────────────────────┐
│  Genre Preset: Progressive House  ▼│
│  Export Target: Spotify Standard  ▼│
│                                     │
│  [Process Track]                    │
└─────────────────────────────────────┘
```

**Behavior**:
- Loads genre defaults (width, mono-bass, clipper, multiband)
- User hasn't touched anything = **We own the result**

---

### Advanced Adjustments (Collapsed by Default)

```
┌─────────────────────────────────────┐
│ ▸ Advanced Adjustments              │  ← Collapsed initially
└─────────────────────────────────────┘
```

**Expand to show**:

```
┌─────────────────────────────────────┐
│ ▾ Advanced Adjustments              │
│                                     │
│   ⚠️ Changes override genre defaults│
│      and may affect translation     │
│                                     │
│   Stereo Width       [====|===] 1.04│  ← Slider (0.9–1.15)
│   Mono Bass Cutoff   [===|====] 100Hz│ ← Slider (OFF, 80–150Hz)
│                                     │
│   Toggles:                          │
│   ☑ Mid-Side Processing             │
│   ☑ Clipper Stage                   │
│   ☐ Multiband Compression           │
│                                     │
│   Modified from preset ●            │  ← Indicator dot
└─────────────────────────────────────┘
```

---

## Ownership Model

### Preset Loads Clean
```typescript
isPresetModified: false
```

**UI shows**:
- No indicator dot
- Sliders match genre defaults
- Toggles match genre defaults

**Ownership**: **We own the sound**. User picked a preset, we deliver the preset.

---

### User Changes Width Slider
```typescript
isPresetModified: true
modifiedFields: ['width']
```

**UI shows**:
- Orange indicator dot: `Modified from preset ●`
- Slider shows new value (e.g., 1.08)
- Other settings unchanged

**Ownership**: **User owns width behavior**. We still own other settings.

---

### User Toggles Multiband ON
```typescript
isPresetModified: true
modifiedFields: ['useMultiband']
```

**UI shows**:
- Orange indicator dot
- Multiband toggle checked
- Other settings unchanged

**Ownership**: **User owns multiband decision**. If it sounds worse, user made the choice.

---

### Reset to Preset
```
[Reset to Preset Defaults]  ← Button appears when modified
```

**Behavior**:
- Clears all user overrides
- Reloads genre preset values
- Sets `isPresetModified: false`
- Removes indicator dot

**Ownership**: Back to **we own the sound**.

---

## Guardrails (Non-Negotiable)

Even in Advanced mode, users **cannot**:

### 1. Exceed Engine Width Limits
```typescript
// Always clamped
const finalWidth = clamp(
  userWidth, 
  ENGINE_DEFAULTS.minWidth,  // 0.9
  settings.performanceMode === 'live' 
    ? ENGINE_DEFAULTS.maxWidth_live    // 1.05
    : ENGINE_DEFAULTS.maxWidth_export  // 1.15
);
```

**Why**: Prevents phase collapse and mono compatibility nightmares.

---

### 2. Break Mono-Bass Rule
```typescript
if (useMidSide && forceMonoBass) {
  // Side HPF always applied
  // User can adjust cutoff (80-150Hz), but cannot disable if genre requires it
}
```

**Exception**: User can disable `forceMonoBass` toggle entirely if they want full-spectrum bass width. But:
- UI warns: *"⚠️ Disabling mono-bass may cause club compatibility issues"*
- Ownership shifts to user

---

### 3. Exceed Limiter GR Caps
```typescript
const maxGR = getEffectiveGuardrail(
  preset, 
  'maxLimiterGR',
  limiterMode, 
  performanceMode
);

if (actualGR > maxGR) {
  // Auto back off threshold
  // Or warn user target is impossible without exceeding cap
}
```

**Why**: Prevents distortion nightmares and "why does it sound smashed?" complaints.

---

### 4. Disable Safety Rails
Users **cannot**:
- Turn off the master limiter
- Disable true peak protection
- Remove DC offset filters
- Bypass safety HPF (30Hz)

**Why**: These are mastering fundamentals, not tweakable options.

---

## What Users CAN Tweak

### Stereo Width
- **Range**: 0.9 (tight) to 1.15 (superwide, export only)
- **Default**: From genre preset
- **Effect**: Adjusts Side gain in M/S processing
- **Warning**: Values > 1.10 may cause phase issues

---

### Mono Bass Cutoff
- **Range**: OFF, 80Hz–150Hz
- **Default**: From genre preset (100Hz or 120Hz if enabled)
- **Effect**: Changes Side HPF cutoff frequency
- **Warning**: Disabling may cause club flab on bass-heavy material

---

### Toggles
#### Mid-Side Processing
- **Default**: ON for most genres (spatial control + mono bass)
- **Effect**: Enables M/S encoding/decoding and width control
- **Warning**: Disabling removes mono-bass rule and width control

#### Clipper Stage  
- **Default**: ON for aggressive/energetic genres
- **Effect**: Adds excitement and lift before limiting
- **Warning**: Adds slight harmonic distortion (intended)

#### Multiband Compression
- **Default**: OFF for clean genres, ON for bass-heavy/aggressive
- **Effect**: Independent compression per frequency band
- **Warning**: Can dull highs or smear stereo if overused

---

## Modified Indicator Behavior

### Visual States

**Clean State** (no user changes):
```
Genre: Progressive House
No indicator
```

**Modified State** (user changed something):
```
Genre: Progressive House (Modified) ●
Orange dot visible
```

**Hover tooltip on dot**:
```
Modified from preset:
• Width: 1.08 (preset: 1.04)
• Multiband: ON (preset: OFF)

[Reset to Defaults]
```

---

## Implementation Notes

### State Management
```typescript
interface UserOverrides {
  width?: number;
  monoBassHz?: number;
  useMultiband?: boolean;
  useClipper?: boolean;
  useMidSide?: boolean;
  forceMonoBass?: boolean;
}

interface ProcessingState {
  genrePresetId: string;
  exportPresetId: string;
  userOverrides: UserOverrides;
  isPresetModified: boolean;
}
```

### Merge Logic
```typescript
function getEffectiveSettings(
  genrePreset: GenrePreset,
  userOverrides: UserOverrides
): EffectiveSettings {
  return {
    // Biases
    width: userOverrides.width ?? genrePreset.biases.width,
    monoBassHz: userOverrides.monoBassHz ?? genrePreset.biases.monoBassHz,
    
    // Toggles
    useMultiband: userOverrides.useMultiband ?? genrePreset.toggles.useMultiband,
    useClipper: userOverrides.useClipper ?? genrePreset.toggles.useClipper,
    useMidSide: userOverrides.useMidSide ?? genrePreset.toggles.useMidSide,
    forceMonoBass: userOverrides.forceMonoBass ?? genrePreset.toggles.forceMonoBass,
    
    // Guardrails always enforced (never overridable)
    maxLimiterGR: genrePreset.guardrails?.maxLimiterGR ?? ENGINE_DEFAULTS.maxLimiterGR,
    // ... other guardrails
  };
}
```

### Reset Behavior
```typescript
function resetToPresetDefaults() {
  userOverrides = {};
  isPresetModified = false;
  // Re-render UI with genre preset defaults
}
```

---

## What NOT to Expose

❌ **Don't expose**:
- Attack/release times (DSP soup)
- Compression ratios (confusing)
- Threshold values (user will fight limiter logic)
- Per-band multiband settings (way too complex)
- Saturation drive amounts (breaks emulation accuracy)
- EQ frequency/Q/gain directly (use genre presets instead)

❌ **Don't add**:
- "Raw Mode" bypass
- "Disable Guardrails" toggle
- Direct dB boost/cut sliders
- "Expert Panel" with full DSP access

**Why**: These lead to:
1. User destroys their mix
2. User emails support: "Your mastering ruined my track"
3. We waste time debugging user error

---

## User Support Strategy

### When User Modifies Settings

**Email template**:
> "I used Progressive House preset but it sounds weird"

**Response**:
> "I see you modified the preset (Width: 1.15, Multiband: ON).  
> Try clicking 'Reset to Preset Defaults' to restore the recommended settings.  
> If the issue persists with unmodified settings, we'll investigate further."

**Key**: Modified indicator lets us triage instantly.

---

### When User Requests New Feature

**User**: "Can you add a 'Bass Boost' slider?"

**Response**:
> "Bass shaping is built into each genre preset via the biases system.  
> Try switching between Deep House (+1dB bass) and DnB (+3dB bass) to hear the difference.  
> If you need surgical EQ, we recommend handling that in your DAW before mastering."

**Key**: Presets handle common use cases. We don't expose raw EQ.

---

## Implementation Priority

### Phase 1: No-Regressions Test ✅
Lock down preset intent so nothing breaks.

### Phase 2: Limiter Style Audit 🚧
Make loudnessStyle actually affect limiter behavior.

### Phase 3: Advanced Layer 📋
Add this UI layer for controlled user flexibility.

### Phase 4: Analytics (Optional) 📊
Track which settings users modify most:
- If everyone tweaks width → presets might need adjustment
- If nobody touches multiband → it's working correctly
- If everyone enables clipper → maybe more genres should default ON

---

## Success Criteria

### Advanced Layer Passes If:

1. **Users can experiment** without breaking fundamentals
2. **Modified state is obvious** (no hidden changes)
3. **Reset is one click** (easy to undo mistakes)
4. **Guardrails prevent disasters** (no mono collapse, no GR explosions)
5. **Support can triage instantly** (modified indicator in bug reports)

### Advanced Layer Fails If:

1. Users regularly break mono compatibility
2. Support gets "it sounds bad" emails from modified presets
3. Users can't figure out how to reset
4. Guardrails can be bypassed
5. Users demand raw DSP exposure

---

## Future Considerations

### Optional: Preset Save/Load
```
[Save As Custom Preset]
```

**Allows**:
- User creates "My Progressive House" with custom width/toggles
- Saved locally (not cloud-synced)
- Always shows as modified from stock preset

**Risk**: Users share bad custom presets and blame us when they sound bad.

**Mitigation**: Clearly label "User Preset" vs "Stock Preset" in UI.

---

### Optional: A/B Comparison
```
[A] Stock Preset     [B] Modified     [Compare]
```

**Allows**:
- Listen to stock vs modified side-by-side
- Instant audio diff to hear what changed

**Benefit**: Users can hear if their modifications helped or hurt.

---

## Final Principle

> **Presets are safe defaults.  
> User tweaks are user responsibility.  
> Guardrails never unlock.**

This keeps the product from being blamed for user experimentation while still allowing flexibility.

If we expose everything → users break things → we get blamed.  
If we expose nothing → users feel constrained → they leave.  
If we expose **the right things with clear ownership** → everyone wins.
