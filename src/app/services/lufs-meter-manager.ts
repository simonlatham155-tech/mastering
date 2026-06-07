/**
 * BS.1770-4 loudness metering via AudioWorklet (passthrough, does not color audio).
 */

import { ensureLufsMeterWorkletModule } from './lufs-meter-worklet';

export interface LufsMeterData {
  momentary: number;
  shortTerm: number;
  integrated: number;
  totalBlocks: number;
}

export class LufsMeterManager {
  private workletNode: AudioWorkletNode | null = null;
  private audioContext: BaseAudioContext | null = null;
  private onMeterUpdate: ((data: LufsMeterData) => void) | null = null;
  private connectedDestination: AudioNode | null = null;

  async initialize(context: BaseAudioContext): Promise<AudioWorkletNode> {
    if (this.workletNode && this.audioContext === context) {
      return this.workletNode;
    }

    this.dispose();
    this.audioContext = context;

    await ensureLufsMeterWorkletModule(context);

    this.workletNode = new AudioWorkletNode(context, 'lufs-metering-processor', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });

    this.workletNode.port.onmessage = (event) => {
      if (event.data?.type === 'lufs-update' && this.onMeterUpdate) {
        this.onMeterUpdate(event.data.data as LufsMeterData);
      }
    };

    console.log('✅ BS.1770 LUFS meter initialized');
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

  setMeterCallback(callback: ((data: LufsMeterData) => void) | null): void {
    this.onMeterUpdate = callback;
  }

  reset(): void {
    this.workletNode?.port.postMessage({ type: 'reset' });
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
    this.audioContext = null;
  }
}
