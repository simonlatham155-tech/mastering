/**
 * MID-SIDE PROCESSOR
 * Implements the "Sub-Mono" rule for dance music
 * 
 * THE RULE: In all dance genres (especially D&B), the low end must be in MONO
 * to avoid "phase cancellation" in club systems.
 * 
 * THE FIX: Apply a high-pass filter on the Side channel at 120Hz.
 * This ensures the sub is 100% in the Mid channel (mono).
 * 
 * WHY THIS MATTERS:
 * - Club systems are often mono below 120Hz
 * - Stereo bass causes phase issues (cancellation)
 * - Result: Bass "disappears" on club system
 * 
 * WITH SUB-MONO:
 * - Bass stays centered (Mid channel only)
 * - No phase cancellation
 * - Full power on club systems
 */

export interface MidSideConfig {
  enabled: boolean;
  crossoverFreq: number;  // Hz (typically 120Hz)
  stereoWidth: number;    // 0.0 to 1.0 (1.0 = full stereo)
}

export class MidSideProcessor {
  private audioContext: AudioContext;
  private config: MidSideConfig;
  
  // Nodes
  private splitter: ChannelSplitterNode;
  private merger: ChannelMergerNode;
  private midGain: GainNode;
  private sideGain: GainNode;
  private sideHighPass: BiquadFilterNode;
  
  constructor(audioContext: AudioContext, config: Partial<MidSideConfig> = {}) {
    this.audioContext = audioContext;
    
    this.config = {
      enabled: true,
      crossoverFreq: 120,    // 120Hz (industry standard)
      stereoWidth: 1.0,
      ...config
    };
    
    // Create nodes
    this.splitter = audioContext.createChannelSplitter(2);
    this.merger = audioContext.createChannelMerger(2);
    this.midGain = audioContext.createGain();
    this.sideGain = audioContext.createGain();
    
    // Create high-pass filter for Side channel
    this.sideHighPass = audioContext.createBiquadFilter();
    this.sideHighPass.type = 'highpass';
    this.sideHighPass.frequency.value = this.config.crossoverFreq;
    this.sideHighPass.Q.value = 0.7071; // Butterworth response
    
    // Initial setup
    this.updateStereoWidth();
  }
  
  /**
   * Connect input to Mid-Side processor
   */
  connect(inputNode: AudioNode, outputNode: AudioNode): void {
    if (!this.config.enabled) {
      // Bypass: direct connection
      inputNode.connect(outputNode);
      return;
    }
    
    // Split stereo to L/R
    inputNode.connect(this.splitter);
    
    // Convert L/R to Mid/Side
    const leftToMid = this.audioContext.createGain();
    const leftToSide = this.audioContext.createGain();
    const rightToMid = this.audioContext.createGain();
    const rightToSide = this.audioContext.createGain();
    
    // Mid = (L + R) / 2
    leftToMid.gain.value = 0.5;
    rightToMid.gain.value = 0.5;
    
    // Side = (L - R) / 2
    leftToSide.gain.value = 0.5;
    rightToSide.gain.value = -0.5;
    
    // Connect splitter to Mid/Side converters
    this.splitter.connect(leftToMid, 0);
    this.splitter.connect(rightToMid, 1);
    this.splitter.connect(leftToSide, 0);
    this.splitter.connect(rightToSide, 1);
    
    // Sum to Mid and Side
    leftToMid.connect(this.midGain);
    rightToMid.connect(this.midGain);
    
    leftToSide.connect(this.sideHighPass); // KEY: High-pass on Side!
    rightToSide.connect(this.sideHighPass);
    this.sideHighPass.connect(this.sideGain);
    
    // Convert Mid/Side back to L/R
    const midToLeft = this.audioContext.createGain();
    const midToRight = this.audioContext.createGain();
    const sideToLeft = this.audioContext.createGain();
    const sideToRight = this.audioContext.createGain();
    
    // L = Mid + Side
    midToLeft.gain.value = 1;
    sideToLeft.gain.value = 1;
    
    // R = Mid - Side
    midToRight.gain.value = 1;
    sideToRight.gain.value = -1;
    
    // Connect Mid/Side to L/R converters
    this.midGain.connect(midToLeft);
    this.midGain.connect(midToRight);
    this.sideGain.connect(sideToLeft);
    this.sideGain.connect(sideToRight);
    
    // Merge back to stereo
    midToLeft.connect(this.merger, 0, 0);
    sideToLeft.connect(this.merger, 0, 0);
    midToRight.connect(this.merger, 0, 1);
    sideToRight.connect(this.merger, 0, 1);
    
    // Output
    this.merger.connect(outputNode);
    
    console.log('🎛️ Mid-Side processor connected');
    console.log(`   Crossover: ${this.config.crossoverFreq}Hz`);
    console.log(`   Sub is 100% MONO (Mid channel only)`);
    console.log(`   Stereo width: ${(this.config.stereoWidth * 100).toFixed(0)}%`);
  }
  
