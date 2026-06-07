/**
 * PLAYBACK CONTROLS
 * =================
 * 
 * Simple transport controls for real-time playback.
 * Play, pause, seek, and time display.
 */

import React, { useState, useEffect, useRef } from 'react';
import { Button } from './ui/button';
import { Slider } from './ui/slider';
import { Play, Pause, SkipForward } from 'lucide-react';
import type { PlaybackState } from '../services/realtime-audio-player';

interface PlaybackControlsProps {
  playbackState: PlaybackState;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (timeSeconds: number) => void;
  onJumpTo: (timeSeconds: number) => void;
  bypassMode?: boolean;
  onBypassToggle?: () => void;
  originalBuffer?: AudioBuffer | null;
  processedBuffer?: AudioBuffer | null;
  isWaveformRendering?: boolean;
}

export function PlaybackControls({
  playbackState,
  onPlay,
  onPause,
  onSeek,
  onJumpTo,
  bypassMode = false,
  onBypassToggle,
  originalBuffer,
  processedBuffer,
  isWaveformRendering = false,
}: PlaybackControlsProps) {
  const { isPlaying, currentTime, duration } = playbackState;
  
  // Local state for smooth slider dragging
  const [isDragging, setIsDragging] = useState(false);
  const [dragTime, setDragTime] = useState(0);
  
  // Waveform canvas ref
  const waveformCanvasRef = useRef<HTMLCanvasElement | null>(null);
  
  // Current buffer (bypass mode determines which one to show)
  // PATCH 2026-05-25: Show processed waveform when in processed mode (was always showing original)
  const currentBuffer = bypassMode
    ? originalBuffer
    : processedBuffer ?? null;
  
  // Handle slider change (while dragging)
  const handleSliderChange = (value: number[]) => {
    setIsDragging(true);
    setDragTime(value[0]);
  };
  
  // Handle slider commit (after dragging stops)
  const handleSliderCommit = (value: number[]) => {
    setIsDragging(false);
    onSeek(value[0]);
  };
  
  // Handle waveform click (seek)
  const handleWaveformClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = waveformCanvasRef.current;
    if (!canvas || duration === 0) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const clickPosition = x / rect.width;
    const newTime = clickPosition * duration;
    
    onSeek(newTime);
    
    // Auto-play when clicking on waveform
    if (!isPlaying) {
      onPlay();
    }
  };
  
  // Display time (use drag time while dragging, otherwise current time)
  const displayTime = isDragging ? dragTime : currentTime;
  
  // Format time as MM:SS
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  
  // Generate jump markers (every 60s)
  const jumpMarkers: number[] = [];
  for (let t = 0; t < duration; t += 60) {
    jumpMarkers.push(t);
  }
  
  // Draw waveform (SoundCloud-style)
  useEffect(() => {
    const canvas = waveformCanvasRef.current;
    if (!canvas || !currentBuffer) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Set canvas size (high DPI support)
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    
    const width = rect.width;
    const height = rect.height;
    const data = currentBuffer.getChannelData(0); // Use first channel
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    
    // Draw center line
    ctx.strokeStyle = '#3f3f46';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();
    
    // === DRAW WAVEFORM (SoundCloud style) ===
    const playedColor = bypassMode ? '#d97706' : '#0891b2'; // Amber for original, Cyan for processed
    const unplayedColor = '#3f3f46';
    
    // Draw waveform bars (SoundCloud style)
    const barWidth = 3;
    const barGap = 1;
    const totalBarWidth = barWidth + barGap;
    const numBars = Math.floor(width / totalBarWidth);
    
    for (let i = 0; i < numBars; i++) {
      const x = i * totalBarWidth;
      
      // Calculate which samples this bar represents
      const startIdx = Math.floor((i / numBars) * data.length);
      const endIdx = Math.floor(((i + 1) / numBars) * data.length);
      
      // Find min/max in this range for the bar height
      let min = 1.0;
      let max = -1.0;
      
      for (let j = startIdx; j < endIdx; j++) {
        const datum = data[j] || 0;
        if (datum < min) min = datum;
        if (datum > max) max = datum;
      }
      
      // Calculate bar height (ensure minimum visibility)
      const amplitude = Math.max(max - min, 0.02);
      const barHeight = Math.max(3, amplitude * (height / 2));
      const y = (height / 2) - (barHeight / 2);
      
      // Determine color based on playback position
      const progress = duration > 0 ? currentTime / duration : 0;
      const isPlayed = i / numBars < progress;
      
      ctx.fillStyle = isPlayed ? playedColor : unplayedColor;
      ctx.fillRect(x, y, barWidth, barHeight);
    }
    
    // Draw playhead
    if (duration > 0) {
      const playheadX = (currentTime / duration) * width;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(playheadX, 0);
      ctx.lineTo(playheadX, height);
      ctx.stroke();
      
      // Add a subtle glow to the playhead
      ctx.strokeStyle = bypassMode ? 'rgba(217, 119, 6, 0.5)' : 'rgba(8, 145, 178, 0.5)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(playheadX, 0);
      ctx.lineTo(playheadX, height);
      ctx.stroke();
    }
  }, [currentBuffer, currentTime, duration, bypassMode]);

  return (
    <div className="space-y-3 p-4 bg-black/20 rounded-lg border border-white/10">
      {/* Transport Controls */}
      <div className="flex items-center gap-3">
        <Button
          onClick={isPlaying ? onPause : onPlay}
          variant="outline"
          size="icon"
          className="h-10 w-10"
        >
          {isPlaying ? (
            <Pause className="h-5 w-5" />
          ) : (
            <Play className="h-5 w-5" />
          )}
        </Button>
        
        {/* SoundCloud-style Waveform */}
        <div className="flex-1 relative">
          <canvas
            ref={waveformCanvasRef}
            onClick={handleWaveformClick}
            className="w-full h-20 rounded cursor-pointer bg-black/40 border border-white/10"
            style={{ display: 'block' }}
          />
          {!currentBuffer && (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-white/40">
              {!bypassMode && isWaveformRendering
                ? 'Rendering mastered waveform…'
                : bypassMode
                  ? 'Loading original…'
                  : 'Mastered waveform pending — play for live preview'}
            </div>
          )}
        </div>
        
        <div className="text-sm font-mono text-white/60 w-24 text-right">
          {formatTime(displayTime)} / {formatTime(duration)}
        </div>
      </div>
      
      {/* Quick Jump Buttons */}
      {jumpMarkers.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          <div className="text-xs text-white/40 flex items-center mr-2">
            Quick jump:
          </div>
          {jumpMarkers.map((time) => (
            <Button
              key={time}
              onClick={() => onJumpTo(time)}
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
            >
              {formatTime(time)}
            </Button>
          ))}
        </div>
      )}
      
      {/* Playback Mode Badge + A/B Comparison */}
      <div className="flex items-center gap-2 text-xs">
        <div className="px-2 py-1 rounded bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
          Draft Quality (Real-time)
        </div>
        
        {/* A/B Comparison Toggle */}
        {onBypassToggle && (
          <Button
            onClick={onBypassToggle}
            variant={bypassMode ? "outline" : "default"}
            size="sm"
            className={`h-7 px-3 text-xs ${
              bypassMode 
                ? 'bg-white/10 text-white border-white/30' 
                : 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white border-cyan-500/50'
            }`}
          >
            {bypassMode ? '🎵 Original' : '✨ Processed'}
          </Button>
        )}
        
        <div className="text-white/40">
          {onBypassToggle ? 'Toggle to compare' : 'Export uses full quality offline rendering'}
        </div>
      </div>
    </div>
  );
}