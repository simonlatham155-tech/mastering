export interface BroadSpectralBalance {
  bass: number;
  mids: number;
  highs: number;
}

export interface DetailedSpectralBalance {
  sub: number;
  bass: number;
  lowMid: number;
  mid: number;
  presence: number;
  brilliance: number;
  air: number;
}

export interface FFTSpectralBalanceResult {
  broad: BroadSpectralBalance;
  detailed: DetailedSpectralBalance;
  windowsAnalyzed: number;
}

const FFT_SIZE = 4096;
const MAX_WINDOWS = 24;

function isPowerOfTwo(value: number): boolean {
  return value > 1 && (value & (value - 1)) === 0;
}

/** In-place iterative radix-2 Cooley-Tukey FFT. */
export function fftInPlace(real: Float64Array, imag: Float64Array): void {
  const n = real.length;
  if (imag.length !== n || !isPowerOfTwo(n)) {
    throw new Error('FFT input length must be equal power-of-two arrays');
  }

  // Bit-reversal permutation.
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = real[i];
      real[i] = real[j];
      real[j] = tr;
      const ti = imag[i];
      imag[i] = imag[j];
      imag[j] = ti;
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const angle = (-2 * Math.PI) / len;
    const wLenR = Math.cos(angle);
    const wLenI = Math.sin(angle);

    for (let i = 0; i < n; i += len) {
      let wr = 1;
      let wi = 0;
      const half = len >> 1;

      for (let j = 0; j < half; j++) {
        const uR = real[i + j];
        const uI = imag[i + j];
        const vIndex = i + j + half;
        const vR = real[vIndex] * wr - imag[vIndex] * wi;
        const vI = real[vIndex] * wi + imag[vIndex] * wr;

        real[i + j] = uR + vR;
        imag[i + j] = uI + vI;
        real[vIndex] = uR - vR;
        imag[vIndex] = uI - vI;

        const nextWr = wr * wLenR - wi * wLenI;
        wi = wr * wLenI + wi * wLenR;
        wr = nextWr;
      }
    }
  }
}

function hann(index: number, size: number): number {
  return 0.5 * (1 - Math.cos((2 * Math.PI * index) / (size - 1)));
}

function frequencyBand(freq: number): keyof DetailedSpectralBalance | null {
  if (freq >= 20 && freq < 60) return 'sub';
  if (freq < 200) return 'bass';
  if (freq < 500) return 'lowMid';
  if (freq < 2000) return 'mid';
  if (freq < 4000) return 'presence';
  if (freq < 8000) return 'brilliance';
  if (freq <= 20000) return 'air';
  return null;
}

function normalizePercentages(values: number[]): number[] {
  const total = values.reduce((sum, value) => sum + Math.max(0, value), 0);
  if (!(total > 0) || !Number.isFinite(total)) {
    return values.map(() => 0);
  }
  return values.map((value) => (Math.max(0, value) / total) * 100);
}

function selectWindowStarts(length: number, size: number, maxWindows: number): number[] {
  if (length < size) return [0];
  const available = length - size;
  const count = Math.max(1, Math.min(maxWindows, Math.floor(length / size)));
  if (count === 1) return [Math.floor(available / 2)];

  const starts: number[] = [];
  for (let i = 0; i < count; i++) {
    starts.push(Math.floor((available * i) / (count - 1)));
  }
  return starts;
}

/**
 * Frequency-bin energy analysis for mastering decisions.
 *
 * Windows are distributed across the supplied analysis buffer rather than only
 * sampling the intro. Stereo is averaged to mono per sample so one channel
 * cannot dominate the genre decision.
 */
export function analyzeFFTSpectralBalance(audioBuffer: AudioBuffer): FFTSpectralBalanceResult {
  const sampleRate = audioBuffer.sampleRate;
  const channels = Math.max(1, Math.min(2, audioBuffer.numberOfChannels));
  const length = audioBuffer.length;
  const size = Math.min(FFT_SIZE, 1 << Math.floor(Math.log2(Math.max(2, length))));

  if (size < 256 || length === 0) {
    return {
      broad: { bass: 0, mids: 0, highs: 0 },
      detailed: {
        sub: 0,
        bass: 0,
        lowMid: 0,
        mid: 0,
        presence: 0,
        brilliance: 0,
        air: 0,
      },
      windowsAnalyzed: 0,
    };
  }

  const starts = selectWindowStarts(length, size, MAX_WINDOWS);
  const energy: DetailedSpectralBalance = {
    sub: 0,
    bass: 0,
    lowMid: 0,
    mid: 0,
    presence: 0,
    brilliance: 0,
    air: 0,
  };

  for (const start of starts) {
    const real = new Float64Array(size);
    const imag = new Float64Array(size);

    for (let i = 0; i < size; i++) {
      let sample = 0;
      for (let ch = 0; ch < channels; ch++) {
        sample += audioBuffer.getChannelData(ch)[start + i] ?? 0;
      }
      sample /= channels;
      real[i] = sample * hann(i, size);
    }

    fftInPlace(real, imag);

    const nyquistBin = size >> 1;
    for (let bin = 1; bin <= nyquistBin; bin++) {
      const freq = (bin * sampleRate) / size;
      const band = frequencyBand(freq);
      if (!band) continue;
      const power = real[bin] * real[bin] + imag[bin] * imag[bin];
      if (Number.isFinite(power)) energy[band] += power;
    }
  }

  const keys: Array<keyof DetailedSpectralBalance> = [
    'sub',
    'bass',
    'lowMid',
    'mid',
    'presence',
    'brilliance',
    'air',
  ];
  const normalized = normalizePercentages(keys.map((key) => energy[key]));
  const detailed = Object.fromEntries(
    keys.map((key, index) => [key, normalized[index]])
  ) as unknown as DetailedSpectralBalance;

  // Broad groups use the same frequency-bin energy. `bass` means <200 Hz;
  // mids 200 Hz–4 kHz; highs >4 kHz up to 20 kHz / Nyquist.
  const broadValues = [
    energy.sub + energy.bass,
    energy.lowMid + energy.mid + energy.presence,
    energy.brilliance + energy.air,
  ];
  const [bass, mids, highs] = normalizePercentages(broadValues);

  return {
    broad: { bass, mids, highs },
    detailed,
    windowsAnalyzed: starts.length,
  };
}
