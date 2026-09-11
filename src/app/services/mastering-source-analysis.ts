/**
 * MASTERING SOURCE ANALYSIS SNAPSHOT
 * ==================================
 *
 * Stores the most recent pre-master measurements for the current browser session.
 * This is deliberately small and measurement-only: no genre or DSP decisions live here.
 *
 * The processing-context layer reads this snapshot whenever it resolves a genre,
 * so changing genre after analysis recalculates source -> target deltas instead of
 * reusing a fixed EQ recipe.
 */

import type { SourceTargetAnalysis } from '../data/genre-target-space';

let latestSourceAnalysis: SourceTargetAnalysis | null = null;

export function setMasteringSourceAnalysis(analysis: SourceTargetAnalysis): void {
  latestSourceAnalysis = {
    spectralBalance: {
      bass: analysis.spectralBalance.bass,
      mids: analysis.spectralBalance.mids,
      highs: analysis.spectralBalance.highs,
    },
    dynamicRange: analysis.dynamicRange,
  };
}

export function getMasteringSourceAnalysis(): SourceTargetAnalysis | null {
  return latestSourceAnalysis;
}

export function clearMasteringSourceAnalysis(): void {
  latestSourceAnalysis = null;
}
