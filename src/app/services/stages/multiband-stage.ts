/**
 * Multiband Processing Stage (4-band split)
 *
 * MASTERING RULES:
 * - The crossover/sum path must be nominally unity: no mystery output trim.
 * - Multiband is corrective dynamics, not four permanently saturated bands.
 * - Compression is deliberately gentle so the stage cannot become the main
 *   loudness generator or create low-end pumping by default.
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
  // Low band: slow, low ratio to avoid kick/bass pumping.
  { threshold: -8, knee: 12, ratio: 1.45, attack: 0.03, release: 0.18 },
  // Low-mid: slightly firmer for mud/boxiness control.
  { threshold: -10, knee: 12, ratio: 1.6, attack: 0.02, release: 0.16 },
  // Mid band: transparent density control.
  { threshold: -10, knee: 12, ratio: 1.5, attack: 0.015, release: 0.14 },
  // High band: softest ratio and fast enough to catch brittle peaks.
  { threshold: -12, knee: 14, ratio: 1.35, attack: 0.008, release: 0.12 },
];

function createLR4Lowpass(context: BaseAudioContext, frequency: number): AudioNode[] {
  const a = context.createBiquadFilter();
  const b = context.createBiquadFilter();
  a.type = 'lowpass';
  b.type = 'lowpass';
  a.frequency.value = frequency;
  b.frequency.value = frequency;
  a.Q.value = 0.70710678;
  b.Q.value = 0.70710678;
  return [a, b];
}

function createLR4Highpass(context: BaseAudioContext, frequency: number): AudioNode[] {
  const a = context.createBiquadFilter();
  const b = context.createBiquadFilter();
  a.type = 'highpass';
  b.type = 'highpass';
  a.frequency.value = frequency;
  b.frequency.value = frequency;
  a.Q.value = 0.70710678;
  b.Q.value = 0.70710678;
  return [a, b];
}

function chainNodes(nodes: AudioNode[]): void {
  for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
}

function createCompressor(context: BaseAudioContext, cfg: BandComp): DynamicsCompressorNode {
  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = cfg.threshold;
  compressor.knee.value = cfg.knee;
  compressor.ratio.value = cfg.ratio;
  compressor.attack.value = cfg.attack;
  compressor.release.value = cfg.release;
  return compressor;
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
    const inputJunction = context.createGain();
    inputJunction.channelCountMode = 'explicit';
    inputJunction.channelCount = 1;
    inputJunction.channelInterpretation = 'speakers';

    const sum = context.createGain();
    sum.channelCountMode = 'explicit';
    sum.channelCount = 1;
    sum.channelInterpretation = 'speakers';
    // Unity by design. Do not hide reconstruction errors with a global trim.
    sum.gain.value = 1;

    // Band 1: < 100 Hz
    const b1 = createLR4Lowpass(context, crossover1);
    const c1 = createCompressor(context, BAND_COMPS[0]);
    inputJunction.connect(b1[0]);
    chainNodes(b1);
    b1[b1.length - 1].connect(c1);
    c1.connect(sum);

    // Band 2: 100..300 Hz
    const b2hp = createLR4Highpass(context, crossover1);
    const b2lp = createLR4Lowpass(context, crossover2);
    const c2 = createCompressor(context, BAND_COMPS[1]);
    inputJunction.connect(b2hp[0]);
    chainNodes(b2hp);
    b2hp[b2hp.length - 1].connect(b2lp[0]);
    chainNodes(b2lp);
    b2lp[b2lp.length - 1].connect(c2);
    c2.connect(sum);

    // Band 3: 300..3500 Hz
    const b3hp = createLR4Highpass(context, crossover2);
    const b3lp = createLR4Lowpass(context, crossover3);
    const c3 = createCompressor(context, BAND_COMPS[2]);
    inputJunction.connect(b3hp[0]);
    chainNodes(b3hp);
    b3hp[b3hp.length - 1].connect(b3lp[0]);
    chainNodes(b3lp);
    b3lp[b3lp.length - 1].connect(c3);
    c3.connect(sum);

    // Band 4: > 3500 Hz
    const b4 = createLR4Highpass(context, crossover3);
    const c4 = createCompressor(context, BAND_COMPS[3]);
    inputJunction.connect(b4[0]);
    chainNodes(b4);
    b4[b4.length - 1].connect(c4);
    c4.connect(sum);

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
