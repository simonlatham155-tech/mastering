import { motion } from 'motion/react';
import { Headphones, RefreshCw } from 'lucide-react';
import { useState } from 'react';

type PerformanceMode = 'studio' | 'live' | null;

interface LiveModeToggleProps {
  mode: PerformanceMode;
  onChange: (mode: PerformanceMode) => void;
  zeroLatencyMode: boolean;
  onZeroLatencyChange: (enabled: boolean) => void;
  autoMonoBass: boolean;
  onAutoMonoBassChange: (enabled: boolean) => void;
}

export function LiveModeToggle({ 
  mode, 
  onChange,
  zeroLatencyMode,
  onZeroLatencyChange,
  autoMonoBass,
  onAutoMonoBassChange,
}: LiveModeToggleProps) {
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>('default');
  const [isDetecting, setIsDetecting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>('');

  const detectAudioDevices = async () => {
    setIsDetecting(true);
    setErrorMessage('');
    try {
      // Request permission
      await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Get all devices
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter(device => device.kind === 'audioinput');
      setAudioDevices(audioInputs);
      
      // Set default device if available
      if (audioInputs.length > 0 && selectedDevice === 'default') {
        setSelectedDevice(audioInputs[0].deviceId);
      }
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'NotAllowedError') {
          setErrorMessage('Microphone permission denied. Please allow access in browser settings.');
        } else if (error.name === 'NotFoundError') {
          setErrorMessage('No audio input devices found. Please connect an audio interface.');
        } else {
          setErrorMessage('Error detecting audio devices. Check browser permissions.');
        }
      }
    } finally {
      setIsDetecting(false);
    }
  };

  const isLiveMode = mode === 'live';

  return (
    <div 
      className="border-2 rounded-lg p-6"
      style={{
        borderColor: '#2a2a2a',
        background: 'linear-gradient(180deg, #1a1a1a, #0f0f0f)',
        boxShadow: `
          inset 0 2px 4px rgba(0,0,0,0.6),
          inset 0 -1px 2px rgba(255,255,255,0.05),
          0 4px 8px rgba(0,0,0,0.4)
        `
      }}
    >
      {/* Title */}
      <div className="flex flex-col gap-4">
        <div className="text-xs font-mono text-zinc-500 tracking-[0.3em] uppercase">
          {isLiveMode ? 'Live Performance Settings' : 'Studio Recording Settings'}
        </div>
        
        <div className="flex flex-col gap-3">
          {/* Audio Interface Selector */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Headphones className="w-4 h-4 text-purple-400" />
                <div className="text-xs font-mono text-zinc-300">Audio Interface</div>
              </div>
              
              <button
                onClick={detectAudioDevices}
                disabled={isDetecting}
                className="flex items-center gap-1.5 px-2 py-1 rounded bg-purple-500/20 border border-purple-500/40 hover:bg-purple-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RefreshCw className={`w-3 h-3 text-purple-400 ${isDetecting ? 'animate-spin' : ''}`} />
                <span className="text-xs font-mono text-purple-300 uppercase tracking-wider">
                  {isDetecting ? 'Detecting...' : 'Detect'}
                </span>
              </button>
            </div>
            
            <select
              value={selectedDevice}
              onChange={(e) => setSelectedDevice(e.target.value)}
              disabled={audioDevices.length === 0}
              className="w-full px-3 py-2.5 rounded-md bg-black border-2 border-zinc-800 text-xs font-mono text-zinc-300 focus:border-purple-500 focus:outline-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.6)'
              }}
            >
              {audioDevices.length === 0 ? (
                <option value="default">Click "Detect" to scan for audio interfaces</option>
              ) : (
                audioDevices.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Audio Device ${device.deviceId.slice(0, 8)}`}
                  </option>
                ))
              )}
            </select>
            
            {audioDevices.length > 0 && (
              <div className="text-[9px] text-zinc-600 font-mono">
                Buffer: 128 samples • Latency: ~2.9ms @ 44.1kHz
              </div>
            )}
            
            {errorMessage && (
              <div className="flex items-start gap-2 px-3 py-2 rounded bg-red-500/10 border border-red-500/30">
                <div className="text-[10px] font-mono text-red-400 leading-relaxed">
                  {errorMessage}
                </div>
              </div>
            )}
          </div>

          {/* Zero Latency Toggle */}
          <label className="flex items-center justify-between cursor-pointer group">
            <div className="flex flex-col gap-1">
              <div className="text-xs font-mono text-zinc-300 group-hover:text-zinc-100 transition-colors">
                Zero-Latency Mode
              </div>
              <div className="text-[9px] text-zinc-600 font-mono">
                Bypass look-ahead limiter (&lt;1ms)
              </div>
            </div>
            <div 
              className={`relative w-12 h-6 rounded-full transition-all ${
                zeroLatencyMode 
                  ? 'bg-red-500/30' 
                  : 'bg-zinc-800'
              }`}
              onClick={() => onZeroLatencyChange(!zeroLatencyMode)}
            >
              <motion.div
                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full ${
                  zeroLatencyMode 
                    ? 'bg-red-400' 
                    : 'bg-zinc-600'
                }`}
                animate={{ x: zeroLatencyMode ? 24 : 0 }}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                style={{
                  boxShadow: zeroLatencyMode 
                    ? '0 0 8px rgba(248, 113, 113, 0.5)' 
                    : 'none'
                }}
              />
            </div>
          </label>

          {/* Auto-Mono Bass Toggle */}
          <label className="flex items-center justify-between cursor-pointer group">
            <div className="flex flex-col gap-1">
              <div className="text-xs font-mono text-zinc-300 group-hover:text-zinc-100 transition-colors">
                Auto-Mono Bass
              </div>
              <div className="text-[9px] text-zinc-600 font-mono">
                Mono-sum &lt;100Hz for club systems
              </div>
            </div>
            <div 
              className={`relative w-12 h-6 rounded-full transition-all ${
                autoMonoBass 
                  ? 'bg-amber-500/30' 
                  : 'bg-zinc-800'
              }`}
              onClick={() => onAutoMonoBassChange(!autoMonoBass)}
            >
              <motion.div
                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full ${
                  autoMonoBass 
                    ? 'bg-amber-400' 
                    : 'bg-zinc-600'
                }`}
                animate={{ x: autoMonoBass ? 24 : 0 }}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                style={{
                  boxShadow: autoMonoBass 
                    ? '0 0 8px rgba(251, 191, 36, 0.5)' 
                    : 'none'
                }}
              />
            </div>
          </label>

          {/* MIDI Mapping Indicator */}
          <div className="flex items-center gap-2 px-3 py-2 rounded bg-zinc-900/60 border border-zinc-800">
            <div className="w-2 h-2 rounded-full bg-green-500" 
              style={{
                boxShadow: '0 0 8px rgba(34, 197, 94, 0.6)'
              }}
            />
            <div className="text-[9px] font-mono text-zinc-500 uppercase tracking-wider">
              MIDI-Ready: 3 Controls Mappable
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}