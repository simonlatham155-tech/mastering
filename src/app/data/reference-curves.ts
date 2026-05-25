/**
 * REFERENCE CURVE LIBRARY
 * Golden master spectral profiles for each genre
 * 
 * VALUES ARE RELATIVE dB OFFSETS FROM FLAT RESPONSE
 * 
 * Example: If user's track is at -25 dB at 63 Hz and Techno target is +6 dB,
 * the algorithm needs +31 dB boost (scaled by Strength slider)
 * 
 * ISO-STANDARD 10-BAND ARRAY (ISO 266:2003):
 * 1. 31 Hz (Sub-Bass) - Physical rumble
 * 2. 63 Hz (Bass) - Kick thump
 * 3. 125 Hz (Low-End) - Mix weight
 * 4. 250 Hz (Low-Mids) - "Mud" zone
 * 5. 500 Hz (Mids) - Vocal/guitar body
 * 6. 1 kHz (High-Mids) - Clarity
 * 7. 2 kHz (Presence) - Snap/crunch
 * 8. 4 kHz (Edge) - Bite
 * 9. 8 kHz (Brilliance) - Sheen/sparkle
 * 10. 16 kHz (Air) - Openness
 * 
 * Q-Factor: 1.41 for all bands (one octave bandwidth)
 */

export interface ReferenceCurve {
  name: string;
  genre: string;
  description: string;
  targetLUFS: number;      // Target integrated loudness
  peakCeiling: number;     // Peak ceiling (dBTP)
  bands: {
    hz31: number;      // Relative dB offset from flat
    hz63: number;
    hz125: number;
    hz250: number;
    hz500: number;
    hz1k: number;
    hz2k: number;
    hz4k: number;
    hz8k: number;
    hz16k: number;
  };
  compression: {
    threshold: number;
    ratio: number;
    attack: number;
    release: number;
  };
  visualProfile?: {
    swooshShape?: string;    // Visual "ghost" shape (e.g., "nike", "flat", "smile")
    highlightRegion?: string; // Which region to emphasize (e.g., "high-mids", "sub", "air")
    dimRegion?: string;       // Which region to de-emphasize
  };
  dspBehavior?: {
    mode?: string;           // DSP effect mode (e.g., "pulse", "wallOfSound", "punch", "hyperEnergy")
    sidechainEmulation?: boolean; // Enable sidechain emulation (auto-ducking)
    duckAmount?: number;     // Amount of ducking (dB)
    duckSpeed?: number;      // Speed of ducking recovery (ms)
    releaseExtension?: number; // Extended release time (ms)
    leadBoost?: number;      // Boost for euphoric leads (dB)
    slowAttack?: number;     // Slow attack time (ms)
    transientPreservation?: boolean; // Preserve transients
    subEmphasis?: number;    // Extra sub boost (dB)
    transientSharpening?: boolean; // Sharpen transients
    saturation?: {
      enabled: boolean;
      type: string;
      blend: number;
    };
    kneeDb?: number;
    lookahead?: number;
  };
}

