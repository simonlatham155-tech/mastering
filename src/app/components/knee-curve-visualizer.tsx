import { useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { Info } from 'lucide-react';

interface KneeCurveVisualizerProps {
  threshold: number; // dB
  ratio: number;
  knee: number; // dB
  isActive: boolean;
}

export function KneeCurveVisualizer({ 
  threshold, 
  ratio, 
  knee,
  isActive 
}: KneeCurveVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const width = canvas.width;
    const height = canvas.height;
    
    // Clear canvas
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, width, height);
    
    // Draw grid
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 1;
    
    // Vertical lines (every 10dB)
    for (let db = -60; db <= 0; db += 10) {
      const x = ((db + 60) / 60) * width;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
      
      // Label
      if (db % 20 === 0) {
        ctx.fillStyle = '#3f3f46';
        ctx.font = '9px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`${db}`, x, height - 5);
      }
    }
    
    // Horizontal lines (every 10dB)
    for (let db = -60; db <= 0; db += 10) {
      const y = height - ((db + 60) / 60) * height;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
      
      // Label
      if (db % 20 === 0) {
        ctx.fillStyle = '#3f3f46';
        ctx.font = '9px monospace';
        ctx.textAlign = 'right';
        ctx.fillText(`${db}`, width - 5, y + 3);
      }
    }
    
    // Draw 1:1 reference line (no compression)
    ctx.strokeStyle = '#27272a';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(0, height);
    ctx.lineTo(width, 0);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // === DRAW COMPRESSION CURVE ===
    
    const kneeStart = threshold - (knee / 2);
    const kneeEnd = threshold + (knee / 2);
    
    // Function to compute output level for a given input level
    const computeOutput = (inputDB: number): number => {
      if (knee === 0) {
        // Hard knee
        if (inputDB < threshold) {
          return inputDB;
        } else {
          return threshold + (inputDB - threshold) / ratio;
        }
      } else {
        // Soft knee
        if (inputDB < kneeStart) {
          // Below knee: no compression
          return inputDB;
        } else if (inputDB > kneeEnd) {
          // Above knee: full ratio compression
          return threshold + (inputDB - threshold) / ratio;
        } else {
          // Inside knee: parabolic interpolation
          const x = inputDB - kneeStart;
          const kneeFactor = (x * x) / (2 * knee);
          return inputDB - kneeFactor * (1 - 1 / ratio);
        }
      }
    };
    
    // Draw compression curve
    const gradient = ctx.createLinearGradient(0, height, width, 0);
    gradient.addColorStop(0, '#3b82f6'); // Blue (below threshold)
    gradient.addColorStop(0.5, '#8b5cf6'); // Purple (knee region)
    gradient.addColorStop(1, '#ec4899'); // Pink (above threshold)
    
    ctx.strokeStyle = isActive ? gradient : '#3f3f46';
    ctx.lineWidth = 3;
    ctx.beginPath();
    
    for (let i = 0; i <= width; i++) {
      const inputDB = (i / width) * 60 - 60; // -60dB to 0dB
      const outputDB = computeOutput(inputDB);
      
      const x = ((inputDB + 60) / 60) * width;
      const y = height - ((outputDB + 60) / 60) * height;
      
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    
    ctx.stroke();
    
    // Highlight knee region
    if (knee > 0) {
      const kneeStartX = ((kneeStart + 60) / 60) * width;
      const kneeEndX = ((kneeEnd + 60) / 60) * width;
      
      ctx.fillStyle = isActive ? 'rgba(139, 92, 246, 0.1)' : 'rgba(63, 63, 70, 0.1)';
      ctx.fillRect(kneeStartX, 0, kneeEndX - kneeStartX, height);
      
      // Knee boundary lines
      ctx.strokeStyle = isActive ? '#8b5cf6' : '#3f3f46';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      
      // Left boundary
      ctx.beginPath();
      ctx.moveTo(kneeStartX, 0);
      ctx.lineTo(kneeStartX, height);
      ctx.stroke();
      
      // Right boundary
      ctx.beginPath();
      ctx.moveTo(kneeEndX, 0);
      ctx.lineTo(kneeEndX, height);
      ctx.stroke();
      
      ctx.setLineDash([]);
    }
    
    // Draw threshold marker
    const thresholdX = ((threshold + 60) / 60) * width;
    const thresholdY = height - ((threshold + 60) / 60) * height;
    
    ctx.strokeStyle = isActive ? '#06b6d4' : '#3f3f46';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(thresholdX, 0);
    ctx.lineTo(thresholdX, height);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.moveTo(0, thresholdY);
    ctx.lineTo(width, thresholdY);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Threshold label
    ctx.fillStyle = isActive ? '#06b6d4' : '#3f3f46';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`Threshold: ${threshold.toFixed(1)} dB`, 10, 20);
    
    // Ratio label
    ctx.fillText(`Ratio: ${ratio.toFixed(1)}:1`, 10, 35);
    
    // Knee label
    ctx.fillText(`Knee: ${knee.toFixed(1)} dB ${knee === 0 ? '(Hard)' : '(Soft)'}`, 10, 50);
    
    // Axes labels
    ctx.fillStyle = '#52525b';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('INPUT LEVEL (dB)', width / 2, height - 20);
    
    ctx.save();
    ctx.translate(15, height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('OUTPUT LEVEL (dB)', 0, 0);
    ctx.restore();
    
  }, [threshold, ratio, knee, isActive]);
  
  return (
    <div className="relative">
      <div className="mb-3 flex items-start gap-2">
        <div className="p-1.5 rounded bg-purple-500/10 border border-purple-500/30">
          <Info className="w-3 h-3 text-purple-400" />
        </div>
        <div className="flex-1">
          <div className="text-[10px] font-mono text-purple-300 uppercase tracking-wider mb-1">
            Compression Curve (Soft Knee Topology)
          </div>
          <div className="text-[8px] font-mono text-zinc-600 leading-relaxed">
            Parabolic interpolation prevents "digital pumping" by smoothing the transition into compression.
            The highlighted region shows where the soft knee is active.
          </div>
        </div>
      </div>
      
      <div className="relative border-2 border-zinc-800 rounded-lg overflow-hidden bg-zinc-950">
        <canvas
          ref={canvasRef}
          width={400}
          height={400}
          className="w-full"
          style={{ imageRendering: 'crisp-edges' }}
        />
        
        {/* Legend */}
        <div className="absolute top-3 right-3 bg-black/80 backdrop-blur-sm rounded border border-zinc-700 p-2">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="w-4 h-0.5 bg-zinc-700" style={{ borderStyle: 'dashed' }}></div>
              <span className="text-[8px] font-mono text-zinc-400">1:1 (No Compression)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-0.5 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500"></div>
              <span className="text-[8px] font-mono text-zinc-400">Compression Curve</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-3 bg-purple-500/20 border border-purple-500/40"></div>
              <span className="text-[8px] font-mono text-zinc-400">Knee Region</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-0.5 bg-cyan-400" style={{ borderStyle: 'dashed' }}></div>
              <span className="text-[8px] font-mono text-zinc-400">Threshold</span>
            </div>
          </div>
        </div>
        
        {/* Status Badge */}
        {isActive && (
          <motion.div
            animate={{ opacity: [1, 0.5, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="absolute bottom-3 right-3 px-2 py-1 rounded-full bg-purple-500/20 border border-purple-500/40"
          >
            <div className="text-[8px] font-mono text-purple-400 uppercase tracking-wider">
              Active
            </div>
          </motion.div>
        )}
      </div>
      
      {/* Technical Explanation */}
      <div className="mt-3 text-[8px] font-mono text-zinc-600 leading-relaxed">
        <span className="text-purple-400 font-semibold">MATHEMATICS:</span> For input levels within the knee range 
        [T - K/2, T + K/2], output = input - (x² / 2K) × (1 - 1/R), where x = input - (T - K/2). 
        This quadratic curve is what differentiates pro compressors from basic Web Audio DynamicsCompressor.
      </div>
    </div>
  );
}
