/**
 * GENRE PRESETS
 * 
 * Style and feel only. No delivery targets.
 * Answer: "How should this genre sound?"
 * 
 * RULES:
 * - No targetLUFS (comes from export preset)
 * - No fantasy maxWidth values (engine clamps: 1.05 live, 1.15 export)
 * - No per-stage attack/ratio unless engine uses them directly
 * - Biases are gentle steering, not hard values
 */

export type LoudnessStyle = 'aggressive' | 'balanced' | 'clean';

// THD Control Mode - renamed from "brickwall/dynamics" to "pressure/flow"
export type THDMode = 'flow' | 'pressure';

export interface GenrePreset {
  // Identity
  id: string;
  name: string;
  category: string;
  description: string;
  
  // Biases (gentle steering within clamps)
  biases: {
    bassTilt: number;       // -3 to +3 dB @ 100Hz low shelf
    airTilt: number;        // -3 to +3 dB @ 10kHz high shelf
    mudCut: number;         // 0 to -6 dB @ 250Hz bell cut
    width: number;          // 0.9 to 1.15 (engine clamps: 1.05 live, 1.15 export)
    colorAmount: number;    // 0.0 (clean) to 1.0 (saturated)
    monoBassHz?: number;    // Optional: Side HPF cutoff (default: 120Hz if forceMonoBass enabled)
  };
  
  // Loudness style (determines compression behavior)
  loudnessStyle: LoudnessStyle;
  
  // THD Control default (user can override)
  // 'flow': Harmonics follow musical dynamics (expressive, breathing)
  // 'pressure': Harmonics held constant (impact, density)
  thdMode: THDMode;
  
  // Capability toggles
  toggles: {
    useMultiband: boolean;  // Enable multiband compression
    useClipper: boolean;    // Enable clipper stage
    useMidSide: boolean;    // Enable M/S processing
    forceMonoBass: boolean; // Enable Side HPF (sub-mono rule for club/festival compatibility)
  };
  
  // Guardrails (optional overrides, must be stricter than engine defaults)
  guardrails?: {
    maxEQBoost?: number;      // Max EQ boost in dB (default: +6)
    maxEQCut?: number;        // Max EQ cut in dB (default: -6)
    maxClipperGR?: number;    // Max clipper GR in dB (default: 3)
    maxLimiterGR?: number;    // Max limiter GR in dB (default: 6 dynamics, 8 brickwall)
    maxWidth?: number;        // Max stereo width (default: 1.05 live, 1.15 export)
    maxTotalGain?: number;    // Max input-to-output gain in dB (default: +12)
  };
}

// ==================== ENGINE DEFAULTS ====================
// These are the fallback values if guardrails are not specified
// minWidth is an engine invariant (not overridable by presets)

export const ENGINE_DEFAULTS = {
  maxEQBoost: 6,
  maxEQCut: -6,
  maxClipperGR: 3,
  maxLimiterGR_dynamics: 6,
  maxLimiterGR_brickwall: 8,
  maxWidth_live: 1.05,
  maxWidth_export: 1.15,
  minWidth: 0.9,      // Safety rail - preserves mono compatibility
  maxTotalGain: 12
} as const;

// ==================== GENRE PRESETS ====================

export const DNB: GenrePreset = {
  id: 'dnb',
  name: 'Drum & Bass',
  category: 'Bass Music',
  description: 'Sub-bass focus, crisp breaks, tight dynamics',
  
  biases: {
    bassTilt: +3,    // Emphasize sub
    airTilt: +2,     // Crisp highs
    mudCut: -3,      // Clear low-mids
    width: 0.93,     // Tight center impact (mono bass via Side HPF @ 120Hz)
    colorAmount: 0.6 // Moderate saturation
  },
  
  loudnessStyle: 'aggressive',
  
  thdMode: 'pressure',
  
  toggles: {
    useMultiband: true,  // Control sub variance
    useClipper: true,    // Add aggression
    useMidSide: true,    // Width control + mono sub
    forceMonoBass: true  // Mono bass rule for club/festival compatibility
  }
  
  // No guardrail overrides - use engine defaults
};

