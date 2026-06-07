/**
 * Clipper Stage — soft peak rounding before the final limiter.
 * Adds controlled harmonic energy for club/festival genres.
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
  const drive = 1 + amount * 2.5;

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

  const isBrickwall = settings.logicMode === 'brickwall';
  const style = params.genreBehavior.loudnessStyle;

  let amount = 0.28;
  if (isBrickwall) {
    amount = 0.5;
  } else if (style === 'aggressive') {
    amount = 0.42;
  } else if (style === 'balanced') {
    amount = 0.32;
  } else {
    amount = 0.2;
  }

  const shaper = context.createWaveShaper();
  shaper.curve = buildSoftClipCurve(amount);
  shaper.oversample = quality === 'export' ? '4x' : '2x';

  const trim = context.createGain();
  trim.gain.value = 0.97;

  input.connect(shaper);
  shaper.connect(trim);
  trim.connect(output);

  console.log(`   Clipper: soft-clip amount=${amount.toFixed(2)} (${isBrickwall ? 'pressure' : style})`);

  return { input, output };
}
