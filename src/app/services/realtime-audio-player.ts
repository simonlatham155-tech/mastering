/**
 * REAL-TIME AUDIO PLAYER
 * ======================
 * 
 * Handles full-track playback with live parameter updates (Draft mode).
 * Uses AudioContext for real-time processing.
 * 
 * KEY FEATURES:
 * - Full-track playback (no chunking)
 * - Seek/pause/resume support
 * - Live slider updates (parameter smoothing, no graph rebuilds)
 * - Light processing (draft quality)
 * 
 * IMPORTANT:
 * - Uses same chain builder as export (topology match guaranteed)
 * - Only quality flag differs (draft vs export)
 * 
 * PATCH 2026-05-25: Viktor
 * - Fixed A/B toggle restart bug (onended race condition)
 * - Added EQ params to updateParameter (lowShelfGain, midRangeGain, highShelfGain)
 * - Fixed play() to rebuild chain when settings change
 * - Fixed pause()/stop() onended race condition
 * - Fixed toggleBypass when paused (chain wasn't disposed)
 * 
 * PATCH 2026-06-07: Monitor-only worklet for meters; Type2 waveshaper for audio
 * (in-chain FIR worklet caused bass buzz/rattle in realtime blocks)
 */

import {
  buildMasteringChain,
  type MasteringChain,
} from './mastering-chain-builder';
import type { ProcessingSettings } from './audio-processor';
import type { ProcessingPlan } from '../data/preset-resolution';
import { OversamplingLimiterManager, type LimiterMeterData } from './oversampling-limiter-manager';
import { LufsMeterManager, type LufsMeterData } from './lufs-meter-manager';
import {
  finiteDB,
  setTargetFinite,
  setTargetLinearFromDB,
} from '../utils/finite-audio';
import { getSharedAudioContext } from './shared-audio-context';

export type { LufsMeterData };

export interface PlaybackState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
}

export interface SSLMeterData {
  gainReductionDB: number;
  inputLevelDB: number;
}

function analyserPeakDb(analyser: AnalyserNode, buffer: Float32Array): number {
  analyser.getFloatTimeDomainData(buffer);
  let peak = 0;
  for (let i = 0; i < buffer.length; i++) {
    peak = Math.max(peak, Math.abs(buffer[i]));
  }
  return peak > 1e-6 ? 20 * Math.log10(peak) : -60;
}

export class RealtimeAudioPlayer {
  private audioContext: AudioContext | null = null;
  private sourceNode: AudioBufferSourceNode | null = null;
  private masteringChain: MasteringChain | null = null;
  private audioBuffer: AudioBuffer | null = null;
  private startTime: number = 0;
  private pauseTime: number = 0;
  private isPlaying: boolean = false;
  private currentSettings: ProcessingSettings | null = null;
  private currentPlan: ProcessingPlan | null = null;
  private currentDryBypass: boolean = false;
  private currentUseMinimalMaster: boolean = false;
  private currentInputTrimDB: number | undefined = undefined;
  private currentInputLUFS: number = -16;
  private isSwitchingBypass: boolean = false;
  private limiterMeter = new OversamplingLimiterManager();
  private lufsMeter = new LufsMeterManager();
  private hqModeEnabled = true;
  private sslMeterCallback: ((data: SSLMeterData) => void) | null = null;
  private lufsMeterCallback: ((data: LufsMeterData) => void) | null = null;
  private meterPollId: number | null = null;
  private sslInputBuffer: Float32Array | null = null;
  private sslOutputBuffer: Float32Array | null = null;
  private currentLimiterCeilingOverride: number | undefined = undefined;
  private currentSslGlue: 'auto' | 'gentle' | 'firm' = 'auto';
  private currentHqMode = true;
  private currentOutputTrimDB = 0;
  /** When set, dry bypass boosts original to processed level (Gain Match). */
  private currentBypassGainMatchDB: number | null = null;
  
  constructor() {
    // AudioContext will be created on first play (user interaction required)
  }
  
  /**
   * Load audio file for playback
   */
  async loadAudio(file: File): Promise<void> {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = await this.ensureContext().decodeAudioData(arrayBuffer);
    this.setLoadedBuffer(buffer);
  }

  /** Reuse an already-decoded buffer from the shared AudioContext (no full-file copy). */
  loadBuffer(buffer: AudioBuffer): void {
    this.ensureContext();
    this.setLoadedBuffer(buffer);
  }