/** One-size-fits-all chain for A/B demo — mimics generic automated mastering services */
export const GENERIC_BLACKBOX: GenrePreset = {
  id: 'generic',
  name: 'Generic Black Box',
  category: 'Demo',
  description: 'Smile-curve EQ, brickwall limit, no genre intelligence',

  biases: {
    bassTilt: +1.5,
    airTilt: +2,
    mudCut: 0,
    width: 1.02,
    colorAmount: 0.35,
  },

  loudnessStyle: 'balanced',
  thdMode: 'pressure',

  toggles: {
    useMultiband: false,
    useClipper: true,
    useMidSide: false,
    forceMonoBass: true,
  },

  guardrails: {
    maxLimiterGR: 8,
  },
};

export const DEEP_HOUSE: GenrePreset = {
  id: 'deephouse',
  name: 'Deep House',
  category: 'House',
  description: 'Warm low-end, spacious mids, gentle compression',
  
  biases: {
    bassTilt: +1,    // Warm bass
    airTilt: -2,     // Rolled-off highs (vintage)
    mudCut: -1,      // Slight clarity
    width: 1.06,     // Lush space (wider than house, not trance-wide)
    colorAmount: 0.8 // Heavy tape saturation
  },
  
  loudnessStyle: 'clean',
  
  thdMode: 'flow',
  
  toggles: {
    useMultiband: false, // Preserve dynamics
    useClipper: false,   // No aggression
    useMidSide: true,    // Wide pads
    forceMonoBass: false // Allow low-mid width for warmth
  },
  
  guardrails: {
    maxLimiterGR: 3,  // Tighter than default (preserve dynamics)
    maxEQBoost: 3     // Gentler tonal shaping
  }
};

export const TECH_HOUSE: GenrePreset = {
  id: 'techhouse',
  name: 'Tech House',
  category: 'House',
  description: 'Tight kicks, mid punch, controlled bass',
  
  biases: {
    bassTilt: +2,
    airTilt: +1.5,
    mudCut: -2,
    width: 0.9,      // Tight and focused
    colorAmount: 0.5,
    monoBassHz: 100  // Lower cutoff for groove
  },
  
  loudnessStyle: 'balanced',
  
  thdMode: 'pressure',
  
  toggles: {
    useMultiband: true,
    useClipper: false,
    useMidSide: true,
    forceMonoBass: true  // Tight club-ready bass
  }
};

export const PROGRESSIVE_HOUSE: GenrePreset = {
  id: 'progressivehouse',
  name: 'Progressive House',
  category: 'House',
  description: 'Emotional builds, open soundstage, club-safe bass',
  
  biases: {
    bassTilt: +2,
    airTilt: +2,
    mudCut: -2,
    width: 1.04,         // Open and stable (wider than house, grounded vs trance)
    colorAmount: 0.45,
    monoBassHz: 100      // Tight bass without choking low-mids
  },
  
  loudnessStyle: 'balanced',
  
  thdMode: 'pressure',
  
  toggles: {
    useMultiband: false, // Clean prog doesn't need surgical fixes
    useClipper: true,    // Add energy/lift without smashing dynamics
    useMidSide: true,
    forceMonoBass: true  // Prevent unison/chorused basslines from club flab
  }
};

export const REALPROG: GenrePreset = {
  id: 'realprog',
  name: 'Real Prog',
  category: 'House',
  description: '90s progressive house - groove over loudness, vinyl-era dynamics',
  
  biases: {
    bassTilt: +1,       // Restrained (kick/bass already do the work)
    airTilt: +1,        // Gentle (no hyped top end in this era)
    mudCut: -1,         // Clears vinyl-era congestion without hollowing
    width: 1.02,        // Wider than Classic House (1.01), narrower than modern Prog (1.04)
    colorAmount: 0.35,  // Console glue, not tape saturation
    monoBassHz: 100     // Bass warmth without choking low-mids
  },
  
  loudnessStyle: 'balanced',
  
  thdMode: 'flow',
  
  toggles: {
    useMultiband: false, // Disciplined mixes don't need rescue
    useClipper: false,   // Groove > loudness (clipper kills transient shape)
    useMidSide: true,
    forceMonoBass: true  // Sub centered (club/vinyl standard)
  }
};

