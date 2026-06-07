import { describe, expect, it } from 'vitest';
import { encodeWavBlob } from '../wav-encode';

function makeBuffer(samples: number[], sampleRate = 44100): AudioBuffer {
  const length = samples.length;
  const channel = new Float32Array(samples);
  return {
    numberOfChannels: 1,
    length,
    sampleRate,
    duration: length / sampleRate,
    getChannelData: () => channel,
    copyToChannel: () => undefined,
  } as unknown as AudioBuffer;
}

function readWavBitDepth(data: ArrayBuffer): number {
  const view = new DataView(data);
  return view.getUint16(34, true);
}

describe('encodeWavBlob', () => {
  it('writes 24-bit PCM by default', async () => {
    const buffer = makeBuffer([0, 0.5, -0.5]);
    const data = await encodeWavBlob(buffer).arrayBuffer();
    expect(readWavBitDepth(data)).toBe(24);
    expect(data.byteLength).toBe(44 + 3 * 3);
  });

  it('writes 16-bit PCM when requested', async () => {
    const buffer = makeBuffer([0, 1, -1]);
    const data = await encodeWavBlob(buffer, { bitDepth: 16 }).arrayBuffer();
    expect(readWavBitDepth(data)).toBe(16);
    expect(data.byteLength).toBe(44 + 2 * 3);
  });
});
