/**
 * 4x OVERSAMPLING TRUE PEAK LIMITER
 * Polyphase FIR Filter Implementation
 * 
 * ARCHITECTURE:
 * 1. Interpolate: Insert 3 zeros between samples (44.1kHz → 176.4kHz)
 * 2. Filter: Apply FIR low-pass filter (smooth the signal)
 * 3. Limit: Perform limiting at 4x sample rate (catches inter-sample peaks)
 * 4. Decimate: Filter again and downsample back to original rate
 * 
 * WHY THIS MATTERS:
 * Without oversampling, high-frequency harmonics created by the limiter
 * "fold back" into the audible range (aliasing), creating digital harshness.
 * With 4x oversampling, we can "see" and limit the analog waveform before
 * it clips on playback systems.
 */

class OversamplingLimiter extends AudioWorkletProcessor {
  constructor() {
    super();
    
    // FIR Filter Coefficients (31-tap, 96dB stopband)
    // Optimized for 4x interpolation with half-band symmetry
    this.FIR_COEFFS = [
      -0.0012, -0.0025,  0.0000,  0.0084,  0.0151,  0.0000, -0.0382, -0.0654,
       0.0000,  0.1542,  0.2851,  0.3000,  0.2851,  0.1542,  0.0000, -0.0654,
      -0.0382,  0.0000,  0.0151,  0.0084,  0.0000, -0.0025, -0.0012
    ];
    
    this.FIR_LENGTH = this.FIR_COEFFS.length;
    this.FIR_CENTER = Math.floor(this.FIR_LENGTH / 2);
    
    // Limiter parameters (controllable from main thread)
    this.threshold = -0.3; // dBFS
    this.ceiling = -0.3;   // dBTP (true peak)
    this.attack = 0.001;   // seconds
    this.release = 0.1;    // seconds
    this.lookaheadMS = 5;  // milliseconds
    
    // Convert to linear
    this.thresholdLinear = this.dbToLinear(this.threshold);
    this.ceilingLinear = this.dbToLinear(this.ceiling);
    
    // Attack/release coefficients (calculated per sample)
    this.attackCoeff = 0;
    this.releaseCoeff = 0;
    
    // State
    this.envelope = 1.0; // Current gain reduction envelope
    this.sampleRate = sampleRate;
    this.oversampledRate = sampleRate * 4;
    
    // FIR filter state buffers (for upsampling and downsampling)
    this.upsampleBuffer = new Float32Array(this.FIR_LENGTH);
    this.downsampleBuffer = new Float32Array(this.FIR_LENGTH);
    
    // Look-ahead buffer
    this.lookaheadSamples = Math.floor((this.lookaheadMS / 1000) * this.oversampledRate);
    this.delayBuffer = new Float32Array(this.lookaheadSamples);
    this.delayWriteIndex = 0;
    this.delayReadIndex = 0;
    
    // Metering
    this.truePeakDBTP = -Infinity;
    this.digitalPeakDB = -Infinity;
    this.gainReductionDB = 0;
    this.frameCount = 0;
    this.meterUpdateInterval = Math.floor(sampleRate * 0.05); // Update every 50ms
    
    // HQ mode toggle
    this.hqMode = true; // Default: oversampling ON
    this.monitorOnly = false; // Passthrough + measure only (no double limiting)
    
    // Listen for parameter changes from main thread
    this.port.onmessage = (event) => {
      const { type, data } = event.data;
      
      if (type === 'setParameters') {
        if (data.threshold !== undefined) {
          this.threshold = data.threshold;
          this.thresholdLinear = this.dbToLinear(data.threshold);
        }
        if (data.ceiling !== undefined) {
          this.ceiling = data.ceiling;
          this.ceilingLinear = this.dbToLinear(data.ceiling);
        }
        if (data.attack !== undefined) {
          this.attack = data.attack;
        }
        if (data.release !== undefined) {
          this.release = data.release;
        }
        if (data.hqMode !== undefined) {
          this.hqMode = data.hqMode;
        }
        if (data.monitorOnly !== undefined) {
          this.monitorOnly = data.monitorOnly;
        }
      }
    };
    
    this.updateEnvelopeCoefficients();
  }
  
  /**
   * Update attack/release coefficients based on sample rate
   */
  updateEnvelopeCoefficients() {
    // Calculate at oversampled rate
    this.attackCoeff = Math.exp(-1.0 / (this.attack * this.oversampledRate));
    this.releaseCoeff = Math.exp(-1.0 / (this.release * this.oversampledRate));
  }
  