export const TECHNO: GenrePreset = {
  id: 'techno',
  name: 'Techno',
  category: 'Techno',
  description: 'Dark/heavy, aggressive limiting, maximum impact',
  
  biases: {
    bassTilt: +3,
    airTilt: 0,
    mudCut: -4,      // Aggressive mud cut
    width: 0.92,     // Controlled forward punch (tighter than previous)
    colorAmount: 0.5
  },
  
  loudnessStyle: 'aggressive',
  
  thdMode: 'pressure',
  
  toggles: {
    useMultiband: true,
    useClipper: true,
    useMidSide: true,
    forceMonoBass: true  // Club standard - mono bass @ 120Hz
  }
};

export const MELODIC_TECHNO: GenrePreset = {
  id: 'melodictechno',
  name: 'Melodic Techno',
  category: 'Techno',
  description: 'Atmospheric, warm pads, emotional depth',
  
  biases: {
    bassTilt: +2,
    airTilt: +1.5,
    mudCut: -2,
    width: 1.05,
    colorAmount: 0.45,
    monoBassHz: 100    // Lower cutoff for atmospheric low-mids
  },
  
  loudnessStyle: 'balanced',
  
  thdMode: 'pressure',
  
  toggles: {
    useMultiband: false, // Let glue + clipper do the work (clean by default)
    useClipper: false,
    useMidSide: true,
    forceMonoBass: true   // Club safety - mono bass but lower cutoff
  }
};

export const HARD_TECHNO: GenrePreset = {
  id: 'hardtechno',
  name: 'Hard Techno',
  category: 'Techno',
  description: 'Industrial, brutal kicks, extreme limiting',
  
  biases: {
    bassTilt: +3,
    airTilt: 0,
    mudCut: -4,
    width: 0.9,      // Focused power
    colorAmount: 0.7
  },
  
  loudnessStyle: 'aggressive',
  
  thdMode: 'pressure',
  
  toggles: {
    useMultiband: true,
    useClipper: true,
    useMidSide: true,
    forceMonoBass: true  // Brutal mono kick dominance
  }
};

export const TRANCE: GenrePreset = {
  id: 'trance',
  name: 'Uplifting Trance',
  category: 'Trance',
  description: 'High energy, bright highs, punchy kicks',
  
  biases: {
    bassTilt: +1,
    airTilt: +3,     // Bright supersaws
    mudCut: -2,
    width: 1.12,     // Huge soundstage (trance is built for width)
    colorAmount: 0.3,
    monoBassHz: 100  // Lower cutoff preserves width while ensuring club safety
  },
  
  loudnessStyle: 'balanced',
  
  thdMode: 'pressure',
  
  toggles: {
    useMultiband: false, // Preserve bright supersaws and stereo motion (may be auto-enabled for club/extreme exports)
    useClipper: false,
    useMidSide: true,
    forceMonoBass: true  // Club safety while preserving trance width aesthetic
  }
};

export const PSY_TRANCE: GenrePreset = {
  id: 'psytrance',
  name: 'Psytrance',
  category: 'Trance',
  description: 'Driving bass, psychedelic highs, relentless energy',
  
  biases: {
    bassTilt: +3,
    airTilt: +2.5,
    mudCut: -2,
    width: 0.9,
    colorAmount: 0.6
  },
  
  loudnessStyle: 'aggressive',
  
  thdMode: 'pressure',
  
  toggles: {
    useMultiband: false, // Preserve psychedelic motion and rolling bass character (may be auto-enabled for extreme exports)
    useClipper: true,
    useMidSide: true,
    forceMonoBass: false  // Psytrance rolling bass prefers no HPF
  }
};

