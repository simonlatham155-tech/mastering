/**
 * MASTERING CHAIN BUILDER (PATCHED)
 * ==================================
 * 
 * CHANGES FROM ORIGINAL:
 * 1. createSSLCompressor() now reads loudnessStyle + thdMode from ProcessingPlan
 * 2. createLimiterStage() now reads loudnessStyle for attack/release/ratio/ceiling/knee
 * 3. createLimiterStage() has dual-stage WaveShaper (Type1 punchy + Type2 true peak)
 * 4. Genre-specific limiter parameters derived from loudnessStyle (not gearProfile switch)
 * 5. thdMode (pressure/flow) maps to logicMode behavior when user hasn't explicitly set it
 * 6. PREVIEW/EXPORT PARITY: Same DSP in both modes. Only oversampling changes (2x vs 4x).
 * 
 * PREVIEW/EXPORT RULE (v2):
 * What you hear in preview IS what you get in export. Period.
 * The ONLY difference is WaveShaper oversampling (2x preview, 4x export).
 * That's a ~0.1dB aliasing difference — inaudible on any monitor.
 * Everything else — multiband, SSL knee, limiter look-ahead, all params — IDENTICAL.
 * 
 * PHILOSOPHY:
 * - loudnessStyle controls HOW HARD the dynamics processing works
 * - thdMode controls WHETHER harmonics follow dynamics (flow) or stay constant (pressure)
 * - Export preset controls WHERE the loudness lands (target LUFS + ceiling)
 * - Genre biases control WHAT the tonal balance sounds like
 * 
 * These four axes are independent. That's the whole product.
 */

import type { ProcessingPlan } from '../data/preset-resolution';
import type { ProcessingSettings } from './audio-processor';
import type { QualityMode } from '../data/quality-profiles';
import { buildTransformerStage, getTransformerConfig } from './stages/transformer-stage';
import { buildTapeStage, getTapeConfig } from './stages/tape-stage';
import { buildMultibandStage } from './stages/multiband-stage';
import { smoothParam } from './stages/stage-utils';

// Re-export types
export type { ProcessingPlan } from '../data/preset-resolution';

export interface MasteringChainConfig {
  context: BaseAudioContext;
  destination: AudioNode;
  params: ProcessingPlan;
  settings: ProcessingSettings;
  quality: QualityMode;
  useMinimalMaster: boolean;
  dryBypass?: boolean;
  inputTrimDB?: number;
  inputLUFS?: number; // Measured integrated LUFS for makeup gain calculation
}

export interface MasteringChain {
  input: AudioNode;
  output: AudioNode;
  parameters: ChainParameters;
  dispose: () => void;
}

export interface ChainParameters {
  // Transformer
  transformerDrive: AudioParam | null;
  
  // Tape
  tapeDrive: AudioParam | null;
  
  // EQ (User-adjustable profile EQ)
  lowShelfGain: AudioParam | null;
  midRangeGain: AudioParam | null;
  highShelfGain: AudioParam | null;
  
  // Multiband (if active)
  multibandInput: AudioNode | null;
  
  // SSL Compression
  sslThreshold: AudioParam | null;
  sslRatio: AudioParam | null;
  sslAttack: AudioParam | null;
  sslRelease: AudioParam | null;
  
  // M/S Processing
  stereoWidth: AudioParam | null;
  
  // Limiter
  limiterThreshold: AudioParam | null;
  limiterMakeup: AudioParam | null;
  limiterCeiling: AudioParam | null;
}

// ============================================================
// LOUDNESS STYLE PARAMETER TABLES
// From LIMITER_STYLE_AUDIT.md — the spec Simon already wrote
// ============================================================

interface LoudnessStyleParams {
  // SSL Compressor
  ssl: {
    threshold: number;    // dB
    ratio: number;
    knee: number;         // dB
    attack: number;       // seconds
    release: number;      // seconds
  };
  // Limiter
  limiter: {
    ratio: number;
    knee: number;
    attack: number;       // seconds
    release: number;      // seconds
    lookAhead: number;    // seconds
    holdTime: number;     // seconds
    maxGR: number;        // dB (guardrail)
    ceiling: number;      // dBTP (overridden by export preset if stricter)
  };
  // WaveShapers
  type1Active: boolean;           // Type1 punchy limiter
  type1ThresholdRatio: number;    // Fraction of ceiling (0.5 = -6dB below)
  type2KneeStart: number;        // Fraction of ceiling (0.95 or 0.99)
}

