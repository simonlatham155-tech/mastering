import { motion } from 'motion/react';
import { Activity, Target, TrendingUp, Award, Info } from 'lucide-react';

interface ProfessionalLUFSMeterProps {
  momentaryLUFS?: number;   // 400ms window, fast-moving
  shortTermLUFS?: number;   // 3 second average, smooth
  integratedLUFS?: number;  // Final track average (gated)
  targetLUFS?: number;      // Target for genre (-14, -8, -6, etc.)
  genreName?: string;       // "Spotify Standard", "Club/Festival", etc.
  isProcessing?: boolean;
}

/**
 * PROFESSIONAL LUFS METER
 * ITU-R BS.1770-4 Compliant
 * 
 * THREE METERS:
 * 1. MOMENTARY (M): Fast-moving, shows current energy (drum hits, drops)
 * 2. SHORT-TERM (S): Smooth, shows section energy (verse vs chorus)
 * 3. INTEGRATED (I): Final average, the "official" loudness
 * 
 * VISUAL HIERARCHY:
 * - Momentary: Thin bar, cyan, fast updates
 * - Short-Term: Medium bar, purple, smooth
 * - Integrated: Large number, gold when on-target
 * 
 * TARGET OVERLAY:
 * Shows the "sweet spot" for the selected genre
 */
