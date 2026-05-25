# FAUST DSP BUILD INSTRUCTIONS
## Compiling Reference-Grade Limiters to WASM + AudioWorklet

---

## 📋 **PREREQUISITES**

### **1. Install Faust Compiler**

**macOS/Linux:**
```bash
# Install via package manager
brew install faust  # macOS
sudo apt-get install faust  # Ubuntu/Debian

# OR build from source
git clone https://github.com/grame-cncm/faust.git
cd faust
make
sudo make install
```

**Windows:**
```bash
# Use WSL (Windows Subsystem for Linux) or download pre-built binaries
# https://github.com/grame-cncm/faust/releases
```

**Verify Installation:**
```bash
faust --version
# Should output: FAUST Version 2.xx.xx
```

---

### **2. Install Emscripten (for WASM compilation)**

```bash
# Clone Emscripten SDK
git clone https://github.com/emscripten-core/emsdk.git
cd emsdk

# Install and activate
./emsdk install latest
./emsdk activate latest

# Add to PATH
source ./emsdk_env.sh
```

**Verify:**
```bash
emcc --version
# Should output: emcc (Emscripten gcc/clang-like replacement) version x.x.x
```

---

## 🚀 **COMPILATION WORKFLOW**

### **STEP 1: Compile Faust to WASM AudioWorklet**

```bash
# Navigate to DSP directory
cd /src/dsp

# Compile limiter.dsp to AudioWorklet + WASM
faust2wasm -worklet limiter.dsp

# This generates:
# - limiter-processor.js  (AudioWorklet processor)
# - limiter.wasm          (Compiled DSP kernel)
# - limiter.html          (Test interface)
```

**Output Files:**
```
/src/dsp/
├── limiter.dsp              (Source code)
├── limiter-processor.js     (Generated: AudioWorklet)
├── limiter.wasm             (Generated: WASM binary)
└── limiter.html             (Generated: Test UI)
```

---

### **STEP 2: Add 4x Oversampling (CRITICAL)**

**Problem**: Basic `faust2wasm` doesn't include oversampling by default.

**Solution**: Use Faust's `os` library with a custom architecture file.

**Enhanced Limiter with Oversampling:**
```faust
// Add to top of limiter.dsp

import("stdfaust.lib");

// 4x Oversampling wrapper
oversample_4x(dsp) = os.oversample(2, dsp);
// os.oversample(2, dsp) = 2^2 = 4x oversampling

// Update process to use oversampling
process = _ , _ : oversample_4x(limiter_stereo_linked);
```

**Recompile:**
```bash
faust2wasm -worklet limiter.dsp
```

---

### **STEP 3: Move Files to Project**

```bash
# Copy generated files to project
cp limiter-processor.js ../app/worklets/
cp limiter.wasm ../app/worklets/

# OR create symlinks (for development)
ln -s /src/dsp/limiter-processor.js /src/app/worklets/
ln -s /src/dsp/limiter.wasm /src/app/worklets/
```

---

## 🔌 **INTEGRATION WITH JAVASCRIPT**

### **STEP 1: Load AudioWorklet Module**

```typescript
// In your audio controller (e.g., MasterAudioController.ts)

async function initializeReferenceGradeLimiter(audioContext: AudioContext) {
  // Load the WASM AudioWorklet
  await audioContext.audioWorklet.addModule('/src/app/worklets/limiter-processor.js');
  
  // Create limiter node
  const limiterNode = new AudioWorkletNode(audioContext, 'limiter');
  
  return limiterNode;
}
```

---

### **STEP 2: Control Parameters**

```typescript
// Get parameter objects
const thresholdParam = limiterNode.parameters.get('threshold');
const ratioParam = limiterNode.parameters.get('ratio');
const attackParam = limiterNode.parameters.get('attack');
const releaseParam = limiterNode.parameters.get('release');
const ceilingParam = limiterNode.parameters.get('ceiling');

// Set values
thresholdParam.setValueAtTime(-0.3, audioContext.currentTime);
ratioParam.setValueAtTime(20, audioContext.currentTime);
attackParam.setValueAtTime(0.001, audioContext.currentTime); // 1ms
releaseParam.setValueAtTime(0.1, audioContext.currentTime); // 100ms
ceilingParam.setValueAtTime(-0.3, audioContext.currentTime);
```

---

### **STEP 3: Read Meters (True Peak + Gain Reduction)**

```typescript
// Listen for meter updates from Faust processor
limiterNode.port.onmessage = (event) => {
  const { type, data } = event.data;
  
  if (type === 'meter') {
    const truePeakDBTP = data.true_peak_dbTP;
    const gainReductionDB = data.gain_reduction_db;
    
    // Update UI
    updateTruePeakMeter(truePeakDBTP);
    updateGainReductionMeter(gainReductionDB);
  }
};

// Request meter updates
limiterNode.port.postMessage({ type: 'enableMetering', interval: 50 }); // Update every 50ms
```

---

### **STEP 4: Connect to Audio Chain**

```typescript
// Master chain:
// Source → [Multi-Stage Limiters] → True Peak Limiter → Destination

sourceNode
  .connect(trackLimiter)      // Stage 1: Track-level
  .connect(busLimiter)        // Stage 2: Bus-level
  .connect(limiterNode)       // Stage 3: True Peak Limiter (WASM)
  .connect(audioContext.destination);
```

---

## ⚡ **ADVANCED: TRUE PEAK DETECTION (ITU-R BS.1770-4)**

### **Enhanced Faust Code with True Peak Calculation**