const LOUDNESS_STYLE_PARAMS: Record<string, LoudnessStyleParams> = {
  aggressive: {
    ssl: {
      threshold: -4,      // Hit harder
      ratio: 4,           // PATCH: Was 6 — firm glue, not demolition
      knee: 3,            // PATCH: Was 2 — slightly softer
      attack: 0.003,      // 3ms — catch transients
      release: 0.06,      // 60ms — pumping energy
    },
    limiter: {
      ratio: 12,          // PATCH: Was 20 — strong but not brick
      knee: 2,            // PATCH: Was 1 — slightly softer
      attack: 0.001,      // 1ms — fast catch
      release: 0.06,      // 60ms — pump energy for club/festival
      lookAhead: 0.010,   // 10ms — transparency
      holdTime: 0.0005,   // 0.5ms — fast limiting
      maxGR: 6,           // PATCH: Was 8 — prevent over-squash
      ceiling: -0.3,      // Tight ceiling (overridden by export preset)
    },
    type1Active: true,
    type1ThresholdRatio: 0.7,     // PATCH: Was 0.5 — less aggressive shaping
    type2KneeStart: 0.96,        // PATCH: Was 0.95 — slightly gentler approach
  },

  balanced: {
    ssl: {
      threshold: -8,      // Moderate
      ratio: 2.5,         // Gentle glue
      knee: 6,            // Soft knee
      attack: 0.010,      // 10ms — preserve transients
      release: 0.10,      // 100ms — SSL Auto range
    },
    limiter: {
      ratio: 10,          // Moderate limiting
      knee: 4,            // Medium-soft
      attack: 0.002,      // 2ms — natural
      release: 0.10,      // 100ms — balanced
      lookAhead: 0.005,   // 5ms — Weiss default
      holdTime: 0.001,    // 1ms — balanced
      maxGR: 6,           // Moderate GR
      ceiling: -1.0,      // Safe ceiling
    },
    type1Active: false,           // Type1 bypassed — limiter is safety net
    type1ThresholdRatio: 0.99,    // 99% = effectively passthrough
    type2KneeStart: 0.97,        // Gentle approach to ceiling
  },

  clean: {
    ssl: {
      threshold: -12,     // High threshold = minimal compression
      ratio: 2,           // Very gentle
      knee: 8,            // Very soft knee
      attack: 0.020,      // 20ms — preserves transient character completely
      release: 0.25,      // 250ms — follows natural dynamics
    },
    limiter: {
      ratio: 6,           // Soft limiting
      knee: 8,            // Very soft
      attack: 0.005,      // 5ms — slow, transparent
      release: 0.30,      // 300ms — long, natural
      lookAhead: 0.008,   // 8ms — smooth
      holdTime: 0.002,    // 2ms — slow
      maxGR: 3,           // Almost invisible
      ceiling: -1.0,      // Will back off rather than distort
    },
    type1Active: false,
    type1ThresholdRatio: 0.99,
    type2KneeStart: 0.99,        // Only catches actual peaks
  },
};

/**
 * Build the complete 6-stage mastering chain
 * 
 * Chain order:
 * 0. Profile EQ (genre biases: bassTilt, airTilt, mudCut)
 * 1. Transformer (harmonic enhancement)
 * 2. Tape (saturation with hysteresis)
 * 3. Multiband (surgical frequency management)
 * 4. SSL Bus Glue (compression — loudnessStyle controls behavior)
 * 5. M/S Processing (stereo width + mono bass)
 * 6. Limiter (peak management + loudness targeting — loudnessStyle controls behavior)
 */
