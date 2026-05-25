import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Activity, Target } from 'lucide-react';
import type { GearProfileId } from './gear-selector';

interface SpectralAnalyzerProps {
  originalBuffer: AudioBuffer | null;
  processedBuffer: AudioBuffer | null;
  isProcessing: boolean;
  gearProfile: GearProfileId;
}

// Genre reference curves (target frequency response in dB)
const REFERENCE_CURVES: Record<string, { freq: number; db: number }[]> = {
  trance: [
    { freq: 20, db: -2 },
    { freq: 40, db: 0 },
    { freq: 60, db: 2 },      // Sub punch
    { freq: 100, db: 1 },
    { freq: 200, db: -1 },
    { freq: 500, db: -2 },
    { freq: 1000, db: 0 },
    { freq: 2000, db: 1 },
    { freq: 4000, db: 2 },    // Lead presence
    { freq: 8000, db: 3 },    // Air/shimmer
    { freq: 12000, db: 4 },
    { freq: 16000, db: 3 },
    { freq: 20000, db: 0 },
  ],
  techno: [
    { freq: 20, db: -1 },
    { freq: 40, db: 1 },
    { freq: 60, db: 3 },      // Kick weight
    { freq: 100, db: 2 },
    { freq: 200, db: 0 },
    { freq: 500, db: -1 },
    { freq: 1000, db: 0 },
    { freq: 2000, db: 0 },
    { freq: 4000, db: -1 },   // Less harsh
    { freq: 8000, db: 1 },
    { freq: 12000, db: 0 },
    { freq: 16000, db: -1 },
    { freq: 20000, db: -2 },
  ],
  house: [
    { freq: 20, db: 0 },
    { freq: 40, db: 1 },
    { freq: 60, db: 2 },
    { freq: 100, db: 1 },
    { freq: 200, db: 0 },
    { freq: 500, db: 0 },
    { freq: 1000, db: 1 },
    { freq: 2000, db: 2 },    // Vocal clarity
    { freq: 4000, db: 2 },
    { freq: 8000, db: 3 },
    { freq: 12000, db: 2 },
    { freq: 16000, db: 1 },
    { freq: 20000, db: 0 },
  ],
  rnb: [
    { freq: 20, db: -2 },
    { freq: 40, db: 0 },
    { freq: 60, db: 1 },
    { freq: 100, db: 2 },     // Bass warmth
    { freq: 200, db: 1 },
    { freq: 500, db: 0 },
    { freq: 1000, db: 1 },
    { freq: 2000, db: 3 },    // Vocal presence
    { freq: 4000, db: 2 },
    { freq: 8000, db: 2 },
    { freq: 12000, db: 1 },
    { freq: 16000, db: 0 },
    { freq: 20000, db: -1 },
  ],
  realprog: [
    { freq: 20, db: -1 },
    { freq: 40, db: 0 },
    { freq: 60, db: 1 },
    { freq: 100, db: 1 },
    { freq: 200, db: 0 },
    { freq: 500, db: 0 },
    { freq: 1000, db: 1 },
    { freq: 2000, db: 2 },
    { freq: 4000, db: 3 },    // Melodic brightness
    { freq: 8000, db: 4 },
    { freq: 12000, db: 3 },
    { freq: 16000, db: 2 },
    { freq: 20000, db: 1 },
  ],
  modernprog: [
    { freq: 20, db: 0 },
    { freq: 40, db: 1 },
    { freq: 60, db: 2 },
    { freq: 100, db: 1 },
    { freq: 200, db: 0 },
    { freq: 500, db: 0 },
    { freq: 1000, db: 1 },
    { freq: 2000, db: 2 },
    { freq: 4000, db: 3 },
    { freq: 8000, db: 4 },    // Modern air
    { freq: 12000, db: 5 },
    { freq: 16000, db: 4 },
    { freq: 20000, db: 2 },
  ],
  tape: [
    { freq: 20, db: -3 },
    { freq: 40, db: -1 },
    { freq: 60, db: 1 },
    { freq: 100, db: 2 },     // Vintage warmth
    { freq: 200, db: 1 },
    { freq: 500, db: 0 },
    { freq: 1000, db: 0 },
    { freq: 2000, db: 1 },
    { freq: 4000, db: 1 },
    { freq: 8000, db: 0 },
    { freq: 12000, db: -1 },  // Tape roll-off
    { freq: 16000, db: -3 },
    { freq: 20000, db: -5 },
  ],
};

