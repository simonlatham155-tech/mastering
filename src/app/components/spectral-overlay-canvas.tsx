import { useEffect, useRef } from 'react';
import { SpectralProfile } from '../services/spectral-analyzer';
import { ReferenceCurve } from '../data/reference-curves';

interface SpectralOverlayCanvasProps {
  userProfile: SpectralProfile | null;
  referenceProfile: SpectralProfile | null;
  referenceCurve: ReferenceCurve | null;
  matchStrength: number; // 0-100
  width?: number;
  height?: number;
}

/**
 * SPECTRAL OVERLAY CANVAS
 * Real-time visualization with strength-based "Target Zone Glow"
 * 
 * As the user increases the Strength slider, the "Reference" area glows brighter
 * This provides immediate visual feedback of matching intensity
 */
export function SpectralOverlayCanvas({
  userProfile,
  referenceProfile,
  referenceCurve,
  matchStrength,
  width = 800,
  height = 400
}: SpectralOverlayCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Clear canvas
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, width, height);
    
    // Grid
    drawGrid(ctx, width, height);
    
    // Target Zone (with strength-based glow)
    if (referenceProfile) {
      drawTargetZone(ctx, referenceProfile, width, height, matchStrength);
    }
    
    // Reference Line (ghosted)
    if (referenceProfile && referenceCurve) {
      drawReferenceLine(ctx, referenceProfile, width, height, matchStrength);
    }
    
    // User's Track (active)
    if (userProfile) {
      drawUserLine(ctx, userProfile, referenceProfile, width, height);
    }
    
    // Labels
    drawLabels(ctx, width, height);
    
  }, [userProfile, referenceProfile, referenceCurve, matchStrength, width, height]);
  
  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="w-full rounded-lg"
      style={{ imageRendering: 'crisp-edges' }}
    />
  );
}

/**
 * Draw background grid
 */
function drawGrid(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.strokeStyle = '#1a1a1a';
  ctx.lineWidth = 1;
  
  // Horizontal lines (every 3dB from -60 to 0)
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
  
  // Vertical lines (logarithmic frequency scale)
  const freqPositions = [
    { freq: 31, x: 0.05 },
    { freq: 63, x: 0.15 },
    { freq: 125, x: 0.25 },
    { freq: 250, x: 0.35 },
    { freq: 500, x: 0.45 },
    { freq: 1000, x: 0.55 },
    { freq: 2000, x: 0.65 },
    { freq: 4000, x: 0.75 },
    { freq: 8000, x: 0.85 },
    { freq: 16000, x: 0.95 }
  ];
  
  ctx.strokeStyle = '#1a1a1a';
  freqPositions.forEach(({ x }) => {
    const xPos = x * width;
    ctx.beginPath();
    ctx.moveTo(xPos, 0);
    ctx.lineTo(xPos, height);
    ctx.stroke();
  });
}

/**
 * Draw target zone with strength-based glow
 */
