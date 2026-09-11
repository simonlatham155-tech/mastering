/**
 * Transformer Stage (mastering transformer inspired)
 *
 * MASTERING RULES:
 * - Transformer colour must not act as an automatic bass EQ.
 * - One consistent drive law is used for initial state and live updates.
 * - Tonal correction belongs to the genre-target EQ, not this colour stage.
 */

import type { QualityMode } from '../../data/quality-profiles';
import {
  transformerCompFromPreGainDB,
  dbToLinear,
  linearToDb,
  getCompProfile,
  smoothParam,
} from './stage-utils';

export type TransformerConfig = {
  baseDrive: number;
  genreMultiplier: number;
  saturationAmount: number;
};

export type TransformerStage = {
  input: AudioNode;
  output: AudioNode;
  params: {
    drive: AudioParam;
    comp: AudioParam;
  };
  setDrive: (
    ctx: BaseAudioContext,
    drive: number,
    satAmount: number,
    genreId: string
  ) => void;
  dispose: () => void;
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

function physicalPreGain(drive: number): number {
  return 1 + clamp01(drive) * 0.25;
}

function buildTransformerCurve(saturationAmount: number): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(65536);
  const sat = Math.max(0.5, Math.min(1.5, saturationAmount));

  for (let i = 0; i < curve.length; i++) {
    const x = (i * 2 - curve.length) / curve.length;
    const biased = x + 0.045 * x * x;
    const driven = biased * (1 + sat * 0.18);

    const threshold = 0.68;
    let shaped = driven;
    if (Math.abs(driven) > threshold) {
      const excess = Math.abs(driven) - threshold;
      const rounded = threshold + Math.tanh(excess * 1.8) * 0.32;
      shaped = driven >= 0 ? rounded : -rounded;
    }

    const evenHarmonic = 0.012 * sat * shaped * Math.abs(shaped);
    curve[i] = shaped + evenHarmonic;
  }

  return curve;
}

export function buildTransformerStage(
  context: BaseAudioContext,
  quality: QualityMode,
  config: TransformerConfig
): TransformerStage {
  const input = context.createGain();
  input.channelCountMode = 'max';
  input.channelInterpretation = 'speakers';

  const driveGain = context.createGain();

  const lowShelf = context.createBiquadFilter();
  lowShelf.type = 'lowshelf';
  lowShelf.frequency.value = 180;
  lowShelf.gain.value = 0.2;
  lowShelf.Q.value = 0.7;

  const highShelf = context.createBiquadFilter();
  highShelf.type = 'highshelf';
  highShelf.frequency.value = 14000;
  highShelf.gain.value = -0.2;
  highShelf.Q.value = 0.7;

  const transformerSat = context.createWaveShaper();
  transformerSat.curve = buildTransformerCurve(config.saturationAmount);
  transformerSat.oversample = quality === 'export' ? '4x' : '2x';

  const dcBlocker = context.createBiquadFilter();
  dcBlocker.type = 'highpass';
  dcBlocker.frequency.value = 5;
  dcBlocker.Q.value = 0.7071;

  const compTrim = context.createGain();
  const output = context.createGain();
  output.channelCountMode = 'max';
  output.channelInterpretation = 'speakers';
  output.gain.value = 1;

  input.connect(driveGain);
  driveGain.connect(lowShelf);
  lowShelf.connect(highShelf);
  highShelf.connect(transformerSat);
  transformerSat.connect(dcBlocker);
  dcBlocker.connect(compTrim);
  compTrim.connect(output);

  const initialDrive = clamp01(config.baseDrive * config.genreMultiplier);
  const preGain = physicalPreGain(initialDrive);
  driveGain.gain.value = preGain;

  const preGainDB = linearToDb(preGain);
  const profile = getCompProfile('default');
  const compDB = transformerCompFromPreGainDB(
    preGainDB,
    config.saturationAmount
  );
  compTrim.gain.value = dbToLinear(compDB * profile.transformerCompScale);

  console.log(
    `🎛️ Transformer: drive=${initialDrive.toFixed(2)}, preGain=${preGain.toFixed(3)}x, sat=${config.saturationAmount.toFixed(2)}`
  );

  return {
    input,
    output,
    params: {
      drive: driveGain.gain,
      comp: compTrim.gain,
    },
    setDrive(ctx, drive, satAmount, genreId) {
      const pre = physicalPreGain(drive);
      const profile = getCompProfile(genreId);
      const compDB = transformerCompFromPreGainDB(linearToDb(pre), satAmount);

      smoothParam(ctx, driveGain.gain, pre, 0.05);
      smoothParam(
        ctx,
        compTrim.gain,
        dbToLinear(compDB * profile.transformerCompScale),
        0.05
      );
    },
    dispose() {
      try { input.disconnect(); } catch {}
      try { driveGain.disconnect(); } catch {}
      try { lowShelf.disconnect(); } catch {}
      try { highShelf.disconnect(); } catch {}
      try { transformerSat.disconnect(); } catch {}
      try { dcBlocker.disconnect(); } catch {}
      try { compTrim.disconnect(); } catch {}
      try { output.disconnect(); } catch {}
    },
  };
}

export function getTransformerConfig(genreId: string): TransformerConfig {
  switch (genreId) {
    case 'realprog':
      return { baseDrive: 0.45, genreMultiplier: 0.95, saturationAmount: 0.75 };
    case 'modernprog':
      return { baseDrive: 0.55, genreMultiplier: 1.0, saturationAmount: 0.95 };
    case 'trance':
      return { baseDrive: 0.45, genreMultiplier: 0.95, saturationAmount: 0.8 };
    case 'house':
      return { baseDrive: 0.55, genreMultiplier: 1.0, saturationAmount: 0.9 };
    case 'techno':
      return { baseDrive: 0.6, genreMultiplier: 1.0, saturationAmount: 1.0 };
    case 'rnb':
      return { baseDrive: 0.4, genreMultiplier: 0.9, saturationAmount: 0.7 };
    case 'tape':
      return { baseDrive: 0.65, genreMultiplier: 1.05, saturationAmount: 1.15 };
    default:
      return { baseDrive: 0.5, genreMultiplier: 1.0, saturationAmount: 0.85 };
  }
}