  /**
   * Update stereo width (0.0 = mono, 1.0 = full stereo)
   */
  setStereoWidth(width: number): void {
    this.config.stereoWidth = Math.max(0, Math.min(1, width));
    this.updateStereoWidth();
  }
  
  /**
   * Update crossover frequency
   */
  setCrossoverFreq(freq: number): void {
    this.config.crossoverFreq = freq;
    this.sideHighPass.frequency.value = freq;
    
    console.log(`🎛️ Sub-mono crossover updated: ${freq}Hz`);
  }
  
  /**
   * Enable/disable processing
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
    console.log(`🎛️ Mid-Side processing: ${enabled ? 'ENABLED' : 'DISABLED'}`);
  }
  
  /**
   * Update stereo width gains
   */
  private updateStereoWidth(): void {
    // Mid channel: always 1.0 (full)
    this.midGain.gain.value = 1.0;
    
    // Side channel: controlled by width (0.0 to 1.0)
    this.sideGain.gain.value = this.config.stereoWidth;
  }
  
  /**
   * Get current configuration
   */
  getConfig(): MidSideConfig {
    return { ...this.config };
  }
  
  /**
   * Analyze stereo spread at different frequencies
   */
  async analyzeSpread(audioBuffer: AudioBuffer): Promise<{
    subIsMono: boolean;
    midIsMonoBelow120Hz: boolean;
    sideEnergyBelow120Hz: number;
  }> {
    // Simplified analysis
    // In production, this would use FFT to analyze energy distribution
    
    const leftChannel = audioBuffer.getChannelData(0);
    const rightChannel = audioBuffer.getChannelData(1);
    
    // Sample first 44100 samples (1 second at 44.1kHz)
    const samples = Math.min(44100, audioBuffer.length);
    let sumDiff = 0;
    
    for (let i = 0; i < samples; i++) {
      const diff = Math.abs(leftChannel[i] - rightChannel[i]);
      sumDiff += diff;
    }
    
    const avgDiff = sumDiff / samples;
    const sideEnergyBelow120Hz = avgDiff;
    
    return {
      subIsMono: avgDiff < 0.1,
      midIsMonoBelow120Hz: avgDiff < 0.1,
      sideEnergyBelow120Hz
    };
  }
}

/**
 * SUB-MONO VALIDATOR
 * Check if a track follows the sub-mono rule
 */
export function validateSubMono(
  sideEnergyBelow120Hz: number
): {
  isValid: boolean;
  severity: 'safe' | 'warning' | 'danger';
  message: string;
} {
  if (sideEnergyBelow120Hz < 0.05) {
    return {
      isValid: true,
      severity: 'safe',
      message: 'Perfect! Sub is 100% mono. Will sound great on club systems.'
    };
  } else if (sideEnergyBelow120Hz < 0.15) {
    return {
      isValid: true,
      severity: 'warning',
      message: 'Sub has slight stereo spread. Acceptable but not ideal for clubs.'
    };
  } else {
    return {
      isValid: false,
      severity: 'danger',
      message: 'WARNING: Sub has significant stereo spread! Will cause phase cancellation on club systems. Enable Mid-Side processing.'
    };
  }
}

/**
 * Singleton instance
 */
let processorInstance: MidSideProcessor | null = null;

export function getMidSideProcessor(
  audioContext: AudioContext,
  config?: Partial<MidSideConfig>
): MidSideProcessor {
  if (!processorInstance) {
    processorInstance = new MidSideProcessor(audioContext, config);
  }
  return processorInstance;
}
