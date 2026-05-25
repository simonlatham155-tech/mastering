/**
 * MULTI-STAGE LIMITER CONTROLLER
 * Professional D&B limiting strategy for extreme loudness (-3 to -6 LUFS)
 * 
 * THE SECRET: Not one heavy limiter, but "shaving" peaks at every stage
 * 
 * CHAIN:
 * 1. Individual tracks → Zero-latency limiter (stop peaks at 0dB)
 * 2. Bus processing → High-quality limiter (+1dB drive for glue)
 * 3. Master → Final limiter with mode-specific characteristics
 * 
 * Based on: https://www.youtube.com/watch?v=siopG7VK6mk
 */

export type LimiterMode = 'clean' | 'beginner' | 'extreme';

export interface LimiterSettings {
  mode: LimiterMode;
  targetLUFS: number;
  peakCeiling: number;
  characteristics: {
    clarity: 'high' | 'medium' | 'low';
    transients: 'transparent' | 'safe' | 'rounded';
    algorithm: 'pro' | 'standard' | 'clipper';
  };
}

export interface MultiStageConfig {
  // Stage 1: Individual tracks
  trackLimiter: {
    enabled: boolean;
    ceiling: number;        // dBFS
    latency: number;        // ms (0 for zero-latency)
  };
  
  // Stage 2: Bus processing
  busLimiter: {
    enabled: boolean;
    ceiling: number;        // dBFS
    drive: number;          // dB of "glue"
    quality: 'high' | 'medium';
  };
  
  // Stage 3: Master limiter
  masterLimiter: {
    enabled: boolean;
    ceiling: number;        // dBTP
    lookahead: number;      // ms
    release: number;        // ms
    peakRounding: boolean;  // Soft-clip vs hard-clip
    harmonicSaturation: number; // Amount (0-1)
  };
}

/**
 * LIMITER MODES (Based on industry standards)
 */
export const LIMITER_MODES: Record<LimiterMode, LimiterSettings> = {
  /**
   * CLEAN/PRO MODE
   * Target: -5 to -7 LUFS
   * Tool equivalent: FabFilter Pro-L 2
   * Characteristics: High clarity, transparent transients
   */
  clean: {
    mode: 'clean',
    targetLUFS: -6,         // -5 to -7 range
    peakCeiling: -0.3,      // dBTP (safe headroom)
    characteristics: {
      clarity: 'high',
      transients: 'transparent',
      algorithm: 'pro'
    }
  },
  
  /**
   * BEGINNER/FREE MODE
   * Target: -6 to -8 LUFS
   * Tool equivalent: KHS Limiter
   * Characteristics: Safe, prevents clipping, less "sheen"
   */
  beginner: {
    mode: 'beginner',
    targetLUFS: -7,         // -6 to -8 range
    peakCeiling: -1.0,      // dBTP (safe)
    characteristics: {
      clarity: 'medium',
      transients: 'safe',
      algorithm: 'standard'
    }
  },
  
  /**
   * EXTREME MODE
   * Target: -3 to -5 LUFS
   * Tool equivalent: iZotope Ozone
   * Characteristics: Peak rounding, harmonic distortion (clipper-like)
   */
  extreme: {
    mode: 'extreme',
    targetLUFS: -4,         // -3 to -5 range
    peakCeiling: -0.1,      // dBTP (aggressive)
    characteristics: {
      clarity: 'low',
      transients: 'rounded',
      algorithm: 'clipper'
    }
  }
};

export class MultiStageLimiter {
  private mode: LimiterMode = 'clean';
  private config: MultiStageConfig;
  
  constructor(mode: LimiterMode = 'clean') {
    this.mode = mode;
    this.config = this.getConfigForMode(mode);
  }
  
