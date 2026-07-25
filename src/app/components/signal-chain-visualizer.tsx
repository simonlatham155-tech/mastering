import { Cpu, Zap, Radio, Sliders, Disc3, Maximize2, Volume2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { getGenrePreset } from '../data/genre-presets';
import type { GearProfileId } from './gear-selector';
import type { ProcessingPlan } from '../data/preset-resolution';
import type { LimiterBackend } from '../services/mastering-chain-builder';

// PerformanceMode removed (2026-02-16) - studio mastering only

interface SignalChainVisualizerProps {
  isProcessing: boolean;
  gearProfile: GearProfileId;
  logicMode: 'brickwall' | 'dynamics';
  hqMode: boolean;
  processingPlan?: ProcessingPlan;
  limiterBackend?: Exclude<LimiterBackend, 'bypass'> | null;
  limiterLatencyMS?: number | null;
}

interface ChainNode {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  active: boolean;
}

export function SignalChainVisualizer({ 
  isProcessing,
  gearProfile,
  logicMode,
  hqMode,
  processingPlan,
  limiterBackend = null,
  limiterLatencyMS = null,
}: SignalChainVisualizerProps) {
  const preset = getGenrePreset(gearProfile);
  const behavior = processingPlan?.genreBehavior;
  const usesTransformer =
    behavior?.useTransformer ?? (preset?.biases.colorAmount ?? 0) > 0;
  const usesTape =
    behavior?.useTape ?? (preset?.biases.colorAmount ?? 0) > 0;
  const usesMultiband =
    behavior?.useMultiband ?? preset?.toggles.useMultiband ?? false;
  const usesMidSide =
    behavior?.useMidSide ?? preset?.toggles.useMidSide ?? false;
  const usesClipper =
    behavior?.useClipper ?? preset?.toggles.useClipper ?? false;
  const pressure = logicMode === 'brickwall';
  const limiterName =
    limiterBackend === 'faust-fir'
      ? 'Faust + FIR'
      : limiterBackend === 'faust'
        ? 'Faust Limiter'
        : limiterBackend === 'fir'
          ? 'FIR Fallback'
          : limiterBackend === 'waveshaper'
            ? 'WaveShaper Fallback'
            : hqMode
              ? 'HQ Limiter Pending'
              : 'Preview Ceiling Pending';
  const limiterDescription = limiterBackend
    ? `${limiterBackendDescription(limiterBackend)}${
        limiterLatencyMS != null ? ` · ${limiterLatencyMS.toFixed(1)} ms` : ''
      }`
    : 'The requested limiter backend is verified when playback first builds the audio graph';

  const studioChain: ChainNode[] = [
    {
      id: 'profile-eq',
      name: 'Profile EQ',
      description: 'Visible low shelf, mud bell, and air shelf from the active genre strategy',
      icon: <Sliders className="w-4 h-4" />,
      color: '#38bdf8',
      active: true,
    },
    {
      id: 'transformer',
      name: 'Transformer',
      description: 'Transformer-style saturation (WaveShaper + asymmetric curve)',
      icon: <Zap className="w-4 h-4" />,
      color: '#06b6d4',
      active: usesTransformer,
    },
    {
      id: 'tape',
      name: 'Tape Emulation',
      description: 'Magnetic hysteresis modeling (tanh saturation + head bump)',
      icon: <Radio className="w-4 h-4" />,
      color: '#8b5cf6',
      active: usesTape,
    },
    {
      id: 'multiband',
      name: 'Multi-Band Processor',
      description: '4-band crossover with per-band compression (BiquadFilter)',
      icon: <Sliders className="w-4 h-4" />,
      color: '#f59e0b',
      active: usesMultiband,
    },
    {
      id: 'ssl',
      name: 'VCA Bus Glue',
      description: 'VCA-style bus compression with visible threshold, ratio, attack, and release',
      icon: <Disc3 className="w-4 h-4" />,
      color: '#10b981',
      active: true,
    },
    {
      id: 'ms',
      name: 'M/S Width Control',
      description: 'Mid-Side stereo imaging (gain matrix)',
      icon: <Maximize2 className="w-4 h-4" />,
      color: '#ec4899',
      active: usesMidSide,
    },
    {
      id: 'clipper',
      name: 'Clipper',
      description: 'Pressure-only transient clipping, enabled only by compatible genre strategies',
      icon: <Cpu className="w-4 h-4" />,
      color: '#fb7185',
      active: pressure && usesClipper,
    },
    {
      id: 'limiter',
      name: limiterName,
      description: limiterDescription,
      icon: <Volume2 className="w-4 h-4" />,
      color: '#ef4444',
      active: true,
    }
  ];

  const activeChain = studioChain.filter(node => node.active);

  return (
    <div className="border-2 rounded-lg p-6" style={{
      borderColor: '#2a2a2a',
      background: 'linear-gradient(180deg, #1a1a1a, #0f0f0f)',
      boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.6)'
    }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="text-xs font-mono text-zinc-300 uppercase tracking-wider mb-1">
            Signal Processing Chain
          </div>
          <div className="text-[9px] font-mono text-zinc-600">
            {activeChain.length} active of {studioChain.length} visible hardware-style stages
          </div>
        </div>
        
        {isProcessing && (
          <motion.div
            className="px-3 py-1.5 rounded-full bg-cyan-500/20 border border-cyan-500/40"
            animate={{ opacity: [1, 0.5, 1] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          >
            <div className="text-[9px] font-mono text-cyan-400 uppercase tracking-wider">
              Processing
            </div>
          </motion.div>
        )}
      </div>

      {/* Signal Chain Flow */}
      <div className="relative">
        <div className="flex items-center gap-3 overflow-x-auto pb-2">
          {studioChain.map((node, index) => (
            <div key={node.id} className="flex items-center gap-3 flex-shrink-0">
              {/* Node */}
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ 
                  scale: 1, 
                  opacity: node.active ? 1 : 0.38,
                  boxShadow: isProcessing && node.active
                    ? [`0 0 0px ${node.color}`, `0 0 20px ${node.color}`, `0 0 0px ${node.color}`]
                    : `0 0 0px ${node.color}`
                }}
                transition={{ 
                  delay: index * 0.1,
                  boxShadow: {
                    duration: 1.5,
                    repeat: isProcessing && node.active ? Infinity : 0,
                    delay: index * 0.2
                  }
                }}
                className="relative group"
              >
                <div 
                  className="w-20 h-20 rounded-lg border-2 flex flex-col items-center justify-center gap-1 cursor-help"
                  style={{
                    borderColor: node.color,
                    background: `linear-gradient(135deg, ${node.color}15, ${node.color}05)`,
                  }}
                >
                  <div style={{ color: node.color }}>
                    {node.icon}
                  </div>
                  <div 
                    className="text-[8px] font-mono text-center leading-tight px-1"
                    style={{ color: node.color }}
                  >
                    {node.name}
                  </div>
                  <div className="text-[7px] font-mono uppercase tracking-wider text-zinc-500">
                    {node.active ? 'Active' : 'Bypassed'}
                  </div>
                </div>

                {/* Tooltip */}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                  <div className="bg-zinc-900 border border-zinc-700 rounded px-3 py-2 whitespace-nowrap shadow-xl">
                    <div className="text-[9px] font-mono text-zinc-400">
                      {node.description}
                    </div>
                  </div>
                  <div className="w-2 h-2 bg-zinc-900 border-r border-b border-zinc-700 rotate-45 absolute top-full left-1/2 -translate-x-1/2 -mt-1" />
                </div>
              </motion.div>

              {/* Arrow */}
              {index < studioChain.length - 1 && (
                <motion.div
                  initial={{ scaleX: 0, opacity: 0 }}
                  animate={{ scaleX: 1, opacity: 1 }}
                  transition={{ delay: index * 0.1 + 0.05, duration: 0.3 }}
                  className="flex items-center"
                >
                  <svg width="24" height="12" viewBox="0 0 24 12" className="flex-shrink-0">
                    <motion.path
                      d="M 0 6 L 18 6 M 18 6 L 14 2 M 18 6 L 14 10"
                      stroke={isProcessing && node.active ? node.color : '#3f3f46'}
                      strokeWidth="2"
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      animate={isProcessing && node.active ? {
                        strokeDashoffset: [40, 0],
                      } : {}}
                      style={{
                        strokeDasharray: isProcessing && node.active ? "4 4" : "none"
                      }}
                      transition={{
                        duration: 1,
                        repeat: isProcessing && node.active ? Infinity : 0,
                        ease: "linear",
                        delay: index * 0.2
                      }}
                    />
                  </svg>
                </motion.div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Mode Info */}
      <div className="mt-6 pt-4 border-t border-zinc-800">
        <div className="text-[9px] font-mono text-zinc-600 leading-relaxed">
          <AnimatePresence mode="wait">
            <motion.div
              key="studio"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <span className="text-cyan-400 font-semibold">VISIBLE RACK:</span>{' '}
              Pre-master analysis selects a starting strategy; every audible stage is shown here
              as active or bypassed and remains editable in the rack controls.
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function limiterBackendDescription(
  backend: Exclude<LimiterBackend, 'bypass'>
): string {
  if (backend === 'faust-fir') {
    return 'Stereo-linked Faust gain control followed by the 4× FIR true-peak guard';
  }
  if (backend === 'faust') {
    return 'Stereo-linked 5 ms Faust look-ahead gain control';
  }
  if (backend === 'fir') {
    return 'Stereo-linked 4× FIR true-peak fallback';
  }
  return 'Oversampled WaveShaper safety fallback';
}