export const PROGRESSIVE_TRANCE: GenrePreset = {
  id: 'uplifting',
  name: 'Progressive Trance',
  category: 'Trance',
  description: 'Emotional builds, wide soundstage, euphoric',
  
  biases: {
    bassTilt: +2,
    airTilt: +2.5,
    mudCut: -1,
    width: 1.12,     // Huge soundstage (same as trance)
    colorAmount: 0.4,
    monoBassHz: 100  // Lower cutoff preserves width while ensuring club safety
  },
  
  loudnessStyle: 'balanced',
  
  thdMode: 'pressure',
  
  toggles: {
    useMultiband: false, // Preserve wide stereo and emotional dynamics (may be auto-enabled for club/extreme exports)
    useClipper: false,
    useMidSide: true,
    forceMonoBass: true  // Club safety while preserving prog trance width
  }
};

export const DUBSTEP: GenrePreset = {
  id: 'dubstep',
  name: 'Dubstep',
  category: 'Bass Music',
  description: 'Massive sub-bass, aggressive mids, wobble clarity',
  
  biases: {
    bassTilt: +3,
    airTilt: +1.5,
    mudCut: -2,
    width: 0.9,      // Tight bass focus
    colorAmount: 0.65
  },
  
  loudnessStyle: 'aggressive',
  
  thdMode: 'pressure',
  
  toggles: {
    useMultiband: true,
    useClipper: true,
    useMidSide: true,
    forceMonoBass: true  // Critical for dubstep club/festival translation
  }
};

export const TRAP: GenrePreset = {
  id: 'trap',
  name: 'Trap',
  category: 'Bass Music',
  description: '808 sub dominance, crisp hi-hats, punch',
  
  biases: {
    bassTilt: +3,
    airTilt: +2.5,   // Crisp hi-hats and sparkle (differentiate from Dubstep)
    mudCut: -2,
    width: 0.92,     // Slightly more open than Dubstep (vocal samples need space)
    colorAmount: 0.5,
    monoBassHz: 100    // Lower cutoff for 808-led trap
  },
  
  loudnessStyle: 'balanced',
  
  thdMode: 'pressure',
  
  toggles: {
    useMultiband: true,
    useClipper: false,
    useMidSide: true,
    forceMonoBass: true  // 808 subs need mono for club systems
  }
};

export const FUTURE_BASS: GenrePreset = {
  id: 'futurebass',
  name: 'Future Bass',
  category: 'Bass Music',
  description: 'Bright supersaws, fat bass, wide stereo',
  
  biases: {
    bassTilt: +2,
    airTilt: +3,
    mudCut: -1,
    width: 1.1,
    colorAmount: 0.5,
    monoBassHz: 100    // Lower cutoff to preserve chorused/unison bass character
  },
  
  loudnessStyle: 'balanced',
  
  thdMode: 'pressure',
  
  toggles: {
    useMultiband: false,     // Preserve bright supersaws and wide stereo (Future Bass = Trance DNA)
    useClipper: true,        // Energy and lift (was false)
    useMidSide: true,
    forceMonoBass: true      // Prevent chorused bass from causing club flab
  }
};

export const HARDSTYLE: GenrePreset = {
  id: 'hardstyle',
  name: 'Hardstyle',
  category: 'Hard Dance',
  description: 'Reverse bass, distorted kicks, extreme loudness',
  
  biases: {
    bassTilt: +3,
    airTilt: +1,
    mudCut: -4,
    width: 0.9,      // Mono kick focus
    colorAmount: 0.75
  },
  
  loudnessStyle: 'aggressive',
  
  thdMode: 'pressure',
  
  toggles: {
    useMultiband: true,
    useClipper: true,
    useMidSide: true,
    forceMonoBass: true  // Reverse bass needs mono focus
  }
};