  /**
   * Get multi-stage configuration for selected mode
   */
  private getConfigForMode(mode: LimiterMode): MultiStageConfig {
    const settings = LIMITER_MODES[mode];
    
    switch (mode) {
      case 'clean':
        return {
          trackLimiter: {
            enabled: true,
            ceiling: 0,         // Stop at 0dBFS
            latency: 0          // Zero-latency (KHS-style)
          },
          busLimiter: {
            enabled: true,
            ceiling: -0.5,      // Slight headroom
            drive: 1,           // +1dB glue
            quality: 'high'     // FabFilter Pro-L 2 quality
          },
          masterLimiter: {
            enabled: true,
            ceiling: -0.3,      // True peak safe
            lookahead: 5,       // 5ms look-ahead
            release: 100,       // Medium release
            peakRounding: false, // Hard limiting (transparent)
            harmonicSaturation: 0 // No saturation
          }
        };
        
      case 'beginner':
        return {
          trackLimiter: {
            enabled: true,
            ceiling: 0,
            latency: 0
          },
          busLimiter: {
            enabled: true,
            ceiling: -1.0,      // More headroom
            drive: 0.5,         // Less drive
            quality: 'medium'
          },
          masterLimiter: {
            enabled: true,
            ceiling: -1.0,      // Safe ceiling
            lookahead: 3,       // Shorter look-ahead
            release: 150,       // Slower release (safer)
            peakRounding: false,
            harmonicSaturation: 0
          }
        };
        
      case 'extreme':
        return {
          trackLimiter: {
            enabled: true,
            ceiling: 0,
            latency: 0
          },
          busLimiter: {
            enabled: true,
            ceiling: -0.3,      // Tight ceiling
            drive: 2,           // More drive for energy
            quality: 'high'
          },
          masterLimiter: {
            enabled: true,
            ceiling: -0.1,      // Aggressive ceiling
            lookahead: 8,       // Longer look-ahead
            release: 60,        // Fast release (punch)
            peakRounding: true, // SOFT CLIP (key difference!)
            harmonicSaturation: 0.3 // Add harmonic energy
          }
        };
    }
  }
  
  /**
   * Set limiter mode
   */
  setMode(mode: LimiterMode): void {
    this.mode = mode;
    this.config = this.getConfigForMode(mode);
    
    console.log(`🎚️ Limiter mode set to: ${mode.toUpperCase()}`);
    console.log(`   Target LUFS: ${LIMITER_MODES[mode].targetLUFS}`);
    console.log(`   Peak ceiling: ${LIMITER_MODES[mode].peakCeiling} dBTP`);
    console.log(`   Algorithm: ${LIMITER_MODES[mode].characteristics.algorithm}`);
  }
  
  /**
   * Get current configuration
   */
  getConfig(): MultiStageConfig {
    return this.config;
  }
  
  /**
   * Get current mode settings
   */
  getSettings(): LimiterSettings {
    return LIMITER_MODES[this.mode];
  }
  
  /**
   * Apply multi-stage limiting to WASM chain
   */
  applyToChain(audioContext: AudioContext, sourceNode: AudioNode): AudioNode {
    console.log('🔗 Building multi-stage limiter chain...');
    
    let currentNode = sourceNode;
    
    // STAGE 1: Track limiter (zero-latency peak stop)
    if (this.config.trackLimiter.enabled) {
      currentNode = this.createTrackLimiter(audioContext, currentNode);
      console.log('   ✓ Stage 1: Track limiter (0dBFS ceiling)');
    }
    
    // STAGE 2: Bus limiter (glue + drive)
    if (this.config.busLimiter.enabled) {
      currentNode = this.createBusLimiter(audioContext, currentNode);
      console.log(`   ✓ Stage 2: Bus limiter (+${this.config.busLimiter.drive}dB drive)`);
    }
    
    // STAGE 3: Master limiter (final polish)
    if (this.config.masterLimiter.enabled) {
      currentNode = this.createMasterLimiter(audioContext, currentNode);
      console.log(`   ✓ Stage 3: Master limiter (${this.mode} mode)`);
    }
    
    console.log('✅ Multi-stage limiter chain complete!');
    
    return currentNode;
  }
  
  /**
   * STAGE 1: Track limiter (zero-latency)
   */
  private createTrackLimiter(audioContext: AudioContext, inputNode: AudioNode): AudioNode {
    // Use DynamicsCompressorNode configured as fast limiter
    const limiter = audioContext.createDynamicsCompressor();
    
    limiter.threshold.value = -0.1;  // Just below 0dBFS
    limiter.knee.value = 0;          // Hard knee (brick-wall)
    limiter.ratio.value = 20;        // Heavy ratio (limiter)
    limiter.attack.value = 0.001;    // 1ms (zero-latency feel)
    limiter.release.value = 0.05;    // 50ms (fast)
    
    inputNode.connect(limiter);
    return limiter;
  }
  
