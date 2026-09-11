/**
 * Tape Saturation Stage (Studer A800 / Ampex ATR-102 inspired)
 *
 * MASTERING RULES:
 * - One physical drive stage only. The waveshaper must not multiply drive again.
 * - Drive is level-compensated so it behaves as colour/density, not a loudness knob.
 * - Tape compression and head/bias response remain deliberately subtle.
 * - Preview/export share the same transfer curve; only oversampling changes.
 */

import type { QualityMode } from '../../data/quality-profiles';
import {
  tapeCompFromPreGainDB,
  dbToLinear,
  linearToDb,
  getCompProfile,
  smoothParam,
} from './stage-utils';

export type TapeConfig = {
  baseDrive: number;
  genreMultiplier: number;
  biasAmount: number;
  tapeSpeed: 7.5 | 15 | 30;
};

export type TapeStage = {
  input: AudioNode;
  output: AudioNode;
  params: {
    drive: AudioParam;
    comp: AudioParam;
  };
  setDrive: (
    ctx: BaseAudioContext,
    drive: number,
    genreMult: number,
    genreId: string
  ) => void;
  dispose: () => void;
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

/**
 * The curve is intentionally independent of the user drive control.
 * Drive is applied once, by driveGain, before this transfer function.
 */
function buildTapeCurve(): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(65536);

  for (let i = 0; i < curve.length; i++) {
    const x = (i * 2 - curve.length) / curve.length;

    // Gentle magnetic compression: mostly linear around zero, progressively
    // rounded toward the rails. No hidden second drive multiplier here.
    const primary = Math.tanh(x * 1.08) / Math.tanh(1.08);
    const soft = (2 / Math.PI) * Math.atan(x * 1.25);
    const saturated = primary * 0.72 + soft * 0.28;

    // Fixed, low-level tape-like harmonic fingerprint. Loudness/colour depth is
    // controlled by how hard driveGain feeds the curve.
    const third = 0.006 * Math.sin(3 * Math.PI * saturated);
    const fifth = 0.0025 * Math.sin(5 * Math.PI * saturated);
    const asymmetry = 0.006 * saturated * saturated;

    curve[i] = saturated + third + fifth + asymmetry;
  }

  return curve;
}

function physicalPreGain(drive: number, genreMultiplier: number): number {
  const effectiveDrive = clamp01(drive) * Math.max(0.5, Math.min(1.3, genreMultiplier));
  return 1 + effectiveDrive * 0.55;
}

function compensationGain(
  preGain: number,
  genreMultiplier: number,
  genreId: string
): number {
  const profile = getCompProfile(genreId);
  const preGainDB = linearToDb(preGain);
  const compDB = tapeCompFromPreGainDB(preGainDB, genreMultiplier);
  return dbToLinear(compDB * profile.tapeCompScale);
}

