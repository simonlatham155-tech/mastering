/**
 * PRESET RESOLUTION
 * 
 * Single source of truth for resolving genre + export + user overrides
 * into final processing parameters.
 * 
 * CRITICAL: This is the ONLY place that should clamp/merge/resolve values.
 * Both the audio engine and tests MUST import from here.
 * 
 * WHY THIS EXISTS:
 * - Prevents "engine clamps one way, tests clamp another" bugs
 * - Ensures tests verify actual runtime behavior, not approximations
 * - Makes user overrides explicit and testable
 */

import { getGenrePreset, ENGINE_DEFAULTS, type GenrePreset } from './genre-presets';
import { getExportPreset, type ExportPresetId } from './export-presets';

/**
 * Processing plan: Final resolved values fed into DSP.
 * This is what the audio engine actually uses.
 */
export interface ProcessingPlan {
  // Genre behavior (style/sound)
  genreBehavior: {
    width: number;              // Effective width after clamping
    bassTilt: number;
    airTilt: number;
    mudCut: number;
    colorAmount: number;
    monoBassHz: number | undefined;
    useMultiband: boolean;
    useClipper: boolean;
    useMidSide: boolean;
    forceMonoBass: boolean;
    loudnessStyle: 'clean' | 'balanced' | 'aggressive';
  };
  
  // Delivery targets (where it's going)
  deliveryTargets: {
    targetLUFS: number;
    ceiling: number;
  };
  
  // Performance mode (affects width clamping)
  performanceMode: 'live' | 'studio';
  
  // Logic mode (affects limiter behavior)
  logicMode: 'brickwall' | 'dynamics';
  
  // Source info (for debugging)
  source: {
    genreId: string;
    exportPresetId: ExportPresetId;
    requestedWidth: number;      // Before clamping
    widthClamped: boolean;       // Was clamping applied?
  };
}

/**
 * User overrides (optional).
 * Allows users to tweak preset defaults without changing the preset itself.
 */
export interface UserOverrides {
  width?: number;
  bassTilt?: number;
  airTilt?: number;
  mudCut?: number;
  colorAmount?: number;
  useMultiband?: boolean;
  useClipper?: boolean;
  useMidSide?: boolean;          // Expert override (rare, architectural)
  forceMonoBass?: boolean;
  monoBassHz?: number;
  // Profile Adjustments (from UI panel)
  lowShelfBoost?: number;        // -6 to +6 dB
  midRangeAdjust?: number;       // -6 to +6 dB  
  highShelfBoost?: number;       // -6 to +6 dB
  saturationAmount?: number;     // 0 to 1.0
}

/**
 * Input to resolution function.
 */
export interface ResolutionInput {
  genreId: string;
  exportPresetId: ExportPresetId;
  performanceMode: 'live' | 'studio';
  logicMode: 'brickwall' | 'dynamics';
  userOverrides?: UserOverrides;
}

/**
 * Clamp value between min and max.
 * This is the ONLY clamp function. Engine and tests use this.
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

/**
 * Resolve processing plan from genre + export + user overrides.
 * 
 * This is the single source of truth for what values the engine uses.
 * 
 * RULES:
 * 1. Genre preset defines style/behavior defaults
 * 2. Export preset defines delivery targets ONLY
 * 3. User overrides can replace defaults (but still get clamped by guardrails)
 * 4. Performance mode affects width clamping (live is stricter)
 * 5. Export preset NEVER affects genre behavior
 * 
 * @param input - Genre, export, mode, and optional user overrides
 * @returns ProcessingPlan - Final resolved values for DSP engine
 */
