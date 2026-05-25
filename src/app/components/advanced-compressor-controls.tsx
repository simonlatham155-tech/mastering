import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, ChevronUp, Sliders } from 'lucide-react';
import { KneeCurveVisualizer } from './knee-curve-visualizer';

export interface AdvancedCompressorSettings {
  threshold: number; // dB
  ratio: number;
  knee: number; // dB
  attack: number; // ms
  release: number; // ms
  makeupGain: number; // dB
  detectionMode: 'peak' | 'rms';
  sidechainHPF: boolean;
  hpfCutoff: number; // Hz
}

interface AdvancedCompressorControlsProps {
  settings: AdvancedCompressorSettings;
  onChange: (settings: AdvancedCompressorSettings) => void;
}

export function AdvancedCompressorControls({
  settings,
  onChange
}: AdvancedCompressorControlsProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const updateSetting = <K extends keyof AdvancedCompressorSettings>(
    key: K,
    value: AdvancedCompressorSettings[K]
  ) => {
    onChange({ ...settings, [key]: value });
  };
  
  return (
    <div 
      className="border-2 rounded-lg overflow-hidden"
      style={{
        borderColor: '#2a2a2a',
        background: 'linear-gradient(180deg, #1a1a1a, #0f0f0f)',
        boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.6)'
      }}
    >
      {/* Header (Always Visible) */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-zinc-800/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded bg-purple-500/10 border border-purple-500/30">
            <Sliders className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-left">
            <div className="text-xs font-mono text-purple-300 uppercase tracking-wider">
              Advanced Compressor Settings
            </div>
            <div className="text-[9px] font-mono text-zinc-600">
              {isExpanded ? 'Pro controls for fine-tuning' : 'Click to expand pro controls'}
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Quick Status */}
          {!isExpanded && (
            <div className="flex items-center gap-2 text-[9px] font-mono text-zinc-600">
              <span>{settings.threshold} dB</span>
              <span>•</span>
              <span>{settings.ratio}:1</span>
              <span>•</span>
              <span className="text-purple-400">{settings.detectionMode.toUpperCase()}</span>
            </div>
          )}
          
          {isExpanded ? (
            <ChevronUp className="w-5 h-5 text-purple-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-zinc-600" />
          )}
        </div>
      </button>
      
      {/* Expanded Controls */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="px-6 pb-6 border-t border-zinc-800">
              <div className="grid grid-cols-2 gap-6 mt-6">
                {/* Left Column */}
                <div className="space-y-4">
                  {/* Threshold */}
                  <div>
                    <label className="block text-[9px] font-mono text-zinc-400 uppercase tracking-wider mb-2">
                      Threshold
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min="-60"
                        max="0"
                        step="0.5"
                        value={settings.threshold}
                        onChange={(e) => updateSetting('threshold', parseFloat(e.target.value))}
                        className="flex-1 h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-purple-500"
                      />
                      <div className="text-xs font-mono text-purple-400 w-16 text-right">
                        {settings.threshold.toFixed(1)} dB
                      </div>
                    </div>
                  </div>
                  
                  {/* Ratio */}
                  <div>
                    <label className="block text-[9px] font-mono text-zinc-400 uppercase tracking-wider mb-2">
                      Ratio
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min="1"
                        max="20"
                        step="0.5"
                        value={settings.ratio}
                        onChange={(e) => updateSetting('ratio', parseFloat(e.target.value))}
                        className="flex-1 h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-purple-500"
                      />
                      <div className="text-xs font-mono text-purple-400 w-16 text-right">
                        {settings.ratio.toFixed(1)}:1
                      </div>
                    </div>
                  </div>
                  
                  {/* Knee */}
                  <div>
                    <label className="block text-[9px] font-mono text-zinc-400 uppercase tracking-wider mb-2">
                      Knee (Soft Knee Width)
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min="0"
                        max="12"
                        step="0.5"
                        value={settings.knee}
                        onChange={(e) => updateSetting('knee', parseFloat(e.target.value))}
                        className="flex-1 h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-purple-500"
                      />
                      <div className="text-xs font-mono text-purple-400 w-16 text-right">
                        {settings.knee.toFixed(1)} dB
                      </div>
                    </div>
                    <div className="text-[8px] font-mono text-zinc-600 mt-1">
                      {settings.knee === 0 ? 'Hard knee (instant compression)' : 'Soft knee (smooth transition)'}
                    </div>
                  </div>
                  
                  {/* Attack */}
                  <div>
                    <label className="block text-[9px] font-mono text-zinc-400 uppercase tracking-wider mb-2">
                      Attack Time
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min="0.1"
                        max="100"
                        step="0.1"
                        value={settings.attack}
                        onChange={(e) => updateSetting('attack', parseFloat(e.target.value))}
                        className="flex-1 h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-purple-500"
                      />
                      <div className="text-xs font-mono text-purple-400 w-16 text-right">
                        {settings.attack.toFixed(1)} ms
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Right Column */}
                <div className="space-y-4">
                  {/* Release */}
                  <div>
                    <label className="block text-[9px] font-mono text-zinc-400 uppercase tracking-wider mb-2">
                      Release Time
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min="10"
                        max="1000"
                        step="10"
                        value={settings.release}
                        onChange={(e) => updateSetting('release', parseFloat(e.target.value))}
                        className="flex-1 h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-purple-500"
                      />
                      <div className="text-xs font-mono text-purple-400 w-16 text-right">
                        {settings.release.toFixed(0)} ms
                      </div>
                    </div>
                  </div>
                  
                  {/* Makeup Gain */}
                  <div>
                    <label className="block text-[9px] font-mono text-zinc-400 uppercase tracking-wider mb-2">
                      Makeup Gain
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min="0"
                        max="24"
                        step="0.5"
                        value={settings.makeupGain}
                        onChange={(e) => updateSetting('makeupGain', parseFloat(e.target.value))}
                        className="flex-1 h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-purple-500"
                      />
                      <div className="text-xs font-mono text-purple-400 w-16 text-right">
                        +{settings.makeupGain.toFixed(1)} dB
                      </div>
                    </div>
                  </div>
                  
                  {/* Detection Mode */}
                  <div>
                    <label className="block text-[9px] font-mono text-zinc-400 uppercase tracking-wider mb-2">
                      Detection Mode
                    </label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => updateSetting('detectionMode', 'peak')}
                        className={`flex-1 px-3 py-2 rounded text-[9px] font-mono uppercase tracking-wider border-2 transition-colors ${
                          settings.detectionMode === 'peak'
                            ? 'bg-purple-500/20 border-purple-500 text-purple-400'
                            : 'bg-zinc-900 border-zinc-700 text-zinc-600 hover:border-zinc-600'
                        }`}
                      >
                        Peak
                      </button>
                      <button
                        onClick={() => updateSetting('detectionMode', 'rms')}
                        className={`flex-1 px-3 py-2 rounded text-[9px] font-mono uppercase tracking-wider border-2 transition-colors ${
                          settings.detectionMode === 'rms'
                            ? 'bg-purple-500/20 border-purple-500 text-purple-400'
                            : 'bg-zinc-900 border-zinc-700 text-zinc-600 hover:border-zinc-600'
                        }`}
                      >
                        RMS
                      </button>
                    </div>
                    <div className="text-[8px] font-mono text-zinc-600 mt-1">
                      {settings.detectionMode === 'peak' ? 'Transient-focused (punchy)' : 'Loudness-focused (smooth)'}
                    </div>
                  </div>
                  
                  {/* Sidechain HPF */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-[9px] font-mono text-zinc-400 uppercase tracking-wider">
                        Sidechain HPF
                      </label>
                      <button
                        onClick={() => updateSetting('sidechainHPF', !settings.sidechainHPF)}
                        className={`px-3 py-1 rounded text-[8px] font-mono uppercase tracking-wider border transition-colors ${
                          settings.sidechainHPF
                            ? 'bg-purple-500/20 border-purple-500 text-purple-400'
                            : 'bg-zinc-900 border-zinc-700 text-zinc-600'
                        }`}
                      >
                        {settings.sidechainHPF ? 'On' : 'Off'}
                      </button>
                    </div>
                    {settings.sidechainHPF && (
                      <div className="flex items-center gap-3">
                        <input
                          type="range"
                          min="20"
                          max="200"
                          step="5"
                          value={settings.hpfCutoff}
                          onChange={(e) => updateSetting('hpfCutoff', parseFloat(e.target.value))}
                          className="flex-1 h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-purple-500"
                        />
                        <div className="text-xs font-mono text-purple-400 w-16 text-right">
                          {settings.hpfCutoff} Hz
                        </div>
                      </div>
                    )}
                    <div className="text-[8px] font-mono text-zinc-600 mt-1">
                      Prevents kick/bass from triggering compression
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Technical Info */}
              <div className="mt-6 pt-4 border-t border-zinc-800">
                <div className="text-[9px] font-mono text-zinc-600 leading-relaxed">
                  <span className="text-purple-400 font-semibold">PRO TOPOLOGY:</span> Feed-forward design with 
                  polynomial soft-knee interpolation, 5ms circular look-ahead buffer, and sidechain filtering. 
                  Processes at sample rate in dedicated AudioWorklet thread for zero-glitch performance.
                </div>
              </div>
              
              {/* Knee Curve Visualizer */}
              <div className="mt-6 pt-6 border-t border-zinc-800">
                <KneeCurveVisualizer
                  threshold={settings.threshold}
                  ratio={settings.ratio}
                  knee={settings.knee}
                  isActive={isExpanded}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}