export function buildTapeStage(
  context: BaseAudioContext,
  quality: QualityMode,
  config: TapeConfig
): TapeStage {
  const input = context.createGain();
  input.channelCountMode = 'max';
  input.channelInterpretation = 'speakers';

  const driveGain = context.createGain();

  const headBumpFreq =
    config.tapeSpeed === 30 ? 80 : config.tapeSpeed === 15 ? 60 : 40;
  const headBump = context.createBiquadFilter();
  headBump.type = 'peaking';
  headBump.frequency.value = headBumpFreq;
  headBump.gain.value = 0.25;
  headBump.Q.value = 1.0;

  const biasShelf = context.createBiquadFilter();
  biasShelf.type = 'highshelf';
  biasShelf.frequency.value = 9000;
  biasShelf.gain.value = (config.biasAmount - 0.5) * 0.8;
  biasShelf.Q.value = 0.7;

  const tapeCompressor = context.createDynamicsCompressor();
  tapeCompressor.threshold.value = -4;
  tapeCompressor.knee.value = 14;
  tapeCompressor.ratio.value = 1.8;
  tapeCompressor.attack.value = 0.015;
  tapeCompressor.release.value = 0.22;

  const hysteresisSat = context.createWaveShaper();
  hysteresisSat.curve = buildTapeCurve();
  hysteresisSat.oversample = quality === 'export' ? '4x' : '2x';

  const dcBlocker = context.createBiquadFilter();
  dcBlocker.type = 'highpass';
  dcBlocker.frequency.value = 5;
  dcBlocker.Q.value = 0.7071;

  const tapeRolloff = context.createBiquadFilter();
  tapeRolloff.type = 'lowpass';
  tapeRolloff.frequency.value =
    config.tapeSpeed === 30 ? 22000 : config.tapeSpeed === 15 ? 20000 : 15000;
  tapeRolloff.Q.value = 0.5;

  const compTrim = context.createGain();
  const output = context.createGain();
  output.channelCountMode = 'max';
  output.channelInterpretation = 'speakers';
  output.gain.value = 1;

  input.connect(driveGain);
  driveGain.connect(headBump);
  headBump.connect(biasShelf);
  biasShelf.connect(tapeCompressor);
  tapeCompressor.connect(hysteresisSat);
  hysteresisSat.connect(dcBlocker);
  dcBlocker.connect(tapeRolloff);
  tapeRolloff.connect(compTrim);
  compTrim.connect(output);

  const initialDrive = clamp01(config.baseDrive);
  const preGain = physicalPreGain(initialDrive, config.genreMultiplier);
  driveGain.gain.value = preGain;
  compTrim.gain.value = compensationGain(
    preGain,
    config.genreMultiplier,
    'default'
  );

  console.log(
    `📼 Tape: drive=${initialDrive.toFixed(2)}, preGain=${preGain.toFixed(3)}x, genreMult=${config.genreMultiplier.toFixed(2)}, speed=${config.tapeSpeed}IPS`
  );

  return {
    input,
    output,
    params: {
      drive: driveGain.gain,
      comp: compTrim.gain,
    },
    setDrive(ctx, drive, genreMult, genreId) {
      const pre = physicalPreGain(drive, genreMult);
      smoothParam(ctx, driveGain.gain, pre, 0.05);
      smoothParam(
        ctx,
        compTrim.gain,
        compensationGain(pre, genreMult, genreId),
        0.05
      );
    },
    dispose() {
      try { input.disconnect(); } catch {}
      try { driveGain.disconnect(); } catch {}
      try { headBump.disconnect(); } catch {}
      try { biasShelf.disconnect(); } catch {}
      try { tapeCompressor.disconnect(); } catch {}
      try { hysteresisSat.disconnect(); } catch {}
      try { dcBlocker.disconnect(); } catch {}
      try { tapeRolloff.disconnect(); } catch {}
      try { compTrim.disconnect(); } catch {}
      try { output.disconnect(); } catch {}
    },
  };
}

export function getTapeConfig(
  genreId: string,
  circuitDrive: number
): TapeConfig {
  const baseDrive = clamp01(circuitDrive / 100);

  switch (genreId) {
    case 'trance':
      return { baseDrive, genreMultiplier: 0.9, biasAmount: 0.6, tapeSpeed: 30 };
    case 'house':
      return { baseDrive, genreMultiplier: 1.0, biasAmount: 0.5, tapeSpeed: 15 };
    case 'techno':
      return { baseDrive, genreMultiplier: 1.1, biasAmount: 0.35, tapeSpeed: 15 };
    case 'rnb':
      return { baseDrive, genreMultiplier: 0.7, biasAmount: 0.65, tapeSpeed: 30 };
    case 'realprog':
      return { baseDrive, genreMultiplier: 0.9, biasAmount: 0.55, tapeSpeed: 15 };
    case 'modernprog':
      return { baseDrive, genreMultiplier: 1.0, biasAmount: 0.5, tapeSpeed: 15 };
    case 'tape':
      return { baseDrive, genreMultiplier: 1.15, biasAmount: 0.35, tapeSpeed: 7.5 };
    default:
      return { baseDrive, genreMultiplier: 1.0, biasAmount: 0.5, tapeSpeed: 15 };
  }
}