export const HARDCORE: GenrePreset = {
  id: 'hardcore',
  name: 'Hardcore',
  category: 'Hard Dance',
  description: 'Gabber kicks, industrial, maximum aggression',
  
  biases: {
    bassTilt: +3,
    airTilt: +0.5,
    mudCut: -4,
    width: 0.9,      // Maximum mono impact
    colorAmount: 0.65 // Brutal aggression not vintage warmth (was 0.8)
  },
  
  loudnessStyle: 'aggressive',
  
  thdMode: 'pressure',
  
  toggles: {
    useMultiband: true,
    useClipper: true,
    useMidSide: true,
    forceMonoBass: true  // Gabber kicks demand mono sub
  }
};

export const UK_GARAGE: GenrePreset = {
  id: 'ukgarage',
  name: 'UK Garage',
  category: 'UK Styles',
  description: 'Skippy beats, warm bass, vocal clarity',
  
  biases: {
    bassTilt: +2,
    airTilt: +1.5,
    mudCut: -1,
    width: 1.0,      // Vocal clarity needs openness (was 0.95)
    colorAmount: 0.4
  },
  
  loudnessStyle: 'balanced',
  
  thdMode: 'pressure',
  
  toggles: {
    useMultiband: true,
    useClipper: false,
    useMidSide: true,
    forceMonoBass: false  // UK Garage prefers warm bass with some width
  }
};

export const BREAKBEAT: GenrePreset = {
  id: 'breakbeat',
  name: 'Breakbeat',
  category: 'UK Styles',
  description: 'Punchy breaks, funky bass, mid presence',
  
  biases: {
    bassTilt: +2,
    airTilt: +2,
    mudCut: -2,
    width: 0.9,
    colorAmount: 0.5,
    monoBassHz: 100   // Club/festival genre needs mono bass protection
  },
  
  loudnessStyle: 'balanced',
  
  thdMode: 'pressure',
  
  toggles: {
    useMultiband: true,
    useClipper: false,
    useMidSide: true,
    forceMonoBass: true  // Club-focused genre requires mono bass (was false)
  }
};

export const RNB: GenrePreset = {
  id: 'rnb',
  name: 'R&B / Soul',
  category: 'Legacy',
  description: 'Smooth/warm, preserves vocal dynamics',
  
  biases: {
    bassTilt: +1,
    airTilt: +1,
    mudCut: -0.5,
    width: 1.02,     // Controlled polish (not too wide to avoid phase issues)
    colorAmount: 0.25
  },
  
  loudnessStyle: 'clean',
  
  thdMode: 'flow',
  
  toggles: {
    useMultiband: false,
    useClipper: false,
    useMidSide: true,
    forceMonoBass: false  // Pop/RNB production typically allows bass width
  },
  
  guardrails: {
    maxLimiterGR: 3,  // Very gentle
    maxEQBoost: 3
  }
};

export const TAPE: GenrePreset = {
  id: 'tape',
  name: '70s Tape Weight',
  category: 'Legacy',
  description: 'Vintage warmth, harmonic saturation, analog grit',
  
  biases: {
    bassTilt: +2,
    airTilt: -1,     // Rolled off (vintage)
    mudCut: 0,
    width: 0.9,
    colorAmount: 0.9 // Heavy saturation
  },
  
  loudnessStyle: 'clean',
  
  thdMode: 'flow',
  
  toggles: {
    useMultiband: false,
    useClipper: false,
    useMidSide: true,
    forceMonoBass: false  // Vintage aesthetic doesn't need modern club rules
  },
  
  guardrails: {
    maxLimiterGR: 2,  // Very gentle
    maxEQBoost: 3
  }
};

// LEGACY ALIAS (keep for compatibility, but deprecate)
export const HOUSE: GenrePreset = {
  id: 'house',
  name: 'Classic House',
  category: 'House',
  description: 'Warm mids, groove-focused, balanced punch',
  
  biases: {
    bassTilt: +2,
    airTilt: +1,
    mudCut: -1,
    width: 1.01,     // Open but not hyped (avoid M/S exciter artifacts)
    colorAmount: 0.4
  },
  
  loudnessStyle: 'balanced',
  
  thdMode: 'pressure',
  
  toggles: {
    useMultiband: false, // Clean house doesn't need surgical fixes
    useClipper: false,
    useMidSide: true,
    forceMonoBass: false  // Classic house allows warm bass
  }
};

