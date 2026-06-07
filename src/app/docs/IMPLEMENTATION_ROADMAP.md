# LATHAM AUDIO IMPLEMENTATION ROADMAP

**Last Updated**: June 2026  
**Status**: Phase 1–4 shipped on main · Listen QA in progress

---

## Shipped on main

- Multiband DSP, honest A/B bypass, genre presets with guardrails
- `loudnessStyle` wired in `mastering-chain-builder.ts` (SSL + limiter)
- BS.1770 live/export metering, auto-staging, export true-peak
- Pro Dynamics, Mix Setup, suggested markers, `#/demo` A/B page
- **150+ automated tests** (`npm test`)

---

## Current priority: Quality (Lane 1)

### Listen QA

Manual checklist: [`LISTEN_QA.md`](./LISTEN_QA.md)

7 hero genres × 3 export presets — ears + export banner (LUFS + dBTP).

### Automated

- Preset invariants + resolver tests aligned with additive user overrides
- Genre × delivery matrix tests (hero genres + width bounds)
- CI runs `npm test` before deploy

---

## Next (after listen QA sign-off)

1. ~~Reference track matching in main UI~~ — **shipped**
2. ~~Album / batch export~~ — **shipped** (shared `runMasterExport` pipeline + ZIP)
3. ~~Product nav~~ — **shipped** (Mastering Suite · Demo · Plugins soon)
4. Bundle cleanup (TensorFlow dead chunk, unused Radix) — **partial** (removed TF chunk; TF dep still in package for ML stub)
5. **Faust WASM limiter** — `npm run build:faust` compiles `src/dsp/limiter-v2.dsp` → `public/faust/compiled/limiter/`; export prefers Faust, falls back to FIR worklet
6. Export delivery: **24-bit WAV** + premium ceiling limiter on offline render

---

## Phase history

| Phase | Goal | Status |
|-------|------|--------|
| 0–2 | Multiband, A/B, auto-apply | ✅ Merged |
| 3 | Meters, limiter, clipper | ✅ Merged |
| 4 | UX, Pro Dynamics | ✅ Merged |
| Quality | LUFS, true-peak, auto-staging | ✅ Merged |
| Listen QA | Genre × delivery ears | 🚧 Checklist ready |

---

## Principle

Presets are safe defaults. User tweaks are user responsibility. Guardrails never unlock.
