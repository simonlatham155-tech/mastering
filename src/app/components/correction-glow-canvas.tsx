import { useEffect, useRef } from 'react';
import { SpectralProfile } from '../services/spectral-analyzer';
import { ReferenceCurve } from '../data/reference-curves';
import { motion } from 'motion/react';

interface CorrectionGlowCanvasProps {
  userProfile: SpectralProfile | null;
  referenceProfile: SpectralProfile | null;
  referenceCurve: ReferenceCurve | null;
  matchStrength: number; // 0-100
  width?: number;
  height?: number;
}

/**
 * CORRECTION GLOW CANVAS
 * Shows the user's frequency graph "bending" toward the target
 * 
 * Instead of moving sliders, the actual curve animates toward the reference.
 * Regions that need correction glow with genre-specific colors:
 * - Pop: High-mids (1-4kHz) glow pink (vocal enhancement)
 * - Lo-Fi: High-end (8kHz+) dims to grey (vintage rolloff)
 * - Techno: Sub (31-63Hz) glows purple (club bass)
 */
export function CorrectionGlowCanvas({
  userProfile,
  referenceProfile,
  referenceCurve,
  matchStrength,
  width = 800,
  height = 400
}: CorrectionGlowCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !userProfile || !referenceProfile || !referenceCurve) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Clear
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, width, height);
    
    // Get profiles
    const userBands = Object.values(userProfile.bands);
    const refBands = Object.values(referenceProfile.bands);
    const positions = [0.05, 0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95];
    
    // Calculate "bent" curve (interpolated between user and reference)
    const strength = matchStrength / 100;
    const bentBands = userBands.map((userDb, i) => {
      const refDb = refBands[i];
      return userDb + (refDb - userDb) * strength;
    });
    
    // Draw grid
    drawGrid(ctx, width, height);
    
    // Draw reference (ghosted)
    drawReferenceCurve(ctx, refBands, positions, width, height, 0.2);
    
    // Draw user's original curve (faint)
    if (strength > 0) {
      drawUserCurve(ctx, userBands, positions, width, height, 0.3);
    }
    
    // Draw "bent" curve with correction glow
    drawBentCurveWithGlow(
      ctx,
      bentBands,
      userBands,
      refBands,
      positions,
      width,
      height,
      strength,
      referenceCurve
    );
    
    // Draw labels
    drawLabels(ctx, width, height);
    
  }, [userProfile, referenceProfile, referenceCurve, matchStrength, width, height]);
  
  if (!userProfile) {
    return (
      <div 
        className="flex items-center justify-center border-2 border-zinc-800 rounded-lg bg-zinc-950"
        style={{ width, height }}
      >
        <div className="text-zinc-600 text-sm font-mono">
          Upload a track to see correction preview
        </div>
      </div>
    );
  }
  
  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="w-full rounded-lg border-2 border-zinc-800"
      />
      
      {/* Correction indicator */}
      {matchStrength > 0 && referenceCurve && (
        <motion.div
          className="absolute bottom-4 right-4 px-3 py-2 rounded-lg border-2 bg-black/80 backdrop-blur-sm"
          style={{
            borderColor: getGenreGlowColor(referenceCurve.visualProfile?.highlightRegion || 'presence')
          }}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          <div className="text-[9px] font-mono text-zinc-500 uppercase tracking-wider">
            Bending Toward Target
          </div>
          <div 
            className="text-sm font-mono font-bold"
            style={{
              color: getGenreGlowColor(referenceCurve.visualProfile?.highlightRegion || 'presence')
            }}
          >
            {matchStrength}% Correction
          </div>
        </motion.div>
      )}
    </div>
  );
}

/**
 * Draw background grid
 */