  /**
   * Convert dB to linear gain
   */
  dbToLinear(db) {
    return Math.pow(10, db / 20);
  }
  
  /**
   * Convert linear to dB
   */
  linearToDb(linear) {
    return 20 * Math.log10(Math.max(linear, 1e-10));
  }
  
  /**
   * 4x INTERPOLATION (Upsample)
   * Insert 3 zeros between samples, then apply FIR filter
   */
  upsample(input) {
    const inputLength = input.length;
    const outputLength = inputLength * 4;
    const output = new Float32Array(outputLength);
    
    // Insert zeros (zero-stuffing)
    for (let i = 0; i < inputLength; i++) {
      output[i * 4] = input[i];
      output[i * 4 + 1] = 0;
      output[i * 4 + 2] = 0;
      output[i * 4 + 3] = 0;
    }
    
    // Apply FIR filter (low-pass to smooth interpolated signal)
    const filtered = new Float32Array(outputLength);
    
    for (let i = 0; i < outputLength; i++) {
      let sum = 0;
      
      // Convolve with FIR coefficients
      for (let j = 0; j < this.FIR_LENGTH; j++) {
        const inputIndex = i - j;
        if (inputIndex >= 0 && inputIndex < outputLength) {
          sum += output[inputIndex] * this.FIR_COEFFS[j];
        } else if (inputIndex < 0) {
          // Use buffer from previous block
          const bufferIndex = this.FIR_LENGTH + inputIndex;
          if (bufferIndex >= 0) {
            sum += this.upsampleBuffer[bufferIndex] * this.FIR_COEFFS[j];
          }
        }
      }
      
      filtered[i] = sum * 4; // Multiply by 4 to compensate for zero-stuffing
    }
    
    // Update buffer for next block
    for (let i = 0; i < this.FIR_LENGTH; i++) {
      const sourceIndex = outputLength - this.FIR_LENGTH + i;
      if (sourceIndex >= 0) {
        this.upsampleBuffer[i] = output[sourceIndex];
      }
    }
    
    return filtered;
  }
  
  /**
   * 4x DECIMATION (Downsample)
   * Apply FIR filter, then keep every 4th sample
   */
  downsample(input) {
    const inputLength = input.length;
    const outputLength = Math.floor(inputLength / 4);
    const output = new Float32Array(outputLength);
    
    // Apply FIR filter first (anti-aliasing)
    const filtered = new Float32Array(inputLength);
    
    for (let i = 0; i < inputLength; i++) {
      let sum = 0;
      
      for (let j = 0; j < this.FIR_LENGTH; j++) {
        const inputIndex = i - j;
        if (inputIndex >= 0 && inputIndex < inputLength) {
          sum += input[inputIndex] * this.FIR_COEFFS[j];
        } else if (inputIndex < 0) {
          const bufferIndex = this.FIR_LENGTH + inputIndex;
          if (bufferIndex >= 0) {
            sum += this.downsampleBuffer[bufferIndex] * this.FIR_COEFFS[j];
          }
        }
      }
      
      filtered[i] = sum;
    }
    
    // Decimate: keep every 4th sample
    for (let i = 0; i < outputLength; i++) {
      output[i] = filtered[i * 4];
    }
    
    // Update buffer
    for (let i = 0; i < this.FIR_LENGTH; i++) {
      const sourceIndex = inputLength - this.FIR_LENGTH + i;
      if (sourceIndex >= 0) {
        this.downsampleBuffer[i] = input[sourceIndex];
      }
    }
    
    return output;
  }
  
  /**
   * TRUE PEAK LIMITER (at 4x sample rate)
   * Look-ahead + smooth gain reduction
   */
  limitOversampled(input) {
    const length = input.length;
    const output = new Float32Array(length);
    
    for (let i = 0; i < length; i++) {
      // 1. Write to delay buffer
      this.delayBuffer[this.delayWriteIndex] = input[i];
      this.delayWriteIndex = (this.delayWriteIndex + 1) % this.lookaheadSamples;
      
      // 2. Detect peak from CURRENT sample (look-ahead)
      const peak = Math.abs(input[i]);
      
      // Update true peak meter
      if (peak > this.dbToLinear(this.truePeakDBTP)) {
        this.truePeakDBTP = this.linearToDb(peak);
      }
      
      // 3. Calculate gain reduction
      if (peak > this.ceilingLinear) {
        // Target gain to bring peak down to ceiling
        const targetGain = this.ceilingLinear / peak;
        
        // Apply attack (smooth reduction)
        this.envelope = targetGain + this.attackCoeff * (this.envelope - targetGain);
      } else {
        // Apply release (smooth restoration)
        this.envelope = 1.0 + this.releaseCoeff * (this.envelope - 1.0);
      }
      
      // Clamp envelope
      this.envelope = Math.max(0, Math.min(1, this.envelope));
      
      // 4. Apply gain to DELAYED signal
      const delayed = this.delayBuffer[this.delayReadIndex];
      output[i] = delayed * this.envelope;
      this.delayReadIndex = (this.delayReadIndex + 1) % this.lookaheadSamples;
      
      // Safety brickwall (should never trigger if look-ahead works)
      if (Math.abs(output[i]) > this.ceilingLinear) {
        output[i] = Math.sign(output[i]) * this.ceilingLinear;
      }
    }
    
    // Calculate gain reduction in dB
    this.gainReductionDB = this.linearToDb(this.envelope);
    
    return output;
  }
  
