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
  preLimiterDriveDB: number;
  remainingLU: number;
  maxDriveDB: number;
  targetReachableByDrive: boolean;
  rationale: string;
}

const FLOW_MAX_DRIVE_DB: Record<string, number> = {
  clean: 3.0,
  balanced: 4.5,
  aggressive: 5.0,
};

/**
 * Decide how much level is deliberately developed before / through the limiter.
 *
 * This is intentionally NOT a promise that LUFS will move 1:1 after limiting;
 * the export measurement loop remains the authority. The purpose here is to
 * stop post-limiter output trim being asked to create the master.
 *
 * Flow mode gets enough drive to make a normal premaster sound finished, but
 * will not chase an extreme target indefinitely. Pressure can drive harder.
 */
export function resolveLoudnessDrive(input: LoudnessDriveInput): LoudnessDrivePlan {
  const inputLUFS = finiteDB(input.inputLUFS ?? -16, -16);
  const targetLUFS = finiteDB(input.targetLUFS, -14);
  const requiredGainDB = targetLUFS - inputLUFS;
  const isBrickwall = input.logicMode === 'brickwall';

  const maxDriveDB = isBrickwall
    ? 8
    : FLOW_MAX_DRIVE_DB[input.style] ?? FLOW_MAX_DRIVE_DB.balanced;

  // If the source is already louder than target, attenuation is safe and does
  // not consume limiter headroom. Keep the same -6 dB lower guard as before.
  const preLimiterDriveDB = requiredGainDB <= 0
    ? Math.max(-6, requiredGainDB)
    : Math.min(requiredGainDB, maxDriveDB);

  const remainingLU = Math.max(0, requiredGainDB - preLimiterDriveDB);
  const targetReachableByDrive = remainingLU <= 0.05;

  const rationale = requiredGainDB <= 0
    ? 'Source is already at/above the requested loudness; attenuate before ceiling control.'
    : targetReachableByDrive
      ? 'Develop requested loudness before/through the limiter; reserve output trim for calibration.'
      : 'Stop at the transparent drive guardrail; measurement may report a best-result loudness miss.';

  return {
    inputLUFS,
    targetLUFS,
    requiredGainDB,
    preLimiterDriveDB,
    remainingLU,
    maxDriveDB,
    targetReachableByDrive,
    rationale,
  };
}
