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
 */

import { buildMasteringChain, type MasteringChain, type QualityMode } from './mastering-chain-builder';
import type { ProcessingSettings } from './audio-processor';
import type { ProcessingPlan } from '../data/preset-resolution';

export interface PlaybackState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
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
  private currentBypassMode: boolean = false;
  private isSwitchingBypass: boolean = false; // Flag to prevent state corruption during A/B switch
  
  constructor() {
    // AudioContext will be created on first play (user interaction required)
  }
  
  /**
   * Load audio file for playback
   */
  async loadAudio(file: File): Promise<void> {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }
    
    const arrayBuffer = await file.arrayBuffer();
    this.audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
    
    console.log(`🎵 Loaded audio: ${this.audioBuffer.duration.toFixed(1)}s, ${this.audioBuffer.numberOfChannels}ch`);
  }
  
  /**
   * Start or resume playback
   */
  play(settings: ProcessingSettings, plan: ProcessingPlan, useMinimalMaster: boolean): void {
    if (!this.audioContext || !this.audioBuffer) {
      throw new Error('No audio loaded');
    }
    
    // Resume AudioContext if suspended (browser autoplay policy)
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
    
    if (this.isPlaying) {
      console.warn('Already playing');
      return;
    }
    
    // Store current settings for seamless bypass toggling
    this.currentSettings = settings;
    this.currentPlan = plan;
    this.currentBypassMode = useMinimalMaster;
    
    // Build mastering chain (draft quality)
    if (!this.masteringChain) {
      this.masteringChain = buildMasteringChain({
        context: this.audioContext,
        destination: this.audioContext.destination,
        params: plan,
        settings,
        quality: 'draft',
        useMinimalMaster,
      });
    }
    
    // Create source node
    this.sourceNode = this.audioContext.createBufferSource();
    this.sourceNode.buffer = this.audioBuffer;
    this.sourceNode.connect(this.masteringChain.input);
    
    // Handle end of playback
    this.sourceNode.onended = () => {
      if (this.isPlaying) {
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
   */
  pause(): void {
    if (!this.isPlaying || !this.sourceNode || !this.audioContext) {
      return;
    }
    
    // Save current position
    this.pauseTime = this.audioContext.currentTime - this.startTime;
    
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
   */
  updateParameter(paramName: string, value: number, rampTimeSeconds: number = 0.05): void {
    if (!this.masteringChain || !this.audioContext) {
      console.warn('Cannot update parameter: chain not initialized');
      return;
    }
    
    const params = this.masteringChain.parameters;
    const currentTime = this.audioContext.currentTime;
    
    switch (paramName) {
      case 'stereoWidth':
        if (params.stereoWidth) {
          params.stereoWidth.setTargetAtTime(value, currentTime, rampTimeSeconds);
          console.log(`🎚️  Stereo width → ${value.toFixed(2)} (ramped over ${rampTimeSeconds * 1000}ms)`);
        }
        break;
      
      case 'sslThreshold':
        if (params.sslThreshold) {
          params.sslThreshold.setTargetAtTime(value, currentTime, rampTimeSeconds);
          console.log(`🎚️  SSL threshold → ${value.toFixed(1)} dB`);
        }
        break;
      
      case 'transformerDrive':
        if (params.transformerDrive) {
          params.transformerDrive.setTargetAtTime(value, currentTime, rampTimeSeconds);
          console.log(`🎚️  Transformer drive → ${value.toFixed(2)}`);
        }
        break;
      
      case 'tapeDrive':
        if (params.tapeDrive) {
          params.tapeDrive.setTargetAtTime(value, currentTime, rampTimeSeconds);
          console.log(`🎚️  Tape drive → ${value.toFixed(2)}`);
        }
        break;
      
      case 'limiterMakeup':
        if (params.limiterMakeup) {
          // Convert dB to linear gain
          const linearGain = Math.pow(10, value / 20);
          params.limiterMakeup.setTargetAtTime(linearGain, currentTime, rampTimeSeconds);
          console.log(`🎚️  Limiter makeup → ${value.toFixed(1)} dB`);
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
  rebuildChain(settings: ProcessingSettings, plan: ProcessingPlan, useMinimalMaster: boolean): void {
    const wasPlaying = this.isPlaying;
    const currentPosition = this.getState().currentTime;
    
    // Stop current playback
    if (wasPlaying) {
      this.pause();
    }
    
    // Dispose old chain
    if (this.masteringChain) {
      this.masteringChain.dispose();
      this.masteringChain = null;
    }
    
    console.log('🔄 Rebuilding mastering chain...');
    
    // Build new chain
    if (this.audioContext) {
      this.masteringChain = buildMasteringChain({
        context: this.audioContext,
        destination: this.audioContext.destination,
        params: plan,
        settings,
        quality: 'draft',
        useMinimalMaster,
      });
    }
    
    // Resume playback if was playing
    if (wasPlaying && this.audioContext) {
      this.pauseTime = currentPosition;
      this.play(settings, plan, useMinimalMaster);
    }
  }
  
  /**
   * Toggle bypass mode seamlessly (A/B comparison)
   * Switches between processed and original audio without stopping playback
   */
  toggleBypass(newBypassMode: boolean): void {
    if (!this.isPlaying || !this.currentSettings || !this.currentPlan || !this.audioContext || !this.audioBuffer) {
      // If not playing, just store the new bypass mode for next play
      this.currentBypassMode = newBypassMode;
      console.log(`🔄 Bypass mode set to: ${newBypassMode ? 'ORIGINAL' : 'PROCESSED'} (will apply on next play)`);
      return;
    }
    
    // Set flag to lock the playback position during switch
    this.isSwitchingBypass = true;
    
    // Save current position (calculate from audio context time)
    const currentPosition = this.audioContext.currentTime - this.startTime;
    
    // CRITICAL: Also update pauseTime so getState() returns correct time during the switch
    this.pauseTime = currentPosition;
    
    console.log(`🔄 Seamless A/B switch: ${newBypassMode ? 'ORIGINAL' : 'PROCESSED'} at ${currentPosition.toFixed(1)}s`);
    
    // Stop current source (but keep isPlaying = true)
    if (this.sourceNode) {
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
      this.masteringChain.dispose();
      this.masteringChain = null;
    }
    
    // Build new chain with new bypass mode
    this.currentBypassMode = newBypassMode;
    this.masteringChain = buildMasteringChain({
      context: this.audioContext,
      destination: this.audioContext.destination,
      params: this.currentPlan,
      settings: this.currentSettings,
      quality: 'draft',
      useMinimalMaster: newBypassMode,
    });
    
    // Create new source and resume from saved position
    this.sourceNode = this.audioContext.createBufferSource();
    this.sourceNode.buffer = this.audioBuffer;
    this.sourceNode.connect(this.masteringChain.input);
    
    // Handle end of playback
    this.sourceNode.onended = () => {
      if (this.isPlaying) {
        this.stop();
      }
    };
    
    // Resume from saved position
    this.sourceNode.start(0, currentPosition);
    this.startTime = this.audioContext.currentTime - currentPosition;
    // Keep isPlaying = true (no interruption to state)
    
    // Clear the flag after a brief delay to ensure the position is stable
    // This allows several polling cycles to return the saved position
    setTimeout(() => {
      this.isSwitchingBypass = false;
      console.log(`✅ Seamless switch complete! Position locked at ${currentPosition.toFixed(1)}s`);
    }, 150); // Wait 150ms (3 polling cycles at 50ms each)
    
    console.log(`🔄 Switch initiated, position locked for 150ms`);
  }
  
  /**
   * Clean up resources
   */
  dispose(): void {
    this.stop();
    
    if (this.masteringChain) {
      this.masteringChain.dispose();
      this.masteringChain = null;
    }
    
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