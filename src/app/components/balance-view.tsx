import { motion } from 'motion/react';
import { TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { MatchingDelta } from '../services/spectral-analyzer';

interface BalanceViewProps {
  matchingDelta: MatchingDelta | null;
  matchStrength: number; // 0-100
}

/**
 * BALANCE VIEW COMPONENT
 * Shows which regions (Low, Mid, High) are being corrected most heavily
 * This is simpler than showing 10 individual sliders and more intuitive
 */
export function BalanceView({ matchingDelta, matchStrength }: BalanceViewProps) {
  if (!matchingDelta) {
    return (
      <div className="border-2 border-zinc-800 rounded-lg p-6 bg-zinc-950">
        <div className="text-center text-zinc-600 text-sm font-mono">
          Upload a track and select a genre to see balance corrections
        </div>
      </div>
    );
  }
  
  // Group bands into regions
  const lowCorrection = (
    matchingDelta.bands.hz31 +
    matchingDelta.bands.hz63 +
    matchingDelta.bands.hz125
  ) / 3;
  
  const midCorrection = (
    matchingDelta.bands.hz250 +
    matchingDelta.bands.hz500 +
    matchingDelta.bands.hz1k +
    matchingDelta.bands.hz2k
  ) / 4;
  
  const highCorrection = (
    matchingDelta.bands.hz4k +
    matchingDelta.bands.hz8k +
    matchingDelta.bands.hz16k
  ) / 3;
  
  // Apply match strength
  const lowCorrectionAdjusted = lowCorrection * (matchStrength / 100);
  const midCorrectionAdjusted = midCorrection * (matchStrength / 100);
  const highCorrectionAdjusted = highCorrection * (matchStrength / 100);
  
  // Helper to render correction bar
  const renderCorrectionBar = (
    label: string,
    correction: number,
    color: string,
    bandDetails: Array<{ freq: string; correction: number }>
  ) => {
    const isBoost = correction > 0;
    const isCut = correction < 0;
    const isNeutral = Math.abs(correction) < 0.5;
    
    const barWidth = Math.min(Math.abs(correction) * 10, 100); // Scale: 10dB = 100%
    
    return (
      <div className="space-y-2">
        {/* Region Label */}
        <div className="flex items-center justify-between">
          <div className="text-xs font-mono text-zinc-400 uppercase tracking-wider">
            {label}
          </div>
          <div className={`flex items-center gap-1 text-xs font-mono font-bold ${
            isBoost ? 'text-green-400' :
            isCut ? 'text-red-400' :
            'text-zinc-600'
          }`}>
            {isBoost && <TrendingUp className="w-3 h-3" />}
            {isCut && <TrendingDown className="w-3 h-3" />}
            {isNeutral && <Minus className="w-3 h-3" />}
            {correction > 0 ? '+' : ''}{correction.toFixed(1)} dB
          </div>
        </div>
        
        {/* Correction Bar */}
        <div className="relative h-8 bg-zinc-900 rounded-lg overflow-hidden border border-zinc-800">
          {/* Center line */}
          <div className="absolute left-1/2 top-0 bottom-0 w-px bg-zinc-700" />
          
          {/* Correction bar */}
          {!isNeutral && (
            <motion.div
              className="absolute top-0 bottom-0"
              style={{
                left: isBoost ? '50%' : `${50 - barWidth}%`,
                right: isBoost ? `${50 - barWidth}%` : '50%',
                background: isBoost 
                  ? `linear-gradient(90deg, transparent, ${color})`
                  : `linear-gradient(90deg, ${color}, transparent)`
              }}
              initial={{ width: 0 }}
              animate={{ width: `${barWidth}%` }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            />
          )}
          
          {/* Label */}
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[10px] font-mono text-zinc-500">
              {isBoost ? 'BOOST' : isCut ? 'CUT' : 'NEUTRAL'}
            </span>
          </div>
        </div>
        
        {/* Band Details */}
        <div className="flex items-center justify-between text-[8px] font-mono text-zinc-600">
          {bandDetails.map(band => (
            <div 
              key={band.freq}
              className={`${
                Math.abs(band.correction) > 2 ? 'text-zinc-400 font-semibold' : ''
              }`}
            >
              {band.freq}: {band.correction > 0 ? '+' : ''}{band.correction.toFixed(1)}
            </div>
          ))}
        </div>
      </div>
    );
  };
  
  return (
    <div className="border-2 border-zinc-800 rounded-lg p-6 bg-zinc-950 space-y-6">
      {/* Header */}
      <div>
        <div className="text-xs font-mono text-zinc-400 uppercase tracking-wider mb-1">
          Spectrum Shaper (Balance View)
        </div>
        <div className="text-[9px] font-mono text-zinc-600">
          Visual representation of Low/Mid/High corrections. Pro-masters use 30-50% matching to preserve character.
        </div>
      </div>
      
      {/* Low Region (31 Hz - 125 Hz) */}
      {renderCorrectionBar(
        'Low (31 Hz - 125 Hz)',
        lowCorrectionAdjusted,
        '#3b82f6', // Blue
        [
          { freq: '31Hz', correction: matchingDelta.bands.hz31 * (matchStrength / 100) },
          { freq: '63Hz', correction: matchingDelta.bands.hz63 * (matchStrength / 100) },
          { freq: '125Hz', correction: matchingDelta.bands.hz125 * (matchStrength / 100) }
        ]
      )}
      
      {/* Mid Region (250 Hz - 2 kHz) */}
      {renderCorrectionBar(
        'Mid (250 Hz - 2 kHz)',
        midCorrectionAdjusted,
        '#8b5cf6', // Purple
        [
          { freq: '250Hz', correction: matchingDelta.bands.hz250 * (matchStrength / 100) },
          { freq: '500Hz', correction: matchingDelta.bands.hz500 * (matchStrength / 100) },
          { freq: '1kHz', correction: matchingDelta.bands.hz1k * (matchStrength / 100) },
          { freq: '2kHz', correction: matchingDelta.bands.hz2k * (matchStrength / 100) }
        ]
      )}
      
      {/* High Region (4 kHz - 16 kHz) */}
      {renderCorrectionBar(
        'High (4 kHz - 16 kHz)',
        highCorrectionAdjusted,
        '#ec4899', // Pink
        [
          { freq: '4kHz', correction: matchingDelta.bands.hz4k * (matchStrength / 100) },
          { freq: '8kHz', correction: matchingDelta.bands.hz8k * (matchStrength / 100) },
          { freq: '16kHz', correction: matchingDelta.bands.hz16k * (matchStrength / 100) }
        ]
      )}
      
      {/* Technical Info */}
      <div className="pt-4 border-t border-zinc-800 text-[9px] font-mono text-zinc-600 leading-relaxed">
        <span className="text-purple-400 font-semibold">ISO 266:2003:</span> These frequency regions are based on 
        international standards for octave-band analysis. Each correction is calculated from FFT analysis comparing 
        your track to the golden reference. Q-factor of 1.41 ensures smooth blending between adjacent bands.
      </div>
    </div>
  );
}
