# LathamAudio Mastering Suite

Visible, editable hardware-emulation mastering in the browser. Pre-master
analysis recommends a starting strategy; it never silently masters the track.
The engineer explicitly applies or rejects the recommendation, then can inspect
and edit every audible rack stage.

## Quick Start

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

## Build

```bash
npm run build     # Production build → dist/
npm run preview   # Preview production build locally
```

## Test

```bash
npm run verify      # Typecheck + Faust DSP proof + tests + production build
npm test            # Run test suite
npm run test:watch  # Watch mode
```

`npm run verify` is the merge gate used by pull requests.

## Architecture

```
src/
├── app/
│   ├── App.tsx                    # Main application
│   ├── components/                # UI components
│   │   └── ui/                    # shadcn/ui primitives
│   ├── data/
│   │   ├── genre-presets.ts       # 21 genre profiles
│   │   ├── export-presets.ts      # Delivery targets (Spotify, Club, etc.)
│   │   ├── preset-resolution.ts   # Resolves genre + user overrides → ProcessingPlan
│   │   └── __tests__/             # Preset invariant tests
│   ├── services/
│   │   ├── audio-processor.ts     # Main processing engine
│   │   ├── mastering-chain-builder.ts  # WebAudio chain builder (patched v2)
│   │   ├── stages/
│   │   │   ├── transformer-stage.ts    # Neve 1073 transformer emulation
│   │   │   └── tape-stage.ts           # Studer A800 tape emulation
│   │   ├── ai-mastering-engine.ts      # Pre-master analysis + rack suggestions
│   │   └── multi-stage-limiter.ts      # True peak limiter
│   ├── utils/
│   │   └── audio-analyzer.ts      # Input file analysis
│   └── worklets/
│       ├── oversampling-limiter.js     # 4x oversampling true peak limiter
│       └── lufs-metering-processor.js  # LUFS measurement
├── dsp/
│   ├── limiter.dsp                # Faust stereo-linked look-ahead limiter
│   └── BUILD_INSTRUCTIONS.md
└── styles/                        # Tailwind v4 + VST theme

public/
├── worklets/
│   └── pro-compressor-worklet.js  # Pro compressor AudioWorklet
└── faust/                         # Compiled Faust WASM + metadata
```

## Signal Chain

1. **Neve 1073 Transformer** — LF emphasis, HF rolloff, asymmetric even-harmonic saturation
2. **Studer A800 Tape** — Head bump, bias, hysteresis, tape compression, speed-dependent HF rolloff
3. **SSL Bus Compressor** — Feed-forward, variable knee, sidechain HPF
4. **Multiband Processing** — Genre-dependent crossovers and per-band dynamics
5. **M/S Processing** — Stereo width control, mono bass enforcement
6. **Final Limiting** — Faust stereo-linked look-ahead gain control into a 4× FIR true-peak guard

If a browser cannot start the requested limiter backend, the runtime tries the
explicit order Faust + FIR → FIR → Faust → WaveShaper. The active backend and
its compensated latency are reported in the rack instead of claiming Faust
when a fallback is running.

## Key Design Decisions

- **All processing runs client-side** in WebAudio/AudioWorklets — zero server costs
- **AI suggests; the engineer applies** — analysis never writes hidden settings
- **Visible rack is the processing truth** — Transformer, Tape, Multiband, M/S,
  Clipper and limiter state are editable and reflected in the signal chain
- **HQ preview and export share one plan and limiter ladder** — export cannot
  switch to a hidden “minimal master” topology
- **Latency-aligned output** — look-ahead is removed from offline exports while
  retaining the processed tail; live bypass is delayed for valid A/B checks
- **21 genre presets** control every stage parameter, not just EQ curves
- **6-layer guardrail system** protects the user's premaster from destruction

## License

Proprietary — © LathamAudio
