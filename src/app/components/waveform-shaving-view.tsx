import { useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { Scissors, AlertTriangle } from 'lucide-react';

interface WaveformShavingViewProps {
  audioBuffer: AudioBuffer | null;
  currentLUFS: number;
  targetLUFS: number;  // e.g., -6 for D&B
  width?: number;
  height?: number;
}

/**
 * WAVEFORM SHAVING VIEW (D&B "Hard Clipper" Mode)
 * 
 * Shows how peaks are "shaved" to reach extreme loudness (-6 LUFS)
 * 
 * As the user pushes loudness:
 * - Peaks turn RED and "flatten" against ceiling
 * - Visual shows "clipping" (but controlled)
 * - This is how pro D&B engineers get -6 LUFS
 * 
 * Different from Deep House "Glow" view:
 * - D&B: RED clipping indicators (aggressive)
 * - Deep House: ORANGE saturation glow (warm)
 */
export function WaveformShavingView({
  audioBuffer,
  currentLUFS,
  targetLUFS,
  width = 800,
  height = 300
}: WaveformShavingViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Calculate how much "shaving" is happening
  const shavingAmount = calculateShavingAmount(currentLUFS, targetLUFS);
  const isExtreme = currentLUFS >= -5; // D&B extreme territory
  
  useEffect(() => {
    if (!audioBuffer) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Clear
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, width, height);
    
    // Draw waveform with shaving effect
    drawWaveformWithShaving(
      ctx,
      audioBuffer,
      width,
      height,
      shavingAmount,
      isExtreme
    );
    
    // Draw ceiling line
    drawCeilingLine(ctx, width, height, shavingAmount);
    
  }, [audioBuffer, currentLUFS, targetLUFS, width, height, shavingAmount, isExtreme]);
  
  if (!audioBuffer) {
    return (
      <div 
        className="flex items-center justify-center border-2 border-zinc-800 rounded-lg bg-zinc-950"
        style={{ width, height }}
      >
        <div className="text-center">
          <Scissors className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
          <div className="text-zinc-600 text-sm font-mono">
            Upload track to see waveform shaving
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
            Waveform Shaving (D&B Mode)
          </div>
          <div className="text-[9px] font-mono text-zinc-600">
            Peaks are "shaved" to reach -6 LUFS
          </div>
        </div>
        
        {/* Shaving indicator */}
        <motion.div
          className={`flex items-center gap-2 px-2 py-1 rounded border ${
            isExtreme
              ? 'border-red-500/30 bg-red-500/5'
              : shavingAmount > 0.5
              ? 'border-orange-500/30 bg-orange-500/5'
              : 'border-zinc-800 bg-zinc-950'
          }`}
          animate={isExtreme ? { opacity: [1, 0.7, 1] } : {}}
          transition={{ repeat: Infinity, duration: 1.5 }}
        >
          <Scissors className={`w-3 h-3 ${
            isExtreme ? 'text-red-400' :
            shavingAmount > 0.5 ? 'text-orange-400' : 'text-zinc-500'
          }`} />
          <span className={`text-xs font-mono font-semibold ${
            isExtreme ? 'text-red-400' :
            shavingAmount > 0.5 ? 'text-orange-400' : 'text-zinc-500'
          }`}>
            {(shavingAmount * 100).toFixed(0)}% Shaved
          </span>
        </motion.div>
      </div>
      
      {/* Canvas */}
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="w-full rounded-lg border-2 border-zinc-800"
      />
      
      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        {/* Current LUFS */}
        <div className="border border-zinc-800 rounded p-2 bg-zinc-950">
          <div className="text-[8px] font-mono text-zinc-500 uppercase mb-1">
            Current
          </div>
          <div className={`text-sm font-mono font-bold ${
            isExtreme ? 'text-red-400' : 'text-cyan-400'
          }`}>
            {currentLUFS.toFixed(1)} LUFS
          </div>
        </div>
        
        {/* Target LUFS */}
        <div className="border border-zinc-800 rounded p-2 bg-zinc-950">
          <div className="text-[8px] font-mono text-zinc-500 uppercase mb-1">
            Target
          </div>
          <div className="text-sm font-mono font-bold text-white">
            {targetLUFS.toFixed(1)} LUFS
          </div>
        </div>
        
        {/* Peak ceiling */}
        <div className="border border-zinc-800 rounded p-2 bg-zinc-950">
          <div className="text-[8px] font-mono text-zinc-500 uppercase mb-1">
            Peak Ceiling
          </div>
          <div className="text-sm font-mono font-bold text-purple-400">
            -0.3 dBTP
          </div>
        </div>
      </div>
      
      {/* Extreme warning */}
      {isExtreme && (
        <div className="border-2 border-red-500/30 rounded-lg p-3 bg-red-500/5">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-3 h-3 text-red-400" />
            <div className="text-xs font-mono text-red-400 uppercase tracking-wider">
              Extreme Loudness
            </div>
          </div>
          <div className="text-[9px] font-mono text-zinc-400 leading-relaxed">
            You're in <span className="text-red-400 font-semibold">D&B extreme territory</span> (above 
            -5 LUFS). Peaks are heavily shaved for maximum club impact. This is normal for competition 
            mixes, but may cause listener fatigue on headphones.
          </div>
        </div>
      )}
      
      {/* Technical explanation */}
      <div className="text-[8px] font-mono text-zinc-600 leading-relaxed">
        <span className="text-red-400 font-semibold">WAVEFORM SHAVING:</span> To reach extreme loudness 
        (-6 LUFS), we "shave" peaks at <span className="text-purple-400">multiple stages</span> (tracks, 
        buses, master). Red areas show where peaks are <span className="text-red-400">flattened</span> against 
        the ceiling. This is how Noisia, Netsky, and other pro D&B producers achieve floor-shaking power.
      </div>
    </div>
  );
}

