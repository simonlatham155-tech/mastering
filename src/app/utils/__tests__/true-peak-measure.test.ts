import { describe, test, expect } from 'vitest';
import { measureTruePeakLinearDBTP } from '../measure-buffer-true-peak';

/** Minimal AudioBuffer stand-in for Node tests */
function makeSineBuffer(
  frequencyHz: number,
  amplitude: number,
  durationSec: number,
  sampleRate = 48000
): AudioBuffer {
  const length = Math.floor(durationSec * sampleRate);
  const ctx = {
    sampleRate,
    numberOfChannels: 2,
    length,
    duration: durationSec,
    createBuffer: (_ch: number, len: number, sr: number) => ({
      numberOfChannels: 2,
      length: len,
      sampleRate: sr,
      duration: len / sr,
      getChannelData: (ch: number) => new Float32Array(len),
      copyToChannel: (source: Float32Array, ch: number) => {
        (buffer as { channels: Float32Array[] }).channels[ch].set(source);
      },
    }),
  };

  const buffer = ctx.createBuffer(2, length, sampleRate) as AudioBuffer & {
    channels: Float32Array[];
  };
  buffer.channels = [new Float32Array(length), new Float32Array(length)];

  for (let i = 0; i < length; i++) {
    const sample = amplitude * Math.sin((2 * Math.PI * frequencyHz * i) / sampleRate);
    buffer.channels[0][i] = sample;
    buffer.channels[1][i] = sample;
  }

  buffer.getChannelData = (ch: number) => buffer.channels[ch];
  return buffer;
}

describe('measureTruePeakLinearDBTP', () => {
  test('full-scale sine true peak ≈ 0 dBTP', () => {
    const buffer = makeSineBuffer(997, 1.0, 0.25);
    const tp = measureTruePeakLinearDBTP(buffer);
    expect(tp).toBeGreaterThan(-0.5);
    expect(tp).toBeLessThanOrEqual(0.1);
  });

  test('−6 dBFS sine peaks near −6 dBTP', () => {
    const buffer = makeSineBuffer(440, 0.501, 0.25);
    const tp = measureTruePeakLinearDBTP(buffer);
    expect(tp).toBeGreaterThan(-7);
    expect(tp).toBeLessThan(-5);
  });
});
