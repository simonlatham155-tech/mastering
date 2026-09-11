/**
 * GENRE TARGET SPACE
 * ==================
 *
 * Methodology change:
 * Genre is the sonic destination, not a fixed EQ preset.
 *
 * These ranges are initial engineering priors, not corpus-derived claims.
 * They define broad target envelopes that can be refined later from a
 * curated reference library (for example, contemporary ASOT trance masters).
 *
 * IMPORTANT:
 * - Never apply the target values directly as EQ boosts/cuts.
 * - Measure the incoming track first.
 * - Calculate the delta from source -> target.
 * - Apply only the correction required, with deadbands and guardrails.
 * - Re-measure the complete chain after processing.
 */

export interface GenreTargetBand {
  min: number;
  max: number;
}

export interface GenreTargetSpace {
  id: string;
  /** Broad spectral energy proportions from the current analyser. */
  spectral: {
    bassPct: GenreTargetBand;
    midsPct: GenreTargetBand;
    highsPct: GenreTargetBand;
  };
  /** Desired crest/dynamic range region, used as guidance rather than a hard target. */
  dynamicRangeDB: GenreTargetBand;
  /** Character guidance only. This is not an automatic processing amount. */
  character: {
    lowEnd: 'tight' | 'warm' | 'heavy' | 'balanced';
    topEnd: 'dark' | 'smooth' | 'open' | 'bright';
    width: 'focused' | 'balanced' | 'wide';
    density: 'open' | 'moderate' | 'dense';
  };
  evidence: 'engineering-prior';
}

const target = (
  id: string,
  bass: [number, number],
  mids: [number, number],
  highs: [number, number],
  dr: [number, number],
  character: GenreTargetSpace['character']
): GenreTargetSpace => ({
  id,
  spectral: {
    bassPct: { min: bass[0], max: bass[1] },
    midsPct: { min: mids[0], max: mids[1] },
    highsPct: { min: highs[0], max: highs[1] },
  },
  dynamicRangeDB: { min: dr[0], max: dr[1] },
  character,
  evidence: 'engineering-prior',
});

/**
 * Initial target envelopes. These are intentionally broad because the current
 * analyser exposes only three very wide spectral bands. A future reference
 * engine should replace these priors with measured distributions.
 */
export const GENRE_TARGET_SPACES: Record<string, GenreTargetSpace> = {
  trance: target('trance', [30, 39], [31, 40], [27, 36], [6.5, 10.5], {
    lowEnd: 'tight', topEnd: 'bright', width: 'wide', density: 'dense',
  }),
  uplifting: target('uplifting', [29, 38], [31, 40], [29, 38], [7, 11], {
    lowEnd: 'tight', topEnd: 'bright', width: 'wide', density: 'moderate',
  }),
  psytrance: target('psytrance', [34, 44], [31, 40], [23, 32], [5.5, 9], {
    lowEnd: 'heavy', topEnd: 'bright', width: 'focused', density: 'dense',
  }),
  progressivehouse: target('progressivehouse', [31, 40], [33, 42], [24, 33], [7, 11], {
    lowEnd: 'tight', topEnd: 'open', width: 'wide', density: 'moderate',
  }),
  house: target('house', [32, 41], [34, 43], [22, 31], [7, 11.5], {
    lowEnd: 'balanced', topEnd: 'open', width: 'balanced', density: 'moderate',
  }),
  deephouse: target('deephouse', [34, 44], [36, 45], [17, 26], [8, 12.5], {
    lowEnd: 'warm', topEnd: 'smooth', width: 'wide', density: 'open',
  }),
  techhouse: target('techhouse', [35, 44], [35, 44], [19, 28], [6.5, 10], {
    lowEnd: 'tight', topEnd: 'open', width: 'focused', density: 'dense',
  }),
  techno: target('techno', [36, 46], [35, 44], [17, 26], [5.5, 9], {
    lowEnd: 'heavy', topEnd: 'dark', width: 'focused', density: 'dense',
  }),
  melodictechno: target('melodictechno', [33, 42], [34, 43], [22, 31], [6.5, 10.5], {
    lowEnd: 'tight', topEnd: 'open', width: 'wide', density: 'moderate',
  }),
  hardtechno: target('hardtechno', [38, 48], [34, 43], [15, 24], [4.5, 8], {
    lowEnd: 'heavy', topEnd: 'dark', width: 'focused', density: 'dense',
  }),
  dnb: target('dnb', [38, 49], [31, 40], [18, 27], [5.5, 9], {
    lowEnd: 'heavy', topEnd: 'bright', width: 'focused', density: 'dense',
  }),
  dubstep: target('dubstep', [40, 52], [31, 41], [15, 24], [5, 8.5], {
    lowEnd: 'heavy', topEnd: 'open', width: 'focused', density: 'dense',
  }),
  trap: target('trap', [41, 54], [30, 40], [13, 23], [5.5, 9], {
    lowEnd: 'heavy', topEnd: 'open', width: 'focused', density: 'dense',
  }),
  futurebass: target('futurebass', [31, 40], [31, 40], [27, 37], [6, 10], {
    lowEnd: 'tight', topEnd: 'bright', width: 'wide', density: 'dense',
  }),
  hardstyle: target('hardstyle', [38, 49], [32, 41], [17, 26], [4.5, 8], {
    lowEnd: 'heavy', topEnd: 'bright', width: 'focused', density: 'dense',
  }),
  hardcore: target('hardcore', [39, 50], [32, 41], [16, 25], [4, 7.5], {
    lowEnd: 'heavy', topEnd: 'bright', width: 'focused', density: 'dense',
  }),
  ukgarage: target('ukgarage', [34, 44], [34, 43], [20, 29], [7, 11], {
    lowEnd: 'tight', topEnd: 'open', width: 'balanced', density: 'moderate',
  }),
  breakbeat: target('breakbeat', [32, 42], [35, 45], [19, 28], [7, 11.5], {
    lowEnd: 'balanced', topEnd: 'open', width: 'balanced', density: 'moderate',
  }),
  rnb: target('rnb', [34, 44], [38, 48], [14, 24], [8, 13], {
    lowEnd: 'warm', topEnd: 'smooth', width: 'balanced', density: 'open',
  }),
  tape: target('tape', [32, 43], [39, 49], [13, 23], [10, 16], {
    lowEnd: 'warm', topEnd: 'smooth', width: 'balanced', density: 'open',
  }),
  generic: target('generic', [32, 42], [34, 44], [20, 30], [7, 12], {
    lowEnd: 'balanced', topEnd: 'open', width: 'balanced', density: 'moderate',
  }),
};