  /**
   * Copy a buffer from another AudioContext in chunks so long files do not freeze the UI.
   * Not needed when decode uses getSharedAudioContext() — kept as a fallback.
   */
  async loadBufferAsync(buffer: AudioBuffer): Promise<void> {
    const ctx = this.ensureContext();
    if (buffer.sampleRate === ctx.sampleRate) {
      this.setLoadedBuffer(buffer);
      return;
    }

    const channels = buffer.numberOfChannels;
    const length = buffer.length;
    const copy = ctx.createBuffer(channels, length, buffer.sampleRate);
    const chunkSamples = 262_144;

    for (let ch = 0; ch < channels; ch++) {
      const src = buffer.getChannelData(ch);
      const dst = copy.getChannelData(ch);
      for (let offset = 0; offset < length; offset += chunkSamples) {
        const end = Math.min(offset + chunkSamples, length);
        dst.set(src.subarray(offset, end), offset);
        if (end < length) {
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
        }
      }
    }

    this.setLoadedBuffer(copy);
  }

  private ensureContext(): AudioContext {
    if (!this.audioContext) {
      this.audioContext = getSharedAudioContext();
    }
    return this.audioContext;
  }

  private setLoadedBuffer(buffer: AudioBuffer): void {
    this.audioBuffer = buffer;
    console.log(
      `🎵 Loaded audio: ${buffer.duration.toFixed(1)}s, ${buffer.numberOfChannels}ch`
    );
  }
  
  /**
   * Subscribe to live true-peak / GR meter updates from the monitor-only worklet tap.
   */
  setMeterCallback(callback: ((data: LimiterMeterData) => void) | null): void {
    this.limiterMeter.setMeterCallback(callback);
  }

  /**
   * Subscribe to SSL bus compressor gain reduction (input vs output analysers).
   */
  setSSLMeterCallback(callback: ((data: SSLMeterData) => void) | null): void {
    this.sslMeterCallback = callback;
    if (this.masteringChain) {
      this.wireLiveMeters(this.masteringChain);
    }
  }

  setLufsMeterCallback(callback: ((data: LufsMeterData) => void) | null): void {
    this.lufsMeterCallback = callback;
    this.lufsMeter.setMeterCallback(callback);
  }

  /** @deprecated Use setLufsMeterCallback — kept for compatibility */
  setOutputLevelCallback(callback: ((lufs: number) => void) | null): void {
    this.setLufsMeterCallback(
      callback
        ? (data) => {
            if (Number.isFinite(data.momentary)) callback(data.momentary);
          }
        : null
    );
  }

  setHQMode(enabled: boolean): void {
    if (this.hqModeEnabled === enabled) return;
    this.hqModeEnabled = enabled;
    this.limiterMeter.setParameters({ hqMode: enabled });
    // Force chain rebuild on next play (2× vs 4× ceiling oversampling).
    this.currentHqMode = !enabled;
  }
  setPlaybackGainOptions(
    outputTrimDB: number,
    bypassGainMatchDB: number | null
  ): void {
    this.currentOutputTrimDB = finiteDB(outputTrimDB, 0);
    this.currentBypassGainMatchDB =
      bypassGainMatchDB != null && Number.isFinite(bypassGainMatchDB)
        ? bypassGainMatchDB
        : null;
  }

  private syncMeterParams(plan: ProcessingPlan, limiterCeilingOverride?: number): void {
    const ceiling = limiterCeilingOverride ?? plan.deliveryTargets.ceiling;
    this.limiterMeter.setParameters({
      monitorOnly: true,
      hqMode: this.hqModeEnabled,
      ceiling,
      threshold: ceiling - 3,
    });
  }

  private unwireLiveMeters(): void {
    if (this.meterPollId !== null) {
      cancelAnimationFrame(this.meterPollId);
      this.meterPollId = null;
    }
  }

