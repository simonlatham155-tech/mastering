import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Zap, Activity } from 'lucide-react';

interface TransientVisualizerProps {
  audioContext: AudioContext | null;
  audioSource: AudioBufferSourceNode | null;
  lookaheadTime?: number; // ms (e.g., 5ms for look-ahead)
  width?: number;
  height?: number;
}

/**
 * TRANSIENT VISUALIZER
 * Shows "needle" or "dot" that dances during kick drum hits
 * 
 * Visualizes the WASM look-ahead catching peaks:
 * - Detects transients (kick, snare, hi-hat)
 * - Shows when look-ahead processing is active
 * - Displays attack time and peak level
 * 
 * Useful for Tech House where transient preservation is critical
 */
export function TransientVisualizer({
  audioContext,
  audioSource,
  lookaheadTime = 5,
  width = 400,
  height = 200
}: TransientVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const analyzerRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number | null>(null);
  
  const [transients, setTransients] = useState<TransientEvent[]>([]);
  const [isActive, setIsActive] = useState(false);
  const [peakLevel, setPeakLevel] = useState(0);
  
  useEffect(() => {
    if (!audioContext || !audioSource) return;
    
    // Create analyzer
    const analyzer = audioContext.createAnalyser();
    analyzer.fftSize = 2048;
    analyzer.smoothingTimeConstant = 0.3;
    
    // Connect (if not already connected)
    try {
      audioSource.connect(analyzer);
    } catch (e) {
      // Already connected
    }
    
    analyzerRef.current = analyzer;
    setIsActive(true);
    
    // Start visualization
    startTransientDetection();
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      setIsActive(false);
    };
  }, [audioContext, audioSource]);
  
  /**
   * Detect transients from audio data
   */
  const startTransientDetection = () => {
    const analyzer = analyzerRef.current;
    if (!analyzer) return;
    
    const dataArray = new Uint8Array(analyzer.frequencyBinCount);
    let previousLevel = 0;
    const threshold = 200; // Threshold for transient detection (0-255)
    const riseThreshold = 50; // Minimum rise to be considered a transient
    
    const detect = () => {
      analyzer.getByteTimeDomainData(dataArray);
      
      // Calculate current level (RMS)
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const normalized = (dataArray[i] - 128) / 128;
        sum += normalized * normalized;
      }
      const rms = Math.sqrt(sum / dataArray.length);
      const level = rms * 255;
      
      // Detect transient (sudden rise)
      const rise = level - previousLevel;
      
      if (level > threshold && rise > riseThreshold) {
        // Transient detected!
        const event: TransientEvent = {
          id: Date.now(),
          timestamp: Date.now(),
          level: level / 255, // Normalize to 0-1
          lookahead: lookaheadTime
        };
        
        setTransients(prev => [...prev.slice(-10), event]); // Keep last 10
        setPeakLevel(level / 255);
        
        // Clear peak after 100ms
        setTimeout(() => setPeakLevel(0), 100);
      }
      
      previousLevel = level;
      
      // Continue detection
      animationRef.current = requestAnimationFrame(detect);
    };
    
    detect();
  };
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Clear
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, width, height);
    
    // Draw waveform background
    drawWaveformBackground(ctx, width, height);
    
    // Draw transient markers
    drawTransientMarkers(ctx, transients, width, height);
    
    // Draw peak indicator
    if (peakLevel > 0) {
      drawPeakIndicator(ctx, peakLevel, width, height);
    }
    
  }, [transients, peakLevel, width, height]);
  
  if (!isActive) {
    return (
      <div 
        className="flex items-center justify-center border-2 border-zinc-800 rounded-lg bg-zinc-950"
        style={{ width, height }}
      >
        <div className="text-center">
          <Activity className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
          <div className="text-zinc-600 text-sm font-mono">
            Play audio to visualize transients
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
            Transient Visualizer
          </div>
          <div className="text-[9px] font-mono text-zinc-600">
            Look-ahead: {lookaheadTime}ms • Catching peaks in real-time
          </div>
        </div>
        
        {/* Active indicator */}
        <motion.div
          className="flex items-center gap-2 px-2 py-1 rounded border border-green-500/30 bg-green-500/5"
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ repeat: Infinity, duration: 2 }}
        >
          <Zap className="w-3 h-3 text-green-400" />
          <span className="text-xs font-mono font-semibold text-green-400">
            Active
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
        
        {/* Peak flash overlay */}
        <AnimatePresence>
          {peakLevel > 0 && (
            <motion.div
              className="absolute inset-0 pointer-events-none rounded-lg"
              style={{
                background: `radial-gradient(circle, rgba(34, 197, 94, ${peakLevel * 0.3}) 0%, transparent 70%)`
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.1 }}
            />
          )}
        </AnimatePresence>
      </div>
      
      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        {/* Transients detected */}
        <div className="border border-zinc-800 rounded p-2 bg-zinc-950">
          <div className="text-[8px] font-mono text-zinc-500 uppercase mb-1">
            Transients
          </div>
          <div className="text-lg font-mono font-bold text-green-400">
            {transients.length}
          </div>
        </div>
        
        {/* Last peak level */}
        <div className="border border-zinc-800 rounded p-2 bg-zinc-950">
          <div className="text-[8px] font-mono text-zinc-500 uppercase mb-1">
            Peak Level
          </div>
          <div className="text-lg font-mono font-bold text-cyan-400">
            {(peakLevel * 100).toFixed(0)}%
          </div>
        </div>
        
        {/* Look-ahead time */}
        <div className="border border-zinc-800 rounded p-2 bg-zinc-950">
          <div className="text-[8px] font-mono text-zinc-500 uppercase mb-1">
            Look-ahead
          </div>
          <div className="text-lg font-mono font-bold text-purple-400">
            {lookaheadTime}ms
          </div>
        </div>
      </div>
      
      {/* Info */}
      <div className="text-[8px] font-mono text-zinc-600 leading-relaxed">
        <span className="text-green-400 font-semibold">TRANSIENT DETECTION:</span> The visualizer 
        shows when the WASM look-ahead catches peaks <span className="text-cyan-400">{lookaheadTime}ms</span> before 
        they occur. For <span className="text-purple-400">Tech House</span>, the slow attack (30ms+) 
        lets the kick "click" pass through before compression hits.
      </div>
    </div>
  );
}