export function resolveProcessingPlan(input: ResolutionInput): ProcessingPlan {
  const { genreId, exportPresetId, performanceMode, logicMode, userOverrides } = input;
  
  // Load presets
  const genrePreset = getGenrePreset(genreId);
  const exportPreset = getExportPreset(exportPresetId);
  
  if (!genrePreset) {
    throw new Error(`Genre preset not found: ${genreId}`);
  }
  
  // === GENRE BEHAVIOR (with user overrides) ===
  
  // Width: genre default + user OFFSET (user value is additive, 0 = no change)
  const requestedWidth = genrePreset.biases.width + (userOverrides?.width ?? 0);
  
  // Width clamping (performance-mode dependent)
  const maxWidth = performanceMode === 'live' 
    ? ENGINE_DEFAULTS.maxWidth_live 
    : ENGINE_DEFAULTS.maxWidth_export;
  const effectiveWidth = clamp(requestedWidth, ENGINE_DEFAULTS.minWidth, maxWidth);
  const widthClamped = effectiveWidth !== requestedWidth;
  
  // Other biases: genre default + user OFFSET (user value is additive, 0 = no change)
  const bassTilt = genrePreset.biases.bassTilt + (userOverrides?.bassTilt ?? 0);
  const airTilt = genrePreset.biases.airTilt + (userOverrides?.airTilt ?? 0);
  const mudCut = genrePreset.biases.mudCut + (userOverrides?.mudCut ?? 0);
  const colorAmount = clamp(genrePreset.biases.colorAmount + (userOverrides?.colorAmount ?? 0), 0, 1);
  const monoBassHz = userOverrides?.monoBassHz ?? genrePreset.biases.monoBassHz;
  
  // Toggles: User override OR genre default
  const requestedMultiband = userOverrides?.useMultiband ?? genrePreset.toggles.useMultiband;
  const useClipper = userOverrides?.useClipper ?? genrePreset.toggles.useClipper;
  const forceMonoBass = userOverrides?.forceMonoBass ?? genrePreset.toggles.forceMonoBass;
  
  // M/S cannot be overridden (engine architectural requirement)
  const useMidSide = userOverrides?.useMidSide ?? genrePreset.toggles.useMidSide;
  
  // === PERFORMANCE MODE RULES ===
  // Live mode disables multiband for lowest latency and club safety
  // Studio mode allows multiband for surgical frequency control
  const useMultiband = performanceMode === 'live' ? false : requestedMultiband;
  
  // === ENFORCE DEPENDENCIES (User overrides must respect invariants) ===
  
  // INVARIANT 1: forceMonoBass → useMidSide (mono-bass requires M/S processing)
  // 
  // POLICY: Auto-enable M/S when mono-bass is requested (unless user explicitly disabled M/S).
  // This prevents "I turned on mono-bass and nothing happened" UX trap.
  // 
  // Logic:
  // - If user requests forceMonoBass=true, ensure useMidSide=true
  // - Unless user explicitly set useMidSide=false (expert override wins)
  // - If user explicitly disabled M/S, mono-bass must turn off (invalid state)
  
  let finalUseMidSide = useMidSide;
  let finalForceMonoBass = forceMonoBass;
  
  // Check if user explicitly disabled M/S (rare, but must respect expert intent)
  const userExplicitlyDisabledMidSide = userOverrides?.useMidSide === false;
  
  if (forceMonoBass && !useMidSide) {
    if (userExplicitlyDisabledMidSide) {
      // User explicitly disabled M/S → mono-bass must turn off (invalid state)
      if (import.meta.env.DEV) {
        console.warn(
          `⚠️ Dependency violation: forceMonoBass=true requires useMidSide=true. ` +
          `User explicitly disabled M/S. Disabling forceMonoBass to prevent broken state.`
        );
      }
      finalForceMonoBass = false;
    } else {
      // User didn't disable M/S → auto-enable it for mono-bass (better UX)
      if (import.meta.env.DEV) {
        console.warn(
          `⚠️ Auto-enabling M/S: forceMonoBass=true requires useMidSide=true. ` +
          `Genre preset \"${genreId}\" has useMidSide=false. Enabling M/S for mono-bass.`
        );
      }
      finalUseMidSide = true;  // Auto-enable dependency
    }
  }
  
  // INVARIANT 2: !useMidSide → !forceMonoBass (if M/S is off, mono-bass must be off)
  if (!finalUseMidSide && finalForceMonoBass) {
    finalForceMonoBass = false;  // Safety catch (should be covered above)
  }
  
  // Loudness style (no override - this is genre identity)
  const loudnessStyle = genrePreset.loudnessStyle;
  
  // === DELIVERY TARGETS (from export preset, NEVER overridden) ===
  
  const targetLUFS = exportPreset.lufs;
  const ceiling = exportPreset.ceiling;
  
  // === BUILD PLAN ===
  
  return {
    genreBehavior: {
      width: effectiveWidth,
      bassTilt,
      airTilt,
      mudCut,
      colorAmount,
      monoBassHz,
      useMultiband,
      useClipper,
      useMidSide: finalUseMidSide,
      forceMonoBass: finalForceMonoBass,
      loudnessStyle
    },
    deliveryTargets: {
      targetLUFS,
      ceiling
    },
    performanceMode,
    logicMode,
    source: {
      genreId,
      exportPresetId,
      requestedWidth,
      widthClamped
    }
  };
}

/**
 * Resolve width only (convenience helper for tests).
 * 
 * @param genreId - Genre preset ID
 * @param performanceMode - 'live' or 'studio'
 * @param userWidth - Optional user override
 * @returns Effective width after clamping
 */
export function resolveWidth(
  genreId: string, 
  performanceMode: 'live' | 'studio',
  userWidth?: number
): number {
  const genrePreset = getGenrePreset(genreId);
  if (!genrePreset) {
    throw new Error(`Genre preset not found: ${genreId}`);
  }
  
  const requestedWidth = userWidth ?? genrePreset.biases.width;
  const maxWidth = performanceMode === 'live' 
    ? ENGINE_DEFAULTS.maxWidth_live 
    : ENGINE_DEFAULTS.maxWidth_export;
  
  return clamp(requestedWidth, ENGINE_DEFAULTS.minWidth, maxWidth);
}