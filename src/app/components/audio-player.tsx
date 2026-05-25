import { useState, useRef, useEffect } from 'react';
import { motion } from 'motion/react';
import { Play, Pause, SkipBack, SkipForward, Volume2, RefreshCw, Gauge } from 'lucide-react';

interface AudioPlayerProps {
  originalBuffer: AudioBuffer | null;
  processedBuffer: AudioBuffer | null;
  isProcessing: boolean;
}

type PlaybackMode = 'original' | 'processed';

export function AudioPlayer({ originalBuffer, processedBuffer, isProcessing }: AudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.7);
  const [playbackMode, setPlaybackMode] = useState<PlaybackMode>('processed'); // DEFAULT: Start with processed (the mastered version!)
  const [loudnessMatchEnabled, setLoudnessMatchEnabled] = useState(true); // NEW: Toggle for loudness matching
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const loudnessMatchGainRef = useRef<GainNode | null>(null);
  const startTimeRef = useRef<number>(0);
  const pauseTimeRef = useRef<number>(0);
  const originalLUFSRef = useRef<number | null>(null);
  const processedLUFSRef = useRef<number | null>(null);
  
  // Waveform canvas ref
  const waveformCanvasRef = useRef<HTMLCanvasElement | null>(null);
  
  // Derive current buffer based on playback mode
  const hasAudio = originalBuffer !== null || processedBuffer !== null;
  const currentBuffer = playbackMode === 'original' ? originalBuffer : processedBuffer;

  // Initialize audio context
  useEffect(() => {
    audioContextRef.current = new AudioContext();
    
    // === LOUDNESS-MATCHED A/B ARCHITECTURE ===
    // Chain: source -> loudnessMatchGain -> volumeGain -> destination
    // loudnessMatchGain: Compensates for LUFS difference (transparent to user)
    // volumeGain: User-controlled volume (0-100%)
    
    loudnessMatchGainRef.current = audioContextRef.current.createGain();
    gainNodeRef.current = audioContextRef.current.createGain();
    
    loudnessMatchGainRef.current.connect(gainNodeRef.current);
    gainNodeRef.current.connect(audioContextRef.current.destination);
    
    console.log('🔌 Loudness-matched A/B chain initialized:');
    console.log('   source → loudnessMatch → volume → destination');

    return () => {
      stopPlayback();
      audioContextRef.current?.close();
    };
  }, []);

  // Calculate LUFS for both buffers (for loudness matching)
  useEffect(() => {
    if (originalBuffer) {
      const lufs = calculateIntegratedLUFS(originalBuffer);
      originalLUFSRef.current = lufs;
      console.log(`📊 Original LUFS: ${lufs.toFixed(1)} LUFS`);
    } else {
      originalLUFSRef.current = null; // Reset when buffer cleared
    }
  }, [originalBuffer]);

  useEffect(() => {
    if (processedBuffer) {
      const lufs = calculateIntegratedLUFS(processedBuffer);
      processedLUFSRef.current = lufs;
      console.log(`📊 Processed LUFS: ${lufs.toFixed(1)} LUFS`);
      
      // Log loudness delta
      if (originalLUFSRef.current !== null) {
        const delta = lufs - originalLUFSRef.current;
        console.log(`🔊 LOUDNESS DELTA: Processed is ${delta >= 0 ? '+' : ''}${delta.toFixed(1)} dB louder than original`);
        console.log(`   → A/B playback will apply ${-delta.toFixed(1)} dB compensation to processed for fair comparison`);
      }
    } else {
      processedLUFSRef.current = null; // Reset when buffer cleared
    }
  }, [processedBuffer]);

  // Update duration when buffer changes
  useEffect(() => {
    const buffer = playbackMode === 'original' ? originalBuffer : processedBuffer;
    if (buffer) {
      setDuration(buffer.duration);
    }
  }, [originalBuffer, processedBuffer, playbackMode]);
  
  // Draw waveform
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
    const playedColor = playbackMode === 'processed' ? '#0891b2' : '#d97706';
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
      ctx.strokeStyle = playbackMode === 'processed' ? 'rgba(8, 145, 178, 0.5)' : 'rgba(217, 119, 6, 0.5)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(playheadX, 0);
      ctx.lineTo(playheadX, height);
      ctx.stroke();
    }
  }, [playbackMode, currentTime, duration, originalBuffer, processedBuffer]);

  // Update volume
  useEffect(() => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = volume;
      
      // 🔍 TEST B: Log actual vs expected gain
      console.log(`🔊 Volume Control: Set=${volume.toFixed(2)}, Actual=${gainNodeRef.current.gain.value.toFixed(2)}`);
    }
  }, [volume]);

  const stopPlayback = () => {
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.stop();
        sourceNodeRef.current.disconnect();
      } catch (e) {
        // Already stopped
      }
      sourceNodeRef.current = null;
    }
    setIsPlaying(false);
  };

  // Calculate integrated LUFS (ITU-R BS.1770-4 approximation)
  const calculateIntegratedLUFS = (buffer: AudioBuffer): number => {
    // Simplified LUFS calculation (RMS-based approximation)
    // Real LUFS uses K-weighting and gating, but RMS is close enough for A/B matching
    let sumSquares = 0;
    let sampleCount = 0;
    
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const channelData = buffer.getChannelData(ch);
      for (let i = 0; i < channelData.length; i++) {
        sumSquares += channelData[i] * channelData[i];
        sampleCount++;
      }
    }
    
    const rms = Math.sqrt(sumSquares / sampleCount);
    const rmsDB = 20 * Math.log10(rms);
    
    // Convert RMS to LUFS (approximate: LUFS ≈ RMS + 3 dB for typical program material)
    return rmsDB + 3.0;
  };

  const startPlayback = (offset: number = 0, forcedMode?: PlaybackMode) => {
    const context = audioContextRef.current;
    const gainNode = gainNodeRef.current;
    const loudnessMatchGain = loudnessMatchGainRef.current;
    const mode = forcedMode ?? playbackMode; // Use forced mode if provided, otherwise use state
    const buffer = mode === 'original' ? originalBuffer : processedBuffer;

    if (!context || !gainNode || !loudnessMatchGain || !buffer) return;
    
    // === LOUDNESS MATCHING ===
    // Apply compensation gain so both original and processed play at the same perceived loudness
    // This is CRITICAL for fair A/B comparison (Fletcher-Munson equal loudness curve)
    const originalLUFS = originalLUFSRef.current ?? -14;
    const processedLUFS = processedLUFSRef.current ?? -14;
    let compensationDB = 0;
    
    if (mode === 'processed' && originalLUFSRef.current !== null && processedLUFSRef.current !== null) {
      // Make processed match original loudness
      compensationDB = originalLUFS - processedLUFS;
    } else if (mode === 'original' && originalLUFSRef.current !== null && processedLUFSRef.current !== null) {
      // Make original match processed loudness (so switching feels seamless)
      compensationDB = processedLUFS - originalLUFS;
    }
    
    if (loudnessMatchEnabled) {
      loudnessMatchGain.gain.value = Math.pow(10, compensationDB / 20);
    } else {
      loudnessMatchGain.gain.value = 1.0; // No compensation
    }
    
    if (Math.abs(compensationDB) > 0.5) {
      console.log(`🎚️  LOUDNESS COMPENSATION: ${mode} ${compensationDB >= 0 ? '+' : ''}${compensationDB.toFixed(1)} dB (for fair A/B)`);
    }

    // 🔍 TEST C: Log buffer stats + integrity checks at playback start
    console.log(`▶️ Starting playback: mode=${mode}, offset=${offset.toFixed(2)}s`);
    console.log(`   Buffer: ${buffer.numberOfChannels}ch, ${buffer.duration.toFixed(2)}s, ${buffer.sampleRate}Hz`);
    console.log(`   Graph: source -> gain(${gainNode.gain.value.toFixed(2)}) -> destination`);
    
    // Calculate peak and RMS to detect brick-walling
    let peakSample = 0;
    let sumSquares = 0;
    let sampleCount = 0;
    
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const channelData = buffer.getChannelData(ch);
      for (let i = 0; i < channelData.length; i++) {
        const absSample = Math.abs(channelData[i]);
        if (absSample > peakSample) peakSample = absSample;
        sumSquares += channelData[i] * channelData[i];
        sampleCount++;
      }
    }
    
    const rms = Math.sqrt(sumSquares / sampleCount);
    const peakDB = 20 * Math.log10(peakSample);
    const rmsDB = 20 * Math.log10(rms);
    const crestFactor = peakSample / rms;
    
    console.log(`   🎵 ${mode.toUpperCase()} BUFFER STATS:`);
    console.log(`      Peak: ${peakDB.toFixed(1)} dBFS (${peakSample.toFixed(6)} linear)`);
    console.log(`      RMS: ${rmsDB.toFixed(1)} dBFS (${rms.toFixed(6)} linear)`);
    console.log(`      Crest: ${crestFactor.toFixed(1)}`);
    if (peakSample >= 0.99) console.warn('   ⚠️  CLIPPING: Peak sample ≥ 0.99');
    if (crestFactor < 2.5) console.warn('   ⚠️  BRICK-WALLED: Crest factor < 2.5 (over-compressed)');

    // Stop any existing playback
    stopPlayback();

    // Create new source
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(loudnessMatchGain); // Connect to loudness match first, then to volume gain
    
    // Start playback
    source.start(0, offset);
    sourceNodeRef.current = source;
    startTimeRef.current = context.currentTime - offset;
    
    setIsPlaying(true);

    // Update progress
    const updateProgress = () => {
      if (sourceNodeRef.current && context) {
        const elapsed = context.currentTime - startTimeRef.current;
        setCurrentTime(elapsed);
        
        if (elapsed >= buffer.duration) {
          stopPlayback();
          setCurrentTime(0);
          pauseTimeRef.current = 0;
        } else {
          requestAnimationFrame(updateProgress);
        }
      }
    };
    requestAnimationFrame(updateProgress);

    // Auto-stop at end
    source.onended = () => {
      if (isPlaying) {
        stopPlayback();
        setCurrentTime(0);
        pauseTimeRef.current = 0;
      }
    };
  };

  const handlePlayPause = () => {
    if (isPlaying) {
      stopPlayback();
      pauseTimeRef.current = currentTime;
    } else {
      startPlayback(pauseTimeRef.current);
    }
  };

  const handleSkipBack = () => {
    const newTime = Math.max(0, currentTime - 5);
    pauseTimeRef.current = newTime;
    if (isPlaying) {
      startPlayback(newTime);
    } else {
      setCurrentTime(newTime);
    }
  };

  const handleSkipForward = () => {
    const newTime = Math.min(duration, currentTime + 5);
    pauseTimeRef.current = newTime;
    if (isPlaying) {
      startPlayback(newTime);
    } else {
      setCurrentTime(newTime);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    pauseTimeRef.current = newTime;
    setCurrentTime(newTime);
    if (isPlaying) {
      startPlayback(newTime);
    }
  };

  const handleABToggle = () => {
    const wasPlaying = isPlaying;
    const currentProgress = currentTime;
    const newMode = playbackMode === 'original' ? 'processed' : 'original'; // Calculate new mode first
    
    console.log(`🔄 A/B TOGGLE: ${playbackMode} → ${newMode}`);
    console.log(`   Original buffer: ${originalBuffer ? 'EXISTS' : 'NULL'}`);
    if (originalBuffer) {
      console.log(`      Duration: ${originalBuffer.duration.toFixed(1)}s, Peak: ${getPeakLevel(originalBuffer).toFixed(3)}`);
    }
    console.log(`   Processed buffer: ${processedBuffer ? 'EXISTS' : 'NULL'}`);
    if (processedBuffer) {
      console.log(`      Duration: ${processedBuffer.duration.toFixed(1)}s, Peak: ${getPeakLevel(processedBuffer).toFixed(3)}`);
    }
    
    stopPlayback();
    setPlaybackMode(newMode); // Set the new mode
    pauseTimeRef.current = currentProgress;
    
    if (wasPlaying) {
      // Restart playback with the NEW mode (not the old state value)
      console.log(`   ▶️  Restarting playback with ${newMode} buffer`);
      setTimeout(() => startPlayback(currentProgress, newMode), 50);
    }
  };

  // Helper to get peak level from buffer
  const getPeakLevel = (buffer: AudioBuffer): number => {
    let peak = 0;
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < data.length; i++) {
        const abs = Math.abs(data[i]);
        if (abs > peak) peak = abs;
      }
    }
    return peak;
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
            <Volume2 className="w-4 h-4 text-cyan-400" />
            Audio Playback
          </h3>
          <p className="text-xs text-zinc-400 mt-0.5">Real-time monitoring and A/B comparison</p>
        </div>

        {/* Controls Row */}
        <div className="flex items-center gap-2">
          {/* Loudness Match Toggle */}
          <motion.button
            onClick={() => {
              setLoudnessMatchEnabled(!loudnessMatchEnabled);
              console.log(`🎚️  Loudness equalization: ${!loudnessMatchEnabled ? 'ENABLED' : 'DISABLED'}`);
              // If playing, restart to apply change
              if (isPlaying) {
                const currentProgress = currentTime;
                stopPlayback();
                setTimeout(() => startPlayback(currentProgress), 50);
              }
            }}
            disabled={!hasAudio || isProcessing}
            whileHover={hasAudio && !isProcessing ? { scale: 1.05 } : {}}
            whileTap={hasAudio && !isProcessing ? { scale: 0.95 } : {}}
            className={`relative px-3 py-2 rounded-lg font-mono text-xs font-semibold transition-all ${
              hasAudio && !isProcessing
                ? loudnessMatchEnabled
                  ? 'bg-gradient-to-r from-emerald-500/20 to-green-500/20 border-2 border-emerald-500/50 text-emerald-300'
                  : 'bg-zinc-800 border-2 border-zinc-700 text-zinc-400 hover:border-zinc-600'
                : 'bg-zinc-800 border-2 border-zinc-700 text-zinc-500 cursor-not-allowed'
            }`}
            title={loudnessMatchEnabled ? 'Loudness matching ON (fair A/B comparison)' : 'Loudness matching OFF (raw levels)'}
          >
            <div className="flex items-center gap-1.5">
              <Gauge className="w-3.5 h-3.5" />
              <span>{loudnessMatchEnabled ? 'MATCH' : 'RAW'}</span>
            </div>
            
            {hasAudio && !isProcessing && loudnessMatchEnabled && (
              <motion.div
                className="absolute -inset-0.5 rounded-lg blur-md -z-10 bg-emerald-500/30"
                animate={{ opacity: [0.3, 0.6, 0.3] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
            )}
          </motion.button>

          {/* A/B Toggle */}
          <motion.button
            onClick={handleABToggle}
            disabled={!hasAudio || isProcessing}
            whileHover={hasAudio && !isProcessing ? { scale: 1.05 } : {}}
            whileTap={hasAudio && !isProcessing ? { scale: 0.95 } : {}}
            className={`relative px-4 py-2 rounded-lg font-mono text-sm font-semibold transition-all ${
              hasAudio && !isProcessing
                ? playbackMode === 'processed'
                  ? 'bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border-2 border-cyan-500/50 text-cyan-300'
                  : 'bg-gradient-to-r from-amber-500/20 to-orange-500/20 border-2 border-amber-500/50 text-amber-300'
                : 'bg-zinc-800 border-2 border-zinc-700 text-zinc-500 cursor-not-allowed'
            }`}
          >
            <div className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4" />
              <span>Playing: {playbackMode === 'original' ? 'Original' : 'Processed'}</span>
            </div>
            
            {hasAudio && !isProcessing && (
              <motion.div
                className={`absolute -inset-0.5 rounded-lg blur-md -z-10 ${
                  playbackMode === 'processed' ? 'bg-cyan-500/30' : 'bg-amber-500/30'
                }`}
                animate={{ opacity: [0.3, 0.6, 0.3] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
            )}
          </motion.button>
        </div>
      </div>

      {/* Player Housing */}
      <div 
        className="relative bg-black rounded-lg p-6 border-2"
        style={{
          borderColor: '#2a2a2a',
          boxShadow: `
            inset 0 2px 4px rgba(0,0,0,0.8),
            inset 0 -1px 2px rgba(255,255,255,0.05),
            0 4px 8px rgba(0,0,0,0.4)
          `
        }}
      >
        {/* Transport Controls */}
        <div className="flex items-center justify-center gap-4 mb-6">
          <button
            onClick={handleSkipBack}
            disabled={!hasAudio || isProcessing}
            className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all ${
              hasAudio && !isProcessing
                ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
                : 'bg-zinc-900 text-zinc-600 cursor-not-allowed'
            }`}
          >
            <SkipBack className="w-5 h-5" />
          </button>

          <button
            onClick={handlePlayPause}
            disabled={!hasAudio || isProcessing}
            className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${
              hasAudio && !isProcessing
                ? playbackMode === 'processed'
                  ? 'bg-gradient-to-br from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-white shadow-lg shadow-cyan-500/50'
                  : 'bg-gradient-to-br from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white shadow-lg shadow-amber-500/50'
                : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
            }`}
          >
            {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-0.5" />}
          </button>

          <button
            onClick={handleSkipForward}
            disabled={!hasAudio || isProcessing}
            className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all ${
              hasAudio && !isProcessing
                ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
                : 'bg-zinc-900 text-zinc-600 cursor-not-allowed'
            }`}
          >
            <SkipForward className="w-5 h-5" />
          </button>
        </div>

        {/* Waveform Visualization (SoundCloud style) */}
        {hasAudio && currentBuffer && (
          <div className="mb-4 relative">
            <canvas
              ref={waveformCanvasRef}
              className="w-full h-32 rounded cursor-pointer bg-zinc-900/50 transition-all hover:bg-zinc-900/70"
              style={{ display: 'block' }}
              onClick={(e) => {
                // Click to seek
                const rect = e.currentTarget.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const clickPercent = x / rect.width;
                const newTime = clickPercent * duration;
                pauseTimeRef.current = newTime;
                setCurrentTime(newTime);
                if (isPlaying) {
                  startPlayback(newTime);
                }
              }}
              onMouseMove={(e) => {
                // Show hover preview position
                const rect = e.currentTarget.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const hoverPercent = x / rect.width;
                const hoverTime = hoverPercent * duration;
                e.currentTarget.title = formatTime(hoverTime);
              }}
            />
            <div className="flex justify-between text-xs text-zinc-400 font-mono mt-2">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>
        )}

        {!hasAudio && (
          <div className="mb-4 h-32 rounded bg-zinc-900/50 flex items-center justify-center">
            <span className="text-zinc-600 text-sm font-mono">No audio loaded</span>
          </div>
        )}

        {/* Volume Control */}
        <div className="flex items-center gap-3">
          <Volume2 className="w-4 h-4 text-zinc-400" />
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            className="flex-1 h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer"
            style={{
              background: `linear-gradient(to right, #06b6d4 0%, #06b6d4 ${volume * 100}%, #27272a ${volume * 100}%, #27272a 100%)`
            }}
          />
          <span className="text-xs text-zinc-400 font-mono w-12 text-right">
            {Math.round(volume * 100)}%
          </span>
        </div>

        {/* Status Indicator */}
        <div className="mt-4 flex flex-col items-center justify-center gap-2 text-xs">
          {!hasAudio && (
            <span className="text-zinc-500 font-mono">No audio loaded</span>
          )}
          {hasAudio && !currentBuffer && (
            <span className="text-amber-400 font-mono">
              {playbackMode === 'original' ? 'Original' : 'Processed'} buffer not available
            </span>
          )}
          {hasAudio && currentBuffer && (
            <>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${isPlaying ? 'bg-green-500 animate-pulse' : 'bg-zinc-600'}`} />
                <span className="text-zinc-400 font-mono">
                  {isPlaying ? 'Playing' : 'Paused'}: {playbackMode === 'original' ? 'Original' : 'Processed'}
                </span>
              </div>
              
              {/* Loudness compensation indicator */}
              {originalLUFSRef.current !== null && processedLUFSRef.current !== null && (
                <div className="text-zinc-500 font-mono text-[10px]">
                  Loudness-matched A/B: Original {originalLUFSRef.current.toFixed(1)} LUFS | Processed {processedLUFSRef.current.toFixed(1)} LUFS
                  {Math.abs(processedLUFSRef.current - originalLUFSRef.current) > 0.5 && (
                    <span className="text-cyan-400 ml-1">
                      (±{Math.abs(processedLUFSRef.current - originalLUFSRef.current).toFixed(1)} dB comp)
                    </span>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}