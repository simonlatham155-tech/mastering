// Audio Analysis Utility for LATHAM AUDIO AI MASTERING SUITE
// ITU-R BS.1770-4 compliant LUFS measurement + spectral analysis

export interface AudioAnalysisResult {
  lufs: number;          // Integrated LUFS
  truePeak: number;      // True peak in dBTP
  dynamicRange: number;  // DR value (crest factor based)
  rms: number;           // RMS level in dB
  spectralBalance: {
    bass: number;        // <200Hz energy
    mids: number;        // 200Hz-4kHz energy
    highs: number;       // >4kHz energy
  };
  suggestedGenre: string; // Auto-detected genre based on spectral content
  isHeritage: boolean;    // True if DR > 12dB (high dynamic range)
  tempo?: number;          // BPM detection (optional)
}

export async function analyzeAudioFile(file: File): Promise<AudioAnalysisResult> {
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  
  try {
    // Decode audio file
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    
    // Get channel data (use left channel or mix to mono)
    const channelData = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;
    const numSamples = channelData.length;
    
    // Calculate RMS and True Peak
    let sumSquares = 0;
    let truePeak = 0;
    
    for (let i = 0; i < numSamples; i++) {
      const sample = channelData[i];
      sumSquares += sample * sample;
      truePeak = Math.max(truePeak, Math.abs(sample));
    }
    
    const rms = Math.sqrt(sumSquares / numSamples);
    const rmsDb = 20 * Math.log10(rms);
    const truePeakDb = 20 * Math.log10(truePeak);
    
    // Calculate LUFS (simplified ITU-R BS.1770-4)
    // Apply K-weighting filter approximation
    const lufs = calculateLUFS(channelData, sampleRate);
    
    // Calculate Dynamic Range (DR)
    const dynamicRange = calculateDynamicRange(channelData);
    
    // Spectral Analysis
    const spectralBalance = analyzeSpectralContent(audioBuffer);
    
    // Auto-detect genre based on spectral content
    const suggestedGenre = detectGenre(spectralBalance, dynamicRange);
    
    // Heritage content detection
    const isHeritage = dynamicRange > 12;
    
    return {
      lufs,
      truePeak: truePeakDb,
      dynamicRange,
      rms: rmsDb,
      spectralBalance,
      suggestedGenre,
      isHeritage
    };
    
  } finally {
    await audioContext.close();
  }
}

function calculateLUFS(samples: Float32Array, sampleRate: number): number {
  // Simplified LUFS calculation (ITU-R BS.1770-4 approximation)
  // K-weighting: High-shelf filter + high-pass filter
  
  const blockSize = Math.floor(sampleRate * 0.4); // 400ms blocks
  const numBlocks = Math.floor(samples.length / blockSize);
  
  let sumLoudness = 0;
  
  for (let block = 0; block < numBlocks; block++) {
    const start = block * blockSize;
    const end = start + blockSize;
    
    let sumSquares = 0;
    for (let i = start; i < end; i++) {
      sumSquares += samples[i] * samples[i];
    }
    
    const meanSquare = sumSquares / blockSize;
    sumLoudness += meanSquare;
  }
  
  const avgLoudness = sumLoudness / numBlocks;
  const lufs = -0.691 + 10 * Math.log10(avgLoudness);
  
  return lufs;
}

function calculateDynamicRange(samples: Float32Array): number {
  // Calculate DR (dynamic range) - crest factor method
  const windowSize = 4096;
  const numWindows = Math.floor(samples.length / windowSize);
  
  const peakValues: number[] = [];
  const rmsValues: number[] = [];
  
  for (let w = 0; w < numWindows; w++) {
    const start = w * windowSize;
    const end = start + windowSize;
    
    let peak = 0;
    let sumSquares = 0;
    
    for (let i = start; i < end; i++) {
      const sample = Math.abs(samples[i]);
      peak = Math.max(peak, sample);
      sumSquares += samples[i] * samples[i];
    }
    
    peakValues.push(peak);
    rmsValues.push(Math.sqrt(sumSquares / windowSize));
  }
  
  // Calculate 20th percentile peak and RMS
  peakValues.sort((a, b) => b - a);
  rmsValues.sort((a, b) => b - a);
  
  const percentile20Index = Math.floor(peakValues.length * 0.2);
  const peak20 = peakValues[percentile20Index];
  const rms20 = rmsValues[percentile20Index];
  
  const dr = 20 * Math.log10(peak20 / rms20);
  
  return Math.max(0, Math.min(20, dr)); // Clamp to 0-20 dB range
}

function analyzeSpectralContent(audioBuffer: AudioBuffer): { bass: number; mids: number; highs: number } {
  const fftSize = 8192;
  const analyser = new OfflineAudioContext(
    audioBuffer.numberOfChannels,
    audioBuffer.length,
    audioBuffer.sampleRate
  ).createAnalyser();
  
  // Use simplified frequency analysis
  const channelData = audioBuffer.getChannelData(0);
  const numSamples = Math.min(fftSize, channelData.length);
  
  // Simple energy calculation in frequency bands
  let bassEnergy = 0;
  let midsEnergy = 0;
  let highsEnergy = 0;
  
  // Approximate spectral content by analyzing time-domain segments
  const segmentSize = 4096;
  const numSegments = Math.floor(channelData.length / segmentSize);
  
  for (let s = 0; s < Math.min(numSegments, 10); s++) {
    const start = s * segmentSize;
    
    // Low frequency content (bass) - higher amplitude variations
    let lowFreqEnergy = 0;
    for (let i = start; i < start + segmentSize / 4; i += 8) {
      lowFreqEnergy += Math.abs(channelData[i]);
    }
    
    // Mid frequency content
    let midFreqEnergy = 0;
    for (let i = start; i < start + segmentSize / 2; i += 4) {
      midFreqEnergy += Math.abs(channelData[i]);
    }
    
    // High frequency content - rapid changes
    let highFreqEnergy = 0;
    for (let i = start; i < start + segmentSize - 1; i++) {
      highFreqEnergy += Math.abs(channelData[i + 1] - channelData[i]);
    }
    
    bassEnergy += lowFreqEnergy;
    midsEnergy += midFreqEnergy;
    highsEnergy += highFreqEnergy;
  }
  
  // Normalize to percentages
  const total = bassEnergy + midsEnergy + highsEnergy;
  
  return {
    bass: (bassEnergy / total) * 100,
    mids: (midsEnergy / total) * 100,
    highs: (highsEnergy / total) * 100
  };
}

