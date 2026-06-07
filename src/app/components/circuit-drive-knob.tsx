import React, { useState, useRef } from 'react';
import { motion } from 'motion/react';

interface CircuitDriveKnobProps {
  value: number;
  onChange: (value: number) => void;
  logicMode?: 'brickwall' | 'dynamics';
  recommendedValue?: number | null;
  onResetRecommended?: () => void;
}

export function CircuitDriveKnob({
  value,
  onChange,
  logicMode = 'dynamics',
  recommendedValue = null,
  onResetRecommended,
}: CircuitDriveKnobProps) {
  const [isDragging, setIsDragging] = useState(false);
  const knobRef = useRef<HTMLDivElement>(null);
  const startYRef = useRef<number>(0);
  const startValueRef = useRef<number>(0);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    startYRef.current = e.clientY;
    startValueRef.current = value;
  };

  React.useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaY = startYRef.current - e.clientY;
      const sensitivity = 0.5;
      const newValue = Math.max(0, Math.min(100, startValueRef.current + deltaY * sensitivity));
      onChange(Math.round(newValue));
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, onChange]);

  const rotation = (value / 100) * 270 - 135; // -135deg to +135deg
  const recommendedRotation =
    recommendedValue != null ? (recommendedValue / 100) * 270 - 135 : null;
  const showRecommendedMarker = recommendedValue != null;
  const differsFromRecommended =
    recommendedValue != null && Math.abs(value - recommendedValue) >= 2;

  // Color scheme changes based on logic mode
  const ledColorScheme = logicMode === 'brickwall' 
    ? {
        low: '#ff6b00',      // Orange for brickwall (aggressive)
        mid: '#ff0000',      // Red
        high: '#cc0000',     // Dark red
        inactive: '#331a00'  // Dark orange inactive
      }
    : {
        low: '#00ff00',      // Green for dynamics (natural)
        mid: '#ffaa00',      // Yellow
        high: '#ff0000',     // Red
        inactive: '#1a4d1a'  // Dark green inactive
      };

  const displayColor = logicMode === 'brickwall' 
    ? 'text-orange-400'
    : 'text-green-400';
  
  const displayShadow = logicMode === 'brickwall'
    ? '0 0 8px rgba(255, 107, 0, 0.8), 0 0 4px rgba(255, 107, 0, 0.4)'
    : '0 0 8px rgba(0, 255, 0, 0.8), 0 0 4px rgba(0, 255, 0, 0.4)';

  return (
    <div className="flex flex-col items-center gap-6">
      {/* Mode indicator badge */}
      <motion.div 
        className="px-3 py-1 rounded-full text-xs font-mono uppercase tracking-wider border"
        style={{
          background: logicMode === 'brickwall' 
            ? 'linear-gradient(180deg, #dc2626, #991b1b)'
            : 'linear-gradient(180deg, #4a5568, #2d3748)',
          borderColor: logicMode === 'brickwall' ? '#ff6b00' : '#00ff00',
          boxShadow: logicMode === 'brickwall'
            ? '0 0 8px rgba(255, 107, 0, 0.3)'
            : '0 0 8px rgba(0, 255, 0, 0.3)'
        }}
        animate={{
          opacity: [1, 0.7, 1],
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: 'easeInOut'
        }}
      >
        <span style={{ color: logicMode === 'brickwall' ? '#ff9944' : '#44ff44' }}>
          {logicMode === 'brickwall' ? '⚡ PRESSURE MODE' : '〰️ FLOW MODE'}
        </span>
      </motion.div>

      {/* LED Ring - Increased by 20% */}
      <div className="relative w-48 h-48">
        {/* AI recommended THD marker on outer ring */}
        {showRecommendedMarker && recommendedRotation != null && (
          <div
            className="absolute inset-0 pointer-events-none z-10"
            aria-hidden
          >
            <div
              className="absolute left-1/2 top-1/2 w-1 h-10 -translate-x-1/2 origin-bottom rounded-full bg-cyan-400"
              style={{
                transform: `translateX(-50%) rotate(${recommendedRotation}deg)`,
                transformOrigin: 'center 96px',
                boxShadow: '0 0 6px rgba(34, 211, 238, 0.9), 0 0 12px rgba(34, 211, 238, 0.4)',
              }}
            />
          </div>
        )}

        {/* LED segments background */}
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 192 192">
          {Array.from({ length: 41 }).map((_, i) => {
            const angle = (i / 40) * 270 - 135;
            const isActive = (i / 40) * 100 <= value;
            const rad = (angle * Math.PI) / 180;
            const innerRadius = 81.6;
            const outerRadius = 88.8;
            const x1 = 96 + Math.cos(rad) * innerRadius;
            const y1 = 96 + Math.sin(rad) * innerRadius;
            const x2 = 96 + Math.cos(rad) * outerRadius;
            const y2 = 96 + Math.sin(rad) * outerRadius;
            
            let color = ledColorScheme.inactive;
            if (isActive) {
              if (i / 40 < 0.6) color = ledColorScheme.low;
              else if (i / 40 < 0.85) color = ledColorScheme.mid;
              else color = ledColorScheme.high;
            }
            
            return (
              <g key={i}>
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={color}
                  strokeWidth="3"
                  strokeLinecap="round"
                  opacity={isActive ? 1 : 0.3}
                />
                {isActive && (
                  <line
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke={color}
                    strokeWidth="5"
                    strokeLinecap="round"
                    opacity="0.6"
                    filter="url(#glow)"
                  />
                )}
              </g>
            );
          })}
          <defs>
            <filter id="glow">
              <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
              <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>
        </svg>

        {/* Knob body - brushed aluminum */}
        <motion.div
          ref={knobRef}
          className={`absolute inset-8 rounded-full cursor-grab ${
            isDragging ? 'cursor-grabbing' : ''
          }`}
          style={{
            background: `
              radial-gradient(circle at 30% 30%, #e8e8e8, #888 50%, #666 70%, #444),
              linear-gradient(135deg, transparent 40%, rgba(255,255,255,0.1) 45%, transparent 50%)
            `,
            boxShadow: `
              inset 0 2px 1px rgba(255, 255, 255, 0.5),
              inset 0 -2px 3px rgba(0, 0, 0, 0.5),
              0 8px 16px rgba(0, 0, 0, 0.6),
              0 2px 4px rgba(0, 0, 0, 0.4)
            `,
          }}
          onMouseDown={handleMouseDown}
          animate={{ rotate: rotation }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        >
          {/* Brushed metal texture */}
          <div 
            className="absolute inset-0 rounded-full opacity-30"
            style={{
              background: 'repeating-linear-gradient(90deg, transparent, transparent 1px, rgba(0,0,0,0.03) 1px, rgba(0,0,0,0.03) 2px)',
            }}
          />

          {/* Center indicator cap */}
          <div className="absolute inset-6 rounded-full bg-gradient-to-br from-zinc-800 via-zinc-900 to-black"
            style={{
              boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.8), inset 0 -1px 2px rgba(255,255,255,0.1)'
            }}
          />

          {/* Pointer indicator - white line */}
          <div className="absolute top-1 left-1/2 -translate-x-1/2 w-1 h-8 bg-white rounded-full"
            style={{
              boxShadow: '0 0 4px rgba(255,255,255,0.8), 0 0 8px rgba(255,255,255,0.4)'
            }}
          />

          {/* Knob grip ridges */}
          {Array.from({ length: 24 }).map((_, i) => {
            const angle = (i / 24) * 360;
            return (
              <div
                key={i}
                className="absolute w-0.5 h-3 bg-black/30 rounded-full"
                style={{
                  top: '8px',
                  left: '50%',
                  transformOrigin: 'center 52px',
                  transform: `translateX(-50%) rotate(${angle}deg)`,
                }}
              />
            );
          })}
        </motion.div>
      </div>

      {/* Value display - LED style */}
      <div className="bg-black px-6 py-2 rounded border border-zinc-800"
        style={{
          boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.8)'
        }}
      >
        <div className="text-2xl font-mono" style={{ color: displayColor, textShadow: displayShadow, fontVariantNumeric: 'tabular-nums' }}>
          {value.toString().padStart(3, '0')}
        </div>
      </div>

      {/* Recommended marker legend + reset */}
      {showRecommendedMarker && (
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-2 text-[10px] font-mono text-cyan-400/90 uppercase tracking-wider">
            <span className="inline-block w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.8)]" />
            Recommended {recommendedValue}%
          </div>
          {differsFromRecommended && onResetRecommended && (
            <button
              type="button"
              onClick={onResetRecommended}
              className="px-3 py-1 rounded border border-cyan-500/30 bg-cyan-950/30 text-[10px] font-mono text-cyan-300 hover:bg-cyan-900/40 transition-colors uppercase tracking-wider"
            >
              Reset to recommended
            </button>
          )}
        </div>
      )}

      {/* Silkscreen labels */}
      <div className="flex justify-between w-48 text-xs text-zinc-400 uppercase tracking-widest font-mono">
        <span>Digital</span>
        <span className="text-zinc-300">Drive</span>
        <span>Analog</span>
      </div>

      <div className="text-center">
        <div className="text-xs font-mono text-zinc-400 tracking-[0.3em] uppercase">THD CONTROL</div>
        <div className="text-xs text-zinc-600 mt-0.5 tracking-widest uppercase">Total Harmonic Distortion</div>
      </div>
    </div>
  );
}
