/**
 * Stage Utilities
 * 
 * Shared helpers for stage parameter calculations:
 * - Effective drive computation with guardrails
 * - Auto-gain compensation (prevents "drive becomes loudness")
 * - Parameter smoothing
 * - Unity gain enforcement
 */

/**
 * Compute effective drive with guardrails
 * 
 * CRITICAL: This prevents "drive becomes loudness" by:
 * - Clamping to hard ceiling (0-2 range)
 * - Applying user offset as relative adjustment (±50% swing)
 * - Preserving genre character while allowing user flexibility
 * 
 * @param base - Base drive amount (0..1)
 * @param genreMult - Genre multiplier (0.7 - 1.5)
 * @param userOffset - User offset (-1..+1, relative adjustment)
 * @returns Effective drive value (clamped to 0-2)
 */
export function computeEffectiveDrive(
  base: number,
  genreMult: number,
  userOffset: number
): number {
  const combined = base * genreMult;
  const withUser = combined * (1 + userOffset * 0.5); // 50% swing
  return clamp(withUser, 0, 2); // Hard guardrail
}

/**
 * Convert linear gain to dB
 */
export function linearToDb(linear: number): number {
  return 20 * Math.log10(Math.max(1e-9, linear));
}

/**
 * TRANSFORMER: Auto-gain compensation curve (NEW - preGainDB based)
 * 
 * Prevents transformer drive from increasing perceived loudness.
 * Based on measured RMS increase: +2 to +3 dB at max drive.
 * 
 * CRITICAL: This curve is keyed to the PHYSICAL signal (dB into waveshaper),
 * not the control signal (UI drive 0-2). This makes it portable and future-proof.
 * 
 * @param preGainDB - Pre-shaper gain in dB (physical signal)
 * @param satAmount - Saturation amount/blend (0..1, how much stage is engaged)
 * @returns Compensation gain in dB (negative trim, capped at -3.5 dB)
 */
export function transformerCompFromPreGainDB(preGainDB: number, satAmount: number): number {
  const a = clamp(satAmount, 0, 1);
  const g = clamp(preGainDB, 0, 3);      // transformer: keep within mastering range

  // gentle early, stronger late
  const shaped = Math.pow(g / 3, 1.4);

  // Target about -3.2 dB at max push + full sat
  const comp = -3.2 * shaped * a;

  // mastering cap
  return clamp(comp, -3.5, 0);
}

/**
 * TAPE: Auto-gain compensation curve (NEW - preGainDB based)
 * 
 * Prevents tape drive from increasing perceived loudness.
 * Based on measured RMS increase: +3 to +4 dB at max drive.
 * Tape "thickens" more than transformer, so more aggressive compensation.
 * 
 * CRITICAL: This curve is keyed to the PHYSICAL signal (dB into waveshaper),
 * not the control signal (UI drive 0-2). This makes it portable and future-proof.
 * 
 * @param preGainDB - Pre-shaper gain in dB (physical signal)
 * @param genreMult - Genre multiplier (0.7-1.2, slight modifier)
 * @returns Compensation gain in dB (negative trim, capped at -4.5 dB)
 */
export function tapeCompFromPreGainDB(preGainDB: number, genreMult: number): number {
  const g = clamp(preGainDB, 0, 5);      // tape can be pushed slightly more
  const shaped = Math.pow(g / 5, 1.25);

  // subtle genre influence only (±10% max effect)
  const gm = clamp(genreMult, 0.85, 1.25);
  const genreFactor = clamp(1 + (gm - 1) * 0.35, 0.9, 1.1);

  const comp = -4.3 * shaped * genreFactor;
  return clamp(comp, -4.5, 0);
}

/**
 * TRANSFORMER: Auto-gain compensation curve (OLD - drive based)
 * 
 * DEPRECATED: Use transformerCompFromPreGainDB() instead.
 * This version is keyed to control signal (drive 0-2), not physical signal.
 * Kept for reference only.
 */
export function transformerDriveToCompDB(drive: number, satAmount: number): number {
  const d = clamp(drive, 0, 2);
  const a = clamp(satAmount, 0, 1);

  // Normalize drive into 0..1 "mastering use" region:
  // we treat d=0..1.5 as the meaningful range, beyond that is extreme
  const dn = clamp(d / 1.5, 0, 1);

  // Curve: soft start, stronger near top
  // dn^1.6 gives gentle early response, steeper later
  const shaped = Math.pow(dn, 1.6);

  // Target comp at full sat: about -3.2 dB (fits measured +2..3 dB RMS bump)
  const comp = -3.2 * shaped * a;

  // Cap for mastering sanity
  return clamp(comp, -3.5, 0);
}

/**
 * TAPE: Auto-gain compensation curve (OLD - drive based)
 * 
 * DEPRECATED: Use tapeCompFromPreGainDB() instead.
 * This version is keyed to control signal (drive 0-2), not physical signal.
 * Kept for reference only.
 */
