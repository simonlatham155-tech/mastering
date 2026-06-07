import { describe, expect, test } from 'vitest';
import { resolveIntegratedLUFS, type BufferLoudnessResult } from '../measure-buffer-loudness';

describe('resolveIntegratedLUFS', () => {
  test('returns BS.1770 integrated when finite', () => {
    const loudness: BufferLoudnessResult = {
      integrated: -14.2,
      momentary: -12,
      shortTerm: -13,
      totalBlocks: 42,
      maxMomentary: -10,
    };
    expect(resolveIntegratedLUFS(loudness, -16)).toBe(-14.2);
  });

  test('falls back to RMS estimate when worklet unavailable', () => {
    const loudness: BufferLoudnessResult = {
      integrated: -Infinity,
      momentary: -Infinity,
      shortTerm: -Infinity,
      totalBlocks: 0,
      maxMomentary: -Infinity,
    };
    expect(resolveIntegratedLUFS(loudness, -18.5)).toBe(-18.5);
  });
});

describe('analyzeAudioBuffer sync fallback', () => {
  test('exports rms-based LUFS from sync path', async () => {
    const { analyzeAudioBuffer } = await import('../audio-analyzer');

    const length = 48000;
    const buffer = {
      sampleRate: 48000,
      numberOfChannels: 1,
      length,
      duration: 1,
      getChannelData: () => {
        const data = new Float32Array(length);
        const amp = 0.1;
        for (let i = 0; i < length; i++) {
          data[i] = amp * Math.sin((2 * Math.PI * 440 * i) / 48000);
        }
        return data;
      },
    } as AudioBuffer;

    const result = analyzeAudioBuffer(buffer);
    expect(Number.isFinite(result.lufs)).toBe(true);
    expect(result.lufs).toBeLessThan(-10);
    expect(result.lufs).toBeGreaterThan(-25);
  });
});
