# LathamAudio Mastering Suite

Hardware emulation mastering in your browser. Neve 1073 transformer → Studer A800 tape → SSL bus compressor → true peak limiter. 21 dance music genre presets. £5/month.

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
npm test          # Run test suite
npm run test:watch  # Watch mode
```

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
│   │   ├── ai-mastering-engine.ts      # AI recommendation engine
│   │   └── multi-stage-limiter.ts      # True peak limiter
│   ├── utils/
│   │   └── audio-analyzer.ts      # Input file analysis
│   └── worklets/
│       ├── oversampling-limiter.js     # 4x oversampling true peak limiter
│       └── lufs-metering-processor.js  # LUFS measurement
├── dsp/
│   ├── limiter.dsp                # Faust export limiter (built to WASM)
│   ├── limiter-lookahead.dsp      # Future look-ahead spec (not compiled yet)
│   └── BUILD_INSTRUCTIONS.md
└── styles/                        # Tailwind v4 + VST theme

public/
├── worklets/
│   └── pro-compressor-worklet.js  # Pro compressor AudioWorklet
└── faust/                         # Faust DSP sources (not yet compiled to WASM)
```

## Signal Chain

1. **Neve 1073 Transformer** — LF emphasis, HF rolloff, asymmetric even-harmonic saturation
2. **Studer A800 Tape** — Head bump, bias, hysteresis, tape compression, speed-dependent HF rolloff
3. **SSL Bus Compressor** — Feed-forward, variable knee, sidechain HPF
4. **Multiband Processing** — Genre-dependent crossovers and per-band dynamics
5. **M/S Processing** — Stereo width control, mono bass enforcement
6. **True Peak Limiter** — 31-tap FIR, 4x oversampling, look-ahead, dual-stage waveshapers

## Key Design Decisions

- **All processing runs client-side** in WebAudio/AudioWorklets — zero server costs
- **Preview = Export** — same DSP chain, only WaveShaper oversampling differs (2x preview, 4x export)
- **21 genre presets** control every stage parameter, not just EQ curves
- **6-layer guardrail system** protects the user's premaster from destruction

## License

Proprietary — © LathamAudio