export function buildMasteringChain(config: MasteringChainConfig): MasteringChain {
  const { context, destination, params, settings, quality, useMinimalMaster, dryBypass = false, inputTrimDB, inputLUFS } = config;
  
  const loudnessStyle = params.genreBehavior.loudnessStyle;
  const styleParams = LOUDNESS_STYLE_PARAMS[loudnessStyle] || LOUDNESS_STYLE_PARAMS.balanced;
  
  console.log(`🔧 Building mastering chain (quality: ${quality}, loudnessStyle: ${loudnessStyle}, logicMode: ${settings.logicMode})`);
  
  // Create input/output nodes
  const chainInput = context.createGain();
  chainInput.channelCountMode = 'max';
  chainInput.channelInterpretation = 'speakers';
  
  const chainOutput = context.createGain();
  chainOutput.channelCountMode = 'max';
  chainOutput.channelInterpretation = 'speakers';
  
  // Track current node in chain
  let currentNode: AudioNode = chainInput;
  
  // === AUTO INPUT TRIM ===
  // If the input mix is too hot (peaks above -3dB), attenuate before any processing.
  // This gives the saturation and compression stages proper headroom to work.
  // The limiter's makeup gain brings the level back up at the end.
  if (inputTrimDB && inputTrimDB < 0) {
    const trimGain = context.createGain();
    trimGain.gain.value = Math.pow(10, inputTrimDB / 20);
    currentNode.connect(trimGain);
    currentNode = trimGain;
    console.log(`   [PRE] Input Trim: ${inputTrimDB.toFixed(1)}dB (auto headroom correction)`);
  }
  
  // Track parameters for live updates
  const parameters: ChainParameters = {
    transformerDrive: null,
    tapeDrive: null,
    lowShelfGain: null,
    midRangeGain: null,
    highShelfGain: null,
    multibandInput: null,
    sslThreshold: null,
    sslRatio: null,
    sslAttack: null,
    sslRelease: null,
    stereoWidth: null,
    limiterThreshold: null,
    limiterMakeup: null,
    limiterCeiling: null,
  };
  
  // Track nodes for cleanup
  const nodesToDispose: AudioNode[] = [chainInput, chainOutput];
  
  // === DRY BYPASS (A/B original) ===
  if (dryBypass) {
    chainInput.connect(chainOutput);
    chainOutput.connect(destination);
    console.log('✅ Mastering chain: DRY BYPASS (original audio)');

    return {
      input: chainInput,
      output: chainOutput,
      parameters,
      dispose: () => {
        nodesToDispose.forEach(node => {
          try { node.disconnect(); } catch (e) { /* ignore */ }
        });
      }
    };
  }

  // PREVIEW/EXPORT PARITY: No quality-dependent DSP behavior.
  // Only oversampling factor changes (handled inside each stage).
  // Multiband, SSL, limiter, look-ahead — all identical in both modes.
  
  // === PROFILE EQ (Genre Biases: bassTilt, airTilt, mudCut) ===
  console.log('   [0] Profile EQ: ACTIVE');
  const profileEQ = createProfileEQ(context, params);
  currentNode.connect(profileEQ.input);
  currentNode = profileEQ.output;
  parameters.lowShelfGain = profileEQ.lowShelfGain;
  parameters.midRangeGain = profileEQ.midRangeGain;
  parameters.highShelfGain = profileEQ.highShelfGain;
  nodesToDispose.push(profileEQ.input, profileEQ.output);
  
  // === STAGE 1: TRANSFORMER (Harmonic Enhancement) ===
  if (!useMinimalMaster && params.genreBehavior.colorAmount > 0) {
    console.log('   [1] Transformer: ACTIVE');
    const transformerConfig = getTransformerConfig(settings.genreId);
    const transformer = buildTransformerStage(context, quality, transformerConfig);
    currentNode.connect(transformer.input);
    currentNode = transformer.output;
    parameters.transformerDrive = transformer.params.drive;
    nodesToDispose.push(transformer.input, transformer.output);
  } else {
    console.log('   [1] Transformer: BYPASSED');
  }
  
  // === STAGE 2: TAPE SATURATION ===
  if (!useMinimalMaster && params.genreBehavior.colorAmount > 0) {
    console.log('   [2] Tape: ACTIVE');
    const tapeConfig = getTapeConfig(settings.genreId, settings.circuitDrive);
    const tape = buildTapeStage(context, quality, tapeConfig);
    currentNode.connect(tape.input);
    currentNode = tape.output;
    parameters.tapeDrive = tape.params.drive;
    nodesToDispose.push(tape.input, tape.output);
  } else {
    console.log('   [2] Tape: BYPASSED');
  }
  
  // === STAGE 3: MULTIBAND PROCESSING ===
  // PARITY FIX: Multiband runs in BOTH preview and export if genre needs it.
  // Old code gated this behind `enableHeavyProcessing` (export-only) — that meant
  // DnB/Techno/Dubstep/Hardstyle preview was missing an entire processing stage.
  const useMultiband = params.genreBehavior.useMultiband && !useMinimalMaster;
  if (useMultiband) {
    console.log('   [3] Multiband: ACTIVE (4-band split)');
    const multiband = createMultibandStage(context, settings, quality);
    currentNode.connect(multiband.input);
    currentNode = multiband.output;
    parameters.multibandInput = multiband.input;
    nodesToDispose.push(multiband.input, multiband.output);
  } else {
    console.log('   [3] Multiband: BYPASSED');
  }
  
  // === STAGE 4: SSL BUS GLUE COMPRESSION (loudnessStyle-aware) ===
  console.log(`   [4] SSL Compression: ACTIVE (${loudnessStyle})`);
  const ssl = createSSLCompressor(context, settings, params, styleParams, quality, useMinimalMaster);
  currentNode.connect(ssl.input);
  currentNode = ssl.output;
  parameters.sslThreshold = ssl.threshold;
  parameters.sslRatio = ssl.ratio;
  parameters.sslAttack = ssl.attack;
  parameters.sslRelease = ssl.release;
  nodesToDispose.push(ssl.input, ssl.output);
  
  // === STAGE 5: MID-SIDE PROCESSING ===
  const useMidSide = params.genreBehavior.useMidSide;
  if (useMidSide) {
    console.log('   [5] M/S Processing: ACTIVE');
    const midSide = createMidSideProcessor(context, settings, params);
    currentNode.connect(midSide.input);
    currentNode = midSide.output;
    parameters.stereoWidth = midSide.widthParam;
    nodesToDispose.push(midSide.input, midSide.output);
  } else {
    console.log('   [5] M/S Processing: BYPASSED');
  }
  
  // === STAGE 6: LIMITER (loudnessStyle-aware, dual-stage WaveShaper) ===
  console.log(`   [6] Limiter: ACTIVE (${loudnessStyle}, ${settings.logicMode})`);
  const limiter = createLimiterStage(context, settings, params, styleParams, quality, inputLUFS);
  currentNode.connect(limiter.input);
  currentNode = limiter.output;
  parameters.limiterThreshold = limiter.threshold;
  parameters.limiterMakeup = limiter.makeup;
  parameters.limiterCeiling = limiter.ceiling;
  nodesToDispose.push(limiter.input, limiter.output);
  
  // Connect final output to destination
  currentNode.connect(chainOutput);
  chainOutput.connect(destination);
  
  console.log(`✅ Mastering chain built: ${nodesToDispose.length / 2} stages (${loudnessStyle} loudness, ${settings.logicMode} logic)`);
  
  return {
    input: chainInput,
    output: chainOutput,
    parameters,
    dispose: () => {
      nodesToDispose.forEach(node => {
        try { node.disconnect(); } catch (e) { /* ignore */ }
      });
    }
  };
}

