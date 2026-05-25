import { motion } from 'motion/react';
import { Activity, Info } from 'lucide-react';

interface AliasingVisualizerProps {
  hqMode?: boolean;
  aliasingLevel?: number; // 0-100 (amount of aliasing detected)
}

/**
 * ALIASING VISUALIZER
 * Shows high-frequency content above 20kHz being filtered out
 * 
 * ALIASING:
 * When a limiter creates harmonics above Nyquist frequency (22.05kHz at 44.1kHz),
 * those harmonics "fold back" into the audible range, creating digital harshness.
 * 
 * EXAMPLE:
 * Original signal: 100Hz sine wave
 * After limiting: 100Hz + 22kHz harmonic (created by hard clipping)
 * Without oversampling: 22kHz folds back to 200Hz (aliasing = harsh sound)
 * With 4x oversampling: 22kHz is properly filtered out (clean sound)
 * 
 * This component shows the spectrum above 20kHz being filtered by the FIR filter.
 */
export function AliasingVisualizer({
  hqMode = true,
  aliasingLevel = 0
}: AliasingVisualizerProps) {
  
  // Generate spectrum bars (simulated)
  const generateSpectrum = () => {
    const bars = [];
    const numBars = 32;
    
    for (let i = 0; i < numBars; i++) {
      const freq = (i / numBars) * 44100 / 2; // 0 to 22.05kHz
      const isAudible = freq <= 20000; // Below 20kHz
      const isNyquist = i > numBars * 0.9; // Near Nyquist (22.05kHz)
      
      // Height based on position and mode
      let height;
      if (hqMode) {
        // HQ mode: high frequencies are filtered out
        if (isAudible) {
          height = Math.random() * 60 + 20; // Normal content
        } else {
          height = Math.random() * 10; // Heavily filtered
        }
      } else {
        // Standard mode: aliasing present
        if (isNyquist) {
          height = Math.random() * 80 + aliasingLevel * 0.5; // Aliasing spikes
        } else if (isAudible) {
          height = Math.random() * 60 + 20;
        } else {
          height = Math.random() * 40 + 20; // Unfiltered
        }
      }
      
      bars.push({
        freq,
        height,
        isAudible,
        isNyquist
      });
    }
    
    return bars;
  };
  
  const spectrum = generateSpectrum();
  
  return (
    <div className="border-2 border-zinc-800 rounded-lg p-4 bg-zinc-950">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Activity className={`w-4 h-4 ${
            hqMode ? 'text-purple-400' : 'text-orange-400'
          }`} />
          <div>
            <div className={`text-xs font-mono font-bold uppercase ${
              hqMode ? 'text-purple-400' : 'text-orange-400'
            }`}>
              Frequency Spectrum
            </div>
            <div className="text-[8px] font-mono text-zinc-600">
              {hqMode ? 'FIR Filtered (No Aliasing)' : 'Unfiltered (Aliasing Present)'}
            </div>
          </div>
        </div>
        
        <div className="group relative">
          <Info className="w-3 h-3 text-zinc-600 cursor-help" />
          <div className="absolute right-0 top-full mt-2 w-80 p-3 bg-zinc-900 border border-zinc-700 rounded-lg text-[8px] font-mono text-zinc-400 leading-relaxed opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
            <div className="text-purple-400 font-semibold mb-1">What is Aliasing?</div>
            <div>
              When limiting creates high-frequency harmonics above Nyquist (22.05kHz), 
              they "fold back" into the audible range, creating harsh digital artifacts. 
              4x oversampling + FIR filtering prevents this by processing at 176.4kHz 
              where these harmonics can be properly filtered out.
            </div>
          </div>
        </div>
      </div>
      
      {/* Spectrum visualizer */}
      <div className="relative h-48 bg-black rounded border border-zinc-800 overflow-hidden">
        {/* Grid lines */}
        <div className="absolute inset-0">
          {[0, 1, 2, 3, 4].map((i) => (
            <div 
              key={i}
              className="absolute left-0 right-0 border-t border-zinc-900"
              style={{ top: `${i * 25}%` }}
            />
          ))}
        </div>
        
        {/* Frequency zones */}
        <div className="absolute inset-0 flex">
          {/* Audible range (0-20kHz) */}
          <div className="flex-[90] bg-green-500/5 border-r border-zinc-800" />
          {/* Ultrasonic range (20kHz-22.05kHz) */}
          <div className="flex-[10] bg-purple-500/5" />
        </div>
        
        {/* Zone labels */}
        <div className="absolute bottom-2 left-2 text-[7px] font-mono text-green-500">
          Audible (0-20kHz)
        </div>
        <div className="absolute bottom-2 right-2 text-[7px] font-mono text-purple-500">
          Ultrasonic
        </div>
        
        {/* Spectrum bars */}
        <div className="absolute inset-0 flex items-end gap-px px-1 pb-1">
          {spectrum.map((bar, i) => (
            <motion.div
              key={i}
              className={`flex-1 rounded-t ${
                bar.isNyquist && !hqMode
                  ? 'bg-red-500' // Aliasing spike
                  : bar.isAudible
                  ? 'bg-cyan-500'
                  : hqMode
                  ? 'bg-purple-500/30' // Filtered out
                  : 'bg-orange-500' // Unfiltered
              }`}
              style={{
                height: `${bar.height}%`,
                opacity: bar.isAudible ? 1 : hqMode ? 0.3 : 0.7
              }}
              animate={{
                height: `${bar.height}%`,
                opacity: bar.isAudible ? 1 : hqMode ? 0.3 : 0.7
              }}
              transition={{
                duration: 0.2,
                delay: i * 0.01
              }}
            />
          ))}
        </div>
        
        {/* Nyquist marker */}
        <div className="absolute right-[10%] inset-y-0 w-0.5 bg-red-500/50" />
        <div className="absolute right-[10%] top-2 text-[7px] font-mono text-red-500 -translate-x-1/2">
          Nyquist (22.05kHz)
        </div>
      </div>
      
      {/* Legend */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-cyan-500" />
          <span className="text-[8px] font-mono text-zinc-500">
            Audible (0-20kHz)
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded ${
            hqMode ? 'bg-purple-500/30' : 'bg-orange-500'
          }`} />
          <span className="text-[8px] font-mono text-zinc-500">
            Ultrasonic (20kHz+)
          </span>
        </div>
        {!hqMode && (
          <div className="flex items-center gap-2 col-span-2">
            <div className="w-3 h-3 rounded bg-red-500" />
            <span className="text-[8px] font-mono text-red-500">
              Aliasing Spikes (Folded Harmonics)
            </span>
          </div>
        )}
      </div>
      
      {/* Explanation */}
      <div className={`mt-4 p-3 rounded border-2 ${
        hqMode
          ? 'border-purple-500/30 bg-purple-500/5'
          : 'border-orange-500/30 bg-orange-500/5'
      }`}>
        {hqMode ? (
          <>
            <div className="text-[8px] font-mono text-purple-400 font-semibold mb-2">
              ✓ FIR FILTER ACTIVE (96dB Stopband)
            </div>
            <div className="text-[9px] font-mono text-zinc-400 leading-relaxed">
              The 31-tap polyphase FIR filter is removing content above 20kHz before 
              downsampling. High-frequency harmonics created by limiting are filtered 
              out cleanly, preventing them from folding back into the audible range.
            </div>
            <div className="mt-2 text-[8px] font-mono text-zinc-600">
              Result: <span className="text-green-400">Clean, artifact-free limiting</span>
            </div>
          </>
        ) : (
          <>
            <div className="text-[8px] font-mono text-orange-400 font-semibold mb-2">
              ⚠ NO OVERSAMPLING (Aliasing Possible)
            </div>
            <div className="text-[9px] font-mono text-zinc-400 leading-relaxed">
              Without oversampling, high-frequency harmonics created by limiting can't 
              be properly filtered. When they exceed Nyquist (22.05kHz), they "fold back" 
              into the audible range, creating harsh digital artifacts.
            </div>
            <div className="mt-2 text-[8px] font-mono text-zinc-600">
              Result: <span className="text-red-400">Possible digital harshness</span>
            </div>
          </>
        )}
      </div>
      
      {/* FIR filter coefficients info */}
      {hqMode && (
        <div className="mt-4 pt-4 border-t border-zinc-800">
          <div className="text-[8px] font-mono text-zinc-500 uppercase mb-2">
            Filter Specifications:
          </div>
          <div className="grid grid-cols-2 gap-2 text-[9px] font-mono">
            <div>
              <span className="text-zinc-600">Type:</span>{' '}
              <span className="text-white">Polyphase FIR</span>
            </div>
            <div>
              <span className="text-zinc-600">Taps:</span>{' '}
              <span className="text-white">31</span>
            </div>
            <div>
              <span className="text-zinc-600">Stopband:</span>{' '}
              <span className="text-white">96 dB</span>
            </div>
            <div>
              <span className="text-zinc-600">Phase:</span>{' '}
              <span className="text-white">Linear</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