// ==================== PRESET REGISTRY ====================

export const GENRE_PRESETS: Record<string, GenrePreset> = {
  // Bass Music
  'dnb': DNB,
  'dubstep': DUBSTEP,
  'trap': TRAP,
  'futurebass': FUTURE_BASS,
  
  // House
  'deephouse': DEEP_HOUSE,
  'techhouse': TECH_HOUSE,
  'progressivehouse': PROGRESSIVE_HOUSE,
  'realprog': REALPROG,
  'house': HOUSE,
  
  // Techno
  'techno': TECHNO,
  'melodictechno': MELODIC_TECHNO,
  'hardtechno': HARD_TECHNO,
  
  // Trance
  'trance': TRANCE,
  'psytrance': PSY_TRANCE,
  'uplifting': PROGRESSIVE_TRANCE,
  
  // Hard Dance
  'hardstyle': HARDSTYLE,
  'hardcore': HARDCORE,
  
  // UK Styles
  'ukgarage': UK_GARAGE,
  'breakbeat': BREAKBEAT,
  
  // Legacy
  'rnb': RNB,
  'tape': TAPE,

  // Demo / comparison
  'generic': GENERIC_BLACKBOX,
};

// Helper to get preset by ID
export function getGenrePreset(id: string): GenrePreset | null {
  return GENRE_PRESETS[id] || null;
}

// Helper to get all presets as array
export function getGenrePresetList(): GenrePreset[] {
  return Object.values(GENRE_PRESETS);
}

// Helper to get presets by category
export function getGenrePresetsByCategory(category: string): GenrePreset[] {
  return Object.values(GENRE_PRESETS).filter(p => p.category === category);
}

// Helper to get all categories
export function getGenreCategories(): string[] {
  return Array.from(new Set(Object.values(GENRE_PRESETS).map(p => p.category)));
}

// Helper to apply guardrails (use preset override or engine default)
export function getEffectiveGuardrail(
  preset: GenrePreset,
  key: keyof NonNullable<GenrePreset['guardrails']>,
  mode: 'dynamics' | 'brickwall',
  performanceMode: 'live' | 'studio'
): number {
  // Get the engine default first
  let engineDefault: number;
  
  switch (key) {
    case 'maxLimiterGR':
      engineDefault = mode === 'brickwall' ? ENGINE_DEFAULTS.maxLimiterGR_brickwall : ENGINE_DEFAULTS.maxLimiterGR_dynamics;
      break;
    case 'maxWidth':
      engineDefault = performanceMode === 'live' ? ENGINE_DEFAULTS.maxWidth_live : ENGINE_DEFAULTS.maxWidth_export;
      break;
    case 'maxEQBoost':
      engineDefault = ENGINE_DEFAULTS.maxEQBoost;
      break;
    case 'maxEQCut':
      engineDefault = ENGINE_DEFAULTS.maxEQCut;
      break;
    case 'maxClipperGR':
      engineDefault = ENGINE_DEFAULTS.maxClipperGR;
      break;
    case 'maxTotalGain':
      engineDefault = ENGINE_DEFAULTS.maxTotalGain;
      break;
    default:
      return assertNever(key);
  }
  
  // If preset has an override, enforce it must be stricter (for max limits, lower is stricter)
  const presetOverride = preset.guardrails?.[key];
  if (presetOverride !== undefined) {
    // For maxEQCut (negative values), stricter means more negative (closer to 0)
    if (key === 'maxEQCut') {
      return Math.max(presetOverride, engineDefault); // More negative = stricter
    }
    // For all other max limits, stricter means lower
    return Math.min(presetOverride, engineDefault);
  }
  
  return engineDefault;
}

// TypeScript exhaustiveness check - forces compile error if guardrail key is unhandled
function assertNever(x: never): never {
  throw new Error(`Unhandled guardrail key: ${String(x)}`);
}