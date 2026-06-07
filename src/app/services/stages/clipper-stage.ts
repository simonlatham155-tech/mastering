/**
 * Clipper Stage — soft peak rounding before the final limiter.
 * Pressure mode only; gentle drive to avoid low-end artifacts.
 */

import type { QualityMode } from '../../data/quality-profiles';
import type { ProcessingPlan } from '../../data/preset-resolution';
import type { ProcessingSettings } from '../audio-processor';

export interface ClipperStage {
  input: AudioNode;
  output: AudioNode;
}

function buildSoftClipCurve(amount: number): Float32Array {
  const samples = 65536;
  const curve = new Float32Array(samples);
  const drive = 1 + amount * 1.8;

  for (let i = 0; i < samples; i++) {
    const x = (i * 2 - samples) / samples;
    curve[i] = Math.tanh(x * drive);
  }

  return curve;
}

export function buildClipperStage(
  context: BaseAudioContext,
  settings: ProcessingSettings,
  params: ProcessingPlan,
  quality: QualityMode
): ClipperStage {
  const input = context.createGain();
  const output = context.createGain();

  const style = params.genreBehavior.loudnessStyle;
  const amount = style === 'aggressive' ? 0.32 : 0.24;

  const shaper = context.createWaveShaper();
  shaper.curve = buildSoftClipCurve(amount);
  shaper.oversample = quality === 'export' ? '4x' : '2x';

  const trim = context.createGain();
  trim.gain.value = 0.98;

  input.connect(shaper);
  shaper.connect(trim);
  trim.connect(output);

  console.log(
    `   Clipper: pressure-only soft-clip amount=${amount.toFixed(2)} (${settings.logicMode})`
  );

  return { input, output };
}
