/**
 * REAL-TIME AUDIO PLAYER
 * ======================
 *
 * Handles full-track playback with live parameter updates.
 * Uses the same mastering chain topology as export.
 */

import {
  buildMasteringChain,
  buildMasteringChainWithFallbacks,
  resolveLiveLimiterTopology,
  type MasteringChain,
  type LimiterBackend,
} from './mastering-chain-builder';
import type { ProcessingSettings } from './audio-processor';
import type { ProcessingPlan } from '../data/preset-resolution';
import { getGenrePreset } from '../data/genre-presets';
import { OversamplingLimiterManager, type LimiterMeterData } from './oversampling-limiter-manager';
import { LufsMeterManager, type LufsMeterData } from './lufs-meter-manager';
import {
  finiteDB,
  setTargetFinite,
  setTargetLinearFromDB,
} from '../utils/finite-audio';
import { getSharedAudioContext } from './shared-audio-context';
import { resolveLoudnessDrive } from './loudness-drive';

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

export interface LiveChainStatus {
  limiterBackend: Exclude<LimiterBackend, 'bypass'>;
  latencySamples: number;
  latencyMS: number;
}

function analyserPeakDb(
  analyser: AnalyserNode,
  buffer: Float32Array<ArrayBuffer>
): number {
  analyser.getFloatTimeDomainData(buffer);
  let peak = 0;
  for (let i = 0; i < buffer.length; i++) {
    peak = Math.max(peak, Math.abs(buffer[i]));
  }
  return peak > 1e-6 ? 20 * Math.log10(peak) : -60;
}

function clampMasteringInputDB(value: number): number {
  return Math.max(-12, Math.min(8, value));
}

function resolveDrivenInputTrimDB(
  baseInputTrimDB: number | undefined,
  inputLUFS: number,
  settings: ProcessingSettings,
  plan: ProcessingPlan,
  dryBypass: boolean
): number | undefined {
  if (dryBypass) return baseInputTrimDB;

  const style = getGenrePreset(settings.genreId)?.loudnessStyle ?? 'balanced';
  const drivePlan = resolveLoudnessDrive({
    inputLUFS,
    targetLUFS: plan.deliveryTargets.targetLUFS,
    style,
    logicMode: settings.logicMode,
  });

  const driven = clampMasteringInputDB(
    (baseInputTrimDB ?? 0) + drivePlan.preLimiterDriveDB
  );

  console.log(
    `🎚️ Live master drive: base=${(baseInputTrimDB ?? 0).toFixed(1)} dB, ` +
      `auto=${drivePlan.preLimiterDriveDB.toFixed(1)} dB, effective=${driven.toFixed(1)} dB` +
      (drivePlan.targetReachableByDrive ? '' : `, transparent guardrail leaves ${drivePlan.remainingLU.toFixed(1)} LU`)
  );

  return driven;
}

export class RealtimeAudioPlayer {
  private audioContext: AudioContext | null = null;
  private sourceNode: AudioBufferSourceNode | null = null;
  private masteringChain: MasteringChain | null = null;
  private audioBuffer: AudioBuffer | null = null;
  private startTime = 0;
  private pauseTime = 0;
  private isPlaying = false;
  private currentSettings: ProcessingSettings | null = null;
  private currentPlan: ProcessingPlan | null = null;
  private currentDryBypass = false;
  private currentUseMinimalMaster = false;
  private currentInputTrimDB: number | undefined = undefined;
  private currentInputLUFS = -16;
  private isSwitchingBypass = false;
  private limiterMeter = new OversamplingLimiterManager();
  private lufsMeter = new LufsMeterManager();
  private hqModeEnabled = true;
  private sslMeterCallback: ((data: SSLMeterData) => void) | null = null;
  private lufsMeterCallback: ((data: LufsMeterData) => void) | null = null;
  private meterPollId: number | null = null;
  private sslInputBuffer: Float32Array<ArrayBuffer> | null = null;
  private sslOutputBuffer: Float32Array<ArrayBuffer> | null = null;
  private currentLimiterCeilingOverride: number | undefined = undefined;
  private currentSslGlue: 'auto' | 'gentle' | 'firm' = 'auto';
  private currentHqMode = true;
  private currentOutputTrimDB = 0;
  private currentProcessedLatencySamples = 0;
  private chainStatusCallback: ((status: LiveChainStatus) => void) | null = null;
  private currentBypassGainMatchDB: number | null = null;

  async loadAudio(file: File): Promise<void> {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = await this.ensureContext().decodeAudioData(arrayBuffer);
    this.setLoadedBuffer(buffer);
  }

  loadBuffer(buffer: AudioBuffer): void {
    this.ensureContext();
    this.setLoadedBuffer(buffer);
  }

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

  setMeterCallback(callback: ((data: LimiterMeterData) => void) | null): void {
    this.limiterMeter.setMeterCallback(callback);
  }

  setSSLMeterCallback(callback: ((data: SSLMeterData) => void) | null): void {
    this.sslMeterCallback = callback;
    if (this.masteringChain) this.wireLiveMeters(this.masteringChain);
  }