export function SpectralAnalyzer({ 
  originalBuffer, 
  processedBuffer, 
  isProcessing,
  gearProfile 
}: SpectralAnalyzerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [showReference, setShowReference] = useState(true);

  // Analyze frequency spectrum
  const analyzeSpectrum = (buffer: AudioBuffer): number[] => {
    const fftSize = 2048;
    const frequencyBinCount = fftSize / 2;
    const sampleRate = buffer.sampleRate;
    const data = buffer.getChannelData(0);

    // Simple FFT approximation (for visualization purposes)
    // In production, you'd use a proper FFT library
    const spectrum = new Array(frequencyBinCount).fill(0);

    // Sample-based frequency analysis
    const chunkSize = Math.floor(data.length / frequencyBinCount);
    for (let i = 0; i < frequencyBinCount; i++) {
      let sum = 0;
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, data.length);
      
      for (let j = start; j < end; j++) {
        sum += Math.abs(data[j]);
      }
      
      spectrum[i] = sum / chunkSize;
    }

    return spectrum;
  };

  // Convert frequency to canvas x position (logarithmic scale)
  const freqToX = (freq: number, width: number): number => {
    const minFreq = 20;
    const maxFreq = 20000;
    const minLog = Math.log10(minFreq);
    const maxLog = Math.log10(maxFreq);
    const logFreq = Math.log10(freq);
    return ((logFreq - minLog) / (maxLog - minLog)) * width;
  };

  // Convert dB to canvas y position
  const dbToY = (db: number, height: number): number => {
    const minDB = -60;
    const maxDB = 6;
    const normalized = (db - minDB) / (maxDB - minDB);
    return height - (normalized * height);
  };

  // Draw spectrum
  const drawSpectrum = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Use full canvas dimensions (already scaled for retina)
    const width = canvas.width;
    const height = canvas.height;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Draw grid
    ctx.strokeStyle = '#27272a';
    ctx.lineWidth = 1;

    // Frequency grid lines (log scale)
    const freqMarkers = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
    freqMarkers.forEach(freq => {
      const x = freqToX(freq, width);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    });

    // dB grid lines
    for (let db = -60; db <= 0; db += 10) {
      const y = dbToY(db, height);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Draw reference curve
    if (showReference) {
      const referenceCurve = REFERENCE_CURVES[gearProfile] || REFERENCE_CURVES['realprog'];
      
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.globalAlpha = 0.5;
      ctx.beginPath();

      referenceCurve.forEach((point, i) => {
        const x = freqToX(point.freq, width);
        const y = dbToY(point.db, height);
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });

      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1.0;
    }

    // Draw original spectrum
    if (originalBuffer) {
      const spectrum = analyzeSpectrum(originalBuffer);
      
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.6;
      ctx.beginPath();

      spectrum.forEach((magnitude, i) => {
        const freq = (i / spectrum.length) * (originalBuffer.sampleRate / 2);
        if (freq >= 20 && freq <= 20000) {
          const x = freqToX(freq, width);
          const db = 20 * Math.log10(Math.max(magnitude, 0.00001));
          const y = dbToY(db, height);
          
          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
      });

      ctx.stroke();
      ctx.globalAlpha = 1.0;
    }

    // Draw processed spectrum
    if (processedBuffer) {
      const spectrum = analyzeSpectrum(processedBuffer);
      
      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 3;
      ctx.shadowColor = '#22c55e';
      ctx.shadowBlur = 8;
      ctx.beginPath();

      spectrum.forEach((magnitude, i) => {
        const freq = (i / spectrum.length) * (processedBuffer.sampleRate / 2);
        if (freq >= 20 && freq <= 20000) {
          const x = freqToX(freq, width);
          const db = 20 * Math.log10(Math.max(magnitude, 0.00001));
          const y = dbToY(db, height);
          
          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
      });

      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Draw frequency labels
    ctx.fillStyle = '#71717a';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    
    freqMarkers.forEach(freq => {
      const x = freqToX(freq, width);
      const label = freq >= 1000 ? `${freq / 1000}k` : `${freq}`;
      ctx.fillText(label, x, height - 5);
    });

    // Draw dB labels
    ctx.textAlign = 'right';
    for (let db = -60; db <= 0; db += 20) {
      const y = dbToY(db, height);
      ctx.fillText(`${db}dB`, width - 5, y - 5);
    }
  };

  // Render spectrum when buffers change
  useEffect(() => {
    drawSpectrum();
  }, [originalBuffer, processedBuffer, showReference, gearProfile]);

  // Set canvas resolution
  useEffect(() => {
    if (canvasRef.current) {
      const canvas = canvasRef.current;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * 2; // 2x for retina
      canvas.height = rect.height * 2;
    }
  }, []);

  const hasAudio = originalBuffer !== null || processedBuffer !== null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
            <Activity className="w-4 h-4 text-purple-400" />
            Spectral Analyzer
          </h3>
          <p className="text-xs text-zinc-400 mt-0.5">Frequency response with genre reference</p>
        </div>

        {/* Reference Toggle */}
        <button
          onClick={() => setShowReference(!showReference)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
            showReference
              ? 'bg-amber-500/20 border border-amber-500/50 text-amber-300'
              : 'bg-zinc-800 border border-zinc-700 text-zinc-400'
          }`}
        >
          <Target className="w-3 h-3" />
          <span>Reference Curve</span>
        </button>
      </div>

      {/* Analyzer Housing */}
      <div 
        className="relative bg-black rounded-lg p-4 border-2"
        style={{
          borderColor: '#2a2a2a',
          boxShadow: `
            inset 0 2px 4px rgba(0,0,0,0.8),
            inset 0 -1px 2px rgba(255,255,255,0.05),
            0 4px 8px rgba(0,0,0,0.4)
          `
        }}
      >
        {!hasAudio && (
          <div className="flex items-center justify-center h-64 text-zinc-600">
            <div className="text-center">
              <Activity className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm font-mono">No audio loaded</p>
            </div>
          </div>
        )}

        {hasAudio && (
          <div className="relative h-64 bg-zinc-950 rounded border border-zinc-800/50 overflow-hidden">
            <canvas
              ref={canvasRef}
              className="w-full h-full"
              style={{ width: '100%', height: '100%' }}
            />
          </div>
        )}

        {/* Processing indicator */}
        {isProcessing && (
          <motion.div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm rounded-lg flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <div className="text-center">
              <motion.div
                className="w-12 h-12 mx-auto mb-3 border-4 border-purple-500 border-t-transparent rounded-full"
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              />
              <p className="text-sm font-mono text-purple-400">Analyzing spectrum...</p>
            </div>
          </motion.div>
        )}
      </div>

      {/* Legend */}
      {hasAudio && (
        <div className="flex items-center justify-center gap-6 text-xs">
          {originalBuffer && (
            <div className="flex items-center gap-2">
              <div className="w-3 h-0.5 bg-cyan-500" />
              <span className="text-zinc-400 font-mono">Original</span>
            </div>
          )}
          {processedBuffer && (
            <div className="flex items-center gap-2">
              <div className="w-3 h-0.5 bg-green-500" />
              <span className="text-zinc-400 font-mono">Processed</span>
            </div>
          )}
          {showReference && (
            <div className="flex items-center gap-2">
              <div className="w-3 h-0.5 bg-amber-500 opacity-50" style={{ borderTop: '2px dashed' }} />
              <span className="text-zinc-400 font-mono">
                {gearProfile.charAt(0).toUpperCase() + gearProfile.slice(1)} Target
              </span>
            </div>
          )}
        </div>
      )}

      {/* Critical Frequency Markers */}
      <div className="grid grid-cols-3 gap-2">
        <div className="p-2 rounded bg-zinc-800/50 border border-zinc-700 text-center">
          <div className="text-xs text-zinc-500 font-mono">Sub/Low</div>
          <div className="text-sm text-cyan-400 font-semibold">20-100Hz</div>
        </div>
        <div className="p-2 rounded bg-zinc-800/50 border border-zinc-700 text-center">
          <div className="text-xs text-zinc-500 font-mono">Presence</div>
          <div className="text-sm text-green-400 font-semibold">300-3.5kHz</div>
        </div>
        <div className="p-2 rounded bg-zinc-800/50 border border-zinc-700 text-center">
          <div className="text-xs text-zinc-500 font-mono">Air</div>
          <div className="text-sm text-purple-400 font-semibold">3.5k-20kHz</div>
        </div>
      </div>
    </div>
  );
}