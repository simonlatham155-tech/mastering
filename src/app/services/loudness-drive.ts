import { finiteDB } from '../utils/finite-audio';

export type LoudnessDriveStyle = 'aggressive' | 'balanced' | 'clean' | string;

export interface LoudnessDriveInput {
  inputLUFS?: number;
  targetLUFS: number;
  style: LoudnessDriveStyle;
  logicMode: 'dynamics' | 'brickwall' | string;
}

export interface LoudnessDrivePlan {
  inputLUFS: number;
  targetLUFS: number;
  requiredGainDB: number;
  /** Extra upstream gain required in addition to the limiter's existing allowance. */
  preLimiterDriveDB: number;
  /** Existing Stage-6 makeup expected to contribute. */
  limiterMakeupAllowanceDB: number;
  /** Combined planned level development before output calibration. */
  totalPlannedDriveDB: number;
  remainingLU: number;
  /** Maximum combined transparent drive for this mode/style. */
  maxDriveDB: number;
  targetReachableByDrive: boolean;
  rationale: string;
}

const FLOW_MAX_TOTAL_DRIVE_DB: Record<string, number> = {
  clean: 3.0,
  balanced: 4.5,
  aggressive: 5.0,
};

/**
 * Transitional loudness policy for the current chain.
 *
 * Stage 6 still owns a small amount of makeup gain: Flow up to +1 dB and
 * Pressure up to +8 dB. Therefore this function supplies ONLY the missing
 * upstream drive. That prevents the new mastering drive from being counted
 * twice while moving loudness creation away from post-limiter output trim.
 *
 * The values here are engineering guardrails, not claims that LUFS follows gain
 * 1:1 after nonlinear processing. The rendered export measurement remains the
 * delivery authority. If the measured master still misses target, QC reports a
 * transparent loudness-limited result instead of forcing more gain.
 *
 * Once Stage 6 is redesigned to accept an explicit drive plan, the two values
 * can be collapsed into one pre-limiter control without changing this policy.
 */
export function resolveLoudnessDrive(input: LoudnessDriveInput): LoudnessDrivePlan {
  const inputLUFS = finiteDB(input.inputLUFS ?? -16, -16);
  const targetLUFS = finiteDB(input.targetLUFS, -14);
  const requiredGainDB = targetLUFS - inputLUFS;
  const isBrickwall = input.logicMode === 'brickwall';

  const maxDriveDB = isBrickwall
    ? 8
    : FLOW_MAX_TOTAL_DRIVE_DB[input.style] ?? FLOW_MAX_TOTAL_DRIVE_DB.balanced;

  // The legacy Stage-6 implementation already attenuates when source is above
  // target, so do not duplicate that attenuation upstream.
  if (requiredGainDB <= 0) {
    const limiterMakeupAllowanceDB = Math.max(-6, requiredGainDB);
    return {
      inputLUFS,
      targetLUFS,
      requiredGainDB,
      preLimiterDriveDB: 0,
      limiterMakeupAllowanceDB,
      totalPlannedDriveDB: limiterMakeupAllowanceDB,
      remainingLU: 0,
      maxDriveDB,
      targetReachableByDrive: true,
      rationale: 'Source is already at/above target; Stage 6 handles the required attenuation without duplicate upstream trim.',
    };
  }

  const limiterMakeupAllowanceDB = isBrickwall
    ? Math.min(requiredGainDB, 8)
    : Math.min(requiredGainDB, 1);

  const allowedCombinedDriveDB = Math.min(requiredGainDB, maxDriveDB);
  const preLimiterDriveDB = Math.max(
    0,
    allowedCombinedDriveDB - limiterMakeupAllowanceDB
  );
  const totalPlannedDriveDB = preLimiterDriveDB + limiterMakeupAllowanceDB;
  const remainingLU = Math.max(0, requiredGainDB - totalPlannedDriveDB);
  const targetReachableByDrive = remainingLU <= 0.05;

  const rationale = targetReachableByDrive
    ? 'Develop the required level upstream plus the existing Stage-6 allowance; reserve output trim for final calibration.'
    : 'Stop at the transparent combined-drive guardrail; delivery QC may report a best-result loudness miss.';

  return {
    inputLUFS,
    targetLUFS,
    requiredGainDB,
    preLimiterDriveDB,
    limiterMakeupAllowanceDB,
    totalPlannedDriveDB,
    remainingLU,
    maxDriveDB,
    targetReachableByDrive,
    rationale,
  };
}