/**
 * STAGE 3: Multiband Processing
 */
function createMultibandStage(
  context: BaseAudioContext,
  settings: ProcessingSettings,
  quality: QualityMode
): { input: AudioNode; output: AudioNode } {
  return buildMultibandStage(context, settings, quality);
}

/**
 * STAGE 4: SSL Bus Glue Compression
 * 
 * NOW READS: loudnessStyle from ProcessingPlan
 * 
 * AGGRESSIVE: Hard glue (-4dB threshold, 6:1, 3ms attack, 50ms release)
 * BALANCED:   SSL sweet spot (-8dB threshold, 2.5:1, 10ms attack, 100ms release)
 * CLEAN:      Nearly invisible (-12dB threshold, 2:1, 20ms attack, 250ms release)
 * 
 * logicMode override: When user explicitly selects brickwall, SSL goes hard
 * regardless of genre's loudnessStyle (user intent overrides genre default).
 */
function createSSLCompressor(
  context: BaseAudioContext,
  settings: ProcessingSettings,
  params: ProcessingPlan,
  styleParams: LoudnessStyleParams,
  quality: QualityMode,
  useMinimalMaster: boolean
): {
  input: AudioNode;
  output: AudioNode;
  threshold: AudioParam;
  ratio: AudioParam;
  attack: AudioParam;
  release: AudioParam;
} {
  const input = context.createGain();
  const output = context.createGain();
  
  // Sidechain HPF — prevents kick/bass from triggering compression
  // This is what gives SSL its legendary "punch"
  const sidechainHPF = context.createBiquadFilter();
  sidechainHPF.type = 'highpass';
  sidechainHPF.frequency.value = 100; // SSL 9000K specification
  sidechainHPF.Q.value = 0.707;       // Butterworth
  
  const compressor = context.createDynamicsCompressor();
  
  if (useMinimalMaster) {
    // Minimal mode: gentle compression (max 1.5dB GR)
    compressor.threshold.value = -18;
    compressor.ratio.value = 2;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.1;
    compressor.knee.value = 6;
  } else if (settings.logicMode === 'brickwall') {
    // User explicitly chose Pressure — firmer than Flow, but NOT demolishing
    // PATCH: Was -2dB/12:1 — produced sausage waveforms on everything.
    // Now -6dB/4:1 — audible punch and glue without destroying dynamics.
    compressor.threshold.value = -6;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.005;    // 5ms — catch transients, preserve some snap
    compressor.release.value = 0.08;    // 80ms — pumping energy without suffocation
    compressor.knee.value = 4;          // Medium knee — not harsh
  } else {
    // Flow (dynamics) mode — PRESERVE the dynamics of the original mix.
    // The SSL acts as a gentle safety net, NOT a loudness or glue tool.
    // Think: vinyl mastering. Tonal shaping is done upstream (EQ, saturation).
    // Compression here should be almost inaudible.
    //
    // FLOW CEILINGS (much gentler than Pressure):
    //   SSL threshold: no lower than -6 (Pressure is -6, aggressive is -4)
    //                  → most genre thresholds are already ≥ -8, this just caps extremes
    //   SSL ratio:     max 1.5 (Pressure is 4) — barely touching
    //   SSL attack:    min 20ms (Pressure is 5ms) — let ALL transients through
    //   SSL knee:      min 8 (Pressure is 4) — very soft onset
    //   SSL release:   min 150ms — follows natural dynamics
    const flowThreshold = Math.max(styleParams.ssl.threshold, -6);
    const flowRatio = Math.min(styleParams.ssl.ratio, 1.5);
    const flowAttack = Math.max(styleParams.ssl.attack, 0.020);
    const flowRelease = Math.max(styleParams.ssl.release, 0.15);
    const flowKnee = Math.max(styleParams.ssl.knee, 8);

    compressor.threshold.value = flowThreshold;
    compressor.ratio.value = flowRatio;
    compressor.attack.value = flowAttack;
    compressor.release.value = flowRelease;
    compressor.knee.value = flowKnee;
    
    console.log(`   [4] Flow SSL caps applied: threshold=${flowThreshold}dB, ratio=${flowRatio}:1, attack=${(flowAttack*1000).toFixed(0)}ms`);
  }
  
  // Unity gain output (SSL provides glue, not loudness)
  output.gain.value = 1.0;
  
  console.log(`   SSL: threshold=${compressor.threshold.value}dB, ratio=${compressor.ratio.value}:1, ` +
    `attack=${(compressor.attack.value * 1000).toFixed(1)}ms, release=${(compressor.release.value * 1000).toFixed(0)}ms, ` +
    `knee=${compressor.knee.value}dB`);
  
  // Chain: input → HPF (sidechain) → compressor → output
  // Note: WebAudio DynamicsCompressor doesn't support external sidechain
  // HPF is inline — it prevents bass from hitting the detector
  input.connect(compressor);
  compressor.connect(output);
  
  return {
    input,
    output,
    threshold: compressor.threshold,
    ratio: compressor.ratio,
    attack: compressor.attack,
    release: compressor.release,
  };
}