export interface SourceTargetAnalysis {
  spectralBalance: {
    bass: number;
    mids: number;
    highs: number;
  };
  dynamicRange: number;
}

export interface GenreCorrectionDelta {
  genreId: string;
  /** Suggested low-shelf correction in dB. */
  bassTiltDB: number;
  /** Suggested high-shelf correction in dB. */
  airTiltDB: number;
  /** Current analyser cannot isolate 250 Hz reliably, so this remains neutral. */
  mudCutDB: number;
  /** Width cannot be inferred from the current mono spectral analyser. */
  widthOffset: number;
  /** Positive = source is more dynamic than target centre; negative = denser. */
  dynamicRangeDeltaDB: number;
  withinTarget: {
    bass: boolean;
    mids: boolean;
    highs: boolean;
    dynamicRange: boolean;
  };
  confidence: 'low' | 'medium';
  limitations: string[];
}

const midpoint = (band: GenreTargetBand): number => (band.min + band.max) / 2;
const inBand = (value: number, band: GenreTargetBand): boolean => value >= band.min && value <= band.max;
const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

/**
 * Convert a source-vs-target energy ratio into a conservative EQ suggestion.
 * Uses 10*log10 because the analyser values represent broad energy proportions.
 */
function correctionFromEnergyPct(sourcePct: number, targetBand: GenreTargetBand): number {
  if (!Number.isFinite(sourcePct) || sourcePct <= 0 || inBand(sourcePct, targetBand)) return 0;
  const targetPct = sourcePct < targetBand.min ? targetBand.min : targetBand.max;
  const rawDB = 10 * Math.log10(targetPct / sourcePct);
  // Genre correction should steer, not redesign the mix in one move.
  return Math.round(clamp(rawDB, -3, 3) * 10) / 10;
}

/**
 * Calculate only the correction required to move the measured source toward the
 * selected genre envelope. This is deliberately source-relative: if the source
 * already fits the target, the suggested move is zero.
 */
export function calculateGenreCorrection(
  genreId: string,
  analysis: SourceTargetAnalysis
): GenreCorrectionDelta {
  const targetSpace = GENRE_TARGET_SPACES[genreId] ?? GENRE_TARGET_SPACES.generic;
  const bassTiltDB = correctionFromEnergyPct(analysis.spectralBalance.bass, targetSpace.spectral.bassPct);
  const airTiltDB = correctionFromEnergyPct(analysis.spectralBalance.highs, targetSpace.spectral.highsPct);
  const drCentre = midpoint(targetSpace.dynamicRangeDB);

  return {
    genreId: targetSpace.id,
    bassTiltDB,
    airTiltDB,
    mudCutDB: 0,
    widthOffset: 0,
    dynamicRangeDeltaDB: Math.round((analysis.dynamicRange - drCentre) * 10) / 10,
    withinTarget: {
      bass: inBand(analysis.spectralBalance.bass, targetSpace.spectral.bassPct),
      mids: inBand(analysis.spectralBalance.mids, targetSpace.spectral.midsPct),
      highs: inBand(analysis.spectralBalance.highs, targetSpace.spectral.highsPct),
      dynamicRange: inBand(analysis.dynamicRange, targetSpace.dynamicRangeDB),
    },
    confidence: 'medium',
    limitations: [
      'Target envelopes are initial engineering priors, not yet measured from a curated reference corpus.',
      'Current analyser has only bass/mids/highs bands, so it cannot justify a dedicated 250 Hz mud correction.',
      'Current analyser does not measure stereo width by frequency, so width correction remains neutral.',
    ],
  };
}