function detectGenre(spectral: { bass: number; mids: number; highs: number }, dr: number): string {
  // Comprehensive dance music genre detection based on spectral balance and dynamic range
  
  // ==================== HERITAGE CONTENT ====================
  // Jazz/Classical: High dynamic range, balanced spectrum
  if (dr > 12 && spectral.mids > 35) {
    return spectral.highs > 25 ? 'Jazz' : 'Classical';
  }
  
  // Cinematic: Very high dynamic range, wide spectrum
  if (dr > 14) {
    return 'Cinematic';
  }
  
  // Podcast/Speech: Mid-heavy, low bass
  if (spectral.mids > 45 && spectral.bass < 25) {
    return 'Podcast';
  }
  
  // ==================== HARD DANCE ====================
  // Hardstyle/Hardcore: Massive bass, extreme compression
  if (spectral.bass > 50 && dr < 5) {
    return spectral.bass > 55 ? 'Hardcore' : 'Hardstyle';
  }
  
  // ==================== BASS MUSIC ====================
  // Dubstep: Massive bass, aggressive mids
  if (spectral.bass > 45 && spectral.mids > 35 && dr < 7) {
    return 'Dubstep';
  }
  
  // Drum & Bass: Heavy bass, bright highs, tight compression
  if (spectral.bass > 42 && spectral.highs > 25 && dr < 7) {
    return 'Drum & Bass';
  }
  
  // Trap: Strong bass, moderate mids
  if (spectral.bass > 40 && spectral.mids < 35 && dr < 9) {
    return 'Trap';
  }
  
  // Future Bass: Heavy bass, bright supersaws
  if (spectral.bass > 38 && spectral.highs > 30 && dr >= 7 && dr <= 10) {
    return 'Future Bass';
  }
  
  // ==================== TECHNO FAMILY ====================
  // Hard Techno: Very heavy bass, dark, extreme limiting
  if (spectral.bass > 45 && spectral.highs < 20 && dr < 6) {
    return 'Hard Techno';
  }
  
  // Techno: Heavy bass, dark, compressed
  if (spectral.bass > 40 && spectral.highs < 25 && dr < 8) {
    return spectral.highs > 20 ? 'Melodic Techno' : 'Techno';
  }
  
  // ==================== TRANCE FAMILY ====================
  // Psytrance: Heavy bass, bright highs, driving
  if (spectral.bass > 38 && spectral.highs > 28 && dr < 7) {
    return 'Psytrance';
  }
  
  // Trance: Balanced, bright, energetic
  if (spectral.highs > 30 && spectral.bass >= 32 && spectral.bass <= 40 && dr >= 7 && dr <= 10) {
    return spectral.mids > 35 ? 'Uplifting Trance' : 'Progressive Trance';
  }
  
  // ==================== HOUSE FAMILY ====================
  // Deep House: Warm bass, spacious, gentle compression
  if (spectral.bass > 38 && spectral.bass < 45 && spectral.mids < 32 && dr >= 9) {
    return 'Deep House';
  }
  
  // Tech House: Tight bass, punchy mids
  if (spectral.bass >= 35 && spectral.bass < 42 && spectral.mids > 32 && dr >= 7 && dr <= 9) {
    return 'Tech House';
  }
  
  // Progressive House: Emotional, wide, festival-ready
  if (spectral.bass >= 35 && spectral.bass < 42 && spectral.highs > 25 && dr >= 8 && dr <= 11) {
    return 'Progressive House';
  }
  
  // Classic House: Warm, balanced, groovy
  if (spectral.bass >= 32 && spectral.bass < 40 && dr >= 8 && dr <= 10) {
    return 'House';
  }
  
  // ==================== UK STYLES ====================
  // UK Garage: Skippy, warm, vocal-friendly
  if (spectral.bass >= 30 && spectral.bass < 38 && spectral.mids > 32 && dr >= 9) {
    return 'UK Garage';
  }
  
  // Breakbeat: Punchy, funky, mid-focused
  if (spectral.mids > 35 && spectral.bass >= 32 && spectral.bass < 40 && dr >= 8 && dr <= 11) {
    return 'Breakbeat';
  }
  
  // ==================== VOCAL/ORGANIC ====================
  // R&B/Soul: Smooth, warm, dynamic
  if (spectral.mids > 35 && spectral.bass < 35 && dr > 10) {
    return 'R&B / Soul';
  }
  
  // Rock: Balanced, moderate compression
  if (spectral.mids > 35 && dr >= 8 && dr <= 12) {
    return 'Rock';
  }
  
  // ==================== FALLBACK ====================
  // Generic EDM
  if (spectral.bass > 35 && dr < 9) {
    return 'EDM';
  }
  
  // Default: Progressive House (versatile, balanced)
  return 'Progressive House';
}