  setLufsMeterCallback(callback: ((data: LufsMeterData) => void) | null): void {
    this.lufsMeterCallback = callback;
    this.lufsMeter.setMeterCallback(callback);
  }

  setChainStatusCallback(
    callback: ((status: LiveChainStatus) => void) | null
  ): void {
    this.chainStatusCallback = callback;
    if (
      callback &&
      this.masteringChain &&
      this.masteringChain.limiterBackend !== 'bypass'
    ) {
      callback({
        limiterBackend: this.masteringChain.limiterBackend,
        latencySamples: this.masteringChain.latencySamples,
        latencyMS:
          (this.masteringChain.latencySamples / this.masteringChain.input.context.sampleRate) * 1000,
      });
    }
  }

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

    this.sslInputBuffer = new Float32Array(chain.sslInputAnalyser!.fftSize);
    this.sslOutputBuffer = new Float32Array(chain.sslOutputAnalyser!.fftSize);

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
    useMinimalMaster = false,
    limiterCeilingOverride?: number,
    sslGlue?: 'auto' | 'gentle' | 'firm'
  ): Promise<MasteringChain> {
    if (!this.audioContext) throw new Error('No audio context');

    const lufsNode = await this.lufsMeter.initialize(this.audioContext);
    const meterNode = await this.limiterMeter.initialize(this.audioContext);
    lufsNode.connect(meterNode);
    this.limiterMeter.connectToDestination(this.audioContext.destination);
    this.lufsMeter.setMeterCallback(this.lufsMeterCallback);
    this.lufsMeter.reset();
    this.syncMeterParams(plan, limiterCeilingOverride);

    const drivenInputTrimDB = resolveDrivenInputTrimDB(
      inputTrimDB,
      this.currentInputLUFS,
      settings,
      plan,
      dryBypass
    );

    const chainConfig = {
      context: this.audioContext,
      destination: lufsNode,
      params: plan,
      settings,
      useMinimalMaster,
      dryBypass,
      inputTrimDB: drivenInputTrimDB,
      inputLUFS: this.currentInputLUFS,
      limiterCeilingOverride,
      outputTrimDB: dryBypass ? undefined : this.currentOutputTrimDB,
      bypassGainMatchDB:
        dryBypass && this.currentBypassGainMatchDB != null
          ? this.currentBypassGainMatchDB
          : undefined,
      sslGlue,
      bypassLatencySamples: dryBypass
        ? this.currentProcessedLatencySamples
        : 0,
    };

    let chain: MasteringChain;
    const limiterTopology = resolveLiveLimiterTopology(
      this.hqModeEnabled,
      dryBypass
    );
    if (limiterTopology.premium) {
      chain = await buildMasteringChainWithFallbacks({
        ...chainConfig,
        quality: limiterTopology.quality,
        useFaustLimiter: limiterTopology.useFaustLimiter,
        useTruePeakWorklet: limiterTopology.useTruePeakWorklet,
      });
      console.log(`✅ HQ live limiter backend: ${chain.limiterBackend}`);
    } else {
      chain = buildMasteringChain({
        ...chainConfig,
        quality: limiterTopology.quality,
      });
    }

    if (!dryBypass && chain.limiterBackend !== 'bypass') {
      this.currentProcessedLatencySamples = chain.latencySamples;
      this.chainStatusCallback?.({
        limiterBackend: chain.limiterBackend,
        latencySamples: chain.latencySamples,
        latencyMS: (chain.latencySamples / this.audioContext.sampleRate) * 1000,
      });
    }

    this.wireLiveMeters(chain);
    return chain;
  }

  async play(
    settings: ProcessingSettings,
    plan: ProcessingPlan,
    dryBypass: boolean,
    inputTrimDB?: number,
    useMinimalMaster = false,
    inputLUFS?: number,
    limiterCeilingOverride?: number,
    sslGlue?: 'auto' | 'gentle' | 'firm'
  ): Promise<void> {
    if (!this.audioBuffer) throw new Error('No audio loaded');

    this.ensureContext();

    if (inputLUFS != null && Number.isFinite(inputLUFS)) {
      this.currentInputLUFS = inputLUFS;
    } else if (!Number.isFinite(this.currentInputLUFS)) {
      this.currentInputLUFS = -16;
    }

    if (this.audioContext!.state === 'suspended') {
      await this.audioContext!.resume();
    }

    if (this.isPlaying) {
      console.warn('Already playing');
      return;
    }

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

    const audioContext = this.audioContext;
    const masteringChain = this.masteringChain;
    if (!audioContext || !masteringChain) {
      throw new Error('Mastering chain was not initialized');
    }

    this.sourceNode = audioContext.createBufferSource();
    this.sourceNode.buffer = this.audioBuffer;
    this.sourceNode.connect(masteringChain.input);

    this.sourceNode.onended = () => {
      if (this.isPlaying && !this.isSwitchingBypass) this.stop();
    };

    const offset = this.pauseTime;
    this.sourceNode.start(0, offset);
    this.startTime = audioContext.currentTime - offset;
    this.isPlaying = true;

    console.log(`▶️  Playing from ${offset.toFixed(1)}s`);
  }

  pause(): void {
    if (!this.isPlaying || !this.sourceNode || !this.audioContext) return;

    this.pauseTime = this.audioContext.currentTime - this.startTime;
    this.sourceNode.onended = null;
    this.sourceNode.stop();
    this.sourceNode.disconnect();
    this.sourceNode = null;
    this.isPlaying = false;

    console.log(`⏸️  Paused at ${this.pauseTime.toFixed(1)}s`);
  }

  stop(): void {
    if (this.sourceNode) {
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

  seek(timeSeconds: number): void {
    const wasPlaying = this.isPlaying;
    if (wasPlaying) this.pause();
    this.pauseTime = timeSeconds;
    if (wasPlaying && this.audioContext) {
      console.log(`⏩ Seeked to ${timeSeconds.toFixed(1)}s`);
    }
  }

  getState(): PlaybackState {
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

  updateParameter(paramName: string, value: number, rampTimeSeconds = 0.05): void {
    if (!this.masteringChain || !this.audioContext) return;

    const params = this.masteringChain.parameters;
    const currentTime = this.audioContext.currentTime;

    switch (paramName) {
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
      case 'stereoWidth':
        if (params.stereoWidth) {
          setTargetFinite(params.stereoWidth, value, currentTime, rampTimeSeconds, 1);
        }
        break;
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
        if (
          params.inputTrim &&
          this.currentSettings &&
          this.currentPlan
        ) {
          const drivenValue = resolveDrivenInputTrimDB(
            value,
            this.currentInputLUFS,
            this.currentSettings,
            this.currentPlan,
            this.currentDryBypass
          ) ?? value;
          setTargetLinearFromDB(
            params.inputTrim,
            drivenValue,
            currentTime,
            rampTimeSeconds
          );
        }
        break;
      case 'outputTrim':
        if (params.outputTrim) {
          setTargetLinearFromDB(params.outputTrim, value, currentTime, rampTimeSeconds);
        }
        break;
      case 'limiterMakeup':
        if (params.limiterMakeup) {
          setTargetLinearFromDB(params.limiterMakeup, value, currentTime, rampTimeSeconds);
        }
        break;
      default:
        console.warn(`Unknown parameter: ${paramName}`);
    }
  }

  async rebuildChain(
    settings: ProcessingSettings,
    plan: ProcessingPlan,
    dryBypass: boolean,
    inputTrimDB?: number,
    useMinimalMaster = false,
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

    if (wasPlaying) this.pause();

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
    this.currentHqMode = this.hqModeEnabled;

    console.log('🔄 Rebuilding mastering chain...');

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

    this.isSwitchingBypass = true;
    const currentPosition = this.audioContext.currentTime - this.startTime;
    this.pauseTime = currentPosition;

    console.log(`🔄 Seamless A/B switch: ${newDryBypass ? 'ORIGINAL' : 'PROCESSED'} at ${currentPosition.toFixed(1)}s`);

    if (this.sourceNode) {
      this.sourceNode.onended = null;
      try {
        this.sourceNode.stop();
        this.sourceNode.disconnect();
      } catch {}
      this.sourceNode = null;
    }

    if (this.masteringChain) {
      this.unwireLiveMeters();
      this.masteringChain.dispose();
      this.masteringChain = null;
    }

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

    this.sourceNode = this.audioContext.createBufferSource();
    this.sourceNode.buffer = this.audioBuffer;
    this.sourceNode.connect(this.masteringChain.input);
    this.sourceNode.onended = () => {
      if (this.isPlaying && !this.isSwitchingBypass) this.stop();
    };

    this.sourceNode.start(0, currentPosition);
    this.startTime = this.audioContext.currentTime - currentPosition;
    this.isPlaying = true;

    setTimeout(() => {
      this.isSwitchingBypass = false;
      console.log(`✅ Seamless switch complete! Position locked at ${currentPosition.toFixed(1)}s`);
    }, 150);
  }

  async switchProcessing(
    settings: ProcessingSettings,
    plan: ProcessingPlan,
    dryBypass = false,
    inputTrimDB?: number,
    useMinimalMaster = false,
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
      } catch {}
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
      if (this.isPlaying && !this.isSwitchingBypass) this.stop();
    };
    this.sourceNode.start(0, currentPosition);
    this.startTime = this.audioContext.currentTime - currentPosition;
    this.isPlaying = true;

    setTimeout(() => {
      this.isSwitchingBypass = false;
    }, 150);
  }

  dispose(): void {
    this.stop();

    if (this.masteringChain) {
      this.unwireLiveMeters();
      this.masteringChain.dispose();
      this.masteringChain = null;
    }

    this.limiterMeter.dispose();
    this.lufsMeter.dispose();

    this.audioBuffer = null;
    this.audioContext = null;
  }

  getAudioContext(): AudioContext | null {
    return this.audioContext;
  }

  getOutputNode(): AudioNode | null {
    return this.masteringChain?.output ?? null;
  }
}
