/**
 * Level-match helpers for evaluation A/B (Ozone-style Gain Match).
 * Does not affect export — only auditioning and optional waveform display.
 */

/** RMS of channel 0 over [startSec, endSec). */
export function measureBufferRms(
  buffer: AudioBuffer,
  startSec = 0,
  endSec?: number
): number {
  const data = buffer.getChannelData(0);
  const duration = buffer.duration;
  if (duration <= 0 || data.length === 0) return 0;

  const end = endSec ?? duration;
  const startIdx = Math.max(0, Math.floor((startSec / duration) * data.length));
  const endIdx = Math.min(
    data.length,
    Math.max(startIdx + 1, Math.floor((end / duration) * data.length))
  );

  let sumSq = 0;
  const n = endIdx - startIdx;
  for (let i = startIdx; i < endIdx; i++) {
    const s = data[i] ?? 0;
    sumSq += s * s;
  }
  return Math.sqrt(sumSq / n);
}

/**
 * dB trim to apply on bypass path so original matches processed loudness
 * over the compared region (positive = boost bypass).
 */
export function computeBypassGainMatchDB(
  original: AudioBuffer,
  processed: AudioBuffer,
  compareSeconds?: number
): number {
  const region = Math.min(
    compareSeconds ?? processed.duration,
    original.duration,
    processed.duration
  );
  if (region <= 0) return 0;

  const origRms = measureBufferRms(original, 0, region);
  const procRms = measureBufferRms(processed, 0, region);
  if (origRms < 1e-8 || procRms < 1e-8) return 0;

  const ratio = procRms / origRms;
  const matchDB = 20 * Math.log10(ratio);
  return Math.max(-12, Math.min(12, matchDB));
}

export function linearFromDB(db: number): number {
  return Math.pow(10, db / 20);
}
