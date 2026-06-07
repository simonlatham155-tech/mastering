/**
 * Oversampling limiter worklet manager — true-peak metering tap for live preview.
 * Runs in monitor-only mode (passthrough audio, measures inter-sample peaks).
 */

export interface LimiterMeterData {
  truePeakDBTP: number;
  digitalPeakDB: number;
  gainReductionDB: number;
  hqMode: boolean;
  ispDifference: number;
}

export interface LimiterMeterParams {
  ceiling?: number;
  threshold?: number;
  attack?: number;
  release?: number;
  hqMode?: boolean;
  monitorOnly?: boolean;
}

let moduleLoadedForContext = new WeakMap<BaseAudioContext, boolean>();

function workletUrl(): string {
  const base = import.meta.env.BASE_URL || '/';
  return `${base}worklets/oversampling-limiter.js`;
}

export class OversamplingLimiterManager {
  private workletNode: AudioWorkletNode | null = null;
  private audioContext: AudioContext | null = null;
  private onMeterUpdate: ((data: LimiterMeterData) => void) | null = null;
  private connectedDestination: AudioNode | null = null;

  async initialize(audioContext: AudioContext): Promise<AudioWorkletNode> {
    if (this.workletNode && this.audioContext === audioContext) {
      return this.workletNode;
    }

    this.dispose();
    this.audioContext = audioContext;

    if (!moduleLoadedForContext.get(audioContext)) {
      await audioContext.audioWorklet.addModule(workletUrl());
      moduleLoadedForContext.set(audioContext, true);
    }

    this.workletNode = new AudioWorkletNode(audioContext, 'oversampling-limiter', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });

    this.workletNode.port.onmessage = (event) => {
      if (event.data?.type === 'meter-update' && this.onMeterUpdate) {
        this.onMeterUpdate(event.data.data as LimiterMeterData);
      }
    };

    this.setParameters({
      monitorOnly: true,
      hqMode: true,
      ceiling: -1.0,
      threshold: -3.0,
    });

    console.log('✅ Oversampling limiter meter tap initialized');
    return this.workletNode;
  }

  connectToDestination(destination: AudioNode): void {
    if (!this.workletNode) return;
    if (this.connectedDestination !== destination) {
      try {
        this.workletNode.disconnect();
      } catch {
        /* ignore */
      }
      this.workletNode.connect(destination);
      this.connectedDestination = destination;
    }
  }

  setMeterCallback(callback: ((data: LimiterMeterData) => void) | null): void {
    this.onMeterUpdate = callback;
  }

  setParameters(params: LimiterMeterParams): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ type: 'setParameters', data: params });
  }

  getNode(): AudioWorkletNode | null {
    return this.workletNode;
  }

  dispose(): void {
    if (this.workletNode) {
      this.workletNode.port.onmessage = null;
      try {
        this.workletNode.disconnect();
      } catch {
        /* ignore */
      }
      this.workletNode = null;
    }
    this.connectedDestination = null;
    this.onMeterUpdate = null;
  }
}
