import { motion } from 'motion/react';
import { Volume2, AlertTriangle, Shield, Zap } from 'lucide-react';
import { LimiterMode, LIMITER_MODES } from '../services/multi-stage-limiter';

interface LoudnessHeatMapProps {
  currentLUFS: number;      // Current integrated loudness
  targetLUFS: number;       // Target for selected genre
  shortTermLUFS?: number;   // Short-term loudness (optional)
  peakLevel?: number;       // True peak level (optional)
  limiterMode?: LimiterMode; // Current limiter mode (optional)
}

/**
 * LOUDNESS HEAT MAP
 * Visual safety meter for dance music loudness targeting
 * 
 * Color zones:
 * - BLUE (-14 to -12 LUFS): Streaming safe (Spotify/Apple)
 * - GREEN (-12 to -9 LUFS): Club standard (balanced)
 * - YELLOW (-9 to -7 LUFS): Aggressive (Techno/House)
 * - ORANGE (-7 to -5 LUFS): Heavy saturation (Dubstep)
 * - RED (-5 to 0 LUFS): Maximum (D&B/competition)
 * 
 * 2026 Standards:
 * - Streaming: -14 LUFS (Spotify normalized)
 * - Pop/House: -9 LUFS
 * - Techno/Tech House: -7 LUFS
 * - D&B/Dubstep: -6 LUFS
 */
