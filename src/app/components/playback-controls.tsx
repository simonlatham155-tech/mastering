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

function barAmplitude(
  buffer: AudioBuffer,
  timeStart: number,
  timeEnd: number
): number {
  const data = buffer.getChannelData(0);
  const bufDuration = buffer.duration;
  if (bufDuration <= 0) return 0.02;

  const startIdx = Math.floor((timeStart / bufDuration) * data.length);
  const endIdx = Math.max(startIdx + 1, Math.floor((timeEnd / bufDuration) * data.length));

  let min = 1.0;
  let max = -1.0;
  for (let j = startIdx; j < endIdx; j++) {
    const datum = data[j] || 0;
    if (datum < min) min = datum;
    if (datum > max) max = datum;
  }

  return Math.max(max - min, 0.02);
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
  
  const [isDragging, setIsDragging] = useState(false);
  const [dragTime, setDragTime] = useState(0);
  
  const waveformCanvasRef = useRef<HTMLCanvasElement | null>(null);
  
  // Full-track timeline always uses original; processed chunk overlays the start in processed mode
  const timelineBuffer = originalBuffer ?? processedBuffer ?? null;
  
  const handleSliderChange = (value: number[]) => {
    setIsDragging(true);
    setDragTime(value[0]);
  };
  
  const handleSliderCommit = (value: number[]) => {
    setIsDragging(false);
    onSeek(value[0]);
  };
  
  const handleWaveformClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = waveformCanvasRef.current;
    if (!canvas || duration === 0) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const clickPosition = x / rect.width;
    const newTime = clickPosition * duration;
    
    onSeek(newTime);
    
    if (!isPlaying) {
      onPlay();
    }
  };
  
  const displayTime = isDragging ? dragTime : currentTime;
  
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  
  const jumpMarkers: number[] = [];
  for (let t = 0; t < duration; t += 60) {
    jumpMarkers.push(t);
  }
  
  useEffect(() => {
    const canvas = waveformCanvasRef.current;
    if (!canvas || !timelineBuffer || duration <= 0) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    
    const width = rect.width;
    const height = rect.height;
    
    ctx.clearRect(0, 0, width, height);
    
    ctx.strokeStyle = '#3f3f46';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();
    
    const barWidth = 3;
    const barGap = 1;
    const totalBarWidth = barWidth + barGap;
    const numBars = Math.floor(width / totalBarWidth);
    const progress = duration > 0 ? currentTime / duration : 0;
    const processedCover = processedBuffer?.duration ?? 0;

    for (let i = 0; i < numBars; i++) {
      const x = i * totalBarWidth;
      const timeStart = (i / numBars) * duration;
      const timeEnd = ((i + 1) / numBars) * duration;

      let amplitude = 0.02;
      let useProcessedShape = false;

      if (bypassMode && originalBuffer) {
        amplitude = barAmplitude(originalBuffer, timeStart, timeEnd);
      } else if (originalBuffer) {
        if (processedBuffer && timeStart < processedCover) {
          amplitude = barAmplitude(processedBuffer, timeStart, Math.min(timeEnd, processedCover));
          useProcessedShape = true;
        } else {
          amplitude = barAmplitude(originalBuffer, timeStart, timeEnd);
        }
      } else if (processedBuffer) {
        amplitude = barAmplitude(processedBuffer, timeStart, timeEnd);
        useProcessedShape = true;
      }

      const barHeight = Math.max(3, amplitude * (height / 2));
      const y = (height / 2) - (barHeight / 2);
      const isPlayed = i / numBars < progress;

      if (isPlayed) {
        ctx.fillStyle = bypassMode ? '#d97706' : (useProcessedShape ? '#0891b2' : '#3f3f46');
      } else {
        ctx.fillStyle = bypassMode ? '#3f3f46' : (useProcessedShape ? '#164e63' : '#27272a');
      }

      ctx.fillRect(x, y, barWidth, barHeight);
    }
    
    if (duration > 0) {
      const playheadX = (currentTime / duration) * width;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(playheadX, 0);
      ctx.lineTo(playheadX, height);
      ctx.stroke();
      
      ctx.strokeStyle = bypassMode ? 'rgba(217, 119, 6, 0.5)' : 'rgba(8, 145, 178, 0.5)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(playheadX, 0);
      ctx.lineTo(playheadX, height);
      ctx.stroke();
    }
  }, [timelineBuffer, originalBuffer, processedBuffer, currentTime, duration, bypassMode]);

  return (
    <div className="space-y-3 p-4 bg-black/20 rounded-lg border border-white/10">
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
        
        <div className="flex-1 relative">
          <canvas
            ref={waveformCanvasRef}
            onClick={handleWaveformClick}
            className="w-full h-20 rounded cursor-pointer bg-black/40 border border-white/10"
            style={{ display: 'block' }}
          />
          {!timelineBuffer && (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-white/40">
              Loading waveform…
            </div>
          )}
          {isWaveformRendering && !bypassMode && timelineBuffer && (
            <div className="absolute top-1 right-2 text-[9px] font-mono text-cyan-400/80 bg-black/60 px-2 py-0.5 rounded">
              Updating mastered preview…
            </div>
          )}
        </div>
        
        <div className="text-sm font-mono text-white/60 w-24 text-right">
          {formatTime(displayTime)} / {formatTime(duration)}
        </div>
      </div>
      
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
              <SkipForward className="h-3 w-3 mr-1" />
              {formatTime(time)}
            </Button>
          ))}
        </div>
      )}
      
      {onBypassToggle && (
        <div className="flex items-center gap-2">
          <Button
            onClick={onBypassToggle}
            variant={bypassMode ? "outline" : "default"}
            size="sm"
            className={
              bypassMode 
                ? "border-amber-500/50 text-amber-400 hover:bg-amber-500/10" 
                : "bg-cyan-600 hover:bg-cyan-700"
            }
          >
            {bypassMode ? '🎵 Original' : '✨ Processed'}
          </Button>
          {!bypassMode && processedBuffer && processedBuffer.duration < duration && (
            <span className="text-[9px] font-mono text-zinc-500">
              Cyan = mastered preview (first {Math.round(processedBuffer.duration)}s)
            </span>
          )}
        </div>
      )}
      
      <Slider
        value={[displayTime]}
        max={duration || 100}
        step={0.1}
        onValueChange={handleSliderChange}
        onValueCommit={handleSliderCommit}
        className="w-full"
      />
    </div>
  );
}
