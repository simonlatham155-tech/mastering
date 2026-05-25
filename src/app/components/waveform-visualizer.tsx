import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Zap, TrendingUp } from 'lucide-react';

interface WaveformVisualizerProps {
  originalBuffer: AudioBuffer | null;
  processedBuffer: AudioBuffer | null;
  isProcessing: boolean;
  currentTime?: number;
  circuitDrive: number;
}

export function WaveformVisualizer({ 
  originalBuffer, 
  processedBuffer, 
  isProcessing,
  currentTime = 0,
  circuitDrive
}: WaveformVisualizerProps) {
  const originalCanvasRef = useRef<HTMLCanvasElement>(null);
  const processedCanvasRef = useRef<HTMLCanvasElement>(null);
  const gainReductionCanvasRef = useRef<HTMLCanvasElement>(null);
  
  const [peakReduction, setPeakReduction] = useState(0);
  const [avgReduction, setAvgReduction] = useState(0);

  // Draw waveform
  const drawWaveform = (
    canvas: HTMLCanvasElement,
    buffer: AudioBuffer,
    color: string,
    isProcessed: boolean = false
  ) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const data = buffer.getChannelData(0); // Use left channel
    const step = Math.ceil(data.length / width);
    const amp = height / 2;

    ctx.clearRect(0, 0, width, height);

    // Draw center line
    ctx.strokeStyle = '#3f3f46';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();

    // Draw waveform
    ctx.strokeStyle = color;
    ctx.lineWidth = isProcessed ? 2 : 1.5;
    ctx.beginPath();

    for (let i = 0; i < width; i++) {
      let min = 1.0;
      let max = -1.0;

      for (let j = 0; j < step; j++) {
        const datum = data[(i * step) + j] || 0;
        if (datum < min) min = datum;
        if (datum > max) max = datum;
      }

      const yMin = (1 + min) * amp;
      const yMax = (1 + max) * amp;

      if (i === 0) {
        ctx.moveTo(i, yMin);
      } else {
        ctx.lineTo(i, yMin);
      }
      ctx.lineTo(i, yMax);
    }

    ctx.stroke();

    // Fill waveform with gradient
    ctx.globalAlpha = 0.2;
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, color);
    gradient.addColorStop(0.5, 'transparent');
    gradient.addColorStop(1, color);
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.globalAlpha = 1.0;
  };

  // Draw gain reduction overlay
  const drawGainReduction = (
    canvas: HTMLCanvasElement,
    originalBuffer: AudioBuffer,
    processedBuffer: AudioBuffer,
    circuitDrive: number
  ) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const originalData = originalBuffer.getChannelData(0);
    const processedData = processedBuffer.getChannelData(0);
    const step = Math.ceil(originalData.length / width);

    ctx.clearRect(0, 0, width, height);

    let totalReduction = 0;
    let peakReductionValue = 0;
    let reductionCount = 0;

    // Calculate and draw gain reduction
    for (let i = 0; i < width; i++) {
      let originalPeak = 0;
      let processedPeak = 0;

      for (let j = 0; j < step; j++) {
        const idx = (i * step) + j;
        const origAbs = Math.abs(originalData[idx] || 0);
        const procAbs = Math.abs(processedData[idx] || 0);
        if (origAbs > originalPeak) originalPeak = origAbs;
        if (procAbs > processedPeak) processedPeak = procAbs;
      }

      // Calculate reduction (only where processing reduced the signal)
      const reduction = Math.max(0, originalPeak - processedPeak);
      
      if (reduction > 0.01) {
        reductionCount++;
        totalReduction += reduction;
        if (reduction > peakReductionValue) {
          peakReductionValue = reduction;
        }

        // Draw reduction bar
        const barHeight = (reduction / originalPeak) * height * 0.8;
        const intensity = Math.min(1, reduction * 3 + (circuitDrive / 100) * 0.3);
        
        // Color gradient: amber → red based on intensity
        const color = intensity > 0.7 
          ? `rgba(239, 68, 68, ${intensity * 0.6})` // Red for heavy reduction
          : `rgba(245, 158, 11, ${intensity * 0.5})`; // Amber for moderate reduction

        ctx.fillStyle = color;
        ctx.fillRect(i, (height - barHeight) / 2, 1, barHeight);
      }
    }

    // Update metrics
    if (reductionCount > 0) {
      setAvgReduction((totalReduction / reductionCount) * 100);
      setPeakReduction(peakReductionValue * 100);
    }
  };

  // Render waveforms
  useEffect(() => {
    const renderWaveforms = () => {
      if (originalCanvasRef.current && originalBuffer) {
        drawWaveform(originalCanvasRef.current, originalBuffer, '#06b6d4', false);
      }

      if (processedCanvasRef.current && processedBuffer) {
        drawWaveform(processedCanvasRef.current, processedBuffer, '#22c55e', true);
      }

      if (
        gainReductionCanvasRef.current &&
        originalBuffer &&
        processedBuffer &&
        originalBuffer.length === processedBuffer.length
      ) {
        drawGainReduction(
          gainReductionCanvasRef.current,
          originalBuffer,
          processedBuffer,
          circuitDrive
        );
      }
    };

    renderWaveforms();
  }, [originalBuffer, processedBuffer, circuitDrive]);

  // Set canvas resolution
  useEffect(() => {
    const canvases = [originalCanvasRef, processedCanvasRef, gainReductionCanvasRef];
    canvases.forEach(ref => {
      if (ref.current) {
        const canvas = ref.current;
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * 2; // 2x for retina
        canvas.height = rect.height * 2;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.scale(2, 2);
        }
      }
    });
  }, []);

  const hasAudio = originalBuffer !== null || processedBuffer !== null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-green-400" />
            Waveform Analysis
          </h3>
          <p className="text-xs text-zinc-400 mt-0.5">Before/after with gain reduction overlay</p>
        </div>

        {/* Gain Reduction Metrics */}
        {hasAudio && processedBuffer && (
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-xs text-zinc-500 uppercase tracking-wider font-mono">Avg GR</div>
              <div className="text-sm font-mono font-semibold text-amber-400">
                {avgReduction.toFixed(1)}%
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-zinc-500 uppercase tracking-wider font-mono">Peak GR</div>
              <div className="text-sm font-mono font-semibold text-red-400">
                {peakReduction.toFixed(1)}%
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Waveform Display Housing */}
      <div 
        className="relative bg-black rounded-lg p-4 border-2"
        style={{
          borderColor: '#2a2a2a',
          boxShadow: `
            inset 0 2px 4px rgba(0,0,0,0.8),
            inset 0 -1px 2px rgba(255,255,255,0.05),
            0 4px 8px rgba(0,0,0,0.4)
          `
        }}
      >
        {!hasAudio && (
          <div className="flex items-center justify-center h-40 text-zinc-600">
            <div className="text-center">
              <Zap className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm font-mono">No audio loaded</p>
            </div>
          </div>
        )}

        {hasAudio && (
          <div className="space-y-4">
            {/* Original Waveform */}
            {originalBuffer && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-mono text-cyan-400 uppercase tracking-wider">
                    Original
                  </span>
                  <span className="text-xs font-mono text-zinc-500">
                    {originalBuffer.duration.toFixed(2)}s
                  </span>
                </div>
                <div className="relative h-20 bg-zinc-950 rounded border border-zinc-800/50 overflow-hidden">
                  <canvas
                    ref={originalCanvasRef}
                    className="w-full h-full"
                    style={{ width: '100%', height: '100%' }}
                  />
                </div>
              </div>
            )}

            {/* Processed Waveform with Gain Reduction Overlay */}
            {processedBuffer && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-green-400 uppercase tracking-wider">
                      Processed
                    </span>
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full bg-amber-500" />
                      <span className="text-xs text-amber-400 font-mono">Gain Reduction</span>
                    </div>
                  </div>
                  <span className="text-xs font-mono text-zinc-500">
                    {processedBuffer.duration.toFixed(2)}s
                  </span>
                </div>
                <div className="relative h-24 bg-zinc-950 rounded border border-zinc-800/50 overflow-hidden">
                  {/* Processed waveform */}
                  <canvas
                    ref={processedCanvasRef}
                    className="absolute inset-0 w-full h-full"
                    style={{ width: '100%', height: '100%' }}
                  />
                  {/* Gain reduction overlay */}
                  <canvas
                    ref={gainReductionCanvasRef}
                    className="absolute inset-0 w-full h-full pointer-events-none"
                    style={{ width: '100%', height: '100%' }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Processing indicator */}
        {isProcessing && (
          <motion.div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm rounded-lg flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <div className="text-center">
              <motion.div
                className="w-12 h-12 mx-auto mb-3 border-4 border-cyan-500 border-t-transparent rounded-full"
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              />
              <p className="text-sm font-mono text-cyan-400">Processing audio...</p>
            </div>
          </motion.div>
        )}
      </div>

      {/* Legend */}
      {hasAudio && (
        <div className="flex items-center justify-center gap-6 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-3 h-0.5 bg-cyan-500" />
            <span className="text-zinc-400 font-mono">Original Signal</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-0.5 bg-green-500" />
            <span className="text-zinc-400 font-mono">Processed Signal</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-gradient-to-t from-amber-500/50 to-red-500/50 rounded-sm" />
            <span className="text-zinc-400 font-mono">Gain Reduction</span>
          </div>
        </div>
      )}
    </div>
  );
}
