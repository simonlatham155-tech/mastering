/**
 * FAUST COMPRESSOR MANAGER
 * Handles loading and managing the Faust-compiled WASM AudioWorklet
 * Provides SharedArrayBuffer communication for lag-free metering
 */

export interface FaustCompressorParams {
  threshold: number; // dB
  ratio: number;
  knee: number; // dB
  attack: number; // ms
  release: number; // ms
  makeupGain: number; // dB
  detectionMode: 'peak' | 'rms'; // 0 = peak, 1 = rms
  sidechainEnable: boolean;
  sidechainCutoff: number; // Hz
  lookAhead: number; // ms
}

export interface FaustMeteringData {
  gainReduction: number; // dB
  inputLevel: number; // dB
  outputLevel: number; // dB
}

export class FaustCompressorManager {
  private audioContext: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private meteringBuffer: SharedArrayBuffer | null = null;
  private meteringView: Float32Array | null = null;
  private meteringCallback: ((data: FaustMeteringData) => void) | null = null;
  private meteringInterval: number | null = null;
  
  // Metering buffer indices
  private static readonly GR_INDEX = 0;
  private static readonly INPUT_INDEX = 1;
  private static readonly OUTPUT_INDEX = 2;
  private static readonly BUFFER_SIZE = 3;
  
