import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Target, Wand2, Check, AlertTriangle } from 'lucide-react';
import { SpectralProfile, MatchingDelta } from '../services/spectral-analyzer';
import { ReferenceCurve } from '../data/reference-curves';

interface TonalBalanceVisualizerProps {
  sourceProfile: SpectralProfile | null;
  referenceProfile: SpectralProfile | null;
  referenceCurve: ReferenceCurve | null;
  matchingDelta: MatchingDelta | null;
  isMatching: boolean;
  matchStrength: number; // 0-100
  onMatchStrengthChange: (strength: number) => void;
  onApplyMatching: () => void;
}

export function TonalBalanceVisualizer({
  sourceProfile,
  referenceProfile,
  referenceCurve,
  matchingDelta,
  isMatching,
  matchStrength,
  onMatchStrengthChange,
  onApplyMatching
}: TonalBalanceVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [matchQuality, setMatchQuality] = useState<number>(0); // 0-100
  
  // Calculate match quality (how close source is to reference)
  useEffect(() => {
    if (!sourceProfile || !referenceProfile) {
      setMatchQuality(0);
      return;
    }
    
    // Calculate RMS error between profiles
    const bands = Object.keys(sourceProfile.bands) as Array<keyof typeof sourceProfile.bands>;
    let totalError = 0;
    
    bands.forEach(band => {
      const diff = sourceProfile.bands[band] - referenceProfile.bands[band];
      totalError += diff * diff;
    });
    
    const rmsError = Math.sqrt(totalError / bands.length);
    
    // Convert to quality score (0-100, where 100 = perfect match)
    // Typical error range: 0-20dB RMS
    const quality = Math.max(0, Math.min(100, 100 - (rmsError * 5)));
    setMatchQuality(quality);
  }, [sourceProfile, referenceProfile]);
  
  // Render the tonal balance graph
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const width = canvas.width;
    const height = canvas.height;
    
    // Clear
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, width, height);
    
    // Draw grid
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 1;
    
    // Horizontal lines (every 3dB)
    for (let db = -60; db <= 0; db += 3) {
      const y = height - ((db + 60) / 60) * height;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
      
      // Labels
      if (db % 6 === 0) {
        ctx.fillStyle = '#3f3f46';
        ctx.font = '8px monospace';
        ctx.textAlign = 'right';
        ctx.fillText(`${db}`, width - 5, y + 3);
      }
    }
    
    // Band positions (logarithmic frequency scale)
    const bands = [
      { name: 'Sub', freq: 40, x: 0.05 },
      { name: 'Low', freq: 100, x: 0.15 },
      { name: 'L-Mid', freq: 250, x: 0.25 },
      { name: 'Mid', freq: 600, x: 0.35 },
      { name: 'U-Mid', freq: 1200, x: 0.45 },
      { name: 'Pres', freq: 3000, x: 0.55 },
      { name: 'Bril', freq: 6000, x: 0.65 },
      { name: 'Air', freq: 10000, x: 0.75 },
      { name: 'U-Hi', freq: 14000, x: 0.85 },
      { name: 'Top', freq: 18000, x: 0.95 }
    ];
    
    // === TARGET ZONE (shaded area) ===
    if (referenceProfile && referenceCurve) {
      ctx.fillStyle = 'rgba(139, 92, 246, 0.15)'; // Purple zone
      ctx.beginPath();
      
      // Top boundary (+3dB tolerance)
      bands.forEach((band, i) => {
        const key = Object.keys(referenceProfile.bands)[i] as keyof typeof referenceProfile.bands;
        const value = referenceProfile.bands[key] + 3;
        const x = band.x * width;
        const y = height - ((value + 60) / 60) * height;
        
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      
      // Bottom boundary (-3dB tolerance)
      for (let i = bands.length - 1; i >= 0; i--) {
        const band = bands[i];
        const key = Object.keys(referenceProfile.bands)[i] as keyof typeof referenceProfile.bands;
        const value = referenceProfile.bands[key] - 3;
        const x = band.x * width;
        const y = height - ((value + 60) / 60) * height;
        ctx.lineTo(x, y);
      }
      
      ctx.closePath();
      ctx.fill();
      
      // Reference line (center of target zone)
      const gradient = ctx.createLinearGradient(0, 0, width, 0);
      gradient.addColorStop(0, '#8b5cf6');
      gradient.addColorStop(0.5, '#a78bfa');
      gradient.addColorStop(1, '#c4b5fd');
      
      ctx.strokeStyle = gradient;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      
      bands.forEach((band, i) => {
        const key = Object.keys(referenceProfile.bands)[i] as keyof typeof referenceProfile.bands;
        const value = referenceProfile.bands[key];
        const x = band.x * width;
        const y = height - ((value + 60) / 60) * height;
        
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      
      ctx.stroke();
      ctx.setLineDash([]);
    }
    
    // === CURRENT LINE (user's track) ===
    if (sourceProfile) {
      const sourceGradient = ctx.createLinearGradient(0, 0, width, 0);
      sourceGradient.addColorStop(0, '#3b82f6');
      sourceGradient.addColorStop(0.5, '#06b6d4');
      sourceGradient.addColorStop(1, '#14b8a6');
      
      ctx.strokeStyle = sourceGradient;
      ctx.lineWidth = 3;
      ctx.beginPath();
      
      bands.forEach((band, i) => {
        const key = Object.keys(sourceProfile.bands)[i] as keyof typeof sourceProfile.bands;
        const value = sourceProfile.bands[key];
        const x = band.x * width;
        const y = height - ((value + 60) / 60) * height;
        
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      
      ctx.stroke();
      
      // Draw points
      bands.forEach((band, i) => {
        const key = Object.keys(sourceProfile.bands)[i] as keyof typeof sourceProfile.bands;
        const value = sourceProfile.bands[key];
        const x = band.x * width;
        const y = height - ((value + 60) / 60) * height;
        
        // Check if point is inside target zone
        const isInZone = referenceProfile && Math.abs(
          value - referenceProfile.bands[key]
        ) <= 3;
        
        ctx.fillStyle = isInZone ? '#10b981' : '#ef4444';
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
        
        // Outline
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.stroke();
      });
    }
    
    // Band labels
    ctx.fillStyle = '#52525b';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    
    bands.forEach(band => {
      const x = band.x * width;
      ctx.fillText(band.name, x, height - 5);
    });
    
    // Axis labels
    ctx.fillStyle = '#71717a';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('FREQUENCY', width / 2, height - 20);
    
    ctx.save();
    ctx.translate(15, height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('LEVEL (dB)', 0, 0);
    ctx.restore();
    
  }, [sourceProfile, referenceProfile, referenceCurve]);
  
  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <div className="text-xs font-mono text-zinc-400 uppercase tracking-wider mb-1 flex items-center gap-2">
          <Target className="w-3 h-3" />
          Tonal Balance (Reference Matching)
        </div>
        <div className="text-[9px] font-mono text-zinc-600">
          {referenceCurve 
            ? `Target: ${referenceCurve.name} • ${referenceCurve.description}`
            : 'Select a genre profile to enable reference matching'
          }
        </div>
      </div>
      
      {/* Canvas */}
      <div className="relative border-2 border-zinc-800 rounded-lg overflow-hidden bg-zinc-950">
        <canvas
          ref={canvasRef}
          width={600}
          height={300}
          className="w-full"
          style={{ imageRendering: 'crisp-edges' }}
        />
        
        {/* Legend */}
        <div className="absolute top-3 left-3 bg-black/80 backdrop-blur-sm rounded border border-zinc-700 p-2">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="w-4 h-3 bg-purple-500/20 border border-purple-500/40"></div>
              <span className="text-[8px] font-mono text-zinc-400">Target Zone (±3dB)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-0.5 bg-purple-400" style={{ borderStyle: 'dashed' }}></div>
              <span className="text-[8px] font-mono text-zinc-400">Reference ({referenceCurve?.name || 'None'})</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-0.5 bg-gradient-to-r from-blue-500 via-cyan-400 to-teal-400"></div>
              <span className="text-[8px] font-mono text-zinc-400">Your Track</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500"></div>
              <span className="text-[8px] font-mono text-zinc-400">In Zone</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-red-500"></div>
              <span className="text-[8px] font-mono text-zinc-400">Out of Zone</span>
            </div>
          </div>
        </div>
        
        {/* Match Quality Badge */}
        {sourceProfile && referenceProfile && (
          <div className="absolute top-3 right-3 bg-black/80 backdrop-blur-sm rounded border border-zinc-700 p-2">
            <div className="text-[8px] font-mono text-zinc-600 uppercase tracking-wider mb-1">
              Match Quality
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                <motion.div
                  className="h-full"
                  style={{
                    width: `${matchQuality}%`,
                    background: matchQuality > 80 
                      ? 'linear-gradient(90deg, #10b981, #34d399)'
                      : matchQuality > 50
                      ? 'linear-gradient(90deg, #f59e0b, #fbbf24)'
                      : 'linear-gradient(90deg, #ef4444, #f87171)'
                  }}
                  animate={{ width: `${matchQuality}%` }}
                  transition={{ duration: 0.5 }}
                />
              </div>
              <div className={`text-xs font-mono font-bold ${
                matchQuality > 80 ? 'text-green-400' :
                matchQuality > 50 ? 'text-amber-400' :
                'text-red-400'
              }`}>
                {matchQuality.toFixed(0)}%
              </div>
            </div>
          </div>
        )}
      </div>
      
      {/* Matching Controls */}
      <div className="space-y-4">
        {/* Matching Strength Slider */}
        <div className="border-2 border-zinc-800 rounded-lg p-4 bg-zinc-950">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-xs font-mono text-zinc-400 uppercase tracking-wider">
                Matching Strength
              </div>
              <div className="text-[8px] font-mono text-zinc-600 mt-0.5">
                Pro-masters use 30-50% to preserve original character
              </div>
            </div>
            <div className="text-lg font-mono font-bold text-purple-400">
              {matchStrength}%
            </div>
          </div>
          
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={matchStrength}
            onChange={(e) => onMatchStrengthChange(parseFloat(e.target.value))}
            className="w-full h-3 bg-zinc-800 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-gradient-to-br [&::-webkit-slider-thumb]:from-purple-500 [&::-webkit-slider-thumb]:to-pink-500 [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:shadow-purple-500/50"
          />
          
          {/* Strength presets */}
          <div className="flex items-center justify-between mt-2 text-[8px] font-mono text-zinc-600">
            <button
              onClick={() => onMatchStrengthChange(0)}
              className="hover:text-purple-400 transition-colors"
            >
              0% (Off)
            </button>
            <button
              onClick={() => onMatchStrengthChange(30)}
              className="hover:text-purple-400 transition-colors"
            >
              30% (Subtle)
            </button>
            <button
              onClick={() => onMatchStrengthChange(50)}
              className="hover:text-purple-400 transition-colors"
            >
              50% (Balanced)
            </button>
            <button
              onClick={() => onMatchStrengthChange(75)}
              className="hover:text-purple-400 transition-colors"
            >
              75% (Strong)
            </button>
            <button
              onClick={() => onMatchStrengthChange(100)}
              className="hover:text-purple-400 transition-colors"
            >
              100% (Full)
            </button>
          </div>
        </div>
        
        {/* Apply Button & Delta */}
        <div className="flex items-start gap-4">
        {/* Apply Matching Button */}
        <button
          onClick={onApplyMatching}
          disabled={!sourceProfile || !referenceProfile || isMatching || matchQuality > 95}
          className="flex-1 px-4 py-3 rounded-lg border-2 transition-all disabled:opacity-30 disabled:cursor-not-allowed bg-gradient-to-br from-purple-600 to-pink-600 border-purple-500 hover:from-purple-500 hover:to-pink-500 shadow-lg shadow-purple-500/30"
        >
          <div className="flex items-center justify-center gap-2">
            {isMatching ? (
              <>
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                >
                  <Wand2 className="w-4 h-4 text-white" />
                </motion.div>
                <span className="text-sm font-mono text-white uppercase tracking-wider">
                  Matching...
                </span>
              </>
            ) : matchQuality > 95 ? (
              <>
                <Check className="w-4 h-4 text-white" />
                <span className="text-sm font-mono text-white uppercase tracking-wider">
                  Perfect Match
                </span>
              </>
            ) : (
              <>
                <Wand2 className="w-4 h-4 text-white" />
                <span className="text-sm font-mono text-white uppercase tracking-wider">
                  Fix It (AI Match)
                </span>
              </>
            )}
          </div>
          <div className="text-[8px] font-mono text-white/70 mt-1">
            {matchQuality > 95 
              ? 'Your track matches the target perfectly'
              : `Apply ${matchStrength}% matching strength`
            }
          </div>
        </button>
        
        {/* Delta Display */}
        {matchingDelta && (
          <div className="flex-1 border-2 border-zinc-800 rounded-lg p-3 bg-zinc-950">
            <div className="text-[9px] font-mono text-zinc-400 uppercase tracking-wider mb-2">
              Corrections Needed
            </div>
            <div className="grid grid-cols-5 gap-1 text-[8px] font-mono">
              {Object.entries(matchingDelta.bands).map(([band, delta]) => {
                const adjustedDelta = delta * (matchStrength / 100);
                return (
                  <div 
                    key={band}
                    className={`text-center p-1 rounded ${
                      Math.abs(adjustedDelta) > 3 ? 'bg-red-500/20 text-red-400' :
                      Math.abs(adjustedDelta) > 1 ? 'bg-amber-500/20 text-amber-400' :
                      'bg-green-500/20 text-green-400'
                    }`}
                  >
                    <div className="text-zinc-600 uppercase">{band.replace('hz', '')}</div>
                    <div className="font-bold">
                      {adjustedDelta > 0 ? '+' : ''}{adjustedDelta.toFixed(1)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        </div>
      </div>
      
      {/* Technical Info */}
      <div className="text-[9px] font-mono text-zinc-600 leading-relaxed">
        <span className="text-purple-400 font-semibold">HOW IT WORKS:</span> FFT analysis compares your track's 
        spectral profile against golden master references. The "Fix It" button applies surgical EQ corrections 
        (10-band matching) to shift your curve into the target zone. This is how <span className="text-cyan-400">iZotope Ozone</span> and{' '}
        <span className="text-cyan-400">LANDR</span> achieve "AI mastering."
      </div>
    </div>
  );
}