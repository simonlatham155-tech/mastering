/**
 * TENSORFLOW.JS INTEGRATION (READY FOR ML TRAINING)
 * 
 * This service provides the infrastructure for ML-based mastering.
 * The model controls the WASM compressor/EQ knobs, not the audio itself.
 * 
 * WORKFLOW:
 * 1. Input: FFT spectral data (10 bands + RMS/peak)
 * 2. Model: Predicts optimal compressor/EQ settings
 * 3. Output: Settings sent to WASM processors
 * 
 * TRAINING DATA:
 * - Collect pairs of (before, after) from professional masters
 * - Extract spectral profiles + settings
 * - Train regression model to predict settings
 */

import * as tf from '@tensorflow/tfjs';
import { SpectralProfile } from './spectral-analyzer';
import { AdvancedCompressorSettings } from '../components/advanced-compressor-controls';
import { MatchingDelta } from './spectral-analyzer';

export interface MLPrediction {
  compressorSettings: AdvancedCompressorSettings;
  eqSettings: MatchingDelta;
  confidence: number; // 0-1
}

export class MasteringMLEngine {
  private model: tf.LayersModel | null = null;
  private isLoaded: boolean = false;
  
  /**
   * Load the pre-trained model
   * 
   * MODEL ARCHITECTURE (for your ML engineers):
   * - Input: 12 features (10 bands + RMS + peak)
   * - Hidden: 2 dense layers (64 units each, ReLU)
   * - Output: 19 features (9 compressor params + 10 EQ bands)
   * - Loss: MSE (mean squared error)
   * - Optimizer: Adam (lr=0.001)
   */
  async loadModel(modelPath: string = '/models/mastering-v1/model.json'): Promise<void> {
    try {
      console.log('🧠 Loading ML mastering model...');
      
      // Load model from disk (once trained)
      // this.model = await tf.loadLayersModel(modelPath);
      
      // FOR NOW: Create a dummy model structure
      // Replace this with actual trained model once you have training data
      this.model = this.createDummyModel();
      
      this.isLoaded = true;
      console.log('✅ ML model loaded successfully');
      
    } catch (error) {
      console.error('❌ Failed to load ML model:', error);
      console.log('💡 Using rule-based fallback (no ML)');
      this.isLoaded = false;
    }
  }
  
  /**
   * Create dummy model (for development)
   * Replace with real trained model in production
   */
  private createDummyModel(): tf.LayersModel {
    const model = tf.sequential();
    
    // Input layer: 12 features
    model.add(tf.layers.dense({
      inputShape: [12],
      units: 64,
      activation: 'relu',
      name: 'hidden1'
    }));
    
    // Hidden layer
    model.add(tf.layers.dense({
      units: 64,
      activation: 'relu',
      name: 'hidden2'
    }));
    
    // Output layer: 19 features
    model.add(tf.layers.dense({
      units: 19,
      activation: 'linear',
      name: 'output'
    }));
    
    model.compile({
      optimizer: 'adam',
      loss: 'meanSquaredError'
    });
    
    return model;
  }
  
  /**
   * Predict optimal settings for a given spectral profile
   */
  async predict(profile: SpectralProfile, genre: string): Promise<MLPrediction> {
    if (!this.isLoaded || !this.model) {
      // Fallback to rule-based
      return this.ruleBasedPrediction(profile, genre);
    }
    
    try {
      // Prepare input tensor
      const input = this.prepareInput(profile);
      
      // Run inference
      const output = this.model.predict(input) as tf.Tensor;
      const outputData = await output.data();
      
      // Parse output
      const prediction = this.parseOutput(outputData);
      
      // Cleanup tensors
      input.dispose();
      output.dispose();
      
      return prediction;
      
    } catch (error) {
      console.error('❌ ML prediction failed:', error);
      return this.ruleBasedPrediction(profile, genre);
    }
  }
  
