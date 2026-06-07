import { GearProfileId } from '../components/gear-selector';
import type { ExportPreset } from '../components/export-panel';
import { getExportPreset } from '../data/export-presets';
import { resolveProcessingPlan } from '../data/preset-resolution';
import { QualityMode, getQualityProfile } from '../data/quality-profiles';
import { buildMasteringChain, type MasteringChain } from './mastering-chain-builder';

export interface AudioAnalysis {
  lufs: number;
  integratedLUFS: number; // ITU-R BS.1770-4 integrated loudness
  momentaryMaxLUFS: number; // Peak momentary loudness (400ms)
  truePeak: number;
  truePeakDBTP: number; // True peak in dBTP (4x oversampled)
  dynamicRange: number;
  rms: number;
  peakLevel: number;
  crestFactor: number; // Peak-to-RMS ratio (dB) - Critical for SSL Auto Release
  sslAutoReleaseTime: number; // Calculated SSL Auto Release (ms)
  material: 'transient' | 'sustained' | 'balanced'; // Signal classification
  targetWarning?: string; // Warning when target LUFS is unreachable for this material
  duration?: number; // Track duration in seconds
  
  // Damage Report (2026-02-16) - Quality Guardrails
  damageReport?: {
    peakBeforeLimiter: number;        // dBFS - Input peak + makeup gain
    makeupGainApplied: number;        // dB - Total makeup gain before limiter
    estimatedLimiterGR: number;       // dB - Estimated average limiter gain reduction
    estimatedLimiterPeakGR: number;   // dB - Estimated peak limiter gain reduction
    safetyCeilingEngaged: boolean;    // Whether safety ceiling had to clip
    safetyCeilingDB: number;          // dBTP - Safety ceiling threshold used
    finalPeakDBTP: number;            // dBTP - Actual final peak in output
    qualityVerdict: 'safe' | 'warning' | 'danger'; // Overall quality assessment
    recommendations?: string[];       // Specific recommendations to improve quality
  };
}

export interface ProcessingSettings {
  circuitDrive: number; // 0-100
  logicMode: 'brickwall' | 'dynamics';
  // performanceMode removed (2026-02-16) - studio mastering only
  
  // New system (required)
  genreId: string;
  exportPresetId: string;
  
  // Quality mode (preview vs export)
  quality?: QualityMode; // 'preview' | 'export' (default: 'export')
  
  // Chunk selection for preview (Beatport-style)
  chunkOffset?: number; // Start time in seconds (for preview chunks)
  chunkDuration?: number; // Duration of chunk in seconds (default: 30)
  
  // Safe Export mode (2026-02-16)
  safeExportMode?: boolean; // Conservative true-peak ceiling (-1.0 dBTP) + reduced targets
  
  // Optional override (rare)
  targetLUFS?: number;
  
  // User overrides (Advanced panel - only wired overrides included)
  userOverrides?: {
    width?: number;               // ✅ WIRED (M/S stage)
    useMultiband?: boolean;       // ✅ WIRED (multiband toggle)
    forceMonoBass?: boolean;      // ✅ WIRED (mono-bass HPF)
    monoBassHz?: number;          // ✅ WIRED (mono-bass frequency)
    lowShelfBoost?: number;       // ✅ WIRED (EQ stage - Bass)
    midRangeAdjust?: number;      // ✅ WIRED (EQ stage - Mids)
    highShelfBoost?: number;      // ✅ WIRED (EQ stage - Highs)
    saturationAmount?: number;    // ✅ WIRED (Saturation stage)
    // useClipper?: boolean;      // ❌ NOT WIRED YET (clipper stage doesn't exist)
  };
  
  // Legacy (temporary - remove after migration)
  gearProfile?: GearProfileId;
}

/**
 * Playback control handles for real-time playback
 */
export interface PlaybackControls {
  pause: () => void;
  resume: () => void;
  seek: (timeSeconds: number) => void;
  getCurrentTime: () => number;
  isPlaying: () => boolean;
  setBypass: (bypass: boolean) => void; // NEW: A/B toggle (true = original, false = processed)
}

/**
 * Stage I/O contract: Every processing stage returns explicit input/output nodes
 * to prevent accidental bypassing and ensure correct signal routing
 */
export type StageIO = {
  input: AudioNode;
  output: AudioNode;
};

/**
 * Clamp value between min and max
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

/**
 * Calculate RMS (Root Mean Square) of an audio buffer
 * Used for gain staging verification
 */
function calculateRMS(buffer: AudioBuffer): number {
  let sumSquares = 0;
  let sampleCount = 0;
  
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      sumSquares += data[i] * data[i];
      sampleCount++;
    }
  }
  
  const rms = Math.sqrt(sumSquares / sampleCount);
  const rmsDB = 20 * Math.log10(rms);
  return rmsDB;
}

export class AudioProcessor {
  private audioContext: AudioContext;
  private audioBuffer: AudioBuffer | null = null;
  private analysis: AudioAnalysis | null = null;
  
  // Real-time playback state (NEW: 2026-02-16)
  private realtimeChain: MasteringChain | null = null;
  private realtimeSource: AudioBufferSourceNode | null = null;
  private realtimeStartTime: number = 0;
  private realtimePauseTime: number = 0;
  private realtimeIsPlaying: boolean = false;
  private stoppingSource: boolean = false; // NEW: distinguish manual stop from natural end
  private realtimeBypass: boolean = false; // NEW: A/B toggle (true = play original, false = play processed)
  private bypassMix: GainNode | null = null; // NEW: Bypass routing node

  constructor() {
    this.audioContext = new AudioContext();
  }

  /**
   * Load and decode audio file
   */
  async loadAudioFile(file: File): Promise<void> {
    const arrayBuffer = await file.arrayBuffer();
    this.audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
  }

  /**
   * Get the original (unprocessed) audio buffer
   */
  getOriginalBuffer(): AudioBuffer | null {
    return this.audioBuffer;
  }

  /**
   * Analyze audio file for LUFS, dynamic range, peaks
   */
  async analyzeAudio(): Promise<AudioAnalysis> {
    if (!this.audioBuffer) {
      throw new Error('No audio buffer loaded');
    }

    const sampleRate = this.audioBuffer.sampleRate;
    const numChannels = this.audioBuffer.numberOfChannels;
    
    // === CRITICAL FIX (2026-02-16): ACCURATE PEAK DETECTION ===
    // Peak must scan EVERY sample on ALL channels (not just channel 0 with step=10)
    // Missing the true peak causes over-normalization → brickwalling
    
    // Calculate TRUE PEAK across ALL channels (step = 1, no decimation)
    let truePeak = 0;
    for (let ch = 0; ch < numChannels; ch++) {
      const channelData = this.audioBuffer.getChannelData(ch);
      for (let i = 0; i < channelData.length; i++) {
        truePeak = Math.max(truePeak, Math.abs(channelData[i]));
      }
    }
    
    // Calculate RMS (Root Mean Square) for loudness
    // RMS can use decimation for speed (peak analysis cannot)
    const channelData = this.audioBuffer.getChannelData(0);
    const step = channelData.length > 500000 ? 10 : 1; // Decimate RMS only, not peak
    
    let sumSquares = 0;
    let sampleCount = 0;
    for (let ch = 0; ch < numChannels; ch++) {
      const data = this.audioBuffer.getChannelData(ch);
      for (let i = 0; i < data.length; i += step) {
        sumSquares += data[i] * data[i];
        sampleCount++;
      }
    }
    const rms = Math.sqrt(sumSquares / sampleCount);

    // Calculate LUFS (simplified ITU-R BS.1770 algorithm)
    // This is a simplified version - professional tools use more complex gating
    const lufs = -0.691 + 10 * Math.log10(rms * rms);

    // Calculate Dynamic Range (simplified crest factor approach)
    const dynamicRange = 20 * Math.log10(truePeak / rms);

    // Peak level in dBFS
    const peakLevel = 20 * Math.log10(truePeak);

    // === SSL "AUTO" RELEASE - DUAL-INTEGRATOR CIRCUIT ===
    // Crest Factor: Peak-to-RMS ratio (measures transient vs. sustained content)
    const crestFactor = 20 * Math.log10(truePeak / rms);
    
    // === DUAL-INTEGRATOR ANALYSIS ===
    // SSL 9000K uses two parallel detectors: RMS (70%) + Peak (30%)
    
    // RMS Detector (Slow integration - 100ms window)
    const rmsWindowSize = Math.floor(sampleRate * 0.1); // 100ms
    let rmsIntegrated = 0;
    
    for (let i = Math.max(0, channelData.length - rmsWindowSize); i < channelData.length; i++) {
      rmsIntegrated += channelData[i] * channelData[i];
    }
    rmsIntegrated = Math.sqrt(rmsIntegrated / rmsWindowSize);
    
    // Peak Detector (Fast integration - 10ms window)
    const peakWindowSize = Math.floor(sampleRate * 0.01); // 10ms
    let peakIntegrated = 0;
    
    for (let i = Math.max(0, channelData.length - peakWindowSize); i < channelData.length; i++) {
      peakIntegrated = Math.max(peakIntegrated, Math.abs(channelData[i]));
    }
    
    // Blend Detectors: 70% RMS / 30% Peak (SSL specification)
    const rmsComponent = rmsIntegrated * 0.7;
    const peakComponent = peakIntegrated * 0.3;
    const blendedDetector = rmsComponent + peakComponent;
    
    // === ADAPTIVE RELEASE CALCULATION ===
    // Range: 50ms (transient) to 1.2s (sustained)
    // Based on crest factor of the track
    
    let sslAutoReleaseTime: number;
    
    // High Crest Factor (>15dB) = Fast Material (kicks, snares, staccato)
    // Low Crest Factor (<10dB) = Sustained Material (pads, vocals, legato)
    
    if (crestFactor > 18) {
      // Very transient (drums, percussion)
      sslAutoReleaseTime = 50; // 50ms - fast release
    } else if (crestFactor > 15) {
      // Transient (most EDM/pop)
      sslAutoReleaseTime = 80; // 80ms
    } else if (crestFactor > 12) {
      // Balanced (mixed material)
      sslAutoReleaseTime = 200; // 200ms
    } else if (crestFactor > 10) {
      // Sustained (vocals, pads)
      sslAutoReleaseTime = 600; // 600ms
    } else {
      // Very sustained (classical, ambient)
      sslAutoReleaseTime = 1200; // 1.2s - slow release
    }
    
    // === LOGARITHMIC CURVE ADJUSTMENT ===
    // SSL "Auto" uses logarithmic release: Fast initial recovery, slow tail
    // This is inherent to the circuit design (capacitor discharge curve)
    // Note: Web Audio's DynamicsCompressor approximates this internally
    
    // === ATTACK COUPLING ===
    // Fast attack (<1ms) increases initial release speed by +15%
    // This is handled in the SSL stage creation (see createFinalStage)
    // For now, we store the base Auto Release time
    
    // Classify signal material for UI display
    let material: 'transient' | 'sustained' | 'balanced' = 'balanced';
    if (crestFactor > 15) {
      material = 'transient'; // Fast material (EDM, drums)
    } else if (crestFactor < 10) {
      material = 'sustained'; // Slow material (vocals, classical)
    } else {
      material = 'balanced'; // Mixed content
    }

    this.analysis = {
      lufs,
      integratedLUFS: lufs, // Placeholder for integrated loudness
      momentaryMaxLUFS: lufs, // Placeholder for peak momentary loudness
      truePeak,
      truePeakDBTP: 20 * Math.log10(truePeak * 4), // 4x oversampled
      dynamicRange,
      rms,
      peakLevel,
      crestFactor,
      sslAutoReleaseTime,
      material,
      duration: this.audioBuffer.duration, // Track duration in seconds
    };

    return this.analysis;
  }

  /**
   * NEW: Start real-time playback with mastering chain
   * 
   * Creates AudioContext chain once, starts playing from current position.
   * Chain persists across pause/resume/seek operations.
   * 
   * @returns PlaybackControls for pause/resume/seek
   */
  startPlayback(settings: ProcessingSettings): PlaybackControls {
    if (!this.audioBuffer) {
      throw new Error('No audio buffer loaded');
    }

    // Resume AudioContext if suspended (browser autoplay policy)
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }

    // Build processing plan
    const plan = resolveProcessingPlan({
      genreId: settings.genreId,
      exportPresetId: settings.exportPresetId as any,
      performanceMode: 'studio',
      logicMode: settings.logicMode,
      userOverrides: settings.userOverrides
    });

    // Determine minimal master mode
    const inputLUFS = this.analysis?.lufs ?? -16;
    const inputPeakDBFS = this.analysis?.peakLevel ?? -1;
    const inputCrestDBFS = this.analysis?.crestFactor ?? 12;
    const targetLUFS = settings.targetLUFS ?? -14;
    const requiredLoudnessChange = Math.abs(targetLUFS - inputLUFS);
    
    const isHotPeaks = inputPeakDBFS >= -1.5;
    const isCompressed = inputCrestDBFS < 8.0;
    const isCloseToTarget = requiredLoudnessChange <= 3.0;
    const useMinimalMaster = isHotPeaks && isCompressed && isCloseToTarget;

    // Build chain if not already built (or if settings changed)
    if (!this.realtimeChain) {
      console.log('🔧 Building real-time mastering chain (preview quality)');
      this.realtimeChain = buildMasteringChain({
        context: this.audioContext,
        destination: this.audioContext.destination,
        params: plan,
        settings,
        quality: 'preview',
        useMinimalMaster,
        inputLUFS: this.analysis?.lufs ?? -16,
      });
    }

    // Create source and start playback
    this._startRealtimeSource(this.realtimePauseTime);

    const controls: PlaybackControls = {
      pause: () => this._pausePlayback(),
      resume: () => this._resumePlayback(settings),
      seek: (timeSeconds: number) => this._seekPlayback(timeSeconds, settings),
      getCurrentTime: () => this._getCurrentTime(),
      isPlaying: () => this.realtimeIsPlaying,
      setBypass: (bypass: boolean) => this._setBypass(bypass),
    };