/**
 * STAGE 5: Mid-Side Processing
 */
function createMidSideProcessor(
  context: BaseAudioContext,
  settings: ProcessingSettings,
  params: ProcessingPlan
): { input: AudioNode; output: AudioNode; widthParam: AudioParam } {
  const input = context.createGain();
  const output = context.createGain();
  
  const splitter = context.createChannelSplitter(2);
  
  // Mid = (L + R) / 2
  const midGain = context.createGain();
  midGain.gain.value = 0.5;
  
  // Side = (L - R) / 2
  const sideGain = context.createGain();
  sideGain.gain.value = 0.5;
  
  const sideInverter = context.createGain();
  sideInverter.gain.value = -1;
  
  input.connect(splitter);
  splitter.connect(midGain, 0);
  splitter.connect(midGain, 1);
  
  splitter.connect(sideGain, 0);
  splitter.connect(sideInverter, 1);
  sideInverter.connect(sideGain);
  
  // Width control on Side channel
  const widthControl = context.createGain();
  const requestedWidth = params.source.requestedWidth ?? 1.0;
  const widthAmount = Math.max(0, Math.min(2.0, requestedWidth));
  widthControl.gain.value = widthAmount;
  
  sideGain.connect(widthControl);
  
  // Mono bass HPF on Side channel (if forceMonoBass enabled)
  if (params.genreBehavior.forceMonoBass) {
    const monoBassHPF = context.createBiquadFilter();
    monoBassHPF.type = 'highpass';
    monoBassHPF.frequency.value = params.genreBehavior.monoBassHz ?? 120;
    monoBassHPF.Q.value = 0.707;
    
    // Insert HPF between sideGain and widthControl
    // Rebuild: sideGain → HPF → widthControl
    sideGain.disconnect();
    sideGain.connect(monoBassHPF);
    monoBassHPF.connect(widthControl);
    
    console.log(`   M/S: Mono bass HPF at ${monoBassHPF.frequency.value}Hz`);
  }
  
  // Decode back to L/R
  const leftChannel = context.createGain();
  const rightChannel = context.createGain();
  
  midGain.connect(leftChannel);
  widthControl.connect(leftChannel);
  
  const sideInverter2 = context.createGain();
  sideInverter2.gain.value = -1;
  
  midGain.connect(rightChannel);
  widthControl.connect(sideInverter2);
  sideInverter2.connect(rightChannel);
  
  const merger = context.createChannelMerger(2);
  leftChannel.connect(merger, 0, 0);
  rightChannel.connect(merger, 0, 1);
  
  merger.connect(output);
  
  console.log(`   M/S: width=${widthAmount.toFixed(2)}, monoBass=${params.genreBehavior.forceMonoBass}`);
  
  return { input, output, widthParam: widthControl.gain };
}

