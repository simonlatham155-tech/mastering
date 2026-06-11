# Rhythmic Space AU — root cause (Initialize -10868)

## Summary

**The plugin is registered as the wrong Audio Unit type.** Logic and `auval` fail at **Initialize** with `-10868` (`kAudioUnitErr_FormatNotSupported`) because JUCE reports channel capabilities that do not match what the AU validator expects — not because of install path, signing, or Debug vs Release.

## What we ruled out

| Tried | Result |
|-------|--------|
| Correct install folder (`~/Library/.../Components/`) | Required but not sufficient |
| Code signing + quarantine | Required but not sufficient |
| Release vs Debug build | Debug caused extra failures; Release still hits -10868 |
| `isBusesLayoutSupported` code changes | No effect while `aumf` + channel config mismatch remains |
| Projucer `{1,1}, {2,2}` channel configs | Still -10868 with **Music Effect** type |
| Wrong `auval` type (`aufx` vs `aumf`) | Using correct `aumf` passes open, fails Initialize |

## Actual root cause

Projucer has:

```
pluginCharacteristicsValue="pluginWantsMidiIn"
```

Plus **Plugin AU Main Type → Music Effect** (`aumf`).

That combination tells macOS: *"MIDI-controlled music effect"* — a special AU category for processors driven primarily by MIDI (arpeggiators, MIDI transforms), **not** a stereo audio FX with optional MIDI CC learn.

Rhythmic Space is:

- Stereo audio in → stereo audio out
- MIDI used only for **MIDI Learn** (CC mapping)
- Should be **`aufx` (Effect)**, same category as delay/reverb/filter plugins

### Why -10868 happens

`auval` **FIRST TIME** calls `AudioUnitInitialize` with a specific bus layout (typically stereo, 44100 Hz).

With `aumf` + stereo I/O buses, **JUCE 8.0.x** can report `AUChannelInfo` that does not match the default stream format — a [known JUCE forum issue](https://forum.juce.com/t/a-au-plugin-has-error-with-auval/55049). Result: format rejected → **Initialize -10868** → Logic shows **"couldn't be opened"**.

VST3 works because VST3 uses a completely different format path with no AU type registration.

## The fix (one coherent change)

### Projucer (`RhythmicSpace.jucer`)

1. **Plugin Characteristics** — remove `pluginWantsMidiIn` (leave empty)
2. **Plugin AU Main Type** — **Effect only** (`aufx`), uncheck Music Effect
3. **Plugin Channel Configurations** — leave **empty** (use dynamic buses in code)

### Code (`PluginProcessor.cpp`)

1. `acceptsMidi()` → always `return true` (MIDI Learn still works; does not force `aumf`)
2. Keep standard stereo `BusesProperties` constructor
3. Keep `isBusesLayoutSupported` — mono/stereo matching (JUCE tutorial pattern)
4. Playhead: `getPosition()` with `getIsPlaying()` as plain `bool` (JUCE 8.0.13)

### Build

1. Projucer → Save and Open in IDE
2. Xcode: **Release**, scheme **RhythmicSpace - AU**, ⌘B
3. Install + sign + rescan

### Validate

```bash
auval -v aufx Rysp Ltha
```

Note **`aufx`** not `aumf`. FIRST TIME should complete without -10868.

## Apply patch

```bash
cd ~/Documents/GitHub/RhythmicSpace
git am ~/Documents/GitHub/mastering/rhythmicspace-patches/0008-Fix-AU-type-aufx-definitive.patch
```

Then Projucer Save and Open in IDE → Release build → install.