export const referenceCurves: Record<string, ReferenceCurve> = {
  // ========================================
  // ELECTRONIC / CLUB
  // ========================================
  
  techno: {
    name: "Techno (Club)",
    genre: "Electronic",
    description: "Heavy sub, clear mids, shimmering highs",
    targetLUFS: -7,        // -8 to -6 LUFS
    peakCeiling: -0.1,     // -0.1 dBTP (aggressive)
    bands: {
      hz31: +4,      // Heavy sub for club systems
      hz63: +6,      // Massive kick thump
      hz125: +2,     // Full low-end
      hz250: -3,     // Clear mud zone
      hz500: -2,     // Minimal mids
      hz1k: 0,       // Balanced presence
      hz2k: +1,      // Slight presence boost
      hz4k: +2,      // Percussion detail
      hz8k: +3,      // Shimmer on hi-hats
      hz16k: -2      // Protect ears (club volume)
    },
    compression: {
      threshold: -12,
      ratio: 6.0,
      attack: 1,
      release: 80
    },
    visualProfile: {
      swooshShape: "nike",           // Nike swoosh (low-heavy, high shimmer)
      highlightRegion: "sub",         // Emphasize sub + bass
      dimRegion: "low-mids"           // De-emphasize 250-500Hz
    }
  },
  
  house: {
    name: "House Music",
    genre: "Electronic",
    description: "Warm bass, forward vocals, bright top",
    targetLUFS: -9,
    peakCeiling: -0.3,
    bands: {
      hz31: +2,      // Moderate sub
      hz63: +4,      // Warm bass
      hz125: +3,     // Full low-end
      hz250: 0,      // Balanced low-mids
      hz500: +1,     // Slight mid warmth
      hz1k: +2,      // Vocal presence
      hz2k: +3,      // Forward vocals
      hz4k: +2,      // Crisp percussion
      hz8k: +4,      // Bright hi-hats
      hz16k: +1      // Natural air
    },
    compression: {
      threshold: -15,
      ratio: 4.0,
      attack: 3,
      release: 100
    },
    visualProfile: {
      swooshShape: "smile",
      highlightRegion: "presence",
      dimRegion: null
    }
  },
  
  dubstep: {
    name: "Dubstep/Bass Music",
    genre: "Electronic",
    description: "Extreme sub, aggressive mids, hyped highs",
    targetLUFS: -5,
    peakCeiling: -0.1,
    bands: {
      hz31: +8,      // EXTREME sub
      hz63: +7,      // Massive bass
      hz125: +4,     // Heavy low-end
      hz250: +2,     // Forward low-mids
      hz500: +3,     // Aggressive mids
      hz1k: +4,      // Cutting presence
      hz2k: +5,      // Hyped presence
      hz4k: +6,      // Maximum bite
      hz8k: +5,      // Hyped brilliance
      hz16k: +2      // Extended air
    },
    compression: {
      threshold: -8,
      ratio: 8.0,
      attack: 0.5,
      release: 60
    },
    visualProfile: {
      swooshShape: "v-shape",
      highlightRegion: "sub",
      dimRegion: null
    }
  },
  
  // ========================================
  // POP / COMMERCIAL
  // ========================================
  
  pop: {
    name: "Pop (Modern)",
    genre: "Pop",
    description: "Clean low-end, vocal-forward, airy top",
    targetLUFS: -9,        // -10 to -8 LUFS
    peakCeiling: -0.5,     // -0.5 dBTP (safer ceiling)
    bands: {
      hz31: -2,      // Clean sub (no boom)
      hz63: +2,      // Controlled bass
      hz125: +1,     // Natural low-end
      hz250: -2,     // Clear mud
      hz500: 0,      // Balanced mids
      hz1k: +3,      // Vocal pop (key frequency)
      hz2k: +2,      // Vocal clarity
      hz4k: +1,      // Crisp consonants
      hz8k: +4,      // Air and sparkle
      hz16k: +2      // Extended air
    },
    compression: {
      threshold: -13,
      ratio: 5.0,
      attack: 3,
      release: 100
    },
    visualProfile: {
      swooshShape: "smile",          // Smile curve (scooped mids, boosted highs)
      highlightRegion: "high-mids",  // Emphasize 1-4kHz (vocals)
      dimRegion: "low-mids"          // De-emphasize mud zone
    }
  },
  
  // ========================================
  // LO-FI / CHILL
  // ========================================
  
  lofi: {
    name: "Lo-Fi (Chill)",
    genre: "Lo-Fi",
    description: "Warm, boxy, vintage high-end rolloff",
    targetLUFS: -13,       // -14 to -12 LUFS (dynamic)
    peakCeiling: -1.0,     // -1.0 dBTP (natural dynamics)
    bands: {
      hz31: -6,      // Rolled-off sub (vinyl simulation)
      hz63: -2,      // Controlled bass
      hz125: +2,     // Warmth zone
      hz250: +4,     // Boxy vintage vibe (intentional)
      hz500: +3,     // Forward mids
      hz1k: +1,      // Natural presence
      hz2k: -2,      // Soft high-mids (no harshness)
      hz4k: -4,      // Reduced edge
      hz8k: -8,      // Vintage rolloff (key characteristic)
      hz16k: -15     // Muffled top (cassette tape simulation)
    },
    compression: {
      threshold: -18,
      ratio: 3.0,
      attack: 15,
      release: 250
    },
    visualProfile: {
      swooshShape: "inverse-smile",  // Opposite of modern (boosted mids, rolled highs)
      highlightRegion: "low-mids",   // Emphasize 125-500Hz (warmth/body)
      dimRegion: "air"               // De-emphasize 8-16kHz (vintage)
    }
  },
  
  // ========================================
  // PROGRESSIVE HOUSE
  // ========================================
  
  progressiveHouse: {
    name: "Progressive House",
    genre: "Electronic",
    description: "Balanced energy, punchy kick, atmospheric highs",
    targetLUFS: -9,        // -9.0 LUFS (2026 standard)
    peakCeiling: -1.0,     // -1.0 dBTP
    bands: {
      hz31: +3,      // Moderate sub (not overwhelming)
      hz63: +5,      // Strong kick thump (KEY: kick/sub balance)
      hz125: +1,     // Natural low-end
      hz250: -2,     // Clear mud
      hz500: 0,      // Balanced mids
      hz1k: +1,      // Slight presence
      hz2k: +2,      // Forward synths
      hz4k: +1,      // Crisp transients
      hz8k: +4,      // Atmospheric highs (signature shimmer)
      hz16k: +2      // Extended air
    },
    compression: {
      threshold: -14,
      ratio: 4.5,
      attack: 5,        // Moderate attack for "pulse" feel
      release: 150      // Medium release for flowing energy
    },
    dspBehavior: {
      mode: "pulse",           // Progressive "breathing" effect
      sidechainEmulation: true, // Auto-ducking on kick
      duckAmount: -3,          // 3dB volume dip on kick hits
      duckSpeed: 50            // Fast recovery (50ms)
    },
    visualProfile: {
      swooshShape: "balanced",      // Even distribution
      highlightRegion: "air",        // Emphasize 8-16kHz (atmosphere)
      dimRegion: "low-mids"          // Slight scoop
    }
  },
  
  // ========================================
  // TRANCE (Classic/Uplifting)
  // ========================================
  
  trance: {
    name: "Trance (Uplifting)",
    genre: "Electronic",
    description: "Wall of sound, sustained energy, euphoric leads",
    targetLUFS: -8,        // -8.0 LUFS (loud but controlled)
    peakCeiling: -1.0,     // -1.0 dBTP
    bands: {
      hz31: +2,      // Moderate sub (not overpowering)
      hz63: +4,      // Solid kick
      hz125: +1,     // Full low-end
      hz250: -1,     // Minimal mud
      hz500: +1,     // Slight mid boost (body)
      hz1k: +2,      // Forward presence
      hz2k: +4,      // Euphoric leads (KEY FREQUENCY)
      hz4k: +3,      // Acid stabs/plucks
      hz8k: +5,      // Maximum brilliance (trance signature)
      hz16k: +1      // Controlled air
    },
    compression: {
      threshold: -13,
      ratio: 5.0,
      attack: 3,        // Fast attack
      release: 300      // LONG RELEASE (200-400ms for "wall of sound")
    },
    dspBehavior: {
      mode: "wallOfSound",     // Sustained atmospheric energy
      sidechainEmulation: false, // No ducking (continuous energy)
      releaseExtension: 300,   // Extended release prevents "flickering"
      leadBoost: +2            // Boost 2-4kHz for euphoric leads
    },
    visualProfile: {
      swooshShape: "smile",        // Boosted lows and highs
      highlightRegion: "high-mids", // Emphasize 2-4kHz (leads)
      dimRegion: null
    }
  },
  
  // ========================================
  // TECH HOUSE
  // ========================================
  
  techHouse: {
    name: "Tech House",
    genre: "Electronic",
    description: "Punchy transients, tight low-end, rolling grooves",
    targetLUFS: -7,        // -7.0 LUFS (aggressive club loudness)
    peakCeiling: -0.5,     // -0.5 dBTP (pushed limiting)
    bands: {
      hz31: +5,      // Heavy sub (club systems)
      hz63: +6,      // Maximum kick punch (KEY: transient preservation)
      hz125: 0,      // Tight low-end
      hz250: -4,     // Aggressive mud scoop (tightest of all genres)
      hz500: -1,     // Minimal mids
      hz1k: +1,      // Balanced presence
      hz2k: +2,      // Forward percussion
      hz4k: +3,      // Sharp transients (hi-hats)
      hz8k: +4,      // Crisp top
      hz16k: +2      // Extended air
    },
    compression: {
      threshold: -11,
      ratio: 6.0,
      attack: 30,       // SLOW ATTACK (30ms+) lets kick "click" through
      release: 80       // Fast release for punchy groove
    },
    dspBehavior: {
      mode: "punch",           // Preserve transient attack
      sidechainEmulation: false, // No ducking (tight, punchy)
      slowAttack: 30,          // Lets kick transient pass before compression
      transientPreservation: true // Key characteristic
    },
    visualProfile: {
      swooshShape: "nike",         // Low-heavy with tight mids
      highlightRegion: "sub",       // Emphasize 31-63Hz (punch)
      dimRegion: "low-mids"         // Aggressive scoop at 250Hz
    }
  },
  
  // ========================================
  // DRUM & BASS
  // ========================================
  
  dnb: {
    name: "Drum & Bass",
    genre: "Electronic",
    description: "Extreme sub, fast breaks, hyper energy",
    targetLUFS: -6,        // -6.0 LUFS (maximum loudness)
    peakCeiling: -0.3,     // -0.3 dBTP (aggressive)
    bands: {
      hz31: +7,      // EXTREME sub (floor-shaking)
      hz63: +5,      // Solid kick (but sub dominates)
      hz125: +2,     // Full low-end
      hz250: -2,     // Clear mud
      hz500: 0,      // Balanced mids
      hz1k: +1,      // Natural presence
      hz2k: +2,      // Forward breaks
      hz4k: +3,      // Crisp snares
      hz8k: +5,      // Brilliant cymbals
      hz16k: +3      // Extended air
    },
    compression: {
      threshold: -9,
      ratio: 7.0,
      attack: 1,        // Ultra-fast attack
      release: 60       // Fast release for rapid dynamics
    },
    dspBehavior: {
      mode: "hyperEnergy",     // Maximum impact
      sidechainEmulation: false, // No ducking (constant energy)
      subEmphasis: +2,         // Extra sub boost
      transientSharpening: true // Preserve break transients
    },
    visualProfile: {
      swooshShape: "v-shape",      // Extreme lows and highs
      highlightRegion: "sub",       // Emphasize 31Hz (floor shake)
      dimRegion: null
    }
  },
  
  // ========================================
  // DEEP HOUSE
  // ========================================
  
  deepHouse: {
    name: "Deep House",
    genre: "Electronic",
    description: "Warm, vintage saturation, rolled-off highs, organic feel",
    targetLUFS: -12,       // -12.0 LUFS (dynamic, streaming-friendly)
    peakCeiling: -1.0,     // -1.0 dBTP (natural dynamics)
    bands: {
      hz31: -2,      // Rolled-off sub (not overpowering)
      hz63: +2,      // Warm bass (analog feel)
      hz125: +4,     // Full low-end warmth (KEY!)
      hz250: +1,     // Slight body
      hz500: +1,     // Natural mids
      hz1k: 0,       // Balanced presence
      hz2k: -1,      // Soft high-mids
      hz4k: -2,      // Reduced edge (warm)
      hz8k: -4,      // Rolled highs (vintage feel)
      hz16k: -10     // HEAVY rolloff (analog/tape simulation)
    },
    compression: {
      threshold: -16,
      ratio: 2.5,      // GENTLE compression (preserves dynamics)
      attack: 30,      // SLOW attack (organic feel)
      release: 150     // Medium-slow release (flowing)
    },
    dspBehavior: {
      mode: "warmthAndGlow",   // Vintage analog emulation
      sidechainEmulation: false,
      saturation: {
        enabled: true,
        type: "warm_tape",     // Tape saturation (not clipper!)
        blend: 0.40            // 40% saturation (heavy!)
      },
      kneeDb: 8.0,             // SOFT knee (smooth compression)
      lookahead: 2             // Minimal look-ahead (organic)
    },
    visualProfile: {
      swooshShape: "inverse-smile", // Boosted mids, rolled highs
      highlightRegion: "low-mids",  // Emphasize 125-500Hz (warmth)
      dimRegion: "air",             // De-emphasize 8-16kHz (vintage)
      glowType: "warm"              // Orange glow, not red clipping
    }
  }
};

/**
 * Get reference curve by genre key
 */
export function getReferenceCurve(genre: string): ReferenceCurve | null {
  return referenceCurves[genre] || null;
}

/**
 * Get all available genres
 */
export function getAvailableGenres(): string[] {
  return Object.keys(referenceCurves);
}

/**
 * Get reference curves grouped by category
 */
export function getGenresByCategory(): Record<string, ReferenceCurve[]> {
  const categorized: Record<string, ReferenceCurve[]> = {};
  
  Object.values(referenceCurves).forEach(curve => {
    if (!categorized[curve.genre]) {
      categorized[curve.genre] = [];
    }
    categorized[curve.genre].push(curve);
  });
  
  return categorized;
}