/** Guard DSP / UI values that must be finite before touching AudioParam. */
export function finiteDB(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

export function finiteLinearGainFromDB(db: number, fallbackLinear = 1): number {
  if (!Number.isFinite(db)) return fallbackLinear;
  return Math.pow(10, db / 20);
}

export function sanitizeGainArray(gains: number[], fallback = 0): number[] {
  return gains.map((g) => finiteDB(g, fallback));
}

/** Safe AudioParam.setTargetAtTime — skips non-finite values. */
export function setTargetFinite(
  param: AudioParam,
  value: number,
  currentTime: number,
  timeConstant: number,
  fallback = 0
): void {
  param.setTargetAtTime(Number.isFinite(value) ? value : fallback, currentTime, timeConstant);
}

/** dB → linear gain, then setTargetAtTime. */
export function setTargetLinearFromDB(
  param: AudioParam,
  db: number,
  currentTime: number,
  timeConstant: number,
  fallbackLinear = 1
): void {
  param.setTargetAtTime(
    finiteLinearGainFromDB(db, fallbackLinear),
    currentTime,
    timeConstant
  );
}
