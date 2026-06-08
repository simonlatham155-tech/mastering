# Xcode build fix — PluginProcessor.cpp

If you see these errors:
- `Member reference base type 'bool' is not a structure or union`
- `Indirection requires pointer operand ('int' invalid)`

## Step 1 — Edit the RIGHT file

Open in Finder:
```
/Users/simonlatham/Documents/GitHub/RhythmicSpace/Source/PluginProcessor.cpp
```

In Xcode, press **⌘F** and search for:
```
getIsPlaying().hasValue
```

- **If found** → you still have the broken code (fix below)
- **If NOT found** → search for `getCurrentPosition` — fix may already be applied; try Clean Build

## Step 2 — Replace `updateHostTransportState`

Find the function `updateHostTransportState` and replace the **entire function** with:

```cpp
void RhythmicSpaceAudioProcessor::updateHostTransportState()
{
    if (! hostSyncEnabled.load())
        return;

    if (auto* playHead = getPlayHead())
    {
        juce::AudioPlayHead::CurrentPositionInfo pos;

        if (playHead->getCurrentPosition (pos))
        {
            if (pos.bpm > 0.0 && pos.bpm != bpm.load())
            {
                bpm.store(pos.bpm);
                stepSequencer.setBPM(pos.bpm);
            }

            playing.store(pos.isPlaying);

            const double hostPpq = pos.ppqPosition;
            const bool hostJumped = lastHostPpq < 0.0
                                 || std::abs(hostPpq - lastHostPpq) > 0.25;

            if (pos.isPlaying || hostJumped)
                stepSequencer.syncToHostPpq(hostPpq);

            lastHostPpq = hostPpq;
        }
    }
}
```

Save (**⌘S**).

## Step 3 — Regenerate Xcode project

1. Close Xcode
2. Open **Projucer** → open `RhythmicSpace.jucer` from **Documents/GitHub/RhythmicSpace**
3. **Save Project and Open in IDE**

## Step 4 — Clean build

In Xcode:
1. **Product → Clean Build Folder** (hold Option key)
2. Scheme: **RhythmicSpace - VST3** (or AU)
3. **Release**
4. **⌘B**
