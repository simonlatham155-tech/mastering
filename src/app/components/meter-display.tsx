import { motion } from 'motion/react';
import { useEffect, useState } from 'react';

type MeterMode = 'peak' | 'lra';

interface MeterDisplayProps {
  mode: MeterMode;
  isProcessing: boolean;
  value?: number; // Real value from audio processor
}

export function MeterDisplay({ mode, isProcessing, value = 0 }: MeterDisplayProps) {
  const [peakLevel, setPeakLevel] = useState(0);
  const [lraValue, setLraValue] = useState(0);

  // Use real values when available
  useEffect(() => {
    if (value !== undefined) {
      if (mode === 'peak') {
        setPeakLevel(value);
      } else {
        setLraValue(value);
      }
    }
  }, [value, mode]);

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="text-xs font-mono text-zinc-500 tracking-wider uppercase">
          {mode === 'peak' ? 'Peak Level' : 'Loudness Range'}
        </div>
        <div className="text-xs font-mono text-zinc-600 uppercase tracking-wider">
          {mode === 'peak' ? 'dBFS' : 'LU'}
        </div>
      </div>

      {mode === 'peak' ? (
        <VUMeter level={peakLevel} />
      ) : (
        <LRAMeter value={lraValue} />
      )}
    </div>
  );
}

function VUMeter({ level }: { level: number }) {
  const segments = 60;
  
  return (
    <div className="relative bg-zinc-900 rounded-lg p-4">
      {/* VU Meter */}
      <div className="relative h-6 bg-zinc-950 rounded border border-zinc-800 overflow-hidden">
        {/* LED segments */}
        <div className="absolute inset-0 flex gap-[1px] p-0.5">
          {Array.from({ length: segments }).map((_, i) => {
            const segmentThreshold = (i / segments) * 100;
            const isActive = level >= segmentThreshold;
            
            // Color zones
            let activeColor = 'bg-green-500';
            let glowColor = 'rgba(34, 197, 94, 0.8)';
            
            if (i / segments > 0.85) {
              activeColor = 'bg-red-500';
              glowColor = 'rgba(239, 68, 68, 0.8)';
            } else if (i / segments > 0.7) {
              activeColor = 'bg-yellow-500';
              glowColor = 'rgba(234, 179, 8, 0.8)';
            }

            return (
              <div
                key={i}
                className={`flex-1 rounded-[1px] transition-all duration-75 ${
                  isActive ? activeColor : 'bg-zinc-900/50'
                }`}
                style={{
                  boxShadow: isActive 
                    ? `0 0 4px ${glowColor}, inset 0 1px 1px rgba(255,255,255,0.3)`
                    : 'inset 0 1px 1px rgba(0,0,0,0.5)',
                  opacity: isActive ? 1 : 0.3,
                }}
              />
            );
          })}
        </div>
      </div>

      {/* Scale markings */}
      <div className="flex justify-between text-[10px] text-zinc-600 font-mono mt-2">
        <span>-60</span>
        <span>-40</span>
        <span>-20</span>
        <span className="text-yellow-600">-6</span>
        <span className="text-red-600">0</span>
      </div>

      {/* Numerical readout */}
      <div className="mt-3 bg-zinc-950 px-3 py-2 rounded border border-zinc-800">
        <div className="text-sm font-mono font-bold text-green-400 text-center"
          style={{
            textShadow: '0 0 4px rgba(0,255,0,0.5)',
          }}
        >
          {((level / 100) * -60).toFixed(1)} dBFS
        </div>
      </div>
    </div>
  );
}

function LRAMeter({ value }: { value: number }) {
  return (
    <div className="relative bg-zinc-900 rounded-lg p-4">
      {/* LRA Meter */}
      <div className="relative h-6 bg-zinc-950 rounded border border-zinc-800 overflow-hidden">
        <div className="absolute inset-0 flex items-center px-2">
          <div className="flex-1 relative h-4 bg-zinc-900/50 rounded-sm overflow-hidden">
            {/* LRA bar */}
            <motion.div
              className="absolute left-0 top-0 h-full bg-gradient-to-r from-cyan-500 to-cyan-400 rounded-sm"
              initial={{ width: 0 }}
              animate={{ width: `${(value / 16) * 100}%` }}
              transition={{ type: 'spring', stiffness: 100, damping: 20 }}
              style={{
                boxShadow: '0 0 8px rgba(6, 182, 212, 0.6)',
              }}
            />
          </div>
        </div>
      </div>

      {/* Scale markings */}
      <div className="flex justify-between text-[10px] text-zinc-600 font-mono mt-2">
        <span>0</span>
        <span>4</span>
        <span className="text-cyan-500">8</span>
        <span>12</span>
        <span>16+</span>
      </div>

      {/* Numerical readout */}
      <div className="mt-3 bg-zinc-950 px-3 py-2 rounded border border-zinc-800">
        <div className="text-sm font-mono font-bold text-cyan-400 text-center"
          style={{
            textShadow: '0 0 4px rgba(6, 182, 212, 0.5)',
          }}
        >
          {value.toFixed(1)} LU
        </div>
      </div>

      {/* Status text */}
      <div className="text-xs text-zinc-500 mt-2 text-center">
        {value < 4 && 'Highly Compressed'}
        {value >= 4 && value <= 8 && 'Optimal Range'}
        {value > 8 && value <= 12 && 'Wide Range'}
        {value > 12 && 'Very Dynamic'}
      </div>
    </div>
  );
}