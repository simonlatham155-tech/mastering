# Rhythmic Space AU — fix once (15 minutes)

Read `AU-ROOT-CAUSE.md` for why previous attempts failed.

## What you change (3 things only)

### 1. Projucer settings

Open `RhythmicSpace.jucer`:

| Setting | Set to |
|---------|--------|
| Plugin Characteristics | **nothing checked** (especially NOT "Plugin wants MIDI input") |
| Plugin Channel Configurations | **empty** |
| Plugin AU Main Type | **Effect** checked, **Music Effect** unchecked |

Save → **Save and Open in IDE**

### 2. Code — two functions in `PluginProcessor.cpp`

**acceptsMidi()** — replace entire function:
```cpp
bool RhythmicSpaceAudioProcessor::acceptsMidi() const
{
    return true;
}
```

**Constructor** — if you added `#else : AudioProcessor(),` for channel configs, **remove** that `#else` block (channel configs are empty again). Constructor should look like the standard JUCE template with only the `#ifndef JucePlugin_PreferredChannelConfigurations` stereo bus block.

Ensure destructor exists:
```cpp
RhythmicSpaceAudioProcessor::~RhythmicSpaceAudioProcessor() {}
```

### 3. Build + install

Xcode: **Release**, **RhythmicSpace - AU**, ⌘B

```bash
cp -R ~/Documents/GitHub/RhythmicSpace/Builds/MacOSX/build/Release/RhythmicSpace.component ~/Library/Audio/Plug-Ins/Components/
codesign --force --deep --sign - ~/Library/Audio/Plug-Ins/Components/RhythmicSpace.component
killall -9 AudioComponentRegistrar
auval -v aufx Rysp Ltha
```

**Important:** use **`aufx`** now (not `aumf`).

## Success looks like

- `auval` FIRST TIME: no `Initialize: -10868`
- Logic: **Audio FX → LATHAMAUDIO → Rhythmic Space** loads

## After it loads — test MIDI Learn

`aufx` fixes Logic loading on **audio tracks**. Logic may not send live MIDI CC to a standard audio insert (that is why the plugin was originally `aumf`). See **`AU-INTERNET-RESEARCH.md`** for the Logic sidechain workflow if MIDI Learn does not respond on an audio track.

## Or apply patch

```bash
cd ~/Documents/GitHub/RhythmicSpace
git am ~/Documents/GitHub/mastering/rhythmicspace-patches/0008-Fix-AU-type-aufx-definitive.patch
```

Then Projucer Save and Open in IDE → build → install.
