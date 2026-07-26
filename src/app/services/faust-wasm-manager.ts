/**
 * FAUST WASM MANAGER
 * Main-thread manager for loading Faust-compiled WASM modules as AudioWorklet nodes.
 * 
 * Handles:
 * - Loading WASM + JSON metadata
 * - Initializing AudioWorklet processors
 * - Parameter control (setParam/getParam)
 * - Metering (gain reduction, levels)
 * - Offline rendering for export
 * 
 * Usage:
 *   const manager = new FaustWasmManager();
 *   await manager.initialize(audioContext);
 *   
 *   // Load the pro compressor
 *   const compressor = await manager.createNode('pro-compressor');
 *   compressor.connect(audioContext.destination);
 *   
 *   // Set parameters
 *   compressor.setParam('Threshold', -12);
 *   compressor.setParam('Ratio', 4);
 *   
 *   // Get metering
 *   compressor.onMeters((data) => {
 *     console.log('GR:', data.GainReduction);
 *   });
 */

export interface FaustNodeOptions {
  /** Name identifier for the processor */
  name: string;
  /** Path to .wasm file (relative to public root) */
  wasmPath: string;
  /** Path to .json metadata file (relative to public root) */
  jsonPath: string;
}

// Pre-configured module paths
const FAUST_MODULES: Record<string, FaustNodeOptions> = {
  'limiter': {
    name: 'limiter',
    wasmPath: '/faust/compiled/limiter.wasm',
    jsonPath: '/faust/compiled/limiter.json',
  },
  'pro-compressor': {
    name: 'pro-compressor',
    wasmPath: '/faust/compiled/pro-compressor.wasm',
    jsonPath: '/faust/compiled/pro-compressor.json',
  },
  'reference-matching-eq': {
    name: 'reference-matching-eq',
    wasmPath: '/faust/compiled/reference-matching-eq.wasm',
    jsonPath: '/faust/compiled/reference-matching-eq.json',
  },
  'iso-reference-matching-eq': {
    name: 'iso-reference-matching-eq',
    wasmPath: '/faust/compiled/iso-reference-matching-eq.wasm',
    jsonPath: '/faust/compiled/iso-reference-matching-eq.json',
  },
};

export interface FaustMeterData {
  [path: string]: number;
}

export class FaustNode {
  private workletNode: AudioWorkletNode;
  private params: string[] = [];
  private outputParams: string[] = [];
  private meterCallbacks: Array<(data: FaustMeterData) => void> = [];
  private _ready: Promise<void>;
  private _resolveReady!: () => void;

  constructor(workletNode: AudioWorkletNode) {
    this.workletNode = workletNode;
    this._ready = new Promise((resolve) => {
      this._resolveReady = resolve;
    });

    // Listen for messages from the worklet
    this.workletNode.port.onmessage = (event) => {
      const msg = event.data;

      if (msg.type === 'ready') {
        this.params = msg.params || [];
        this.outputParams = msg.outputParams || [];
        console.log(`✅ Faust node ready. Params: ${this.params.join(', ')}`);
        this._resolveReady();
      } else if (msg.type === 'meters') {
        for (const cb of this.meterCallbacks) {
          cb(msg.data);
        }
      } else if (msg.type === 'error') {
        console.error(`❌ Faust node error: ${msg.message}`);
      }
    };
  }

  /** Wait for the node to be fully initialized */
  async whenReady(): Promise<void> {
    return this._ready;
  }

  /** Set a single parameter by path or label */
  setParam(path: string, value: number): void {
    this.workletNode.port.postMessage({
      type: 'setParam',
      path,
      value,
    });
  }

  /** Set multiple parameters at once */
  setParams(params: Record<string, number>): void {
    this.workletNode.port.postMessage({
      type: 'setParams',
      params,
    });
  }

  /** Register a metering callback (called ~60fps with output bargraph values) */
  onMeters(callback: (data: FaustMeterData) => void): void {
    this.meterCallbacks.push(callback);
  }

  /** Enable/disable metering (disable during offline export for performance) */
  setMetering(enabled: boolean): void {
    this.workletNode.port.postMessage({
      type: 'setMetering',
      enabled,
    });
  }

  /** Reset DSP state (clear delay lines, envelopes, etc.) */
  reset(): void {
    this.workletNode.port.postMessage({ type: 'reset' });
  }