  /**
   * STAGE 2: Bus limiter (glue + drive)
   */
  private createBusLimiter(audioContext: AudioContext, inputNode: AudioNode): AudioNode {
    const config = this.config.busLimiter;
    
    // Gain for "drive"
    const drive = audioContext.createGain();
    drive.gain.value = Math.pow(10, config.drive / 20); // dB to linear
    
    // Compressor for "glue"
    const compressor = audioContext.createDynamicsCompressor();
    compressor.threshold.value = -6;
    compressor.knee.value = 6;       // Soft knee for glue
    compressor.ratio.value = 4;      // Moderate ratio
    compressor.attack.value = 0.005; // 5ms
    compressor.release.value = 0.1;  // 100ms
    
    // Limiter to catch peaks
    const limiter = audioContext.createDynamicsCompressor();
    limiter.threshold.value = config.ceiling;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.08;
    
    // Chain: input → drive → compressor → limiter
    inputNode.connect(drive);
    drive.connect(compressor);
    compressor.connect(limiter);
    
    return limiter;
  }
  
  /**
   * STAGE 3: Master limiter (mode-specific)
   */
  private createMasterLimiter(audioContext: AudioContext, inputNode: AudioNode): AudioNode {
    const config = this.config.masterLimiter;
    
    let currentNode: AudioNode = inputNode;
    
    // Apply harmonic saturation if enabled (Extreme mode)
    if (config.harmonicSaturation > 0) {
      currentNode = this.createSoftClipper(audioContext, currentNode, config.harmonicSaturation);
    }
    
    // Final limiter
    const limiter = audioContext.createDynamicsCompressor();
    limiter.threshold.value = config.ceiling;
    limiter.knee.value = config.peakRounding ? 3 : 0; // Soft knee for rounding
    limiter.ratio.value = 20;
    limiter.attack.value = config.lookahead / 1000; // Convert ms to seconds
    limiter.release.value = config.release / 1000;
    
    currentNode.connect(limiter);
    
    return limiter;
  }
  
  /**
   * Create soft-clipper for "Extreme" mode
   * Rounds peaks instead of hard-clipping (adds harmonic energy)
   */
  private createSoftClipper(
    audioContext: AudioContext,
    inputNode: AudioNode,
    amount: number
  ): AudioNode {
    // WaveShaperNode for soft-clipping
    const shaper = audioContext.createWaveShaper();
    
    // Create soft-clip curve
    const samples = 1024;
    const curve = new Float32Array(samples);
    const deg = Math.PI / 180;
    
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;
      
      // Soft-clip algorithm: tanh-like curve
      // Rounds peaks instead of hard stop at 1.0
      const softClip = Math.tanh(x * (1 + amount * 2));
      
      curve[i] = softClip;
    }
    
    shaper.curve = curve;
    // Re-enable 2x oversampling (4x is too slow, none breaks the curve)
    shaper.oversample = '2x';
    
    inputNode.connect(shaper);
    return shaper;
  }
}

/**
 * Singleton instance
 */
let limiterInstance: MultiStageLimiter | null = null;

export function getMultiStageLimiter(mode: LimiterMode = 'clean'): MultiStageLimiter {
  if (!limiterInstance) {
    limiterInstance = new MultiStageLimiter(mode);
  } else {
    limiterInstance.setMode(mode);
  }
  return limiterInstance;
}

/**
 * SUB-BASS MANAGEMENT
 * Sub-bass should sit between -3 and 0 dB before master limiter
 */
export function validateSubBassLevel(subLevel: number): {
  isValid: boolean;
  recommendation: string;
} {
  if (subLevel < -6) {
    return {
      isValid: false,
      recommendation: 'Sub is too quiet. Boost to -3 to 0 dB for proper "weight".'
    };
  } else if (subLevel > 0) {
    return {
      isValid: false,
      recommendation: 'Sub is clipping! Reduce to -3 to 0 dB range.'
    };
  } else if (subLevel < -3) {
    return {
      isValid: true,
      recommendation: 'Sub is slightly quiet. Consider boosting to -3 to 0 dB for more weight.'
    };
  } else {
    return {
      isValid: true,
      recommendation: 'Sub level is perfect! (-3 to 0 dB provides enough weight without triggering compressor early.)'
    };
  }
}
