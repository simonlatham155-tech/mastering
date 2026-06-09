# Rhythmic Space — Logic Pro AU Troubleshooting

If the **AU component** doesn't show up or won't load in Logic, work through these steps in order.

## 1. Confirm you installed the AU (not VST3)

Logic uses the **Audio Unit** format only — not VST3.

| Format | Folder |
|--------|--------|
| **AU Component** | `~/Library/Audio/Plug-Ins/Components/RhythmicSpace.component` |
| VST3 (Ableton etc.) | `~/Library/Audio/Plug-Ins/VST3/RhythmicSpace.vst3` |

After unzipping the AU download, copy **`RhythmicSpace.component`** (the whole bundle) into the Components folder.

In Finder: **Go → Go to Folder…** → paste `~/Library/Audio/Plug-Ins/Components/`

## 2. Build the AU target in Xcode

If you built from source, make sure you built the **AU** scheme, not just VST3:

1. Open `RhythmicSpace.jucer` → Save and Open in IDE
2. In Xcode, select scheme **RhythmicSpace - AU**
3. Set configuration to **Release**
4. Build (⌘B)
5. Copy the built component:

```bash
cp -R ~/Documents/GitHub/RhythmicSpace/Builds/MacOSX/build/Release/RhythmicSpace.component \
      ~/Library/Audio/Plug-Ins/Components/
```

## 3. Remove macOS quarantine (downloaded zips)

Downloaded plugins are often blocked until quarantine is cleared:

```bash
xattr -cr ~/Library/Audio/Plug-Ins/Components/RhythmicSpace.component
```

## 4. Rescan in Logic

1. Quit Logic completely
2. Reopen Logic
3. **Logic Pro → Settings → Plug-in Manager**
4. Find **Rhythmic Space** (manufacturer: LATHAMAUDIO)
5. If it shows a warning, click **Reset & Rescan Selection**
6. If needed: **Reset & Rescan All**

## 5. Validate the AU in Terminal

Run Apple's AU validator:

```bash
auval -v aufx Rysp Ltha
```

- `aufx` = audio effect
- `Rysp` = plugin code
- `Ltha` = manufacturer code

**Pass** = plugin is valid; Logic should load it after a rescan.

**Fail** = note the error and rebuild with the latest code (see patch `0006`).

## 6. Remove old duplicates

Only one copy should exist:

```bash
ls -la ~/Library/Audio/Plug-Ins/Components/ | grep -i rhythmic
```

Delete any old or duplicate `.component` files, then reinstall the latest build.

## 7. Use your local v1.0.1 build (not old GitHub v1.0.0)

GitHub releases may still be **v1.0.0** (May 2025). Your Xcode **v1.0.1** build includes production fixes.

The VST3 working in Ableton does **not** mean the AU is installed — they are separate files in separate folders.

## 8. Insert on an audio track

Rhythmic Space is an **audio effect** (not an instrument):

1. Create an **Audio** track (not Software Instrument)
2. Add audio or a loop to the track
3. On the track channel strip: **Audio FX → LATHAMAUDIO → Rhythmic Space**

## Code fix (v1.0.1+)

Patch `0006` removes an extra "MIDI In" bus that could cause Logic AU validation to fail, and fixes the JUCE playhead API for broader Xcode compatibility.

Apply from your RhythmicSpace repo:

```bash
cd ~/Documents/GitHub/RhythmicSpace
git am ~/Documents/GitHub/mastering/rhythmicspace-patches/0006-Fix-Logic-AU-validation.patch
```

Then rebuild **RhythmicSpace - AU** in Release and reinstall.

## Still stuck?

Check **Console.app** while opening Logic — filter for `RhythmicSpace` or `auval` to see crash/validation errors.

Common messages:
- **"couldn't be opened"** → quarantine or unsigned build (step 3)
- **Not in plug-in list** → wrong folder or AU not built (steps 1–2)
- **Validation failed** → rebuild with patch 0006 (step 5 + code fix)
