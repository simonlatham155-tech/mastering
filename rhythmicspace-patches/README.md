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
