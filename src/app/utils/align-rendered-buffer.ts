/**
 * Remove deterministic mastering-chain latency from an offline render while
 * preserving the source length. Offline contexts are padded before rendering,
 * so the delayed tail is retained rather than truncated.
 */
export function alignRenderedAudioBuffer(
  rendered: AudioBuffer,
  latencySamples: number,
  targetLength: number
): AudioBuffer {
  const offset = Math.max(0, Math.round(latencySamples));
  const length = Math.max(0, Math.round(targetLength));
  const aligned = new AudioBuffer({
    length,
    numberOfChannels: rendered.numberOfChannels,
    sampleRate: rendered.sampleRate,
  });

  for (let channel = 0; channel < rendered.numberOfChannels; channel++) {
    const source = rendered.getChannelData(channel);
    const available = Math.max(0, Math.min(length, source.length - offset));
    if (available > 0) {
      aligned.copyToChannel(source.subarray(offset, offset + available), channel);
    }
  }

  return aligned;
}

export const OFFLINE_RENDER_LATENCY_PADDING_SECONDS = 0.05;
