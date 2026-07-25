import { describe, expect, it, vi } from 'vitest';
import { alignRenderedAudioBuffer } from '../align-rendered-buffer';

class TestAudioBuffer {
  readonly length: number;
  readonly numberOfChannels: number;
  readonly sampleRate: number;
  readonly duration: number;
  private readonly channels: Float32Array[];

  constructor(options: {
    length: number;
    numberOfChannels: number;
    sampleRate: number;
  }) {
    this.length = options.length;
    this.numberOfChannels = options.numberOfChannels;
    this.sampleRate = options.sampleRate;
    this.duration = this.length / this.sampleRate;
    this.channels = Array.from(
      { length: this.numberOfChannels },
      () => new Float32Array(this.length)
    );
  }

  getChannelData(channel: number): Float32Array {
    return this.channels[channel];
  }

  copyToChannel(source: Float32Array, channel: number, offset = 0): void {
    this.channels[channel].set(source, offset);
  }
}

describe('offline render latency alignment', () => {
  it('removes leading limiter latency and retains the delayed tail', () => {
    vi.stubGlobal('AudioBuffer', TestAudioBuffer);
    const rendered = new TestAudioBuffer({
      length: 12,
      numberOfChannels: 2,
      sampleRate: 48_000,
    });
    rendered.getChannelData(0).set([0, 0, 0, 1, 2, 3, 4, 5]);
    rendered.getChannelData(1).set([0, 0, 0, 10, 20, 30, 40, 50]);

    const aligned = alignRenderedAudioBuffer(
      rendered as unknown as AudioBuffer,
      3,
      5
    );

    expect([...aligned.getChannelData(0)]).toEqual([1, 2, 3, 4, 5]);
    expect([...aligned.getChannelData(1)]).toEqual([10, 20, 30, 40, 50]);
    vi.unstubAllGlobals();
  });

  it('zero-pads if a fallback ever reports more latency than the render padding', () => {
    vi.stubGlobal('AudioBuffer', TestAudioBuffer);
    const rendered = new TestAudioBuffer({
      length: 4,
      numberOfChannels: 1,
      sampleRate: 48_000,
    });

    const aligned = alignRenderedAudioBuffer(
      rendered as unknown as AudioBuffer,
      10,
      3
    );

    expect([...aligned.getChannelData(0)]).toEqual([0, 0, 0]);
    vi.unstubAllGlobals();
  });
});
