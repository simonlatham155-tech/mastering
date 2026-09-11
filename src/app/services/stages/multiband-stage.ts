/**
 * Multiband Processing Stage (4-band complementary split)
 *
 * MASTERING RULES:
 * - The crossover/sum path must reconstruct unity before dynamics.
 * - Multiband is corrective dynamics, not four permanently saturated bands.
 * - Compression is deliberately gentle so the stage cannot become the main
 *   loudness generator or create low-end pumping by default.
 *
 * RECONSTRUCTION TOPOLOGY
 * -----------------------
 * L1 = LP100(input)
 * L2 = LP300(input)
 * L3 = LP3500(input)
 *
 * band1 = L1
 * band2 = L2 - L1
 * band3 = L3 - L2
 * band4 = input - L3
 *
 * Therefore, before band dynamics:
 * band1 + band2 + band3 + band4 = input exactly by construction.
 * This avoids the broad ~200 Hz reconstruction loss produced by stacking
 * independent LR4 HP/LP cascades at closely spaced 100/300 Hz crossovers.
 */

import type { QualityMode } from '../../data/quality-profiles';
import type { ProcessingSettings } from '../audio-processor';

export interface MultibandStage {
  input: AudioNode;
  output: AudioNode;
}

type MonoChain = { input: AudioNode; output: AudioNode };

type BandComp = {
  threshold: number;
  knee: number;
  ratio: number;
  attack: number;
  release: number;
};

const BAND_COMPS: BandComp[] = [
  { threshold: -8, knee: 12, ratio: 1.45, attack: 0.03, release: 0.18 },
  { threshold: -10, knee: 12, ratio: 1.6, attack: 0.02, release: 0.16 },
  { threshold: -10, knee: 12, ratio: 1.5, attack: 0.015, release: 0.14 },
  { threshold: -12, knee: 14, ratio: 1.35, attack: 0.008, release: 0.12 },
];

function configureMonoNode<T extends AudioNode>(node: T): T {
  node.channelCountMode = 'explicit';
  node.channelCount = 1;
  node.channelInterpretation = 'speakers';
  return node;
}

/** Two cascaded Butterworth low-pass sections (LR4 low-pass response). */
function createLR4Lowpass(
  context: BaseAudioContext,
  input: AudioNode,
  frequency: number
): AudioNode {
  const a = configureMonoNode(context.createBiquadFilter());
  const b = configureMonoNode(context.createBiquadFilter());
  a.type = 'lowpass';
  b.type = 'lowpass';
  a.frequency.value = frequency;
  b.frequency.value = frequency;
  a.Q.value = 0.70710678;
  b.Q.value = 0.70710678;
  input.connect(a);
  a.connect(b);
  return b;
}

function createInverter(context: BaseAudioContext): GainNode {
  const inverter = configureMonoNode(context.createGain());
  inverter.gain.value = -1;
  return inverter;
}

function createBandJunction(context: BaseAudioContext): GainNode {
  const junction = configureMonoNode(context.createGain());
  junction.gain.value = 1;
  return junction;
}

function createCompressor(
  context: BaseAudioContext,
  cfg: BandComp
): DynamicsCompressorNode {
  const compressor = configureMonoNode(context.createDynamicsCompressor());
  compressor.threshold.value = cfg.threshold;
  compressor.knee.value = cfg.knee;
  compressor.ratio.value = cfg.ratio;
  compressor.attack.value = cfg.attack;
  compressor.release.value = cfg.release;
  return compressor;
}

/**
 * Connect `positive - negative` into a mono junction.
 * Both source nodes remain available to other complementary bands.
 */
function connectDifference(
  context: BaseAudioContext,
  positive: AudioNode,
  negative: AudioNode,
  destination: AudioNode
): AudioNode[] {
  positive.connect(destination);
  const inverter = createInverter(context);
  negative.connect(inverter);
  inverter.connect(destination);
  return [inverter];
}

/** Build 4-band multiband stage for realtime and offline rendering. */
export function buildMultibandStage(
  context: BaseAudioContext,
  _settings: ProcessingSettings,
  _quality: QualityMode
): MultibandStage {
  const input = context.createGain();
  input.channelCountMode = 'max';
  input.channelInterpretation = 'speakers';

  const splitter = context.createChannelSplitter(2);
  const merger = context.createChannelMerger(2);
  input.connect(splitter);

  const crossover1 = 100;
  const crossover2 = 300;
  const crossover3 = 3500;

  const buildMonoMultiband = (): MonoChain => {
    const inputJunction = createBandJunction(context);
    const sum = createBandJunction(context);

    // Build three nested low-pass references from the SAME unfiltered input.
    // Their differences form complementary bands whose algebraic sum is input.
    const low100 = createLR4Lowpass(context, inputJunction, crossover1);
    const low300 = createLR4Lowpass(context, inputJunction, crossover2);
    const low3500 = createLR4Lowpass(context, inputJunction, crossover3);

    const band1 = createBandJunction(context);
    const band2 = createBandJunction(context);
    const band3 = createBandJunction(context);
    const band4 = createBandJunction(context);

    // band1 = L100
    low100.connect(band1);

    // band2 = L300 - L100
    connectDifference(context, low300, low100, band2);

    // band3 = L3500 - L300
    connectDifference(context, low3500, low300, band3);

    // band4 = input - L3500
    connectDifference(context, inputJunction, low3500, band4);

    const compressors = BAND_COMPS.map((cfg) => createCompressor(context, cfg));
    const bands = [band1, band2, band3, band4];

    for (let i = 0; i < bands.length; i++) {
      bands[i].connect(compressors[i]);
      compressors[i].connect(sum);
    }

    // No global trim. The complementary split is unity by construction before
    // intentional gain reduction in the four mastering compressors.
    sum.gain.value = 1;

    return { input: inputJunction, output: sum };
  };

  const left = buildMonoMultiband();
  const right = buildMonoMultiband();

  splitter.connect(left.input, 0, 0);
  splitter.connect(right.input, 1, 0);
  left.output.connect(merger, 0, 0);
  right.output.connect(merger, 0, 1);

  return { input, output: merger };
}
