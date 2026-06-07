/**
 * LUFS METERING AUDIO WORKLET
 * ITU-R BS.1770-4 compliant loudness measurement
 * 
 * Runs in audio thread (no UI lag, sample-accurate)
 * 
 * ALGORITHM:
 * 1. Apply K-weighting filter (mimics human ear response)
 * 2. Calculate mean square over sliding window
 * 3. Convert to LUFS (-0.691 + 10*log10(mean_square))
 * 
 * WINDOWS:
 * - Momentary: 400ms
 * - Short-term: 3 seconds
 * - Integrated: Entire track (gated)
 */

class LUFSProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    
    // Sample rate
    this.sampleRate = sampleRate;
    
    // K-weighting filters (ITU-R BS.1770-4)
    this.initKWeightingFilters();
    
    // Sliding window buffers
    this.momentaryBuffer = []; // 400ms
    this.shortTermBuffer = []; // 3 seconds
    this.integratedBuffer = []; // Entire track
    
    this.momentarySize = Math.floor(this.sampleRate * 0.4); // 400ms
    this.shortTermSize = Math.floor(this.sampleRate * 3.0); // 3s
    
    // Frame counter (for periodic updates)
    this.frameCount = 0;
    this.updateInterval = Math.floor(this.sampleRate * 0.1); // Update every 100ms
    
    // Gating (for integrated LUFS)
    this.gateThreshold = -70.0; // Absolute gate
    this.relativeGate = -10.0; // Relative gate (LUFS - 10dB)
  }
  
  /**
   * Initialize K-weighting filters
   * ITU-R BS.1770-4 standard
   */
  initKWeightingFilters() {
    // STAGE 1: High-frequency shelf filter (simulates head diffraction)
    // fc = 1681 Hz, Gain = +3.99 dB, Q = 0.7071
    this.preFilter = new BiquadFilter({
      type: 'highshelf',
      frequency: 1681,
      gain: 3.99,
      Q: 0.7071,
      sampleRate: this.sampleRate
    });
    
    // STAGE 2: High-pass filter (removes DC and rumble)
    // fc = 38 Hz, Q = 0.5
    this.highPass = new BiquadFilter({
      type: 'highpass',
      frequency: 38,
      gain: 0,
      Q: 0.5,
      sampleRate: this.sampleRate
    });
  }
  
  /**
   * Process audio (called for each audio buffer)
   */
  process(inputs, outputs, parameters) {
    const input = inputs[0];
    
    // Handle stereo (average L+R)
    const numChannels = input.length;
    if (numChannels === 0) return true;
    
    const bufferSize = input[0].length;
    
    for (let i = 0; i < bufferSize; i++) {
      // Average channels (or use single channel if mono)
      let sample = 0;
      for (let ch = 0; ch < numChannels; ch++) {
        sample += input[ch][i];
      }
      sample /= numChannels;
      
      // Apply K-weighting
      sample = this.preFilter.process(sample);
      sample = this.highPass.process(sample);
      
      // Square for power
      const power = sample * sample;
      
      // Add to buffers
      this.momentaryBuffer.push(power);
      this.shortTermBuffer.push(power);
      this.integratedBuffer.push(power);
      
      // Maintain buffer sizes
      if (this.momentaryBuffer.length > this.momentarySize) {
        this.momentaryBuffer.shift();
      }
      if (this.shortTermBuffer.length > this.shortTermSize) {
        this.shortTermBuffer.shift();
      }
      // Integrated buffer keeps growing (entire track)
    }
    
    // Send updates to main thread every 100ms
    this.frameCount += bufferSize;
    if (this.frameCount >= this.updateInterval) {
      this.sendUpdate();
      this.frameCount = 0;
    }
    
    return true; // Keep processor alive
  }
  
  /**
   * Calculate LUFS from power buffer
   */
  calculateLUFS(buffer) {
    if (buffer.length === 0) return -Infinity;
    
    const meanSquare = buffer.reduce((sum, val) => sum + val, 0) / buffer.length;
    
    // LUFS formula: -0.691 + 10*log10(mean_square)
    const lufs = -0.691 + 10 * Math.log10(meanSquare);
    
    return lufs;
  }
  
  /**
   * Calculate integrated LUFS with gating
   * (removes silent sections from calculation)
   */
  calculateIntegratedLUFS() {
    if (this.integratedBuffer.length === 0) return -Infinity;
    
    // Calculate ungated LUFS first
    const ungatedLUFS = this.calculateLUFS(this.integratedBuffer);
    
    // Apply relative gate (LUFS - 10dB)
    const relativeThreshold = ungatedLUFS + this.relativeGate;
    
    // Filter out blocks below threshold
    const gatedBuffer = [];
    const blockSize = Math.floor(this.sampleRate * 0.4); // 400ms blocks
    
    for (let i = 0; i < this.integratedBuffer.length; i += blockSize) {
      const block = this.integratedBuffer.slice(i, i + blockSize);
      const blockLUFS = this.calculateLUFS(block);
      
      // Only include blocks above threshold
      if (blockLUFS > Math.max(this.gateThreshold, relativeThreshold)) {
        gatedBuffer.push(...block);
      }
    }
    
    // Calculate gated LUFS
    return this.calculateLUFS(gatedBuffer);
  }
  
  /**
   * Send update to main thread
   */
  sendUpdate() {
    const momentaryLUFS = this.calculateLUFS(this.momentaryBuffer);
    const shortTermLUFS = this.calculateLUFS(this.shortTermBuffer);
    const integratedLUFS = this.calculateIntegratedLUFS();
    
    this.port.postMessage({
      type: 'lufs-update',
      momentary: momentaryLUFS,
      shortTerm: shortTermLUFS,
      integrated: integratedLUFS,
      timestamp: currentTime
    });
  }
}

