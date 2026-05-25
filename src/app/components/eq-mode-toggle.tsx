import { Info, Zap } from 'lucide-react';
import { motion } from 'motion/react';

interface EQModeToggleProps {
  mode: 'classic' | 'linear';
  onModeChange: (mode: 'classic' | 'linear') => void;
  disabled?: boolean;
}

/**
 * EQ MODE TOGGLE
 * Switch between Classic (Biquad) and Linear Phase (FFT) EQ
 * 
 * CLASSIC (Minimum-Phase):
 * - Fast, low latency
 * - Phase shift at crossover frequencies
 * - Can "smear" transients
 * - Good for: real-time monitoring, less critical work
 * 
 * LINEAR PHASE (Zero-Phase):
 * - Transparent, no phase shift
 * - Preserves transient timing
 * - Higher latency (~20ms)
 * - Good for: mastering, reference matching, critical work
 */
export function EQModeToggle({
  mode,
  onModeChange,
  disabled = false
}: EQModeToggleProps) {
  
  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-mono text-zinc-400 uppercase tracking-wider">
          EQ Algorithm
        </span>
        <div className="group relative">
          <Info className="w-3 h-3 text-zinc-600 cursor-help" />
          <div className="absolute left-0 top-full mt-2 w-64 p-3 bg-zinc-900 border border-zinc-700 rounded-lg text-[8px] font-mono text-zinc-400 leading-relaxed opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
            <div className="text-cyan-400 font-semibold mb-1">Classic vs Linear Phase</div>
            <div className="mb-2">
              <span className="text-white">Classic:</span> Fast processing, but shifts phase (can blur transients)
            </div>
            <div>
              <span className="text-purple-400">Linear Phase:</span> Transparent processing, preserves timing (slight latency)
            </div>
          </div>
        </div>
      </div>
      
      {/* Toggle buttons */}
      <div className="flex items-center gap-2">
        {/* Classic (Biquad) */}
        <button
          onClick={() => !disabled && onModeChange('classic')}
          disabled={disabled}
          className={`flex-1 px-4 py-3 rounded-lg border-2 transition-all ${
            mode === 'classic'
              ? 'border-cyan-500 bg-cyan-500/10'
              : 'border-zinc-800 bg-zinc-950 hover:border-zinc-700'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <div className="flex items-center justify-center gap-2 mb-1">
            <div className={`w-2 h-2 rounded-full ${
              mode === 'classic' ? 'bg-cyan-500' : 'bg-zinc-700'
            }`} />
            <span className={`text-sm font-mono font-bold uppercase ${
              mode === 'classic' ? 'text-cyan-400' : 'text-zinc-500'
            }`}>
              Classic
            </span>
          </div>
          <div className="text-[8px] font-mono text-zinc-600">
            Fast • Low Latency
          </div>
        </button>
        
        {/* Linear Phase (FFT) */}
        <button
          onClick={() => !disabled && onModeChange('linear')}
          disabled={disabled}
          className={`flex-1 px-4 py-3 rounded-lg border-2 transition-all relative ${
            mode === 'linear'
              ? 'border-purple-500 bg-purple-500/10'
              : 'border-zinc-800 bg-zinc-950 hover:border-zinc-700'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {/* "Pro" badge */}
          {mode === 'linear' && (
            <motion.div
              className="absolute -top-2 -right-2 px-2 py-0.5 bg-purple-500 rounded-full text-[7px] font-mono font-bold text-white"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 500, damping: 15 }}
            >
              PRO
            </motion.div>
          )}
          
          <div className="flex items-center justify-center gap-2 mb-1">
            <Zap className={`w-3 h-3 ${
              mode === 'linear' ? 'text-purple-400' : 'text-zinc-700'
            }`} />
            <span className={`text-sm font-mono font-bold uppercase ${
              mode === 'linear' ? 'text-purple-400' : 'text-zinc-500'
            }`}>
              Linear Phase
            </span>
          </div>
          <div className="text-[8px] font-mono text-zinc-600">
            Transparent • No Phase Shift
          </div>
        </button>
      </div>
      
      {/* Current mode details */}
      <div className={`border-2 rounded-lg p-3 ${
        mode === 'classic' 
          ? 'border-cyan-500/30 bg-cyan-500/5'
          : 'border-purple-500/30 bg-purple-500/5'
      }`}>
        {mode === 'classic' ? (
          <>
            <div className="text-xs font-mono text-cyan-400 font-semibold mb-2">
              Classic Mode (Minimum-Phase)
            </div>
            <div className="space-y-2 text-[9px] font-mono text-zinc-400 leading-relaxed">
              <div className="flex items-start gap-2">
                <span className="text-cyan-400">✓</span>
                <span>Ultra-fast processing (&lt;1ms latency)</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-cyan-400">✓</span>
                <span>Low CPU usage (efficient for real-time)</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-orange-400">⚠</span>
                <span>Phase shift at EQ frequencies (may blur kick transients)</span>
              </div>
            </div>
            
            <div className="mt-3 pt-3 border-t border-cyan-500/20">
              <div className="text-[8px] font-mono text-zinc-600">
                <span className="text-cyan-400 font-semibold">BEST FOR:</span> Real-time 
                monitoring, live performance, casual mastering
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-3 h-3 text-purple-400" />
              <div className="text-xs font-mono text-purple-400 font-semibold">
                Linear Phase Mode (Zero-Phase FFT)
              </div>
            </div>
            <div className="space-y-2 text-[9px] font-mono text-zinc-400 leading-relaxed">
              <div className="flex items-start gap-2">
                <span className="text-purple-400">✓</span>
                <span>Zero phase shift (perfectly transparent EQ)</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-purple-400">✓</span>
                <span>Preserves transient timing (tight kick drums)</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-purple-400">✓</span>
                <span>Professional mastering quality</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-orange-400">⚠</span>
                <span>~20ms latency (not noticeable in mastering)</span>
              </div>
            </div>
            
            <div className="mt-3 pt-3 border-t border-purple-500/20">
              <div className="text-[8px] font-mono text-zinc-600">
                <span className="text-purple-400 font-semibold">BEST FOR:</span> Professional 
                mastering, reference matching, critical D&B/Techno work where kick transients must stay tight
              </div>
            </div>
          </>
        )}
      </div>
      
      {/* Visual comparison */}
      <div className="grid grid-cols-2 gap-2">
        {/* Classic waveform (smeared) */}
        <div className="border border-zinc-800 rounded p-2 bg-zinc-950">
          <div className="text-[8px] font-mono text-cyan-400 mb-2">Classic</div>
          <div className="flex items-center justify-center h-8 font-mono text-xs text-cyan-400">
            |▁▁█▅█▁▁|
          </div>
          <div className="text-[7px] font-mono text-zinc-600 text-center">
            Transient smeared
          </div>
        </div>
        
        {/* Linear phase waveform (tight) */}
        <div className="border border-zinc-800 rounded p-2 bg-zinc-950">
          <div className="text-[8px] font-mono text-purple-400 mb-2">Linear Phase</div>
          <div className="flex items-center justify-center h-8 font-mono text-xs text-purple-400">
            |▁▁▁█▁▁▁|
          </div>
          <div className="text-[7px] font-mono text-zinc-600 text-center">
            Transient preserved
          </div>
        </div>
      </div>
    </div>
  );
}