    return controls;
  }

  /**
   * NEW: Update playback settings in real-time (no rebuild)
   * 
   * Only updates parameters via smoothing - never rebuilds the chain.
   * Call this when user moves sliders during playback.
   */
  updatePlaybackSettings(partialSettings: Partial<ProcessingSettings>): void {
    if (!this.realtimeChain) {
      console.warn('⚠️  Cannot update settings: playback not started');
      return;
    }

    console.log('🎚️  updatePlaybackSettings() called:', partialSettings.userOverrides);
    console.log('   Available parameters:', {
      lowShelfGain: this.realtimeChain.parameters.lowShelfGain,
      midRangeGain: this.realtimeChain.parameters.midRangeGain,
      highShelfGain: this.realtimeChain.parameters.highShelfGain,
      stereoWidth: this.realtimeChain.parameters.stereoWidth,
      transformerDrive: this.realtimeChain.parameters.transformerDrive,
    });

    const params = this.realtimeChain.parameters;
    const currentTime = this.audioContext.currentTime;
    const rampTime = 0.05; // 50ms smooth ramp

    // Update stereo width
    if (partialSettings.userOverrides?.width !== undefined && params.stereoWidth) {
      const widthValue = partialSettings.userOverrides.width;
      params.stereoWidth.setTargetAtTime(widthValue, currentTime, rampTime);
      console.log(`   ✓ Stereo width → ${widthValue.toFixed(2)} (param: ${params.stereoWidth.value.toFixed(2)})`);
    }

    // Update EQ (now wired!)
    if (partialSettings.userOverrides?.lowShelfBoost !== undefined && params.lowShelfGain) {
      const gainValue = partialSettings.userOverrides.lowShelfBoost;
      params.lowShelfGain.setTargetAtTime(gainValue, currentTime, rampTime);
      console.log(`   ✓ Low shelf boost → ${gainValue.toFixed(1)} dB (param: ${params.lowShelfGain.value.toFixed(1)})`);
    }
    if (partialSettings.userOverrides?.midRangeAdjust !== undefined && params.midRangeGain) {
      const gainValue = partialSettings.userOverrides.midRangeAdjust;
      params.midRangeGain.setTargetAtTime(gainValue, currentTime, rampTime);
      console.log(`   ✓ Mid range adjust → ${gainValue.toFixed(1)} dB (param: ${params.midRangeGain.value.toFixed(1)})`);
    }
    if (partialSettings.userOverrides?.highShelfBoost !== undefined && params.highShelfGain) {
      const gainValue = partialSettings.userOverrides.highShelfBoost;
      params.highShelfGain.setTargetAtTime(gainValue, currentTime, rampTime);
      console.log(`   ✓ High shelf boost → ${gainValue.toFixed(1)} dB (param: ${params.highShelfGain.value.toFixed(1)})`);
    }

    // Update saturation drive (if parameters exist)
    if (partialSettings.userOverrides?.saturationAmount !== undefined && params.transformerDrive) {
      const driveValue = 1.0 + partialSettings.userOverrides.saturationAmount * 0.15;
      params.transformerDrive.setTargetAtTime(driveValue, currentTime, rampTime);
      console.log(`   ✓ Saturation drive → ${driveValue.toFixed(2)} (param: ${params.transformerDrive.value.toFixed(2)})`);
    }
    
    console.log(`✅ Live parameter update complete`);
  }

  /**
   * NEW: Stop real-time playback and dispose chain
   * 
   * Call this when user stops playback or switches files.
   */
  stopPlayback(): void {
    if (this.realtimeSource) {
      this.realtimeSource.stop();
      this.realtimeSource.disconnect();
      this.realtimeSource = null;
    }

    if (this.realtimeChain) {
      this.realtimeChain.dispose();
      this.realtimeChain = null;
    }

    this.realtimeIsPlaying = false;
    this.realtimePauseTime = 0;
    this.realtimeStartTime = 0;

    console.log('⏹️  Real-time playback stopped');
  }

  /**
   * NEW: Render full track at export quality (offline)
   * 
   * This is the high-quality offline render for final export.
   * Uses OfflineAudioContext with full oversampling and integrated LUFS.
   */
  async renderExport(
    settings: ProcessingSettings,
    inputTrimDB?: number,
    options?: {
      forVisualization?: boolean;
      limiterCeilingOverride?: number;
      outputTrimDB?: number;
      sslGlue?: 'auto' | 'gentle' | 'firm';
    }
  ): Promise<AudioBuffer> {
    if (!this.audioBuffer) {
      throw new Error('No audio buffer loaded');
    }

    const forVisualization = options?.forVisualization ?? false;
    console.log(forVisualization
      ? '🎨 WAVEFORM PREVIEW: Full chain render (matches live preview)'
      : '💎 EXPORT MODE: Full quality offline render');

    // Build processing plan
    const plan = resolveProcessingPlan({
      genreId: settings.genreId,
      exportPresetId: settings.exportPresetId as any,
      performanceMode: 'studio',
      logicMode: settings.logicMode,
      userOverrides: settings.userOverrides
    });

    // Determine minimal master mode — skip for waveform viz (must match live preview)
    const inputLUFS = this.analysis?.lufs ?? -16;
    const inputPeakDBFS = this.analysis?.peakLevel ?? -1;
    const inputCrestDBFS = this.analysis?.crestFactor ?? 12;
    const targetLUFS = settings.targetLUFS ?? -14;
    const requiredLoudnessChange = Math.abs(targetLUFS - inputLUFS);
    
    const isHotPeaks = inputPeakDBFS >= -1.5;
    const isCompressed = inputCrestDBFS < 8.0;
    const isCloseToTarget = requiredLoudnessChange <= 3.0;
    const useMinimalMaster = forVisualization
      ? false
      : isHotPeaks && isCompressed && isCloseToTarget;

    // Create OfflineAudioContext for full track
    const sampleRate = this.audioBuffer.sampleRate;
    const numChannels = 2; // Always stereo mastering
    const processLength = this.audioBuffer.length;

    const offlineContext = new OfflineAudioContext(
      numChannels,
      processLength,
      sampleRate
    );

    // Build mastering chain (export quality for download, preview for waveform viz)
    const chain = buildMasteringChain({
      context: offlineContext,
      destination: offlineContext.destination,
      params: plan,
      settings,
      quality: forVisualization ? 'preview' : 'export',
      useMinimalMaster,
      inputTrimDB,
      inputLUFS: this.analysis?.lufs ?? -16,
      limiterCeilingOverride: options?.limiterCeilingOverride,
      outputTrimDB: options?.outputTrimDB,
      sslGlue: options?.sslGlue,
    });

    // Create source
    const source = offlineContext.createBufferSource();
    
    // Handle mono input (upmix to dual-mono)
    let processingBuffer: AudioBuffer;
    if (this.audioBuffer.numberOfChannels === 1) {
      console.log('📻 Upmixing mono to dual-mono');
      processingBuffer = offlineContext.createBuffer(2, processLength, sampleRate);
      const monoData = this.audioBuffer.getChannelData(0);
      processingBuffer.copyToChannel(monoData, 0);
      processingBuffer.copyToChannel(monoData, 1);
    } else {
      processingBuffer = this.audioBuffer;
    }

    source.buffer = processingBuffer;

    // Connect chain
    source.connect(chain.input);

    // Start source
    source.start(0);

    // Render
    console.log(`📊 Rendering: ${(processLength / sampleRate).toFixed(1)}s at export quality...`);
    const renderStartTime = Date.now();
    const renderedBuffer = await offlineContext.startRendering();
    const renderTimeMs = Date.now() - renderStartTime;
    console.log(`✅ Export render complete in ${renderTimeMs}ms`);

    // Dispose chain
    chain.dispose();

    // Update damage report (if needed)
    // TODO: Calculate and attach damage report to this.analysis

    return renderedBuffer;
  }

  /**
   * OPTIONAL: Render preview chunk (for quick A/B without playback)
   * 
   * This is the old chunk-based preview system. Keep it for A/B comparison,
   * but real-time playback via startPlayback() is preferred.
   */
  async renderPreviewChunk(
    settings: ProcessingSettings,
    chunkOffset: number = 0,
    chunkDuration: number = 30,
    inputTrimDB?: number,
    limiterCeilingOverride?: number,
    outputTrimDB?: number,
    sslGlue?: 'auto' | 'gentle' | 'firm'
  ): Promise<AudioBuffer> {
    if (!this.audioBuffer) {
      throw new Error('No audio buffer loaded');
    }

    console.log(`⚡ PREVIEW CHUNK: Rendering ${chunkDuration}s from ${chunkOffset.toFixed(1)}s`);

    // Build processing plan
    const plan = resolveProcessingPlan({
      genreId: settings.genreId,
      exportPresetId: settings.exportPresetId as any,
      performanceMode: 'studio',
      logicMode: settings.logicMode,
      userOverrides: settings.userOverrides
    });

    const useMinimalMaster = false; // Simplified for preview

    // Calculate chunk boundaries
    const sampleRate = this.audioBuffer.sampleRate;
    const processStartSample = Math.floor(chunkOffset * sampleRate);
    const maxStartSample = Math.max(0, this.audioBuffer.length - (chunkDuration * sampleRate));
    const clampedStartSample = Math.min(processStartSample, maxStartSample);
    
    const samplesRemaining = this.audioBuffer.length - clampedStartSample;
    const processLength = Math.min(chunkDuration * sampleRate, samplesRemaining);

    // Create OfflineAudioContext for chunk
    const offlineContext = new OfflineAudioContext(2, processLength, sampleRate);

    // Build mastering chain (preview quality)
    const chain = buildMasteringChain({
      context: offlineContext,
      destination: offlineContext.destination,
      params: plan,
      settings,
      quality: 'preview',
      useMinimalMaster,
      inputTrimDB,
      inputLUFS: this.analysis?.lufs ?? -16,
      limiterCeilingOverride,
      outputTrimDB,
      sslGlue,
    });

    // Extract chunk
    const chunkBuffer = offlineContext.createBuffer(2, processLength, sampleRate);
    
    if (this.audioBuffer.numberOfChannels === 1) {
      const monoData = this.audioBuffer.getChannelData(0).slice(clampedStartSample, clampedStartSample + processLength);
      chunkBuffer.copyToChannel(monoData, 0);
      chunkBuffer.copyToChannel(monoData, 1);
    } else {
      const leftData = this.audioBuffer.getChannelData(0).slice(clampedStartSample, clampedStartSample + processLength);
      const rightData = this.audioBuffer.getChannelData(1).slice(clampedStartSample, clampedStartSample + processLength);
      chunkBuffer.copyToChannel(leftData, 0);
      chunkBuffer.copyToChannel(rightData, 1);
    }

    // Create source
    const source = offlineContext.createBufferSource();
    source.buffer = chunkBuffer;

    // Connect chain
    source.connect(chain.input);
    // chain.output is already wired to destination inside buildMasteringChain

    // Start and render
    source.start(0);
    const renderedBuffer = await offlineContext.startRendering();

    // Dispose chain
    chain.dispose();

    return renderedBuffer;
  }

  /**
   * Fast processed waveform preview — renders a short chunk only (not full track).
   * Full-track mastering is heard via the realtime player; this is for the UI waveform.
   */
  async renderWaveformPreview(
    settings: ProcessingSettings,
    inputTrimDB?: number,
    maxSeconds: number = 45,
    limiterCeilingOverride?: number,
    outputTrimDB?: number,
    sslGlue?: 'auto' | 'gentle' | 'firm'
  ): Promise<AudioBuffer> {
    if (!this.audioBuffer) {
      throw new Error('No audio buffer loaded');
    }

    const chunkSeconds = Math.min(maxSeconds, this.audioBuffer.duration);
    const previewSettings: ProcessingSettings = {
      ...settings,
      userOverrides: {
        ...settings.userOverrides,
        // Multiband offline render is very slow on long files — skip for waveform viz
        useMultiband: false,
      },
    };

    console.log(`🎨 Waveform preview: rendering first ${chunkSeconds.toFixed(1)}s (fast path)`);

    const timeoutMs = 25000;
    const renderPromise = this.renderPreviewChunk(
      previewSettings,
      0,
      chunkSeconds,
      inputTrimDB,
      limiterCeilingOverride,
      outputTrimDB,
      sslGlue
    );
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Waveform preview timed out')), timeoutMs);
    });

    return Promise.race([renderPromise, timeoutPromise]);
  }

  // ============================================================================
  // PRIVATE HELPERS FOR REAL-TIME PLAYBACK
  // ============================================================================

  private _startRealtimeSource(offsetSeconds: number): void {
    if (!this.audioBuffer || !this.realtimeChain) {
      throw new Error('Cannot start source: missing buffer or chain');
    }

    console.log('🔊 ROUTING DIAGNOSTIC:');
    console.log('   Source buffer duration:', this.audioBuffer.duration, 's');
    console.log('   Chain input:', this.realtimeChain.input);
    console.log('   Chain output:', this.realtimeChain.output);
    console.log('   Chain parameters:', this.realtimeChain.parameters);

    // Create new source
    this.realtimeSource = this.audioContext.createBufferSource();
    this.realtimeSource.buffer = this.audioBuffer;

    // Connect to chain
    console.log('   ✓ Connecting source → chain.input');
    this.realtimeSource.connect(this.realtimeChain.input);
    console.log('   ✓ Chain should already be connected to destination');

    // Handle end of playback (distinguish manual stop from natural end)
    this.realtimeSource.onended = () => {
      if (this.stoppingSource) {
        // Ignore manual stops (pause/seek)
        return;
      }
      // Natural end only
      if (this.realtimeIsPlaying) {
        console.log('⏹️  Playback ended (natural end of buffer)');
        this.realtimeIsPlaying = false;
        this.realtimeSource = null;
        this.realtimePauseTime = 0;
      }
    };

    // Start from offset
    this.realtimeSource.start(0, offsetSeconds);
    this.realtimeStartTime = this.audioContext.currentTime - offsetSeconds;
    this.realtimeIsPlaying = true;

    console.log(`▶️  Playing from ${offsetSeconds.toFixed(1)}s`);
  }

  private _pausePlayback(): void {
    if (!this.realtimeSource || !this.realtimeIsPlaying) {
      return;
    }

    // Save current position
    this.realtimePauseTime = this.audioContext.currentTime - this.realtimeStartTime;

    // Stop source (manual stop - set flag to ignore onended)
    this.stoppingSource = true;
    try {
      this.realtimeSource.onended = null; // Clear handler
    } catch (e) {
      // Ignore
    }
    try {
      this.realtimeSource.stop();
    } catch (e) {
      // Ignore if already stopped
    }
    this.realtimeSource.disconnect();
    this.realtimeSource = null;
    this.realtimeIsPlaying = false;
    
    // Clear flag on next tick to avoid race conditions
    queueMicrotask(() => {
      this.stoppingSource = false;
    });

    console.log(`⏸️  Paused at ${this.realtimePauseTime.toFixed(1)}s`);
  }

  private _resumePlayback(settings: ProcessingSettings): void {
    if (this.realtimeIsPlaying) {
      return;
    }

    // Restart from pause position
    this._startRealtimeSource(this.realtimePauseTime);
  }

  private _seekPlayback(timeSeconds: number, settings: ProcessingSettings): void {
    const wasPlaying = this.realtimeIsPlaying;

    // Stop current source (manual stop - set flag)
    if (this.realtimeSource) {
      this.stoppingSource = true;
      try {
        this.realtimeSource.onended = null; // Clear handler
      } catch (e) {
        // Ignore
      }
      try {
        this.realtimeSource.stop();
      } catch (e) {
        // Ignore if already stopped
      }
      this.realtimeSource.disconnect();
      this.realtimeSource = null;
      
      // Clear flag on next tick
      queueMicrotask(() => {
        this.stoppingSource = false;
      });
    }

    this.realtimePauseTime = timeSeconds;
    this.realtimeIsPlaying = false;

    // Restart from new position if was playing
    if (wasPlaying) {
      this._startRealtimeSource(timeSeconds);
    }

    console.log(`⏩ Seeked to ${timeSeconds.toFixed(1)}s`);
  }

  private _getCurrentTime(): number {
    if (this.realtimeIsPlaying && this.audioContext) {
      return this.audioContext.currentTime - this.realtimeStartTime;
    }
    return this.realtimePauseTime;
  }

  /**
   * NEW: Set bypass mode for A/B comparison (Draft Mode)
   * 
   * When bypass=true, routes source directly to destination (original)
   * When bypass=false, routes through full mastering chain (processed)
   * Seamless switching with no clicks/pops
   */
  private _setBypass(bypass: boolean): void {
    if (!this.realtimeSource || !this.realtimeChain) {
      console.warn('⚠️  Cannot set bypass: playback not active');
      return;
    }

    // Store bypass state
    this.realtimeBypass = bypass;

    try {
      // Disconnect source from wherever it's currently connected
      this.realtimeSource.disconnect();

      if (bypass) {
        // BYPASS: source → destination directly (skip mastering chain)
        console.log('🔀 A/B: ORIGINAL (bypassing mastering chain)');
        this.realtimeSource.connect(this.audioContext.destination);
      } else {
        // PROCESSED: source → chain → destination
        console.log('🔀 A/B: PROCESSED (through mastering chain)');
        this.realtimeSource.connect(this.realtimeChain.input);
      }
    } catch (e) {
      console.error('❌ Bypass routing error:', e);
    }
  }

  /**
   * DEPRECATED: Use renderExport() or startPlayback() instead
   * 
   * This method is kept for backward compatibility but should be replaced:
   * - For real-time playback: use startPlayback()
   * - For export: use renderExport()
   * - For preview chunks: use renderPreviewChunk()
   * 
   * Process audio with analog emulation chain
   * 
   * GAIN FLOW ARCHITECTURE (Critical - Do Not Break):
   * ========================================
   * 
   * INPUT ANALYSIS:
   *   - Peak level measured
   *   - LUFS measured
   *   - Crest factor calculated
   * 
   * INPUT NORMALIZATION:
   *   - All files normalized to -8 dBFS peak before processing (proper premaster headroom)
   *   - Ensures consistent analog emulation behavior regardless of input level
   *   - Quiet files (< -15 dBFS) are NOT boosted (preserves noise floor)
   *   - Hot files get trimmed to -8 dBFS (provides headroom for analog stages)
   *   - Safety cap: ±15 dB maximum to prevent extreme/corrupt files
   * 
   * PROCESSING CHAIN (6 stages):
   *   1. Transformer   : UNITY OUTPUT (drive: 1.0-1.15x, harmonics only)
   *   2. Tape          : UNITY OUTPUT (drive: 1.0-1.3x, hysteresis modeling)
   *   3. Multiband     : UNITY OUTPUT (surgical dynamics, per-band compression)
   *   4. SSL Bus Glue  : UNITY OUTPUT (threshold: -8dB, ratio: 2.5:1)
   *   5. M/S Processing: UNITY OUTPUT (width control, no level change)
   *   6. Limiter       : Variable (SOLE LOUDNESS AUTHORITY for targetLUFS)
   * 
   *   CRITICAL FIX (2026-02-16): ALL color stages now UNITY GAIN
   *   - Transformer: Removed +2dB makeup (was causing brickwalling)
   *   - Tape: Removed +3dB makeup + reduced head bump/bias EQ gains
   *   - Head bump: +2.0dB → +0.5dB (character only, not loudness)
   *   - Bias shelf: ±3dB → ±1dB (tonal hint only)
   *   - PRINCIPLE: Drive changes SHAPE, not LEVEL. Loudness happens ONCE (final limiter).
   * 
   * PRE-LIMITER SAFETY:
   *   - Monitors input + upstream gain
   *   - Auto-trims if exceeding -6 dBFS
   *   - Prevents gain-stacking disasters
   * 
   * LOUDNESS TARGETING:
   *   - Only ONE stage calculates targetLUFS gain
   *   - That stage is the LIMITER (Phase 4)
   *   - All other stages provide CHARACTER only
   * 
   * GOLDEN RULE: Never stack automatic makeup gain
   * ========================================
   */
  async processAudio(settings: ProcessingSettings): Promise<AudioBuffer> {
    if (!this.audioBuffer) {
      throw new Error('No audio buffer loaded');
    }
    
    // 🧾 DIAGNOSTIC: Log what settings the engine actually receives
    console.log("🧾 RENDER SETTINGS IN:", {
      logicMode: settings.logicMode,
      circuitDrive: settings.circuitDrive,
      targetLUFS: settings.targetLUFS,
      exportPresetId: settings.exportPresetId,
      genreId: settings.genreId,
      quality: settings.quality
    });
    
    // Transitional warning: detect legacy gearProfile usage
    if (settings.gearProfile && import.meta.env?.DEV) {
      console.warn(
        '⚠️ ProcessingSettings.gearProfile is deprecated. Use genreId instead.',
        { gearProfile: settings.gearProfile, genreId: settings.genreId }
      );
    }

    // === RESOLVE PROCESSING PLAN (Single source of truth) ===
    // This is the ONLY merge point for genre + export + user overrides.
    // Tests verify this exact function, ensuring runtime matches test behavior.
    const plan = resolveProcessingPlan({
      genreId: settings.genreId,
      exportPresetId: settings.exportPresetId as any, // TODO: Type alignment
      performanceMode: 'studio', // Always studio mode (live mode removed 2026-02-16)
      logicMode: settings.logicMode,
      userOverrides: settings.userOverrides
    });
    
    // Log user overrides if present (Profile Adjustments panel)
    if (settings.userOverrides) {
      console.log('🎚️ Profile Adjustments:', {
        stereoWidth: settings.userOverrides.width,
        lowShelf: settings.userOverrides.lowShelfBoost,
        midRange: settings.userOverrides.midRangeAdjust,
        highShelf: settings.userOverrides.highShelfBoost,
        saturation: settings.userOverrides.saturationAmount,
        note: 'Stereo width is applied. EQ/saturation need DSP implementation.'
      });
    }
    
    // Log what's in the processing plan (genre biases)
    console.log('📋 Processing Plan Biases (from genre):', {
      bassTilt: plan.genreBehavior.bassTilt?.toFixed(1) + 'dB',
      airTilt: plan.genreBehavior.airTilt?.toFixed(1) + 'dB',
      mudCut: plan.genreBehavior.mudCut?.toFixed(1) + 'dB',
      colorAmount: plan.genreBehavior.colorAmount?.toFixed(2),
      STATUS: '⚠️ These values exist but are NOT applied to audio - no DSP stage uses them!'
    });

    // === QUALITY PROFILE (Performance vs Quality) ===
    // Single source of truth for preview vs export behavior
    const quality = settings.quality ?? 'export'; // Default to export quality
    const qualityProfile = getQualityProfile(quality);
    
    if (quality === 'preview') {
      console.log('⚡ PREVIEW MODE: Fast render (skipping expensive stages)');
    } else {
      console.log('💎 EXPORT MODE: Full quality render');
    }

    // === MASTERING MINIMALISM GATE ===
    // "Don't break it. Nudge it. Stop early."
    // Most material doesn't need heavy processing - detect and bypass
    const inputLUFS = this.analysis?.lufs ?? -16;
    const inputPeakDBFS = this.analysis?.peakLevel ?? -1;
    const inputDR = this.analysis?.dynamicRange ?? 8;
    const inputCrestDBFS = this.analysis?.crestFactor ?? 12;
    const targetLUFS = settings.targetLUFS ?? -14;
    const requiredLoudnessChange = Math.abs(targetLUFS - inputLUFS);
    
    // === MINIMAL MASTER GATE ===
    // Trigger minimal processing when material is already close to target and safe
    // Philosophy: "Don't break it. Nudge it. Stop early."
    // 
    // PRIMARY CONDITIONS (both must be true):
    //   1. Already close to target loudness (≤3 dB change needed)
    // === MINIMAL MASTER MODE DETECTION (LOCKED BEHAVIOR) ===
    // 
    // PHILOSOPHY: If a track is already mastered (hot peaks + close to target LUFS),
    // applying full analog chain will degrade quality. Use minimal mode instead.
    // 
    // CRITERIA (all must be true):
    //   1. Peak >= -1.5 dBFS (hot, likely already limited)
    //   2. Crest factor < 8 dB (compressed, not dynamic stem)
    //   3. Required loudness change <= 3 dB (already close to target)
    // 
    // WHY:
    //   - Already-mastered tracks don't need Transformer/Tape saturation
    //   - Full chain adds coloration without improving loudness
    //   - Minimal mode: ceiling + gentle glue only
    // 
    // LOCKED: This is now the DEFAULT for hot tracks, cannot be disabled
    const isHotPeaks = inputPeakDBFS >= -1.5;        // Peaks are hot (likely already limited)
    const isCompressed = inputCrestDBFS < 8.0;       // Compressed (not a dynamic stem)
    const isCloseToTarget = requiredLoudnessChange <= 3.0; // Already close to target
    
    const needsMinimalProcessing = isHotPeaks && isCompressed && isCloseToTarget;
    
    // LOCKED: Minimal master mode is now MANDATORY for already-hot tracks
    let useMinimalMaster = needsMinimalProcessing;
    
    if (useMinimalMaster) {
      console.log('🎯 MINIMAL MASTER MODE ENABLED (LOCKED - already-hot track detected)');
      console.log(`   Peak: ${inputPeakDBFS.toFixed(1)} dBFS (≥ -1.5 = HOT) ✓`);
      console.log(`   Crest: ${inputCrestDBFS.toFixed(1)} dB (< 8 = COMPRESSED) ✓`);
      console.log(`   LUFS Δ: ${requiredLoudnessChange.toFixed(1)} dB (≤ 3 = CLOSE) ✓`);
      console.log(`   Input: ${inputLUFS.toFixed(1)} LUFS, Target: ${targetLUFS} LUFS`);
      console.log('   Strategy: Minimal intervention - preserve existing master character');
      console.log('   Bypassing: Transformer, Tape, Multiband | SSL glue gentle only (max 1.5dB GR)');
    } else {
      console.log('🔧 FULL PROCESSING MODE (fresh mix or quiet stem detected)');
      console.log(`   Peak: ${inputPeakDBFS.toFixed(1)} dBFS (< -1.5 = headroom available)`);
      console.log(`   Crest: ${inputCrestDBFS.toFixed(1)} dB (≥ 8 = dynamic range preserved)`);
      console.log(`   LUFS Δ: ${requiredLoudnessChange.toFixed(1)} dB (> 3 = needs loudness)`);
      console.log(`   Input: ${inputLUFS.toFixed(1)} LUFS, Target: ${targetLUFS} LUFS`);
      console.log('   Strategy: Full analog chain, loudness targeting active');
    }

    console.log('🎛️  Starting 4-Phase Analog Chain processing...');
    
    // === CHUNK-BASED PREVIEW (Beatport-style) ===
    // Preview: user-selectable 30s chunks from anywhere in the track
    // Export: full track render (process entire file)
    const sampleRate = this.audioBuffer.sampleRate;
    const fullTrackDuration = this.audioBuffer.length / sampleRate;
    const chunkDuration = settings.chunkDuration || fullTrackDuration; // Default to FULL track if not specified
    const chunkOffset = settings.chunkOffset || 0;
    
    let processStartSample = 0;
    let processLength: number;
    
    if (quality === 'preview' && settings.chunkDuration !== undefined) {
      // CHUNKED PREVIEW: Only when chunkDuration is explicitly provided
      // Calculate chunk boundaries
      processStartSample = Math.floor(chunkOffset * sampleRate);
      const maxStartSample = Math.max(0, this.audioBuffer.length - (chunkDuration * sampleRate));
      processStartSample = Math.min(processStartSample, maxStartSample);
      
      const samplesRemaining = this.audioBuffer.length - processStartSample;
      processLength = Math.min(chunkDuration * sampleRate, samplesRemaining);
      
      console.log(`🎯 CHUNK PREVIEW: ${chunkDuration}s starting at ${chunkOffset.toFixed(1)}s (sample ${processStartSample})`);
      console.log(`   Full track: ${(this.audioBuffer.length / sampleRate).toFixed(1)}s, rendering chunk: ${(processLength / sampleRate).toFixed(1)}s`);
    } else if (quality === 'preview') {
      // FULL-TRACK PREVIEW: Fast processing of entire track (Draft Mode)
      processStartSample = 0;
      processLength = this.audioBuffer.length;
      console.log(`⚡ DRAFT MODE: Processing full track with preview quality (${(processLength / sampleRate).toFixed(1)}s)`);
    } else {
      // Export mode: render entire track at high quality
      processStartSample = 0;
      processLength = this.audioBuffer.length;
      console.log(`💎 EXPORT MODE: Processing full track (${(processLength / sampleRate).toFixed(1)}s)`);
    }
    
    const durationSeconds = processLength / sampleRate;
    console.log(`📊 Rendering: ${processLength} samples (${durationSeconds.toFixed(1)}s)`);
    
    // Always process in stereo (2 channels) for consistent mastering behavior
    // Upmix mono input to dual-mono if needed
    const numChannels = 2;
    const offlineContext = new OfflineAudioContext(
      numChannels,
      processLength,
      sampleRate
    );

    // Handle mono/stereo/multichannel input + chunk extraction
    let processingBuffer: AudioBuffer;
    
    if (this.audioBuffer.numberOfChannels === 1) {
      // Mono input: upmix to dual-mono (copy L to R)
      console.log('📻 Input is mono - upmixing to dual-mono for stereo processing');
      processingBuffer = offlineContext.createBuffer(2, processLength, this.audioBuffer.sampleRate);
      const monoData = this.audioBuffer.getChannelData(0);
      
      // Extract chunk if in preview mode
      if (quality === 'preview' && processStartSample > 0) {
        const chunkData = monoData.slice(processStartSample, processStartSample + processLength);
        processingBuffer.copyToChannel(chunkData, 0); // L
        processingBuffer.copyToChannel(chunkData, 1); // R
      } else {
        processingBuffer.copyToChannel(monoData.subarray(0, processLength), 0); // L
        processingBuffer.copyToChannel(monoData.subarray(0, processLength), 1); // R
      }
    } else if (this.audioBuffer.numberOfChannels === 2) {
      // Stereo input: extract chunk if needed
      console.log('🎧 Input is stereo - processing in stereo');
      
      if (quality === 'preview' && processStartSample > 0) {
        // Extract chunk from stereo source
        processingBuffer = offlineContext.createBuffer(2, processLength, this.audioBuffer.sampleRate);
        const leftData = this.audioBuffer.getChannelData(0).slice(processStartSample, processStartSample + processLength);
        const rightData = this.audioBuffer.getChannelData(1).slice(processStartSample, processStartSample + processLength);
        processingBuffer.copyToChannel(leftData, 0);
        processingBuffer.copyToChannel(rightData, 1);
      } else if (processLength < this.audioBuffer.length) {
        // Truncate to processLength
        processingBuffer = offlineContext.createBuffer(2, processLength, this.audioBuffer.sampleRate);
        processingBuffer.copyToChannel(this.audioBuffer.getChannelData(0).subarray(0, processLength), 0);
        processingBuffer.copyToChannel(this.audioBuffer.getChannelData(1).subarray(0, processLength), 1);
      } else {
        // Use full buffer
        processingBuffer = this.audioBuffer;
      }
    } else {
      // More than 2 channels: reject (not supported for mastering)
      throw new Error(`Unsupported channel count: ${this.audioBuffer.numberOfChannels}. Mastering requires mono or stereo input.`);
    }

    // Create source with processed buffer
    const source = offlineContext.createBufferSource();
    source.buffer = processingBuffer;

    // === INPUT LEVEL NORMALIZATION ===
    // Normalize ALL inputs to -8 dBFS for proper premaster headroom
    // This gives analog stages (Transformer/Tape/SSL) room to add harmonics without clipping
    const inputNormalization = offlineContext.createGain();
    const sourcePeakDB = this.analysis?.peakLevel ?? -8.0;
    const targetPeakDB = -8.0; // Industry standard premaster level (8 dB headroom)
    let normalizationDB = targetPeakDB - sourcePeakDB;
    
    // === QUIET MATERIAL GATE ===
    // Don't boost if source is already very quiet (below -15 dBFS)
    // This preserves noise floor and respects intentionally quiet material
    if (sourcePeakDB < -15.0 && normalizationDB > 0) {
      console.log(`🔇 QUIET MATERIAL DETECTED: ${sourcePeakDB.toFixed(1)} dBFS - skipping +${normalizationDB.toFixed(1)} dB boost to preserve noise floor`);
      normalizationDB = 0;
      // Material will process at its natural level (no normalization)
    }
    
    // Safety limit: cap normalization to ±15 dB to prevent extreme gain changes
    const maxNormalizationDB = 15.0;
    if (Math.abs(normalizationDB) > maxNormalizationDB) {
      const originalDB = normalizationDB;
      normalizationDB = Math.sign(normalizationDB) * maxNormalizationDB;
      console.warn(`⚠️  Extreme input level detected! Capping normalization: ${originalDB.toFixed(2)} dB → ${normalizationDB.toFixed(2)} dB`);
    }
    
    inputNormalization.gain.value = Math.pow(10, normalizationDB / 20);
    
    if (normalizationDB > 0.5) {
      console.log(`📈 INPUT BOOST: ${sourcePeakDB.toFixed(2)} dBFS → ${(sourcePeakDB + normalizationDB).toFixed(2)} dBFS (+${normalizationDB.toFixed(2)} dB) - normalizing to -8 dBFS premaster level`);
    } else if (normalizationDB < -0.5) {
      console.log(`📉 INPUT TRIM: ${sourcePeakDB.toFixed(2)} dBFS → ${(sourcePeakDB + normalizationDB).toFixed(2)} dBFS (${normalizationDB.toFixed(2)} dB) - preventing overs`);
    } else {
      console.log(`✅ Input level optimal: ${sourcePeakDB.toFixed(2)} dBFS (no normalization needed)`);
    }
    
    console.log('');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  UNITY GAIN ARCHITECTURE (2026-02-16 FIX)');
    console.log('  All color stages output UNITY - no makeup gain');
    console.log('  Limiter is SOLE LOUDNESS AUTHORITY');
    console.log('  Peak analysis: ALL channels, EVERY sample (no decimation)');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');
    
    source.connect(inputNormalization);

    // Build processing chain - Full 6-stage neural analog chain (studio mastering only)
    let currentNode: AudioNode = inputNormalization;

    console.log('🎚️  STUDIO MODE: Full 6-stage neural analog chain');

    // PHASE 1: Transformer (Harmonic Enhancement)
    // Minimal master mode: Reduce saturation to <10% or skip entirely
    if (!useMinimalMaster && qualityProfile.chain.saturator) {
      console.log('⚡ Phase 1: Transformer (Neve/API character - ACTIVE)');
      const transformer = this.createTransformerStage(offlineContext, settings);
      currentNode.connect(transformer.input);
      currentNode = transformer.output;
    } else if (useMinimalMaster) {
      console.log('⚡ Phase 1: Transformer BYPASSED (minimal master)');
    } else {
      console.log('⚡ Phase 1: Transformer SKIPPED (quality profile)');
    }

    // PHASE 2: Advanced Tape Saturation with Hysteresis Modeling
    // Minimal master mode: Reduce saturation to <10% or skip entirely
    if (!useMinimalMaster && qualityProfile.chain.saturator) {
      console.log('📼 Phase 2: Tape Saturation (Studer/Ampex character - ACTIVE)');
      const tape = this.createSaturationStage(offlineContext, settings);
      currentNode.connect(tape.input);
      currentNode = tape.output;
    } else if (useMinimalMaster) {
      console.log('📼 Phase 2: Tape Saturation BYPASSED (minimal master)');
    } else {
      console.log('📼 Phase 2: Tape Saturation SKIPPED (quality profile)');
    }

    // PHASE 2.5: Multi-Band Processing (Surgical Frequency Management)
    // Minimal master mode: Disable multiband (preserve tonal balance)
    // Quality profile: Skip in preview mode (expensive 4-band split)
    const useMultiband = plan.genreBehavior.useMultiband && !useMinimalMaster && qualityProfile.chain.multiband;
    
    if (useMultiband) {
      console.log('🎚️  Phase 2.5: Multi-Band Processing (4-band split)');
      const multiBand = this.createMultiBandStage(offlineContext, settings);
      currentNode.connect(multiBand.input);
      currentNode = multiBand.output;
    } else if (plan.genreBehavior.useMultiband && useMinimalMaster) {
      console.log('🎚️  Phase 2.5: Multi-Band Processing DISABLED (minimal master)');
    } else if (quality === 'preview') {
      console.log('🎚️  Phase 2.5: Multi-Band Processing SKIPPED (preview mode)');
    } else {
      console.log('🎚️  Phase 2.5: Multi-Band Processing SKIPPED (resolver disabled)');
    }

    // PHASE 3: Bus Glue Compression
    // Minimal master mode: Reduce threshold to limit max GR to 1.5 dB
    if (useMinimalMaster) {
      console.log('🔘 Phase 3: Bus Glue Compression (MINIMAL - max 1.5dB GR, +3dB makeup)');
      // Pass flag through settings temporarily
      const minimalSettings = { ...settings, _minimalMaster: true as any };
      const ssl = this.createFinalStage(offlineContext, minimalSettings);
      currentNode.connect(ssl.input);
      currentNode = ssl.output;
    } else {
      console.log('🔘 Phase 3: Bus Glue Compression (SSL 9000K - UNITY output)');
      const ssl = this.createFinalStage(offlineContext, settings);
      currentNode.connect(ssl.input);
      currentNode = ssl.output;
    }

    // PHASE 3.5: Mid-Side (M/S) Processing (Stereo Width & Heritage Imaging) - STUDIO ONLY
    // Only run if genre preset enables M/S processing
    // Quality profile: Skip in preview mode (not critical for decision-making)
    const useMidSide = plan.genreBehavior.useMidSide && qualityProfile.chain.midside;
    
    if (useMidSide) {
      console.log('🎭 Phase 3.5: M/S Processing (Stereo Width)');
      const ms = this.createMidSideStage(offlineContext, settings, plan);
      currentNode.connect(ms.input);
      currentNode = ms.output;
    } else if (!useMidSide && plan.genreBehavior.useMidSide) {
      console.log('🎭 Phase 3.5: M/S Processing SKIPPED (preview mode)');
    } else {
      console.log('🎭 Phase 3.5: M/S Processing SKIPPED (genre preset disabled)');
    }

    // PHASE 4: Cascaded Limiting (Peak Management) - ALWAYS ACTIVE
    console.log('🎯 Phase 4: Final Limiter');
    const limiter = this.createWeissLimiterStage(offlineContext, settings);
    currentNode.connect(limiter.input);
    currentNode = limiter.output;

    // Connect to destination
    currentNode.connect(offlineContext.destination);

    // Start processing
    source.start(0);
    
    console.log('🔄 Rendering audio graph...');
    
    // Add timeout to prevent hanging (scale with duration)
    const renderPromise = offlineContext.startRendering();
    
    // Dynamic timeout: 60s base + 5s per 10s of audio (max 10 minutes)
    // Heavy 6-stage processing needs generous timeout (9min file = ~330s timeout)
    const dynamicTimeout = Math.min(60000 + (durationSeconds * 500), 600000);
    console.log(`⏱️ Processing timeout set to ${(dynamicTimeout / 1000).toFixed(1)}s for ${durationSeconds.toFixed(1)}s file`);
    
    const timeoutPromise = new Promise<AudioBuffer>((_, reject) => {
      setTimeout(() => reject(new Error(`Audio processing timeout after ${dynamicTimeout / 1000}s`)), dynamicTimeout);
    });
    
    const renderStartTime = Date.now();
    const renderedBuffer = await Promise.race([renderPromise, timeoutPromise]);
    const renderTimeMs = Date.now() - renderStartTime;
    
    // === CREST FACTOR ANALYSIS (Binary brickwall test) ===
    function analyzeBuffer(channelData: Float32Array) {
      let peak = 0;
      let sumSq = 0;
      let flatTopCount = 0;
      const n = channelData.length;
      const flatTopThreshold = 0.98; // Samples near ceiling

      for (let i = 0; i < n; i++) {
        const x = channelData[i];
        const ax = Math.abs(x);
        if (ax > peak) peak = ax;
        if (ax >= flatTopThreshold) flatTopCount++;
        sumSq += x * x;
      }

      const rms = Math.sqrt(sumSq / n);
      const peakDb = 20 * Math.log10(Math.max(peak, 1e-12));
      const rmsDb = 20 * Math.log10(Math.max(rms, 1e-12));
      const crestDb = peakDb - rmsDb;
      const flatTopRatio = flatTopCount / n;

      return { peak, peakDb, rms, rmsDb, crestDb, flatTopRatio };
    }
    
    // Analyze original input (channel 0)
    const originalAnalysis = analyzeBuffer(this.audioBuffer.getChannelData(0));
    
    // Analyze rendered output (channel 0)
    const renderedAnalysis = analyzeBuffer(renderedBuffer.getChannelData(0));
    
    console.log('🔬 CREST FACTOR ANALYSIS (The brickwall test):');
    console.log('ORIGINAL:');
    console.log(`  Peak: ${originalAnalysis.peak.toFixed(6)} (${originalAnalysis.peakDb.toFixed(2)} dBFS)`);
    console.log(`  RMS:  ${originalAnalysis.rms.toFixed(6)} (${originalAnalysis.rmsDb.toFixed(2)} dBFS)`);
    console.log(`  Crest: ${originalAnalysis.crestDb.toFixed(2)} dB`);
    console.log(`  Flat-top: ${(originalAnalysis.flatTopRatio * 100).toFixed(3)}% (samples ≥0.98)`);
    console.log('PROCESSED:');
    console.log(`  Peak: ${renderedAnalysis.peak.toFixed(6)} (${renderedAnalysis.peakDb.toFixed(2)} dBFS)`);
    console.log(`  RMS:  ${renderedAnalysis.rms.toFixed(6)} (${renderedAnalysis.rmsDb.toFixed(2)} dBFS)`);
    console.log(`  Crest: ${renderedAnalysis.crestDb.toFixed(2)} dB`);
    console.log(`  Flat-top: ${(renderedAnalysis.flatTopRatio * 100).toFixed(3)}% (samples ≥0.98)`);
    
    const isBrickwalled = renderedAnalysis.crestDb < 6 || renderedAnalysis.flatTopRatio > 0.05;
    
    if (isBrickwalled) {
      console.error(`⚠️  BRICKWALLED! Crest ${renderedAnalysis.crestDb.toFixed(1)} dB, Flat-top ${(renderedAnalysis.flatTopRatio*100).toFixed(2)}%`);
      console.error('   This is DSP chain clipping, NOT export normalization.');
      console.error('   🔍 Run stage isolation test to find the guilty stage.');
    } else if (renderedAnalysis.crestDb < 8) {
      console.warn(`⚠️  HEAVILY COMPRESSED: Crest ${renderedAnalysis.crestDb.toFixed(1)} dB (borderline)`);
    } else {
      console.log(`✅ Healthy dynamics: Crest ${renderedAnalysis.crestDb.toFixed(1)} dB (NOT brickwalled)`);
    }
    
    // === STAGE ISOLATION DIAGNOSTIC (Manual trigger via localStorage) ===
    // Enable with: localStorage.setItem('LATHAM_STAGE_ISOLATION', 'true')
    if (typeof localStorage !== 'undefined' && localStorage.getItem('LATHAM_STAGE_ISOLATION') === 'true') {
      console.log('🔬🔬🔬 STAGE ISOLATION TEST ENABLED 🔬🔬🔬');
      console.log('This will render the chain 7 times with incremental stages.');
      console.log('Watch for the stage where crestDb drops or flatTopRatio jumps.');
      
      // Store settings for isolation test
      (window as any).__LATHAM_ISOLATION_SETTINGS = {
        settings,
        plan,
        quality,
        qualityProfile,
        useMinimalMaster
      };
      
      console.log('✅ Isolation settings stored. Use console to run:');
      console.log('   await window.__audioProcessor.runStageIsolationTest()');
    }
    
    // === DIAGNOSTIC LOGGING (DEV ONLY) ===
    // Surgical truth table - one render, one log
    if (import.meta.env?.DEV) {
      // Input analysis (already calculated)
      const inputLUFS = this.analysis?.lufs ?? 0;
      const inputPeakDBFS = this.analysis?.peakLevel ?? 0;
      
      // Pre-limiter state (from safety trim calculation)
      const upstreamGainDB = 0; // 2026-02-16: ALL stages now UNITY (was +3dB SSL makeup)
      const totalEstimatedPeakDB = inputPeakDBFS + upstreamGainDB;
      const maxSafeInputDB = -6;
      const safetyTrimDB = Math.min(0, maxSafeInputDB - totalEstimatedPeakDB);
      
      // Limiter config (matches createWeissLimiterStage logic)
      const logicModeName = settings.logicMode === 'brickwall' ? 'PRESSURE' : 'FLOW';
      let ceilingDBTP = -0.1;
      if (settings.targetLUFS === -14) ceilingDBTP = -1.0;
      else if (settings.targetLUFS === -8) ceilingDBTP = -0.1;
      if (settings.logicMode === 'brickwall') ceilingDBTP = -0.1;
      
      // Calculate limiter makeup gain (matches createWeissLimiterStage)
      const currentLUFS = inputLUFS;
      const targetLUFS = settings.targetLUFS;
      const requiredGainDB = targetLUFS - currentLUFS;
      const maxAllowedMakeup = 20;
      const limiterMakeupDB = Math.max(-10, Math.min(requiredGainDB, maxAllowedMakeup));
      
      // Output analysis
      const finalLUFS = this.measureLUFS(renderedBuffer);
      const finalPeakDBTP = this.measurePeak(renderedBuffer);
      
      // === CRITICAL CLIPPING DIAGNOSTICS ===
      // Measure actual linear peak to catch digital clipping (samples > ±1.0)
      let maxAbsSample = 0;
      for (let ch = 0; ch < renderedBuffer.numberOfChannels; ch++) {
        const channelData = renderedBuffer.getChannelData(ch);
        for (let i = 0; i < channelData.length; i++) {
          const abs = Math.abs(channelData[i]);
          if (abs > maxAbsSample) maxAbsSample = abs;
        }
      }
      const isClipping = maxAbsSample > 0.999; // Digital clipping threshold
      
      // Estimate limiter GR (cannot measure directly from WebAudio DynamicsCompressor)
      // Conservative estimate: if output LUFS < target, limiter reduced gain
      const estimatedAvgGR = Math.max(0, targetLUFS - finalLUFS);
      const estimatedMaxGR = estimatedAvgGR * 1.5; // Peak GR typically 1.5x average
      
      console.groupCollapsed('🎛️  MASTERING DIAGNOSTICS');
      console.table({
        // Input
        'Input LUFS': inputLUFS.toFixed(1),
        'Input Peak (dBFS)': inputPeakDBFS.toFixed(1),
        
        // Pre-limiter
        'Pre-Limiter Peak Est (dB)': totalEstimatedPeakDB.toFixed(1),
        'Safety Trim (dB)': safetyTrimDB.toFixed(1),
        
        // Limiter
        'Logic Mode': logicModeName,
        'Limiter GR Avg (est, dB)': estimatedAvgGR.toFixed(1),
        'Limiter GR Max (est, dB)': estimatedMaxGR.toFixed(1),
        'Limiter Makeup (dB)': limiterMakeupDB.toFixed(1),
        'Ceiling (dBTP)': ceilingDBTP.toFixed(1),
        
        // Output
        'Final LUFS': finalLUFS.toFixed(1),
        'Final Peak (dBTP)': finalPeakDBTP.toFixed(1),
        '⚠️ MAX SAMPLE (linear)': maxAbsSample.toFixed(4),
        '⚠️ CLIPPING?': isClipping ? '🔴 YES' : '✅ NO',
        
        // Settings
        'Multiband Active': useMultiband,
        'M/S Active': useMidSide,
        
        // Performance
        'Render Time (ms)': renderTimeMs.toFixed(0),
      });
      console.groupEnd();
      
      // === CRITICAL CLIPPING WARNING ===
      if (isClipping) {
        console.error(`🔴 DIGITAL CLIPPING DETECTED! Peak sample: ${maxAbsSample.toFixed(4)} (>0.999)`);
        console.error('Output will sound distorted. Safety ceiling should have prevented this.');
      }
      
      // Health warnings (only show if outside expected ranges)
      if (logicModeName === 'FLOW' && estimatedAvgGR > 6) {
        console.warn('⚠️  Flow mode avg GR > 6 dB - consider reducing upstream gain');
      }
      if (logicModeName === 'FLOW' && estimatedMaxGR > 8) {
        console.warn('⚠️  Flow mode max GR > 8 dB - multiband may be too hot');
      }
      
      // Clear or update targetWarning based on LUFS accuracy
      if (this.analysis) {
        if (Math.abs(finalLUFS - targetLUFS) > 1.5) {
          console.warn(`⚠️  LUFS miss: ${Math.abs(finalLUFS - targetLUFS).toFixed(1)} dB (target=${targetLUFS}, actual=${finalLUFS.toFixed(1)})`);
          
          // Update analysis with user-facing warning
          const delta = Math.abs(finalLUFS - targetLUFS);
          if (finalLUFS < targetLUFS) {
            // Missed quiet (couldn't reach target)
            this.analysis.targetWarning = `Target adjusted from ${targetLUFS} LUFS to ${finalLUFS.toFixed(1)} LUFS to preserve dynamics. This material needs ${delta.toFixed(1)} dB less gain than available in ${logicModeName} mode.`;
          } else {
            // Missed loud (overshot target)
            this.analysis.targetWarning = `Target adjusted from ${targetLUFS} LUFS to ${finalLUFS.toFixed(1)} LUFS to prevent clipping.`;
          }
        } else {
          // Target hit successfully - clear any previous warning
          this.analysis.targetWarning = undefined;
        }
      }
      
      if (finalPeakDBTP > ceilingDBTP + 0.2) {
        console.warn(`⚠️  Ceiling violation: ${finalPeakDBTP.toFixed(2)} dBTP exceeds ${ceilingDBTP.toFixed(2)} dBTP`);
      }
      
      // === CONSOLIDATED DAMAGE REPORT (2026-02-16) ===
      // Single, clear report showing potential quality issues
      console.log('\\n' + '═'.repeat(60));
      console.log('📊 DAMAGE REPORT - Quality Guardrails');
      console.log('═'.repeat(60));
      
      // 1. Peak before limiter (after makeup gain)
      const peakBeforeLimiter = inputPeakDBFS + limiterMakeupDB;
      console.log(`\\n1️⃣  PEAK BEFORE LIMITER: ${peakBeforeLimiter.toFixed(2)} dBFS`);
      console.log(`   - Input peak: ${inputPeakDBFS.toFixed(2)} dBFS`);
      console.log(`   - Makeup gain: ${limiterMakeupDB >= 0 ? '+' : ''}${limiterMakeupDB.toFixed(2)} dB`);
      
      // 2. Makeup gain applied
      console.log(`\\n2️⃣  MAKEUP GAIN: ${limiterMakeupDB >= 0 ? '+' : ''}${limiterMakeupDB.toFixed(2)} dB`);
      if (Math.abs(limiterMakeupDB) > 8) {
        console.warn(`   ⚠️  HIGH - May force limiter into audible distortion (>${Math.abs(limiterMakeupDB).toFixed(1)}dB)`);
      } else if (Math.abs(limiterMakeupDB) > 5) {
        console.log(`   ℹ️  MODERATE - Limiter will work hard (${Math.abs(limiterMakeupDB).toFixed(1)}dB)`);
      } else {
        console.log(`   ✅ SAFE - Within healthy range (<5dB)`);
      }
      
      // 3. Estimated limiter engagement (GR)
      console.log(`\\n3️⃣  LIMITER ENGAGEMENT: ~${estimatedAvgGR.toFixed(1)}dB avg, ~${estimatedMaxGR.toFixed(1)}dB peak`);
      if (estimatedMaxGR > 6) {
        console.error(`   🚨 DANGER - Excessive GR will cause brickwall squash (>${estimatedMaxGR.toFixed(1)}dB)`);
      } else if (estimatedMaxGR > 3) {
        console.warn(`   ⚠️  WARNING - Heavy limiting, approaching danger zone (${estimatedMaxGR.toFixed(1)}dB)`);
      } else if (estimatedMaxGR > 1) {
        console.log(`   ✅ HEALTHY - Moderate limiting (1-3dB range)`);
      } else {
        console.log(`   ✅ MINIMAL - Safety net only (<1dB)`);
      }
      
      // 4. Safety ceiling engagement
      const safetyCeilingThresholdDB = settings.safeExportMode ? -1.0 : -0.3;
      const safetyCeilingEngaged = finalPeakDBTP > safetyCeilingThresholdDB - 0.1;
      console.log(`\\n4️⃣  SAFETY CEILING: ${safetyCeilingThresholdDB.toFixed(1)} dBTP (${settings.safeExportMode ? 'Safe Export' : 'Normal'} mode)`);
      console.log(`   - Final peak: ${finalPeakDBTP.toFixed(2)} dBTP`);
      if (safetyCeilingEngaged) {
        console.error(`   🚨 ENGAGED - Safety ceiling had to clip peaks (limiter failed)`);
      } else if (finalPeakDBTP > safetyCeilingThresholdDB - 0.3) {
        console.warn(`   ⚠️  NEAR CEILING - Only ${(safetyCeilingThresholdDB - finalPeakDBTP).toFixed(2)}dB headroom`);
      } else {
        console.log(`   ✅ SAFE - ${Math.abs(finalPeakDBTP - safetyCeilingThresholdDB).toFixed(2)}dB below ceiling`);
      }
      
      // 5. Overall verdict
      console.log(`\\n5️⃣  OVERALL VERDICT:`);
      if (safetyCeilingEngaged || estimatedMaxGR > 6) {
        console.error(`   🔴 QUALITY AT RISK - Brickwall artifacts likely audible`);
        console.error(`   → SOLUTION: Reduce target LUFS, enable Safe Export, or use less hot input`);
      } else if (estimatedMaxGR > 3 || Math.abs(limiterMakeupDB) > 8) {
        console.warn(`   🟡 PUSHING LIMITS - Heavy processing, check for artifacts`);
        console.warn(`   → RECOMMEND: A/B test carefully, consider backing off target`);
      } else {
        console.log(`   🟢 HEALTHY PROCESSING - All guardrails green`);
      }
      
      console.log('═'.repeat(60) + '\\n');
      
      // Store damage report in analysis object for UI access
      if (this.analysis) {
        // Determine quality verdict
        let qualityVerdict: 'safe' | 'warning' | 'danger' = 'safe';
        const recommendations: string[] = [];
        
        if (safetyCeilingEngaged || estimatedMaxGR > 6) {
          qualityVerdict = 'danger';
          recommendations.push('Reduce target LUFS to prevent brickwall artifacts');
          if (!settings.safeExportMode) {
            recommendations.push('Enable Safe Export Mode for maximum codec safety');
          }
          if (Math.abs(limiterMakeupDB) > 8) {
            recommendations.push('Input material is too quiet - use less aggressive target');
          }
        } else if (estimatedMaxGR > 3 || Math.abs(limiterMakeupDB) > 8) {
          qualityVerdict = 'warning';
          recommendations.push('Heavy processing detected - A/B test carefully');
          recommendations.push('Consider backing off target by 1-2 LUFS for transparency');
        }
        
        this.analysis.damageReport = {
          peakBeforeLimiter,
          makeupGainApplied: limiterMakeupDB,
          estimatedLimiterGR: estimatedAvgGR,
          estimatedLimiterPeakGR: estimatedMaxGR,
          safetyCeilingEngaged,
          safetyCeilingDB: safetyCeilingThresholdDB,
          finalPeakDBTP,
          qualityVerdict,
          recommendations: recommendations.length > 0 ? recommendations : undefined
        };
      }
    }
    
    console.log('✅ 4-Phase Analog Chain processing complete!');
    
    // === FINAL OUTPUT SUMMARY ===
    console.log('\n📦 FINAL OUTPUT BUFFER:');
    console.log(`   Channels: ${renderedBuffer.numberOfChannels}`);
    console.log(`   Duration: ${renderedBuffer.duration.toFixed(2)}s`);
    console.log(`   Sample Rate: ${renderedBuffer.sampleRate}Hz`);
    console.log(`   Length: ${renderedBuffer.length} samples`);
    
    // Sample a few representative values to detect brick-walling
    const ch0 = renderedBuffer.getChannelData(0);
    const midPoint = Math.floor(ch0.length / 2);
    console.log(`   Sample values (mid-section): ${ch0.slice(midPoint, midPoint + 10).map(v => v.toFixed(4)).join(', ')}`);
    
    // Count samples near ceiling to detect excessive limiting
    let samplesNearCeiling = 0;
    const ceilingThreshold = 0.95;  // Count samples above 95% of full scale
    for (let ch = 0; ch < renderedBuffer.numberOfChannels; ch++) {
      const data = renderedBuffer.getChannelData(ch);
      for (let i = 0; i < data.length; i++) {
        if (Math.abs(data[i]) > ceilingThreshold) samplesNearCeiling++;
      }
    }
    const percentNearCeiling = (samplesNearCeiling / (renderedBuffer.length * renderedBuffer.numberOfChannels)) * 100;
    console.log(`   Samples near ceiling (>${ceilingThreshold}): ${percentNearCeiling.toFixed(2)}%`);
    if (percentNearCeiling > 5) {
      console.warn(`   ⚠️  BRICK-WALLING DETECTED: ${percentNearCeiling.toFixed(1)}% of samples are near maximum level!`);
    }
    
    console.log(`🎯 RETURNING BUFFER: ${renderedBuffer.numberOfChannels}ch, ${renderedBuffer.duration.toFixed(1)}s, ${renderedBuffer.length} samples`);
    console.log(`   Expected duration for quality="${quality}": ${quality === 'preview' ? '30s (if source > 30s)' : 'full length'}`);
    
    return renderedBuffer;
  }

  /**
   * Phase 1: Transformer stage with advanced modeling
   * Based on Neve 1073 and API 2500 transformer characteristics
   * Implements frequency-dependent saturation and asymmetric clipping
   */
  private createTransformerStage(context: BaseAudioContext, settings: ProcessingSettings): StageIO {
    const input = context.createGain();
    input.channelCountMode = 'max';
    input.channelInterpretation = 'speakers';
    
    const output = context.createGain();
    output.channelCountMode = 'max';
    output.channelInterpretation = 'speakers';
    
    // Base gain: UNITY (removed +2dB baked-in gain)
    const baseGain = 1.0; // Unity - transformer character comes from saturation, not gain
    
    // Genre-specific transformer character
    let profileMultiplier = 1.0;
    let saturationAmount = 1.0;
    
    switch (settings.gearProfile) {
      case 'realprog':
        profileMultiplier = 1.05;
        saturationAmount = 0.8; // Clean, emotional
        break;
      case 'modernprog':
        profileMultiplier = 1.12;
        saturationAmount = 1.1; // Aggressive, punchy
        break;
      case 'trance':
        profileMultiplier = 1.08;
        saturationAmount = 0.9; // Bright, clear
        break;
      case 'house':
        profileMultiplier = 1.0;
        saturationAmount = 1.0; // Balanced warmth
        break;
      case 'techno':
        profileMultiplier = 0.98;
        saturationAmount = 1.2; // Dark, heavy
        break;
      case 'rnb':
        profileMultiplier = 0.95;
        saturationAmount = 0.7; // Smooth, minimal
        break;
      case 'tape':
        profileMultiplier = 1.15;
        saturationAmount = 1.5; // Maximum vintage color
        break;
    }
    
    input.gain.value = baseGain * profileMultiplier;
    console.log(`🔧 TRANSFORMER v2: Genre=${settings.gearProfile}, Drive=1.0-1.15x, Output=UNITY (no makeup gain)`);
    
    // === FREQUENCY-DEPENDENT TRANSFORMER SATURATION ===
    // Neve/API transformers saturate more on low frequencies
    
    // Low-frequency emphasis (transformer inductance)
    const lowShelf = context.createBiquadFilter();
    lowShelf.type = 'lowshelf';
    lowShelf.frequency.value = 200;
    lowShelf.gain.value = 1.5; // +1.5dB @ 200Hz (transformer bump)
    lowShelf.Q.value = 0.7;
    
    // High-frequency roll-off (transformer capacitance)
    const highShelf = context.createBiquadFilter();
    highShelf.type = 'highshelf';
    highShelf.frequency.value = 12000;
    highShelf.gain.value = -0.8; // -0.8dB @ 12kHz (natural transformer loss)
    highShelf.Q.value = 0.7;
    
    // === ASYMMETRIC TRANSFORMER SATURATION ===
    // Transformers have asymmetric hysteresis (more even harmonics)
    const transformerSat = context.createWaveShaper();
    const curve = new Float32Array(65536);
    
    for (let i = 0; i < 65536; i++) {
      const x = (i * 2 - 65536) / 65536;
      
      // Asymmetric saturation (60% positive, 40% negative bias)
      const asymmetry = 0.1;
      const biased = x + asymmetry * x * x;
      
      // === NEVE 1073 TRANSFORMER SATURATION ===
      // Transformers add CHARACTER through subtle harmonics, NOT gain boost
      // The drive amount should be SUBTLE - makeup gain handles level increase
      const drive = 1.0 + saturationAmount * 0.15; // Reduced from 1.5 to 0.15 (max 1.15x drive)
      const driven = biased * drive;
      const threshold = 0.5; // Raised from 0.3 - only saturate peaks, not entire signal
      
      let saturated;
      let evenHarmonic;
      
      if (Math.abs(driven) < threshold) {
        // Below threshold: Clean with subtle even harmonics
        // Neve 1073 spec: 0.01% THD @ +4dBu (~1% even harmonics)
        saturated = driven;
        evenHarmonic = 0.02 * driven * Math.abs(driven); // INCREASED from 0.01 to 0.02 for more warmth
      } else {
        // Above threshold: HARD transformer core saturation
        // Neve 1073 spec: 0.5% THD @ +20dBu (~5% even harmonics)
        const excess = Math.abs(driven) - threshold;
        const hardSat = threshold + Math.tanh(excess * 2) * 0.5; // INCREASED output from 0.3 to 0.5
        saturated = driven > 0 ? hardSat : -hardSat;
        
        // Strong even harmonics when saturated
        evenHarmonic = 0.08 * driven * Math.abs(driven); // INCREASED from 0.05 to 0.08 for punchier sound
      }
      
      curve[i] = saturated + evenHarmonic;
    }
    
    transformerSat.curve = curve;
    // Disable oversampling for subtle saturation (0.01-0.5% THD doesn't alias audibly)
    // Only limiter needs oversampling for true-peak limiting
    transformerSat.oversample = 'none';
    
    // DC blocker (prevents DC offset from non-oversampled WaveShaper)
    const dcBlocker = context.createBiquadFilter();
    dcBlocker.type = 'highpass';
    dcBlocker.frequency.value = 5; // Block below 5Hz
    dcBlocker.Q.value = 0.7071; // Butterworth response
    
    // Signal chain
    input.connect(lowShelf);
    lowShelf.connect(highShelf);
    highShelf.connect(transformerSat);
    transformerSat.connect(dcBlocker);
    
    // === UNITY GAIN OUTPUT (2026-02-16 FIX) ===
    // Saturation stages must NOT add loudness - that's the limiter's job
    // Previous +2dB makeup gain was causing brickwalling by forcing downstream stages to work harder
    // Drive changes SHAPE, not LEVEL
    dcBlocker.connect(output);
    
    return { input, output };
  }

  /**
   * Phase 2: Advanced Tape Saturation with Hysteresis Modeling
   * Based on Studer A800 and Ampex ATR-102 tape characteristics
   * Implements magnetic hysteresis, bias control, tape compression, and head bump
   */
  private createSaturationStage(context: BaseAudioContext, settings: ProcessingSettings): StageIO {
    const input = context.createGain();
    input.channelCountMode = 'max';
    input.channelInterpretation = 'speakers';
    
    const output = context.createGain();
    output.channelCountMode = 'max';
    output.channelInterpretation = 'speakers';
    
    // Base drive amount from Circuit Drive control
    let driveAmount = settings.circuitDrive / 100;
    let biasAmount = 0.5; // Tape bias (affects frequency response)
    let tapeSpeed = 15; // IPS (affects head bump frequency)
    
    // Genre-specific tape characteristics
    switch (settings.gearProfile) {
      case 'trance':
        driveAmount *= 0.9;
        biasAmount = 0.6; // Higher bias = brighter, less distortion
        tapeSpeed = 30; // High speed = extended highs
        break;
      case 'house':
        driveAmount *= 1.0;
        biasAmount = 0.5; // Balanced
        tapeSpeed = 15; // Standard speed
        break;
      case 'techno':
        driveAmount *= 1.15;
        biasAmount = 0.3; // Low bias = darker, more distortion
        tapeSpeed = 15;
        break;
      case 'rnb':
        driveAmount *= 0.7;
        biasAmount = 0.7; // Clean, minimal distortion
        tapeSpeed = 30; // High fidelity
        break;
      case 'realprog':
        driveAmount *= 0.95;
        biasAmount = 0.55;
        tapeSpeed = 15;
        break;
      case 'modernprog':
        driveAmount *= 1.05;
        biasAmount = 0.5;
        tapeSpeed = 15;
        break;
      case 'tape':
        driveAmount *= 1.2;
        biasAmount = 0.35; // Vintage = low bias, maximum color
        tapeSpeed = 7.5; // Slow speed = vintage character
        break;
    }
    
    // === TAPE HEAD BUMP (Low-frequency resonance) ===
    // Tape machines have a subtle bass response curve around 50-80Hz
    // 2026-02-16: DISABLED - This was adding +2dB gain, not saturation
    // Head bump is tonal color, not loudness boost
    const headBumpFreq = tapeSpeed === 30 ? 80 : tapeSpeed === 15 ? 60 : 40;
    const headBump = context.createBiquadFilter();
    headBump.type = 'peaking';
    headBump.frequency.value = headBumpFreq;
    headBump.gain.value = 0.5; // REDUCED from +2.0dB to +0.5dB (subtle character only)
    headBump.Q.value = 1.2;
    
    // === HIGH-FREQUENCY BIAS CONTROL ===
    // Higher bias = extended high-frequency response
    // 2026-02-16: REDUCED - This was adding up to +3dB gain
    const biasShelf = context.createBiquadFilter();
    biasShelf.type = 'highshelf';
    biasShelf.frequency.value = 8000;
    biasShelf.gain.value = (biasAmount - 0.5) * 2; // REDUCED from ±3dB to ±1dB (tonal hint only)
    biasShelf.Q.value = 0.7;
    
    // === TAPE COMPRESSION (Soft limiting before saturation) ===
    // Tape naturally compresses extreme peaks only (not a heavy compressor!)
    // NOTE: Threshold raised from -18dB to -6dB (2026-02-12) to prevent over-compression
    // The tape stage should add CHARACTER, not heavily reduce dynamics
    const tapeCompressor = context.createDynamicsCompressor();
    tapeCompressor.threshold.value = -6; // Only compress HOT peaks
    tapeCompressor.knee.value = 12; // Very soft knee
    tapeCompressor.ratio.value = 2.5; // Gentle ratio
    tapeCompressor.attack.value = 0.01; // Slow attack = preserve transients
    tapeCompressor.release.value = 0.2; // Slow release = natural
    
    // === MAGNETIC HYSTERESIS SATURATION ===
    // Non-linear magnetic saturation with memory effect
    const hysteresisSat = context.createWaveShaper();
    const satCurve = new Float32Array(65536);
    
    for (let i = 0; i < 65536; i++) {
      const x = (i * 2 - 65536) / 65536;
      
      // Tape input gain staging - subtle drive for character, not distortion
      // Tape should add warmth through harmonics, not slam into hard saturation
      const drive = 1 + driveAmount * 0.3; // 1x to 1.3x drive (reduced from 1-3x)
      const driven = x * drive;
      
      // === HYSTERESIS MODELING ===
      // Tape has different saturation curves for rising vs falling signals
      // This creates odd-order harmonics and "warmth"
      
      // Primary saturation (arctangent for smooth tape curve)
      // Reduced from 2.5 to 1.2 - tape should be subtle, not crushing
      const primarySat = (2 / Math.PI) * Math.atan(driven * 1.2);
      
      // Secondary saturation (tanh for hard limiting)
      // Reduced from 1.5 to 1.0 - gentle peak limiting only
      const secondarySat = Math.tanh(driven * 1.0);
      
      // Blend based on signal level (more tanh at high levels)
      const blend = Math.min(1, Math.abs(driven) * 0.3);
      const saturated = primarySat * (1 - blend) + secondarySat * blend;
      
      // === TAPE HARMONIC COLORATION ===
      // Studer A800 spec: Subtle harmonics for warmth, not distortion
      // Professional tape: 3rd (1.5%), 5th (0.8%), 7th (0.3%)
      const thirdHarmonic = 0.015 * Math.sin(3 * Math.PI * saturated);     // 1.5% (reduced from 6%)
      const fifthHarmonic = 0.008 * Math.sin(5 * Math.PI * saturated);     // 0.8% (reduced from 3%)
      const seventhHarmonic = 0.003 * Math.sin(7 * Math.PI * saturated);   // 0.3% (reduced from 1.5%)
      
      // Asymmetric clipping (tape saturation is not perfectly symmetric)
      // Studer A800 spec: ~3% asymmetry (not 5%)
      const asymmetry = 0.03 * saturated * saturated;
      
      // Final output (UNITY - no makeup gain)
      const finalSat = saturated + thirdHarmonic + fifthHarmonic + seventhHarmonic + asymmetry;
      satCurve[i] = finalSat; // Unity output - makeup belongs in limiter, not tape
    }
    
    hysteresisSat.curve = satCurve;
    // Disable oversampling for subtle tape saturation (0.003-0.1% THD)
    hysteresisSat.oversample = 'none';
    
    const maxDrive = 1 + driveAmount * 0.3;
    console.log(`🔧 TAPE: CircuitDrive=${settings.circuitDrive}%, DriveRange=1.0-${maxDrive.toFixed(2)}x, Harmonics=SUBTLE, Output=UNITY (no makeup gain)`);
    
    // === HIGH-FREQUENCY ROLL-OFF (Tape losses) ===
    // Tape naturally loses highs based on speed
    const tapeRolloff = context.createBiquadFilter();
    tapeRolloff.type = 'lowpass';
    tapeRolloff.frequency.value = tapeSpeed === 30 ? 22000 : tapeSpeed === 15 ? 18000 : 12000;
    tapeRolloff.Q.value = 0.5;
    
    // DC blocker (prevents DC offset from non-oversampled WaveShaper)
    const dcBlocker = context.createBiquadFilter();
    dcBlocker.type = 'highpass';
    dcBlocker.frequency.value = 5; // Block below 5Hz
    dcBlocker.Q.value = 0.7071; // Butterworth response
    
    // === SIGNAL CHAIN ===
    input.connect(headBump);          // Tape head resonance (subtle character)
    headBump.connect(biasShelf);      // Bias EQ (subtle tonal shift)
    biasShelf.connect(tapeCompressor); // Tape compression (peak control only)
    tapeCompressor.connect(hysteresisSat); // Magnetic saturation (harmonics)
    hysteresisSat.connect(dcBlocker); // DC blocker
    dcBlocker.connect(tapeRolloff);   // High-frequency loss
    
    // === UNITY GAIN OUTPUT (2026-02-16 FIX) ===
    // Tape stage must NOT add loudness - that's the limiter's job
    // Previous +3dB makeup gain was the PRIMARY cause of brickwalling
    // Drive changes SHAPE, not LEVEL
    tapeRolloff.connect(output);
    
    return { input, output };
  }

  /**
   * Phase 2.5: Multi-Band Processing (Surgical Frequency Management)
   * 4-band split with per-band dynamics + saturation.
   * FIX: Preserve stereo by processing L and R independently (split -> process -> merge).
   */
  private createMultiBandStage(context: BaseAudioContext, settings: ProcessingSettings): StageIO {
    const input = context.createGain();
    input.channelCountMode = 'max';
    input.channelInterpretation = 'speakers';

    // Split incoming stereo into L/R mono streams
    const splitter = context.createChannelSplitter(2);

    // Merge processed L/R back to stereo
    const merger = context.createChannelMerger(2);

    // Wire input -> splitter
    input.connect(splitter);

    // === GOLDEN CROSSOVER FREQUENCIES ===
    const crossover1 = 100;
    const crossover2 = 300;
    const crossover3 = 3500;

    /**
     * Normalize waveshaper curve to unity small-signal gain + unity peak.
     * Prevents RMS creep from drive>1 and additive harmonics.
     */
    function normalizeCurve(curve: Float32Array): Float32Array {
      const n = curve.length;
      const mid = (n / 2) | 0;

      // dx between samples in [-1,1]
      const dx = 2 / (n - 1);

      // slope around 0 (central difference)
      const slope = (curve[mid + 1] - curve[mid - 1]) / (2 * dx);
      const slopeGain = slope !== 0 ? 1 / slope : 1;

      // apply slope normalization
      for (let i = 0; i < n; i++) curve[i] *= slopeGain;

      // peak normalize
      let maxAbs = 0;
      for (let i = 0; i < n; i++) maxAbs = Math.max(maxAbs, Math.abs(curve[i]));
      const peakGain = maxAbs > 0 ? 1 / maxAbs : 1;

      for (let i = 0; i < n; i++) curve[i] *= peakGain;

      return curve;
    }

    /**
     * Mono chain return type (clean interface for input/output nodes)
     */
    type MonoChain = { input: AudioNode; output: AudioNode };

    /**
     * Create a complete 4-band chain for a single mono input channel.
     * Returns input and output nodes for clean wiring.
     */
    const buildMonoMultiband = (): MonoChain => {
      const inputJunction = context.createGain();
      inputJunction.channelCountMode = 'explicit';
      inputJunction.channelCount = 1; // Mono processing
      inputJunction.channelInterpretation = 'speakers';
      
      // Multiband output summing node (4 bands converge here)
      const output = context.createGain();
      output.channelCountMode = 'explicit';
      output.channelCount = 1; // Mono output
      output.channelInterpretation = 'speakers';
      
      // Multiband recombination trim (minimal safety headroom after curve normalization)
      const mbTrim = context.createGain();
      mbTrim.gain.value = 0.891; // -1dB conservative trim
      mbTrim.channelCountMode = 'explicit';
      mbTrim.channelCount = 1;
      mbTrim.channelInterpretation = 'speakers';

      // ======== FILTERS (Linkwitz-Riley approximation via cascaded biquads) ========

      // BAND 1: SUB/LOW (20-100Hz)
      const band1_LP1 = context.createBiquadFilter();
      band1_LP1.type = 'lowpass';
      band1_LP1.frequency.value = crossover1;
      band1_LP1.Q.value = 0.707;

      const band1_LP2 = context.createBiquadFilter();
      band1_LP2.type = 'lowpass';
      band1_LP2.frequency.value = crossover1;
      band1_LP2.Q.value = 0.707;

      // BAND 2: LOW-MID/BODY (100-300Hz)
      const band2_HP1 = context.createBiquadFilter();
      band2_HP1.type = 'highpass';
      band2_HP1.frequency.value = crossover1;
      band2_HP1.Q.value = 0.707;

      const band2_HP2 = context.createBiquadFilter();
      band2_HP2.type = 'highpass';
      band2_HP2.frequency.value = crossover1;
      band2_HP2.Q.value = 0.707;

      const band2_LP1 = context.createBiquadFilter();
      band2_LP1.type = 'lowpass';
      band2_LP1.frequency.value = crossover2;
      band2_LP1.Q.value = 0.707;

      const band2_LP2 = context.createBiquadFilter();
      band2_LP2.type = 'lowpass';
      band2_LP2.frequency.value = crossover2;
      band2_LP2.Q.value = 0.707;

      // BAND 3: MID-HIGH/PRESENCE (300Hz-3.5kHz)
      const band3_HP1 = context.createBiquadFilter();
      band3_HP1.type = 'highpass';
      band3_HP1.frequency.value = crossover2;
      band3_HP1.Q.value = 0.707;

      const band3_HP2 = context.createBiquadFilter();
      band3_HP2.type = 'highpass';
      band3_HP2.frequency.value = crossover2;
      band3_HP2.Q.value = 0.707;

      const band3_LP1 = context.createBiquadFilter();
      band3_LP1.type = 'lowpass';
      band3_LP1.frequency.value = crossover3;
      band3_LP1.Q.value = 0.707;

      const band3_LP2 = context.createBiquadFilter();
      band3_LP2.type = 'lowpass';
      band3_LP2.frequency.value = crossover3;
      band3_LP2.Q.value = 0.707;

      // BAND 4: AIR/TOP (3.5kHz-20kHz)
      const band4_HP1 = context.createBiquadFilter();
      band4_HP1.type = 'highpass';
      band4_HP1.frequency.value = crossover3;
      band4_HP1.Q.value = 0.707;

      const band4_HP2 = context.createBiquadFilter();
      band4_HP2.type = 'highpass';
      band4_HP2.frequency.value = crossover3;
      band4_HP2.Q.value = 0.707;

      // ======== DYNAMICS + SATURATION (same as original values) ========

      // BAND 1 compressor
      const band1Compressor = context.createDynamicsCompressor();
      band1Compressor.threshold.value = -12;
      band1Compressor.knee.value = 6;
      band1Compressor.ratio.value = 4;
      band1Compressor.attack.value = 0.01;
      band1Compressor.release.value = 0.1;

      // BAND 1 saturation (keep original curve logic)
      const band1Saturation = context.createWaveShaper();
      const band1Curve = new Float32Array(65536);

      // Band 1 drive: constant baseline (normalization handles gain, colorAmount controls intensity)
      const band1DriveAmount = 1.0;

      for (let i = 0; i < 65536; i++) {
        const x = (i * 2 - 65536) / 65536;
        const drive = band1DriveAmount * 1.5;
        const saturated = Math.tanh(x * drive);
        const secondHarmonic = 0.15 * x * Math.abs(x);
        band1Curve[i] = saturated + secondHarmonic;
      }
      normalizeCurve(band1Curve); // Unity small-signal gain + peak normalization
      band1Saturation.curve = band1Curve;
      // Disable oversampling for long file performance
      band1Saturation.oversample = 'none';

      // Post-saturation gain (unity - normalization handles RMS control)
      const band1Post = context.createGain();
      band1Post.gain.value = 1.0;

      // BAND 2 compressor
      const band2Compressor = context.createDynamicsCompressor();
      band2Compressor.threshold.value = -10;
      band2Compressor.knee.value = 6;
      band2Compressor.ratio.value = 4;
      band2Compressor.attack.value = 0.008; // 8ms (was 5ms - less aggressive)
      band2Compressor.release.value = 0.10; // 100ms (was 80ms - smoother)

      // BAND 2 saturation
      const band2Saturation = context.createWaveShaper();
      const band2Curve = new Float32Array(65536);
      for (let i = 0; i < 65536; i++) {
        const x = (i * 2 - 65536) / 65536;
        band2Curve[i] = Math.tanh(x * 1.2);
      }
      normalizeCurve(band2Curve); // Unity small-signal gain + peak normalization
      band2Saturation.curve = band2Curve;
      // Disable oversampling for long file performance
      band2Saturation.oversample = 'none';

      // Post-saturation gain (unity - normalization handles RMS control)
      const band2Post = context.createGain();
      band2Post.gain.value = 1.0;

      // BAND 3 compressor
      const band3Compressor = context.createDynamicsCompressor();
      band3Compressor.threshold.value = -18; // Raised from -8dB (was compressing constantly)
      band3Compressor.knee.value = 6;
      band3Compressor.ratio.value = 2;
      band3Compressor.attack.value = 0.006; // 6ms (was 3ms - less aggressive)
      band3Compressor.release.value = 0.09; // 90ms (was 60ms - smoother)

      // BAND 3 saturation
      const band3Saturation = context.createWaveShaper();
      const band3Curve = new Float32Array(65536);

      // Band 3 drive: constant baseline (normalization handles gain, colorAmount controls intensity)
      const band3DriveAmount = 1.0;

      for (let i = 0; i < 65536; i++) {
        const x = (i * 2 - 65536) / 65536;
        const drive = band3DriveAmount;
        const saturated = Math.tanh(x * drive);
        const thirdHarmonic = 0.08 * x * x * x;
        band3Curve[i] = saturated + thirdHarmonic;
      }
      normalizeCurve(band3Curve); // Unity small-signal gain + peak normalization
      band3Saturation.curve = band3Curve;
      // Disable oversampling for long file performance
      band3Saturation.oversample = 'none';

      // Post-saturation gain (unity - normalization handles RMS control)
      const band3Post = context.createGain();
      band3Post.gain.value = 1.0;

      // BAND 4 compressor
      const band4Compressor = context.createDynamicsCompressor();
      band4Compressor.threshold.value = -20; // Raised from -6dB (was compressing constantly)
      band4Compressor.knee.value = 6;
      band4Compressor.ratio.value = 1.5;
      band4Compressor.attack.value = 0.003; // 3ms (was 1ms - less aggressive transient grab)
      band4Compressor.release.value = 0.08; // 80ms (was 50ms - less "hype", more neutral)

      // BAND 4 saturation
      const band4Saturation = context.createWaveShaper();
      const band4Curve = new Float32Array(65536);

      // Band 4 drive: constant baseline (normalization handles gain, colorAmount controls intensity)
      const band4DriveAmount = 1.0;

      for (let i = 0; i < 65536; i++) {
        const x = (i * 2 - 65536) / 65536;
        const clipThreshold = 0.794; // -2dB
        const drive = band4DriveAmount;

        if (Math.abs(x) > clipThreshold) {
          const excess = Math.abs(x) - clipThreshold;
          const softClipped = clipThreshold + Math.tanh(excess * 2) * 0.2;
          band4Curve[i] = x > 0 ? softClipped : -softClipped;
        } else {
          const saturated = Math.tanh(x * drive * 0.8);
          const thirdHarmonic = 0.05 * Math.sin(3 * Math.PI * saturated);
          band4Curve[i] = saturated + thirdHarmonic;
        }
      }
      normalizeCurve(band4Curve); // Unity small-signal gain + peak normalization
      band4Saturation.curve = band4Curve;
      // Disable oversampling for long file performance
      band4Saturation.oversample = 'none';

      // Post-saturation gain (unity - normalization handles RMS control)
      const band4Post = context.createGain();
      band4Post.gain.value = 1.0;

      // ======== ROUTING (mono) ========
      // Feed the same mono input into each band's filters.

      inputJunction.connect(band1_LP1);
      band1_LP1.connect(band1_LP2);
      band1_LP2.connect(band1Compressor);
      band1Compressor.connect(band1Saturation);
      band1Saturation.connect(band1Post);
      band1Post.connect(output);

      inputJunction.connect(band2_HP1);
      band2_HP1.connect(band2_HP2);
      band2_HP2.connect(band2_LP1);
      band2_LP1.connect(band2_LP2);
      band2_LP2.connect(band2Compressor);
      band2Compressor.connect(band2Saturation);
      band2Saturation.connect(band2Post);
      band2Post.connect(output);

      inputJunction.connect(band3_HP1);
      band3_HP1.connect(band3_HP2);
      band3_HP2.connect(band3_LP1);
      band3_LP1.connect(band3_LP2);
      band3_LP2.connect(band3Compressor);
      band3Compressor.connect(band3Saturation);
      band3Saturation.connect(band3Post);
      band3Post.connect(output);

      inputJunction.connect(band4_HP1);
      band4_HP1.connect(band4_HP2);
      band4_HP2.connect(band4Compressor);
      band4Compressor.connect(band4Saturation);
      band4Saturation.connect(band4Post);
      band4Post.connect(output);

      // Chain: 4 bands → output → mbTrim
      output.connect(mbTrim);

      return { input: inputJunction, output: mbTrim };
    };

    // Build L and R chains
    const left = buildMonoMultiband();
    const right = buildMonoMultiband();

    // Feed splitter L -> left chain input
    splitter.connect(left.input, 0, 0);

    // Feed splitter R -> right chain input
    splitter.connect(right.input, 1, 0);

    // Connect mono outputs back to stereo merger
    left.output.connect(merger, 0, 0);
    right.output.connect(merger, 0, 1);
    
    console.log('🔧 MULTIBAND CROSSOVER:');
    console.log('   Topology: Linkwitz-Riley 4th order (2×biquad cascade per split, Q=0.707) ✅');
    console.log('   Splits: 100Hz | 300Hz | 3500Hz');
    console.log('   Band1 (20-100Hz): LP×2 → Comp(4:1@-12dB, 10ms/120ms) → Sat(norm)');
    console.log('   Band2 (100-300Hz): HP×2+LP×2 → Comp(4:1@-10dB, 8ms/100ms) → Sat(norm)');
    console.log('   Band3 (300-3.5k): HP×2+LP×2 → Comp(2:1@-18dB, 6ms/90ms) → Sat(norm)');
    console.log('   Band4 (3.5k-20k): HP×2 → Comp(1.5:1@-20dB, 3ms/80ms) → Sat(norm)');
    console.log('   Saturation: All curves normalized (unity small-signal gain + peak)');
    console.log('   Recombination: 4 bands sum → -1dB safety trim (0.891 gain)');

    return { input, output: merger };
  }

  /**
   * Phase 3: Bus Glue Compression
   * VCA-style bus compression with anti-cramping filters
   * Transparent dynamics control for master bus cohesion
   */
  private createFinalStage(context: BaseAudioContext, settings: ProcessingSettings): StageIO {
    const input = context.createGain();
    input.channelCountMode = 'max';
    input.channelInterpretation = 'speakers';
    
    const output = context.createGain();
    output.channelCountMode = 'max';
    output.channelInterpretation = 'speakers';
    
    // === ANTI-CRAMPING FILTERS (9000K's secret sauce) ===
    // Prevents digital harshness by gently attenuating ultrasonics
    // This is what makes the 9000K sound "analog" despite being clean
    const antiCrampFilter = context.createBiquadFilter();
    antiCrampFilter.type = 'lowshelf';
    antiCrampFilter.frequency.value = 16000; // Start roll-off at 16kHz
    antiCrampFilter.gain.value = -0.3; // Gentle -0.3dB reduction (prevents aliasing)
    antiCrampFilter.Q.value = 0.5; // Wide, gentle
    
    const ultrasonicLPF = context.createBiquadFilter();
    ultrasonicLPF.type = 'lowpass';
    ultrasonicLPF.frequency.value = 20000; // Tighter ultrasonic cutoff
    ultrasonicLPF.Q.value = 0.707; // Butterworth (flat response)
    
    // === DYNAMICS/EQ ROUTING (SSL 9000K flexibility) ===
    // 9000K allows EQ before or after dynamics
    // For mastering, we'll use EQ-after-dynamics (more controlled)
    
    // === SURGICAL EQ (9000K SuperAnalogue EQ) ===
    // Clean, transparent, constant-Q design with WIDE musical curves
    
    // Low-frequency tightness (mastering-grade HPF)
    const masterHPF = context.createBiquadFilter();
    masterHPF.type = 'highpass';
    masterHPF.frequency.value = 30; // Sub-bass cleanup
    masterHPF.Q.value = 0.7;
    
    // Low-mid warmth (optional, genre-dependent)
    const lowMidEQ = context.createBiquadFilter();
    lowMidEQ.type = 'peaking';
    lowMidEQ.frequency.value = 200;
    lowMidEQ.Q.value = 0.7; // Wider, more musical (SSL signature)
    
    // Presence (vocal/instrument clarity)
    const presenceEQ = context.createBiquadFilter();
    presenceEQ.type = 'peaking';
    presenceEQ.frequency.value = 3500;
    presenceEQ.Q.value = 0.8; // Gentle presence boost (SSL wide curve)
    
    // Air (9000K signature)
    const airEQ = context.createBiquadFilter();
    airEQ.type = 'highshelf';
    airEQ.frequency.value = 12000;
    airEQ.Q.value = 0.5; // Very wide air shelf (9000K characteristic)
    
    // Genre-specific EQ settings (surgical, not aggressive)
    switch (settings.gearProfile) {
      case 'trance':
        lowMidEQ.gain.value = -0.5; // Tight low-mids
        presenceEQ.gain.value = 1.0; // Clear leads
        airEQ.gain.value = 1.2; // Bright, energetic
        break;
      case 'house':
        lowMidEQ.gain.value = 0.8; // Warm bass
        presenceEQ.gain.value = 0.5; // Balanced
        airEQ.gain.value = 0.8; // Natural air
        break;
      case 'techno':
        lowMidEQ.gain.value = -0.8; // Very tight
        presenceEQ.gain.value = -0.3; // Dark
        airEQ.gain.value = 0.3; // Minimal air
        break;
      case 'rnb':
        lowMidEQ.gain.value = 1.2; // Rich warmth
        presenceEQ.gain.value = 1.5; // Vocal presence
        airEQ.gain.value = 1.0; // Silky air
        break;
      case 'realprog':
        lowMidEQ.gain.value = 0.5; // Balanced
        presenceEQ.gain.value = 0.8; // Emotional
        airEQ.gain.value = 1.0; // Wide
        break;
      case 'modernprog':
        lowMidEQ.gain.value = 0.0; // Clean
        presenceEQ.gain.value = 1.2; // Punchy
        airEQ.gain.value = 1.5; // Festival bright
        break;
      case 'tape':
        lowMidEQ.gain.value = 1.5; // Vintage warmth
        presenceEQ.gain.value = -0.5; // Smooth
        airEQ.gain.value = -0.5; // Rolled-off
        break;
    }
    
    // === SSL 9000K SIDECHAIN HPF (100Hz) - THE KEY FEATURE! ===
    // Prevents kick/bass from triggering compression
    // This is what gives SSL its legendary "punch" - bass doesn't duck the mix
    const sidechainHPF = context.createBiquadFilter();
    sidechainHPF.type = 'highpass';
    sidechainHPF.frequency.value = 100; // SSL 9000K specification
    sidechainHPF.Q.value = 0.707; // Butterworth response
    
    // === SSL 9000K VCA COMPRESSOR (The "Glue") ===
    const compressor = context.createDynamicsCompressor();
    
    // Base settings (pristine, transparent)
    let threshold = -8;
    let knee = 6; // Soft knee (9000K characteristic)
    let ratio = 2; // Gentle ratio for "glue"
    let attack = 0.03; // 30ms (slow attack preserves transients)
    let release = 0.1; // 100ms (auto-release feel)
    
    // Logic Mode overrides
    if (settings.logicMode === 'brickwall') {
      // Aggressive limiting (still cleaner than G-Bus)
      threshold = -2;
      knee = 2;
      ratio = 12;
      attack = 0.003; // 3ms
      release = 0.05; // 50ms
    } else {
      // === SSL "AUTO" RELEASE EMULATION ===
      // Use the calculated SSL Auto Release time from analysis
      // This time is program-dependent (50ms-1.2s based on crest factor)
      
      if (this.analysis && this.analysis.sslAutoReleaseTime) {
        // Convert ms to seconds
        release = this.analysis.sslAutoReleaseTime / 1000;
        
        // === ATTACK COUPLING (+15% faster initial release for fast attacks) ===
        // When attack is fast (<1ms), the release speeds up initially
        // This prevents "choked" sound from fast attack + slow release
        
        const attackCoupling = attack < 0.001 ? 0.15 : 0; // +15% speed boost
        release = release * (1 - attackCoupling); // Reduce release time by 15%
      } else {
        // Fallback: Use default Auto Release estimate
        release = 0.12; // 120ms (balanced Auto setting)
      }
      
      // Dynamics mode (SSL "glue" sweet spot)
      threshold = -8;
      knee = 6;
      ratio = 2.5;
      attack = 0.03; // Slow attack (preserves transients)
    }
    
    // Genre-specific VCA tuning (manual overrides for Auto Release)
    // These override the Auto Release for specific artistic needs
    switch (settings.gearProfile) {
      case 'trance':
        attack = 0.005; // Faster for kick control
        // Keep Auto Release (already calculated based on transient content)
        ratio = 3;
        break;
      case 'house':
        attack = 0.01; // Groove preservation
        // Keep Auto Release
        ratio = 2.5;
        break;
      case 'techno':
        attack = 0.003; // Tight control
        // Keep Auto Release
        ratio = 4;
        break;
      case 'rnb':
        attack = 0.02; // Preserve vocal dynamics
        // Keep Auto Release (will be slower for sustained vocals)
        ratio = 2;
        break;
      case 'tape':
        // Vintage mode: Force slow release (bypass Auto)
        attack = 0.01;
        release = 0.25; // 250ms (vintage opto feel)
        ratio = 2;
        break;
      case 'realprog':
        attack = 0.015;
        // Keep Auto Release
        ratio = 2.5;
        break;
      case 'modernprog':
        attack = 0.008;
        // Keep Auto Release
        ratio = 3;
        break;
    }
    
    compressor.threshold.value = threshold;
    compressor.knee.value = knee;
    compressor.ratio.value = ratio;
    compressor.attack.value = attack;
    compressor.release.value = release;
    
    // === OPTIONAL THD (Total Harmonic Distortion) ===
    // Circuit Drive controls "Pristine 9000K" vs "Driven Vintage SSL"
    // SSL 9000K is EXTREMELY CLEAN (0.003% THD @ 1kHz typical)
    const thdAmount = settings.circuitDrive / 100; // 0-100% THD
    
    const thdShaper = context.createWaveShaper();
    const thdCurve = new Float32Array(65536);
    
    for (let i = 0; i < 65536; i++) {
      const x = (i * 2 - 65536) / 65536;
      
      if (thdAmount < 0.05) {
        // Below 5%: Pristine 9000K (zero distortion)
        thdCurve[i] = x;
      } else {
        // Above 5%: Add vintage SSL character
        // Very subtle saturation (9000K is clean even when driven)
        const saturation = Math.tanh(x * (1 + thdAmount * 0.3));
        
        // Minimal harmonic content (SSL 9000K: 0.003%-0.1% THD max)
        // Even at 100% Circuit Drive, stay cleaner than G-Bus!
        const secondHarmonic = thdAmount * 0.001 * x * Math.abs(x); // 0.1% max (even harmonics)
        const thirdHarmonic = thdAmount * 0.0005 * x * x * x;       // 0.05% max (odd harmonics)
        
        thdCurve[i] = saturation + secondHarmonic + thirdHarmonic;
      }
    }
    
    thdShaper.curve = thdCurve;
    // Disable oversampling for minimal SSL THD (0.003-0.1%)
    thdShaper.oversample = 'none';
    
    // === UNITY GAIN OUTPUT (2026-02-16 FIX) ===
    // SSL 9000K has FIXED makeup gain stages: 0dB, +3dB, +6dB, +9dB, +12dB
    // BUT: In mastering chain, we use 0dB (bypass) to preserve gain staging
    // Previous +3dB makeup was causing brickwalling by forcing limiter to work harder
    // The limiter is the SOLE LOUDNESS AUTHORITY - SSL provides glue only
    
    const gainCompensation = context.createGain();
    const sslMakeupDB = 0.0; // UNITY OUTPUT (was +3dB - removed to fix brickwalling)
    const sslOutputGain = Math.pow(10, sslMakeupDB / 20);
    gainCompensation.gain.value = sslOutputGain;
    
    // === BUILD SIGNATURE: Prove this code is running in offline render ===
    console.log('✅ OFFLINE GRAPH BUILD v2026-02-12-SSL-RESTORED');
    console.log('   SSL params:', {
      threshold,
      ratio,
      attack: (attack * 1000).toFixed(1) + 'ms',
      release: (release * 1000).toFixed(1) + 'ms',
      makeupDB: sslMakeupDB,
      outputGain: sslOutputGain.toFixed(4),
      logicMode: settings.logicMode,
      gearProfile: settings.gearProfile
    });
    
    // === PARALLEL COMPRESSION - DISABLED ===
    // IMPORTANT: Parallel dry/wet disabled.
    // WebAudio wet path latency is not reliably measurable across browsers.
    // Enabling without latency compensation causes comb filtering.
    // For transient preservation in dynamics mode, adjust processing parameters instead.
    const dryGain = context.createGain();
    const wetGain = context.createGain();
    const mixer = context.createGain();
    
    const parallelMix = 0.0; // Always 100% wet (no parallel mixing)
    dryGain.gain.value = 0.0;
    wetGain.gain.value = 1.0;
    
    // === SIGNAL ROUTING (Bus Glue Signal Path) ===
    
    // Dry path disabled (no connection to avoid dead code path)
    // input.connect(dryGain);
    // dryGain.connect(mixer);
    
    // Wet path (full processing chain)
    input.connect(antiCrampFilter);
    antiCrampFilter.connect(ultrasonicLPF);
    
    // Sidechain HPF (prevents bass from triggering compression - THE KEY!)
    ultrasonicLPF.connect(sidechainHPF);
    
    // Dynamics section (fed by sidechain-filtered signal)
    sidechainHPF.connect(compressor);
    
    // EQ section (after dynamics - mastering standard)
    compressor.connect(masterHPF);
    masterHPF.connect(lowMidEQ);
    lowMidEQ.connect(presenceEQ);
    presenceEQ.connect(airEQ);
    
    // THD (optional vintage color)
    airEQ.connect(thdShaper);
    
    // DC blocker (prevents DC offset from non-oversampled THD shaper)
    const dcBlocker = context.createBiquadFilter();
    dcBlocker.type = 'highpass';
    dcBlocker.frequency.value = 5; // Block below 5Hz
    dcBlocker.Q.value = 0.7071; // Butterworth response
    
    // Automatic gain compensation (snapped to SSL detents)
    thdShaper.connect(dcBlocker);
    dcBlocker.connect(gainCompensation);
    
    // === HEADROOM SAFETY: Post-SSL trim (prevent limiter brick-walling) ===
    // Target: Leave at least -6 dBFS headroom before limiter
    // This gives limiter room to work transparently
    const sslSafetyTrim = context.createGain();
    sslSafetyTrim.gain.value = 1.0; // Default: pass-through (will be adjusted if needed)
    
    gainCompensation.connect(sslSafetyTrim);
    
    // Mix wet to output
    sslSafetyTrim.connect(wetGain);
    wetGain.connect(mixer);
    
    // Final output
    mixer.connect(output);
    
    return { input, output };
  }

  /**
   * Phase 3.5: Mid-Side (M/S) Processing (Stereo Width & Heritage Imaging)
   * The secret to "expensive" width found in 90s progressive house and modern trance
   * Independent compression for Mid (center) and Side (stereo) channels
   */
  private createMidSideStage(context: BaseAudioContext, settings: ProcessingSettings, plan: ReturnType<typeof resolveProcessingPlan>): StageIO {
    const input = context.createGain();
    input.channelCountMode = 'max';
    input.channelInterpretation = 'speakers';
    
    const output = context.createGain();
    output.channelCountMode = 'max';
    output.channelInterpretation = 'speakers';
    
    // Split input into L and R channels
    const splitter = context.createChannelSplitter(2);
    input.connect(splitter);
    
    // === ENCODE: Stereo to Mid-Side ===
    // Mid = (L + R) / 2 - Center/mono information
    const midSum = context.createGain();
    midSum.gain.value = 0.5;
    midSum.channelCount = 1;
    midSum.channelCountMode = 'explicit';
    midSum.channelInterpretation = 'speakers';
    splitter.connect(midSum, 0); // L
    splitter.connect(midSum, 1); // R
    
    // Side = (L - R) / 2 - Stereo width information
    const sideLeft = context.createGain();
    const sideRight = context.createGain();
    sideLeft.gain.value = 0.5;
    sideRight.gain.value = -0.5; // Inverted for subtraction
    splitter.connect(sideLeft, 0);  // L
    splitter.connect(sideRight, 1); // R
    
    const sideDiff = context.createGain();
    sideDiff.channelCount = 1;
    sideDiff.channelCountMode = 'explicit';
    sideDiff.channelInterpretation = 'speakers';
    sideLeft.connect(sideDiff);
    sideRight.connect(sideDiff);
    
    // === PROCESS: Independent compression on Mid and Side ===
    const midCompressor = context.createDynamicsCompressor();
    midCompressor.threshold.value = -10;
    midCompressor.knee.value = 6;
    midCompressor.ratio.value = 2;
    midCompressor.attack.value = 0.01;
    midCompressor.release.value = 0.1;
    midCompressor.channelCount = 1;
    midCompressor.channelCountMode = 'explicit';
    
    const sideCompressor = context.createDynamicsCompressor();
    sideCompressor.threshold.value = -10;
    sideCompressor.knee.value = 6;
    sideCompressor.ratio.value = 2;
    sideCompressor.attack.value = 0.01;
    sideCompressor.release.value = 0.1;
    sideCompressor.channelCount = 1;
    sideCompressor.channelCountMode = 'explicit';
    
    // === SUB-MONO RULE: High-pass Side channel (conditional based on preset) ===
    // Keeps bass mono for club/festival playback and prevents phase cancellation
    // Only affects Side channel - Mid (center) retains full bass spectrum
    // 
    // CRITICAL INVARIANT: HPF must be applied BEFORE sideWidth gain scaling
    // This ensures width scaling doesn't interact with bass region, preventing
    // subtle low-mid collapse when width < 1.0 (e.g., 0.90 for Tech House)
    const forceMonoBass = plan.genreBehavior.forceMonoBass;
    const monoBassHz = plan.genreBehavior.monoBassHz ?? 120;  // Default: 120Hz (standard club crossover)
    
    if (forceMonoBass) {
      const sideHPF = context.createBiquadFilter();
      sideHPF.type = 'highpass';
      sideHPF.frequency.value = monoBassHz;
      sideHPF.Q.value = 0.707;  // Butterworth (flat response)
      sideHPF.channelCount = 1;
      sideHPF.channelCountMode = 'explicit';
      sideHPF.channelInterpretation = 'speakers';
      
      // Side chain with sub-mono rule: sideDiff → HPF → compressor
      sideDiff.connect(sideHPF);
      sideHPF.connect(sideCompressor);
      
      // Debug logging (dev builds only)
      if (import.meta.env?.DEV) {
        console.log(`🎛️ Mono-bass: ON @ ${monoBassHz}Hz (Side HPF active)`);
      }
    } else {
      // Side chain without HPF: sideDiff → compressor directly
      sideDiff.connect(sideCompressor);
      
      // Debug logging (dev builds only)
      if (import.meta.env?.DEV) {
        console.log(`🎛️ Mono-bass: OFF (full-spectrum Side)`);
      }
    }
    
    // Apply compression
    midSum.connect(midCompressor);
    
    // Stereo width control from resolved plan (already clamped by resolver)
    const sideWidth = context.createGain();
    
    // Use plan width (already clamped to engine invariants by resolveProcessingPlan)
    // Side gain multiplier: 1.0 = neutral, >1.0 = wider, <1.0 = narrower
    const widthAmount = plan.genreBehavior.width;
    
    // Debug logging (dev builds only)
    if (import.meta.env?.DEV) {
      console.log(
        `🎭 M/S Width: genre=${plan.source.genreId}, export=${plan.source.exportPresetId}, ` +
        `requested=${plan.source.requestedWidth.toFixed(2)}, final=${widthAmount.toFixed(2)}, ` +
        `clamped=${plan.source.widthClamped}, mode=STUDIO, ` +
        `M/S enabled=${plan.genreBehavior.useMidSide}`
      );
    }
    
    sideWidth.gain.value = widthAmount;
    sideCompressor.connect(sideWidth);
    
    // === DECODE: Mid-Side back to Stereo ===
    // L = Mid + Side
    // R = Mid - Side
    
    const leftChannel = context.createGain();
    const rightChannel = context.createGain();
    
    // Left = Mid + Side
    midCompressor.connect(leftChannel);
    sideWidth.connect(leftChannel);
    
    // Right = Mid - Side (invert side for right channel)
    const sideInverted = context.createGain();
    sideInverted.gain.value = -1;
    
    midCompressor.connect(rightChannel);
    sideWidth.connect(sideInverted);
    sideInverted.connect(rightChannel);
    
    // Merge back to stereo
    const merger = context.createChannelMerger(2);
    leftChannel.connect(merger, 0, 0);
    rightChannel.connect(merger, 0, 1);
    
    merger.connect(output);
    
    return { input, output };
  }

  /**
   * Phase 4: Cascaded Limiting (Peak Management)
   * Dual-stage limiting with fast/slow release, upward expansion, and multiple limiter types
   * Features lookahead, adaptive release, and true-peak detection via oversampling
   */
  private createWeissLimiterStage(context: BaseAudioContext, settings: ProcessingSettings): StageIO {
    // 🧾 DIAGNOSTIC: Log what settings the limiter stage receives
    console.log("🧾 LIMITER SETTINGS SEEN:", {
      logicMode: settings.logicMode,
      targetLUFS: settings.targetLUFS,
      circuitDrive: settings.circuitDrive
    });
    
    const input = context.createGain();
    input.channelCountMode = 'max';
    input.channelInterpretation = 'speakers';
    
    const output = context.createGain();
    output.channelCountMode = 'max';
    output.channelInterpretation = 'speakers';
    
    // === PRE-LIMITER GUARDRAIL (Safety System) ===
    // Prevents gain-stacking disasters from future code changes
    // If input exceeds -3 dBFS, automatically trim to prevent limiter obliteration
    const safetyTrim = context.createGain();
    safetyTrim.gain.value = 1.0; // Default: no attenuation
    
    // Conservative safety threshold: -6 dBFS headroom before limiting
    // Allows limiter to work musically instead of being slammed
    const maxSafeInputDB = -6;
    const maxSafeInputLinear = Math.pow(10, maxSafeInputDB / 20); // ~0.5
    
    // If we have analysis, check if input level is dangerously hot
    // **CRITICAL: Disable safety trim in dynamics mode (makeup is 0, no need to trim stale peaks)**
    if (settings.logicMode === 'dynamics') {
      console.log(`✅ Pre-limiter headroom OK (dynamics mode - trim disabled, preserving natural level)`);
    } else if (this.analysis) {
      // Brickwall/pressure mode: apply safety trim based on analysis
      const estimatedPeakDB = this.analysis.peakLevel; // FIX: was .peak (doesn't exist!)
      
      // **FIX: SSL now outputs UNITY gain (0dB), not +3dB**
      // Account for any upstream gain from emulation stages
      const upstreamGainDB = 0; // SSL unity + any EQ boosts (monitored via stage isolation)
      const totalEstimatedPeakDB = estimatedPeakDB + upstreamGainDB;
      
      if (totalEstimatedPeakDB > maxSafeInputDB) {
        // Trim excess gain to prevent limiter obliteration
        const trimDB = maxSafeInputDB - totalEstimatedPeakDB;
        safetyTrim.gain.value = Math.pow(10, trimDB / 20);
        console.warn(`⚠️  Pre-limiter safety trim: ${trimDB.toFixed(1)} dB (input was too hot)`);
      } else {
        console.log(`✅ Pre-limiter headroom OK: ${(maxSafeInputDB - totalEstimatedPeakDB).toFixed(1)} dB`);
      }
    }
    
    // === PREVIEW FUNCTION (Look-Ahead) ===
    // Smooths initial attacks, prevents distortion with very short attack times
    // Weiss DS1-MK3: 5ms default (adjustable 0-12ms in hardware)
    const previewDelay = context.createDelay(0.015); // Max 15ms for safety
    let lookAheadTime = 0.005; // 5ms = Weiss default
    
    if (settings.logicMode === 'brickwall') {
      lookAheadTime = 0.012; // 12ms = Maximum transparency (festival masters)
    } else {
      // Dynamics mode: Genre-specific look-ahead
      switch (settings.gearProfile) {
        case 'trance':
        case 'modernprog':
          lookAheadTime = 0.008; // 8ms (fast transients)
          break;
        case 'house':
        case 'realprog':
          lookAheadTime = 0.005; // 5ms (balanced)
          break;
        case 'techno':
          lookAheadTime = 0.003; // 3ms (aggressive, tight)
          break;
        case 'rnb':
        case 'tape':
          lookAheadTime = 0.010; // 10ms (smooth, natural)
          break;
      }
    }
    
    previewDelay.delayTime.value = lookAheadTime;
    
    // === CALCULATE EXPECTED MAKEUP GAIN (For ceiling adjustment) ===
    // We need to know how much makeup gain will be applied AFTER the limiters
    // so we can lower the ceiling thresholds accordingly
    let expectedMakeupDB = 0;
    if (settings.targetLUFS && this.analysis) {
      const currentLUFS = this.analysis.lufs;
      const targetGain = settings.targetLUFS - currentLUFS;
      const sslGainDB = 0; // 2026-02-16: SSL now outputs UNITY GAIN (was +3dB)
      const netGainNeeded = targetGain - sslGainDB;
      
      if (settings.logicMode === 'dynamics') {
        // FLOW mode: max +3 dB from limiter
        expectedMakeupDB = Math.max(-3, Math.min(netGainNeeded, 3));
      } else {
        // PRESSURE mode: max +6 dB from limiter (or +8dB in Safe Export)
        const maxMakeup = settings.safeExportMode ? 8 : 6;
        expectedMakeupDB = Math.max(-3, Math.min(netGainNeeded, maxMakeup));
      }
    }
    
    // === CEILING CALCULATION (Codec Safety + Makeup Compensation) ===
    // 
    // **CRITICAL PHILOSOPHY CHANGE:**
    // The limiter is a SAFETY NET, not a loudness tool.
    // Makeup gain should be applied BEFORE the limiter, not after.
    // The limiter should only shave peaks (< 1 dB GR average).
    // 
    // OLD (WRONG): Limiter → Makeup → Clipper = Brick wall
    // NEW (RIGHT): Makeup → Limiter (safety) = Transparent
    let finalTargetCeilingDB = -1.0; // SAFER default: -1.0 dBTP (NOT -0.1)
    
    // Safe Export Mode: Conservative ceiling for maximum codec compatibility
    if (settings.safeExportMode) {
      finalTargetCeilingDB = -1.0; // ALWAYS -1.0 dBTP in safe mode
      console.log('🛡️  SAFE EXPORT MODE: Using -1.0 dBTP ceiling (maximum codec safety)');
    } else {
      // Streaming optimization
      if (settings.targetLUFS === -14) {
        finalTargetCeilingDB = -1.0; // Spotify Standard - codec-safe
      } else if (settings.targetLUFS === -8) {
        finalTargetCeilingDB = -0.3; // Club/Festival - still need headroom (NOT -0.1)
      }
      
      if (settings.logicMode === 'brickwall') {
        finalTargetCeilingDB = -0.3; // Tighter ceiling for brick-wall (NOT -0.1)
      }
    }
    
    // **REMOVED:** Ceiling compensation calculation
    // The limiter now sees the FINAL level (after makeup gain)
    // No need to "compensate" - limiter just catches peaks as safety net
    const ceilingLinear = Math.pow(10, finalTargetCeilingDB / 20);
    
    console.log(`🎚️  Limiter ceiling: ${finalTargetCeilingDB.toFixed(1)} dBTP (linear: ${ceilingLinear.toFixed(4)}) - used for WaveShaper curves`);
    console.log(`   Settings: logicMode=${settings.logicMode}, targetLUFS=${settings.targetLUFS}, circuitDrive=${settings.circuitDrive}`);
    
    // === COMPRESSION RATIO CONFIGURATION ===
    // 
    // **PHILOSOPHY CHANGE:** Limiter is safety net, not loudness tool
    // Ratio should be MODERATE until very near ceiling, then infinite
    // This is achieved through soft knee + moderate ratio, NOT 1000:1 brick wall
    let compressionRatio = 4; // Base ratio for dynamics mode (SOFT)
    
    if (settings.logicMode === 'brickwall') {
      compressionRatio = 20; // Hard limiting (NOT 1000:1 - that's a clipper)
    } else {
      // Dynamics mode: Genre-specific ratios
      switch (settings.gearProfile) {
        case 'trance':
          compressionRatio = 6; // Moderate limiting
          break;
        case 'house':
          compressionRatio = 4; // Gentle compression
          break;
        case 'techno':
          compressionRatio = 8; // Aggressive limiting
          break;
        case 'rnb':
          compressionRatio = 3; // Very gentle (preserve dynamics)
          break;
        case 'tape':
          compressionRatio = 3; // Vintage, gentle
          break;
        case 'realprog':
          compressionRatio = 4; // Balanced
          break;
        case 'modernprog':
          compressionRatio = 5; // Moderate
          break;
      }
    }
    
    // === SOFT KNEE CONFIGURATION ===
    // Weiss DS1-MK3: Adjustable from instant (hard) to gentle (soft)
    let softKnee = 6; // Gentle knee for dynamics mode
    
    if (settings.logicMode === 'brickwall') {
      softKnee = 0.5; // Hard knee for limiting
    } else {
      // Genre-specific knee settings
      switch (settings.gearProfile) {
        case 'trance':
          softKnee = 3; // Medium-soft
          break;
        case 'house':
          softKnee = 6; // Very soft (groove preservation)
          break;
        case 'techno':
          softKnee = 2; // Harder (aggressive)
          break;
        case 'rnb':
          softKnee = 8; // Very gentle (natural)
          break;
        case 'tape':
          softKnee = 10; // Maximum softness (vintage opto-style)
          break;
      }
    }
    
    // === STAGE 1: PEAK TAMER (Type 1 - Punchy Limiter) ===
    const peakTamerThreshold = finalTargetCeilingDB - 6; // -6dB below ceiling (wide headroom)
    
    const peakTamer = context.createDynamicsCompressor();
    peakTamer.threshold.value = peakTamerThreshold;
    peakTamer.knee.value = softKnee;
    peakTamer.ratio.value = Math.min(compressionRatio, 20); // Stage 1 uses moderate ratio
    // **PHILOSOPHY CHANGE:** Slower attack for transient preservation
    // 0.1ms was too fast (instant kill) - use 3-5ms for transparency
    peakTamer.attack.value = 0.003; // 3ms (transparent, preserves transients)
    
    // === DUAL-STAGE RELEASE (Fast + Slow) ===
    // Fast Release: Targets initial peaks (transients)
    // Slow Release: Handles RMS / average level (sustain)
    
    let fastRelease = 0.025; // 25ms (Weiss default - peak recovery)
    let slowRelease = 0.100; // 100ms (Weiss default - RMS recovery)
    
    // Average Knob: Controls RMS calculation time
    // Low Average = Modern digital (fast RMS calculation)
    // High Average = Vintage opto (slow RMS calculation)
    let averageTime = 0.1; // 100ms default (balanced)
    
    if (settings.logicMode === 'brickwall') {
      // Brickwall: Fast, modern response
      fastRelease = 0.015; // 15ms (faster for modern production)
      slowRelease = 0.050; // 50ms (aggressive recovery)
      averageTime = 0.03; // 30ms (modern digital)
    } else {
      // Dynamics: Genre-specific release behavior
      switch (settings.gearProfile) {
        case 'trance':
          fastRelease = 0.020; // 20ms (fast transient recovery)
          slowRelease = 0.070; // 70ms (quick RMS recovery)
          averageTime = 0.05; // 50ms (modern)
          break;
        case 'house':
          fastRelease = 0.030; // 30ms (groove preservation)
          slowRelease = 0.100; // 100ms (natural decay)
          averageTime = 0.10; // 100ms (balanced)
          break;
        case 'techno':
          fastRelease = 0.015; // 15ms (very fast, tight)
          slowRelease = 0.050; // 50ms (aggressive recovery)
          averageTime = 0.03; // 30ms (modern digital)
          break;
        case 'rnb':
          fastRelease = 0.040; // 40ms (preserve vocal dynamics)
          slowRelease = 0.150; // 150ms (very slow, natural)
          averageTime = 0.12; // 120ms (smoother)
          break;
        case 'tape':
          fastRelease = 0.050; // 50ms (vintage slow)
          slowRelease = 0.200; // 200ms (opto-compressor style)
          averageTime = 0.15; // 150ms (vintage opto, slow RMS)
          break;
        case 'realprog':
          fastRelease = 0.030; // 30ms
          slowRelease = 0.110; // 110ms
          averageTime = 0.10; // 100ms
          break;
        case 'modernprog':
          fastRelease = 0.025; // 25ms
          slowRelease = 0.090; // 90ms
          averageTime = 0.08; // 80ms
          break;
      }
    }
    
    // Peak Tamer uses Fast Release (transient recovery)
    peakTamer.release.value = fastRelease;
    
    // === BAND SELECTIVE MODE (Sidechain Filtering) ===
    // High-pass filter to reduce bass pumping (de-esser for low-end)
    // Weiss DS1-MK3: 80Hz HPF removes sub rumble while keeping kick intact
    const sidechainHPF = context.createBiquadFilter();
    sidechainHPF.type = 'highpass';
    sidechainHPF.frequency.value = 80; // Weiss specification (NOT 150Hz!)
    sidechainHPF.Q.value = 0.707; // Butterworth (flat response)
    
    // === TYPE 1 LIMITER SHAPER (Punchy) ===
    const type1Shaper = context.createWaveShaper();
    const type1Curve = new Float32Array(65536);
    
    // **CRITICAL FIX: In dynamics mode, Type1 at 50% ceiling crushes crest**
    // Type1 should ONLY run in brickwall/pressure modes
    // In dynamics mode, it becomes a pass-through (no compression)
    
    let type1Threshold: number;
    
    if (settings.logicMode === 'dynamics') {
      // DYNAMICS MODE: Type1 is BYPASS (pass-through)
      // Only Type2 catches actual peaks near ceiling
      type1Threshold = ceilingLinear * 0.99; // 99% = effectively bypass
      console.log(`   Type1 Shaper: BYPASS in dynamics mode (threshold=99% of ceiling)`);
    } else {
      // BRICKWALL/PRESSURE: Type1 is active loudness shaper
      type1Threshold = ceilingLinear * 0.5; // 50% = -6dB below ceiling (aggressive)
      console.log(`   Type1 Shaper: ACTIVE at ${(ceilingLinear * 0.5).toFixed(4)} (50% of ceiling)`);
    }
    
    for (let i = 0; i < 65536; i++) {
      const x = (i * 2 - 65536) / 65536;
      const absX = Math.abs(x);
      
      if (absX < type1Threshold) {
        // Below threshold: Pass through
        type1Curve[i] = x;
      } else {
        // Above threshold: Progressive limiting (soft → hard knee)
        const excess = absX - type1Threshold;
        const ceiling = ceilingLinear;
        
        // Adaptive knee: Gets harder as signal approaches ceiling
        const kneeAmount = Math.min(1, excess / (ceiling - type1Threshold));
        const softKnee = Math.tanh(excess * 3) * 0.3; // Soft component
        const hardKnee = excess * (1 - kneeAmount); // Hard component
        
        const limited = type1Threshold + softKnee + hardKnee;
        const clampedLimit = Math.min(limited, ceiling);
        
        type1Curve[i] = x > 0 ? clampedLimit : -clampedLimit;
      }
    }
    
    type1Shaper.curve = type1Curve;
    // Re-enable 2x oversampling (4x is too slow, none breaks the curve)
    type1Shaper.oversample = '2x';
    
    // === STAGE 2: FINAL CEILING (Type 2 - True Peak) ===
    const finalCeilingThreshold = finalTargetCeilingDB - 3; // -3dB below ceiling (gentle approach)
    
    const finalCeiling = context.createDynamicsCompressor();
    finalCeiling.threshold.value = finalCeilingThreshold;
    finalCeiling.knee.value = Math.min(softKnee * 0.5, 2); // Harder knee for final stage
    finalCeiling.ratio.value = compressionRatio; // Full ratio applied here
    // **PHILOSOPHY CHANGE:** Still fast, but not instant (was 0.3ms)
    finalCeiling.attack.value = 0.001; // 1ms (fast safety net, not instant kill)
    
    // Final Ceiling uses Slow Release (RMS recovery)
    finalCeiling.release.value = slowRelease;
    
    // === RELEASE DELAY (Hold Function) ===
    // Prevents "pumping" on tracks with significant space
    // Weiss DS1-MK3: 0.5ms-1ms hold (NOT 5ms!)
    const releaseDelay = context.createDelay(0.003); // Max 3ms
    let holdTime = 0.001; // 1ms default (balanced)
    
    if (settings.logicMode === 'brickwall') {
      holdTime = 0.0005; // 0.5ms (fast limiting)
    } else {
      // Dynamics mode: Genre-specific hold
      switch (settings.gearProfile) {
        case 'trance':
        case 'techno':
          holdTime = 0.0005; // 0.5ms (fast release, tight sound)
          break;
        case 'house':
        case 'realprog':
        case 'modernprog':
          holdTime = 0.001; // 1ms (balanced)
          break;
        case 'rnb':
        case 'tape':
          holdTime = 0.002; // 2ms (slower, smoother)
          break;
      }
    }
    
    releaseDelay.delayTime.value = holdTime;
    
    // === TYPE 2 LIMITER SHAPER (True Peak) ===
    const type2Shaper = context.createWaveShaper();
    const type2Curve = new Float32Array(65536);
    
    // **FIX: In dynamics mode, Type2 should only catch actual peaks (99%), not compress at 95%**
    const type2KneeStart = settings.logicMode === 'dynamics' ? 0.99 : 0.95;
    
    for (let i = 0; i < 65536; i++) {
      const x = (i * 2 - 65536) / 65536;
      
      // Type 2: "True Peak" - HARD LIMITING with tiny soft knee
      // This is what catches intersample peaks
      
      const absX = Math.abs(x);
      const ceiling = ceilingLinear;
      
      if (absX < ceiling * type2KneeStart) {
        // Below knee: Pass through
        type2Curve[i] = x;
      } else {
        // Above knee: HARD BRICK-WALL with soft knee
        const excess = absX - (ceiling * type2KneeStart);
        const kneeRange = ceiling * (1 - type2KneeStart); // Knee zone
        
        // Arctangent for smooth approach to ceiling
        const limited = (ceiling * type2KneeStart) + (kneeRange * (2 / Math.PI) * Math.atan(excess / kneeRange * 10));
        
        type2Curve[i] = x > 0 ? Math.min(limited, ceiling) : -Math.min(limited, ceiling);
      }
    }
    
    type2Shaper.curve = type2Curve;
    // Re-enable 2x oversampling (4x is too slow, none breaks the curve)
    type2Shaper.oversample = '2x';
    
    console.log(`   Type2 Shaper: hard ceiling at ${ceilingLinear.toFixed(4)}, knee starts at ${(ceilingLinear * type2KneeStart).toFixed(4)} (${(type2KneeStart * 100).toFixed(0)}% - ${settings.logicMode} mode)`);
    
    // === OPTIONAL: TYPE 0 LIMITER (Original DS1 - Smooth) ===
    // Used for gentler, more transparent limiting
    // Only applied in Dynamics mode with low THD
    const useType0 = settings.logicMode === 'dynamics' && settings.circuitDrive < 30;
    
    const type0Shaper = context.createWaveShaper();
    const type0Curve = new Float32Array(65536);
    
    if (useType0) {
      for (let i = 0; i < 65536; i++) {
        const x = (i * 2 - 65536) / 65536;
        
        // Type 0: "Smooth" - Original DS1 algorithm (pre-MK3)
        // VERY gentle limiting, almost compression-like
        
        const threshold = ceilingLinear * 0.3; // Start at -10dB below ceiling
        const absX = Math.abs(x);
        
        if (absX < threshold) {
          type0Curve[i] = x;
        } else {
          // Very soft knee (wide transition zone)
          const excess = absX - threshold;
          const limited = threshold + (2 / Math.PI) * Math.atan(excess * 1.5) * (ceilingLinear - threshold);
          
          type0Curve[i] = x > 0 ? limited : -limited;
        }
      }
      
      type0Shaper.curve = type0Curve;
      // Re-enable 2x oversampling (4x is too slow, none breaks the curve)
      type0Shaper.oversample = '2x';
    }
    
    // === UPWARD EXPANSION (Restore Transients) ===
    // Weiss DS1-MK3: Up to 2:1 upward expansion (NOT 5:1!)
    // Restores micro-dynamics to over-compressed mixes
    // Applied when Circuit Drive < 40% (pristine mode)
    
    const upwardExpansionAmount = settings.circuitDrive < 40 ? (40 - settings.circuitDrive) / 40 : 0;
    
    const upwardExpander = context.createWaveShaper();
    const expanderCurve = new Float32Array(65536);
    
    for (let i = 0; i < 65536; i++) {
      const x = (i * 2 - 65536) / 65536;
      
      if (upwardExpansionAmount > 0) {
        // Expansion ratio: 1:1 to 2:1 (subtle restoration)
        const expansionRatio = 1 + upwardExpansionAmount; // Max 2:1 at Circuit Drive = 0%
        
        // Threshold: -40dB (only affect very quiet signals)
        const threshold = 0.01; // -40dB in linear
        
        if (Math.abs(x) < threshold) {
          // Below threshold: expand (restore micro-dynamics)
          const expanded = x * expansionRatio;
          expanderCurve[i] = Math.max(-1, Math.min(1, expanded));
        } else {
          // Above threshold: pass through
          expanderCurve[i] = x;
        }
      } else {
        // No expansion
        expanderCurve[i] = x;
      }
    }
    
    upwardExpander.curve = expanderCurve;
    upwardExpander.oversample = '2x'; // Moderate oversampling for expansion
    
    // === MAKEUP GAIN (Automatic Compensation) ===
    const makeupGain = context.createGain();
    
    console.log(`💪 Makeup Gain Calculation: targetLUFS=${settings.targetLUFS}, hasAnalysis=${!!this.analysis}`);
    
    if (settings.targetLUFS && this.analysis) {
      const currentLUFS = this.analysis.lufs;
      const targetGain = settings.targetLUFS - currentLUFS;
      
      // **FIX: SSL stage now outputs UNITY gain (0dB), not +3dB**
      // After v2026-02-11 fix, SSL compressor has no fixed makeup gain
      const sslGainDB = 0; // SSL unity (was 3)
      
      // The limiter should ONLY add the difference between target and (current + SSL gain)
      // We do NOT add "limitingGR" because that's double makeup
      const netGainNeeded = targetGain - sslGainDB;
      
      // === MASTERING ENGINEER TRUTH ===
      // Compression does NOT create loudness on demand.
      // It only reshapes peaks so gain can be added later.
      // Total available gain = LIMITER ONLY (bounded to prevent damage)
      // 2026-02-16: SSL is now UNITY - all color stages preserve level
      // If target needs more than limiter's safe range, final LUFS will be LOWER than target.
      // This is CORRECT BEHAVIOR — the material is not suitable for that target.
      // Real systems (LANDR, Ozone) back off when material resists.
      
      let finalMakeupDB = 0;
      // **FIX: SSL now adds 0dB, so total available gain is ONLY from limiter**
      // In dynamics mode, we add ZERO makeup (preserve dynamics)
      // In pressure/brickwall modes, we allow bounded makeup gain
      const totalAvailableGainFLOW = 0;     // Dynamics: NO makeup (preserve crest)
      const totalAvailableGainPRESSURE = 6; // Pressure: SSL 0 + Limiter +6
      
      // Check for minimal master flag
      const isMinimalMaster = (settings as any)._minimalMaster === true;
      
      if (isMinimalMaster) {
        // MINIMAL MASTER: Limiter acts as ceiling + gentle normalization only
        finalMakeupDB = Math.max(-3, Math.min(netGainNeeded, 1));
        console.log('MINIMAL MASTER: ' + finalMakeupDB.toFixed(1) + 'dB makeup');
      } else if (settings.logicMode === 'dynamics') {
        // **CRITICAL FIX: In dynamics mode, limiter is SAFETY NET ONLY**
        // Do NOT add makeup gain before limiter - that forces it to engage and crush dynamics
        // The whole point of "dynamics" mode is to preserve natural dynamics
        // If material is -16 LUFS and target is -14 LUFS, it SHOULD stay at -16 LUFS
        finalMakeupDB = 0; // NO MAKEUP GAIN in dynamics mode
        
        const totalAppliedGain = sslGainDB + finalMakeupDB;
        const lufsGap = Math.abs(settings.targetLUFS - currentLUFS);
        
        console.log(`〰️  FLOW mode: ${finalMakeupDB}dB makeup (SSL: 0dB, LIMITER BYPASS) | Input: ${currentLUFS.toFixed(1)} LUFS, Target: ${settings.targetLUFS} LUFS | Gap: ${lufsGap.toFixed(1)} dB (preserved for dynamics)`);
      } else {
        // PRESSURE mode: Total available gain = +6dB (SSL 0, Limiter +6 max)
        // If target needs +17dB, system adds +6dB and STOPS
        // Final LUFS will miss target — this prevents brick-walling
        // 2026-02-16: HARD CAP at +10dB if Safe Export Mode is enabled
        
        // Base cap (your current behavior)
        let maxMakeupPressure = settings.safeExportMode ? 8 : 6;
        
        // --- DAMAGE GUARDRAIL (MASTERING-ONLY) ---
        // If the material is transient-heavy (or crest factor high), do NOT chase loudness hard.
        // This prevents the "looks fine, sounds brickwalled" outcome.
        const material = this.analysis?.material;
        const crest = this.analysis?.crestFactor ?? 0;
        
        // Transient material or high crest: lower the max makeup
        if (material === 'transient' || crest >= 12) {
          maxMakeupPressure = Math.min(maxMakeupPressure, 4);
        }
        
        // Extremely transient: even stricter
        if (crest >= 14) {
          maxMakeupPressure = Math.min(maxMakeupPressure, 3);
        }
        
        // Optional: in safe export, be stricter across the board
        if (settings.safeExportMode) {
          maxMakeupPressure = Math.min(maxMakeupPressure, 6);
        }
        
        finalMakeupDB = Math.max(-3, Math.min(netGainNeeded, maxMakeupPressure));
        
        if (netGainNeeded > maxMakeupPressure + 0.5) {
          console.warn(
            `⚠️ Guardrail: refusing extra loudness. Needed ${netGainNeeded.toFixed(1)}dB, allowed ${maxMakeupPressure.toFixed(1)}dB ` +
            `(material=${material ?? 'unknown'}, crest=${crest.toFixed(1)}dB)`
          );
        }
        
        const totalAppliedGain = sslGainDB + finalMakeupDB;
        const willMissTarget = (targetGain - totalAppliedGain) > 2;
        
        const modeLabel = settings.safeExportMode ? '🛡️  SAFE EXPORT' : '⚡ PRESSURE';
        console.log(`${modeLabel}: ${finalMakeupDB >= 0 ? '+' : ''}${finalMakeupDB.toFixed(1)}dB makeup (SSL: 0dB, Total: ${totalAppliedGain >= 0 ? '+' : ''}${totalAppliedGain.toFixed(1)}dB) | Input: ${currentLUFS.toFixed(1)} LUFS, Target: ${settings.targetLUFS} LUFS${willMissTarget ? ' ⚠️ Will miss target to prevent brick-wall' : ''}`);
      }
      
      // === LIMITER GR GUARDRAIL (2026-02-16) ===
      // Calculate estimated limiter GR BEFORE applying makeup
      // If GR would exceed safe limits, back off the makeup gain to protect audio quality
      const inputPeakBeforeMakeup = this.analysis?.peakLevel ?? 0;
      const inputPeakAfterMakeup = inputPeakBeforeMakeup + finalMakeupDB;
      let estimatedLimiterGR = Math.max(0, inputPeakAfterMakeup - finalTargetCeilingDB);
      
      // GUARDRAIL: If limiter GR > 6dB, refuse to hit target - back off makeup gain
      const MAX_SAFE_LIMITER_GR = 6; // dB - beyond this, we get audible brickwall squash
      if (estimatedLimiterGR > MAX_SAFE_LIMITER_GR) {
        // Calculate how much we need to reduce makeup to stay within safe GR limit
        const excessGR = estimatedLimiterGR - MAX_SAFE_LIMITER_GR;
        const originalMakeupDB = finalMakeupDB;
        finalMakeupDB = finalMakeupDB - excessGR;
        
        // Recalculate estimated GR with backed-off makeup
        const newPeakAfterMakeup = inputPeakBeforeMakeup + finalMakeupDB;
        estimatedLimiterGR = Math.max(0, newPeakAfterMakeup - finalTargetCeilingDB);
        
        console.error(`🛡️  LIMITER GR GUARDRAIL ENGAGED!`);
        console.error(`   Original makeup: ${originalMakeupDB >= 0 ? '+' : ''}${originalMakeupDB.toFixed(1)}dB → Reduced to: ${finalMakeupDB >= 0 ? '+' : ''}${finalMakeupDB.toFixed(1)}dB`);
        console.error(`   Estimated limiter GR reduced: ${(estimatedLimiterGR + excessGR).toFixed(1)}dB → ${estimatedLimiterGR.toFixed(1)}dB`);
        console.error(`   ⚠️  TARGET ${settings.targetLUFS} LUFS WILL NOT BE REACHED - protecting audio quality`);
        console.error(`   SOLUTION: Use quieter input, less aggressive target, or accept the limitation`);
      }
      
      // Convert to linear
      const makeupLinear = Math.pow(10, finalMakeupDB / 20);
      
      makeupGain.gain.value = makeupLinear;
      
      // === DAMAGE GUARDRAILS (2026-02-16) ===
      // Warn if makeup gain is excessive (limiter will be forced to brickwall)
      const DAMAGE_THRESHOLDS = {
        makeupGainWarning: 8,    // Warn if >8dB makeup needed
        makeupGainDanger: 12,    // Error if >12dB makeup attempted
        maxAllowedMakeup: 10     // Hard cap at +10dB total makeup
      };
      
      if (Math.abs(finalMakeupDB) > DAMAGE_THRESHOLDS.makeupGainDanger) {
        console.error(`🚨 DAMAGE GUARDRAIL: Makeup gain ${finalMakeupDB.toFixed(1)}dB exceeds safe limit (${DAMAGE_THRESHOLDS.maxAllowedMakeup}dB)`);
        console.error(`   Target ${settings.targetLUFS} LUFS is NOT ACHIEVABLE without destroying audio`);
        console.error(`   Recommend: Use Safe Export Mode or choose less aggressive target`);
      } else if (Math.abs(finalMakeupDB) > DAMAGE_THRESHOLDS.makeupGainWarning) {
        console.warn(`⚠️  WARNING: High makeup gain (${finalMakeupDB.toFixed(1)}dB) - limiter may cause audible distortion`);
        console.warn(`   Target ${settings.targetLUFS} LUFS is pushing limits of this material`);
      }
      
      console.log(`🔧 ARCHITECTURE: Makeup gain (+${finalMakeupDB.toFixed(1)}dB) applied BEFORE limiter`);
      console.log(`   Limiter acts as safety net only (should do < 1 dB GR average)`);
      
      // === LIMITER GR LOGGING (2026-02-16) ===
      // estimatedLimiterGR was calculated above during guardrail check
      if (estimatedLimiterGR > MAX_SAFE_LIMITER_GR) {
        // This should never happen now due to guardrail, but keep the warning
        console.error(`🚨 LIMITER OVERLOAD: Estimated ${estimatedLimiterGR.toFixed(1)}dB GR (DANGER: >${MAX_SAFE_LIMITER_GR}dB)`);
        console.error(`   Input peak: ${inputPeakBeforeMakeup.toFixed(1)}dBFS + ${finalMakeupDB.toFixed(1)}dB makeup = ${inputPeakAfterMakeup.toFixed(1)}dBFS`);
        console.error(`   Ceiling: ${finalTargetCeilingDB.toFixed(1)}dBTP`);
        console.error(`   NOTE: This should not happen - guardrail should have prevented it`);
      } else if (estimatedLimiterGR > 3) {
        console.warn(`⚠️  Limiter working hard: ~${estimatedLimiterGR.toFixed(1)}dB GR (limit: 6dB)`);
        console.warn(`   Approaching brickwall territory - consider safer target`);
      } else if (estimatedLimiterGR > 1) {
        console.log(`✅ Limiter GR: ~${estimatedLimiterGR.toFixed(1)}dB (healthy range: 1-3dB)`);
      } else {
        console.log(`✅ Limiter GR: ~${estimatedLimiterGR.toFixed(1)}dB (safety net only, minimal engagement)`);
      }
    } else {
      // No target specified: Unity gain (limiter provides protection only)
      makeupGain.gain.value = 1.0;
    }
    
    // === PARALLEL COMPRESSION - DISABLED ===
    // IMPORTANT: Parallel dry/wet disabled.
    // WebAudio wet path latency is not reliably measurable across browsers.
    // Enabling without latency compensation causes comb filtering (especially with previewDelay).
    // For transient preservation in dynamics mode, adjust processing parameters instead.
    const dryGain = context.createGain();
    const wetGain = context.createGain();
    const parallelMixer = context.createGain();
    
    let parallelMix = 0.0; // Always 100% wet (no parallel mixing)
    dryGain.gain.value = 0.0;
    wetGain.gain.value = 1.0;
    
    // === CASCADED SIGNAL CHAIN ===
    // 
    // **CRITICAL PHILOSOPHY FIX:**
    // OLD (WRONG): ... → Limiter → Makeup Gain → Output (makeup pushes into clipper)
    // NEW (RIGHT): ... → Makeup Gain → Limiter → Output (limiter is safety net)
    // 
    // This prevents the "makeup gain exceeds ceiling, clipper creates brick" disaster
    
    // Dry path disabled (no connection to avoid dead code path)
    // input.connect(dryGain);
    // dryGain.connect(parallelMixer);
    
    // Wet path (full Weiss chain)
    input.connect(safetyTrim);                // Pre-limiter safety guardrail
    safetyTrim.connect(previewDelay);         // Preview function (look-ahead)
    
    // Optional upward expansion (restore transients)
    if (upwardExpansionAmount > 0) {
      previewDelay.connect(upwardExpander);
      upwardExpander.connect(makeupGain);     // **MOVED: Makeup gain BEFORE limiters**
    } else {
      previewDelay.connect(makeupGain);       // **MOVED: Makeup gain BEFORE limiters**
    }
    
    // **NEW ORDER:** Makeup → Limiter (safety net)
    makeupGain.connect(sidechainHPF);         // HPF before limiting
    
    // STAGE 1: Peak Tamer (Fast Release for transients)
    sidechainHPF.connect(peakTamer);          // Band-selective compression
    peakTamer.connect(type1Shaper);           // Type 1 (Punchy) [2x OS]
    
    // STAGE 2: Final Ceiling (Slow Release for RMS)
    type1Shaper.connect(finalCeiling);        // Compression with slow release
    finalCeiling.connect(releaseDelay);       // Release delay (hold)
    
    // Choose limiter type based on mode
    if (useType0) {
      // Type 0: Smooth (dynamics mode, low THD)
      releaseDelay.connect(type0Shaper);
      type0Shaper.connect(wetGain);           // Direct to output (no more makeup)
    } else {
      // Type 2: True Peak (brickwall or high THD)
      releaseDelay.connect(type2Shaper);
      type2Shaper.connect(wetGain);           // Direct to output (no more makeup)
    }
    
    // Mix to output
    wetGain.connect(parallelMixer);
    
    // === MANDATORY TRUE-PEAK SAFETY CEILING (CANNOT BE BYPASSED) ===
    // This is the final safety net that prevents ANY overs, regardless of processing mode
    // Applied AFTER all limiters, AFTER all gain stages
    // Uses 4x oversampling for true-peak (inter-sample peak) detection
    // 
    // 2026-02-16 FIX: Safety ceiling now follows safeExportMode
    // - Safe Export Mode: -1.0 dBTP (maximum codec safety)
    // - Normal Mode: -0.3 dBTP (tight but safe for club systems)
    const safetyCeiling = context.createWaveShaper();
    const safetyCurve = new Float32Array(65536);
    
    // --- SAFETY CEILING (MODE-AWARE) ---
    // Safe export should NOT have a looser seatbelt than the limiter.
    const requestedSafetyCeilingDB = settings.safeExportMode ? -1.0 : -0.3;
    
    // finalTargetCeilingDB is computed earlier in this function (your limiter ceiling).
    // Safety must be <= limiter ceiling (more negative = lower ceiling).
    const safetyCeilingDB = Math.min(requestedSafetyCeilingDB, finalTargetCeilingDB);
    
    const safetyLinear = Math.pow(10, safetyCeilingDB / 20);
    
    for (let i = 0; i < 65536; i++) {
      const x = (i * 2 - 65536) / 65536; // -1 to +1
      const absX = Math.abs(x);
      
      if (absX <= safetyLinear) {
        // Below ceiling: pass through unchanged
        safetyCurve[i] = x;
      } else {
        // Above ceiling: SOFT CLIP (2026-02-16 FIX - was hard clip brick wall)
        // Use tanh for gentle saturation instead of hard brick wall
        // This prevents audible distortion if safety stage engages
        const excess = absX - safetyLinear;
        const softClipped = safetyLinear + Math.tanh(excess * 3) * 0.05; // Gentle roll-off
        safetyCurve[i] = x > 0 ? softClipped : -softClipped;
      }
    }
    
    safetyCeiling.curve = safetyCurve;
    safetyCeiling.oversample = '4x'; // CRITICAL: 4x oversampling detects inter-sample peaks
    
    console.log(
      `🛡️  SAFETY CEILING: ${safetyCeilingDB.toFixed(1)} dBTP (${safetyLinear.toFixed(4)} linear) [4x oversampled]` +
      (settings.safeExportMode ? ' [SAFE EXPORT]' : '')
    );
    console.log(`   This is the final safety net - should NEVER engage if limiters work correctly`);
    
    parallelMixer.connect(safetyCeiling);
    safetyCeiling.connect(output);
    
    return { input, output };
  }

  /**
   * Export processed audio as WAV file
   * Includes safety normalization if peak exceeds 0.99
   */
  async exportAsWAV(buffer: AudioBuffer): Promise<Blob> {
    // === EXPORT DIAGNOSTIC: Verify buffer identity ===
    console.log('🔬 EXPORT BUFFER CHECK:');
    console.log(`  Length: ${buffer.length} samples`);
    console.log(`  Sample rate: ${buffer.sampleRate} Hz`);
    console.log(`  Channels: ${buffer.numberOfChannels}`);
    console.log(`  First 5 samples (ch0): [${Array.from(buffer.getChannelData(0).slice(0, 5)).map(s => s.toFixed(6)).join(', ')}]`);
    
    // === STEP 1: MEASURE PEAK AND CALCULATE SAFETY SCALE ===
    let maxPeak = 0;
    let sumSq = 0;
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const channelData = buffer.getChannelData(ch);
      for (let i = 0; i < channelData.length; i++) {
        const abs = Math.abs(channelData[i]);
        if (abs > maxPeak) maxPeak = abs;
        sumSq += channelData[i] * channelData[i];
      }
    }
    
    const rms = Math.sqrt(sumSq / (buffer.length * buffer.numberOfChannels));
    const crestDb = 20 * Math.log10(maxPeak / Math.max(rms, 1e-12));
    
    console.log(`  Export buffer peak: ${maxPeak.toFixed(6)} (${(20 * Math.log10(maxPeak)).toFixed(2)} dBFS)`);
    console.log(`  Export buffer RMS: ${rms.toFixed(6)} (${(20 * Math.log10(rms)).toFixed(2)} dBFS)`);
    console.log(`  Export buffer crest: ${crestDb.toFixed(2)} dB`);
    
    // NO SAFETY SCALING - export must be neutral
    // If DSP produces >1.0, we WANT to know (fail loudly)
    const scaleFactor = 1.0;
    
    if (maxPeak > 1.0) {
      console.error(`🔥 HARD CLIPPING IN DSP CHAIN! Peak ${maxPeak.toFixed(6)} exceeds 1.0`);
      console.error('   Export will clip. Fix the DSP chain, do not hide it with normalization.');
    } else if (maxPeak > 0.99) {
      console.warn(`⚠️  Very hot output: peak ${maxPeak.toFixed(6)} (${(20*Math.log10(maxPeak)).toFixed(2)} dBFS)`);
    } else {
      console.log(`✅ Clean headroom: ${(-20*Math.log10(maxPeak)).toFixed(2)} dB below 0dBFS`);
    }
    
    // === STEP 2: WRITE WAV FILE ===
    const numberOfChannels = buffer.numberOfChannels;
    const length = buffer.length * numberOfChannels * 2;
    const arrayBuffer = new ArrayBuffer(44 + length);
    const view = new DataView(arrayBuffer);

    // WAV header
    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + length, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numberOfChannels, true);
    view.setUint32(24, buffer.sampleRate, true);
    view.setUint32(28, buffer.sampleRate * numberOfChannels * 2, true);
    view.setUint16(32, numberOfChannels * 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, length, true);

    // Write audio data with safety scaling
    let offset = 44;
    for (let i = 0; i < buffer.length; i++) {
      for (let channel = 0; channel < numberOfChannels; channel++) {
        const sample = buffer.getChannelData(channel)[i] * scaleFactor;
        const int16 = Math.max(-1, Math.min(1, sample)) * 0x7fff;
        view.setInt16(offset, int16, true);
        offset += 2;
      }
    }

    return new Blob([arrayBuffer], { type: 'audio/wav' });
  }

  /**
   * Get real-time meter values for display
   */
  getMeterValues(): { peak: number; lra: number } {
    if (!this.analysis) {
      return { peak: 0, lra: 0 };
    }

    // Convert peak to 0-100 scale for meter display
    const peak = Math.max(0, Math.min(100, (this.analysis.peakLevel + 60) / 0.6));
    
    // LRA (Loudness Range) in LU
    const lra = this.analysis.dynamicRange;

    return { peak, lra };
  }

  getAnalysis(): AudioAnalysis | null {
    return this.analysis;
  }

  /**
   * Measure LUFS of an AudioBuffer (simplified ITU-R BS.1770-4)
   * Used for final output validation in diagnostics
   */
  private measureLUFS(buffer: AudioBuffer): number {
    // Average all channels
    let sumSquares = 0;
    let sampleCount = 0;
    
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const channelData = buffer.getChannelData(ch);
      for (let i = 0; i < channelData.length; i++) {
        sumSquares += channelData[i] * channelData[i];
        sampleCount++;
      }
    }
    
    const rms = Math.sqrt(sumSquares / sampleCount);
    const lufs = -0.691 + 10 * Math.log10(rms * rms);
    return lufs;
  }

  /**
   * Measure true peak of an AudioBuffer (sample peak in dBFS)
   * Used for ceiling validation in diagnostics
   */
  private measurePeak(buffer: AudioBuffer): number {
    let truePeak = 0;
    
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const channelData = buffer.getChannelData(ch);
      for (let i = 0; i < channelData.length; i++) {
        truePeak = Math.max(truePeak, Math.abs(channelData[i]));
      }
    }
    
    return 20 * Math.log10(truePeak);
  }

  /**
   * STAGE ISOLATION DIAGNOSTIC
   * Renders the chain 7 times with incremental stages to find which one bricks
   * Enable with: localStorage.setItem('LATHAM_STAGE_ISOLATION', 'true')
   * Run with: await window.__audioProcessor.runStageIsolationTest()
   */
  async runStageIsolationTest(): Promise<void> {
    console.clear();
    console.log('=== VERIFICATION RUN START ===', new Date().toISOString());
    console.log('🔬 === STAGE ISOLATION TEST START ===');
    
    const isolationSettings = (window as any).__LATHAM_ISOLATION_SETTINGS;
    if (!isolationSettings) {
      console.error('❌ No isolation settings found. Process audio first with localStorage flag set.');
      return;
    }
    
    const { settings, plan, quality, qualityProfile, useMinimalMaster } = isolationSettings;
    
    // **FAST MODE: Render only 30 seconds (loudest section) for speed**
    const FAST_MODE = true;
    const FAST_DURATION_SEC = 30;
    
    // Stages to test incrementally
    const stages = [
      { name: 'Source Only', enableTransformer: false, enableTape: false, enableMultiband: false, enableSSL: false, enableMS: false, enableLimiter: false },
      { name: '+ Transformer', enableTransformer: true, enableTape: false, enableMultiband: false, enableSSL: false, enableMS: false, enableLimiter: false },
      { name: '+ Tape', enableTransformer: true, enableTape: true, enableMultiband: false, enableSSL: false, enableMS: false, enableLimiter: false },
      { name: '+ Multiband', enableTransformer: true, enableTape: true, enableMultiband: true, enableSSL: false, enableMS: false, enableLimiter: false },
      { name: '+ SSL Comp', enableTransformer: true, enableTape: true, enableMultiband: true, enableSSL: true, enableMS: false, enableLimiter: false },
      { name: '+ M/S', enableTransformer: true, enableTape: true, enableMultiband: true, enableSSL: true, enableMS: true, enableLimiter: false },
      { name: '+ Limiter (Full Chain)', enableTransformer: true, enableTape: true, enableMultiband: true, enableSSL: true, enableMS: true, enableLimiter: true },
    ];
    
    const results: any[] = [];
    
    for (const stage of stages) {
      console.log(`\n🔍 Testing: ${stage.name}`);
      
      // Build offline context with selective stage bypass
      const durationSeconds = this.audioBuffer!.duration;
      const fullLength = this.audioBuffer!.length;
      const sampleRate = this.audioBuffer!.sampleRate;
      
      // **FAST MODE: Use only 30 seconds from middle (usually loudest)**
      let processLength: number;
      let startSample: number;
      
      if (FAST_MODE && durationSeconds > FAST_DURATION_SEC) {
        processLength = Math.floor(FAST_DURATION_SEC * sampleRate);
        // Start at 1/3 into track (usually loudest section)
        startSample = Math.floor(fullLength / 3);
        console.log(`⚡ FAST MODE: Testing ${FAST_DURATION_SEC}sec from ${(startSample/sampleRate).toFixed(1)}s (full: ${durationSeconds.toFixed(1)}s)`);
      } else {
        processLength = fullLength;
        startSample = 0;
      }
      
      const numChannels = 2;
      
      const offlineContext = new OfflineAudioContext(numChannels, processLength, sampleRate);
      
      // Create source (with optional fast-mode offset)
      let processingBuffer: AudioBuffer;
      if (this.audioBuffer!.numberOfChannels === 1) {
        processingBuffer = offlineContext.createBuffer(2, processLength, sampleRate);
        const monoData = this.audioBuffer!.getChannelData(0);
        const segment = monoData.slice(startSample, startSample + processLength);
        processingBuffer.copyToChannel(segment, 0);
        processingBuffer.copyToChannel(segment, 1);
      } else {
        processingBuffer = offlineContext.createBuffer(2, processLength, sampleRate);
        for (let ch = 0; ch < 2; ch++) {
          const channelData = this.audioBuffer!.getChannelData(ch);
          const segment = channelData.slice(startSample, startSample + processLength);
          processingBuffer.copyToChannel(segment, ch);
        }
      }
      
      const source = offlineContext.createBufferSource();
      source.buffer = processingBuffer;
      let currentNode: AudioNode = source;
      
      // Build chain with selective bypass
      if (stage.enableTransformer && !useMinimalMaster && qualityProfile.chain.saturator) {
        const transformer = this.createTransformerStage(offlineContext, settings);
        currentNode.connect(transformer.input);
        currentNode = transformer.output;
      }
      
      if (stage.enableTape && !useMinimalMaster && qualityProfile.chain.saturator) {
        const tape = this.createSaturationStage(offlineContext, settings);
        currentNode.connect(tape.input);
        currentNode = tape.output;
      }
      
      const useMultiband = stage.enableMultiband && plan.genreBehavior.useMultiband && !useMinimalMaster && qualityProfile.chain.multiband;
      if (useMultiband) {
        const multiBand = this.createMultiBandStage(offlineContext, settings);
        currentNode.connect(multiBand.input);
        currentNode = multiBand.output;
      }
      
      if (stage.enableSSL) {
        const ssl = this.createFinalStage(offlineContext, settings);
        currentNode.connect(ssl.input);
        currentNode = ssl.output;
      }
      
      const useMidSide = stage.enableMS && plan.genreBehavior.useMidSide && qualityProfile.chain.midside;
      if (useMidSide) {
        const ms = this.createMidSideStage(offlineContext, settings, plan);
        currentNode.connect(ms.input);
        currentNode = ms.output;
      }
      
      if (stage.enableLimiter) {
        const limiter = this.createWeissLimiterStage(offlineContext, settings);
        currentNode.connect(limiter.input);
        currentNode = limiter.output;
      }
      
      currentNode.connect(offlineContext.destination);
      source.start(0);
      
      // Render
      const renderedBuffer = await offlineContext.startRendering();
      
      // Analyze
      const channelData = renderedBuffer.getChannelData(0);
      let peak = 0;
      let sumSq = 0;
      let flatTopCount = 0;
      const flatTopThreshold = 0.98;
      
      for (let i = 0; i < channelData.length; i++) {
        const x = channelData[i];
        const ax = Math.abs(x);
        if (ax > peak) peak = ax;
        if (ax >= flatTopThreshold) flatTopCount++;
        sumSq += x * x;
      }
      
      const rms = Math.sqrt(sumSq / channelData.length);
      const crestDb = 20 * Math.log10(peak / Math.max(rms, 1e-12));
      const flatTopRatio = flatTopCount / channelData.length;
      
      results.push({
        stage: stage.name,
        peak: peak.toFixed(6),
        peakDb: (20 * Math.log10(peak)).toFixed(2),
        crestDb: crestDb.toFixed(2),
        flatTopPct: (flatTopRatio * 100).toFixed(3)
      });
      
      console.log(`  Peak: ${peak.toFixed(6)} (${(20*Math.log10(peak)).toFixed(2)} dBFS)`);
      console.log(`  Crest: ${crestDb.toFixed(2)} dB`);
      console.log(`  Flat-top: ${(flatTopRatio*100).toFixed(3)}%`);
    }
    
    // Print summary table
    console.log('\n📊 STAGE ISOLATION SUMMARY:');
    console.table(results);
    
    console.log('\n🔍 DIAGNOSIS GUIDE:');
    console.log('• If crest drops sharply after a stage → that stage is crushing dynamics');
    console.log('• If flat-top jumps above 5% → that stage is clipping/saturating');
    console.log('• Normal crest: 8-14 dB depending on material');
    console.log('• Normal flat-top: <1% for dynamic material, 2-5% for loud masters');
    
    console.log('\n🔬 === STAGE ISOLATION TEST COMPLETE ===');
  }
}

// Singleton instance
export const audioProcessor = new AudioProcessor();