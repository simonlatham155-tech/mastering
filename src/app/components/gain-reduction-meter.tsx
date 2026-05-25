import { motion, useSpring, useTransform } from 'motion/react';
import { useEffect, useRef } from 'react';

interface GainReductionMeterProps {
  gainReductionDB?: number; // Current GR in dB (negative values, e.g., -6 dB)
  lookaheadMS?: number;    // Look-ahead time in milliseconds
  showGhost?: boolean;     // Show "ghost" indicator (look-ahead visualization)
}

/**
 * GAIN REDUCTION METER
 * "The Ghost Meter" - Shows limiting BEFORE peaks hit
 * 
 * WHY "GHOST"?
 * With look-ahead limiting, the meter reacts 5ms BEFORE the peak
 * reaches the output. This creates a "ghosting" effect where you
 * see the gain reduction slightly ahead of the waveform peak.
 * 
 * VISUAL DESIGN:
 * - Green zone: 0 to -3 dB (light limiting)
 * - Yellow zone: -3 to -10 dB (moderate limiting)
 * - Orange zone: -10 to -20 dB (heavy limiting)
 * - Red zone: -20 dB+ (extreme limiting - possible distortion)
 */
export function GainReductionMeter({
  gainReductionDB = 0,
  lookaheadMS = 5,
  showGhost = true
}: GainReductionMeterProps) {
  
  // Smooth animation (mimics ballistics of analog VU meter)
  const smoothGR = useSpring(gainReductionDB, {
    stiffness: 300,
    damping: 30
  });
  
  // Peak hold (show maximum GR for 1 second)
  const peakHoldRef = useRef(0);
  const peakHoldTimer = useRef<number | null>(null);
  
  useEffect(() => {
    if (gainReductionDB < peakHoldRef.current) {
      peakHoldRef.current = gainReductionDB;
      
      // Reset peak hold after 1 second
      if (peakHoldTimer.current) clearTimeout(peakHoldTimer.current);
      peakHoldTimer.current = window.setTimeout(() => {
        peakHoldRef.current = 0;
      }, 1000);
    }
  }, [gainReductionDB]);
  
  // Calculate meter position (0 to 100%)
  const meterPosition = useTransform(
    smoothGR,
    [0, -30], // 0dB (no GR) to -30dB (max display)
    [0, 100]  // 0% to 100% of meter
  );
  
  // Determine color based on GR amount
  const getColor = (db: number) => {
    if (db > -3) return 'bg-green-500';
    if (db > -10) return 'bg-yellow-500';
    if (db > -20) return 'bg-orange-500';
    return 'bg-red-500';
  };
  
  const getTextColor = (db: number) => {
    if (db > -3) return 'text-green-400';
    if (db > -10) return 'text-yellow-400';
    if (db > -20) return 'text-orange-400';
    return 'text-red-400';
  };
  
  const currentColor = getColor(gainReductionDB);
  const currentTextColor = getTextColor(gainReductionDB);
  
  return (
    <div className="border-2 border-zinc-800 rounded-lg p-4 bg-zinc-950">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${
            gainReductionDB < -1 ? currentColor.replace('bg-', 'bg-') : 'bg-zinc-700'
          }`} />
          <span className="text-xs font-mono text-zinc-400 uppercase tracking-wider">
            Gain Reduction
          </span>
          {showGhost && (
            <span className="text-[8px] font-mono text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded">
              GHOST ({lookaheadMS}ms)
            </span>
          )}
        </div>
        
        {/* Current value */}
        <div className="flex items-baseline gap-1">
          <span className={`text-xl font-mono font-bold ${currentTextColor}`}>
            {gainReductionDB.toFixed(1)}
          </span>
          <span className="text-xs font-mono text-zinc-600">dB</span>
        </div>
      </div>
      
      {/* Main meter (horizontal) */}
      <div className="relative h-12 rounded-lg bg-zinc-900 overflow-hidden border border-zinc-800">
        {/* Background zones */}
        <div className="absolute inset-0 flex">
          {/* Green zone (0 to -3 dB) */}
          <div className="flex-[10] bg-green-500/10 border-r border-zinc-800" />
          {/* Yellow zone (-3 to -10 dB) */}
          <div className="flex-[23] bg-yellow-500/10 border-r border-zinc-800" />
          {/* Orange zone (-10 to -20 dB) */}
          <div className="flex-[33] bg-orange-500/10 border-r border-zinc-800" />
          {/* Red zone (-20 to -30 dB) */}
          <div className="flex-[33] bg-red-500/10" />
        </div>
        
        {/* Scale markings */}
        <div className="absolute inset-0 flex items-center">
          <div className="absolute left-[10%] top-1 text-[8px] font-mono text-green-600">-3</div>
          <div className="absolute left-[33%] top-1 text-[8px] font-mono text-yellow-600">-10</div>
          <div className="absolute left-[66%] top-1 text-[8px] font-mono text-orange-600">-20</div>
          <div className="absolute right-2 top-1 text-[8px] font-mono text-red-600">-30</div>
        </div>
        
        {/* Current level bar */}
        <motion.div
          className={`absolute inset-y-0 left-0 ${currentColor}`}
          style={{
            width: meterPosition,
            opacity: 0.8
          }}
        />
        
        {/* Peak hold indicator */}
        {peakHoldRef.current < -0.5 && (
          <motion.div
            className={`absolute inset-y-0 w-0.5 ${getColor(peakHoldRef.current)}`}
            style={{
              left: `${Math.min(100, (Math.abs(peakHoldRef.current) / 30) * 100)}%`
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          />
        )}
        
        {/* Ghost indicator (look-ahead preview) */}
        {showGhost && gainReductionDB < -1 && (
          <motion.div
            className={`absolute inset-y-0 w-1 ${currentColor} opacity-30`}
            style={{
              left: meterPosition,
              filter: 'blur(4px)'
            }}
            animate={{
              scaleX: [1, 1.5, 1],
              opacity: [0.3, 0.5, 0.3]
            }}
            transition={{
              repeat: Infinity,
              duration: 0.5
            }}
          />
        )}
      </div>
      
      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3 mt-3">
        {/* Current GR */}
        <div className="text-center">
          <div className="text-[8px] font-mono text-zinc-600 mb-1">Current</div>
          <div className={`text-sm font-mono font-bold ${currentTextColor}`}>
            {gainReductionDB.toFixed(1)} dB
          </div>
        </div>
        
        {/* Peak GR */}
        <div className="text-center">
          <div className="text-[8px] font-mono text-zinc-600 mb-1">Peak</div>
          <div className={`text-sm font-mono font-bold ${getTextColor(peakHoldRef.current)}`}>
            {peakHoldRef.current.toFixed(1)} dB
          </div>
        </div>
        
        {/* Look-ahead */}
        <div className="text-center">
          <div className="text-[8px] font-mono text-zinc-600 mb-1">Look-ahead</div>
          <div className="text-sm font-mono font-bold text-purple-400">
            {lookaheadMS.toFixed(1)} ms
          </div>
        </div>
      </div>
      
      {/* Status message */}
      <div className="mt-3 pt-3 border-t border-zinc-800">
        {gainReductionDB === 0 && (
          <div className="text-[9px] font-mono text-zinc-600 leading-relaxed">
            <span className="text-zinc-500">●</span> No limiting (signal below threshold)
          </div>
        )}
        {gainReductionDB > -3 && gainReductionDB < 0 && (
          <div className="text-[9px] font-mono text-green-400 leading-relaxed">
            <span className="text-green-500">●</span> Light limiting (transparent, natural)
          </div>
        )}
        {gainReductionDB <= -3 && gainReductionDB > -10 && (
          <div className="text-[9px] font-mono text-yellow-400 leading-relaxed">
            <span className="text-yellow-500">●</span> Moderate limiting (audible compression)
          </div>
        )}
        {gainReductionDB <= -10 && gainReductionDB > -20 && (
          <div className="text-[9px] font-mono text-orange-400 leading-relaxed">
            <span className="text-orange-500">●</span> Heavy limiting (aggressive, may affect dynamics)
          </div>
        )}
        {gainReductionDB <= -20 && (
          <div className="text-[9px] font-mono text-red-400 leading-relaxed">
            <span className="text-red-500">●</span> Extreme limiting (potential distortion, reduce input gain!)
          </div>
        )}
      </div>
      
      {/* Ghost explanation */}
      {showGhost && (
        <div className="mt-3 pt-3 border-t border-zinc-800">
          <div className="text-[8px] font-mono text-purple-400 leading-relaxed">
            <span className="font-semibold">GHOST METER:</span> The glowing edge shows where 
            gain reduction will be in {lookaheadMS}ms. The limiter "sees" peaks before they 
            reach the output, allowing for smooth, artifact-free limiting.
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Compact version for inline display
 */
export function GainReductionMeterCompact({
  gainReductionDB = 0
}: {
  gainReductionDB?: number;
}) {
  const getColor = (db: number) => {
    if (db > -3) return 'text-green-400';
    if (db > -10) return 'text-yellow-400';
    if (db > -20) return 'text-orange-400';
    return 'text-red-400';
  };
  
  return (
    <div className="flex items-center gap-2">
      <span className="text-[8px] font-mono text-zinc-500">GR:</span>
      <span className={`text-xs font-mono font-bold ${getColor(gainReductionDB)}`}>
        {gainReductionDB.toFixed(1)} dB
      </span>
    </div>
  );
}