  /**
   * Prepare input tensor from spectral profile
   */
  private prepareInput(profile: SpectralProfile): tf.Tensor {
    const features = [
      // 10 frequency bands (normalized to -1 to 1)
      this.normalize(profile.bands.sub, -60, 0),
      this.normalize(profile.bands.low, -60, 0),
      this.normalize(profile.bands.lowMid, -60, 0),
      this.normalize(profile.bands.mid, -60, 0),
      this.normalize(profile.bands.upperMid, -60, 0),
      this.normalize(profile.bands.presence, -60, 0),
      this.normalize(profile.bands.brilliance, -60, 0),
      this.normalize(profile.bands.air, -60, 0),
      this.normalize(profile.bands.ultraHigh, -60, 0),
      this.normalize(profile.bands.top, -60, 0),
      
      // Overall levels
      this.normalize(profile.rmsLevel, -60, 0),
      this.normalize(profile.peakLevel, -60, 0)
    ];
    
    return tf.tensor2d([features]);
  }
  
  /**
   * Normalize value to -1 to 1 range
   */
  private normalize(value: number, min: number, max: number): number {
    return 2 * ((value - min) / (max - min)) - 1;
  }
  
  /**
   * Denormalize value from -1 to 1 range
   */
  private denormalize(value: number, min: number, max: number): number {
    return ((value + 1) / 2) * (max - min) + min;
  }
  
  /**
   * Parse output tensor into settings
   */
  private parseOutput(data: Float32Array | Int32Array | Uint8Array): MLPrediction {
    // Output indices:
    // 0-8: Compressor settings (9 params)
    // 9-18: EQ bands (10 bands)
    
    const compressorSettings: AdvancedCompressorSettings = {
      threshold: this.denormalize(data[0], -60, 0),
      ratio: this.denormalize(data[1], 1, 20),
      knee: this.denormalize(data[2], 0, 12),
      attack: this.denormalize(data[3], 0.1, 100),
      release: this.denormalize(data[4], 10, 1000),
      makeupGain: this.denormalize(data[5], 0, 24),
      detectionMode: data[6] > 0 ? 'rms' : 'peak',
      sidechainHPF: data[7] > 0,
      hpfCutoff: this.denormalize(data[8], 20, 200)
    };
    
    const eqSettings: MatchingDelta = {
      bands: {
        sub: this.denormalize(data[9], -12, 12),
        low: this.denormalize(data[10], -12, 12),
        lowMid: this.denormalize(data[11], -12, 12),
        mid: this.denormalize(data[12], -12, 12),
        upperMid: this.denormalize(data[13], -12, 12),
        presence: this.denormalize(data[14], -12, 12),
        brilliance: this.denormalize(data[15], -12, 12),
        air: this.denormalize(data[16], -12, 12),
        ultraHigh: this.denormalize(data[17], -12, 12),
        top: this.denormalize(data[18], -12, 12)
      },
      autoGain: 0 // Calculated later
    };
    
    // Calculate confidence (dummy for now)
    const confidence = 0.85;
    
    return {
      compressorSettings,
      eqSettings,
      confidence
    };
  }
  
  /**
   * Rule-based prediction (fallback when ML not available)
   */
  private ruleBasedPrediction(profile: SpectralProfile, genre: string): MLPrediction {
    // Simple heuristics based on genre
    let compressorSettings: AdvancedCompressorSettings;
    
    if (genre.includes('techno') || genre.includes('dubstep')) {
      // Aggressive compression for club music
      compressorSettings = {
        threshold: -12,
        ratio: 6.0,
        knee: 3.0,
        attack: 1,
        release: 80,
        makeupGain: 6,
        detectionMode: 'rms',
        sidechainHPF: true,
        hpfCutoff: 80
      };
    } else if (genre.includes('cinematic') || genre.includes('ambient')) {
      // Gentle compression for dynamic content
      compressorSettings = {
        threshold: -24,
        ratio: 2.0,
        knee: 6.0,
        attack: 30,
        release: 400,
        makeupGain: 3,
        detectionMode: 'rms',
        sidechainHPF: false,
        hpfCutoff: 80
      };
    } else {
      // Moderate compression for general content
      compressorSettings = {
        threshold: -18,
        ratio: 4.0,
        knee: 6.0,
        attack: 5,
        release: 150,
        makeupGain: 4,
        detectionMode: 'rms',
        sidechainHPF: true,
        hpfCutoff: 80
      };
    }
    
    // EQ based on spectral analysis
    const eqSettings: MatchingDelta = {
      bands: {
        sub: this.calculateEQAdjustment(profile.bands.sub, -40),
        low: this.calculateEQAdjustment(profile.bands.low, -35),
        lowMid: this.calculateEQAdjustment(profile.bands.lowMid, -32),
        mid: this.calculateEQAdjustment(profile.bands.mid, -30),
        upperMid: this.calculateEQAdjustment(profile.bands.upperMid, -28),
        presence: this.calculateEQAdjustment(profile.bands.presence, -26),
        brilliance: this.calculateEQAdjustment(profile.bands.brilliance, -28),
        air: this.calculateEQAdjustment(profile.bands.air, -30),
        ultraHigh: this.calculateEQAdjustment(profile.bands.ultraHigh, -32),
        top: this.calculateEQAdjustment(profile.bands.top, -35)
      },
      autoGain: 0
    };
    
    return {
      compressorSettings,
      eqSettings,
      confidence: 0.6 // Lower confidence for rule-based
    };
  }
  
