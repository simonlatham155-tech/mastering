/**
 * MASTERING SOURCE ANALYSIS SNAPSHOT
 * ==================================
 *
 * Stores the most recent pre-master measurements for the current browser session.
 * This is deliberately measurement-only: no genre or DSP decisions live here.
 *
 * The processing-context layer reads this snapshot whenever it resolves a genre,
 * so changing genre after analysis recalculates source -> target deltas instead of
 * reusing a fixed EQ recipe.
 */

import type { SourceTargetAnalysis } from '../data/genre-target-space';

export interface MasteringSourceAnalysis extends SourceTargetAnalysis {
  /** Integrated LUFS when the upload analyser has measured it. */
  lufs?: number;
  /** True peak when available, useful for later delivery guardrails. */
  truePeak?: number;
}

let latestSourceAnalysis: MasteringSourceAnalysis | null = null;

export function setMasteringSourceAnalysis(
  analysis: SourceTargetAnalysis & { lufs?: number; truePeak?: number }
): void {
  latestSourceAnalysis = {
    spectralBalance: {
      bass: analysis.spectralBalance.bass,
      mids: analysis.spectralBalance.mids,
      highs: analysis.spectralBalance.highs,
    },
    dynamicRange: analysis.dynamicRange,
    lufs: Number.isFinite(analysis.lufs) ? analysis.lufs : undefined,
    truePeak: Number.isFinite(analysis.truePeak) ? analysis.truePeak : undefined,
  };
}

export function getMasteringSourceAnalysis(): MasteringSourceAnalysis | null {
  return latestSourceAnalysis;
}

export function clearMasteringSourceAnalysis(): void {
  latestSourceAnalysis = null;
}
