/**
 * QUALITY PROFILES
 * ================
 * 
 * Preview: ~2-3x faster (not 5x - we need accurate sound)
 * - Keeps: ALL stages (for accurate preview)
 * - Optimizes: Compressor uses peak detection (faster than RMS)
 * - Optimizes: Limiter uses 1x oversampling (future: separate build)
 * - Truncates: First 30 seconds only (major speed gain)
 * - Use for: real-time tweaking, decision-making
 * 
 * Export: Full quality
 * - Runs: full 6-stage chain on entire file
 * - Compressor: RMS detection, soft knee, 5ms look-ahead
 * - Limiter: 4x oversampling
 * - Use for: final render only
 */

export type QualityMode = 'preview' | 'export';

export interface CompressorQuality {
  quality: QualityMode;
  detectionMode: 'peak' | 'rms';
  knee: number; // dB
  lookAhead: number; // seconds
  meteringEnabled: boolean;
}

export interface LimiterQuality {
  quality: QualityMode;
  oversample: number; // 1x or 4x
  ceiling: number; // dBTP
}

export interface ChainQuality {
  saturator: boolean; // Transformer + Tape
  multiband: boolean;
  midside: boolean;
}

export interface QualityProfile {
  compressor: CompressorQuality;
  limiter: LimiterQuality;
  chain: ChainQuality;
}

export const QUALITY_PROFILES: Record<QualityMode, QualityProfile> = {
  preview: {
    compressor: {
      quality: 'preview',
      detectionMode: 'peak',        // Faster than RMS (worklet enforces this)
      knee: 0,                      // Hard knee (worklet enforces this)
      lookAhead: 0,                 // No look-ahead (worklet enforces this)
      meteringEnabled: false,       // Disable postMessage during offline render
    },
    limiter: {
      quality: 'preview',
      oversample: 1,                // Future: use limiter_preview.wasm (no OS)
      ceiling: -1.0,                // From export preset
    },
    chain: {
      saturator: true,              // ✅ KEEP: Core analog character
      multiband: true,              // ✅ KEEP: Genre-specific EQ (critical)
      midside: true,                // ✅ KEEP: Stereo width (critical)
    },
  },
  export: {
    compressor: {
      quality: 'export',
      detectionMode: 'rms',         // Full RMS averaging
      knee: 6,                      // Soft knee polynomial interpolation
      lookAhead: 0.005,             // 5ms look-ahead buffer
      meteringEnabled: false,       // Disable during offline render
    },
    limiter: {
      quality: 'export',
      oversample: 4,                // Future: use limiter_export.wasm (4x OS)
      ceiling: -1.0,                // From export preset
    },
    chain: {
      saturator: true,              // Run transformer + tape (full analog chain)
      multiband: true,              // Run multiband (controlled by genre preset)
      midside: true,                // Run M/S (controlled by genre preset)
    },
  },
};

/**
 * Get quality profile by mode
 */
export function getQualityProfile(mode: QualityMode): QualityProfile {
  return QUALITY_PROFILES[mode];
}