  private wireLiveMeters(chain: MasteringChain): void {
    this.unwireLiveMeters();

    const hasSSL =
      chain.sslInputAnalyser &&
      chain.sslOutputAnalyser &&
      this.sslMeterCallback;

    if (!hasSSL) return;

    if (hasSSL) {
      this.sslInputBuffer = new Float32Array(chain.sslInputAnalyser!.fftSize);
      this.sslOutputBuffer = new Float32Array(chain.sslOutputAnalyser!.fftSize);
    }

    const poll = () => {
      if (!this.masteringChain) return;

      if (
        this.sslMeterCallback &&
        this.masteringChain.sslInputAnalyser &&
        this.masteringChain.sslOutputAnalyser &&
        this.sslInputBuffer &&
        this.sslOutputBuffer
      ) {
        const inputDb = analyserPeakDb(
          this.masteringChain.sslInputAnalyser,
          this.sslInputBuffer
        );
        const outputDb = analyserPeakDb(
          this.masteringChain.sslOutputAnalyser,
          this.sslOutputBuffer
        );
        this.sslMeterCallback({
          gainReductionDB: Math.max(0, inputDb - outputDb),
          inputLevelDB: inputDb,
        });
      }

      this.meterPollId = requestAnimationFrame(poll);
    };

    this.meterPollId = requestAnimationFrame(poll);
  }

  private async createMasteringChain(
    settings: ProcessingSettings,
    plan: ProcessingPlan,
    dryBypass: boolean,
    inputTrimDB?: number,
    useMinimalMaster: boolean = false,
    limiterCeilingOverride?: number,
    sslGlue?: 'auto' | 'gentle' | 'firm'
  ): Promise<MasteringChain> {
    if (!this.audioContext) {
      throw new Error('No audio context');
    }

    const lufsNode = await this.lufsMeter.initialize(this.audioContext);
    const meterNode = await this.limiterMeter.initialize(this.audioContext);
    lufsNode.connect(meterNode);
    this.limiterMeter.connectToDestination(this.audioContext.destination);
    this.lufsMeter.setMeterCallback(this.lufsMeterCallback);
    this.lufsMeter.reset();
    this.syncMeterParams(plan, limiterCeilingOverride);

    const chainConfig = {
      context: this.audioContext,
      destination: lufsNode,
      params: plan,
      settings,
      useMinimalMaster,
      dryBypass,
      inputTrimDB,
      inputLUFS: this.currentInputLUFS,
      limiterCeilingOverride,
      outputTrimDB: dryBypass ? undefined : this.currentOutputTrimDB,
      bypassGainMatchDB:
        dryBypass && this.currentBypassGainMatchDB != null
          ? this.currentBypassGainMatchDB
          : undefined,
      sslGlue,
      livePreview: true,
    };

    let chain: MasteringChain;
    // Live preview never uses in-chain FIR/Faust — they cause bass buzz/rattle in realtime
    // blocks (see PATCH 2026-06-07). Export/offline uses FIR via buildOfflineMasteringChain.
    // HQ = 4× oversampled Flow WaveShaper ceiling; preview = 2×.
    chain = buildMasteringChain({
      ...chainConfig,
      quality: this.hqModeEnabled && !dryBypass ? 'export' : 'preview',
    });
    if (this.hqModeEnabled && !dryBypass) {
      console.log('✅ HQ live chain: Flow ceiling (4× OS WaveShaper, FIR meter tap only)');
    }

    this.wireLiveMeters(chain);
    return chain;
  }

