/**
 * STEREO SANITY TEST HARNESS
 * Automated pass/fail testing for stereo integrity
 * 
 * Tests:
 * 1. Hard channel isolation (crosstalk < -60dB)
 * 2. Frequency identity (bleed < -40dB)
 * 3. Click transient preservation (timing within 1 sample)
 * 4. Wide noise burst mono compatibility (mono sum drop < 1.5dB)
 * 5. Linked GR behavior visibility (observation only)
 * 
 * Runs at both 44.1k and 48k sample rates
 * Returns JSON report with pass/fail per test
 * Saves rendered WAVs for manual inspection
 */

import { AudioProcessor, ProcessingSettings } from './audio-processor';
import { getGenrePreset } from '../data/genre-presets';

export interface TestResult {
  pass: boolean;
  measured: number;
  threshold: number;
  details: string;
}

export interface TestReport {
  sampleRate: number;
  mode: string;
  timestamp: string;
  tests: {
    isolation_Lonly: TestResult;
    isolation_Ronly: TestResult;
    freqIdentity_L: TestResult;
    freqIdentity_R: TestResult;
    monoNoise: TestResult;
    clickSmear: TestResult;
    linkedGR?: string; // Observation only
  };
  bypassBuffers: {
    [testName: string]: AudioBuffer;
  };
  processedBuffers: {
    [testName: string]: AudioBuffer;
  };
}

export class StereoTestHarness {
  private sampleRates = [44100, 48000];
  
  /**
   * Run full test suite at both sample rates
   */
  async runFullSuite(settings: ProcessingSettings): Promise<TestReport[]> {
    const reports: TestReport[] = [];
    
    for (const sampleRate of this.sampleRates) {
      console.log(`\n🧪 Running stereo tests at ${sampleRate}Hz...`);
      const report = await this.runSuiteAtSampleRate(sampleRate, settings);
      reports.push(report);
      
      // Log results
      this.logReport(report);
    }
    
    return reports;
  }
  
