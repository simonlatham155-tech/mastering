/** Max seconds measured for upload BS.1770 (matches spectral analysis cap). */
export const INPUT_ANALYSIS_MAX_SECONDS = 90;

export function analysisSampleLength(buffer: AudioBuffer, maxSeconds: number): number {
  return Math.min(buffer.length, Math.floor(buffer.sampleRate * maxSeconds));
}

function createSliceBuffer(channels: number, length: number, sampleRate: number): AudioBuffer {
  if (typeof AudioBuffer !== 'undefined') {
    return new AudioBuffer({ length, numberOfChannels: channels, sampleRate });
  }
  const ctx = new OfflineAudioContext(channels, 1, sampleRate);
  return ctx.createBuffer(channels, length, sampleRate);
}

/**
 * Use the start of a long file for offline LUFS worklet analysis so upload
 * stays responsive. Integrated loudness on the intro is sufficient for staging.
 */
export function sliceBufferHead(
  buffer: AudioBuffer,
  maxSeconds = INPUT_ANALYSIS_MAX_SECONDS
): AudioBuffer {
  if (buffer.duration <= maxSeconds || buffer.length === 0) return buffer;

  const sampleRate = buffer.sampleRate;
  const length = analysisSampleLength(buffer, maxSeconds);
  const channels = buffer.numberOfChannels;
  const out = createSliceBuffer(channels, length, sampleRate);

  for (let ch = 0; ch < channels; ch++) {
    out.copyToChannel(buffer.getChannelData(ch).subarray(0, length), ch);
  }

  return out;
}
