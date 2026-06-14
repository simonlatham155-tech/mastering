# Rhythmic Space — definitive fix (AU + VST3, researched)

**Date:** Research across JUCE forums, Apple docs, Projucer source, and JUCE 8.0.13 vs `develop` git diff.

---

## Executive summary

| Myth | Truth |
|------|-------|
| "You need JUCE `develop`" | **False for 8.0.13.** `juce_AU_Shared.h` `getAUChannelInfo()` is **byte-identical** on `8.0.13` and `develop` (verified via GitHub raw diff). |
| "`aufx` + MIDI checkbox fixes everything" | **False for Logic.** `aufx` never receives live MIDI in Logic ([JUCE Fabian](https://forum.juce.com/t/aumf-or-aufx-which-one-is-ok-for-automation/27543)). |
| "`aumf` always fails auval" | **False with correct config.** Your `-10868` was bad bus/channel Projucer state + incomplete bundle, not missing JUCE version. |
| "One binary can't do AU + VST3 MIDI" | **False.** Same binary: `pluginWantsMidiIn` + `aumf` serves **both** formats. |

**Ship configuration (one `.jucer`, one build):**

```xml
pluginCharacteristicsValue="pluginWantsMidiIn"
pluginChannelConfigs=""
pluginAUMainType="'aumf'"
```

Validate: `auval -v aumf Rysp Ltha` (not `aufx`).

You already proved Release + codesign + install works. Switch type back to `aumf`, rebuild, re-validate.

---

## Why this is the only correct AU type

From [Apple Audio Unit docs](https://developer.apple.com/library/archive/documentation/General/Conceptual/ExtensibilityPG/AudioUnit.html):

- **`aufx`** — audio effect (in → out)
- **`aumf`** — music effect: DSP **and** responds to MIDI

From JUCE Projucer source (`Project::getDefaultAUMainTypes`):

```cpp
if (pluginWantsMidiInput()) return { "'aumf'" };
```

MIDI Learn needs CC in `processBlock`. That requires **`aumf`** in Logic and **`JucePlugin_WantsMidiInput`** for VST3 ([empty MIDI buffer without it](https://forum.juce.com/t/midimessages-always-empty-in-processblock/38327)).

---

## What you already fixed (keep these)

| Fix | Status |
|-----|--------|
| Release build (not Debug) | ✅ |
| Install to `~/Library/.../Components/` | ✅ |
| codesign + `killall AudioComponentRegistrar` | ✅ |
| `isBusesLayoutSupported` mono/stereo, in==out | ✅ |
| Empty channel configs | ✅ |
| `acceptsMidi()` returns `true` | ✅ |
| No disabled MIDI input bus | ✅ |
| Remove stuck `PopupMenu` in `KnobComponent` | ✅ |
| Learn applies first CC | ✅ |
| `auval` full pass | ✅ proven with `aufx` — repeat with `aumf` |

---

## Step-by-step (your Mac, ~20 min)

### 1. Projucer

Open `RhythmicSpace.jucer`:

- ✅ **Plugin wants MIDI input**
- ✅ **Plugin AU Main Type → Music Effect** (`aumf`)
- **Channel configurations** → empty
- ❌ **Plugin is a synth** → off

Confirm XML:

```xml
pluginCharacteristicsValue="pluginWantsMidiIn"
pluginChannelConfigs=""
pluginAUMainType="'aumf'"
```

**Save and Open in IDE.**

### 2. Xcode

- Scheme: **RhythmicSpace - AU** then **RhythmicSpace - VST3**
- **Edit Scheme → Run → Release**
- Clean Build Folder → Build both

### 3. Install

```bash
REL=~/Documents/GitHub/RhythmicSpace/Builds/MacOSX/build/Release

rm -rf ~/Library/Audio/Plug-Ins/Components/RhythmicSpace.component
cp -R "$REL/RhythmicSpace.component" ~/Library/Audio/Plug-Ins/Components/
codesign --force --deep --sign - ~/Library/Audio/Plug-Ins/Components/RhythmicSpace.component
xattr -cr ~/Library/Audio/Plug-Ins/Components/RhythmicSpace.component

cp -R "$REL/RhythmicSpace.vst3" ~/Library/Audio/Plug-Ins/VST3/
xattr -cr ~/Library/Audio/Plug-Ins/VST3/RhythmicSpace.vst3

killall -9 AudioComponentRegistrar
```

### 4. Validate AU

```bash
plutil -extract AudioComponents.0.type raw \
  ~/Library/Audio/Plug-Ins/Components/RhythmicSpace.component/Contents/Info.plist

auval -v aumf Rysp Ltha
```

Expected: `type` = `aumf`, **AU VALIDATION SUCCEEDED**.

If `-10868` returns → Projucer not re-saved, or Debug build installed, or empty `MacOS/` binary.

### 5. Test Logic (AU)

**MIDI Learn in Logic requires MIDI-controlled effect routing** ([JUCE Feb 2025](https://forum.juce.com/t/midi-in-audio-effect-plugin-logic-pro/65294)):

1. **Software Instrument** track
2. **AU MIDI-controlled Effects → LATHAMAUDIO → Rhythmic Space**
3. Sidechain audio from source track ([Waves guide](https://www.waves.com/support/how-to-control-waves-plugins-with-midi-in-logic-pro))
4. Arm track → right-click **CUTOFF** → move **CC** knob
5. **MIDI IN** flashes green

Audio-only on audio tracks may still work for processing; MIDI needs the above.

### 6. Test Ableton (VST3)

1. Audio track → **Rhythmic Space VST3**
2. **MIDI From** → controller (e.g. MiniLab)
3. Arm track → right-click knob → learn → move CC
4. **MIDI IN** flashes green

---

## If `aumf` auval fails

| Check | Command |
|-------|---------|
| Binary exists | `ls …/Contents/MacOS/RhythmicSpace` |
| Correct type | `plutil -extract AudioComponents.0.type raw …/Info.plist` |
| Registered | `auval -a 2>/dev/null \| grep -i Ltha` |
| Stale cache | `killall -9 AudioComponentRegistrar` |

Paste full `auval` output if stuck.

---

## Do NOT ship

- ❌ `aufx` only — Logic MIDI Learn dead
- ❌ `pluginWantsMidiIn` off — VST3 MIDI buffer empty
- ❌ Debug build — leak detector fails validation
- ❌ `PopupMenu` on right-click — stuck overlay in Ableton

---

## Version bump

Tag **v1.0.2** with both `RhythmicSpace.component` and `RhythmicSpace.vst3` from `build/Release/`.