export function LoudnessHeatMap({
  currentLUFS,
  targetLUFS,
  shortTermLUFS,
  peakLevel,
  limiterMode
}: LoudnessHeatMapProps) {
  
  // Determine zone
  const zone = getZone(currentLUFS);
  const targetZone = getZone(targetLUFS);
  const delta = currentLUFS - targetLUFS;
  
  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-mono text-zinc-400 uppercase tracking-wider">
            Loudness Heat Map
          </div>
          <div className="text-[9px] font-mono text-zinc-600">
            2026 Dance Music Standards
          </div>
        </div>
        
        {/* Status badge */}
        <div className={`flex items-center gap-2 px-2 py-1 rounded border ${
          Math.abs(delta) < 1 
            ? 'border-green-500/30 bg-green-500/5' 
            : Math.abs(delta) < 2
            ? 'border-yellow-500/30 bg-yellow-500/5'
            : 'border-red-500/30 bg-red-500/5'
        }`}>
          {Math.abs(delta) < 1 ? (
            <Shield className="w-3 h-3 text-green-400" />
          ) : (
            <AlertTriangle className="w-3 h-3 text-amber-400" />
          )}
          <span className={`text-xs font-mono font-semibold ${
            Math.abs(delta) < 1 ? 'text-green-400' : 
            Math.abs(delta) < 2 ? 'text-yellow-400' : 'text-red-400'
          }`}>
            {Math.abs(delta) < 1 ? 'On Target' : 
             Math.abs(delta) < 2 ? 'Close' : 'Adjust'}
          </span>
        </div>
      </div>
      
      {/* Heat map bar */}
      <div className="relative border-2 border-zinc-800 rounded-lg p-4 bg-zinc-950">
        {/* Background gradient bar */}
        <div className="relative h-12 rounded-lg overflow-hidden">
          {/* Gradient zones */}
          <div className="absolute inset-0 flex">
            {/* Blue: Streaming (-14 to -12) */}
            <div className="flex-1 bg-gradient-to-r from-blue-900 to-blue-700" />
            {/* Green: Club standard (-12 to -9) */}
            <div className="flex-1 bg-gradient-to-r from-blue-700 to-green-600" />
            {/* Yellow: Aggressive (-9 to -7) */}
            <div className="flex-1 bg-gradient-to-r from-green-600 to-yellow-500" />
            {/* Orange: Heavy (-7 to -5) */}
            <div className="flex-1 bg-gradient-to-r from-yellow-500 to-orange-500" />
            {/* Red: Maximum (-5 to 0) */}
            <div className="flex-1 bg-gradient-to-r from-orange-500 to-red-600" />
          </div>
          
          {/* Zone labels */}
          <div className="absolute inset-0 flex items-center justify-around text-[8px] font-mono font-bold text-white/80 uppercase tracking-wider">
            <span>Stream</span>
            <span>Club</span>
            <span>Aggressive</span>
            <span>Heavy</span>
            <span>Max</span>
          </div>
          
          {/* Target marker */}
          <motion.div
            className="absolute top-0 bottom-0 w-1"
            style={{
              left: `${lufsToPercent(targetLUFS)}%`,
              background: 'white',
              boxShadow: '0 0 10px rgba(255,255,255,0.8)'
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            {/* Arrow pointing down */}
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-white" />
          </motion.div>
          
          {/* Current level indicator */}
          <motion.div
            className="absolute top-0 bottom-0 w-2 rounded"
            style={{
              left: `${lufsToPercent(currentLUFS)}%`,
              background: zone.color,
              boxShadow: `0 0 15px ${zone.color}`
            }}
            initial={{ left: '50%' }}
            animate={{ left: `${lufsToPercent(currentLUFS)}%` }}
            transition={{ type: 'spring', damping: 20 }}
          >
            {/* Glow effect */}
            <motion.div
              className="absolute inset-0 rounded"
              style={{ background: zone.color }}
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ repeat: Infinity, duration: 1.5 }}
            />
          </motion.div>
        </div>
        
        {/* LUFS scale */}
        <div className="flex justify-between mt-2 text-[9px] font-mono text-zinc-500">
          <span>-14</span>
          <span>-12</span>
          <span>-9</span>
          <span>-7</span>
          <span>-5</span>
          <span>0</span>
        </div>
      </div>
      
      {/* Readings */}
      <div className="grid grid-cols-3 gap-2">
        {/* Current LUFS */}
        <div className="border-2 border-zinc-800 rounded-lg p-3 bg-zinc-950">
          <div className="flex items-center gap-2 mb-1">
            <Volume2 className="w-3 h-3 text-zinc-500" />
            <div className="text-[9px] font-mono text-zinc-500 uppercase">Current</div>
          </div>
          <div className="text-2xl font-mono font-bold" style={{ color: zone.color }}>
            {currentLUFS.toFixed(1)}
          </div>
          <div className="text-[8px] font-mono text-zinc-600">LUFS</div>
        </div>
        
        {/* Target LUFS */}
        <div className="border-2 border-zinc-800 rounded-lg p-3 bg-zinc-950">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-3 h-3 rounded-full bg-white" />
            <div className="text-[9px] font-mono text-zinc-500 uppercase">Target</div>
          </div>
          <div className="text-2xl font-mono font-bold text-white">
            {targetLUFS.toFixed(1)}
          </div>
          <div className="text-[8px] font-mono text-zinc-600">LUFS</div>
        </div>
        
        {/* Delta */}
        <div className="border-2 border-zinc-800 rounded-lg p-3 bg-zinc-950">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className={`w-3 h-3 ${
              Math.abs(delta) < 1 ? 'text-green-400' :
              Math.abs(delta) < 2 ? 'text-yellow-400' : 'text-red-400'
            }`} />
            <div className="text-[9px] font-mono text-zinc-500 uppercase">Delta</div>
          </div>
          <div className={`text-2xl font-mono font-bold ${
            Math.abs(delta) < 1 ? 'text-green-400' :
            Math.abs(delta) < 2 ? 'text-yellow-400' : 'text-red-400'
          }`}>
            {delta > 0 ? '+' : ''}{delta.toFixed(1)}
          </div>
          <div className="text-[8px] font-mono text-zinc-600">dB</div>
        </div>
      </div>
      
      {/* Short-term & Peak */}
      {(shortTermLUFS !== undefined || peakLevel !== undefined) && (
        <div className="grid grid-cols-2 gap-2">
          {shortTermLUFS !== undefined && (
            <div className="border border-zinc-800 rounded p-2 bg-zinc-950">
              <div className="text-[8px] font-mono text-zinc-500 uppercase mb-1">
                Short-Term Max
              </div>
              <div className="text-sm font-mono font-bold text-cyan-400">
                {shortTermLUFS.toFixed(1)} LUFS
              </div>
            </div>
          )}
          
          {peakLevel !== undefined && (
            <div className="border border-zinc-800 rounded p-2 bg-zinc-950">
              <div className="text-[8px] font-mono text-zinc-500 uppercase mb-1">
                True Peak
              </div>
              <div className={`text-sm font-mono font-bold ${
                peakLevel > -0.1 ? 'text-red-400' :
                peakLevel > -0.5 ? 'text-amber-400' : 'text-green-400'
              }`}>
                {peakLevel.toFixed(2)} dBTP
              </div>
            </div>
          )}
        </div>
      )}
      
      {/* Zone info */}
      <div className={`border-2 rounded-lg p-3`} style={{
        borderColor: `${zone.color}40`,
        background: `${zone.color}08`
      }}>
        <div className="flex items-center gap-2 mb-2">
          <div className="w-2 h-2 rounded-full" style={{ background: zone.color }} />
          <div className="text-xs font-mono font-semibold uppercase tracking-wider" style={{ color: zone.color }}>
            {zone.name}
          </div>
        </div>
        <div className="text-[9px] font-mono text-zinc-400 leading-relaxed">
          {zone.description}
        </div>
      </div>
      
      {/* Recommendations */}
      {Math.abs(delta) > 1 && (
        <div className="border-2 border-amber-500/30 rounded-lg p-3 bg-amber-500/5">
          <div className="text-xs font-mono text-amber-400 uppercase tracking-wider mb-2">
            Recommendation
          </div>
          <div className="text-[9px] font-mono text-zinc-400">
            {delta > 1 
              ? `Track is ${delta.toFixed(1)}dB too loud. Reduce output gain or decrease compressor ratio.`
              : `Track is ${Math.abs(delta).toFixed(1)}dB too quiet. Increase output gain or apply more compression.`
            }
          </div>
        </div>
      )}
      
      {/* Limiter mode */}
      {limiterMode !== undefined && (
        <div className="border-2 border-zinc-800 rounded-lg p-3 bg-zinc-950">
          <div className="flex items-center gap-2 mb-1">
            <Zap className="w-3 h-3 text-zinc-500" />
            <div className="text-[9px] font-mono text-zinc-500 uppercase">Limiter Mode</div>
          </div>
          <div className="text-2xl font-mono font-bold text-white">
            {LIMITER_MODES[limiterMode]}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Get zone information based on LUFS value
 */
function getZone(lufs: number): {
  name: string;
  color: string;
  description: string;
} {
  if (lufs >= -5) {
    return {
      name: 'Maximum (D&B/Competition)',
      color: '#ef4444',
      description: 'Extreme loudness for club/festival play. May cause listener fatigue. Use only for D&B, Dubstep, or competition mixes.'
    };
  } else if (lufs >= -7) {
    return {
      name: 'Heavy Saturation (Tech House)',
      color: '#f97316',
      description: 'Aggressive loudness for club systems. Common in Tech House, peak-time Techno. Provides maximum energy but reduces dynamics.'
    };
  } else if (lufs >= -9) {
    return {
      name: 'Aggressive (Techno/House)',
      color: '#eab308',
      description: 'Standard club loudness. Balances impact with dynamics. Ideal for Techno, Progressive House, and peak-time sets.'
    };
  } else if (lufs >= -12) {
    return {
      name: 'Club Standard (Balanced)',
      color: '#22c55e',
      description: 'Balanced loudness for club and streaming. Works well for House, Trance, and commercial dance music. Maintains dynamics.'
    };
  } else {
    return {
      name: 'Streaming Safe',
      color: '#3b82f6',
      description: 'Optimized for Spotify/Apple Music. Prevents normalization penalties. Best for Lo-Fi, Chill, and streaming-focused releases.'
    };
  }
}

/**
 * Convert LUFS to percentage position on bar (0-100%)
 */
function lufsToPercent(lufs: number): number {
  // Map -14 LUFS to 0%, 0 LUFS to 100%
  const min = -14;
  const max = 0;
  const clamped = Math.max(min, Math.min(max, lufs));
  return ((clamped - min) / (max - min)) * 100;
}