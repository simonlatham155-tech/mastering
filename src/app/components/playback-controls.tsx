/**
 * PLAYBACK CONTROLS
 * =================
 *
 * Transport + waveform: delivery preview (staged master) with optional
 * gain-matched A/B and per-bar level-delta trace.
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
  gainMatchEnabled?: boolean;
  onGainMatchToggle?: () => void;
  bypassGainMatchDB?: number;
  onHqWaveformPreview?: () => void;
  originalBuffer?: AudioBuffer | null;
  processedBuffer?: AudioBuffer | null;
  isWaveformRendering?: boolean;
  showGainTrace?: boolean;
  gainReductionDB?: number;
  outputTrimDB?: number;
  getPlaybackTime?: () => number;
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
  gainMatchEnabled = false,
  onGainMatchToggle,
  bypassGainMatchDB = 0,
  onHqWaveformPreview,
  originalBuffer,
  processedBuffer,
  isWaveformRendering = false,
  showGainTrace = false,
  gainReductionDB = 0,
  outputTrimDB = 0,
  getPlaybackTime,
}: PlaybackControlsProps) {
  const { isPlaying, currentTime, duration } = playbackState;

  const [isDragging, setIsDragging] = useState(false);
  const [dragTime, setDragTime] = useState(0);

  const waveformCanvasRef = useRef<HTMLCanvasElement | null>(null);

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
  const interactionRef = useRef({ isPlaying, isDragging, dragTime });
  interactionRef.current = { isPlaying, isDragging, dragTime };

  const playbackRef = useRef({
    displayTime,
    duration,
    bypassMode,
    timelineBuffer,
    originalBuffer,
    processedBuffer,
    showGainTrace,
    gainReductionDB,
    outputTrimDB,
  });
  playbackRef.current = {
    displayTime,
    duration,
    bypassMode,
    timelineBuffer,
    originalBuffer,
    processedBuffer,
    showGainTrace,
    gainReductionDB,
    outputTrimDB,
  };

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
    if (!canvas) return;

    const drawWaveform = () => {
      const {
        displayTime: scrubTime,
        duration: dur,
        bypassMode: bypass,
        timelineBuffer: timeline,
        originalBuffer: original,
        processedBuffer: processed,
        showGainTrace: drawTrace,
        gainReductionDB: liveGr,
        outputTrimDB: outTrim,
      } = playbackRef.current;

      const { isDragging: dragging, dragTime: drag } = interactionRef.current;
      const t = dragging ? drag : getPlaybackTime?.() ?? scrubTime;

      if (!timeline || dur <= 0) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

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
      const processedCover = processed?.duration ?? 0;

      for (let i = 0; i < numBars; i++) {
        const x = i * totalBarWidth;
        const timeStart = (i / numBars) * dur;
        const timeEnd = ((i + 1) / numBars) * dur;

        let amplitude = 0.02;
        let useProcessedShape = false;
        let origAmp = 0.02;
        const inPreviewZone =
          !bypass && !!processed && !!original && timeStart < processedCover;

        if (bypass && original) {
          amplitude = barAmplitude(original, timeStart, timeEnd);
        } else if (original) {
          if (processed && timeStart < processedCover) {
            origAmp = barAmplitude(
              original,
              timeStart,
              Math.min(timeEnd, processedCover)
            );
            amplitude = barAmplitude(processed, timeStart, Math.min(timeEnd, processedCover));
            useProcessedShape = true;
          } else {
            amplitude = barAmplitude(original, timeStart, timeEnd);
          }
        } else if (processed) {
          amplitude = barAmplitude(processed, timeStart, timeEnd);
          useProcessedShape = true;
        }

        const barHeight = Math.max(3, amplitude * (height / 2));
        const y = height / 2 - barHeight / 2;
        const isPlayed = timeStart < t;

        if (inPreviewZone) {
          const origHeight = Math.max(3, origAmp * (height / 2));
          const origY = height / 2 - origHeight / 2;
          ctx.fillStyle = isPlayed ? 'rgba(63, 63, 70, 0.85)' : 'rgba(39, 39, 42, 0.9)';
          ctx.fillRect(x, origY, barWidth, origHeight);
        }

        if (isPlayed) {
          ctx.fillStyle = bypass ? '#d97706' : '#0891b2';
        } else {
          ctx.fillStyle = bypass ? '#3f3f46' : useProcessedShape ? '#164e63' : '#27272a';
        }

        ctx.fillRect(x, y, barWidth, barHeight);

        if (drawTrace && inPreviewZone && origAmp > 1e-6) {
          const ratio = amplitude / origAmp;
          const deltaDB = Math.max(-12, Math.min(12, 20 * Math.log10(ratio)));
          const traceH = Math.abs(deltaDB) / 12 * (height * 0.22);
          const traceY =
            deltaDB >= 0 ? height / 2 - barHeight / 2 - traceH - 1 : height / 2 + barHeight / 2 + 1;
          ctx.fillStyle =
            deltaDB >= 0 ? 'rgba(52, 211, 153, 0.55)' : 'rgba(244, 114, 182, 0.5)';
          ctx.fillRect(x, traceY, barWidth, Math.max(1, traceH));
        }
      }

      if (drawTrace && !bypass && processedCover > 0) {
        const playBar = Math.floor((t / dur) * numBars);
        const px = playBar * totalBarWidth;
        const grH = Math.min(height * 0.35, (liveGr / 12) * (height / 2));
        if (grH > 1) {
          ctx.fillStyle = 'rgba(250, 204, 21, 0.65)';
          ctx.fillRect(px, 2, barWidth, grH);
        }
        const boostH = Math.min(height * 0.25, (Math.max(0, outTrim) / 6) * (height / 4));
        if (boostH > 1) {
          ctx.fillStyle = 'rgba(56, 189, 248, 0.45)';
          ctx.fillRect(px, height - boostH - 2, barWidth, boostH);
        }
      }

      const playheadX = (t / dur) * width;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(playheadX, 0);
      ctx.lineTo(playheadX, height);
      ctx.stroke();

      ctx.strokeStyle = bypass ? 'rgba(217, 119, 6, 0.5)' : 'rgba(8, 145, 178, 0.5)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(playheadX, 0);
      ctx.lineTo(playheadX, height);
      ctx.stroke();
    };

    drawWaveform();

    let rafId = 0;
    const tick = () => {
      drawWaveform();
      if (interactionRef.current.isPlaying) {
        rafId = requestAnimationFrame(tick);
      }
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [
    timelineBuffer,
    originalBuffer,
    processedBuffer,
    displayTime,
    duration,
    bypassMode,
    showGainTrace,
    gainReductionDB,
    outputTrimDB,
    getPlaybackTime,
  ]);

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

      <div className="flex flex-wrap items-center gap-2">
        {onBypassToggle && (
          <Button
            onClick={onBypassToggle}
            variant={bypassMode ? 'outline' : 'default'}
            size="sm"
            className={
              bypassMode
                ? 'border-amber-500/50 text-amber-400 hover:bg-amber-500/10'
                : 'bg-cyan-600 hover:bg-cyan-700'
            }
          >
            {bypassMode ? '🎵 Original' : '✨ Processed'}
          </Button>
        )}

        {onGainMatchToggle && (
          <Button
            onClick={onGainMatchToggle}
            variant={gainMatchEnabled ? 'default' : 'outline'}
            size="sm"
            className={
              gainMatchEnabled
                ? 'bg-violet-700 hover:bg-violet-600'
                : 'border-violet-500/40 text-violet-300'
            }
            title="Level-match original to processed for fair A/B (does not affect export)"
          >
            {gainMatchEnabled ? 'Gain Match on' : 'Gain Match'}
          </Button>
        )}

        {onHqWaveformPreview && (
          <Button
            onClick={onHqWaveformPreview}
            variant="outline"
            size="sm"
            disabled={isWaveformRendering}
            className="border-emerald-500/40 text-emerald-300 text-xs"
          >
            HQ preview render
          </Button>
        )}

        {!bypassMode && processedBuffer && processedBuffer.duration < duration && (
          <span className="text-[9px] font-mono text-zinc-500">
            Cyan = staged master · zinc = original · green/pink ticks = level delta (first{' '}
            {Math.round(processedBuffer.duration)}s)
          </span>
        )}

        {gainMatchEnabled && bypassMode && (
          <span className="text-[9px] font-mono text-violet-400">
            Bypass +{bypassGainMatchDB.toFixed(1)} dB to match processed
          </span>
        )}
      </div>

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