function drawTargetZone(
  ctx: CanvasRenderingContext2D,
  referenceProfile: SpectralProfile,
  width: number,
  height: number,
  matchStrength: number
) {
  const bands = Object.values(referenceProfile.bands);
  const positions = [0.05, 0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95];
  
  // Glow intensity based on strength (0-100% → 0.1-0.4 opacity)
  const glowOpacity = 0.1 + (matchStrength / 100) * 0.3;
  
  // Draw filled area (±3dB tolerance)
  ctx.fillStyle = `rgba(139, 92, 246, ${glowOpacity})`;
  ctx.beginPath();
  
  // Top boundary (+3dB)
  positions.forEach((x, i) => {
    const value = bands[i] + 3;
    const xPos = x * width;
    const y = height - ((value + 60) / 60) * height;
    
    if (i === 0) {
      ctx.moveTo(xPos, y);
    } else {
      ctx.lineTo(xPos, y);
    }
  });
  
  // Bottom boundary (-3dB)
  for (let i = positions.length - 1; i >= 0; i--) {
    const value = bands[i] - 3;
    const xPos = positions[i] * width;
    const y = height - ((value + 60) / 60) * height;
    ctx.lineTo(xPos, y);
  }
  
  ctx.closePath();
  ctx.fill();
  
  // Add glow effect around the zone
  if (matchStrength > 30) {
    ctx.shadowColor = `rgba(139, 92, 246, ${matchStrength / 100})`;
    ctx.shadowBlur = 20 * (matchStrength / 100);
    ctx.strokeStyle = `rgba(139, 92, 246, ${0.3 + matchStrength / 200})`;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
}

/**
 * Draw reference line (ghosted)
 */
function drawReferenceLine(
  ctx: CanvasRenderingContext2D,
  referenceProfile: SpectralProfile,
  width: number,
  height: number,
  matchStrength: number
) {
  const bands = Object.values(referenceProfile.bands);
  const positions = [0.05, 0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95];
  
  // Opacity based on strength (ghosted at low strength, more visible at high)
  const opacity = 0.4 + (matchStrength / 100) * 0.4;
  
  // Gradient based on strength
  const gradient = ctx.createLinearGradient(0, 0, width, 0);
  gradient.addColorStop(0, `rgba(139, 92, 246, ${opacity})`);
  gradient.addColorStop(0.5, `rgba(167, 139, 250, ${opacity})`);
  gradient.addColorStop(1, `rgba(196, 181, 253, ${opacity})`);
  
  ctx.strokeStyle = gradient;
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 4]);
  
  ctx.beginPath();
  positions.forEach((x, i) => {
    const value = bands[i];
    const xPos = x * width;
    const y = height - ((value + 60) / 60) * height;
    
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
 * Draw user's track line (active)
 */
function drawUserLine(
  ctx: CanvasRenderingContext2D,
  userProfile: SpectralProfile,
  referenceProfile: SpectralProfile | null,
  width: number,
  height: number
) {
  const bands = Object.values(userProfile.bands);
  const positions = [0.05, 0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95];
  
  // Gradient
  const gradient = ctx.createLinearGradient(0, 0, width, 0);
  gradient.addColorStop(0, '#3b82f6');
  gradient.addColorStop(0.5, '#06b6d4');
  gradient.addColorStop(1, '#14b8a6');
  
  ctx.strokeStyle = gradient;
  ctx.lineWidth = 3;
  
  ctx.beginPath();
  positions.forEach((x, i) => {
    const value = bands[i];
    const xPos = x * width;
    const y = height - ((value + 60) / 60) * height;
    
    if (i === 0) {
      ctx.moveTo(xPos, y);
    } else {
      ctx.lineTo(xPos, y);
    }
  });
  ctx.stroke();
  
  // Draw points with in/out-of-zone indicators
  const refBands = referenceProfile ? Object.values(referenceProfile.bands) : null;
  
  positions.forEach((x, i) => {
    const value = bands[i];
    const xPos = x * width;
    const y = height - ((value + 60) / 60) * height;
    
    // Check if in target zone
    const isInZone = refBands && Math.abs(value - refBands[i]) <= 3;
    
    // Glow for out-of-zone points
    if (!isInZone && refBands) {
      ctx.shadowColor = '#ef4444';
      ctx.shadowBlur = 10;
    }
    
    ctx.fillStyle = isInZone ? '#10b981' : '#ef4444';
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
 * Draw axis labels and frequency markers
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
    const xPos = x * width;
    ctx.fillText(text, xPos, height - 8);
  });
  
  // Axis labels
  ctx.fillStyle = '#71717a';
  ctx.font = '11px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('FREQUENCY (Hz)', width / 2, height - 25);
  
  ctx.save();
  ctx.translate(20, height / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('LEVEL (dB)', 0, 0);
  ctx.restore();
}
