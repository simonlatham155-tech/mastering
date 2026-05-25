import { AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useEffect, useState } from 'react';

interface PerformanceClipMeterProps {
  peak: number; // dBFS
  isClipping: boolean;
  momentaryPeak: number; // For "Safety" threshold
}

export function PerformanceClipMeter({ peak, isClipping, momentaryPeak }: PerformanceClipMeterProps) {
  const [flashClip, setFlashClip] = useState(false);

  useEffect(() => {
    if (isClipping) {
      setFlashClip(true);
      const timer = setTimeout(() => setFlashClip(false), 100);
      return () => clearTimeout(timer);
    }
  }, [isClipping]);

  // Convert dBFS to percentage for visualization
  const peakPercentage = Math.max(0, Math.min(100, ((peak + 60) / 60) * 100));
  const momentaryPercentage = Math.max(0, Math.min(100, ((momentaryPeak + 60) / 60) * 100));

  // Safety zones
  const isSafe = peak < -6; // Green zone
  const isCaution = peak >= -6 && peak < -3; // Amber zone
  const isDanger = peak >= -3 && peak < 0; // Red zone
  const isClip = peak >= -0.3; // Clip zone

  return (
    <div 
      className="border-2 rounded-lg p-6"
      style={{
        borderColor: '#2a2a2a',
        background: 'linear-gradient(180deg, #1a1a1a, #0f0f0f)',
        boxShadow: `
          inset 0 2px 4px rgba(0,0,0,0.6),
          inset 0 -1px 2px rgba(255,255,255,0.05),
          0 4px 8px rgba(0,0,0,0.4)
        `
      }}
    >
      <div className="flex flex-col gap-4">
        {/* Label */}
        <div className="flex items-center justify-between">
          <div className="text-[10px] font-mono text-zinc-500 tracking-[0.3em] uppercase">Live Peak Meter</div>
          <div className="text-xs font-mono text-zinc-400">{peak.toFixed(1)} dBFS</div>
        </div>

        {/* High-Contrast Meter Bar */}
        <div className="relative h-12 bg-black/60 rounded-md overflow-hidden border border-zinc-800">
          {/* Background Zones (for reference) */}
          <div className="absolute inset-0 flex">
            <div className="flex-1" style={{ maxWidth: '70%' }}></div> {/* Safe */}
            <div className="flex-1" style={{ maxWidth: '15%' }}></div> {/* Caution */}
            <div className="flex-1" style={{ maxWidth: '10%' }}></div> {/* Danger */}
            <div className="flex-1" style={{ maxWidth: '5%' }}></div>  {/* Clip */}
          </div>

          {/* Peak Level Fill */}
          <motion.div
            className="absolute left-0 top-0 bottom-0"
            style={{
              width: `${peakPercentage}%`,
              background: isClip
                ? 'linear-gradient(90deg, #ef4444, #dc2626)' // Red (clip)
                : isDanger
                ? 'linear-gradient(90deg, #f59e0b, #ef4444)' // Amber-to-red
                : isCaution
                ? 'linear-gradient(90deg, #10b981, #f59e0b)' // Green-to-amber
                : 'linear-gradient(90deg, #06b6d4, #10b981)', // Cyan-to-green (safe)
              boxShadow: isClip
                ? '0 0 12px rgba(239, 68, 68, 0.8), inset 0 0 8px rgba(239, 68, 68, 0.4)'
                : isDanger
                ? '0 0 8px rgba(245, 158, 11, 0.6)'
                : isCaution
                ? '0 0 6px rgba(16, 185, 129, 0.4)'
                : '0 0 4px rgba(6, 182, 212, 0.3)',
            }}
            animate={{
              opacity: flashClip ? [1, 0.4, 1] : 1,
            }}
            transition={{ duration: 0.1 }}
          />

          {/* Momentary Peak Marker (for attack visualization) */}
          {momentaryPercentage > 0 && (
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-white/80"
              style={{
                left: `${momentaryPercentage}%`,
                boxShadow: '0 0 4px rgba(255, 255, 255, 0.8)',
              }}
            />
          )}

          {/* Safety Threshold Markers */}
          <div className="absolute top-0 bottom-0 w-0.5 bg-amber-500/40" style={{ left: '70%' }}>
            <div className="absolute -top-1 -left-1 text-[8px] font-mono text-amber-500">-6</div>
          </div>
          <div className="absolute top-0 bottom-0 w-0.5 bg-red-500/40" style={{ left: '85%' }}>
            <div className="absolute -top-1 -left-1 text-[8px] font-mono text-red-500">-3</div>
          </div>
          <div className="absolute top-0 bottom-0 w-0.5 bg-red-600/60" style={{ left: '95%' }}>
            <div className="absolute -top-1 -left-1 text-[8px] font-mono text-red-600">0</div>
          </div>
        </div>

        {/* Clip Indicator (High-Visibility) */}
        <AnimatePresence>
          {isClip && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="flex items-center gap-2 px-4 py-3 rounded-md border-2 border-red-500 bg-red-500/20"
              style={{
                boxShadow: '0 0 16px rgba(239, 68, 68, 0.4), inset 0 0 8px rgba(239, 68, 68, 0.2)'
              }}
            >
              <AlertTriangle className="w-5 h-5 text-red-400 animate-pulse" />
              <div className="flex flex-col">
                <div className="text-sm font-mono font-bold text-red-300 uppercase tracking-wide">
                  CLIPPING DETECTED
                </div>
                <div className="text-[10px] font-mono text-red-400">
                  Reduce Circuit Drive or check input gain
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Safety Status */}
        <div className="flex items-center justify-between px-3 py-2 rounded bg-zinc-900/60 border border-zinc-800">
          <div className="text-[9px] font-mono text-zinc-500 uppercase tracking-wider">
            Status
          </div>
          <div className="flex items-center gap-2">
            <div
              className={`w-2 h-2 rounded-full ${
                isClip ? 'bg-red-500' : isDanger ? 'bg-amber-500' : isCaution ? 'bg-yellow-500' : 'bg-green-500'
              }`}
              style={{
                boxShadow: isClip
                  ? '0 0 8px rgba(239, 68, 68, 0.8)'
                  : isDanger
                  ? '0 0 8px rgba(245, 158, 11, 0.6)'
                  : isCaution
                  ? '0 0 8px rgba(234, 179, 8, 0.6)'
                  : '0 0 8px rgba(34, 197, 94, 0.6)',
              }}
            />
            <div
              className={`text-[10px] font-mono uppercase tracking-wider ${
                isClip ? 'text-red-400' : isDanger ? 'text-amber-400' : isCaution ? 'text-yellow-400' : 'text-green-400'
              }`}
            >
              {isClip ? 'CLIP' : isDanger ? 'HOT' : isCaution ? 'CAUTION' : 'SAFE'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
