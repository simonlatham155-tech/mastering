import { useEffect, useRef } from 'react';
import { ReferenceCurve } from '../data/reference-curves';
import { motion, AnimatePresence } from 'motion/react';

interface GenreGhostOverlayProps {
  referenceCurve: ReferenceCurve | null;
  width?: number;
  height?: number;
  opacity?: number; // 0-1, controlled by UI
}

/**
 * GENRE GHOST OVERLAY
 * Shows a faint "swoosh" shape that visualizes the target curve
 * 
 * Different genres have different shapes:
 * - Techno: Nike swoosh (low-heavy, high shimmer)
 * - Pop: Smile curve (scooped mids, boosted highs)
 * - Lo-Fi: Inverse smile (boosted mids, rolled highs)
 * 
 * As the user selects a genre, the ghost "morphs" to show the new target.
 */
export function GenreGhostOverlay({
  referenceCurve,
  width = 800,
  height = 400,
  opacity = 0.3
}: GenreGhostOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  useEffect(() => {
    if (!referenceCurve) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Clear
    ctx.clearRect(0, 0, width, height);
    
    // Get reference values
    const bands = [
      referenceCurve.bands.hz31,
      referenceCurve.bands.hz63,
      referenceCurve.bands.hz125,
      referenceCurve.bands.hz250,
      referenceCurve.bands.hz500,
      referenceCurve.bands.hz1k,
      referenceCurve.bands.hz2k,
      referenceCurve.bands.hz4k,
      referenceCurve.bands.hz8k,
      referenceCurve.bands.hz16k
    ];
    
    // X positions (logarithmic)
    const positions = [0.05, 0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95];
    
    // Draw ghost shape
    drawGhostShape(
      ctx,
      bands,
      positions,
      width,
      height,
      opacity,
      referenceCurve.visualProfile?.swooshShape || 'nike',
      referenceCurve.visualProfile?.highlightRegion,
      referenceCurve.visualProfile?.dimRegion
    );
    
  }, [referenceCurve, width, height, opacity]);
  
  if (!referenceCurve) return null;
  
  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="absolute inset-0 pointer-events-none"
        style={{ mixBlendMode: 'screen' }}
      />
      
      {/* Genre label */}
      <motion.div
        className="absolute top-4 left-4 px-3 py-1.5 rounded-lg border-2 bg-black/60 backdrop-blur-sm"
        style={{
          borderColor: getGenreColor(referenceCurve.visualProfile?.swooshShape || 'nike')
        }}
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
      >
        <div className="text-xs font-mono font-bold uppercase tracking-wider"
          style={{ color: getGenreColor(referenceCurve.visualProfile?.swooshShape || 'nike') }}
        >
          {referenceCurve.name}
        </div>
        <div className="text-[8px] font-mono text-zinc-500 mt-0.5">
          {referenceCurve.description}
        </div>
      </motion.div>
    </div>
  );
}

/**
 * Draw the ghost shape based on genre
 */
