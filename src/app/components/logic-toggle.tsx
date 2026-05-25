import { motion } from 'motion/react';

type LogicMode = 'brickwall' | 'dynamics';

interface LogicToggleProps {
  mode: LogicMode;
  onChange: (mode: LogicMode) => void;
}

export function LogicToggle({ mode, onChange }: LogicToggleProps) {
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="text-xs font-mono text-zinc-500 tracking-[0.3em] uppercase">Logic Mode</div>
      
      {/* Hardware toggle switch */}
      <div 
        className="relative bg-zinc-900 rounded-lg p-1 border-2"
        style={{
          borderColor: '#2a2a2a',
          boxShadow: `
            inset 0 2px 4px rgba(0,0,0,0.6),
            0 2px 4px rgba(0,0,0,0.3)
          `
        }}
      >
        <div className="relative flex gap-1">
          {/* Pressure button (formerly Brickwall) */}
          <button
            onClick={() => onChange('brickwall')}
            className={`relative z-10 px-6 py-3 rounded-md transition-all ${
              mode === 'brickwall' 
                ? 'text-white' 
                : 'text-zinc-600'
            }`}
            style={{
              minWidth: '120px',
              background: mode === 'brickwall' 
                ? 'linear-gradient(180deg, #dc2626, #991b1b)'
                : 'transparent',
              boxShadow: mode === 'brickwall'
                ? `
                    0 0 12px rgba(220, 38, 38, 0.5),
                    inset 0 1px 1px rgba(255,255,255,0.2),
                    inset 0 -1px 2px rgba(0,0,0,0.4),
                    0 2px 4px rgba(0,0,0,0.3)
                  `
                : 'none',
            }}
          >
            <div className="flex flex-col items-center gap-1 w-full">
              <div className="text-xs font-bold tracking-widest uppercase font-mono">Pressure</div>
              <div className="text-xs font-mono opacity-70">∞:1</div>
            </div>
            {/* LED indicator */}
            {mode === 'brickwall' && (
              <div 
                className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full"
                style={{
                  boxShadow: '0 0 6px rgba(239, 68, 68, 0.9), inset 0 0.5px 1px rgba(255,255,255,0.5)'
                }}
              />
            )}
          </button>

          {/* Flow button (formerly Dynamics) */}
          <button
            onClick={() => onChange('dynamics')}
            className={`relative z-10 px-6 py-3 rounded-md transition-all ${
              mode === 'dynamics' 
                ? 'text-white' 
                : 'text-zinc-600'
            }`}
            style={{
              minWidth: '120px',
              background: mode === 'dynamics'
                ? 'linear-gradient(180deg, #4a5568, #2d3748)'
                : 'transparent',
              boxShadow: mode === 'dynamics'
                ? `
                    0 0 12px rgba(148, 163, 184, 0.3),
                    inset 0 1px 1px rgba(255,255,255,0.1),
                    inset 0 -1px 2px rgba(0,0,0,0.4),
                    0 2px 4px rgba(0,0,0,0.3)
                  `
                : 'none',
            }}
          >
            <div className="flex flex-col items-center gap-1 w-full">
              <div className="text-xs font-bold tracking-widest uppercase font-mono">Flow</div>
              <div className="text-xs font-mono opacity-70">Soft</div>
            </div>
            {/* LED indicator */}
            {mode === 'dynamics' && (
              <div 
                className="absolute -top-1 -right-1 w-2 h-2 bg-slate-400 rounded-full"
                style={{
                  boxShadow: '0 0 6px rgba(148, 163, 184, 0.7), inset 0 0.5px 1px rgba(255,255,255,0.5)'
                }}
              />
            )}
          </button>
        </div>
      </div>

      {/* Mode description - silkscreen style */}
      <div className="text-center max-w-xs">
        <p className="text-xs text-zinc-500 uppercase tracking-widest font-mono">
          {mode === 'brickwall' ? (
            <>Look-ahead • Maximum Density</>
          ) : (
            <>Soft Knee • Natural Dynamics</>
          )}
        </p>
      </div>
    </div>
  );
}