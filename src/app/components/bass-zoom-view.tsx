import { useEffect, useRef } from 'react';
import { SpectralProfile } from '../services/spectral-analyzer';
import { Activity, AlertCircle, CheckCircle } from 'lucide-react';

interface BassZoomViewProps {
  userProfile: SpectralProfile | null;
  width?: number;
  height?: number;
}

/**
 * BASS ZOOM VIEW
 * Detailed visualization of 20Hz-250Hz for dance music producers
 * 
 * Shows kick/sub relationship which is CRITICAL for dance genres:
 * - 31 Hz: Sub-bass (floor shake)
 * - 63 Hz: Kick thump
 * - 125 Hz: Low-end weight
 * - 250 Hz: Mud zone (should be scooped)
 * 
 * Color coding:
 * - GREEN: Balanced kick/sub relationship
 * - YELLOW: Slightly off (acceptable)
 * - RED: Clashing frequencies (fix your mix!)
 */
export function BassZoomView({
  userProfile,
  width = 600,
  height = 300
}: BassZoomViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Analyze kick/sub relationship
  const bassAnalysis = userProfile ? analyzeBassRelationship(userProfile) : null;
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !userProfile) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Clear
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, width, height);
    
    // Draw grid
    drawBassGrid(ctx, width, height);
    
    // Draw bass spectrum (20Hz-250Hz)
    drawBassSpectrum(ctx, userProfile, width, height);
    
    // Draw frequency labels
    drawBassLabels(ctx, width, height);
    
  }, [userProfile, width, height]);
  
  if (!userProfile) {
    return (
      <div 
        className="flex items-center justify-center border-2 border-zinc-800 rounded-lg bg-zinc-950"
        style={{ width, height }}
      >
        <div className="text-center">
          <Activity className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
          <div className="text-zinc-600 text-sm font-mono">
            Upload track to analyze low-end
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
            Bass Zoom View
          </div>
          <div className="text-[9px] font-mono text-zinc-600">
            Detailed low-end analysis (20Hz-250Hz)
          </div>
        </div>
        
        {/* Kick/Sub relationship status */}
        {bassAnalysis && (
          <div className={`flex items-center gap-2 px-2 py-1 rounded border ${
            bassAnalysis.status === 'balanced' 
              ? 'border-green-500/30 bg-green-500/5' 
              : bassAnalysis.status === 'acceptable'
              ? 'border-yellow-500/30 bg-yellow-500/5'
              : 'border-red-500/30 bg-red-500/5'
          }`}>
            {bassAnalysis.status === 'balanced' ? (
              <CheckCircle className="w-3 h-3 text-green-400" />
            ) : (
              <AlertCircle className="w-3 h-3 text-amber-400" />
            )}
            <span className={`text-xs font-mono font-semibold ${
              bassAnalysis.status === 'balanced' 
                ? 'text-green-400' 
                : bassAnalysis.status === 'acceptable'
                ? 'text-yellow-400'
                : 'text-red-400'
            }`}>
              {bassAnalysis.status === 'balanced' ? 'Balanced' : 
               bassAnalysis.status === 'acceptable' ? 'Acceptable' : 'Clashing'}
            </span>
          </div>
        )}
      </div>
      
      {/* Canvas */}
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="w-full rounded-lg border-2 border-zinc-800"
      />
      
      {/* Bass analysis */}
      {bassAnalysis && (
        <div className="grid grid-cols-4 gap-2">
          {/* Sub (31 Hz) */}
          <div className="border border-zinc-800 rounded p-2 bg-zinc-950">
            <div className="text-[9px] font-mono text-zinc-500 uppercase">Sub</div>
            <div className="text-lg font-mono font-bold text-purple-400">
              {userProfile.bands.hz31.toFixed(1)}
            </div>
            <div className="text-[8px] font-mono text-zinc-600">31 Hz</div>
          </div>
          
          {/* Kick (63 Hz) */}
          <div className="border border-zinc-800 rounded p-2 bg-zinc-950">
            <div className="text-[9px] font-mono text-zinc-500 uppercase">Kick</div>
            <div className="text-lg font-mono font-bold text-blue-400">
              {userProfile.bands.hz63.toFixed(1)}
            </div>
            <div className="text-[8px] font-mono text-zinc-600">63 Hz</div>
          </div>
          
          {/* Low-End (125 Hz) */}
          <div className="border border-zinc-800 rounded p-2 bg-zinc-950">
            <div className="text-[9px] font-mono text-zinc-500 uppercase">Low-End</div>
            <div className="text-lg font-mono font-bold text-cyan-400">
              {userProfile.bands.hz125.toFixed(1)}
            </div>
            <div className="text-[8px] font-mono text-zinc-600">125 Hz</div>
          </div>
          
          {/* Mud (250 Hz) */}
          <div className="border border-zinc-800 rounded p-2 bg-zinc-950">
            <div className="text-[9px] font-mono text-zinc-500 uppercase">Mud</div>
            <div className="text-lg font-mono font-bold text-amber-400">
              {userProfile.bands.hz250.toFixed(1)}
            </div>
            <div className="text-[8px] font-mono text-zinc-600">250 Hz</div>
          </div>
        </div>
      )}
      
      {/* Recommendations */}
      {bassAnalysis && bassAnalysis.issues.length > 0 && (
        <div className="border-2 border-amber-500/30 rounded-lg p-3 bg-amber-500/5">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="w-3 h-3 text-amber-400" />
            <div className="text-xs font-mono text-amber-400 uppercase tracking-wider">
              Low-End Issues Detected
            </div>
          </div>
          <div className="space-y-1 text-[9px] font-mono text-zinc-400">
            {bassAnalysis.issues.map((issue, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-amber-400">•</span>
                <span>{issue}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Technical info */}
      <div className="text-[8px] font-mono text-zinc-600 leading-relaxed">
        <span className="text-purple-400 font-semibold">KICK/SUB RELATIONSHIP:</span> In dance music, 
        the kick (63Hz) should be <span className="text-cyan-400">3-6dB louder</span> than the sub (31Hz) 
        to maintain punch while retaining floor-shaking power. The mud zone (250Hz) should be 
        <span className="text-amber-400"> scooped</span> to prevent "boomy" club playback.
      </div>
    </div>
  );
}

/**
 * Analyze kick/sub relationship
 */
function analyzeBassRelationship(profile: SpectralProfile): {
  status: 'balanced' | 'acceptable' | 'clashing';
  kickSubRatio: number;
  issues: string[];
} {
  const sub = profile.bands.hz31;
  const kick = profile.bands.hz63;
  const lowEnd = profile.bands.hz125;
  const mud = profile.bands.hz250;
  
  const kickSubRatio = kick - sub; // Should be +3 to +6 dB
  const issues: string[] = [];
  
  // Check kick/sub relationship
  if (kickSubRatio < 2) {
    issues.push('Kick is too quiet relative to sub (needs +3 to +6dB separation)');
  } else if (kickSubRatio > 8) {
    issues.push('Kick is too loud relative to sub (may sound thin)');
  }
  
  // Check for sub overload
  if (sub > -10) {
    issues.push('Sub is extremely loud (may cause clipping on club systems)');
  }
  
  // Check for mud buildup
  if (mud > lowEnd - 3) {
    issues.push('250Hz (mud zone) should be 3dB+ quieter than 125Hz');
  }
  
  // Check for hollow low-end
  if (lowEnd < sub - 10) {
    issues.push('125Hz is too quiet (low-end may sound hollow)');
  }
  
  // Determine status
  let status: 'balanced' | 'acceptable' | 'clashing' = 'balanced';
  
  if (kickSubRatio < 2 || kickSubRatio > 8 || mud > lowEnd - 1) {
    status = 'clashing';
  } else if (kickSubRatio < 3 || kickSubRatio > 6 || mud > lowEnd - 2) {
    status = 'acceptable';
  }
  
  return { status, kickSubRatio, issues };
}

/**
 * Draw bass grid
 */
function drawBassGrid(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.strokeStyle = '#1a1a1a';
  ctx.lineWidth = 1;
  
  // Horizontal lines (every 3dB)
  for (let db = -60; db <= 0; db += 3) {
    const y = height - ((db + 60) / 60) * height;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
    
    // Labels every 6dB
    if (db % 6 === 0) {
      ctx.fillStyle = '#3f3f46';
      ctx.font = '10px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`${db}`, width - 8, y + 4);
    }
  }
  
  // Vertical lines for key frequencies
  const freqPositions = [
    { freq: 31, x: 0.15, label: '31 Hz\nSUB' },
    { freq: 63, x: 0.40, label: '63 Hz\nKICK' },
    { freq: 125, x: 0.65, label: '125 Hz\nLOW-END' },
    { freq: 250, x: 0.90, label: '250 Hz\nMUD' }
  ];
  
  freqPositions.forEach(({ x, label }) => {
    const xPos = x * width;
    
    // Line
    ctx.strokeStyle = '#262626';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(xPos, 0);
    ctx.lineTo(xPos, height);
    ctx.stroke();
    
    // Label
    ctx.fillStyle = '#52525b';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    const lines = label.split('\n');
    lines.forEach((line, i) => {
      ctx.fillText(line, xPos, 20 + i * 12);
    });
  });
}

/**
 * Draw bass spectrum with color coding
 */
function drawBassSpectrum(
  ctx: CanvasRenderingContext2D,
  profile: SpectralProfile,
  width: number,
  height: number
) {
  const bands = [profile.bands.hz31, profile.bands.hz63, profile.bands.hz125, profile.bands.hz250];
  const positions = [0.15, 0.40, 0.65, 0.90];
  const colors = ['#8b5cf6', '#3b82f6', '#06b6d4', '#f59e0b']; // Purple, Blue, Cyan, Amber
  
  // Draw bars
  positions.forEach((x, i) => {
    const xPos = x * width;
    const value = bands[i];
    const barHeight = ((value + 60) / 60) * height * 0.8;
    const barWidth = 80;
    
    // Gradient
    const gradient = ctx.createLinearGradient(xPos, height, xPos, height - barHeight);
    gradient.addColorStop(0, colors[i]);
    gradient.addColorStop(1, `${colors[i]}80`);
    
    // Bar
    ctx.fillStyle = gradient;
    ctx.fillRect(xPos - barWidth / 2, height - barHeight, barWidth, barHeight);
    
    // Outline
    ctx.strokeStyle = colors[i];
    ctx.lineWidth = 2;
    ctx.strokeRect(xPos - barWidth / 2, height - barHeight, barWidth, barHeight);
    
    // Value label
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${value.toFixed(1)} dB`, xPos, height - barHeight - 10);
  });
  
  // Draw connecting line
  ctx.strokeStyle = '#06b6d4';
  ctx.lineWidth = 3;
  ctx.setLineDash([5, 5]);
  
  ctx.beginPath();
  positions.forEach((x, i) => {
    const xPos = x * width;
    const value = bands[i];
    const y = height - ((value + 60) / 60) * height * 0.8;
    
    if (i === 0) {
      ctx.moveTo(xPos, y);
    } else {
      ctx.lineTo(xPos, y);
    }
  });
  ctx.stroke();
  ctx.setLineDash([]);
}

/**
 * Draw frequency labels
 */
function drawBassLabels(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.fillStyle = '#71717a';
  ctx.font = '11px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('LOW-END FREQUENCY DISTRIBUTION', width / 2, height - 8);
}