  /**
   * Start or resume playback
   * 
   * PATCH: Always rebuild chain if settings/plan/bypass have changed since last build.
   * Previously the chain was reused even when settings changed, meaning slider
   * tweaks made while paused were silently ignored.
   */
  async play(
    settings: ProcessingSettings,
    plan: ProcessingPlan,
    dryBypass: boolean,
    inputTrimDB?: number,
    useMinimalMaster: boolean = false,
    inputLUFS?: number,
    limiterCeilingOverride?: number,
    sslGlue?: 'auto' | 'gentle' | 'firm'
  ): Promise<void> {
    if (!this.audioBuffer) {
      throw new Error('No audio loaded');
    }

    this.ensureContext();

    if (inputLUFS != null && Number.isFinite(inputLUFS)) {
      this.currentInputLUFS = inputLUFS;
    } else if (!Number.isFinite(this.currentInputLUFS)) {
      this.currentInputLUFS = -16;
    }
    
    // Resume AudioContext if suspended (browser autoplay policy)
    if (this.audioContext!.state === 'suspended') {
      await this.audioContext!.resume();
    }
    
    if (this.isPlaying) {
      console.warn('Already playing');
      return;
    }
    
    // Check if settings changed since chain was built — if so, rebuild
    const settingsChanged = (
      this.currentSettings !== settings ||
      this.currentPlan !== plan ||
      this.currentDryBypass !== dryBypass ||
      this.currentUseMinimalMaster !== useMinimalMaster ||
      this.currentInputTrimDB !== inputTrimDB ||
      this.currentLimiterCeilingOverride !== limiterCeilingOverride ||
      this.currentSslGlue !== (sslGlue ?? 'auto') ||
      this.currentHqMode !== this.hqModeEnabled
    );
    
    this.currentSettings = settings;
    this.currentPlan = plan;
    this.currentDryBypass = dryBypass;
    this.currentUseMinimalMaster = useMinimalMaster;
    this.currentInputTrimDB = inputTrimDB;
    this.currentLimiterCeilingOverride = limiterCeilingOverride;
    this.currentSslGlue = sslGlue ?? 'auto';
    this.currentHqMode = this.hqModeEnabled;
    
    // Build or rebuild mastering chain
    if (!this.masteringChain || settingsChanged) {
      if (this.masteringChain) {
        this.unwireLiveMeters();
        this.masteringChain.dispose();
        this.masteringChain = null;
      }

      this.masteringChain = await this.createMasteringChain(
        settings,
        plan,
        dryBypass,
        inputTrimDB,
        useMinimalMaster,
        limiterCeilingOverride,
        sslGlue
      );
      
      if (settingsChanged) {
        console.log('🔄 Chain rebuilt (settings changed since last play)');
      }
    }
    
    // Create source node
    this.sourceNode = this.audioContext.createBufferSource();
    this.sourceNode.buffer = this.audioBuffer;
    this.sourceNode.connect(this.masteringChain.input);
    
    // Handle end of playback
    // PATCH: Check isSwitchingBypass to prevent race condition during A/B toggle
    this.sourceNode.onended = () => {
      if (this.isPlaying && !this.isSwitchingBypass) {
        this.stop();
      }
    };
    
    // Start playback from pause point
    const offset = this.pauseTime;
    this.sourceNode.start(0, offset);
    this.startTime = this.audioContext.currentTime - offset;
    this.isPlaying = true;
    
    console.log(`▶️  Playing from ${offset.toFixed(1)}s`);
  }
  
  /**
   * Pause playback
   * 
   * PATCH: Detach onended before stopping source to prevent race condition
   * where onended fires and calls stop() which resets pauseTime to 0.
   */
  pause(): void {
    if (!this.isPlaying || !this.sourceNode || !this.audioContext) {
      return;
    }
    
    // Save current position BEFORE touching the source
    this.pauseTime = this.audioContext.currentTime - this.startTime;
    
    // PATCH: Detach onended BEFORE stopping — prevents race condition
    this.sourceNode.onended = null;
    
    // Stop source
    this.sourceNode.stop();
    this.sourceNode.disconnect();
    this.sourceNode = null;
    this.isPlaying = false;
    
    console.log(`⏸️  Paused at ${this.pauseTime.toFixed(1)}s`);
  }
  