/**
 * STAGE 6: Limiter (Weiss DS1-MK3 style, dual-stage WaveShaper)
 * 
 * NOW READS: loudnessStyle from ProcessingPlan
 * 
 * Architecture:
 *   Makeup Gain → DynamicsCompressor → Type1 WaveShaper (punchy) → Type2 WaveShaper (true peak) → Output
 * 
 * AGGRESSIVE: Fast attack, high GR tolerance, Type1 active at -6dB, tight ceiling
 * BALANCED:   Moderate attack, moderate GR, Type1 bypassed, safe ceiling
 * CLEAN:      Slow attack, minimal GR, Type1 bypassed, backs off rather than distort
 * 
 * logicMode override: brickwall forces aggressive behavior regardless of loudnessStyle
 */
function createLimiterStage(
  context: BaseAudioContext,
  settings: ProcessingSettings,
  params: ProcessingPlan,
  styleParams: LoudnessStyleParams,
  quality: QualityMode,
  inputLUFS?: number
): {
  input: AudioNode;
  output: AudioNode;
  threshold: AudioParam;
  makeup: AudioParam;
  ceiling: AudioParam;
} {
  const input = context.createGain();
  const output = context.createGain();
  
  const isBrickwall = settings.logicMode === 'brickwall';
  
  // Use aggressive params if user chose brickwall, otherwise use loudnessStyle
  // FLOW CEILING: In dynamics mode, cap limiter firmness to preserve dynamics.
  // Flow must ALWAYS be gentler than Pressure.
  const limParams = isBrickwall 
    ? LOUDNESS_STYLE_PARAMS.aggressive.limiter 
    : styleParams.limiter;
  // In Flow mode: disable Type1 WaveShaper (it adds aggressive punch/clipping)
  // and use gentler Type2 knee — let the limiter be a safety net, not a loudness tool.
  const isType1Active = isBrickwall 
    ? LOUDNESS_STYLE_PARAMS.aggressive.type1Active 
    : false;  // PATCH: Type1 off in Flow — it was adding aggressive clipping
  const type1ThresholdRatio = isBrickwall 
    ? LOUDNESS_STYLE_PARAMS.aggressive.type1ThresholdRatio 
    : 0.99;   // PATCH: Effectively passthrough even if somehow active
  const type2KneeStart = isBrickwall 
    ? LOUDNESS_STYLE_PARAMS.aggressive.type2KneeStart 
    : Math.max(styleParams.type2KneeStart || 0.97, 0.97);  // PATCH: Gentle approach
  
  // === CEILING (from export preset, but loudnessStyle can't exceed it) ===
  const exportCeiling = params.deliveryTargets.ceiling;
  const styleCeiling = limParams.ceiling;
  // Use the MORE conservative (more negative) ceiling
  const finalCeiling = Math.min(exportCeiling, styleCeiling);
  const ceilingLinear = Math.pow(10, finalCeiling / 20);
  
  // === MAKEUP GAIN (sole loudness authority) ===
  const targetLUFS = params.deliveryTargets.targetLUFS;
  const estimatedCurrentLUFS = inputLUFS ?? -16;
  const requiredGainDB = targetLUFS - estimatedCurrentLUFS;
  
  // Clamp makeup by loudnessStyle's maxGR (prevents over-limiting)
  // FLOW CEILING: In dynamics mode, cap maxGR to 1.5dB (Pressure allows 8dB).
  // This is the single biggest lever — less makeup gain = less limiting = more dynamics.
  // At 1.5dB max, the limiter barely engages. The waveform BREATHES.
  // (Was 4dB — caused up to 6dB total GR even in Flow mode = sausage)
  const flowMaxGR = Math.min(limParams.maxGR, 1.5); // Flow: max 1.5dB gain reduction
  const maxMakeupDB = isBrickwall ? 8 : flowMaxGR;
  const makeupGainDB = Math.max(-6, Math.min(requiredGainDB, maxMakeupDB));
  const makeupGainLinear = Math.pow(10, makeupGainDB / 20);
  
  const makeupGain = context.createGain();
  makeupGain.gain.value = makeupGainLinear;
  
  // === LOOK-AHEAD DELAY ===
  // PARITY FIX: Look-ahead enabled in BOTH preview and export.
  // Without look-ahead, the limiter responds differently to transients.
  // 5-10ms delay is inaudible in real-time playback (well within acceptable latency).
  const lookAheadDelay = context.createDelay(0.015);
  lookAheadDelay.delayTime.value = limParams.lookAhead;
  
  // === DYNAMICS COMPRESSOR (primary limiter) ===
  const limiter = context.createDynamicsCompressor();
  limiter.threshold.value = finalCeiling - 3; // Start 3dB below ceiling
  
  // FLOW CEILING on limiter: soft safety net only, NOT a loudness tool.
  // With only 1.5dB makeup, the limiter should barely engage anyway.
  // These caps ensure it stays transparent if it does catch a transient.
  const flowLimRatio = isBrickwall ? limParams.ratio : Math.min(limParams.ratio, 4);   // Was 8
  const flowLimAttack = isBrickwall ? limParams.attack : Math.max(limParams.attack, 0.005); // Was 3ms
  const flowLimRelease = isBrickwall ? limParams.release : Math.max(limParams.release, 0.15); // Was 100ms
  const flowLimKnee = isBrickwall ? limParams.knee : Math.max(limParams.knee, 6);     // Was 4
  
  limiter.ratio.value = flowLimRatio;
  limiter.attack.value = flowLimAttack;
  limiter.release.value = flowLimRelease;
  limiter.knee.value = flowLimKnee;
  
  if (!isBrickwall) {
    console.log(`   [6] Flow limiter caps applied: ratio=${flowLimRatio}:1, maxGR=${flowMaxGR}dB, attack=${(flowLimAttack*1000).toFixed(0)}ms`);
  }
  
  // === TYPE 1 WAVESHAPER (Punchy Limiter) ===
  // Active in aggressive/brickwall mode, bypassed in balanced/clean
  const type1Shaper = context.createWaveShaper();
  const type1Curve = new Float32Array(65536);
  
  const type1Threshold = ceilingLinear * type1ThresholdRatio;
  
  for (let i = 0; i < 65536; i++) {
    const x = (i * 2 - 65536) / 65536;
    const absX = Math.abs(x);
    
    if (absX < type1Threshold) {
      type1Curve[i] = x; // Below threshold: pass through
    } else {
      // Above threshold: progressive limiting with adaptive knee
      const excess = absX - type1Threshold;
      const kneeAmount = Math.min(1, excess / (ceilingLinear - type1Threshold + 0.0001));
      const softComponent = Math.tanh(excess * 3) * 0.3;
      const hardComponent = excess * (1 - kneeAmount);
      const limited = Math.min(type1Threshold + softComponent + hardComponent, ceilingLinear);
      type1Curve[i] = x > 0 ? limited : -limited;
    }
  }
  
  type1Shaper.curve = type1Curve;
  // PARITY FIX: Minimum 2x oversampling in ALL modes.
  // Without oversampling, waveshaper aliasing changes the harmonic character —
  // the hardware emulation labels become meaningless if aliasing dominates.
  // 2x vs 4x is inaudible. 'none' vs 2x destroys the analogue character.
  type1Shaper.oversample = quality === 'export' ? '4x' : '2x';
  
  // === TYPE 2 WAVESHAPER (True Peak Safety Ceiling) ===
  const type2Shaper = context.createWaveShaper();
  const type2Curve = new Float32Array(65536);
  
  for (let i = 0; i < 65536; i++) {
    const x = (i * 2 - 65536) / 65536;
    const absX = Math.abs(x);
    const kneeThreshold = ceilingLinear * type2KneeStart;
    
    if (absX < kneeThreshold) {
      type2Curve[i] = x; // Below knee: pass through
    } else {
      // Above knee: hard brickwall with soft arctangent approach
      const excess = absX - kneeThreshold;
      const kneeRange = ceilingLinear * (1 - type2KneeStart);
      const limited = kneeThreshold + (kneeRange * (2 / Math.PI) * Math.atan(excess / kneeRange * 10));
      type2Curve[i] = x > 0 ? Math.min(limited, ceilingLinear) : -Math.min(limited, ceilingLinear);
    }
  }
  
  type2Shaper.curve = type2Curve;
  // PARITY: 2x minimum (true peak safety must be accurate in preview too)
  type2Shaper.oversample = quality === 'export' ? '4x' : '2x';
  
  // === CHAIN: input → makeup → lookahead → limiter → type1 → type2 → output ===
  input.connect(makeupGain);
  makeupGain.connect(lookAheadDelay);
  lookAheadDelay.connect(limiter);
  limiter.connect(type1Shaper);
  type1Shaper.connect(type2Shaper);
  type2Shaper.connect(output);
  
  console.log(`   Limiter: ceiling=${finalCeiling.toFixed(1)}dBTP, ratio=${limParams.ratio}:1, ` +
    `attack=${(limParams.attack * 1000).toFixed(1)}ms, release=${(limParams.release * 1000).toFixed(0)}ms, ` +
    `maxGR=${limParams.maxGR}dB, makeup=${makeupGainDB.toFixed(1)}dB (from ${estimatedCurrentLUFS.toFixed(1)} → ${targetLUFS} LUFS)`);
  console.log(`   Type1: ${isType1Active ? 'ACTIVE' : 'BYPASS'} (threshold @ ${(type1ThresholdRatio * 100).toFixed(0)}% ceiling), ` +
    `Type2: knee @ ${(type2KneeStart * 100).toFixed(0)}% ceiling`);
  
  return {
    input,
    output,
    threshold: limiter.threshold,
    makeup: makeupGain.gain,
    ceiling: limiter.threshold, // Proxy — real ceiling is in WaveShaper curves
  };
}

