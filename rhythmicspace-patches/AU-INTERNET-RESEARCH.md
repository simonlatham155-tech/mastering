# Rhythmic Space AU — internet research (-10868 / Logic)

Research compiled from JUCE forums, Apple docs, Stack Overflow, and plugin vendor support pages. Use with `AU-ROOT-CAUSE.md` and patch `0008`.

---

## What `-10868` means

| Source | Finding |
|--------|---------|
| [Stack Overflow](https://stackoverflow.com/questions/9153772/why-do-i-get-the-kaudiouniterr-formatnotsupported-10868-error) | `kAudioUnitErr_FormatNotSupported` — the host and AU cannot agree on stream format (sample rate, channel count, interleaved vs deinterleaved). macOS canonical format is **deinterleaved float PCM**. |
| [JUCE forum — Ableton AU](https://forum.juce.com/t/audiounit-in-ableton-failed-to-create-the-audiounit-xxx-this-audiounit-is-not-compatible-compatible-audio-format/13784) | Ableton support: failure happens when **IO initialization** fails. Common causes: multichannel buses, unsupported sample-rate changes, **interleaved stereo**. |
| [JUCE forum — DSP Quattro](https://forum.juce.com/t/4-3-0-au-fails-to-load-on-dsp-quattro/20074) | Exact same symptom: `ValidFormat … InvalidFormat` in `AUBase.cpp` → **-10868** during `SetupAudioUnitIO` / stream format setup. Log shows `AUChannelInfo` mismatch with what validator tries to set. |
| [JUCE forum — Logic sidechain](https://forum.juce.com/t/logic-requiring-a-sidechain-input-failed-to-load-audio-unit/34685) | Same `ValidFormat InvalidFormat` in Logic when bus topology in code disagrees with what AU reports. JUCE team: *"AU is tricky — you have multiple types of effects; incorrect/invalid AU type and channel configuration" can cause this.* |

**Your symptom** (`auval` passes OPEN, fails **FIRST TIME Initialize: -10868**) matches channel-layout / `AUChannelInfo` mismatch — not signing, install path, or Debug build.

---

## JUCE 8 `AUChannelInfo` bug (directly relevant)

| Source | Finding |
|--------|---------|
| [BR: Wrong AUChannelInfo reported](https://forum.juce.com/t/br-wrong-auchannelinfo-reported-for-some-bus-layout-combinations/66725) (Jul–Aug 2025) | JUCE 8 `getAUChannelInfo()` can emit **wildcard layouts** (`inChannels = -1`) when it should not — e.g. stereo output reported as `[-1, 2]` instead of `[1,2]` and `[2,2]`. Causes **`auval` failure on Initialize**. |
| JUCE fix (Aug 14, 2025) | Merged to **develop** branch: only emit wildcards when every layout up to 16 channels is truly supported. |

You are on **JUCE 8.0.13**. That fix may not be in your release tag. Combined with **`aumf` (Music Effect)** registration, stereo I/O, and Projucer channel configs, this is a plausible trigger for your exact failure.

---

## `aumf` vs `aufx` — the core tradeoff

Apple defines two effect categories:

| Type | FourCC | Purpose |
|------|--------|---------|
| Effect | `aufx` | Standard audio in → audio out (delay, reverb, filter) |
| Music Effect | `aumf` | Audio DSP **plus MIDI** (e.g. filter tuned by keyboard notes) |

Sources:

- [JUCE — Instrument vs effect](https://forum.juce.com/t/instrument-plugin-vs-audio-effect/8050): *"replace `kAudioUnitType_Effect` with `kAudioUnitType_MusicEffect` to persuade hosts to send MIDI"*
- [JUCE — aumf or aufx automation](https://forum.juce.com/t/aumf-or-aufx-which-one-is-ok-for-automation/27543): Fabian (JUCE): **note-on and pitchwheel do not reach `processBlock` on `aufx`** — need `aumf` + `acceptsMidi() == true`
- [JUCE — MIDI IN Logic](https://forum.juce.com/t/midi-in-audio-effect-plugin-logic-pro/65294) (Feb 2025): *"In Logic, to send MIDI to an effect, it must be a MIDI-controlled effect … inserted into the Instrument slot. Audio routed via sidechain."*
- [D16 support — AU MIDI Controlled Effect](https://helpdesk.d16.pl/knowledge_base/article/59): MIDI Learn on AU requires **Music Effect** workflow in Logic (instrument track + sidechain bus)
- [Waves — MIDI in Logic](https://www.waves.com/support/how-to-control-waves-plugins-with-midi-in-logic-pro): Same pattern — load under **AU MIDI-controlled Effects**, sidechain audio from source track

### Why patch 0008 chooses `aufx`

Rhythmic Space is primarily a **stereo audio FX** on an audio track. Current `aumf` + `pluginWantsMidiIn` fails **`auval` Initialize** before Logic can load it at all.

**`aufx` fixes validation and normal Audio FX insertion on audio tracks.**

### MIDI Learn after switching to `aufx`

| Host | Expected behaviour |
|------|-------------------|
| **Ableton** (VST3) | MIDI Learn already works (your VST3 build) |
| **Logic — audio track insert** | MIDI CC / learn **may not** reach the plugin on a plain audio insert (`aufx`) |
| **Logic — MIDI-controlled workflow** | If you need live MIDI CC in Logic, use instrument track + sidechain (see below) — or explore keeping `aumf` **after** upgrading JUCE and fixing `AUChannelInfo` |

---

## Other common `-10868` causes (ruled out or secondary)

| Issue | Source | Your case |
|-------|--------|-----------|
| Legacy Projucer channel configs vs `isBusesLayoutSupported` | [Multi Bus AU](https://forum.juce.com/t/multi-bus-au-plugin/53546) | Tried `{1,1},{2,2}` — still failed with `aumf` |
| `PreferredChannelConfigurations` vs dynamic buses | [Mono/Mono AU Live](https://forum.juce.com/t/mono-mono-au-fails-to-load-in-live-this-audio-unit-plug-in-is-not-compatible-failed-to-initialize/34318) | Empty configs + `isBusesLayoutSupported` is the modern pattern |
| Extra/disabled input buses | [Multi Bus AU](https://forum.juce.com/t/multi-bus-au-plugin/53546) | Patch 0006 removed disabled MIDI In bus |
| `auval -comp` on ARM64 | [Apple Silicon auval](https://forum.juce.com/t/default-au-from-projucer-fails-auval-on-apple-silicon-big-sur-dtk-solved/42845) | Use `auval -v aufx Rysp Ltha` **without** `-comp` |
| Stale registrar cache | Multiple threads | `killall -9 AudioComponentRegistrar` after install |

---

## Recommended path (priority order)

### 1. Apply patch 0008 — get Logic loading (now)

```bash
cd ~/Documents/GitHub/RhythmicSpace
git am ~/Documents/GitHub/mastering/rhythmicspace-patches/0008-Fix-AU-type-aufx-definitive.patch
```

Projucer → Save and Open in IDE → **Release** → **RhythmicSpace - AU** → install → validate:

```bash
auval -v aufx Rysp Ltha
```

Success: **FIRST TIME** completes without `-10868`. Logic: **Audio FX → LATHAMAUDIO → Rhythmic Space**.

### 2. Test MIDI Learn in Logic

On an **audio track** with the `aufx` build:

1. Insert Rhythmic Space as normal audio FX
2. Try MIDI Learn from your controller
3. If no MIDI arrives in `processBlock`, that is expected for `aufx` in Logic (see tradeoff above)

**Logic workaround for MIDI CC** (standard industry pattern):

1. Create a **Software Instrument** track
2. Insert Rhythmic Space under **AU MIDI-controlled Effects** (if listed) or as the instrument plugin
3. Route source audio via **sidechain** (bus → aux, or plugin sidechain input)
4. Arm the instrument track; use MIDI Learn inside the plugin

See [Waves MIDI in Logic](https://www.waves.com/support/how-to-control-waves-plugins-with-midi-in-logic-pro) for the same bus/sidechain pattern.

### 3. Optional later — restore `aumf` for native Logic MIDI

If you need MIDI on audio tracks without the sidechain workflow:

1. Upgrade JUCE to a build that includes the **Aug 2025 `AUChannelInfo` fix** (develop or newer 8.0.x)
2. Re-test with `pluginAUMainType="'aumf'"` + `pluginWantsMidiIn` + empty channel configs + strict `isBusesLayoutSupported`
3. Validate: `auval -v aumf Rysp Ltha` — FIRST TIME must pass before reverting from `aufx`

---

## Key links

- [Apple Audio Unit types](https://developer.apple.com/documentation/audiotoolbox/audiotoolbox_enumerations/1584142-audio_unit_types)
- [JUCE AUChannelInfo bug + fix](https://forum.juce.com/t/br-wrong-auchannelinfo-reported-for-some-bus-layout-combinations/66725)
- [JUCE auval / MIDI FX channel info](https://forum.juce.com/t/a-au-plugin-has-error-with-auval/55049)
- [osstatus.com — 10868](https://www.osstatus.com/search/results?platform=all&framework=all&search=10868)