  /**
   * Run test suite at specific sample rate
   */
  private async runSuiteAtSampleRate(sampleRate: number, settings: ProcessingSettings): Promise<TestReport> {
    const report: TestReport = {
      sampleRate,
      mode: settings.logicMode,
      timestamp: new Date().toISOString(),
      tests: {} as any,
      bypassBuffers: {},
      processedBuffers: {},
    };
    
    // Test 1: Hard channel isolation (L-only)
    {
      const { bypass, processed } = await this.generateTestSignal(
        sampleRate,
        settings,
        'isolation_Lonly',
        (buffer, sr) => this.generateSineWave(buffer, sr, 1000, -12, 'left')
      );
      
      report.bypassBuffers['isolation_Lonly'] = bypass;
      report.processedBuffers['isolation_Lonly'] = processed;
      
      const crosstalkDb = this.measureCrosstalk(processed, 'left');
      report.tests.isolation_Lonly = {
        pass: crosstalkDb < -60,
        measured: crosstalkDb,
        threshold: -60,
        details: `Right channel should be <-60dB when left is active. Measured: ${crosstalkDb.toFixed(1)}dB`,
      };
    }
    
    // Test 1: Hard channel isolation (R-only)
    {
      const { bypass, processed } = await this.generateTestSignal(
        sampleRate,
        settings,
        'isolation_Ronly',
        (buffer, sr) => this.generateSineWave(buffer, sr, 2000, -12, 'right')
      );
      
      report.bypassBuffers['isolation_Ronly'] = bypass;
      report.processedBuffers['isolation_Ronly'] = processed;
      
      const crosstalkDb = this.measureCrosstalk(processed, 'right');
      report.tests.isolation_Ronly = {
        pass: crosstalkDb < -60,
        measured: crosstalkDb,
        threshold: -60,
        details: `Left channel should be <-60dB when right is active. Measured: ${crosstalkDb.toFixed(1)}dB`,
      };
    }
    
    // Test 2: Frequency identity (dual-tone)
    {
      const { bypass, processed } = await this.generateTestSignal(
        sampleRate,
        settings,
        'freqIdentity',
        (buffer, sr) => this.generateDualTone(buffer, sr, 1000, 2000, -18)
      );
      
      report.bypassBuffers['freqIdentity'] = bypass;
      report.processedBuffers['freqIdentity'] = processed;
      
      const leftBleed = this.measureFrequencyBleed(processed, sampleRate, 'left', 1000, 2000);
      const rightBleed = this.measureFrequencyBleed(processed, sampleRate, 'right', 2000, 1000);
      
      report.tests.freqIdentity_L = {
        pass: leftBleed < -40,
        measured: leftBleed,
        threshold: -40,
        details: `Left should have 1kHz, not 2kHz. 2kHz bleed: ${leftBleed.toFixed(1)}dB`,
      };
      
      report.tests.freqIdentity_R = {
        pass: rightBleed < -40,
        measured: rightBleed,
        threshold: -40,
        details: `Right should have 2kHz, not 1kHz. 1kHz bleed: ${rightBleed.toFixed(1)}dB`,
      };
    }
    
    // Test 3: Click transient preservation
    {
      const { bypass, processed } = await this.generateTestSignal(
        sampleRate,
        settings,
        'clickSmear',
        (buffer, sr) => this.generateClickTrain(buffer, sr, 2)
      );
      
      report.bypassBuffers['clickSmear'] = bypass;
      report.processedBuffers['clickSmear'] = processed;
      
      const timingShiftSamples = this.measureClickSmear(bypass, processed);
      report.tests.clickSmear = {
        pass: Math.abs(timingShiftSamples) <= 1,
        measured: timingShiftSamples,
        threshold: 1,
        details: `Peak timing shift: ${timingShiftSamples} samples. Should be ≤1 sample (or match previewDelay).`,
      };
    }
    
    // Test 4: Wide noise burst mono compatibility
    {
      const { bypass, processed } = await this.generateTestSignal(
        sampleRate,
        settings,
        'monoNoise',
        (buffer, sr) => this.generateWideNoiseBursts(buffer, sr)
      );
      
      report.bypassBuffers['monoNoise'] = bypass;
      report.processedBuffers['monoNoise'] = processed;
      
      const monoDropDb = this.measureMonoSumDrop(bypass, processed);
      report.tests.monoNoise = {
        pass: Math.abs(monoDropDb) < 1.5,
        measured: monoDropDb,
        threshold: 1.5,
        details: `Mono sum RMS drop: ${monoDropDb.toFixed(2)}dB. Should be <1.5dB.`,
      };
    }
    
    // Test 5: Linked GR (observation only)
    report.tests.linkedGR = 'Observation: Check if left kick pumps right pad. Not auto-tested.';
    
    return report;
  }
  