/**
 * PROFILE EQ (Genre Biases: bassTilt, airTilt, mudCut)
 * 
 * 3-band EQ at start of chain:
 * - Low shelf @ 100Hz  ← bassTilt (-3 to +3 dB)
 * - Peaking  @ 250Hz   ← mudCut (0 to -6 dB) — changed from 1kHz to target actual mud zone
 * - High shelf @ 10kHz ← airTilt (-3 to +3 dB)
 */
function createProfileEQ(
  context: BaseAudioContext,
  params: ProcessingPlan
): {
  input: AudioNode;
  output: AudioNode;
  lowShelfGain: AudioParam;
  midRangeGain: AudioParam;
  highShelfGain: AudioParam;
} {
  const input = context.createGain();
  const output = context.createGain();
  
  // Low shelf (bassTilt)
  const lowShelf = context.createBiquadFilter();
  lowShelf.type = 'lowshelf';
  lowShelf.frequency.value = 100;
  lowShelf.gain.value = params.genreBehavior.bassTilt;
  
  // Mid cut (mudCut) — peaking at 250Hz (the actual "mud" frequency)
  const midRange = context.createBiquadFilter();
  midRange.type = 'peaking';
  midRange.frequency.value = 250;   // Changed from 1kHz — 250Hz is where mud lives
  midRange.Q.value = 1.0;           // ~1.5 octave bandwidth
  midRange.gain.value = params.genreBehavior.mudCut;
  
  // High shelf (airTilt)
  const highShelf = context.createBiquadFilter();
  highShelf.type = 'highshelf';
  highShelf.frequency.value = 10000;
  highShelf.gain.value = params.genreBehavior.airTilt;
  
  input.connect(lowShelf);
  lowShelf.connect(midRange);
  midRange.connect(highShelf);
  highShelf.connect(output);
  
  console.log(`   EQ: bassTilt=${params.genreBehavior.bassTilt}dB @ 100Hz, ` +
    `mudCut=${params.genreBehavior.mudCut}dB @ 250Hz, ` +
    `airTilt=${params.genreBehavior.airTilt}dB @ 10kHz`);
  
  return {
    input,
    output,
    lowShelfGain: lowShelf.gain,
    midRangeGain: midRange.gain,
    highShelfGain: highShelf.gain,
  };
}
