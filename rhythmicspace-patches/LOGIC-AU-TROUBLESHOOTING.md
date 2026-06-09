# Rhythmic Space — Logic Pro AU Troubleshooting

If the **AU component** doesn't show up or won't load in Logic, work through these steps in order.

## "Couldn't be opened" + blank validation window

If Logic's Plug-in Manager shows **RhythmicSpace** but Compatibility says **"couldn't be opened"**, and the Audio Unit Validation Result window is **empty/blank**, the AU binary is failing to load before validation can run. This is different from a normal validation error.

Work through these steps **in this order**:

### A. Code-sign the component (most common fix for local Xcode builds)

Unsigned local builds often show exactly this error in Logic:

```bash
codesign --force --deep --sign - ~/Library/Audio/Plug-Ins/Components/RhythmicSpace.component
xattr -cr ~/Library/Audio/Plug-Ins/Components/RhythmicSpace.component
```

Then quit Logic, reopen, and **Reset & Rescan Selection**.

### B. Run validation in Terminal (shows the real error)

Rhythmic Space registers as **`aumf`** (MIDI-controlled effect), not `aufx`:

```bash
auval -v aumf Rysp Ltha
```

Using `aufx` by mistake produces a false "didn't find the component" error even when the plugin is installed correctly.

If you see:
```
ERROR: Cannot get Component's Name strings
ERROR: Error from retrieving Component Version: -50
FATAL ERROR: didn't find the component
```

macOS **cannot see your AU in its registry at all**. The bundle is missing, incomplete, or unreadable — not a DSP bug.

Run the full diagnostic script:
```bash
bash ~/Documents/GitHub/mastering/rhythmicspace-patches/diagnose-au.sh
```

Or check manually:
```bash
# Is it registered?
auval -a | grep -i Ltha

# Is the bundle complete?
ls ~/Library/Audio/Plug-Ins/Components/RhythmicSpace.component/Contents/MacOS/
plutil -p ~/Library/Audio/Plug-Ins/Components/RhythmicSpace.component/Contents/Info.plist | grep AudioComponents
```

### C. Check architecture matches your Mac

```bash
lipo -info ~/Library/Audio/Plug-Ins/Components/RhythmicSpace.component/Contents/MacOS/RhythmicSpace
```

- Apple Silicon Mac → needs **arm64** (or universal arm64+x86_64)
- If it only shows **x86_64**, rebuild in Xcode with **Any Mac (Apple Silicon, Intel)** selected

### D. Rebuild with the AU bus fix (patch 0006)

Your v1.0.1 build may include an extra disabled "MIDI In" bus that breaks AU loading in Logic. Apply the fix and rebuild:

```bash
cd ~/Documents/GitHub/RhythmicSpace
git am ~/Documents/GitHub/mastering/rhythmicspace-patches/0006-Fix-Logic-AU-validation.patch
```

In Projucer/Xcode:
1. Open `RhythmicSpace.jucer` → **Save and Open in IDE**
2. Scheme: **RhythmicSpace - AU**
3. Configuration: **Release**
4. Build (⌘B)
5. Reinstall:

Build Release from Terminal (reliable):

```bash
cd ~/Documents/GitHub/RhythmicSpace/Builds/MacOSX
xcodebuild -scheme "RhythmicSpace - AU" -configuration Release build
```

Find the built component (path varies by Xcode version):

```bash
find ~/Documents/GitHub/RhythmicSpace/Builds/MacOSX/build -name "RhythmicSpace.component" 2>/dev/null
find ~/Library/Developer/Xcode/DerivedData/RhythmicSpace-*/Build/Products/Release -name "RhythmicSpace.component" 2>/dev/null
```

Install (replace `SOURCE` with the path found above):

```bash
rm -rf ~/Library/Audio/Plug-Ins/Components/RhythmicSpace.component
cp -R SOURCE ~/Library/Audio/Plug-Ins/Components/
codesign --force --deep --sign - ~/Library/Audio/Plug-Ins/Components/RhythmicSpace.component
xattr -cr ~/Library/Audio/Plug-Ins/Components/RhythmicSpace.component
killall -9 AudioComponentRegistrar
```

**Important:** Building in Xcode does not auto-install. You must copy the `.component` into `~/Library/Audio/Plug-Ins/Components/` yourself.

Use **`~/Library`** (your user folder), not `/Library` (system folder).

---

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
5. Copy the built component (find path first — may be `build/Release`, `build/Debug`, or DerivedData):

```bash
find ~/Documents/GitHub/RhythmicSpace/Builds/MacOSX/build -name "RhythmicSpace.component" 2>/dev/null
cp -R /path/from/find/above ~/Library/Audio/Plug-Ins/Components/
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

Run Apple's AU validator with the correct type code:

```bash
auval -v aumf Rysp Ltha
```

- `aumf` = MIDI-controlled music effect (Rhythmic Space uses this because of MIDI Learn)
- `Rysp` = plugin code
- `Ltha` = manufacturer code

Confirm type in Info.plist: `"type" => "aumf"`.

**Pass** on the first section = macOS can see and open the plugin.

**Initialize: -10868** on a Release build = bus layout code issue. Apply patch `0007`, rebuild Release, reinstall.

**Initialize: -10868** with JUCE leak-detector messages = you installed a **Debug** build. Rebuild **Release**, copy again, and revalidate.

**Fail** at open = note the error and rebuild with the latest code (see patches `0006` and `0007`).

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