  /**
   * Generate test signal with bypass and processed renders
   */
  private async generateTestSignal(
    sampleRate: number,
    settings: ProcessingSettings,
    testName: string,
    signalGenerator: (buffer: AudioBuffer, sr: number) => void
  ): Promise<{ bypass: AudioBuffer; processed: AudioBuffer }> {
    const duration = 5; // 5 seconds
    const channels = 2;
    
    // Create test signal buffer
    const offlineContext = new OfflineAudioContext(channels, sampleRate * duration, sampleRate);
    const testBuffer = offlineContext.createBuffer(channels, sampleRate * duration, sampleRate);
    signalGenerator(testBuffer, sampleRate);
    
    // === BYPASS RENDER (no processing) ===
    const bypassContext = new OfflineAudioContext(channels, sampleRate * duration, sampleRate);
    const bypassSource = bypassContext.createBufferSource();
    bypassSource.buffer = testBuffer;
    bypassSource.connect(bypassContext.destination);
    bypassSource.start(0);
    const bypass = await bypassContext.startRendering();
    
    // === PROCESSED RENDER (full chain) ===
    const processedContext = new OfflineAudioContext(channels, sampleRate * duration, sampleRate);
    
    // Build the full processing chain
    const source = processedContext.createBufferSource();
    source.buffer = testBuffer;
    
    // Chain connection (mimics audio-processor.ts processAudio method)
    let currentNode: AudioNode = source;
    
    const isLiveMode = settings.performanceMode === 'live';
    
    // Create temporary processor to access stage methods
    // Note: This is a bit of a hack - ideally we'd refactor AudioProcessor
    // to work with any AudioContext, not just instance context
    const processor = new AudioProcessor();
    
    // PHASE 3: Bus Glue Compression (ALWAYS ACTIVE)
    const ssl = (processor as any).createFinalStage(processedContext, settings);
    currentNode.connect(ssl.input);
    currentNode = ssl.output;
    
    // PHASE 3.5: M/S Processing (STUDIO ONLY)
    if (!isLiveMode) {
      const genrePreset = getGenrePreset(settings.genreId);
      const ms = (processor as any).createMidSideStage(processedContext, settings, genrePreset);
      currentNode.connect(ms.input);
      currentNode = ms.output;
    }
    
    // PHASE 4: Cascaded Limiting (ALWAYS ACTIVE)
    const limiter = (processor as any).createWeissLimiterStage(processedContext, settings);
    currentNode.connect(limiter.input);
    currentNode = limiter.output;
    
    // Connect to destination
    currentNode.connect(processedContext.destination);
    source.start(0);
    
    const processed = await processedContext.startRendering();
    
    return { bypass, processed };
  }
  
  // ========================================================================
  // SIGNAL GENERATORS
  // ========================================================================
  
  /**
   * Generate sine wave on specified channel
   */
  private generateSineWave(
    buffer: AudioBuffer,
    sampleRate: number,
    frequency: number,
    amplitudeDB: number,
    channel: 'left' | 'right'
  ): void {
    const amplitude = Math.pow(10, amplitudeDB / 20);
    const targetChannel = channel === 'left' ? 0 : 1;
    const channelData = buffer.getChannelData(targetChannel);
    
    for (let i = 0; i < channelData.length; i++) {
      channelData[i] = amplitude * Math.sin(2 * Math.PI * frequency * i / sampleRate);
    }
    
    // Silence the other channel
    const otherChannel = channel === 'left' ? 1 : 0;
    const otherData = buffer.getChannelData(otherChannel);
    otherData.fill(0);
  }
  
  /**
   * Generate dual-tone test (different freq per channel)
   */
  private generateDualTone(
    buffer: AudioBuffer,
    sampleRate: number,
    freqLeft: number,
    freqRight: number,
    amplitudeDB: number
  ): void {
    const amplitude = Math.pow(10, amplitudeDB / 20);
    
    // Left channel: freqLeft
    const leftData = buffer.getChannelData(0);
    for (let i = 0; i < leftData.length; i++) {
      leftData[i] = amplitude * Math.sin(2 * Math.PI * freqLeft * i / sampleRate);
    }
    
    // Right channel: freqRight
    const rightData = buffer.getChannelData(1);
    for (let i = 0; i < rightData.length; i++) {
      rightData[i] = amplitude * Math.sin(2 * Math.PI * freqRight * i / sampleRate);
    }
  }
  
  /**
   * Generate click train (impulse train)
   */
  private generateClickTrain(
    buffer: AudioBuffer,
    sampleRate: number,
    clickRate: number // Hz (e.g., 2 Hz = one click every 0.5s)
  ): void {
    const leftData = buffer.getChannelData(0);
    const rightData = buffer.getChannelData(1);
    
    const clickPeriodSamples = sampleRate / clickRate;
    
    // Generate clicks on left channel only
    for (let i = 0; i < leftData.length; i++) {
      if (i % Math.floor(clickPeriodSamples) === 0) {
        leftData[i] = 0.5; // Click amplitude
      } else {
        leftData[i] = 0;
      }
    }
    
    // Silence right channel
    rightData.fill(0);
  }
  
