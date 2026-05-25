import { useState } from 'react';
import { motion } from 'motion/react';
import { Settings, Info } from 'lucide-react';

interface LUFSPreset {
  id: string;
  name: string;
  lufs: number;
  icon: string;
  description: string;
  useCase: string;
}

const PRESETS: LUFSPreset[] = [
  {
    id: 'spotify',
    name: 'Spotify Standard',
    lufs: -14,
    icon: '🎧',
    description: 'Streaming platforms (Spotify, Apple Music, YouTube)',
    useCase: 'Podcasts, indie music, streaming releases'
  },
  {
    id: 'club',
    name: 'Club/Festival',
    lufs: -8,
    icon: '🔊',
    description: 'Standard club loudness (Techno, House)',
    useCase: 'Club tracks, festival sets, radio play'
  },
  {
    id: 'dnb',
    name: 'D&B Extreme',
    lufs: -6,
    icon: '⚡',
    description: 'Maximum loudness (Drum & Bass, Dubstep)',
    useCase: 'Competition mixes, floor-shaking power'
  },
  {
    id: 'deep',
    name: 'Deep House',
    lufs: -12,
    icon: '🌅',
    description: 'Dynamic warmth (Deep House, Chill)',
    useCase: 'Organic feel, streaming-friendly'
  }
];

interface LUFSTargetSelectorProps {
  targetLUFS?: number;
  onTargetChange: (lufs: number) => void;
  currentLUFS?: number; // Optional: show current vs target
}

