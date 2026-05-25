import { Zap, Clock } from 'lucide-react';
import { motion } from 'motion/react';

interface LatencyModeToggleProps {
  mode: 'zero-latency' | 'mastering';
  onModeChange: (mode: 'zero-latency' | 'mastering') => void;
  currentLatencyMS?: number;
}

/**
 * LATENCY MODE TOGGLE
 * Switch between Zero-Latency and Mastering modes
 * 
 * ZERO-LATENCY MODE:
 * - No look-ahead buffer (0ms latency)
 * - Real-time monitoring
 * - Good for: Tracking, live performance, real-time preview
 * - Limitation: Less transparent limiting (can't "see" peaks coming)
 * 
 * MASTERING MODE:
 * - 5-10ms look-ahead buffer
 * - Professional quality limiting
 * - Good for: Final masters, critical work, extreme loudness
 * - Limitation: Not suitable for real-time monitoring (latency)
 */
export function LatencyModeToggle({
  mode,
  onModeChange,
  currentLatencyMS = 5
}: LatencyModeToggleProps) {
  
  const isZeroLatency = mode === 'zero-latency';
  const isMastering = mode === 'mastering';
  
  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-mono text-zinc-400 uppercase tracking-wider">
          Latency Compensation
        </span>
      </div>
      
      {/* Toggle buttons */}
      <div className="grid grid-cols-2 gap-3">
        {/* Zero-Latency Mode */}
        <button
          onClick={() => onModeChange('zero-latency')}
          className={`relative border-2 rounded-lg p-4 transition-all ${
            isZeroLatency
              ? 'border-cyan-500 bg-cyan-500/10'
              : 'border-zinc-800 bg-zinc-950 hover:border-zinc-700'
          }`}
        >
          <div className="flex flex-col items-center gap-2">
            <Zap className={`w-6 h-6 ${
              isZeroLatency ? 'text-cyan-400' : 'text-zinc-600'
            }`} />
            <div className={`text-sm font-mono font-bold uppercase ${
              isZeroLatency ? 'text-cyan-400' : 'text-zinc-500'
            }`}>
              Zero Latency
            </div>
            <div className="text-[8px] font-mono text-zinc-600 text-center">
              Real-time • 0ms delay
            </div>
            {isZeroLatency && (
              <motion.div
                className="absolute -top-2 -right-2 px-2 py-0.5 bg-cyan-500 rounded-full text-[7px] font-mono font-bold text-white"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
              >
                ACTIVE
              </motion.div>
            )}
          </div>
        </button>
        
        {/* Mastering Mode */}
        <button
          onClick={() => onModeChange('mastering')}
          className={`relative border-2 rounded-lg p-4 transition-all ${
            isMastering
              ? 'border-purple-500 bg-purple-500/10'
              : 'border-zinc-800 bg-zinc-950 hover:border-zinc-700'
          }`}
        >
          <div className="flex flex-col items-center gap-2">
            <Clock className={`w-6 h-6 ${
              isMastering ? 'text-purple-400' : 'text-zinc-600'
            }`} />
            <div className={`text-sm font-mono font-bold uppercase ${
              isMastering ? 'text-purple-400' : 'text-zinc-500'
            }`}>
              Mastering
            </div>
            <div className="text-[8px] font-mono text-zinc-600 text-center">
              Look-ahead • {currentLatencyMS}ms
            </div>
            {isMastering && (
              <motion.div
                className="absolute -top-2 -right-2 px-2 py-0.5 bg-purple-500 rounded-full text-[7px] font-mono font-bold text-white"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
              >
                PRO
              </motion.div>
            )}
          </div>
        </button>
      </div>
      
      {/* Current mode details */}
      <div className={`border-2 rounded-lg p-4 ${
        isZeroLatency
          ? 'border-cyan-500/30 bg-cyan-500/5'
          : 'border-purple-500/30 bg-purple-500/5'
      }`}>
        {isZeroLatency ? (
          <>
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-4 h-4 text-cyan-400" />
              <div className="text-xs font-mono text-cyan-400 font-semibold">
                Zero-Latency Mode
              </div>
            </div>
            
            <div className="space-y-2 text-[9px] font-mono text-zinc-400 leading-relaxed">
              <div className="flex items-start gap-2">
                <span className="text-cyan-400">✓</span>
                <span>Real-time processing (no delay)</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-cyan-400">✓</span>
                <span>Suitable for live monitoring, tracking, DJ sets</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-orange-400">⚠</span>
                <span>Less transparent limiting (can't predict peaks)</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-orange-400">⚠</span>
                <span>May produce audible artifacts at extreme loudness</span>
              </div>
            </div>
            
            <div className="mt-3 pt-3 border-t border-cyan-500/20">
              <div className="text-[8px] font-mono text-zinc-600">
                <span className="text-cyan-400 font-semibold">LATENCY:</span> 0ms (sample-accurate)
              </div>
              <div className="text-[8px] font-mono text-zinc-600 mt-1">
                <span className="text-cyan-400 font-semibold">BEST FOR:</span> Live performance, 
                real-time monitoring, DJ mixing
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-4 h-4 text-purple-400" />
              <div className="text-xs font-mono text-purple-400 font-semibold">
                Mastering Mode (Look-ahead)
              </div>
            </div>
            
            <div className="space-y-2 text-[9px] font-mono text-zinc-400 leading-relaxed">
              <div className="flex items-start gap-2">
                <span className="text-purple-400">✓</span>
                <span>Professional-grade limiting (sees peaks {currentLatencyMS}ms early)</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-purple-400">✓</span>
                <span>Artifact-free at extreme loudness (-6 to -3 LUFS)</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-purple-400">✓</span>
                <span>Smooth gain reduction (no "crunch" or "pumping")</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-orange-400">⚠</span>
                <span>{currentLatencyMS}ms latency (not suitable for real-time monitoring)</span>
              </div>
            </div>
            
            <div className="mt-3 pt-3 border-t border-purple-500/20">
              <div className="text-[8px] font-mono text-zinc-600">
                <span className="text-purple-400 font-semibold">LATENCY:</span> {currentLatencyMS}ms 
                look-ahead buffer
              </div>
              <div className="text-[8px] font-mono text-zinc-600 mt-1">
                <span className="text-purple-400 font-semibold">BEST FOR:</span> Final masters, 
                streaming releases, club tracks requiring extreme loudness
              </div>
            </div>
          </>
        )}
      </div>
      
      {/* Visual comparison */}
      <div className="border-2 border-zinc-800 rounded-lg p-3 bg-zinc-950">
        <div className="text-[8px] font-mono text-zinc-500 uppercase mb-3">
          How Look-ahead Works:
        </div>
        
        <div className="space-y-3">
          {/* Without look-ahead */}
          <div>
            <div className="text-[8px] font-mono text-cyan-400 mb-2">
              Without Look-ahead (Zero-Latency):
            </div>
            <div className="font-mono text-[10px] text-zinc-400 space-y-1">
              <div>Peak arrives:    ↓</div>
              <div>Time:      |----[<span className="text-red-400">PEAK</span>]-----|</div>
              <div>Detector:  |----[<span className="text-orange-400">DETECT</span>]---|</div>
              <div>Gain:      |----[<span className="text-red-400">REACT</span>]---|  ← TOO LATE!</div>
              <div className="text-[8px] text-orange-400 mt-1">
                ⚠ Peak "slips through" → distortion
              </div>
            </div>
          </div>
          
          {/* With look-ahead */}
          <div className="pt-3 border-t border-zinc-800">
            <div className="text-[8px] font-mono text-purple-400 mb-2">
              With {currentLatencyMS}ms Look-ahead (Mastering):
            </div>
            <div className="font-mono text-[10px] text-zinc-400 space-y-1">
              <div>Peak arrives:    ↓</div>
              <div>Time:      |----[<span className="text-green-400">PEAK</span>]-----|</div>
              <div>Detector:  |[<span className="text-purple-400">DETECT</span>]-------|  ← Sees {currentLatencyMS}ms early!</div>
              <div>Delay:     |----[<span className="text-cyan-400">BUFFER</span>]---|</div>
              <div>Gain:      |[<span className="text-green-400">READY</span>]-------|  ← Prepared!</div>
              <div className="text-[8px] text-green-400 mt-1">
                ✓ Smooth gain reduction → no distortion
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Latency compensation info */}
      {isMastering && (
        <div className="border-2 border-purple-500/30 rounded-lg p-3 bg-purple-500/5">
          <div className="text-[9px] font-mono text-purple-400 leading-relaxed">
            <span className="font-semibold">LATENCY COMPENSATION:</span> The browser 
            automatically compensates for the {currentLatencyMS}ms delay when rendering 
            the final file. You won't hear the latency in the exported track.
          </div>
        </div>
      )}
      
      {/* Recommendation */}
      <div className="border-2 border-zinc-800 rounded-lg p-3 bg-zinc-950">
        <div className="text-[8px] font-mono text-zinc-500 uppercase mb-2">
          Recommendation:
        </div>
        <div className="text-[9px] font-mono text-zinc-400 leading-relaxed">
          Use <span className="text-cyan-400 font-semibold">Zero-Latency</span> for real-time 
          preview and quick A/B testing. Switch to{' '}
          <span className="text-purple-400 font-semibold">Mastering Mode</span> for final 
          export to get professional-grade limiting with no artifacts.
        </div>
      </div>
    </div>
  );
}
