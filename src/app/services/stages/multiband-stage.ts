/**
 * Multiband Processing Stage (4-band split)
 *
 * Linkwitz-Riley-style crossovers with per-band dynamics + saturation.
 * Preserves stereo by processing L and R independently.
 */

import type { QualityMode } from '../../data/quality-profiles';
import type { ProcessingSettings } from '../audio-processor';

export interface MultibandStage {
  input: AudioNode;
  output: AudioNode;
}

function normalizeCurve(curve: Float32Array): Float32Array {
  const n = curve.length;
  const mid = (n / 2) | 0;
  const dx = 2 / (n - 1);
  const slope = (curve[mid + 1] - curve[mid - 1]) / (2 * dx);
  const slopeGain = slope !== 0 ? 1 / slope : 1;

  for (let i = 0; i < n; i++) curve[i] *= slopeGain;

  let maxAbs = 0;
  for (let i = 0; i < n; i++) maxAbs = Math.max(maxAbs, Math.abs(curve[i]));
  const peakGain = maxAbs > 0 ? 1 / maxAbs : 1;

  for (let i = 0; i < n; i++) curve[i] *= peakGain;

  return curve;
}

type MonoChain = { input: AudioNode; output: AudioNode };

/**
 * Build 4-band multiband stage for realtime and offline rendering.
 */
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

    const output = context.createGain();
    output.channelCountMode = 'explicit';
    output.channelCount = 1;
    output.channelInterpretation = 'speakers';

    const mbTrim = context.createGain();
    mbTrim.gain.value = 0.891;
    mbTrim.channelCountMode = 'explicit';
    mbTrim.channelCount = 1;
    mbTrim.channelInterpretation = 'speakers';

    const band1_LP1 = context.createBiquadFilter();
    band1_LP1.type = 'lowpass';
    band1_LP1.frequency.value = crossover1;
    band1_LP1.Q.value = 0.707;

    const band1_LP2 = context.createBiquadFilter();
    band1_LP2.type = 'lowpass';
    band1_LP2.frequency.value = crossover1;
    band1_LP2.Q.value = 0.707;

    const band2_HP1 = context.createBiquadFilter();
    band2_HP1.type = 'highpass';
    band2_HP1.frequency.value = crossover1;
    band2_HP1.Q.value = 0.707;

    const band2_HP2 = context.createBiquadFilter();
    band2_HP2.type = 'highpass';
    band2_HP2.frequency.value = crossover1;
    band2_HP2.Q.value = 0.707;

    const band2_LP1 = context.createBiquadFilter();
    band2_LP1.type = 'lowpass';
    band2_LP1.frequency.value = crossover2;
    band2_LP1.Q.value = 0.707;

    const band2_LP2 = context.createBiquadFilter();
    band2_LP2.type = 'lowpass';
    band2_LP2.frequency.value = crossover2;
    band2_LP2.Q.value = 0.707;

    const band3_HP1 = context.createBiquadFilter();
    band3_HP1.type = 'highpass';
    band3_HP1.frequency.value = crossover2;
    band3_HP1.Q.value = 0.707;

    const band3_HP2 = context.createBiquadFilter();
    band3_HP2.type = 'highpass';
    band3_HP2.frequency.value = crossover2;
    band3_HP2.Q.value = 0.707;

    const band3_LP1 = context.createBiquadFilter();
    band3_LP1.type = 'lowpass';
    band3_LP1.frequency.value = crossover3;
    band3_LP1.Q.value = 0.707;

    const band3_LP2 = context.createBiquadFilter();
    band3_LP2.type = 'lowpass';
    band3_LP2.frequency.value = crossover3;
    band3_LP2.Q.value = 0.707;

    const band4_HP1 = context.createBiquadFilter();
    band4_HP1.type = 'highpass';
    band4_HP1.frequency.value = crossover3;
    band4_HP1.Q.value = 0.707;

    const band4_HP2 = context.createBiquadFilter();
    band4_HP2.type = 'highpass';
    band4_HP2.frequency.value = crossover3;
    band4_HP2.Q.value = 0.707;

    const band1Compressor = context.createDynamicsCompressor();
    band1Compressor.threshold.value = -12;
    band1Compressor.knee.value = 6;
    band1Compressor.ratio.value = 4;
    band1Compressor.attack.value = 0.01;
    band1Compressor.release.value = 0.1;

    const band1Saturation = context.createWaveShaper();
    const band1Curve = new Float32Array(65536);
    for (let i = 0; i < 65536; i++) {
      const x = (i * 2 - 65536) / 65536;
      const saturated = Math.tanh(x * 1.5);
      const secondHarmonic = 0.15 * x * Math.abs(x);
      band1Curve[i] = saturated + secondHarmonic;
    }
    normalizeCurve(band1Curve);
    band1Saturation.curve = band1Curve;
    band1Saturation.oversample = 'none';

    const band1Post = context.createGain();
    band1Post.gain.value = 1.0;

    const band2Compressor = context.createDynamicsCompressor();
    band2Compressor.threshold.value = -10;
    band2Compressor.knee.value = 6;
    band2Compressor.ratio.value = 4;
    band2Compressor.attack.value = 0.008;
    band2Compressor.release.value = 0.10;

    const band2Saturation = context.createWaveShaper();
    const band2Curve = new Float32Array(65536);
    for (let i = 0; i < 65536; i++) {
      const x = (i * 2 - 65536) / 65536;
      band2Curve[i] = Math.tanh(x * 1.2);
    }
    normalizeCurve(band2Curve);
    band2Saturation.curve = band2Curve;
    band2Saturation.oversample = 'none';

    const band2Post = context.createGain();
    band2Post.gain.value = 1.0;

    const band3Compressor = context.createDynamicsCompressor();
    band3Compressor.threshold.value = -18;
    band3Compressor.knee.value = 6;
    band3Compressor.ratio.value = 2;
    band3Compressor.attack.value = 0.006;
    band3Compressor.release.value = 0.09;

    const band3Saturation = context.createWaveShaper();
    const band3Curve = new Float32Array(65536);
    for (let i = 0; i < 65536; i++) {
      const x = (i * 2 - 65536) / 65536;
      const saturated = Math.tanh(x);
      const thirdHarmonic = 0.08 * x * x * x;
      band3Curve[i] = saturated + thirdHarmonic;
    }
    normalizeCurve(band3Curve);
    band3Saturation.curve = band3Curve;
    band3Saturation.oversample = 'none';

    const band3Post = context.createGain();
    band3Post.gain.value = 1.0;

    const band4Compressor = context.createDynamicsCompressor();
    band4Compressor.threshold.value = -20;
    band4Compressor.knee.value = 6;
    band4Compressor.ratio.value = 1.5;
    band4Compressor.attack.value = 0.003;
    band4Compressor.release.value = 0.08;

    const band4Saturation = context.createWaveShaper();
    const band4Curve = new Float32Array(65536);
    for (let i = 0; i < 65536; i++) {
      const x = (i * 2 - 65536) / 65536;
      const clipThreshold = 0.794;
      if (Math.abs(x) > clipThreshold) {
        const excess = Math.abs(x) - clipThreshold;
        const softClipped = clipThreshold + Math.tanh(excess * 2) * 0.2;
        band4Curve[i] = x > 0 ? softClipped : -softClipped;
      } else {
        const saturated = Math.tanh(x * 0.8);
        const thirdHarmonic = 0.05 * Math.sin(3 * Math.PI * saturated);
        band4Curve[i] = saturated + thirdHarmonic;
      }
    }
    normalizeCurve(band4Curve);
    band4Saturation.curve = band4Curve;
    band4Saturation.oversample = 'none';

    const band4Post = context.createGain();
    band4Post.gain.value = 1.0;

    inputJunction.connect(band1_LP1);
    band1_LP1.connect(band1_LP2);
    band1_LP2.connect(band1Compressor);
    band1Compressor.connect(band1Saturation);
    band1Saturation.connect(band1Post);
    band1Post.connect(output);

    inputJunction.connect(band2_HP1);
    band2_HP1.connect(band2_HP2);
    band2_HP2.connect(band2_LP1);
    band2_LP1.connect(band2_LP2);
    band2_LP2.connect(band2Compressor);
    band2Compressor.connect(band2Saturation);
    band2Saturation.connect(band2Post);
    band2Post.connect(output);

    inputJunction.connect(band3_HP1);
    band3_HP1.connect(band3_HP2);
    band3_HP2.connect(band3_LP1);
    band3_LP1.connect(band3_LP2);
    band3_LP2.connect(band3Compressor);
    band3Compressor.connect(band3Saturation);
    band3Saturation.connect(band3Post);
    band3Post.connect(output);

    inputJunction.connect(band4_HP1);
    band4_HP1.connect(band4_HP2);
    band4_HP2.connect(band4Compressor);
    band4Compressor.connect(band4Saturation);
    band4Saturation.connect(band4Post);
    band4Post.connect(output);

    output.connect(mbTrim);

    return { input: inputJunction, output: mbTrim };
  };

  const left = buildMonoMultiband();
  const right = buildMonoMultiband();

  splitter.connect(left.input, 0, 0);
  splitter.connect(right.input, 1, 0);
  left.output.connect(merger, 0, 0);
  right.output.connect(merger, 0, 1);

  return { input, output: merger };
}
