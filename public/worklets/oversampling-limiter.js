/**
 * 4x OVERSAMPLING TRUE PEAK LIMITER
 * Polyphase FIR Filter Implementation
 *
 * PATCH 2026-06-07: Per-channel FIR/limiter state (fixes stereo bass buzz/rattle)
 * and corrected FIR history buffers to use filtered samples across blocks.
 */

class OversamplingLimiter extends AudioWorkletProcessor {
  constructor() {
    super();

    this.FIR_COEFFS = [
      -0.0012, -0.0025,  0.0000,  0.0084,  0.0151,  0.0000, -0.0382, -0.0654,
       0.0000,  0.1542,  0.2851,  0.3000,  0.2851,  0.1542,  0.0000, -0.0654,
      -0.0382,  0.0000,  0.0151,  0.0084,  0.0000, -0.0025, -0.0012
    ];

    this.FIR_LENGTH = this.FIR_COEFFS.length;

    this.threshold = -0.3;
    this.ceiling = -0.3;
    this.attack = 0.001;
    this.release = 0.1;
    this.lookaheadMS = 5;

    this.thresholdLinear = this.dbToLinear(this.threshold);
    this.ceilingLinear = this.dbToLinear(this.ceiling);

    this.attackCoeff = 0;
    this.releaseCoeff = 0;

    this.sampleRate = sampleRate;
    this.oversampledRate = sampleRate * 4;
    this.lookaheadSamples = Math.max(1, Math.floor((this.lookaheadMS / 1000) * this.oversampledRate));

    // Per-channel DSP state — stereo channels must not share FIR/limiter memory
    this.channelState = [];

    this.truePeakDBTP = -Infinity;
    this.digitalPeakDB = -Infinity;
    this.gainReductionDB = 0;
    this.frameCount = 0;
    this.meterUpdateInterval = Math.floor(sampleRate * 0.05);

    this.hqMode = true;
    this.monitorOnly = false;

    this.port.onmessage = (event) => {
      const { type, data } = event.data;

      if (type === 'setParameters') {
        if (data.threshold !== undefined) {
          this.threshold = data.threshold;
          this.thresholdLinear = this.dbToLinear(data.threshold);
        }
        if (data.ceiling !== undefined) {
          this.ceiling = data.ceiling;
          this.ceilingLinear = this.dbToLinear(data.ceiling);
        }
        if (data.attack !== undefined) {
          this.attack = data.attack;
        }
        if (data.release !== undefined) {
          this.release = data.release;
        }
        if (data.hqMode !== undefined) {
          this.hqMode = data.hqMode;
        }
        if (data.monitorOnly !== undefined) {
          this.monitorOnly = data.monitorOnly;
        }
        if (data.attack !== undefined || data.release !== undefined) {
          this.updateEnvelopeCoefficients();
        }
      }
    };

    this.updateEnvelopeCoefficients();
  }

  createChannelState() {
    return {
      upsampleBuffer: new Float32Array(this.FIR_LENGTH),
      downsampleBuffer: new Float32Array(this.FIR_LENGTH),
      delayBuffer: new Float32Array(this.lookaheadSamples),
      delayWriteIndex: 0,
      delayReadIndex: 0,
      envelope: 1.0,
    };
  }

  getChannelState(channel) {
    if (!this.channelState[channel]) {
      this.channelState[channel] = this.createChannelState();
    }
    return this.channelState[channel];
  }

  updateEnvelopeCoefficients() {
    this.attackCoeff = Math.exp(-1.0 / (this.attack * this.oversampledRate));
    this.releaseCoeff = Math.exp(-1.0 / (this.release * this.oversampledRate));
  }

  dbToLinear(db) {
    return Math.pow(10, db / 20);
  }

  linearToDb(linear) {
    return 20 * Math.log10(Math.max(linear, 1e-10));
  }

  upsample(input, state) {
    const inputLength = input.length;
    const outputLength = inputLength * 4;
    const stuffed = new Float32Array(outputLength);
    const filtered = new Float32Array(outputLength);

    for (let i = 0; i < inputLength; i++) {
      stuffed[i * 4] = input[i];
    }

    for (let i = 0; i < outputLength; i++) {
      let sum = 0;

      for (let j = 0; j < this.FIR_LENGTH; j++) {
        const inputIndex = i - j;
        if (inputIndex >= 0 && inputIndex < outputLength) {
          sum += stuffed[inputIndex] * this.FIR_COEFFS[j];
        } else if (inputIndex < 0) {
          const bufferIndex = this.FIR_LENGTH + inputIndex;
          if (bufferIndex >= 0) {
            sum += state.upsampleBuffer[bufferIndex] * this.FIR_COEFFS[j];
          }
        }
      }

      filtered[i] = sum * 4;
    }

    for (let i = 0; i < this.FIR_LENGTH; i++) {
      const sourceIndex = outputLength - this.FIR_LENGTH + i;
      if (sourceIndex >= 0) {
        state.upsampleBuffer[i] = filtered[sourceIndex];
      }
    }

    return filtered;
  }