  /** Connect to a destination AudioNode */
  connect(destination: AudioNode | AudioParam): AudioNode {
    if (destination instanceof AudioParam) {
      this.workletNode.connect(destination);
      return this.workletNode;
    }
    return this.workletNode.connect(destination);
  }

  /** Disconnect from all or specific destination */
  disconnect(destination?: AudioNode): void {
    if (destination) {
      this.workletNode.disconnect(destination);
    } else {
      this.workletNode.disconnect();
    }
  }

  /** Get the underlying AudioWorkletNode */
  getNode(): AudioWorkletNode {
    return this.workletNode;
  }

  /** Get available parameter paths */
  getParams(): string[] {
    return [...this.params];
  }

  /** Get available output/meter paths */
  getOutputParams(): string[] {
    return [...this.outputParams];
  }

  /** Cleanup */
  destroy(): void {
    this.meterCallbacks = [];
    this.workletNode.disconnect();
  }
}

export class FaustWasmManager {
  private audioContext: AudioContext | null = null;
  private workletLoaded = false;
  private wasmCache: Map<string, ArrayBuffer> = new Map();
  private jsonCache: Map<string, object> = new Map();

  /**
   * Initialize the manager with an AudioContext.
   * Loads the generic Faust AudioWorklet processor.
   */
  async initialize(audioContext: AudioContext): Promise<void> {
    this.audioContext = audioContext;

    if (!this.workletLoaded) {
      await audioContext.audioWorklet.addModule('/faust/compiled/faust-worklet-loader.js');
      this.workletLoaded = true;
      console.log('✅ Faust AudioWorklet processor loaded');
    }
  }

  /**
   * Create a Faust AudioWorklet node for a specific module.
   * 
   * @param moduleId - One of: 'limiter', 'pro-compressor', 'reference-matching-eq', 'iso-reference-matching-eq'
   * @returns FaustNode instance (call .whenReady() before using)
   */
  async createNode(moduleId: string): Promise<FaustNode> {
    if (!this.audioContext) {
      throw new Error('FaustWasmManager not initialized. Call initialize() first.');
    }

    const moduleConfig = FAUST_MODULES[moduleId];
    if (!moduleConfig) {
      throw new Error(`Unknown Faust module: ${moduleId}. Available: ${Object.keys(FAUST_MODULES).join(', ')}`);
    }

    // Fetch WASM and JSON (with caching)
    const [wasmBytes, jsonData] = await Promise.all([
      this.fetchWasm(moduleConfig.wasmPath),
      this.fetchJson(moduleConfig.jsonPath),
    ]);

    // Create AudioWorkletNode
    const workletNode = new AudioWorkletNode(this.audioContext, 'faust-processor', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2], // Stereo output
      processorOptions: {
        name: moduleConfig.name,
      },
    });

    // Wrap in FaustNode
    const faustNode = new FaustNode(workletNode);

    // Send WASM + JSON to the worklet for initialization
    workletNode.port.postMessage({
      type: 'init',
      wasmBytes: wasmBytes,
      jsonData: jsonData,
    });

    // Wait for it to be ready
    await faustNode.whenReady();

    return faustNode;
  }

  /**
   * Fetch and cache WASM binary
   */
  private async fetchWasm(path: string): Promise<ArrayBuffer> {
    if (this.wasmCache.has(path)) {
      return this.wasmCache.get(path)!;
    }

    const response = await fetch(path);
    if (!response.ok) {
      throw new Error(`Failed to fetch WASM: ${path} (${response.status})`);
    }

    const buffer = await response.arrayBuffer();
    this.wasmCache.set(path, buffer);
    return buffer;
  }

  /**
   * Fetch and cache JSON metadata
   */
  private async fetchJson(path: string): Promise<object> {
    if (this.jsonCache.has(path)) {
      return this.jsonCache.get(path)!;
    }

    const response = await fetch(path);
    if (!response.ok) {
      throw new Error(`Failed to fetch JSON: ${path} (${response.status})`);
    }

    const data = await response.json();
    this.jsonCache.set(path, data);
    return data;
  }

  /**
   * Cleanup all cached resources
   */
  destroy(): void {
    this.wasmCache.clear();
    this.jsonCache.clear();
    this.audioContext = null;
  }
}

// Singleton instance
export const faustWasmManager = new FaustWasmManager();