export function ProfessionalLUFSMeter({
  momentaryLUFS = -Infinity,
  shortTermLUFS = -Infinity,
  integratedLUFS = -Infinity,
  targetLUFS = -14,
  genreName = 'Spotify Standard',
  isProcessing = false
}: ProfessionalLUFSMeterProps) {
  
  // Meter range: -40 to 0 LUFS
  const minLUFS = -40;
  const maxLUFS = 0;
  
  // Convert LUFS to percentage (for bar positioning)
  const lufsToPercent = (lufs: number) => {
    if (lufs === -Infinity || isNaN(lufs)) return 0;
    return Math.max(0, Math.min(100, ((lufs - minLUFS) / (maxLUFS - minLUFS)) * 100));
  };
  
  // Check if Integrated is on-target (within ±1 LU)
  const isOnTarget = Math.abs(integratedLUFS - targetLUFS) <= 1.0 && integratedLUFS !== -Infinity;
  const isOverTarget = integratedLUFS > targetLUFS + 1.0;
  const isUnderTarget = integratedLUFS < targetLUFS - 1.0 && integratedLUFS !== -Infinity;
  
  // Target range for overlay (±1 LU)
  const targetRangeStart = lufsToPercent(targetLUFS - 1.0);
  const targetRangeEnd = lufsToPercent(targetLUFS + 1.0);
  const targetRangeWidth = targetRangeEnd - targetRangeStart;
  
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-cyan-400" />
          <div>
            <div className="text-xs font-mono text-cyan-400 font-bold uppercase">
              Professional LUFS Meter
            </div>
            <div className="text-[8px] font-mono text-zinc-600">
              ITU-R BS.1770-4 Compliant • K-Weighted • Gated
            </div>
          </div>
        </div>
        
        <div className="group relative">
          <Info className="w-3 h-3 text-zinc-600 cursor-help" />
          <div className="absolute right-0 top-full mt-2 w-96 p-3 bg-zinc-900 border border-zinc-700 rounded-lg text-[8px] font-mono text-zinc-400 leading-relaxed opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
            <div className="text-cyan-400 font-semibold mb-2">What is LUFS?</div>
            <div className="space-y-2">
              <div>
                <span className="text-white">LUFS (Loudness Units Full Scale)</span> is the 
                professional standard for measuring perceived loudness. Unlike peak meters, 
                LUFS accounts for how humans actually hear sound.
              </div>
              <div className="space-y-1">
                <div><span className="text-cyan-400">Momentary:</span> Current energy (400ms window)</div>
                <div><span className="text-purple-400">Short-Term:</span> Section energy (3 second average)</div>
                <div><span className="text-orange-400">Integrated:</span> Final track loudness (gated)</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Main meter visualization */}
      <div className="border-2 border-zinc-800 rounded-lg p-6 bg-black">
        {/* Integrated LUFS - Big number at top */}
        <div className="mb-6 text-center">
          <div className="text-[8px] font-mono text-zinc-600 uppercase mb-2">
            Integrated Loudness (Final Track Average)
          </div>
          
          <div className={`text-6xl font-mono font-bold tracking-tight ${
            isOnTarget ? 'text-yellow-400' :
            isOverTarget ? 'text-red-400' :
            isUnderTarget ? 'text-orange-400' :
            'text-zinc-600'
          }`}>
            {integratedLUFS === -Infinity ? '--.-' : integratedLUFS.toFixed(1)}
            <span className="text-2xl ml-2">LUFS</span>
          </div>
          
          {/* Target status */}
          <div className="mt-3">
            {isOnTarget && (
              <motion.div 
                className="inline-flex items-center gap-2 px-4 py-2 bg-yellow-500/10 border border-yellow-500/30 rounded-full"
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ repeat: Infinity, duration: 2 }}
              >
                <Award className="w-4 h-4 text-yellow-400" />
                <span className="text-xs font-mono text-yellow-400 font-semibold">
                  🎯 ON TARGET! ({targetLUFS} LUFS)
                </span>
              </motion.div>
            )}
            
            {isOverTarget && (
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-red-500/10 border border-red-500/30 rounded-full">
                <TrendingUp className="w-4 h-4 text-red-400" />
                <span className="text-xs font-mono text-red-400">
                  TOO LOUD (+{(integratedLUFS - targetLUFS).toFixed(1)} LU over target)
                </span>
              </div>
            )}
            
            {isUnderTarget && integratedLUFS !== -Infinity && (
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-orange-500/10 border border-orange-500/30 rounded-full">
                <TrendingUp className="w-4 h-4 text-orange-400 rotate-180" />
                <span className="text-xs font-mono text-orange-400">
                  TOO QUIET ({(targetLUFS - integratedLUFS).toFixed(1)} LU under target)
                </span>
              </div>
            )}
            
            {integratedLUFS === -Infinity && !isProcessing && (
              <div className="text-xs font-mono text-zinc-600">
                Waiting for audio...
              </div>
            )}
            
            {isProcessing && (
              <div className="text-xs font-mono text-cyan-400 animate-pulse">
                Measuring...
              </div>
            )}
          </div>
        </div>
        
        {/* Vertical meter visualization */}
        <div className="relative h-80 bg-zinc-950 rounded-lg border border-zinc-800 overflow-hidden">
          {/* Grid lines */}
          <div className="absolute inset-0">
            {[-40, -30, -20, -14, -8, -6, -3, 0].map((lufs) => (
              <div
                key={lufs}
                className="absolute left-0 right-0 border-t border-zinc-800"
                style={{ bottom: `${lufsToPercent(lufs)}%` }}
              >
                <span className="absolute left-2 -translate-y-1/2 text-[8px] font-mono text-zinc-600">
                  {lufs} LUFS
                </span>
              </div>
            ))}
          </div>
          
          {/* Target range overlay */}
          <div
            className="absolute left-0 right-0 bg-yellow-500/5 border-y border-yellow-500/30"
            style={{
              bottom: `${targetRangeStart}%`,
              height: `${targetRangeWidth}%`
            }}
          >
            <div className="absolute right-2 top-1/2 -translate-y-1/2 text-[8px] font-mono text-yellow-500">
              Target Range
            </div>
          </div>
          
          {/* Target line */}
          <div
            className="absolute left-0 right-0 border-t-2 border-yellow-500/50"
            style={{ bottom: `${lufsToPercent(targetLUFS)}%` }}
          >
            <div className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 px-2 py-0.5 bg-yellow-500 text-black text-[8px] font-mono font-bold rounded">
              {targetLUFS} LUFS ({genreName})
            </div>
          </div>
          
          {/* Three meter bars */}
          <div className="absolute inset-0 flex items-end justify-center gap-6 px-12 pb-4">
            {/* Momentary (fast, thin) */}
            <div className="flex-1 flex flex-col items-center gap-2">
              <div className="relative w-full h-full bg-zinc-900 rounded-full overflow-hidden border border-zinc-800">
                <motion.div
                  className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-cyan-500 to-cyan-300 rounded-full"
                  style={{
                    height: `${lufsToPercent(momentaryLUFS)}%`
                  }}
                  animate={{
                    height: `${lufsToPercent(momentaryLUFS)}%`,
                    opacity: momentaryLUFS === -Infinity ? 0 : 1
                  }}
                  transition={{ duration: 0.05 }} // Fast updates
                />
              </div>
              <div className="text-[8px] font-mono text-cyan-400 text-center">
                <div className="font-semibold">MOMENTARY</div>
                <div className="text-[10px] font-bold">
                  {momentaryLUFS === -Infinity ? '--.-' : momentaryLUFS.toFixed(1)}
                </div>
                <div className="text-zinc-600">400ms</div>
              </div>
            </div>
            
            {/* Short-Term (smooth, medium) */}
            <div className="flex-1 flex flex-col items-center gap-2">
              <div className="relative w-full h-full bg-zinc-900 rounded-full overflow-hidden border border-zinc-800">
                <motion.div
                  className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-purple-500 to-purple-300 rounded-full"
                  style={{
                    height: `${lufsToPercent(shortTermLUFS)}%`
                  }}
                  animate={{
                    height: `${lufsToPercent(shortTermLUFS)}%`,
                    opacity: shortTermLUFS === -Infinity ? 0 : 1
                  }}
                  transition={{ duration: 0.2 }} // Smooth updates
                />
              </div>
              <div className="text-[8px] font-mono text-purple-400 text-center">
                <div className="font-semibold">SHORT-TERM</div>
                <div className="text-[10px] font-bold">
                  {shortTermLUFS === -Infinity ? '--.-' : shortTermLUFS.toFixed(1)}
                </div>
                <div className="text-zinc-600">3 sec</div>
              </div>
            </div>
            
            {/* Integrated (static, wide) */}
            <div className="flex-1 flex flex-col items-center gap-2">
              <div className="relative w-full h-full bg-zinc-900 rounded-full overflow-hidden border border-zinc-800">
                <motion.div
                  className={`absolute bottom-0 left-0 right-0 rounded-full ${
                    isOnTarget
                      ? 'bg-gradient-to-t from-yellow-500 to-yellow-300'
                      : isOverTarget
                      ? 'bg-gradient-to-t from-red-500 to-red-300'
                      : 'bg-gradient-to-t from-orange-500 to-orange-300'
                  }`}
                  style={{
                    height: `${lufsToPercent(integratedLUFS)}%`
                  }}
                  animate={{
                    height: `${lufsToPercent(integratedLUFS)}%`,
                    opacity: integratedLUFS === -Infinity ? 0 : 1
                  }}
                  transition={{ duration: 0.5 }} // Slow, deliberate
                />
                
                {/* Glow effect when on-target */}
                {isOnTarget && (
                  <motion.div
                    className="absolute bottom-0 left-0 right-0 bg-yellow-500 blur-xl"
                    style={{
                      height: `${lufsToPercent(integratedLUFS)}%`
                    }}
                    animate={{
                      opacity: [0.3, 0.6, 0.3]
                    }}
                    transition={{
                      repeat: Infinity,
                      duration: 2
                    }}
                  />
                )}
              </div>
              <div className={`text-[8px] font-mono text-center ${
                isOnTarget ? 'text-yellow-400' :
                isOverTarget ? 'text-red-400' : 'text-orange-400'
              }`}>
                <div className="font-semibold">INTEGRATED</div>
                <div className="text-[10px] font-bold">
                  {integratedLUFS === -Infinity ? '--.-' : integratedLUFS.toFixed(1)}
                </div>
                <div className="text-zinc-600">Gated</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Technical details */}
      <div className="grid grid-cols-3 gap-4">
        <div className="border-2 border-cyan-800 rounded-lg p-3 bg-cyan-950/20">
          <div className="text-[8px] font-mono text-zinc-500 uppercase mb-1">
            Momentary (M):
          </div>
          <div className="text-xs font-mono text-cyan-400 leading-relaxed">
            400ms window, 100ms hop. Shows current energy (drum hits, synth plucks).
          </div>
        </div>
        
        <div className="border-2 border-purple-800 rounded-lg p-3 bg-purple-950/20">
          <div className="text-[8px] font-mono text-zinc-500 uppercase mb-1">
            Short-Term (S):
          </div>
          <div className="text-xs font-mono text-purple-400 leading-relaxed">
            3 second average. Shows section energy (verse vs drop).
          </div>
        </div>
        
        <div className={`border-2 rounded-lg p-3 ${
          isOnTarget
            ? 'border-yellow-800 bg-yellow-950/20'
            : 'border-orange-800 bg-orange-950/20'
        }`}>
          <div className="text-[8px] font-mono text-zinc-500 uppercase mb-1">
            Integrated (I):
          </div>
          <div className={`text-xs font-mono leading-relaxed ${
            isOnTarget ? 'text-yellow-400' : 'text-orange-400'
          }`}>
            Final track average (gated). The "official" loudness.
          </div>
        </div>
      </div>
      
      {/* Gating info */}
      <div className="border-2 border-zinc-800 rounded-lg p-4 bg-zinc-950">
        <div className="text-[8px] font-mono text-zinc-500 uppercase mb-2">
          ITU-R BS.1770-4 Gating:
        </div>
        <div className="grid grid-cols-2 gap-4 text-[9px] font-mono text-zinc-400">
          <div>
            <span className="text-white font-semibold">Absolute Gate:</span> Blocks 
            below -70 LUFS are ignored (removes silence).
          </div>
          <div>
            <span className="text-white font-semibold">Relative Gate:</span> Blocks 
            10 LU below average are ignored (removes quiet sections).
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-zinc-800 text-[8px] font-mono text-zinc-600">
          This prevents silence and quiet sections from skewing the measurement, giving 
          you the "true" loudness of the musical content.
        </div>
      </div>
      
      {/* K-Weighting info */}
      <div className="border-2 border-cyan-800 rounded-lg p-4 bg-cyan-950/10">
        <div className="text-[8px] font-mono text-cyan-400 uppercase mb-2">
          K-Weighting Filter (Human Hearing Model):
        </div>
        <div className="space-y-2 text-[9px] font-mono text-zinc-400 leading-relaxed">
          <div>
            <span className="text-cyan-400">Stage 1 (Pre-filter):</span> High-shelf 
            at 1.68kHz (+4dB) models the acoustic effects of the human head.
          </div>
          <div>
            <span className="text-cyan-400">Stage 2 (RLB filter):</span> High-pass 
            at 38Hz removes low-frequency bias.
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-cyan-800/30 text-[8px] font-mono text-zinc-600">
          These filters make LUFS measure loudness the way humans actually perceive it, 
          unlike simple RMS or peak meters.
        </div>
      </div>
      
      {/* Target presets */}
      <div className="border-2 border-yellow-800 rounded-lg p-4 bg-yellow-950/10">
        <div className="text-[8px] font-mono text-yellow-400 uppercase mb-3">
          Industry Standard Targets:
        </div>
        <div className="grid grid-cols-2 gap-2 text-[9px] font-mono">
          <div className={`p-2 rounded ${targetLUFS === -14 ? 'bg-yellow-500/20 border border-yellow-500/50' : 'bg-zinc-900'}`}>
            <span className="text-white font-bold">-14 LUFS</span>
            <span className="text-zinc-500 ml-2">Spotify/Apple Music</span>
          </div>
          <div className={`p-2 rounded ${targetLUFS === -16 ? 'bg-yellow-500/20 border border-yellow-500/50' : 'bg-zinc-900'}`}>
            <span className="text-white font-bold">-16 LUFS</span>
            <span className="text-zinc-500 ml-2">YouTube</span>
          </div>
          <div className={`p-2 rounded ${targetLUFS === -8 ? 'bg-yellow-500/20 border border-yellow-500/50' : 'bg-zinc-900'}`}>
            <span className="text-white font-bold">-8 LUFS</span>
            <span className="text-zinc-500 ml-2">Club/Festival</span>
          </div>
          <div className={`p-2 rounded ${targetLUFS === -6 ? 'bg-yellow-500/20 border border-yellow-500/50' : 'bg-zinc-900'}`}>
            <span className="text-white font-bold">-6 LUFS</span>
            <span className="text-zinc-500 ml-2">Drum & Bass</span>
          </div>
        </div>
      </div>
    </div>
  );
}
