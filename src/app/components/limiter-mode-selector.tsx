import { useState } from 'motion/react';
import { Shield, Zap, Flame, CheckCircle } from 'lucide-react';
import { LimiterMode, LIMITER_MODES, LimiterSettings } from '../services/multi-stage-limiter';

interface LimiterModeSelectorProps {
  currentMode: LimiterMode;
  onModeChange: (mode: LimiterMode) => void;
}

/**
 * LIMITER MODE SELECTOR
 * Choose between Clean/Pro, Beginner/Free, and Extreme modes
 * 
 * Based on: https://www.youtube.com/watch?v=siopG7VK6mk
 * 
 * MODES:
 * - Clean/Pro (-5 to -7 LUFS): FabFilter Pro-L 2 equivalent
 * - Beginner/Free (-6 to -8 LUFS): KHS Limiter equivalent
 * - Extreme (-3 to -5 LUFS): iZotope Ozone equivalent (clipper-like)
 */
export function LimiterModeSelector({
  currentMode,
  onModeChange
}: LimiterModeSelectorProps) {
  
  const modes: Array<{
    key: LimiterMode;
    icon: typeof Shield;
    color: string;
    gradient: string;
  }> = [
    {
      key: 'beginner',
      icon: Shield,
      color: '#22c55e',
      gradient: 'from-green-600 to-emerald-600'
    },
    {
      key: 'clean',
      icon: Zap,
      color: '#3b82f6',
      gradient: 'from-blue-600 to-cyan-600'
    },
    {
      key: 'extreme',
      icon: Flame,
      color: '#ef4444',
      gradient: 'from-red-600 to-orange-600'
    }
  ];
  
  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <div className="text-xs font-mono text-zinc-400 uppercase tracking-wider">
          Multi-Stage Limiter Mode
        </div>
        <div className="text-[9px] font-mono text-zinc-600">
          Professional D&B limiting strategy
        </div>
      </div>
      
      {/* Mode cards */}
      <div className="grid grid-cols-3 gap-3">
        {modes.map(({ key, icon: Icon, color, gradient }) => {
          const settings = LIMITER_MODES[key];
          const isActive = currentMode === key;
          
          return (
            <button
              key={key}
              onClick={() => onModeChange(key)}
              className={`relative border-2 rounded-lg p-4 transition-all ${
                isActive 
                  ? 'border-white bg-white/5 shadow-lg' 
                  : 'border-zinc-800 bg-zinc-950 hover:border-zinc-700'
              }`}
            >
              {/* Active indicator */}
              {isActive && (
                <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-white flex items-center justify-center">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                </div>
              )}
              
              {/* Icon */}
              <div className={`w-12 h-12 mx-auto mb-3 rounded-lg bg-gradient-to-br ${gradient} flex items-center justify-center`}>
                <Icon className="w-6 h-6 text-white" />
              </div>
              
              {/* Name */}
              <div className="text-sm font-mono font-bold text-white uppercase mb-1">
                {key === 'beginner' ? 'Beginner' : key === 'clean' ? 'Clean/Pro' : 'Extreme'}
              </div>
              
              {/* Target */}
              <div className="text-xs font-mono mb-2" style={{ color }}>
                {settings.targetLUFS} LUFS
              </div>
              
              {/* Characteristics */}
              <div className="space-y-1">
                <div className="text-[8px] font-mono text-zinc-500 flex items-center justify-between">
                  <span>Clarity:</span>
                  <span className="text-white">{settings.characteristics.clarity}</span>
                </div>
                <div className="text-[8px] font-mono text-zinc-500 flex items-center justify-between">
                  <span>Transients:</span>
                  <span className="text-white">{settings.characteristics.transients}</span>
                </div>
                <div className="text-[8px] font-mono text-zinc-500 flex items-center justify-between">
                  <span>Algorithm:</span>
                  <span className="text-white">{settings.characteristics.algorithm}</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
      
      {/* Current mode details */}
      <div className="border-2 border-zinc-800 rounded-lg p-4 bg-zinc-950">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-2 h-2 rounded-full bg-cyan-400" />
          <div className="text-xs font-mono text-cyan-400 uppercase tracking-wider">
            {currentMode === 'beginner' ? 'Beginner/Free Mode' :
             currentMode === 'clean' ? 'Clean/Pro Mode' : 'Extreme Mode'}
          </div>
        </div>
        
        {/* Mode description */}
        <div className="text-[9px] font-mono text-zinc-400 leading-relaxed mb-3">
          {getModeDescription(currentMode)}
        </div>
        
        {/* Tool equivalent */}
        <div className="border-t border-zinc-800 pt-3">
          <div className="text-[8px] font-mono text-zinc-500 uppercase mb-1">
            Tool Equivalent
          </div>
          <div className="text-sm font-mono font-bold text-white">
            {currentMode === 'beginner' ? 'KHS Limiter' :
             currentMode === 'clean' ? 'FabFilter Pro-L 2' : 'iZotope Ozone'}
          </div>
        </div>
      </div>
      
      {/* Multi-stage explanation */}
      <div className="border-2 border-purple-500/30 rounded-lg p-4 bg-purple-500/5">
        <div className="flex items-center gap-2 mb-2">
          <Zap className="w-3 h-3 text-purple-400" />
          <div className="text-xs font-mono text-purple-400 uppercase tracking-wider">
            Multi-Stage Limiting
          </div>
        </div>
        <div className="space-y-2 text-[9px] font-mono text-zinc-400 leading-relaxed">
          <div className="flex items-start gap-2">
            <span className="text-purple-400 font-semibold">Stage 1:</span>
            <span>Track limiter (0dBFS ceiling, zero-latency)</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-purple-400 font-semibold">Stage 2:</span>
            <span>Bus limiter (+1dB drive for "glue")</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-purple-400 font-semibold">Stage 3:</span>
            <span>Master limiter ({currentMode} mode characteristics)</span>
          </div>
        </div>
      </div>
      
      {/* Technical note */}
      <div className="text-[8px] font-mono text-zinc-600 leading-relaxed">
        <span className="text-cyan-400 font-semibold">MULTI-STAGE SECRET:</span> D&B loudness 
        isn't achieved with one heavy limiter. Instead, we "shave" peaks at every stage (tracks, 
        buses, master) to reach extreme loudness <span className="text-red-400">(-3 to -6 LUFS)</span> without 
        distortion. <span className="text-purple-400">Extreme mode</span> uses soft-clipping to round peaks 
        instead of hard-stopping, adding harmonic energy.
      </div>
    </div>
  );
}

/**
 * Get detailed mode description
 */
function getModeDescription(mode: LimiterMode): string {
  switch (mode) {
    case 'beginner':
      return 'Safe limiting that prevents clipping with less "sheen". Good for learning and streaming-focused releases. Uses standard algorithm with conservative ceiling (-1.0 dBTP).';
      
    case 'clean':
      return 'High-quality transparent limiting with preserved transients. Professional results with maximum clarity. Uses advanced algorithm with look-ahead processing (5ms).';
      
    case 'extreme':
      return 'Maximum loudness using harmonic distortion and peak rounding. Acts more like a soft-clipper than a traditional limiter. Adds harmonic energy while reaching -3 to -5 LUFS for D&B/competition mixes.';
  }
}
