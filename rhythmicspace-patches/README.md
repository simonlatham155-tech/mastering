# RhythmicSpace v1.0.1 — Push Kit

This folder contains everything you need to push the production-readiness fixes to
[simonlatham155-tech/RhythmicSpace](https://github.com/simonlatham155-tech/RhythmicSpace).

The Cloud Agent could not push directly to RhythmicSpace (403). These patches were
delivered via the `mastering` repo instead.

## Quick push (recommended)

### 1. Clone RhythmicSpace (if you don't have it)

```bash
git clone https://github.com/simonlatham155-tech/RhythmicSpace.git
cd RhythmicSpace
```

### 2. Run the push script

From your local clone of **mastering**, copy this folder or run:

```bash
# Option A: copy patches from mastering repo, then:
cd /path/to/RhythmicSpace
bash /path/to/mastering/rhythmicspace-patches/push-to-github.sh
```

### 3. Open a PR

GitHub will show a link after push. Open a **draft PR** from
`cursor/fix-production-readiness-a9cf` → `main`.

---

## Manual method

```bash
cd /path/to/RhythmicSpace
git checkout main
git pull origin main
git checkout -b cursor/fix-production-readiness-a9cf
git am /path/to/mastering/rhythmicspace-patches/rhythmicspace-v1.0.1-combined.patch
git push -u origin cursor/fix-production-readiness-a9cf
```

---

## What's in the patches (3 commits)

1. **Fix production readiness issues** — session recall, presets, filter, reverb, MIDI, thread safety
2. **Host playhead sync + modulation smoothing** — PPQ sync, 10ms ramps, doc updates
3. **Cloud Agent config** — `.cursor/environment.json`, `AGENTS.md`

---

## After pushing

1. Build **Release** in Xcode (open `RhythmicSpace.jucer` → Save and Open in IDE)
2. Smoke-test in Logic or Reaper (session recall, SYNC, presets)
3. Tag **v1.0.1** and update GitHub releases when ready

---

## Website redesign (download page)

Redesigned `docs/index.html` to match the Latham Audio promotional style — dark navy layout, cyan accents, plugin UI mockup, feature grid, and download CTA with VST3 / AU / Standalone links.

### Quick apply

```bash
cd /path/to/RhythmicSpace
bash /path/to/mastering/rhythmicspace-patches/apply-website.sh
```

Opens PR branch `cursor/website-redesign-a9cf` → `main`.

### Manual copy

Copy `rhythmicspace-patches/docs/index.html` to `docs/index.html` in your RhythmicSpace repo and commit.

### Live preview

After merge, GitHub Pages updates at:
https://simonlatham155-tech.github.io/RhythmicSpace/

---

## Complete AU + MIDI Learn fix

**Read `AU-COMPLETE-FIX.md` first** — the full solution:

1. Upgrade JUCE to **`develop`** (AUChannelInfo fix, Aug 2025)
2. Projucer: **Plugin wants MIDI input** ON + **Music Effect (`aumf`)**
3. Release build → `auval -v aumf Rysp Ltha`
4. Logic: AU MIDI-controlled Effects + sidechain; Ableton: MIDI From on track

Patches: `0009` (stuck popup), `0011` (aumf + learn fix)

---

## Logic AU fix (-10868 Initialize) — legacy notes

If Logic shows **"couldn't be opened"** and `auval` fails FIRST TIME with **-10868**:

1. Read **`AU-ROOT-CAUSE.md`** — why `aumf` + channel config fails
2. Read **`AU-INTERNET-RESEARCH.md`** — forum citations and MIDI tradeoff
3. Apply **`0008-Fix-AU-type-aufx-definitive.patch`** (or follow **`AU-FIX-ONCE.md`**)
4. Validate: `auval -v aufx Rysp Ltha` (not `aumf`)
5. Run **`diagnose-au.sh`** if still stuck