function drawGhostShape(
  ctx: CanvasRenderingContext2D,
  bands: number[],
  positions: number[],
  width: number,
  height: number,
  opacity: number,
  shape: string,
  highlightRegion?: string,
  dimRegion?: string
) {
  // Convert relative dB offsets to canvas Y coordinates
  // Assuming typical range of -15 to +10 dB
  const dbRange = 25; // -15 to +10
  const yPositions = bands.map(db => {
    const normalized = (db + 15) / dbRange; // Normalize to 0-1
    return height - (normalized * height * 0.6) - height * 0.2; // Center vertically
  });
  
  // Create gradient based on shape
  const gradient = ctx.createLinearGradient(0, 0, width, 0);
  
  switch (shape) {
    case 'nike': // Techno: Low-heavy, high shimmer
      gradient.addColorStop(0, `rgba(139, 92, 246, ${opacity * 1.5})`);   // Purple (sub/bass)
      gradient.addColorStop(0.4, `rgba(139, 92, 246, ${opacity * 0.5})`); // Fade (mids)
      gradient.addColorStop(1, `rgba(167, 139, 250, ${opacity})`);        // Light purple (highs)
      break;
      
    case 'smile': // Pop/House: Scooped mids, boosted highs
      gradient.addColorStop(0, `rgba(59, 130, 246, ${opacity})`);         // Blue (bass)
      gradient.addColorStop(0.4, `rgba(59, 130, 246, ${opacity * 0.3})`); // Fade (scooped mids)
      gradient.addColorStop(0.7, `rgba(236, 72, 153, ${opacity * 1.2})`); // Pink (presence)
      gradient.addColorStop(1, `rgba(236, 72, 153, ${opacity})`);         // Pink (air)
      break;
      
    case 'inverse-smile': // Lo-Fi: Boosted mids, rolled highs
      gradient.addColorStop(0, `rgba(251, 191, 36, ${opacity * 0.5})`);   // Amber (rolled bass)
      gradient.addColorStop(0.5, `rgba(251, 191, 36, ${opacity * 1.5})`); // Amber (boosted mids)
      gradient.addColorStop(1, `rgba(161, 98, 7, ${opacity * 0.3})`);     // Dark amber (rolled highs)
      break;
      
    case 'v-shape': // Dubstep: Extreme lows and highs
      gradient.addColorStop(0, `rgba(220, 38, 38, ${opacity * 2})`);      // Red (massive sub)
      gradient.addColorStop(0.4, `rgba(220, 38, 38, ${opacity * 0.5})`);  // Fade (mids)
      gradient.addColorStop(1, `rgba(239, 68, 68, ${opacity * 1.5})`);    // Light red (hyped highs)
      break;
      
    default:
      gradient.addColorStop(0, `rgba(139, 92, 246, ${opacity})`);
      gradient.addColorStop(1, `rgba(167, 139, 250, ${opacity})`);
  }
  
  // Draw filled area
  ctx.fillStyle = gradient;
  ctx.beginPath();
  
  // Top edge of curve
  positions.forEach((x, i) => {
    const xPos = x * width;
    const y = yPositions[i];
    
    if (i === 0) {
      ctx.moveTo(xPos, y);
    } else {
      // Smooth curve using quadratic bezier
      const prevX = positions[i - 1] * width;
      const prevY = yPositions[i - 1];
      const cpX = (prevX + xPos) / 2;
      const cpY = (prevY + y) / 2;
      ctx.quadraticCurveTo(cpX, cpY, xPos, y);
    }
  });
  
  // Close shape at bottom
  ctx.lineTo(positions[positions.length - 1] * width, height);
  ctx.lineTo(positions[0] * width, height);
  ctx.closePath();
  ctx.fill();
  
  // Draw highlight regions
  if (highlightRegion) {
    drawHighlightRegion(ctx, highlightRegion, width, height, opacity);
  }
  
  // Draw dim regions
  if (dimRegion) {
    drawDimRegion(ctx, dimRegion, width, height, opacity);
  }
  
  // Draw curve line
  ctx.strokeStyle = gradient;
  ctx.lineWidth = 3;
  ctx.shadowColor = gradient;
  ctx.shadowBlur = 15;
  
  ctx.beginPath();
  positions.forEach((x, i) => {
    const xPos = x * width;
    const y = yPositions[i];
    
    if (i === 0) {
      ctx.moveTo(xPos, y);
    } else {
      const prevX = positions[i - 1] * width;
      const prevY = yPositions[i - 1];
      const cpX = (prevX + xPos) / 2;
      const cpY = (prevY + y) / 2;
      ctx.quadraticCurveTo(cpX, cpY, xPos, y);
    }
  });
  ctx.stroke();
  
  ctx.shadowBlur = 0;
}

/**
 * Highlight a specific frequency region
 */
function drawHighlightRegion(
  ctx: CanvasRenderingContext2D,
  region: string,
  width: number,
  height: number,
  opacity: number
) {
  const regions: Record<string, { x1: number; x2: number; color: string }> = {
    'sub': { x1: 0.05, x2: 0.15, color: '#8b5cf6' },        // 31-63Hz
    'bass': { x1: 0.15, x2: 0.25, color: '#3b82f6' },       // 63-125Hz
    'low-mids': { x1: 0.25, x2: 0.45, color: '#f59e0b' },   // 125-500Hz
    'high-mids': { x1: 0.55, x2: 0.75, color: '#ec4899' },  // 1-4kHz
    'presence': { x1: 0.55, x2: 0.75, color: '#ec4899' },   // 1-4kHz
    'air': { x1: 0.85, x2: 0.95, color: '#06b6d4' }         // 8-16kHz
  };
  
  const r = regions[region];
  if (!r) return;
  
  const x1 = r.x1 * width;
  const x2 = r.x2 * width;
  
  // Draw highlight box
  ctx.fillStyle = `${r.color}33`; // 20% opacity
  ctx.fillRect(x1, 0, x2 - x1, height);
  
  // Draw border
  ctx.strokeStyle = r.color;
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 5]);
  ctx.strokeRect(x1, 0, x2 - x1, height);
  ctx.setLineDash([]);
}

/**
 * Dim a specific frequency region (for rolloff)
 */
function drawDimRegion(
  ctx: CanvasRenderingContext2D,
  region: string,
  width: number,
  height: number,
  opacity: number
) {
  const regions: Record<string, { x1: number; x2: number }> = {
    'sub': { x1: 0.05, x2: 0.15 },        // 31-63Hz
    'low-mids': { x1: 0.25, x2: 0.45 },   // 125-500Hz
    'air': { x1: 0.85, x2: 0.95 }         // 8-16kHz
  };
  
  const r = regions[region];
  if (!r) return;
  
  const x1 = r.x1 * width;
  const x2 = r.x2 * width;
  
  // Draw gray overlay
  ctx.fillStyle = `rgba(0, 0, 0, ${opacity * 0.4})`;
  ctx.fillRect(x1, 0, x2 - x1, height);
  
  // Add diagonal lines pattern
  ctx.strokeStyle = '#52525b';
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 4]);
  
  for (let x = x1; x < x2; x += 10) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  
  ctx.setLineDash([]);
}

/**
 * Get genre-specific color
 */
function getGenreColor(shape: string): string {
  switch (shape) {
    case 'nike': return '#8b5cf6';           // Purple (Techno)
    case 'smile': return '#ec4899';          // Pink (Pop)
    case 'inverse-smile': return '#f59e0b';  // Amber (Lo-Fi)
    case 'v-shape': return '#ef4444';        // Red (Dubstep)
    default: return '#8b5cf6';
  }
}
