# Rhythmic Space — complete AU + MIDI Learn fix

One coherent setup for **Logic AU**, **Ableton VST3**, and **MIDI Learn**.

## The problem (why it felt impossible)

| Goal | What JUCE/Apple require |
|------|-------------------------|
| Logic opens the plugin | Stereo effect with correct `AUChannelInfo` |
| MIDI reaches `processBlock` in Logic | AU type **`aumf`** (Music Effect) + **Plugin wants MIDI input** |
| Ableton VST3 MIDI | **`JucePlugin_WantsMidiInput`** (Projucer checkbox) |
| Your `-10868` with `aumf` | **JUCE 8.0.13 bug** — wrong wildcard channel layouts in `getAUChannelInfo()` |

Switching to **`aufx`** fixed `auval` but **broke Logic MIDI** (by design — standard effects don't receive MIDI in Logic).

**You cannot have Logic MIDI Learn + `aufx` in one binary.** The complete fix is **`aumf` + newer JUCE**, not `aufx`.

References:
- [JUCE: aumf needed for MIDI in processBlock](https://forum.juce.com/t/aumf-or-aufx-which-one-is-ok-for-automation/27543)
- [JUCE 8 AUChannelInfo bug + fix on develop](https://forum.juce.com/t/br-wrong-auchannelinfo-reported-for-some-bus-layout-combinations/66725)
- [Empty midi buffer without Projucer MIDI flag](https://forum.juce.com/t/midimessages-always-empty-in-processblock/38327)

---

## Step 1 — Upgrade JUCE (required for `aumf` + auval)

Your build uses **JUCE 8.0.13**. The `AUChannelInfo` fix is on **`develop`** (merged Aug 2025), not in 8.0.13.

In Terminal:

```bash
cd ~/Documents/GitHub/RhythmicSpace/JUCE
# or wherever your JUCE folder lives relative to the .jucer

git fetch origin
git checkout develop
git pull origin develop
```

Confirm you're past the AU fix (Aug 2025):

```bash
git log --oneline -5 -- modules/juce_audio_plugin_client/AU/AudioUnitHelpers.h
git log --oneline --grep="AUChannelInfo" -3
```

If you cannot use `develop`, cherry-pick the JUCE team's fix from the forum thread above — but **`develop` is the supported path**.

---

## Step 2 — Projucer settings (exact)

Open **RhythmicSpace.jucer**:

| Setting | Value |
|---------|--------|
| **Plugin wants MIDI input** | ✅ ON |
| **Plugin is a synth** | ❌ OFF |
| **Plugin MIDI output** | ❌ OFF |
| **Plugin Channel Configurations** | **empty** |
| **Plugin AU Main Type** | **Music Effect** (`aumf`) |

XML must look like:

```xml
pluginCharacteristicsValue="pluginWantsMidiIn"
pluginChannelConfigs=""
pluginAUMainType="'aumf'"
```

**Remove** any leftover `pluginAUMainType="'aufx'"`.

**Save and Open in IDE.**

---

## Step 3 — Code (if not already applied)

### `Source/UI/KnobComponent.cpp`

Right-click must **not** open a `PopupMenu` (gets stuck in Ableton). Only:

```cpp
if (onMIDILearnRequest)
    onMIDILearnRequest(paramID);
```

### `Source/PluginProcessor.cpp`

- `acceptsMidi()` → `return true;`
- `isBusesLayoutSupported` — mono/stereo, input matches output (JUCE tutorial pattern)
- `updateHostTransportState` — `getPosition()` API
- Destructor present

### `Source/Data/MIDIControllerMap.cpp`

When learn completes, apply the first CC value immediately (patch included in repo).

---

## Step 4 — Build Release

Xcode:
- Scheme: **RhythmicSpace - AU** (and VST3)
- **Edit Scheme → Run → Build Configuration → Release**
- Clean Build Folder → Build

Install AU:

```bash
rm -rf ~/Library/Audio/Plug-Ins/Components/RhythmicSpace.component

cp -R ~/Documents/GitHub/RhythmicSpace/Builds/MacOSX/build/Release/RhythmicSpace.component \
  ~/Library/Audio/Plug-Ins/Components/

codesign --force --deep --sign - ~/Library/Audio/Plug-Ins/Components/RhythmicSpace.component
xattr -cr ~/Library/Audio/Plug-Ins/Components/RhythmicSpace.component
killall -9 AudioComponentRegistrar
```

Install VST3:

```bash
cp -R ~/Documents/GitHub/RhythmicSpace/Builds/MacOSX/build/Release/RhythmicSpace.vst3 \
  ~/Library/Audio/Plug-Ins/VST3/
xattr -cr ~/Library/Audio/Plug-Ins/VST3/RhythmicSpace.vst3
```

---

## Step 5 — Validate AU (note type change)

```bash
auval -v aumf Rysp Ltha
```

**Use `aumf` now**, not `aufx`.

Success = **FIRST TIME** passes (no `-10868`), full **AU VALIDATION SUCCEEDED**.

If `-10868` returns → JUCE not updated enough, or Projucer not re-saved after JUCE upgrade.

---

## Step 6 — Logic Pro

### Audio processing on an audio track

Many `aumf` plugins still process audio on audio tracks. Try:
**Audio FX → LATHAMAUDIO → Rhythmic Space**

### MIDI Learn (Logic requirement)

Logic only routes live MIDI to **MIDI-controlled effects**:

1. Create a **Software Instrument** track
2. Insert: **AU MIDI-controlled Effects → LATHAMAUDIO → Rhythmic Space**
3. Route audio via **sidechain** from your audio track (see [Waves MIDI in Logic](https://www.waves.com/support/how-to-control-waves-plugins-with-midi-in-logic-pro))
4. Arm the instrument track
5. Right-click knob in plugin → **LEARNING** → move a **CC** knob on controller
6. **MIDI IN** indicator should flash green

---

## Step 7 — Ableton Live (VST3)

On the track with Rhythmic Space:

1. **MIDI From** → your controller
2. **Arm** track
3. Right-click knob → learn → move CC fader/knob

---

## Quick checklist

| Check | Command / action |
|-------|------------------|
| JUCE updated | `git branch` in JUCE folder shows `develop` |
| Type is `aumf` | `plutil -extract AudioComponents.0.type raw …/Info.plist` → `aumf` |
| auval passes | `auval -v aumf Rysp Ltha` |
| MIDI reaches plugin | **MIDI IN** flashes green in plugin UI |
| No stuck popup | KnobComponent has no `PopupMenu` |

---

## If you must ship before JUCE upgrade

Temporary fallback (what you have now):

- **`aufx`** + **no MIDI input flag** → Logic audio FX works, `auval` passes
- MIDI Learn only in **Ableton VST3** after re-enabling **Plugin wants MIDI input** and keeping **`pluginAUMainType="'aufx'"`** — test `auval -v aufx` still passes

That is **not** a complete Logic MIDI solution. Upgrade JUCE + `aumf` is the real fix.