  /**
   * Generate wide noise bursts (uncorrelated L/R)
   */
  private generateWideNoiseBursts(
    buffer: AudioBuffer,
    sampleRate: number
  ): void {
    const leftData = buffer.getChannelData(0);
    const rightData = buffer.getChannelData(1);
    
    const burstDuration = 0.25; // 250ms
    const burstPeriod = 1.0; // 1 second
    const burstSamples = Math.floor(sampleRate * burstDuration);
    const periodSamples = Math.floor(sampleRate * burstPeriod);
    
    const targetRMS = Math.pow(10, -18 / 20); // -18 dBFS RMS
    
    for (let i = 0; i < leftData.length; i++) {
      const inBurst = (i % periodSamples) < burstSamples;
      
      if (inBurst) {
        // Uncorrelated noise (different seeds)
        leftData[i] = (Math.random() * 2 - 1) * targetRMS * Math.sqrt(2);
        rightData[i] = (Math.random() * 2 - 1) * targetRMS * Math.sqrt(2);
      } else {
        leftData[i] = 0;
        rightData[i] = 0;
      }
    }
  }
  
  // ========================================================================
  // MEASUREMENT FUNCTIONS
  // ========================================================================
  
  /**
   * Measure crosstalk: How much signal leaks to the opposite channel
   * @returns Crosstalk in dB (negative = good, e.g. -72dB)
   */
  private measureCrosstalk(buffer: AudioBuffer, activeChannel: 'left' | 'right'): number {
    const activeIndex = activeChannel === 'left' ? 0 : 1;
    const silentIndex = activeChannel === 'left' ? 1 : 0;
    
    const activeData = buffer.getChannelData(activeIndex);
    const silentData = buffer.getChannelData(silentIndex);
    
    const activeRMS = this.calculateRMS(activeData);
    const silentRMS = this.calculateRMS(silentData);
    
    // Crosstalk in dB
    const crosstalkDb = 20 * Math.log10(silentRMS / activeRMS);
    
    return crosstalkDb;
  }
  
  /**
   * Measure frequency bleed: How much wrong frequency appears in channel
   * @returns Bleed in dB relative to correct frequency (negative = good)
   */
  private measureFrequencyBleed(
    buffer: AudioBuffer,
    sampleRate: number,
    channel: 'left' | 'right',
    correctFreq: number,
    wrongFreq: number
  ): number {
    const channelIndex = channel === 'left' ? 0 : 1;
    const data = buffer.getChannelData(channelIndex);
    
    // Simple FFT-like analysis using DFT at specific frequencies
    const correctMagnitude = this.measureFrequencyMagnitude(data, sampleRate, correctFreq);
    const wrongMagnitude = this.measureFrequencyMagnitude(data, sampleRate, wrongFreq);
    
    // Bleed in dB
    const bleedDb = 20 * Math.log10(wrongMagnitude / correctMagnitude);
    
    return bleedDb;
  }
  
  /**
   * Measure click smear: Peak timing difference
   * @returns Timing shift in samples
   */
  private measureClickSmear(bypass: AudioBuffer, processed: AudioBuffer): number {
    const bypassData = bypass.getChannelData(0);
    const processedData = processed.getChannelData(0);
    
    // Find first click peak in bypass
    let bypassPeakIndex = 0;
    let bypassPeakValue = 0;
    for (let i = 0; i < bypassData.length; i++) {
      if (Math.abs(bypassData[i]) > bypassPeakValue) {
        bypassPeakValue = Math.abs(bypassData[i]);
        bypassPeakIndex = i;
      }
    }
    
    // Find first click peak in processed (within ±1000 samples of bypass)
    let processedPeakIndex = 0;
    let processedPeakValue = 0;
    const searchStart = Math.max(0, bypassPeakIndex - 1000);
    const searchEnd = Math.min(processedData.length, bypassPeakIndex + 1000);
    
    for (let i = searchStart; i < searchEnd; i++) {
      if (Math.abs(processedData[i]) > processedPeakValue) {
        processedPeakValue = Math.abs(processedData[i]);
        processedPeakIndex = i;
      }
    }
    
    // Return timing difference in samples
    return processedPeakIndex - bypassPeakIndex;
  }
  