export function tapeDriveToCompDB(drive: number, genreMult: number): number {
  const d = clamp(drive, 0, 2);

  // Normalize into 0..1 across a slightly smaller range (tape gets loud fast)
  const dn = clamp(d / 1.3, 0, 1);

  // More aggressive curve than transformer
  const shaped = Math.pow(dn, 1.35);

  // Small genre influence, capped.
  // Techno might be 1.15, trance 0.9. We only allow ±10% effect.
  const gm = clamp(genreMult, 0.85, 1.25);
  const genreFactor = clamp(1 + (gm - 1) * 0.35, 0.9, 1.1);

  const comp = -4.0 * shaped * genreFactor;

  return clamp(comp, -4.5, 0);
}

/**
 * Genre-specific compensation profiles
 * 
 * CRITICAL: Keep subtle (±10% max) to avoid genre = loudness.
 * These scale the global compensation curves.
 */
export type CompProfile = {
  transformerCompScale: number; // 0.9..1.1 (multiplier on comp curve)
  tapeCompScale: number;        // 0.9..1.1 (multiplier on comp curve)
};

export const COMP_PROFILES: Record<string, CompProfile> = {
  techno: { 
    transformerCompScale: 0.95, // Slightly denser (less comp)
    tapeCompScale: 0.92 
  },
  trance: { 
    transformerCompScale: 1.05, // Cleaner (more comp)
    tapeCompScale: 1.08 
  },
  house: { 
    transformerCompScale: 1.00, 
    tapeCompScale: 1.00 
  },
  realprog: {
    transformerCompScale: 1.03, // Clean, emotional
    tapeCompScale: 1.05
  },
  modernprog: {
    transformerCompScale: 0.98, // Aggressive
    tapeCompScale: 0.96
  },
  rnb: {
    transformerCompScale: 1.08, // Very clean
    tapeCompScale: 1.10
  },
  tape: {
    transformerCompScale: 0.90, // Maximum vintage density
    tapeCompScale: 0.88
  },
  default: { 
    transformerCompScale: 1.00, 
    tapeCompScale: 1.00 
  },
};

/**
 * Get compensation profile for genre
 */
export function getCompProfile(genreId: string): CompProfile {
  return COMP_PROFILES[genreId] || COMP_PROFILES.default;
}

/**
 * Limiter GR guardrail: Reduce max drive when limiter is working hard
 * 
 * CRITICAL: Prevents "push everything into limiter" behavior.
 * Gradual reduction (not hard ceiling) for smooth feel.
 * 
 * @param maxDrive - Base max drive ceiling (e.g., 1.6 for mastering)
 * @param limiterGR - Current limiter gain reduction in dB
 * @returns Adjusted max drive (reduced if limiter is struggling)
 */
export function limitDriveByLimiterGR(maxDrive: number, limiterGR: number): number {
  const md = Math.max(0, maxDrive);
  const gr = Math.max(0, limiterGR);

  // No reduction until 3 dB GR
  if (gr <= 3) return md;

  // Map 3..8 dB GR to 0..1
  const t = clamp((gr - 3) / 5, 0, 1);

  // Ease curve so it feels progressive
  const eased = 1 - Math.pow(t, 1.6); // 1 -> 0 as GR increases

  // At worst, allow only 55% of maxDrive (never go to zero, feels broken)
  const floor = 0.55;

  const scale = floor + (1 - floor) * eased; // from 1 down to floor
  return md * scale;
}

/**
 * Smooth parameter update (no clicks/pops)
 * 
 * Always use this instead of direct `param.value =` assignment.
 * Prevents audible clicks when updating parameters during playback.
 * 
 * @param ctx - AudioContext
 * @param param - AudioParam to update
 * @param value - Target value
 * @param timeConstant - Smoothing time constant (default: 0.05 = 50ms)
 */
export function smoothParam(
  ctx: BaseAudioContext,
  param: AudioParam,
  value: number,
  timeConstant: number = 0.05
): void {
  const t = ctx.currentTime;
  // Cancel scheduled ramps so the control feels responsive
  param.cancelScheduledValues(t);
  param.setTargetAtTime(value, t, timeConstant);
}

/**
 * Clamp value to range
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Convert dB to linear gain
 */
export function dbToLinear(db: number): number {
  return Math.pow(10, db / 20);
}

/**
 * Apply adaptive guardrails based on track analysis
 * 
 * Reduces max drive for compressed material to prevent
 * "saturation slider becomes loudness slider" issue.
 * 
 * @param baseDrive - Base drive amount
 * @param crestFactor - Track crest factor (dB)
 * @param limiterGR - Current limiter gain reduction (dB)
 * @returns Adjusted drive value with safety guardrails
 */
export function applyAdaptiveGuardrails(
  baseDrive: number,
  crestFactor?: number,
  limiterGR?: number
): number {
  let maxDrive = 2.0; // Default ceiling
  
  // Reduce max drive for compressed material (low crest factor)
  if (crestFactor !== undefined && crestFactor < 12) {
    // Material is already compressed - limit saturation
    const compressionFactor = (12 - crestFactor) / 12; // 0-1 range
    maxDrive = 2.0 - compressionFactor * 0.8; // Reduce ceiling by up to 0.8
  }
  
  // Reduce max drive if limiter is working hard
  if (limiterGR !== undefined) {
    maxDrive = limitDriveByLimiterGR(maxDrive, limiterGR);
  }
  
  return clamp(baseDrive, 0, maxDrive);
}