/**
 * Post-chain output trim is fine delivery calibration only.
 * Loudness must be developed before / through the limiter.
 */
export const OUTPUT_TRIM_MIN_DB = -1.5;
export const OUTPUT_TRIM_MAX_DB = 1.5;

export const DEFAULT_STAGING_TOLERANCE_LU = 0.5;
export const DEFAULT_MAX_STAGING_ITERATIONS = 4;
export const DEFAULT_MAX_STAGING_STEP_DB = 0.5;

export function clampOutputTrimDB(trimDB: number): number {
  return Math.max(OUTPUT_TRIM_MIN_DB, Math.min(OUTPUT_TRIM_MAX_DB, trimDB));
}

export interface StagingStepInput {
  integratedLUFS: number;
  targetLUFS: number;
  currentOutputTrimDB: number;
  /** Peak in dBTP or dBFS — used for ceiling headroom check when boosting */
  peakDB: number;
  ceilingDBTP: number;
  toleranceLU?: number;
  maxStepDB?: number;
}

/**
 * One small calibration step toward target integrated LUFS via post-chain trim.
 * This deliberately cannot create several dB of mastering loudness.
 * Returns null when already on target, measurement invalid, or ceiling/headroom
 * says further output gain would be unsafe.
 */
export function computeStagingTrimStep(input: StagingStepInput): number | null {
  const {
    integratedLUFS,
    targetLUFS,
    currentOutputTrimDB,
    peakDB,
    ceilingDBTP,
    toleranceLU = DEFAULT_STAGING_TOLERANCE_LU,
    maxStepDB = DEFAULT_MAX_STAGING_STEP_DB,
  } = input;

  if (!Number.isFinite(integratedLUFS) || integratedLUFS === -Infinity) {
    return null;
  }

  const errorLU = targetLUFS - integratedLUFS;
  if (Math.abs(errorLU) <= toleranceLU) {
    return null;
  }

  let stepDB = Math.max(-maxStepDB, Math.min(maxStepDB, errorLU));

  if (stepDB > 0) {
    const headroomDB = ceilingDBTP - peakDB;
    const allowedBoostDB = Math.max(0, headroomDB - 0.2);
    stepDB = Math.min(stepDB, allowedBoostDB);
    if (stepDB < 0.05) {
      return null;
    }
  }

  const nextTrim = clampOutputTrimDB(currentOutputTrimDB + stepDB);
  if (Math.abs(nextTrim - currentOutputTrimDB) < 0.05) {
    return null;
  }

  return nextTrim;
}

export function isOnLufsTarget(
  integratedLUFS: number,
  targetLUFS: number,
  toleranceLU = DEFAULT_STAGING_TOLERANCE_LU
): boolean {
  return (
    Number.isFinite(integratedLUFS) &&
    integratedLUFS !== -Infinity &&
    Math.abs(integratedLUFS - targetLUFS) <= toleranceLU
  );
}