export function LUFSTargetSelector({
  targetLUFS = -14,
  onTargetChange,
  currentLUFS
}: LUFSTargetSelectorProps) {
  const [customLUFS, setCustomLUFS] = useState(targetLUFS);
  const [showCustom, setShowCustom] = useState(false);
  
  // Find active preset
  const activePreset = PRESETS.find(p => p.lufs === targetLUFS);
  
  // Calculate delta (how far from target)
  const delta = currentLUFS !== undefined ? currentLUFS - targetLUFS : 0;
  const needsBoost = delta < 0;
  const needsCut = delta > 0;
  
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-zinc-400 uppercase tracking-wider">
            Target Loudness (LUFS)
          </span>
          <div className="group relative">
            <Info className="w-3 h-3 text-zinc-600 cursor-help" />
            <div className="absolute left-0 top-full mt-2 w-72 p-3 bg-zinc-900 border border-zinc-700 rounded-lg text-[8px] font-mono text-zinc-400 leading-relaxed opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
              <div className="text-cyan-400 font-semibold mb-1">What is LUFS?</div>
              <div>
                <span className="text-white">LUFS (Loudness Units Full Scale)</span> is the 
                industry standard for measuring perceived loudness. Lower LUFS = louder. 
                -14 LUFS is streaming standard, -6 LUFS is extreme club loudness.
              </div>
            </div>
          </div>
        </div>
        
        {/* Current vs Target */}
        {currentLUFS !== undefined && (
          <div className="flex items-center gap-2">
            <div className="text-[8px] font-mono text-zinc-500">Current:</div>
            <div className={`text-xs font-mono font-bold ${
              Math.abs(delta) < 0.5 ? 'text-green-400' :
              needsBoost ? 'text-orange-400' : 'text-cyan-400'
            }`}>
              {currentLUFS.toFixed(1)} LUFS
            </div>
            {Math.abs(delta) > 0.5 && (
              <div className="text-[8px] font-mono text-zinc-600">
                ({needsBoost ? '+' : ''}{(-delta).toFixed(1)} dB)
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* Preset cards */}
      <div className="grid grid-cols-4 gap-3">
        {PRESETS.map((preset) => {
          const isActive = targetLUFS === preset.lufs;
          
          return (
            <button
              key={preset.id}
              onClick={() => {
                onTargetChange(preset.lufs);
                setShowCustom(false);
              }}
              className={`relative border-2 rounded-lg p-3 transition-all ${
                isActive
                  ? 'border-cyan-500 bg-cyan-500/10'
                  : 'border-zinc-800 bg-zinc-950 hover:border-zinc-700'
              }`}
            >
              {/* Icon */}
              <div className="text-3xl mb-2">{preset.icon}</div>
              
              {/* Name */}
              <div className={`text-[9px] font-mono font-semibold mb-1 ${
                isActive ? 'text-cyan-400' : 'text-zinc-400'
              }`}>
                {preset.name}
              </div>
              
              {/* LUFS value */}
              <div className={`text-sm font-mono font-bold ${
                isActive ? 'text-white' : 'text-zinc-500'
              }`}>
                {preset.lufs} LUFS
              </div>
              
              {/* Active indicator */}
              {isActive && (
                <motion.div
                  className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-cyan-500"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 15 }}
                />
              )}
            </button>
          );
        })}
      </div>
      
      {/* Custom input */}
      <button
        onClick={() => setShowCustom(!showCustom)}
        className={`w-full border-2 rounded-lg p-3 transition-all ${
          showCustom
            ? 'border-purple-500 bg-purple-500/10'
            : 'border-zinc-800 bg-zinc-950 hover:border-zinc-700'
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings className={`w-4 h-4 ${
              showCustom ? 'text-purple-400' : 'text-zinc-500'
            }`} />
            <span className={`text-sm font-mono font-semibold ${
              showCustom ? 'text-purple-400' : 'text-zinc-400'
            }`}>
              Custom Target
            </span>
          </div>
          <span className="text-xs font-mono text-zinc-600">
            {showCustom ? '−' : '+'}
          </span>
        </div>
      </button>
      
      {/* Custom slider */}
      {showCustom && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="border-2 border-purple-500/30 rounded-lg p-4 bg-purple-500/5"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-mono text-purple-400">Custom LUFS:</span>
            <span className="text-lg font-mono font-bold text-white">
              {customLUFS} LUFS
            </span>
          </div>
          
          <input
            type="range"
            min={-20}
            max={-3}
            step={0.1}
            value={customLUFS}
            onChange={(e) => {
              const value = parseFloat(e.target.value);
              setCustomLUFS(value);
              onTargetChange(value);
            }}
            className="w-full h-2 bg-zinc-900 rounded-lg appearance-none cursor-pointer accent-purple-500"
          />
          
          <div className="flex justify-between mt-2 text-[8px] font-mono text-zinc-600">
            <span>-20 LUFS (quiet)</span>
            <span>-3 LUFS (extreme)</span>
          </div>
        </motion.div>
      )}
      
      {/* Active preset details */}
      {activePreset && !showCustom && (
        <div className="border-2 border-cyan-500/30 rounded-lg p-4 bg-cyan-500/5">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-2xl">{activePreset.icon}</span>
            <div>
              <div className="text-xs font-mono text-cyan-400 font-semibold">
                {activePreset.name}
              </div>
              <div className="text-[8px] font-mono text-zinc-600">
                {activePreset.description}
              </div>
            </div>
          </div>
          
          <div className="mt-3 pt-3 border-t border-cyan-500/20">
            <div className="text-[8px] font-mono text-zinc-500 uppercase mb-1">
              Best For:
            </div>
            <div className="text-[9px] font-mono text-zinc-400 leading-relaxed">
              {activePreset.useCase}
            </div>
          </div>
        </div>
      )}
      
      {/* Delta indicator (how far from target) */}
      {currentLUFS !== undefined && Math.abs(delta) > 0.5 && (
        <div className={`border-2 rounded-lg p-3 ${
          needsBoost 
            ? 'border-orange-500/30 bg-orange-500/5'
            : 'border-cyan-500/30 bg-cyan-500/5'
        }`}>
          <div className="flex items-center justify-between">
            <div className="text-xs font-mono text-zinc-400">
              To reach target:
            </div>
            <div className={`text-sm font-mono font-bold ${
              needsBoost ? 'text-orange-400' : 'text-cyan-400'
            }`}>
              {needsBoost ? '+' : ''}{(-delta).toFixed(1)} dB
            </div>
          </div>
          <div className="mt-2 text-[8px] font-mono text-zinc-600">
            {needsBoost 
              ? 'Track is too quiet. Increasing gain and limiting...'
              : 'Track is too loud. Reducing gain...'}
          </div>
        </div>
      )}
      
      {/* LUFS scale reference */}
      <div className="border-2 border-zinc-800 rounded-lg p-3 bg-zinc-950">
        <div className="text-[8px] font-mono text-zinc-500 uppercase mb-2">
          LUFS Reference Scale
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-16 text-[8px] font-mono text-zinc-600">-14 LUFS</div>
            <div className="flex-1 h-1 bg-green-500/30 rounded" />
            <div className="text-[8px] font-mono text-zinc-600">Streaming</div>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-16 text-[8px] font-mono text-zinc-600">-10 LUFS</div>
            <div className="flex-1 h-1 bg-yellow-500/30 rounded" />
            <div className="text-[8px] font-mono text-zinc-600">Radio</div>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-16 text-[8px] font-mono text-zinc-600">-8 LUFS</div>
            <div className="flex-1 h-1 bg-orange-500/30 rounded" />
            <div className="text-[8px] font-mono text-zinc-600">Club</div>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-16 text-[8px] font-mono text-zinc-600">-6 LUFS</div>
            <div className="flex-1 h-1 bg-red-500/30 rounded" />
            <div className="text-[8px] font-mono text-zinc-600">D&B Extreme</div>
          </div>
        </div>
      </div>
    </div>
  );
}