  /**
   * Measure mono sum drop: RMS change when summing to mono
   * @returns Drop in dB (negative = hollowing)
   */
  private measureMonoSumDrop(bypass: AudioBuffer, processed: AudioBuffer): number {
    // Calculate mono sum for bypass
    const bypassL = bypass.getChannelData(0);
    const bypassR = bypass.getChannelData(1);
    const bypassMono = new Float32Array(bypassL.length);
    for (let i = 0; i < bypassMono.length; i++) {
      bypassMono[i] = (bypassL[i] + bypassR[i]) / 2;
    }
    const bypassMonoRMS = this.calculateRMS(bypassMono);
    
    // Calculate mono sum for processed
    const processedL = processed.getChannelData(0);
    const processedR = processed.getChannelData(1);
    const processedMono = new Float32Array(processedL.length);
    for (let i = 0; i < processedMono.length; i++) {
      processedMono[i] = (processedL[i] + processedR[i]) / 2;
    }
    const processedMonoRMS = this.calculateRMS(processedMono);
    
    // Drop in dB
    const dropDb = 20 * Math.log10(processedMonoRMS / bypassMonoRMS);
    
    return dropDb;
  }
  
  // ========================================================================
  // UTILITY FUNCTIONS
  // ========================================================================
  
  /**
   * Calculate RMS of signal
   */
  private calculateRMS(data: Float32Array): number {
    let sumSquares = 0;
    for (let i = 0; i < data.length; i++) {
      sumSquares += data[i] * data[i];
    }
    return Math.sqrt(sumSquares / data.length);
  }
  
  /**
   * Measure magnitude of specific frequency using DFT
   */
  private measureFrequencyMagnitude(data: Float32Array, sampleRate: number, frequency: number): number {
    const N = data.length;
    let real = 0;
    let imag = 0;
    
    for (let n = 0; n < N; n++) {
      const angle = -2 * Math.PI * frequency * n / sampleRate;
      real += data[n] * Math.cos(angle);
      imag += data[n] * Math.sin(angle);
    }
    
    const magnitude = Math.sqrt(real * real + imag * imag) / N;
    return magnitude;
  }
  
  /**
   * Log test report to console
   */
  private logReport(report: TestReport): void {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`STEREO TEST REPORT - ${report.sampleRate}Hz - ${report.mode.toUpperCase()}`);
    console.log(`${'='.repeat(60)}\n`);
    
    const tests = report.tests;
    const results = [
      { name: 'Isolation (L-only)', result: tests.isolation_Lonly },
      { name: 'Isolation (R-only)', result: tests.isolation_Ronly },
      { name: 'Freq Identity (L)', result: tests.freqIdentity_L },
      { name: 'Freq Identity (R)', result: tests.freqIdentity_R },
      { name: 'Mono Noise Drop', result: tests.monoNoise },
      { name: 'Click Smear', result: tests.clickSmear },
    ];
    
    let passCount = 0;
    let totalCount = results.length;
    
    for (const { name, result } of results) {
      const status = result.pass ? '✅ PASS' : '❌ FAIL';
      const icon = result.pass ? '✅' : '❌';
      console.log(`${icon} ${name}: ${status}`);
      console.log(`   ${result.details}`);
      console.log();
      
      if (result.pass) passCount++;
    }
    
    console.log(`${'='.repeat(60)}`);
    console.log(`SUMMARY: ${passCount}/${totalCount} tests passed`);
    console.log(`${'='.repeat(60)}\n`);
    
    if (tests.linkedGR) {
      console.log(`📝 Linked GR: ${tests.linkedGR}\n`);
    }
  }
}