/**
 * FAUST WASM AUDIOWORKLET LOADER
 * Generic AudioWorklet processor that loads Faust-compiled WASM modules.
 * 
 * Usage from main thread:
 *   // 1. Add the worklet module
 *   await audioContext.audioWorklet.addModule('/faust/compiled/faust-worklet-loader.js');
 *   
 *   // 2. Create a node, passing the WASM file path and JSON metadata
 *   const node = new AudioWorkletNode(audioContext, 'faust-processor', {
 *     processorOptions: {
 *       name: 'limiter',             // processor instance name
 *       wasmPath: '/faust/compiled/limiter.wasm',
 *       jsonPath: '/faust/compiled/limiter.json'
 *     }
 *   });
 * 
 * NOTE: Since AudioWorklet can't do fetch(), the main thread must fetch 
 * the WASM + JSON and pass them via the port after creation.
 */

// We'll use a pattern where main thread fetches WASM & JSON, sends via port

class FaustProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    
    this.processorOptions = options.processorOptions || {};
    this.name = this.processorOptions.name || 'faust';
    
    // DSP state
    this.dsp = 0;
    this.factory = null;
    this.HEAP = null;
    this.HEAP32 = null;
    this.HEAPF = null;
    this.pathTable = {};
    this.outputsItems = [];
    this.ins = null;
    this.outs = null;
    this.numIn = 0;
    this.numOut = 0;
    this.dspInChannels = [];
    this.dspOutChannels = [];
    this.ready = false;
    
    // Metering
    this.meteringEnabled = true;
    this.meteringCounter = 0;
    this.meteringInterval = 800; // samples between meter updates
    
    // Handle messages from main thread
    this.port.onmessage = (event) => {
      const msg = event.data;
      
      if (msg.type === 'init') {
        this.initDSP(msg.wasmBytes, msg.jsonData);
      } else if (msg.type === 'setParam') {
        this.setParam(msg.path, msg.value);
      } else if (msg.type === 'setParams') {
        for (const [path, value] of Object.entries(msg.params)) {
          this.setParam(path, value);
        }
      } else if (msg.type === 'setMetering') {
        this.meteringEnabled = msg.enabled;
      } else if (msg.type === 'reset') {
        if (this.factory && this.dsp) {
          this.factory.instanceClear(this.dsp);
        }
      }
    };
  }
  
  /**
   * Initialize the Faust DSP from WASM bytes and JSON metadata
   */
  async initDSP(wasmBytes, jsonData) {
    try {
      const json = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
      
      this.numIn = parseInt(json.inputs) || 0;
      this.numOut = parseInt(json.outputs) || 0;
      
      const dspSize = parseInt(json.size) || 0;
      const ptrSize = 4;
      const sampleSize = 4;
      const bufferSize = 128; // AudioWorklet quantum
      
      // Calculate memory layout
      const audioHeapPtr = dspSize;
      const audioHeapPtrInputs = audioHeapPtr;
      const audioHeapPtrOutputs = audioHeapPtrInputs + (this.numIn * ptrSize);
      const audioHeapInputs = audioHeapPtrOutputs + (this.numOut * ptrSize);
      const audioHeapOutputs = audioHeapInputs + (this.numIn * bufferSize * sampleSize);
      const totalMemory = audioHeapOutputs + (this.numOut * bufferSize * sampleSize);
      
      // Calculate required WASM pages (64KB each)
      const wasmPages = Math.max(1, Math.ceil(totalMemory / 65536));
      
      // Instantiate WASM
      const memory = new WebAssembly.Memory({ initial: wasmPages * 2 });
      const importObject = {
        env: {
          memory: memory,
          memoryBase: 0,
          tableBase: 0,
          _abs: Math.abs,
          _acos: Math.acos,
          _acosh: Math.acosh,
          _asin: Math.asin,
          _asinh: Math.asinh,
          _atan: Math.atan,
          _atan2: Math.atan2,
          _atanh: Math.atanh,
          _ceil: Math.ceil,
          _cos: Math.cos,
          _cosh: Math.cosh,
          _exp: Math.exp,
          _floor: Math.floor,
          _fmod: function(x, y) { return x % y; },
          _log: Math.log,
          _log2: Math.log2,
          _log10: Math.log10,
          _max_: Math.max,
          _min_: Math.min,
          _pow: Math.pow,
          _remainder: function(x, y) { return x - Math.round(x / y) * y; },
          _rint: Math.round,
          _round: Math.round,
          _sin: Math.sin,
          _sinh: Math.sinh,
          _sqrt: Math.sqrt,
          _tan: Math.tan,
          _tanh: Math.tanh,
          _acosf: Math.acos,
          _asinf: Math.asin,
          _atanf: Math.atan,
          _atan2f: Math.atan2,
          _ceilf: Math.ceil,
          _cosf: Math.cos,
          _expf: Math.exp,
          _floorf: Math.floor,
          _fmodf: function(x, y) { return x % y; },
          _logf: Math.log,
          _log2f: Math.log2,
          _log10f: Math.log10,
          _max_f: Math.max,
          _min_f: Math.min,
          _powf: Math.pow,
          _remainderf: function(x, y) { return x - Math.round(x / y) * y; },
          _rintf: Math.round,
          _roundf: Math.round,
          _sinf: Math.sin,
          _sqrtf: Math.sqrt,
          _tanf: Math.tan,
          _tanhf: Math.tanh,
          table: new WebAssembly.Table({ initial: 0, element: 'anyfunc' })
        }
      };
      
      const wasmModule = await WebAssembly.instantiate(wasmBytes, importObject);
      this.factory = wasmModule.instance.exports;
      
      // Set up memory views
      this.HEAP = this.factory.memory ? this.factory.memory.buffer : memory.buffer;
      this.HEAP32 = new Int32Array(this.HEAP);
      this.HEAPF = new Float32Array(this.HEAP);
      
      // Initialise DSP
      this.dsp = 0;
      this.factory.init(this.dsp, sampleRate);
      
      // Set up input/output pointers
      this.ins = audioHeapPtrInputs;
      this.outs = audioHeapPtrOutputs;
      
      // Input channel pointers
      for (let i = 0; i < this.numIn; i++) {
        this.HEAP32[(this.ins >> 2) + i] = audioHeapInputs + (i * bufferSize * sampleSize);
        this.dspInChannels.push(audioHeapInputs + (i * bufferSize * sampleSize));
      }
      
      // Output channel pointers
      for (let i = 0; i < this.numOut; i++) {
        this.HEAP32[(this.outs >> 2) + i] = audioHeapOutputs + (i * bufferSize * sampleSize);
        this.dspOutChannels.push(audioHeapOutputs + (i * bufferSize * sampleSize));
      }
      
      // Build path table from JSON UI
      this.buildPathTable(json.ui);
      
      this.ready = true;
      
      // Tell main thread we're ready
      this.port.postMessage({
        type: 'ready',
        inputs: this.numIn,
        outputs: this.numOut,
        params: Object.keys(this.pathTable),
        outputParams: this.outputsItems
      });
      
    } catch (err) {
      this.port.postMessage({
        type: 'error',
        message: err.message || String(err)
      });
    }
  }
  
  /**
   * Build parameter path table from Faust UI JSON
   */
  buildPathTable(items, prefix = '') {
    for (const item of items) {
      if (item.type === 'vgroup' || item.type === 'hgroup' || item.type === 'tgroup') {
        this.buildPathTable(item.items, prefix + item.label + '/');
      } else if (item.address) {
        this.pathTable[item.address] = parseInt(item.index);
        
        // Also store with short name for convenience
        const shortName = item.label;
        if (!this.pathTable.hasOwnProperty(shortName)) {
          this.pathTable[shortName] = parseInt(item.index);
        }
        
        // Track output items (bargraphs)
        if (item.type === 'hbargraph' || item.type === 'vbargraph') {
          this.outputsItems.push(item.address);
        }
      }
    }
  }
  
  /**
   * Set a parameter value
   */
  setParam(path, value) {
    if (!this.factory) return;
    
    const index = this.pathTable[path];
    if (index !== undefined) {
      this.factory.setParamValue(this.dsp, index, value);
    } else {
      // Try to find by label match
      for (const [key, idx] of Object.entries(this.pathTable)) {
        if (key.endsWith('/' + path) || key === path) {
          this.factory.setParamValue(this.dsp, idx, value);
          return;
        }
      }
    }
  }
  
  /**
   * Get a parameter value
   */
  getParam(path) {
    if (!this.factory) return 0;
    
    const index = this.pathTable[path];
    if (index !== undefined) {
      return this.factory.getParamValue(this.dsp, index);
    }
    return 0;
  }
  
  /**
   * Process audio
   */
  process(inputs, outputs, parameters) {
    if (!this.ready || !this.factory) {
      // Pass-through when not ready
      if (inputs[0] && outputs[0]) {
        for (let ch = 0; ch < Math.min(inputs[0].length, outputs[0].length); ch++) {
          outputs[0][ch].set(inputs[0][ch]);
        }
      }
      return true;
    }
    
    const blockSize = 128;
    
    // Copy input to WASM memory
    const input = inputs[0];
    if (input) {
      for (let ch = 0; ch < Math.min(input.length, this.numIn); ch++) {
        const offset = this.dspInChannels[ch] >> 2;
        this.HEAPF.set(input[ch], offset);
      }
    }
    
    // Compute
    this.factory.compute(this.dsp, blockSize, this.ins, this.outs);
    
    // Copy output from WASM memory
    const output = outputs[0];
    if (output) {
      for (let ch = 0; ch < Math.min(output.length, this.numOut); ch++) {
        const offset = this.dspOutChannels[ch] >> 2;
        output[ch].set(this.HEAPF.subarray(offset, offset + blockSize));
      }
    }
    
    // Metering: send output param values periodically
    if (this.meteringEnabled && this.outputsItems.length > 0) {
      this.meteringCounter += blockSize;
      if (this.meteringCounter >= this.meteringInterval) {
        this.meteringCounter = 0;
        const meters = {};
        for (const path of this.outputsItems) {
          meters[path] = this.getParam(path);
        }
        this.port.postMessage({ type: 'meters', data: meters });
      }
    }
    
    return true;
  }
}

registerProcessor('faust-processor', FaustProcessor);
