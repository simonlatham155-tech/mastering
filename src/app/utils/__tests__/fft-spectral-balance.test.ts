import { describe, expect, it } from 'vitest';
import { analyzeFFTSpectralBalance, fftInPlace } from '../fft-spectral-balance';

function sineBuffer(frequency: number, sampleRate = 48000, seconds = 1): AudioBuffer {
  const length = Math.floor(sampleRate * seconds);
  const data = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    data[i] = 0.5 * Math.sin((2 * Math.PI * frequency * i) / sampleRate);
  }

  return {
    sampleRate,
    length,
    numberOfChannels: 1,
    getChannelData: () => data,
  } as unknown as AudioBuffer;
}

describe('FFT spectral balance', () => {
  it('places a 100 Hz sine in the bass region', () => {
    const result = analyzeFFTSpectralBalance(sineBuffer(100));
    expect(result.broad.bass).toBeGreaterThan(95);
    expect(result.broad.mids).toBeLessThan(5);
    expect(result.broad.highs).toBeLessThan(1);
  });

  it('places a 1 kHz sine in the mid region', () => {
    const result = analyzeFFTSpectralBalance(sineBuffer(1000));
    expect(result.broad.mids).toBeGreaterThan(95);
    expect(result.broad.bass).toBeLessThan(1);
    expect(result.broad.highs).toBeLessThan(5);
  });

  it('places an 8 kHz sine in the high region', () => {
    const result = analyzeFFTSpectralBalance(sineBuffer(8000));
    expect(result.broad.highs).toBeGreaterThan(95);
    expect(result.broad.bass).toBeLessThan(1);
    expect(result.broad.mids).toBeLessThan(5);
  });

  it('keeps broad percentages normalized', () => {
    const result = analyzeFFTSpectralBalance(sineBuffer(440));
    const total = result.broad.bass + result.broad.mids + result.broad.highs;
    expect(total).toBeCloseTo(100, 6);
  });

  it('computes the expected DC FFT for a constant signal', () => {
    const real = new Float64Array([1, 1, 1, 1, 1, 1, 1, 1]);
    const imag = new Float64Array(8);
    fftInPlace(real, imag);

    expect(real[0]).toBeCloseTo(8, 10);
    for (let i = 1; i < real.length; i++) {
      expect(Math.abs(real[i])).toBeLessThan(1e-10);
      expect(Math.abs(imag[i])).toBeLessThan(1e-10);
    }
  });
});