  downsample(input, state) {
    const inputLength = input.length;
    const outputLength = Math.floor(inputLength / 4);
    const output = new Float32Array(outputLength);
    const filtered = new Float32Array(inputLength);

    for (let i = 0; i < inputLength; i++) {
      let sum = 0;

      for (let j = 0; j < this.FIR_LENGTH; j++) {
        const inputIndex = i - j;
        if (inputIndex >= 0 && inputIndex < inputLength) {
          sum += input[inputIndex] * this.FIR_COEFFS[j];
        } else if (inputIndex < 0) {
          const bufferIndex = this.FIR_LENGTH + inputIndex;
          if (bufferIndex >= 0) {
            sum += state.downsampleBuffer[bufferIndex] * this.FIR_COEFFS[j];
          }
        }
      }

      filtered[i] = sum;
    }

    for (let i = 0; i < outputLength; i++) {
      output[i] = filtered[i * 4];
    }

    for (let i = 0; i < this.FIR_LENGTH; i++) {
      const sourceIndex = inputLength - this.FIR_LENGTH + i;
      if (sourceIndex >= 0) {
        state.downsampleBuffer[i] = filtered[sourceIndex];
      }
    }

    return output;
  }

  limitOversampled(input, state) {
    const length = input.length;
    const output = new Float32Array(length);
    let minEnvelope = 1.0;

    for (let i = 0; i < length; i++) {
      state.delayBuffer[state.delayWriteIndex] = input[i];
      state.delayWriteIndex = (state.delayWriteIndex + 1) % this.lookaheadSamples;

      const peak = Math.abs(input[i]);

      if (peak > this.dbToLinear(this.truePeakDBTP)) {
        this.truePeakDBTP = this.linearToDb(peak);
      }

      if (peak > this.ceilingLinear) {
        const targetGain = this.ceilingLinear / peak;
        state.envelope = targetGain + this.attackCoeff * (state.envelope - targetGain);
      } else {
        state.envelope = 1.0 + this.releaseCoeff * (state.envelope - 1.0);
      }

      state.envelope = Math.max(0, Math.min(1, state.envelope));
      minEnvelope = Math.min(minEnvelope, state.envelope);

      const delayed = state.delayBuffer[state.delayReadIndex];
      output[i] = delayed * state.envelope;
      state.delayReadIndex = (state.delayReadIndex + 1) % this.lookaheadSamples;

      if (Math.abs(output[i]) > this.ceilingLinear) {
        output[i] = Math.sign(output[i]) * this.ceilingLinear;
      }
    }

    this.gainReductionDB = Math.min(this.gainReductionDB, this.linearToDb(minEnvelope));

    return output;
  }

  limitBasic(input) {
    const length = input.length;
    const output = new Float32Array(length);

    for (let i = 0; i < length; i++) {
      const peak = Math.abs(input[i]);

      if (peak > this.dbToLinear(this.digitalPeakDB)) {
        this.digitalPeakDB = this.linearToDb(peak);
      }

      output[i] = Math.max(-this.ceilingLinear, Math.min(this.ceilingLinear, input[i]));
    }

    return output;
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];

    if (!input || input.length === 0) return true;

    this.gainReductionDB = 0;

    for (let channel = 0; channel < input.length; channel++) {
      const inputChannel = input[channel];
      const outputChannel = output[channel];
      const state = this.getChannelState(channel);

      if (this.monitorOnly) {
        outputChannel.set(inputChannel);

        for (let i = 0; i < inputChannel.length; i++) {
          const peak = Math.abs(inputChannel[i]);
          if (peak > this.dbToLinear(this.digitalPeakDB)) {
            this.digitalPeakDB = this.linearToDb(peak);
          }
        }

        if (this.hqMode) {
          const upsampled = this.upsample(inputChannel, state);
          for (let i = 0; i < upsampled.length; i++) {
            const peak = Math.abs(upsampled[i]);
            if (peak > this.dbToLinear(this.truePeakDBTP)) {
              this.truePeakDBTP = this.linearToDb(peak);
            }
          }
        } else {
          this.truePeakDBTP = this.digitalPeakDB;
        }

        const peakLinear = this.dbToLinear(this.truePeakDBTP);
        if (peakLinear > this.ceilingLinear && peakLinear > 0) {
          this.gainReductionDB = Math.min(
            this.gainReductionDB,
            this.linearToDb(this.ceilingLinear / peakLinear)
          );
        }

        continue;
      }

      if (this.hqMode) {
        const upsampled = this.upsample(inputChannel, state);
        const limited = this.limitOversampled(upsampled, state);
        const downsampled = this.downsample(limited, state);
        outputChannel.set(downsampled);
      } else {
        const limited = this.limitBasic(inputChannel);
        outputChannel.set(limited);
        this.truePeakDBTP = this.digitalPeakDB;
      }
    }

    this.frameCount += input[0].length;
    if (this.frameCount >= this.meterUpdateInterval) {
      this.sendMeterUpdate();
      this.frameCount = 0;
    }

    return true;
  }

  sendMeterUpdate() {
    this.port.postMessage({
      type: 'meter-update',
      data: {
        truePeakDBTP: this.truePeakDBTP,
        digitalPeakDB: this.digitalPeakDB,
        gainReductionDB: this.gainReductionDB,
        hqMode: this.hqMode,
        ispDifference: this.truePeakDBTP - this.digitalPeakDB
      }
    });

    this.truePeakDBTP *= 0.95;
    this.digitalPeakDB *= 0.95;
  }
}

registerProcessor('oversampling-limiter', OversamplingLimiter);
