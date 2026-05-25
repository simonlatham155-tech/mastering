/**
 * ITU-R BS.1770-4 COMPLIANT LUFS METERING
 * Professional Loudness Measurement AudioWorklet
 * 
 * ARCHITECTURE:
 * 1. K-Weighting Filter (models human hearing)
 *    - Stage 1: High-shelf pre-filter (head diffraction model)
 *    - Stage 2: High-pass RLB filter (low-frequency rolloff)
 * 
 * 2. Power Calculation (Mean Square over time windows)
 *    - Momentary: 400ms window, updated every 100ms (75% overlap)
 *    - Short-Term: 3 second average of Momentary values
 * 
 * 3. Gating (removes silence to prevent bias)
 *    - Absolute Gate: Ignore blocks below -70 LUFS
 *    - Relative Gate: Ignore blocks 10 LU below average
 * 
 * 4. Integrated Loudness (final track average)
 *    - Average of all non-gated blocks
 *    - This is the "official" LUFS value for the track
 */

class LUFSMeteringProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    
    this.sampleRate = sampleRate;
    
    // K-Weighting Filter Coefficients (ITU-R BS.1770-4)
    // Calculated for 48kHz, but we'll adapt for any sample rate
    this.initializeKWeightingFilters();
    
    // Timing parameters
    this.momentaryWindowSize = Math.floor(0.4 * this.sampleRate); // 400ms
    this.momentaryHopSize = Math.floor(0.1 * this.sampleRate);    // 100ms (75% overlap)
    this.shortTermDuration = 3.0; // 3 seconds
    
    // Buffers for power calculation
    this.kWeightedBuffer = new Float32Array(this.momentaryWindowSize);
    this.bufferWriteIndex = 0;
    this.samplesSinceLastUpdate = 0;
    
    // Momentary values history (for Short-Term calculation)
    this.momentaryHistory = [];
    this.maxMomentaryHistory = Math.ceil(this.shortTermDuration / 0.1); // 30 values
    
    // Integrated loudness (gated)
    this.integratedBlocks = [];
    this.integratedPower = 0;
    this.integratedLUFS = -Infinity;
    
    // Current meter values
    this.momentaryLUFS = -Infinity;
    this.shortTermLUFS = -Infinity;
    
    // Gating thresholds
    this.absoluteGateThreshold = -70; // LUFS
    this.relativeGateOffset = -10;    // LU below average
    
    // Metering update interval
    this.frameCount = 0;
    this.meterUpdateInterval = Math.floor(this.sampleRate * 0.05); // 50ms updates
    
    // Listen for reset command
    this.port.onmessage = (event) => {
      if (event.data.type === 'reset') {
        this.reset();
      }
    };
  }
  
  /**
   * Initialize K-Weighting Biquad Filters
   * ITU-R BS.1770-4 specifies two cascaded biquad filters
   */
  initializeKWeightingFilters() {
    // Calculate coefficients based on actual sample rate
    const fs = this.sampleRate;
    
    // Stage 1: High-shelf pre-filter (models head diffraction)
    // Target: ~4dB boost at high frequencies
    const f0_stage1 = 1681.974; // Hz
    const G_stage1 = 3.999843853973347; // Linear gain
    const Q_stage1 = 0.7071752369554196;
    
    const K_stage1 = Math.tan(Math.PI * f0_stage1 / fs);
    const Vh_stage1 = Math.pow(10, G_stage1 / 20);
    const Vb_stage1 = Math.pow(Vh_stage1, 0.499666774155);
    
    const a0_stage1 = 1 + K_stage1 / Q_stage1 + K_stage1 * K_stage1;
    this.stage1 = {
      b0: (Vh_stage1 + Vb_stage1 * K_stage1 / Q_stage1 + K_stage1 * K_stage1) / a0_stage1,
      b1: 2 * (K_stage1 * K_stage1 - Vh_stage1) / a0_stage1,
      b2: (Vh_stage1 - Vb_stage1 * K_stage1 / Q_stage1 + K_stage1 * K_stage1) / a0_stage1,
      a1: 2 * (K_stage1 * K_stage1 - 1) / a0_stage1,
      a2: (1 - K_stage1 / Q_stage1 + K_stage1 * K_stage1) / a0_stage1,
      z1: 0,
      z2: 0
    };
    
    // Stage 2: High-pass RLB filter (low-frequency rolloff)
    // Target: -∞dB at DC, flat above ~100Hz
    const f0_stage2 = 38.13547087602444; // Hz
    const Q_stage2 = 0.5003270373238773;
    
    const K_stage2 = Math.tan(Math.PI * f0_stage2 / fs);
    const a0_stage2 = 1 + K_stage2 / Q_stage2 + K_stage2 * K_stage2;
    
    this.stage2 = {
      b0: 1 / a0_stage2,
      b1: -2 / a0_stage2,
      b2: 1 / a0_stage2,
      a1: 2 * (K_stage2 * K_stage2 - 1) / a0_stage2,
      a2: (1 - K_stage2 / Q_stage2 + K_stage2 * K_stage2) / a0_stage2,
      z1: 0,
      z2: 0
    };
  }
  
  /**
   * Apply K-Weighting (two cascaded biquad filters)
   */
  applyKWeighting(sample) {
    // Stage 1: High-shelf pre-filter
    const output1 = this.stage1.b0 * sample + this.stage1.z1;
    this.stage1.z1 = this.stage1.b1 * sample - this.stage1.a1 * output1 + this.stage1.z2;
    this.stage1.z2 = this.stage1.b2 * sample - this.stage1.a2 * output1;
    
    // Stage 2: High-pass RLB filter
    const output2 = this.stage2.b0 * output1 + this.stage2.z1;
    this.stage2.z1 = this.stage2.b1 * output1 - this.stage2.a1 * output2 + this.stage2.z2;
    this.stage2.z2 = this.stage2.b2 * output1 - this.stage2.a2 * output2;
    
    return output2;
  }
  
  /**
   * Calculate power (mean square) from buffer
   */
  calculatePower(buffer) {
    let sumSquares = 0;
    for (let i = 0; i < buffer.length; i++) {
      sumSquares += buffer[i] * buffer[i];
    }
    return sumSquares / buffer.length;
  }
  
  /**
   * Convert power to LUFS
   * Formula: LUFS = -0.691 + 10 * log10(power)
   */
  powerToLUFS(power) {
    if (power <= 0) return -Infinity;
    return -0.691 + 10 * Math.log10(power);
  }
  
  /**
   * Update Momentary LUFS (400ms window, updated every 100ms)
   */
  updateMomentary() {
    const power = this.calculatePower(this.kWeightedBuffer);
    this.momentaryLUFS = this.powerToLUFS(power);
    
    // Add to history for Short-Term calculation
    this.momentaryHistory.push(this.momentaryLUFS);
    if (this.momentaryHistory.length > this.maxMomentaryHistory) {
      this.momentaryHistory.shift();
    }
    
    // Add to integrated blocks (if above absolute gate)
    if (this.momentaryLUFS > this.absoluteGateThreshold) {
      this.integratedBlocks.push({
        lufs: this.momentaryLUFS,
        power: power
      });
    }
  }
  
  /**
   * Update Short-Term LUFS (3 second average of Momentary)
   */
  updateShortTerm() {
    if (this.momentaryHistory.length === 0) {
      this.shortTermLUFS = -Infinity;
      return;
    }
    
    // Average of valid momentary values
    let sum = 0;
    let count = 0;
    
    for (let i = 0; i < this.momentaryHistory.length; i++) {
      if (this.momentaryHistory[i] > -Infinity) {
        sum += Math.pow(10, (this.momentaryHistory[i] + 0.691) / 10);
        count++;
      }
    }
    
    if (count === 0) {
      this.shortTermLUFS = -Infinity;
    } else {
      const avgPower = sum / count;
      this.shortTermLUFS = this.powerToLUFS(avgPower);
    }
  }
  
  /**
   * Calculate Integrated LUFS (gated)
   * This is the "official" loudness of the track
   */
  calculateIntegrated() {
    if (this.integratedBlocks.length === 0) {
      this.integratedLUFS = -Infinity;
      return;
    }
    
    // Step 1: Calculate average power (for relative gate)
    let totalPower = 0;
    for (let i = 0; i < this.integratedBlocks.length; i++) {
      totalPower += this.integratedBlocks[i].power;
    }
    const avgPower = totalPower / this.integratedBlocks.length;
    const avgLUFS = this.powerToLUFS(avgPower);
    
    // Step 2: Apply relative gate (-10 LU below average)
    const relativeGateThreshold = avgLUFS + this.relativeGateOffset;
    
    // Step 3: Calculate final integrated power (only non-gated blocks)
    let gatedPower = 0;
    let gatedCount = 0;
    
    for (let i = 0; i < this.integratedBlocks.length; i++) {
      if (this.integratedBlocks[i].lufs >= relativeGateThreshold) {
        gatedPower += this.integratedBlocks[i].power;
        gatedCount++;
      }
    }
    
    if (gatedCount === 0) {
      this.integratedLUFS = -Infinity;
    } else {
      const finalPower = gatedPower / gatedCount;
      this.integratedLUFS = this.powerToLUFS(finalPower);
    }
  }
  
  /**
   * Reset all metering state
   */
  reset() {
    this.kWeightedBuffer.fill(0);
    this.bufferWriteIndex = 0;
    this.samplesSinceLastUpdate = 0;
    this.momentaryHistory = [];
    this.integratedBlocks = [];
    this.momentaryLUFS = -Infinity;
    this.shortTermLUFS = -Infinity;
    this.integratedLUFS = -Infinity;
    
    // Reset filter state
    this.stage1.z1 = 0;
    this.stage1.z2 = 0;
    this.stage2.z1 = 0;
    this.stage2.z2 = 0;
  }
  
  /**
   * Process audio block
   */
  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    
    // Support stereo metering (ITU-R BS.1770-4 multi-channel)
    const numChannels = input.length;
    const blockSize = input[0].length;
    
    for (let i = 0; i < blockSize; i++) {
      // Calculate mean square across all channels
      let channelMeanSquare = 0;
      
      for (let ch = 0; ch < numChannels; ch++) {
        const channel = input[ch];
        
        // Apply K-weighting filter
        const kWeightedSample = this.applyKWeighting(channel[i]);
        
        // Accumulate power (will divide by channel count later)
        channelMeanSquare += kWeightedSample * kWeightedSample;
      }
      
      // Average across channels for this sample
      const avgSample = Math.sqrt(channelMeanSquare / numChannels);
      
      // Store in circular buffer
      this.kWeightedBuffer[this.bufferWriteIndex] = avgSample;
      this.bufferWriteIndex = (this.bufferWriteIndex + 1) % this.momentaryWindowSize;
      
      this.samplesSinceLastUpdate++;
      
      // Update Momentary every 100ms (hop size)
      if (this.samplesSinceLastUpdate >= this.momentaryHopSize) {
        this.updateMomentary();
        this.updateShortTerm();
        this.samplesSinceLastUpdate = 0;
      }
    }
    
    // Send meter updates to main thread
    this.frameCount += blockSize;
    if (this.frameCount >= this.meterUpdateInterval) {
      this.calculateIntegrated();
      this.sendMeterUpdate();
      this.frameCount = 0;
    }
    
    // Pass audio through (metering doesn't modify signal)
    const output = outputs[0];
    if (output && output.length > 0) {
      for (let ch = 0; ch < output.length; ch++) {
        output[ch].set(input[ch] || input[0]);
      }
    }
    
    return true;
  }
  
  /**
   * Send meter values to main thread
   */
  sendMeterUpdate() {
    this.port.postMessage({
      type: 'lufs-update',
      data: {
        momentary: this.momentaryLUFS,
        shortTerm: this.shortTermLUFS,
        integrated: this.integratedLUFS,
        totalBlocks: this.integratedBlocks.length
      }
    });
  }
}

// Register processor
registerProcessor('lufs-metering-processor', LUFSMeteringProcessor);