  /**
   * Calculate EQ adjustment based on current level vs target
   */
  private calculateEQAdjustment(current: number, target: number): number {
    const diff = target - current;
    // Limit adjustment to ±6dB
    return Math.max(-6, Math.min(6, diff));
  }
  
  /**
   * Train the model (for your ML engineers)
   * 
   * TRAINING WORKFLOW:
   * 1. Collect dataset:
   *    - Before/after pairs from pro masters
   *    - Extract spectral profiles (input)
   *    - Extract settings used (output)
   * 
   * 2. Prepare data:
   *    - Normalize all features to -1 to 1
   *    - Split into train/validation (80/20)
   * 
   * 3. Train:
   *    - Batch size: 32
   *    - Epochs: 100-200
   *    - Early stopping on validation loss
   * 
   * 4. Export:
   *    - Save to /public/models/mastering-v1/
   *    - Include model.json + weights
   */
  async train(
    trainingData: Array<{ input: SpectralProfile; output: MLPrediction }>,
    validationSplit: number = 0.2
  ): Promise<void> {
    if (!this.model) {
      throw new Error('Model not initialized');
    }
    
    console.log('🏋️ Training ML mastering model...');
    console.log(`📊 Training samples: ${trainingData.length}`);
    
    // Prepare tensors
    const inputs: number[][] = [];
    const outputs: number[][] = [];
    
    trainingData.forEach(sample => {
      // Input features
      const inputFeatures = [
        sample.input.bands.sub,
        sample.input.bands.low,
        sample.input.bands.lowMid,
        sample.input.bands.mid,
        sample.input.bands.upperMid,
        sample.input.bands.presence,
        sample.input.bands.brilliance,
        sample.input.bands.air,
        sample.input.bands.ultraHigh,
        sample.input.bands.top,
        sample.input.rmsLevel,
        sample.input.peakLevel
      ].map(v => this.normalize(v, -60, 0));
      
      // Output features
      const outputFeatures = [
        this.normalize(sample.output.compressorSettings.threshold, -60, 0),
        this.normalize(sample.output.compressorSettings.ratio, 1, 20),
        this.normalize(sample.output.compressorSettings.knee, 0, 12),
        this.normalize(sample.output.compressorSettings.attack, 0.1, 100),
        this.normalize(sample.output.compressorSettings.release, 10, 1000),
        this.normalize(sample.output.compressorSettings.makeupGain, 0, 24),
        sample.output.compressorSettings.detectionMode === 'rms' ? 1 : -1,
        sample.output.compressorSettings.sidechainHPF ? 1 : -1,
        this.normalize(sample.output.compressorSettings.hpfCutoff, 20, 200),
        ...Object.values(sample.output.eqSettings.bands).map(v => this.normalize(v, -12, 12))
      ];
      
      inputs.push(inputFeatures);
      outputs.push(outputFeatures);
    });
    
    const xs = tf.tensor2d(inputs);
    const ys = tf.tensor2d(outputs);
    
    // Train
    await this.model.fit(xs, ys, {
      epochs: 100,
      batchSize: 32,
      validationSplit: validationSplit,
      callbacks: {
        onEpochEnd: (epoch, logs) => {
          console.log(`Epoch ${epoch + 1}: loss = ${logs?.loss.toFixed(4)}, val_loss = ${logs?.val_loss?.toFixed(4)}`);
        }
      }
    });
    
    // Save model
    await this.model.save('localstorage://mastering-model');
    
    console.log('✅ Training complete!');
    
    // Cleanup
    xs.dispose();
    ys.dispose();
  }
}

// Singleton instance
export const masteringMLEngine = new MasteringMLEngine();