  /**
   * Initialize the Faust compressor
   * 
   * IMPORTANT FOR DEVELOPERS:
   * 1. Compile the /public/faust/pro-compressor.dsp file using Faust Online IDE
   * 2. Export as "AudioWorklet" target
   * 3. Place the generated files in /public/faust/compiled/
   * 4. Update the worklet path below
   */
  async initialize(audioContext: AudioContext): Promise<void> {
    this.audioContext = audioContext;
    
    try {
      // Load the Faust-compiled AudioWorklet
      // TODO: Replace with actual compiled worklet path once Faust compilation is done
      // await audioContext.audioWorklet.addModule('/faust/compiled/pro-compressor-worklet.js');
      
      // For now, we'll use a fallback to the hand-written worklet
      // Once you compile the Faust DSP code, uncomment the line above and remove this one:
      await audioContext.audioWorklet.addModule('/worklets/pro-compressor-worklet.js');
      
      // Create SharedArrayBuffer for metering (3 floats: GR, input, output)
      this.meteringBuffer = new SharedArrayBuffer(
        FaustCompressorManager.BUFFER_SIZE * Float32Array.BYTES_PER_ELEMENT
      );
      this.meteringView = new Float32Array(this.meteringBuffer);
      
      // Create the AudioWorkletNode
      this.workletNode = new AudioWorkletNode(audioContext, 'pro-compressor-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
        processorOptions: {
          meteringBuffer: this.meteringBuffer
        }
      });
      
      console.log('✅ Faust Compressor initialized');
      
      // Start metering updates (60fps)
      this.startMetering();
      
    } catch (error) {
      console.error('❌ Failed to initialize Faust Compressor:', error);
      throw error;
    }
  }
  
  /**
   * Connect the compressor to the audio graph
   */
  connect(destination: AudioNode): void {
    if (!this.workletNode) {
      throw new Error('Faust Compressor not initialized');
    }
    
    this.workletNode.connect(destination);
  }
  
  /**
   * Disconnect the compressor
   */
  disconnect(): void {
    if (this.workletNode) {
      this.workletNode.disconnect();
    }
  }
  
  /**
   * Get the input node (for connecting sources)
   */
  getInputNode(): AudioNode {
    if (!this.workletNode) {
      throw new Error('Faust Compressor not initialized');
    }
    
    return this.workletNode;
  }
  
  /**
   * Update compressor parameters
   * This sends parameter changes to the Faust-compiled WASM module
   */
  updateParameters(params: Partial<FaustCompressorParams>): void {
    if (!this.workletNode) {
      console.warn('Cannot update parameters: Faust Compressor not initialized');
      return;
    }
    
    // Send to AudioWorklet
    this.workletNode.port.postMessage({
      type: 'updateParams',
      data: {
        threshold: params.threshold,
        ratio: params.ratio,
        knee: params.knee,
        attack: params.attack !== undefined ? params.attack / 1000 : undefined, // Convert ms to seconds
        release: params.release !== undefined ? params.release / 1000 : undefined, // Convert ms to seconds
        makeupGain: params.makeupGain,
        detectionMode: params.detectionMode === 'rms' ? 1 : 0,
        sidechainHPF: params.sidechainEnable,
        hpfCutoff: params.sidechainCutoff,
        lookAhead: params.lookAhead !== undefined ? params.lookAhead / 1000 : undefined // Convert ms to seconds
      }
    });
  }
  
  /**
   * Start metering updates (60fps via SharedArrayBuffer)
   * This is LAG-FREE because we read directly from shared memory
   */
  private startMetering(): void {
    if (this.meteringInterval !== null) {
      return; // Already running
    }
    
    const updateMetering = () => {
      if (!this.meteringView || !this.meteringCallback) {
        return;
      }
      
      // Read from SharedArrayBuffer (written by AudioWorklet)
      const data: FaustMeteringData = {
        gainReduction: this.meteringView[FaustCompressorManager.GR_INDEX],
        inputLevel: this.meteringView[FaustCompressorManager.INPUT_INDEX],
        outputLevel: this.meteringView[FaustCompressorManager.OUTPUT_INDEX]
      };
      
      // Call the UI callback
      this.meteringCallback(data);
    };
    
    // Run at 60fps
    this.meteringInterval = window.setInterval(updateMetering, 1000 / 60);
  }
  
  /**
   * Stop metering updates
   */
  private stopMetering(): void {
    if (this.meteringInterval !== null) {
      clearInterval(this.meteringInterval);
      this.meteringInterval = null;
    }
  }
  
  /**
   * Set metering callback (called at 60fps with metering data)
   */
  onMetering(callback: (data: FaustMeteringData) => void): void {
    this.meteringCallback = callback;
  }
  
  /**
   * Process an audio buffer through the compressor
   * (Offline processing for export)
   */
  async processBuffer(
    inputBuffer: AudioBuffer,
    params: FaustCompressorParams
  ): Promise<AudioBuffer> {
    if (!this.audioContext) {
      throw new Error('Faust Compressor not initialized');
    }
    
    // Create offline context for processing
    const offlineContext = new OfflineAudioContext(
      inputBuffer.numberOfChannels,
      inputBuffer.length,
      inputBuffer.sampleRate
    );
    
    // Load worklet in offline context
    await offlineContext.audioWorklet.addModule('/worklets/pro-compressor-worklet.js');
    
    // Create processor
    const processor = new AudioWorkletNode(offlineContext, 'pro-compressor-processor');
    
    // Set parameters
    processor.port.postMessage({
      type: 'updateParams',
      data: {
        threshold: params.threshold,
        ratio: params.ratio,
        knee: params.knee,
        attack: params.attack / 1000,
        release: params.release / 1000,
        makeupGain: params.makeupGain,
        detectionMode: params.detectionMode === 'rms' ? 1 : 0,
        sidechainHPF: params.sidechainEnable,
        hpfCutoff: params.sidechainCutoff,
        lookAhead: params.lookAhead / 1000
      }
    });
    
    // Create source
    const source = offlineContext.createBufferSource();
    source.buffer = inputBuffer;
    
    // Connect: source -> processor -> destination
    source.connect(processor);
    processor.connect(offlineContext.destination);
    
    // Process
    source.start(0);
    const processedBuffer = await offlineContext.startRendering();
    
    return processedBuffer;
  }
  
  /**
   * Cleanup
   */
  destroy(): void {
    this.stopMetering();
    
    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    
    this.meteringBuffer = null;
    this.meteringView = null;
    this.meteringCallback = null;
    this.audioContext = null;
  }
}

// Singleton instance
export const faustCompressorManager = new FaustCompressorManager();