```faust
// Add to limiter.dsp

// ITU-R BS.1770-4 True Peak Detector
// Requires 4x oversampling
true_peak_detector_4x = 
    // Upsample to 4x
    os.oversample(2, _)  // 2^2 = 4x
    // Find absolute peak at high sample rate
    : abs
    // Hold peak for metering
    : ba.peak_hold(4800)
    // Convert to dBTP
    : ba.linear2db
    // Attach to bargraph for JavaScript readback
    : attach(hbargraph("true_peak_dbTP", -20, 3));

// Update output metering
process = _ , _ : limiter_stereo_linked <: (!, _, true_peak_detector_4x : attach), _; 
```

**Why This Works:**
- Upsamples to 4x rate (e.g., 48kHz → 192kHz)
- Detects peaks in the **reconstructed analog waveform**
- Catches inter-sample peaks that occur between digital samples

---

## 🧪 **TESTING**

### **Test 1: Verify Oversampling**

```javascript
// Generate test signal with inter-sample peak
const testFreq = 11025; // Nyquist/2 (worst case for aliasing)
const osc = audioContext.createOscillator();
osc.frequency.value = testFreq;

// Connect to limiter
osc.connect(limiterNode).connect(audioContext.destination);
osc.start();

// Monitor true peak
// Should stay below ceiling even at extreme frequencies
```

---

### **Test 2: Verify Look-Ahead**

```javascript
// Create impulse (sudden peak)
const buffer = audioContext.createBuffer(2, 48000, 48000);
const channelData = buffer.getChannelData(0);

// Single sample peak at 0.5s
channelData[24000] = 1.0; // 0dBFS peak

// Play through limiter
const source = audioContext.createBufferSource();
source.buffer = buffer;
source.connect(limiterNode).connect(audioContext.destination);
source.start();

// Monitor gain reduction meter
// Should start BEFORE the peak hits (5ms early)
```

---

### **Test 3: Benchmark CPU Usage**

```javascript
// Measure performance
const startTime = performance.now();

// Process 10 seconds of audio
// ... (play audio through limiter)

const endTime = performance.now();
const cpuTime = endTime - startTime;

console.log(`CPU time: ${cpuTime}ms for 10s audio`);
console.log(`Real-time factor: ${cpuTime / 10000}x`);

// Should be < 0.1x (i.e., 1 second to process 10 seconds)
```

---

## 📊 **PERFORMANCE EXPECTATIONS**

| Feature | Without Oversampling | With 4x Oversampling |
|---------|---------------------|----------------------|
| **Latency** | 5ms | 5ms + oversampling delay (~1ms) |
| **CPU Usage** | ~5% | ~15-20% |
| **True Peak Accuracy** | ± 1.0 dB | ± 0.1 dB |
| **Inter-Sample Peaks** | ❌ Not detected | ✅ Detected |
| **Aliasing** | ⚠️ Possible | ✅ None |

---

## 🐛 **TROUBLESHOOTING**

### **Problem: WASM file not loading**

**Solution:**
```typescript
// Ensure WASM is served with correct MIME type
// In your dev server config:
{
  "mime": {
    "wasm": "application/wasm"
  }
}
```

---

### **Problem: No audio output**

**Solution:**
```javascript
// Check AudioWorklet registration
audioContext.audioWorklet.addModule('limiter-processor.js')
  .then(() => console.log('Loaded!'))
  .catch(err => console.error('Failed to load:', err));

// Verify node creation
const limiterNode = new AudioWorkletNode(audioContext, 'limiter');
console.log('Node created:', limiterNode);
```

---

### **Problem: High CPU usage**

**Solution:**
```faust
// Reduce oversampling from 4x to 2x
oversample_2x(dsp) = os.oversample(1, dsp); // 2^1 = 2x

// OR disable oversampling for debugging
process = limiter_stereo_linked; // No oversample wrapper
```

---

## 📦 **BUILD SCRIPT (Automated)**

Create `/scripts/build-dsp.sh`:

```bash
#!/bin/bash

# Build all Faust DSP files to WASM

echo "🔧 Building Faust DSP to WASM..."

# Navigate to DSP directory
cd src/dsp

# Compile limiter
echo "📦 Compiling limiter.dsp..."
faust2wasm -worklet limiter.dsp

# Move files to worklets directory
echo "📂 Moving files..."
mv limiter-processor.js ../app/worklets/
mv limiter.wasm ../app/worklets/

echo "✅ Build complete!"
echo "📍 Files generated:"
echo "   - src/app/worklets/limiter-processor.js"
echo "   - src/app/worklets/limiter.wasm"
```

**Make executable:**
```bash
chmod +x scripts/build-dsp.sh
```

**Run:**
```bash
./scripts/build-dsp.sh
```

---

## 🎯 **NEXT STEPS**

1. ✅ Compile Faust to WASM
2. ✅ Integrate into audio chain
3. ✅ Connect parameters (threshold, ratio, attack, release)
4. ✅ Read meters (true peak, gain reduction)
5. ✅ Build UI components (GR meter, ISP indicator)
6. ✅ Test with real tracks
7. ✅ Benchmark performance

---

## 📚 **RESOURCES**

- **Faust Documentation**: https://faust.grame.fr/
- **faust2wasm Guide**: https://faust.grame.fr/doc/manual/index.html#compiling-for-the-web
- **ITU-R BS.1770-4 Standard**: https://www.itu.int/rec/R-REC-BS.1770/en
- **AudioWorklet API**: https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet

---

**READY TO BUILD REFERENCE-GRADE DSP! 🚀⚡🎛️**