interface TransientEvent {
  id: number;
  timestamp: number;
  level: number; // 0-1
  lookahead: number; // ms
}

/**
 * Draw waveform background grid
 */
function drawWaveformBackground(ctx: CanvasRenderingContext2D, width: number, height: number) {
  // Center line
  ctx.strokeStyle = '#262626';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, height / 2);
  ctx.lineTo(width, height / 2);
  ctx.stroke();
  
  // Grid lines
  ctx.strokeStyle = '#1a1a1a';
  ctx.lineWidth = 1;
  
  for (let i = 0; i < 5; i++) {
    const y = (i / 4) * height;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
}

/**
 * Draw transient markers (vertical lines)
 */
function drawTransientMarkers(
  ctx: CanvasRenderingContext2D,
  transients: TransientEvent[],
  width: number,
  height: number
) {
  const now = Date.now();
  const timeWindow = 2000; // Show last 2 seconds
  
  transients.forEach(transient => {
    const age = now - transient.timestamp;
    if (age > timeWindow) return;
    
    // Position from right (newest) to left (oldest)
    const x = width - (age / timeWindow) * width;
    
    // Fade out over time
    const opacity = 1 - (age / timeWindow);
    
    // Height based on level
    const markerHeight = transient.level * height;
    
    // Color based on level
    const color = transient.level > 0.8 ? '#ef4444' : 
                   transient.level > 0.6 ? '#f97316' :
                   transient.level > 0.4 ? '#eab308' : '#22c55e';
    
    // Draw vertical line
    ctx.strokeStyle = `${color}${Math.floor(opacity * 255).toString(16).padStart(2, '0')}`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, (height - markerHeight) / 2);
    ctx.lineTo(x, (height + markerHeight) / 2);
    ctx.stroke();
    
    // Draw dot at peak
    ctx.fillStyle = `${color}${Math.floor(opacity * 255).toString(16).padStart(2, '0')}`;
    ctx.beginPath();
    ctx.arc(x, height / 2 - markerHeight / 2, 4, 0, Math.PI * 2);
    ctx.fill();
  });
}

/**
 * Draw peak indicator (needle)
 */
function drawPeakIndicator(
  ctx: CanvasRenderingContext2D,
  peakLevel: number,
  width: number,
  height: number
) {
  const x = width - 20; // Right side
  const y = height / 2;
  const needleLength = peakLevel * (height / 2) * 0.8;
  
  // Glow
  ctx.shadowColor = '#22c55e';
  ctx.shadowBlur = 20;
  
  // Needle (vertical line)
  ctx.strokeStyle = '#22c55e';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x, y - needleLength);
  ctx.lineTo(x, y + needleLength);
  ctx.stroke();
  
  // Circle at center
  ctx.fillStyle = '#22c55e';
  ctx.beginPath();
  ctx.arc(x, y, 6, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.shadowBlur = 0;
  
  // Level text
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'right';
  ctx.fillText(`${(peakLevel * 100).toFixed(0)}%`, x - 15, y + 4);
}
