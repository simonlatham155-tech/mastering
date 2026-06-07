import { motion } from 'motion/react';
import { Sparkles, Zap, Info } from 'lucide-react';

interface HQModeToggleProps {
  enabled?: boolean;
  onToggle: (enabled: boolean) => void;
  cpuUsage?: number; // Percentage (0-100)
}

/**
 * HQ MODE TOGGLE
 * Enable/Disable 4x Oversampling
 * 
 * HQ MODE (ON):
 * - 4x oversampling (44.1kHz → 176.4kHz)
 * - Polyphase FIR filtering (31-tap, 96dB stopband)
 * - True peak detection (catches inter-sample peaks)
 * - NO aliasing (clean high-frequency limiting)
 * - Higher CPU usage (~15-20%)
 * 
 * STANDARD MODE (OFF):
 * - 1x sample rate (44.1kHz)
 * - Basic limiting (Web Audio API)
 * - Digital peak only (misses inter-sample peaks)
 * - Possible aliasing artifacts
 * - Lower CPU usage (~5%)
 */
export function HQModeToggle({
  enabled = true,
  onToggle,
  cpuUsage = 0
}: HQModeToggleProps) {
  
  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-mono text-zinc-400 uppercase tracking-wider">
          Meter quality
        </span>
        <div className="group relative">
          <Info className="w-3 h-3 text-zinc-600 cursor-help" />
          <div className="absolute left-0 top-full mt-2 w-80 p-3 bg-zinc-900 border border-zinc-700 rounded-lg text-[8px] font-mono text-zinc-400 leading-relaxed opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
            <div className="text-purple-400 font-semibold mb-2">What is 4x Oversampling?</div>
            <div className="space-y-2">
              <div>
                <span className="text-white">Standard limiting</span> creates high-frequency 
                harmonics that "fold back" into the audible range (aliasing), causing digital 
                harshness.
              </div>
              <div>
                <span className="text-purple-400">HQ mode</span> processes at 4x the sample 
                rate (176.4kHz) using polyphase FIR filters, eliminating aliasing and catching 
                inter-sample peaks that standard limiters miss.
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Toggle button */}
      <button
        onClick={() => onToggle(!enabled)}
        className={`relative w-full border-2 rounded-lg p-6 transition-all ${
          enabled
            ? 'border-purple-500 bg-purple-500/10'
            : 'border-zinc-800 bg-zinc-950 hover:border-zinc-700'
        }`}
      >
        {/* Background gradient when enabled */}
        {enabled && (
          <motion.div
            className="absolute inset-0 rounded-lg opacity-10"
            style={{
              background: 'linear-gradient(135deg, #a855f7, #ec4899, #8b5cf6)'
            }}
            animate={{
              backgroundPosition: ['0% 0%', '100% 100%'],
            }}
            transition={{
              repeat: Infinity,
              duration: 3,
              ease: 'linear'
            }}
          />
        )}
        
        <div className="relative flex items-center justify-between">
          {/* Left: Mode info */}
          <div className="flex items-center gap-4">
            {/* Icon */}
            <motion.div
              className={`w-12 h-12 rounded-full flex items-center justify-center ${
                enabled 
                  ? 'bg-purple-500/20 border-2 border-purple-500'
                  : 'bg-zinc-800 border-2 border-zinc-700'
              }`}
              animate={enabled ? {
                boxShadow: [
                  '0 0 0 0 rgba(168, 85, 247, 0.7)',
                  '0 0 0 10px rgba(168, 85, 247, 0)',
                ]
              } : {}}
              transition={enabled ? {
                repeat: Infinity,
                duration: 2
              } : {}}
            >
              {enabled ? (
                <Sparkles className="w-6 h-6 text-purple-400" />
              ) : (
                <Zap className="w-6 h-6 text-zinc-600" />
              )}
            </motion.div>
            
            {/* Text */}
            <div className="text-left">
              <div className={`text-lg font-mono font-bold uppercase tracking-wider ${
                enabled ? 'text-purple-400' : 'text-zinc-500'
              }`}>
                {enabled ? 'HQ Mode' : 'Standard'}
              </div>
              <div className="text-[10px] font-mono text-zinc-600">
                {enabled ? '4x Oversampling • FIR Filtered' : '1x Sample Rate • Basic Limiting'}
              </div>
            </div>
          </div>
          
          {/* Right: Toggle switch */}
          <div className={`w-16 h-8 rounded-full relative ${
            enabled ? 'bg-purple-500' : 'bg-zinc-700'
          } transition-colors`}>
            <motion.div
              className="absolute top-1 w-6 h-6 rounded-full bg-white"
              animate={{
                left: enabled ? 'calc(100% - 28px)' : '4px'
              }}
              transition={{
                type: 'spring',
                stiffness: 500,
                damping: 30
              }}
            />
          </div>
        </div>
      </button>
      
      {/* Details panel */}
      <div className={`border-2 rounded-lg p-4 ${
        enabled
          ? 'border-purple-500/30 bg-purple-500/5'
          : 'border-zinc-800 bg-zinc-950'
      }`}>
        {enabled ? (
          <>
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-4 h-4 text-purple-400" />
              <div className="text-xs font-mono text-purple-400 font-semibold">
                Reference-grade meters
              </div>
            </div>
            
            <div className="space-y-2 text-[9px] font-mono text-zinc-400 leading-relaxed">
              <div className="flex items-start gap-2">
                <span className="text-purple-400 shrink-0">Live preview:</span>
                <span>4× FIR true-peak metering on the output tap (passthrough audio).</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-emerald-400 shrink-0">Export file:</span>
                <span>Same 4× FIR limiter worklet in the ceiling stage + 24-bit WAV.</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-orange-400">⚠</span>
                <span>Slightly higher CPU on the meter tap (~15–20%).</span>
              </div>
            </div>
            
            {/* CPU meter */}
            <div className="mt-3 pt-3 border-t border-purple-500/20">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[8px] font-mono text-zinc-500">CPU Usage:</span>
                <span className={`text-xs font-mono font-bold ${
                  cpuUsage > 50 ? 'text-red-400' :
                  cpuUsage > 25 ? 'text-orange-400' : 'text-purple-400'
                }`}>
                  {cpuUsage.toFixed(1)}%
                </span>
              </div>
              <div className="h-1 bg-zinc-900 rounded-full overflow-hidden">
                <motion.div
                  className={`h-full ${
                    cpuUsage > 50 ? 'bg-red-500' :
                    cpuUsage > 25 ? 'bg-orange-500' : 'bg-purple-500'
                  }`}
                  style={{ width: `${Math.min(100, cpuUsage)}%` }}
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(100, cpuUsage)}%` }}
                />
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-3">
              <Zap className="w-4 h-4 text-zinc-600" />
              <div className="text-xs font-mono text-zinc-500 font-semibold">
                Standard Processing
              </div>
            </div>
            
            <div className="space-y-2 text-[9px] font-mono text-zinc-400 leading-relaxed">
              <div className="flex items-start gap-2">
                <span className="text-zinc-600">○</span>
                <span>1x sample rate (44.1kHz)</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-zinc-600">○</span>
                <span>Basic limiting (Web Audio API)</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-zinc-600">○</span>
                <span>Digital peak only (misses inter-sample peaks)</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-orange-400">⚠</span>
                <span>Possible aliasing artifacts at extreme loudness</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-green-400">✓</span>
                <span>Lower CPU usage (~5%)</span>
              </div>
            </div>
          </>
        )}
      </div>
      
      {/* Recommendation */}
      <div className="border-2 border-zinc-800 rounded-lg p-3 bg-zinc-950">
        <div className="text-[8px] font-mono text-zinc-500 uppercase mb-2">
          Recommendation:
        </div>
        <div className="text-[9px] font-mono text-zinc-400 leading-relaxed">
          Use <span className="text-purple-400 font-semibold">HQ Mode</span> for final 
          masters and critical work. Use{' '}
          <span className="text-zinc-500 font-semibold">Standard</span> for quick 
          previews and low-power devices.
        </div>
      </div>
      
      {/* Technical note */}
      {enabled && (
        <div className="border-2 border-purple-500/30 rounded-lg p-3 bg-purple-500/5">
          <div className="text-[8px] font-mono text-purple-400 leading-relaxed">
            <span className="font-semibold">POLYPHASE FIR FILTER:</span> The 31-tap filter 
            coefficients provide 96dB stopband attenuation, ensuring that no digital artifacts 
            (aliasing) leak into the final master. This is the same technique used by 
            FabFilter Pro-L 2 and iZotope Ozone.
          </div>
        </div>
      )}
    </div>
  );
}