  /**
   * Stop playback and reset position
   */
  stop(): void {
    if (this.sourceNode) {
      // PATCH: Detach onended to prevent recursive calls
      this.sourceNode.onended = null;
      this.sourceNode.stop();
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    
    this.isPlaying = false;
    this.pauseTime = 0;
    this.startTime = 0;
    
    console.log('⏹️  Stopped');
  }
  
  /**
   * Seek to a specific time
   */
  seek(timeSeconds: number): void {
    const wasPlaying = this.isPlaying;
    
    if (wasPlaying) {
      this.pause();
    }
    
    this.pauseTime = timeSeconds;
    
    if (wasPlaying && this.audioContext) {
      // Resume from new position
      // NOTE: We need to pass settings/plan/useMinimalMaster
      // This will be called from the UI component which has these values
      console.log(`⏩ Seeked to ${timeSeconds.toFixed(1)}s`);
    }
  }
  
  /**
   * Get current playback state
   */
  getState(): PlaybackState {
    // During bypass switch, always return the saved pauseTime to prevent jumps
    if (this.isSwitchingBypass) {
      return {
        isPlaying: this.isPlaying,
        currentTime: this.pauseTime,
        duration: this.audioBuffer?.duration ?? 0,
      };
    }
    
    const currentTime = this.isPlaying && this.audioContext
      ? this.audioContext.currentTime - this.startTime
      : this.pauseTime;
    
    return {
      isPlaying: this.isPlaying,
      currentTime,
      duration: this.audioBuffer?.duration ?? 0,
    };
  }
  
  /**
   * Update a parameter in real-time (no graph rebuild)
   * Uses exponential smoothing to avoid clicks
   * 
   * PATCH: Added lowShelfGain, midRangeGain, highShelfGain support.
   */
  updateParameter(paramName: string, value: number, rampTimeSeconds: number = 0.05): void {
    if (!this.masteringChain || !this.audioContext) {
      // Silently ignore if chain not built yet (slider moved before first play)
      return;
    }
    
    const params = this.masteringChain.parameters;
    const currentTime = this.audioContext.currentTime;
    
    switch (paramName) {
      // === EQ Parameters (user profile adjustments) ===
      case 'lowShelfGain':
        if (params.lowShelfGain) {
          setTargetFinite(params.lowShelfGain, value, currentTime, rampTimeSeconds);
        }
        break;
      
      case 'midRangeGain':
        if (params.midRangeGain) {
          setTargetFinite(params.midRangeGain, value, currentTime, rampTimeSeconds);
        }
        break;
      
      case 'highShelfGain':
        if (params.highShelfGain) {
          setTargetFinite(params.highShelfGain, value, currentTime, rampTimeSeconds);
        }
        break;
      
      // === Stereo Width ===
      case 'stereoWidth':
        if (params.stereoWidth) {
          setTargetFinite(params.stereoWidth, value, currentTime, rampTimeSeconds, 1);
        }
        break;
      
      // === Drive / Saturation ===
      case 'transformerDrive':
        if (params.transformerDrive) {
          setTargetFinite(params.transformerDrive, value, currentTime, rampTimeSeconds);
        }
        break;
      
      case 'tapeDrive':
        if (params.tapeDrive) {
          setTargetFinite(params.tapeDrive, value, currentTime, rampTimeSeconds);
        }
        break;
      
      // === SSL Compressor ===
      case 'sslThreshold':
        if (params.sslThreshold) {
          setTargetFinite(params.sslThreshold, value, currentTime, rampTimeSeconds);
        }
        break;

      case 'sslRatio':
        if (params.sslRatio) {
          setTargetFinite(params.sslRatio, value, currentTime, rampTimeSeconds, 1);
        }
        break;

      case 'inputTrim':
        if (params.inputTrim) {
          setTargetLinearFromDB(params.inputTrim, value, currentTime, rampTimeSeconds);
        }
        break;

      case 'outputTrim':
        if (params.outputTrim) {
          setTargetLinearFromDB(params.outputTrim, value, currentTime, rampTimeSeconds);
        }
        break;
      
      // === Limiter ===
      case 'limiterMakeup':
        if (params.limiterMakeup) {
          setTargetLinearFromDB(params.limiterMakeup, value, currentTime, rampTimeSeconds);
        }
        break;
      
      default:
        console.warn(`Unknown parameter: ${paramName}`);
    }
  }
  
  /**
   * Rebuild the mastering chain (only needed when switching quality mode or major setting changes)
   * This WILL cause a momentary interruption
   */
  async rebuildChain(
    settings: ProcessingSettings,
    plan: ProcessingPlan,
    dryBypass: boolean,
    inputTrimDB?: number,
    useMinimalMaster: boolean = false,
    inputLUFS?: number,
    limiterCeilingOverride?: number,
    sslGlue?: 'auto' | 'gentle' | 'firm'
  ): Promise<void> {
    if (inputLUFS != null && Number.isFinite(inputLUFS)) {
      this.currentInputLUFS = inputLUFS;
    } else if (!Number.isFinite(this.currentInputLUFS)) {
      this.currentInputLUFS = -16;
    }
    const wasPlaying = this.isPlaying;
    const currentPosition = this.getState().currentTime;
    
    // Stop current playback
    if (wasPlaying) {
      this.pause();
    }
    
    // Dispose old chain
    if (this.masteringChain) {
      this.unwireLiveMeters();
      this.masteringChain.dispose();
      this.masteringChain = null;
    }
    
    // Update stored settings
    this.currentSettings = settings;
    this.currentPlan = plan;
    this.currentDryBypass = dryBypass;
    this.currentUseMinimalMaster = useMinimalMaster;
    this.currentInputTrimDB = inputTrimDB;
    this.currentLimiterCeilingOverride = limiterCeilingOverride;
    this.currentSslGlue = sslGlue ?? 'auto';
    
    console.log('🔄 Rebuilding mastering chain...');
    
    // Build new chain
    if (this.audioBuffer) {
      this.ensureContext();
      this.masteringChain = await this.createMasteringChain(
        settings,
        plan,
        dryBypass,
        inputTrimDB,
        useMinimalMaster,
        limiterCeilingOverride,
        sslGlue
      );
    }
    
    if (wasPlaying && this.audioBuffer) {
      this.pauseTime = currentPosition;
      await this.play(
        settings,
        plan,
        dryBypass,
        inputTrimDB,
        useMinimalMaster,
        this.currentInputLUFS,
        limiterCeilingOverride,
        sslGlue
      );
    }
  }
  
  /**
   * Toggle bypass mode seamlessly (A/B comparison)
   * Switches between processed and original audio without stopping playback
   * 
   * PATCH: Fixed onended race condition that reset pauseTime to 0.
   * The old onended handler is now detached before stopping the source,
   * and isPlaying is explicitly maintained through the switch.
   */
  async toggleBypass(newDryBypass: boolean): Promise<void> {
    if (!this.isPlaying || !this.currentSettings || !this.currentPlan || !this.audioContext || !this.audioBuffer) {
      this.currentDryBypass = newDryBypass;
      if (this.masteringChain) {
        this.unwireLiveMeters();
        this.masteringChain.dispose();
        this.masteringChain = null;
      }
      console.log(`🔄 Bypass mode set to: ${newDryBypass ? 'ORIGINAL' : 'PROCESSED'} (will apply on next play)`);
      return;
    }
    
    // Set flag to lock the playback position during switch
    this.isSwitchingBypass = true;
    
    // Save current position (calculate from audio context time)
    const currentPosition = this.audioContext.currentTime - this.startTime;
    
    // CRITICAL: Also update pauseTime so getState() returns correct time during the switch
    this.pauseTime = currentPosition;
    
    console.log(`🔄 Seamless A/B switch: ${newDryBypass ? 'ORIGINAL' : 'PROCESSED'} at ${currentPosition.toFixed(1)}s`);
    
    // PATCH: Detach onended BEFORE stopping source to prevent race condition
    // Previously, source.stop() fired onended → stop() → pauseTime = 0, isPlaying = false
    if (this.sourceNode) {
      this.sourceNode.onended = null; // ← THE FIX
      try {
        this.sourceNode.stop();
        this.sourceNode.disconnect();
      } catch (e) {
        // Already stopped
      }
      this.sourceNode = null;
    }
    
    // Dispose old chain
    if (this.masteringChain) {
      this.unwireLiveMeters();
      this.masteringChain.dispose();
      this.masteringChain = null;
    }
    
    // Build new chain with new bypass mode
    this.currentDryBypass = newDryBypass;
    this.masteringChain = await this.createMasteringChain(
      this.currentSettings,
      this.currentPlan,
      newDryBypass,
      this.currentInputTrimDB,
      this.currentUseMinimalMaster,
      this.currentLimiterCeilingOverride,
      this.currentSslGlue
    );
    
    // Create new source and resume from saved position
    this.sourceNode = this.audioContext.createBufferSource();
    this.sourceNode.buffer = this.audioBuffer;
    this.sourceNode.connect(this.masteringChain.input);
    
    // Handle end of playback (new handler, checks isSwitchingBypass)
    this.sourceNode.onended = () => {
      if (this.isPlaying && !this.isSwitchingBypass) {
        this.stop();
      }
    };
    
    // Resume from saved position
    this.sourceNode.start(0, currentPosition);
    this.startTime = this.audioContext.currentTime - currentPosition;
    
    // PATCH: Explicitly ensure isPlaying stays true
    this.isPlaying = true;
    
    // Clear the flag after a brief delay to ensure the position is stable
    // This allows several polling cycles to return the saved position
    setTimeout(() => {
      this.isSwitchingBypass = false;
      console.log(`✅ Seamless switch complete! Position locked at ${currentPosition.toFixed(1)}s`);
    }, 150); // Wait 150ms (3 polling cycles at 50ms each)
    
    console.log(`🔄 Switch initiated, position locked for 150ms`);
  }

  /**
   * Seamlessly swap processing chain (e.g. generic vs genre-aware A/B demo).
   */
  async switchProcessing(
    settings: ProcessingSettings,
    plan: ProcessingPlan,
    dryBypass: boolean = false,
    inputTrimDB?: number,
    useMinimalMaster: boolean = false,
    limiterCeilingOverride?: number,
    sslGlue?: 'auto' | 'gentle' | 'firm'
  ): Promise<void> {
    if (!this.currentSettings || !this.currentPlan || !this.audioContext || !this.audioBuffer) {
      this.currentSettings = settings;
      this.currentPlan = plan;
      this.currentDryBypass = dryBypass;
      this.currentUseMinimalMaster = useMinimalMaster;
      this.currentInputTrimDB = inputTrimDB;
      this.currentLimiterCeilingOverride = limiterCeilingOverride;
      this.currentSslGlue = sslGlue ?? 'auto';
      if (this.masteringChain) {
        this.unwireLiveMeters();
        this.masteringChain.dispose();
        this.masteringChain = null;
      }
      return;
    }

    const settingsChanged =
      this.currentSettings !== settings ||
      this.currentPlan !== plan ||
      this.currentDryBypass !== dryBypass ||
      this.currentUseMinimalMaster !== useMinimalMaster ||
      this.currentInputTrimDB !== inputTrimDB ||
      this.currentLimiterCeilingOverride !== limiterCeilingOverride ||
      this.currentSslGlue !== (sslGlue ?? 'auto');

    if (!settingsChanged) return;

    if (!this.isPlaying) {
      this.currentSettings = settings;
      this.currentPlan = plan;
      this.currentDryBypass = dryBypass;
      this.currentUseMinimalMaster = useMinimalMaster;
      this.currentInputTrimDB = inputTrimDB;
      this.currentLimiterCeilingOverride = limiterCeilingOverride;
      this.currentSslGlue = sslGlue ?? 'auto';
      if (this.masteringChain) {
        this.unwireLiveMeters();
        this.masteringChain.dispose();
        this.masteringChain = null;
      }
      return;
    }

    this.isSwitchingBypass = true;
    const currentPosition = this.audioContext.currentTime - this.startTime;
    this.pauseTime = currentPosition;

    if (this.sourceNode) {
      this.sourceNode.onended = null;
      try {
        this.sourceNode.stop();
        this.sourceNode.disconnect();
      } catch {
        // already stopped
      }
      this.sourceNode = null;
    }

    if (this.masteringChain) {
      this.unwireLiveMeters();
      this.masteringChain.dispose();
      this.masteringChain = null;
    }

    this.currentSettings = settings;
    this.currentPlan = plan;
    this.currentDryBypass = dryBypass;
    this.currentUseMinimalMaster = useMinimalMaster;
    this.currentInputTrimDB = inputTrimDB;
    this.currentLimiterCeilingOverride = limiterCeilingOverride;
    this.currentSslGlue = sslGlue ?? 'auto';

    this.masteringChain = await this.createMasteringChain(
      settings,
      plan,
      dryBypass,
      inputTrimDB,
      useMinimalMaster,
      limiterCeilingOverride,
      sslGlue
    );

    this.sourceNode = this.audioContext.createBufferSource();
    this.sourceNode.buffer = this.audioBuffer;
    this.sourceNode.connect(this.masteringChain.input);
    this.sourceNode.onended = () => {
      if (this.isPlaying && !this.isSwitchingBypass) {
        this.stop();
      }
    };
    this.sourceNode.start(0, currentPosition);
    this.startTime = this.audioContext.currentTime - currentPosition;
    this.isPlaying = true;

    setTimeout(() => {
      this.isSwitchingBypass = false;
    }, 150);
  }
  
  /**
   * Clean up resources
   */
  dispose(): void {
    this.stop();
    
    if (this.masteringChain) {
      this.unwireLiveMeters();
      this.masteringChain.dispose();
      this.masteringChain = null;
    }

    this.limiterMeter.dispose();
    this.lufsMeter.dispose();

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.audioBuffer = null;
  }
  
  /**
   * Get AudioContext for metering/visualization
   */
  getAudioContext(): AudioContext | null {
    return this.audioContext;
  }
  
  /**
   * Get mastering chain output node for connecting analyzers/meters
   */
  getOutputNode(): AudioNode | null {
    return this.masteringChain?.output ?? null;
  }
}
