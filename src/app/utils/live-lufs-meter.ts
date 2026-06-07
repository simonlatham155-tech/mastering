/** Lightweight momentary loudness estimate for realtime analyser buffers. */

export function estimateMomentaryLUFS(samples: Float32Array): number {
  if (samples.length === 0) return -60;

  let sumSquares = 0;
  for (let i = 0; i < samples.length; i++) {
    sumSquares += samples[i] * samples[i];
  }

  const meanSquare = sumSquares / samples.length;
  if (meanSquare <= 1e-12) return -60;

  return -0.691 + 10 * Math.log10(meanSquare);
}
