import { motion } from 'motion/react';
import { Zap, Radio, Layers, TrendingUp, TrendingDown, Activity } from 'lucide-react';
import { GearProfileId, gearProfiles } from './gear-selector';

interface GainStageVisualizerProps {
  isProcessing: boolean;
  circuitDrive: number;
  gearProfile: GearProfileId;
  hasProcessedAudio?: boolean; // Track if processing is complete
}

const stages = [
  {
    id: 'transformer',
    icon: Radio,
    name: 'Foundation',
    gain: '+2dB',
    description: 'Input Stage • Headroom',
    color: 'from-amber-500 to-orange-500',
  },
  {
    id: 'tape',
    icon: Zap,
    name: 'Harmonics',
    gain: '+3dB',
    description: 'Tone Shaping • Color',
    color: 'from-orange-500 to-red-500',
  },
  {
    id: 'ssl',
    icon: Activity,
    name: 'Glue',
    gain: '+3dB',
    description: 'Bus Processing • Cohesion',
    color: 'from-red-500 to-rose-500',
  },
  {
    id: 'final',
    icon: Layers,
    name: 'Finish',
    gain: 'LIMIT',
    description: 'Peak Control • Delivery',
    color: 'from-rose-500 to-pink-500',
  },
];

export function GainStageVisualizer({ isProcessing, circuitDrive, gearProfile, hasProcessedAudio }: GainStageVisualizerProps) {
  // Get profile data
  const profile = gearProfiles.find(p => p.id === gearProfile);
  
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div 
          className={`text-xs font-mono tracking-[0.3em] uppercase transition-colors duration-500 ${
            hasProcessedAudio 
              ? 'text-green-500' 
              : isProcessing 
                ? 'text-amber-500' 
                : 'text-zinc-500'
          }`}
        >
          4-Phase Analog Chain
        </div>
        <div className="text-[9px] font-mono text-amber-500/80">{profile?.name || 'No Profile'}</div>
      </div>

      <div className="relative">
        {/* Signal flow line */}
        <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-zinc-800" style={{ transform: 'translateY(-50%)', zIndex: 0 }} />
        
        {isProcessing && (
          <motion.div
            className="absolute top-1/2 left-0 h-0.5"
            style={{ 
              transform: 'translateY(-50%)', 
              zIndex: 1,
              background: 'linear-gradient(90deg, #22c55e, #16a34a, transparent)',
              boxShadow: '0 0 4px rgba(34, 197, 94, 0.6)'
            }}
            initial={{ width: 0 }}
            animate={{ width: '100%' }}
            transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
          />
        )}

        {/* Stage nodes */}
        <div className="relative flex justify-between z-10">
          {stages.map((stage, index) => {
            const Icon = stage.icon;
            const stageActive = isProcessing && (circuitDrive / 100) * 4 > index;
            
            return (
              <motion.div
                key={stage.id}
                className="flex flex-col items-center gap-2"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                {/* Node circle - hardware style */}
                <div
                  className={`relative w-16 h-16 rounded-full border-2 flex items-center justify-center`}
                  style={{
                    borderColor: stageActive ? '#22c55e' : '#3a3a3a',
                    background: stageActive 
                      ? 'radial-gradient(circle at 30% 30%, #1a1a1a, #0a0a0a)'
                      : 'radial-gradient(circle at 30% 30%, #1a1a1a, #0a0a0a)',
                    boxShadow: stageActive 
                      ? `
                          0 0 16px rgba(34, 197, 94, 0.5),
                          inset 0 1px 2px rgba(255,255,255,0.05),
                          inset 0 -2px 4px rgba(0,0,0,0.5)
                        `
                      : `
                          inset 0 1px 2px rgba(255,255,255,0.05),
                          inset 0 -2px 4px rgba(0,0,0,0.5)
                        `,
                  }}
                >
                  <Icon 
                    className={`w-6 h-6 ${stageActive ? 'text-green-400' : 'text-zinc-700'}`} 
                  />
                  
                  {/* Activity LED */}
                  {stageActive && (
                    <motion.div 
                      className="absolute -top-1 -right-1 w-2 h-2 bg-green-500 rounded-full"
                      style={{
                        boxShadow: '0 0 6px rgba(34, 197, 94, 0.9), inset 0 0.5px 1px rgba(255,255,255,0.5)'
                      }}
                      animate={{
                        opacity: [1, 0.5, 1],
                      }}
                      transition={{
                        duration: 1,
                        repeat: Infinity,
                        ease: 'easeInOut'
                      }}
                    />
                  )}
                </div>

                {/* Stage info */}
                <div className="flex flex-col items-center gap-1 text-center">
                  <div className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">{stage.name}</div>
                  <div className={`text-xs font-mono font-bold ${stageActive ? 'text-green-400' : 'text-zinc-700'}`}>
                    {stage.gain}
                  </div>
                  <div className="text-[8px] text-zinc-600 max-w-[80px] font-mono">{stage.description}</div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Gear Profile Adjustments - EQ & Dynamics */}
      {profile && (
        <div 
          className="border rounded-md p-3 space-y-3"
          style={{
            background: 'rgba(0,0,0,0.4)',
            borderColor: '#2a2a2a',
            boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.5)'
          }}
        >
          <div className="text-[9px] text-zinc-600 uppercase tracking-[0.3em] font-mono mb-2">Profile Adjustments</div>
          
          {/* EQ Adjustments */}
          <div className="space-y-2">
            <div className="text-[8px] text-amber-500/60 uppercase tracking-wider font-mono">EQ Shaping</div>
            
            {/* Low Shelf */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className={`w-3 h-3 ${profile.lowShelfBoost > 0 ? 'text-cyan-400' : 'text-zinc-700'}`} />
                <span className="text-[9px] font-mono text-zinc-500">Low Shelf (80Hz)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-24 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-cyan-500 to-cyan-400"
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.max(0, (profile.lowShelfBoost / 5) * 100)}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                    style={{
                      boxShadow: '0 0 4px rgba(6, 182, 212, 0.5)'
                    }}
                  />
                </div>
                <span className={`text-[9px] font-mono font-bold ${profile.lowShelfBoost > 0 ? 'text-cyan-400' : 'text-zinc-700'}`}>
                  {profile.lowShelfBoost > 0 ? '+' : ''}{profile.lowShelfBoost.toFixed(1)}dB
                </span>
              </div>
            </div>

            {/* Mid Range */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {profile.midRangeAdjust > 0 ? (
                  <TrendingUp className="w-3 h-3 text-yellow-400" />
                ) : profile.midRangeAdjust < 0 ? (
                  <TrendingDown className="w-3 h-3 text-orange-400" />
                ) : (
                  <TrendingUp className="w-3 h-3 text-zinc-700" />
                )}
                <span className="text-[9px] font-mono text-zinc-500">Mid Range (1-4kHz)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-24 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <motion.div
                    className={`h-full ${profile.midRangeAdjust >= 0 ? 'bg-gradient-to-r from-yellow-500 to-yellow-400' : 'bg-gradient-to-r from-orange-500 to-orange-400'}`}
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.abs(profile.midRangeAdjust / 4) * 100}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut', delay: 0.1 }}
                    style={{
                      boxShadow: profile.midRangeAdjust >= 0 ? '0 0 4px rgba(234, 179, 8, 0.5)' : '0 0 4px rgba(249, 115, 22, 0.5)'
                    }}
                  />
                </div>
                <span className={`text-[9px] font-mono font-bold ${profile.midRangeAdjust > 0 ? 'text-yellow-400' : profile.midRangeAdjust < 0 ? 'text-orange-400' : 'text-zinc-700'}`}>
                  {profile.midRangeAdjust > 0 ? '+' : ''}{profile.midRangeAdjust.toFixed(1)}dB
                </span>
              </div>
            </div>

            {/* High Shelf */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {profile.highShelfBoost > 0 ? (
                  <TrendingUp className="w-3 h-3 text-blue-400" />
                ) : profile.highShelfBoost < 0 ? (
                  <TrendingDown className="w-3 h-3 text-purple-400" />
                ) : (
                  <TrendingUp className="w-3 h-3 text-zinc-700" />
                )}
                <span className="text-[9px] font-mono text-zinc-500">High Shelf (12kHz)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-24 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <motion.div
                    className={`h-full ${profile.highShelfBoost >= 0 ? 'bg-gradient-to-r from-blue-500 to-blue-400' : 'bg-gradient-to-r from-purple-500 to-purple-400'}`}
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.abs(profile.highShelfBoost / 4) * 100}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut', delay: 0.2 }}
                    style={{
                      boxShadow: profile.highShelfBoost >= 0 ? '0 0 4px rgba(59, 130, 246, 0.5)' : '0 0 4px rgba(168, 85, 247, 0.5)'
                    }}
                  />
                </div>
                <span className={`text-[9px] font-mono font-bold ${profile.highShelfBoost > 0 ? 'text-blue-400' : profile.highShelfBoost < 0 ? 'text-purple-400' : 'text-zinc-700'}`}>
                  {profile.highShelfBoost > 0 ? '+' : ''}{profile.highShelfBoost.toFixed(1)}dB
                </span>
              </div>
            </div>
          </div>

          {/* Dynamics & Saturation */}
          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-zinc-800">
            {/* Stereo Width */}
            <div className="space-y-1">
              <div className="text-[8px] text-amber-500/60 uppercase tracking-wider font-mono">Stereo Width</div>
              <div className="flex items-center gap-2">
                <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-purple-500 to-purple-400"
                    initial={{ width: 0 }}
                    animate={{ width: `${profile.stereoWidth}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut', delay: 0.3 }}
                    style={{
                      boxShadow: '0 0 4px rgba(168, 85, 247, 0.5)'
                    }}
                  />
                </div>
                <span className="text-[9px] font-mono font-bold text-purple-400">{profile.stereoWidth}%</span>
              </div>
            </div>

            {/* Saturation */}
            <div className="space-y-1">
              <div className="text-[8px] text-amber-500/60 uppercase tracking-wider font-mono">Saturation</div>
              <div className="flex items-center gap-2">
                <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-orange-500 to-red-500"
                    initial={{ width: 0 }}
                    animate={{ width: `${profile.saturationAmount}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut', delay: 0.4 }}
                    style={{
                      boxShadow: '0 0 4px rgba(249, 115, 22, 0.5)'
                    }}
                  />
                </div>
                <span className="text-[9px] font-mono font-bold text-orange-400">{profile.saturationAmount}%</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}