# Rhythmic Space v1.0.2 — ship checklist (AU + VST3 both working)

Use this once. **JUCE 8.0.13 is fine** — its `getAUChannelInfo()` matches `develop` (verified). You do **not** need a JUCE upgrade.

---

## Target state

| Feature | Logic (AU) | Ableton (VST3) |
|---------|------------|----------------|
| Loads on track | ✅ | ✅ |
| Audio processing | ✅ | ✅ |
| Presets / transport | ✅ | ✅ |
| MIDI Learn (CC) | ✅ | ✅ |
| `auval` passes | ✅ `aumf` | n/a |

---

## 1. Projucer (one save)

| Setting | Value |
|---------|--------|
| Plugin wants MIDI input | ✅ ON |
| Plugin is a synth | ❌ OFF |
| Channel configurations | empty |
| AU Main Type | **Music Effect** (`aumf`) |

**Save and Open in IDE.**

---

## 2. Code fixes (manual if patches fail)

**`KnobComponent.cpp`** — right-click only calls `onMIDILearnRequest`, no `PopupMenu`.

**`PluginProcessor.cpp`** — `acceptsMidi()` returns `true`; `getPosition()` playhead; destructor present.

**`MIDIControllerMap.cpp`** — on learn complete, apply first CC (see `0011` patch in this folder).

---

## 3. Build Release (both formats)

Xcode scheme **RhythmicSpace - AU** → Release → Build  
Xcode scheme **RhythmicSpace - VST3** → Release → Build  

---

## 4. Install

```bash
# AU
rm -rf ~/Library/Audio/Plug-Ins/Components/RhythmicSpace.component
cp -R ~/Documents/GitHub/RhythmicSpace/Builds/MacOSX/build/Release/RhythmicSpace.component \
  ~/Library/Audio/Plug-Ins/Components/
codesign --force --deep --sign - ~/Library/Audio/Plug-Ins/Components/RhythmicSpace.component
xattr -cr ~/Library/Audio/Plug-Ins/Components/RhythmicSpace.component

# VST3
cp -R ~/Documents/GitHub/RhythmicSpace/Builds/MacOSX/build/Release/RhythmicSpace.vst3 \
  ~/Library/Audio/Plug-Ins/VST3/
xattr -cr ~/Library/Audio/Plug-Ins/VST3/RhythmicSpace.vst3

killall -9 AudioComponentRegistrar
```

---

## 5. Validate AU

```bash
auval -v aumf Rysp Ltha
```

Must end with **AU VALIDATION SUCCEEDED** (no `-10868` on FIRST TIME).

---

## 6. Smoke test — Logic

1. Quit and reopen Logic
2. **Software Instrument** track → **AU MIDI-controlled Effects** → LATHAMAUDIO → Rhythmic Space
3. Sidechain audio from your audio track (or process on instrument track with sidechain)
4. Arm track → right-click **CUTOFF** → move controller **CC** knob
5. **MIDI IN** flashes green; knob moves

---

## 7. Smoke test — Ableton

1. Audio track → Rhythmic Space **VST3**
2. **MIDI From** → your controller
3. Arm track → right-click knob → learn → move CC
4. **MIDI IN** flashes green; knob moves

---

## 8. Tag release

```bash
cd ~/Documents/GitHub/RhythmicSpace
git add -A
git commit -m "v1.0.2: AU aumf + VST3 MIDI learn, JUCE develop"
git tag v1.0.2
git push origin main --tags
```

Update GitHub Release with both `.component` and `.vst3` from `build/Release/`.

---

## If something fails

| Symptom | Fix |
|---------|-----|
| `auval` `-10868` | Debug build installed, or Projucer not re-saved, or empty bundle |
| `didn't find component` | Release build not copied; empty `MacOS/` in bundle |
| MIDI IN stays grey (Ableton) | **MIDI From** + arm track |
| MIDI IN stays grey (Logic) | Use **AU MIDI-controlled Effects** on instrument track, not plain audio insert |
| Stuck learn popup | Remove `PopupMenu` from `KnobComponent.cpp` |

---

## What you already proved

- **Release build** + **codesign** + **`aufx`** → full `auval` pass ✅  
- Audio DSP works in hosts ✅  

Remaining work is **switch Projucer to `aumf`**, **rebuild Release**, **validate**, **route MIDI in hosts** — not a rewrite. See **`FINAL-DEFINITIVE-FIX.md`**.
