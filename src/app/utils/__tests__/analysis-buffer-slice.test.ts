import { describe, expect, test } from 'vitest';
import { INPUT_ANALYSIS_MAX_SECONDS, analysisSampleLength, sliceBufferHead } from '../analysis-buffer-slice';

function makeBuffer(durationSec: number, sampleRate = 48000): AudioBuffer {
  const length = Math.floor(durationSec * sampleRate);
  const channels = [new Float32Array(length), new Float32Array(length)];
  return {
    sampleRate,
    numberOfChannels: 2,
    length,
    duration: durationSec,
    getChannelData: (ch: number) => channels[ch],
    copyToChannel: (source: Float32Array, ch: number) => {
      channels[ch].set(source.subarray(0, length));
    },
  } as AudioBuffer;
}

describe('sliceBufferHead', () => {
  test('returns same buffer when under cap', () => {
    const buffer = makeBuffer(30);
    expect(sliceBufferHead(buffer)).toBe(buffer);
  });

  test('computes capped sample length for long buffers', () => {
    const buffer = makeBuffer(300);
    expect(analysisSampleLength(buffer, INPUT_ANALYSIS_MAX_SECONDS)).toBe(
      Math.floor(INPUT_ANALYSIS_MAX_SECONDS * buffer.sampleRate)
    );
  });
});

describe('buildInputAnalysisFromProcessor', () => {
  test('maps processor analysis to mix-setup result', async () => {
    const { buildInputAnalysisFromProcessor } = await import('../audio-analyzer');
    const length = 48000;
    const data = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      data[i] = 0.1 * Math.sin((2 * Math.PI * 440 * i) / 48000);
    }
    const buffer = {
      sampleRate: 48000,
      numberOfChannels: 1,
      length,
      duration: 1,
      getChannelData: () => data,
    } as AudioBuffer;

    const analysis = {
      lufs: -14.2,
      integratedLUFS: -14.2,
      momentaryMaxLUFS: -12,
      truePeak: 0.5,
      truePeakDBTP: -0.2,
      dynamicRange: 8,
      rms: 0.07,
      peakLevel: -1.5,
      crestFactor: 12,
      sslAutoReleaseTime: 200,
      material: 'balanced' as const,
    };

    const input = buildInputAnalysisFromProcessor(buffer, analysis);
    expect(input.lufs).toBe(-14.2);
    expect(input.truePeak).toBe(-0.2);
    expect(input.digitalPeakDB).toBe(-1.5);
    expect(input.suggestedGenre).toBeTruthy();
  });
});