/**
 * Calculate shaving amount (0.0 to 1.0)
 */
function calculateShavingAmount(currentLUFS: number, targetLUFS: number): number {
  // More shaving as we approach target
  // -14 LUFS = 0% shaving
  // -6 LUFS = 100% shaving
  
  const dynamicRange = -14 - targetLUFS; // e.g., -14 - (-6) = -8
  const currentRange = -14 - currentLUFS;
  
  const shaving = currentRange / dynamicRange;
  return Math.max(0, Math.min(1, shaving));
}

/**
 * Draw waveform with shaving effect
 */
function drawWaveformWithShaving(
  ctx: CanvasRenderingContext2D,
  audioBuffer: AudioBuffer,
  width: number,
  height: number,
  shavingAmount: number,
  isExtreme: boolean
) {
  const channelData = audioBuffer.getChannelData(0); // Use left channel
  const samples = channelData.length;
  const step = Math.ceil(samples / width);
  const centerY = height / 2;
  const maxAmplitude = height / 2;
  
  // Calculate ceiling based on shaving amount
  const ceiling = maxAmplitude * (1 - shavingAmount * 0.3); // Max 30% reduction
  
  // Draw waveform
  ctx.lineWidth = 1;
  
  for (let x = 0; x < width; x++) {
    const i = x * step;
    
    // Get sample value
    let sample = channelData[i] || 0;
    let y = sample * maxAmplitude;
    
    // Check if peak is "shaved"
    const isShaved = Math.abs(y) > ceiling;
    
    // Clamp to ceiling (shaving effect)
    if (isShaved) {
      y = Math.sign(y) * ceiling;
    }
    
    // Color based on shaving
    if (isShaved) {
      // Red gradient for shaved peaks
      const intensity = Math.min(1, shavingAmount + 0.3);
      ctx.strokeStyle = isExtreme 
        ? `rgba(239, 68, 68, ${intensity})` // Bright red (extreme)
        : `rgba(251, 146, 60, ${intensity})`; // Orange (moderate)
    } else {
      // Cyan for normal waveform
      ctx.strokeStyle = 'rgba(34, 211, 238, 0.6)';
    }
    
    // Draw line
    ctx.beginPath();
    ctx.moveTo(x, centerY);
    ctx.lineTo(x, centerY + y);
    ctx.stroke();
  }
}

/**
 * Draw ceiling line (shows where peaks are shaved)
 */
function drawCeilingLine(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  shavingAmount: number
) {
  const centerY = height / 2;
  const maxAmplitude = height / 2;
  const ceiling = maxAmplitude * (1 - shavingAmount * 0.3);
  
  // Top ceiling
  ctx.strokeStyle = '#ef4444';
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 5]);
  
  ctx.beginPath();
  ctx.moveTo(0, centerY - ceiling);
  ctx.lineTo(width, centerY - ceiling);
  ctx.stroke();
  
  // Bottom ceiling
  ctx.beginPath();
  ctx.moveTo(0, centerY + ceiling);
  ctx.lineTo(width, centerY + ceiling);
  ctx.stroke();
  
  ctx.setLineDash([]);
  
  // Label
  ctx.fillStyle = '#ef4444';
  ctx.font = '10px monospace';
  ctx.textAlign = 'right';
  ctx.fillText('CEILING', width - 10, centerY - ceiling - 5);
  ctx.fillText('CEILING', width - 10, centerY + ceiling + 15);
}