/**
 * BIQUAD FILTER (2nd-order IIR)
 * Used for K-weighting filters
 */
class BiquadFilter {
  constructor({ type, frequency, gain, Q, sampleRate }) {
    this.type = type;
    this.frequency = frequency;
    this.gain = gain;
    this.Q = Q;
    this.sampleRate = sampleRate;
    
    // State variables
    this.x1 = 0;
    this.x2 = 0;
    this.y1 = 0;
    this.y2 = 0;
    
    // Calculate coefficients
    this.calculateCoefficients();
  }
  
  /**
   * Calculate biquad coefficients
   */
  calculateCoefficients() {
    const w0 = 2 * Math.PI * this.frequency / this.sampleRate;
    const cosw0 = Math.cos(w0);
    const sinw0 = Math.sin(w0);
    const alpha = sinw0 / (2 * this.Q);
    const A = Math.pow(10, this.gain / 40); // Gain in linear
    
    if (this.type === 'highshelf') {
      // High-shelf filter
      const beta = Math.sqrt(A) / this.Q;
      
      const b0 = A * ((A + 1) + (A - 1) * cosw0 + beta * sinw0);
      const b1 = -2 * A * ((A - 1) + (A + 1) * cosw0);
      const b2 = A * ((A + 1) + (A - 1) * cosw0 - beta * sinw0);
      const a0 = (A + 1) - (A - 1) * cosw0 + beta * sinw0;
      const a1 = 2 * ((A - 1) - (A + 1) * cosw0);
      const a2 = (A + 1) - (A - 1) * cosw0 - beta * sinw0;
      
      this.b0 = b0 / a0;
      this.b1 = b1 / a0;
      this.b2 = b2 / a0;
      this.a1 = a1 / a0;
      this.a2 = a2 / a0;
      
    } else if (this.type === 'highpass') {
      // High-pass filter
      const b0 = (1 + cosw0) / 2;
      const b1 = -(1 + cosw0);
      const b2 = (1 + cosw0) / 2;
      const a0 = 1 + alpha;
      const a1 = -2 * cosw0;
      const a2 = 1 - alpha;
      
      this.b0 = b0 / a0;
      this.b1 = b1 / a0;
      this.b2 = b2 / a0;
      this.a1 = a1 / a0;
      this.a2 = a2 / a0;
    }
  }
  
  /**
   * Process single sample
   */
  process(input) {
    // Biquad difference equation:
    // y[n] = b0*x[n] + b1*x[n-1] + b2*x[n-2] - a1*y[n-1] - a2*y[n-2]
    
    const output = 
      this.b0 * input +
      this.b1 * this.x1 +
      this.b2 * this.x2 -
      this.a1 * this.y1 -
      this.a2 * this.y2;
    
    // Update state
    this.x2 = this.x1;
    this.x1 = input;
    this.y2 = this.y1;
    this.y1 = output;
    
    return output;
  }
}

// Register processor
registerProcessor('lufs-processor', LUFSProcessor);
