# MIDI Learn — Ableton Live (VST3)

## Why learn stopped working

The AU fix unchecked **Plugin wants MIDI input** in Projucer. That also sets `JucePlugin_WantsMidiInput = 0` for **VST3**, so Ableton never sends MIDI into `processBlock` — even though `acceptsMidi()` returns `true` in code.

**Fix:** Re-check **Plugin wants MIDI input** in Projucer **and** keep **Plugin AU Main Type → Effect** with `pluginAUMainType="'aufx'"` in the `.jucer` file. Apply patch `0010-Reenable-VST3-MIDI-keep-aufx.patch`.

After Projucer save → rebuild **Release** VST3 and AU → re-run `auval -v aufx Rysp Ltha`.

## Ableton routing (required)

MIDI is **not** automatic on audio tracks.

1. Put **Rhythmic Space VST3** on an **audio track** (or your usual track)
2. In the track mixer, open **MIDI From** (below the track name)
3. Choose your controller (e.g. **Minilab MK3** / **All Ins** / a MIDI track)
4. **Arm** the track (red record button) if MIDI still doesn’t arrive
5. Open the plugin UI (wrench icon if collapsed)
6. **Right-click** a knob (e.g. CUTOFF) — MIDI panel shows **LEARNING: filterCutoff**
7. Move a **knob or fader** on the controller (must send **MIDI CC**, not notes only)

## Confirm MIDI is reaching the plugin

- **MIDI IN** indicator (top of MIDI CONTROL panel) flashes **green** when CC arrives
- If it stays grey, routing is wrong — fix **MIDI From**, not the plugin

## Stuck “MIDI Learn: CUTOFF” popup

Right-click used to show a floating menu that could get stuck in Ableton. Apply patch `0009-Fix-stuck-MIDI-learn-popup.patch` or remove the `PopupMenu` in `KnobComponent.cpp`. Use **CANCEL LEARN** in the plugin instead.

## Cancel learn

**MIDI CONTROL** panel → **CANCEL LEARN** (red button)
