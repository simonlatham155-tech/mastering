import { Cpu, Zap, Radio, Sliders, Disc3, Maximize2, Volume2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// PerformanceMode removed (2026-02-16) - studio mastering only

interface SignalChainVisualizerProps {
  isProcessing: boolean;
  gearProfile: string;
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
  gearProfile 
}: SignalChainVisualizerProps) {
  
  const studioChain: ChainNode[] = [
    {
      id: 'transformer',
      name: 'Harmonic Saturator',
      description: 'Transformer-style saturation (WaveShaper + asymmetric curve)',
      icon: <Zap className="w-4 h-4" />,
      color: '#06b6d4',
      active: true // Show in studio or no mode (default preview)
    },
    {
      id: 'tape',
      name: 'Tape Emulation',
      description: 'Magnetic hysteresis modeling (tanh saturation + head bump)',
      icon: <Radio className="w-4 h-4" />,
      color: '#8b5cf6',
      active: true
    },
    {
      id: 'multiband',
      name: 'Multi-Band Processor',
      description: '4-band crossover with per-band compression (BiquadFilter)',
      icon: <Sliders className="w-4 h-4" />,
      color: '#f59e0b',
      active: true
    },
    {
      id: 'ssl',
      name: 'Glue',
      description: 'VCA-style bus compression (DynamicsCompressor)',
      icon: <Disc3 className="w-4 h-4" />,
      color: '#10b981',
      active: true // Always show
    },
    {
      id: 'ms',
      name: 'M/S Width Control',
      description: 'Mid-Side stereo imaging (gain matrix)',
      icon: <Maximize2 className="w-4 h-4" />,
      color: '#ec4899',
      active: true
    },
    {
      id: 'limiter',
      name: 'Finish',
      description: 'Cascaded multi-stage limiting (brick-wall ceiling)',
      icon: <Volume2 className="w-4 h-4" />,
      color: '#ef4444',
      active: true // Always show
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
            {activeChain.length}-Stage Algorithmic Mastering • Web Audio API
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
          {activeChain.map((node, index) => (
            <div key={node.id} className="flex items-center gap-3 flex-shrink-0">
              {/* Node */}
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ 
                  scale: 1, 
                  opacity: 1,
                  boxShadow: isProcessing 
                    ? [`0 0 0px ${node.color}`, `0 0 20px ${node.color}`, `0 0 0px ${node.color}`]
                    : `0 0 0px ${node.color}`
                }}
                transition={{ 
                  delay: index * 0.1,
                  boxShadow: {
                    duration: 1.5,
                    repeat: isProcessing ? Infinity : 0,
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
              {index < activeChain.length - 1 && (
                <motion.div
                  initial={{ scaleX: 0, opacity: 0 }}
                  animate={{ scaleX: 1, opacity: 1 }}
                  transition={{ delay: index * 0.1 + 0.05, duration: 0.3 }}
                  className="flex items-center"
                >
                  <svg width="24" height="12" viewBox="0 0 24 12" className="flex-shrink-0">
                    <motion.path
                      d="M 0 6 L 18 6 M 18 6 L 14 2 M 18 6 L 14 10"
                      stroke={isProcessing ? node.color : '#3f3f46'}
                      strokeWidth="2"
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      animate={isProcessing ? {
                        strokeDashoffset: [40, 0],
                      } : {}}
                      style={{
                        strokeDasharray: isProcessing ? "4 4" : "none"
                      }}
                      transition={{
                        duration: 1,
                        repeat: isProcessing ? Infinity : 0,
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
              <span className="text-cyan-400 font-semibold">STUDIO MODE:</span> Full algorithmic chain using Web Audio API primitives. 
              Suitable for content creation, YouTube, podcasts, and DJ sets. 
              Not a replacement for professional mastering services.
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}