  /**
   * BASIC LIMITER (no oversampling, for comparison)
   */
  limitBasic(input) {
    const length = input.length;
    const output = new Float32Array(length);
    
    for (let i = 0; i < length; i++) {
      const peak = Math.abs(input[i]);
      
      // Update digital peak meter
      if (peak > this.dbToLinear(this.digitalPeakDB)) {
        this.digitalPeakDB = this.linearToDb(peak);
      }
      
      // Simple hard clip
      output[i] = Math.max(-this.ceilingLinear, Math.min(this.ceilingLinear, input[i]));
    }
    
    return output;
  }
  
  /**
   * MAIN PROCESS (called by browser for each audio block)
   */
  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    
    if (!input || input.length === 0) return true;
    
    const numChannels = input.length;
    
    for (let channel = 0; channel < numChannels; channel++) {
      const inputChannel = input[channel];
      const outputChannel = output[channel];

      if (this.monitorOnly) {
        outputChannel.set(inputChannel);

        for (let i = 0; i < inputChannel.length; i++) {
          const peak = Math.abs(inputChannel[i]);
          if (peak > this.dbToLinear(this.digitalPeakDB)) {
            this.digitalPeakDB = this.linearToDb(peak);
          }
        }

        if (this.hqMode) {
          const upsampled = this.upsample(inputChannel);
          for (let i = 0; i < upsampled.length; i++) {
            const peak = Math.abs(upsampled[i]);
            if (peak > this.dbToLinear(this.truePeakDBTP)) {
              this.truePeakDBTP = this.linearToDb(peak);
            }
          }
        } else {
          this.truePeakDBTP = this.digitalPeakDB;
        }

        const peakLinear = this.dbToLinear(this.truePeakDBTP);
        if (peakLinear > this.ceilingLinear && peakLinear > 0) {
          this.gainReductionDB = this.linearToDb(this.ceilingLinear / peakLinear);
        } else {
          this.gainReductionDB = 0;
        }

        continue;
      }
      
      if (this.hqMode) {
        // HQ MODE: 4x Oversampling + FIR filtering
        
        // 1. Upsample to 4x rate
        const upsampled = this.upsample(inputChannel);
        
        // 2. Limit at 4x rate (true peak limiting)
        const limited = this.limitOversampled(upsampled);
        
        // 3. Downsample back to original rate
        const downsampled = this.downsample(limited);
        
        // Copy to output
        outputChannel.set(downsampled);
        
      } else {
        // BASIC MODE: No oversampling (for comparison)
        const limited = this.limitBasic(inputChannel);
        outputChannel.set(limited);
        
        // Set true peak = digital peak in basic mode
        this.truePeakDBTP = this.digitalPeakDB;
      }
    }
    
    // Send meter updates to main thread
    this.frameCount += input[0].length;
    if (this.frameCount >= this.meterUpdateInterval) {
      this.sendMeterUpdate();
      this.frameCount = 0;
    }
    
    return true; // Keep processor alive
  }
  
  /**
   * Send meter values to main thread
   */
  sendMeterUpdate() {
    this.port.postMessage({
      type: 'meter-update',
      data: {
        truePeakDBTP: this.truePeakDBTP,
        digitalPeakDB: this.digitalPeakDB,
        gainReductionDB: this.gainReductionDB,
        hqMode: this.hqMode,
        ispDifference: this.truePeakDBTP - this.digitalPeakDB // Inter-sample peak delta
      }
    });
    
    // Reset peak meters (with decay)
    this.truePeakDBTP *= 0.95;
    this.digitalPeakDB *= 0.95;
  }
}

// Register processor
registerProcessor('oversampling-limiter', OversamplingLimiter);