function drawGrid(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.strokeStyle = '#1a1a1a';
  ctx.lineWidth = 1;
  
  // Horizontal lines (every 3dB)
  for (let db = -60; db <= 0; db += 3) {
    const y = height - ((db + 60) / 60) * height;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
}

/**
 * Draw reference curve (ghosted)
 */
function drawReferenceCurve(
  ctx: CanvasRenderingContext2D,
  refBands: number[],
  positions: number[],
  width: number,
  height: number,
  opacity: number
) {
  ctx.strokeStyle = `rgba(139, 92, 246, ${opacity})`;
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 5]);
  
  ctx.beginPath();
  positions.forEach((x, i) => {
    const xPos = x * width;
    const y = height - ((refBands[i] + 60) / 60) * height;
    
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
 * Draw user's original curve (faint)
 */
function drawUserCurve(
  ctx: CanvasRenderingContext2D,
  userBands: number[],
  positions: number[],
  width: number,
  height: number,
  opacity: number
) {
  ctx.strokeStyle = `rgba(59, 130, 246, ${opacity})`;
  ctx.lineWidth = 2;
  
  ctx.beginPath();
  positions.forEach((x, i) => {
    const xPos = x * width;
    const y = height - ((userBands[i] + 60) / 60) * height;
    
    if (i === 0) {
      ctx.moveTo(xPos, y);
    } else {
      ctx.lineTo(xPos, y);
    }
  });
  ctx.stroke();
}

/**
 * Draw "bent" curve with genre-specific correction glow
 */
function drawBentCurveWithGlow(
  ctx: CanvasRenderingContext2D,
  bentBands: number[],
  userBands: number[],
  refBands: number[],
  positions: number[],
  width: number,
  height: number,
  strength: number,
  referenceCurve: ReferenceCurve
) {
  const highlightRegion = referenceCurve.visualProfile?.highlightRegion;
  const dimRegion = referenceCurve.visualProfile?.dimRegion;
  
  // Determine which bands need significant correction
  const corrections = bentBands.map((bent, i) => Math.abs(refBands[i] - userBands[i]));
  
  // Draw curve with segment-specific glow
  positions.forEach((x, i) => {
    if (i === 0) return; // Skip first point
    
    const prevX = positions[i - 1] * width;
    const prevY = height - ((bentBands[i - 1] + 60) / 60) * height;
    const currX = x * width;
    const currY = height - ((bentBands[i] + 60) / 60) * height;
    
    // Determine if this segment is in highlight/dim region
    const isHighlight = isInRegion(i, highlightRegion);
    const isDim = isInRegion(i, dimRegion);
    const correctionAmount = (corrections[i - 1] + corrections[i]) / 2;
    
    // Calculate glow color and intensity
    let glowColor = '#06b6d4'; // Default cyan
    let glowIntensity = correctionAmount * strength * 0.5;
    
    if (isHighlight) {
      glowColor = getGenreGlowColor(highlightRegion || 'presence');
      glowIntensity = Math.max(0.3, glowIntensity * 1.5); // Boost glow
    } else if (isDim) {
      glowColor = '#52525b'; // Gray
      glowIntensity = Math.max(0.1, glowIntensity * 0.3); // Reduce glow
    }
    
    // Draw segment with glow
    ctx.strokeStyle = glowColor;
    ctx.lineWidth = 4;
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 20 * glowIntensity;
    
    ctx.beginPath();
    ctx.moveTo(prevX, prevY);
    ctx.lineTo(currX, currY);
    ctx.stroke();
  });
  
  ctx.shadowBlur = 0;
  
  // Draw points
  positions.forEach((x, i) => {
    const xPos = x * width;
    const y = height - ((bentBands[i] + 60) / 60) * height;
    
    const isHighlight = isInRegion(i, highlightRegion);
    const isDim = isInRegion(i, dimRegion);
    const correctionAmount = corrections[i];
    
    let pointColor = '#06b6d4';
    if (isHighlight) {
      pointColor = getGenreGlowColor(highlightRegion || 'presence');
    } else if (isDim) {
      pointColor = '#52525b';
    }
    
    // Glow
    ctx.shadowColor = pointColor;
    ctx.shadowBlur = 15 * correctionAmount * strength;
    
    ctx.fillStyle = pointColor;
    ctx.beginPath();
    ctx.arc(xPos, y, 5, 0, Math.PI * 2);
    ctx.fill();
    
    // Outline
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.stroke();
  });
}

/**
 * Check if band index is in specified region
 */
function isInRegion(bandIndex: number, region: string | undefined): boolean {
  if (!region) return false;
  
  const regions: Record<string, number[]> = {
    'sub': [0, 1],              // 31, 63 Hz
    'bass': [1, 2],             // 63, 125 Hz
    'low-mids': [2, 3, 4],      // 125, 250, 500 Hz
    'high-mids': [5, 6, 7],     // 1k, 2k, 4k Hz
    'presence': [5, 6, 7],      // 1k, 2k, 4k Hz
    'air': [8, 9]               // 8k, 16k Hz
  };
  
  return regions[region]?.includes(bandIndex) || false;
}

/**
 * Get glow color for region
 */
function getGenreGlowColor(region: string): string {
  const colors: Record<string, string> = {
    'sub': '#8b5cf6',        // Purple (Techno bass)
    'bass': '#3b82f6',       // Blue
    'low-mids': '#f59e0b',   // Amber (Lo-Fi warmth)
    'high-mids': '#ec4899',  // Pink (Pop vocals)
    'presence': '#ec4899',   // Pink
    'air': '#06b6d4'         // Cyan
  };
  
  return colors[region] || '#06b6d4';
}

/**
 * Draw labels
 */
function drawLabels(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const labels = [
    { text: '31', x: 0.05 },
    { text: '63', x: 0.15 },
    { text: '125', x: 0.25 },
    { text: '250', x: 0.35 },
    { text: '500', x: 0.45 },
    { text: '1k', x: 0.55 },
    { text: '2k', x: 0.65 },
    { text: '4k', x: 0.75 },
    { text: '8k', x: 0.85 },
    { text: '16k', x: 0.95 }
  ];
  
  ctx.fillStyle = '#52525b';
  ctx.font = '10px monospace';
  ctx.textAlign = 'center';
  
  labels.forEach(({ text, x }) => {
    ctx.fillText(text, x * width, height - 8);
  });
}
