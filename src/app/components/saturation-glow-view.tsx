import { useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { Sparkles, Sun } from 'lucide-react';

interface SaturationGlowViewProps {
  audioBuffer: AudioBuffer | null;
  saturationAmount: number; // 0.0 to 1.0 (typically 0.4 for Deep House)
  width?: number;
  height?: number;
}

/**
 * SATURATION GLOW VIEW (Deep House "Warmth" Mode)
 * 
 * Shows warm orange "saturation glow" instead of red clipping
 * 
 * Visually tells the user they are adding "color" (harmonics)
 * rather than just "loudness" (clipping)
 * 
 * Different from D&B "Shaving" view:
 * - D&B: RED peaks flattened (aggressive, hard clipping)
 * - Deep House: ORANGE glow (warm, analog tape saturation)
 */
export function SaturationGlowView({
  audioBuffer,
  saturationAmount,
  width = 800,
  height = 300
}: SaturationGlowViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  useEffect(() => {
    if (!audioBuffer) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Clear
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, width, height);
    
    // Draw waveform with warm glow
    drawWaveformWithGlow(
      ctx,
      audioBuffer,
      width,
      height,
      saturationAmount
    );
    
  }, [audioBuffer, saturationAmount, width, height]);
  
  if (!audioBuffer) {
    return (
      <div 
        className="flex items-center justify-center border-2 border-zinc-800 rounded-lg bg-zinc-950"
        style={{ width, height }}
      >
        <div className="text-center">
          <Sun className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
          <div className="text-zinc-600 text-sm font-mono">
            Upload track to see saturation glow
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-mono text-zinc-400 uppercase tracking-wider">
            Saturation Glow (Deep House Mode)
          </div>
          <div className="text-[9px] font-mono text-zinc-600">
            Warm tape saturation adds analog color
          </div>
        </div>
        
        {/* Saturation indicator */}
        <motion.div
          className="flex items-center gap-2 px-2 py-1 rounded border border-orange-500/30 bg-orange-500/5"
          animate={{ opacity: [0.8, 1, 0.8] }}
          transition={{ repeat: Infinity, duration: 2 }}
        >
          <Sparkles className="w-3 h-3 text-orange-400" />
          <span className="text-xs font-mono font-semibold text-orange-400">
            {(saturationAmount * 100).toFixed(0)}% Saturation
          </span>
        </motion.div>
      </div>
      
      {/* Canvas */}
      <div className="relative">
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          className="w-full rounded-lg border-2 border-zinc-800"
        />
        
        {/* Glow overlay */}
        <div 
          className="absolute inset-0 pointer-events-none rounded-lg"
          style={{
            background: `radial-gradient(circle, rgba(251, 146, 60, ${saturationAmount * 0.15}) 0%, transparent 70%)`,
            mixBlendMode: 'screen'
          }}
        />
      </div>
      
      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        {/* Saturation type */}
        <div className="border border-zinc-800 rounded p-2 bg-zinc-950">
          <div className="text-[8px] font-mono text-zinc-500 uppercase mb-1">
            Type
          </div>
          <div className="text-sm font-mono font-bold text-orange-400">
            Warm Tape
          </div>
        </div>
        
        {/* Saturation blend */}
        <div className="border border-zinc-800 rounded p-2 bg-zinc-950">
          <div className="text-[8px] font-mono text-zinc-500 uppercase mb-1">
            Blend
          </div>
          <div className="text-sm font-mono font-bold text-amber-400">
            {(saturationAmount * 100).toFixed(0)}%
          </div>
        </div>
        
        {/* Harmonics added */}
        <div className="border border-zinc-800 rounded p-2 bg-zinc-950">
          <div className="text-[8px] font-mono text-zinc-500 uppercase mb-1">
            Harmonics
          </div>
          <div className="text-sm font-mono font-bold text-yellow-400">
            2nd + 3rd
          </div>
        </div>
      </div>
      
      {/* Saturation info */}
      <div className="border-2 border-orange-500/30 rounded-lg p-3 bg-orange-500/5">
        <div className="flex items-center gap-2 mb-2">
          <Sun className="w-3 h-3 text-orange-400" />
          <div className="text-xs font-mono text-orange-400 uppercase tracking-wider">
            Analog Warmth
          </div>
        </div>
        <div className="text-[9px] font-mono text-zinc-400 leading-relaxed">
          <span className="text-orange-400 font-semibold">40% Tape Saturation</span> adds warm 
          harmonic color (2nd and 3rd harmonics) like a 1990s analog tape machine. This creates 
          <span className="text-amber-400"> harmonic glue</span> that makes digital synths sound organic and vintage.
        </div>
      </div>
      
      {/* Comparison: Saturation vs Clipping */}
      <div className="grid grid-cols-2 gap-2">
        {/* Clipping (bad) */}
        <div className="border border-zinc-800 rounded p-2 bg-zinc-950">
          <div className="text-[9px] font-mono text-zinc-500 uppercase mb-2">
            ❌ Hard Clipping
          </div>
          <div className="text-[8px] font-mono text-zinc-600 leading-relaxed">
            Cuts peaks sharply. Adds harsh odd harmonics. Sounds digital and aggressive.
          </div>
        </div>
        
        {/* Saturation (good) */}
        <div className="border border-orange-500/30 rounded p-2 bg-orange-500/5">
          <div className="text-[9px] font-mono text-orange-400 uppercase mb-2">
            ✓ Tape Saturation
          </div>
          <div className="text-[8px] font-mono text-zinc-400 leading-relaxed">
            Rounds peaks smoothly. Adds warm even harmonics. Sounds analog and musical.
          </div>
        </div>
      </div>
      
      {/* Technical explanation */}
      <div className="text-[8px] font-mono text-zinc-600 leading-relaxed">
        <span className="text-orange-400 font-semibold">WARM TAPE SATURATION:</span> Unlike hard 
        clipping (D&B), Deep House uses <span className="text-amber-400">soft saturation</span> that 
        adds <span className="text-yellow-400">2nd and 3rd harmonics</span>. This creates the "warmth" 
        and "glue" of analog gear. The <span className="text-orange-400">orange glow</span> shows where 
        saturation is adding color without harsh distortion.
      </div>
    </div>
  );
}

/**
 * Draw waveform with warm saturation glow
 */
function drawWaveformWithGlow(
  ctx: CanvasRenderingContext2D,
  audioBuffer: AudioBuffer,
  width: number,
  height: number,
  saturationAmount: number
) {
  const channelData = audioBuffer.getChannelData(0);
  const samples = channelData.length;
  const step = Math.ceil(samples / width);
  const centerY = height / 2;
  const maxAmplitude = height / 2;
  
  // Draw waveform with gradient
  for (let x = 0; x < width; x++) {
    const i = x * step;
    
    // Get sample value
    let sample = channelData[i] || 0;
    
    // Apply soft saturation curve (tanh-like)
    const saturated = Math.tanh(sample * (1 + saturationAmount * 2));
    
    const y = saturated * maxAmplitude;
    const amplitude = Math.abs(y);
    
    // Color based on amplitude (warm gradient)
    // Low amplitude: cyan (clean)
    // High amplitude: orange→amber (saturated)
    const saturationIntensity = (amplitude / maxAmplitude) * saturationAmount;
    
    if (saturationIntensity > 0.3) {
      // High saturation: warm orange/amber
      const warmth = Math.min(1, saturationIntensity);
      ctx.strokeStyle = `rgba(251, 146, 60, ${0.6 + warmth * 0.4})`; // Orange
    } else if (saturationIntensity > 0.1) {
      // Medium saturation: yellow
      ctx.strokeStyle = `rgba(250, 204, 21, 0.7)`; // Yellow
    } else {
      // Low saturation: cyan (clean)
      ctx.strokeStyle = 'rgba(34, 211, 238, 0.6)'; // Cyan
    }
    
    // Draw line with glow
    if (saturationIntensity > 0.2) {
      ctx.shadowColor = 'rgba(251, 146, 60, 0.5)';
      ctx.shadowBlur = 10 * saturationIntensity;
    } else {
      ctx.shadowBlur = 0;
    }
    
    ctx.beginPath();
    ctx.moveTo(x, centerY);
    ctx.lineTo(x, centerY + y);
    ctx.stroke();
  }
  
  ctx.shadowBlur = 0;
}
