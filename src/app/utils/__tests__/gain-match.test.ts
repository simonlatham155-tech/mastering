import { describe, expect, it } from 'vitest';
import {
  computeBypassGainMatchDB,
  measureBufferRms,
} from '../gain-match';

function makeMockBuffer(amplitude: number, durationSec = 1, sampleRate = 48000): AudioBuffer {
  const length = Math.floor(durationSec * sampleRate);
  const data = new Float32Array(length);
  data.fill(amplitude);
  return {
    duration: durationSec,
    sampleRate,
    numberOfChannels: 1,
    length,
    getChannelData: () => data,
    copyFromChannel: () => {},
    copyToChannel: () => {},
  } as AudioBuffer;
}

describe('gain-match', () => {
  it('measureBufferRms scales with amplitude', () => {
    const quiet = makeMockBuffer(0.1);
    const loud = makeMockBuffer(0.4);
    expect(measureBufferRms(loud)).toBeGreaterThan(measureBufferRms(quiet));
  });

  it('computeBypassGainMatchDB returns positive boost when processed is louder', () => {
    const original = makeMockBuffer(0.15, 2);
    const processed = makeMockBuffer(0.3, 2);
    const matchDB = computeBypassGainMatchDB(original, processed);
    expect(matchDB).toBeCloseTo(6, 0);
  });

  it('computeBypassGainMatchDB returns ~0 when levels match', () => {
    const buf = makeMockBuffer(0.25, 2);
    expect(Math.abs(computeBypassGainMatchDB(buf, buf))).toBeLessThan(0.01);
  });
});
