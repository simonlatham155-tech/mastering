import { motion } from 'motion/react';
import { AlertTriangle, ThumbsUp, AlertCircle } from 'lucide-react';
import { MatchingGains } from '../services/reference-matching-controller';

interface DeltaVisualizerProps {
  matchingGains: MatchingGains | null;
  matchStrength: number; // 0-100
}

/**
 * DELTA VISUALIZER
 * Shows the "difference" between user's track and reference
 * 
 * Instead of showing the full EQ curve, this shows corrections needed:
 * - Red dip if track is too "muddy" (250Hz)
 * - Green boost if track is too "dark" (8kHz)
 * - Safety warnings for extreme deltas (>8dB)
 */
export function DeltaVisualizer({ matchingGains, matchStrength }: DeltaVisualizerProps) {
  if (!matchingGains) {
    return null;
  }
  
  const { bands, autoGain, warnings, deltaVisualization } = matchingGains;
  
  // ISO band labels
  const bandLabels = ['31', '63', '125', '250', '500', '1k', '2k', '4k', '8k', '16k'];
  
  // Find the most problematic band
  const maxDelta = Math.max(...bands.map(Math.abs));
  const hasExtremeCorrection = maxDelta > 8;
  
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-mono text-zinc-400 uppercase tracking-wider">
            Delta Visualization
          </div>
          <div className="text-[9px] font-mono text-zinc-600">
            Shows the difference (corrections) at {matchStrength}% strength
          </div>
        </div>
        
        {/* Overall status */}
        {hasExtremeCorrection ? (
          <div className="flex items-center gap-1 text-xs font-mono text-amber-400">
            <AlertTriangle className="w-3 h-3" />
            <span>Large Corrections</span>
          </div>
        ) : (
          <div className="flex items-center gap-1 text-xs font-mono text-green-400">
            <ThumbsUp className="w-3 h-3" />
            <span>Healthy Mix</span>
          </div>
        )}
      </div>
      
      {/* Delta Bars */}
      <div className="border-2 border-zinc-800 rounded-lg p-4 bg-zinc-950">
        <div className="space-y-3">
          {bands.map((delta, index) => {
            const isBoost = delta > 0;
            const isCut = delta < 0;
            const isNeutral = Math.abs(delta) < 0.5;
            const isExtreme = Math.abs(delta) > 8;
            
            const barWidth = Math.min(Math.abs(delta) * 8.33, 100); // 12dB = 100%
            
            return (
              <div key={index} className="relative">
                {/* Label and value */}
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-mono text-zinc-500">
                    {bandLabels[index]} Hz
                  </span>
                  <span className={`text-[10px] font-mono font-bold ${
                    isExtreme ? 'text-amber-400' :
                    isBoost ? 'text-green-400' :
                    isCut ? 'text-red-400' :
                    'text-zinc-600'
                  }`}>
                    {delta > 0 ? '+' : ''}{delta.toFixed(1)} dB
                  </span>
                </div>
                
                {/* Delta bar */}
                <div className="relative h-6 bg-zinc-900 rounded overflow-hidden border border-zinc-800">
                  {/* Center line */}
                  <div className="absolute left-1/2 top-0 bottom-0 w-px bg-zinc-700" />
                  
                  {/* Correction bar */}
                  {!isNeutral && (
                    <motion.div
                      className="absolute top-0 bottom-0"
                      style={{
                        left: isBoost ? '50%' : `${50 - barWidth}%`,
                        right: isBoost ? `${50 - barWidth}%` : '50%',
                        background: isExtreme 
                          ? (isBoost 
                              ? 'linear-gradient(90deg, transparent, #f59e0b)' 
                              : 'linear-gradient(90deg, #f59e0b, transparent)')
                          : (isBoost 
                              ? 'linear-gradient(90deg, transparent, #10b981)' 
                              : 'linear-gradient(90deg, #ef4444, transparent)')
                      }}
                      initial={{ width: 0 }}
                      animate={{ width: `${barWidth}%` }}
                      transition={{ duration: 0.5, ease: 'easeOut' }}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
        
        {/* Auto-gain indicator */}
        <div className="mt-4 pt-4 border-t border-zinc-800">
          <div className="flex items-center justify-between text-[9px] font-mono">
            <span className="text-zinc-500">Auto-Gain Compensation:</span>
            <span className={`font-bold ${
              autoGain > 0 ? 'text-green-400' :
              autoGain < 0 ? 'text-red-400' :
              'text-zinc-600'
            }`}>
              {autoGain > 0 ? '+' : ''}{autoGain.toFixed(1)} dB
            </span>
          </div>
          <div className="text-[8px] text-zinc-600 mt-1">
            Prevents "louder = better" bias by compensating for EQ level changes
          </div>
        </div>
      </div>
      
      {/* Issue Detection */}
      {(deltaVisualization.muddy || deltaVisualization.dark || deltaVisualization.boomy || deltaVisualization.harsh) && (
        <div className="border-2 border-amber-500/30 rounded-lg p-3 bg-amber-500/5">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="w-3 h-3 text-amber-400" />
            <div className="text-xs font-mono text-amber-400 uppercase tracking-wider">
              Mix Issues Detected
            </div>
          </div>
          <div className="space-y-1 text-[9px] font-mono text-zinc-400">
            {deltaVisualization.muddy && (
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-red-500"></div>
                <span><span className="text-red-400 font-semibold">Muddy:</span> Too much 250Hz (low-mids). Consider reducing in your mix.</span>
              </div>
            )}
            {deltaVisualization.dark && (
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                <span><span className="text-blue-400 font-semibold">Dark:</span> Not enough 8kHz (brilliance). Add air to your mix.</span>
              </div>
            )}
            {deltaVisualization.boomy && (
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-orange-500"></div>
                <span><span className="text-orange-400 font-semibold">Boomy:</span> Too much 31Hz (sub). Check your bass/kick levels.</span>
              </div>
            )}
            {deltaVisualization.harsh && (
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-yellow-500"></div>
                <span><span className="text-yellow-400 font-semibold">Harsh:</span> Too much 4kHz (edge). May cause listener fatigue.</span>
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Safety Warnings */}
      {warnings.length > 0 && (
        <div className="border-2 border-red-500/30 rounded-lg p-3 bg-red-500/5">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-3 h-3 text-red-400" />
            <div className="text-xs font-mono text-red-400 uppercase tracking-wider">
              Safety Warnings
            </div>
          </div>
          <div className="space-y-1 text-[9px] font-mono text-zinc-400">
            {warnings.map((warning, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-red-400">•</span>
                <span>{warning}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 pt-2 border-t border-red-500/20 text-[8px] font-mono text-zinc-500">
            Large corrections may indicate mixing issues. Consider adjusting your source mix before mastering.
          </div>
        </div>
      )}
      
      {/* Technical Info */}
      <div className="text-[8px] font-mono text-zinc-600 leading-relaxed">
        <span className="text-purple-400 font-semibold">AUTO-GAIN:</span> EQ boosts increase overall volume, 
        which can trick you into thinking it sounds "better." This platform automatically compensates for level 
        changes so you hear the <span className="text-cyan-400">tonal change</span>, not just a volume jump.
      </div>
    </div>
  );
}
